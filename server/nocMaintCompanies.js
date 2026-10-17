export const MAINT_COMPANIES = [
  { name: "RUKEN AL MARHABHA TECHNOLOGICAL SERVICES", license: "10096470" },
  { name: "TAREEQ AL FOUZ TECHNICAL SERVICES L.L.C", license: "64692300" },
  { name: "MUHAMMAD UMAR BUILDING MATERIALS TRADING - FZE", license: "12204355" },
];

function companyKey(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findMaintCompany(name) {
  const key = companyKey(name);
  if (!key) return null;
  return MAINT_COMPANIES.find((row) => companyKey(row.name) === key) || null;
}

export function licenseForCompany(name) {
  return findMaintCompany(name)?.license || "";
}
