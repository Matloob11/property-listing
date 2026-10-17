import { callRest } from "./bitrixCrm.js";
import { PF_LEAD_SOURCE, PF_LEAD_UF, bitrixLeadSyncReady } from "./bitrixLeadSync.js";

export const CRM_PORTAL_SOURCES = [
  { id: "UC_Y3VNS9", portal: "bayut", channel: "whatsapp" },
  { id: "UC_4FVN3G", portal: "bayut", channel: "email" },
  { id: "UC_PCVWT4", portal: "bayut", channel: "call" },
  { id: "UC_BUIJB2", portal: "dubizzle", channel: "whatsapp" },
  { id: "UC_LX9888", portal: "dubizzle", channel: "email" },
  { id: "UC_JPSVQU", portal: "dubizzle", channel: "call" },
  { id: "UC_7J0E2Q", portal: "other", channel: "whatsapp" },
  { id: "UC_APID5E", portal: "other", channel: "whatsapp" },
  { id: "UC_VX4335", portal: "other", channel: "whatsapp" },
];

const PF_SOURCE_IDS = new Set(Object.values(PF_LEAD_SOURCE));
const SOURCE_BY_ID = new Map(CRM_PORTAL_SOURCES.map((row) => [row.id, row]));
const SELECT = [
  "ID",
  "TITLE",
  "NAME",
  "LAST_NAME",
  "SOURCE_ID",
  "STATUS_ID",
  "DATE_CREATE",
  "DATE_MODIFY",
  "PHONE",
  "EMAIL",
  "ASSIGNED_BY_ID",
  PF_LEAD_UF.reference,
];

function str(value) {
  return String(value || "").trim();
}

export function isPfCrmSource(sourceId) {
  return PF_SOURCE_IDS.has(str(sourceId));
}

export function crmPortalSource(sourceId) {
  return SOURCE_BY_ID.get(str(sourceId)) || null;
}

export function crmLeadId(bitrixId) {
  const id = str(bitrixId);
  return id ? `crm-${id}` : "";
}

function bitrixSince(iso) {
  const dated = new Date(iso);
  if (Number.isNaN(dated.getTime())) return "";
  dated.setUTCMinutes(dated.getUTCMinutes() - 90);
  const dubai = new Date(dated.getTime() + 4 * 3600 * 1000);
  return dubai.toISOString().slice(0, 19).replace("T", " ");
}

export function crmDateToIso(value) {
  const raw = str(value).replace(" ", "T");
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const dated = new Date(`${raw}+04:00`);
    return Number.isNaN(dated.getTime()) ? raw : dated.toISOString();
  }
  const dated = new Date(raw);
  return Number.isNaN(dated.getTime()) ? raw : dated.toISOString();
}

function firstMulti(value) {
  if (Array.isArray(value) && value.length) {
    const row = value[0] || {};
    return str(row.VALUE || row.value || row);
  }
  if (value && typeof value === "object") return str(value.VALUE || value.value);
  return str(value);
}

export function inferCrmChannel(row, fallback) {
  const title = str(row?.TITLE).toLowerCase();
  if (/\bemail\b/.test(title)) return "email";
  if (/\bcall\b/.test(title)) return "call";
  if (/\bsms\b/.test(title)) return "sms";
  if (/\bwhats?app\b/.test(title)) return "whatsapp";
  return fallback || "whatsapp";
}

export function crmLeadName(row) {
  const person = [row?.NAME, row?.LAST_NAME].map(str).filter(Boolean).join(" ");
  if (person) return person;
  return str(row?.TITLE).replace(/^(Bayut|Dubizzle|Property Finder)\s+(WhatsApp|Call|Email)\s*[—\-:]+/i, "").trim() || "Lead";
}

export function mapCrmPortalLead(row, listingsByRef = new Map()) {
  const source = crmPortalSource(row?.SOURCE_ID);
  if (!source || isPfCrmSource(row?.SOURCE_ID)) return null;
  const bitrixId = str(row?.ID);
  if (!bitrixId) return null;
  const reference = str(row?.[PF_LEAD_UF.reference]);
  const listing = reference ? listingsByRef.get(reference.toLowerCase()) : null;
  return {
    id: crmLeadId(bitrixId),
    channel: inferCrmChannel(row, source.channel),
    status: str(row?.STATUS_ID).toLowerCase() || "new",
    created_at: crmDateToIso(row?.DATE_CREATE),
    entity_type: source.portal,
    pf_listing_id: "",
    reference,
    listing_id: listing?.id || "",
    sender_name: crmLeadName(row),
    sender_phone: firstMulti(row?.PHONE),
    sender_email: firstMulti(row?.EMAIL),
    agent_pf_profile: "",
    agent_name: "",
    response_link: "",
    call_talk_time: 0,
    call_wait_time: 0,
    call_record: "",
    tags: [source.portal],
    raw: { source_id: str(row?.SOURCE_ID), title: str(row?.TITLE) },
    bitrix_id: bitrixId,
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listSourceLeads(sourceId, { bx, start = 0, since = "" }) {
  const filter = { SOURCE_ID: sourceId };
  if (since) filter[">=DATE_MODIFY"] = since;
  return bx({}, "crm.lead.list", {
    filter,
    select: SELECT,
    order: { ID: "DESC" },
    start,
  });
}

export async function pullCrmPortalLeads(
  db,
  { bx = callRest, sleep = defaultSleep, maxPages = 250, ready = bitrixLeadSyncReady } = {}
) {
  if (!ready()) {
    return { skipped: true, reason: "no_webhook", fetched: 0, upserted: 0 };
  }
  const prev = (await db.getSetting("crm_lead_sync", {})) || {};
  const since = bitrixSince(prev.ok && prev.at ? prev.at : "");
  const listingsByRef = new Map();
  for (const row of await db.all()) {
    const ref = str(row.reference).toLowerCase();
    if (ref) listingsByRef.set(ref, row);
  }
  const summary = {
    fetched: 0,
    upserted: 0,
    sources: {},
    errors: [],
    since: since || "",
  };
  for (const source of CRM_PORTAL_SOURCES) {
    let start = 0;
    let got = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const out = await listSourceLeads(source.id, { bx, start, since });
      if (!out.ok) {
        summary.errors.push(`${source.portal} ${source.channel}: ${out.error || "crm.lead.list failed"}`);
        break;
      }
      const rows = Array.isArray(out.result) ? out.result : [];
      const mapped = rows.map((row) => mapCrmPortalLead(row, listingsByRef)).filter(Boolean);
      got += rows.length;
      if (mapped.length) summary.upserted += await db.upsertLeads(mapped);
      if (rows.length < 50) break;
      start += 50;
      await sleep(200);
    }
    summary.sources[`${source.portal}_${source.channel}`] = got;
    summary.fetched += got;
  }
  const saved = {
    ok: summary.errors.length === 0,
    at: new Date().toISOString(),
    fetched: summary.fetched,
    upserted: summary.upserted,
    sources: summary.sources,
    errors: summary.errors.slice(0, 5),
  };
  await db.setSetting("crm_lead_sync", saved).catch(() => {});
  return summary;
}

let pulling = null;

export function pullCrmPortalLeadsLocked(db) {
  if (pulling) return pulling;
  pulling = pullCrmPortalLeads(db).finally(() => {
    pulling = null;
  });
  return pulling;
}

export function scheduleCrmLeadSync(db) {
  const run = () =>
    pullCrmPortalLeadsLocked(db).catch((error) => console.error("CRM portal lead sync failed:", error.message));
  setTimeout(run, 90000);
  setInterval(run, 3 * 60 * 1000);
}
