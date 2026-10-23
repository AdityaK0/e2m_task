from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.modules.auth.models import RefreshSession
from app.utils.models import utc_now


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, session: RefreshSession) -> RefreshSession:
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get_by_hash(self, token_hash: str) -> RefreshSession | None:
        return self.db.scalar(select(RefreshSession).where(RefreshSession.token_hash == token_hash))

    def revoke_family(self, family_id: str) -> None:
        self.db.execute(
            update(RefreshSession)
            .where(RefreshSession.family_id == family_id, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=utc_now())
        )
        self.db.commit()

    def revoke_all_for_user(self, user_id: int, except_token_hash: str | None = None) -> int:
        q = update(RefreshSession).where(
            RefreshSession.user_id == user_id,
            RefreshSession.revoked_at.is_(None),
        )
        if except_token_hash:
            q = q.where(RefreshSession.token_hash != except_token_hash)
        result = self.db.execute(q.values(revoked_at=utc_now()))
        self.db.commit()
        return int(result.rowcount or 0)

    def delete_expired(self) -> None:
        from datetime import timedelta

        cutoff = utc_now() - timedelta(days=30)
        self.db.query(RefreshSession).filter(
            RefreshSession.expires_at < cutoff
        ).delete(synchronize_session=False)
        self.db.commit()
