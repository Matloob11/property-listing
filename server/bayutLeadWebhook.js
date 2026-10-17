import crypto from "node:crypto";

const CHANNELS = new Set(["whatsapp", "call", "email", "sms"]);

function text(value) {
  if (value == null || typeof value === "object") return "";
  return String(value).trim();
}

function objectsOf(body) {
  const out = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  out.push(body);
  for (const value of Object.values(body)) {
    if (value && typeof value === "object" && !Array.isArray(value)) out.push(value);
  }
  return out;
}

function pick(objects, keys) {
  for (const obj of objects) {
    for (const key of keys) {
      const value = text(obj[key]);
      if (value) return value;
    }
  }
  return "";
}

function portalOf(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("dubizzle")) return "dubizzle";
  if (raw.includes("bayut")) return "bayut";
  return "";
}

function channelOf(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("whatsapp") || raw === "wa") return "whatsapp";
  if (raw.includes("email") || raw.includes("mail")) return "email";
  if (raw.includes("sms")) return "sms";
  if (raw.includes("call") || raw.includes("phone")) return "call";
  return CHANNELS.has(raw) ? raw : "";
}

function stamp(value, now) {
  const raw = text(value);
  if (!raw) return now;
  const dated = new Date(raw);
  if (Number.isNaN(dated.getTime())) return now;
  return dated.toISOString();
}

export function bayutPushLead(body, now = new Date().toISOString()) {
  const objects = objectsOf(body);
  if (!objects.length || !Object.keys(body).length) return null;
  const portal = portalOf(pick(objects, ["portal", "source", "platform", "site"])) || "bayut";
  const externalId = pick(objects, ["id", "lead_id", "leadId", "event_id", "eventId"]);
  const id = externalId
    ? `${portal}-${externalId.replace(/^(bayut|dubizzle)-/i, "")}`
    : `${portal}-${crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24)}`;
  return {
    id,
    channel: channelOf(pick(objects, ["channel", "type", "lead_type", "enquiry_type", "inquiry_type"])),
    status: "new",
    created_at: stamp(pick(objects, ["created_at", "createdAt", "date", "timestamp", "time"]), now),
    entity_type: portal,
    pf_listing_id: "",
    reference: pick(objects, ["reference", "property_reference", "listing_reference", "ref", "property_ref"]),
    listing_id: "",
    sender_name: pick(objects, ["name", "client_name", "enquirer_name", "sender_name", "customer_name", "full_name"]),
    sender_phone: pick(objects, ["phone", "mobile", "phone_number", "sender_phone", "contact_number", "cell"]),
    sender_email: pick(objects, ["email", "sender_email", "mail"]),
    agent_pf_profile: "",
    agent_name: pick(objects, ["agent", "agent_name", "agentName"]),
    response_link: "",
    call_talk_time: 0,
    call_wait_time: 0,
    call_record: "",
    tags: [portal],
    raw: body,
    bitrix_id: "",
  };
}
