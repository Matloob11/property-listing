import { isBalanceError } from "./openaiAlert.js";
import { communityArabic, typeArabic } from "./deedArabic.js";

function openaiKeys() {
  const front = String(process.env.OPENAI_API_KEY || "").trim();
  const backup = String(process.env.OPENAI_API_KEY_BACKUP || "").trim();
  return [front, backup].filter(Boolean);
}

function isRetryableKeyError(status, bodyText) {
  if ([401, 403, 429].includes(status)) return true;
  return /insufficient_quota|billing|credit|rate_limit|invalid_api_key|account_deactivated/i.test(bodyText);
}

function raw(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function copyText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pretty(value) {
  return raw(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function money(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "";
}

function aed(value) {
  const n = money(value);
  return n ? `AED ${Number(n).toLocaleString("en-US")}` : "";
}

export function listingFacts(input) {
  const src = input && typeof input === "object" ? input : {};
  const amenities = Array.isArray(src.amenities)
    ? [...new Set(src.amenities.map((item) => pretty(item)).filter(Boolean))]
    : [];
  const period = raw(src.price_period);
  const rent =
    money(src[`price_${period}`]) ||
    money(src.price_yearly) ||
    money(src.price_monthly) ||
    money(src.price_weekly) ||
    money(src.price_daily) ||
    (raw(src.purpose) === "sale" ? "" : money(src.price_aed));
  return {
    category: raw(src.category),
    type: pretty(src.type) || (raw(src.category) === "commercial" ? "Commercial property" : "Property"),
    purpose: raw(src.purpose) === "sale" ? "sale" : "rent",
    beds: raw(src.beds),
    baths: raw(src.baths),
    parking: raw(src.parking),
    furnished: pretty(src.furnished),
    area_sqft: raw(src.area_sqft),
    city: pretty(src.city) || "Dubai",
    community: pretty(src.community),
    sub_community: pretty(src.sub_community),
    building: pretty(src.building),
    project_name: pretty(src.project_name),
    unit_no: raw(src.unit_no),
    layout_type: pretty(src.layout_type),
    developer: pretty(src.developer),
    cheques: raw(src.cheques),
    amenities,
    rent,
    sale_price: money(src.sale_price) || (raw(src.purpose) === "sale" ? money(src.price_aed) : ""),
    price_period: period || (raw(src.purpose) === "sale" ? "" : "yearly"),
  };
}

export function missingCopyFacts(facts) {
  if (!facts.type) return "Add the property type first.";
  if (!facts.community && !facts.city && !facts.building && !facts.project_name) {
    return "Add community, city, or building first.";
  }
  return "";
}

function placeOf(facts) {
  return [facts.community, facts.sub_community, facts.building || facts.project_name, facts.city]
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((row) => row.toLowerCase() === item.toLowerCase()) === index)
    .join(", ");
}

function shortPlace(facts) {
  return facts.community || facts.building || facts.project_name || facts.city || "Dubai";
}

function typeLabel(facts) {
  return facts.type || "property";
}

function headOf(facts) {
  const type = typeLabel(facts).toLowerCase();
  const beds = Number(facts.beds);
  if (Number.isFinite(beds) && beds > 0) return `${beds} bedroom ${type}`;
  return type;
}

function offerOf(facts) {
  return facts.purpose === "sale" ? "for sale" : "for rent";
}

function priceLine(facts) {
  if (facts.purpose === "sale" && facts.sale_price) return `${aed(facts.sale_price)}`;
  if (facts.rent) {
    const period = facts.price_period ? ` per ${facts.price_period.replace(/ly$/, "")}` : "";
    return `${aed(facts.rent)}${period === " per year" ? " per year" : facts.price_period ? ` ${facts.price_period}` : ""}`;
  }
  return "";
}

function detailLines(facts) {
  const lines = [];
  const beds = Number(facts.beds);
  const baths = Number(facts.baths);
  const parking = Number(facts.parking);
  if (Number.isFinite(beds) && beds > 0) lines.push(`${beds} Bedroom${beds === 1 ? "" : "s"}`);
  if (Number.isFinite(baths) && baths > 0) lines.push(`${baths} Bathroom${baths === 1 ? "" : "s"}`);
  if (facts.area_sqft) lines.push(`${facts.area_sqft} sq ft`);
  if (facts.layout_type) lines.push(facts.layout_type);
  if (facts.furnished) lines.push(facts.furnished);
  if (Number.isFinite(parking) && parking > 0) lines.push(`${parking} Parking`);
  if (facts.unit_no) lines.push(`Property No. ${facts.unit_no}`);
  if (facts.developer) lines.push(`Developer: ${facts.developer}`);
  if (facts.cheques) lines.push(`${facts.cheques} cheque${facts.cheques === "1" ? "" : "s"}`);
  for (const item of facts.amenities) lines.push(item);
  const loc = [facts.community, facts.sub_community, facts.city].filter(Boolean).join(", ");
  if (loc) lines.push(`Located in ${loc}`);
  const price = priceLine(facts);
  if (price) lines.push(facts.purpose === "sale" ? `Asking price ${price}` : `Asking rent ${price}`);
  return lines;
}

function secondParagraph(facts) {
  const bits = [];
  bits.push(`This ${typeLabel(facts).toLowerCase()} ${offerOf(facts)} is listed with the details below`);
  const loc = shortPlace(facts);
  if (loc) bits.push(`in ${loc}`);
  const extra = [];
  const beds = Number(facts.beds);
  const baths = Number(facts.baths);
  if (Number.isFinite(beds) && beds > 0) extra.push(`${beds} bedroom${beds === 1 ? "" : "s"}`);
  if (Number.isFinite(baths) && baths > 0) extra.push(`${baths} bathroom${baths === 1 ? "" : "s"}`);
  if (facts.area_sqft) extra.push(`${facts.area_sqft} sq ft`);
  if (facts.furnished) extra.push(facts.furnished.toLowerCase());
  if (facts.layout_type) extra.push(facts.layout_type.toLowerCase());
  let text = `${bits.join(" ")}.`;
  if (extra.length) text += ` It has ${extra.join(", ")}.`;
  if (facts.amenities.length) text += ` Amenities on this listing: ${facts.amenities.join(", ")}.`;
  return text;
}

function aboutParagraphs(facts) {
  const name = shortPlace(facts);
  const lines = [];
  const locBits = [facts.community, facts.sub_community, facts.building || facts.project_name, facts.city].filter(Boolean);
  lines.push(`This listing is in ${locBits.join(", ")}.`);
  const more = [];
  if (facts.building && facts.community) more.push(`Building / cluster: ${facts.building}.`);
  if (facts.project_name && facts.project_name !== facts.building) more.push(`Project: ${facts.project_name}.`);
  if (facts.developer) more.push(`Developer: ${facts.developer}.`);
  if (facts.amenities.length) more.push(`Amenities recorded on the listing: ${facts.amenities.join(", ")}.`);
  if (more.length) lines.push(more.join(" "));
  return { name, lines };
}

export function buildEnglishCopy(facts) {
  const head = headOf(facts);
  const place = placeOf(facts);
  const title = pretty(`${head} ${offerOf(facts)} in ${shortPlace(facts)}`).slice(0, 90);
  const details = detailLines(facts);
  const about = aboutParagraphs(facts);
  const price = priceLine(facts);
  const close = [
    `This ${head} in ${place} is listed ${offerOf(facts)}`,
    price ? ` at ${price}` : "",
    ".",
  ].join("");

  const description = [
    `A7 Group Real Estate is pleased to present this ${head} located in ${place}.`,
    "",
    secondParagraph(facts),
    "",
    "Property Details:",
    "",
    details.join("\n"),
    "",
    `About ${about.name}:`,
    "",
    about.lines.join("\n\n"),
    "",
    close,
    "",
    "For more information, property details, or to arrange a viewing, contact A7 Group Real Estate.",
  ].join("\n");

  return { title, description };
}

function buildArabicCopy(facts, english) {
  const typeAr = typeArabic(facts.type) || facts.type;
  const communityAr = communityArabic(facts.community) || facts.community;
  const cityAr = communityArabic(facts.city) || facts.city || "دبي";
  const placeAr = [communityAr, facts.sub_community, facts.building || facts.project_name, cityAr]
    .filter(Boolean)
    .join("، ");
  const shortAr = communityAr || facts.building || facts.project_name || cityAr;
  const beds = Number(facts.beds);
  const headAr = Number.isFinite(beds) && beds > 0 ? `${typeAr} ${beds} غرف` : typeAr;
  const offerAr = facts.purpose === "sale" ? "للبيع" : "للإيجار";
  const title = `${headAr} ${offerAr} في ${shortAr}`.slice(0, 90);
  const details = [];
  if (Number.isFinite(beds) && beds > 0) details.push(`${beds} غرف نوم`);
  if (Number(facts.baths) > 0) details.push(`${facts.baths} حمام`);
  if (facts.area_sqft) details.push(`${facts.area_sqft} قدم مربع`);
  if (facts.furnished) details.push(facts.furnished);
  if (facts.layout_type) details.push(facts.layout_type);
  if (Number(facts.parking) > 0) details.push(`${facts.parking} موقف`);
  if (facts.unit_no) details.push(`رقم العقار ${facts.unit_no}`);
  if (facts.developer) details.push(`المطور: ${facts.developer}`);
  for (const item of facts.amenities) details.push(item);
  if (placeAr) details.push(`الموقع: ${placeAr}`);
  const price = priceLine(facts);
  if (price) details.push(facts.purpose === "sale" ? `سعر الطلب ${price}` : `الإيجار ${price}`);

  const description = [
    `تسر مجموعة A7 العقارية أن تقدم هذا ${headAr} الواقع في ${placeAr}.`,
    "",
    `هذا ${typeAr} مدرج ${offerAr} وفق بيانات هذه القائمة فقط.`,
    "",
    "تفاصيل العقار:",
    "",
    details.join("\n"),
    "",
    `عن ${shortAr}:`,
    "",
    `هذه القائمة في ${placeAr}.`,
    facts.amenities.length ? `\nالمرافق المسجلة: ${facts.amenities.join("، ")}.` : "",
    "",
    `هذا ${headAr} في ${placeAr} مدرج ${offerAr}${price ? ` بسعر ${price}` : ""}.`,
    "",
    "لمزيد من المعلومات أو لتفاصيل العقار أو لترتيب معاينة، تواصل مع مجموعة A7 العقارية.",
  ]
    .filter((row) => row !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { title_ar: title, description_ar: copyText(description) || copyText(english.description) };
}

async function translateArabic(apiKey, english) {
  const prompt = [
    "Translate this A7 listing title and description into Modern Standard Arabic.",
    "Return JSON: { title_ar, description_ar }.",
    "Keep the same sections and line breaks. Do not add amenities, places, prices, or sentences that are not in the English text.",
    `Title: ${english.title}`,
    `Description:\n${english.description}`,
  ].join("\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function generateListingCopy(input) {
  const facts = listingFacts(input);
  const missing = missingCopyFacts(facts);
  if (missing) return { ok: false, error: missing };

  const english = buildEnglishCopy(facts);
  const fallbackAr = buildArabicCopy(facts, english);
  const data = { ...english, ...fallbackAr };

  const keys = openaiKeys();
  if (!keys.length) return { ok: true, data };

  let frontKeyLow = false;
  let frontKeyReason = "";
  for (let i = 0; i < keys.length; i += 1) {
    const used = i === 0 ? "front" : "backup";
    const result = await translateArabic(keys[i], english);
    if (!result.ok) {
      if (i === 0 && isBalanceError(result.status, result.text)) {
        frontKeyLow = true;
        frontKeyReason = `${result.status}`;
      }
      if (isRetryableKeyError(result.status, result.text) && i < keys.length - 1) continue;
      return { ok: true, data, usedKey: used, frontKeyLow, frontKeyReason };
    }
    try {
      const body = JSON.parse(result.text);
      const content = body?.choices?.[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      const title_ar = raw(parsed?.title_ar).slice(0, 90);
      const description_ar = copyText(parsed?.description_ar).slice(0, 4500);
      if (/[\u0600-\u06FF]/.test(title_ar) && /[\u0600-\u06FF]/.test(description_ar)) {
        data.title_ar = title_ar;
        data.description_ar = description_ar;
      }
    } catch {
      /* keep template Arabic */
    }
    return { ok: true, data, usedKey: used, frontKeyLow, frontKeyReason };
  }
  return { ok: true, data, frontKeyLow, frontKeyReason };
}
