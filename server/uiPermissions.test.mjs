import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_SECTION_IDS,
  INFOGRAPHICS_PART_IDS,
  canManageUiPermissions,
  canManageUiPermissionsFor,
  canOpenInfographics,
  defaultSectionsForUser,
  isSectionApiAllowed,
  normalizeSavedSections,
  resolveSectionDesk,
  sanitizeSections,
} from "./uiPermissions.js";
import { DESK_ACCESS_FULL, DESK_ACCESS_SECTIONS } from "./listingAccess.js";

test("sanitizeSections keeps only known unique ids", () => {
  assert.deepEqual(sanitizeSections(["listings", "nope", "listings", "leads"]), ["listings", "leads"]);
});

test("normalizeSavedSections expands legacy infographics-only rows", () => {
  const out = normalizeSavedSections(["infographics"]);
  assert.ok(out.includes("infographics"));
  assert.ok(out.includes("ci-owner"));
  assert.ok(out.includes("ci-daily"));
  assert.ok(out.includes("ci-share-history"));
  assert.equal(out.filter((id) => INFOGRAPHICS_PART_IDS.includes(id)).length, INFOGRAPHICS_PART_IDS.length);
});

test("defaultSectionsForUser: full desk gets all sections", () => {
  const out = defaultSectionsForUser({ id: "1", email: "khurram162@gmail.com" });
  assert.equal(out.length, ALL_SECTION_IDS.length);
});

test("defaultSectionsForUser: report-only gets daily report page parts", () => {
  assert.deepEqual(defaultSectionsForUser({ id: "2297" }), ["infographics", "ci-daily", "ci-share-history"]);
});

test("saved sections let a user open the daily report and share history only", async () => {
  const db = {
    async getSetting(key) {
      if (key !== "ui_section_permissions_v2") return null;
      return { "2298": ["infographics", "ci-daily", "ci-share-history"] };
    },
  };
  const user = await resolveSectionDesk(db, { id: "2298", email: "asma@example.com" });
  assert.equal(user.deskAccess, DESK_ACCESS_SECTIONS);
  assert.equal(isSectionApiAllowed("POST", "/api/crm-intelligence/daily-report", user.grantedSections), true);
  assert.equal(isSectionApiAllowed("POST", "/api/crm-intelligence/agent-month", user.grantedSections), true);
  assert.equal(isSectionApiAllowed("POST", "/api/crm-intelligence/agent-month/pdf", user.grantedSections), true);
  assert.equal(isSectionApiAllowed("POST", "/api/crm-intelligence/office-shares", user.grantedSections), true);
  assert.equal(isSectionApiAllowed("GET", "/api/listings", user.grantedSections), false);
  assert.equal(isSectionApiAllowed("POST", "/api/crm-intelligence/check", user.grantedSections), false);
});

test("a full-desk user is not downgraded by a saved section list", async () => {
  const db = {
    async getSetting() {
      return { "32": ["ci-daily"] };
    },
  };
  const user = await resolveSectionDesk(db, { id: "32", email: "abdul.sattar@a7grouprealestate.com" });
  assert.equal(user.deskAccess, DESK_ACCESS_FULL);
});

test("canOpenInfographics true for any CI part", () => {
  assert.equal(canOpenInfographics(["ci-owner"]), true);
  assert.equal(canOpenInfographics(["listings"]), false);
});

test("canManageUiPermissions is true for every Bitrix admin", () => {
  assert.equal(canManageUiPermissions({ admin: true }), true);
  assert.equal(canManageUiPermissions({ admin: true, id: "8888" }), true);
  assert.equal(canManageUiPermissions({ admin: 1, id: "12" }), true);
  assert.equal(canManageUiPermissions({ admin: true, id: "2311" }), true);
  assert.equal(canManageUiPermissions({ id: "1", email: "khurram162@gmail.com" }), false);
  assert.equal(canManageUiPermissions({ id: "2311", admin: false }), false);
  assert.equal(canManageUiPermissions({ id: "2297" }), false);
  assert.equal(canManageUiPermissions(null), false);
});

test("canManageUiPermissionsFor matches admin-only, even with full sections", async () => {
  const db = {
    async getSetting() {
      return {};
    },
  };
  assert.equal(await canManageUiPermissionsFor(db, { admin: true, id: "1" }), true);
  assert.equal(
    await canManageUiPermissionsFor(db, { id: "1", email: "khurram162@gmail.com", admin: false }),
    false
  );
  assert.equal(await canManageUiPermissionsFor(db, { id: "2311", admin: false }), false);
});
