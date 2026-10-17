const TEXT_FIELDS = ["city", "community", "sub_community", "building", "unit_no", "purpose", "type", "category"];
const NUM_FIELDS = ["beds", "baths", "area_sqft"];

export function normText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normNum(value) {
  if (value === "" || value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

export function normPermit(listing) {
  return String(listing?.permit_number || listing?.dtcm_permit || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function propertyIdentity(listing) {
  const out = {};
  for (const field of TEXT_FIELDS) out[field] = normText(listing?.[field]);
  for (const field of NUM_FIELDS) out[field] = normNum(listing?.[field]);
  out.permit = normPermit(listing);
  return out;
}

export function hasExactIdentity(identity) {
  return Boolean(
    (identity.unit_no || identity.permit) &&
      identity.city &&
      identity.community &&
      identity.purpose &&
      identity.type
  );
}

export function sameProperty(left, right) {
  const a = propertyIdentity(left);
  const b = propertyIdentity(right);
  if (!hasExactIdentity(a) || !hasExactIdentity(b)) return false;
  return Object.keys(a).every((key) => a[key] === b[key]);
}

export function occupiesSlot(row) {
  const status = String(row?.status || "");
  if (status === "archived" || status === "duplicate" || status === "pocket") return false;
  return status === "live" || status === "pending" || row?.pf_is_live === "1" || row?.pf_state === "live";
}

export function findExactDuplicate(listing, rows) {
  const self = String(listing?.id || "");
  if (!hasExactIdentity(propertyIdentity(listing))) return null;
  return (
    (rows || []).find((row) => {
      if (!row || (self && String(row.id) === self)) return false;
      if (!occupiesSlot(row)) return false;
      return sameProperty(listing, row);
    }) || null
  );
}

export function listingDuplicateError(listing, rows) {
  const hit = findExactDuplicate(listing, rows);
  if (!hit) return "";
  return `Possible duplicate listing found: ${hit.reference || hit.id}. This property is already uploaded.`;
}
