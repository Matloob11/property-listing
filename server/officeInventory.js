/** Office inventory from Bitrix Owner Data Availability (all agents).
 * Extra KPIs: overall CRM leads and won deals. Listings ads are not the inventory source.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dubaiToday, listingExpiryDate } from "./listingModel.js";
import { listFormA } from "./formA.js";
import { listMoveins } from "./nocMovein.js";
import { listMoveouts } from "./nocMoveout.js";
import { leadPortal, leadPortalLabel } from "./leadPortal.js";
import { PF_LEAD_SOURCE } from "./bitrixLeadSync.js";
import { CRM_PORTAL_SOURCES } from "./crmLeadSync.js";
import { EMPTY, EMPTY_COMMUNITY, EMPTY_SOURCE, communityLabel, sourceLabel } from "./displayEmpty.js";
import {
  OWNER_CATEGORY_ID,
  OWNER_ENTITY_TYPE_ID,
  availabilityPurposeOf,
  checkOfficeOwnerAvailability,
  inventoryCommunity,
  isAvailabilityStage,
  isSuspiciouslySmallOwnerPull,
} from "./crmOwnerData.js";

const DEFAULT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function countMap(items, keyFn, nameFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key && key !== 0) continue;
    const name = nameFn(item);
    const prev = map.get(String(key)) || { id: String(key), name, count: 0 };
    prev.count += 1;
    map.set(String(key), prev);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function prettyType(value) {
  return String(value || "other").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function prettyPhase(value) {
  const raw = String(value || "").trim();
  if (!raw) return EMPTY;
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function bedBucket(row) {
  const n = Number(row?.beds);
  if (!Number.isFinite(n) || n <= 0) return { key: "studio", name: "Studio", beds: 0 };
  return { key: String(n), name: n === 1 ? "1 Bedroom" : `${n} Bedroom`, beds: n };
}

function agentNameOf(row) {
  // Listing agent only — never treat listing_owner as the agent.
  return (
    String(row.listing_agent || "")
      .replace(/\s*[·•]\s*Bitrix ID\s+\d+\s*$/i, "")
      .trim() || "Empty agent"
  );
}

function cleanAgentName(value) {
  return String(value || "")
    .replace(/\s*[·•]\s*Bitrix ID\s+\d+\s*$/i, "")
    .trim();
}

function isEmptyAgentLabel(name) {
  const s = String(name || "").trim().toLowerCase();
  return !s || s === "unassigned" || s === "empty agent" || s === "empty" || s === "unknown";
}

function clusterOf(row) {
  return String(row.sub_community || row.building || "").trim() || "No cluster";
}

function money(value) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function daysUntil(day, today) {
  if (!day || !today) return null;
  const a = Date.parse(`${day}T00:00:00+04:00`);
  const b = Date.parse(`${today}T00:00:00+04:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

function inventoryRow(row, today = dubaiToday()) {
  const bed = bedBucket(row);
  const purpose = row.purpose === "rent" ? "rent" : "sale";
  const price = money(row.price_aed);
  const rentYearly = purpose === "rent" ? money(row.price_yearly) || price : null;
  const rentMonthly =
    purpose === "rent" ? money(row.price_monthly) || (rentYearly != null ? Math.round(rentYearly / 12) : null) : null;
  const salePrice = purpose === "sale" ? money(row.sale_price) || price : null;
  const expiry = listingExpiryDate(row);
  const daysLeft = daysUntil(expiry, today);
  return {
    id: String(row.id || ""),
    reference: String(row.reference || ""),
    title: String(row.title || row.reference || "Listing"),
    purpose,
    status: String(row.status || ""),
    type: String(row.type || "other"),
    typeLabel: prettyType(row.type),
    beds: bed.beds,
    bedKey: bed.key,
    bedLabel: bed.name,
    community: communityLabel(row.community),
    cluster: clusterOf(row),
    city: String(row.city || "").trim() || "Dubai",
    price,
    rentYearly,
    rentMonthly,
    salePrice,
    projectStatus: String(row.project_status || ""),
    phaseLabel: prettyPhase(row.project_status),
    expiry,
    daysLeft,
    expiringSoon: row.status === "live" && daysLeft != null && daysLeft >= 0 && daysLeft <= 30,
    expiredLive: row.status === "live" && daysLeft != null && daysLeft < 0,
    expired: daysLeft != null && daysLeft < 0,
    areaSqft: Number(row.area_sqft || 0) || null,
    agent: agentNameOf(row),
    agentId: /^\d+$/.test(String(row.agent_id || "").trim()) ? String(row.agent_id).trim() : "",
    owner: String(row.listing_owner || "").trim(),
    live: row.status === "live",
  };
}

function matchInventoryFilters(row, filters = {}) {
  const purpose = String(filters.purpose || "").trim();
  const status = String(filters.status || "").trim();
  const type = String(filters.type || "").trim().toLowerCase();
  const beds = String(filters.beds || "").trim();
  const community = String(filters.community || "").trim().toLowerCase();
  const cluster = String(filters.cluster || "").trim().toLowerCase();
  const agent = String(filters.agent || "").trim().toLowerCase();
  const q = String(filters.q || "").trim().toLowerCase();
  if (purpose && row.purpose !== purpose) return false;
  if (status === "live" && !row.live) return false;
  if (status === "archived" && row.status !== "archived") return false;
  if (status === "expired" && !row.expired) return false;
  if (type && row.type !== type && row.typeLabel.toLowerCase() !== type) return false;
  if (beds) {
    if (beds === "studio" && row.bedKey !== "studio") return false;
    else if (beds === "other") {
      const n = Number(row.beds);
      if (row.bedKey === "studio" || (Number.isFinite(n) && n >= 1 && n <= 3)) return false;
    } else if (beds !== "studio" && String(row.beds) !== beds) return false;
  }
  if (community && row.community.toLowerCase() !== community) return false;
  if (cluster && row.cluster.toLowerCase() !== cluster) return false;
  if (agent && !row.agent.toLowerCase().includes(agent)) return false;
  if (q) {
    const hay = [
      row.title,
      row.reference,
      row.community,
      row.cluster,
      row.city,
      row.typeLabel,
      row.bedLabel,
      row.agent,
      row.purpose,
      row.phaseLabel,
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function purposeBedMatrix(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.community}||${row.cluster}||${row.bedKey}||${row.type}`;
    const prev = map.get(key) || {
      id: key,
      community: row.community,
      cluster: row.cluster,
      bedKey: row.bedKey,
      bedLabel: row.bedLabel,
      type: row.type,
      typeLabel: row.typeLabel,
      total: 0,
      live: 0,
      rent: 0,
      sale: 0,
      saleRent: 0,
      liveRent: 0,
      liveSale: 0,
      minPrice: null,
      maxPrice: null,
      minRentYearly: null,
      maxRentYearly: null,
      minSalePrice: null,
      maxSalePrice: null,
      agents: new Set(),
    };
    prev.total += 1;
    if (row.live) prev.live += 1;
    if (row.purpose === "rent") {
      prev.rent += 1;
      if (row.live) prev.liveRent += 1;
      if (row.rentYearly != null) {
        prev.minRentYearly = prev.minRentYearly == null ? row.rentYearly : Math.min(prev.minRentYearly, row.rentYearly);
        prev.maxRentYearly = prev.maxRentYearly == null ? row.rentYearly : Math.max(prev.maxRentYearly, row.rentYearly);
      }
    } else if (row.purpose === "sale_rent") {
      prev.saleRent += 1;
      if (row.rentYearly != null) {
        prev.minRentYearly = prev.minRentYearly == null ? row.rentYearly : Math.min(prev.minRentYearly, row.rentYearly);
        prev.maxRentYearly = prev.maxRentYearly == null ? row.rentYearly : Math.max(prev.maxRentYearly, row.rentYearly);
      }
      if (row.salePrice != null) {
        prev.minSalePrice = prev.minSalePrice == null ? row.salePrice : Math.min(prev.minSalePrice, row.salePrice);
        prev.maxSalePrice = prev.maxSalePrice == null ? row.salePrice : Math.max(prev.maxSalePrice, row.salePrice);
      }
    } else {
      prev.sale += 1;
      if (row.live) prev.liveSale += 1;
      if (row.salePrice != null) {
        prev.minSalePrice = prev.minSalePrice == null ? row.salePrice : Math.min(prev.minSalePrice, row.salePrice);
        prev.maxSalePrice = prev.maxSalePrice == null ? row.salePrice : Math.max(prev.maxSalePrice, row.salePrice);
      }
    }
    if (row.price != null) {
      prev.minPrice = prev.minPrice == null ? row.price : Math.min(prev.minPrice, row.price);
      prev.maxPrice = prev.maxPrice == null ? row.price : Math.max(prev.maxPrice, row.price);
    }
    prev.agents.add(row.agent);
    map.set(key, prev);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      agents: [...row.agents].sort((a, b) => a.localeCompare(b)),
      agentCount: row.agents.size,
    }))
    .sort(
      (a, b) =>
        b.live - a.live ||
        b.total - a.total ||
        a.community.localeCompare(b.community) ||
        a.cluster.localeCompare(b.cluster) ||
        a.bedLabel.localeCompare(b.bedLabel)
    );
}

function agentRollup(rows) {
  const map = new Map();
  for (const row of rows) {
    const prev = map.get(row.agent) || {
      id: row.agent,
      name: row.agent,
      total: 0,
      live: 0,
      rent: 0,
      sale: 0,
      saleRent: 0,
      communities: new Map(),
    };
    prev.total += 1;
    if (row.live) prev.live += 1;
    if (row.purpose === "rent") prev.rent += 1;
    else if (row.purpose === "sale_rent") prev.saleRent += 1;
    else prev.sale += 1;
    const cPrev = prev.communities.get(row.community) || 0;
    prev.communities.set(row.community, cPrev + 1);
    map.set(row.agent, prev);
  }
  return [...map.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      total: row.total,
      live: row.live,
      rent: row.rent,
      sale: row.sale,
      saleRent: row.saleRent,
      communities: [...row.communities.entries()]
        .map(([name, count]) => ({ id: name.toLowerCase(), name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 8),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

function cleanPersonName(value) {
  return String(value || "")
    .replace(/^\s*(bayut|property finder|pf|whatsapp)\s*(email|call|lead)?\s*[|:—-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usablePersonName(value) {
  const name = cleanPersonName(value);
  if (!name || name.length < 2) return "";
  if (/^(no\s*name|n\/?a|none|null|unknown|-|—|–)$/i.test(name)) return "";
  return name;
}

function uniqueNames(values) {
  const set = new Set();
  for (const value of values || []) {
    const name = usablePersonName(value);
    if (name) set.add(name.toLowerCase());
  }
  return set.size;
}

/** Unique person names preserving first-seen display casing (sorted A→Z). */
function bumpPerson(map, rawName, purpose = "") {
  const name = usablePersonName(rawName);
  if (!name) return false;
  const key = name.toLowerCase();
  const prev = map.get(key) || { id: key, name, count: 0, rent: 0, sale: 0, saleRent: 0 };
  prev.count += 1;
  if (purpose === "rent") prev.rent += 1;
  else if (purpose === "sale_rent") prev.saleRent += 1;
  else if (purpose === "sale") prev.sale += 1;
  map.set(key, prev);
  return true;
}

function sortPeople(map) {
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

/** Owners = people whose properties sit with agents (Owner Data cards). Agents are not owners. */
function ownerRollup(rows = []) {
  const agentKeys = new Set();
  for (const row of rows) {
    const agent = usablePersonName(row.agent);
    if (agent && !isEmptyAgentLabel(agent)) agentKeys.add(agent.toLowerCase());
  }
  const map = new Map();
  let emptyCards = 0;
  let skippedAgentNames = 0;
  for (const row of rows) {
    const name = usablePersonName(row.owner);
    if (!name) {
      emptyCards += 1;
      continue;
    }
    if (agentKeys.has(name.toLowerCase())) {
      skippedAgentNames += 1;
      continue;
    }
    bumpPerson(map, name, row.purpose);
  }
  return { rows: sortPeople(map), emptyCards, skippedAgentNames };
}

function tenantRollup(tenancies = [], formTenantNames = []) {
  const map = new Map();
  for (const row of tenancies || []) {
    bumpPerson(map, row.tenant_name || row.data?.tenantName || "", "");
  }
  for (const name of formTenantNames || []) bumpPerson(map, name, "");
  return sortPeople(map);
}

function uniqueNameList(values) {
  const map = new Map();
  for (const value of values || []) {
    const name = usablePersonName(value);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Desk tenant names from NOC move-in/out + Form A (no CRM / lead scan). */
export function collectFormTenantNames(root = DEFAULT_ROOT) {
  const names = [];
  try {
    for (const row of listMoveins(root) || []) names.push(row.data?.tenantName || "");
  } catch {
    /* store missing */
  }
  try {
    for (const row of listMoveouts(root) || []) names.push(row.data?.tenantName || "");
  } catch {
    /* store missing */
  }
  try {
    for (const row of listFormA(root) || []) names.push(row.data?.tenantName || "");
  } catch {
    /* store missing */
  }
  return names;
}

function partyCounts({ tenancies = [], listings = [], directory = [], formTenantNames = [] } = {}) {
  const owners = [];
  const tenants = [];
  // Whole-office owners: listing owners + directory owners/landlords + tenancy landlords.
  // Tenants: tenancy contracts + NOC move-in/out + Form A. Do NOT scan leads.
  for (const row of listings || []) {
    owners.push(row.listing_owner || "");
  }
  for (const person of directory || []) {
    const kind = String(person.kind || "").toLowerCase();
    if (kind === "owner" || kind === "landlord") owners.push(person.name || "");
  }
  for (const row of tenancies || []) {
    owners.push(row.owner_name || row.data?.landlordName || "");
    tenants.push(row.tenant_name || row.data?.tenantName || "");
    for (const signer of row.data?.signers || []) {
      if (String(signer.role || "").toLowerCase() === "tenant") {
        tenants.push(signer.signed_name || signer.name || "");
      }
    }
  }
  for (const name of formTenantNames || []) tenants.push(name);
  const ownerNames = uniqueNameList(owners);
  const tenantNames = uniqueNameList(tenants);
  return {
    owners: ownerNames.length,
    tenants: tenantNames.length,
    ownerNames,
    tenantNames,
    contracts: (tenancies || []).length,
  };
}

function clientDemand(listings, leads) {
  const byId = new Map((listings || []).map((row) => [String(row.id), row]));
  const byRef = new Map();
  for (const row of listings || []) {
    const ref = String(row.reference || "").trim().toLowerCase();
    if (ref) byRef.set(ref, row);
  }
  const matched = [];
  for (const lead of leads || []) {
    const listing =
      byId.get(String(lead.listing_id || "")) ||
      byRef.get(String(lead.reference || lead.pf_listing_id || "").trim().toLowerCase());
    if (!listing) continue;
    const inv = inventoryRow(listing);
    matched.push({
      ...inv,
      leadId: String(lead.id || ""),
      leadAgent: String(lead.agent_name || "").trim() || inv.agent,
    });
  }
  return {
    totalClients: matched.length,
    needed: matched.length,
    beds: countMap(matched, (row) => row.bedKey, (row) => row.bedLabel),
    types: countMap(matched, (row) => row.type, (row) => row.typeLabel),
    communities: countMap(matched, (row) => row.community.toLowerCase(), (row) => row.community),
    purposes: countMap(matched, (row) => row.purpose, (row) => (row.purpose === "rent" ? "Rent" : "Sale")),
  };
}

function needVsAvailable(demand, liveRows) {
  function gap(demandRows, availableRows) {
    const avail = new Map((availableRows || []).map((row) => [String(row.id), row.count]));
    return (demandRows || []).map((row) => {
      const available = Number(avail.get(String(row.id)) || 0);
      const needed = Number(row.count || 0);
      return {
        id: row.id,
        name: row.name,
        needed,
        available,
        gap: Math.max(0, needed - available),
        covered: available >= needed,
      };
    });
  }
  const liveBeds = countMap(liveRows, (row) => row.bedKey, (row) => row.bedLabel);
  const liveTypes = countMap(liveRows, (row) => row.type, (row) => row.typeLabel);
  const liveCommunities = countMap(liveRows, (row) => row.community.toLowerCase(), (row) => row.community);
  return {
    beds: gap(demand.beds, liveBeds),
    types: gap(demand.types, liveTypes),
    communities: gap(demand.communities, liveCommunities),
  };
}

function shortageBoard(demandMatched, liveRows, limit = 15) {
  const liveMap = new Map();
  for (const row of liveRows || []) {
    const key = `${row.community.toLowerCase()}||${row.bedKey}`;
    liveMap.set(key, (liveMap.get(key) || 0) + 1);
  }
  const needMap = new Map();
  for (const row of demandMatched || []) {
    const key = `${row.community.toLowerCase()}||${row.bedKey}`;
    const prev = needMap.get(key) || {
      id: key,
      community: row.community,
      bedKey: row.bedKey,
      bedLabel: row.bedLabel,
      needed: 0,
      available: 0,
    };
    prev.needed += 1;
    needMap.set(key, prev);
  }
  return [...needMap.values()]
    .map((row) => {
      const available = liveMap.get(row.id) || 0;
      const gap = Math.max(0, row.needed - available);
      return {
        ...row,
        available,
        gap,
        ratio: available > 0 ? Number((row.needed / available).toFixed(1)) : row.needed,
        alert: gap >= 20 || (available === 0 && row.needed >= 5),
      };
    })
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap || b.needed - a.needed)
    .slice(0, limit);
}

function priceBandId(amount, purpose) {
  if (amount == null) return "unknown";
  if (purpose === "rent") {
    if (amount < 40000) return "r_under_40k";
    if (amount < 70000) return "r_40_70k";
    if (amount < 100000) return "r_70_100k";
    if (amount < 150000) return "r_100_150k";
    return "r_150k_plus";
  }
  if (amount < 500000) return "s_under_500k";
  if (amount < 1000000) return "s_500k_1m";
  if (amount < 2000000) return "s_1_2m";
  if (amount < 5000000) return "s_2_5m";
  return "s_5m_plus";
}

function priceBandName(id) {
  const labels = {
    r_under_40k: "Rent under 40k / yr",
    r_40_70k: "Rent 40–70k / yr",
    r_70_100k: "Rent 70–100k / yr",
    r_100_150k: "Rent 100–150k / yr",
    r_150k_plus: "Rent 150k+ / yr",
    s_under_500k: "Sale under 500k",
    s_500k_1m: "Sale 500k–1M",
    s_1_2m: "Sale 1–2M",
    s_2_5m: "Sale 2–5M",
    s_5m_plus: "Sale 5M+",
    unknown: "No price",
  };
  return labels[id] || id;
}

function priceBands(rows) {
  const rent = [];
  const sale = [];
  for (const row of rows || []) {
    if ((row.purpose === "rent" || row.purpose === "sale_rent") && row.rentYearly != null) {
      rent.push({ ...row, bandAmount: row.rentYearly });
    }
    if ((row.purpose === "sale" || row.purpose === "sale_rent") && row.salePrice != null) {
      sale.push({ ...row, bandAmount: row.salePrice });
    }
  }
  const rentAmounts = rent.map((r) => r.bandAmount).filter((n) => n != null);
  const saleAmounts = sale.map((r) => r.bandAmount).filter((n) => n != null);
  return {
    rent: countMap(
      rent,
      (row) => priceBandId(row.bandAmount, "rent"),
      (row) => priceBandName(priceBandId(row.bandAmount, "rent"))
    ),
    sale: countMap(
      sale,
      (row) => priceBandId(row.bandAmount, "sale"),
      (row) => priceBandName(priceBandId(row.bandAmount, "sale"))
    ),
    rentRange: {
      min: rentAmounts.length ? Math.min(...rentAmounts) : null,
      max: rentAmounts.length ? Math.max(...rentAmounts) : null,
    },
    saleRange: {
      min: saleAmounts.length ? Math.min(...saleAmounts) : null,
      max: saleAmounts.length ? Math.max(...saleAmounts) : null,
    },
  };
}

function mapExpiryRow(row) {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    agent: row.agent,
    community: row.community,
    cluster: row.cluster || "",
    purpose: row.purpose,
    status: row.status,
    type: row.type,
    typeLabel: row.typeLabel,
    beds: row.beds,
    bedKey: row.bedKey,
    bedLabel: row.bedLabel,
    expiry: row.expiry,
    daysLeft: row.daysLeft,
    price: row.price,
    rentYearly: row.rentYearly,
    salePrice: row.salePrice,
  };
}

function expiryBoard(rows) {
  const all = rows || [];
  const live = all.filter((row) => row.live);
  const withDate = live.filter((row) => row.expiry);
  const expiring7 = live.filter((row) => row.daysLeft != null && row.daysLeft >= 0 && row.daysLeft <= 7);
  const expiring15 = live.filter((row) => row.daysLeft != null && row.daysLeft >= 0 && row.daysLeft <= 15);
  const expiring30 = live.filter((row) => row.daysLeft != null && row.daysLeft >= 0 && row.daysLeft <= 30);
  const expiredStillLive = live.filter((row) => row.expiredLive);
  const expired = all.filter((row) => row.expired);
  const noDate = live.filter((row) => !row.expiry);
  const expiredSorted = [...expired].sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  return {
    totals: {
      live: live.length,
      withExpiryDate: withDate.length,
      noExpiryDate: noDate.length,
      expiring7: expiring7.length,
      expiring15: expiring15.length,
      expiring30: expiring30.length,
      expiredStillLive: expiredStillLive.length,
      expired: expired.length,
      expiredRent: expired.filter((row) => row.purpose === "rent").length,
      expiredSale: expired.filter((row) => row.purpose === "sale").length,
    },
    purposes: countMap(expired, (row) => row.purpose, (row) => (row.purpose === "rent" ? "Rent" : "Sale")),
    communities: countMap(expired, (row) => row.community.toLowerCase(), (row) => row.community),
    beds: countMap(expired, (row) => row.bedKey, (row) => row.bedLabel),
    types: countMap(expired, (row) => row.type, (row) => row.typeLabel),
    expired: expiredSorted.map(mapExpiryRow),
    soon: [...expiring30]
      .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999))
      .map(mapExpiryRow),
  };
}

function agentPerformance(rows, leads) {
  const map = new Map();
  const agentIds = new Map(); // name -> preferred Bitrix user id
  for (const row of rows || []) {
    const name = cleanAgentName(row.agent);
    if (isEmptyAgentLabel(name)) continue;
    const prev = map.get(name) || {
      id: name,
      name,
      agentId: "",
      photo: "",
      listings: 0,
      live: 0,
      leads: 0,
      leadsPerLive: 0,
      imbalance: "ok",
    };
    prev.listings += 1;
    if (row.live) prev.live += 1;
    const aid = String(row.agentId || "").trim();
    if (aid && /^\d+$/.test(aid) && !prev.agentId) prev.agentId = aid;
    map.set(name, prev);
    if (aid && /^\d+$/.test(aid) && !agentIds.has(name)) agentIds.set(name, aid);
  }
  let emptyAgentLeads = 0;
  const emptyAgentLeadSamples = [];
  let expiredLeads = 0;
  const expiredCutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  for (const lead of leads || []) {
    const name = cleanAgentName(lead.agent_name);
    const created = Date.parse(String(lead.created_at || lead.DATE_CREATE || "").replace(" ", "T"));
    const isExpiredLead = Number.isFinite(created) && created < expiredCutoff;
    if (isExpiredLead) expiredLeads += 1;
    if (isEmptyAgentLabel(name)) {
      emptyAgentLeads += 1;
      if (emptyAgentLeadSamples.length < 40) {
        emptyAgentLeadSamples.push({
          id: String(lead.id || lead.bitrix_id || emptyAgentLeadSamples.length),
          reference: String(lead.reference || ""),
          title: String(lead.sender_name || lead.title || lead.reference || "Lead"),
          portal: String(lead.portal || lead.channel || ""),
          createdAt: String(lead.created_at || "").slice(0, 16),
          expired: isExpiredLead,
        });
      }
      continue;
    }
    const prev = map.get(name) || {
      id: name,
      name,
      agentId: "",
      photo: "",
      listings: 0,
      live: 0,
      leads: 0,
      leadsPerLive: 0,
      imbalance: "ok",
    };
    prev.leads += 1;
    map.set(name, prev);
  }
  const agents = [...map.values()]
    .map((row) => {
      const leadsPerLive = row.live > 0 ? Number((row.leads / row.live).toFixed(1)) : row.leads > 0 ? row.leads : 0;
      let imbalance = "ok";
      if (row.leads >= 50 && row.live === 0) imbalance = "leads_no_ads";
      else if (row.live >= 10 && row.leads < row.live) imbalance = "ads_low_leads";
      else if (row.leads > 200 && row.live > 0 && leadsPerLive > 30) imbalance = "leads_heavy";
      return { ...row, leadsPerLive, imbalance };
    })
    .sort((a, b) => b.leads - a.leads || b.live - a.live || a.name.localeCompare(b.name));
  return { agents, emptyAgentLeads, emptyAgentLeadSamples, expiredLeads, agentIds };
}

function buildDemandMatched(listings, leads) {
  const byId = new Map((listings || []).map((row) => [String(row.id), row]));
  const byRef = new Map();
  for (const row of listings || []) {
    const ref = String(row.reference || "").trim().toLowerCase();
    if (ref) byRef.set(ref, row);
  }
  const matched = [];
  for (const lead of leads || []) {
    const listing =
      byId.get(String(lead.listing_id || "")) ||
      byRef.get(String(lead.reference || lead.pf_listing_id || "").trim().toLowerCase());
    if (!listing) continue;
    matched.push(inventoryRow(listing));
  }
  return matched;
}

function leadBreakdown(leads = []) {
  const portals = countMap(
    leads,
    (row) => leadPortal(row),
    (row) => leadPortalLabel(leadPortal(row))
  );
  const channels = countMap(
    leads,
    (row) => {
      const ch = String(row.channel || "").trim().toLowerCase();
      return ch && ch !== "unknown" ? ch : "empty";
    },
    (row) => {
      const ch = String(row.channel || "").trim().toLowerCase();
      if (!ch || ch === "unknown") return EMPTY;
      return ch.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  );
  return {
    total: (leads || []).length,
    portals,
    channels,
  };
}

/** One light Bitrix read: overall CRM lead quantity (uses `total`, does not page dump). */
export async function fetchBitrixLeadTotal({ fetchImpl = fetch } = {}) {
  const webhook = String(process.env.BITRIX_WEBHOOK || "").trim().replace(/\/$/, "");
  if (!webhook) return { ok: false, total: null, error: "no_webhook" };
  try {
    const res = await fetchImpl(`${webhook}/crm.lead.list.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ select: ["ID"], order: { ID: "DESC" }, start: 0 }),
    });
    const body = await res.json().catch(() => ({}));
    if (body?.error) {
      return { ok: false, total: null, error: body.error_description || body.error || "crm.lead.list failed" };
    }
    const total = Number(body?.total);
    if (Number.isFinite(total) && total >= 0) return { ok: true, total };
    const len = Array.isArray(body?.result) ? body.result.length : 0;
    return { ok: true, total: len };
  } catch (error) {
    return { ok: false, total: null, error: error instanceof Error ? error.message : "crm.lead.list failed" };
  }
}

async function bitrixPostJson(webhook, method, params, fetchImpl = fetch) {
  const res = await fetchImpl(`${webhook}/${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
  });
  const body = await res.json().catch(() => ({}));
  if (body?.error) {
    const err = new Error(body.error_description || body.error || `${method} failed`);
    err.code = body.error;
    throw err;
  }
  return body;
}

function itemListTotal(body) {
  const total = Number(body?.total);
  if (Number.isFinite(total) && total >= 0) return total;
  if (Array.isArray(body?.result?.items)) return body.result.items.length;
  if (Array.isArray(body?.result)) return body.result.length;
  return 0;
}

function asCrmItemRows(body) {
  if (Array.isArray(body?.result?.items)) return body.result.items;
  if (Array.isArray(body?.result)) return body.result;
  return [];
}

/**
 * Office-wide Owner Data Availability counts (all agents).
 * Counts use Bitrix `total` per stage (fast, reliable). Item rows are a best-effort detail list.
 */
export async function fetchBitrixOwnerAvailability({ fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const webhook = String(process.env.BITRIX_WEBHOOK || "").trim().replace(/\/$/, "");
  const empty = { ok: false, rent: null, sale: null, saleRent: null, total: null, stages: [], items: [], error: "no_webhook" };
  if (!webhook) return empty;
  try {
    const stagesBody = await bitrixPostJson(
      webhook,
      "crm.status.list",
      { filter: { ENTITY_ID: `DYNAMIC_${OWNER_ENTITY_TYPE_ID}_STAGE_${OWNER_CATEGORY_ID}` } },
      fetchImpl
    );
    const stages = Array.isArray(stagesBody?.result) ? stagesBody.result : [];
    const avail = stages.filter((row) => isAvailabilityStage(row?.NAME || row?.name));
    if (!avail.length) {
      return { ...empty, error: "no_availability_stages" };
    }

    let rent = 0;
    let sale = 0;
    let saleRent = 0;
    const stageRows = [];

    // 1) Counts only — one request per stage (matches Bitrix kanban totals).
    for (let i = 0; i < avail.length; i += 1) {
      if (i > 0 && sleep) await sleep(120);
      const stage = avail[i];
      const stageId = String(stage.STATUS_ID || stage.statusId || "").trim();
      const name = String(stage.NAME || stage.name || "").trim();
      const purpose = availabilityPurposeOf(name);
      if (!stageId || !purpose) continue;

      const body = await bitrixPostJson(
        webhook,
        "crm.item.list",
        {
          entityTypeId: OWNER_ENTITY_TYPE_ID,
          filter: { categoryId: OWNER_CATEGORY_ID, stageId },
          select: ["id"],
          order: { id: "DESC" },
          start: 0,
        },
        fetchImpl
      );
      const count = itemListTotal(body);
      stageRows.push({ id: stageId, name, purpose, count });
      if (purpose === "rent") rent += count;
      else if (purpose === "sale") sale += count;
      else if (purpose === "sale_rent") saleRent += count;
    }

    // 2) Detail rows — best effort; never changes the KPI counts above.
    const items = [];
    const agentIds = new Set();
    for (let i = 0; i < stageRows.length; i += 1) {
      const stage = stageRows[i];
      let start = 0;
      try {
        for (let page = 0; page < 12; page += 1) {
          if (sleep) await sleep(100);
          const body = await bitrixPostJson(
            webhook,
            "crm.item.list",
            {
              entityTypeId: OWNER_ENTITY_TYPE_ID,
              filter: { categoryId: OWNER_CATEGORY_ID, stageId: stage.id },
              select: ["id", "title", "assignedById", "stageId"],
              order: { id: "DESC" },
              start,
            },
            fetchImpl
          );
          const chunk = asCrmItemRows(body);
          for (const row of chunk) {
            const id = String(row?.id || row?.ID || "").trim();
            if (!id) continue;
            const agentId = String(row?.assignedById || row?.ASSIGNED_BY_ID || "").trim();
            if (agentId) agentIds.add(agentId);
            items.push({
              id,
              title: String(row?.title || row?.TITLE || "").trim() || `Owner #${id}`,
              stageId: stage.id,
              stageName: stage.name,
              purpose: stage.purpose,
              agentId,
              agentName: agentId ? `User ${agentId}` : "Empty agent",
            });
          }
          if (body?.next == null || !chunk.length) break;
          start = body.next;
        }
      } catch {
        /* keep counts; partial/missing item rows are ok */
      }
    }

    const uniqueIds = [...agentIds].filter((id) => /^\d+$/.test(id)).slice(0, 40);
    for (let i = 0; i < uniqueIds.length; i += 1) {
      const id = uniqueIds[i];
      try {
        if (i > 0 && sleep) await sleep(80);
        const uBody = await bitrixPostJson(webhook, "user.get", { ID: id }, fetchImpl);
        const user = Array.isArray(uBody?.result) ? uBody.result[0] : uBody?.result;
        if (!user) continue;
        const agentName = [user.NAME, user.LAST_NAME].filter(Boolean).join(" ").trim() || `User ${id}`;
        for (const item of items) {
          if (item.agentId === id) item.agentName = agentName;
        }
      } catch {
        /* keep User N label */
      }
    }

    const total = rent + sale + saleRent;
    return {
      ok: true,
      rent,
      sale,
      saleRent,
      total,
      stages: stageRows,
      items,
      error: "",
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : "owner availability failed",
    };
  }
}

const DEAL_LISTING_REF_UF = "UF_CRM_69634F06829A2";
const DEAL_AD_URL_UF = "UF_CRM_69634F0667CF5";
const DEAL_SALE_CATEGORIES = new Set(["0", "1"]); // default + Secondary
const DEAL_RENT_CATEGORIES = new Set(["2", "9"]); // Rental + Renewals

const DEAL_SOURCE_LABELS = (() => {
  const map = new Map();
  for (const [channel, id] of Object.entries(PF_LEAD_SOURCE || {})) {
    map.set(String(id), `Property Finder ${String(channel).replace(/\b\w/g, (c) => c.toUpperCase())}`);
  }
  for (const row of CRM_PORTAL_SOURCES || []) {
    const portal = String(row.portal || "other").replace(/\b\w/g, (c) => c.toUpperCase());
    const channel = String(row.channel || "").replace(/\b\w/g, (c) => c.toUpperCase());
    map.set(String(row.id), channel ? `${portal} ${channel}` : portal);
  }
  return map;
})();

export function dealPurposeFromCategory(categoryId) {
  const id = String(categoryId ?? "").trim();
  if (DEAL_RENT_CATEGORIES.has(id)) return "rent";
  if (DEAL_SALE_CATEGORIES.has(id)) return "sale";
  return "other";
}

function dealSourceLabel(sourceId, title = "") {
  const id = String(sourceId || "").trim();
  if (id && DEAL_SOURCE_LABELS.has(id)) return DEAL_SOURCE_LABELS.get(id);
  const standard = {
    CALL: "Call",
    EMAIL: "Email",
    WEB: "Website",
    ADVERTISING: "Advertising",
    PARTNER: "Partner",
    RECOMMENDATION: "Recommendation",
    TRADE_SHOW: "Trade show",
    WEBFORM: "Web form",
    CALLBACK: "Callback",
    STORE: "Store",
    OTHER: "Other",
  };
  if (id && standard[id.toUpperCase()]) return standard[id.toUpperCase()];
  const text = String(title || "");
  if (/property\s*finder/i.test(text)) return "Property Finder";
  if (/bayut/i.test(text)) return "Bayut";
  if (/dubizzle/i.test(text)) return "Dubizzle";
  if (/whatsapp/i.test(text)) return "WhatsApp";
  if (id) return sourceLabel(id);
  return EMPTY_SOURCE;
}

function dealClosedLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dated = new Date(raw);
  if (Number.isNaN(dated.getTime())) return raw.slice(0, 10);
  return dated.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

/** Closed (won) Bitrix deals + unique portal ads linked on those deals. */
export async function fetchBitrixDealStats({ fetchImpl = fetch } = {}) {
  const empty = { ok: false, won: null, sale: 0, rent: 0, other: 0, ads: 0, items: [], sources: [], error: "no_webhook" };
  const webhook = String(process.env.BITRIX_WEBHOOK || "").trim().replace(/\/$/, "");
  if (!webhook) return empty;
  try {
    const headRes = await fetchImpl(`${webhook}/crm.deal.list.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: { STAGE_SEMANTIC_ID: "S" },
        select: ["ID"],
        order: { ID: "DESC" },
        start: 0,
      }),
    });
    const head = await headRes.json().catch(() => ({}));
    if (head?.error) {
      return {
        ...empty,
        error: head.error_description || head.error || "crm.deal.list failed",
      };
    }
    const wonTotal = Number(head?.total);
    const rows = [];
    let start = 0;
    for (let page = 0; page < 8; page += 1) {
      const res = await fetchImpl(`${webhook}/crm.deal.list.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: { STAGE_SEMANTIC_ID: "S" },
          select: [
            "ID",
            "TITLE",
            "CATEGORY_ID",
            "TYPE_ID",
            "STAGE_ID",
            "SOURCE_ID",
            "ASSIGNED_BY_ID",
            "CLOSEDATE",
            "DATE_CREATE",
            "OPPORTUNITY",
            "CURRENCY_ID",
            DEAL_LISTING_REF_UF,
            DEAL_AD_URL_UF,
          ],
          order: { ID: "DESC" },
          start,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (body?.error) break;
      const chunk = Array.isArray(body?.result) ? body.result : [];
      rows.push(...chunk);
      if (body?.next == null || !chunk.length) break;
      start = body.next;
    }
    let sale = 0;
    let rent = 0;
    let other = 0;
    const ads = new Set();
    const sourceCounts = new Map();
    const agentCounts = new Map();
    const items = [];
    for (const row of rows) {
      const purpose = dealPurposeFromCategory(row?.CATEGORY_ID);
      if (purpose === "sale") sale += 1;
      else if (purpose === "rent") rent += 1;
      else other += 1;
      const listingRef = String(row?.[DEAL_LISTING_REF_UF] || "").trim();
      const adUrl = String(row?.[DEAL_AD_URL_UF] || "").trim();
      if (listingRef) ads.add(`ref:${listingRef.toLowerCase()}`);
      else if (adUrl) ads.add(`url:${adUrl.toLowerCase()}`);
      const source = dealSourceLabel(row?.SOURCE_ID, row?.TITLE);
      const sourceKey = source.toLowerCase();
      const prev = sourceCounts.get(sourceKey) || { id: sourceKey, name: source, count: 0 };
      prev.count += 1;
      sourceCounts.set(sourceKey, prev);
      const agentId = String(row?.ASSIGNED_BY_ID || "").trim();
      const agentKey = agentId || "empty";
      const agentPrev = agentCounts.get(agentKey) || {
        id: agentKey,
        agentId,
        name: agentId ? `User ${agentId}` : "Empty agent",
        count: 0,
        sale: 0,
        rent: 0,
        other: 0,
        photo: "",
      };
      agentPrev.count += 1;
      if (purpose === "sale") agentPrev.sale += 1;
      else if (purpose === "rent") agentPrev.rent += 1;
      else agentPrev.other += 1;
      agentCounts.set(agentKey, agentPrev);
      items.push({
        id: String(row?.ID || ""),
        title: String(row?.TITLE || "").trim() || `Deal #${row?.ID || ""}`,
        purpose,
        source,
        sourceId: String(row?.SOURCE_ID || "").trim(),
        agentId,
        listingRef,
        adUrl,
        closedAt: dealClosedLabel(row?.CLOSEDATE || row?.DATE_CREATE),
        amount: Number(row?.OPPORTUNITY) || 0,
        currency: String(row?.CURRENCY_ID || "AED"),
      });
    }

    // Resolve assignee names (light — unique IDs only).
    const uniqueIds = [...agentCounts.values()].map((row) => row.agentId).filter((id) => /^\d+$/.test(id));
    for (let i = 0; i < uniqueIds.length; i += 1) {
      const id = uniqueIds[i];
      try {
        if (i > 0) await new Promise((r) => setTimeout(r, 80));
        const uRes = await fetchImpl(`${webhook}/user.get.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ID: id }),
        });
        const uBody = await uRes.json().catch(() => ({}));
        const user = Array.isArray(uBody?.result) ? uBody.result[0] : uBody?.result;
        if (!user) continue;
        const name = [user.NAME, user.LAST_NAME].filter(Boolean).join(" ").trim() || `User ${id}`;
        const photoRaw = user.PERSONAL_PHOTO;
        const photo =
          typeof photoRaw === "string" && /^https?:\/\//i.test(photoRaw)
            ? photoRaw
            : typeof photoRaw === "object"
              ? String(photoRaw?.showUrl || photoRaw?.url || "").trim()
              : "";
        const row = agentCounts.get(id);
        if (row) {
          row.name = name;
          row.photo = photo;
        }
        for (const item of items) {
          if (item.agentId === id) item.agentName = name;
        }
      } catch {
        /* keep User N label */
      }
    }

    return {
      ok: true,
      won: Number.isFinite(wonTotal) ? wonTotal : rows.length,
      sale,
      rent,
      other,
      ads: ads.size,
      items,
      sources: [...sourceCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      byAgent: [...agentCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      error: "",
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : "crm.deal.list failed",
    };
  }
}

/**
 * Light Bitrix user photo lookup for Agent Performance rows.
 * Uses listing agent_id when present; otherwise name match.
 */
export async function fetchBitrixAgentPhotos(agents = [], { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const webhook = String(process.env.BITRIX_WEBHOOK || "").trim().replace(/\/$/, "");
  if (!webhook || !(agents || []).length) return { ok: false, photos: {}, error: webhook ? "no_agents" : "no_webhook" };

  const origin = webhook.match(/^https?:\/\/[^/]+/i)?.[0] || "";
  const photos = {};

  function photoFromUser(row) {
    const raw = row?.PERSONAL_PHOTO ?? row?.WORK_PHOTO ?? "";
    if (raw && typeof raw === "object") {
      return String(raw.showUrl || raw.downloadUrl || raw.src || raw.url || "").trim();
    }
    const text = String(raw || "").trim();
    if (!text || text === "0" || text === "false") return "";
    if (/^https?:\/\//i.test(text)) return text;
    if (text.startsWith("/") && origin) return `${origin}${text}`;
    if (text.startsWith("upload/") && origin) return `${origin}/${text}`;
    return "";
  }

  async function post(method, params) {
    const res = await fetchImpl(`${webhook}/${method}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params || {}),
    });
    const body = await res.json().catch(() => ({}));
    if (body?.error) throw new Error(body.error_description || body.error || `${method} failed`);
    return body;
  }

  const list = (agents || []).slice(0, 40);
  let calls = 0;
  try {
    for (const agent of list) {
      const name = cleanAgentName(agent?.name);
      if (!name || photos[name]) continue;
      let row = null;
      let url = "";

      async function take(candidate) {
        if (!candidate) return;
        const next = photoFromUser(candidate);
        if (next) {
          row = candidate;
          url = next;
        } else if (!row) {
          row = candidate;
        }
      }

      const id = String(agent?.agentId || "").trim();
      if (id && /^\d+$/.test(id)) {
        if (calls > 0 && sleep) await sleep(80);
        const body = await post("user.get", { ID: id });
        calls += 1;
        await take(Array.isArray(body?.result) ? body.result[0] : body?.result);
      }

      if (!url) {
        const parts = name.split(/\s+/).filter(Boolean);
        if (calls > 0 && sleep) await sleep(80);
        const body = await post("user.get", {
          FILTER: parts.length > 1 ? { NAME: parts[0], LAST_NAME: parts.slice(1).join(" ") } : { NAME: parts[0] },
        });
        calls += 1;
        const rows = Array.isArray(body?.result) ? body.result : [];
        const exact = rows.find(
          (item) => cleanAgentName(`${item?.NAME || ""} ${item?.LAST_NAME || ""}`).toLowerCase() === name.toLowerCase()
        );
        await take(exact || rows.find((item) => photoFromUser(item)) || rows[0]);
      }

      if (!url) {
        if (calls > 0 && sleep) await sleep(80);
        try {
          const body = await post("user.search", { FIND: name });
          calls += 1;
          const rows = Array.isArray(body?.result) ? body.result : [];
          const exact = rows.find(
            (item) => cleanAgentName(`${item?.NAME || ""} ${item?.LAST_NAME || ""}`).toLowerCase() === name.toLowerCase()
          );
          await take(exact || rows.find((item) => photoFromUser(item)) || rows[0]);
        } catch {
          /* search optional */
        }
      }

      if (url) photos[name] = url;
      if (row?.ID || row?.id) photos[`${name}::id`] = String(row.ID || row.id);
    }
    return { ok: true, photos, error: "" };
  } catch (error) {
    return { ok: false, photos, error: error instanceof Error ? error.message : "photo fetch failed" };
  }
}

function liveFlagsOf(row) {
  const statusLive = String(row?.status || "") === "live";
  const portals = Array.isArray(row?.portals) ? row.portals : [];
  const pf = statusLive && (String(row.pf_is_live || "") === "1" || String(row.pf_state || "") === "live");
  const bayut = statusLive && portals.includes("bayut");
  const dubizzle = statusLive && portals.includes("dubizzle");
  const hasPortalSignal = Boolean(String(row?.pf_is_live || "").trim() || String(row?.pf_state || "").trim() || portals.length);
  const any = pf || bayut || dubizzle || (statusLive && !hasPortalSignal);
  return { pf, bayut, dubizzle, any, statusLive };
}

function unitMatchKey(community, unit) {
  const u = String(unit || "").trim().toLowerCase();
  if (!u) return "";
  return `${String(community || "").trim().toLowerCase()}|${u}`;
}

function liveAdsBoard(listings = []) {
  const communities = new Map();
  const items = [];
  let pf = 0;
  let bayut = 0;
  let dubizzle = 0;
  for (const row of listings || []) {
    if (!row || row.status === "duplicate") continue;
    const flags = liveFlagsOf(row);
    if (!flags.any) continue;
    if (flags.pf) pf += 1;
    if (flags.bayut) bayut += 1;
    if (flags.dubizzle) dubizzle += 1;
    const community = communityLabel(row.community);
    const key = community.toLowerCase();
    const prev = communities.get(key) || { id: key, name: community, count: 0, pf: 0, bayut: 0, dubizzle: 0 };
    prev.count += 1;
    if (flags.pf) prev.pf += 1;
    if (flags.bayut) prev.bayut += 1;
    if (flags.dubizzle) prev.dubizzle += 1;
    communities.set(key, prev);
    items.push({
      id: String(row.id || ""),
      reference: String(row.reference || ""),
      title: String(row.title || row.reference || "Listing"),
      community,
      cluster: clusterOf(row),
      unitNo: String(row.unit_no || "").trim(),
      typeLabel: prettyType(row.type),
      bedLabel: bedBucket(row).name,
      agent: agentNameOf(row),
      purpose: row.purpose === "rent" ? "rent" : "sale",
      pf: flags.pf,
      bayut: flags.bayut,
      dubizzle: flags.dubizzle,
    });
  }
  return {
    total: items.length,
    pf,
    bayut,
    dubizzle,
    communities: [...communities.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    items,
  };
}

function attachLiveToOwnerRows(rows, listings = []) {
  const liveByUnit = new Map();
  for (const listing of listings || []) {
    const flags = liveFlagsOf(listing);
    if (!flags.any) continue;
    const key = unitMatchKey(listing.community, listing.unit_no);
    if (!key) continue;
    const prev = liveByUnit.get(key) || { pf: false, bayut: false, dubizzle: false };
    liveByUnit.set(key, {
      pf: prev.pf || flags.pf,
      bayut: prev.bayut || flags.bayut,
      dubizzle: prev.dubizzle || flags.dubizzle,
    });
  }
  return (rows || []).map((row) => {
    const hit = liveByUnit.get(unitMatchKey(row.community, row.unitNo));
    if (!hit) return { ...row, live: false, livePf: false, liveBayut: false, liveDubizzle: false };
    return {
      ...row,
      live: true,
      livePf: Boolean(hit.pf),
      liveBayut: Boolean(hit.bayut),
      liveDubizzle: Boolean(hit.dubizzle),
    };
  });
}

function moneyOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ownerBeds(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10) return null;
  return n;
}

function ownerPropertyToRow(prop) {
  const rawType = String(prop?.type || "").trim();
  const typeId = String(prop?.unitTypeId || "").replace(/\D/g, "");
  let typeLabel = !rawType || /^\d+(\.\d+)?$/.test(rawType) ? "Other" : rawType;
  let type = typeLabel.toLowerCase().replace(/\s+/g, "_");
  if (!typeId && typeLabel === "Other") {
    typeLabel = "Empty type";
    type = "empty";
  }
  const beds = ownerBeds(prop?.beds);
  const purpose = prop?.purpose === "rent" || prop?.purpose === "sale_rent" ? prop.purpose : "sale";
  const place = inventoryCommunity(prop);
  const rentYearly = moneyOrNull(prop?.rentPrice);
  const salePrice = moneyOrNull(prop?.salePrice);
  return {
    id: String(prop?.id || ""),
    reference: String(prop?.unitNo || prop?.id || ""),
    title: String(prop?.title || "Owner property"),
    purpose,
    purposeLabel: String(prop?.purposeLabel || ""),
    status: "available",
    type,
    typeLabel,
    beds,
    bedKey: beds === 0 ? "studio" : beds == null ? "na" : String(beds),
    bedLabel: beds === 0 ? "Studio" : beds == null ? "—" : beds === 1 ? "1 Bedroom" : `${beds} Bedroom`,
    community: place.community,
    cluster: place.cluster,
    unitNo: String(prop?.unitNo || "").trim(),
    city: "Dubai",
    price: purpose === "rent" ? rentYearly : salePrice,
    rentYearly,
    rentMonthly: null,
    salePrice,
    projectStatus: "",
    phaseLabel: String(prop?.stageLabel || "Availability"),
    expiry: "",
    daysLeft: null,
    expiringSoon: false,
    expiredLive: false,
    expired: false,
    areaSqft: Number(prop?.size) || null,
    agent: String(prop?.agentName || "").trim() || "Empty agent",
    agentId: String(prop?.agentId || "").replace(/\D/g, ""),
    stage: String(prop?.stage || "").trim(),
    stageLabel: String(prop?.stageLabel || ""),
    communityId: String(prop?.communityId || "").replace(/\D/g, ""),
    subCommunityId: String(prop?.subCommunityId || "").replace(/\D/g, ""),
    unitTypeId: String(prop?.unitTypeId || "").replace(/\D/g, ""),
    bedEnumId: String(prop?.bedEnumId || "").replace(/\D/g, ""),
    owner: String(prop?.owner || "").replace(/^owner data #\d+$/i, "").trim(),
    tenant: String(prop?.tenant || "").trim(),
    live: false,
    livePf: false,
    liveBayut: false,
    liveDubizzle: false,
  };
}

export function buildOfficeInventory(listings = [], leads = [], tenancies = [], directory = [], extras = {}) {
  const today = dubaiToday();
  const ownerAvail =
    extras?.ownerAvailability && typeof extras.ownerAvailability === "object" ? extras.ownerAvailability : null;
  const ownerProps = Array.isArray(ownerAvail?.properties) ? ownerAvail.properties : [];
  const useOwnerRows = Boolean(ownerAvail?.ok && ownerProps.length);
  const liveListings = Array.isArray(extras?.liveListings) ? extras.liveListings : [];
  const sourceListings = (listings || []).filter((row) => row && row.status !== "duplicate");
  const rawRows = useOwnerRows ? ownerProps.map(ownerPropertyToRow) : sourceListings.map((row) => inventoryRow(row, today));
  const rows = useOwnerRows ? attachLiveToOwnerRows(rawRows, liveListings) : rawRows;
  const liveAds = liveAdsBoard(liveListings.length ? liveListings : useOwnerRows ? [] : sourceListings);
  const live = rows.filter((row) => row.live);
  const demand = clientDemand(useOwnerRows ? [] : sourceListings, leads);
  const demandMatched = buildDemandMatched(useOwnerRows ? [] : sourceListings, leads);
  const formTenantNames = Array.isArray(extras?.formTenantNames)
    ? extras.formTenantNames
    : collectFormTenantNames(extras?.root || DEFAULT_ROOT);
  const parties = partyCounts({ tenancies, listings: useOwnerRows ? [] : sourceListings, directory, formTenantNames });
  const ownerStats = ownerRollup(rows);
  const ownerTenantMap = new Map();
  for (const row of rows) bumpPerson(ownerTenantMap, row.tenant, row.purpose);
  const ownerTenantStats = sortPeople(ownerTenantMap);
  const deskTenantStats = tenantRollup(tenancies, formTenantNames);
  const useOwnerTenants = ownerTenantStats.length > 0;
  const tenantStats = useOwnerTenants ? ownerTenantStats : deskTenantStats;
  const ownerCount = ownerStats.rows.length;
  const tenantCount = tenantStats.length;
  const gaps = needVsAvailable(demand, live);
  const shortage = shortageBoard(demandMatched, live);
  const bands = priceBands(rows);
  const expiry = expiryBoard(rows);
  const perf = agentPerformance(rows, useOwnerRows ? [] : leads);
  const photoMap = extras?.bitrixAgentPhotos && typeof extras.bitrixAgentPhotos === "object" ? extras.bitrixAgentPhotos : {};
  const load = (perf.agents || []).map((row) => {
    const photo = String(photoMap[row.name] || "").trim();
    const resolvedId = String(photoMap[`${row.name}::id`] || row.agentId || "").trim();
    return { ...row, photo, agentId: resolvedId || row.agentId || "" };
  });
  const emptyAgentLeads = Number(perf.emptyAgentLeads) || 0;
  const emptyAgentLeadSamples = Array.isArray(perf.emptyAgentLeadSamples) ? perf.emptyAgentLeadSamples : [];
  const expiredLeads = Number(perf.expiredLeads) || 0;
  const listingOwnerNames = uniqueNames(sourceListings.map((row) => row.listing_owner));
  const deskLeads = leadBreakdown(leads);
  const crmTotalRaw = extras?.bitrixLeadTotal;
  const crmTotal = crmTotalRaw == null || crmTotalRaw === "" ? null : Number(crmTotalRaw);
  const useCrmLeads = Number.isFinite(crmTotal) && crmTotal >= 0;
  const leadsTotal = useCrmLeads ? crmTotal : deskLeads.total;
  const dealStats = extras?.bitrixDealStats && typeof extras.bitrixDealStats === "object" ? extras.bitrixDealStats : null;
  const dealsWon = dealStats?.ok && Number.isFinite(Number(dealStats.won)) ? Number(dealStats.won) : null;

  const deskSale = rows.filter((row) => row.purpose === "sale").length;
  const deskRent = rows.filter((row) => row.purpose === "rent").length;
  const deskSaleRent = rows.filter((row) => row.purpose === "sale_rent").length;
  const avail = extras?.bitrixOwnerAvailability && typeof extras.bitrixOwnerAvailability === "object"
    ? extras.bitrixOwnerAvailability
    : ownerAvail;
  const useCrmAvail =
    useOwnerRows ||
    (avail?.ok &&
      Number.isFinite(Number(avail.sale)) &&
      Number.isFinite(Number(avail.rent)) &&
      Number.isFinite(Number(avail.saleRent)));
  const saleAvailability = useOwnerRows ? deskSale : useCrmAvail ? Number(avail.sale) : deskSale;
  const rentAvailability = useOwnerRows ? deskRent : useCrmAvail ? Number(avail.rent) : deskRent;
  const saleRentAvailability = useOwnerRows ? deskSaleRent : useCrmAvail ? Number(avail.saleRent) : null;

  return {
    ok: true,
    source: "office_inventory",
    leadsSource: useCrmLeads ? "bitrix_crm" : "desk_all_portals",
    leadsSourceNote: useCrmLeads
      ? "Leads = overall Bitrix CRM lead quantity (all CRM leads). Property Listing New desk leads are not shown in this KPI."
      : "Leads = desk total (Bitrix CRM total unavailable right now).",
    inventorySource: useOwnerRows ? "bitrix_owner_data" : "desk_listings",
    availabilitySource: useCrmAvail || useOwnerRows ? "bitrix_owner_data" : "desk_listings",
    verified: Boolean(ownerAvail?.verified ?? false) || Boolean(useOwnerRows && ownerAvail?.ok && !ownerAvail?.truncated),
    verifyNote: useOwnerRows
      ? `Verified Bitrix Owner Data Availability for every employee: ${rows.length} cards = ${saleAvailability} sale + ${rentAvailability} rent + ${saleRentAvailability} sale/rent.`
      : "",
    availabilitySourceNote: useOwnerRows
      ? "Office Inventory = Bitrix Owner Data Availability only (Rent / Sale / Sale·Rent). Community, cluster, beds, type, agent and rent come from Owner Data cards — not Property Listing New ads. Unit numbers and owner/tenant names are not shown."
      : useCrmAvail
        ? "Sale / Rent / Sale·Rent Availability = Bitrix Owner Data stages for every agent (office-wide)."
        : "Owner Data Availability was unavailable, so this Check used desk listings.",
    tenantsSourceNote: "Tenants = unique tenant quantity only. Names are not shown.",
    ownersSourceNote: "Owners = unique owner quantity only. Names are not shown.",
    liveSourceNote:
      "Live = desk listings that are currently live on Property Finder, Bayut, or Dubizzle. This is not the Owner Data Availability total. Click Live to see community-wise live counts and every live ad.",
    dealsSourceNote:
      "Won deals = closed Bitrix CRM deals. Click to see listing ref / portal ad and source for each deal.",
    checkedAt: Date.now(),
    totals: {
      total: rows.length,
      live: liveAds.total,
      livePf: liveAds.pf,
      liveBayut: liveAds.bayut,
      liveDubizzle: liveAds.dubizzle,
      liveMatchedCards: live.length,
      archived: rows.filter((row) => row.status === "archived").length,
      sale: saleAvailability,
      rent: rentAvailability,
      saleRent: saleRentAvailability,
      deskSale,
      deskRent,
      liveSale: live.filter((row) => row.purpose === "sale").length,
      liveRent: live.filter((row) => row.purpose === "rent").length,
      agents: new Set(rows.map((row) => row.agent).filter((name) => name && name !== "Empty agent")).size,
      leads: leadsTotal,
      deskLeads: deskLeads.total,
      emptyAgentLeads,
      expiredLeads,
      owners: ownerCount,
      tenants: tenantCount,
      emptyOwnerCards: ownerStats.emptyCards,
      ownerCardsNamedAsAgent: ownerStats.skippedAgentNames,
      contracts: parties.contracts,
      needed: demand.needed,
      available: live.length,
      listingOwners: listingOwnerNames,
      expiring30: expiry.totals.expiring30,
      expiredStillLive: expiry.totals.expiredStillLive,
      expired: expiry.totals.expired,
      deals: dealsWon,
      dealsSale: dealStats?.ok ? Number(dealStats.sale) || 0 : null,
      dealsRent: dealStats?.ok ? Number(dealStats.rent) || 0 : null,
      dealsOther: dealStats?.ok ? Number(dealStats.other) || 0 : null,
      dealAds: dealStats?.ok ? Number(dealStats.ads) || 0 : null,
    },
    availabilityBreakdown: useCrmAvail
      ? {
          source: "bitrix_owner_data",
          rent: rentAvailability,
          sale: saleAvailability,
          saleRent: saleRentAvailability,
          total: rentAvailability + saleAvailability + saleRentAvailability,
          stages: Array.isArray(avail?.stages) ? avail.stages : [],
          items: useOwnerRows
            ? rows.map((row) => ({
                id: row.id,
                title: row.title,
                stageName: row.stageLabel,
                purpose: row.purpose,
                agentName: row.agent,
                community: row.community,
                cluster: row.cluster,
                unitNo: row.unitNo,
                beds: row.bedLabel,
                type: row.typeLabel,
                rent: row.rentYearly,
                sale: row.salePrice,
              }))
            : Array.isArray(avail?.items)
              ? avail.items
              : [],
          purposes: [
            { id: "rent", name: "Rent Availability", count: rentAvailability },
            { id: "sale", name: "Sale Availability", count: saleAvailability },
            { id: "sale_rent", name: "Sale / Rent Availability", count: saleRentAvailability },
          ],
        }
      : null,
    partyLists: {
      owners: ownerStats.rows.map((row) => row.name),
      tenants: tenantStats.map((row) => row.name),
      ownerStats: ownerStats.rows,
      tenantStats,
    },
    leadsBreakdown: useCrmLeads
      ? {
          total: leadsTotal,
          source: "bitrix_crm",
          portals: [{ id: "bitrix_crm", name: "Bitrix CRM (all leads)", count: leadsTotal }],
          channels: [],
          deskTotal: deskLeads.total,
        }
      : { ...deskLeads, source: "desk_all_portals", deskTotal: deskLeads.total },
    dealsBreakdown: dealStats?.ok
      ? (() => {
          const byRef = new Map();
          for (const row of sourceListings) {
            const ref = String(row.reference || "").trim().toLowerCase();
            if (ref) byRef.set(ref, row);
          }
          const items = (dealStats.items || []).map((item) => {
            const ref = String(item.listingRef || "").trim();
            const desk = ref ? byRef.get(ref.toLowerCase()) : null;
            return {
              ...item,
              listingLabel: desk
                ? `${desk.reference || ref} · ${String(desk.title || "").slice(0, 60)}`
                : ref || (item.adUrl ? "Portal ad linked" : "No listing linked"),
              listingTitle: desk ? String(desk.title || "") : "",
              listingId: desk ? String(desk.id || "") : "",
            };
          });
          return {
            won: dealsWon,
            sale: Number(dealStats.sale) || 0,
            rent: Number(dealStats.rent) || 0,
            other: Number(dealStats.other) || 0,
            ads: Number(dealStats.ads) || 0,
            purposes: [
              { id: "sale", name: "Sale deals (won)", count: Number(dealStats.sale) || 0 },
              { id: "rent", name: "Rent deals (won)", count: Number(dealStats.rent) || 0 },
              { id: "other", name: "Other won deals", count: Number(dealStats.other) || 0 },
              { id: "ads", name: "Unique ads on won deals", count: Number(dealStats.ads) || 0 },
            ],
            sources: Array.isArray(dealStats.sources) ? dealStats.sources : [],
            byAgent: Array.isArray(dealStats.byAgent) ? dealStats.byAgent : [],
            items,
          };
        })()
      : null,
    types: countMap(rows, (row) => row.type, (row) => row.typeLabel),
    beds: countMap(rows, (row) => row.bedKey, (row) => row.bedLabel),
    communities: countMap(rows, (row) => row.community.toLowerCase(), (row) => row.community),
    clusters: countMap(rows, (row) => row.cluster.toLowerCase(), (row) => row.cluster),
    cities: countMap(rows, (row) => row.city.toLowerCase(), (row) => row.city),
    phases: countMap(rows, (row) => row.projectStatus || "unknown", (row) => row.phaseLabel),
    matrix: purposeBedMatrix(rows),
    agents: agentRollup(rows),
    demand,
    needVsAvailable: gaps,
    shortageBoard: shortage,
    shortageAlerts: shortage.filter((row) => row.alert).slice(0, 8),
    priceBands: bands,
    expiry,
    agentLoad: load,
    agentPerformance: load,
    emptyAgentLeads,
    emptyAgentLeadSamples,
    expiredLeads,
    agentPerformanceNote: useOwnerRows
      ? "Agent Performance = Owner Data Availability cards assigned to each agent (office-wide)."
      : "Agent Performance = listing agents with live ads vs matching desk leads.",
    liveAds,
    rows,
  };
}

export function filterOfficeInventory(snapshot, filters = {}) {
  if (!snapshot?.ok) return snapshot;
  const rows = (snapshot.rows || []).filter((row) => matchInventoryFilters(row, filters));
  const live = rows.filter((row) => row.live);
  const prev = snapshot.totals || {};
  return {
    ...snapshot,
    filtered: true,
    filters: { ...filters },
    totals: {
      ...prev,
      total: rows.length,
      live: live.length,
      archived: rows.filter((row) => row.status === "archived").length,
      // Keep CRM Availability KPIs stable under desk filters.
      sale: prev.sale,
      rent: prev.rent,
      saleRent: prev.saleRent,
      live: prev.live,
      livePf: prev.livePf,
      liveBayut: prev.liveBayut,
      liveDubizzle: prev.liveDubizzle,
      owners: prev.owners,
      tenants: prev.tenants,
      deskSale: rows.filter((row) => row.purpose === "sale").length,
      deskRent: rows.filter((row) => row.purpose === "rent").length,
      liveSale: live.filter((row) => row.purpose === "sale").length,
      liveRent: live.filter((row) => row.purpose === "rent").length,
      agents: new Set(rows.map((row) => row.agent)).size,
      available: live.length,
      expiring30: live.filter((row) => row.expiringSoon).length,
      expiredStillLive: live.filter((row) => row.expiredLive).length,
      expired: rows.filter((row) => row.expired).length,
    },
    types: countMap(rows, (row) => row.type, (row) => row.typeLabel),
    beds: countMap(rows, (row) => row.bedKey, (row) => row.bedLabel),
    communities: countMap(rows, (row) => row.community.toLowerCase(), (row) => row.community),
    clusters: countMap(rows, (row) => row.cluster.toLowerCase(), (row) => row.cluster),
    cities: countMap(rows, (row) => row.city.toLowerCase(), (row) => row.city),
    matrix: purposeBedMatrix(rows),
    agents: agentRollup(rows),
    needVsAvailable: needVsAvailable(snapshot.demand || { beds: [], types: [], communities: [] }, live),
    priceBands: priceBands(rows),
    expiry: expiryBoard(rows),
    rows,
  };
}

const memory = new Map();
let officeCheckInflight = null;
export const OFFICE_INVENTORY_SETTING = "office_inventory_v19_verify_live";
export const OFFICE_INVENTORY_GUARD = "office_inventory_v19_guard";

export async function checkOfficeInventory({ db, root = DEFAULT_ROOT } = {}) {
  if (officeCheckInflight) return officeCheckInflight;
  officeCheckInflight = runOfficeInventoryCheck({ db, root }).finally(() => {
    officeCheckInflight = null;
  });
  return officeCheckInflight;
}

async function loadGuard(db) {
  if (!db?.getSetting) return null;
  const guard = await db.getSetting(OFFICE_INVENTORY_GUARD, null);
  return guard && Number(guard.total) > 0 ? guard : null;
}

async function saveVerified(db, report) {
  memory.set(OFFICE_INVENTORY_SETTING, report);
  const guard = {
    total: Number(report.totals?.total || 0),
    sale: Number(report.totals?.sale || 0),
    rent: Number(report.totals?.rent || 0),
    saleRent: Number(report.totals?.saleRent || 0),
    checkedAt: report.checkedAt,
  };
  if (db?.setSetting) {
    await db.setSetting(OFFICE_INVENTORY_GUARD, guard).catch(() => {});
    await db.setSetting(OFFICE_INVENTORY_SETTING, report).catch(() => {});
  }
}

function hidePrivateInventoryRow(row) {
  if (!row) return row;
  return {
    ...row,
    title: "",
    unitNo: "",
    owner: "",
    tenant: "",
    reference: String(row.id || row.reference || ""),
  };
}

export function publicOfficeInventory(report) {
  if (!report || report.ok === false) return report;
  return {
    ...report,
    rows: (report.rows || []).map(hidePrivateInventoryRow),
    partyLists: { owners: [], tenants: [], ownerStats: [], tenantStats: [] },
    totals: { ...(report.totals || {}), listingOwners: [] },
    availability: report.availability
      ? {
          ...report.availability,
          items: (report.availability.items || []).map((row) => ({ ...row, title: "", unitNo: "" })),
        }
      : null,
    liveAds: report.liveAds
      ? {
          ...report.liveAds,
          items: (report.liveAds.items || []).map((row) => ({ ...row, unitNo: "" })),
        }
      : report.liveAds,
  };
}

function snapshotCount(row) {
  return Number(row?.totals?.total ?? row?.total ?? 0);
}

async function loadLastVerified(db) {
  const fromMem = memory.get(OFFICE_INVENTORY_SETTING);
  if (fromMem?.ok && fromMem?.verified) return fromMem;
  if (!db?.getSetting) return null;
  const stored = await db.getSetting(OFFICE_INVENTORY_SETTING, null);
  if (stored?.ok && stored?.verified) {
    memory.set(OFFICE_INVENTORY_SETTING, stored);
    return stored;
  }
  return null;
}

async function runOfficeInventoryCheck({ db, root }) {
  const [tenancies, directory, listings, bitrixLeads, bitrixDeals, ownerAvail] = await Promise.all([
    db.tenancies ? db.tenancies() : [],
    db.people ? db.people() : [],
    db.all ? db.all() : [],
    fetchBitrixLeadTotal(),
    fetchBitrixDealStats(),
    checkOfficeOwnerAvailability(),
  ]);
  if (!ownerAvail?.ok || ownerAvail?.truncated || ownerAvail?.verified === false) {
    const last = await loadLastVerified(db);
    if (last) {
      return {
        ...last,
        cached: true,
        fromLastVerified: true,
        checkError:
          ownerAvail?.error ||
          "Bitrix Owner Data Availability did not verify. Showing the last verified snapshot so every Check sees the same numbers.",
      };
    }
    return {
      ok: false,
      error:
        ownerAvail?.error ||
        "Bitrix Owner Data Availability did not verify. Office Inventory was not shown.",
      source: "bitrix_owner_data",
      truncated: Boolean(ownerAvail?.truncated),
      verified: false,
    };
  }
  const formTenantNames = collectFormTenantNames(root);
  const report = {
    ...buildOfficeInventory([], [], tenancies, directory, {
      formTenantNames,
      root,
      bitrixLeadTotal: bitrixLeads.ok ? bitrixLeads.total : null,
      bitrixDealStats: bitrixDeals,
      ownerAvailability: ownerAvail,
      liveListings: listings,
    }),
    bitrixLeadsOk: Boolean(bitrixLeads.ok),
    bitrixLeadsError: bitrixLeads.ok ? "" : bitrixLeads.error || "",
    bitrixDealsOk: Boolean(bitrixDeals.ok),
    bitrixDealsError: bitrixDeals.ok ? "" : bitrixDeals.error || "",
    bitrixAvailabilityOk: true,
    bitrixAvailabilityError: "",
    cached: false,
    fromLastVerified: false,
    checkError: "",
  };
  const bitrixPhotos = await fetchBitrixAgentPhotos(report.agentLoad || []);
  const photoMap = bitrixPhotos.photos || {};
  report.agentLoad = (report.agentLoad || []).map((row) => ({
    ...row,
    photo: String(photoMap[row.name] || row.photo || "").trim(),
    agentId: String(photoMap[`${row.name}::id`] || row.agentId || "").trim(),
  }));
  report.agentPerformance = report.agentLoad;
  report.bitrixPhotosOk = Boolean(bitrixPhotos.ok);
  report.bitrixPhotosError = bitrixPhotos.ok ? "" : bitrixPhotos.error || "";
  const safe = publicOfficeInventory(report);
  const last = await loadLastVerified(db);
  const guard = (await loadGuard(db)) || (last ? { total: snapshotCount(last) } : null);
  const nextCount = snapshotCount(safe);
  const lastCount = Number(guard?.total || snapshotCount(last) || 0);
  if (isSuspiciouslySmallOwnerPull(lastCount, nextCount)) {
    if (last) {
      return {
        ...last,
        cached: true,
        fromLastVerified: true,
        checkError: `Incomplete Owner Data pull (${nextCount}) was rejected. Last verified count ${lastCount} is kept so every Check stays the same.`,
      };
    }
    return {
      ok: false,
      error: `Incomplete Owner Data pull (${nextCount} cards). Last verified was ${lastCount}. Inventory was not replaced.`,
      source: "bitrix_owner_data",
      verified: false,
    };
  }
  await saveVerified(db, safe);
  return safe;
}

export function clearOfficeInventoryCache() {
  memory.clear();
}
