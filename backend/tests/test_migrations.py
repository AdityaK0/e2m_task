import io
from contextlib import redirect_stdout
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_alembic_has_exactly_one_head():
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    script = ScriptDirectory.from_config(config)
    assert len(script.get_heads()) == 1
    revisions = list(script.walk_revisions())
    assert len(revisions) == 1
    assert revisions[0].revision == "e86d5e791228"


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
        "refresh_sessions",
    ):
        assert f"CREATE TABLE {table}" in sql
    assert "uq_meeting_insights_interaction_id" in sql
    assert "ck_customers_health_score_range" in sql
