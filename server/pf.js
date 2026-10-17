// Property Finder Atlas API client + sync into the desk (listings, leads, agents, locations, credits).
import { TYPES } from "./listingModel.js";

const BASE = "https://atlas.propertyfinder.com";
let tokenCache = { value: "", expiresAt: 0 };

export function pfConfigured() {
  return Boolean(process.env.PF_API_KEY && process.env.PF_API_SECRET);
}

async function token() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.value;
  const res = await fetch(`${BASE}/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.PF_API_KEY, apiSecret: process.env.PF_API_SECRET }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.accessToken) throw new Error(body.message || `Property Finder auth failed (${res.status})`);
  tokenCache = { value: body.accessToken, expiresAt: Date.now() + Number(body.expiresIn || 1800) * 1000 };
  return tokenCache.value;
}

export async function pfGet(path) {
  // Note: Node's default "Accept-Language: *" makes the PF locations service answer 404, so send "en".
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${await token()}`,
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "a7-listing-desk/1.0",
    },
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw pfHttpError(res.status, path, body);
  return body;
}

function flattenPfErrors(body) {
  const parts = [];
  const walk = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          walk(JSON.parse(trimmed));
          return;
        } catch {
          /* keep raw text */
        }
      }
      parts.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      walk(value.detail);
      walk(value.message);
      walk(value.title);
      walk(value.errors);
      if (value.field && (value.detail || value.title)) {
        parts.push(`${value.field}: ${value.detail || value.title}`);
      }
    }
  };
  walk(body);
  return [...new Set(parts.filter((part) => part && part !== "failed to create listing: request failed:"))];
}

function pfHttpError(status, path, body) {
  const details = flattenPfErrors(body).filter((part) => !/^Property Finder \d+ on /.test(part));
  const error = new Error(details[0] || `Property Finder ${status} on ${path}`);
  error.status = status;
  error.details = details;
  return error;
}

export async function pfSend(method, path, payload) {
  const headers = {
    Authorization: `Bearer ${await token()}`,
    Accept: "application/json",
    "Accept-Language": "en",
    "User-Agent": "a7-listing-desk/1.0",
  };
  if (payload !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw pfHttpError(res.status, path, body);
  return body;
}

export async function searchLocations(query, opts = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    search: q,
    perPage: String(opts.perPage || 50),
    page: String(opts.page || 1),
  });
  if (opts.type) params.set("filter[type]", opts.type);
  if (opts.parent) params.set("filter[parent]", opts.parent);
  const body = await pfGet(`/v1/locations?${params}`);
  return Array.isArray(body.data) ? body.data : [];
}

export function pfLicenseNumber() {
  return String(process.env.PF_LICENSE_NUMBER || DEFAULT_LICENSE).trim();
}

// A7 DED / DLD company license as published on Property Finder listings
// (`issued_license_number`). Override with PF_LICENSE_NUMBER if DLD changes it.
const DEFAULT_LICENSE = "1056530";

export async function fetchCompliance(permitNumber, { licenseNumber, permitType = "rera" } = {}) {
  const permit = String(permitNumber || "").trim();
  const license = String(licenseNumber || process.env.PF_LICENSE_NUMBER || DEFAULT_LICENSE).trim();
  const type = String(permitType || "rera").trim() || "rera";
  if (!permit) throw Object.assign(new Error("Listing Permit Number is required for DLD info."), { status: 400 });
  if (!license) throw Object.assign(new Error("Company license number is not configured for DLD lookup."), { status: 503 });
  return pfGet(
    `/v1/compliances/${encodeURIComponent(permit)}/${encodeURIComponent(license)}?permitType=${encodeURIComponent(type)}`
  );
}

// ------------------------------------------------------------- mapping

const TYPE_MAP = {
  "office-space": "office",
  office: "office",
  "hotel-apartment": "hotel_apartment",
  "whole-building": "whole_building",
  "labor-camp": "labor_camp",
  "bulk-units": "bulk_units",
  "villa-compound": "compound",
};

function mapType(value) {
  const raw = String(value || "").toLowerCase();
  const mapped = TYPE_MAP[raw] || raw.replace(/-/g, "_");
  return TYPES.includes(mapped) ? mapped : "apartment";
}

function pretty(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapFurnished(value) {
  const v = String(value || "").toLowerCase();
  if (v === "furnished") return "furnished";
  if (v.includes("semi")) return "semi_furnished";
  if (v === "unfurnished") return "unfurnished";
  return "";
}

function iso(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function locationParts(location) {
  const tree = Array.isArray(location?.tree) ? location.tree : [];
  const city = tree.find((n) => n.type === "CITY")?.name || "";
  const community = tree.find((n) => n.type === "COMMUNITY")?.name || "";
  const subs = tree.filter((n) => n.type === "SUBCOMMUNITY").map((n) => n.name);
  const towers = tree.filter((n) => /TOWER|BUILDING|PROJECT/.test(String(n.type))).map((n) => n.name);
  let sub_community = subs[0] || "";
  let building = towers[0] || "";
  if (!building && subs.length > 1) building = subs[subs.length - 1];
  return {
    city: city || "Dubai",
    community,
    sub_community,
    building,
    latitude: String(location?.coordinates?.lat ?? location?.lat ?? ""),
    longitude: String(location?.coordinates?.lng ?? location?.lng ?? ""),
  };
}

// PF listing -> desk listing fields. `location` is the resolved PF location record (may be null).
export function mapListing(pf, location, agent) {
  const price = pf.price || {};
  const amounts = price.amounts || {};
  const priceType = String(price.type || "sale");
  const isRent = priceType !== "sale";
  const periodAmount = isRent ? Number(amounts[priceType] || amounts.yearly || amounts.monthly || 0) : 0;
  const stage = String(pf.state?.stage || "");
  const stateType = String(pf.state?.type || "");
  const reasons = Array.isArray(pf.state?.reasons) ? pf.state.reasons.map((r) => String(r.en || r.ar || "")).filter(Boolean) : [];
  const images = Array.isArray(pf.media?.images) ? pf.media.images.map((img) => img?.original?.url).filter(Boolean) : [];
  const loc = locationParts(location);
  const emirate = pretty(pf.uaeEmirate || "");
  return {
    pf_id: String(pf.id),
    reference: String(pf.reference || pf.id),
    title: String(pf.title?.en || pf.title?.ar || "").trim() || `Listing ${pf.reference || pf.id}`,
    title_ar: String(pf.title?.ar || ""),
    description: String(pf.description?.en || ""),
    description_ar: String(pf.description?.ar || ""),
    type: mapType(pf.type),
    category: pf.category === "commercial" ? "commercial" : "residential",
    purpose: isRent ? "rent" : "sale",
    status: stage === "live" ? "live" : "archived",
    beds: Number(pf.bedrooms || 0),
    baths: Number(pf.bathrooms || 0),
    area_sqft: Number(pf.size || 0),
    plot_size: pf.plotSize ? String(pf.plotSize) : "",
    parking: pf.parkingSlots ? String(pf.parkingSlots) : "",
    furnished: mapFurnished(pf.furnishingType),
    amenities: (pf.amenities || []).map(pretty),
    price_aed: isRent ? periodAmount : Number(amounts.sale || 0),
    sale_price: isRent ? "" : String(amounts.sale || ""),
    price_period: isRent && ["yearly", "monthly", "weekly", "daily"].includes(priceType) ? priceType : "yearly",
    price_yearly: amounts.yearly ? String(amounts.yearly) : "",
    price_monthly: amounts.monthly ? String(amounts.monthly) : "",
    price_weekly: amounts.weekly ? String(amounts.weekly) : "",
    price_daily: amounts.daily ? String(amounts.daily) : "",
    cheques: price.numberOfCheques ? String(price.numberOfCheques) : "",
    down_payment_price: price.downpayment ? String(price.downpayment) : "",
    hide_price: price.onRequest ? "1" : "",
    project_status: String(pf.projectStatus || "").includes("off") ? "offplan_secondary" : "ready_secondary",
    city: loc.city || emirate || "Dubai",
    community: loc.community,
    sub_community: loc.sub_community,
    building: loc.building,
    latitude: loc.latitude,
    longitude: loc.longitude,
    photo: images[0] || "",
    gallery: images.map((url, index) => ({ url, name: `Photo ${index + 1}`, kind: "photo" })),
    portals: pf.portals?.propertyfinder?.isLive ? ["pf"] : [],
    listing_agent: String(pf.assignedTo?.name || agent?.name || ""),
    listing_owner: String(pf.assignedTo?.name || agent?.name || ""),
    agent_id: pf.assignedTo?.id ? `pf-${pf.assignedTo.id}` : "",
    pf_agent_id: pf.assignedTo?.id ? String(pf.assignedTo.id) : "",
    pf_state: stage,
    pf_state_type: stateType,
    pf_is_live: pf.portals?.propertyfinder?.isLive ? "1" : "",
    pf_published_at: iso(pf.portals?.propertyfinder?.publishedAt),
    pf_quality_score: pf.qualityScore?.value != null ? String(pf.qualityScore.value) : "",
    pf_quality: pf.qualityScore || {},
    pf_reasons: reasons,
    pf_location_id: pf.location?.id ? String(pf.location.id) : "",
    pf_created_at: iso(pf.createdAt),
    pf_updated_at: iso(pf.updatedAt),
    pf_synced_at: new Date().toISOString(),
    created_at: iso(pf.createdAt) || undefined,
    updated_at: iso(pf.updatedAt) || undefined,
    created_by: "Property Finder",
  };
}

export function mapLead(lead) {
  const contacts = Array.isArray(lead.sender?.contacts) ? lead.sender.contacts : [];
  const phone = contacts.find((c) => c.type === "phone")?.value || "";
  const email = contacts.find((c) => c.type === "email")?.value || "";
  return {
    id: String(lead.id),
    channel: String(lead.channel || ""),
    status: String(lead.status || ""),
    created_at: iso(lead.createdAt),
    entity_type: String(lead.entityType || ""),
    pf_listing_id: String(lead.listing?.id || ""),
    reference: String(lead.listing?.reference || ""),
    sender_name: String(lead.sender?.name || ""),
    sender_phone: String(phone),
    sender_email: String(email),
    agent_pf_profile: lead.publicProfile?.id ? String(lead.publicProfile.id) : "",
    response_link: String(lead.responseLink || ""),
    call_talk_time: lead.call?.talkTime != null ? Number(lead.call.talkTime) : 0,
    call_wait_time: lead.call?.waitTime != null ? Number(lead.call.waitTime) : 0,
    call_record: String(lead.call?.recordFile || ""),
    tags: Array.isArray(lead.tags) ? lead.tags.map(String) : [],
    raw: lead,
  };
}

export function mapUser(user) {
  const profile = user.publicProfile || {};
  return {
    pf_id: String(user.id),
    profile_id: profile.id ? String(profile.id) : "",
    name: String(profile.name || `${user.firstName || ""} ${user.lastName || ""}`).trim(),
    email: String(user.email || profile.email || ""),
    phone: String(profile.phone || user.mobile || ""),
    whatsapp: String(profile.whatsappPhone || ""),
    position: String(profile.position?.primary || ""),
    role: String(user.role?.name || ""),
    status: String(user.status || ""),
    photo: String(profile.imageVariants?.large?.default || profile.imageVariants?.large?.jpg || ""),
    verified: String(profile.verification?.status || ""),
    super_agent: profile.isSuperAgent ? "1" : "",
    created_at: iso(user.createdAt),
  };
}

// ------------------------------------------------------------- sync

export async function fetchAllListings(onPage) {
  const out = [];
  for (let page = 1; page < 200; page += 1) {
    const body = await pfGet(`/v1/listings?perPage=50&page=${page}`);
    const results = body.results || [];
    out.push(...results);
    if (onPage) onPage(page, results.length, body.pagination);
    if (!body.pagination?.nextPage) break;
  }
  return out;
}

export async function fetchLocation(id) {
  const body = await pfGet(`/v1/locations?filter%5Bid%5D=${encodeURIComponent(id)}`);
  return (body.data || [])[0] || null;
}

export async function fetchAllUsers() {
  const out = [];
  for (let page = 1; page < 50; page += 1) {
    const body = await pfGet(`/v1/users?perPage=50&page=${page}`);
    out.push(...(body.data || []));
    if (!body.pagination?.nextPage) break;
  }
  return out;
}

export async function fetchLeadPage(page) {
  const body = await pfGet(`/v1/leads?perPage=50&page=${Math.max(1, Number(page) || 1)}`);
  return {
    leads: body.data || [],
    hasNext: Boolean(body.pagination?.nextPage),
  };
}

// Newest pages always refresh (new leads + call recordings). Then keep going
// while unseen lead IDs appear.
export async function fetchLeads({ maxPages = 40, minPages = 8, knownIds = new Set() } = {}) {
  const out = [];
  const floor = Math.max(1, Number(minPages) || 1);
  for (let page = 1; page <= maxPages; page += 1) {
    const body = await pfGet(`/v1/leads?perPage=50&page=${page}`);
    const data = body.data || [];
    let fresh = 0;
    for (const lead of data) {
      if (!knownIds.has(String(lead.id))) fresh += 1;
      out.push(lead);
    }
    if (!body.pagination?.nextPage) break;
    if (knownIds.size && page >= floor && fresh === 0) break;
  }
  return out;
}

export async function fetchCredits() {
  return pfGet("/v1/credits/balance");
}

function leadAliases(id) {
  const raw = String(id || "").trim();
  const aliases = new Set();
  if (raw) aliases.add(raw);
  const numeric = raw.replace(/^(call_lead_|message_lead_)/i, "");
  if (numeric && numeric !== raw) {
    aliases.add(numeric);
    aliases.add(`call_lead_${numeric}`);
    aliases.add(`message_lead_${numeric}`);
  }
  return aliases;
}

// PF ignores filter[id] and returns the newest page. Find the exact lead
// on the newest pages only — that is where new calls and recordings land.
export async function fetchLead(id, { maxPages = 12 } = {}) {
  const aliases = leadAliases(id);
  if (!aliases.size) return null;
  for (let page = 1; page <= maxPages; page += 1) {
    const body = await pfGet(`/v1/leads?perPage=50&page=${page}`);
    const row = (body.data || []).find((lead) => aliases.has(String(lead.id)));
    if (row) return row;
    if (!body.pagination?.nextPage) break;
  }
  return null;
}
