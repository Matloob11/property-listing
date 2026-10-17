import { historyActorLabel } from "./listingModel.js";
import { karachiDay, leadPortal } from "./leadPortal.js";

const WINDOWS = new Set([7, 14, 30]);
const SYNC_ACTOR = /property finder|portal list csv|old desk csv|portal live restore|bayut website|dubizzle website|live sweep/i;
const WORKING = new Set(["live", "draft", "pending"]);

export function reportDays(value) {
  const n = Number(value);
  return WINDOWS.has(n) ? n : 7;
}

function leadsInKarachiDays(leads, days, now = Date.now()) {
  const today = karachiDay(now);
  const from = shiftYmd(today, -(Math.max(1, days) - 1));
  return (leads || []).filter((lead) => {
    const day = karachiDay(lead?.created_at);
    return day && day >= from && day <= today;
  });
}

function countsForListings(listings, leads) {
  const byId = new Map();
  const byRef = new Map();
  for (const row of listings || []) {
    byId.set(row.id, row);
    const ref = String(row.reference || "").trim().toLowerCase();
    if (ref && !byRef.has(ref)) byRef.set(ref, row);
  }
  const counts = new Map();
  for (const lead of leads || []) {
    const row = (lead.listing_id && byId.get(lead.listing_id))
      || byRef.get(String(lead.reference || "").trim().toLowerCase())
      || null;
    if (!row) continue;
    counts.set(row.id, (counts.get(row.id) || 0) + 1);
  }
  return { byId, counts };
}

function historyOf(listing) {
  return Array.isArray(listing?.history) ? listing.history : [];
}

function isDeskEdit(entry) {
  return Boolean(entry?.at) && entry.field !== "created" && !SYNC_ACTOR.test(String(entry.by || ""));
}

export function listingActivity(listing) {
  const history = historyOf(listing);
  const created = history.find((entry) => entry.field === "created");
  const posted_at = created?.at || listing.created_at || "";
  const posted_by = historyActorLabel(created?.by || listing.created_by || listing.listing_agent || "", created?.byId || "");
  const edits = history.filter(isDeskEdit).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const edit = edits[0] || null;
  let edited_at = edit?.at || "";
  if (edited_at && posted_at) {
    const postedMs = new Date(posted_at).getTime();
    const editedMs = new Date(edited_at).getTime();
    if (Number.isFinite(postedMs) && Number.isFinite(editedMs) && Math.abs(editedMs - postedMs) < 2000) {
      edited_at = "";
    }
  }
  return {
    id: listing.id,
    reference: listing.reference,
    title: listing.title || "",
    status: listing.status,
    working: WORKING.has(listing.status),
    posted_at,
    posted_by,
    edited_at,
    edited_by: edited_at ? historyActorLabel(edit?.by || "", edit?.byId || "") : "",
  };
}

function laterIso(left, right) {
  if (!left) return right || "";
  if (!right) return left;
  return String(right).localeCompare(String(left)) > 0 ? right : left;
}

export function buildAgentActivity(listings) {
  const people = new Map();
  for (const row of listings || []) {
    const name = String(row.listing_agent || "").trim() || "Unassigned";
    if (!people.has(name)) {
      people.set(name, {
        name,
        ads: 0,
        working: 0,
        last_posted: "",
        last_edited: "",
        listings: [],
      });
    }
    const person = people.get(name);
    const item = listingActivity(row);
    person.ads += 1;
    if (item.working) person.working += 1;
    person.last_posted = laterIso(person.last_posted, item.posted_at);
    person.last_edited = laterIso(person.last_edited, item.edited_at);
    person.listings.push(item);
  }
  for (const person of people.values()) {
    person.listings.sort(
      (a, b) => String(b.posted_at || "").localeCompare(String(a.posted_at || "")) || String(a.reference).localeCompare(String(b.reference))
    );
  }
  return [...people.values()].sort((a, b) => b.ads - a.ads || a.name.localeCompare(b.name));
}

function photoCount(listing) {
  const gallery = Array.isArray(listing.gallery) ? listing.gallery : [];
  return gallery.filter((item) => item && item.kind !== "floorplan").length || (listing.photo ? 1 : 0);
}

function leadMaps(leads) {
  const byRef = new Map();
  const byId = new Map();
  const byAgent = new Map();
  for (const lead of leads) {
    if (lead.reference) byRef.set(lead.reference, (byRef.get(lead.reference) || 0) + 1);
    if (lead.listing_id) byId.set(lead.listing_id, (byId.get(lead.listing_id) || 0) + 1);
    const agent = String(lead.agent_name || "").trim();
    if (agent) byAgent.set(agent, (byAgent.get(agent) || 0) + 1);
  }
  return { byRef, byId, byAgent };
}

function leadsFor(listing, maps) {
  return maps.byId.get(listing.id) || maps.byRef.get(listing.reference) || 0;
}

function card(listing, count) {
  return {
    id: listing.id,
    reference: listing.reference,
    title: listing.title,
    photo: listing.photo,
    listing_agent: listing.listing_agent || "Unassigned",
    community: listing.community,
    score: listing.pf_quality_score === "" ? null : Number(listing.pf_quality_score),
    live: listedOnWebsites(listing, null),
    photos: photoCount(listing),
    leads: count,
  };
}

function avg(nums) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}

function namedLeadTotals(listings, counts, labelOf) {
  const totals = new Map();
  for (const row of listings || []) {
    const count = counts.get(row.id) || 0;
    if (!count) continue;
    const name = labelOf(row);
    if (!name) continue;
    totals.set(name, (totals.get(name) || 0) + count);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function clusterName(row) {
  const match = String(row?.title || "").match(/\b([A-Za-z]+ Cluster)\b/);
  return match ? match[1] : "";
}

function countList(entries) {
  return entries.map(([name, count]) => `${name} (${count})`).join(", ");
}

export function attachLeadCounts(listings, leads) {
  const maps = leadMaps(leads);
  return listings.map((row) => ({ ...row, lead_count: leadsFor(row, maps) }));
}

function shiftYmd(ymd, days) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function topAgentsByLeads(listings, leads, now = Date.now(), days = 30) {
  const byId = new Map();
  const byRef = new Map();
  for (const row of listings || []) {
    byId.set(row.id, row);
    const ref = String(row.reference || "").trim().toLowerCase();
    if (ref && !byRef.has(ref)) byRef.set(ref, row);
  }
  const counts = new Map();
  for (const lead of leadsInKarachiDays(leads, days, now)) {
    const row = (lead.listing_id && byId.get(lead.listing_id))
      || byRef.get(String(lead.reference || "").trim().toLowerCase())
      || null;
    const name = String(row?.listing_agent || lead?.agent_name || "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));
}

function listingLeadRow(row, count, split) {
  const leads = split || { pf: 0, bayut: 0, dubizzle: 0 };
  return {
    id: row.id,
    reference: row.reference,
    count,
    title: row.title || "",
    photo: row.photo || "",
    community: row.community || "",
    beds: row.beds ?? "",
    baths: row.baths ?? "",
    area_sqft: Number(row.area_sqft) || 0,
    price_aed: Number(row.price_aed) || 0,
    purpose: row.purpose || "",
    type: row.type || "",
    agent: row.listing_agent || "",
    pf: leads.pf || 0,
    bayut: leads.bayut || 0,
    dubizzle: leads.dubizzle || 0,
  };
}

export function topListingsByLeads(listings, leads, now = Date.now(), days = 30) {
  const windowLeads = leadsInKarachiDays(leads, days, now);
  const { byId, counts } = countsForListings(listings, windowLeads);
  const byRef = new Map();
  for (const row of listings || []) {
    const ref = String(row.reference || "").trim().toLowerCase();
    if (ref && !byRef.has(ref)) byRef.set(ref, row);
  }
  const split = new Map();
  for (const lead of windowLeads) {
    const row = (lead.listing_id && byId.get(lead.listing_id))
      || byRef.get(String(lead.reference || "").trim().toLowerCase())
      || null;
    if (!row) continue;
    const portal = leadPortal(lead);
    const bucket = split.get(row.id) || { pf: 0, bayut: 0, dubizzle: 0 };
    if (Object.prototype.hasOwnProperty.call(bucket, portal)) bucket[portal] += 1;
    split.set(row.id, bucket);
  }
  return [...counts.entries()]
    .map(([id, count]) => listingLeadRow(byId.get(id), count, split.get(id)))
    .sort((a, b) => b.count - a.count || String(a.reference).localeCompare(String(b.reference)))
    .slice(0, 6);
}

function listedOnWebsites(listing, websiteLive) {
  const gates = ["pf", "bayut", "dubizzle"].map((id) => websiteLive?.[id]).filter((gate) => gate?.ok);
  if (!gates.length) return listing.pf_is_live === "1";
  const ref = String(listing.reference || "").trim().toLowerCase();
  return gates.some((gate) => (gate.refs || []).includes(ref));
}

export function buildOverviewReport(listings, leads, days, websiteLive = null, now = Date.now()) {
  const windowDays = reportDays(days);
  const windowLeads = leadsInKarachiDays(leads, windowDays, now);
  const allMaps = leadMaps(leads);
  const winMaps = leadMaps(windowLeads);
  const { counts } = countsForListings(listings, windowLeads);

  const people = new Map();
  for (const row of listings) {
    const name = String(row.listing_agent || "").trim() || "Unassigned";
    if (!people.has(name)) people.set(name, { name, ads: 0, live: 0, leads_all: 0, leads_window: 0 });
    const person = people.get(name);
    person.ads += 1;
    if (listedOnWebsites(row, websiteLive)) person.live += 1;
  }
  for (const [name, count] of winMaps.byAgent) {
    if (!people.has(name)) people.set(name, { name, ads: 0, live: 0, leads_all: 0, leads_window: 0 });
    people.get(name).leads_window += count;
  }
  for (const [name, count] of allMaps.byAgent) {
    if (!people.has(name)) people.set(name, { name, ads: 0, live: 0, leads_all: 0, leads_window: 0 });
    people.get(name).leads_all += count;
  }

  const ranked = listings
    .map((row) => card(row, counts.get(row.id) || 0))
    .sort((a, b) => b.leads - a.leads || String(a.reference).localeCompare(String(b.reference)));
  const withLeads = ranked.filter((row) => row.leads > 0);
  const highest = withLeads[0] || null;
  const lowest = withLeads.length ? withLeads[withLeads.length - 1] : null;
  const zeroLeads = ranked.filter((row) => row.leads === 0).length;

  const scores = listings
    .filter((row) => row.pf_quality_score !== "")
    .map((row) => ({
      ...card(row, counts.get(row.id) || 0),
      score: Number(row.pf_quality_score),
    }))
    .sort((a, b) => b.score - a.score);

  const high = withLeads.slice(0, 5);
  const low = [...withLeads].reverse().slice(0, 5);
  const reasons = [];
  if (!withLeads.length) {
    reasons.push(`No listing received a lead in the last ${windowDays} days, so a high-vs-low comparison is not possible yet.`);
  } else {
    if (highest) {
      const place = [highest.title, highest.community].filter(Boolean).join(", ");
      reasons.push(
        `${highest.reference} has the most leads (${highest.leads}) in the last ${windowDays} days${place ? `: ${place}` : ""}. Agent ${highest.listing_agent}.`
      );
    }
    const communities = namedLeadTotals(listings, counts, (row) => String(row.community || "").trim());
    if (communities.length) {
      const [first, ...rest] = communities.slice(0, 3);
      reasons.push(
        rest.length
          ? `Most leads in this window are in ${first[0]} (${first[1]}), then ${countList(rest)}.`
          : `Most leads in this window are in ${first[0]} (${first[1]}).`
      );
    }
    const clusters = namedLeadTotals(listings, counts, clusterName).slice(0, 3);
    if (clusters.length) {
      reasons.push(`Inside the listing titles, the most leads are on ${countList(clusters)}.`);
    }
    const highScore = avg(high.map((row) => row.score).filter((n) => n != null && !Number.isNaN(n)));
    const lowScore = avg(low.map((row) => row.score).filter((n) => n != null && !Number.isNaN(n)));
    if (highScore && lowScore && highScore - lowScore >= 8) {
      reasons.push(`Higher PF quality scores line up with more leads (top ads average ${highScore}, lowest ads average ${lowScore}).`);
    }
  }

  return {
    days: windowDays,
    featured_premium: {
      available: false,
      featured: 0,
      premium: 0,
      note: "The Property Finder listings API on this account does not send featured or premium product type. Counts stay 0 rather than guessed.",
    },
    ads_per_person: [...people.values()].sort((a, b) => b.ads - a.ads || a.name.localeCompare(b.name)),
    agent_activity: buildAgentActivity(listings),
    leads_per_person: [...people.values()].sort((a, b) => b.leads_window - a.leads_window || a.name.localeCompare(b.name)),
    leads_per_listing: ranked.slice(0, 25),
    scores: scores.slice(0, 20),
    extremes: {
      highest,
      lowest,
      zero_leads: zeroLeads,
      listings_with_leads: withLeads.length,
    },
    reasons,
    window_leads: windowLeads.length,
  };
}
