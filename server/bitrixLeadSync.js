// Push Property Finder leads from the listing desk into Bitrix CRM → Leads.
// Official: crm.lead.add / crm.lead.list / crm.lead.update with ORIGINATOR_ID + ORIGIN_ID.
import { callRest } from "./bitrixCrm.js";

export const PF_LEAD_ORIGIN = "a7-pf";
export const PF_LEAD_UF = {
  portalId: "UF_CRM_1760707872553",
  reference: "UF_CRM_1760707563281",
};
export const PF_LEAD_SOURCE = {
  whatsapp: "UC_KQ0WO3",
  email: "UC_D83356",
  call: "UC_6R3AM9",
};

const CHANNEL_LABEL = {
  whatsapp: "Property Finder WhatsApp",
  email: "Property Finder Email",
  call: "Property Finder Call",
  sms: "Property Finder SMS",
};

export function bitrixLeadSyncReady() {
  return Boolean(String(process.env.BITRIX_WEBHOOK || "").trim());
}

/** Desk → CRM push. Default OFF so Property Listing New leads stay on the desk only. Set BITRIX_LEAD_PUSH=1 to enable. */
export function bitrixLeadPushEnabled() {
  return String(process.env.BITRIX_LEAD_PUSH || "").trim() === "1" && bitrixLeadSyncReady();
}

export function sourceIdForChannel(channel) {
  const key = String(channel || "").toLowerCase();
  return PF_LEAD_SOURCE[key] || PF_LEAD_SOURCE.whatsapp;
}

export function channelLabel(channel) {
  const key = String(channel || "").toLowerCase();
  return CHANNEL_LABEL[key] || "Property Finder";
}

export function leadTitle(lead) {
  const name = String(lead?.sender_name || "").trim() || "Lead";
  const ref = String(lead?.reference || "").trim();
  const prefix = channelLabel(lead?.channel);
  return ref ? `${prefix} — ${name} — ${ref}` : `${prefix} — ${name}`;
}

export function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function splitName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { NAME: "Lead" };
  if (parts.length === 1) return { NAME: parts[0] };
  return { NAME: parts[0], LAST_NAME: parts.slice(1).join(" ") };
}

export function buildLeadFields(lead) {
  const name = splitName(lead?.sender_name);
  const fields = {
    TITLE: leadTitle(lead),
    ...name,
    OPENED: "Y",
    STATUS_ID: "NEW",
    SOURCE_ID: sourceIdForChannel(lead?.channel),
    SOURCE_DESCRIPTION: "Property Listing New / Property Finder",
    ORIGINATOR_ID: PF_LEAD_ORIGIN,
    ORIGIN_ID: String(lead?.id || ""),
    [PF_LEAD_UF.portalId]: String(lead?.id || ""),
  };
  const ref = String(lead?.reference || "").trim();
  if (ref) fields[PF_LEAD_UF.reference] = ref;
  const phone = String(lead?.sender_phone || "").trim();
  if (phone) fields.PHONE = [{ VALUE: phone, VALUE_TYPE: "WORK" }];
  const email = String(lead?.sender_email || "").trim();
  if (email) fields.EMAIL = [{ VALUE: email, VALUE_TYPE: "WORK" }];
  const comments = [
    lead?.agent_name ? `Agent: ${lead.agent_name}` : "",
    ref ? `Listing: ${ref}` : "",
    lead?.response_link ? `Reply: ${lead.response_link}` : "",
    `PF lead ${lead?.id || ""}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (comments) fields.COMMENTS = comments;
  if (lead?.created_at) fields.DATE_CREATE = String(lead.created_at);
  return fields;
}

function listRows(got) {
  if (!got?.ok) return [];
  if (Array.isArray(got.result)) return got.result;
  if (Array.isArray(got.result?.result)) return got.result.result;
  return [];
}

function rowId(row) {
  return String(row?.ID || row?.id || "").trim();
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bxCall(bx, user, method, params, sleep) {
  const first = await bx(user, method, params);
  if (first?.ok) return first;
  const text = String(first?.error || "");
  if (/QUERY_LIMIT_EXCEEDED|TOO_MANY_REQUESTS|too many requests/i.test(text)) {
    await sleep(1000);
    return bx(user, method, params);
  }
  return first;
}

function selectFields() {
  return ["ID", "TITLE", "SOURCE_ID", "ORIGIN_ID", "ORIGINATOR_ID", PF_LEAD_UF.portalId, PF_LEAD_UF.reference];
}

async function findExistingLead(lead, { user, bx, sleep }) {
  const portalId = String(lead?.id || "");
  if (!portalId) return null;

  const byPortal = await bxCall(
    bx,
    user,
    "crm.lead.list",
    { filter: { [PF_LEAD_UF.portalId]: portalId }, select: selectFields(), start: 0 },
    sleep
  );
  if (byPortal.ok && listRows(byPortal)[0]) return listRows(byPortal)[0];
  if (!byPortal.ok) return { error: byPortal.error };

  const byOrigin = await bxCall(
    bx,
    user,
    "crm.lead.list",
    { filter: { ORIGINATOR_ID: PF_LEAD_ORIGIN, ORIGIN_ID: portalId }, select: selectFields(), start: 0 },
    sleep
  );
  if (byOrigin.ok && listRows(byOrigin)[0]) return listRows(byOrigin)[0];
  if (!byOrigin.ok) return { error: byOrigin.error };

  const phone = String(lead?.sender_phone || "").trim();
  if (!phone || phoneDigits(phone).length < 8) return null;

  const byPhone = await bxCall(
    bx,
    user,
    "crm.lead.list",
    {
      filter: { PHONE: phone, SOURCE_ID: sourceIdForChannel(lead.channel) },
      select: selectFields(),
      start: 0,
    },
    sleep
  );
  if (!byPhone.ok) return { error: byPhone.error };
  const rows = listRows(byPhone);
  const ref = String(lead?.reference || "").trim().toLowerCase();
  if (ref) {
    const match = rows.find((row) => {
      const ufRef = String(row[PF_LEAD_UF.reference] || "").trim().toLowerCase();
      const title = String(row.TITLE || "").toLowerCase();
      return ufRef === ref || title.includes(ref);
    });
    if (match) return match;
  }
  if (rows.length === 1) return rows[0];
  return null;
}

function attachFields(lead, existing) {
  const fields = {
    [PF_LEAD_UF.portalId]: String(lead.id),
  };
  const ref = String(lead.reference || "").trim();
  if (ref && !String(existing?.[PF_LEAD_UF.reference] || "").trim()) {
    fields[PF_LEAD_UF.reference] = ref;
  }
  if (!String(existing?.ORIGINATOR_ID || "").trim()) {
    fields.ORIGINATOR_ID = PF_LEAD_ORIGIN;
    fields.ORIGIN_ID = String(lead.id);
  }
  return fields;
}

export async function pushOneLead(lead, { user = {}, bx = callRest, sleep = defaultSleep } = {}) {
  const id = String(lead?.id || "").trim();
  if (!id) return { ok: false, error: "missing lead id" };

  const stored = String(lead.bitrix_id || "").trim();
  if (stored) return { ok: true, action: "linked", id: stored };

  const existing = await findExistingLead(lead, { user, bx, sleep });
  if (existing?.error) return { ok: false, error: existing.error };
  if (existing && rowId(existing)) {
    const updated = await bxCall(
      bx,
      user,
      "crm.lead.update",
      { id: rowId(existing), fields: attachFields(lead, existing) },
      sleep
    );
    if (!updated.ok) return { ok: false, error: updated.error, id: rowId(existing) };
    return { ok: true, action: "update", id: rowId(existing) };
  }

  const added = await bxCall(
    bx,
    user,
    "crm.lead.add",
    { fields: buildLeadFields(lead), params: { REGISTER_SONET_EVENT: "N" } },
    sleep
  );
  const newId = added.ok ? String(added.result || "").trim() : "";
  if (!added.ok || !newId) return { ok: false, error: added.error || "crm.lead.add failed" };
  return { ok: true, action: "add", id: newId };
}

export async function pushPfLeadsToBitrix(db, opts = {}) {
  const {
    limit = 40,
    user = {},
    bx = callRest,
    sleep = defaultSleep,
    preferIds = [],
  } = opts;
  if (!bitrixLeadPushEnabled()) {
    return { skipped: true, reason: "push_disabled", pushed: 0, added: 0, linked: 0, pending: 0, failed: 0 };
  }

  const prefer = new Set((preferIds || []).map(String));
  const pending = (await db.allLeads())
    .filter((row) => !String(row.bitrix_id || "").trim())
    .sort((a, b) => {
      const ap = prefer.has(String(a.id)) ? 0 : 1;
      const bp = prefer.has(String(b.id)) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  const batch = pending.slice(0, Math.max(1, Number(limit) || 40));
  const summary = {
    pushed: 0,
    added: 0,
    linked: 0,
    failed: 0,
    pending: Math.max(0, pending.length - batch.length),
    errors: [],
  };

  for (const lead of batch) {
    try {
      const out = await pushOneLead(lead, { user, bx, sleep });
      if (out.ok && out.id) {
        await db.upsertLeads([{ ...lead, bitrix_id: String(out.id) }]);
        summary.pushed += 1;
        if (out.action === "add") summary.added += 1;
        else summary.linked += 1;
      } else {
        summary.failed += 1;
        if (out.error && summary.errors.length < 5) summary.errors.push(`${lead.id}: ${out.error}`);
      }
    } catch (error) {
      summary.failed += 1;
      if (summary.errors.length < 5) summary.errors.push(`${lead.id}: ${error.message}`);
    }
    await sleep(350);
  }
  return summary;
}

export function scheduleBitrixLeadSync(db) {
  if (!bitrixLeadPushEnabled()) return;
  const run = () =>
    pushPfLeadsToBitrix(db, { limit: 40 })
      .then((summary) => db.setSetting("bitrix_lead_sync", { ...summary, at: new Date().toISOString() }).catch(() => {}))
      .catch((error) => console.error("Bitrix lead sync failed:", error.message));
  setTimeout(run, 70000);
  setInterval(run, 90000);
}
