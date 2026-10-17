// Bitrix CRM lookups through REST, using the signed-in user's portal token.
// Mirrors the Bitrix tenancy tool's CrmLookup (contact / company / lead / Owner's Unit 1112).

const UNIT_TYPE = 1112;
const BUILDING_TYPE = 1082;
const LOCATION_TYPE = 1050;
const COMMUNITY_TYPE = 1058;
const PROJECT_TYPE = 1046;
const UNIT_NO = "ufCrm21_1761837638901";
const OWNER_FIRST = "ufCrm21_1758009535002";
const OWNER_LAST = "ufCrm21_1758009542122";
const OWNER_MOBILE = "ufCrm21_1758009551211";
const PLOT_NO = "ufCrm21_1760537872927";
const BUILDING_ID = "ufCrm21_1761836766";
const LOCATION_ID = "ufCrm21_1760535808";
const COMMUNITY_ID = "ufCrm21_1761836312";
const PROJECT_ID = "ufCrm21_1760535893";
const BUILDING_IMPORT = "ufCrm21_1761837785108";
const COMMUNITY_IMPORT = "ufCrm21_1761837766987";
const LOCATION_IMPORT = "ufCrm21_1760681070808";
const CONTACT_SELECT = ["ID", "NAME", "SECOND_NAME", "LAST_NAME", "PHONE", "EMAIL"];
const UNIT_SELECT = [
  "id",
  "title",
  UNIT_NO,
  OWNER_FIRST,
  OWNER_LAST,
  PLOT_NO,
  BUILDING_IMPORT,
  COMMUNITY_IMPORT,
  LOCATION_IMPORT,
];
const SEARCH_LIMIT = 20;

export function crmSearchLimit() {
  return SEARCH_LIMIT;
}

export function isCrmDirectoryName(title, query = "") {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (t.length < 2) return false;
  const q = String(query || "").trim().toLowerCase();
  if (/whatsapp|property\s*finder/i.test(t) && !/whatsapp|property\s*finder/i.test(q)) return false;
  return true;
}

function unitText(row) {
  return [
    row?.title,
    row?.[UNIT_NO],
    row?.[OWNER_FIRST],
    row?.[OWNER_LAST],
    row?.[PLOT_NO],
    row?.[BUILDING_IMPORT],
    row?.[COMMUNITY_IMPORT],
    row?.[LOCATION_IMPORT],
  ]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

export function isCrmDirectoryUnit(row, query = "") {
  const title = String(row?.title || "").replace(/\s+/g, " ").trim();
  const unitNo = String(row?.[UNIT_NO] || "").trim();
  const owner = `${row?.[OWNER_FIRST] || ""} ${row?.[OWNER_LAST] || ""}`.replace(/\s+/g, " ").trim();
  const stub = !unitNo && /^(business bay)$/i.test(title) && /^(sale|rent|rental)?$/i.test(owner);
  if (stub) return false;
  const q = String(query || "").trim().toLowerCase();
  if (q && unitText(row).toLowerCase().includes(q)) return true;
  return Boolean(unitNo || /\d/.test(title));
}

export function crmOpenListEntities(keys, query) {
  const list = Array.isArray(keys) ? keys : crmSearchEntities(keys);
  if (!String(query || "").trim() && list.includes("contact")) return ["contact"];
  return list;
}

export function splitCrmPersonName(name) {
  const parts = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return { NAME: "" };
  if (parts.length === 1) return { NAME: parts[0] };
  return { NAME: parts[0], LAST_NAME: parts.slice(1).join(" ") };
}

export function crmContactFields({ name, email, phone } = {}) {
  const fields = { ...splitCrmPersonName(name), OPENED: "Y" };
  const em = String(email || "").trim();
  const ph = String(phone || "").trim();
  if (em.includes("@")) fields.EMAIL = [{ VALUE: em, VALUE_TYPE: "WORK" }];
  if (ph) fields.PHONE = [{ VALUE: ph, VALUE_TYPE: "MOBILE" }];
  return fields;
}

export function crmSearchEntities(raw) {
  const wanted = String(raw || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(["contact", "company", "lead", "unit"]);
  return [...new Set(wanted.filter((item) => allowed.has(item)))];
}

export class BitrixTokenError extends Error {
  constructor(message) {
    super(message || "Bitrix token expired");
    this.code = "bitrix_token";
  }
}

function isBitrixAuthError(body) {
  const text = `${body?.error || ""} ${body?.error_description || ""}`;
  return /expired_token|invalid_token|INVALID_CREDENTIALS|NO_AUTH_FOUND|insufficient_scope|invalid request credentials|higher privileges/i.test(text);
}

async function restPost(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({}));
}

function restError(body, fallback) {
  return body?.error_description || body?.error || fallback;
}

// Bitrix ignores `auth` inside a JSON body. Pass the user token on the query string
// (same as user.current). Webhook is only a fallback.
async function rest(user, method, params = {}, opts = {}) {
  const webhook = String(process.env.BITRIX_WEBHOOK || "").trim().replace(/\/$/, "");
  const domain = String(user?.domain || process.env.PORTAL_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  async function viaWebhook() {
    if (!webhook) return null;
    const body = await restPost(`${webhook}/${method}.json`, params);
    if (!body.error) return body.result;
    if (!isBitrixAuthError(body)) throw new Error(restError(body, "Bitrix request failed"));
    return null;
  }

  if (opts.webhookFirst) {
    const fromWebhook = await viaWebhook();
    if (fromWebhook !== null && fromWebhook !== undefined) return fromWebhook;
  }

  if (domain && user?.authId) {
    const body = await restPost(
      `https://${domain}/rest/${method}.json?auth=${encodeURIComponent(user.authId)}`,
      params
    );
    if (!body.error) return body.result;
    if (!isBitrixAuthError(body)) throw new Error(restError(body, "Bitrix request failed"));
  }

  const fromWebhook = await viaWebhook();
  if (fromWebhook !== null && fromWebhook !== undefined) return fromWebhook;
  throw new BitrixTokenError(user?.authId ? "Bitrix token expired" : "No Bitrix session token");
}

export async function callRest(user, method, params = {}) {
  try {
    return { ok: true, result: await rest(user, method, params) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Bitrix request failed",
      auth: error instanceof BitrixTokenError,
    };
  }
}

function personFullName(row) {
  return [row?.NAME, row?.SECOND_NAME, row?.LAST_NAME, row?.name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function personEmail(row) {
  if (typeof row?.EMAIL === "string" && row.EMAIL.includes("@")) return row.EMAIL.trim();
  return first(row?.EMAIL, "EMAIL");
}

function asUserList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.result)) return result.result;
  if (result && typeof result === "object" && (result.ID || result.id)) return [result];
  return [];
}

export async function findBitrixUserByName(user, name) {
  const wanted = String(name || process.env.OPENAI_ALERT_NAME || "Matloob Ul Hasnain").replace(/\s+/g, " ").trim();
  const envId = Number(process.env.OPENAI_ALERT_BITRIX_ID || process.env.BITRIX_ALERT_USER_ID || 0);
  if (envId > 0) {
    const got = await callRest(user, "user.get", { ID: envId });
    const row = asUserList(got.result)[0];
    if (got.ok && row) {
      return {
        id: Number(row.ID || row.id || envId),
        name: personFullName(row) || wanted,
        email: personEmail(row) || String(process.env.OPENAI_ALERT_EMAIL || "").trim(),
      };
    }
    return { id: envId, name: wanted, email: String(process.env.OPENAI_ALERT_EMAIL || "").trim() };
  }

  const parts = wanted.split(" ");
  const firstName = parts[0] || "Matloob";
  const lastName = parts[parts.length - 1] || "Hasnain";
  const tries = [
    ["user.search", { FILTER: { NAME: firstName, LAST_NAME: lastName } }],
    ["user.search", { FILTER: { NAME: firstName } }],
    ["user.search", { FILTER: { LAST_NAME: lastName } }],
    ["user.search", { FILTER: { LAST_NAME: "Hassnain" } }],
    ["user.search", { FIND: wanted }],
    ["user.get", { FILTER: { NAME: firstName, LAST_NAME: lastName } }],
    ["user.get", { FILTER: { NAME: firstName } }],
  ];

  for (const [method, params] of tries) {
    const got = await callRest(user, method, params);
    if (!got.ok) continue;
    const match =
      asUserList(got.result).find((row) => /matloob/i.test(personFullName(row)) && /hasnain|hassnain/i.test(personFullName(row))) ||
      asUserList(got.result).find((row) => /matloob/i.test(personFullName(row)));
    if (!match) continue;
    return {
      id: Number(match.ID || match.id || 0),
      name: personFullName(match) || wanted,
      email: personEmail(match) || String(process.env.OPENAI_ALERT_EMAIL || "").trim(),
    };
  }
  return null;
}

export async function notifyBitrixUser(user, targetId, message, tag = "openai-front-key") {
  const id = Number(targetId || 0);
  const text = String(message || "").trim();
  if (!id || !text) return { ok: false, error: "Missing Bitrix user or message." };
  const notifyTag = String(tag || "openai-front-key").trim() || "openai-front-key";

  const tries = [
    ["im.notify.personal.add", { USER_ID: id, MESSAGE: text, TAG: notifyTag }],
    ["im.notify.system.add", { USER_ID: id, MESSAGE: text }],
    ["im.notify", { to: id, message: text, type: "SYSTEM" }],
    ["im.message.add", { DIALOG_ID: String(id), MESSAGE: text }],
  ];

  for (const [method, params] of tries) {
    const got = await callRest(user, method, params);
    if (got.ok) return { ok: true, via: method };
  }
  return { ok: false, error: "Bitrix IM notify failed." };
}

function first(list, type) {
  if (!Array.isArray(list)) return "";
  const item = list.find((entry) => entry && entry.VALUE) || null;
  return item ? String(item.VALUE) : "";
}

function fullName(row) {
  return [row.NAME, row.SECOND_NAME, row.LAST_NAME].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

// Empty query returns the most recent records (like the Bitrix selector's first list).
async function recentCrm(user, entity) {
  const hook = { webhookFirst: true };
  if (entity === "contact") {
    const people = [];
    const seen = new Set();
    for (const start of [0, 50, 100]) {
      const rows =
        (await rest(
          user,
          "crm.contact.list",
          { order: { ID: "DESC" }, select: ["ID", "NAME", "SECOND_NAME", "LAST_NAME"], start },
          hook
        )) || [];
      for (const row of rows) {
        const item = { entity: "contact", id: Number(row.ID), title: fullName(row) || `Contact ${row.ID}` };
        if (!item.id || seen.has(item.id) || !isCrmDirectoryName(item.title)) continue;
        seen.add(item.id);
        people.push(item);
        if (people.length >= SEARCH_LIMIT) return people;
      }
      if (rows.length < 50) break;
    }
    return people;
  }
  if (entity === "company") {
    const rows = await rest(user, "crm.company.list", { order: { ID: "DESC" }, select: ["ID", "TITLE"] }, hook);
    return (rows || []).slice(0, SEARCH_LIMIT).map((row) => ({ entity: "company", id: Number(row.ID), title: String(row.TITLE || "") }));
  }
  if (entity === "lead") {
    const rows = await rest(user, "crm.lead.list", { order: { ID: "DESC" }, select: ["ID", "TITLE", "NAME", "LAST_NAME"] }, hook);
    return (rows || []).slice(0, SEARCH_LIMIT).map((row) => ({
      entity: "lead",
      id: Number(row.ID),
      title: String(row.TITLE || fullName(row) || ""),
    }));
  }
  if (entity === "unit") {
    const result = await rest(
      user,
      "crm.item.list",
      {
        entityTypeId: UNIT_TYPE,
        order: { id: "DESC" },
        select: UNIT_SELECT,
        filter: { [`!${UNIT_NO}`]: "" },
      },
      hook
    );
    return (result?.items || [])
      .filter((row) => isCrmDirectoryUnit(row))
      .slice(0, SEARCH_LIMIT)
      .map((row) => ({ entity: "unit", id: Number(row.id), title: unitTitle(row) }));
  }
  return [];
}

function listRows(result, entity) {
  if (entity === "unit") return Array.isArray(result?.items) ? result.items : [];
  return Array.isArray(result) ? result : [];
}

function unitTitle(row) {
  const title = String(row?.title || "").replace(/\s+/g, " ").trim();
  const unitNo = String(row?.[UNIT_NO] || "").trim();
  const owner = `${row?.[OWNER_FIRST] || ""} ${row?.[OWNER_LAST] || ""}`.replace(/\s+/g, " ").trim();
  const head =
    title && unitNo && !title.toLowerCase().includes(unitNo.toLowerCase())
      ? `${title} ${unitNo}`
      : title || unitNo || `Unit ${row?.id || ""}`;
  return [head, owner].filter(Boolean).join(" · ");
}

export function crmSearchJobs(entity, query) {
  const q = String(query || "").trim();
  if (entity === "contact") {
    const jobs = [
      { method: "crm.contact.list", params: { filter: { "%NAME": q }, select: CONTACT_SELECT, order: { LAST_NAME: "ASC" } } },
      { method: "crm.contact.list", params: { filter: { "%LAST_NAME": q }, select: CONTACT_SELECT, order: { LAST_NAME: "ASC" } } },
      { method: "crm.contact.list", params: { filter: { "%SECOND_NAME": q }, select: CONTACT_SELECT } },
    ];
    if (q.includes("@")) jobs.push({ method: "crm.contact.list", params: { filter: { EMAIL: q }, select: CONTACT_SELECT } });
    if (q.replace(/\D/g, "").length >= 4) {
      jobs.push({ method: "crm.contact.list", params: { filter: { PHONE: q }, select: CONTACT_SELECT } });
    }
    return jobs;
  }
  if (entity === "company") {
    return [{ method: "crm.company.list", params: { filter: { "%TITLE": q }, select: ["ID", "TITLE"] } }];
  }
  if (entity === "lead") {
    return [
      { method: "crm.lead.list", params: { filter: { "%TITLE": q }, select: ["ID", "TITLE", "NAME", "LAST_NAME"] } },
      { method: "crm.lead.list", params: { filter: { "%NAME": q }, select: ["ID", "TITLE", "NAME", "LAST_NAME"] } },
      { method: "crm.lead.list", params: { filter: { "%LAST_NAME": q }, select: ["ID", "TITLE", "NAME", "LAST_NAME"] } },
    ];
  }
  if (entity === "unit") {
    const jobs = [
      { method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { "%title": q }, select: UNIT_SELECT } },
      { method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { [`%${UNIT_NO}`]: q }, select: UNIT_SELECT } },
      { method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { [`%${OWNER_FIRST}`]: q }, select: UNIT_SELECT } },
      { method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { [`%${OWNER_LAST}`]: q }, select: UNIT_SELECT } },
      { method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { [`%${PLOT_NO}`]: q }, select: UNIT_SELECT } },
      { method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { [`%${BUILDING_IMPORT}`]: q }, select: UNIT_SELECT } },
      { method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { [`%${COMMUNITY_IMPORT}`]: q }, select: UNIT_SELECT } },
      { method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { [`%${LOCATION_IMPORT}`]: q }, select: UNIT_SELECT } },
    ];
    if (q.replace(/\D/g, "").length >= 4) {
      jobs.push({ method: "crm.item.list", params: { entityTypeId: UNIT_TYPE, filter: { [`%${OWNER_MOBILE}`]: q }, select: UNIT_SELECT } });
    }
    return jobs;
  }
  return [];
}

export function mapCrmSearchRow(entity, row) {
  if (entity === "contact") {
    return { entity, id: Number(row.ID), title: fullName(row) || `Contact ${row.ID}` };
  }
  if (entity === "company") {
    return { entity, id: Number(row.ID), title: String(row.TITLE || "") };
  }
  if (entity === "lead") {
    return { entity, id: Number(row.ID), title: String(row.TITLE || fullName(row) || "") };
  }
  if (entity === "unit") {
    return { entity, id: Number(row.id), title: unitTitle(row) };
  }
  return null;
}

async function searchRelatedUnits(user, query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const catalogs = [
    { entityTypeId: BUILDING_TYPE, field: BUILDING_ID },
    { entityTypeId: LOCATION_TYPE, field: LOCATION_ID },
    { entityTypeId: COMMUNITY_TYPE, field: COMMUNITY_ID },
    { entityTypeId: PROJECT_TYPE, field: PROJECT_ID },
  ];
  const found = await Promise.all(
    catalogs.map(async (catalog) => {
      const result = await rest(
        user,
        "crm.item.list",
        { entityTypeId: catalog.entityTypeId, filter: { "%title": q }, select: ["id"] },
        { webhookFirst: true }
      ).catch(() => null);
      const ids = (result?.items || []).map((row) => Number(row.id)).filter(Boolean).slice(0, 8);
      return { field: catalog.field, ids };
    })
  );
  const pages = await Promise.all(
    found
      .filter((pack) => pack.ids.length)
      .map((pack) =>
        rest(
          user,
          "crm.item.list",
          {
            entityTypeId: UNIT_TYPE,
            select: UNIT_SELECT,
            filter: { [pack.field]: pack.ids, [`!${UNIT_NO}`]: "" },
          },
          { webhookFirst: true }
        ).catch(() => null)
      )
  );
  return pages.flatMap((page) => page?.items || []);
}

export async function searchCrm(user, entity, query) {
  const key = String(entity || "").toLowerCase();
  const q = String(query || "").trim();
  if (!q) return recentCrm(user, key);
  const jobs = crmSearchJobs(key, q);
  if (!jobs.length) throw new Error("Unknown entity");
  const [pages, related] = await Promise.all([
    Promise.all(jobs.map((job) => rest(user, job.method, job.params, { webhookFirst: true }).catch(() => null))),
    key === "unit" ? searchRelatedUnits(user, q) : Promise.resolve([]),
  ]);
  const seen = new Set();
  const rows = [];
  for (const row of [...pages.flatMap((page) => listRows(page, key)), ...related]) {
    const item = mapCrmSearchRow(key, row);
    if (!item?.id || seen.has(item.id)) continue;
    if (key === "unit" && !isCrmDirectoryUnit(row, q)) continue;
    if (key !== "unit" && !isCrmDirectoryName(item.title, q)) continue;
    seen.add(item.id);
    rows.push(item);
  }
  return rows.slice(0, SEARCH_LIMIT);
}

export async function searchCrmMany(user, entities, query) {
  const wanted = crmSearchEntities(Array.isArray(entities) ? entities.join(",") : entities);
  const keys = crmOpenListEntities(wanted, query);
  const packs = await Promise.all(keys.map((key) => searchCrm(user, key, query).catch(() => [])));
  return packs.flat().slice(0, SEARCH_LIMIT);
}

export async function createCrmContact(user, raw = {}) {
  const name = String(raw.name || raw.title || "").replace(/\s+/g, " ").trim();
  if (name.length < 2) throw new Error("Type the new tenant or owner name first.");
  const fields = crmContactFields({ name, email: raw.email, phone: raw.phone });
  const id = Number(await rest(user, "crm.contact.add", { fields }, { webhookFirst: true }));
  if (!id) throw new Error("Bitrix did not save this contact.");
  return { entity: "contact", id, title: name };
}

async function contactDuplicates(user, name, exceptId) {
  const clean = String(name || "").trim();
  if (!clean) return [];
  const rows = await rest(user, "crm.contact.list", { filter: { "%NAME": clean.split(" ")[0] }, select: ["ID", "NAME", "LAST_NAME"] }).catch(() => []);
  return (rows || [])
    .filter((row) => Number(row.ID) !== exceptId && fullName(row).toLowerCase().includes(clean.toLowerCase()))
    .slice(0, 5)
    .map((row) => ({ id: Number(row.ID), name: fullName(row) }));
}

export async function lookupCrm(user, entity, id) {
  const numericId = Number(id || 0);
  if (!numericId) return null;
  if (entity === "contact") {
    const row = await rest(user, "crm.contact.get", { id: numericId }).catch(() => null);
    if (!row) return null;
    const name = fullName(row);
    return {
      id: numericId,
      name,
      email: first(row.EMAIL, "EMAIL"),
      phone: first(row.PHONE, "PHONE"),
      emails: (row.EMAIL || []).map((item) => item.VALUE),
      phones: (row.PHONE || []).map((item) => item.VALUE),
      duplicates: await contactDuplicates(user, name, numericId),
    };
  }
  if (entity === "company") {
    const row = await rest(user, "crm.company.get", { id: numericId }).catch(() => null);
    if (!row) return null;
    return { id: numericId, name: String(row.TITLE || ""), email: first(row.EMAIL), phone: first(row.PHONE) };
  }
  if (entity === "lead") {
    const row = await rest(user, "crm.lead.get", { id: numericId }).catch(() => null);
    if (!row) return null;
    return { id: numericId, name: String(row.TITLE || fullName(row)), email: first(row.EMAIL), phone: first(row.PHONE) };
  }
  if (entity === "unit") {
    const result = await rest(user, "crm.item.get", { entityTypeId: UNIT_TYPE, id: numericId }).catch(() => null);
    const item = result?.item;
    if (!item) return null;
    const get = (a, b) => String(item[a] ?? item[b] ?? "");
    const buildingId = Number(item.ufCrm21_1761836766 ?? item.UF_CRM_21_1761836766 ?? 0);
    const locationId = Number(item.ufCrm21_1760535808 ?? item.UF_CRM_21_1760535808 ?? 0);
    const communityId = Number(item.ufCrm21_1761836312 ?? item.UF_CRM_21_1761836312 ?? 0);
    const [building, location, community] = await Promise.all([
      buildingId ? rest(user, "crm.item.get", { entityTypeId: BUILDING_TYPE, id: buildingId }).then((r) => String(r?.item?.title || "")).catch(() => "") : "",
      locationId ? rest(user, "crm.item.get", { entityTypeId: LOCATION_TYPE, id: locationId }).then((r) => String(r?.item?.title || "")).catch(() => "") : "",
      communityId ? rest(user, "crm.item.get", { entityTypeId: COMMUNITY_TYPE, id: communityId }).then((r) => String(r?.item?.title || "")).catch(() => "") : "",
    ]);
    const place = (value) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      return text && !/^#?\d+$/.test(text) ? text : "";
    };
    return {
      id: numericId,
      title: String(item.title || ""),
      unitNo: get("ufCrm21_1761837638901", "UF_CRM_21_1761837638901"),
      ownerName: `${get("ufCrm21_1758009535002", "UF_CRM_21_1758009535002")} ${get("ufCrm21_1758009542122", "UF_CRM_21_1758009542122")}`.trim(),
      ownerPhone: get("ufCrm21_1758009551211", "UF_CRM_21_1758009551211"),
      ownerEmail: get("ufCrm21_1758009557723", "UF_CRM_21_1758009557723"),
      building: place(building) || place(get("ufCrm21_1761837785108", "UF_CRM_21_1761837785108")),
      location: place(location) || place(community) || place(get("ufCrm21_1761837766987", "UF_CRM_21_1761837766987")) || place(get("ufCrm21_1760681070808", "UF_CRM_21_1760681070808")),
      community: place(community),
      plotNo: get("ufCrm21_1760537872927", "UF_CRM_21_1760537872927"),
      size: get("ufCrm21_1761836951413", "UF_CRM_21_1761836951413"),
    };
  }
  return null;
}

// Logs the WhatsApp message as a CRM activity on the contact, like the Bitrix tool tries to.
export async function logWhatsappActivity(user, contactId, text, digits) {
  if (!contactId) return false;
  try {
    await rest(user, "crm.activity.add", {
      fields: {
        TYPE_ID: 6,
        PROVIDER_ID: "CRM_WHATSAPP",
        SUBJECT: "Tenancy contract WhatsApp",
        DESCRIPTION: text,
        DESCRIPTION_TYPE: 1,
        COMPLETED: "N",
        RESPONSIBLE_ID: Number(user.id) || 1,
        OWNER_TYPE_ID: 3,
        OWNER_ID: Number(contactId),
        COMMUNICATIONS: [{ VALUE: `+${digits}`, ENTITY_ID: Number(contactId), ENTITY_TYPE_ID: 3 }],
      },
    });
    return true;
  } catch {
    return false;
  }
}
