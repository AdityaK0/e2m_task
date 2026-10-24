from collections import defaultdict

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.modules.customers.models import Customer
from app.modules.insights.models import InsightStatus, MeetingInsight, Sentiment
from app.modules.interactions.models import Interaction
from app.modules.preferences.models import Preference
from app.modules.preferences.registry import preference_default
from app.utils.models import utc_now

SENTIMENT_POINTS = {
    Sentiment.POSITIVE: 100,
    Sentiment.NEUTRAL: 60,
    Sentiment.NEGATIVE: 20,
}
PENALTY_PER_RISK = 5
RISK_PENALTY_CAP = 20
NEWEST_POSITION_WEIGHT_OFFSET = 0
WEIGHT_DECREMENT_PER_POSITION = 1


def get_health_score_window(db: Session) -> int:
    value = db.scalar(
        select(Preference.value).where(Preference.key == "health_score_window")
    )
    return value if type(value) is int else int(preference_default("health_score_window"))


def _score_rows(rows: list[tuple[Sentiment, list[dict] | None]], window: int) -> int | None:
    if not rows:
        return None
    weighted_total = sum(
        SENTIMENT_POINTS[sentiment] * _position_weight(window, position)
        for position, (sentiment, _risks) in enumerate(rows)
        if sentiment in SENTIMENT_POINTS
    )
    weights = sum(
        _position_weight(window, position)
        for position, (sentiment, _risks) in enumerate(rows)
        if sentiment in SENTIMENT_POINTS
    )
    if weights == 0:
        return None
    newest_risks = rows[0][1] or []
    penalty = min(PENALTY_PER_RISK * len(newest_risks), RISK_PENALTY_CAP)
    return max(0, min(100, round(weighted_total / weights - penalty)))


def _position_weight(window: int, position: int) -> int:
    return (
        window
        - NEWEST_POSITION_WEIGHT_OFFSET
        - position * WEIGHT_DECREMENT_PER_POSITION
    )


def compute_health_score(customer_id: int, db: Session) -> tuple[int | None, int]:
    window = get_health_score_window(db)
    rows = _fetch_score_rows(customer_id, db, window)
    return _score_rows(rows, window), len(rows)


def _fetch_score_rows(
    customer_id: int, db: Session, window: int
) -> list[tuple[Sentiment, list[dict] | None]]:
    rows = db.execute(
        select(MeetingInsight.sentiment, MeetingInsight.risks)
        .join(Interaction, Interaction.id == MeetingInsight.interaction_id)
        .where(
            Interaction.customer_id == customer_id,
            Interaction.deleted_at.is_(None),
            MeetingInsight.status == InsightStatus.COMPLETED,
            MeetingInsight.sentiment.is_not(None),
        )
        .order_by(Interaction.occurred_at.desc(), Interaction.id.desc())
        .limit(window)
    ).all()
    return [(sentiment, risks) for sentiment, risks in rows]


def refresh_customer_health_score(
    customer_id: int, db: Session, *, window: int | None = None
) -> None:
    customer = db.scalar(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.deleted_at.is_(None),
        )
    )
    if customer is None:
        return
    active_window = get_health_score_window(db) if window is None else window
    score_rows = _fetch_score_rows(customer_id, db, active_window)
    score, sample_size = _score_rows(score_rows, active_window), len(score_rows)
    customer.health_score = score
    customer.health_sample_size = sample_size
    customer.updated_at = utc_now()


def _customer_insight_rows():
    rank = func.row_number().over(
        partition_by=Interaction.customer_id,
        order_by=(Interaction.occurred_at.desc(), Interaction.id.desc()),
    ).label("position")
    return (
        select(
            Interaction.customer_id,
            MeetingInsight.sentiment,
            MeetingInsight.risks,
            rank,
        )
        .join(MeetingInsight, MeetingInsight.interaction_id == Interaction.id)
        .join(Customer, Customer.id == Interaction.customer_id)
        .where(
            Customer.deleted_at.is_(None),
            Interaction.deleted_at.is_(None),
            MeetingInsight.status == InsightStatus.COMPLETED,
            MeetingInsight.sentiment.is_not(None),
        )
        .subquery()
    )


def recompute_all_health_scores(db: Session, *, window: int | None = None) -> None:
    window = get_health_score_window(db) if window is None else window
    customer_ids = list(
        db.scalars(
            select(Customer.id).where(Customer.deleted_at.is_(None))
        ).all()
    )
    if not customer_ids:
        return

    ranked_rows = _customer_insight_rows().c
    rows = db.execute(
        select(
            ranked_rows.customer_id,
            ranked_rows.sentiment,
            ranked_rows.risks,
            ranked_rows.position,
        )
        .where(ranked_rows.position <= window)
        .order_by(ranked_rows.customer_id, ranked_rows.position)
    ).all()
    grouped: dict[int, list[tuple[Sentiment, list[dict] | None]]] = defaultdict(list)
    for customer_id, sentiment, risks, _position in rows:
        grouped[customer_id].append((sentiment, risks))

    timestamp = utc_now()
    db.execute(
        update(Customer),
        [
            {
                "id": customer_id,
                "health_score": _score_rows(grouped.get(customer_id, []), window),
                "health_sample_size": len(grouped.get(customer_id, [])),
                "updated_at": timestamp,
            }
            for customer_id in customer_ids
        ],
    )
