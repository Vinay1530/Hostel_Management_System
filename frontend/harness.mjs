// Standalone harness: loads the mock db + server as plain ESM modules
// (no React Native runtime) and runs the same API calls the app makes.
import { db, occupancyGrid, listTenants, dues, generateInvoices, listInvoices, recordPayment, myOverview, listProperties } from "./src/lib/mock/db.ts";
import { mockHandle } from "./src/lib/mock/server.ts";

function ok(name, cond) {
  console.log((cond ? "PASS " : "FAIL ") + name);
  if (!cond) process.exitCode = 1;
}

const MANAGER = "mock_manager_9000000001";
const TENANT = "mock_tenant_9111111111";

// ---- auth ----
ok("login manager", JSON.stringify(mockHandle("POST", "auth/login", { phone: "9000000001", password: "secret123" }, null).access_token) === MANAGER);
ok("login tenant", JSON.stringify(mockHandle("POST", "auth/login", { phone: "9111111111", password: "password" }, null).access_token) === TENANT);
ok("login bad creds", (() => { try { mockHandle("POST", "auth/login", { phone: "9000000001", password: "x" }, null); return false; } catch (e) { return e.status === 401; } })());

// ---- properties ----
const props = listProperties(db);
ok("2 seeded PGs", props.length === 2);
ok("Ground floor first", (() => {
  const g = occupancyGrid(db);
  const p = g.properties[0];
  return p.floors[0].name === "Ground" && p.floors[1].name === "1st";
})());
ok("layout totals", (() => {
  const r = mockHandle("POST", "properties/layout", { name: "Test PG", no_of_floors: 2, rooms_per_floor: 3, beds_per_room: 2, rent_paise: 500000, deposit_paise: 1000000 }, MANAGER);
  return r.totals.floors === 2 && r.totals.rooms === 6 && r.totals.beds === 12;
})());

// ---- tenants scoped ----
const all = listTenants(db);
ok("all tenants 7", all.length === 7);
const p1id = db.properties[0].id;
const scoped = mockHandle("GET", `tenants?property_id=${p1id}`, null, MANAGER);
ok("scoped tenants", Array.isArray(scoped) && scoped.length >= 3);

// ---- grid derived status ----
const grid = occupancyGrid(db);
let occ = 0, maint = 0, vac = 0;
for (const p of grid.properties) for (const f of p.floors) for (const r of f.rooms) for (const b of r.beds) {
  if (b.status === "occupied") occ++;
  else if (b.status === "maintenance") maint++;
  else vac++;
}
ok("grid totals", occ + maint + vac === grid.totals.beds && grid.totals.occupied === occ && grid.totals.maintenance === maint);

// ---- dues ----
const d = dues(db, p1id);
ok("dues scoped rows", d.rows.length > 0);
ok("dues summary fields", typeof d.summary.outstanding_paise === "number");

// ---- generate invoices ----
const invs = generateInvoices(db, "2026-11", p1id);
ok("generate idempotent", generateInvoices(db, "2026-11", p1id).length === 0);

// ---- payment ----
const dueRow = d.rows.find((r) => r.balance_paise > 0);
if (dueRow) {
  const pay = recordPayment(db, { invoice_id: dueRow.invoice_id, amount_paise: Math.floor(dueRow.balance_paise / 2), mode: "cash" });
  ok("payment recorded", pay.amount_paise > 0);
}

// ---- tenant overview ----
const ov = myOverview(db, "9111111111");
ok("my overview", !!ov.profile.full_name && ov.profile.property_name === db.properties[0].name);

// ---- guards ----
const bedId = grid.properties[0].floors[0].rooms[0].beds.find((b) => b.status === "occupied").id;
ok("delete occupied bed 409", (() => { try { mockHandle("DELETE", `beds/${bedId}`, null, MANAGER); return false; } catch (e) { return e.status === 409; } })());

// ---- room PATCH shrink ----
const room = db.rooms.find((r) => r.floor_id === db.floors[0].id);
const before = db.beds.filter((b) => b.room_id === room.id).length;
mockHandle("PATCH", `rooms/${room.id}`, { beds_count: 2 }, MANAGER);
const after = db.beds.filter((b) => b.room_id === room.id).length;
ok("room shrink frees highest label", before === 3 && after === 2 && !db.beds.some((b) => b.room_id === room.id && b.label === "C"));

console.log("\nMock harness done. errors:", process.exitCode ?? 0);