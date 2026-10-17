export const TENANCY_USAGES = ["Commercial", "Residential", "Industrial"];

export const TYPES_BY_USAGE = {
  Residential: [
    "Apartment",
    "Villa",
    "Townhouse",
    "Penthouse",
    "Studio",
    "Hotel Apartment",
    "Duplex",
    "Compound",
    "Whole Building",
  ],
  Commercial: ["Shop", "Office", "Warehouse", "Retail", "Showroom", "Land", "Whole Building"],
  Industrial: ["Warehouse", "Labor Camp", "Factory", "Workshop", "Land"],
};

const TYPE_ALIASES = [
  [/labor\s*camp/i, "Labor Camp"],
  [/hotel/i, "Hotel Apartment"],
  [/town\s*house/i, "Townhouse"],
  [/whole\s*building/i, "Whole Building"],
  [/bulk\s*unit/i, "Bulk Units"],
  [/penthouse/i, "Penthouse"],
  [/شقة|apartment|apt\.?|flat/i, "Apartment"],
  [/فيلا|villa/i, "Villa"],
  [/مكتب|office/i, "Office"],
  [/مستودع|warehouse|store/i, "Warehouse"],
  [/showroom/i, "Showroom"],
  [/retail/i, "Retail"],
  [/محل|shop/i, "Shop"],
  [/أرض|plot land|^land\b/i, "Land"],
  [/استوديو|studio/i, "Studio"],
  [/duplex/i, "Duplex"],
  [/compound/i, "Compound"],
  [/factory|industrial/i, "Factory"],
  [/workshop/i, "Workshop"],
];

const KNOWN_TYPES = new Set([
  ...TYPES_BY_USAGE.Residential,
  ...TYPES_BY_USAGE.Commercial,
  ...TYPES_BY_USAGE.Industrial,
  "Bulk Units",
]);

function raw(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function prettyPropertyType(value) {
  const text = raw(value);
  if (!text) return "";
  for (const [re, label] of TYPE_ALIASES) {
    if (re.test(text)) return label;
  }
  const titled = text.replace(/\b\w/g, (char) => char.toUpperCase());
  return KNOWN_TYPES.has(titled) ? titled : "";
}

export function inferPropertyType(value) {
  const text = raw(value);
  if (!text) return "";
  const known = prettyPropertyType(text);
  if (known) return known;
  if (/(?:^|[\s,·/])S[-.\s]?\d{1,3}\b/i.test(text) || /\bshop\s*\d+/i.test(text)) return "Shop";
  if (/\bretail[-.\s]?\d+/i.test(text)) return "Retail";
  if (/\b(?:office|ofc)[-.\s]?\d+/i.test(text)) return "Office";
  if (/\b(?:apt|apartment|flat)\s*\d+/i.test(text)) return "Apartment";
  if (/\b(?:garden|residence|tower|heights|court|village|avenue)\b/i.test(text) && /\b[A-Z]?\-?\d{1,4}[A-Z]?\b/i.test(text)) {
    return "Apartment";
  }
  if (/^\d{2,4}[A-Z]?$/.test(text)) return "Apartment";
  return "";
}

export function parseUnitTitle(title) {
  const head = raw(title).split("·")[0].trim();
  if (!head) return { building: "", unitNo: "", kind: "" };
  const icShop = /^([A-Z]{1,3}[-]?\d{1,3})\s+(S[-]?\d{1,3})$/i.exec(head);
  if (icShop) return { building: icShop[1], unitNo: icShop[2], kind: "Shop" };
  const retail = /^(.*)\s+(RETAIL[-]?\d+)$/i.exec(head);
  if (retail) return { building: raw(retail[1]), unitNo: retail[2], kind: "Retail" };
  const named = /^(.*)\s+([A-Z]?\-?\d{1,4}[A-Z]?)$/i.exec(head);
  if (named && named[1].length > 1) {
    return { building: raw(named[1]), unitNo: named[2], kind: inferPropertyType(head) };
  }
  return { building: "", unitNo: head, kind: inferPropertyType(head) };
}

export function placeName(value) {
  const text = raw(value);
  if (!text || /^#?\d+$/.test(text)) return "";
  return text;
}

export function usageFromCategory(category) {
  const key = String(category || "").toLowerCase();
  if (key.includes("indus")) return "Industrial";
  if (key.includes("resid")) return "Residential";
  if (key.includes("comm")) return "Commercial";
  return "";
}

export function usageFromPropertyType(type) {
  const text = raw(type).toLowerCase();
  if (!text) return "";
  if (/factory|industrial|workshop|labor\s*camp/.test(text)) return "Industrial";
  if (/apartment|villa|townhouse|penthouse|studio|hotel|duplex|compound/.test(text)) return "Residential";
  if (/shop|office|warehouse|retail|showroom|land|bulk/.test(text)) return "Commercial";
  return "";
}

export function usageFromListing(listing) {
  return usageFromCategory(listing?.category) || usageFromPropertyType(listing?.type || listing?.propertyType) || "";
}

export function defaultTypeForUsage(usage) {
  if (usage === "Residential") return "Apartment";
  if (usage === "Industrial") return "Warehouse";
  return "Shop";
}

export function typesForUsage(usage) {
  return TYPES_BY_USAGE[usage] || TYPES_BY_USAGE.Commercial;
}

export function usageFitsType(usage, type) {
  const pretty = prettyPropertyType(type) || inferPropertyType(type);
  if (!pretty) return true;
  return typesForUsage(usage).includes(pretty) || usageFromPropertyType(pretty) === usage;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function sizeFromListing(listing) {
  const sqm = Number(listing?.area_sqm);
  if (Number.isFinite(sqm) && sqm > 0) return String(Math.round(sqm * 10) / 10);
  const sqft = Number(listing?.area_sqft);
  if (Number.isFinite(sqft) && sqft > 0) return String(Math.round(sqft * 0.092903));
  return "";
}

function unitKeys(value) {
  const text = raw(value).toLowerCase();
  const keys = new Set();
  if (!text) return keys;
  keys.add(text);
  keys.add(text.replace(/[\s._-]+/g, ""));
  const hit = /(?:shop|s|apt|apartment|retail|office|unit)?[-.\s]*(\d{1,4}[a-z]?)/i.exec(text);
  if (hit) {
    keys.add(hit[1]);
    keys.add(`s${hit[1]}`);
    keys.add(`shop${hit[1]}`);
  }
  return keys;
}

function unitsOverlap(a, b) {
  const left = unitKeys(a);
  if (!left.size) return false;
  for (const key of unitKeys(b)) {
    if (key && left.has(key)) return true;
  }
  return false;
}

export function findListingForUnit(unit, listings = []) {
  const parsed = parseUnitTitle(unit?.title || "");
  const unitNo = raw(unit?.unitNo || unit?.propertyNo || parsed.unitNo);
  if (!unitNo) return null;
  const building = raw(unit?.building || parsed.building).toLowerCase();
  const rows = Array.isArray(listings) ? listings : [];
  const hits = rows.filter((row) => unitsOverlap(unitNo, row?.unit_no));
  if (!hits.length) return null;
  if (!building) return hits[0];
  return (
    hits.find((row) => {
      const name = raw(row?.building || row?.project_name).toLowerCase();
      return name && (name.includes(building) || building.includes(name));
    }) || hits[0]
  );
}

export function propertyFieldsFromListing(listing) {
  if (!listing) return {};
  const propertyType = inferPropertyType(listing.type || listing.propertyType) || prettyPropertyType(listing.type || listing.propertyType);
  const usage = usageFromListing(listing) || usageFromPropertyType(propertyType);
  return {
    listingId: listing.id || "",
    usage: usage || "",
    propertyType: propertyType || (usage ? defaultTypeForUsage(usage) : ""),
    location: [listing.community, listing.sub_community].filter(Boolean).join(", ") || firstText(listing.city),
    building: firstText(listing.building, listing.project_name),
    propertyNo: firstText(listing.unit_no) || raw(listing.unit_no),
    size: sizeFromListing(listing),
    plotNo: firstText(listing.plot_no, Number.isNaN(Number(listing.plot_size)) ? listing.plot_size : ""),
    annualRent: listing.purpose === "rent" ? firstText(listing.price_yearly, listing.price_aed) || raw(listing.price_yearly || listing.price_aed) : "",
    landlordName: firstText(listing.landlord_name) || raw(listing.landlord_name),
    landlordEmail: firstText(listing.landlord_email) || raw(listing.landlord_email),
    landlordPhone: firstText(listing.landlord_phone) || raw(listing.landlord_phone),
  };
}

export function propertyFieldsFromUnit(unit, listings = []) {
  const parsed = parseUnitTitle(unit?.title || "");
  const matched = findListingForUnit(unit, listings);
  const fromListing = matched ? propertyFieldsFromListing(matched) : {};
  const blob = [unit?.title, unit?.unitNo, unit?.propertyNo, unit?.building, parsed.kind].filter(Boolean).join(" ");
  const propertyType =
    fromListing.propertyType || parsed.kind || inferPropertyType(blob) || prettyPropertyType(unit?.propertyType || unit?.type || "");
  const usage = fromListing.usage || usageFromPropertyType(propertyType);
  return {
    ...fromListing,
    listingId: fromListing.listingId || "",
    usage: usage || "",
    propertyType: propertyType || "",
    propertyNo: raw(unit?.unitNo) || fromListing.propertyNo || parsed.unitNo || "",
    building: placeName(unit?.building) || fromListing.building || parsed.building || "",
    location: placeName(unit?.location) || placeName(unit?.community) || fromListing.location || "",
    plotNo: raw(unit?.plotNo) || fromListing.plotNo || "",
    size: raw(unit?.size) || fromListing.size || "",
    landlordName: fromListing.landlordName || raw(unit?.ownerName),
    landlordEmail: fromListing.landlordEmail || raw(unit?.ownerEmail),
    landlordPhone: fromListing.landlordPhone || raw(unit?.ownerPhone),
  };
}

export function compactPropertyFields(fields) {
  const next = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value) next[key] = value;
  }
  return next;
}

export function listingSearchQueries(unit) {
  const parsed = parseUnitTitle(unit?.title || "");
  return [...new Set([unit?.unitNo, parsed.unitNo, unit?.building, parsed.building, raw(unit?.title).split("·")[0]].map(raw).filter(Boolean))];
}
