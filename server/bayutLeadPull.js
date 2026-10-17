import { leadDateKey } from "./leadDate.js";
import { leadPortal } from "./leadPortal.js";

const TYPES = ["email", "sms", "whatsapp_leads", "call_logs"];
const ENDPOINT = "https://www.bayut.com/api-v7/stats/website-client-leads";
const SETTING = "bayut_lead_pull";

function text(value) {
  if (value == null || typeof value === "object") return "";
  return String(value).trim();
}

function fromKeys(obj, pattern) {
  if (!obj || typeof obj !== "object") return "";
  for (const [key, value] of Object.entries(obj)) {
    if (pattern.test(key)) {
      const found = text(value);
      if (found) return found;
    }
  }
  return "";
}

function createdAt(value) {
  const raw = text(value);
  if (!raw) return new Date().toISOString();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const zoned = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}+04:00`;
  const dated = new Date(zoned);
  return Number.isNaN(dated.getTime()) ? new Date().toISOString() : dated.toISOString();
}

function phoneTail(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

function channelFor(type) {
  if (type === "call_logs") return "call";
  if (type === "whatsapp_leads") return "whatsapp";
  if (type === "sms") return "sms";
  return "email";
}

function leadStatus(row, channel) {
  const raw = text(row.call_status).toLowerCase();
  if (channel === "call" && raw.includes("miss")) return "missed";
  if (channel === "call" && (raw.includes("answer") || raw.includes("connect"))) return "answered";
  return "new";
}

export function samePortalLead(existing, incoming) {
  if (leadPortal(existing) !== (incoming.entity_type || leadPortal(incoming))) return false;
  if (String(existing.channel || "") !== String(incoming.channel || "")) return false;
  if (leadDateKey(existing.created_at) !== leadDateKey(incoming.created_at)) return false;
  const left = phoneTail(existing.sender_phone);
  const right = phoneTail(incoming.sender_phone);
  if (!left || !right || left !== right) return false;
  const a = String(existing.reference || "").toLowerCase();
  const b = String(incoming.reference || "").toLowerCase();
  return !a || !b || a === b;
}
export function bayutTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

export function mapBayutStatLead(row, type) {
  if (!row || typeof row !== "object") return null;
  const externalId = text(row.lead_id || row.call_log_id);
  if (!externalId) return null;
  const detail = row.detail && typeof row.detail === "object" ? row.detail : {};
  const name = fromKeys(row, /name/i) || fromKeys(detail, /name/i);
  const phone = fromKeys(detail, /cell|phone|mobile/i) || fromKeys(row, /cell|phone|mobile|caller_number/i);
  const email = fromKeys(detail, /email|mail/i) || fromKeys(row, /email|mail/i);
  if (!name && !phone && !email) return null;
  const source = text(row.source).toLowerCase();
  const portal = source.includes("dubizzle") ? "dubizzle" : "bayut";
  const channel = channelFor(type);
  const when = row.date_time || [row.date, row.time].filter(Boolean).join(" ") || row.call_time;
  return {
    id: `${portal}-${channel}-${externalId}`,
    channel,
    status: leadStatus(row, channel),
    created_at: createdAt(when),
    entity_type: portal,
    pf_listing_id: "",
    reference: text(row.listing_reference || row.reference),
    listing_id: "",
    sender_name: name,
    sender_phone: phone,
    sender_email: email,
    agent_pf_profile: "",
    agent_name: text(row.agent_name),
    response_link: "",
    call_talk_time: 0,
    call_wait_time: 0,
    call_record: "",
    tags: [portal],
    raw: { type, lead_id: externalId, source: text(row.source) },
    bitrix_id: "",
  };
}

async function readJson(res) {
  const textBody = await res.text();
  try {
    return JSON.parse(textBody);
  } catch {
    return [];
  }
}

export async function pullBayutStatLeads(db, { fetchImpl = fetch, now = Date.now() } = {}) {
  const key = String(process.env.BAYUT_LEADS_API_KEY || "").trim();
  if (!key) return { skipped: true, reason: "no_key", upserted: 0 };
  const prev = (await db.getSetting(SETTING, {})) || {};
  const caughtUp = Array.isArray(prev.types) && TYPES.every((type) => prev.types.includes(type));
  const sinceMs = prev.ok && prev.at && caughtUp ? Date.parse(prev.at) : now - 180 * 86400000;
  const overlapMs = prev.ok && prev.at && caughtUp ? 6 * 60 * 60 * 1000 : 0;
  const stamp = bayutTimestamp(sinceMs - overlapMs);
  const counts = {};
  let upserted = 0;
  const stored = await db.allLeads();
  const known = new Map();
  const remember = (lead) => {
    const tail = phoneTail(lead.sender_phone);
    const portal = lead.entity_type || leadPortal(lead);
    if (!tail || (portal !== "bayut" && portal !== "dubizzle")) return;
    const key = [portal, lead.channel || "", leadDateKey(lead.created_at), tail].join("|");
    if (!known.has(key)) known.set(key, new Set());
    known.get(key).add(String(lead.reference || "").toLowerCase());
  };
  for (const lead of stored) remember(lead);
  for (const type of TYPES) {
    const url = `${ENDPOINT}?type=${encodeURIComponent(type)}&timestamp=${encodeURIComponent(stamp)}`;
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 429) return { ok: false, retry: true, upserted, counts };
    if (!res.ok) {
      console.error(`Bayut ${type} lead pull failed: ${res.status}`);
      return { ok: false, upserted, counts };
    }
    const body = await readJson(res);
    const leads = (Array.isArray(body) ? body : [])
      .map((row) => mapBayutStatLead(row, type))
      .filter((lead) => {
        if (!lead) return false;
        const tail = phoneTail(lead.sender_phone);
        const key = [lead.entity_type, lead.channel, leadDateKey(lead.created_at), tail].join("|");
        const refs = tail ? known.get(key) : null;
        const ref = String(lead.reference || "").toLowerCase();
        if (refs && (!ref || refs.has("") || refs.has(ref))) return false;
        remember(lead);
        return true;
      });
    counts[type] = leads.length;
    if (leads.length) {
      const rows = await db.all();
      const byRef = new Map(rows.map((row) => [String(row.reference || "").toLowerCase(), row.id]));
      for (const lead of leads) {
        if (lead.reference) lead.listing_id = byRef.get(lead.reference.toLowerCase()) || "";
      }
      upserted += await db.upsertLeads(leads);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await db.setSetting(SETTING, { ok: true, at: new Date(now).toISOString(), counts, upserted, types: TYPES });
  return { ok: true, upserted, counts };
}

export function scheduleBayutLeadPull(db) {
  const run = () => pullBayutStatLeads(db).catch((error) => console.error("Bayut lead pull failed:", error.message));
  setTimeout(run, 120000);
  setInterval(run, 10 * 60 * 1000);
}
