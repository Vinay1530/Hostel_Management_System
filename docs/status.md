# Implementation Status

Live status of every feature/function/module. Updated after each implementation step.

Legend: ✅ done · 🔧 in progress · ⏳ not started · ⏭️ deferred (by design, see plan)

Last updated: Password auth v1 (manager register + phone/password login for all roles), tenant accounts auto-provisioned, facilities per building

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
