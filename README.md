# PG Management SaaS

Operator software for PG hostel owners (Mumbai & Hyderabad): rent chasing, occupancy
visibility, and tenant records — replacing notebooks and WhatsApp.

Derived from the build plan in `PG Management SaaS Build Plan (1).pdf`.
Implementation status is tracked in [`docs/status.md`](docs/status.md).

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 + Alembic (PostgreSQL) |
| Background jobs | Celery (Redis broker) — monthly rent generation |
| Auth | Phone OTP → JWT, roles: owner / manager / tenant |
| Multi-tenancy | `organization_id` on every table + org-scoped query filter middleware |
| Frontend | React Native app — Expo SDK 54 (expo-router) |
| Files | Local disk for MVP, S3-ready interface |

## Repo layout

```
backend/        FastAPI app, Alembic migrations, Celery workers, tests
frontend/       Next.js owner PWA
docs/           status.md (feature-by-feature implementation status)
uploads/        KYC documents & agreements (git-ignored)
docker-compose.yml  postgres + backend (dev); redis + worker via `--profile jobs`
```

## Quick start (Docker — slim stack: postgres + backend only)

Start the backend and PostgreSQL before launching the app. The frontend uses the
FastAPI backend for all authentication and data; there is no offline/demo data mode.

```bash
docker compose up -d
# first run: apply migrations (skip if already applied)
docker compose run --rm backend alembic upgrade head
# Mobile app (Expo SDK 54) — from the repository root
cd frontend
npx expo start
# scan the QR with Expo Go · web fallback: press w
# API docs: http://localhost:8000/docs
```

Dev OTP mode is enabled by default (`OTP_DEV_MODE=true`): the OTP code is returned in
the API response (and shown on the login screen) instead of being sent by SMS.

### Temporary backend access for remote frontend testing

The Expo `--tunnel` option only tunnels Metro/frontend traffic. To let a teammate's
app reach this machine's API, start the optional Cloudflare Quick Tunnel profile:

```bash
docker compose --profile tunnel up -d
docker compose logs -f backend-tunnel
```

Wait for the `trycloudflare.com` URL in the tunnel logs. In a second terminal,
set the Expo API URL to that HTTPS address before starting Expo:

```powershell
cd frontend
$env:EXPO_PUBLIC_API_URL = "https://<generated-name>.trycloudflare.com"
npx expo start --tunnel
```

Share the Expo QR/link with your teammate. They need both the Expo app link and
the public backend URL configured into that Expo bundle. The Quick Tunnel URL
changes when the tunnel restarts; update `EXPO_PUBLIC_API_URL` and restart Expo
when it does. Stop the tunnel with `docker compose stop backend-tunnel`.

This is for temporary testing only: anyone who learns the URL can reach the API,
and development OTP mode returns OTPs in API responses. Use only non-sensitive
test data, and stop the tunnel when finished. PostgreSQL is not routed through
the tunnel.

### Monthly rent generation

Bills are generated **inline** from the Dues screen ("Generate month's bills"
button) or via `POST /invoices/generate {month: "YYYY-MM"}` — no extra
infrastructure needed. The Redis + Celery worker pair is kept behind the
`jobs` profile for scheduled automation and future WhatsApp reminders (weeks 9–10):

```bash
docker compose --profile jobs up -d   # enables redis + worker with the beat schedule
```

## Local development without Docker

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
# needs a local Postgres; see DATABASE_URL in backend/app/core/config.py
cd backend && alembic upgrade head && uvicorn app.main:app --reload
```

## Python-based billing cycle

`POST /invoices/generate {month: "YYYY-MM"}` generates one invoice per active stay
(inline in the API — the "Generate month's bills" button in the app calls this).
With the `jobs` profile enabled (redis + worker), Celery beat runs it monthly on the 1st.

## Complaints and property chat

Apply the current Alembic migrations before using complaints or chat:

```bash
cd backend
alembic upgrade head
```

The migration creates complaint records, photo attachments, comments, status history,
in-app notifications, property conversations, participants, and messages. Existing
properties are seeded with group and announcement conversations; later properties
create these channels automatically. Active tenants are added to their property's
channels when their stay starts (including CSV imports) and removed when it ends.

### Complaint endpoints

- `POST /complaints` — tenant multipart report with `category`, `title`,
  `description`, `priority`, and up to three `files` (JPEG, PNG, or WebP; 5 MB each).
- `GET /complaints` and `GET /complaints/{id}` — tenants see only their own
  complaints; owner/manager can view organization complaints, optionally filtered
  by `property_id`, `status`, and `category`.
- `GET /complaints/{id}/attachments/{attachment_id}` — authorized photo download.
- `PATCH /complaints/{id}/status` — staff advances status through
  `open → in_progress → resolved → closed`.
- `POST /complaints/{id}/comments` — add a comment/reply to the complaint history.
- `GET /my/notifications` and `PATCH /my/notifications/{id}/read` — tenant's
  in-app complaint-status notifications.

### Chat endpoints

- `GET /conversations?property_id=...` — participant conversations, unread counts,
  and property contacts.
- `POST /conversations/direct` with `other_user_id` (and `property_id` for staff) —
  get or create the unique direct conversation for a same-property user pair.
- `GET /conversations/{id}/messages?cursor=...` — newest 30 messages; pass
  `next_cursor` as `cursor` to load older messages. Reading history updates the
  participant's unread state.
- `POST /conversations/{id}/messages` — REST message send and polling fallback.
- `WS /ws/chat?conversation_id=...` — live chat. Authenticate the handshake with
  `Sec-WebSocket-Protocol: bearer, <access-token>`; the server selects the
  `bearer` subprotocol. Clients should fall back to polling the REST history
  endpoint when the socket is unavailable.

Announcements are read-only for tenants. Group, announcement, and direct chat
history is scoped to conversation participants and property membership.

## PG search and details

Apply the current Alembic migrations before using PG search or room details:

```bash
cd backend
alembic upgrade head
```

The latest migration adds optional PG locality, city, gate-timing, food, and visitor
rules fields, plus PostgreSQL `pg_trgm` GIN indexes for property and tenant names.
The migration enables the `pg_trgm` extension on PostgreSQL; SQLite test databases
skip the PostgreSQL-only extension and indexes.

- `GET /search?q=...&types=pg,room,tenant` — case-insensitive partial matches, with
  at most 10 PGs, rooms, and active tenants per result group. Queries must contain
  2–50 characters. Owners/managers search their organization; tenants are restricted
  to their active PG and never receive other tenants' phone numbers.
- `GET /properties` — owner/manager property list including room, bed, occupied, and
  vacant-bed counts.
- `GET /properties/{id}` — PG address, location, facilities, rules, contact, and
  occupancy. Owners/managers can view their organization properties; tenants can
  view only the PG where they currently stay.
- `GET /properties/{id}/rooms?floor=...&status=vacant|partially_filled|full`
  — room occupancy summaries for an accessible PG.
- `GET /rooms/{id}` — room facilities, per-bed rent/deposit, and active tenant name
  and move-in date. Access is limited to the owning organization or the tenant's
  active PG.
- `GET /search/tenants/{id}` — safe tenant profile summary for search navigation;
  phone numbers are only included for owners/managers.
