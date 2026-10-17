/**
 * UI-only section visibility for Property Listing.
 * Does not change listing CRUD, Bitrix sync, or desk data logic — only which
 * nav/views a user may open after they already have desk access.
 */
import { DESK_ACCESS_SECTIONS, hasFullListingDesk, isBitrixAdmin, isDailyReportOnlyUser, withDeskAccess } from "./listingAccess.js";

export const UI_PERMISSIONS_KEY = "ui_section_permissions_v2";

/** Infographics page sub-parts (separate toggles in Settings). */
export const INFOGRAPHICS_PARTS = [
  { id: "ci-crm", label: "CRM Intelligence report", group: "Listing Infographics" },
  { id: "ci-owner", label: "Owner Data", group: "Listing Infographics" },
  { id: "ci-leads-detail", label: "Lead details", group: "Listing Infographics" },
  { id: "ci-history", label: "Agent history", group: "Listing Infographics" },
  { id: "ci-funnels", label: "Leads / Deals funnels", group: "Listing Infographics" },
  { id: "ci-reports", label: "Activity / Response / Source reports", group: "Listing Infographics" },
  { id: "ci-office-leads", label: "Office leads", group: "Listing Infographics" },
  { id: "ci-office", label: "Office Inventory", group: "Listing Infographics" },
  { id: "ci-daily", label: "Team / Agent Daily Report", group: "Listing Infographics" },
  { id: "ci-share-history", label: "Office share history", group: "Listing Infographics" },
  { id: "ci-listing-history", label: "Agent listing history", group: "Listing Infographics" },
];

export const INFOGRAPHICS_PART_IDS = INFOGRAPHICS_PARTS.map((row) => row.id);

/** All Property Listing sections / parts shown in Settings. */
export const UI_SECTIONS = [
  { id: "overview", label: "Overview", group: "Desk" },
  { id: "listings", label: "Listings", group: "Desk" },
  { id: "leads", label: "Leads", group: "Desk" },
  { id: "infographics", label: "Listing Infographics (page access)", group: "Desk" },
  { id: "filters", label: "Filters", group: "Desk" },
  ...INFOGRAPHICS_PARTS,
  { id: "tenancy", label: "Tenancy Contract", group: "Contracts" },
  { id: "booking", label: "Title Deed", group: "Contracts" },
  { id: "noc", label: "NOC (main)", group: "NOC" },
  { id: "noc-maintenance", label: "NOC Maintenance", group: "NOC" },
  { id: "noc-movein", label: "NOC For Move In", group: "NOC" },
  { id: "noc-moveout", label: "NOC For Move Out", group: "NOC" },
  { id: "noc-trakheesi", label: "NOC For Advertisement", group: "NOC" },
  { id: "form-a", label: "Form A", group: "Forms" },
  { id: "form-i", label: "Form I", group: "Forms" },
  { id: "booking-form", label: "Booking Form", group: "Forms" },
];

export const ALL_SECTION_IDS = UI_SECTIONS.map((row) => row.id);
const SECTION_SET = new Set(ALL_SECTION_IDS);

function normId(value) {
  return String(value || "").trim();
}

export function sanitizeSections(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw || "").trim();
    if (!SECTION_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Legacy v1 saved only "infographics" for the whole page — expand to every
 * Infographics part so old rows keep working until re-saved.
 */
export function normalizeSavedSections(list) {
  const cleaned = sanitizeSections(list);
  const hasPage = cleaned.includes("infographics");
  const hasPart = cleaned.some((id) => INFOGRAPHICS_PART_IDS.includes(id));
  if (hasPage && !hasPart) {
    return sanitizeSections([...cleaned, ...INFOGRAPHICS_PART_IDS]);
  }
  return cleaned;
}

/** Default when no custom row is saved — keep current desk behaviour. */
export function defaultSectionsForUser(user) {
  if (isDailyReportOnlyUser(user)) return ["infographics", "ci-daily", "ci-share-history"];
  if (hasFullListingDesk(user)) return [...ALL_SECTION_IDS];
  return [];
}

/** Settings gear + grant/revoke sections: every Bitrix portal admin. */
export function canManageUiPermissions(user) {
  return isBitrixAdmin(user);
}

/** Same gate as canManageUiPermissions (kept async for the API). Desk access is not enough. */
export async function canManageUiPermissionsFor(_db, user) {
  return canManageUiPermissions(user);
}

const SECTION_ALWAYS = new Set([
  "GET /api/auth/me",
  "POST /api/auth/logout",
  "GET /api/ui-permissions/me",
]);

function routeKey(method, path) {
  const verb = String(method || "GET").toUpperCase();
  const clean = String(path || "").split("?")[0].replace(/\/$/, "") || "/";
  return { verb, clean, key: `${verb} ${clean}` };
}

function pathIs(clean, prefix) {
  return clean === prefix || clean.startsWith(`${prefix}/`);
}

/** APIs a settings-granted user may call for the sections that were saved. */
export function isSectionApiAllowed(method, path, sections) {
  const { verb, clean, key } = routeKey(method, path);
  const allow = new Set(Array.isArray(sections) ? sections : []);
  const has = (id) => allow.has(id);
  if (SECTION_ALWAYS.has(key)) return true;

  if (has("overview")) {
    if (key === "GET /api/overview" || key === "GET /api/listings/summary" || key === "GET /api/pf/status") return true;
    if (pathIs(clean, "/api/listings/expiry-alerts")) return true;
  }
  if (has("leads") && pathIs(clean, "/api/leads")) return true;
  if (has("listings") || has("filters") || has("overview")) {
    if (verb === "GET" && (pathIs(clean, "/api/listings") || pathIs(clean, "/api/locations") || key === "GET /api/directory")) return true;
  }
  if (has("listings") || has("filters")) {
    if (pathIs(clean, "/api/listings") || pathIs(clean, "/api/dld") || key === "POST /api/uploads" || pathIs(clean, "/api/directory")) return true;
  }
  if (has("ci-crm") || has("ci-funnels") || has("ci-reports") || has("ci-history") || has("ci-leads-detail")) {
    if ([
      "POST /api/crm-intelligence/check",
      "POST /api/crm-intelligence/open-whatsapp",
      "POST /api/crm-intelligence/option-sent-numbers",
      "GET /api/crm-intelligence/filters",
      "GET /api/crm-intelligence/agents",
      "POST /api/crm-intelligence/agents",
    ].includes(key)) return true;
  }
  if (has("ci-owner") && (key === "GET /api/crm-intelligence/owner-data" || key === "GET /api/crm-intelligence/agents")) return true;
  if (has("ci-office-leads") && key === "POST /api/office-leads/check") return true;
  if (has("ci-office") && key === "POST /api/office-inventory/check") return true;
  if (has("ci-daily") && [
    "GET /api/crm-intelligence/agents",
    "POST /api/crm-intelligence/agents",
    "POST /api/crm-intelligence/daily-report",
    "POST /api/crm-intelligence/agent-month",
    "POST /api/crm-intelligence/agent-month/pdf",
    "POST /api/crm-intelligence/daily-report/pdf",
    "GET /api/crm-intelligence/daily-report/notes",
    "PUT /api/crm-intelligence/daily-report/notes",
  ].includes(key)) return true;
  if (has("ci-share-history") && key === "POST /api/crm-intelligence/office-shares") return true;
  if (has("ci-listing-history") && (key === "GET /api/listings/agent-portfolio" || key === "GET /api/crm-intelligence/agents")) return true;
  if (has("tenancy") && (pathIs(clean, "/api/tenancy") || pathIs(clean, "/api/contracts") || key === "GET /api/crm/search")) return true;
  if (has("booking") && pathIs(clean, "/api/booking") && !pathIs(clean, "/api/booking-form")) return true;
  if (has("noc") && (clean === "/api/noc" || clean.startsWith("/api/noc/"))) return true;
  if (has("noc-maintenance") && pathIs(clean, "/api/noc-maint")) return true;
  if (has("noc-movein") && pathIs(clean, "/api/noc-movein")) return true;
  if (has("noc-moveout") && pathIs(clean, "/api/noc-moveout")) return true;
  if (has("noc-trakheesi") && pathIs(clean, "/api/noc-trakheesi")) return true;
  if (has("form-a") && pathIs(clean, "/api/form-a")) return true;
  if (has("form-i") && pathIs(clean, "/api/form-i")) return true;
  if (has("booking-form") && pathIs(clean, "/api/booking-form")) return true;
  const needsLookup = ["tenancy", "booking", "noc", "noc-maintenance", "noc-movein", "noc-moveout", "noc-trakheesi", "form-a", "form-i", "booking-form", "listings"].some(has);
  if (needsLookup && (key === "POST /api/uploads" || key === "GET /api/crm/search" || key === "GET /api/tenancy/search" || pathIs(clean, "/api/locations"))) return true;
  return false;
}

/**
 * People with no built-in desk still open Property Listing when an admin
 * saved a section list for them. Full desk and report-only stay as they are.
 */
export async function resolveSectionDesk(db, session) {
  const base = withDeskAccess(session);
  if (base?.deskAccess) return base;
  const id = normId(session?.id);
  if (!db || !id) return base;
  const map = await loadPermissionsMap(db);
  if (!Object.prototype.hasOwnProperty.call(map, id)) return base;
  const sections = normalizeSavedSections(map[id]);
  if (!sections.length) return base;
  return { ...base, deskAccess: DESK_ACCESS_SECTIONS, reportOnly: false, grantedSections: sections };
}

export function canOpenInfographics(sections) {
  const list = Array.isArray(sections) ? sections : [];
  if (list.includes("infographics")) return true;
  return list.some((id) => INFOGRAPHICS_PART_IDS.includes(id));
}

export async function loadPermissionsMap(db) {
  const v2 = db ? await db.getSetting(UI_PERMISSIONS_KEY, null) : null;
  if (v2 && typeof v2 === "object" && !Array.isArray(v2)) return v2;
  // Fall back to v1 once, normalized.
  const v1 = db ? await db.getSetting("ui_section_permissions_v1", {}) : {};
  if (!v1 || typeof v1 !== "object" || Array.isArray(v1)) return {};
  const migrated = {};
  for (const [userId, sections] of Object.entries(v1)) {
    migrated[userId] = normalizeSavedSections(sections);
  }
  return migrated;
}

export async function getSectionsForUser(db, user) {
  const id = normId(user?.id);
  if (!id) return [];
  const map = await loadPermissionsMap(db);
  if (!Object.prototype.hasOwnProperty.call(map, id)) {
    return defaultSectionsForUser(user);
  }
  return normalizeSavedSections(map[id]);
}

export async function setSectionsForUser(db, userId, sections) {
  const id = normId(userId);
  if (!id) {
    const error = new Error("Select a user first.");
    error.status = 400;
    throw error;
  }
  const cleaned = sanitizeSections(sections);
  // If any Infographics part is on, ensure page access id is present for nav.
  const hasPart = cleaned.some((sid) => INFOGRAPHICS_PART_IDS.includes(sid));
  if (hasPart && !cleaned.includes("infographics")) cleaned.unshift("infographics");
  const map = await loadPermissionsMap(db);
  map[id] = cleaned;
  await db.setSetting(UI_PERMISSIONS_KEY, map);
  return { ok: true, userId: id, sections: cleaned };
}

export function sectionCatalog() {
  return UI_SECTIONS.map((row) => ({ ...row }));
}
