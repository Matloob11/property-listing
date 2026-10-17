/** All-agents month board: closed deals (rent / sale) and option sent, from Bitrix on Check. */
import { crmRead, dateFilter, listCrmIntelligenceAgents, listFilteredPages } from "./crmIntelligence.js";
import { reportRange } from "./agentDailyReport.js";

const memory = new Map();
const CACHE_MS = 10 * 60 * 1000;

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function asRows(body) {
  if (Array.isArray(body?.result?.items)) return body.result.items;
  if (Array.isArray(body?.result)) return body.result;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

function personName(row) {
  return [row?.NAME, row?.LAST_NAME].map((part) => String(part || "").trim()).filter(Boolean).join(" ")
    || String(row?.EMAIL || "").trim()
    || "";
}

function blankRow(id, name) {
  return {
    id,
    name: name || `User ${id}`,
    deals: 0,
    rent: 0,
    sale: 0,
    other: 0,
    optionSent: 0,
    dealIds: [],
    rentIds: [],
    saleIds: [],
    optionIds: [],
  };
}

const LEAD_CLIENT_TYPE = "UF_CRM_1756638760279";
const RENT_CLIENT_TYPE = "1220";
const SALE_CLIENT_TYPE = "972";

function eventDay(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.includes("T")) {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(date);
  }
  return text.slice(0, 10);
}

function createdDay(row) {
  return eventDay(row?.at || row?.DATE_CREATE || row?.dateCreate || "");
}

const BOOKING_DEAL_STAGE = "1";

/** The person who wrote the Stage → Booking line closest to the stage change. */
export function bookingStageAuthor(comments, at) {
  const target = Date.parse(at || "");
  let best = null;
  for (const item of comments || []) {
    const text = String(item?.COMMENT || item?.comment || "");
    if (!/stage\s*:/i.test(text) || !/(?:→|->|–)\s*booking/i.test(text)) continue;
    const author = digits(item?.AUTHOR_ID ?? item?.authorId);
    if (!author) continue;
    const when = Date.parse(item?.CREATED || item?.created || "");
    const delta = Number.isFinite(when) && Number.isFinite(target) ? Math.abs(when - target) : 0;
    if (!best || delta < best.delta) best = { author, delta };
  }
  return best?.author || "";
}

/**
 * A won deal is a lead moved to Booking in this window by the person who changed the stage,
 * or a Booking deal opened in the same window that has a lead. One lead is counted once.
 */
export function confirmedWonDeals({
  history = [],
  commentsByLead = {},
  leadsById = {},
  deals = [],
  from = "",
  to = "",
  bookingStatusId = "CONVERTED",
} = {}) {
  const start = String(from || "").slice(0, 10);
  const end = String(to || "").slice(0, 10);
  const out = [];
  const seen = new Set();
  function inWindow(value) {
    const day = eventDay(value);
    return Boolean(day) && (!start || day >= start) && (!end || day <= end);
  }
  for (const row of history || []) {
    if (String(row?.STATUS_ID || row?.statusId || "") !== String(bookingStatusId)) continue;
    const at = row?.CREATED_TIME || row?.at || "";
    if (!inWindow(at)) continue;
    const leadId = digits(row?.OWNER_ID || row?.leadId);
    if (!leadId || seen.has(leadId)) continue;
    const lead = leadsById[leadId] || {};
    if (String(lead.STATUS_ID || lead.statusId || "") !== String(bookingStatusId)) continue;
    const agentId = bookingStageAuthor(commentsByLead[leadId], at) || digits(lead.ASSIGNED_BY_ID || lead.assignedById);
    if (!agentId) continue;
    seen.add(leadId);
    out.push({
      ID: leadId,
      ASSIGNED_BY_ID: agentId,
      at,
      [LEAD_CLIENT_TYPE]: lead[LEAD_CLIENT_TYPE] ?? lead.clientTypeId ?? "",
    });
  }
  for (const deal of deals || []) {
    const leadId = digits(deal?.LEAD_ID || deal?.leadId);
    const at = deal?.DATE_CREATE || deal?.at || "";
    if (!leadId || seen.has(leadId) || !inWindow(at)) continue;
    const lead = leadsById[leadId] || {};
    if (String(lead.STATUS_ID || lead.statusId || "") !== String(bookingStatusId)) continue;
    const agentId = digits(deal?.ASSIGNED_BY_ID || lead.ASSIGNED_BY_ID);
    if (!agentId) continue;
    seen.add(leadId);
    out.push({
      ID: leadId,
      ASSIGNED_BY_ID: agentId,
      at,
      [LEAD_CLIENT_TYPE]: lead[LEAD_CLIENT_TYPE] ?? lead.clientTypeId ?? "",
    });
  }
  return out;
}
function bookingPurpose(lead) {
  const type = String(lead?.[LEAD_CLIENT_TYPE] ?? lead?.clientTypeId ?? "").replace(/\D/g, "");
  if (type === RENT_CLIENT_TYPE) return "rent";
  if (type === SALE_CLIENT_TYPE) return "sale";
  return "";
}

function bitrixDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

/** Responsible person, then Booking (or Option Sent) stage, then the selected dates.
 * The CRM icon and the table count must stay this same filter. Do not switch
 * the order or replace it with a lead-id list.
 */
function crmStagePath(agentId, from, to, statusId, clientType = "") {
  if (!agentId || !statusId) return "";
  const params = new URLSearchParams();
  params.set("apply_filter", "Y");
  params.set("ASSIGNED_BY_ID", String(agentId));
  params.set("STATUS_ID", String(statusId));
  const dateFrom = bitrixDay(from);
  const dateTo = bitrixDay(to);
  if (dateFrom || dateTo) {
    params.set("DATE_CREATE_datesel", "RANGE");
    if (dateFrom) params.set("DATE_CREATE_from", dateFrom);
    if (dateTo) params.set("DATE_CREATE_to", dateTo);
  }
  if (clientType) params.set(LEAD_CLIENT_TYPE, clientType);
  return `/crm/lead/list/?${params.toString()}`;
}

export function boardRange({ mode = "month", month = "" } = {}, now = new Date()) {
  if (String(mode || "") === "last30") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(now);
    const [y, m, d] = today.split("-").map(Number);
    const start = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    start.setUTCDate(start.getUTCDate() - 30);
    const fromDay = start.toISOString().slice(0, 10);
    return {
      mode: "last30",
      from: `${fromDay} 00:00:00`,
      to: `${today} 23:59:59`,
      label: `Last 30 days · ${fromDay} → ${today}`,
    };
  }
  const range = reportRange({ mode: "month", month });
  if (range.mode !== "month" || !range.from || !range.to) return null;
  return range;
}

/**
 * Count each agent's won bookings and option-sent leads for one window.
 * A won booking is a lead moved to Booking in the window, or a Booking deal in the window that has a lead.
 * Tenant is rent. Buyer is sale.
 * Option sent is a CRM lead in the Option Sent stage, assigned to the agent, opened in the window.
 */
export function tallyAgentMonth({
  agents = [],
  leads = [],
  optionLeads = [],
  bookingStatusId = "",
  optionStatusId = "",
  from = "",
  to = "",
} = {}) {
  const byId = new Map();
  for (const agent of agents || []) {
    const id = digits(agent?.id || agent?.ID);
    if (!id || byId.has(id)) continue;
    byId.set(id, blankRow(id, String(agent?.name || "").trim()));
  }
  function rowFor(id) {
    if (!byId.has(id)) byId.set(id, blankRow(id, ""));
    return byId.get(id);
  }
  const start = String(from || "").slice(0, 10);
  const end = String(to || "").slice(0, 10);
  const seenLeads = new Set();
  for (const lead of leads || []) {
    const day = createdDay(lead);
    if (!day || (start && day < start) || (end && day > end)) continue;
    const id = digits(lead?.ASSIGNED_BY_ID);
    const leadId = digits(lead?.ID || lead?.id);
    if (!id || !leadId || seenLeads.has(`${id}:${leadId}`)) continue;
    seenLeads.add(`${id}:${leadId}`);
    const bucket = rowFor(id);
    bucket.deals += 1;
    bucket.dealIds.push(leadId);
    const purpose = bookingPurpose(lead);
    if (purpose) {
      bucket[purpose] += 1;
      bucket[purpose === "rent" ? "rentIds" : "saleIds"].push(leadId);
    }
  }
  const seenOptions = new Set();
  for (const lead of optionLeads || []) {
    const day = createdDay(lead);
    if (!day || (start && day < start) || (end && day > end)) continue;
    const id = digits(lead?.ASSIGNED_BY_ID);
    const leadId = digits(lead?.ID || lead?.id);
    if (!id || !leadId || seenOptions.has(`${id}:${leadId}`)) continue;
    seenOptions.add(`${id}:${leadId}`);
    const bucket = rowFor(id);
    bucket.optionSent += 1;
    bucket.optionIds.push(leadId);
  }
  for (const row of byId.values()) {
    row.rentPath = row.rent ? crmStagePath(row.id, from, to, bookingStatusId, RENT_CLIENT_TYPE) : "";
    row.salePath = row.sale ? crmStagePath(row.id, from, to, bookingStatusId, SALE_CLIENT_TYPE) : "";
    row.dealsPath = row.deals ? crmStagePath(row.id, from, to, bookingStatusId) : "";
    row.optionPath = row.optionSent ? crmStagePath(row.id, from, to, optionStatusId) : "";
    delete row.dealIds;
    delete row.rentIds;
    delete row.saleIds;
    delete row.optionIds;
  }
  const rows = [...byId.values()].filter((row) => row.deals > 0 || row.optionSent > 0).sort((a, b) => (
    b.deals - a.deals
    || b.rent - a.rent
    || b.sale - a.sale
    || b.optionSent - a.optionSent
    || a.name.localeCompare(b.name)
  ));
  const totals = rows.reduce((sum, row) => {
    sum.deals += row.deals;
    sum.rent += row.rent;
    sum.sale += row.sale;
    sum.other += row.other;
    sum.optionSent += row.optionSent;
    return sum;
  }, { deals: 0, rent: 0, sale: 0, other: 0, optionSent: 0 });
  return { rows, totals };
}

async function listBookingHistory(post) {
  const rows = [];
  let start = 0;
  for (let page = 0; page < 20; page += 1) {
    const body = await post("crm.stagehistory.list", {
      entityTypeId: 1,
      order: { ID: "DESC" },
      filter: { STATUS_ID: "CONVERTED" },
      start,
    });
    const items = Array.isArray(body?.result?.items) ? body.result.items : [];
    rows.push(...items);
    if (body?.next == null || !items.length) break;
    start = body.next;
  }
  return rows;
}

async function commentsForLeads(post, leadIds) {
  const out = {};
  const ids = [...new Set(leadIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 20) {
    const slice = ids.slice(i, i + 20);
    const cmd = {};
    slice.forEach((id, index) => {
      cmd[`c${index}`] = [
        "crm.timeline.comment.list?",
        `filter[ENTITY_ID]=${id}`,
        "filter[ENTITY_TYPE]=lead",
        "order[ID]=DESC",
        "select[0]=AUTHOR_ID",
        "select[1]=CREATED",
        "select[2]=COMMENT",
        "start=0",
      ].join("&");
    });
    const body = await post("batch", { halt: 0, cmd });
    const result = body?.result?.result && typeof body.result.result === "object" ? body.result.result : {};
    for (const [key, payload] of Object.entries(result)) {
      const leadId = slice[Number(String(key).replace(/\D/g, ""))];
      if (leadId) out[leadId] = Array.isArray(payload) ? payload : [];
    }
  }
  return out;
}

async function leadsByIds(post, ids, select) {
  const wanted = [...new Set(ids.map((id) => digits(id)).filter(Boolean))];
  const map = {};
  for (let i = 0; i < wanted.length; i += 50) {
    const slice = wanted.slice(i, i + 50);
    const body = await post("crm.lead.list", {
      filter: { ID: slice },
      select,
    });
    for (const row of asRows(body)) {
      const id = digits(row?.ID);
      if (id) map[id] = row;
    }
  }
  return map;
}

async function listStageLeads(post, sleep, statusId, from, to, select) {
  if (!statusId) return { rows: [], truncated: false };
  return listFilteredPages({
    post,
    sleep,
    method: "crm.lead.list",
    filter: {
      STATUS_ID: statusId,
      ...dateFilter(from, to, "DATE_CREATE"),
    },
    select,
    maxPages: 20,
  });
}

async function fillMissingNames(post, rows) {
  const missing = rows.filter((row) => !row.name || row.name.startsWith("User ")).map((row) => row.id).slice(0, 50);
  if (!missing.length) return;
  try {
    const body = await post("user.get", { FILTER: { ID: missing } });
    const named = new Map();
    for (const user of asRows(body)) {
      const id = digits(user?.ID);
      const name = personName(user);
      if (id && name) named.set(id, name);
    }
    for (const row of rows) {
      if (named.has(row.id)) row.name = named.get(row.id);
    }
  } catch {
    /* keep User id labels */
  }
}

export async function checkAgentMonthBoard({
  db,
  month = "",
  mode = "month",
  force = false,
  post = crmRead,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const range = boardRange({ mode, month });
  if (!range) {
    const error = new Error("Pick a month, then Check.");
    error.status = 400;
    throw error;
  }
  const key = `agent-month-won:${range.mode}:${range.label}`;
  if (!force) {
    const fresh = memory.get(key);
    if (fresh?.checkedAt && Date.now() - Number(fresh.checkedAt) < CACHE_MS) return fresh;
  }
  const agentList = await listCrmIntelligenceAgents({ db, post, sleep });
  const statusBody = await post("crm.status.list", { filter: { ENTITY_ID: "STATUS" } });
  const optionStatusId = String(
    asRows(statusBody).find((row) => /^option sent$/i.test(String(row?.NAME || "")))?.STATUS_ID || "",
  );
  const bookingStatusId = String(
    asRows(statusBody).find((row) => /^booking$/i.test(String(row?.NAME || "")))?.STATUS_ID || "",
  );
  const leadSelect = ["ID", "TITLE", "STATUS_ID", "DATE_CREATE", "ASSIGNED_BY_ID", LEAD_CLIENT_TYPE];
  const [listed, optionListed] = await Promise.all([
    listStageLeads(post, sleep, bookingStatusId, range.from, range.to, leadSelect),
    listStageLeads(post, sleep, optionStatusId, range.from, range.to, leadSelect),
  ]);
  const tallied = tallyAgentMonth({
    agents: agentList?.agents || [],
    leads: (listed.rows || []).filter((row) => String(row?.STATUS_ID || "") === String(bookingStatusId)),
    optionLeads: optionListed.rows || [],
    bookingStatusId,
    optionStatusId,
    from: range.from,
    to: range.to,
  });
  await fillMissingNames(post, tallied.rows);
  const payload = {
    ok: true,
    month: range.label,
    from: range.from,
    to: range.to,
    checkedAt: Date.now(),
    truncated: Boolean(listed.truncated || optionListed.truncated),
    agents: tallied.rows,
    totals: tallied.totals,
  };
  memory.set(key, payload);
  return payload;
}
