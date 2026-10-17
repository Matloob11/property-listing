import { listingIsLiveOnPortal } from "./listingModel.js";

const LIVE_PORTALS = ["pf", "bayut", "dubizzle"];

function text(value) {
  return String(value || "").trim();
}

function prettyType(value) {
  const raw = text(value);
  if (!raw) return "Empty type";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function listingAdFact(row) {
  const purpose = row?.purpose === "rent" || row?.purpose === "sale" ? row.purpose : "empty";
  const community = text(row?.community);
  const cluster = text(row?.sub_community);
  const agent = text(row?.listing_agent || row?.listing_owner);
  const typeId = text(row?.type) || "empty";
  const bedsRaw = row?.beds;
  const bedsNum = Number(bedsRaw);
  let bedsId = "empty";
  let bedsName = "Empty beds";
  if (bedsRaw !== "" && bedsRaw != null && Number.isFinite(bedsNum)) {
    if (bedsNum <= 0) {
      bedsId = "0";
      bedsName = "Studio";
    } else {
      bedsId = String(bedsNum);
      bedsName = bedsNum === 1 ? "1 Bedroom" : `${bedsNum} Bedroom`;
    }
  }
  return {
    purpose,
    communityId: community.toLowerCase() || "empty",
    community: community || "Empty community",
    clusterId: cluster.toLowerCase() || "empty",
    cluster: cluster || "Empty cluster",
    bedsId,
    bedsName,
    typeId,
    typeName: prettyType(typeId === "empty" ? "" : typeId),
    agentId: agent.toLowerCase() || "empty",
    agent: agent || "Empty agent",
  };
}

export function listingIsOnLivePortal(row, websiteLive = null) {
  return LIVE_PORTALS.some((id) => listingIsLiveOnPortal(row, id, websiteLive));
}

export function listingAdFacts(rows, websiteLive = null) {
  const source = websiteLive ? (rows || []).filter((row) => listingIsOnLivePortal(row, websiteLive)) : rows || [];
  return source.map(listingAdFact);
}

export function adFactMatches(fact, box, picks = {}, skip = "") {
  if (box === "sale" && fact.purpose !== "sale") return false;
  if (box === "rent" && fact.purpose !== "rent") return false;
  if (box === "both" && fact.purpose !== "sale" && fact.purpose !== "rent") return false;
  if (skip !== "purpose" && picks.purpose && fact.purpose !== picks.purpose) return false;
  if (skip !== "community" && picks.community && fact.communityId !== picks.community) return false;
  if (skip !== "cluster" && picks.cluster && fact.clusterId !== picks.cluster) return false;
  if (skip !== "beds" && picks.beds && fact.bedsId !== picks.beds) return false;
  if (skip !== "type" && picks.type && fact.typeId !== picks.type) return false;
  if (skip !== "agent" && picks.agent && fact.agentId !== picks.agent) return false;
  return true;
}

export function countAdFacts(facts, box, picks, dim, idKey, nameKey) {
  const map = new Map();
  for (const fact of facts || []) {
    if (!adFactMatches(fact, box, picks, dim)) continue;
    const id = fact[idKey];
    const name = fact[nameKey];
    const prev = map.get(id) || { id, name, count: 0 };
    prev.count += 1;
    if (name && !/^empty /i.test(name)) prev.name = name;
    map.set(id, prev);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
