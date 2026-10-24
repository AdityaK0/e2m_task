import pytest
from click.testing import CliRunner
from sqlalchemy import func, select

from app import cli as cli_module
from app.modules.customers.models import Customer, CustomerManager
from app.modules.interactions.models import Interaction
from app.modules.users.models import Role, User
from app.seed import (
    _get_or_create_user,
    bootstrap_admin,
    create_admin,
    create_demo_seed,
    seed_demo,
)
from sqlalchemy.exc import IntegrityError
from app.utils.exceptions import AppException
from app.utils.security import verify_password


def test_createadmin_cli_prompts_and_creates_admin(db, monkeypatch):
    monkeypatch.setattr(cli_module, "SessionLocal", lambda: db)

    result = CliRunner().invoke(
        cli_module.cli,
        ["createadmin"],
        input="cli.admin@example.com\nCliAdminPass123!\nCliAdminPass123!\n",
    )

    assert result.exit_code == 0, result.output
    assert "Created admin account: cli.admin@example.com" in result.output
    assert "CliAdminPass123!" not in result.output
    admin = db.scalar(select(User).where(User.email == "cli.admin@example.com"))
    assert admin is not None
    assert admin.role == Role.ADMIN
    assert admin.must_change_password is False
    assert verify_password("CliAdminPass123!", admin.password_hash)


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


def test_create_admin_creates_new_account_with_requested_password(db):
    admin = create_admin(
        db,
        email="REAL.ADMIN@example.com",
        name="Real Administrator",
        password="RealAdminPass123!",
    )

    assert admin.email == "real.admin@example.com"
    assert admin.name == "Real Administrator"
    assert admin.role == Role.ADMIN
    assert admin.is_active is True
    assert admin.auto_assign_new_customers is False
    assert admin.must_change_password is False
    assert verify_password("RealAdminPass123!", admin.password_hash)


def test_bootstrap_admin_is_created_from_environment_only_when_no_admin_exists(
    db, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "owner@example.com")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "BootstrapPass123!")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_NAME", "Workspace Owner")
    admin = bootstrap_admin(db)
    assert admin is not None
    assert admin.email == "owner@example.com"
    assert admin.must_change_password is True
    assert bootstrap_admin(db).id == admin.id


def test_bootstrap_admin_handles_concurrent_worker_creation(db, monkeypatch):
    from app import seed as seed_module
    from app.config import settings

    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "owner@example.com")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "BootstrapPass123!")
    create_user = seed_module._get_or_create_user

    def create_from_another_worker(*args, **kwargs):
        create_user(*args, **kwargs)
        raise IntegrityError("INSERT", {}, Exception("duplicate key"))

    monkeypatch.setattr(seed_module, "_get_or_create_user", create_from_another_worker)

    admin = bootstrap_admin(db)

    assert admin is not None
    assert admin.email == "owner@example.com"
    assert admin.role == Role.ADMIN


def test_bootstrap_admin_does_not_promote_existing_manager(db, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "existing@example.com")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "BootstrapPass123!")
    manager = _get_or_create_user(
        db,
        email="existing@example.com",
        name="Existing Manager",
        password="ExistingPass123!",
        role=Role.MANAGER,
    )

    with pytest.raises(AppException, match="already used"):
        bootstrap_admin(db)
    db.refresh(manager)
    assert manager.role == Role.MANAGER


def test_create_admin_rejects_existing_account_without_promoting_it(db):
    manager = _get_or_create_user(
        db,
        email="existing@example.com",
        name="Existing Manager",
        password="ExistingPass123!",
        role=Role.MANAGER,
    )

    with pytest.raises(AppException, match="already exists"):
        create_admin(
            db,
            email="EXISTING@example.com",
            name="Administrator",
            password="NewAdminPass123!",
        )

    db.refresh(manager)
    assert manager.role == Role.MANAGER
    assert verify_password("ExistingPass123!", manager.password_hash)


def test_demo_seed_is_idempotent(db):
    csm = _get_or_create_user(
        db,
        email="csm@example.com",
        name="Dana",
        password="SecurePass123!",
        role=Role.MANAGER,
    )
    viewer = _get_or_create_user(
        db,
        email="viewer@example.com",
        name="Sam",
        password="SecurePass123!",
        role=Role.MANAGER,
    )

    seed_demo(db, csm, viewer)
    assert db.scalar(select(func.count()).select_from(Customer)) == 4
    assert db.scalar(select(func.count()).select_from(Interaction)) == 4

    seed_demo(db, csm, viewer)
    assert db.scalar(select(func.count()).select_from(Customer)) == 4
    assert db.scalar(select(func.count()).select_from(Interaction)) == 4

    customers = db.scalars(select(Customer)).all()
    assert all(
        db.scalar(
            select(CustomerManager.id).where(
                CustomerManager.customer_id == customer.id,
                CustomerManager.manager_id == csm.id,
            )
        )
        for customer in customers
    )
    assert {customer.status.value for customer in customers} == {
        "active",
        "at_risk",
        "onboarding",
        "prospect",
    }


def test_create_demo_seed_is_idempotent(db):
    create_demo_seed(db)
    create_demo_seed(db)

    assert db.scalar(select(func.count()).select_from(Customer)) == 4
    assert db.scalar(select(func.count()).select_from(Interaction)) == 4
