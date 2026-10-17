const SITES = [
  {
    id: "pf",
    url: "https://www.propertyfinder.ae/en/broker/a7-group-real-estate-8706",
  },
  {
    id: "bayut",
    url: "https://www.bayut.com/companies/a7-group-real-estate-102128/",
  },
  {
    id: "dubizzle",
    url: "https://uae.dubizzle.com/property-agencies/a7-group-real-estate-7171/",
  },
];

const TTL_MS = 10 * 60 * 1000;
const SETTING = "portal_site_scan";

let memory = null;
let refreshing = null;

function emptyScan() {
  return { scannedAt: "", portals: {} };
}

function nextJson(html) {
  const match = String(html || "").match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function agentRecord(agent) {
  const name = String(agent?.name || "").trim();
  if (!name) return null;
  const sale =
    Number(agent.propertiesResidentialForSaleCount || 0) + Number(agent.propertiesCommercialForSaleCount || 0);
  const rent =
    Number(agent.propertiesResidentialForRentCount || 0) + Number(agent.propertiesCommercialForRentCount || 0);
  const listings = Number(agent.totalProperties ?? sale + rent);
  return {
    name,
    listings: Number.isFinite(listings) ? listings : 0,
    sale: Number.isFinite(sale) ? sale : 0,
    rent: Number.isFinite(rent) ? rent : 0,
  };
}

export function refsFromPfSearch(body) {
  return rowsFromPfSearch(body).map((row) => row.ref);
}

export function rowsFromPfSearch(body) {
  const rows = Array.isArray(body?.listings) ? body.listings : [];
  const out = [];
  for (const row of rows) {
    const property = row?.property || {};
    const match = String(property.reference || row?.reference || "").match(/a7group-\d+/i);
    if (!match) continue;
    const categoryId = Number(property.category_id) || 0;
    out.push({
      ref: match[0].toLowerCase(),
      categoryId,
      listed: String(property.listed_date || ""),
      agent: String(property.agent?.name || "").trim(),
      side: categoryId === 2 || categoryId === 4 ? "rent" : categoryId === 1 || categoryId === 3 ? "sale" : "",
      listingLevel: String(property.listing_level || "").trim().toLowerCase(),
    });
  }
  return out;
}

function dedupePfRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const ref = String(row?.ref || "").toLowerCase();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const categoryId = Number(row.categoryId) || 0;
    const side = row.side === "rent" || categoryId === 2 || categoryId === 4 ? "rent" : row.side === "sale" || categoryId === 1 || categoryId === 3 ? "sale" : "";
    out.push({
      ref,
      categoryId,
      listed: String(row.listed || ""),
      agent: String(row.agent || "").trim(),
      side,
      listingLevel: String(row.listingLevel || "").trim().toLowerCase(),
    });
  }
  return out;
}

/** The website heading is the active set. A newer search hit past a category counter is not in that set. */
export function propertyFinderActiveRows(parsed, searched) {
  const rows = dedupePfRows(searched?.rows);
  const total = Number(searched?.total) || 0;
  if (!rows.length || rows.length !== total) return null;
  const active = Number(parsed?.count) || 0;
  if (rows.length === active) return rows;
  const buckets = parsed?.counts;
  if (!buckets || rows.length < active) return null;
  const groups = new Map();
  for (const row of rows) {
    const list = groups.get(row.categoryId) || [];
    list.push(row);
    groups.set(row.categoryId, list);
  }
  const kept = [];
  let expected = 0;
  for (const [id, limit] of Object.entries(buckets)) {
    const cap = Number(limit) || 0;
    expected += cap;
    const group = groups.get(Number(id)) || [];
    if (group.length < cap) return null;
    const ordered = [...group].sort((a, b) => String(b.listed).localeCompare(String(a.listed)) || b.ref.localeCompare(a.ref));
    kept.push(...ordered.slice(group.length - cap));
    groups.delete(Number(id));
  }
  if (expected !== active || kept.length !== active) return null;
  for (const list of groups.values()) {
    if (list.length) return null;
  }
  return kept;
}

export function propertyFinderActiveRefs(parsed, searched) {
  const rows = propertyFinderActiveRows(parsed, searched);
  return rows ? rows.map((row) => row.ref) : null;
}

function bumpCount(map, name) {
  const key = String(name || "").trim();
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function rankedCounts(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([name, count]) => ({ id: name, name, count }));
}

function listingsByRef(listings) {
  const byRef = new Map();
  for (const row of listings || []) {
    const ref = String(row?.reference || "").trim().toLowerCase();
    if (ref) byRef.set(ref, row);
  }
  return byRef;
}

function adFact(ad, row) {
  const ref = String(ad?.ref || "").trim().toLowerCase();
  const side = ad?.side === "rent" || ad?.side === "sale" ? ad.side : row?.purpose === "rent" || row?.purpose === "sale" ? row.purpose : "";
  const beds = row && row.beds != null && row.beds !== "" ? Number(row.beds) : Number(ad?.beds);
  const bedKey = beds === 0 ? "studio" : Number.isFinite(beds) ? String(beds) : "";
  let typeName = String(row?.type || ad?.type || "other").trim().toLowerCase() || "other";
  if (typeName === "apartment" && beds === 0) typeName = "studio";
  return {
    ref,
    agent: String(ad?.agent || "").trim(),
    side,
    typeName,
    bedKey,
    community: String(row?.community || ad?.community || "").trim(),
    cluster: String(row?.sub_community || row?.building || ad?.subCommunity || "").trim(),
    credit: String(ad?.credit || "").trim().toLowerCase(),
    live: !row || String(row.status || "") === "live",
  };
}

function portalFacts(portal, listings) {
  const byRef = listingsByRef(listings);
  return (Array.isArray(portal?.ads) ? portal.ads : [])
    .map((ad) => adFact(ad, byRef.get(String(ad?.ref || "").trim().toLowerCase()) || null))
    .filter((fact) => fact.ref);
}

/** One agent's live ads on a portal: sale, rent, type, beds, community and cluster, taken from those ads. */
export function portalAgentDetails(portal, listings) {
  const groups = new Map();
  for (const fact of portalFacts(portal, listings)) {
    const name = fact.agent;
    if (!name) continue;
    const group = groups.get(name) || {
      total: 0,
      sale: 0,
      rent: 0,
      live: 0,
      types: new Map(),
      beds: new Map(),
      communities: new Map(),
      clusters: new Map(),
      credits: new Map(),
    };
    group.total += 1;
    if (fact.side === "sale") group.sale += 1;
    if (fact.side === "rent") group.rent += 1;
    if (fact.live) group.live += 1;
    bumpCount(group.types, fact.typeName);
    if (fact.bedKey) {
      const label = fact.bedKey === "studio" ? "Studio" : `${fact.bedKey} Bedroom`;
      const current = group.beds.get(fact.bedKey) || { name: label, count: 0 };
      current.count += 1;
      group.beds.set(fact.bedKey, current);
    }
    bumpCount(group.communities, fact.community);
    bumpCount(group.clusters, fact.cluster);
    bumpCount(group.credits, fact.credit);
    groups.set(name, group);
  }
  const out = new Map();
  for (const [name, group] of groups) {
    out.set(name, {
      total: group.total,
      sale: group.sale,
      rent: group.rent,
      live: group.live,
      types: rankedCounts(group.types),
      beds: [...group.beds.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .map(([id, row]) => ({ id, name: row.name, count: row.count })),
      communities: rankedCounts(group.communities),
      clusters: rankedCounts(group.clusters),
      credits: rankedCounts(group.credits),
    });
  }
  return out;
}

export function portalSliceRefs(portal, slice = {}, listings = []) {
  const agent = String(slice.agent || "").trim().toLowerCase();
  const side = String(slice.side || "").trim().toLowerCase();
  const credit = String(slice.credit || "").trim().toLowerCase();
  const type = String(slice.type || "").trim().toLowerCase();
  const beds = String(slice.beds || "").trim().toLowerCase();
  const community = String(slice.community || "").trim().toLowerCase();
  const cluster = String(slice.cluster || "").trim().toLowerCase();
  const liveOnly = slice.live === true || slice.live === "1" || slice.live === 1;
  if (!agent && !side && !credit && !type && !beds && !community && !cluster && !liveOnly) return null;
  return portalFacts(portal, listings)
    .filter((fact) => {
      if (agent && fact.agent.toLowerCase() !== agent) return false;
      if (side && fact.side !== side) return false;
      if (credit && fact.credit !== credit) return false;
      if (type && fact.typeName !== type) return false;
      if (beds && fact.bedKey !== beds) return false;
      if (community && fact.community.toLowerCase() !== community) return false;
      if (cluster && fact.cluster.toLowerCase() !== cluster) return false;
      if (liveOnly && !fact.live) return false;
      return true;
    })
    .map((fact) => fact.ref);
}

function emptyAgent(name) {
  return { name, listings: 0, sale: 0, rent: 0, premium: 0, featured: 0, hot: 0, superhot: 0 };
}

function addAgentSpot(current, ad) {
  const credit = String(ad?.credit || "").toLowerCase();
  if (ad?.superhot || credit === "superhot") current.superhot += 1;
  else if (ad?.hot || credit === "hot") current.hot += 1;
  else if (ad?.premium || credit === "premium") current.premium += 1;
  else if (ad?.featured || ad?.highlighted || credit === "featured") current.featured += 1;
}

export function agentsFromAds(ads) {
  const map = new Map();
  for (const ad of ads || []) {
    const name = String(ad?.agent || "").trim();
    if (!name) continue;
    const current = map.get(name) || emptyAgent(name);
    current.listings += 1;
    if (ad.side === "rent") current.rent += 1;
    else if (ad.side === "sale") current.sale += 1;
    addAgentSpot(current, ad);
    map.set(name, current);
  }
  return [...map.values()].sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));
}

export function propertyFinderLive(parsed, searched) {
  if (!parsed?.ok) return parsed;
  const rows = propertyFinderActiveRows(parsed, searched);
  if (!rows) return { ok: false, error: "Property Finder listing list was incomplete" };
  const products = { premium: 0, featured: 0, standard: 0 };
  const ads = rows.map((row) => {
    const level = row.listingLevel === "premium" || row.listingLevel === "featured" ? row.listingLevel : "standard";
    products[level] += 1;
    const credit = level === "featured" ? "Featured" : level === "premium" ? "Premium" : "Standard";
    return {
      ref: row.ref,
      agent: row.agent || "",
      side: row.side || "",
      credit,
      premium: level === "premium",
      featured: level === "featured",
    };
  });
  const agents = agentsFromAds(ads);
  return {
    ok: true,
    count: rows.length,
    refs: rows.map((row) => row.ref),
    agents: agents.length ? agents : parsed.agents || [],
    products,
    ads,
  };
}

function brokerIdFromHtml(html) {
  const id = nextJson(html)?.props?.pageProps?.broker?.id;
  return String(id || "").replace(/\D/g, "");
}

async function searchPfBroker(brokerId) {
  const refs = [];
  let page = 1;
  let pages = 1;
  let total = 0;
  while (page <= pages && page <= 30) {
    const url = `https://www.propertyfinder.ae/api/pwa/property/search?filters.broker_id=${encodeURIComponent(brokerId)}&pagination.limit=50&pagination.page=${page}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Property Finder search returned ${res.status}`);
    const body = await res.json();
    total = Number(body?.meta?.total_count) || 0;
    pages = Number(body?.meta?.page_count) || 1;
    refs.push(...rowsFromPfSearch(body));
    if (!(body?.listings || []).length) break;
    page += 1;
  }
  const rows = dedupePfRows(refs);
  return { total, refs: rows.map((row) => row.ref), rows };
}

async function scanPropertyFinder(site) {
  const html = await readHtml(site.url);
  const parsed = parsePropertyFinderHtml(html);
  const brokerId = brokerIdFromHtml(html);
  if (!parsed.ok || !brokerId) return { ...parsed, url: site.url };
  try {
    const searched = await searchPfBroker(brokerId);
    const live = propertyFinderLive(parsed, searched);
    return { ...live, url: site.url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read Property Finder listings",
      url: site.url,
    };
  }
}

export function parsePropertyFinderHtml(html) {
  const data = nextJson(html);
  const broker = data?.props?.pageProps?.broker;
  if (!broker || broker.totalProperties == null) {
    return { ok: false, error: "Property Finder page had no live listing count" };
  }
  const agents = (Array.isArray(data?.props?.pageProps?.agents?.data) ? data.props.pageProps.agents.data : [])
    .map(agentRecord)
    .filter(Boolean)
    .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));
  return {
    ok: true,
    count: Number(broker.totalProperties),
    counts: {
      1: Number(broker.propertiesResidentialForSaleCount) || 0,
      2: Number(broker.propertiesResidentialForRentCount) || 0,
      3: Number(broker.propertiesCommercialForSaleCount) || 0,
      4: Number(broker.propertiesCommercialForRentCount) || 0,
    },
    refs: portalRefs(html),
    agents,
  };
}

export function parseDubizzleHtml(html) {
  const text = String(html || "");
  const blocked = /incapsula|pardon our interruption/i.test(text);
  const match = text.match(/agencyCountStats\/fulfilled","payload":(\{[^}]+\})/);
  if (!match) {
    return blocked
      ? { ok: false, blocked: true, error: "Dubizzle asked for a human check" }
      : { ok: false, error: "Dubizzle page had no live listing count" };
  }
  let payload = null;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return { ok: false, error: "Dubizzle listing count could not be read" };
  }
  const count = Number(payload.totalPropertyCount);
  if (!Number.isFinite(count)) return { ok: false, error: "Dubizzle listing count could not be read" };
  return { ok: true, count, refs: portalRefs(text), agents: [] };
}

export function parseBayutHtml(html) {
  const text = String(html || "");
  const blocked = /verify you are human|security check/i.test(text);
  if (blocked) {
    return { ok: false, blocked: true, error: "Bayut asked to verify you are human" };
  }
  const data = nextJson(text);
  const count = bayutCount(data) ?? bayutCountFromText(text);
  if (!blocked && count == null && /no active listings/i.test(text)) {
    return { ok: true, count: 0, refs: portalRefs(text), agents: bayutAgents(data) };
  }
  if (count == null) {
    return blocked
      ? { ok: false, blocked: true, error: "Bayut asked to verify you are human" }
      : { ok: false, error: "Bayut page had no live listing count" };
  }
  return { ok: true, count, refs: portalRefs(text), agents: bayutAgents(data) };
}

function portalRefs(text) {
  return [...new Set([...String(text || "").matchAll(/a7group-\d+/gi)].map((match) => match[0].toLowerCase()))];
}

function bayutCount(data) {
  const found = [];
  walk(data, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const key of ["activeListings", "numberOfActiveListings", "totalProperties", "adsCount"]) {
      if (value[key] != null && Number.isFinite(Number(value[key]))) found.push(Number(value[key]));
    }
  });
  return found.length ? found[0] : null;
}

function bayutCountFromText(text) {
  const match = text.match(/(\d[\d,]*)\s+Properties/i) || text.match(/Properties\s*[-:]\s*(\d[\d,]*)/i);
  if (!match) return null;
  const count = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(count) ? count : null;
}

function bayutAgents(data) {
  const agents = [];
  walk(data, (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const name = String(value.name || "").trim();
    const listings = Number(value.stats?.adsCount ?? value.adsCount ?? value.totalProperties);
    if (!name || !Number.isFinite(listings) || name.length > 80) return;
    if (/^a7 group/i.test(name)) return;
    agents.push({ name, listings, sale: 0, rent: 0 });
  });
  const seen = new Set();
  return agents
    .filter((agent) => (seen.has(agent.name) ? false : seen.add(agent.name)))
    .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name))
    .slice(0, 30);
}

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  for (const item of Object.values(value)) walk(item, visit);
}

export function parsePortalHtml(id, html) {
  if (id === "pf") return parsePropertyFinderHtml(html);
  if (id === "dubizzle") return parseDubizzleHtml(html);
  if (id === "bayut") return parseBayutHtml(html);
  return { ok: false, error: "Unknown portal" };
}

const DUBIZZLE_SEARCH = {
  appId: "WD0PTZ13ZS",
  apiKey: "cdd839b4fdac840289e88633779e8634",
  agentId: "7171",
  indexes: [
    ["by_verification_feature_asc_property-for-sale-residential.com", "sale"],
    ["by_verification_feature_asc_property-for-sale-commercial.com", "sale"],
    ["by_verification_feature_asc_property-for-rent-residential.com", "rent"],
    ["by_verification_feature_asc_property-for-rent-commercial.com", "rent"],
  ],
};

export function referenceFromPortalHit(hit) {
  const raw = [hit?.property_reference, hit?.reference, hit?.reference_number, hit?.referenceNumber]
    .filter(Boolean)
    .join(" ");
  const match = String(raw).match(/a7group-\d+/i);
  return match ? match[0].toLowerCase() : "";
}

function localizedName(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (!value || typeof value !== "object") return "";
  if (typeof value.en === "string" && value.en.trim()) return value.en.replace(/\s+/g, " ").trim();
  if (typeof value.name === "string" && value.name.trim()) return value.name.replace(/\s+/g, " ").trim();
  if (value.name && typeof value.name === "object") return localizedName(value.name);
  if (typeof value.full_name === "string" && value.full_name.trim()) return value.full_name.replace(/\s+/g, " ").trim();
  return "";
}

const GENERIC_AGENT = /^(agent|agency|a7 group real estate|a7 group real estate llc)$/i;

export function agentNameFromPortalHit(hit) {
  const candidates = [
    localizedName(hit?.agent_profile?.name),
    localizedName(hit?.agent?.name),
    localizedName(hit?.listed_by?.name),
    localizedName(hit?.listed_by),
    localizedName(hit?.contactName),
  ];
  for (const name of candidates) {
    if (name && !GENERIC_AGENT.test(name)) return name;
  }
  return "";
}

function hitFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function hitType(hit) {
  const names = Array.isArray(hit?.category_v2?.names_en) ? hit.category_v2.names_en : [];
  const text = names.join(" ").toLowerCase();
  const table = [
    ["townhouse", "townhouse"],
    ["villa", "villa"],
    ["penthouse", "penthouse"],
    ["hotel apartment", "hotel_apartment"],
    ["apartment", "apartment"],
    ["office", "office"],
    ["warehouse", "warehouse"],
    ["showroom", "showroom"],
    ["shop", "shop"],
    ["retail", "retail"],
    ["land", "land"],
    ["duplex", "duplex"],
    ["compound", "compound"],
    ["building", "whole_building"],
    ["labor", "labor_camp"],
    ["labour", "labor_camp"],
    ["farm", "farm"],
  ];
  for (const [word, type] of table) {
    if (text.includes(word)) return type;
  }
  return "apartment";
}

function hitCategory(hit) {
  const names = Array.isArray(hit?.category_v2?.names_en) ? hit.category_v2.names_en : [];
  return names.some((name) => /commercial/i.test(String(name))) ? "commercial" : "residential";
}

function hitPlace(hit) {
  const path = hit?.location_path?.en || {};
  const leaf = [path.lvl4, path.lvl3, path.lvl2].find((item) => typeof item === "string" && item.includes(">"));
  const parts = String(leaf || "")
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
  const city = localizedName(hit?.city?.name) || parts[1] || "Dubai";
  const community = parts.length ? parts[parts.length - 1] : city;
  const subCommunity = parts.length > 3 ? parts[parts.length - 2] : "";
  return { city, community, subCommunity };
}

export function collectPortalAds(groups) {
  const refs = new Set();
  const agents = new Map();
  const ads = [];
  const products = { premium: 0, featured: 0, promoted: 0, highlighted: 0, standard: 0 };
  let count = 0;
  let sale = 0;
  let rent = 0;
  for (const group of groups) {
    count += Number(group.count) || 0;
    const side = group.side === "rent" ? "rent" : "sale";
    if (side === "rent") rent += Number(group.count) || 0;
    else sale += Number(group.count) || 0;
    for (const hit of group.hits || []) {
      const ref = referenceFromPortalHit(hit);
      if (ref) refs.add(ref);
      const name = agentNameFromPortalHit(hit);
      const premium = hitFlag(hit?.is_premium) || hitFlag(hit?.is_premium_ad);
      const featured = hitFlag(hit?.featured_listing);
      const promoted = hitFlag(hit?.promoted);
      const highlighted = hitFlag(hit?.highlighted_ad);
      if (premium) products.premium += 1;
      if (featured) products.featured += 1;
      if (promoted) products.promoted += 1;
      if (highlighted) products.highlighted += 1;
      if (!premium && !featured && !promoted) products.standard += 1;
      if (name) {
        const current = agents.get(name) || { name, listings: 0, sale: 0, rent: 0, premium: 0, featured: 0, hot: 0, superhot: 0 };
        current.listings += 1;
        current[side] += 1;
        if (premium) current.premium += 1;
        else if (featured || highlighted) current.featured += 1;
        agents.set(name, current);
      }
      if (!ref) continue;
      const place = hitPlace(hit);
      ads.push({
        ref,
        agent: name,
        side,
        category: hitCategory(hit),
        type: hitType(hit),
        title: localizedName(hit?.name),
        community: place.community,
        subCommunity: place.subCommunity,
        city: place.city,
        beds: Number(hit?.bedrooms) || 0,
        baths: Number(hit?.bathrooms) || 0,
        size: Number(hit?.size) || 0,
        price: Number(hit?.price) || 0,
        photo: String(hit?.photo?.main || hit?.photo?.thumb || ""),
        agentPhoto: String(hit?.agent_profile?.profile_pic || ""),
        url: String(hit?.absolute_url || ""),
        furnished: hit?.furnished === true,
        premium,
        featured,
        promoted,
        highlighted,
        credit: featured || highlighted ? "Featured" : premium ? "Premium" : promoted ? "Promoted" : "Standard",
      });
    }
  }
  return {
    count,
    sale,
    rent,
    refs: [...refs],
    products,
    ads,
    agents: [...agents.values()].sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name)),
  };
}

async function searchDubizzle(indexName, page) {
  const res = await fetch(
    `https://${DUBIZZLE_SEARCH.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`,
    {
      method: "POST",
      headers: {
        "X-Algolia-Application-Id": DUBIZZLE_SEARCH.appId,
        "X-Algolia-API-Key": DUBIZZLE_SEARCH.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "",
        filters: `agent.id=${DUBIZZLE_SEARCH.agentId}`,
        hitsPerPage: 100,
        page,
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) throw new Error(`Dubizzle search returned ${res.status}`);
  return res.json();
}

async function scanDubizzle() {
  const groups = [];
  for (const [indexName, side] of DUBIZZLE_SEARCH.indexes) {
    const first = await searchDubizzle(indexName, 0);
    const hits = [...(first.hits || [])];
    const pages = Math.min(Number(first.nbPages) || 1, 20);
    for (let page = 1; page < pages; page += 1) {
      const next = await searchDubizzle(indexName, page);
      hits.push(...(next.hits || []));
    }
    groups.push({ side, count: Number(first.nbHits) || 0, hits });
  }
  const collected = collectPortalAds(groups);
  const fullyRead = groups.every((group) => (group.hits || []).length === (Number(group.count) || 0));
  if (!fullyRead || collected.refs.length !== collected.count) {
    return { ok: false, error: "Dubizzle listing list was incomplete" };
  }
  return {
    ok: true,
    count: collected.count,
    sale: collected.sale,
    rent: collected.rent,
    refs: collected.refs,
    agents: collected.agents,
    products: collected.products,
    ads: collected.ads,
  };
}

const BAYUT_TYPES = [
  ["townhouse", "townhouse"],
  ["villa", "villa"],
  ["penthouse", "penthouse"],
  ["hotel apartment", "hotel_apartment"],
  ["apartment", "apartment"],
  ["office", "office"],
  ["warehouse", "warehouse"],
  ["showroom", "showroom"],
  ["shop", "shop"],
  ["retail", "retail"],
  ["land", "land"],
  ["duplex", "duplex"],
  ["compound", "compound"],
  ["building", "whole_building"],
  ["labor", "labor_camp"],
  ["labour", "labor_camp"],
  ["farm", "farm"],
];

function bayutCredit(product) {
  const value = String(product || "").toLowerCase();
  if (value === "superhot") return "Superhot";
  if (value === "hot") return "Hot";
  if (value === "premium") return "Premium";
  return "Standard";
}

function bayutType(category) {
  const text = (Array.isArray(category) ? category : [])
    .map((row) => [row?.nameSingular, row?.name, row?.slug].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();
  for (const [word, type] of BAYUT_TYPES) {
    if (text.includes(word)) return type;
  }
  return "apartment";
}

function sqmToSqft(value) {
  const sqm = Number(value) || 0;
  return sqm > 0 ? Math.round(sqm * 10.76391041671) : 0;
}

/** One Bayut company-page hit becomes the same ad shape Overview and Listings already use. */
export function bayutAdsFromHits(hits) {
  const ads = [];
  const seen = new Set();
  for (const hit of hits || []) {
    const match = String(hit?.referenceNumber || "").match(/a7group-\d+/i);
    if (!match) continue;
    const ref = match[0].toLowerCase();
    if (seen.has(ref)) continue;
    seen.add(ref);
    const names = (Array.isArray(hit.location) ? hit.location : []).map((row) => String(row?.name || row || "").trim()).filter(Boolean);
    const categories = Array.isArray(hit.category) ? hit.category : [];
    const side = String(hit.purpose || "").includes("rent") ? "rent" : "sale";
    const externalId = String(hit.externalID || "").replace(/\D/g, "");
    const photoId = String(hit.coverPhoto || "").replace(/\D/g, "");
    ads.push({
      ref,
      agent: String(hit.agent || "").trim(),
      side,
      category: categories.some((row) => /commercial/i.test(`${row?.name || ""} ${row?.slug || ""}`)) ? "commercial" : "residential",
      type: bayutType(categories),
      title: String(hit.title || "").trim(),
      community: names[2] || names[1] || "Dubai",
      subCommunity: names[3] || "",
      city: names[1] || "Dubai",
      beds: Number(hit.rooms) || 0,
      baths: Number(hit.baths) || 0,
      size: sqmToSqft(hit.area),
      price: Number(hit.price) || 0,
      photo: photoId ? `https://images.bayut.com/thumbnails/${photoId}-400x300.webp` : "",
      agentPhoto: "",
      url: externalId ? `https://www.bayut.com/property/details-${externalId}.html` : "",
      furnished: String(hit.furnishingStatus || "") === "furnished",
      credit: bayutCredit(hit.product),
      premium: String(hit.product || "") === "premium",
      hot: String(hit.product || "") === "hot",
      superhot: String(hit.product || "") === "superhot",
      featured: false,
    });
  }
  return ads;
}

export function bayutPortalFromHits(hits) {
  const ads = bayutAdsFromHits(hits);
  let sale = 0;
  let rent = 0;
  const products = { superhot: 0, hot: 0, premium: 0, standard: 0 };
  for (const ad of ads) {
    if (ad.side === "rent") rent += 1;
    else sale += 1;
    const key = String(ad.credit || "").toLowerCase();
    if (products[key] != null) products[key] += 1;
    else products.standard += 1;
  }
  return {
    ok: ads.length > 0 || hits?.length === 0,
    count: ads.length,
    sale,
    rent,
    refs: ads.map((ad) => ad.ref),
    agents: agentsFromAds(ads),
    products,
    ads,
    url: SITES.find((site) => site.id === "bayut")?.url || "",
  };
}

export function portalAdPatch(current, ad, portalId) {
  if (!current || !ad || !portalId) return null;
  const patch = {};
  const portals = Array.isArray(current.portals) ? current.portals : [];
  if (!portals.includes(portalId)) patch.portals = [...portals, portalId];
  if (String(current.status || "") !== "live") patch.status = "live";
  const set = (field, value) => {
    if (value == null || value === "") return;
    if (String(current[field] ?? "") !== String(value)) patch[field] = value;
  };
  set("title", ad.title);
  set("community", ad.community);
  set("sub_community", ad.subCommunity);
  set("city", ad.city);
  set("type", ad.type);
  set("category", ad.category);
  set("purpose", ad.side === "rent" || ad.side === "sale" ? ad.side : "");
  if (ad.beds != null && ad.beds !== "" && Number(current.beds) !== Number(ad.beds)) patch.beds = ad.beds;
  if (ad.baths != null && ad.baths !== "" && Number(current.baths) !== Number(ad.baths)) patch.baths = ad.baths;
  if (Number(ad.size) > 0 && Number(current.area_sqft) !== Number(ad.size)) patch.area_sqft = ad.size;
  if (Number(ad.price) > 0 && Number(current.price_aed) !== Number(ad.price)) patch.price_aed = ad.price;
  if (ad.photo && current.photo !== ad.photo) patch.photo = ad.photo;
  if (ad.agent && current.listing_agent !== ad.agent) patch.listing_agent = ad.agent;
  if (typeof ad.furnished === "boolean") {
    const furnished = ad.furnished ? "furnished" : "unfurnished";
    if (current.furnished !== furnished) patch.furnished = furnished;
  }
  return Object.keys(patch).length ? patch : null;
}

export async function syncPortalAds(db, portalId, portal) {
  const rows = await db.all();
  const byRef = new Map(rows.map((row) => [String(row.reference || "").trim().toLowerCase(), row]));
  let updated = 0;
  for (const ad of portal?.ads || []) {
    const reference = String(ad?.ref || "").trim().toLowerCase();
    const current = reference ? byRef.get(reference) : null;
    if (!current) continue;
    const patch = portalAdPatch(current, ad, portalId);
    if (!patch) continue;
    await db.update(current.id, patch, `${portalId} website`);
    updated += 1;
  }
  return updated;
}

export async function addMissingBayutListings(db, portal) {
  const ads = Array.isArray(portal?.ads) ? portal.ads : [];
  let created = 0;
  for (const ad of ads) {
    const reference = String(ad?.ref || "").trim().toLowerCase();
    if (!reference) continue;
    try {
      if (await db.getByReference(reference)) continue;
      await db.create(
        {
          reference,
          title: ad.title || reference,
          community: ad.community || "",
          sub_community: ad.subCommunity || "",
          city: ad.city || "Dubai",
          type: ad.type || "apartment",
          category: ad.category === "commercial" ? "commercial" : "residential",
          purpose: ad.side === "rent" ? "rent" : "sale",
          status: "live",
          beds: ad.beds || 0,
          baths: ad.baths || 0,
          area_sqft: ad.size || 0,
          price_aed: ad.price || 0,
          photo: ad.photo || "",
          portals: ["bayut"],
          listing_agent: ad.agent || "",
          listing_source: "Bayut",
          furnished: ad.furnished ? "furnished" : "unfurnished",
          notes: "Added because this reference is live on Bayut and was not on the desk.",
          created_by: "Bayut website",
        },
        "Bayut website"
      );
      created += 1;
    } catch (error) {
      console.error("Bayut listing was not added:", reference, error instanceof Error ? error.message : error);
    }
  }
  return created;
}

export async function addMissingDubizzleListings(db, portal) {
  const ads = Array.isArray(portal?.ads) ? portal.ads : [];
  let created = 0;
  for (const ad of ads) {
    const reference = String(ad?.ref || "").trim().toLowerCase();
    if (!reference) continue;
    try {
      if (await db.getByReference(reference)) continue;
      await db.create(
        {
          reference,
          title: ad.title || reference,
          community: ad.community || "",
          sub_community: ad.subCommunity || "",
          city: ad.city || "Dubai",
          type: ad.type || "apartment",
          category: ad.category === "commercial" ? "commercial" : "residential",
          purpose: ad.side === "rent" ? "rent" : "sale",
          status: "live",
          beds: ad.beds || 0,
          baths: ad.baths || 0,
          area_sqft: ad.size || 0,
          price_aed: ad.price || 0,
          photo: ad.photo || "",
          portals: ["dubizzle"],
          listing_agent: ad.agent || "",
          listing_source: "Dubizzle",
          furnished: ad.furnished ? "furnished" : "unfurnished",
          notes: "Added because this reference is live on Dubizzle and was not on the desk.",
          created_by: "Dubizzle website",
        },
        "Dubizzle website"
      );
      created += 1;
    } catch (error) {
      console.error("Dubizzle listing was not added:", reference, error instanceof Error ? error.message : error);
    }
  }
  return created;
}

async function readHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html",
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(15000),
  });
  return res.text();
}

async function scanOne(site) {
  if (site.id === "dubizzle") {
    try {
      const live = await scanDubizzle();
      return { ...live, url: site.url };
    } catch (error) {
      const fallback = error instanceof Error ? error.message : "Could not read Dubizzle";
      try {
        const html = await readHtml(site.url);
        const parsed = parsePortalHtml(site.id, html);
        return parsed.ok ? finishReading(parsed, site.url) : { ...parsed, url: site.url, error: parsed.error || fallback };
      } catch {
        return { ok: false, error: fallback, url: site.url };
      }
    }
  }
  if (site.id === "pf") {
    try {
      return await scanPropertyFinder(site);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not open this website", url: site.url };
    }
  }
  try {
    const html = await readHtml(site.url);
    const parsed = parsePortalHtml(site.id, html);
    return finishReading(parsed, site.url);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not open this website", url: site.url };
  }
}

/** A website reading can drive Overview and Listings only when every live ad is in the list, including a real zero. */
export function portalReadingReady(portal) {
  if (!portal?.ok) return false;
  const refs = Array.isArray(portal.refs) ? portal.refs : [];
  return refs.length === Number(portal.count);
}

function finishReading(parsed, url) {
  if (!parsed?.ok) return { ...parsed, url };
  if (!portalReadingReady(parsed)) {
    return { ok: false, error: "The website listing list was incomplete", url };
  }
  return { ...parsed, refs: parsed.refs || [], url };
}

export async function websiteLiveGate(db) {
  const scan = await portalSitesForOverview(db);
  const gate = {};
  for (const id of ["pf", "bayut", "dubizzle"]) {
    const portal = scan?.portals?.[id];
    if (!portalReadingReady(portal)) continue;
    const refs = Array.isArray(portal.refs) ? portal.refs.map((ref) => String(ref).toLowerCase()) : [];
    gate[id] = { ok: true, count: Number(portal.count) || 0, refs };
  }
  return gate;
}

function portalHasFullAds(portal) {
  if (!portal?.ok) return false;
  const refs = Array.isArray(portal.refs) ? portal.refs : [];
  const ads = Array.isArray(portal.ads) ? portal.ads : [];
  const count = Number(portal.count) || 0;
  return count > 0 && refs.length === count && ads.length === count;
}

/** Keep the last complete ad list. A human check or a count without the ads must not wipe Listings. */
export function mergePortalReading(previous, next) {
  const scannedAt = new Date().toISOString();
  const confirmedEmpty = next?.ok && portalReadingReady(next) && Number(next.count) === 0;
  if (confirmedEmpty || portalHasFullAds(next) || (next?.ok && portalReadingReady(next) && !portalHasFullAds(previous))) {
    return { ...next, scannedAt };
  }
  if (previous?.ok) {
    return {
      ...previous,
      lastError: next?.ok
        ? "The latest website reading did not include every ad"
        : next?.error || "The latest scan did not open the website",
    };
  }
  return { ...(next || { ok: false }), scannedAt };
}

function mergePortal(previous, next) {
  return mergePortalReading(previous, next);
}

export async function refreshPortalSites(previous = null) {
  const prior = previous?.portals || {};
  const scanned = await Promise.all(SITES.map(async (site) => [site.id, mergePortal(prior[site.id], await scanOne(site))]));
  return { scannedAt: new Date().toISOString(), portals: Object.fromEntries(scanned) };
}

function beginPortalRefresh(db, stored) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const fresh = await refreshPortalSites(stored);
    try {
      if (fresh.portals?.dubizzle?.ok) {
        await addMissingDubizzleListings(db, fresh.portals.dubizzle);
        await syncPortalAds(db, "dubizzle", fresh.portals.dubizzle);
      }
      if (fresh.portals?.bayut?.ok) {
        await addMissingBayutListings(db, fresh.portals.bayut);
        await syncPortalAds(db, "bayut", fresh.portals.bayut);
      }
    } catch (error) {
      console.error("Dubizzle desk add failed:", error instanceof Error ? error.message : error);
    }
    memory = fresh;
    await db.setSetting(SETTING, fresh);
    return fresh;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function portalSitesForOverview(db, { force = false } = {}) {
  const stored = memory || (await db.getSetting(SETTING, null)) || emptyScan();
  if (!memory && stored?.portals) memory = stored;
  const age = stored.scannedAt ? Date.now() - Date.parse(stored.scannedAt) : Infinity;
  const hasReading = Boolean(stored.portals && Object.keys(stored.portals).length);
  const freshEnough = !force && hasReading && age < TTL_MS;
  if (freshEnough) return stored;
  const job = beginPortalRefresh(db, stored);
  if (force || !hasReading) return job;
  job.catch((error) => console.error("Portal site scan failed:", error?.message || error));
  return stored;
}

export function schedulePortalSiteScan(db) {
  const run = () => portalSitesForOverview(db, { force: true }).catch((error) => console.error("Portal site scan failed:", error.message));
  setTimeout(run, 20000);
  setInterval(run, TTL_MS);
}
