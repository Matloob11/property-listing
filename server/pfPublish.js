import { lookupDld } from "./dld.js";
import { pfConfigured, pfGet, pfLicenseNumber, pfSend, searchLocations } from "./pf.js";
import { liveUnpublishTargets } from "./listingModel.js";

const PF_AMENITIES = new Set([
  "balcony",
  "barbecue-area",
  "built-in-wardrobes",
  "central-ac",
  "childrens-play-area",
  "childrens-pool",
  "concierge",
  "conference-room",
  "covered-parking",
  "dining-in-building",
  "electricity",
  "fibre-optics",
  "fixed-phone",
  "flood-drainage",
  "kitchen-appliances",
  "lobby-in-building",
  "maid-service",
  "maids-room",
  "networked",
  "no-services",
  "pets-allowed",
  "private-garden",
  "private-gym",
  "private-jacuzzi",
  "private-pool",
  "sanitation",
  "security",
  "shared-gym",
  "shared-pool",
  "shared-spa",
  "study",
  "vastu-compliant",
  "view-of-landmark",
  "view-of-water",
  "walk-in-closet",
  "waters",
]);

const AMENITY_ALIASES = {
  "central heating": "",
  "built in wardrobes": "built-in-wardrobes",
  "built-in wardrobes": "built-in-wardrobes",
  "pets allowed": "pets-allowed",
  "shared pool": "shared-pool",
  "shared gym": "shared-gym",
  "covered parking": "covered-parking",
  "central ac": "central-ac",
  "private pool": "private-pool",
  "private gym": "private-gym",
  "maid room": "maids-room",
  "maids room": "maids-room",
  "walk in closet": "walk-in-closet",
  "children play area": "childrens-play-area",
  "childrens play area": "childrens-play-area",
  "kitchen appliances": "kitchen-appliances",
  "view of water": "view-of-water",
  "view of landmark": "view-of-landmark",
  "private garden": "private-garden",
  "conference room": "conference-room",
  "available networked": "networked",
  "networked": "networked",
  "dining in building": "dining-in-building",
  "lobby in building": "lobby-in-building",
  "vastu compliant": "vastu-compliant",
  "vastu-compliant": "vastu-compliant",
  "shared spa": "shared-spa",
  "private jacuzzi": "private-jacuzzi",
  "concierge service": "concierge",
  "maid service": "maid-service",
  "built in kitchen appliances": "kitchen-appliances",
  "central ac and heating": "central-ac",
};

const TYPE_TO_PF = {
  apartment: "apartment",
  villa: "villa",
  townhouse: "townhouse",
  penthouse: "penthouse",
  office: "office-space",
  warehouse: "warehouse",
  shop: "shop",
  retail: "retail",
  land: "land",
  duplex: "duplex",
  whole_building: "whole-building",
  hotel_apartment: "hotel-apartment",
  showroom: "show-room",
  labor_camp: "labor-camp",
  farm: "farm",
  bulk_units: "bulk-rent-unit",
  compound: "compound",
};

const PROJECT_TO_PF = {
  ready_secondary: "completed",
  offplan_secondary: "off_plan",
  ready_primary: "completed_primary",
  offplan_primary: "off_plan_primary",
};

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function publicOrigin() {
  return String(process.env.PUBLIC_ORIGIN || "").replace(/\/$/, "");
}

function absoluteUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, "https:");
  const origin = publicOrigin();
  if (!origin) fail("PUBLIC_ORIGIN is not set, so listing photos cannot be sent to Property Finder.");
  return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
}

function asciiText(value) {
  return String(value || "")
    .replace(/[•●▪◦]/g, "-")
    .replace(/\*\*/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function foldName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/s$/, ""))
    .join(" ");
}

function roomEnum(value, fallback) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "studio" || raw === "none") return raw;
  const n = Number(raw);
  if (Number.isFinite(n) && n <= 0) return fallback;
  if (Number.isFinite(n) && n >= 1 && n <= 30) return String(Math.round(n));
  return fallback;
}

function furnishingType(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "furnished") return "furnished";
  if (raw.includes("semi")) return "semi-furnished";
  return "unfurnished";
}

function mapAmenities(list) {
  const out = [];
  for (const item of list || []) {
    const key = String(item || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const alias = Object.prototype.hasOwnProperty.call(AMENITY_ALIASES, key) ? AMENITY_ALIASES[key] : key.replace(/\s+/g, "-");
    if (alias && PF_AMENITIES.has(alias) && !out.includes(alias)) out.push(alias);
  }
  return out;
}

function imageUrls(listing) {
  const seen = new Set();
  const urls = [];
  for (const item of [listing.photo, ...((listing.gallery || []).map((file) => file?.url))]) {
    const url = absoluteUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function priceAmount(value) {
  const cleaned = String(value ?? "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function pricePayload(listing) {
  if (listing.purpose === "rent") {
    const period = ["yearly", "monthly", "weekly", "daily"].includes(listing.price_period)
      ? listing.price_period
      : "yearly";
    const amount = priceAmount(listing[`price_${period}`] || listing.price_aed);
    if (!(amount > 0)) fail("Rent price is required before the listing can go live on Property Finder.");
    const rent = { type: period, amounts: { [period]: Math.round(amount) } };
    if (listing.hide_price === "1") rent.onRequest = true;
    return rent;
  }
  const sale = priceAmount(listing.sale_price || listing.price_aed);
  if (!(sale > 0)) fail("Sale price is required before the listing can go live on Property Finder.");
  const body = { type: "sale", amounts: { sale: Math.round(sale) } };
  if (listing.hide_price === "1") body.onRequest = true;
  const down = Number(listing.down_payment_price || 0);
  if (down > 0) body.downpayment = Math.round(down);
  return body;
}

function emirateOf(listing) {
  const city = String(listing.city || "").toLowerCase();
  if (city.includes("abu dhabi")) return "abu_dhabi";
  if (city.includes("dubai") || !city) return "dubai";
  return "northern_emirates";
}

function scoreLocation(hit, needles) {
  const name = foldName(hit.name);
  let score = 0;
  for (const needle of needles) {
    if (!needle) continue;
    if (name === needle) score += 20;
    else if (name.includes(needle) || needle.includes(name)) score += 10;
  }
  const type = String(hit.type || "").toUpperCase();
  if (/TOWER|BUILDING|PROJECT/.test(type)) score += 5;
  else if (type === "SUBCOMMUNITY") score += 3;
  else if (type === "COMMUNITY") score += 1;
  return score;
}

async function resolveLocationId(listing) {
  if (listing.pf_location_id) return String(listing.pf_location_id);
  const queries = [listing.building, listing.sub_community, listing.project_name, listing.community].filter(Boolean);
  const needles = queries.map(foldName).filter(Boolean);
  const seen = new Set();
  const hits = [];
  for (const query of queries) {
    const rows = await searchLocations(query);
    for (const row of rows) {
      const id = String(row.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      hits.push(row);
    }
  }
  hits.sort((a, b) => scoreLocation(b, needles) - scoreLocation(a, needles));
  const best = hits[0];
  if (!best || scoreLocation(best, needles) < 10) {
    fail(`Property Finder location was not found for ${queries.join(" / ") || "this listing"}.`);
  }
  return String(best.id);
}

function nameKey(value) {
  return foldName(value);
}

async function resolveAgentProfileId(db, listing) {
  if (listing.pf_agent_id && /^\d+$/.test(String(listing.pf_agent_id))) {
    const users = await db.pfUsers();
    const match = users.find(
      (user) => String(user.pf_id) === String(listing.pf_agent_id) || String(user.profile_id) === String(listing.pf_agent_id)
    );
    if (match?.profile_id) return Number(match.profile_id);
    return Number(listing.pf_agent_id);
  }
  const users = await db.pfUsers();
  const wanted = [listing.listing_agent, listing.listing_owner].map(nameKey).filter(Boolean);
  const match = users.find((user) => wanted.includes(nameKey(user.name)));
  if (!match?.profile_id) {
    fail(`No Property Finder agent profile was found for ${listing.listing_agent || listing.listing_owner || "this listing"}.`);
  }
  return Number(match.profile_id);
}

async function complianceDates(listing) {
  let issue = String(listing.permit_issue_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(issue)) return issue.slice(0, 10);
  if (!listing.permit_number) return "";
  try {
    const dld = await lookupDld(listing.permit_number);
    return String(dld.info?.issued || dld.patch?.permit_issue_date || "").slice(0, 10);
  } catch {
    return "";
  }
}

function wantsPfPortal(listing) {
  const portals = listing.portals || [];
  return portals.includes("pf") || portals.includes("pf_api");
}

export function shouldPushToPf(listing) {
  return pfConfigured() && listing && listing.status === "live" && wantsPfPortal(listing);
}

export async function buildPfListingPayload(db, listing) {
  if (!listing.permit_number) fail("Listing permit number is required before Property Finder publish.");
  const title = asciiText(listing.title);
  const description = asciiText(listing.description);
  if (!title) fail("Title is required before Property Finder publish.");
  if (!description) fail("Description is required before Property Finder publish.");
  const images = imageUrls(listing);
  if (!images.length) fail("At least one photo is required before Property Finder publish.");
  const locationId = await resolveLocationId(listing);
  const profileId = await resolveAgentProfileId(db, listing);
  const issued = await complianceDates(listing);
  if (!issued) fail("DLD permit issue date is required before Property Finder publish.");
  const type = listing.purpose === "rent" && listing.type === "bulk_units" ? "bulk-rent-unit" : TYPE_TO_PF[listing.type] || "apartment";
  const size = Math.round(Number(listing.area_sqft || 0));
  if (!(size > 0)) fail("Property size is required before Property Finder publish.");
  const payload = {
    assignedTo: { id: profileId },
    createdBy: { id: profileId },
    location: { id: Number(locationId) },
    category: listing.category === "commercial" ? "commercial" : "residential",
    type,
    bedrooms: roomEnum(listing.beds, listing.beds === 0 ? "studio" : "1"),
    bathrooms: roomEnum(listing.baths, "1"),
    size,
    furnishingType: furnishingType(listing.furnished),
    title: { en: title },
    description: { en: description },
    reference: listing.reference,
    uaeEmirate: emirateOf(listing),
    projectStatus: PROJECT_TO_PF[listing.project_status] || "completed",
    price: pricePayload(listing),
    media: { images: images.map((url) => ({ original: { url } })) },
    compliance: {
      listingAdvertisementNumber: String(listing.permit_number).trim(),
      type: listing.license_type === "dtcm" ? "dtcm" : "rera",
      issuingClientLicenseNumber: pfLicenseNumber(),
      advertisementLicenseIssuanceDate: /^\d{4}-\d{2}-\d{2}$/.test(issued) ? `${issued}T00:00:00Z` : issued,
      userConfirmedDataIsCorrect: true,
    },
  };
  const amenities = mapAmenities(listing.amenities);
  if (amenities.length) payload.amenities = amenities;
  const unit = String(listing.unit_no || "").trim();
  if (unit && !/^\d{8,}$/.test(unit)) payload.unitNumber = unit;
  const cheques = Number(listing.cheques || 0);
  if (cheques > 0) payload.price.numberOfCheques = Math.round(cheques);
  if (listing.available_from) payload.availableFrom = String(listing.available_from).slice(0, 10);
  if (listing.developer) payload.developer = asciiText(listing.developer);
  if (listing.landlord_name) payload.ownerName = asciiText(listing.landlord_name);
  const parking = Number(listing.parking || 0);
  if (parking > 0) payload.parkingSlots = Math.round(parking);
  return { payload, locationId: String(locationId), profileId: String(profileId) };
}

async function fetchPublishedListing(reference, pfId) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const body = await pfGet(`/v1/listings?filter%5Breference%5D=${encodeURIComponent(reference)}`);
      const match = (body.results || []).find(
        (row) => String(row.id) === String(pfId) || String(row.reference || "").toLowerCase() === String(reference).toLowerCase()
      );
      if (match?.state?.stage === "live" || match?.portals?.propertyfinder?.isLive) return match;
      if (attempt === 3) return match || null;
    } catch {
      if (attempt === 3) return null;
    }
  }
  return null;
}

function reasonsOf(body) {
  const list = Array.isArray(body?.state?.reasons) ? body.state.reasons : [];
  return list.map((row) => String(row.en || row.ar || "")).filter(Boolean);
}

async function createPfListing(payload) {
  try {
    return await pfSend("POST", "/v1/listings", payload);
  } catch (error) {
    const msg = `${error.message} ${(error.details || []).join(" ")}`;
    if (/created_by|createdBy/i.test(msg) && payload.createdBy && !payload.created_by) {
      const { createdBy, ...rest } = payload;
      return pfSend("POST", "/v1/listings", { ...rest, created_by: createdBy });
    }
    throw error;
  }
}

export async function pushListingToPf(db, listing, byName = "Property Finder") {
  if (!shouldPushToPf(listing)) return listing;
  const { payload, locationId, profileId } = await buildPfListingPayload(db, listing);
  let pfId = String(listing.pf_id || "");
  let created = null;
  if (!pfId) {
    created = await createPfListing(payload);
    pfId = String(created.id || "");
    if (!pfId) fail("Property Finder created the listing but did not return an id.", 502);
    listing = await db.updateDirect(
      listing,
      {
        pf_id: pfId,
        pf_location_id: locationId,
        pf_agent_id: profileId,
        pf_state: created.state?.stage || "draft",
        pf_state_type: created.state?.type || "",
        pf_synced_at: new Date().toISOString(),
      },
      byName
    );
  }
  if (!created) {
    const updatePayload = { ...payload };
    delete updatePayload.createdBy;
    await pfSend("PUT", `/v1/listings/${encodeURIComponent(pfId)}`, updatePayload);
  }
  const published = await pfSend("POST", `/v1/listings/${encodeURIComponent(pfId)}/publish`);
  const confirmed = (await fetchPublishedListing(listing.reference, pfId)) || published || created;
  const stage = String(confirmed?.state?.stage || published?.state?.stage || created?.state?.stage || "");
  const live = stage === "live" || confirmed?.portals?.propertyfinder?.isLive === true;
  return db.updateDirect(
    listing,
    {
      pf_id: pfId,
      pf_location_id: locationId,
      pf_agent_id: profileId,
      pf_state: stage || listing.pf_state,
      pf_state_type: String(confirmed?.state?.type || published?.state?.type || listing.pf_state_type || ""),
      pf_is_live: live ? "1" : "",
      status: live ? "live" : listing.status,
      pf_published_at: live ? new Date().toISOString() : listing.pf_published_at,
      pf_reasons: reasonsOf(confirmed || published),
      pf_synced_at: new Date().toISOString(),
    },
    byName
  );
}

export async function pushListingToPfSafe(db, listing, byName) {
  if (!shouldPushToPf(listing)) return { listing, pf_error: "" };
  try {
    return { listing: await pushListingToPf(db, listing, byName), pf_error: "" };
  } catch (error) {
    console.error("PF push failed", listing.reference, error.message);
    return { listing, pf_error: error.message };
  }
}

/**
 * Take a listing off selected portals from this desk.
 * Property Finder: POST /v1/listings/{id}/unpublish (live API).
 * Bayut / Dubizzle: drop from the XML feed immediately.
 */
export async function unpublishListingFromPortals(db, listing, portals, byName = "Desk") {
  if (!listing) {
    const error = new Error("Listing not found");
    error.status = 404;
    throw error;
  }
  const wanted = [...new Set((Array.isArray(portals) ? portals : []).map((id) => (id === "pf_api" ? "pf" : String(id))))];
  const live = liveUnpublishTargets(listing);
  const chosen = wanted.filter((id) => live.includes(id));
  if (!chosen.length) {
    const error = new Error("This listing is not live on the selected portals.");
    error.status = 400;
    throw error;
  }

  if (chosen.includes("pf")) {
    const pfId = String(listing.pf_id || "").trim();
    if (pfConfigured() && pfId) {
      try {
        await pfSend("POST", `/v1/listings/${encodeURIComponent(pfId)}/unpublish`);
      } catch (error) {
        if (error.status !== 409 && error.status !== 404) throw error;
      }
    }
  }

  const drop = new Set();
  if (chosen.includes("pf")) {
    drop.add("pf");
    drop.add("pf_api");
  }
  if (chosen.includes("bayut")) drop.add("bayut");
  if (chosen.includes("dubizzle")) drop.add("dubizzle");

  const patch = {
    portals: (listing.portals || []).filter((id) => !drop.has(id)),
  };
  if (chosen.includes("pf")) {
    patch.pf_is_live = "";
    patch.pf_state = "unpublished";
    patch.pf_synced_at = new Date().toISOString();
  }
  const updated = await db.updateDirect(listing, patch, byName);
  return { listing: updated, unpublished: chosen };
}
