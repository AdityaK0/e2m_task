# E2M Insights

A production-minded customer success workspace for B2B teams: manage accounts, log interactions, monitor account health, and turn meeting notes into structured AI insights.

Built for the 48-hour technical assessment with a FastAPI/PostgreSQL/Redis backend and a Next.js 16 frontend.

## What is included

- JWT authentication with short-lived access tokens and fixed-lifetime refresh tokens.
- Role-based access control: `admin` and `manager`.
- Customer CRUD with manager assignment, status, calculated health scores, notes, search, filters, and pagination.
- Interaction CRUD with active-user participants, separate external attendees, notes versioning, search, filters, and date ranges.
- AI meeting insights: summary, sentiment, action items, risks, provider/model metadata.
- Insight staleness detection when meeting notes change.
- Dashboard aggregates and customer health views.
- Admin-managed team access: create admins or managers, control active status, and reset passwords.
- Responsive UI with accessible forms, loading/empty/error states, and confirmations.
- Docker Compose stack with PostgreSQL, Redis, API, and frontend.
- Backend pytest coverage for auth, RBAC, assignments, customer/interaction access, preferences, health scoring, migrations, and AI insights.

## Quick start (Docker Compose)

Requirements: Docker Desktop with Compose v2.

1. Make sure the provided `.env` file is in the project root, next to `docker-compose.yml`.
2. Start the stack:

   ```powershell
   docker compose up --build
   ```

   The first start runs the database migrations and creates the initial administrator. Wait until the backend reports healthy.

3. Open the app:

   - Frontend: http://localhost:3000
   - API docs: http://localhost:8000/docs
   - Health: http://localhost:8000/health

4. Sign in with the `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` values from the provided `.env`.

The initial admin is created only when no admin exists, so changing these values later does not affect an existing database. To start from scratch, run ` docker compose down --rmi local --remove-orphans -v` and start again. Administrators create all other accounts from **Team → Create user**; public registration is disabled.

Choose one provider:

```dotenv
# OpenAI
LLM_PROVIDER=openai
LLM_API_KEY=your-openai-key
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=

# OpenRouter (LLM_PROVIDER=openrouter)
LLM_PROVIDER=openrouter
LLM_API_KEY=your-openrouter-key
LLM_MODEL=your-openrouter-model
LLM_BASE_URL=

# Gemini (LLM_PROVIDER=gemini)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash
```

`LLM_BASE_URL` optionally overrides the OpenAI-compatible endpoint. Compatible
provider JSON mode is optional and disabled by default (`LLM_JSON_MODE=false`);
Gemini uses its native JSON response configuration. `LLM_TIMEOUT_SECONDS`
controls HTTP timeouts. Without a key, the app still starts and notes can be
saved; a requested generation is recorded as a failed insight.

Reset all data:

```powershell
 docker compose down --rmi local --remove-orphans -v
```
and build again make sure to have provided .env in root

```
docker compose build --no-cache
```
## Health scores and preferences

Preferences are stored in the `preferences` table and registered in
`backend/app/modules/preferences/registry.py`. Add each new preference to the
typed registry with its type, default, bounds, and description; if its database
row is absent, the registry default is used. The health score window is global
and admin-controlled from **Settings**. Changing it recalculates all
non-deleted customers.

Health scores use up to the latest `N` successful AI insights, newest first.
Sentiment points are Positive = 100, Neutral = 60, and Negative = 20. The
newest insight has weight `N`; each following insight has a weight one lower.
Subtract 5 points per risk on the newest insight, capped at 20, then round and
clamp the result to 0–100. For example, with `N=5`, Positive, Neutral,
Negative and two risks on the newest insight:
`(100×5 + 60×4 + 20×3) / (5+4+3) - 10 = 56.67`, which rounds to 57.
Customers with no successful insights have a null score and sample size zero.

`customers.updated_at` is refreshed when a score is recomputed; there is no
separate score timestamp. Dashboard averages include only customers visible to
the current user (assigned customers for managers, all customers for admins).
Interaction participants are active users selected by ID from
`GET /users/options`; external customer-side attendees remain typed names.
Being a participant does not grant access to a customer's account or meetings.

The generated [`db/e2m_insights_schema.sql`](./db/e2m_insights_schema.sql) is
a schema-only reference snapshot of the database after migrations have run.
Alembic migrations remain the source of truth; regenerate the snapshot with
`bash scripts/export_schema.sh` while the Compose PostgreSQL service is running.

## Local development

### 1. Infrastructure

```powershell
docker compose up -d postgres redis
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
DATABASE_URL=postgresql+psycopg://csm:<password>@localhost:5432/e2m-insights
REDIS_URL=redis://localhost:6379/0
```

Then:

```powershell
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

`backend/.env.example` includes bootstrap-admin settings. The API bootstraps
the initial administrator after migrations complete. Demo seed helpers remain
available to tests but are not run at startup.

After installing backend dependencies and the local CLI (`pip install -r requirements.txt` and `pip install -e .`), use these commands from the backend environment:

```powershell
e2m createadmin
```

`createadmin` interactively prompts for an email and password (with hidden,
confirmed password input). It creates a new admin and refuses to promote or
overwrite an existing account. Demo seed helpers remain available to tests in
`backend/app/seed.py`, but are not exposed as a CLI command or run at
application startup. Apply migrations first with `python -m alembic upgrade head`.

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

The suite uses pytest, FastAPI `TestClient`, SQLite, mocked HTTP provider calls, and a fake AI provider. It covers JWT authentication and fixed refresh expiry, RBAC, validation, customer/interaction CRUD, insight generation and staleness, dashboard counts, database freshness, and security boundaries.

Live OpenAI calls are intentionally not part of the test suite.

## Architecture

```text
e2m-insights/
├─ backend/
│  ├─ app/
│  │  ├─ modules/
│  │  │  ├─ auth/           # JWT login, refresh, profile, password
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
├─ scripts/export_schema.sh
└─ README.md
```

Backend modules follow a consistent `api.py` / `service.py` / `repository.py` / `models.py` / `schema.py` split. Business rules live in services; HTTP concerns stay in routers.

Frontend uses the Next.js App Router, React 19, Redux Toolkit for auth and customer mutations, and local component state for page-specific data. Access and refresh JWTs are stored in localStorage.

## API overview

Base path: `/api/v1`

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` (admin-only user creation), `POST /auth/login`, `POST /auth/refresh` |
| Profile | `GET /auth/me`, `PATCH /auth/me`, `POST /auth/change-password` |
| Config | `GET /auth/config`, `GET /auth/roles` |
| Users (admin) | `GET /users`, `POST /users`, `GET /users/{id}`, `PATCH /users/{id}`, `PATCH /users/{id}/role`, `POST /users/{id}/deactivate`, `POST /users/{id}/reactivate`, `POST /users/{id}/reset-password`, `GET /users/options` |
| Customers | `GET /customers`, `POST /customers`, `GET /customers/{id}`, `PATCH /customers/{id}`, `DELETE /customers/{id}` |
| Customer assignments (admin) | `GET /customers/{id}/managers`, `POST /customers/{id}/managers`, `DELETE /customers/{id}/managers/{manager_id}`, `POST /customers/assignments`, `DELETE /customers/assignments` |
| Interactions | `GET /interactions`, `POST /interactions`, `GET /interactions/{id}`, `PATCH /interactions/{id}`, `DELETE /interactions/{id}` |
| Insights | `GET /interactions/{id}/insights`, `POST /interactions/{id}/insights`, `GET /insights/config` |
| Dashboard | `GET /dashboard/summary` |

Errors use a consistent JSON envelope with a machine-readable `error_code` where useful.

## Authentication and security

- Access JWTs expire after 15 minutes; refresh JWTs have a fixed seven-day lifetime from login and are never rotated.
- The frontend stores both tokens in localStorage and sends access JWTs as `Authorization: Bearer <token>`. User records, including role and active status, are loaded from the database on every request, so role changes and deactivation take effect immediately.
- Logout is client-side. Tokens are not individually revocable by design; deactivating a user prevents both access and refresh use.
- Passwords are bcrypt-hashed. Password changes do not revoke already issued JWTs.
- New users receive a generated strong temporary password unless the admin supplies one. The password is returned only in the creation/reset response, which is marked `no-store`; user list/detail responses never contain passwords. Accounts require a password change before accessing the workspace.
- CORS is restricted to configured origins and does not allow credentials.
- Production mode rejects wildcard CORS and weak or default JWT secrets.
- Customer deletion is admin-only soft deletion; interaction deletion is admin-only soft deletion.
- AI meeting notes are delimited and treated as untrusted data. Provider output is schema-validated before persistence.
- Meeting notes, customer text, and AI output are rendered as plain text. External links accept only HTTP(S) URLs, and the frontend applies CSP, `nosniff`, referrer, and frame protections because browser tokens are stored in localStorage.

### RBAC summary

Customers are client records, never login identities. The only user roles are `admin` and `manager`. There is no public registration: `POST /auth/register` is admin-only, and admins can create either role. Use `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` to seed the first admin on startup.

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

### Redis

Redis is configured and available; caching will be applied selectively.

## AI insight behavior

1. New interactions offer separate **Save** and **Save & Generate** actions. The create
   request sends `generate_insight: false` for Save and `generate_insight: true` for
   Save & Generate. Updates do not trigger insight generation automatically.
2. The provider receives a constrained JSON-only prompt and the notes as untrusted data.
3. The response is validated against a strict schema (summary, sentiment, action items, risks).
4. Results persist with provider, model, generation count, and notes version.
5. Editing notes increments `notes_version`; older insights are shown as stale.
6. The interaction is saved before optional generation, so a missing provider or generation failure does not lose the notes. Failures are reported with the saved interaction and can be retried later.

The UI presents all of these states explicitly. Demo data deliberately starts without insights.

## Configuration

Key backend variables are documented in `backend/.env.example`. Important ones:

- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`
- `CORS_ORIGINS`
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`
- `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_SECONDS`
- `GEMINI_API_KEY`, `GEMINI_MODEL`; optional `LLM_JSON_MODE` and `AI_MAX_RETRIES`

Frontend configuration:

- `NEXT_PUBLIC_API_BASE_URL` (build-time, defaults to `http://localhost:8000/api/v1`)

## Design decisions and tradeoffs

- **Sync SQLAlchemy** for a smaller, easier-to-debug codebase at this scale; AI calls are the only meaningful blocking I/O.
- **Database checks on every authenticated request** for current user role and active status; tokens are stateless and not individually revocable.
- **Fixed refresh-token lifetime** rather than refresh rotation; refresh never extends the seven-day deadline.
- **No fabricated AI data**: demo records are real seeded entities, while insights are generated only by a real provider.
- **Server-side derived dashboard metrics** instead of duplicating aggregation logic in the client.
- **Local UI state for data** rather than a second global store; Redux is reserved for cross-cutting auth state.
- **Explicit insight states** (`pending`, `running`, `completed`, `failed`, `stale`) so the UI can be honest about uncertainty.
- **Docker Compose for evaluation convenience**, with loopback-only database/Redis ports and no secrets committed.

## Known limitations / next steps

- Live AI output quality depends on the configured provider and model; no key is included.
- The demo seed does not pre-generate insights by design.
- A production deployment should put the API and frontend behind TLS, use a secrets manager for `JWT_SECRET_KEY`, and use tightly scoped CORS origins.
- The frontend is not a full offline-capable client; network failures surface as recoverable error states.
- Email delivery, password reset by email, audit-log export, and background job workers are out of scope for this assessment.

## Troubleshooting

- **CORS error**: make sure `CORS_ORIGINS` (and `NEXT_PUBLIC_API_BASE_URL`) match the browser origin/port.

- **Seed skipped**: seed is idempotent; it skips when customers already exist.
- **AI not configured**: set the key matching `LLM_PROVIDER` (`LLM_API_KEY` or `GEMINI_API_KEY`); the app remains available and reports generation failures.
- **Port conflicts**: change `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, or `REDIS_PORT` in `.env` and rebuild the frontend if the API URL changes.
