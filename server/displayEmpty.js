/** Dashboard labels for missing lead / community / source data. */

export const EMPTY = "Empty";
export const EMPTY_COMMUNITY = "Empty community";
export const EMPTY_SOURCE = "Empty source";

export function isBlankLabel(value) {
  const s = String(value || "").trim();
  if (!s) return true;
  return /^(unknown|unknown\s+(lead|source|community)?|try|empty|no\s*community|n\/?a|none|null|-|—|–)$/i.test(s);
}

export function isBlankCommunity(value) {
  const s = String(value || "").trim();
  if (!s) return true;
  return /^(no\s*community|empty\s*community|unknown|try|n\/?a|none|null|-|—|–)$/i.test(s);
}

export function communityLabel(value) {
  return isBlankCommunity(value) ? EMPTY_COMMUNITY : String(value).trim();
}

export function emptyLabel(value, fallback = EMPTY) {
  return isBlankLabel(value) ? fallback : String(value).trim();
}

export function sourceLabel(value) {
  return isBlankLabel(value) || /^unknown(\s+source)?$/i.test(String(value || "").trim())
    ? EMPTY_SOURCE
    : String(value).trim();
}
