export const LIVE_GO_PORTALS = [
  { id: "pf", name: "Property Finder" },
  { id: "bayut", name: "Bayut" },
  { id: "dubizzle", name: "Dubizzle" },
];

export const LIVE_GO_IDS = new Set(LIVE_GO_PORTALS.map((item) => item.id));

export function withLiveGoPortals(portals, id, on) {
  if (!LIVE_GO_IDS.has(id)) return [...(portals || [])];
  const extra = (portals || []).filter((item) => !LIVE_GO_IDS.has(item));
  const live = new Set((portals || []).filter((item) => LIVE_GO_IDS.has(item)));
  if (on) live.add(id);
  else live.delete(id);
  return [...LIVE_GO_PORTALS.map((item) => item.id).filter((item) => live.has(item)), ...extra];
}
