/** Agent daily / monthly CRM + lead-share report (Check only — no auto Bitrix load). */
import {
  CACHE_MS,
  crmRead,
  dateFilter,
  junkStatusIds,
  listFilteredPages,
  loadAgentHistory,
  mapLeadHistory,
  normalizeAgentId,
  periodRange,
  listCrmIntelligenceAgents,
  resolveCrmAgent,
  statusNameMap,
} from "./crmIntelligence.js";

import { listTlNotes } from "./tlNotes.js";
import { maskPhoneInText } from "./reportPrivacy.js";
import { isMeetingViewingStage } from "./agentDailyReportPdf.js";
import { dubaiStampToUtc } from "./officeLeads.js";

const memory = new Map();
const inflight = new Map();
const REPORT_CACHE_VER = "v12";

export function reportRange({ mode = "day", day = "", month = "", period = "", from: fromIn = "", to: toIn = "" } = {}, now = new Date()) {
  const m = String(mode || "day").toLowerCase();
  if (m === "period" && period) {
    const range = periodRange(period, now);
    return { mode: "period", period: range.period, from: range.from, to: range.to, label: range.period };
  }
  if (m === "week") {
    const rawDay = /^\d{4}-\d{2}-\d{2}$/.test(String(day || "").trim())
      ? String(day).trim()
      : String(periodRange("Today", now).from || "").slice(0, 10);
    const [yy, mm, dd] = rawDay.split("-").map(Number);
    const anchor = new Date(Date.UTC(yy, (mm || 1) - 1, dd || 1));
    const dow = anchor.getUTCDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const start = new Date(anchor);
    start.setUTCDate(anchor.getUTCDate() + mondayOffset);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const iso = (dt) => dt.toISOString().slice(0, 10);
    const fromDay = iso(start);
    const toDay = iso(end);
    return {
      mode: "week",
      period: "Custom",
      from: `${fromDay} 00:00:00`,
      to: `${toDay} 23:59:59`,
      label: `${fromDay} → ${toDay}`,
    };
  }
  if (m === "days7" || m === "days15" || m === "days30") {
    const span = m === "days7" ? 7 : m === "days15" ? 15 : 30;
    const today = periodRange("Today", now);
    const end = String(today.to || "").slice(0, 10);
    const [yy, mm, dd] = end.split("-").map(Number);
    const start = new Date(Date.UTC(yy, (mm || 1) - 1, dd || 1));
    start.setUTCDate(start.getUTCDate() - (span - 1));
    const fromDay = start.toISOString().slice(0, 10);
    return {
      mode: m,
      period: "Custom",
      from: `${fromDay} 00:00:00`,
      to: `${end} 23:59:59`,
      label: `Last ${span} days`,
    };
  }
  if (m === "custom") {
    const ok = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
    let start = String(fromIn || "").trim().slice(0, 10);
    let end = String(toIn || "").trim().slice(0, 10);
    if (!ok(start) || !ok(end)) {
      return { mode: "custom", period: "Custom", from: "", to: "", label: "Custom" };
    }
    if (start > end) [start, end] = [end, start];
    return {
      mode: "custom",
      period: "Custom",
      from: `${start} 00:00:00`,
      to: `${end} 23:59:59`,
      label: `${start} → ${end}`,
    };
  }
  if (m === "month") {
    const raw = String(month || "").trim();
    const match = /^(\d{4})-(\d{2})$/.exec(raw);
    if (match) {
      const y = Number(match[1]);
      const mo = Number(match[2]);
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const from = `${y}-${String(mo).padStart(2, "0")}-01 00:00:00`;
      const to = `${y}-${String(mo).padStart(2, "0")}-${String(last).padStart(2, "0")} 23:59:59`;
      return { mode: "month", period: "Custom", from, to, label: `${y}-${String(mo).padStart(2, "0")}` };
    }
  }
  const today = periodRange("Today", now);
  const d = String(day || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return {
      mode: "day",
      period: "Custom",
      from: `${d} 00:00:00`,
      to: `${d} 23:59:59`,
      label: d,
    };
  }
  return { mode: "day", period: "Today", from: today.from, to: today.to, label: String(today.from).slice(0, 10) };
}

function personName(row) {
  return [row?.NAME, row?.LAST_NAME].map((part) => String(part || "").trim()).filter(Boolean).join(" ")
    || String(row?.EMAIL || "").trim()
    || `User ${row?.ID || ""}`.trim();
}

async function loadUser(post, id) {
  const body = await post("user.get", { ID: id });
  const rows = Array.isArray(body?.result) ? body.result : body?.result ? [body.result] : [];
  return rows[0] || { ID: id, NAME: "Agent" };
}

async function loadStatuses(post) {
  const [leadBody, sourceBody] = await Promise.all([
    post("crm.status.list", { filter: { ENTITY_ID: "STATUS" } }),
    post("crm.status.list", { filter: { ENTITY_ID: "SOURCE" } }),
  ]);
  return {
    leadStatuses: Array.isArray(leadBody?.result) ? leadBody.result : [],
    sources: Array.isArray(sourceBody?.result) ? sourceBody.result : [],
  };
}

async function loadActivities(post, sleep, agentId, from, to) {
  const id = String(agentId);
  const filter = { ...dateFilter(from, to, "CREATED"), RESPONSIBLE_ID: id };
  const select = ["ID", "SUBJECT", "DESCRIPTION", "LOCATION", "START_TIME", "END_TIME", "CREATED", "TYPE_ID", "DIRECTION", "OWNER_ID", "OWNER_TYPE_ID", "RESPONSIBLE_ID", "AUTHOR_ID", "COMMUNICATIONS", "SETTINGS", "FILES"];
  const meetings = await listFilteredPages({
    post,
    sleep,
    method: "crm.activity.list",
    filter: { ...filter, TYPE_ID: 1 },
    select,
    maxPages: 8,
  });
  const all = await listFilteredPages({
    post,
    sleep,
    method: "crm.activity.list",
    filter,
    select,
    maxPages: 8,
  });
  const onlyMine = (rows) =>
    (rows || []).filter((row) => {
      const owner = String(row?.RESPONSIBLE_ID || "").replace(/\D/g, "");
      return !owner || owner === String(id).replace(/\D/g, "");
    });
  const meetingRows = onlyMine(meetings.rows);
  const activityRows = onlyMine(all.rows);
  const callsOnly = await listFilteredPages({
    post,
    sleep,
    method: "crm.activity.list",
    filter: { ...filter, TYPE_ID: 2 },
    select,
    maxPages: 12,
  });
  const seenActivity = new Set(activityRows.map((row) => String(row?.ID || "")));
  for (const row of onlyMine(callsOnly.rows)) {
    const key = String(row?.ID || "");
    if (!key || seenActivity.has(key)) continue;
    seenActivity.add(key);
    activityRows.push(row);
  }
  return {
    meetings: meetingRows,
    activities: activityRows,
    meetingsCount: meetingRows.length,
    activitiesCount: activityRows.length,
    truncated: meetings.truncated || all.truncated || callsOnly.truncated,
    calls: meetings.calls + all.calls,
  };
}

const ACTIVITY_TYPES = { 1: "Meeting", 2: "Call", 3: "Task", 4: "Email" };
const ACTIVITY_DIRECTIONS = { 1: "Incoming", 2: "Outgoing" };

function plainText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Who did the action, what kind it was, and the exact note Bitrix stored. */
export function describeTeamLeadAction(row, names = new Map()) {
  const authorId = String(row?.AUTHOR_ID || row?.authorId || "").replace(/\D/g, "");
  const responsibleId = String(row?.RESPONSIBLE_ID || row?.responsibleId || "").replace(/\D/g, "");
  const actorId = authorId || responsibleId;
  const typeId = String(row?.TYPE_ID || row?.typeId || "");
  const typeName = ACTIVITY_TYPES[typeId] || "Activity";
  const direction = ACTIVITY_DIRECTIONS[String(row?.DIRECTION || "")] || "";
  const subject = plainText(row?.SUBJECT || row?.subject);
  const description = plainText(row?.DESCRIPTION || row?.description);
  const detail = (description && description !== subject ? description : subject || typeName).slice(0, 400);
  const known = names.get(actorId);
  return {
    id: String(row?.ID || row?.id || ""),
    subject,
    detail,
    typeId,
    typeLabel: direction ? `${typeName} · ${direction}` : typeName,
    created: String(row?.CREATED || row?.created || ""),
    leadId: String(row?.OWNER_TYPE_ID || row?.ownerTypeId || "1") === "1"
      ? String(row?.OWNER_ID || row?.leadId || "")
      : String(row?.leadId || ""),
    responsibleId,
    authorId,
    actorId,
    actorName: known || (actorId ? `User #${actorId}` : "—"),
  };
}

async function userNames(post, ids) {
  const names = new Map();
  const unique = [...new Set((ids || []).map((id) => String(id || "").replace(/\D/g, "")).filter(Boolean))];
  await Promise.all(unique.map(async (id) => {
    try {
      const body = await post("user.get", { ID: id });
      const row = Array.isArray(body?.result) ? body.result[0] : null;
      names.set(id, personName(row || { ID: id }));
    } catch {
      names.set(id, `User #${id}`);
    }
  }));
  return names;
}

/** Activities on this agent's leads done by someone else (TL / another user). */
async function loadTeamLeadActions(post, sleep, agentId, leadIds, from, to) {
  const mine = String(agentId).replace(/\D/g, "");
  const ids = [...new Set((leadIds || []).map((value) => String(value || "").replace(/\D/g, "")).filter(Boolean))].slice(0, 60);
  if (!ids.length) return { rows: [], truncated: false, calls: 0 };
  const select = ["ID", "SUBJECT", "DESCRIPTION", "CREATED", "TYPE_ID", "DIRECTION", "OWNER_ID", "OWNER_TYPE_ID", "RESPONSIBLE_ID", "AUTHOR_ID"];
  const filter = {
    ...dateFilter(from, to, "CREATED"),
    OWNER_TYPE_ID: 1,
    "@OWNER_ID": ids,
  };
  let listed;
  try {
    listed = await listFilteredPages({
      post,
      sleep,
      method: "crm.activity.list",
      filter,
      select,
      maxPages: 6,
    });
  } catch {
    return { rows: [], truncated: false, calls: 0, error: "Could not load TL/other activities on agent leads" };
  }
  const rows = (listed.rows || []).filter((row) => {
    const responsible = String(row?.RESPONSIBLE_ID || "").replace(/\D/g, "");
    const author = String(row?.AUTHOR_ID || "").replace(/\D/g, "");
    if (responsible && responsible !== mine) return true;
    if (author && author !== mine && responsible === mine) return true;
    return Boolean(responsible && responsible !== mine);
  });
  const actorIds = rows.map((row) => String(row?.AUTHOR_ID || row?.RESPONSIBLE_ID || "").replace(/\D/g, ""));
  const names = await userNames(post, actorIds);
  return {
    rows: rows.map((row) => describeTeamLeadAction(row, names)),
    truncated: Boolean(listed.truncated),
    calls: listed.calls || 0,
  };
}

function digitIds(rows, key) {
  return [...new Set((rows || []).map((row) => String(row?.[key] || "").replace(/\D/g, "")).filter(Boolean))];
}

/** One lead is one share, even if it was sent several times or to several people. */
export function shareLeadBuckets(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const id = String(row?.leadId || "").replace(/\D/g, "");
    if (!id) continue;
    const list = groups.get(id) || [];
    list.push(row);
    groups.set(id, list);
  }
  const all = [];
  const worked = [];
  const idle = [];
  for (const [id, list] of groups) {
    all.push(id);
    if (list.every((row) => row.worked)) worked.push(id);
    else idle.push(id);
  }
  return { all, worked, idle, count: all.length, workedCount: worked.length, idleCount: idle.length };
}

/** Exact lead ids behind each Agent Report box, so CRM opens that same set. */
export function crmLeadIdsForReport({ worked, idle, proceeded, junk, meetings, activities, tlRows, sharedOut, sharedIn } = {}) {
  const out = sharedOut || [];
  return {
    worked: digitIds(worked, "id"),
    notWorked: digitIds(idle, "id"),
    proceeded: digitIds(proceeded, "id"),
    junk: digitIds(junk, "id"),
    meetings: digitIds((meetings || []).map((row) => (row?.leadId ? row : mapActivityRow(row))), "leadId"),
    activities: digitIds((activities || []).map(mapActivityRow), "leadId"),
    tlActions: digitIds((tlRows || []).map((row) => (row?.leadId ? row : mapActivityRow(row))), "leadId"),
    sharedOut: shareLeadBuckets(out).all,
    sharedOutWorked: shareLeadBuckets(out).worked,
    sharedOutIdle: shareLeadBuckets(out).idle,
    sharedIn: shareLeadBuckets(sharedIn).all,
  };
}

function phoneFromText(value) {
  const match = String(value || "").match(/\+?\d[\d\s().-]{5,}\d/);
  return match ? match[0] : "";
}

function contactName(settings) {
  return [settings?.NAME, settings?.SECOND_NAME, settings?.LAST_NAME]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function callSettings(row) {
  return row?.SETTINGS && typeof row.SETTINGS === "object" ? row.SETTINGS : {};
}

function callDurationSeconds(row) {
  const settings = callSettings(row);
  const raw = settings.DURATION ?? settings.CALL_DURATION ?? settings.RECORD_DURATION ?? row?.DURATION ?? "";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function activityHasRecording(row) {
  const settings = callSettings(row);
  const files = Array.isArray(row?.FILES) ? row.FILES : [];
  const url = String(settings.RECORD_URL || settings.RECORDING_URL || settings.CALL_RECORD_URL || "").trim();
  return Boolean(url || files.length || settings.RECORD_FILE_ID);
}

/** One row per call. The contact number always has its last digits hidden. */
export function callRecords(activities = [], { leads = new Map(), sourceNames = new Map() } = {}) {
  const names = sourceNames instanceof Map ? sourceNames : new Map();
  const leadMap = leads instanceof Map ? leads : new Map();
  const rows = [];
  for (const row of activities || []) {
    if (String(row?.TYPE_ID || row?.typeId || "") !== "2") continue;
    const comms = Array.isArray(row?.COMMUNICATIONS) ? row.COMMUNICATIONS : [];
    const phoneComm = comms.find((item) => String(item?.TYPE || "").toUpperCase() === "PHONE") || comms[0];
    const rawPhone = String(phoneComm?.VALUE || "") || phoneFromText(row?.SUBJECT || row?.subject);
    const leadId = String(row?.OWNER_TYPE_ID || row?.ownerTypeId || "1") === "1"
      ? String(row?.OWNER_ID || row?.leadId || "").replace(/\D/g, "")
      : "";
    const lead = leadMap.get(leadId);
    const sourceId = String(lead?.SOURCE_ID || "");
    const direction = ACTIVITY_DIRECTIONS[String(row?.DIRECTION || row?.direction || "")] || "Call";
    const duration = callDurationSeconds(row);
    rows.push({
      id: String(row?.ID || row?.id || ""),
      when: String(row?.START_TIME || row?.CREATED || row?.created || ""),
      direction,
      from: names.get(sourceId) || "",
      phone: maskPhoneInText(rawPhone),
      name: contactName(phoneComm?.ENTITY_SETTINGS) || [lead?.NAME, lead?.LAST_NAME].map((part) => String(part || "").trim()).filter(Boolean).join(" "),
      leadId,
      leadTitle: String(lead?.TITLE || lead?.title || ""),
      duration,
      talkTime: duration,
      waitTime: 0,
      hasRecording: activityHasRecording(row),
      deskLeadId: "",
    });
  }
  rows.sort((a, b) => String(a.when).localeCompare(String(b.when)) || String(a.id).localeCompare(String(b.id)));
  return rows;
}

function deskBitrixId(lead) {
  const stored = String(lead?.bitrix_id || "").replace(/\D/g, "");
  if (stored) return stored;
  const id = String(lead?.id || "");
  return id.startsWith("crm-") ? id.slice(4).replace(/\D/g, "") : "";
}

/** Attach Property Finder recordings already stored on the desk, and add any that Bitrix did not return. */
export function mergeDeskCallRecordings(calls = [], deskLeads = [], { agentName = "", from = "", to = "" } = {}) {
  const wanted = String(agentName || "").trim().toLowerCase();
  const byBitrix = new Map();
  for (const lead of deskLeads || []) {
    if (!String(lead?.call_record || "").trim()) continue;
    const bitrixId = deskBitrixId(lead);
    if (bitrixId && !byBitrix.has(bitrixId)) byBitrix.set(bitrixId, lead);
  }
  const seenDesk = new Set();
  const rows = (calls || []).map((call) => {
    const desk = byBitrix.get(String(call.leadId || "").replace(/\D/g, ""));
    if (!desk) return call;
    seenDesk.add(String(desk.id || ""));
    const talk = Number(desk.call_talk_time) || 0;
    const wait = Number(desk.call_wait_time) || 0;
    return {
      ...call,
      deskLeadId: String(desk.id || ""),
      hasRecording: true,
      talkTime: talk || call.talkTime || 0,
      waitTime: wait || call.waitTime || 0,
      duration: call.duration || talk || 0,
    };
  });
  for (const lead of deskLeads || []) {
    if (!String(lead?.call_record || "").trim()) continue;
    const id = String(lead.id || "");
    if (!id || seenDesk.has(id)) continue;
    const name = String(lead.agent_name || "").trim().toLowerCase();
    if (wanted && name !== wanted) continue;
    const when = String(lead.created_at || "");
    if ((from || to) && !inRange(when, from, to)) continue;
    seenDesk.add(id);
    const talk = Number(lead.call_talk_time) || 0;
    rows.push({
      id: `desk-${id}`,
      when,
      direction: "Call",
      from: "Property Finder",
      phone: maskPhoneInText(lead.sender_phone),
      name: String(lead.sender_name || "").trim(),
      leadId: deskBitrixId(lead),
      leadTitle: String(lead.reference || "").trim(),
      duration: talk,
      talkTime: talk,
      waitTime: Number(lead.call_wait_time) || 0,
      hasRecording: true,
      deskLeadId: id,
    });
  }
  rows.sort((a, b) => String(a.when).localeCompare(String(b.when)) || String(a.id).localeCompare(String(b.id)));
  return rows;
}

function mapActivityRow(row) {
  return {
    id: String(row.ID || ""),
    subject: String(row.SUBJECT || "Activity"),
    description: plainText(row.DESCRIPTION).slice(0, 400),
    location: plainText(row.LOCATION).slice(0, 200),
    start: String(row.START_TIME || ""),
    end: String(row.END_TIME || ""),
    typeId: String(row.TYPE_ID || ""),
    direction: String(row.DIRECTION || ""),
    created: String(row.CREATED || ""),
    leadId: String(row.OWNER_TYPE_ID || "1") === "1" ? String(row.OWNER_ID || "") : "",
    responsibleId: String(row.RESPONSIBLE_ID || ""),
    authorId: String(row.AUTHOR_ID || ""),
  };
}

function parseStamp(value) {
  const text = String(value || "").trim();
  if (!text) return NaN;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return Date.parse(text);
  return Date.parse(`${text.replace(" ", "T")}Z`);
}

/** Leads this agent called, then moved to Option Sent in the same period. */
export function optionSentWork({ history = [], calls = [], leads = new Map(), from = "", to = "", optionStatusIds = [] } = {}) {
  const wanted = new Set((optionStatusIds || []).map((id) => String(id || "")).filter(Boolean));
  const callByLead = new Map();
  for (const call of calls || []) {
    if (String(call?.TYPE_ID || call?.typeId || "") !== "2") continue;
    const leadId = String(call?.OWNER_ID || call?.leadId || "").replace(/\D/g, "");
    if (!leadId) continue;
    const list = callByLead.get(leadId) || [];
    list.push(call);
    callByLead.set(leadId, list);
  }
  const rows = [];
  const seen = new Set();
  for (const item of history || []) {
    const statusId = String(item?.STATUS_ID || item?.statusId || "");
    if (!wanted.has(statusId)) continue;
    const when = String(item?.CREATED_TIME || item?.created || "");
    if (!inRange(when, from, to)) continue;
    const leadId = String(item?.OWNER_ID || item?.ownerId || "").replace(/\D/g, "");
    const leadCalls = callByLead.get(leadId) || [];
    if (!leadId || !leadCalls.length || seen.has(leadId)) continue;
    seen.add(leadId);
    const lead = leads instanceof Map ? leads.get(leadId) : null;
    const call = leadCalls.slice().sort((a, b) => String(a?.CREATED || "").localeCompare(String(b?.CREATED || "")))[0];
    rows.push({
      leadId,
      title: String(lead?.TITLE || lead?.title || `Lead #${leadId}`),
      when,
      callAt: String(call?.CREATED || call?.created || ""),
      callSubject: plainText(call?.SUBJECT || call?.subject || "Call"),
      stage: "Option Sent",
    });
  }
  rows.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  return rows;
}

/** Meeting counts only after they have met and the agent moved the lead to Done. */
export function isMeetingDoneStage(name) {
  const text = String(name || "");
  return /meeting|viewing/i.test(text) && /done/i.test(text) && !/schedul/i.test(text);
}

export function meetingDoneWork({ leads = [], doneStatusIds = [], stageNames = new Map(), from = "", to = "", agentId = "" } = {}) {
  const done = new Set((doneStatusIds || []).map((id) => String(id || "")).filter(Boolean));
  const mine = String(agentId || "").replace(/\D/g, "");
  const names = stageNames instanceof Map ? stageNames : new Map();
  const rows = [];
  const seen = new Set();
  for (const lead of leads || []) {
    const mover = String(lead?.MOVED_BY_ID || lead?.movedById || "").replace(/\D/g, "");
    if (mine && mover !== mine) continue;
    const statusId = String(lead?.STATUS_ID || lead?.statusId || "");
    if (!done.has(statusId)) continue;
    const when = String(lead?.MOVED_TIME || lead?.movedTime || "");
    if ((from || to) && !inRange(when, from, to)) continue;
    const id = String(lead?.ID || lead?.id || "").replace(/\D/g, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      leadId: id,
      title: String(lead?.TITLE || lead?.title || `Lead #${id}`),
      stage: names.get(statusId) || "Meeting/Viewing Done",
      when,
    });
  }
  rows.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  return rows;
}

function stageChangeActor(item) {
  for (const key of ["CREATED_BY_ID", "AUTHOR_ID", "USER_ID", "MODIFIED_BY_ID"]) {
    const id = String(item?.[key] || "").replace(/\D/g, "");
    if (id) return id;
  }
  return "";
}

/** Meeting or viewing stages this agent changed during the report window. */
export function agentMeetingStageChanges({ history = [], stageNames = new Map(), from = "", to = "", agentId = "", leads = new Map() } = {}) {
  const mine = String(agentId || "").replace(/\D/g, "");
  const names = stageNames instanceof Map ? stageNames : new Map();
  const leadMap = leads instanceof Map ? leads : new Map();
  const rows = [];
  const seen = new Set();
  for (const item of history || []) {
    // Type 1 is the lead being created, not a later stage change.
    if (String(item?.TYPE_ID || "") === "1") continue;
    const statusId = String(item?.STATUS_ID || item?.STAGE_ID || "");
    const stage = names.get(statusId) || "";
    if (!isMeetingViewingStage(stage)) continue;
    const when = String(item?.CREATED_TIME || item?.CREATED || "");
    if ((from || to) && !inRange(when, from, to)) continue;
    const leadId = String(item?.OWNER_ID || "").replace(/\D/g, "");
    const lead = leadMap.get(leadId);
    const actor = stageChangeActor(item);
    const mover = String(lead?.MOVED_BY_ID || "").replace(/\D/g, "");
    const movedAt = String(lead?.MOVED_TIME || "");
    const moverInWindow = mover === mine && (!movedAt || !(from || to) || inRange(movedAt, from, to));
    const theirs = actor ? actor === mine : moverInWindow;
    if (mine && !theirs) continue;
    if (!leadId || seen.has(leadId)) continue;
    seen.add(leadId);
    rows.push({
      leadId,
      title: String(lead?.TITLE || lead?.title || `Lead #${leadId}`),
      stage,
      when,
    });
  }
  rows.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  return rows;
}

function mergeMeetingRows(primary = [], extra = []) {
  const rows = [...primary];
  const seen = new Set(rows.map((row) => String(row.leadId || "")));
  for (const row of extra) {
    const leadId = String(row?.leadId || "");
    if (!leadId || seen.has(leadId)) continue;
    seen.add(leadId);
    rows.push(row);
  }
  rows.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  return rows;
}

/** Deals this agent closed in the window, won or lost. */
export function closedDealRows(deals = [], { agentId = "", from = "", to = "", stageNames = new Map() } = {}) {
  const mine = String(agentId || "").replace(/\D/g, "");
  const names = stageNames instanceof Map ? stageNames : new Map();
  const start = String(from || "").slice(0, 10);
  const end = String(to || "").slice(0, 10);
  const rows = [];
  for (const deal of deals || []) {
    const owner = String(deal?.ASSIGNED_BY_ID || "").replace(/\D/g, "");
    const mover = String(deal?.MOVED_BY_ID || "").replace(/\D/g, "");
    if (mine && owner !== mine && mover !== mine) continue;
    const semantic = String(deal?.STAGE_SEMANTIC_ID || "");
    if (semantic !== "S" && semantic !== "F") continue;
    const when = String(deal?.CLOSEDATE || deal?.MOVED_TIME || "");
    const day = when.slice(0, 10);
    if (start && day && day < start) continue;
    if (end && day && day > end) continue;
    const id = String(deal?.ID || deal?.id || "").replace(/\D/g, "");
    if (!id) continue;
    rows.push({
      id,
      title: String(deal?.TITLE || `Deal #${id}`),
      stage: semantic === "S" ? "Won" : "Lost",
      stageName: names.get(String(deal?.STAGE_ID || "")) || "",
      amount: Number(deal?.OPPORTUNITY) || 0,
      currency: String(deal?.CURRENCY_ID || "AED"),
      when,
      leadId: String(deal?.LEAD_ID || "").replace(/\D/g, ""),
    });
  }
  rows.sort((a, b) => String(a.when).localeCompare(String(b.when)) || String(a.id).localeCompare(String(b.id)));
  return rows;
}

/** Owner Data cards this agent updated, plus any note they wrote on that card. */
export function ownerDataWork({ items = [], comments = [], stageNames = new Map(), agentId = "" } = {}) {
  const mine = String(agentId || "").replace(/\D/g, "");
  const notes = new Map();
  for (const row of comments || []) {
    const author = String(row?.AUTHOR_ID || row?.authorId || "").replace(/\D/g, "");
    if (mine && author && author !== mine) continue;
    const id = String(row?.ENTITY_ID || row?.entityId || "").replace(/\D/g, "");
    const text = plainText(row?.COMMENT || row?.comment);
    if (!id || !text) continue;
    const prev = notes.get(id) || [];
    prev.push(text);
    notes.set(id, prev);
  }
  return (items || []).map((item) => {
    const id = String(item?.id || item?.ID || "").replace(/\D/g, "");
    const stageId = String(item?.stageId || item?.STAGE_ID || "");
    const names = stageNames instanceof Map ? stageNames : new Map();
    const note = (notes.get(id) || []).slice(0, 3).join(" · ");
    return {
      id,
      title: String(item?.title || item?.TITLE || `Owner #${id}`),
      when: String(item?.updatedTime || item?.UPDATED_TIME || ""),
      stage: names.get(stageId) || stageId,
      detail: note || "Updated the owner card",
    };
  }).filter((row) => row.id);
}

function inRange(iso, from, to) {
  const t = parseStamp(iso);
  const a = parseStamp(from);
  const b = parseStamp(to);
  if (!Number.isFinite(t) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return t >= a && t <= b;
}

/** Load ASSIGNED_BY_ID for lead ids (batched). */
async function loadLeadAssignees(post, leadIds) {
  const ids = [...new Set((leadIds || []).map((value) => String(value || "").replace(/\D/g, "")).filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const body = await post("crm.lead.list", {
      filter: { "@ID": chunk },
      select: ["ID", "ASSIGNED_BY_ID", "TITLE", "STATUS_ID", "DATE_CREATE", "DATE_MODIFY", "SOURCE_ID", "NAME", "LAST_NAME"],
      start: 0,
    });
    const rows = Array.isArray(body?.result) ? body.result : Array.isArray(body?.result?.result) ? body.result.result : [];
    for (const row of rows) {
      map.set(String(row.ID || ""), row);
    }
  }
  return map;
}

/**
 * Daily report verify: a lead counts as worked for this agent only when
 * Bitrix says ASSIGNED_BY_ID = agent AND (created in the day/month OR agent activity on that lead).
 * Never count: old leads only DATE_MODIFIED, or activity on someone else's lead.
 */
export function verifyDailyLeadWork({
  agentId,
  from,
  to,
  history,
  myActivityLeadIds = [],
  leadStatuses = [],
} = {}) {
  const id = normalizeAgentId(agentId);
  const mineActs = new Set((myActivityLeadIds || []).map((value) => String(value || "").replace(/\D/g, "")).filter(Boolean));
  const names = statusNameMap(leadStatuses);
  const created = (history?.createdRows || []).filter((row) => normalizeAgentId(row?.ASSIGNED_BY_ID) === id);
  const createdMapped = created.map((row) => mapLeadHistory(row, names, new Map(), { forceWorked: mineActs.has(String(row?.ID || "")) }));

  const worked = new Map();
  for (const item of createdMapped) {
    if (!item.id) continue;
    if (item.worked || mineActs.has(item.id)) {
      worked.set(item.id, { ...item, worked: true, verify: mineActs.has(item.id) ? "activity" : "created_status" });
    }
  }
  // Activity on leads assigned to this agent but not in created-in-period list
  for (const leadId of mineActs) {
    if (worked.has(leadId)) continue;
    const fromHist = [...(history?.worked || []), ...(history?.idle || [])].find((row) => String(row.id) === leadId);
    if (fromHist && normalizeAgentId(fromHist.assignedById) === id) {
      worked.set(leadId, { ...fromHist, worked: true, verify: "activity" });
    }
  }

  const idle = createdMapped
    .filter((item) => item.id && !worked.has(item.id))
    .map((item) => ({ ...item, worked: false, verify: "assigned_idle" }));

  // Ignore DATE_MODIFY-only old leads (common false "worked" noise).
  return {
    worked: [...worked.values()],
    idle,
    ignoredModifyOnly: (history?.worked || []).filter(
      (row) => !worked.has(String(row.id)) && !inRange(row.created, from, to)
    ).length,
  };
}

export async function fetchShareReport({ agentId, from, to } = {}) {
  const token = String(process.env.BITRIX_SHARE_REPORT_TOKEN || "").trim();
  const base = String(process.env.BITRIX_SHARE_REPORT_URL || "https://crm.a7grouprealestatedxb.com/bitrix/tools/a7_lead_share_report.php").trim();
  if (!token) {
    return { ok: false, error: "Share report token is not configured", sharedOut: [], sharedIn: [], idleAlerts: [], totals: {} };
  }
  const url = new URL(base);
  url.searchParams.set("token", token);
  url.searchParams.set("agentId", String(agentId));
  if (from) url.searchParams.set("from", String(from).slice(0, 19).replace("T", " "));
  if (to) url.searchParams.set("to", String(to).slice(0, 19).replace("T", " "));
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    return {
      ok: false,
      error: body?.error || `Share report failed (${res.status})`,
      sharedOut: [],
      sharedIn: [],
      idleAlerts: [],
      totals: {},
    };
  }
  return body;
}

function shareReportBase() {
  const token = String(process.env.BITRIX_SHARE_REPORT_TOKEN || "").trim();
  const base = String(
    process.env.BITRIX_SHARE_REPORT_URL || "https://crm.a7grouprealestatedxb.com/bitrix/tools/a7_lead_share_report.php"
  ).trim();
  return { token, base };
}

/** One office-wide pull when the Bitrix share tool accepts scope=office. */
async function fetchOfficeScope({ from, to } = {}) {
  const { token, base } = shareReportBase();
  if (!token) {
    return { ok: false, error: "Share report token is not configured" };
  }
  const url = new URL(base);
  url.searchParams.set("token", token);
  url.searchParams.set("scope", "office");
  if (from) url.searchParams.set("from", String(from).slice(0, 19).replace("T", " "));
  if (to) url.searchParams.set("to", String(to).slice(0, 19).replace("T", " "));
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const body = await res.json().catch(() => ({}));
  const error = String(body?.error || "");
  if (/unauthor|token/i.test(error) || res.status === 401 || res.status === 403) {
    return { ok: false, error: error || "Unauthorized" };
  }
  if (Array.isArray(body?.shares) || body?.scope === "office") {
    return {
      ok: body?.ok !== false,
      error,
      shares: body.shares || body.sharedOut || [],
    };
  }
  return { unsupported: true };
}

export function normalizeOfficeShare(row, fallback = {}) {
  const leadId = String(row?.leadId || "").replace(/\D/g, "");
  if (!leadId) return null;
  return {
    leadId,
    leadTitle: maskPhoneInText(String(row?.leadTitle || "")),
    sharedById: String(row?.sharedById || fallback.agentId || "").replace(/\D/g, ""),
    sharedByName: String(row?.sharedByName || fallback.agentName || "").trim(),
    sharedToId: String(row?.sharedToId || "").replace(/\D/g, ""),
    sharedToName: String(row?.sharedToName || "").trim(),
    sharedAt: String(row?.sharedAt || "").trim(),
    worked: Boolean(row?.worked),
    workLabel: String(row?.workLabel || "").trim(),
  };
}

/** Share times from the CRM tool are Dubai wall-clock. Bitrix activity times include an offset. */
function shareInstant(value) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) return Date.parse(raw);
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(raw);
  if (!match) return Date.parse(raw);
  const time = match[2].length === 5 ? `${match[2]}:00` : match[2];
  return Date.parse(`${match[1]}T${time}+04:00`);
}

function asRows(body) {
  if (Array.isArray(body?.result)) return body.result;
  if (Array.isArray(body?.result?.items)) return body.result.items;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

/**
 * A shared lead is not idle when, after it was shared, the stage changed
 * or the person who received it left a comment or another activity.
 * The label is the lead's current stage.
 */
export function applyShareStages(rows, { statusNames, leads, history, comments, activities } = {}) {
  const names = statusNames instanceof Map ? statusNames : statusNameMap(statusNames || []);
  const leadById = new Map((leads || []).map((row) => [String(row?.ID || row?.id || "").replace(/\D/g, ""), row]));
  return (rows || []).map((row) => {
    const leadId = String(row?.leadId || "").replace(/\D/g, "");
    const lead = leadById.get(leadId);
    if (!lead) return row;
    const statusId = String(lead.STATUS_ID || lead.statusId || "");
    const stage = names.get(statusId) || String(lead.status || "").trim();
    const sharedAt = shareInstant(row.sharedAt);
    const toId = String(row.sharedToId || "").replace(/\D/g, "");
    const afterShare = (stamp) => {
      const at = shareInstant(stamp);
      return Number.isFinite(sharedAt) && Number.isFinite(at) && at >= sharedAt;
    };
    const stageMoved = (history || []).some((item) => (
      String(item?.OWNER_ID || item?.ownerId || "").replace(/\D/g, "") === leadId
      && afterShare(item?.CREATED_TIME || item?.CREATED || item?.at)
    ));
    const commented = (comments || []).some((item) => (
      String(item?.ENTITY_ID || item?.entityId || "").replace(/\D/g, "") === leadId
      && String(item?.AUTHOR_ID || item?.authorId || "").replace(/\D/g, "") === toId
      && afterShare(item?.CREATED || item?.at)
    ));
    const acted = (activities || []).some((item) => {
      if (String(item?.OWNER_ID || item?.ownerId || "").replace(/\D/g, "") !== leadId) return false;
      const who = String(item?.AUTHOR_ID || item?.RESPONSIBLE_ID || "").replace(/\D/g, "");
      return who === toId && afterShare(item?.CREATED || item?.at);
    });
    return {
      ...row,
      worked: stageMoved || commented || acted,
      workLabel: stage || row.workLabel,
    };
  });
}

async function loadShareStageFacts(post, leadIds) {
  const ids = [...new Set((leadIds || []).map((id) => String(id || "").replace(/\D/g, "")).filter(Boolean))].slice(0, 300);
  if (!ids.length) return { statusNames: new Map(), leads: [], history: [], comments: [], activities: [] };
  const statusBody = await post("crm.status.list", { filter: { ENTITY_ID: "STATUS" } });
  const leads = [];
  const history = [];
  const activities = [];
  for (let i = 0; i < ids.length; i += 40) {
    const chunkIds = ids.slice(i, i + 40);
    const leadBody = await post("crm.lead.list", {
      filter: { "@ID": chunkIds },
      select: ["ID", "STATUS_ID"],
    });
    leads.push(...asRows(leadBody));
    let histStart = 0;
    for (let page = 0; page < 4; page += 1) {
      const histBody = await post("crm.stagehistory.list", {
        entityTypeId: 1,
        filter: { "@OWNER_ID": chunkIds },
        order: { ID: "ASC" },
        start: histStart,
      });
      const chunk = asRows(histBody);
      history.push(...chunk);
      const next = histBody?.next ?? histBody?.result?.next;
      if (next == null || !chunk.length) break;
      histStart = next;
    }
    let actStart = 0;
    for (let page = 0; page < 4; page += 1) {
      const actBody = await post("crm.activity.list", {
        filter: { OWNER_TYPE_ID: 1, "@OWNER_ID": chunkIds },
        select: ["ID", "OWNER_ID", "CREATED", "AUTHOR_ID", "RESPONSIBLE_ID"],
        start: actStart,
      });
      const chunk = asRows(actBody);
      activities.push(...chunk);
      if (actBody?.next == null || !chunk.length) break;
      actStart = actBody.next;
    }
  }
  const comments = [];
  const queue = ids.slice();
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const body = await post("crm.timeline.comment.list", {
          filter: { ENTITY_ID: Number(id), ENTITY_TYPE: "lead" },
          select: ["ID", "CREATED", "AUTHOR_ID"],
        });
        for (const row of asRows(body)) comments.push({ ...row, ENTITY_ID: row.ENTITY_ID || id });
      } catch {
        /* this lead's comments stay unknown */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, () => worker()));
  return {
    statusNames: statusNameMap(Array.isArray(statusBody?.result) ? statusBody.result : []),
    leads,
    history,
    comments,
    activities,
  };
}

export async function annotateShareRows(post, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length || typeof post !== "function") return list;
  try {
    const facts = await loadShareStageFacts(post, list.map((row) => row.leadId));
    return applyShareStages(list, facts);
  } catch {
    return list;
  }
}

/** Every CRM user, including inactive, so a former employee’s shares are not dropped. */
async function listOfficeUsers(post) {
  const users = [];
  const seen = new Set();
  for (let start = 0; start < 1000; start += 50) {
    const body = await post("user.get", { start });
    const rows = Array.isArray(body?.result) ? body.result : [];
    for (const row of rows) {
      const id = String(row?.ID || row?.id || "").replace(/\D/g, "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = [row?.NAME, row?.LAST_NAME].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
      users.push({ id, name: name || `User ${id}` });
    }
    if (rows.length < 50) break;
  }
  return users;
}

/**
 * Rank every agent who worked leads in this window, highest first.
 * Same rule as the Agent Report: a lead counts only when it is assigned to
 * that agent and was created in the window, or the agent logged activity on it.
 * Activity on someone else's lead does not count.
 */
export function rankAgentsByLeadWork({
  createdLeads = [],
  activities = [],
  assignees = new Map(),
  users = [],
  from = "",
  to = "",
  leadStatuses = [],
} = {}) {
  const names = new Map();
  for (const user of users || []) {
    const id = normalizeAgentId(user?.id || user?.ID);
    const name = String(user?.name || "").trim()
      || [user?.NAME, user?.LAST_NAME].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
    if (id && name) names.set(id, name);
  }
  const createdByAgent = new Map();
  for (const row of createdLeads || []) {
    const id = normalizeAgentId(row?.ASSIGNED_BY_ID);
    if (!id) continue;
    const list = createdByAgent.get(id) || [];
    list.push(row);
    createdByAgent.set(id, list);
  }
  const actsByAgent = new Map();
  for (const row of activities || []) {
    if (String(row?.OWNER_TYPE_ID || "1") !== "1") continue;
    const agentId = normalizeAgentId(row?.RESPONSIBLE_ID);
    const leadId = String(row?.OWNER_ID || "").replace(/\D/g, "");
    if (!agentId || !leadId) continue;
    const assignedRow = assignees.get(leadId);
    const assigned = normalizeAgentId(assignedRow?.ASSIGNED_BY_ID || assignedRow);
    if (assigned !== agentId) continue;
    const set = actsByAgent.get(agentId) || new Set();
    set.add(leadId);
    actsByAgent.set(agentId, set);
  }
  const rows = [];
  for (const id of new Set([...createdByAgent.keys(), ...actsByAgent.keys()])) {
    const created = createdByAgent.get(id) || [];
    const createdIds = new Set(created.map((row) => String(row?.ID || "").replace(/\D/g, "")));
    const mineActs = [...(actsByAgent.get(id) || [])];
    const idle = mineActs
      .filter((leadId) => !createdIds.has(leadId))
      .map((leadId) => ({ id: leadId, assignedById: id }));
    const verified = verifyDailyLeadWork({
      agentId: id,
      from,
      to,
      history: { createdRows: created, worked: [], idle },
      myActivityLeadIds: mineActs,
      leadStatuses,
    });
    if (!verified.worked.length) continue;
    rows.push({
      id,
      name: names.get(id) || `User #${id}`,
      count: verified.worked.length,
    });
  }
  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return rows;
}

async function loadOfficeLeadPerformance({
  post,
  range,
  listUsers = listOfficeUsers,
  loadPages = listFilteredPages,
  loadAssignees = loadLeadAssignees,
  loadStatus = loadStatuses,
} = {}) {
  if (!range || range.mode === "all" || !range.from || !range.to) {
    return {
      rows: [],
      truncated: false,
      note: "Pick one day, one week, or a full month. Agents are ranked by leads they worked.",
    };
  }
  const from = dubaiStampToUtc(range.from) || range.from;
  const to = dubaiStampToUtc(range.to) || range.to;
  const maxPages = range.mode === "day" ? 20 : range.mode === "week" ? 40 : 60;
  const leadSelect = ["ID", "ASSIGNED_BY_ID", "STATUS_ID", "STATUS_SEMANTIC_ID", "DATE_CREATE", "DATE_MODIFY", "TITLE", "NAME", "LAST_NAME"];
  const [created, acts, meta, users] = await Promise.all([
    loadPages({
      post,
      method: "crm.lead.list",
      filter: dateFilter(from, to),
      select: leadSelect,
      maxPages,
    }),
    loadPages({
      post,
      method: "crm.activity.list",
      filter: { ...dateFilter(from, to, "CREATED"), OWNER_TYPE_ID: 1 },
      select: ["ID", "OWNER_ID", "OWNER_TYPE_ID", "RESPONSIBLE_ID", "CREATED"],
      maxPages,
    }),
    loadStatus(post),
    listUsers(post).catch(() => []),
  ]);
  const createdIds = new Set((created.rows || []).map((row) => String(row?.ID || "")));
  const need = (acts.rows || [])
    .map((row) => String(row?.OWNER_ID || "").replace(/\D/g, ""))
    .filter((id) => id && !createdIds.has(id));
  const assignees = await loadAssignees(post, need);
  for (const row of created.rows || []) assignees.set(String(row.ID || ""), row);
  const rows = rankAgentsByLeadWork({
    createdLeads: created.rows || [],
    activities: acts.rows || [],
    assignees,
    users,
    from,
    to,
    leadStatuses: meta?.leadStatuses || [],
  });
  const truncated = Boolean(created.truncated || acts.truncated);
  return {
    rows,
    truncated,
    note: truncated
      ? "Highest to lowest by leads worked. This range is long, so the oldest rows may be missing."
      : "Highest to lowest. The number is leads that agent worked — the same rule as the Agent Report.",
  };
}

export function agentSharePerformance(shares) {
  const groups = new Map();
  for (const row of shares || []) {
    const id = String(row?.sharedById || "").replace(/\D/g, "") || String(row?.sharedByName || "").trim();
    if (!id) continue;
    const name = String(row?.sharedByName || "").trim() || `User #${id}`;
    const bucket = groups.get(id) || { name, leads: new Set() };
    const leadId = String(row?.leadId || "").replace(/\D/g, "");
    if (leadId) bucket.leads.add(leadId);
    if (name && !name.startsWith("User #")) bucket.name = name;
    groups.set(id, bucket);
  }
  return [...groups.entries()]
    .map(([id, row]) => ({ id, name: row.name, count: row.leads.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function mergeOfficeShares(parts) {
  const seen = new Set();
  const rows = [];
  for (const part of parts || []) {
    const list = part?.shares || part?.sharedOut || [];
    for (const raw of list) {
      const item = normalizeOfficeShare(raw, part);
      if (!item) continue;
      const key = `${item.leadId}|${item.sharedById}|${item.sharedToId}|${item.sharedAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(item);
    }
  }
  rows.sort((a, b) => String(b.sharedAt).localeCompare(String(a.sharedAt)));
  return {
    shares: rows,
    shareCount: rows.length,
    leadCount: new Set(rows.map((row) => row.leadId)).size,
  };
}

function officeRange({ mode = "all", day = "", month = "" } = {}) {
  if (String(mode || "all").toLowerCase() === "all") {
    return { mode: "all", from: "", to: "", label: "All history" };
  }
  return reportRange({ mode, day, month });
}

export async function checkOfficeShareHistory({
  db,
  mode = "all",
  day = "",
  month = "",
  force = false,
  loadOfficeScope = fetchOfficeScope,
  listAgents = listCrmIntelligenceAgents,
  fetchShare = fetchShareReport,
  post = crmRead,
  loadPerformance = loadOfficeLeadPerformance,
} = {}) {
  const range = officeRange({ mode, day, month });
  if (range.mode !== "all" && (!range.from || !range.to || String(range.from) > String(range.to))) {
    const error = new Error("Pick a valid day, week, or month before Check.");
    error.status = 400;
    throw error;
  }
  const key = `${REPORT_CACHE_VER}:office-shares:${range.mode}:${range.from}:${range.to}`;
  const settingKey = `office_shares_${key}`;
  if (!force) {
    const fresh = memory.get(key) || (db ? await db.getSetting(settingKey, null) : null);
    if (fresh?.checkedAt && Date.now() - Number(fresh.checkedAt) < CACHE_MS && fresh.range?.label === range.label) {
      memory.set(key, fresh);
      return { ...fresh, cached: true };
    }
  }
  if (inflight.has(key)) return inflight.get(key);

  const run = (async () => {
    const performancePromise = Promise.resolve()
      .then(() => loadPerformance({ post, range }))
      .catch((error) => ({
        rows: [],
        truncated: false,
        note: error?.message || "Agent performance could not be read.",
      }));
    const scoped = await loadOfficeScope({ from: range.from, to: range.to });
    if (scoped?.error && !scoped.unsupported) {
      return {
        ok: false,
        error: scoped.error,
        range,
        leadCount: 0,
        shareCount: 0,
        shares: [],
        checkedAt: Date.now(),
      };
    }

    let merged;
    let missed = 0;
    if (Array.isArray(scoped?.shares)) {
      merged = mergeOfficeShares([{ shares: scoped.shares }]);
    } else {
      const listed = await listAgents({ db, post });
      const fromDirectory = typeof post === "function" ? await listOfficeUsers(post).catch(() => []) : [];
      const agents = fromDirectory.length ? fromDirectory : (listed?.agents || []).filter((row) => row?.id);
      if (!agents.length) {
        const error = new Error("No CRM agents to read office shares from.");
        error.status = 502;
        throw error;
      }
      const queue = agents.slice();
      const parts = [];
      let tokenError = "";
      async function worker() {
        while (queue.length && !tokenError) {
          const agent = queue.shift();
          const body = await fetchShare({ agentId: agent.id, from: range.from, to: range.to });
          if (body?.ok === false && /token|unauthor/i.test(String(body.error || ""))) {
            tokenError = body.error;
            queue.length = 0;
            return;
          }
          if (body?.ok === false) {
            missed += 1;
            continue;
          }
          parts.push({
            agentId: agent.id,
            agentName: agent.name,
            sharedOut: [
              ...(body.sharedOut || []),
              ...(body.sharedIn || []).filter((row) => row?.sharedById),
            ],
          });
        }
      }
      await Promise.all(Array.from({ length: Math.min(8, agents.length) }, () => worker()));
      if (tokenError) {
        return {
          ok: false,
          error: tokenError,
          range,
          leadCount: 0,
          shareCount: 0,
          shares: [],
          checkedAt: Date.now(),
        };
      }
      merged = mergeOfficeShares(parts);
    }

    let shares = merged.shares;
    try {
      shares = await annotateShareRows(post, shares);
    } catch {
      shares = merged.shares;
    }

    const cap = 2000;
    const perf = await performancePromise;
    const report = {
      ok: true,
      range,
      leadCount: merged.leadCount,
      shareCount: merged.shareCount,
      shares: shares.slice(0, cap),
      performance: perf.rows || [],
      performanceNote: perf.note || "",
      performanceTruncated: Boolean(perf.truncated),
      truncated: merged.shareCount > cap,
      missedAgents: missed,
      note: missed
        ? `Office share history. ${missed} agent${missed === 1 ? "" : "s"} could not be read.`
        : "Every CRM user who shared a lead, including former employees.",
      checkedAt: Date.now(),
    };
    if (report.ok) {
      memory.set(key, report);
      if (db?.setSetting) await db.setSetting(settingKey, report).catch(() => {});
    }
    return report;
  })().finally(() => inflight.delete(key));

  inflight.set(key, run);
  return run;
}

function summarizeLeads(history, leadStatuses) {
  const names = statusNameMap(leadStatuses);
  const junkIds = new Set(junkStatusIds(leadStatuses));
  const worked = history.worked || [];
  const idle = history.idle || [];
  const proceeded = worked.filter((row) => {
    const semantic = String(row.status || "").toLowerCase();
    return /progress|contact|meeting|option|booking|qualified|prospect|answer/i.test(semantic)
      || /converted|success/i.test(semantic);
  });
  const junk = [...worked, ...idle].filter((row) => {
    const id = [...junkIds].find((jid) => names.get(jid) === row.status) || "";
    return /junk/i.test(String(row.status || "")) || Boolean(id);
  });
  return {
    workedCount: worked.length,
    idleCount: idle.length,
    proceededCount: proceeded.length,
    junkCount: junk.length,
    worked,
    idle,
    proceeded,
    junk,
  };
}

/** Leads still assigned to this agent on a Meeting or Viewing stage. */
async function loadMeetingViewingLeads(post, agentId, leadStatuses) {
  const id = normalizeAgentId(agentId);
  const stageIds = [];
  const names = new Map();
  for (const row of leadStatuses || []) {
    const statusId = String(row?.STATUS_ID || "");
    const name = String(row?.NAME || "");
    if (!statusId || !isMeetingViewingStage(name)) continue;
    stageIds.push(statusId);
    names.set(statusId, name);
  }
  if (!id || !stageIds.length) return [];
  const filter = { ASSIGNED_BY_ID: id };
  if (stageIds.length === 1) filter.STATUS_ID = stageIds[0];
  else filter["@STATUS_ID"] = stageIds;
  const listed = await listFilteredPages({
    post,
    method: "crm.lead.list",
    filter,
    select: ["ID", "TITLE", "STATUS_ID", "ASSIGNED_BY_ID"],
    maxPages: 8,
  });
  const rows = [];
  const seen = new Set();
  for (const row of listed.rows || []) {
    if (normalizeAgentId(row?.ASSIGNED_BY_ID) !== id) continue;
    const leadId = String(row?.ID || "").replace(/\D/g, "");
    if (!leadId || seen.has(leadId)) continue;
    seen.add(leadId);
    rows.push({
      leadId,
      title: String(row?.TITLE || ""),
      stage: names.get(String(row?.STATUS_ID || "")) || "",
    });
  }
  return rows;
}

async function loadMeetingDone(post, agentId, from, to, leadStatuses) {
  const stageNames = new Map();
  const doneStatusIds = [];
  for (const row of leadStatuses || []) {
    const id = String(row?.STATUS_ID || "");
    const name = String(row?.NAME || "");
    if (!id) continue;
    stageNames.set(id, name);
    if (isMeetingDoneStage(name)) doneStatusIds.push(id);
  }
  if (!doneStatusIds.length) return [];
  const filter = { MOVED_BY_ID: agentId, ">=MOVED_TIME": from, "<=MOVED_TIME": to };
  if (doneStatusIds.length === 1) filter.STATUS_ID = doneStatusIds[0];
  else filter["@STATUS_ID"] = doneStatusIds;
  const leads = [];
  let start = 0;
  for (let page = 0; page < 4; page += 1) {
    const body = await post("crm.lead.list", {
      filter,
      select: ["ID", "TITLE", "STATUS_ID", "MOVED_TIME", "MOVED_BY_ID"],
      start,
    });
    const rows = Array.isArray(body?.result) ? body.result : [];
    leads.push(...rows);
    const next = Number(body?.next);
    if (!Number.isFinite(next) || rows.length < 50) break;
    start = next;
  }
  return meetingDoneWork({ leads, doneStatusIds, stageNames, from, to, agentId });
}

async function loadAgentMeetingStages(post, agentId, from, to, leadStatuses, activities) {
  const stageNames = new Map();
  for (const row of leadStatuses || []) {
    const statusId = String(row?.STATUS_ID || "");
    const name = String(row?.NAME || "");
    if (statusId) stageNames.set(statusId, name);
  }
  if (![...stageNames.values()].some((name) => isMeetingViewingStage(name))) return [];
  const id = String(agentId || "").replace(/\D/g, "");
  const assigned = await listFilteredPages({
    post,
    method: "crm.lead.list",
    filter: { ASSIGNED_BY_ID: id, ">=DATE_MODIFY": from, "<=DATE_MODIFY": to },
    select: ["ID", "TITLE", "STATUS_ID", "ASSIGNED_BY_ID", "MOVED_BY_ID", "MOVED_TIME"],
    maxPages: 6,
  });
  const leads = new Map();
  const ids = new Set();
  for (const row of assigned.rows || []) {
    const leadId = String(row?.ID || "").replace(/\D/g, "");
    if (!leadId) continue;
    ids.add(leadId);
    leads.set(leadId, row);
  }
  for (const row of activities || []) {
    if (String(row?.OWNER_TYPE_ID || "1") !== "1") continue;
    const leadId = String(row?.OWNER_ID || "").replace(/\D/g, "");
    if (leadId) ids.add(leadId);
  }
  const idList = [...ids].slice(0, 240);
  const history = [];
  for (let i = 0; i < idList.length; i += 40) {
    const chunk = idList.slice(i, i + 40);
    let start = 0;
    for (let page = 0; page < 4; page += 1) {
      const body = await post("crm.stagehistory.list", {
        entityTypeId: 1,
        filter: { "@OWNER_ID": chunk },
        order: { ID: "DESC" },
        start,
      });
      const chunkRows = asRows(body);
      history.push(...chunkRows);
      const next = body?.next ?? body?.result?.next;
      if (next == null || !chunkRows.length) break;
      start = next;
    }
  }
  const missing = [...ids].filter((leadId) => !leads.has(leadId)).slice(0, 80);
  if (missing.length) {
    const extra = await listFilteredPages({
      post,
      method: "crm.lead.list",
      filter: { "@ID": missing },
      select: ["ID", "TITLE", "STATUS_ID", "ASSIGNED_BY_ID", "MOVED_BY_ID", "MOVED_TIME"],
      maxPages: 3,
    });
    for (const row of extra.rows || []) {
      const leadId = String(row?.ID || "").replace(/\D/g, "");
      if (leadId) leads.set(leadId, row);
    }
  }
  return agentMeetingStageChanges({ history, stageNames, from, to, agentId: id, leads });
}

async function loadClosedDeals(post, agentId, from, to) {
  const statusBody = await post("crm.status.list", {});
  const stageNames = new Map();
  for (const row of asRows(statusBody)) {
    const entity = String(row?.ENTITY_ID || "");
    if (!entity.startsWith("DEAL_STAGE")) continue;
    stageNames.set(String(row?.STATUS_ID || ""), String(row?.NAME || ""));
  }
  const listed = await listFilteredPages({
    post,
    method: "crm.deal.list",
    filter: {
      ASSIGNED_BY_ID: String(agentId || "").replace(/\D/g, ""),
      ">=CLOSEDATE": String(from || "").slice(0, 10),
      "<=CLOSEDATE": String(to || "").slice(0, 10),
    },
    select: ["ID", "TITLE", "STAGE_ID", "STAGE_SEMANTIC_ID", "OPPORTUNITY", "CURRENCY_ID", "CLOSEDATE", "ASSIGNED_BY_ID", "MOVED_BY_ID", "LEAD_ID"],
    maxPages: 6,
  });
  return closedDealRows(listed.rows || [], { agentId, from, to, stageNames });
}

async function loadOptionSentWork(post, from, to, activities, leadsById, leadStatuses) {
  const optionStatusIds = (leadStatuses || [])
    .filter((row) => /^option sent$/i.test(String(row?.NAME || "")))
    .map((row) => String(row.STATUS_ID || ""))
    .filter(Boolean);
  const calls = (activities || []).filter((row) => String(row?.TYPE_ID || "") === "2" && String(row?.OWNER_TYPE_ID || "1") === "1");
  const ids = [...new Set(calls.map((row) => String(row?.OWNER_ID || "").replace(/\D/g, "")).filter(Boolean))].slice(0, 80);
  if (!ids.length || !optionStatusIds.length) return [];
  const history = [];
  for (let index = 0; index < ids.length; index += 40) {
    const chunk = ids.slice(index, index + 40);
    const body = await post("crm.stagehistory.list", {
      entityTypeId: 1,
      filter: { "@OWNER_ID": chunk },
      order: { ID: "DESC" },
      start: 0,
    });
    const rows = Array.isArray(body?.result?.items) ? body.result.items : Array.isArray(body?.result) ? body.result : [];
    history.push(...rows);
  }
  return optionSentWork({ history, calls, leads: leadsById, from, to, optionStatusIds });
}

async function loadOwnerWork(post, agentId, from, to) {
  const body = await post("crm.item.list", {
    entityTypeId: 1042,
    filter: { updatedBy: agentId, ">=updatedTime": from, "<=updatedTime": to },
    select: ["id", "title", "updatedTime", "updatedBy", "stageId"],
    start: 0,
  });
  const items = Array.isArray(body?.result?.items) ? body.result.items : [];
  const stageNames = new Map();
  for (const entity of ["DYNAMIC_1042_STAGE_13", "DYNAMIC_1042_STAGE_14"]) {
    const status = await post("crm.status.list", { filter: { ENTITY_ID: entity } }).catch(() => null);
    for (const row of status?.result || []) stageNames.set(String(row.STATUS_ID || ""), String(row.NAME || ""));
  }
  const comments = [];
  const queue = items.map((row) => String(row.id || "")).filter(Boolean).slice(0, 40);
  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const listed = await post("crm.timeline.comment.list", {
          filter: { ENTITY_ID: Number(id), ENTITY_TYPE: "dynamic_1042" },
          select: ["ID", "COMMENT", "CREATED", "AUTHOR_ID"],
          order: { ID: "DESC" },
        });
        const rows = Array.isArray(listed?.result) ? listed.result : [];
        for (const row of rows) {
          if (!inRange(row?.CREATED, from, to)) continue;
          comments.push({ ...row, ENTITY_ID: id });
        }
      } catch {
        /* this card's note stays as an update */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, () => worker()));
  return ownerDataWork({ items, comments, stageNames, agentId });
}

export async function checkAgentDailyReport({
  db,
  agentId,
  agentName,
  mode,
  day,
  month,
  period,
  from,
  to,
  force = false,
  post = crmRead,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let id = normalizeAgentId(agentId);
  if (!id && String(agentName || "").trim()) {
    const found = await resolveCrmAgent({ post, name: agentName, includeInactive: true });
    if (!found) {
      const error = new Error("This name is not in CRM. Check spelling or pick from the list.");
      error.status = 404;
      throw error;
    }
    id = found.id;
  }
  if (!id) {
    const error = new Error("Search and select an agent first — Bitrix is only called after Check.");
    error.status = 400;
    throw error;
  }

  const range = reportRange({ mode, day, month, period, from, to });
  // Reject inverted / empty ranges so day/month never silently return another window.
  if (!range.from || !range.to || String(range.from) > String(range.to)) {
    const error = new Error("Pick a valid date range before Check.");
    error.status = 400;
    throw error;
  }
  const key = `${REPORT_CACHE_VER}:daily:${id}:${range.from}:${range.to}`;
  const settingKey = `agent_daily_${key}`;
  if (!force) {
    const fresh = memory.get(key) || (db ? await db.getSetting(settingKey, null) : null);
    if (fresh?.checkedAt && Date.now() - Number(fresh.checkedAt) < CACHE_MS) {
      // Never return a cached payload for a different agent/range.
      if (normalizeAgentId(fresh.agentId) === id && fresh.range?.from === range.from && fresh.range?.to === range.to) {
        memory.set(key, fresh);
        return { ...fresh, cached: true };
      }
    }
  }
  if (inflight.has(key)) return inflight.get(key);

  const run = (async () => {
    const user = await loadUser(post, id);
    const meta = await loadStatuses(post);
    // Bitrix stores instants as UTC. The report day is a Dubai calendar day.
    const bitrixFrom = dubaiStampToUtc(range.from) || range.from;
    const bitrixTo = dubaiStampToUtc(range.to) || range.to;
    // Activities first — real calls/meetings prove work even if status still looks idle.
    const acts = await loadActivities(post, sleep, id, bitrixFrom, bitrixTo);
    const activityOwnerIds = (acts.activities || [])
      .filter((row) => String(row.OWNER_TYPE_ID || "1") === "1")
      .map((row) => String(row.OWNER_ID || ""))
      .filter(Boolean);
    // Only activities on leads Bitrix assigns to THIS agent count toward "leads worked".
    const leadRowsById = await loadLeadAssignees(post, activityOwnerIds);
    const myActivityLeadIds = activityOwnerIds.filter((leadId) => {
      const row = leadRowsById.get(String(leadId));
      return normalizeAgentId(row?.ASSIGNED_BY_ID) === id;
    });
    const history = await loadAgentHistory({
      post,
      sleep,
      agentId: id,
      from: bitrixFrom,
      to: bitrixTo,
      period: range.period,
      leadStatuses: meta.leadStatuses,
      dealStages: [],
      sources: meta.sources,
      activityLeadIds: myActivityLeadIds,
    });
    const verified = verifyDailyLeadWork({
      agentId: id,
      from: bitrixFrom,
      to: bitrixTo,
      history,
      myActivityLeadIds,
      leadStatuses: meta.leadStatuses,
    });
    // Enrich activity-only worked rows that were missing titles from assignee fetch.
    for (const row of verified.worked) {
      if (row.title && row.title !== `Lead #${row.id}`) continue;
      const raw = leadRowsById.get(String(row.id));
      if (!raw) continue;
      const mapped = mapLeadHistory(raw, statusNameMap(meta.leadStatuses), statusNameMap(meta.sources), { forceWorked: true });
      Object.assign(row, mapped, { worked: true, verify: row.verify || "activity" });
    }
    const leadIdsForTl = [
      ...verified.worked.map((row) => row.id),
      ...verified.idle.map((row) => row.id),
      ...(history.createdRows || []).map((row) => String(row.ID || "")),
    ];
    const tlActs = await loadTeamLeadActions(post, sleep, id, leadIdsForTl, bitrixFrom, bitrixTo);
    const verifiedHistory = { worked: verified.worked, idle: verified.idle };
    const leadSummary = summarizeLeads(verifiedHistory, meta.leadStatuses);
    const share = await fetchShareReport({ agentId: id, from: range.from, to: range.to });
    const sharedOut = await annotateShareRows(post, share.sharedOut || []);
    const sharedIn = await annotateShareRows(post, share.sharedIn || []);
    const sharedOutStats = shareLeadBuckets(sharedOut);
    const sharedInStats = shareLeadBuckets(sharedIn);
    const sharedOutWorked = sharedOutStats.workedCount;
    const sharedOutIdle = sharedOutStats.idleCount;
    const noteDay = range.mode === "day" ? range.label : "";
    const noteMonth = range.mode === "month" ? range.label : String(range.from || "").slice(0, 7);
    const optionSent = await loadOptionSentWork(post, bitrixFrom, bitrixTo, acts.activities, leadRowsById, meta.leadStatuses).catch(() => []);
    const ownerWork = await loadOwnerWork(post, id, bitrixFrom, bitrixTo).catch(() => []);
    const stageChanged = await loadAgentMeetingStages(post, id, bitrixFrom, bitrixTo, meta.leadStatuses, acts.activities).catch(() => []);
    const meetingDone = await loadMeetingDone(post, id, bitrixFrom, bitrixTo, meta.leadStatuses).catch(() => []);
    const meetingStages = mergeMeetingRows(stageChanged, meetingDone);
    const closedDeals = await loadClosedDeals(post, id, bitrixFrom, bitrixTo).catch(() => []);
    let calls = callRecords(acts.activities, { leads: leadRowsById, sourceNames: statusNameMap(meta.sources) });
    if (db?.allLeads) {
      const deskLeads = await db.allLeads().catch(() => []);
      calls = mergeDeskCallRecordings(calls, deskLeads, { agentName: personName(user), from: range.from, to: range.to });
    }
    const tlNotes = await listTlNotes(db, {
      agentId: id,
      day: noteDay,
      month: range.mode === "month" ? noteMonth : "",
    });

    const report = {
      ok: true,
      cached: false,
      checkedAt: Date.now(),
      cacheUntil: Date.now() + CACHE_MS,
      agentId: id,
      agentName: personName(user),
      range,
      note: "Verified from Bitrix: leads worked = assigned to this agent AND (created in this period or agent activity on that lead). Activities on other agents' leads are listed under Activities only. Shared in/out comes from the lead-share tool.",
      verify: {
        bitrixCreatedAssigned: (history.createdRows || []).length,
        activityOnOwnLeads: myActivityLeadIds.length,
        activityTotal: (acts.activities || []).length,
        ignoredModifyOnly: verified.ignoredModifyOnly,
      },
      summary: {
        leadsWorked: leadSummary.workedCount,
        leadsNotWorked: leadSummary.idleCount,
        leadsProceeded: leadSummary.proceededCount,
        leadsJunk: leadSummary.junkCount,
        meetings: meetingStages.length,
        meetingViewings: meetingStages.length,
        closedDeals: closedDeals.length,
        activities: acts.activitiesCount,
        calls: calls.length,
        tlActions: tlActs.rows.length,
        sharedOut: sharedOutStats.count,
        sharedOutWorked,
        sharedOutIdle,
        sharedIn: sharedInStats.count,
        idleAlerts: sharedOutIdle,
        optionSent: optionSent.length,
        ownerWork: ownerWork.length,
      },
      crmLeadIds: crmLeadIdsForReport({
        worked: leadSummary.worked,
        idle: leadSummary.idle,
        proceeded: leadSummary.proceeded,
        junk: leadSummary.junk,
        meetings: meetingStages,
        activities: acts.activities,
        tlRows: tlActs.rows,
        sharedOut,
        sharedIn,
      }),
      leads: {
        worked: leadSummary.worked,
        notWorked: leadSummary.idle,
        proceeded: leadSummary.proceeded,
        junk: leadSummary.junk,
        truncated: Boolean(history.truncated),
      },
      activities: {
        meetings: (acts.meetings || []).map(mapActivityRow),
        rows: (acts.activities || []).map(mapActivityRow),
        truncated: Boolean(acts.truncated),
      },
      teamLeadActions: {
        rows: tlActs.rows || [],
        truncated: Boolean(tlActs.truncated),
        error: tlActs.error || "",
      },
      tlNotes,
      optionSent,
      ownerWork,
      meetingStages,
      meetingViewingLeads: [],
      closedDeals,
      calls,
      shares: {
        ok: share.ok !== false,
        error: share.error || "",
        sharedOut,
        sharedIn,
        idleAlerts: sharedOut.filter((row) => !row.worked),
        totals: share.totals || {},
      },
    };
    memory.set(key, report);
    if (db?.setSetting) await db.setSetting(settingKey, report).catch(() => {});
    return report;
  })().finally(() => inflight.delete(key));

  inflight.set(key, run);
  return run;
}
