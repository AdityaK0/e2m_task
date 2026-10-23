from sqlalchemy import func, select

from app.modules.customers.models import Customer
from app.modules.interactions.models import Interaction
from app.modules.users.models import Role, User
from app.seed import _get_or_create_user, seed_demo


def test_bootstrap_user_creation_is_idempotent(db):
    first = _get_or_create_user(
        db,
        email="OWNER@Example.com",
        name="Owner",
        password="SecurePass123!",
        role=Role.ADMIN,
    )
    second = _get_or_create_user(
        db,
        email="owner@example.com",
        name="Owner",
        password="SecurePass123!",
        role=Role.ADMIN,
    )
    assert first.id == second.id
    assert first.role == Role.ADMIN
    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert first.password_hash != "SecurePass123!"


def test_demo_seed_is_idempotent(db):
    csm = _get_or_create_user(
        db,
        email="csm@example.com",
        name="Dana",
        password="SecurePass123!",
        role=Role.CSM,
    )
    viewer = _get_or_create_user(
        db,
        email="viewer@example.com",
        name="Sam",
        password="SecurePass123!",
        role=Role.VIEWER,
    )

    seed_demo(db, csm, viewer)
    assert db.scalar(select(func.count()).select_from(Customer)) == 4
    assert db.scalar(select(func.count()).select_from(Interaction)) == 4

    seed_demo(db, csm, viewer)
    assert db.scalar(select(func.count()).select_from(Customer)) == 4
    assert db.scalar(select(func.count()).select_from(Interaction)) == 4

    customers = db.scalars(select(Customer)).all()
    assert all(customer.assigned_manager_id == csm.id for customer in customers)
    assert {customer.status.value for customer in customers} == {
        "active",
        "at_risk",
        "onboarding",
        "prospect",
    }
