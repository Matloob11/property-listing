import { sqmFromSqft } from "./noc.js";
import { isBalanceError } from "./openaiAlert.js";
import { prettyPropertyType, usageFromPropertyType } from "./tenancyProperty.js";

const EXTRACT_KEYS = [
  "tenantName",
  "tenantEmail",
  "tenantPhone",
  "landlordName",
  "landlordEmail",
  "landlordPhone",
  "usage",
  "location",
  "building",
  "propertyNo",
  "propertyType",
  "size",
  "plotNo",
  "dewaNo",
  "contractDate",
  "dateFrom",
  "dateTo",
  "annualRent",
  "contractValue",
  "deposit",
  "paymentMode",
];

const TITLE_DEED_KEYS = new Set([
  "landlordName",
  "landlordEmail",
  "landlordPhone",
  "location",
  "building",
  "propertyNo",
  "propertyType",
  "size",
  "plotNo",
  "usage",
]);

const TENANCY_KEYS = new Set(EXTRACT_KEYS);

const FIELD_ALIASES = {
  tenantName: ["tenantName", "tenant", "lessee", "tenant_name"],
  tenantEmail: ["tenantEmail", "tenant_email"],
  tenantPhone: ["tenantPhone", "tenant_phone"],
  landlordName: ["landlordName", "landlord", "ownerName", "owner", "lessor", "ownersNumbers", "owner_name"],
  landlordEmail: ["landlordEmail", "ownerEmail", "landlord_email"],
  landlordPhone: ["landlordPhone", "ownerPhone", "landlord_phone"],
  usage: ["usage"],
  location: ["location", "community", "communityName", "area"],
  building: ["building", "buildingName", "buildingNo", "buildingNumber", "building_name"],
  propertyNo: ["propertyNo", "propertyNumber", "unitNo", "unitNumber", "suite", "unit", "property_no"],
  propertyType: ["propertyType", "titleDeedPropertyType", "propertyKind", "type"],
  size: ["size", "plotAreaSqm", "suiteArea", "areaSqm", "suiteAreaSqm", "area_sqm"],
  plotNo: ["plotNo", "plotNumber", "plot"],
  dewaNo: ["dewaNo", "dewa", "premisesNo"],
  contractDate: ["contractDate", "contract_date"],
  dateFrom: ["dateFrom", "startDate", "from"],
  dateTo: ["dateTo", "endDate", "to"],
  annualRent: ["annualRent", "rent", "yearlyRent"],
  contractValue: ["contractValue", "contract_value"],
  deposit: ["deposit", "securityDeposit"],
  paymentMode: ["paymentMode", "payment"],
};

const PAY_OK = new Set(["01 cheque", "02 cheques", "03 cheques", "04 cheques", "06 cheques", "12 cheques", "Cash / transfer"]);

const PAY_MAP = [
  [/12\s*cheque/i, "12 cheques"],
  [/6\s*cheque|06\s*cheque/i, "06 cheques"],
  [/4\s*cheque|04\s*cheque|quarter/i, "04 cheques"],
  [/3\s*cheque|03\s*cheque/i, "03 cheques"],
  [/2\s*cheque|02\s*cheque/i, "02 cheques"],
  [/1\s*cheque|01\s*cheque|single cheque/i, "01 cheque"],
  [/cash|transfer|bank/i, "Cash / transfer"],
];

const JUNK = [
  /title deed|شهادة ملكية|صك ملكية|dubai land department|دائرة الأراضي/i,
  /owners numbers|purchased from|approved signature|expo 2020/i,
  /blockchain|electronically issued|makes it void|fold this certificate/i,
  /^(tenant|landlord|owner|lessor|lessee|name|email|phone|date|rent|deposit)$/i,
  /unified tenancy|ejari contract|real estate broker/i,
];

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

function stripDeedNoise(value) {
  return raw(value)
    .replace(/\b(title\s*deed|شهادة ملكية|صك ملكية|dubai land department|دائرة الأراضي)\b/gi, " ")
    .replace(/\s*[—–,:|/-]+\s*$/g, "")
    .replace(/^\s*[—–,:|/-]+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isJunk(value) {
  const text = stripDeedNoise(value);
  if (!text) return true;
  return JUNK.some((re) => re.test(text));
}

function validDate(value) {
  const iso = toIsoDate(value);
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (y < 2000 || y > 2035) return "";
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return iso;
}

function toIsoDate(value) {
  const text = raw(value);
  if (!text) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (!dmy) return "";
  return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

function moneyInRange(value, min, max) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < min || n > max) return "";
  return String(Math.round(n * 100) / 100);
}

function validName(value) {
  const text = raw(value);
  if (text.length < 2 || text.length > 120 || isJunk(text)) return "";
  if (!/[A-Za-z\u0600-\u06FF]/.test(text)) return "";
  if (/^\d+$/.test(text)) return "";
  if ((text.match(/ /g) || []).length > 12) return "";
  return text;
}

function validEmail(value) {
  const text = raw(value).toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(text)) return "";
  if (isJunk(text)) return "";
  return text;
}

function validPhone(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return raw(value);
}

function validPlace(value) {
  const text = raw(value);
  if (text.length < 2 || text.length > 120 || isJunk(text)) return "";
  if (/^(dubai|uae|u\.a\.e|emirates|united arab emirates)$/i.test(text)) return "";
  return text;
}

function validCode(value, min, max) {
  const text = raw(value);
  if (text.length < min || text.length > max || isJunk(text)) return "";
  if (!/[A-Za-z0-9]/.test(text)) return "";
  return text;
}

function validType(value) {
  const text = raw(value);
  if (!text || isJunk(text)) return "";
  const pretty = prettyPropertyType(text);
  return pretty && pretty.length <= 40 ? pretty : "";
}

function validUsage(value) {
  const text = raw(value);
  if (/^resid/i.test(text)) return "Residential";
  if (/^indus/i.test(text)) return "Industrial";
  if (/^comm/i.test(text)) return "Commercial";
  return "";
}

function validPay(value) {
  const text = raw(value);
  for (const [re, label] of PAY_MAP) {
    if (re.test(text)) return label;
  }
  return PAY_OK.has(text) ? text : "";
}

function docType(value) {
  const text = raw(value).toLowerCase();
  if (/title|deed|ملكية|ownership/.test(text)) return "title_deed";
  if (/tenancy|ejari|lease|ايجار/.test(text)) return "tenancy";
  return "other";
}

function fieldValue(entry, minConf = 0.4) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const confidence = Number(entry.confidence);
    if (Number.isFinite(confidence) && confidence < minConf) return "";
    return stripDeedNoise(entry.value);
  }
  return stripDeedNoise(entry);
}

function look(bag, names) {
  if (!bag || typeof bag !== "object") return "";
  for (const name of names) {
    if (bag[name] != null && bag[name] !== "") return bag[name];
  }
  const folded = {};
  for (const [key, value] of Object.entries(bag)) {
    folded[String(key).toLowerCase().replace(/[\s_-]+/g, "")] = value;
  }
  for (const name of names) {
    const hit = folded[name.toLowerCase().replace(/[\s_-]+/g, "")];
    if (hit != null && hit !== "") return hit;
  }
  return "";
}

function pickAllowed(kind) {
  if (kind === "title_deed") return TITLE_DEED_KEYS;
  if (kind === "tenancy") return TENANCY_KEYS;
  return TENANCY_KEYS;
}

function cleanExtracted(input) {
  const src = input && typeof input === "object" ? input : {};
  const kind = docType(src.documentType || src.docType || src.type);
  const bag = src.fields && typeof src.fields === "object" ? src.fields : src;
  const allowed = pickAllowed(kind);
  const minConf = kind === "title_deed" ? 0.25 : 0.4;
  const data = {};

  const take = (key, clean) => {
    if (!allowed.has(key)) return;
    const value = clean(fieldValue(look(bag, FIELD_ALIASES[key] || [key]), minConf));
    if (value) data[key] = value;
  };

  take("tenantName", validName);
  take("landlordName", validName);
  take("tenantEmail", validEmail);
  take("landlordEmail", validEmail);
  take("tenantPhone", validPhone);
  take("landlordPhone", validPhone);
  take("usage", validUsage);
  take("location", validPlace);
  take("building", (v) => validPlace(v) || validCode(v, 1, 40));
  take("propertyNo", (v) => validCode(v, 1, 24));
  take("propertyType", validType);
  take("size", (v) => moneyInRange(v, 3, 200000));
  take("plotNo", (v) => validCode(v, 1, 20));
  take("dewaNo", (v) => validCode(v, 5, 24));
  take("contractDate", validDate);
  take("dateFrom", validDate);
  take("dateTo", validDate);
  take("annualRent", (v) => moneyInRange(v, 1000, 100000000));
  take("contractValue", (v) => moneyInRange(v, 1000, 100000000));
  take("deposit", (v) => moneyInRange(v, 100, 20000000));
  take("paymentMode", validPay);

  if (!data.size && allowed.has("size")) {
    const sqft = moneyInRange(fieldValue(look(bag, ["plotAreaSqft", "areaSqft", "suiteAreaSqft"]), minConf), 20, 2000000);
    if (sqft) data.size = sqmFromSqft(sqft);
  }

  if (!data.usage && data.propertyType) {
    data.usage = usageFromPropertyType(data.propertyType);
  }
  if (data.dateFrom && data.dateTo && data.dateFrom > data.dateTo) {
    delete data.dateTo;
  }
  if (data.tenantName && data.landlordName && data.tenantName.toLowerCase() === data.landlordName.toLowerCase()) {
    if (kind !== "tenancy") delete data.tenantName;
  }
  return data;
}

function sectionHint(section) {
  const key = String(section || "").toLowerCase();
  const extra =
    key === "property"
      ? "The user opened the property / title-deed slot. Still fill every related field printed on this paper."
      : key === "tenant"
        ? "The user opened the tenant slot. Still fill every related field printed on this paper."
        : key === "owner"
          ? "The user opened the owner slot. Still fill every related field printed on this paper."
          : key === "rent"
            ? "The user opened the rent slot. Still fill every related field printed on this paper."
            : "";
  return [
    extra,
    "Whatever this file is (Emirates ID, title deed, tenancy, Ejari, or other), fill EVERY related tenancy-form field that is actually printed.",
    "Do not leave a visible related field empty. Do not invent missing numbers, emails, or dates.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function callOpenAi(apiKey, image, section) {
  const prompt = [
    "Read this Dubai property photo and fill EVERY related tenancy-form field you can see.",
    "Return JSON: { documentType, fields }.",
    "documentType must be one of: tenancy, title_deed, other.",
    "fields keys:",
    EXTRACT_KEYS.join(", "),
    "Each field is { value, confidence } where confidence is 0 to 1.",
    "Rules:",
    "- Fetch all related details. Labels do not need to match the form exactly.",
    "- Map synonyms: owner/lessor/owners numbers = landlordName. tenant/lessee = tenantName.",
    "- Community / area / الورسان = location. Building name / Building No = building. Property No / unit / suite = propertyNo.",
    "- Plot No = plotNo. Property Type / Shop / محل / Villa = propertyType. Suite Area / Area sq Meter = size (sq metres).",
    "- Emails and phones of tenant or owner go into the matching email/phone fields.",
    "- Title Deed / شهادة ملكية: documentType title_deed. Fill owner + property details. Do not invent tenant, rent, deposit, payment, or lease dates. Issue Date is not a tenancy date.",
    "- Tenancy / Ejari: documentType tenancy. Fill every related field that is readable (names, contacts, property, dates, rent, deposit, payment).",
    "- Leave a field empty only if it is not on the paper. Do not invent missing numbers or emails.",
    "- Dates YYYY-MM-DD. Money and size are numbers only.",
    sectionHint(section),
  ].filter(Boolean).join("\n");

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
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data}`, detail: "high" } },
          ],
        },
      ],
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function extractTenancyFromImage(image, options = {}) {
  const keys = openaiKeys();
  if (!keys.length) {
    return { ok: false, error: "OpenAI keys are not set in .env." };
  }

  let lastError = "Could not read the photo.";
  let frontKeyLow = false;
  let frontKeyReason = "";
  for (let i = 0; i < keys.length; i += 1) {
    const used = i === 0 ? "front" : "backup";
    const result = await callOpenAi(keys[i], image, options.section);
    if (!result.ok) {
      lastError = `OpenAI ${used} key failed (${result.status}).`;
      if (i === 0 && isBalanceError(result.status, result.text)) {
        frontKeyLow = true;
        frontKeyReason = `${result.status}`;
      }
      if (isRetryableKeyError(result.status, result.text) && i < keys.length - 1) continue;
      return { ok: false, error: lastError, frontKeyLow, frontKeyReason };
    }
    let parsed;
    try {
      const body = JSON.parse(result.text);
      const content = body?.choices?.[0]?.message?.content;
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      return { ok: false, error: "The photo was read but the result was not usable. Try a clearer picture.", frontKeyLow, frontKeyReason };
    }
    const data = cleanExtracted(parsed);
    if (!Object.keys(data).length) {
      return { ok: false, error: "No matching tenancy fields were found in this picture.", frontKeyLow, frontKeyReason };
    }
    return { ok: true, data, usedKey: used, fields: Object.keys(data), frontKeyLow, frontKeyReason };
  }
  return { ok: false, error: lastError, frontKeyLow, frontKeyReason };
}

export function readImagePayload(body) {
  const rawData = String(body?.image || body?.data || "").trim();
  const mime = String(body?.mime || "").trim().toLowerCase();
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(rawData);
  const data = match ? match[2].replace(/\s+/g, "") : rawData.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  const type = match ? match[1].toLowerCase() : mime || "image/jpeg";
  if (!data || data.length < 80) return { error: "Upload a photo or PDF of the contract or title deed." };
  if (!/^image\/(jpeg|jpg|png|webp)$/.test(type)) return { error: "Use a JPG, PNG, WEBP, or PDF." };
  if (data.length > 12_000_000) return { error: "This photo is too large. Use a smaller picture." };
  return { mime: type === "image/jpg" ? "image/jpeg" : type, data };
}

export { cleanExtracted };
