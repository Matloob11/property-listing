/** Team Lead comments from the lead-card box, for one person and a date range. */
import { crmRead, normalizeAgentId } from "./crmIntelligence.js";
import { reportRange } from "./agentDailyReport.js";
import { dubaiStampToUtc } from "./officeLeads.js";

const PEOPLE_KEY = "team_lead_report_people_v1";
const REPORT_URL = "https://crm.a7grouprealestatedxb.com/bitrix/tools/a7_tl_comments_report.php";

export const TEAM_LEADS = [
  { id: "2560", name: "Hassan TL" },
  { id: "2551", name: "Hussnain" },
  { id: "2297", name: "Javeria" },
  { id: "2298", name: "Asma" },
  { id: "2302", name: "Fozia" },
  { id: "2299", name: "Farhat" },
];

function personName(row) {
  return [row?.NAME, row?.LAST_NAME].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

export async function listTeamLeadPeople(db) {
  const saved = db?.getSetting ? await db.getSetting(PEOPLE_KEY, []) : [];
  const extras = Array.isArray(saved) ? saved : [];
  const seen = new Set(TEAM_LEADS.map((row) => row.id));
  const people = TEAM_LEADS.map((row) => ({ ...row, extra: false }));
  for (const row of extras) {
    const id = normalizeAgentId(row?.id);
    const name = String(row?.name || "").replace(/\s+/g, " ").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    people.push({ id, name, extra: true });
  }
  return people;
}

async function saveExtras(db, people) {
  const extras = people.filter((row) => row.extra).map((row) => ({ id: row.id, name: row.name }));
  if (db?.setSetting) await db.setSetting(PEOPLE_KEY, extras);
  return people;
}

export async function addTeamLeadPerson(db, { id = "", name = "" } = {}) {
  const people = await listTeamLeadPeople(db);
  const givenId = normalizeAgentId(id);
  if (givenId) {
    const known = people.find((row) => row.id === givenId);
    if (known) return { ok: true, leaders: people, added: known };
    const label = String(name || "").replace(/\s+/g, " ").trim() || `User #${givenId}`;
    people.push({ id: givenId, name: label, extra: true });
    return { ok: true, leaders: await saveExtras(db, people), added: people[people.length - 1] };
  }
  const query = String(name || "").replace(/\s+/g, " ").trim();
  if (query.length < 2) {
    const error = new Error("Type a person's name.");
    error.status = 400;
    throw error;
  }
  const body = await crmRead("user.search", { FIND: query });
  const hits = (Array.isArray(body?.result) ? body.result : [])
    .map((row) => ({
      id: normalizeAgentId(row?.ID),
      name: personName(row),
      active: row?.ACTIVE !== false && row?.ACTIVE !== "N",
    }))
    .filter((row) => row.id && row.name && row.active);
  const exact = hits.filter((row) => row.name.toLowerCase() === query.toLowerCase());
  const pick = exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null;
  if (!pick) return { ok: true, leaders: people, matches: hits.slice(0, 8) };
  if (!people.some((row) => row.id === pick.id)) {
    people.push({ id: pick.id, name: pick.name, extra: true });
    await saveExtras(db, people);
  }
  return { ok: true, leaders: people, added: pick };
}

export async function removeTeamLeadPerson(db, id) {
  const key = normalizeAgentId(id);
  if (TEAM_LEADS.some((row) => row.id === key)) {
    const error = new Error("That team lead stays on the list.");
    error.status = 400;
    throw error;
  }
  const people = (await listTeamLeadPeople(db)).filter((row) => row.id !== key);
  return { ok: true, leaders: await saveExtras(db, people) };
}

async function fetchTlComments(userId, from, to) {
  const token = String(process.env.BITRIX_SHARE_REPORT_TOKEN || "").trim();
  if (!token) {
    const error = new Error("Team lead comments are not connected.");
    error.status = 503;
    throw error;
  }
  const url = new URL(REPORT_URL);
  url.searchParams.set("token", token);
  url.searchParams.set("userId", String(userId));
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    const error = new Error(body?.error || "Could not read team lead comments.");
    error.status = res.status || 502;
    throw error;
  }
  return Array.isArray(body.items) ? body.items : [];
}

export function shapeTlComments(items = []) {
  return (items || []).map((row) => ({
    id: String(row?.id || ""),
    leadId: String(row?.leadId || "").replace(/\D/g, ""),
    title: String(row?.title || "").trim() || `Lead #${row?.leadId || ""}`,
    responsibleId: String(row?.responsibleId || "").replace(/\D/g, ""),
    responsibleName: String(row?.responsibleName || "").trim() || "—",
    authorId: String(row?.authorId || "").replace(/\D/g, ""),
    authorName: String(row?.authorName || "").trim(),
    rating: Number(row?.rating) || 0,
    text: String(row?.text || "").trim(),
    when: String(row?.createdAt || ""),
  })).filter((row) => row.leadId && row.text);
}

export async function checkTeamLeadReport({
  db,
  leaderId,
  mode = "day",
  day = "",
  month = "",
  from = "",
  to = "",
} = {}) {
  const people = await listTeamLeadPeople(db);
  const id = normalizeAgentId(leaderId);
  const leader = people.find((row) => row.id === id);
  if (!leader) {
    const error = new Error("Select a person from the list.");
    error.status = 400;
    throw error;
  }
  const range = reportRange({ mode, day, month, from, to });
  if (!range.from || !range.to || String(range.from) > String(range.to)) {
    const error = new Error("Pick a valid date range.");
    error.status = 400;
    throw error;
  }
  const bitrixFrom = dubaiStampToUtc(range.from) || range.from;
  const bitrixTo = dubaiStampToUtc(range.to) || range.to;
  const items = await fetchTlComments(leader.id, bitrixFrom, bitrixTo);
  const comments = shapeTlComments(items);
  return {
    ok: true,
    leader,
    leaders: people,
    range,
    count: comments.length,
    comments,
  };
}
