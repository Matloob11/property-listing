/** Shared rollup ordering for Owner Data / Lead / Inventory chips. */

export function isTailRollupLabel(name, id = "") {
  const s = `${name || ""} ${id || ""}`.trim().toLowerCase();
  if (!s) return true;
  return /^(—|-|–|other|empty|empty community|empty source|unknown|n\/?a|na|none|null)(\s|$)/i.test(s)
    || /^(other|empty|unknown|na|none)$/i.test(String(id || "").trim());
}

function bedSortKey(row) {
  const id = String(row?.id ?? "").toLowerCase();
  const name = String(row?.name || "");
  if (id === "na" || id === "none" || isTailRollupLabel(name, id)) return 1000;
  if (id === "studio" || /^studio$/i.test(name.trim())) return 0;
  if (/^\d+$/.test(id)) return Number(id);
  if (/studio/i.test(name)) return 0;
  const m = name.match(/(\d+)/);
  return m ? Number(m[1]) : 500;
}

/**
 * @param {Array<{id?:string,name?:string,count?:number}>} rows
 * @param {{ kind?: "beds" | "types" | "communities" | "default" }} [opts]
 */
export function sortRollupRows(rows, opts = {}) {
  const list = [...(rows || [])];
  const kind = opts.kind || "default";
  if (kind === "beds") {
    return list.sort((a, b) => {
      const aTail = isTailRollupLabel(a.name, a.id);
      const bTail = isTailRollupLabel(b.name, b.id);
      if (aTail !== bTail) return aTail ? 1 : -1;
      return bedSortKey(a) - bedSortKey(b) || String(a.name || "").localeCompare(String(b.name || ""));
    });
  }
  return list.sort((a, b) => {
    const aTail = isTailRollupLabel(a.name, a.id);
    const bTail = isTailRollupLabel(b.name, b.id);
    if (aTail !== bTail) return aTail ? 1 : -1;
    const ac = Number(a.count) || 0;
    const bc = Number(b.count) || 0;
    return bc - ac || String(a.name || "").localeCompare(String(b.name || ""));
  });
}
