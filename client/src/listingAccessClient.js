/** Client-side mirror of report-only desk access (Javeria bibi). */
const REPORT_ONLY_IDS = new Set(["2297"]);
const REPORT_ONLY_EMAILS = new Set(["javeriabibi.a7group@gmail.com"]);

export function isDailyReportOnlyClient(user) {
  if (!user) return false;
  if (user.deskAccess === "daily_report" || user.reportOnly === true) return true;
  if (REPORT_ONLY_IDS.has(String(user.id || "").trim())) return true;
  return REPORT_ONLY_EMAILS.has(String(user.email || "").trim().toLowerCase());
}
