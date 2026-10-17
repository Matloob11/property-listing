export const PHOTO_SECTION_KEYS = {
  tenant: ["tenantName", "tenantEmail", "tenantPhone"],
  owner: ["landlordName", "landlordEmail", "landlordPhone"],
  property: ["usage", "location", "building", "propertyNo", "propertyType", "size", "plotNo", "dewaNo"],
  rent: ["contractDate", "dateFrom", "dateTo", "annualRent", "contractValue", "deposit", "commission", "ejariFee", "paymentMode"],
};

export const ALL_PHOTO_KEYS = [...new Set(Object.values(PHOTO_SECTION_KEYS).flat())];

export const OWNER_KEYS = PHOTO_SECTION_KEYS.owner;
export const TENANT_KEYS = PHOTO_SECTION_KEYS.tenant;

export function keepUserValue(current, incoming) {
  const typed = String(current ?? "").trim();
  if (typed) return typed;
  return String(incoming ?? "").trim();
}

export function relatedFormFields(data) {
  const next = {};
  for (const key of ALL_PHOTO_KEYS) {
    const value = String(data?.[key] ?? "").trim();
    if (value) next[key] = value;
  }
  return next;
}

export function applyRelatedFields(form, data, section = "") {
  const incoming = relatedFormFields(data);
  const next = { ...(form || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    const lockOwner = OWNER_KEYS.includes(key) && section !== "owner";
    const lockTenant = TENANT_KEYS.includes(key) && section !== "tenant";
    next[key] = lockOwner || lockTenant ? keepUserValue(form?.[key], value) : value;
  }
  return next;
}
