import {
  CACHE_MS,
  assertReadMethod,
  crmRead,
  normalizeAgentId,
  resolveCrmAgent,
} from "./crmIntelligence.js";
import { EMPTY_COMMUNITY, communityLabel, isBlankCommunity } from "./displayEmpty.js";
import { EXTRA_COMMUNITIES, LOCATIONS } from "./locations.js";
import { sortRollupRows } from "./rollupSort.js";

export const OWNER_ENTITY_TYPE_ID = Number(process.env.CRM_OWNER_ENTITY_TYPE_ID || 1042);
export const OWNER_CATEGORY_ID = Number(process.env.CRM_OWNER_CATEGORY_ID || 14);
export const OWNER_COMMUNITY_TYPE_ID = 1058;
export const OWNER_SUB_COMMUNITY_TYPE_ID = 1062;
export const OWNER_MAX_PAGES = 60;
export const OWNER_LIST_PAGE = 50;

/** Incomplete first-page pulls (50 cards) must never replace a larger verified snapshot. */
export function isSuspiciouslySmallOwnerPull(lastCount, nextCount, pageSize = OWNER_LIST_PAGE) {
  const lastN = Number(lastCount) || 0;
  const nextN = Number(nextCount) || 0;
  if (nextN >= lastN) return false;
  if (lastN <= pageSize) return false;
  if (nextN <= pageSize) return true;
  return nextN < lastN - pageSize && nextN < lastN * 0.85;
}

export const KNOWN_OWNER_FIELDS = {
  community: "parentId1058",
  communityText: "ufCrm5_1777563155595",
  subCommunity: "parentId1062",
  subCommunityText: "ufCrm5_1768487008300",
  beds: "ufCrm5_1734246780476",
  bedsText: "ufCrm5_1770020172403",
  unitType: "ufCrm5_1734246899822",
  purpose: "ufCrm5_1734247157896",
  size: "ufCrm5_1734246988917",
  salePrice: "ufCrm5_1734247021855",
  rentPrice: "ufCrm5_1734247036310",
  annualRent: "ufCrm5_1782036951158",
  owner: "ufCrm5_1768314832600",
  unitNo: "ufCrm5_1734246798953",
  source: "sourceId",
};

const memory = new Map();
const inflight = new Map();
let fieldsCache = null;
let stagesCache = null;
let sourceCache = null;
const communityMemory = new Map();

function asList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.result)) return result.result;
  if (result && typeof result === "object" && (result.id || result.ID)) return [result];
  return [];
}

function norm(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function textOf(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return String(value.valueName || value.NAME || value.name || value.value || value.TITLE || value.title || "").trim();
  }
  return String(value).trim();
}

export function findOwnerField(fields, needles, exclude = []) {
  let best = { id: "", score: 0 };
  const want = (needles || []).map(norm).filter(Boolean);
  const skip = (exclude || []).map(norm).filter(Boolean);
  for (const [id, meta] of Object.entries(fields || {})) {
    const label = norm(meta?.title || meta?.formLabel || meta?.listLabel || meta?.upperName || id);
    if (!label || skip.some((item) => label.includes(item))) continue;
    for (const needle of want) {
      let score = 0;
      if (label === needle) score = 100 + needle.length;
      else if (label.startsWith(needle)) score = 70 + needle.length;
      else if (label.includes(needle)) score = 40 + needle.length;
      if (score > best.score) best = { id, score };
    }
  }
  return best.id;
}

export function itemRaw(item, fieldId) {
  if (!item || !fieldId) return "";
  const compact = String(fieldId).replace(/_/g, "");
  const camel = String(fieldId).replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
  return item[fieldId] ?? item[camel] ?? item[compact] ?? item[String(fieldId).toUpperCase()] ?? "";
}

function enumLabel(meta, raw) {
  const key = textOf(raw) || String(raw ?? "").trim();
  if (!key || !meta) return key;
  const items = meta.items || meta.list || [];
  if (Array.isArray(items)) {
    const hit = items.find((row) => [row.ID, row.id, row.VALUE, row.value].some((value) => String(value) === key));
    if (hit) return String(hit.VALUE || hit.value || hit.NAME || hit.name || key);
  } else if (items && typeof items === "object") {
    return String(items[key] || items[raw] || key);
  }
  return key;
}

export function itemField(item, fieldId, fields = {}) {
  return enumLabel(fields?.[fieldId], itemRaw(item, fieldId)) || textOf(itemRaw(item, fieldId));
}

export function purposeOf(purpose, stage) {
  const text = norm(`${purpose} ${stage}`);
  if (/salerent|rentsale|saleandrent/.test(text)) return "sale_rent";
  if (text.includes("rent") && text.includes("sale")) return "sale_rent";
  if (text.includes("rent")) return "rent";
  if (text.includes("sale")) return "sale";
  return "other";
}

/** Only the three Bitrix Availability kanban columns. */
export function availabilityPurposeOf(stageLabel = "", stageId = "") {
  const text = norm(stageLabel);
  const id = String(stageId || "").trim().toLowerCase();
  const suffix = (id.match(/:([a-z0-9_]+)$/i) || [])[1]?.replace(/_/g, "") || "";
  if (text === "newavailability") return "";
  if (
    suffix === "salerent" ||
    suffix === "rentsale" ||
    suffix === "saleandrent" ||
    suffix === "both" ||
    /(salerent|rentsale|saleandrent)availability/.test(text)
  ) {
    return "sale_rent";
  }
  if (suffix === "rent" || text === "rentavailability") return "rent";
  if (suffix === "sale" || text === "saleavailability") return "sale";
  if (/availability/.test(text) && /sale/.test(text) && /rent/.test(text)) return "sale_rent";
  if (/availability/.test(text) && text.includes("rent") && !text.includes("sale")) return "rent";
  if (/availability/.test(text) && text.includes("sale") && !text.includes("rent")) return "sale";
  return "";
}

export function isAvailabilityStage(stageLabel = "", stageId = "") {
  return Boolean(availabilityPurposeOf(stageLabel, stageId));
}

function fallbackAvailStages() {
  const prefix = `DT${OWNER_ENTITY_TYPE_ID}_${OWNER_CATEGORY_ID}`;
  return [
    { STATUS_ID: `${prefix}:RENT`, NAME: "Rent Availability" },
    { STATUS_ID: `${prefix}:SALE`, NAME: "Sale Availability" },
    { STATUS_ID: `${prefix}:BOTH`, NAME: "Sale/Rent availability" },
    { STATUS_ID: `${prefix}:SALERENT`, NAME: "Sale/Rent availability" },
  ];
}

export function mergeAvailStages(stages = []) {
  const map = new Map();
  const live = (stages || []).filter((row) =>
    isAvailabilityStage(row?.NAME || row?.name, row?.STATUS_ID || row?.statusId)
  );
  // Real Bitrix columns only. Fake :RENT / :SALE ids return total 0 and used to wipe the real count.
  const source = live.length ? live : fallbackAvailStages();
  for (const row of source) {
    const id = String(row?.STATUS_ID || row?.statusId || "").trim();
    const name = String(row?.NAME || row?.name || "").trim();
    if (!id || !isAvailabilityStage(name, id)) continue;
    if (!map.has(id)) map.set(id, { STATUS_ID: id, NAME: name || id });
  }
  return [...map.values()];
}

function looksLikePhone(value) {
  return /^\+?\d[\d\s-]{5,}$/.test(String(value || "").trim());
}

const MAX_BEDROOMS = 10;

export function typeOf(unitType, beds) {
  const rawType = String(unitType || "").trim();
  if (looksLikePhone(rawType)) return "Other";
  if (rawType && /^\d+(\.\d+)?$/.test(rawType)) return "Other";
  const text = norm(unitType);
  if (/shop|retail/.test(text)) return "Shop";
  if (text.includes("studio")) return "Studio";
  if (/apartment|flat/.test(text)) return "Apartment";
  if (/townhouse/.test(text)) return "Townhouse";
  if (/villa/.test(text)) return "Villa";
  if (/office/.test(text)) return "Office";
  if (/warehouse/.test(text)) return "Warehouse";
  if (/penthouse/.test(text)) return "Penthouse";
  if (/commercial/.test(text)) return "Commercial";
  if (!rawType && beds === 0) return "Studio";
  const pretty = rawType.replace(/_/g, " ").trim();
  return pretty ? pretty.replace(/\b\w/g, (char) => char.toUpperCase()) : "Other";
}

export function bedsOf(value) {
  const raw = textOf(value);
  if (!raw) return null;
  if (/studio|^0\s*b\/?r$|studi0/i.test(raw) || norm(raw) === "0br") return 0;
  const labeled = raw.match(/(\d+)\s*\+?\s*(?:b\/?r|bed(?:room)?s?|bhk)\b/i);
  if (labeled) return clampBeds(labeled[1]);
  const compact = raw.match(/^(\d+)\s*b(?!ed)/i);
  if (compact) return clampBeds(compact[1]);
  const plus = raw.trim().match(/^(\d+)\+$/);
  if (plus) return clampBeds(plus[1]);
  if (/^\d+$/.test(raw.trim())) return clampBeds(raw.trim());
  return null;
}

function clampBeds(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_BEDROOMS) return null;
  return n;
}

/** Office Inventory place: linked community first, otherwise the community text on the card. */
export function inventoryCommunity(prop = {}) {
  const linkedRaw = String(prop.community || "").trim();
  const linked = linkedRaw && !isBlankCommunity(linkedRaw) ? linkedRaw : "";
  const text = String(prop.communityText || "").trim();
  const sub = String(prop.subCommunity || "").trim();
  const agent = norm(prop.agentName || prop.agent || "");
  let picked = linked;
  if (!picked && text && !looksLikeJunkCommunity(text) && norm(text) !== agent) picked = text;
  const hint = splitCommunityHint(picked);
  let community = "";
  let cluster = sub && !isBlankCommunity(sub) ? sub : "";
  if (picked && hint.community) {
    community = hint.community;
    const pickedIsParent = norm(hint.community) === norm(picked);
    if (!pickedIsParent && !cluster) cluster = picked;
  } else if (picked) {
    community = picked;
  }
  if (cluster && community && norm(cluster) === norm(community)) cluster = "";
  return {
    community: community ? communityLabel(community) : EMPTY_COMMUNITY,
    cluster: cluster || "No cluster",
  };
}

/** Real area names only — never treat owner/agent titles or source codes as communities. */
let knownCommunityNames = null;
export function knownCommunityNameMap() {
  if (knownCommunityNames) return knownCommunityNames;
  const map = new Map();
  const add = (name) => {
    const label = textOf(name);
    const key = norm(label);
    if (!key || key.length < 3) return;
    if (!map.has(key)) map.set(key, label);
  };
  for (const groups of Object.values(LOCATIONS || {})) {
    for (const name of Object.keys(groups || {})) add(name);
  }
  for (const list of Object.values(EXTRA_COMMUNITIES || {})) {
    for (const name of list || []) add(name);
  }
  for (const alias of [
    ["JVC", "Jumeirah Village Circle"],
    ["JLT", "Jumeirah Lake Towers"],
    ["DIP", "Dubai Investment Park"],
    ["MBR City", "Mohammed Bin Rashid City"],
    ["International City", "International City"],
    ["Mudon", "Mudon"],
    ["Business Bay", "Business Bay"],
    ["Downtown Dubai", "Downtown Dubai"],
    ["Dubai Marina", "Dubai Marina"],
    ["Al Warsan", "Al Warsan"],
    ["Villanova", "Villanova"],
  ]) {
    map.set(norm(alias[0]), alias[1]);
  }
  knownCommunityNames = map;
  return map;
}

export function looksLikeJunkCommunity(value) {
  const raw = textOf(value).trim();
  if (!raw) return true;
  if (isBlankCommunity(raw)) return true;
  if (/^uc[_\s-]/i.test(raw)) return true; // Bitrix source ids like UC_7J0E2Q
  if (/@|\+971|\b\d{7,}\b/.test(raw)) return true;
  if (/\b\d+\s*br\b|\bg\s*\+\s*\d\b/i.test(raw)) return true; // "Reh man, 3br, g+1"
  if (/[,|]/.test(raw) && !/(cluster|city|hills|bay|community|village)/i.test(raw)) return true;
  if (/^(kl|xx|test|n\/?a|na|none)\d*$/i.test(raw)) return true;
  return false;
}

/** Accept only known Dubai areas / mapped hints — not agent or owner names. */
export function isTrustedCommunityName(value) {
  const raw = textOf(value).trim();
  if (!raw || looksLikeJunkCommunity(raw)) return false;
  const key = norm(raw);
  if (knownCommunityNameMap().has(key)) return true;
  const hint = splitCommunityHint(raw);
  if (hint.community && knownCommunityNameMap().has(norm(hint.community))) return true;
  return false;
}

export function splitCommunityHint(value) {
  const raw = textOf(value).trim();
  if (!raw || looksLikeJunkCommunity(raw)) return { community: "", subCommunity: "" };
  const key = norm(raw);
  if (!key || key === "thisarea" || key.includes("futurebut") || key.includes("intelligence") || /^\?+$/.test(raw)) {
    return { community: "", subCommunity: "" };
  }
  if (/mudonalranim|\branim\b|^mudon\d/.test(key) || key.includes("ranim")) {
    return { community: "Mudon", subCommunity: raw };
  }
  if (key === "mudon" || key.startsWith("mudon")) {
    return { community: "Mudon", subCommunity: key === "mudon" ? "" : raw };
  }
  if (
    /internationalcity|englandcluster|greececluster|spaincluster|persiacluster|moroccocluster|francecluster|chinacluster|emiratescluster|russiacluster|warsan|aljawzaa|jawzaa/.test(
      key
    )
  ) {
    if (key === "internationalcity") return { community: "International City", subCommunity: "" };
    return {
      community: "International City",
      subCommunity: /internationalcity/.test(key) && !/cluster|jawzaa|warsan|phase/.test(key) ? "" : raw,
    };
  }
  if (/amaranta/.test(key)) return { community: "Villanova", subCommunity: raw };
  if (/alwarsan|warsan/.test(key)) return { community: "Al Warsan", subCommunity: raw };
  if (/downtown/.test(key)) return { community: "Downtown Dubai", subCommunity: "" };
  if (/businessbay/.test(key)) return { community: "Business Bay", subCommunity: "" };
  if (/jumeirahvillage|jvc/.test(key)) return { community: "Jumeirah Village Circle", subCommunity: "" };
  if (/jumeirahlaketowers|\bjlt\b/.test(key)) return { community: "Jumeirah Lake Towers", subCommunity: "" };
  if (/villanova/.test(key)) return { community: "Villanova", subCommunity: "" };
  if (/damachills2|damachillsii/.test(key)) return { community: "Damac Hills 2", subCommunity: "" };
  if (/damachills/.test(key)) return { community: "Damac Hills", subCommunity: "" };
  if (/damaclagoons/.test(key)) return { community: "Damac Lagoons", subCommunity: "" };
  if (/dubaimarina/.test(key)) return { community: "Dubai Marina", subCommunity: "" };
  if (/arabianranches3/.test(key)) return { community: "Arabian Ranches 3", subCommunity: "" };
  if (/arabianranches2/.test(key)) return { community: "Arabian Ranches 2", subCommunity: "" };
  if (/arabianranches/.test(key)) return { community: "Arabian Ranches", subCommunity: "" };

  const known = knownCommunityNameMap().get(key);
  if (known) return { community: known, subCommunity: "" };

  // Free text that is not a known area / mapped hint is NOT a community
  // (stops agent names, owner titles, random notes from polluting the chart).
  return { community: "", subCommunity: "" };
}

function moneyOf(value) {
  const n = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
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

export function mapOwnerFields(fields) {
  const has = Object.keys(fields || {}).length > 0;
  const known = (id, fallback) => (has && fields[id] ? id : fallback);
  return {
    community: known(KNOWN_OWNER_FIELDS.community, findOwnerField(fields, ["community"], ["subcommunity"])),
    communityText: known(KNOWN_OWNER_FIELDS.communityText, findOwnerField(fields, ["communitytext"], ["subcommunity"])),
    subCommunity: known(KNOWN_OWNER_FIELDS.subCommunity, findOwnerField(fields, ["subcommunity"])),
    subCommunityText: known(KNOWN_OWNER_FIELDS.subCommunityText, ""),
    beds: known(KNOWN_OWNER_FIELDS.beds, findOwnerField(fields, ["noofbedroom", "bedroom"], ["bedroomsprice"])),
    bedsText: known(KNOWN_OWNER_FIELDS.bedsText, findOwnerField(fields, ["bed"], ["bedroom", "noofbedroom"])),
    unitType: known(KNOWN_OWNER_FIELDS.unitType, findOwnerField(fields, ["unittype"], ["unitnumber", "unitnox"])),
    purpose: known(KNOWN_OWNER_FIELDS.purpose, findOwnerField(fields, ["purpose"], ["purposesize"])),
    owner: known(KNOWN_OWNER_FIELDS.owner, findOwnerField(fields, ["importownername", "ownername"], ["ownerno", "ownernumber", "ownermobile", "ownerphone", "owneremail"])),
    tenant: findOwnerField(fields, ["tenantname", "currenttenant", "tenant"], ["tenantno", "tenantnumber", "tenantphone", "tenantmobile", "tenantemail", "owner"]),
    size: known(KNOWN_OWNER_FIELDS.size, findOwnerField(fields, ["sizeinsqft", "size"], ["plotsize"])),
    salePrice: known(KNOWN_OWNER_FIELDS.salePrice, findOwnerField(fields, ["sellingprice"], ["pricepersqft"])),
    rentPrice: known(KNOWN_OWNER_FIELDS.rentPrice, findOwnerField(fields, ["leaseprice"])),
    annualRent: known(KNOWN_OWNER_FIELDS.annualRent, findOwnerField(fields, ["anualrent", "annualrent"], ["leaseprice", "pricepersqft"])),
    source: known(KNOWN_OWNER_FIELDS.source, findOwnerField(fields, ["source"], ["sourceinformation"])),
    unitNo: known(KNOWN_OWNER_FIELDS.unitNo, findOwnerField(fields, ["unitnumber"], ["unitnumberx"])),
  };
}

export function stageNameOf(stageId, stages = []) {
  const id = String(stageId || "").trim();
  if (!id) return "";
  const row = stages.find((item) => String(item.STATUS_ID || item.statusId || item.id) === id);
  return textOf(row?.NAME || row?.name || row?.STATUS_NAME) || id;
}

function communityOf(item, map, titles = {}) {
  const linked = communityOfLinked(item, map.community, titles);
  const subLinked = communityOfLinked(item, map.subCommunity, titles);
  const subText = textOf(itemField(item, map.subCommunityText, {}) || itemRaw(item, map.subCommunityText));
  const communityText = textOf(itemField(item, map.communityText, {}) || itemRaw(item, map.communityText));
  const subLinkedClean = subLinked && !isBlankCommunity(subLinked) ? subLinked : "";
  const subTextClean = subText && !isBlankCommunity(subText) ? subText : "";
  const communityTextClean = communityText && !isBlankCommunity(communityText) ? communityText : "";

  const rowSub = subLinkedClean || subTextClean || communityTextClean || "";

  // CRM charts stay on the linked Community field only.
  // communityText is kept so Office Inventory can show the area written on the card.
  if (linked && isTrustedCommunityName(linked)) {
    return {
      community: linked,
      communityText: communityTextClean,
      communityLinked: true,
      subCommunity: subLinkedClean || subTextClean || "",
      subCommunityLinked: Boolean(subLinkedClean),
    };
  }

  return {
    community: EMPTY_COMMUNITY,
    communityText: communityTextClean,
    communityLinked: false,
    subCommunity: rowSub,
    subCommunityLinked: Boolean(subLinkedClean),
  };
}

function entityIdOf(item, fieldId) {
  const raw = itemRaw(item, fieldId);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const nested = raw.id ?? raw.ID ?? raw.value ?? raw.VALUE;
    const id = String(nested ?? "").replace(/\D/g, "");
    if (id) return id;
  }
  const id = String(textOf(raw) || raw || "").replace(/\D/g, "");
  return id;
}

function communityOfLinked(item, fieldId, titles = {}) {
  const raw = itemRaw(item, fieldId);
  const id = textOf(raw) || String(raw ?? "").trim();
  if (!id) return "";
  return titles[id] || titles[String(Number(id))] || (/^\d+$/.test(id) ? "" : id);
}

function sourceOf(item, fieldId, sourceNames = {}, fields = {}) {
  const raw = itemField(item, fieldId, fields);
  if (/^https?:\/\//i.test(raw)) {
    if (/bayut/i.test(raw)) return "Bayut";
    if (/propertyfinder/i.test(raw)) return "Property Finder";
    return "Listing link";
  }
  return sourceNames[raw] || sourceNames[item.sourceId] || raw;
}

export function assembleOwnerData(items, fields = {}, agentName = "", stages = [], extras = {}) {
  const map = mapOwnerFields(fields);
  const communityTitles = extras.communityTitles || {};
  const sourceNames = extras.sourceNames || {};
  const mapped = (items || []).map((item) => {
    const stageId = item.stageId || item.STAGE_ID || "";
    const stageLabel = stageNameOf(stageId, stages);
    const availability = availabilityPurposeOf(stageLabel, stageId);
    const purposeText = itemField(item, map.purpose, fields);
    // Availability stages only: purpose = kanban column (exact Bitrix Availability counts).
    const purpose = availability || purposeOf(purposeText, stageLabel);
    const bedsOfficial = bedsOf(itemField(item, map.beds, fields));
    const bedsFallback = bedsOf(itemField(item, map.bedsText, fields) || itemRaw(item, map.bedsText));
    const bedsFromEnum = bedsOfficial != null;
    const beds = bedsFromEnum ? bedsOfficial : bedsFallback;
    const bedEnumId = String(textOf(itemRaw(item, map.beds)) || "").replace(/\D/g, "");
    const unitTypeRaw = itemRaw(item, map.unitType);
    const unitType = itemField(item, map.unitType, fields);
    const typeFromEnum = Boolean(textOf(unitTypeRaw) || unitType);
    const salePrice = moneyOf(itemField(item, map.salePrice, fields));
    const leasePrice = moneyOf(itemField(item, map.rentPrice, fields));
    const annualRent = moneyOf(itemField(item, map.annualRent, fields));
    const rentPrice = leasePrice || annualRent;
    const price = purpose === "rent" ? rentPrice : purpose === "sale" ? salePrice : salePrice || rentPrice;
    const title = textOf(item.title || item.TITLE);
    const ownerOfficial = itemField(item, map.owner, fields);
    const owner =
      ownerOfficial && !/^owner data #\d+$/i.test(ownerOfficial) && !/^user\s+\d+$/i.test(ownerOfficial)
        ? ownerOfficial
        : "";
    const tenantOfficial = itemField(item, map.tenant, fields);
    const tenant =
      tenantOfficial && !/^user\s+\d+$/i.test(tenantOfficial) && tenantOfficial.toLowerCase() !== String(owner).toLowerCase()
        ? tenantOfficial
        : "";
    const place = communityOf(item, map, communityTitles);
    const agentId = String(item.assignedById || item.ASSIGNED_BY_ID || "").trim();
    return {
      id: String(item.id || item.ID || ""),
      title: title || owner || "Owner property",
      community: communityLabel(place.community),
      communityText: place.communityText || "",
      communityLinked: Boolean(place.communityLinked),
      subCommunity: place.subCommunity || "",
      subCommunityLinked: Boolean(place.subCommunityLinked),
      type: typeOf(unitType, beds),
      typeFromEnum,
      beds,
      bedEnumId,
      bedsFromEnum,
      bedLabel: beds === 0 ? "Studio" : beds == null ? "—" : beds === 1 ? "1 Bedroom" : `${beds} Bedroom`,
      purpose,
      purposeLabel:
        purpose === "rent"
          ? "Rent Availability"
          : purpose === "sale"
            ? "Sale Availability"
            : purpose === "sale_rent"
              ? "Sale / Rent Availability"
              : "Other",
      availability: Boolean(availability),
      owner,
      tenant,
      size: itemField(item, map.size, fields),
      price,
      rentPrice,
      salePrice,
      source: sourceOf(item, map.source, sourceNames, fields),
      unitNo: itemField(item, map.unitNo, fields),
      stage: String(stageId || ""),
      stageLabel: stageLabel || "—",
      communityId: entityIdOf(item, map.community),
      subCommunityId: entityIdOf(item, map.subCommunity),
      unitTypeId: String(textOf(unitTypeRaw) || "").replace(/\D/g, "") || String(unitTypeRaw || ""),
      agentId,
      agentName: "",
    };
  }).filter((row) => row.id);

  // Show only Rent / Sale / Sale-Rent Availability — match Bitrix Availability columns.
  const properties = mapped.filter((row) => row.availability);
  return {
    ok: true,
    source: "owner_data",
    scope: "availability_stages",
    agentName,
    total: properties.length,
    sale: properties.filter((row) => row.purpose === "sale").length,
    rent: properties.filter((row) => row.purpose === "rent").length,
    saleRent: properties.filter((row) => row.purpose === "sale_rent").length,
    allAssigned: mapped.length,
    // Charts use Bitrix official fields only — same fields agents filter in CRM.
    fieldSources: {
      availability: "Owner Data stages (Rent / Sale / Sale-Rent Availability)",
      type: "Unit Type",
      beds: "No. of Bedroom",
      community: "Community (linked Bitrix field only)",
      subCommunity: "Sub Community (linked only)",
    },
    types: countMap(
      properties.filter((row) => row.typeFromEnum),
      (row) => ({ id: norm(row.type) || "other", name: row.type || "Other" }),
      "types"
    ),
    beds: countMap(
      properties.filter((row) => row.bedsFromEnum),
      (row) => ({ id: String(row.beds), name: row.bedLabel }),
      "beds"
    ),
    communities: countMap(
      properties,
      (row) => ({
        id: row.communityLinked ? norm(row.community) || "none" : "none",
        name: row.communityLinked ? row.community : EMPTY_COMMUNITY,
      }),
      "communities"
    ),
    // Sub Community chart = Bitrix linked Sub Community field only (parentId1062).
    // Free-text "Grece cluster" without a link still shows on the property row, but does not inflate this chart.
    subCommunities: countMap(
      properties.filter((row) => row.subCommunityLinked && row.subCommunity),
      (row) => ({ id: norm(row.subCommunity) || "none", name: row.subCommunity }),
      "default"
    ),
    stages: countMap(properties, (row) => ({ id: norm(row.stageLabel) || "none", name: row.stageLabel }), "default"),
    properties,
    bitrixVerified: true,
    verifyNote:
      "Charts use Bitrix Owner Data official fields only. A CRM icon opens that same stage, community, sub community, unit type and bedrooms already selected.",
  };
}

async function loadOwnerFields(post) {
  if (fieldsCache && Date.now() - fieldsCache.at < CACHE_MS) return fieldsCache.value;
  const body = await post("crm.item.fields", { entityTypeId: OWNER_ENTITY_TYPE_ID });
  const value = body?.result?.fields || body?.result || {};
  fieldsCache = { at: Date.now(), value };
  return value;
}

async function loadOwnerStages(post) {
  if (stagesCache && Date.now() - stagesCache.at < CACHE_MS) return stagesCache.value;
  const entityId = `DYNAMIC_${OWNER_ENTITY_TYPE_ID}_STAGE_${OWNER_CATEGORY_ID}`;
  const body = await post("crm.status.list", { filter: { ENTITY_ID: entityId } });
  const value = asList(body?.result);
  stagesCache = { at: Date.now(), value };
  return value;
}

async function loadSourceNames(post) {
  if (sourceCache && Date.now() - sourceCache.at < CACHE_MS) return sourceCache.value;
  const body = await post("crm.status.list", { filter: { ENTITY_ID: "SOURCE" } });
  const value = {};
  for (const row of asList(body?.result)) {
    const id = String(row.STATUS_ID || row.statusId || "");
    if (id) value[id] = textOf(row.NAME || row.name);
  }
  sourceCache = { at: Date.now(), value };
  return value;
}

async function loadEntityTitles(post, entityTypeId, ids) {
  const wanted = [...new Set((ids || []).map((id) => String(id || "").trim()).filter((id) => id && id !== "0"))];
  const titles = {};
  const missing = [];
  const memPrefix = `${entityTypeId}:`;
  for (const id of wanted) {
    const key = memPrefix + id;
    if (communityMemory.has(key)) titles[id] = communityMemory.get(key);
    else missing.push(id);
  }
  if (!missing.length) return titles;
  const body = await post("crm.item.list", {
    entityTypeId,
    filter: { id: missing.map((id) => Number(id) || id) },
    select: ["id", "title"],
    start: 0,
  });
  for (const row of asList(body?.result)) {
    const id = String(row.id || row.ID || "");
    const title = textOf(row.title || row.TITLE);
    if (!id || !title) continue;
    communityMemory.set(memPrefix + id, title);
    titles[id] = title;
  }
  return titles;
}

async function loadCommunityTitles(post, ids) {
  return loadEntityTitles(post, OWNER_COMMUNITY_TYPE_ID, ids);
}

async function loadSubCommunityTitles(post, ids) {
  return loadEntityTitles(post, OWNER_SUB_COMMUNITY_TYPE_ID, ids);
}

async function listOwnerPage(post, filter, start) {
  return post("crm.item.list", {
    entityTypeId: OWNER_ENTITY_TYPE_ID,
    filter,
    select: ["*"],
    order: { id: "DESC" },
    start,
  });
}

/** Page until Bitrix is empty. Do not stop when `total` equals page size and `next` is missing. */
export async function collectOwnerPages(post, filter, sleep, state = {}) {
  const rows = state.rows || [];
  const seen = state.seen || new Set();
  const startCount = rows.length;
  let start = 0;
  let pages = 0;
  let truncated = Boolean(state.truncated);
  let apiTotal = 0;
  let calls = Number(state.calls || 0);
  let lastChunk = 0;
  while (pages < OWNER_MAX_PAGES) {
    if (sleep && calls > 0) await sleep(120);
    const body = await listOwnerPage(post, filter, start);
    calls += 1;
    pages += 1;
    const chunk = asList(body?.result);
    lastChunk = chunk.length;
    if (pages === 1) apiTotal = Number(body?.total ?? body?.result?.total ?? 0) || 0;
    for (const row of chunk) {
      const rid = String(row.id || row.ID || "").trim();
      if (!rid || seen.has(rid)) continue;
      seen.add(rid);
      rows.push(row);
    }
    const next = body?.next ?? body?.result?.next;
    if (next != null && String(next) !== "" && Number(next) !== Number(start)) {
      start = next;
      continue;
    }
    if (chunk.length >= OWNER_LIST_PAGE) {
      start = Number(start || 0) + chunk.length;
      continue;
    }
    break;
  }
  const pulled = rows.length - startCount;
  if (pages >= OWNER_MAX_PAGES && lastChunk >= OWNER_LIST_PAGE) truncated = true;
  if (apiTotal > pulled) truncated = true;
  return { rows, seen, truncated, calls, apiTotal };
}

async function loadOwnerItems(post, sleep, agentId, stages = []) {
  const id = Number(agentId);
  const baseFilters = [
    { assignedById: id, categoryId: OWNER_CATEGORY_ID },
    { assignedById: id, CATEGORY_ID: OWNER_CATEGORY_ID },
    { ASSIGNED_BY_ID: String(id), categoryId: OWNER_CATEGORY_ID },
    { ASSIGNED_BY_ID: String(id), CATEGORY_ID: OWNER_CATEGORY_ID },
  ];
  let base = baseFilters[0];
  let calls = 0;
  let allAssigned = 0;

  for (const filter of baseFilters) {
    try {
      const head = await listOwnerPage(post, filter, 0);
      calls += 1;
      base = filter;
      allAssigned = Number(head?.total ?? head?.result?.total ?? 0) || asList(head?.result).length;
      if (allAssigned || asList(head?.result).length) break;
    } catch {
      /* try next filter shape */
    }
  }

  const availStages = mergeAvailStages(stages);
  const rows = [];
  const seen = new Set();
  let truncated = false;
  const bitrixStageTotals = { rent: 0, sale: 0, saleRent: 0 };

  const stageFilterFns = [
    (stageId) => ({ ...base, stageId }),
    (stageId) => ({ ...base, STAGE_ID: stageId }),
  ];

  if (availStages.length) {
    for (const stage of availStages) {
      const stageId = String(stage.STATUS_ID || stage.statusId || "").trim();
      if (!stageId) continue;
      const purpose = availabilityPurposeOf(stage.NAME || stage.name, stageId);
      const before = rows.length;
      let paged = { apiTotal: 0, truncated: false, calls };
      for (const candidate of stageFilterFns) {
        const beforeTry = rows.length;
        paged = await collectOwnerPages(post, candidate(stageId), sleep, {
          rows,
          seen,
          truncated,
          calls,
        });
        calls = paged.calls;
        truncated = paged.truncated;
        if (paged.apiTotal > 0 || rows.length > beforeTry) break;
      }
      const bucket = purpose === "sale_rent" ? "saleRent" : purpose;
      if (bucket && bitrixStageTotals[bucket] != null) {
        const pulled = rows.length - before;
        bitrixStageTotals[bucket] = Math.max(Number(bitrixStageTotals[bucket] || 0), Number(paged.apiTotal || 0), pulled);
      }
    }
  }

  const expectedAvail = bitrixStageTotals.rent + bitrixStageTotals.sale + bitrixStageTotals.saleRent;
  if (expectedAvail > rows.length && allAssigned) {
    const paged = await collectOwnerPages(post, base, sleep, { rows, seen, truncated, calls });
    truncated = paged.truncated;
    calls = paged.calls;
  }
  if (!allAssigned) allAssigned = rows.length;
  return { rows, truncated, calls, allAssigned, bitrixStageTotals };
}

export function clearCrmOwnerDataCache() {
  memory.clear();
  inflight.clear();
  fieldsCache = null;
  stagesCache = null;
  sourceCache = null;
  communityMemory.clear();
}

export async function checkCrmOwnerData({
  db,
  agentId,
  agentName,
  force = false,
  post = crmRead,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let id = normalizeAgentId(agentId);
  let name = String(agentName || "").trim();
  if (!id && name) {
    const found = await resolveCrmAgent({ post, name });
    if (!found) {
      const error = new Error("This name is not in CRM.");
      error.status = 404;
      throw error;
    }
    id = found.id;
    name = found.name;
  }
  if (!id) {
    const error = new Error("Select an agent first.");
    error.status = 400;
    throw error;
  }
  const key = `owner_v15:${id}`;
  const settingKey = `crm_owner_${key}`;
  const fresh = memory.get(key) || (db ? await db.getSetting(settingKey, null) : null);
  // Cache hits only for successful Availability pulls. Never keep "0 Availability" when
  // the agent still has Owner cards (allAssigned > 0) — that was a transient Bitrix miss.
  const cacheOk =
    fresh?.verified === true &&
    fresh?.checkedAt &&
    Date.now() - Number(fresh.checkedAt) < CACHE_MS &&
    fresh.ownerPull === "availability_stages" &&
    (Number(fresh.total || 0) > 0 || Number(fresh.allAssigned || 0) === 0);
  if (!force && cacheOk) {
    memory.set(key, fresh);
    return { ...fresh, cached: true };
  }
  if (inflight.has(key)) return inflight.get(key);
  const run = (async () => {
    if (force) {
      fieldsCache = null;
      stagesCache = null;
      sourceCache = null;
      communityMemory.clear();
    }
    assertReadMethod("crm.item.list");
    let stages = await loadOwnerStages(post).catch(() => []);
    if (!stages.length) {
      if (sleep) await sleep(300);
      stages = await loadOwnerStages(post).catch(() => []);
    }
    const [fields, listed] = await Promise.all([
      loadOwnerFields(post).catch(() => ({})),
      loadOwnerItems(post, sleep, id, stages),
    ]);
    const communityIds = listed.rows.map((row) => row.parentId1058 || row[KNOWN_OWNER_FIELDS.community]).filter(Boolean);
    const subCommunityIds = listed.rows.map((row) => row.parentId1062 || row[KNOWN_OWNER_FIELDS.subCommunity]).filter(Boolean);
    const [communityTitles, subCommunityTitles, sourceNames] = await Promise.all([
      loadCommunityTitles(post, communityIds).catch(() => ({})),
      loadSubCommunityTitles(post, subCommunityIds).catch(() => ({})),
      loadSourceNames(post).catch(() => ({})),
    ]);
    const assembled = assembleOwnerData(listed.rows, fields, name, stages, {
      communityTitles: { ...communityTitles, ...subCommunityTitles },
      sourceNames,
    });
    if (listed.allAssigned != null) assembled.allAssigned = listed.allAssigned;
    const bitrixStageTotals = listed.bitrixStageTotals || { rent: 0, sale: 0, saleRent: 0 };
    const sumParts = Number(assembled.rent || 0) + Number(assembled.sale || 0) + Number(assembled.saleRent || 0);
    const incomplete = ["rent", "sale", "saleRent"].some((key) => {
      const api = Number(bitrixStageTotals[key] || 0);
      const ours = Number(assembled[key] || 0);
      return api > ours;
    });
    const verified =
      assembled.total === sumParts &&
      !listed.truncated &&
      !incomplete &&
      assembled.total === (assembled.properties || []).length;
    const report = {
      ...assembled,
      ok: verified,
      error: verified
        ? ""
        : listed.truncated
          ? "Bitrix Owner Data pages were truncated — counts are not complete."
          : incomplete
            ? "Bitrix Sale/Rent Availability totals did not match this pull."
            : "Owner Data did not verify against Bitrix Availability columns.",
      agentId: id,
      cached: false,
      truncated: listed.truncated,
      verified,
      bitrixStageTotals,
      ownerPull: "availability_stages",
      checkedAt: Date.now(),
      calls: listed.calls + 4,
    };
    const previous = memory.get(key) || (db ? await db.getSetting(settingKey, null) : null);
    // A verified Check is the current CRM picture, even when a stage change made the count smaller.
    // Keep the last verified snapshot only when this pull is short or did not match Bitrix.
    if (!verified && previous?.verified && (listed.truncated || incomplete || isSuspiciouslySmallOwnerPull(previous.total, report.total))) {
      return { ...previous, cached: true, fromLastVerified: true };
    }
    const canCache =
      report.verified === true &&
      report.ownerPull === "availability_stages" &&
      !listed.truncated &&
      (Number(report.total || 0) > 0 || Number(report.allAssigned || 0) === 0);
    if (canCache) {
      memory.set(key, report);
      if (db?.setSetting) await db.setSetting(settingKey, report).catch(() => {});
    }
    return report;
  })().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

async function resolveUserNames(post, sleep, ids) {
  const names = {};
  const unique = [...new Set((ids || []).map((id) => String(id || "").trim()).filter((id) => /^\d+$/.test(id)))].slice(0, 250);
  for (let i = 0; i < unique.length; i += 1) {
    const id = unique[i];
    try {
      if (i > 0 && sleep) await sleep(80);
      const body = await post("user.get", { ID: id });
      const user = Array.isArray(body?.result) ? body.result[0] : body?.result;
      const name = [user?.NAME, user?.LAST_NAME].filter(Boolean).join(" ").trim();
      if (name) names[id] = name;
    } catch {
      /* keep empty */
    }
  }
  return names;
}

/** Office-wide Owner Data Availability (all agents, three Bitrix columns only). */
export async function checkOfficeOwnerAvailability({
  post = crmRead,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  assertReadMethod("crm.item.list");
  let stages = await loadOwnerStages(post).catch(() => []);
  if (!stages.length && sleep) {
    await sleep(250);
    stages = await loadOwnerStages(post).catch(() => []);
  }
  const availStages = mergeAvailStages(stages);
  if (!availStages.length) {
    return { ok: false, error: "no_availability_stages", properties: [], rent: 0, sale: 0, saleRent: 0, total: 0 };
  }
  const fields = await loadOwnerFields(post).catch(() => ({}));
  const rows = [];
  const seen = new Set();
  let truncated = false;
  let calls = 1;
  const bitrixStageTotals = { rent: 0, sale: 0, saleRent: 0 };
  const filters = [
    (stageId) => ({ categoryId: OWNER_CATEGORY_ID, stageId }),
    (stageId) => ({ CATEGORY_ID: OWNER_CATEGORY_ID, stageId }),
  ];

  for (const stage of availStages) {
    const stageId = String(stage.STATUS_ID || stage.statusId || "").trim();
    if (!stageId) continue;
    const purpose = availabilityPurposeOf(stage.NAME || stage.name, stageId);
    const before = rows.length;
    let paged = { apiTotal: 0 };
    for (const candidate of filters) {
      paged = await collectOwnerPages(post, candidate(stageId), sleep, {
        rows,
        seen,
        truncated,
        calls,
      });
      calls = paged.calls;
      truncated = paged.truncated;
      if (paged.apiTotal > 0 || rows.length > before) break;
    }
    const bucket = purpose === "sale_rent" ? "saleRent" : purpose;
    if (bucket && Number(paged.apiTotal) > 0 && bitrixStageTotals[bucket] != null) {
      bitrixStageTotals[bucket] += Number(paged.apiTotal);
    }
  }

  const communityIds = rows.map((row) => row.parentId1058 || row[KNOWN_OWNER_FIELDS.community]).filter(Boolean);
  const subCommunityIds = rows.map((row) => row.parentId1062 || row[KNOWN_OWNER_FIELDS.subCommunity]).filter(Boolean);
  const [communityTitles, subCommunityTitles, sourceNames] = await Promise.all([
    loadCommunityTitles(post, communityIds).catch(() => ({})),
    loadSubCommunityTitles(post, subCommunityIds).catch(() => ({})),
    loadSourceNames(post).catch(() => ({})),
  ]);
  const assembled = assembleOwnerData(rows, fields, "Office", stages, {
    communityTitles: { ...communityTitles, ...subCommunityTitles },
    sourceNames,
  });
  const agentNames = await resolveUserNames(
    post,
    sleep,
    assembled.properties.map((row) => row.agentId)
  );
  const properties = assembled.properties.map((row) => ({
    ...row,
    agentName: agentNames[row.agentId] || (row.agentId ? `User ${row.agentId}` : "Empty agent"),
  }));
  const stageRows = availStages.map((stage) => {
    const name = String(stage.NAME || stage.name || "").trim();
    const purpose = availabilityPurposeOf(name, String(stage.STATUS_ID || stage.statusId || ""));
    const count = properties.filter((row) => row.purpose === purpose).length;
    return {
      id: String(stage.STATUS_ID || stage.statusId || ""),
      name,
      purpose,
      count,
      bitrixTotal: bitrixStageTotals[purpose === "sale_rent" ? "saleRent" : purpose] ?? null,
    };
  });
  const sumParts = Number(assembled.rent || 0) + Number(assembled.sale || 0) + Number(assembled.saleRent || 0);
  const expected = Number(bitrixStageTotals.rent || 0) + Number(bitrixStageTotals.sale || 0) + Number(bitrixStageTotals.saleRent || 0);
  const incomplete = ["rent", "sale", "saleRent"].some((key) => {
    const api = Number(bitrixStageTotals[key]);
    const ours = Number(assembled[key] || 0);
    return api > 0 && api !== ours;
  });
  const verified =
    !truncated &&
    assembled.total === sumParts &&
    assembled.total === properties.length &&
    expected > 0 &&
    assembled.total === expected &&
    !incomplete;
  return {
    ok: verified,
    verified,
    truncated,
    error: verified
      ? ""
      : truncated
        ? "Bitrix Owner Data pages were truncated — counts are not complete."
        : expected > 0 && assembled.total !== expected
          ? `Owner Data pull ${assembled.total} did not match Bitrix Availability ${expected}.`
          : "Bitrix Owner Data counts did not match Availability columns.",
    source: "bitrix_owner_data",
    rent: assembled.rent,
    sale: assembled.sale,
    saleRent: assembled.saleRent,
    total: assembled.total,
    bitrixStageTotals,
    properties,
    types: assembled.types,
    beds: assembled.beds,
    communities: assembled.communities,
    subCommunities: assembled.subCommunities,
    stages: stageRows,
    calls,
  };
}
