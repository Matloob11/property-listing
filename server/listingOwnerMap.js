/** One reference must point at one listing owner. Blank owners are left out. */
export function collapseOwnerRefs(rows) {
  const map = new Map();
  const ambiguous = new Set();
  for (const row of rows || []) {
    const ref = String(row?.reference || row?.ref || "").trim().toLowerCase();
    const owner = String(row?.owner || row?.listing_owner || "").trim();
    if (!ref || !owner) continue;
    if (ambiguous.has(ref)) continue;
    const prev = map.get(ref);
    if (prev && prev !== owner) {
      ambiguous.add(ref);
      map.delete(ref);
      continue;
    }
    map.set(ref, owner);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ref, owner]) => ({ ref, owner }));
}
