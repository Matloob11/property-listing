import { clearPfEnrichCache, enrichLeadRowsFromPf } from "./crmPfEnrich.js";
import { communityLabel } from "./displayEmpty.js";
import { sortRollupRows } from "./rollupSort.js";

export const LEAD_COMMUNITY_TEXT = "UF_CRM_1770537051525";
export const LEAD_COMMUNITY_ID = "UF_CRM_1763390140";
export const LEAD_SUB_COMMUNITY_ID = "UF_CRM_1763390179";
export const LEAD_BEDS = "UF_CRM_1731838126127";
export const LEAD_UNIT_TYPE = "UF_CRM_1760707292";
export const LEAD_CLIENT_TYPE = "UF_CRM_1756638760279";
export const LEAD_LISTING_REF = "UF_CRM_1760707563281";
export const LEAD_LISTING_URL = "UF_CRM_1760707550978";
export const LEAD_UNIT_TYPE_ENTITY = 1188;
export const LEAD_SUB_COMMUNITY_ENTITY = 1062;

export const KNOWN_CLIENT_TYPES = {
  972: "Buyer",
  973: "Seller",
  1220: "Tenant",
  2410: "owner",
};

export const KNOWN_BED_LABELS = {
  26: "0 B/R",
  27: "1 B/R",
  28: "2 B/R",
  29: "3 B/R",
  30: "4 B/R",
  31: "5 B/R",
  32: "6 B/R",
  33: "7 B/R",
  1179: "7+ B/R",
  1278: "Plot",
};

export const LEAD_BREAKDOWN_SELECT = [
  "ID",
  "TITLE",
  "NAME",
  "LAST_NAME",
  "STATUS_ID",
  "SOURCE_ID",
  "DATE_CREATE",
  "DATE_MODIFY",
  "STATUS_SEMANTIC_ID",
  "OPPORTUNITY",
  "COMMENTS",
  LEAD_COMMUNITY_TEXT,
  LEAD_COMMUNITY_ID,
  LEAD_SUB_COMMUNITY_ID,
  LEAD_BEDS,
  LEAD_UNIT_TYPE,
  LEAD_CLIENT_TYPE,
  LEAD_LISTING_REF,
  LEAD_LISTING_URL,
];

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function textOf(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return String(value.valueName || value.NAME || value.name || value.value || value.TITLE || value.title || "").trim();
  }
  return String(value).trim();
}

function enumLabel(meta, raw, known = {}) {
  const key = textOf(raw) || String(raw ?? "").trim();
  if (!key) return "";
  if (known[key]) return known[key];
  if (!meta) return key;
  const items = meta.items || meta.list || [];
  if (Array.isArray(items)) {
    const hit = items.find((row) => [row.ID, row.id, row.VALUE, row.value].some((value) => String(value) === key));
    if (hit) return String(hit.VALUE || hit.value || hit.NAME || hit.name || key);
  } else if (items && typeof items === "object") {
    return String(items[key] || items[raw] || key);
  }
  return key;
}

function countMap(rows, keyFn, kind = "default") {
  const map = new Map();
  for (const row of rows) {
    const { id, name } = keyFn(row);
    if (!id) continue;
    const prev = map.get(id) || { id, name, count: 0 };
    prev.count += 1;
    map.set(id, prev);
  }
  return sortRollupRows([...map.values()], { kind });
}

export function purposeOfLead(clientType, extras = {}) {
  const text = norm(clientType);
  if (/tenant|rent|lease|^1220$/.test(text)) return "rent";
  if (/buyer|sale|purchase|purchas|^972$/.test(text)) return "sale";
  if (/seller|owner|landlord|^973$|^2410$/.test(text)) return "other";
  const listingPurpose = norm(extras.listingPurpose);
  if (listingPurpose.includes("rent")) return "rent";
  if (listingPurpose.includes("sale")) return "sale";
  const opp = Number(extras.opportunity || 0);
  if (Number.isFinite(opp) && opp >= 200000) return "sale";
  if (Number.isFinite(opp) && opp > 0) return "rent";
  return "unknown";
}

export function purposeLabelOf(purpose) {
  if (purpose === "rent") return "Rent";
  if (purpose === "sale") return "Sale";
  if (purpose === "other") return "Other";
  return "Empty";
}

export function listingRefOf(row = {}) {
  const direct = textOf(row[LEAD_LISTING_REF]);
  if (/a7group-\d+/i.test(direct)) return direct.match(/a7group-\d+/i)[0];
  const comments = textOf(row.COMMENTS || row.comments);
  const fromComments = comments.match(/a7group-\d+/i);
  if (fromComments) return fromComments[0];
  const title = textOf(row.TITLE || row.title);
  const fromTitle = title.match(/a7group-\d+/i);
  return fromTitle ? fromTitle[0] : "";
}

export function bedsLabelOf(value) {
  const raw = textOf(value);
  if (!raw && raw !== 0) return "—";
  if (KNOWN_BED_LABELS[raw]) return bedsLabelOf(KNOWN_BED_LABELS[raw]);
  if (/\bshops?\b|\bretail\b/i.test(raw)) return "Shop";
  if (/^0\s*b\/?r$/i.test(raw) || norm(raw) === "0br" || /studio/i.test(raw)) return "Studio";
  const m = raw.match(/(\d+)\s*\+?\s*b\/?r/i);
  if (m) {
    const n = Number(m[1]);
    if (n === 0) return "Studio";
    return n === 1 ? "1 Bedroom" : `${n} Bedroom`;
  }
  if (/^plot$/i.test(raw)) return "Plot";
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n === 0) return "Studio";
    return n === 1 ? "1 Bedroom" : `${n} Bedroom`;
  }
  return raw;
}

export function bedsNumberOf(value) {
  const label = bedsLabelOf(value);
  if (label === "Studio") return 0;
  if (label === "—" || label === "Plot") return null;
  const m = String(label).match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function mapLeadRow(row, fields = {}, titles = {}, listingHint = null, pfHint = null) {
  const bedsMeta = fields[LEAD_BEDS];
  const clientMeta = fields[LEAD_CLIENT_TYPE];
  const bedsRaw = enumLabel(bedsMeta, row[LEAD_BEDS], KNOWN_BED_LABELS);
  const clientType = enumLabel(clientMeta, row[LEAD_CLIENT_TYPE], KNOWN_CLIENT_TYPES);
  const purpose = purposeOfLead(clientType || row[LEAD_CLIENT_TYPE], {
    listingPurpose: listingHint?.purpose || pfHint?.purpose || "",
    opportunity: row.OPPORTUNITY,
  });
  const communityText = textOf(row[LEAD_COMMUNITY_TEXT]) || textOf(listingHint?.community) || textOf(pfHint?.community);
  const communityId = textOf(row[LEAD_COMMUNITY_ID]) || String(row[LEAD_COMMUNITY_ID] ?? "").trim();
  const subId = textOf(row[LEAD_SUB_COMMUNITY_ID]) || String(row[LEAD_SUB_COMMUNITY_ID] ?? "").trim();
  const typeId = textOf(row[LEAD_UNIT_TYPE]) || String(row[LEAD_UNIT_TYPE] ?? "").trim();
  let linkedCommunity =
    titles.communities?.[communityId] ||
    titles.communities?.[String(Number(communityId))] ||
    "";
  let community =
    communityText ||
    linkedCommunity ||
    (communityId && !/^\d+$/.test(communityId) ? communityId : "");
  let subCommunity =
    titles.subCommunities?.[subId] ||
    titles.subCommunities?.[String(Number(subId))] ||
    textOf(listingHint?.subCommunity) ||
    textOf(pfHint?.subCommunity) ||
    (subId && !/^\d+$/.test(subId) ? subId : "");
  let type =
    titles.types?.[typeId] ||
    titles.types?.[String(Number(typeId))] ||
    textOf(listingHint?.type) ||
    textOf(pfHint?.type) ||
    (typeId && !/^\d+$/.test(typeId) ? typeId : "");
  if (type) type = type.replace(/\b\w/g, (char) => char.toUpperCase());
  else type = "Other";
  let beds = bedsNumberOf(bedsRaw || row[LEAD_BEDS]);
  if (beds == null && listingHint?.beds != null && listingHint.beds !== "") {
    beds = bedsNumberOf(listingHint.beds);
  }
  if (beds == null && pfHint?.beds != null) beds = Number(pfHint.beds);
  let bedLabel = bedsLabelOf(bedsRaw || row[LEAD_BEDS] || listingHint?.beds || pfHint?.beds);
  community = communityLabel(community);
  const hintType = textOf(listingHint?.type) || textOf(pfHint?.type);
  let unitKind = "";
  if (/\bshops?\b|\bretail\b/i.test(`${type} ${hintType}`)) {
    type = "Shop";
    unitKind = "shop";
    if (bedLabel === "Studio" || beds === 0) {
      bedLabel = "Shop";
      beds = null;
    }
  } else if (bedLabel === "Studio" || beds === 0 || /^studio$/i.test(type) || /^studio$/i.test(hintType)) {
    unitKind = "studio";
    if (!bedLabel || bedLabel === "—") bedLabel = "Studio";
    if (/^studio$/i.test(type) || /^studio$/i.test(hintType)) type = "Studio";
  }
  return {
    id: String(row.ID || row.id || ""),
    title: textOf(row.TITLE || row.title) || "Lead",
    community,
    communityTitle: linkedCommunity || "",
    subCommunity: subCommunity || "—",
    type,
    beds,
    bedLabel,
    unitKind,
    purpose,
    purposeLabel: purpose === "rent" ? "Rent" : purpose === "sale" ? "Sale" : purpose === "unknown" ? "Empty" : "Other",
    clientTypeId: String(row[LEAD_CLIENT_TYPE] ?? "").replace(/\D/g, ""),
    clientType: clientType || "",
    communityId: String(communityId || "").replace(/\D/g, ""),
    communityText: textOf(row[LEAD_COMMUNITY_TEXT]) || "",
    clusterId: String(subId || "").replace(/\D/g, ""),
    cluster: subCommunity && subCommunity !== "—" ? subCommunity : "",
    bedsId: String(row[LEAD_BEDS] ?? "").replace(/\D/g, ""),
    typeId: String(typeId || "").replace(/\D/g, ""),
    statusId: String(row.STATUS_ID || row.statusId || ""),
    agentId: String(row.ASSIGNED_BY_ID || row.assignedById || "").replace(/\D/g, ""),
    listingRef: listingRefOf(row) || "",
    opportunity: Number(row.OPPORTUNITY || 0) || 0,
    enrichedFrom: pfHint?.source || (listingHint ? "listing" : ""),
  };
}

export function assembleLeadBreakdown(rows, fields = {}, titles = {}, listingHints = {}, pfHints = new Map()) {
  const leads = (rows || [])
    .map((row) => {
      const ref = listingRefOf(row);
      const hint = ref ? listingHints[ref.toLowerCase()] || listingHints[ref] : null;
      const pfHint = pfHints.get(String(row.ID || row.id)) || null;
      return mapLeadRow(row, fields, titles, hint, pfHint);
    })
    .filter((row) => row.id);
  return {
    total: leads.length,
    rent: leads.filter((row) => row.purpose === "rent").length,
    sale: leads.filter((row) => row.purpose === "sale").length,
    other: leads.filter((row) => row.purpose === "other").length,
    unknown: leads.filter((row) => row.purpose === "unknown").length,
    types: countMap(leads, (row) => ({ id: norm(row.type) || "other", name: row.type || "Other" }), "types"),
    beds: countMap(leads, (row) => ({ id: row.beds == null ? "na" : String(row.beds), name: row.bedLabel || "—" }), "beds"),
    communities: countMap(leads, (row) => ({ id: norm(row.community) || "none", name: communityLabel(row.community) }), "communities"),
    subCommunities: countMap(
      leads.filter((row) => row.subCommunity && row.subCommunity !== "—"),
      (row) => ({ id: norm(row.subCommunity) || "none", name: row.subCommunity }),
      "default"
    ),
    leads,
  };
}

function asList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.result)) return result.result;
  return [];
}

async function loadTitles(post, entityTypeId, ids) {
  const wanted = [...new Set((ids || []).map((id) => String(id || "").trim()).filter((id) => id && id !== "0" && /^\d+$/.test(id)))];
  const titles = {};
  if (!wanted.length) return titles;
  for (let i = 0; i < wanted.length; i += 50) {
    const chunk = wanted.slice(i, i + 50);
    const body = await post("crm.item.list", {
      entityTypeId,
      filter: { id: chunk.map((id) => Number(id)) },
      select: ["id", "title"],
      start: 0,
    });
    for (const row of asList(body?.result)) {
      const id = String(row.id || row.ID || "");
      const title = textOf(row.title || row.TITLE);
      if (id && title) titles[id] = title;
    }
  }
  return titles;
}

let leadFieldsCache = null;

async function loadLeadFields(post) {
  if (leadFieldsCache && Date.now() - leadFieldsCache.at < 15 * 60 * 1000) return leadFieldsCache.value;
  const body = await post("crm.lead.fields", {});
  const value = body?.result || {};
  leadFieldsCache = { at: Date.now(), value };
  return value;
}

export function clearLeadBreakdownCache() {
  leadFieldsCache = null;
  clearPfEnrichCache();
}

async function loadListingHints(db, rows) {
  const hints = {};
  if (!db?.getByReference) return hints;
  const refs = [...new Set((rows || []).map((row) => listingRefOf(row)).filter(Boolean))];
  for (const ref of refs) {
    try {
      const listing = await db.getByReference(ref);
      if (!listing) continue;
      hints[ref.toLowerCase()] = {
        community: String(listing.community || listing.bayut_community || "").trim(),
        subCommunity: String(listing.sub_community || listing.bayut_sub_community || "").trim(),
        beds: listing.beds ?? listing.bedrooms ?? "",
        type: String(listing.type || listing.category || "").trim(),
        purpose: String(listing.purpose || "").trim(),
      };
    } catch {
      // ignore missing listing desk rows
    }
  }
  return hints;
}

/** Build breakdown from already-fetched lead rows (same list as agent history). */
export async function lookupLeadContext(post, rows) {
  const fields = await loadLeadFields(post).catch(() => ({}));
  const [types, subCommunities, communities] = await Promise.all([
    loadTitles(post, LEAD_UNIT_TYPE_ENTITY, (rows || []).map((row) => row[LEAD_UNIT_TYPE])).catch(() => ({})),
    loadTitles(post, LEAD_SUB_COMMUNITY_ENTITY, (rows || []).map((row) => row[LEAD_SUB_COMMUNITY_ID])).catch(() => ({})),
    loadTitles(post, 1058, (rows || []).map((row) => row[LEAD_COMMUNITY_ID])).catch(() => ({})),
  ]);
  return { fields, titles: { types, subCommunities, communities } };
}

export async function finalizeLeadBreakdown({
  post,
  rows,
  truncated = false,
  calls = 0,
  db = null,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const fields = await loadLeadFields(post).catch(() => ({}));
  const typeIds = (rows || []).map((row) => row[LEAD_UNIT_TYPE]).filter(Boolean);
  const subIds = (rows || []).map((row) => row[LEAD_SUB_COMMUNITY_ID]).filter(Boolean);
  const communityIds = (rows || []).map((row) => row[LEAD_COMMUNITY_ID]).filter(Boolean);
  const [types, subCommunities, communities, listingHints] = await Promise.all([
    loadTitles(post, LEAD_UNIT_TYPE_ENTITY, typeIds).catch(() => ({})),
    loadTitles(post, LEAD_SUB_COMMUNITY_ENTITY, subIds).catch(() => ({})),
    loadTitles(post, 1058, communityIds).catch(() => ({})),
    loadListingHints(db, rows),
  ]);
  const pf = await enrichLeadRowsFromPf(rows, { sleep }).catch(() => ({ hints: new Map(), enriched: 0 }));
  return {
    ...assembleLeadBreakdown(rows, fields, { types, subCommunities, communities }, listingHints, pf.hints || new Map()),
    truncated: Boolean(truncated),
    pfEnriched: Number(pf.enriched || 0),
    calls: Number(calls || 0) + 4 + Number(pf.enriched || 0),
  };
}

export async function loadLeadBreakdown({
  post,
  sleep,
  filter,
  maxPages = 20,
} = {}) {
  const rows = [];
  let calls = 0;
  let truncated = false;
  let start = 0;
  let expectedTotal = null;
  for (let page = 0; page < maxPages; page += 1) {
    const body = await post("crm.lead.list", {
      filter,
      select: LEAD_BREAKDOWN_SELECT,
      order: { ID: "DESC" },
      start,
    });
    calls += 1;
    const chunk = asList(body?.result);
    rows.push(...chunk);
    if (expectedTotal == null && body?.total != null) expectedTotal = Number(body.total) || null;
    const next = body?.next;
    if (next == null || chunk.length === 0) {
      truncated = expectedTotal != null ? rows.length < expectedTotal : false;
      break;
    }
    if (page === maxPages - 1) {
      truncated = true;
      break;
    }
    start = next;
    if (sleep) await sleep(120);
  }

  return finalizeLeadBreakdown({ post, rows, truncated, calls, sleep });
}
