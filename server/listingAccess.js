const ALLOWED_IDS = new Set(["1", "32", "2191", "2265", "2311", "2319", "2558", "2567", "2637"]);

const ALLOWED_EMAILS = new Set(
  [
    "khurram162@gmail.com",
    "ar.property86@gmail.com",
    "ads.manager@gmail.com",
    "ibrahima7group@gmail.com",
    "mt6.a7group@gmail.com",
    "khadijafrom7g@gmail.com",
    "saadfroma7group@gmail.com",
    "hra7grouprealestate@gmail.com",
    "sha.a7group@gmail.com",
    "abdul.sattar@a7grouprealestate.com",
  ].map((email) => email.toLowerCase())
);

/** Team / Agent Daily Report only — no other Property Listing sections. */
const DAILY_REPORT_ONLY_IDS = new Set(["2297"]); // Javeria bibi
const DAILY_REPORT_ONLY_EMAILS = new Set(
  ["javeriabibi.a7group@gmail.com"].map((email) => email.toLowerCase())
);

export const LISTING_ACCESS_DENIED = "You do not have access to Property Listing New.";
export const DAILY_REPORT_ONLY_DENIED = "Your access is limited to Listing Infographics (TL agent report) only.";

export const DESK_ACCESS_FULL = "full";
export const DESK_ACCESS_DAILY_REPORT = "daily_report";
export const DESK_ACCESS_SECTIONS = "sections";

function normEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normId(value) {
  return String(value || "").trim();
}

/** Bitrix portal admin (user.admin.json). Accepts bool / 1 / "true". */
export function isBitrixAdmin(user) {
  const v = user?.admin;
  if (v === true || v === 1) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "y";
}

export function isDailyReportOnlyUser(user) {
  if (!user) return false;
  if (DAILY_REPORT_ONLY_IDS.has(normId(user.id))) return true;
  return DAILY_REPORT_ONLY_EMAILS.has(normEmail(user.email));
}

export function hasFullListingDesk(user) {
  if (!user) return false;
  if (isBitrixAdmin(user)) return true;
  if (isDailyReportOnlyUser(user)) return false;
  if (ALLOWED_IDS.has(normId(user.id))) return true;
  return ALLOWED_EMAILS.has(normEmail(user.email));
}

export function deskAccess(user) {
  if (isBitrixAdmin(user)) return DESK_ACCESS_FULL;
  if (isDailyReportOnlyUser(user)) return DESK_ACCESS_DAILY_REPORT;
  if (hasFullListingDesk(user)) return DESK_ACCESS_FULL;
  return "";
}

/** Anyone who may open the Property Listing app at all (full desk or report-only). */
export function canUseListingDesk(user) {
  return Boolean(deskAccess(user));
}

const DAILY_REPORT_API = new Set([
  "GET /api/auth/me",
  "POST /api/auth/logout",
  "GET /api/crm-intelligence/agents",
  "POST /api/crm-intelligence/agents",
  "POST /api/crm-intelligence/daily-report",
  "POST /api/crm-intelligence/agent-month",
  "POST /api/crm-intelligence/agent-month/pdf",
  "POST /api/crm-intelligence/office-shares",
  "POST /api/crm-intelligence/daily-report/pdf",
  "GET /api/crm-intelligence/daily-report/notes",
  "PUT /api/crm-intelligence/daily-report/notes",
]);

export function isDailyReportApiAllowed(method, path) {
  const verb = String(method || "GET").toUpperCase();
  const clean = String(path || "").split("?")[0].replace(/\/$/, "") || "/";
  return DAILY_REPORT_API.has(`${verb} ${clean}`);
}

export function withDeskAccess(user) {
  if (!user) return user;
  const access = deskAccess(user);
  // Never upgrade a report-only user to full. Unknown empty access stays empty.
  return {
    ...user,
    deskAccess: access,
    reportOnly: access === DESK_ACCESS_DAILY_REPORT,
  };
}
