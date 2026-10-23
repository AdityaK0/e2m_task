# E2M Client Insights

A production-minded customer success workspace for B2B teams: manage accounts, log interactions, monitor account health, and turn meeting notes into structured AI insights.

Built for the 48-hour technical assessment with a FastAPI/PostgreSQL/Redis backend and a Next.js 16 frontend.

## What is included

- JWT authentication with short-lived access tokens and rotating refresh sessions.
- Role-based access control: `admin` and `manager`.
- Customer CRUD with many-to-many manager assignment, status, health score, notes, search, filters, and pagination.
- Interaction CRUD with participants, notes versioning, search, filters, and date ranges.
- AI meeting insights: summary, sentiment, action items, risks, provider/model metadata.
- Insight staleness detection when meeting notes change.
- Dashboard aggregates and customer health views.
- Admin team management: create users, change roles/status, revoke sessions.
- Responsive UI with accessible forms, loading/empty/error states, and confirmations.
- Seeded demo workspace for a fast first run.
- Docker Compose stack with PostgreSQL, Redis, API, seed job, and frontend.
- Backend pytest coverage for auth, RBAC, assignments, customer/interaction access, caching, migrations, and AI insights.

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
| Manager | `csm@example.com` | `DemoPass123!` |
| Manager | `viewer@example.com` | `DemoPass123!` |

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

`backend/.env.example` includes bootstrap-admin and demo-data switches. The API entrypoint applies Alembic migrations before the API/seed services start. Seeding never fabricates insights; generate them through the real provider.

After installing backend dependencies and the local CLI (`pip install -r requirements.txt` and `pip install -e .`), use these commands from the backend environment:

```powershell
e2m createadmin
e2m create-seed
```

`createadmin` interactively prompts for an email and password (with hidden, confirmed password input). It creates a new admin and refuses to promote or overwrite an existing account. `create-seed` runs the demo seed data defined in `backend/app/seed.py`; it is safe to repeat and skips customer seeding when customers already exist. Apply migrations first with `python -m alembic upgrade head`.

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

Frontend uses the Next.js App Router, React 19, Redux Toolkit for auth and customer mutations, and local component state for page-specific data. Access tokens are kept in memory; refresh tokens live in HttpOnly cookies.

## API overview

Base path: `/api/v1`

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all` |
| Profile | `GET /auth/me`, `PATCH /auth/me`, `POST /auth/change-password` |
| Config | `GET /auth/config`, `GET /auth/roles` |
| Users (admin) | `GET /users`, `POST /users`, `GET /users/{id}`, `PATCH /users/{id}`, `PATCH /users/{id}/role`, `GET /users/options`, `POST /users/{id}/revoke-sessions` |
| Customers | `GET /customers`, `POST /customers`, `GET /customers/{id}`, `PATCH /customers/{id}`, `DELETE /customers/{id}` |
| Customer assignments (admin) | `GET /customers/{id}/managers`, `POST /customers/{id}/managers`, `DELETE /customers/{id}/managers/{manager_id}`, `POST /customers/assignments`, `DELETE /customers/assignments` |
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
- Customer deletion is admin-only soft deletion; interaction deletion is admin-only soft deletion.
- AI meeting notes are delimited and treated as untrusted data. Provider output is schema-validated before persistence.

### RBAC summary

Customers are client records, never login identities. The only user roles are `admin` and `manager`; public registration cannot select a role and creates managers. Bootstrap an administrator using `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`.

| Capability | Admin | Manager |
|---|---|---|
| Read dashboard and all customers | Yes | No |
| Read/update assigned customers | Yes | Yes |
| Create customers | Yes | Yes (automatically assigned to creator) |
| Delete customers | Yes | No |
| Read/create/update interactions on accessible customers | Yes | Yes |
| Delete interactions | Yes | No |
| Manage users/roles and customer assignments | Yes | No |
| Enable auto-assignment for future customers | Yes | No |

Customer visibility is enforced by a shared backend query access filter, including interaction, insight, and dashboard queries. An inaccessible or soft-deleted customer (and its interactions) returns 404. Admins see all non-deleted customers; managers see only customers linked to them.

### Customer assignment and auto-assignment

The `customer_managers` table models the many-to-many customer/manager relationship. It stores `customer_id`, `manager_id`, nullable `assigned_by`, and `created_at`; `(customer_id, manager_id)` is unique, both foreign keys are indexed, and deleting either related row cascades the assignment. Customers use `deleted_at` for soft deletion; normal reads exclude deleted customers.

Admins can assign managers through the per-customer endpoints or bulk endpoints. Bulk requests accept exactly one of `customer_ids` or `all: true`; `all` selects all non-deleted customers. Repeated assignments are idempotent and responses report assigned/skipped counts. Bulk unassignment uses the same request shape. Explicit `customer_ids` must all identify existing, non-deleted customers. Assignment targets must be active users with the manager role.

Managers creating a customer are assigned to it automatically. On every customer creation, opted-in active managers (`auto_assign_new_customers=true`) are also assigned synchronously in the same database transaction as the customer insert. Conflict-safe assignment creation deduplicates creator/opt-in overlap. Doing this in-transaction means assignments are visible immediately and avoids stale visibility or introducing a background-job system. Changing the opt-in flag applies to future customers only; it does not backfill existing customers.

Only admins can change roles or the auto-assignment flag. Promoting a manager to admin clears their assignments and resets auto-assignment to false. Demoting an admin to manager does not grant assignments. The last active admin cannot be demoted or deactivated. Setting `auto_assign_new_customers=true` for an admin is rejected.

### Dashboard cache

Dashboard summaries have a five-minute TTL and are isolated under `dashboard:admin` and `dashboard:manager:{user_id}`. A centralized invalidation helper deletes the admin key and affected manager keys after the database transaction commits. Customer mutations invalidate the customer-list version and affected dashboards; interaction/insight mutations invalidate dashboards for managers assigned to that customer; assignment changes invalidate the manager and admin; role and auto-assignment changes invalidate the affected user's dashboard. Cache invalidation is never performed before a successful commit.

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
