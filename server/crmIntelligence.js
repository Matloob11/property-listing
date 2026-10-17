import { clearLeadBreakdownCache, finalizeLeadBreakdown, LEAD_BREAKDOWN_SELECT } from "./crmLeadBreakdown.js";
import { optionSentChatKey, optionSentChatLists, optionSentStageChange, passwordOk, phonesFromLead, rememberOptionSentChats, unlockOptionSentChats } from "./optionSentWhatsapp.js";

export const CACHE_MS = 15 * 60 * 1000;
export const PERIODS = [
  "All Time",
  "Today",
  "Last 7 Days",
  "Last 30 Days",
  "Last 90 Days",
  "This Month",
  "Last Month",
  "This Quarter",
  "This Year",
  "Custom",
];
export const LEAD_FUNNEL_NAMES = [
  "New Lead",
  "Assigned",
  "No name",
  "AI Qualified",
  "Not interested",
  "Contacted / In Progress",
  "No Answer",
  "Old Leads Before 6 Months",
  "Option Sent",
  "Meeting / Viewing Scheduled",
  "Meeting / Viewing Done",
  "Future Prospect",
  "Booking",
  "Junk Lead",
];
export const DEAL_FUNNEL_NAMES = [
  "New Booking",
  "Initial",
  "Active Contract",
  "Due in 90 Days",
  "Due in 60 Days",
  "Due in 30 Days",
  "Due in 15 Days",
  "Due in 7 Days",
  "Overdue",
];

const READ_METHODS = new Set([
  "crm.lead.list",
  "crm.lead.fields",
  "crm.deal.list",
  "crm.activity.list",
  "crm.status.list",
  "user.get",
  "user.search",
  "department.get",
  "crm.item.list",
  "crm.item.fields",
  "crm.stagehistory.list",
  "crm.timeline.comment.list",
  "batch",
]);

const memory = new Map();
const inflight = new Map();

export function assertReadMethod(method) {
  const name = String(method || "").trim();
  if (!READ_METHODS.has(name) || /(^|\.)(add|update|delete|import)$/i.test(name)) {
    throw new Error("blocked_write");
  }
  return name;
}

export function normalizePeriod(value) {
  const label = String(value || "").trim();
  if (label === "Custom" || !PERIODS.includes(label)) return "Last 30 Days";
  return label;
}

export function normalizeAgentId(value) {
  const id = String(value || "").replace(/\D/g, "");
  return /^\d+$/.test(id) && Number(id) > 0 ? id : "";
}

export function normalizeFilterId(value) {
  const id = String(value || "").trim();
  return id && id !== "0" ? id : "";
}

export function ownerFilters(agentId) {
  const id = normalizeAgentId(agentId);
  return id ? { ASSIGNED_BY_ID: id } : {};
}

/** Lead/deal Bitrix filters from toolbar Source + Lead Type (status). */
export function crmScopeFilters({ sourceId, statusId, forDeals = false } = {}) {
  const filter = {};
  const source = normalizeFilterId(sourceId);
  const status = normalizeFilterId(statusId);
  if (source) filter.SOURCE_ID = source;
  if (status && !forDeals) filter.STATUS_ID = status;
  return filter;
}

export function cacheKey(period, agentId, { departmentId = "", sourceId = "", statusId = "" } = {}, now = new Date()) {
  const range = periodRange(period, now);
  const day = String(range.to || range.from || "all").slice(0, 10) || "all";
  const dept = normalizeFilterId(departmentId) || "-";
  const source = normalizeFilterId(sourceId) || "-";
  const status = normalizeFilterId(statusId) || "-";
  return `v10:${normalizePeriod(period)}:${day}:${normalizeAgentId(agentId) || "all"}:${dept}:${source}:${status}`;
}

export function userInDepartment(user, departmentId) {
  const want = normalizeFilterId(departmentId);
  if (!want) return true;
  const raw = user?.UF_DEPARTMENT ?? user?.uf_department ?? [];
  const ids = Array.isArray(raw) ? raw : [raw];
  return ids.some((id) => String(id) === want);
}

export const HISTORY_MAX_PAGES = 20;
export const HISTORY_ALL_TIME_PAGES = 12;
const LEAD_HISTORY_SELECT = [...LEAD_BREAKDOWN_SELECT, "ASSIGNED_BY_ID"];
const DEAL_HISTORY_SELECT = ["ID", "TITLE", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID", "DATE_CREATE", "STAGE_SEMANTIC_ID", "ASSIGNED_BY_ID"];
const IDLE_STATUSES = new Set(["new", "newlead", "assigned", "noname"]);

export function scopeUsers(users, agentId) {
  const id = normalizeAgentId(agentId);
  if (!id) return (users || []).slice(0, 25);
  const found = (users || []).find((row) => String(row.ID) === id);
  return [found || { ID: id, NAME: "Agent" }];
}

export function normLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function findStatus(rows, name) {
  const want = normLabel(name);
  return (rows || []).find((row) => normLabel(row?.NAME) === want || normLabel(row?.STATUS_ID) === want) || null;
}

export function junkStatusIds(rows) {
  return (rows || [])
    .filter((row) => /junk/.test(normLabel(row?.NAME)) || /junk/.test(normLabel(row?.STATUS_ID)))
    .map((row) => String(row.STATUS_ID));
}

export function conversionRate(converted, total) {
  const all = Number(total) || 0;
  if (all <= 0) return 0;
  return Math.round(((Number(converted) || 0) / all) * 1000) / 10;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function dubaiYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function addDays(y, m, d, delta) {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function dayStamp({ y, m, d }, end) {
  return `${y}-${pad(m)}-${pad(d)} ${end ? "23:59:59" : "00:00:00"}`;
}

export function periodRange(label, now = new Date()) {
  const period = normalizePeriod(label);
  const today = dubaiYmd(now);
  if (period === "All Time") return { period, from: "", to: "" };
  if (period === "Today") return { period, from: dayStamp(today, false), to: dayStamp(today, true) };
  if (period === "Last 7 Days") {
    return { period, from: dayStamp(addDays(today.y, today.m, today.d, -6), false), to: dayStamp(today, true) };
  }
  if (period === "Last 90 Days") {
    return { period, from: dayStamp(addDays(today.y, today.m, today.d, -89), false), to: dayStamp(today, true) };
  }
  if (period === "This Month") {
    return { period, from: dayStamp({ y: today.y, m: today.m, d: 1 }, false), to: dayStamp(today, true) };
  }
  if (period === "Last Month") {
    const firstThis = { y: today.y, m: today.m, d: 1 };
    const lastPrev = addDays(firstThis.y, firstThis.m, firstThis.d, -1);
    return {
      period,
      from: dayStamp({ y: lastPrev.y, m: lastPrev.m, d: 1 }, false),
      to: dayStamp(lastPrev, true),
    };
  }
  if (period === "This Quarter") {
    const qStart = Math.floor((today.m - 1) / 3) * 3 + 1;
    return { period, from: dayStamp({ y: today.y, m: qStart, d: 1 }, false), to: dayStamp(today, true) };
  }
  if (period === "This Year") {
    return { period, from: dayStamp({ y: today.y, m: 1, d: 1 }, false), to: dayStamp(today, true) };
  }
  return { period, from: dayStamp(addDays(today.y, today.m, today.d, -29), false), to: dayStamp(today, true) };
}

export function dateFilter(from, to, field = "DATE_CREATE") {
  const filter = {};
  if (from) filter[`>=${field}`] = from;
  if (to) filter[`<=${field}`] = to;
  return filter;
}

/** CRM lead list dates are Dubai calendar days. Bitrix stores DATE_CREATE in UTC. */
function leadCreatedFilter(from, to) {
  const match = (stamp) => /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(stamp || "").trim());
  const toUtc = (stamp) => {
    const parts = match(stamp);
    if (!parts) return stamp || "";
    const utc = new Date(Date.UTC(
      Number(parts[1]),
      Number(parts[2]) - 1,
      Number(parts[3]),
      Number(parts[4]) - 4,
      Number(parts[5]),
      Number(parts[6]),
    ));
    const pad = (value) => String(value).padStart(2, "0");
    return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())} ${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:${pad(utc.getUTCSeconds())}`;
  };
  return dateFilter(from ? toUtc(from) : "", to ? toUtc(to) : "");
}

export function encodeListCmd(method, filter = {}) {
  const name = assertReadMethod(method);
  if (name === "batch") throw new Error("blocked_write");
  const query = new URLSearchParams();
  query.set("select[0]", "ID");
  query.set("start", "0");
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(`filter[${key}]`, String(value));
  }
  return `${name}?${query.toString()}`;
}

export function parseBatchTotals(body) {
  const root = body?.result && typeof body.result === "object" ? body.result : body || {};
  return {
    totals: root.result_total && typeof root.result_total === "object" ? root.result_total : {},
    errors: root.result_error && typeof root.result_error === "object" ? root.result_error : {},
  };
}

function asList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.result)) return result.result;
  if (result && typeof result === "object" && (result.ID || result.id)) return [result];
  return [];
}

function isActiveUser(row) {
  const active = String(row?.ACTIVE ?? "Y").toUpperCase();
  return active !== "N" && active !== "FALSE" && active !== "0";
}

async function listActiveUsers(post, sleep, { max = 500, onlyId = "" } = {}) {
  const users = [];
  const seen = new Set();
  const id = normalizeAgentId(onlyId);
  async function pull(params) {
    for (let start = 0; start < max; start += 50) {
      const body = await post("user.get", id ? { ID: id } : { ...params, start });
      const rows = asList(body?.result);
      for (const row of rows) {
        const rowId = String(row?.ID || row?.id || "").trim();
        if (!rowId || seen.has(rowId) || !isActiveUser(row) || !personName(row)) continue;
        seen.add(rowId);
        users.push(row);
      }
      if (id || rows.length < 50) break;
      if (sleep) await sleep(150);
    }
  }
  if (id) {
    await pull({});
    return users;
  }
  await pull({ FILTER: { ACTIVE: true } });
  if (!users.length) await pull({ FILTER: { ACTIVE: "Y" } });
  if (!users.length) await pull({});
  return users;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function statusNameMap(rows) {
  return new Map((rows || []).map((row) => [String(row?.STATUS_ID || ""), String(row?.NAME || row?.STATUS_ID || "")]));
}

export function isIdleLeadStatus(statusId, statusNames) {
  const idNorm = normLabel(statusId);
  const nameNorm = normLabel(
    (statusNames instanceof Map ? statusNames.get(String(statusId || "")) : "") || statusId
  );
  return IDLE_STATUSES.has(idNorm) || IDLE_STATUSES.has(nameNorm);
}

/**
 * Real work only — not "just assigned".
 * Assignment bumps DATE_MODIFY in Bitrix, so modify-alone must NOT count as worked
 * while status is still New / Assigned / No name.
 */
export function leadTouched(row, statusNames) {
  const semantic = String(row?.STATUS_SEMANTIC_ID || "").toUpperCase();
  if (semantic === "S" || semantic === "F") return true;
  if (isIdleLeadStatus(row?.STATUS_ID, statusNames)) return false;
  const created = Date.parse(String(row?.DATE_CREATE || "").replace(" ", "T"));
  const modified = Date.parse(String(row?.DATE_MODIFY || "").replace(" ", "T"));
  if (Number.isFinite(created) && Number.isFinite(modified) && modified - created > 2 * 60 * 1000) return true;
  return Boolean(normLabel(row?.STATUS_ID));
}

export function mapLeadHistory(row, statusNames, sourceNames, { forceWorked = false } = {}) {
  const title = String(row?.TITLE || "").trim()
    || personName(row)
    || "Lead";
  return {
    id: String(row?.ID || ""),
    title,
    contactName: personName(row),
    assignedById: normalizeAgentId(row?.ASSIGNED_BY_ID),
    status: statusNames.get(String(row?.STATUS_ID || "")) || String(row?.STATUS_ID || ""),
    source: sourceNames.get(String(row?.SOURCE_ID || "")) || String(row?.SOURCE_ID || "—"),
    created: String(row?.DATE_CREATE || ""),
    modified: String(row?.DATE_MODIFY || ""),
    worked: forceWorked || leadTouched(row, statusNames),
  };
}

export function mapDealHistory(row, stageNames) {
  return {
    id: String(row?.ID || ""),
    title: String(row?.TITLE || "Deal").trim(),
    assignedById: normalizeAgentId(row?.ASSIGNED_BY_ID),
    stage: stageNames.get(String(row?.STAGE_ID || "")) || String(row?.STAGE_ID || ""),
    amount: num(row?.OPPORTUNITY),
    currency: String(row?.CURRENCY_ID || "AED"),
    created: String(row?.DATE_CREATE || ""),
    outcome: String(row?.STAGE_SEMANTIC_ID || "").toUpperCase() === "S" ? "Won" : String(row?.STAGE_SEMANTIC_ID || "").toUpperCase() === "F" ? "Lost" : "Open",
  };
}

/** Keep only rows that Bitrix says belong to this agent (defense if filter is ignored). */
export function filterRowsForAgent(rows, agentId) {
  const id = normalizeAgentId(agentId);
  if (!id) return [];
  return (rows || []).filter((row) => {
    const owner = normalizeAgentId(row?.ASSIGNED_BY_ID ?? row?.assignedById ?? row?.RESPONSIBLE_ID);
    if (!owner) return true; // field omitted — query already scoped by ASSIGNED_BY_ID/RESPONSIBLE_ID
    return owner === id;
  });
}

export function classifyAgentHistory({
  createdLeads = [],
  touchedLeads = [],
  deals = [],
  leadStatuses = [],
  dealStages = [],
  sources = [],
  agentId = "",
  activityLeadIds = [],
} = {}) {
  const statusNames = statusNameMap(leadStatuses);
  const sourceNames = statusNameMap(sources);
  const stageNames = statusNameMap(dealStages);
  const id = normalizeAgentId(agentId);
  const created = id ? filterRowsForAgent(createdLeads, id) : createdLeads;
  const touched = id ? filterRowsForAgent(touchedLeads, id) : touchedLeads;
  const dealRows = id ? filterRowsForAgent(deals, id) : deals;
  const workedByActivity = new Set(
    (activityLeadIds || []).map((value) => String(value || "").replace(/\D/g, "")).filter(Boolean)
  );
  const worked = new Map();
  for (const row of touched) {
    const forceWorked = workedByActivity.has(String(row?.ID || ""));
    const item = mapLeadHistory(row, statusNames, sourceNames, { forceWorked });
    if (item.id && item.worked) worked.set(item.id, item);
  }
  const idle = [];
  for (const row of created) {
    const forceWorked = workedByActivity.has(String(row?.ID || ""));
    const item = mapLeadHistory(row, statusNames, sourceNames, { forceWorked });
    if (!item.id) continue;
    if (item.worked || worked.has(item.id)) {
      if (!worked.has(item.id)) worked.set(item.id, { ...item, worked: true });
      continue;
    }
    idle.push(item);
  }
  // Activities on leads assigned this period but not in created/touched pages yet
  for (const leadId of workedByActivity) {
    if (worked.has(leadId) || idle.some((row) => row.id === leadId)) continue;
    worked.set(leadId, {
      id: leadId,
      title: `Lead #${leadId}`,
      contactName: "",
      assignedById: id,
      status: "Activity in period",
      source: "—",
      created: "",
      modified: "",
      worked: true,
    });
  }
  return {
    worked: [...worked.values()],
    idle,
    deals: dealRows.map((row) => mapDealHistory(row, stageNames)).filter((row) => row.id),
  };
}

export async function listFilteredPages({
  post,
  sleep,
  method,
  filter,
  select,
  maxPages = HISTORY_MAX_PAGES,
} = {}) {
  assertReadMethod(method);
  const rows = [];
  let calls = 0;
  let start = 0;
  let expectedTotal = null;
  for (let page = 0; page < maxPages; page += 1) {
    const body = await post(method, {
      filter,
      select,
      order: { ID: "DESC" },
      start,
    });
    calls += 1;
    const chunk = asList(body?.result);
    rows.push(...chunk);
    if (expectedTotal == null && body?.total != null) expectedTotal = Number(body.total) || null;
    const next = body?.next;
    if (next == null || chunk.length === 0) {
      return { rows, truncated: expectedTotal != null ? rows.length < expectedTotal : false, calls };
    }
    if (page === maxPages - 1) return { rows, truncated: true, calls };
    start = next;
    if (sleep) await sleep(120);
  }
  return { rows, truncated: true, calls };
}

export async function loadAgentHistory({
  post,
  sleep,
  agentId,
  from,
  to,
  period,
  leadStatuses,
  dealStages,
  sources,
  sourceId = "",
  statusId = "",
  activityLeadIds = [],
} = {}) {
  const id = normalizeAgentId(agentId);
  if (!id) return { worked: [], idle: [], deals: [], truncated: false, calls: 0 };
  const maxPages = period === "All Time" ? HISTORY_ALL_TIME_PAGES : HISTORY_MAX_PAGES;
  const owner = ownerFilters(id);
  const leadExtra = crmScopeFilters({ sourceId, statusId, forDeals: false });
  const dealExtra = crmScopeFilters({ sourceId, statusId, forDeals: true });
  const created = { ...leadCreatedFilter(from, to), ...owner, ...leadExtra };
  const modified = { ...dateFilter(from, to, "DATE_MODIFY"), ...owner, ...leadExtra };
  const dealCreated = { ...dateFilter(from, to), ...owner, ...dealExtra };
  const createdList = await listFilteredPages({ post, sleep, method: "crm.lead.list", filter: created, select: LEAD_HISTORY_SELECT, maxPages });
  const touchedList = await listFilteredPages({ post, sleep, method: "crm.lead.list", filter: modified, select: LEAD_HISTORY_SELECT, maxPages });
  const dealList = await listFilteredPages({ post, sleep, method: "crm.deal.list", filter: dealCreated, select: DEAL_HISTORY_SELECT, maxPages });
  const classified = classifyAgentHistory({
    createdLeads: createdList.rows,
    touchedLeads: touchedList.rows,
    deals: dealList.rows,
    leadStatuses,
    dealStages,
    sources,
    agentId: id,
    activityLeadIds,
  });
  return {
    ...classified,
    createdRows: filterRowsForAgent(createdList.rows, id),
    createdTruncated: Boolean(createdList.truncated),
    truncated: createdList.truncated || touchedList.truncated || dealList.truncated,
    calls: createdList.calls + touchedList.calls + dealList.calls,
  };
}

function personName(row) {
  return [row?.NAME, row?.LAST_NAME].map((part) => String(part || "").trim()).filter(Boolean).join(" ")
    || String(row?.EMAIL || "").trim()
    || `User ${row?.ID || ""}`.trim();
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function retryableBitrix(status, detail) {
  return status === 429 || status >= 500 || /too many|query_limit|429/i.test(String(detail || ""));
}

async function defaultPost(method, params, attempt = 0) {
  assertReadMethod(method);
  const webhook = String(process.env.BITRIX_WEBHOOK || "").trim().replace(/\/$/, "");
  if (!webhook) {
    const error = new Error("Bitrix webhook is not configured");
    error.status = 503;
    throw error;
  }
  const res = await fetch(`${webhook}/${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  const detail = body?.error_description || body?.error || text.slice(0, 160) || "Bitrix request failed";
  if ((!res.ok || body?.error) && attempt < 2 && retryableBitrix(res.status, detail)) {
    await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    return defaultPost(method, params, attempt + 1);
  }
  if (!res.ok || body?.error) throw new Error(String(detail).slice(0, 180));
  return body;
}

export async function crmRead(method, params) {
  return defaultPost(method, params);
}

async function runBatches(cmds, post, sleep) {
  const totals = {};
  let calls = 0;
  for (const group of chunk(Object.entries(cmds), 40)) {
    const cmd = Object.fromEntries(group);
    const body = await post("batch", { halt: 0, cmd });
    calls += 1;
    const parsed = parseBatchTotals(body);
    Object.assign(totals, parsed.totals);
    if (sleep) await sleep(250);
  }
  return { totals, calls };
}

export function buildCountCmds({
  from,
  to,
  leadStatuses,
  dealStages,
  sources,
  users,
  includeActivity,
  agentId,
  sourceId = "",
  statusId = "",
}) {
  const owner = ownerFilters(agentId);
  const leadExtra = crmScopeFilters({ sourceId, statusId, forDeals: false });
  const dealExtra = crmScopeFilters({ sourceId, statusId, forDeals: true });
  const created = { ...leadCreatedFilter(from, to), ...owner, ...leadExtra };
  const modified = { ...dateFilter(from, to, "DATE_MODIFY"), ...owner, ...leadExtra };
  const dealCreated = { ...dateFilter(from, to), ...owner, ...dealExtra };
  const scoped = scopeUsers(users, agentId);
  const fixedStatus = normalizeFilterId(statusId);
  const fixedSource = normalizeFilterId(sourceId);
  const cmds = {
    lead_total: encodeListCmd("crm.lead.list", created),
    lead_progress: encodeListCmd("crm.lead.list", { ...created, STATUS_SEMANTIC_ID: "P" }),
    lead_converted: encodeListCmd("crm.lead.list", { ...created, STATUS_SEMANTIC_ID: "S" }),
    deal_total: encodeListCmd("crm.deal.list", dealCreated),
    deal_progress: encodeListCmd("crm.deal.list", { ...dealCreated, STAGE_SEMANTIC_ID: "P" }),
    deal_won: encodeListCmd("crm.deal.list", { ...dealCreated, STAGE_SEMANTIC_ID: "S" }),
    deal_lost: encodeListCmd("crm.deal.list", { ...dealCreated, STAGE_SEMANTIC_ID: "F" }),
  };
  junkStatusIds(leadStatuses).forEach((id, index) => {
    if (fixedStatus && fixedStatus !== String(id)) return;
    cmds[`lead_junk_${index}`] = encodeListCmd("crm.lead.list", { ...created, STATUS_ID: id });
  });
  for (const name of LEAD_FUNNEL_NAMES) {
    const row = findStatus(leadStatuses, name);
    if (!row) continue;
    if (fixedStatus && fixedStatus !== String(row.STATUS_ID)) continue;
    cmds[`lf_${normLabel(name)}`] = encodeListCmd("crm.lead.list", { ...created, STATUS_ID: row.STATUS_ID });
  }
  for (const name of DEAL_FUNNEL_NAMES) {
    const row = findStatus(dealStages, name);
    if (row) cmds[`df_${normLabel(name)}`] = encodeListCmd("crm.deal.list", { ...dealCreated, STAGE_ID: row.STATUS_ID });
  }
  for (const source of sources.slice(0, 20)) {
    const id = String(source.STATUS_ID || "");
    if (!id) continue;
    if (fixedSource && fixedSource !== id) continue;
    cmds[`src_${id}`] = encodeListCmd("crm.lead.list", { ...created, SOURCE_ID: id });
    cmds[`srcj_${id}`] = encodeListCmd("crm.lead.list", { ...created, SOURCE_ID: id, STATUS_ID: junkStatusIds(leadStatuses)[0] || "JUNK" });
    cmds[`srcc_${id}`] = encodeListCmd("crm.lead.list", { ...created, SOURCE_ID: id, STATUS_SEMANTIC_ID: "S" });
  }
  scoped.forEach((user, index) => {
    const id = String(user.ID || "");
    if (!id) return;
    cmds[`aw_${id}`] = encodeListCmd("crm.lead.list", { ...modified, ASSIGNED_BY_ID: id });
    cmds[`nl_${id}`] = encodeListCmd("crm.lead.list", { ...created, ASSIGNED_BY_ID: id });
    if (includeActivity && (normalizeAgentId(agentId) || index < 10)) {
      cmds[`am_${id}`] = encodeListCmd("crm.activity.list", { ...dateFilter(from, to, "CREATED"), RESPONSIBLE_ID: id, TYPE_ID: 1 });
      cmds[`aa_${id}`] = encodeListCmd("crm.activity.list", { ...dateFilter(from, to, "CREATED"), RESPONSIBLE_ID: id });
    }
  });
  return cmds;
}

export function assembleReport({
  period,
  from,
  to,
  totals,
  leadStatuses,
  dealStages,
  sources,
  users,
  includeActivity,
  calls,
  checkedAt,
  agentId,
  history,
  leadDetails,
  departmentId = "",
  sourceId = "",
  statusId = "",
  optionSentWhatsapp = null,
}) {
  const scoped = scopeUsers(users, agentId);
  const agent = scoped.length === 1 && normalizeAgentId(agentId) ? scoped[0] : null;
  const junk = junkStatusIds(leadStatuses).reduce((sum, _id, index) => sum + num(totals[`lead_junk_${index}`]), 0);
  const leadTotal = num(totals.lead_total);
  const converted = num(totals.lead_converted);
  const won = num(totals.deal_won);
  const activity = scoped.map((user) => {
    const id = String(user.ID || "");
    const leadsWorked = num(totals[`aw_${id}`]);
    const totalActs = includeActivity ? num(totals[`aa_${id}`]) : null;
    return {
      id,
      name: personName(user),
      leadsWorked,
      meetings: includeActivity ? num(totals[`am_${id}`]) : null,
      comments: null,
      total: totalActs,
      avg: leadsWorked > 0 && totalActs != null ? Math.round((totalActs / leadsWorked) * 10) / 10 : null,
    };
  }).filter((row) => row.leadsWorked || row.total).sort((a, b) => (b.total || b.leadsWorked) - (a.total || a.leadsWorked));

  return {
    ok: true,
    cached: false,
    period,
    agentId: normalizeAgentId(agentId),
    agentName: agent ? personName(agent) : "",
    departmentId: normalizeFilterId(departmentId),
    sourceId: normalizeFilterId(sourceId),
    statusId: normalizeFilterId(statusId),
    from,
    to,
    checkedAt,
    checkedAtIso: new Date(checkedAt).toISOString(),
    cacheUntil: checkedAt + CACHE_MS,
    calls,
    note: normalizeAgentId(agentId)
      ? `Read-only Bitrix. ${history?.truncated ? "History capped at latest pages — pick a shorter period for the rest." : "Agent lead/deal history loaded for this period."}`
      : includeActivity
        ? "Read-only Bitrix counts. Activity rows were not downloaded."
        : "Read-only Bitrix counts. Per-agent activity totals skipped for All Time.",
    history: normalizeAgentId(agentId)
      ? {
          worked: history?.worked || [],
          idle: history?.idle || [],
          deals: history?.deals || [],
          truncated: Boolean(history?.truncated),
        }
      : null,
    leadDetails: normalizeAgentId(agentId)
      ? leadDetails
        ? { ...leadDetails, expectedTotal: leadTotal }
        : null
      : null,
    leads: {
      total: leadTotal,
      inProgress: num(totals.lead_progress),
      converted,
      conversionRate: conversionRate(converted, leadTotal),
      junk,
    },
    deals: {
      total: num(totals.deal_total),
      inProgress: num(totals.deal_progress),
      won,
      lost: num(totals.deal_lost),
      revenue: won === 0 ? 0 : null,
    },
    leadFunnel: LEAD_FUNNEL_NAMES.map((name) => ({
      name,
      count: num(totals[`lf_${normLabel(name)}`]),
      statusId: findStatus(leadStatuses, name)?.STATUS_ID || "",
    })),
    optionSentWhatsapp,
    dealFunnel: DEAL_FUNNEL_NAMES.map((name) => ({
      name,
      count: num(totals[`df_${normLabel(name)}`]),
      statusId: findStatus(dealStages, name)?.STATUS_ID || "",
    })),
    activity,
    response: scoped.map((user) => {
      const id = String(user.ID || "");
      return {
        id,
        name: personName(user),
        newLeads: num(totals[`nl_${id}`]),
        c5: null,
        c30: null,
        never: null,
        avg: null,
      };
    }).filter((row) => row.newLeads).sort((a, b) => b.newLeads - a.newLeads),
    sources: sources.slice(0, 20).map((source) => {
      const id = String(source.STATUS_ID || "");
      const leads = num(totals[`src_${id}`]);
      const conv = num(totals[`srcc_${id}`]);
      return {
        id,
        name: String(source.NAME || id),
        leads,
        meetings: null,
        deals: conv,
        conversionRate: conversionRate(conv, leads),
        junk: num(totals[`srcj_${id}`]),
      };
    }).filter((row) => row.leads).sort((a, b) => b.leads - a.leads),
  };
}

async function loadMeta(post, agentId) {
  const id = normalizeAgentId(agentId);
  const [leadBody, dealBody, sourceBody, users] = await Promise.all([
    post("crm.status.list", { filter: { ENTITY_ID: "STATUS" } }),
    post("crm.status.list", { filter: { ENTITY_ID: "DEAL_STAGE" } }),
    post("crm.status.list", { filter: { ENTITY_ID: "SOURCE" } }),
    listActiveUsers(post, null, { max: 50, onlyId: id }),
  ]);
  return {
    leadStatuses: asList(leadBody?.result),
    dealStages: asList(dealBody?.result),
    sources: asList(sourceBody?.result),
    users,
    calls: 4,
  };
}

async function askAllOptionChats(agentId, agentName, tails) {
  const token = String(process.env.A7_WA_LOOKUP_TOKEN || "").trim();
  const url = String(process.env.A7_WA_LOOKUP_URL || "http://127.0.0.1:8100/api/inbox/option-sent-chats/").trim();
  if (!token || !url) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-A7-Wa-Lookup": token },
    body: JSON.stringify({ bitrixUserId: String(agentId || ""), agentName: String(agentName || ""), tails }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body || !Array.isArray(body.chats)) return null;
  return body;
}

function pakistanIso(stamp) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(stamp || "").trim());
  if (!match) return "";
  const utc = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]) - 5,
    Number(match[5]),
    Number(match[6]),
  ));
  return Number.isNaN(utc.getTime()) ? "" : utc.toISOString();
}

function pakistanDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(date);
}

async function listOptionStageHistory(post, statusId, from, to) {
  const rows = [];
  let start = 0;
  const filter = { STATUS_ID: statusId };
  const startIso = pakistanIso(from);
  const endIso = pakistanIso(to);
  if (startIso) filter[">=CREATED_TIME"] = startIso;
  if (endIso) filter["<=CREATED_TIME"] = endIso;
  for (let page = 0; page < 30; page += 1) {
    const body = await post("crm.stagehistory.list", {
      entityTypeId: 1,
      order: { ID: "DESC" },
      filter,
      start,
    });
    const items = Array.isArray(body?.result?.items) ? body.result.items : [];
    rows.push(...items);
    if (body?.next == null || !items.length) break;
    start = body.next;
  }
  const startDay = String(from || "").slice(0, 10);
  const endDay = String(to || "").slice(0, 10);
  return rows.filter((row) => {
    const day = pakistanDay(row?.CREATED_TIME);
    return day && (!startDay || day >= startDay) && (!endDay || day <= endDay);
  });
}

async function phonesForLeadIds(post, ids) {
  const leads = [];
  const wanted = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < wanted.length; i += 50) {
    const slice = wanted.slice(i, i + 50);
    const body = await post("crm.lead.list", { filter: { ID: slice }, select: ["ID", "PHONE"] });
    const rows = Array.isArray(body?.result) ? body.result : [];
    for (const row of rows) {
      const phones = phonesFromLead(row);
      leads.push({ id: String(row.ID || ""), phones, tails: phones.map((item) => item.tail) });
    }
  }
  return leads;
}

async function stageChangesForLeads(post, leadIds, agentId) {
  const found = new Map();
  const pending = leadIds.filter(Boolean);
  for (const start of [0, 50, 100]) {
    const left = pending.filter((id) => !found.has(id));
    if (!left.length) break;
    for (let i = 0; i < left.length; i += 20) {
      const slice = left.slice(i, i + 20);
      const cmd = {};
      slice.forEach((id, index) => {
        cmd[`c${index}`] = [
          "crm.timeline.comment.list?",
          `filter[ENTITY_ID]=${id}`,
          "filter[ENTITY_TYPE]=lead",
          `filter[AUTHOR_ID]=${agentId}`,
          "order[ID]=DESC",
          "select[0]=AUTHOR_ID",
          "select[1]=CREATED",
          "select[2]=COMMENT",
          `start=${start}`,
        ].join("&");
      });
      const body = await post("batch", { halt: 0, cmd });
      const result = body?.result?.result && typeof body.result.result === "object" ? body.result.result : {};
      for (const [key, payload] of Object.entries(result)) {
        const leadId = slice[Number(String(key).replace(/\D/g, ""))];
        if (!leadId) continue;
        const at = optionSentStageChange(Array.isArray(payload) ? payload : [], agentId);
        if (at) found.set(leadId, at);
      }
    }
  }
  return found;
}

export async function loadOptionSentWhatsapp({
  post,
  sleep,
  agentId,
  agentName,
  from,
  to,
  sourceId = "",
  statusId = "",
  leadStatuses,
} = {}) {
  const option = findStatus(leadStatuses, "Option Sent");
  if (!option) return null;
  const fixed = normalizeFilterId(statusId);
  if (fixed && fixed !== String(option.STATUS_ID)) {
    return { whatsapp: 0, noWhatsapp: 0, onAgent: 0, onOther: 0, noPhone: 0, total: 0, truncated: false, agentNumbers: 0 };
  }
  const filter = { ...leadCreatedFilter(from, to), ...ownerFilters(agentId), STATUS_ID: option.STATUS_ID };
  if (normalizeFilterId(sourceId)) filter.SOURCE_ID = normalizeFilterId(sourceId);
  const history = await listOptionStageHistory(post, option.STATUS_ID, from, to);
  const historyIds = [...new Set(history.map((row) => String(row?.OWNER_ID || "").replace(/\D/g, "")).filter(Boolean))];
  const changes = await stageChangesForLeads(post, historyIds, agentId);
  let leadIds = [...changes.keys()];
  if (!leadIds.length) {
    const listed = await listFilteredPages({
      post,
      sleep,
      method: "crm.lead.list",
      filter,
      select: ["ID"],
      maxPages: HISTORY_MAX_PAGES,
    });
    const fallbackIds = (listed.rows || []).map((row) => String(row.ID || "")).filter(Boolean);
    const fallbackChanges = await stageChangesForLeads(post, fallbackIds, agentId);
    leadIds = [...fallbackChanges.keys()];
  }
  const leads = await phonesForLeadIds(post, leadIds);
  const tails = [...new Set(leads.flatMap((lead) => lead.tails))];
  const match = tails.length ? await askAllOptionChats(agentId, agentName, tails) : { chats: [] };
  if (!match) return { unavailable: true, total: leads.length, changed: leads.length, truncated: false };
  const listedChats = optionSentChatLists(leads, match.chats || []).chats;
  const chats = listedChats.map((row) => ({
    phone: row.phone,
    conversationId: Number(row.conversationId),
    agentName: row.agentName || "",
    onAgent: Boolean(row.onAgent),
    leadId: row.leadId,
  }));
  const missingChats = [];
  let noPhone = 0;
  for (const lead of leads) {
    if (!lead.phones.length) {
      noPhone += 1;
      missingChats.push({ phone: "No number", leadId: lead.id, conversationId: 0, onAgent: false });
      continue;
    }
    for (const phone of lead.phones) {
      if (chats.some((row) => row.leadId === lead.id && row.phone === phone.phone)) continue;
      missingChats.push({ phone: phone.phone, leadId: lead.id, conversationId: 0, onAgent: false });
    }
  }
  const full = {
    changed: leads.length,
    whatsapp: chats.length,
    noWhatsapp: missingChats.length,
    onAgent: chats.filter((row) => row.onAgent).length,
    onOther: chats.filter((row) => !row.onAgent).length,
    noPhone,
    total: leads.length,
    chats,
    otherChats: [],
    missingChats,
    truncated: false,
    agentNumbers: Number(match.agentNumbers) || 0,
  };
  const listKey = optionSentChatKey({ agentId, from, to, sourceId, statusId });
  rememberOptionSentChats(listKey, full);
  const { chats: _chats, otherChats: _other, missingChats: _missing, ...counts } = full;
  return { ...counts, listKey };
}

export function readOptionSentNumbers(listKey, password) {
  return unlockOptionSentChats(listKey, password);
}

export async function armWhatsappChat(bitrixUserId, conversationId, password) {
  if (!passwordOk(password)) return false;
  const token = String(process.env.A7_WA_LOOKUP_TOKEN || "").trim();
  const base = String(process.env.A7_WA_LOOKUP_URL || "http://127.0.0.1:8100/api/inbox/option-sent-chats/").trim();
  const url = base.replace(/option-sent-chats\/?$/, "arm-open/");
  if (!token || !url.includes("arm-open")) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-A7-Wa-Lookup": token },
    body: JSON.stringify({ bitrixUserId: String(bitrixUserId || ""), conversationId: Number(conversationId) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return false;
  const body = await res.json().catch(() => null);
  return Boolean(body?.ok);
}

async function buildReport({
  period,
  agentId,
  post,
  sleep,
  db = null,
  departmentId = "",
  sourceId = "",
  statusId = "",
}) {
  const range = periodRange(period);
  const id = normalizeAgentId(agentId);
  const includeActivity = range.period !== "All Time";
  const meta = await loadMeta(post, id);
  const dept = normalizeFilterId(departmentId);
  if (dept) {
    const agentUser = meta.users.find((row) => String(row.ID) === id) || meta.users[0];
    if (!userInDepartment(agentUser, dept)) {
      return assembleReport({
        period: range.period,
        from: range.from,
        to: range.to,
        totals: {},
        leadStatuses: meta.leadStatuses,
        dealStages: meta.dealStages,
        sources: meta.sources,
        users: meta.users,
        includeActivity,
        calls: meta.calls,
        checkedAt: Date.now(),
        agentId: id,
        history: { worked: [], idle: [], deals: [], truncated: false },
        leadDetails: null,
        departmentId: dept,
        sourceId,
        statusId,
      });
    }
  }
  const cmds = buildCountCmds({
    from: range.from,
    to: range.to,
    leadStatuses: meta.leadStatuses,
    dealStages: meta.dealStages,
    sources: meta.sources,
    users: meta.users,
    includeActivity,
    agentId: id,
    sourceId,
    statusId,
  });
  const counted = await runBatches(cmds, post, sleep);
  const history = id
    ? await loadAgentHistory({
        post,
        sleep,
        agentId: id,
        from: range.from,
        to: range.to,
        period: range.period,
        leadStatuses: meta.leadStatuses,
        dealStages: meta.dealStages,
        sources: meta.sources,
        sourceId,
        statusId,
      })
    : { worked: [], idle: [], deals: [], createdRows: [], createdTruncated: false, truncated: false, calls: 0 };
  const leadDetails = id
    ? await finalizeLeadBreakdown({
        post,
        rows: history.createdRows || [],
        truncated: history.createdTruncated,
        calls: 0,
        db,
        sleep,
      }).catch(() => null)
    : null;
  const agent = meta.users.find((row) => String(row.ID) === id);
  const optionSentWhatsapp = id
    ? await loadOptionSentWhatsapp({
        post,
        sleep,
        agentId: id,
        agentName: agent ? personName(agent) : "",
        from: range.from,
        to: range.to,
        sourceId,
        statusId,
        leadStatuses: meta.leadStatuses,
      }).catch(() => ({ unavailable: true }))
    : null;
  return assembleReport({
    period: range.period,
    from: range.from,
    to: range.to,
    totals: counted.totals,
    leadStatuses: meta.leadStatuses,
    dealStages: meta.dealStages,
    sources: meta.sources,
    users: meta.users,
    includeActivity,
    calls: meta.calls + counted.calls + (history.calls || 0) + (leadDetails?.calls || 0),
    checkedAt: Date.now(),
    agentId: id,
    history,
    leadDetails,
    departmentId: dept,
    sourceId,
    statusId,
    optionSentWhatsapp,
  });
}

export function clearCrmIntelligenceCache() {
  memory.clear();
  inflight.clear();
  clearLeadBreakdownCache();
}

function freshAgentCache(value) {
  return Boolean(
    value?.checkedAt &&
    Date.now() - Number(value.checkedAt) < CACHE_MS &&
    Array.isArray(value.agents) &&
    value.agents.length
  );
}

const EXTRA_AGENTS_KEY = "crm_intel_extra_agents";

function mergeAgents(base, extras) {
  const seen = new Set();
  const out = [];
  for (const row of [...(extras || []), ...(base || [])]) {
    const id = String(row?.id || "").trim();
    const name = String(row?.name || "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function extraAgents(db) {
  const rows = db ? await db.getSetting(EXTRA_AGENTS_KEY, []) : [];
  return Array.isArray(rows) ? rows : [];
}

export function scoreAgentName(row, wanted) {
  const have = normLabel(personName(row));
  const need = normLabel(wanted);
  if (!have || !need) return 0;
  if (have === need) return 3;
  if (have.includes(need) || need.includes(have)) return 2;
  return 0;
}

export async function resolveCrmAgent({ post, name, agentId, includeInactive = false } = {}) {
  const id = normalizeAgentId(agentId);
  if (id) {
    // Prefer live user.get by ID so inactive agents still resolve for exact Check.
    try {
      const body = await post("user.get", { ID: id });
      const row = asList(body?.result)[0];
      if (row) {
        return {
          id: String(row.ID || row.id || id),
          name: personName(row) || String(name || "").trim() || `User ${id}`,
          active: isActiveUser(row),
        };
      }
    } catch {
      /* fall through */
    }
    return { id, name: String(name || "").trim() || `User ${id}` };
  }
  const q = String(name || "").replace(/\s+/g, " ").trim();
  if (q.length < 2) return null;
  const parts = q.split(" ");
  const tries = [
    ...(parts.length > 1 ? [["user.get", { FILTER: { NAME: parts[0], LAST_NAME: parts.slice(1).join(" ") } }]] : []),
    ["user.get", { FILTER: { NAME: parts[0] } }],
    ["user.search", { FIND: q }],
    ["user.search", { FILTER: { NAME: parts[0] } }],
  ];
  let best = null;
  let bestScore = 0;
  let bestInactive = null;
  let bestInactiveScore = 0;
  for (const [method, params] of tries) {
    const body = await post(method, params);
    for (const row of asList(body?.result)) {
      const score = scoreAgentName(row, q);
      if (score <= 0) continue;
      const hit = { id: String(row.ID || row.id || ""), name: personName(row), active: isActiveUser(row) };
      if (!hit.id) continue;
      if (isActiveUser(row)) {
        if (score > bestScore) {
          bestScore = score;
          best = hit;
        }
      } else if (includeInactive && score > bestInactiveScore) {
        bestInactiveScore = score;
        bestInactive = hit;
      }
    }
    if (bestScore >= 3) break;
  }
  if (best?.id) return best;
  if (includeInactive && bestInactive?.id && bestInactiveScore >= 2) return bestInactive;
  return null;
}

export async function addCrmIntelligenceAgent({
  db,
  name,
  post = defaultPost,
} = {}) {
  const found = await resolveCrmAgent({ post, name, includeInactive: true });
  if (!found) {
    const error = new Error("This name is not in CRM. Check spelling.");
    error.status = 404;
    throw error;
  }
  const extras = await extraAgents(db);
  if (!extras.some((row) => String(row.id) === found.id)) {
    extras.push({ id: found.id, name: found.name });
    if (db?.setSetting) await db.setSetting(EXTRA_AGENTS_KEY, extras).catch(() => {});
  }
  return { ok: true, agent: { id: found.id, name: found.name, active: found.active !== false } };
}

export async function listCrmIntelligenceAgents({
  db,
  post = defaultPost,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const key = "agents_v2";
  const settingKey = "crm_intel_agents_v2";
  const extras = await extraAgents(db);
  const fresh = memory.get(key) || (db ? await db.getSetting(settingKey, null) : null);
  if (freshAgentCache(fresh)) {
    memory.set(key, fresh);
    return { ...fresh, agents: mergeAgents(fresh.agents, extras), cached: true };
  }
  if (inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const agents = (await listActiveUsers(post, sleep, { max: 500 })).map((row) => ({
      id: String(row.ID || row.id || ""),
      name: personName(row),
    })).filter((row) => row.id && row.name);
    const payload = { ok: true, cached: false, checkedAt: Date.now(), agents: mergeAgents(agents, extras) };
    if (agents.length) {
      memory.set(key, { ...payload, agents });
      if (db?.setSetting) await db.setSetting(settingKey, { ...payload, agents }).catch(() => {});
    }
    return payload;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

function namedRows(rows, idKey = "STATUS_ID") {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const id = String(row?.[idKey] || row?.ID || row?.id || "").trim();
    const name = String(row?.NAME || row?.name || "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function listDepartments(post, sleep) {
  const rows = [];
  try {
    for (let start = 0; start < 200; start += 50) {
      const body = await post("department.get", { start });
      const chunk = asList(body?.result);
      rows.push(...chunk);
      if (chunk.length < 50) break;
      if (sleep) await sleep(150);
    }
  } catch {
    return [];
  }
  return namedRows(rows, "ID");
}

export async function listCrmIntelligenceFilters({
  db,
  post = defaultPost,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const key = "filters_v1";
  const settingKey = "crm_intel_filters_v1";
  const fresh = memory.get(key) || (db ? await db.getSetting(settingKey, null) : null);
  if (fresh?.loaded) {
    memory.set(key, fresh);
    return { ...fresh, cached: true };
  }
  if (inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const [departments, sourceBody, typeBody] = await Promise.all([
      listDepartments(post, sleep),
      post("crm.status.list", { filter: { ENTITY_ID: "SOURCE" } }),
      post("crm.status.list", { filter: { ENTITY_ID: "STATUS" } }),
    ]);
    const payload = {
      ok: true,
      loaded: true,
      cached: false,
      checkedAt: Date.now(),
      departments,
      sources: namedRows(asList(sourceBody?.result)),
      types: namedRows(asList(typeBody?.result)),
    };
    memory.set(key, payload);
    if (db?.setSetting) await db.setSetting(settingKey, payload).catch(() => {});
    return payload;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

export async function checkCrmIntelligence({
  db,
  period,
  agentId,
  agentName,
  departmentId = "",
  sourceId = "",
  statusId = "",
  force = false,
  post = defaultPost,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let id = normalizeAgentId(agentId);
  if (!id && String(agentName || "").trim()) {
    const found = await resolveCrmAgent({ post, name: agentName });
    if (!found) {
      const error = new Error("This name is not in CRM. Add it from the agent box or check spelling.");
      error.status = 404;
      throw error;
    }
    id = found.id;
    if (db?.setSetting) {
      const extras = await extraAgents(db);
      if (!extras.some((row) => String(row.id) === found.id)) {
        extras.push(found);
        await db.setSetting(EXTRA_AGENTS_KEY, extras).catch(() => {});
      }
    }
  }
  if (!id) {
    const error = new Error("Select an agent first — Bitrix is only checked for a named agent.");
    error.status = 400;
    throw error;
  }
  const filters = {
    departmentId: normalizeFilterId(departmentId),
    sourceId: normalizeFilterId(sourceId),
    statusId: normalizeFilterId(statusId),
  };
  const key = cacheKey(period, id, filters);
  const settingKey = `crm_intel_${key}`;
  if (!force) {
    const fresh = memory.get(key) || (db ? await db.getSetting(settingKey, null) : null);
    if (fresh?.checkedAt && Date.now() - Number(fresh.checkedAt) < CACHE_MS) {
      memory.set(key, fresh);
      return { ...fresh, cached: true };
    }
  }
  if (inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    const report = await buildReport({
      period,
      agentId: id,
      post,
      sleep,
      db,
      ...filters,
    });
    memory.set(key, report);
    if (db?.setSetting) await db.setSetting(settingKey, report).catch(() => {});
    return report;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}
