function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function scopeItems(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((row) => row.replace(/^[•\-\u2022]\s*/, "").trim())
    .filter(Boolean);
}

export function derivedWorkType(data) {
  const typed = clean(data?.workType).replace(/^NOC for\s+/i, "");
  if (typed) return typed;
  const items = scopeItems(data?.scopeText);
  if (!items.length) return "AC Maintenance";
  if (items.every((item) => /\bAC\b|air\s*cond/i.test(item))) return "AC Maintenance";
  if (items.length === 1) return items[0].replace(/:.*$/, "").trim();
  return "Maintenance";
}

export function maintLetterModel(data) {
  const work = derivedWorkType(data);
  const owner = clean(data?.ownerName);
  const company = clean(data?.companyName);
  const license = clean(data?.tradeLicense);
  const companyBit = company && license ? `${company} LICENSE NO: ${license}` : company;
  const workPhrase = /^ac\b/i.test(work) ? "AC maintenance" : work.toLowerCase();
  return {
    title: `NOC for ${work}`,
    recipient: clean(data?.recipient),
    ref: `NO OBJECTION FOR ${work.toUpperCase()}`,
    propertyRef: clean(data?.propertyDetails),
    owner,
    companyBit,
    workPhrase,
  };
}
