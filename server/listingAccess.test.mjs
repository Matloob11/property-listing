import test from "node:test";
import assert from "node:assert/strict";
import {
  DESK_ACCESS_DAILY_REPORT,
  DESK_ACCESS_FULL,
  canUseListingDesk,
  deskAccess,
  isBitrixAdmin,
  isDailyReportApiAllowed,
  isDailyReportOnlyUser,
} from "./listingAccess.js";

test("Javeria bibi is daily-report only", () => {
  const user = { id: "2297", email: "javeriabibi.a7group@gmail.com" };
  assert.equal(isDailyReportOnlyUser(user), true);
  assert.equal(deskAccess(user), DESK_ACCESS_DAILY_REPORT);
  assert.equal(canUseListingDesk(user), true);
});

test("full desk users are not report-only", () => {
  const user = { id: "1", email: "khurram162@gmail.com" };
  assert.equal(isDailyReportOnlyUser(user), false);
  assert.equal(deskAccess(user), DESK_ACCESS_FULL);
});

test("Shahbaz Elahi has full desk access", () => {
  assert.equal(deskAccess({ id: "2637", email: "sha.a7group@gmail.com" }), DESK_ACCESS_FULL);
  assert.equal(deskAccess({ id: "2637", email: "" }), DESK_ACCESS_FULL);
  assert.equal(deskAccess({ id: "", email: "Sha.a7group@gmail.com" }), DESK_ACCESS_FULL);
  assert.equal(isDailyReportOnlyUser({ id: "2637", email: "sha.a7group@gmail.com" }), false);
});

test("Abdul Sattar Mughal has full desk access", () => {
  assert.equal(deskAccess({ id: "32", email: "abdul.sattar@a7grouprealestate.com" }), DESK_ACCESS_FULL);
  assert.equal(deskAccess({ id: "32", email: "" }), DESK_ACCESS_FULL);
  assert.equal(deskAccess({ id: "", email: "Abdul.Sattar@a7grouprealestate.com" }), DESK_ACCESS_FULL);
  assert.equal(isDailyReportOnlyUser({ id: "32", email: "abdul.sattar@a7grouprealestate.com" }), false);
});

test("unknown users cannot use desk", () => {
  assert.equal(canUseListingDesk({ id: "9999", email: "nope@example.com" }), false);
});

test("every Bitrix admin can use the desk and is treated as admin", () => {
  const admin = { id: "8888", email: "admin@example.com", admin: true };
  assert.equal(isBitrixAdmin(admin), true);
  assert.equal(isBitrixAdmin({ admin: 1 }), true);
  assert.equal(isBitrixAdmin({ admin: "true" }), true);
  assert.equal(isBitrixAdmin({ admin: false }), false);
  assert.equal(deskAccess(admin), DESK_ACCESS_FULL);
  assert.equal(canUseListingDesk(admin), true);
});

test("withDeskAccess never upgrades report-only to full", async () => {
  const { withDeskAccess } = await import("./listingAccess.js");
  const out = withDeskAccess({ id: "2297", email: "javeriabibi.a7group@gmail.com" });
  assert.equal(out.deskAccess, DESK_ACCESS_DAILY_REPORT);
  assert.equal(out.reportOnly, true);
});

test("report-only APIs are tightly scoped", () => {
  assert.equal(isDailyReportApiAllowed("POST", "/api/crm-intelligence/daily-report"), true);
  assert.equal(isDailyReportApiAllowed("POST", "/api/crm-intelligence/agent-month"), true);
  assert.equal(isDailyReportApiAllowed("POST", "/api/crm-intelligence/agent-month/pdf"), true);
  assert.equal(isDailyReportApiAllowed("POST", "/api/crm-intelligence/office-shares"), true);
  assert.equal(isDailyReportApiAllowed("GET", "/api/crm-intelligence/agents"), true);
  assert.equal(isDailyReportApiAllowed("POST", "/api/crm-intelligence/check"), false);
  assert.equal(isDailyReportApiAllowed("GET", "/api/listings"), false);
  assert.equal(isDailyReportApiAllowed("POST", "/api/office-inventory/check"), false);
  assert.equal(isDailyReportApiAllowed("GET", "/api/crm-intelligence/filters"), false);
  assert.equal(isDailyReportApiAllowed("GET", "/api/crm-intelligence/owner-data"), false);
});
