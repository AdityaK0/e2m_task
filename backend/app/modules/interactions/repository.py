from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.modules.customers.access import apply_customer_access_filter
from app.modules.customers.models import Customer
from app.modules.interactions.models import Interaction, InteractionType
from app.modules.users.models import User
from app.utils.models import utc_now

SORT_COLUMNS = {
    "occurred_at": Interaction.occurred_at,
    "-occurred_at": Interaction.occurred_at.desc(),
    "created_at": Interaction.created_at,
    "-created_at": Interaction.created_at.desc(),
    "title": Interaction.title,
    "-title": Interaction.title.desc(),
}


class InteractionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, interaction: Interaction) -> Interaction:
        self.db.add(interaction)
        self.db.commit()
        self.db.refresh(interaction)
        return interaction

    def save(self, interaction: Interaction) -> Interaction:
        self.db.commit()
        self.db.refresh(interaction)
        return interaction

    def get_by_id(self, interaction_id: int, user: User) -> Interaction | None:
        query = (
            select(Interaction)
            .options(joinedload(Interaction.customer), joinedload(Interaction.owner))
            .where(Interaction.id == interaction_id, Interaction.deleted_at.is_(None))
        )
        query = query.join(Customer, Customer.id == Interaction.customer_id).where(
            Customer.deleted_at.is_(None)
        )
        return self.db.scalar(apply_customer_access_filter(query, user))

    def list(
        self,
        *,
        customer_id: int | None,
        interaction_type: InteractionType | None,
        date_from: datetime | None,
        date_to: datetime | None,
        search: str | None,
        sort: str,
        offset: int,
        limit: int,
        user: User,
    ) -> tuple[list[Interaction], int]:
        filters = [Interaction.deleted_at.is_(None)]
        if customer_id is not None:
            filters.append(Interaction.customer_id == customer_id)
        if interaction_type is not None:
            filters.append(Interaction.type == interaction_type)
        if date_from is not None:
            filters.append(Interaction.occurred_at >= date_from)
        if date_to is not None:
            filters.append(Interaction.occurred_at <= date_to)
        if search:
            like = f"%{search.strip()}%"
            filters.append(or_(Interaction.title.ilike(like), Interaction.notes.ilike(like)))

        base = (
            select(Interaction)
            .options(joinedload(Interaction.customer), joinedload(Interaction.owner))
            .where(*filters)
            .join(Customer, Customer.id == Interaction.customer_id)
            .where(Customer.deleted_at.is_(None))
        )
        count_q = (
            select(func.count())
            .select_from(Interaction)
            .join(Customer, Customer.id == Interaction.customer_id)
            .where(*filters, Customer.deleted_at.is_(None))
        )
        base = apply_customer_access_filter(base, user)
        count_q = apply_customer_access_filter(count_q, user)
        total = int(self.db.scalar(count_q) or 0)

        order = SORT_COLUMNS.get(sort, SORT_COLUMNS["-occurred_at"])
        items = list(
            self.db.scalars(base.order_by(order).offset(offset).limit(limit)).all()
        )
        return items, total

    def soft_delete(self, interaction: Interaction) -> None:
        interaction.deleted_at = utc_now()
        self.db.commit()
