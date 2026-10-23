"""Explicit bootstrap / demo-data command.

Usage (inside backend container or venv):
    python -m app.seed

Requires migrations to have been applied. Creates the initial administrator
from BOOTSTRAP_ADMIN_* only when those variables are set. Demo customers and
interactions are created only when SEED_DEMO_DATA=true. Demo insights are
never fabricated; generate them through the real AI provider.
"""

import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.modules.auth import models as auth_models  # noqa: F401
from app.modules.customers.models import Customer, CustomerStatus
from app.modules.insights import models as insight_models  # noqa: F401
from app.modules.interactions.models import Interaction, InteractionType
from app.modules.users.models import Role, User
from app.utils.exceptions import AppException
from app.utils.security import hash_password, normalize_email, validate_password

DEMO_PASSWORD = "DemoPass123!"


def _get_or_create_user(db, *, email: str, name: str, password: str, role: Role) -> User:
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
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"Created {role.value} user: {email}")
    return user


def bootstrap_admin(db) -> User | None:
    if not settings.bootstrap_admin_configured:
        print(
            "BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set; "
            "skipping administrator bootstrap."
        )
        return None
    try:
        return _get_or_create_user(
            db,
            email=settings.BOOTSTRAP_ADMIN_EMAIL,
            name=settings.BOOTSTRAP_ADMIN_NAME,
            password=settings.BOOTSTRAP_ADMIN_PASSWORD,
            role=Role.ADMIN,
        )
    except AppException as exc:
        print(f"Admin bootstrap failed: {exc.message}")
        sys.exit(1)


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
            health_score=84,
            assigned_manager_id=csm.id,
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
            health_score=38,
            assigned_manager_id=csm.id,
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
            health_score=66,
            assigned_manager_id=csm.id,
            notes="Security review pending before production rollout.",
        ),
        Customer(
            name="Orbit Commerce",
            company="Orbit Commerce Ltd.",
            contact_name="Sofia Alvarez",
            contact_email="sofia.alvarez@orbitcommerce.example",
            industry="Retail",
            status=CustomerStatus.PROSPECT,
            health_score=None,
            assigned_manager_id=csm.id,
            notes="Inbound from webinar; discovery call not yet booked.",
        ),
    ]
    db.add_all(customers)
    db.commit()
    for customer in customers:
        db.refresh(customer)

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
            participants=["Elena Fischer", "Dana Okafor"],
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
            participants=["Marcus Lee", "Dana Okafor", "Alex Chen"],
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
            participants=["Priya Raman", "Dana Okafor"],
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
            participants=["Elena Fischer", "Dana Okafor"],
            owner_id=csm.id,
        ),
    ]
    db.add_all(interactions)
    db.commit()
    print(f"Seeded {len(customers)} demo customers and {len(interactions)} interactions.")


def main() -> None:
    db = SessionLocal()
    try:
        admin = bootstrap_admin(db)
        if settings.SEED_DEMO_DATA:
            csm = _get_or_create_user(
                db,
                email="csm@example.com",
                name="Dana Okafor",
                password=DEMO_PASSWORD,
                role=Role.CSM,
            )
            viewer = _get_or_create_user(
                db,
                email="viewer@example.com",
                name="Sam Rivera",
                password=DEMO_PASSWORD,
                role=Role.VIEWER,
            )
            seed_demo(db, csm, viewer)
            print(f"Demo users use password: {DEMO_PASSWORD} (local demo only)")
        if admin is None and not settings.SEED_DEMO_DATA:
            print(
                "Nothing to do. Set BOOTSTRAP_ADMIN_EMAIL and "
                "BOOTSTRAP_ADMIN_PASSWORD, or SEED_DEMO_DATA=true."
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
