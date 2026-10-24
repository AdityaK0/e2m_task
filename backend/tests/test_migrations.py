import io
from contextlib import redirect_stdout
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from app.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_alembic_has_one_linear_migration_head():
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    script = ScriptDirectory.from_config(config)
    assert script.get_heads() == ["e86d5e791228"]
    revisions = list(script.walk_revisions())
    assert len(revisions) == 1
    assert revisions[0].revision == "e86d5e791228"
    assert revisions[0].down_revision is None


def test_offline_upgrade_renders_all_tables(monkeypatch):
    monkeypatch.chdir(BACKEND_DIR)
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    output = io.StringIO()
    with redirect_stdout(output):
        command.upgrade(config, "head", sql=True)
    sql = output.getvalue()
    for table in (
        "users",
        "customers",
        "interactions",
        "meeting_insights",
        "customer_managers",
        "preferences",
    ):
        assert f"CREATE TABLE {table}" in sql
    assert "uq_meeting_insights_interaction_id" in sql
    assert "ck_customers_health_score_range" in sql
    assert "auto_assign_new_customers" in sql
    assert "must_change_password" in sql
    assert "health_sample_size" in sql
    assert "external_attendees" in sql
    assert "CREATE TABLE preferences" in sql
    assert "refresh_sessions" not in sql


def test_upgrade_creates_current_schema_from_scratch(tmp_path, monkeypatch):
    database_path = tmp_path / "fresh.sqlite"
    old_url = settings.DATABASE_URL
    settings.DATABASE_URL = f"sqlite:///{database_path.as_posix()}"
    monkeypatch.chdir(BACKEND_DIR)
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    engine = None
    try:
        command.upgrade(config, "head")
        command.check(config)
        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as connection:
            inspector = inspect(connection)
            assert set(inspector.get_table_names()) == {
                "alembic_version",
                "customer_managers",
                "customers",
                "interactions",
                "meeting_insights",
                "users",
                "preferences",
            }
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            customer_columns = {
                column["name"] for column in inspector.get_columns("customers")
            }
            assignment_columns = {
                column["name"]
                for column in inspector.get_columns("customer_managers")
            }
            interaction_columns = {
                column["name"] for column in inspector.get_columns("interactions")
            }
            preference_columns = {
                column["name"] for column in inspector.get_columns("preferences")
            }
        assert "auto_assign_new_customers" in user_columns
        assert "must_change_password" in user_columns
        assert "assigned_manager_id" not in customer_columns
        assert {"deleted_at", "name", "status"} <= customer_columns
        assert {"ai_provider", "ai_model"} <= interaction_columns
        assert {"health_score", "health_sample_size"} <= customer_columns
        assert {"participants", "external_attendees"} <= interaction_columns
        assert {"id", "key", "value", "updated_by", "updated_at"} == preference_columns
        assert {"customer_id", "manager_id", "assigned_by", "created_at"} <= assignment_columns

        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users "
                    "(name, email, password_hash, role, is_active, auto_assign_new_customers, "
                    "created_at, updated_at) "
                    "VALUES ('Admin', 'admin@example.com', 'hash', 'ADMIN', 1, 0, "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), "
                    "('Manager', 'manager@example.com', 'hash', 'MANAGER', 1, 1, "
                    "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO customers (name, status, created_at, updated_at) "
                    "VALUES ('Acme', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO customer_managers "
                    "(customer_id, manager_id, assigned_by, created_at, updated_at) "
                    "VALUES (1, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
            result = connection.execute(
                text("SELECT customer_id, manager_id, assigned_by FROM customer_managers")
            ).one()
        assert tuple(result) == (1, 2, 1)

        command.downgrade(config, "base")
        with engine.connect() as connection:
            inspector = inspect(connection)
            assert set(inspector.get_table_names()) == {"alembic_version"}
        command.upgrade(config, "head")
        command.check(config)
    finally:
        if engine is not None:
            engine.dispose()
        settings.DATABASE_URL = old_url
