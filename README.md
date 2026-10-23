# Northstar Customer Success Platform

A production-minded customer success workspace for B2B teams: manage accounts, log interactions, monitor account health, and turn meeting notes into structured AI insights.

Built for the 48-hour technical assessment with a FastAPI/PostgreSQL/Redis backend and a Next.js 16 frontend.

## What is included

- JWT authentication with short-lived access tokens and rotating refresh sessions.
- Role-based access control: `admin`, `csm`, `viewer`.
- Customer CRUD with assignment, status, health score, notes, search, filters, and pagination.
- Interaction CRUD with participants, notes versioning, search, filters, and date ranges.
- AI meeting insights: summary, sentiment, action items, risks, provider/model metadata.
- Insight staleness detection when meeting notes change.
- Dashboard aggregates and customer health views.
- Admin team management: create users, change roles/status, revoke sessions.
- Responsive UI with accessible forms, loading/empty/error states, and confirmations.
- Seeded demo workspace for a fast first run.
- Docker Compose stack with PostgreSQL, Redis, API, seed job, and frontend.
- 55 backend tests (pytest) and a passing frontend production build.

## Quick start (Docker Compose)

Requirements: Docker Desktop with Compose v2.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open:

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

The one-shot `seed` service applies demo data after migrations complete. It exits successfully when finished:

```powershell
docker compose ps -a
```

Seeded accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@example.com` | `AdminPass123!` |
| CSM | `csm@example.com` | `DemoPass123!` |
| Viewer | `viewer@example.com` | `DemoPass123!` |

To try live AI insights, add an `AI_API_KEY` to `.env` and recreate the backend:

```powershell
docker compose up -d backend
```

Without a key, the app remains fully usable and shows a deliberate “AI not configured” state.

Reset all data:

```powershell
docker compose down -v
```

## Local development

### 1. Infrastructure

```powershell
docker compose up -d db redis
```

The Compose defaults expose PostgreSQL on `127.0.0.1:5432` and Redis on `127.0.0.1:6379`. Override with `POSTGRES_PORT` / `REDIS_PORT` in `.env` if needed.

### 2. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Update `backend/.env` for host-run services:

```dotenv
DATABASE_URL=postgresql+psycopg2://csm:csm_local_password@localhost:5432/csm
REDIS_URL=redis://localhost:6379/0
```

Then:

```powershell
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m app.seed
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

`backend/.env.example` includes bootstrap-admin and demo-data switches. Seeding never fabricates insights; generate them through the real provider.

### 3. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Useful checks:

```powershell
.\node_modules\.bin\tsc --noEmit
npm run build
```

## Tests

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest -q
```

The suite uses pytest, FastAPI `TestClient`, SQLite, fakeredis, and a fake AI provider. It covers authentication/session rotation, CSRF, RBAC, validation, customer/interaction CRUD, insight generation and staleness, dashboard counts, caching behavior, and security boundaries.

Live OpenAI calls are intentionally not part of the test suite.

## Architecture

```text
e2m_task/
├─ backend/
│  ├─ app/
│  │  ├─ modules/
│  │  │  ├─ auth/           # login, refresh rotation, profile, password
│  │  │  ├─ users/          # admin user management
│  │  │  ├─ customers/      # customer CRUD
│  │  │  ├─ interactions/   # interaction CRUD + notes versioning
│  │  │  ├─ insights/       # AI provider, generation, staleness
│  │  │  └─ dashboard/      # aggregate metrics
│  │  ├─ utils/             # security, pagination, exceptions, cache
│  │  ├─ database.py
│  │  ├─ config.py
│  │  ├─ dependencies.py
│  │  └─ main.py
│  ├─ alembic/              # authoritative schema migrations
│  ├─ tests/
│  ├─ Dockerfile
│  └─ entrypoint.sh
├─ frontend/
│  ├─ src/app/              # App Router pages and layouts
│  ├─ src/components/       # UI, shell, feature components
│  ├─ src/features/auth/    # Redux auth state
│  ├─ src/lib/api/          # typed API client and modules
│  ├─ src/lib/              # permissions, labels, formatting
│  └─ Dockerfile
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

Backend modules follow a consistent `api.py` / `service.py` / `repository.py` / `models.py` / `schema.py` split. Business rules live in services; HTTP concerns stay in routers.

Frontend uses the Next.js App Router, React 19, Redux Toolkit for auth only, and local component state for page data. Access tokens are kept in memory; refresh tokens live in HttpOnly cookies.

## API overview

Base path: `/api/v1`

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all` |
| Profile | `GET /auth/me`, `PATCH /auth/me`, `POST /auth/change-password` |
| Config | `GET /auth/config`, `GET /auth/roles` |
| Users | `GET /users`, `POST /users`, `GET /users/{id}`, `PATCH /users/{id}`, `GET /users/options`, `POST /users/{id}/revoke-sessions` |
| Customers | `GET /customers`, `POST /customers`, `GET /customers/{id}`, `PATCH /customers/{id}`, `DELETE /customers/{id}` |
| Interactions | `GET /interactions`, `POST /interactions`, `GET /interactions/{id}`, `PATCH /interactions/{id}`, `DELETE /interactions/{id}` |
| Insights | `GET /interactions/{id}/insights`, `POST /interactions/{id}/insights`, `GET /insights/config` |
| Dashboard | `GET /dashboard/summary` |

Errors use a consistent JSON envelope with a machine-readable `error_code` where useful.

## Authentication and security

- Access tokens expire after 15 minutes and are sent as `Authorization: Bearer …`.
- Refresh tokens are rotated on every refresh; reuse of a revoked token revokes the session family.
- Refresh and logout flows use a CSRF double-submit cookie: the browser sends the `csrf_token` cookie value in `X-CSRF-Token`.
- Passwords are bcrypt-hashed. Password changes and admin deactivation revoke sessions.
- Login attempts are rate-limited through Redis.
- CORS is restricted to configured origins and credentials are allowed only for them.
- Production mode rejects wildcard CORS and insecure cookie settings.
- Customer deletion is admin-only soft deletion; interaction deletion is CSM/admin soft deletion.
- AI meeting notes are delimited and treated as untrusted data. Provider output is schema-validated before persistence.

### RBAC summary

| Capability | Admin | CSM | Viewer |
|---|---|---|---|
| Read workspace/dashboard | Yes | Yes | Yes |
| Create/edit customers | Yes | Yes | No |
| Delete customers | Yes | No | No |
| Create/edit/delete interactions | Yes | Yes | No |
| Generate AI insights | Yes | Yes | No |
| Manage users/roles | Yes | No | No |

## AI insight behavior

1. A user generates an insight for an interaction with notes.
2. The provider receives a constrained JSON-only prompt and the notes as untrusted data.
3. The response is validated against a strict schema (summary, sentiment, action items, risks).
4. Results persist with provider, model, generation count, and notes version.
5. Editing notes increments `notes_version`; older insights are shown as stale.
6. A provider lock prevents concurrent generation for the same interaction.
7. Missing provider configuration returns `503 AI_NOT_CONFIGURED`; provider failures return `502 AI_GENERATION_FAILED`.

The UI presents all of these states explicitly. Demo data deliberately starts without insights.

## Configuration

Key backend variables are documented in `backend/.env.example`. Important ones:

- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`
- `CORS_ORIGINS`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`
- `ALLOW_REGISTRATION`
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `SEED_DEMO_DATA`
- `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`

Frontend configuration:

- `NEXT_PUBLIC_API_BASE_URL` (build-time, defaults to `http://localhost:8000/api/v1`)

## Design decisions and tradeoffs

- **Sync SQLAlchemy** for a smaller, easier-to-debug codebase at this scale; AI calls are the only meaningful blocking I/O and are guarded by a Redis lock.
- **Database as the source of truth** for auth sessions and insights; Redis is used for caching/rate limits, never as the only copy of critical state.
- **Refresh rotation with reuse detection** rather than long-lived bearer tokens.
- **No fabricated AI data**: demo records are real seeded entities, while insights are generated only by a real provider.
- **Server-side derived dashboard metrics** instead of duplicating aggregation logic in the client.
- **Local UI state for data** rather than a second global store; Redux is reserved for cross-cutting auth state.
- **Explicit insight states** (`pending`, `running`, `completed`, `failed`, `stale`) so the UI can be honest about uncertainty.
- **Docker Compose for evaluation convenience**, with loopback-only database/Redis ports and no secrets committed.

## Known limitations / next steps

- Live AI output quality depends on the configured provider and model; no key is included.
- The demo seed does not pre-generate insights by design.
- A production deployment should put the API and frontend behind TLS, use a secrets manager, set `COOKIE_SECURE=true`, and use tightly scoped CORS origins.
- The frontend is not a full offline-capable client; network failures surface as recoverable error states.
- Email delivery, password reset by email, audit-log export, and background job workers are out of scope for this assessment.

## Troubleshooting

- **CORS error**: make sure `CORS_ORIGINS` (and `NEXT_PUBLIC_API_BASE_URL`) match the browser origin/port.
- **Refresh fails after restart**: cookies may need `COOKIE_SECURE=false` for local HTTP.
- **Seed skipped**: seed is idempotent; it skips when customers already exist.
- **AI not configured**: expected without `AI_API_KEY`; the app shows the configured state rather than failing silently.
- **Port conflicts**: change `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, or `REDIS_PORT` in `.env` and rebuild the frontend if the API URL changes.
