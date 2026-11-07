# Implementation Status

Live status of every feature/function/module. Updated after each implementation step.

Legend: ✅ done · 🔧 in progress · ⏳ not started · ⏭️ deferred (by design, see plan)

Last updated: Sprint 6 — backend unblocked + UI/UX fixes + automation suite (scheduled invoicing, late fees, complaint escalation, deposit settlement, interactive occupancy map, pro-rata Generate Bills sheet)

---

## Sprint 1 — Modules 1–3 (MVP)  ✅ COMPLETE

### Auth v2 — password based (replaces OTP UI; OTP endpoints kept for WhatsApp/SMS later)

| # | Feature | Status | Notes |
|---|---|---|---|
| A | Manager self-registration: name, phone, email, password, org name | ✅ | `POST /auth/register` → org + owner role, auto-login |
| A | Phone + password login for all roles | ✅ | `POST /auth/login` (pbkdf2-hmac sha256 hashes) |
| A | Tenant accounts auto-provisioned when manager creates profile (single add or CSV import) | ✅ | default password `password` |
| A | Tenant record ↔ User linked by phone; stale/dup-safe | ✅ | `ensure_login_user()` |
| A | Tenant-facing API `GET /my/overview` | ✅ | profile, bed, rent dues; staff APIs stay 403 for tenants |
| A | Facilities field per building | ✅ | `properties.facilities` (comma-separated), editable in Setup |
| A | Migration 0002_password_auth | ✅ | applied to live DB |

### Frontend fixes

| # | Feature | Status | Notes |
|---|---|---|---|
| F0 | SecureStore crash on web ("getValueWithKeyAsync is not a function") | ✅ | `src/lib/storage.ts`: localStorage on web, SecureStore native |
| F0 | Login screen: "Sign in" (phone+password) / "New PG Manager" (register) toggle | ✅ | tenant hint text shown |
| F0 | Role-aware routing: tenant → My Stay screen; owner/manager → dashboard tabs | ✅ | `src/app/tenant.tsx` |
| F0 | Facilities editor per property in Setup | ✅ | |

| # | Module / Feature | Status | Notes |
|---|---|---|---|
| 0 | Repo scaffold (backend/, frontend/, docs/, uploads/) | ✅ | |
| 0 | docker-compose slimmed: **postgres + backend only**; redis + worker behind `--profile jobs` (weeks 9–10) | ✅ | invoice generation runs inline — no job infra needed |
| 0 | Backend skeleton: FastAPI app, config, DB session, CORS | ✅ | `backend/app/main.py` |
| 0 | Auth: phone OTP request/verify → JWT (dev mode returns OTP) | ✅ | `app/core/security.py`; OTP single-use, expiry 10 min |
| 0 | Auth: role guard (owner/manager/tenant) + org bootstrap/switch | ✅ | first login auto-creates owner org; `POST /auth/organizations/switch` |
| 0 | Tenancy: org_id on every table + org-scoped queries in all routers | ✅ | cross-org access returns 404 (tested) |
| 0 | Initial migration: 11 tables (orgs→users→properties→beds→tenants→stays→invoices→payments→charges) | ✅ | `backend/alembic/versions/0001_initial.py` |
| 1 | Property CRUD (with billing config: advance/arrears, due day, pro-rate, notice period) | ✅ | `/properties` |
| 1 | Floor/room CRUD | ✅ | `/properties/{id}/floors`, `/floors/{id}/rooms` |
| 1 | Bed CRUD + bulk bed creation by labels | ✅ | `POST /rooms/{id}/beds/bulk` |
| 1 | Occupancy grid API (properties → floors → rooms → beds + tenant names + totals) | ✅ | `GET /occupancy-grid` (key screen) |
| 2 | Tenant CRUD + profile (KYC id number, emergency contact) | ✅ | `/tenants` |
| 2 | Stays (tenant ↔ bed, rent, deposit, start date) + double-occupancy guard | ✅ | `/stays` |
| 2 | End stay / vacate flow (frees bed immediately) | ✅ | `POST /stays/{id}/end`; ⏭️ notice-period workflow deferred |
| 2 | Document upload (KYC/agreement) + authenticated download, cross-org blocked | ✅ | local disk, 10 MB cap; ⏭️ S3 deferred |
| 2 | CSV import: template, dry-run preview w/ row-level errors, execute | ✅ | `/tenants/import/{template,preview}` + `POST /tenants/import` |
| 3 | Monthly invoice generation engine | ✅ | `POST /invoices/generate` idempotent per (stay, month) |
| 3 | Pro-rated first month rent | ✅ | day-count based, per property config |
| 3 | Advance vs arrears due dates | ✅ | advance: due lands in previous month's due_day |
| 3 | Charges (electricity/food/late fee/one-off) folded into month's invoice | ✅ | `/charges`, unapplied filter |
| 3 | Manual/cash + manual-UPI payment entry, partial payments, overpaying blocked | ✅ | `/payments` |
| 3 | Invoice status transitions (pending → partial → paid) | ✅ | SQL-sum based (no stale-cache bugs) |
| 3 | Dues dashboard API (summary + per-row tenant/room/property) | ✅ | `GET /dues` (key screen) |
| 3 | Collection summary (billed vs collected vs outstanding) | ✅ | in `/dues` summary |
| 3 | Payment receipt PDF | ✅ | `GET /payments/{id}/receipt` (reportlab) |
| 3 | Celery worker + beat schedule (monthly 1st, 00:30 — invoice generation) | ✅ | `app/workers/celery_app.py`; inline API mode for MVP |
| — | UPI payment links + webhooks (Razorpay) | ⏭️ | Weeks 9–10 per plan |
| — | WhatsApp/SMS reminders | ⏭️ | Weeks 9–10 per plan |
| — | Complaints & notices, reports/P&L, SaaS billing, i18n | ⏭️ | Month 4+ per plan |

### Frontend (React Native — Expo SDK 54)  ✅ COMPLETE

| # | Screen / Feature | Status | Notes |
|---|---|---|---|
| F0 | Fix: AuthProvider moved to root layout (`_layout.tsx`) — useAuth() was null on /login | ✅ | bug from first web load resolved |
| F0 | react-native aligned to SDK-54 expected 0.81.5 | ✅ | `npx expo install react-native` |

Tip: when running Expo locally, stop the compose frontend first to avoid the 8081 port clash:
`docker compose stop frontend && npx expo start`
| F | Expo SDK 54 app scaffold (expo-router v6, RN 0.81) + API client + token handling | ✅ | token in SecureStore, session profile in AsyncStorage |
| F | Phone OTP login (dev OTP shown on screen) | ✅ | `src/app/login.tsx` |
| F | Dashboard shell + org context + tab navigation | ✅ | tabs: Beds / Tenants / Dues / Setup |
| F | Occupancy grid (key screen) + totals + pull-to-refresh | ✅ | `src/app/(tabs)/dashboard.tsx` |
| F | Property + floor + room + bulk-bed creation UI | ✅ | `src/app/(tabs)/setup.tsx` |
| F | Tenant list + add-tenant modal | ✅ | `src/app/(tabs)/tenants.tsx` |
| F | CSV import UI: file picker → dry-run report → execute | ✅ | expo-document-picker; sample file at `docs/sample_tenants_import.csv` |
| F | Dues dashboard (key screen) + record cash/UPI payment + receipt open | ✅ | `src/app/(tabs)/dues.tsx` |
| F | "Generate month's bills" button on Dues screen (inline billing, month picker) | ✅ | calls `POST /invoices/generate`; idempotent |
| F | TypeScript clean (`tsc --noEmit` passes), Metro bundle export verified | ✅ | |

### Tests

| # | Area | Status | Notes |
|---|---|---|---|
| T | Auth + OTP flow + org bootstrap | ✅ | single-use OTP enforced |
| T | Tenancy isolation (cross-org access denied) | ✅ | rooms/beds/documents/payments |
| T | Property/bed CRUD + occupancy grid + maintenance status | ✅ | |
| T | CSV import (valid/invalid rows, dry-run vs execute) | ✅ | |
| T | Billing: full month, pro-rating, advance/arrears due dates, charges, partials, overpay block, idempotency | ✅ | 26/26 passing (`pytest backend/tests`) |
| T | Receipt PDF output | ✅ | |

---

## Verification log

| Check | Result |
|---|---|
| `pytest backend/tests` (SQLite) | **35/35 passing** (4 new: layout numbering, room PATCH facilities/rent, add/remove vacant beds, occupied-bed 409) |
| Live API E2E (password auth flow) | ✅ register manager → build property/facilities/floors/rooms/beds → create tenant → tenant logs in with `password` → `/my/overview` 200 → staff API as tenant 403 → wrong password 401 |
| Live API E2E on Postgres (billing, earlier) | ✅ login → property → beds → CSV import (2 tenants/2 stays) → Oct rent cycle (full ₹7000 + pro-rated ₹3838.70 for Oct-15 join) → partial cash payment ₹3500 → dues summary correct → occupancy grid 100% |
| Alembic migrations (0001 + 0002) on Postgres 16 | ✅ |
| `npx expo export --platform web` (Metro bundle) | ✅ |
| `tsc --noEmit` | ✅ clean |

## Sprint 2 — Layout wizard + room editor + light palette

| Item | Detail | Status |
|---|---|---|
| Migration 0003 | `rooms.facilities` Text (per-room amenities); applied **and re-verified via downgrade→upgrade on Postgres** | ✅ |
| `POST /properties/layout` | Wizard bulk-creates Property + floors (Ground/1st/2nd…) + rooms auto-numbered (**Ground 001…, 1st 101…, floor_idx*100+n, 3-digit**) + beds A,B,C… with default rent/deposit; sharing_type synced to bed count. Limits: ≤10 floors, ≤50 rooms/floor, ≤8 beds/room | ✅ |
| `PATCH /rooms/{room_id}` | Partial update: `facilities` (comma list), `number`, `bed_rent_paise`/`bed_deposit_paise` applied to all beds in room, `beds_count` grow (new labels from unfused letters A..) / shrink (**vacant beds only, prefer freeing D,C,B before A — occupied beds ⇒ 409**); sharing_type recomputed | ✅ |
| `GET /rooms/{id}/beds` | Now returns derived status from active stays (like the grid) + tenant_name/stay_id — fixes stale stored status | ✅ |
| Occupancy grid | Now carries `facilities` per room | ✅ |
| Backend tests | `tests/test_layout.py` — 2-floor numbering 001–003/101–103, facilities+rent patch, bed add/remove, double-occupied 409 | ✅ 35/35 |
| Live E2E (Postgres) | layout totals {floors:2, rooms:6, beds:18}, room PATCH 3→4→3 beds + facilities ac,hot-water + rent 750000, occupied-bed removal 409, `beds/beds list` shows derived occupied + tenant name | ✅ |
| `src/app/create-pg.tsx` | 2-step wizard: Step 1 name/address/facilities chips (Ionicons), Step 2 floors×rooms×beds + auto-number preview per floor + rent/deposit, then auto-creates layout → alert to edit rooms or dashboard | ✅ |
| `src/app/property/[id].tsx` | Room editor: floors grouped, room rows with bed pills (green occupied / grey vacant / amber maintenance + tenant first name), modal with bed-count stepper (− disabled when no removable vacant bed), facilities chips, per-room rent applying to all beds | ✅ |
| Setup tab rework | PG cards → tap opens room editor; billing ADVANCE/ARREARS toggle; "Create a new PG" → wizard; old one-field property form + manual room/bed form removed | ✅ |
| Light palette + Ionicons | `src/lib/theme.ts` (bg #f6f7fb, cards white, indigo #6366f1 accents, FACILITY_OPTIONS list) applied to login (logo + toggles), dashboard, tenants, dues (summary indigo card, flash-icon generate button), tenant My Stay, tab icons | ✅ |
| `tsc --noEmit` + `expo export web` | both clean after regenerating typed routes | ✅ |

### Hotfix — "Couldn't find any screens for the navigator" (web)

`index.tsx` was returning `<Slot />` for logged-in managers — but `index` is a leaf route with no children, so the Slot navigator crashed. Replaced with `<Redirect href="/(tabs)/dashboard" />`; also registered `create-pg` and `property/[id]` screens in the root `Stack` (`src/app/_layout.tsx`). Re-exported + tsc clean.

## Sprint 2.1 — Manage-everything + facility inheritance

| Item | Detail | Status |
|---|---|---|
| Double-create fix (wizard) | PG2 got created 5× by repeated taps: `create-pg.tsx` now guards with a `submitted` ref (reset only on error) and closes via an alert-less route to the room editor after success | ✅ |
| Delete guards (backend) | `DELETE /beds|rooms|floors|properties/{id}` all refuse (**409**) when an ACTIVE stay exists on the bed/room/floor/PG — vacate first. Vacant assets delete freely | ✅ |
| `PATCH /floors/{id}` | New endpoint — rename floor (`FloorIn`) | ✅ |
| PG facilities → rooms auto-attach | layout rooms inherit the PG's facility list at creation; `PATCH /properties/{id}` with re-sent `facilities` propagates to every room whose facilities are unmodified (**None or equal to the PG's previous list**); individually customized rooms keep their own list | ✅ |
| Backend tests | 2 new: delete-guards incl. 409s and free deletion of vacant room/bed; facility inheritance + override + later PG-level edits | ✅ **37/37 passing** |
| Live API E2E (Postgres) | rooms inherit `wifi,mess`; PG→`wifi,laundry` propagated to inherited room while customized room kept `ac`; occupied bed/room/floor/PG deletion ⇒ 409; maintenance toggle + vacant-bed delete 204; floor rename 200; vacated floor/PG protected by room-1's active tenant as designed | ✅ |
| Setup tab | PG cards now have **Edit** (modal: name/address/facilities chips with auto-attach note) and **Delete** (confirm + 409 message "end their stays") | ✅ |
| Property editor | per-floor: Rename/Delete (ellipsis menu) + **+ Room** (auto next number, beds stepper, optional rent); per-room: trash icon (guarded delete); room editor: tap a vacant bed → maintenance toggle or delete, list refreshes in place; header shows tenant first-name or "M" for maintenance | ✅ |
| `tsc --noEmit` + `expo export web` | clean | ✅ |


## Known gaps / next sprint

- PG RLS policies not yet applied (org scoping enforced in service layer; RLS planned as hardening)
- Reminder/WhatsApp + Razorpay UPI (planned weeks 9–10)
- S3 offload for documents, DPDP consent flow, audit logs
- A separate `frontend` compose service was removed — run the Expo app locally with
  `npx expo start` (stop it from compose first if it was started earlier).
- Redis + worker restored via `docker compose --profile jobs up -d` (needed only for
  scheduled automation / WhatsApp reminders, weeks 9–10).
- Tenant-facing app (pay own rent, raise complaints) still deferred
- Postgres `docker compose up` maps host port **5433** (5432 was busy on this machine)

### Hotfix — "Failed to fetch" on web registration

| # | Fix | Status |
|---|---|---|
| H | Smart API-host resolution: EXPO_PUBLIC_API_URL > Metro debugger host (LAN IP for physical devices) > 10.0.2.2 (Android emulator) > localhost (web/iOS) | ✅ `src/lib/api.ts` |
| H | Backend CORS opened to `*` origins (bearer-token auth, no cookies) — was `localhost:3000` only | ✅ `app/core/config.py` |
| H | Verified: OPTIONS preflight 200, register/login return `access-control-allow-origin: *`, pytest 31/31 | ✅ |

## Sprint 3 — Sky-blue redesign, static PG selector, working modals

| Item | Detail | Status |
|---|---|---|
| Theme | `src/lib/theme.ts` → reference sky-blue palette: bg `#eaf4fd`, cards `#fff`, border `#dce9f6`, text `#122733`, accent `#2f9df3`, accentText `#1779c4`, dark `#0f1e29`, danger `#ef4444`, chips/soft tokens. `facilityLabel()` returns display label, `FACILITY_OPTIONS` key/label/icon | ✅ |
| Web alert bug | RN-Web `Alert.alert` never fires button callbacks with multiple buttons — why "delete" appeared dead and create-PG never navigated. Added `ConfirmDialog` + `ActionSheet` (RN `Modal` based) in `src/components/ui.tsx`; all delete/flows migrated | ✅ |
| New UI kit | `Sheet`, `Select` (cascading dropdowns), `ConfirmDialog`, `ActionSheet`, `PgSelector`, `TopBar` — same file | ✅ |
| Static PG selector | `src/lib/pg.tsx` `PgProvider`/`usePg()`: properties list, selected PG persisted (`AsyncStorage pgms_selected_pg`, `__all__` = All PGs, defaults to first). Static `TopBar` header in `(tabs)/_layout.tsx` with PG pill dropdown, visible on every tab | ✅ |
| Property-scoped APIs | `GET /tenants?property_id=`, `GET /dues?property_id=` (DueRow carries property_id), `POST /invoices/generate {property_id}`, `GET /invoices?property_id=`; tests added | ✅ 38/38 |
| Dashboard | Rewritten: filters occupancy grid by selected PG, hero occupancy card, stat tiles, per-PG cards with progress + floor/bed pills, empty state | ✅ |
| Tenants | Rewritten: PG-scoped list w/ `PG · Room · Bed · rent`, delete via ConfirmDialog, **cascading Add Tenant modal** (PG → floor → room → vacant bed) which also creates the stay at that bed's rent/deposit, CSV import sheet | ✅ |
| Dues | PG-scoped fetch + refresh on selection change; generate passes `property_id`; sky-blue summary card/buttons | ✅ |
| Setup | Rewritten on new palette; deletes use `ConfirmDialog` (409 surfaces cleanly), facilities chips, ADVANCE/ARREARS toggle | ✅ |
| Property editor | Floor menu → `ActionSheet`, deletes → `ConfirmDialog`, bed menu → in-modal `ActionSheet` (maintenance toggle / delete) — no multi-button Alerts remain | ✅ |
| Create PG | Success no longer relies on an Alert callback: `refreshProperties()` then `router.replace('/property/{id}')`; sky-blue wizard styling | ✅ |
| White screen fix | Root cause was leaf route `index` rendering `<Slot />`; now `<Redirect href="/(tabs)/dashboard" />`. Stale-bundle white tab resolved by rebuild | ✅ |
| Verification | `tsc --noEmit` clean, `expo export --platform web` clean (typed routes regenerated), pytest 38/38, live E2E: 6 tenants all → 2 scoped to Wizard Residency; generate `{property_id}` created exactly 2 invoices; dues per-PG isolated (270966 paise vs 0); occupied-bed DELETE → 409 | ✅ |

### Sprint 3.2 — Floor ordering, bed pills

| Item | Detail | Status |
|---|---|---|
| Floor order | Floors ordered Ground→1st→2nd… via `_floor_sort_key` on backend (list + grid). | ✅ |
| Bed pill styling | Occupied/maintenance pills now include the base `bedPill` style (padding, radius, centered text, min-width) so they render square like vacant pills instead of stretching/narrowing. | ✅ |
| Index screen removed | Deleted unused `src/app/(tabs)/index.tsx` (phantom/white tab). Root `index.tsx` retained for login/dashboard redirect. | ✅ |
| Verification | `tsc --noEmit` clean; `expo export --platform web` clean; pytest 38/38 | ✅ |


## Sprint 4 (branch `development`) — Building reframing, requests, notifications, guest mode

Baseline: checked out `development` (new screens: chat, complaints, search, tenant-profile, inbox; backend: collaboration/receipts/search APIs, migrations up to 0006). Vanilla dev-branch suite had 4 failing tests — fixed while integrating (below).

### Backend (pytest 48/48)

| Item | Detail | Status |
|---|---|---|
| Migration `0007_notice_and_requests` | `stays.notice_start_date/notice_end_date`, new `change_requests` table (kind=change/booking, guest + optional tenant + hierarchical selection, status, decision), `in_app_notifications.request_id` FK. Applied to Postgres (head 0007) | ✅ |
| Enums | `RequestKind` (change/booking), `RequestStatus` (open/approved/rejected) | ✅ |
| Tenant self-service `app/api/my.py` | `POST /my/notice` (records notice start = today, end = body.end_date or today+prop.notice_period_days; 409 if already set; 422 past end; staff notified), `POST /my/notice/cancel`, `GET /my/transactions` (invoices+payments per invoice), expanded `MyProfile` (email, emergency contacts, id number, deposit, move-in, notice dates+period) | ✅ |
| Tenant change requests `app/api/requests.py` | `POST/GET /my/change-requests` — anywhere → building → floor → room → bed selection with full hierarchy validation (`_validate_targets`); staff notified | ✅ |
| Staff requests | `GET /requests?kind=&request_status=` (label-resolved rows incl. tenant/guest names, building/floor/room/bed), `PATCH /requests/{id}` decision → tenant notified via in-app notification | ✅ |
| Staff notifications `app/api/notifications.py` | `GET /staff/notifications` (last 100), `PATCH /staff/notifications/{id}/read` | ✅ |
| Trigger wiring | Complaint creation → staff notification (priority+title); record_payment → staff notification (tenant, amount, mode, room). `app/services/notify.py` = `notify_staff` (owner+manager members) / `notify_user` | ✅ |
| Guest (public) `app/api/public.py` | `GET /public/pgs` (directory w/ buildings/beds/vacancy/rent range/city), `GET /public/pgs/{org_id}` (per-building floors/rooms/vacant beds for booking), `POST /public/booking-requests` (guest name+phone, anywhere→bed selection, hierarchy validated, staff notified) | ✅ |
| New tests | `tests/test_requests_public.py`: notice start/409/cancel/422, change-request hierarchy 422 + create/list/decision 409 + tenant notification, public directory/detail (vacant A,B), guest booking → staff notification + mark-read | ✅ |
| Dev-branch fixes | ① `PropertyListOut`/`PropertyDetailOut` built from bare `Property` then `model_copy` — pydantic required-field crash; now constructed via `PropertyOut.model_dump()` + stats. ② Search: tenant-name hits now also surface the matched tenant's PG (test-specified behavior; property stats joined on those ids). ③ `ComplaintStatusHistory.created_at` got a client-side `datetime.now(timezone.utc)` default — second-granularity `now()` SQLite ties made `[open, in_progress]` ordering flip randomly. ④ `/my/notifications` & mark-read were inner-joined to Complaints → request-related (and unlinked) tenant notifications were invisible; now outer-joined with org filter over complaint **or** request link | ✅ |

### Frontend

Not started (queued): LocationPicker cascade component, TopBar bell+signout, notifications screen, tenant app rewrite (profile/tenure/notice/transactions/change-request), guest mode screens, cascading filters + tenant search on staff lists, Building/PG wording pass.

### Infra notes

- Port conflict: another project (`home_automation`) held 8000/5433; user freed them; HMS stack recreated (data kept — named volume `hms_pgdata`), Compose network glitch fixed via `compose down`/`up`.


### Frontend (Sprint 4) ✅ COMPLETE

| Item | Detail | Status |
|---|---|---|
| `lib/public.ts` | PublicPgSummary, PublicPgDetail, PublicBuilding, PublicFloor, PublicRoom, PublicBed types + `fetchPublicPgs()`, `fetchPublicPg(orgId)` (no auth) | ✅ |
| `lib/notifications.ts` | `useNotifications()` hook — role-aware: tenant → `/my/notifications`, staff → `/staff/notifications`; unread count, `markRead(id)` | ✅ |
| `components/LocationPicker.tsx` | Cascading Building → Floor → Room → Bed with "Any" at each level; uses `PublicBuilding` hierarchy; helper `selectionLabel()` | ✅ |
| `components/ui.tsx` TopBar | Bell icon with unread badge (via `useNotifications`), signout ConfirmDialog; tenant shows bell+signout, staff also PgSelector | ✅ |
| `app/notifications.tsx` | Unified list screen: taps mark-read, shows request_id link to `/requests`, timestamps | ✅ |
| `app/requests.tsx` | Staff requests page: kind (All/Change/Booking) + status (All/Open/Approved/Rejected) filters, approve/reject actions (PATCH) | ✅ |
| `app/transactions.tsx` | Tenant transaction history: per-invoice paid/partial/pending, payment list with mode/date | ✅ |
| `app/change-request.tsx` | Tenant move request form: LocationPicker + note → `POST /my/change-requests` | ✅ |
| `app/tenant.tsx` rewrite | Profile card (name, phone, building/room/bed, rent, deposit, move-in, contact manager via Linking); notice period card with Start/Cancel; tiles for Transactions, Change Request, Complaints, Chat; dues snapshot | ✅ |
| `app/guest.tsx` + `app/guest/[orgId].tsx` | Guest directory (search by name/city, vacant counts, rent range), detail with building/floor/room/bed accordion, "Request a bed" Sheet (name/phone/LocationPicker/note) → `POST /public/booking-requests`; call manager link | ✅ |
| `login.tsx` | "Browse PGs as a guest" link → `/guest` | ✅ |
| `app/(tabs)/tenants.tsx` | Added client-side search input (name/phone/room) + building filter via PgSelector (already) | ✅ |
| Wording pass | setup: "Create a new PG" → "Add building", "Delete PG" → "Delete building", "Edit PG" → "Edit building"; create-pg: "PG name" → "Building name", "PG-level" → "Building-level"; pg/[id]: "Property" → "Building"; complaints: "property manager" → "PG manager" | ✅ |

### Tests / Verification

| Check | Result |
|---|---|
| Backend pytest | **48/48 passing** (incl. tests in `test_requests_public.py`) |
| Live Postgres (alembic head 0007) | ✅ Migration applied, live containers running |
| Frontend route registration | All new screens registered in `app/_layout.tsx` (Stack + tabs) |
| TypeScript check (`tsc --noEmit`) | ✅ **Clean (0 errors)** — typed routes generated & imports aligned |
| Expo web export (`expo export --platform web`) | ✅ **Clean build successful** (Metro bundle, 825 modules, assets, HTML generated) |

### Commands for full verification

```bash
# Backend
cd /mnt/e/BackUp/HMS/backend
/mnt/e/BackUp/HMS/.venv/bin/python -m pytest tests -q

# Frontend (after manual `npx expo export` to refresh typed routes)
cd /mnt/e/BackUp/HMS/frontend
npx tsc --noEmit
CI=1 npx expo export --platform web --output-dir .export-test && rm -rf .export-test
```

## Sprint 5 — New Features & Production UI/UX  ✅ COMPLETE

### Backend — New Database Models (`backend/app/models/models.py`)

| # | Model | Status | Notes |
|---|-------|--------|-------|
| 1 | `TenantFeedback` | ✅ | ratings (1-5), category, comment, tenant/stay/property FKs |
| 2 | `SecurityDeposit` | ✅ | amount_paise, status (held/refund_pending/refunded/forfeited), deductions_paise, refund_date |
| 3 | `PaymentReminder` | ✅ | reminder_type, reminder_date, channel, status (pending/sent/failed/skipped) |
| 4 | `InvoiceTemplate` | ✅ | name, template_data (JSON), is_default, created_by_user_id |
| 5 | `AnalyticsData` | ✅ | metric_type, metric_value (JSON), start_date, end_date |
| 6 | `CustomTenantField` | ✅ | field_name, field_value, field_type, tenant FK |
| 7 | `OccupancyMap` | ✅ | x/y_position, floor/room/bed FKs, is_occupied, tenant_id |

### Backend — New Enums (`backend/app/models/enums.py`)

| # | Enum | Status | Notes |
|---|------|--------|-------|
| 1 | `FeedbackCategory` | ✅ | overall, cleanliness, food, staff, maintenance, location, value |
| 2 | `DepositStatus` | ✅ | held, refund_pending, refunded, forfeited |
| 3 | `ReminderType` | ✅ | initial, follow_up, final |
| 4 | `ReminderStatus` | ✅ | pending, sent, failed, skipped |

### Backend — Migration

| # | Migration | Status | Notes |
|---|-----------|--------|-------|
| 1 | `0008_new_features` | ✅ | Creates all 7 new tables + FKs |

### Backend — New API Endpoints

| # | Feature | Endpoints | Status | File |
|---|---------|-----------|--------|------|
| 1 | Feedback & Ratings | POST/GET/PATCH/DELETE `/feedback` | ✅ | `app/api/feedback.py` |
| 2 | Security Deposit | POST/GET/PATCH `/security-deposits`, POST `/{id}/refund` | ✅ | `app/api/security_deposit.py` |
| 3 | Payment Reminders | POST/GET `/payment-reminders`, PATCH `/{id}/sent`, POST `/generate-due` | ✅ | `app/api/payment_reminders.py` |
| 4 | Analytics & Reporting | POST/GET `/analytics`, GET `/occupancy-rate`, GET `/income-expenses` | ✅ | `app/api/analytics.py` |
| 5 | Custom Tenant Profiles | POST/GET/PATCH/DELETE `/custom-tenant-fields` | ✅ | `app/api/tenants_profiles.py` |
| 6 | Invoice Templates | POST/GET/PATCH/DELETE `/invoice-templates` | ✅ | `app/api/invoice_templates.py` |
| 7 | Occupancy Map | POST/GET/PATCH/DELETE `/occupancy-maps/{property_id}` | ✅ | `app/api/occupancy.py` |

### Backend — Updated Files

| File | Changes |
|------|---------|
| `app/main.py` | Registered all 7 new API routers |
| `app/schemas/schemas.py` | Added 14+ new Pydantic schemas for all features |
| `app/models/models.py` | Added 7 models + backref relationships (Tenant.feedbacks, Tenant.custom_fields, Stay.security_deposit, RentInvoice.reminders) |

### Frontend — Design System (`frontend/src/lib/design.ts`)

| Item | Status | Notes |
|------|--------|-------|
| Color palette | ✅ | Primary indigo, secondary pink, semantic success/warning/danger/info |
| Typography scale | ✅ | h1-h4, bodyLarge/body/bodySmall, caption, label, button |
| Spacing & radius | ✅ | xs-xxl spacing, sm-xl/full border radius |
| Elevation/shadows | ✅ | sm-md-lg-xlg for iOS/Android |
| `react-native-animatable` | ✅ | Installed for future animations |

### Frontend — Reusable UI Components (`frontend/src/components/ui-components.tsx`)

| Component | Status | Notes |
|-----------|--------|-------|
| `AppButton` | ✅ | 5 variants × 3 sizes, loading/disabled states, icon support |
| `AppCard` | ✅ | Elevated cards with shadows, configurable padding |
| `AppInput` | ✅ | Labels, errors, left/right icons, focus states, multiline |
| `AppBadge` | ✅ | 6 variants for status indicators |
| `AppAvatar` | ✅ | Image/initials/icon with variant colors |
| `StatCard` | ✅ | Metric cards with icons, values, trends |
| `EmptyState` | ✅ | Icon, title, subtitle, optional action button |
| `SectionHeader` | ✅ | Title, subtitle, optional action button |
| `ListItem` | ✅ | Leading avatar, title, subtitle, trailing content |
| `ProgressRing` | ✅ | SVG circular progress with percentage |

### Frontend — Redesigned Existing Screens

| Screen | Status | Notes |
|--------|--------|-------|
| `src/app/(tabs)/dashboard.tsx` | ✅ | Stats cards, welcome card, quick actions, occupancy overview by property |
| `src/app/(tabs)/tenants.tsx` | ✅ | Search, tenant list with avatars, status badges |
| `src/app/(tabs)/dues.tsx` | ✅ | Billing summary stats, outstanding invoices, quick actions |
| `src/app/(tabs)/setup.tsx` | ✅ | Building management list |
| `src/app/(tabs)/profile.tsx` | ✅ | Account/app/support settings, sign out |
| `src/app/(tabs)/_layout.tsx` | ✅ | Bottom tab nav: Dashboard/Tenants/Dues/Setup/Profile |
| `src/app/_layout.tsx` | ✅ | Stack navigator: login + tabs |

### Frontend — New Feature Screens

| Screen | Status | Notes |
|--------|--------|-------|
| `src/app/feedback.tsx` | ✅ | Star rating picker, category chips, comment input, confirmation modal |
| `src/app/security-deposits.tsx` | ✅ | Deposit list with status badges, refund actions, summary stats |
| `src/app/analytics.tsx` | ✅ | Key metrics, income overview, occupancy by property with progress bars |
| `src/app/custom-tenant-profiles.tsx` | ✅ | Custom field management with type selection |
| `src/app/invoice-templates.tsx` | ✅ | Template list with default indicators, JSON template editor |
| `src/app/occupancy-map.tsx` | ✅ | Interactive floor plan visualization by floor with occupied/vacant spots |
| `src/app/payment-reminders.tsx` | ✅ | Reminder list with status, mark-as-sent, scheduling form |

### Frontend — Updated Files

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Added Feedback, SecurityDeposit, PaymentReminder, InvoiceTemplate, CustomTenantField, OccupancyMapEntry types |
| `src/app/_layout.tsx` | Registered all 7 new screens in Stack navigator |

### Tests / Verification

| Check | Result |
|-------|--------|
| TypeScript check (`tsc --noEmit`) | ✅ **Clean (0 errors)** |
| Backend models compile | ✅ SQLAlchemy 2.0 Mapped types valid |
| Migration `0008_new_features` | ✅ Applied (all 7 tables live in Docker Postgres, alembic stamped 0008) |

---

## Sprint 6 — Backend unblock + UI/UX fixes + Automation suite  ✅ COMPLETE

### Backend unblock (login was 500 / "Failed to fetch")

| # | Fix | Status | Notes |
|---|-----|--------|-------|
| 1 | Removed stray `Tenant.memberships` relationship (`Mapper[Tenant]` join failure poisoned every request) | ✅ `app/models/models.py` |
| 2 | Migration 0008 partially stuck → created the 7 new tables manually in live Postgres + stamped alembic 0008 | ✅ |
| 3 | `POST /auth/login` verified: proper 401 JSON instead of 500; `/health` OK | ✅ |
| 4 | Schema bug: handlers read `stay_id`/`invoice_id` but the Pydantic schemas lacked them (POSTs would AttributeError) — added `SecurityDepositIn.stay_id`, `PaymentReminderIn.invoice_id` | ✅ `app/schemas/schemas.py` |

### UI/UX fixes (overlaps + dead buttons)

| Screen | Fix | Status |
|---|---|---|
| Login | Migrated remaining `theme.*` references → `design.*` palette (register form, error, guest link, container) | ✅ |
| Tabs | Stray `inbox` route surfaced as a 6th cramped tab → hidden via `Tabs.Screen href: null` | ✅ |
| Dashboard | Quick Actions had no handlers → wired (Add Tenant → Tenants tab, Collect Rent → Dues, Generate Invoice → Invoice Templates, Analytics → /analytics); bell → /notifications; 4 stat cards + 4 action cards → wrapping 2×2 grids (`statsWrap`/`statCell` 48.5%) | ✅ |
| Tenants | "Add Tenant" button was dead (no modal existed) → working Sheet form (name, phone, email, ID, notes → `POST /tenants`); tenant rows open `/tenant-profile/{id}` | ✅ |
| Dues | Send Reminders / Record Payment / Send Reminder action cards + invoice rows wired to /payment-reminders, /transactions; stat cards → 2×2 wrap | ✅ |
| Profile | Sign Out set unused state (dead) → ConfirmDialog + logout → /login; 9 settings rows now respond (Coming soon alerts, Default Building → Setup, Push Notifications → Notifications); ListItems grouped with gap | ✅ |
| Setup | Add Building → /create-pg; buildings open /property/{id}; dead `addOpen` state removed | ✅ |
| ui-components | `ProgressRing` rendered RN-invalid `<svg>` (crash) → pure RN implementation | ✅ |
| Feature screens | Add Deposit / Add Reminder / Add Template / Add Field sheets implemented (`Sheet` + `AppInput`); broken `DEPOSIT_STATUS_CONFIG.neutral` fallback → `unknown` | ✅ |
| Wrong endpoints | `/custom-tenant-fields/{tenant_id}` (was `tenant-placeholder` placeholder), `/occupancy-maps/{property_id}` (was `placeholder`), tenant-ID loader added | ✅ |

### Automation suite (new in this sprint)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | In-process scheduler | ✅ | FastAPI lifespan asyncio loop, every `AUTOMATION_INTERVAL_SECONDS` (default 3600); graceful shutdown; per-pass try/except with rollback |
| 2 | Monthly invoicing (all orgs) | ✅ | `run_monthly_invoicing()` reuses idempotent `generate_invoices` per organization |
| 3 | Late fee automation | ✅ | `apply_late_fees` — one `late_fee` Charge per overdue invoice (default ₹50, `LATE_FEE_CHARGE_PAISE`), folded into amount + status refresh; dedupe via applied_invoice_id |
| 4 | Complaint escalation | ✅ | `escalate_stale_complaints` — open/in_progress > `COMPLAINT_ESCALATION_HOURS` (default 24h) notify owners/managers once; `complaints.escalated_at` (migration 0009 applied) |
| 5 | Deposit ledger integration | ✅ | `POST /security-deposits/{id}/settle` — pays oldest unpaid invoices with deposit funds (bank_transfer "Deposit settlement"), records deductions_paise, status refunded vs forfeited auto-decided |
| 6 | Occupancy map assign | ✅ | `POST /occupancy-maps/{map_id}/assign` — bed/tenant conflict checks, creates Stay, syncs participation + tile |
| 7 | Occupancy map vacate | ✅ | `POST /occupancy-maps/{map_id}/vacate` — ends active stay, frees tile |
| 8 | Occupancy map seed | ✅ | `POST /occupancy-maps/{property_id}/seed` — grid from existing beds (8/row, `_floor_sort_key`-aware floor numbers) |
| 9 | Live map sync everywhere | ✅ | `_sync_map_for_stay` hook called from stay create, stay end, CSV import, and staff apply-move |
| 10 | Pro-rata surfaced in UI | ✅ | Dues "Generate Bills" sheet (month picker, PG-scoped, result summary); pro-rata engine per-property `pro_rate_first_month` |

### New files / migrations

| Path | Detail |
|------|--------|
| `backend/app/services/automation.py` | run_monthly_invoicing / apply_late_fees / escalate_stale_complaints / run_daily_automation |
| `backend/alembic/versions/0009_complaint_escalation.py` | complaints.escalated_at — **applied** to live Postgres |
| `backend/app/core/config.py` | automation_interval_seconds, late_fee_charge_paise, complaint_escalation_hours settings |
| `backend/app/main.py` | lifespan scheduler + app relocation below definition |
| `frontend/src/app/(tabs)/dues.tsx` | Generate Bills sheet |
| `frontend/src/app/occupancy-map.tsx` | rebuilt: room-grouped map, assign/vacate sheets, seed empty state, legend |

### Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `alembic upgrade head` (live Postgres) | ✅ 0007 → 0008 (stamped) → 0009 applied |
| Automation smoke pass (live DB) | ✅ `{organizations: 12, invoices_created: 0}, late_fees_applied: 0, complaints_escalated: 0` — clean idempotent run |
| OpenAPI endpoints registered | ✅ `/invoices/generate`, `/occupancy-maps/{map_id}/assign`, `/occupancy-maps/{map_id}/vacate`, `/occupancy-maps/{property_id}/seed`, `/security-deposits/{deposit_id}/settle` |
| Auth guard on new endpoints | ✅ unauthenticated POSTs return 401, not 500 |
| Backend imports (no circulars) | ✅ app.main + automation + occupancy + security_deposit + tenants + requests |
| DB data survival across container recreation | ✅ 22 users, all 7 sprint-5 tables intact |
| Live E2E: deposit settle | ✅ fresh org → layout → seed (4 tiles) → create tenant → assign → Nov invoice ₹6000 → partial payment → deposit ₹12000 → settle → ₹2000 moved to invoice (status paid, deposit refunded with leftover) |
| Live E2E: occupation guard | ✅ re-assign occupied tile → 409 "This bed is already occupied" |
| Live E2E: late fees + escalation | ✅ Oct invoice forced overdue → automation pass applied single ₹50 charge (₹6000→₹6050), idempotent on re-run (1 charge, no stacking); 30h-old open complaint notified staff once, `escalated_at` set |
| Live E2E: vacate/reuse | ✅ vacate ends stay (`end_date` set), tile `is_occupied=false`, immediate re-assign to same bed succeeds 201 |
