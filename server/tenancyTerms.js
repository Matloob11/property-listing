export const DEFAULT_TENANCY_TERMS = [
  "The shop will be used as per developer community rules. Tenant pays any fine. Agency is not responsible for maintenance.",
  "All kinds of maintenance is the responsibility of the Tenant.",
  "Landlord may deduct unpaid utility bills from the security deposit when the tenant vacates.",
  "If any cheque bounces, the Tenant will pay AED 1,000/- penalty to the landlord.",
  "If damage or repair cost exceeds the security deposit, the Tenant will pay the difference in cash.",
  "If there are any such deductions, the landlord will provide bills to the tenant.",
  "Security deposit is refunded on vacating with DEWA clearance. Landlord may deduct proven damage or repair cost.",
  "If the Tenant cancels before expiry, 60 days notice is required and 2 months rent is payable as penalty.",
];

export const VILLA_TENANCY_TERMS = [
  "The villa will be used as per developer community rules. In case of any violation the tenant will be liable to pay the fine. Real Estate is not responsible for any kind of maintenance.",
  "All major maintenance above AED 1,000/- is the Landlord's responsibility. All minor maintenance below AED 1,000/- is the Tenant's responsibility.",
  "The landlord can deduct the payment of utility bills from the security deposit which have not been paid by the Tenant and remaining outstanding at the time of vacating the property/premises.",
  "If any cheque bounces, the Tenant will pay AED 1,000/- fine as penalty to the landlord. If any damage charges or repair work expenses are more than the security deposit amount, the Tenant undertakes to pay the Landlord such difference amount in cash.",
  "If there are any such deductions, the landlord will provide bills to the tenant for the same.",
  "Security deposit will be refunded at the time of vacating the property/premise and presentation of final bills payment clearance letter from DEWA. Landlord has the right to deduct any damage expenses or cost spent on repair works done to the subject property/premise due to the negligence of the tenant during the tenancy period.",
  "If the tenant wants to cancel this contract before expiry, the tenant will give 90 days prior notice to Real Estate or will pay the penalty of 2 months rent to the Landlord.",
];

export const SHOP_TENANCY_TERMS = [
  "The shop will be used as per developer community rules. In case of any violation the tenant will be liable to pay the fine.",
  "The landlord can deduct the payment of utility bills from the security deposit which have not been paid by the Tenant and remaining outstanding at the time of vacating the property/premises.",
  "If any cheque bounces, the Tenant will pay AED 1,000/- fine as penalty to the landlord. If any damage charges or repair work expenses are more than the security deposit amount, the Tenant undertakes to pay the Landlord such difference amount in cash.",
  "Security deposit will be refunded at the time of vacating the property/premise and presentation of final bills payment clearance letter from DEWA during the tenancy period.",
  "If there are any such deductions, the landlord will provide bills to the tenant for the same.",
  "If the tenant wants to cancel this contract before expiry, the tenant will give 90 days prior notice to Real Estate or will pay the penalty of 2 months rent to the Landlord.",
];

export const TENANCY_TERM_PACKS = {
  villa: VILLA_TENANCY_TERMS,
  shop: SHOP_TENANCY_TERMS,
};

export const MAX_TENANCY_TERMS = 20;
export const EJARI_TERM_SLOTS = 8;

function cleanTerm(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeTenancyTerms(value) {
  if (value == null) return [];
  const list = Array.isArray(value)
    ? value
    : typeof value === "object"
      ? Object.keys(value)
          .sort((a, b) => Number(a) - Number(b))
          .map((key) => value[key])
      : [value];
  return list.map(cleanTerm).filter(Boolean).slice(0, MAX_TENANCY_TERMS);
}

export function resolveTenancyTerms(value) {
  if (value == null) return [...DEFAULT_TENANCY_TERMS];
  return normalizeTenancyTerms(value);
}

export function formTenancyTerms(value) {
  if (!Array.isArray(value)) return [...DEFAULT_TENANCY_TERMS];
  return value.map((item) => String(item ?? ""));
}

export function normalizeTermPack(value) {
  const key = String(value || "").toLowerCase().trim();
  return TENANCY_TERM_PACKS[key] ? key : "";
}

export function termsForPack(pack) {
  const key = normalizeTermPack(pack);
  if (key) return [...TENANCY_TERM_PACKS[key]];
  return [...DEFAULT_TENANCY_TERMS];
}

export function packFromPropertyType(type) {
  const text = String(type || "").toLowerCase();
  if (/villa/.test(text)) return "villa";
  if (/shop|retail/.test(text)) return "shop";
  return "";
}

function termsKey(value) {
  return normalizeTenancyTerms(value).join("\n");
}

export function isStockTerms(value) {
  const key = termsKey(value);
  if (!key) return true;
  if (key === termsKey(DEFAULT_TENANCY_TERMS)) return true;
  return Object.values(TENANCY_TERM_PACKS).some((pack) => key === termsKey(pack));
}
