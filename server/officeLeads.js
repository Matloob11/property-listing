import { crmRead, dateFilter, dubaiYmd, parseBatchTotals, periodRange } from "./crmIntelligence.js";
import {
  LEAD_BEDS,
  LEAD_BREAKDOWN_SELECT,
  LEAD_CLIENT_TYPE,
  LEAD_COMMUNITY_ID,
  LEAD_COMMUNITY_TEXT,
  LEAD_LISTING_REF,
  LEAD_LISTING_URL,
  LEAD_SUB_COMMUNITY_ID,
  LEAD_UNIT_TYPE,
  listingRefOf,
  lookupLeadContext,
  mapLeadRow,
} from "./crmLeadBreakdown.js";

const SELECT = [...LEAD_BREAKDOWN_SELECT, "ASSIGNED_BY_ID"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function personName(row) {
  return [row?.NAME, row?.LAST_NAME].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

function asList(body) {
  if (Array.isArray(body?.result)) return body.result;
  if (Array.isArray(body)) return body;
  return [];
}

/** No listing reference and no community, cluster, bedrooms, type, or client type. */
export function leadIsBlank(raw) {
  const opportunity = Number(raw?.OPPORTUNITY || 0) || 0;
  return !listingRefOf(raw)
    && !String(raw?.[LEAD_LISTING_REF] ?? "").trim()
    && !String(raw?.[LEAD_LISTING_URL] ?? "").trim()
    && !String(raw?.[LEAD_COMMUNITY_TEXT] ?? "").trim()
    && !digits(raw?.[LEAD_COMMUNITY_ID])
    && !digits(raw?.[LEAD_SUB_COMMUNITY_ID])
    && !digits(raw?.[LEAD_BEDS])
    && !digits(raw?.[LEAD_UNIT_TYPE])
    && !digits(raw?.[LEAD_CLIENT_TYPE])
    && opportunity <= 0;
}

export function toOfficeLead(raw, mapped, agentName, statusName = "") {
  const communityId = digits(raw?.[LEAD_COMMUNITY_ID]);
  const clusterId = digits(raw?.[LEAD_SUB_COMMUNITY_ID]);
  const typeId = digits(raw?.[LEAD_UNIT_TYPE]);
  const bedsId = digits(raw?.[LEAD_BEDS]);
  const cluster = mapped?.subCommunity && mapped.subCommunity !== "—" ? mapped.subCommunity : "Empty cluster";
  return {
    id: mapped.id,
    title: mapped.title,
    agentId: digits(raw?.ASSIGNED_BY_ID),
    agentName: agentName || "Empty agent",
    purpose: mapped.purpose,
    purposeLabel: mapped.purposeLabel,
    clientTypeId: mapped.clientTypeId || "",
    community: mapped.community || "Empty community",
    communityText: String(raw?.[LEAD_COMMUNITY_TEXT] ?? "").trim(),
    communityId,
    cluster,
    clusterId,
    type: mapped.unitKind === "shop" ? "Shop" : (mapped.type || "Other"),
    typeId,
    beds: mapped.beds,
    bedLabel: mapped.unitKind === "shop" ? "Shop" : (mapped.bedLabel && mapped.bedLabel !== "—" ? mapped.bedLabel : "Empty beds"),
    bedsId,
    unitKind: mapped.unitKind || "",
    blank: leadIsBlank(raw),
    statusId: String(raw?.STATUS_ID || ""),
    statusName: statusName || String(raw?.STATUS_ID || ""),
    clientType: mapped?.clientType || "",
  };
}

/** periodRange stamps are Dubai wall time. Bitrix stores DATE_CREATE in UTC. */
export function dubaiStampToUtc(stamp) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(stamp || "").trim());
  if (!match) return "";
  const utc = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]) - 4,
    Number(match[5]),
    Number(match[6]),
  ));
  const pad = (value) => String(value).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())} ${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:${pad(utc.getUTCSeconds())}`;
}

function listCmd(filter, start) {
  const query = new URLSearchParams();
  SELECT.forEach((field, index) => query.set(`select[${index}]`, field));
  query.set("start", String(start));
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(`filter[${key}]`, String(value));
  }
  return `crm.lead.list?${query.toString()}`;
}

function remember(bucket, chunk) {
  for (const row of chunk || []) {
    const id = digits(row?.ID || row?.id);
    if (!id || bucket.seen.has(id)) continue;
    bucket.seen.add(id);
    bucket.rows.push(row);
  }
}

async function fetchStart(post, filter, start) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const body = await post("crm.lead.list", { filter, select: SELECT, start });
    if (Array.isArray(body?.result)) return body;
    await sleep(700 * (attempt + 1));
  }
  return null;
}

async function fetchUsers(post) {
  const names = new Map();
  for (let start = 0; start < 2000; start += 50) {
    let rows = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const body = await post("user.get", { start });
      rows = asList(body);
      if (Array.isArray(body?.result) || Array.isArray(body)) break;
      await sleep(500 * (attempt + 1));
    }
    for (const row of rows) {
      const id = digits(row?.ID || row?.id);
      if (!id) continue;
      names.set(id, personName(row) || `User ${id}`);
    }
    if (rows.length < 50) break;
    await sleep(250);
  }
  return names;
}

async function fetchLeads(post, filter) {
  const bucket = { rows: [], seen: new Set() };
  const first = await fetchStart(post, filter, 0);
  if (!first) return { rows: [], bitrixTotal: null, truncated: true };
  const bitrixTotal = first.total != null ? Number(first.total) || 0 : null;
  remember(bucket, first.result);
  const starts = [];
  if (bitrixTotal != null) {
    for (let start = 50; start < bitrixTotal; start += 50) starts.push(start);
  }
  let truncated = false;
  for (let index = 0; index < starts.length; index += 10) {
    const group = starts.slice(index, index + 10);
    const cmd = Object.fromEntries(group.map((start) => [`p${start}`, listCmd(filter, start)]));
    let result = {};
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const body = await post("batch", { halt: 0, cmd });
      const root = body?.result && typeof body.result === "object" ? body.result : {};
      const pageResult = root.result && typeof root.result === "object" ? root.result : {};
      const errors = root.result_error && typeof root.result_error === "object" ? root.result_error : {};
      const missing = group.some((start) => !Array.isArray(pageResult[`p${start}`]) || errors[`p${start}`]);
      if (!missing) {
        result = pageResult;
        break;
      }
      await sleep(800 * (attempt + 1));
    }
    for (const start of group) {
      const chunk = result[`p${start}`];
      const lastPage = bitrixTotal != null && start + 50 >= bitrixTotal;
      if (Array.isArray(chunk) && (chunk.length > 0 || lastPage)) {
        remember(bucket, chunk);
        continue;
      }
      const one = await fetchStart(post, filter, start);
      if (!one) truncated = true;
      else remember(bucket, one.result);
      await sleep(300);
    }
    if (index + 10 < starts.length) await sleep(450);
  }
  if (bitrixTotal != null && bucket.rows.length < bitrixTotal) truncated = true;
  return { rows: bucket.rows, bitrixTotal, truncated };
}

export function shapeOfficeLeads(rawRows, names, context, statusNames = new Map()) {
  const leads = [];
  for (const raw of rawRows || []) {
    const mapped = mapLeadRow(raw, context?.fields || {}, context?.titles || {}, null, null);
    if (!mapped.id) continue;
    const agentId = digits(raw?.ASSIGNED_BY_ID);
    const statusId = String(raw?.STATUS_ID || "");
    leads.push(toOfficeLead(raw, mapped, names.get(agentId) || "", statusNames.get(statusId) || ""));
  }
  const count = (purpose) => leads.filter((row) => row.purpose === purpose).length;
  return {
    total: leads.length,
    rent: count("rent"),
    sale: count("sale"),
    unknown: count("unknown"),
    other: count("other"),
    leads,
  };
}

function countCmd(filter) {
  const query = new URLSearchParams();
  query.set("select[0]", "ID");
  query.set("start", "0");
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(`filter[${key}]`, String(value));
  }
  return `crm.lead.list?${query.toString()}`;
}

function tally(leads, keyOf, field, valueOf) {
  const map = new Map();
  for (const row of leads) {
    const value = String(valueOf(row) || "").trim();
    if (!value || /^empty\b/i.test(value)) continue;
    const key = keyOf(row);
    const prev = map.get(key) || { key, value, field, count: 0 };
    prev.count += 1;
    if (value !== value.toUpperCase()) prev.value = value;
    map.set(key, prev);
  }
  return [...map.values()];
}

async function verifySlices(post, filter, leads) {
  const slices = [
    ...tally(leads, (row) => String(row.communityText || "").trim().toLowerCase(), `=${LEAD_COMMUNITY_TEXT}`, (row) => row.communityText),
    ...tally(leads, (row) => row.clusterId, LEAD_SUB_COMMUNITY_ID, (row) => row.clusterId),
    ...tally(leads, (row) => row.typeId, LEAD_UNIT_TYPE, (row) => row.typeId),
    ...tally(leads, (row) => row.bedsId, LEAD_BEDS, (row) => row.bedsId),
    ...tally(leads, (row) => row.agentId, "ASSIGNED_BY_ID", (row) => row.agentId),
    ...tally(leads, (row) => row.statusId, "STATUS_ID", (row) => row.statusId),
  ];
  const totals = {};
  for (let index = 0; index < slices.length; index += 10) {
    const group = slices.slice(index, index + 10);
    const cmd = Object.fromEntries(group.map((slice, item) => [`c${index + item}`, countCmd({ ...filter, [slice.field]: slice.value })]));
    let parsed = { totals: {}, errors: {} };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const body = await post("batch", { halt: 0, cmd });
      parsed = parseBatchTotals(body);
      const missing = group.some((_, item) => parsed.totals[`c${index + item}`] == null || parsed.errors[`c${index + item}`]);
      if (!missing) break;
      await sleep(700 * (attempt + 1));
    }
    Object.assign(totals, parsed.totals);
    if (index + 10 < slices.length) await sleep(450);
  }
  const mismatches = [];
  slices.forEach((slice, index) => {
    const bitrix = totals[`c${index}`];
    if (bitrix == null || Number(bitrix) !== slice.count) {
      mismatches.push({ field: slice.field, value: slice.value, ours: slice.count, bitrix: bitrix == null ? null : Number(bitrix) });
    }
  });
  const city = slices.find((slice) => slice.field === `=${LEAD_COMMUNITY_TEXT}` && slice.key === "international city") || null;
  return {
    checked: slices.length,
    mismatches,
    spot: city
      ? { name: "International City", ours: city.count, bitrix: totals[`c${slices.indexOf(city)}`] == null ? null : Number(totals[`c${slices.indexOf(city)}`]) }
      : null,
  };
}

const ROLLING_RANGES = [
  ["days7", 7, "Last 7 days"],
  ["days15", 15, "Last 15 days"],
  ["days30", 30, "Last 30 days"],
  ["days45", 45, "Last 45 days"],
  ["days90", 90, "Last 90 days"],
];

function ymdStamp(parts, end) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${parts.y}-${pad(parts.m)}-${pad(parts.d)} ${end ? "23:59:59" : "00:00:00"}`;
}

function shiftDays(parts, delta) {
  const next = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + delta));
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
}

function rollingLeadRange(days, label, now) {
  const today = dubaiYmd(now);
  const start = shiftDays(today, -(days - 1));
  return {
    mode: "rolling",
    period: label,
    from: ymdStamp(start, false),
    to: ymdStamp(today, true),
    label,
    days,
  };
}

/** Office leads range. Dates are Dubai calendar days. Overall is every lead in CRM. */
export function officeLeadRange({ mode = "", day = "", month = "", period = "", from = "", to = "" } = {}, now = new Date()) {
  const picked = String(mode || "").toLowerCase();
  const rolling = ROLLING_RANGES.find(([key]) => key === picked);
  if (rolling) return rollingLeadRange(rolling[1], rolling[2], now);
  if (picked === "custom") {
    let fromDay = String(from || "").trim();
    let toDay = String(to || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) {
      const error = new Error("Pick a start date and an end date.");
      error.status = 400;
      throw error;
    }
    if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
    return {
      mode: "custom",
      period: `${fromDay} to ${toDay}`,
      from: `${fromDay} 00:00:00`,
      to: `${toDay} 23:59:59`,
      label: `${fromDay} → ${toDay}`,
    };
  }
  if (picked === "all" || picked === "overall") {
    return { mode: "all", period: "All Time", from: "", to: "", label: "Overall" };
  }
  if (picked === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(String(month || "").trim());
    if (!match) {
      const error = new Error("Pick a month.");
      error.status = 400;
      throw error;
    }
    const y = Number(match[1]);
    const mo = Number(match[2]);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const label = `${y}-${String(mo).padStart(2, "0")}`;
    return {
      mode: "month",
      period: label,
      from: `${label}-01 00:00:00`,
      to: `${label}-${String(last).padStart(2, "0")} 23:59:59`,
      label,
    };
  }
  if (picked === "day") {
    const d = String(day || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const error = new Error("Pick a day.");
      error.status = 400;
      throw error;
    }
    return { mode: "day", period: d, from: `${d} 00:00:00`, to: `${d} 23:59:59`, label: d };
  }
  const range = periodRange(period || "Last 30 Days", now);
  return { mode: "period", period: range.period, from: range.from, to: range.to, label: range.period };
}

export async function checkOfficeLeads({ mode = "", day = "", month = "", period = "Last 30 Days", from = "", to = "", post = crmRead } = {}) {
  const range = officeLeadRange({ mode, day, month, period, from, to });
  const filter = dateFilter(dubaiStampToUtc(range.from), dubaiStampToUtc(range.to));
  const users = await fetchUsers(post);
  const fetched = await fetchLeads(post, filter);
  const context = await lookupLeadContext(post, fetched.rows);
  const statusBody = await post("crm.status.list", { filter: { ENTITY_ID: "STATUS" } }).catch(() => null);
  const statusRows = (Array.isArray(statusBody?.result) ? statusBody.result : [])
    .slice()
    .sort((a, b) => Number(a?.SORT || 0) - Number(b?.SORT || 0));
  const statusNames = new Map(statusRows.map((row) => [String(row.STATUS_ID || ""), String(row.NAME || row.STATUS_ID || "")]));
  const shaped = shapeOfficeLeads(fetched.rows, users, context, statusNames);
  const audit = await verifySlices(post, filter, shaped.leads).catch(() => null);
  const countMatches = fetched.bitrixTotal == null || (!fetched.truncated && shaped.total === fetched.bitrixTotal);
  const slicesMatch = Boolean(audit) && audit.mismatches.length === 0 && audit.checked > 0;
  const value = {
    ok: true,
    period: range.period,
    mode: range.mode,
    label: range.label,
    from: range.from,
    to: range.to,
    bitrixTotal: fetched.bitrixTotal,
    truncated: fetched.truncated,
    verified: countMatches && slicesMatch,
    spot: audit?.spot || null,
    checked: audit?.checked || 0,
    mismatchCount: audit?.mismatches?.length || 0,
    mismatches: (audit?.mismatches || []).slice(0, 8).map((row) => ({
      field: row.field,
      value: row.value,
      ours: row.ours,
      bitrix: row.bitrix,
    })),
    statuses: statusRows.map((row) => ({ id: String(row.STATUS_ID || ""), name: String(row.NAME || "") })),
    ...shaped,
  };
  return value;
}
