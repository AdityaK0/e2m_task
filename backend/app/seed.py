"""Admin bootstrap and demo-data helpers.

The demo-data helpers are used directly by tests and do not run automatically.
Admin bootstrap runs separately when the API starts. Schema must be migrated
before either operation.
"""

import logging
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.modules.customers.models import Customer, CustomerManager, CustomerStatus
from app.modules.insights import models as insight_models  # noqa: F401
from app.modules.interactions.models import Interaction, InteractionType
from app.modules.users.models import Role, User
from app.utils.exceptions import AppException
from app.utils.security import hash_password, normalize_email, validate_password

DEMO_PASSWORD = "DemoPass123!"
logger = logging.getLogger("e2m-insights.seed")


def _get_or_create_user(
    db,
    *,
    email: str,
    name: str,
    password: str,
    role: Role,
    must_change_password: bool = False,
) -> User:
    email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        changed = False
        if user.role != role:
            user.role = role
            changed = True
        if not user.is_active:
            user.is_active = True
            changed = True
        if changed:
            db.commit()
        print(f"User already exists: {email} ({user.role.value})")
        return user

    validate_password(password)
    user = User(
        name=name,
        email=email,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"Created {role.value} user: {email}")
    return user


def bootstrap_admin(db) -> User | None:
    existing_admin = db.scalar(select(User).where(User.role == Role.ADMIN).limit(1))
    if existing_admin is not None:
        return existing_admin
    if not settings.bootstrap_admin_configured:
        logger.warning(
            "No administrator exists and bootstrap admin credentials are not configured"
        )
        return None
    email = normalize_email(settings.BOOTSTRAP_ADMIN_EMAIL)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AppException(
            "Bootstrap admin email is already used by a non-admin account",
            status_code=409,
            error_code="EMAIL_ALREADY_REGISTERED",
        )
    try:
        return _get_or_create_user(
            db,
            email=email,
            name=settings.BOOTSTRAP_ADMIN_NAME,
            password=settings.BOOTSTRAP_ADMIN_PASSWORD,
            role=Role.ADMIN,
            must_change_password=True,
        )
    except IntegrityError:
        db.rollback()
        existing_admin = db.scalar(select(User).where(User.role == Role.ADMIN).limit(1))
        if existing_admin is not None:
            return existing_admin
        raise
    except AppException as exc:
        print(f"Admin bootstrap failed: {exc.message}")
        sys.exit(1)


def create_admin(db, *, email: str, password: str, name: str) -> User:
    """Create an administrator with the password supplied by its creator."""
    normalized_email = normalize_email(email)
    if db.scalar(select(User.id).where(User.email == normalized_email)) is not None:
        raise AppException(
            "An account with this email already exists",
            status_code=409,
            error_code="EMAIL_ALREADY_REGISTERED",
        )
    validate_password(password)
    try:
        return _get_or_create_user(
            db,
            email=normalized_email,
            name=name,
            password=password,
            role=Role.ADMIN,
            must_change_password=False,
        )
    except IntegrityError as exc:
        db.rollback()
        raise AppException(
            "An account with this email already exists",
            status_code=409,
            error_code="EMAIL_ALREADY_REGISTERED",
        ) from exc


def seed_demo(db, csm: User, viewer: User) -> None:
    existing = db.scalar(select(Customer).limit(1))
    if existing is not None:
        print("Customers already exist; skipping demo seed.")
        return

    now = datetime.now(timezone.utc)
    customers = [
        Customer(
            name="Northwind Analytics",
            company="Northwind Analytics GmbH",
            contact_name="Elena Fischer",
            contact_email="elena.fischer@northwind.example",
            contact_phone="+49 30 555 0101",
            industry="Data & Analytics",
            website="https://northwind.example",
            status=CustomerStatus.ACTIVE,
            notes="Expansion conversation in progress for the EU data warehouse add-on.",
        ),
        Customer(
            name="Acme Robotics",
            company="Acme Robotics Inc.",
            contact_name="Marcus Lee",
            contact_email="marcus.lee@acme-robotics.example",
            contact_phone="+1 415 555 0134",
            industry="Manufacturing",
            website="https://acme-robotics.example",
            status=CustomerStatus.AT_RISK,
            notes="Two critical tickets open; onboarding was delayed by SSO issues.",
        ),
        Customer(
            name="Lumen Health",
            company="Lumen Health Systems",
            contact_name="Priya Raman",
            contact_email="priya.raman@lumenhealth.example",
            contact_phone="+1 212 555 0188",
            industry="Healthcare",
            website="https://lumenhealth.example",
            status=CustomerStatus.ONBOARDING,
            notes="Security review pending before production rollout.",
        ),
        Customer(
            name="Orbit Commerce",
            company="Orbit Commerce Ltd.",
            contact_name="Sofia Alvarez",
            contact_email="sofia.alvarez@orbitcommerce.example",
            industry="Retail",
            status=CustomerStatus.PROSPECT,
            notes="Inbound from webinar; discovery call not yet booked.",
        ),
    ]
    db.add_all(customers)
    db.commit()
    for customer in customers:
        db.refresh(customer)
        db.add(CustomerManager(customer_id=customer.id, manager_id=csm.id))
    db.commit()

    northwind, acme, lumen = customers[0], customers[1], customers[2]
    interactions = [
        Interaction(
            customer_id=northwind.id,
            title="Quarterly business review",
            type=InteractionType.MEETING,
            occurred_at=now - timedelta(days=3),
            notes=(
                "Elena reported strong adoption after the EU rollout: 78% weekly active users. "
                "They want a pricing proposal for 250 additional seats by Friday and asked for "
                "a security questionnaire. Success criteria: 90% adoption in Q4. Risk: budget "
                "approval is delayed until the finance committee meets in three weeks."
            ),
            participants=[csm.id],
            external_attendees=["Elena Fischer"],
            owner_id=csm.id,
        ),
        Interaction(
            customer_id=acme.id,
            title="Escalation call: SSO outage",
            type=InteractionType.CALL,
            occurred_at=now - timedelta(days=1, hours=2),
            notes=(
                "Marcus escalated a production SSO outage affecting 40 engineers. Root cause "
                "appears to be an expired SAML certificate on their side, but they expect us to "
                "provide a recovery runbook. They are evaluating a competitor and need a written "
                "remediation plan plus an executive apology by tomorrow. Health score reduced."
            ),
            participants=[csm.id],
            external_attendees=["Marcus Lee", "Alex Chen"],
            owner_id=csm.id,
        ),
        Interaction(
            customer_id=lumen.id,
            title="Security review kickoff",
            type=InteractionType.MEETING,
            occurred_at=now - timedelta(days=5),
            notes=(
                "Priya walked through the security questionnaire. They need SOC 2 evidence, "
                "data residency confirmation, and a completed DPIA before go-live. Priya will "
                "send the DPIA template Monday. We committed to sharing the SOC 2 report this week."
            ),
            participants=[csm.id],
            external_attendees=["Priya Raman"],
            owner_id=csm.id,
        ),
        Interaction(
            customer_id=northwind.id,
            title="Follow-up email: seat expansion",
            type=InteractionType.EMAIL,
            occurred_at=now - timedelta(days=2),
            notes=(
                "Sent the requested pricing outline and the security questionnaire. Elena "
                "confirmed receipt and will route it to procurement. No decision expected before "
                "the finance committee meeting."
            ),
            participants=[csm.id],
            external_attendees=["Elena Fischer"],
            owner_id=csm.id,
        ),
    ]
    db.add_all(interactions)
    db.commit()
    print(f"Seeded {len(customers)} demo customers and {len(interactions)} interactions.")


def create_demo_seed(db) -> None:
    """Create the configured demo managers and seed the demo workspace."""
    csm = _get_or_create_user(
        db,
        email="csm@example.com",
        name="Dana Okafor",
        password=DEMO_PASSWORD,
        role=Role.MANAGER,
        must_change_password=False,
    )
    viewer = _get_or_create_user(
        db,
        email="viewer@example.com",
        name="Sam Rivera",
        password=DEMO_PASSWORD,
        role=Role.MANAGER,
        must_change_password=False,
    )
    seed_demo(db, csm, viewer)
