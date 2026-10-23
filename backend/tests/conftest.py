import os
from datetime import datetime, timezone

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-only-jwt-secret-key-0123456789abcdef"
os.environ["REDIS_URL"] = "redis://127.0.0.1:6399/15"
os.environ["ALLOW_REGISTRATION"] = "true"

from types import SimpleNamespace

import fakeredis
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, enable_sqlite_foreign_keys, get_db
from app.main import app
from app.modules.insights.api import get_insight_provider
from app.modules.insights.schema import ActionItem, GeneratedInsight, RiskItem
from app.modules.insights.models import Sentiment
from app.modules.users.models import Role, User
from app.utils import cache
from app.utils.rate_limit import login_rate_limiter
from app.utils.security import hash_password

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
enable_sqlite_foreign_keys(engine)
TestingSessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
)


class FakeInsightProvider:
    name = "fake"
    model = "fake-model"

    def __init__(self) -> None:
        self.error: Exception | None = None
        self.calls = 0
        self.result = GeneratedInsight(
            summary="The customer is happy and adoption is strong.",
            sentiment=Sentiment.POSITIVE,
            action_items=[
                ActionItem(description="Send pricing proposal", owner="Dana", due_date=None)
            ],
            risks=[RiskItem(description="Budget delayed", severity="medium")],
        )

    def generate(self, **kwargs) -> GeneratedInsight:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.result


@pytest.fixture(autouse=True)
def _fresh_state():
    Base.metadata.create_all(bind=engine)
    login_rate_limiter._failures.clear()
    fake_redis = fakeredis.FakeRedis(decode_responses=True)
    cache.set_client(fake_redis)
    yield
    fake_redis.flushall()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def fake_redis():
    return cache.get_client()


@pytest.fixture
def fake_provider() -> FakeInsightProvider:
    return FakeInsightProvider()


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(fake_provider):
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_insight_provider] = lambda: fake_provider
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db):
    def _make(
        email: str,
        role: Role = Role.VIEWER,
        password: str = "Password123!",
        name: str | None = None,
        is_active: bool = True,
    ) -> SimpleNamespace:
        user = User(
            name=name or email.split("@")[0].title(),
            email=email.lower(),
            password_hash=hash_password(password),
            role=role,
            is_active=is_active,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return SimpleNamespace(
            id=user.id,
            email=user.email,
            password=password,
            role=user.role,
            name=user.name,
        )

    return _make


def login(client: TestClient, email: str, password: str = "Password123!"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    data = response.json()
    return data["access_token"], response


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def csrf_headers(client: TestClient) -> dict[str, str]:
    token = client.cookies.get("csrf_token")
    assert token
    return {"X-CSRF-Token": token}


def customer_payload(**overrides) -> dict:
    payload = {
        "name": "Acme Corp",
        "company": "Acme Corporation",
        "contact_name": "Jane Doe",
        "contact_email": "jane@acme.example",
        "industry": "Software",
        "status": "active",
        "health_score": 80,
    }
    payload.update(overrides)
    return payload


def interaction_payload(customer_id: int, **overrides) -> dict:
    payload = {
        "customer_id": customer_id,
        "title": "Quarterly review",
        "type": "meeting",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "notes": (
            "Adoption is strong. Jane asked for a proposal for 50 more seats by Friday. "
            "Risk: procurement approval may slip."
        ),
        "participants": ["Jane Doe", "Dana Okafor"],
    }
    payload.update(overrides)
    return payload
