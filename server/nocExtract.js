import { isBalanceError } from "./openaiAlert.js";
import { formatNocDate, prettyType, propertyKindFromType, sqftFromSqm, sqmFromSqft } from "./noc.js";
import { readImagePayload } from "./tenancyExtract.js";

const EXTRACT_KEYS = [
  "ownerName",
  "emiratesId",
  "date",
  "purpose",
  "propertyKind",
  "titleDeedPropertyType",
  "location",
  "buildingNo",
  "plotNo",
  "municipalityNo",
  "plotAreaSqft",
  "plotAreaSqm",
  "askingAmount",
  "askingPeriod",
];

const JUNK = [
  /title deed|شهادة ملكية|صك ملكية|dubai land department|دائرة الأراضي/i,
  /owners numbers|purchased from|approved signature|expo 2020/i,
  /blockchain|electronically issued|makes it void|fold this certificate/i,
  /^(owner|landlord|name|date|plot|building|location)$/i,
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

function isJunk(value) {
  const text = raw(value);
  if (!text) return true;
  return JUNK.some((re) => re.test(text));
}

function fieldValue(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const confidence = Number(entry.confidence);
    if (Number.isFinite(confidence) && confidence < 0.4) return "";
    return raw(entry.value);
  }
  return raw(entry);
}

function validName(value) {
  const text = raw(value);
  if (text.length < 2 || text.length > 120 || isJunk(text)) return "";
  if (!/[A-Za-z\u0600-\u06FF]/.test(text)) return "";
  if (/^\d+$/.test(text)) return "";
  return text;
}

function validPlace(value) {
  const text = raw(value);
  if (text.length < 2 || text.length > 160 || isJunk(text)) return "";
  if (/^(dubai|uae|u\.a\.e|emirates|united arab emirates)$/i.test(text)) return "";
  return text;
}

function validCode(value, min, max) {
  const text = raw(value);
  if (text.length < min || text.length > max || isJunk(text)) return "";
  if (!/[A-Za-z0-9]/.test(text)) return "";
  return text;
}

function validEmiratesId(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (digits.length !== 15 || !digits.startsWith("784")) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}`;
}

function moneyInRange(value, min, max) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < min || n > max) return "";
  return String(Math.round(n * 100) / 100);
}

function validPurpose(value) {
  const text = raw(value).toLowerCase();
  if (/sale|sell|buyer|بيع/.test(text)) return "sale";
  if (/rent|rental|tenant|ايجار/.test(text)) return "rental";
  return "";
}

function validPeriod(value) {
  const text = raw(value).toLowerCase();
  if (!text) return "";
  if (/year|annual|سنو/.test(text)) return "per year";
  if (/month|شهر/.test(text)) return "per month";
  return text.length <= 24 ? text : "";
}

function validDocDate(value) {
  const text = raw(value);
  if (!text) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(text);
  const year = iso ? Number(iso[1]) : dmy ? Number(dmy[3]) : 0;
  if (year && (year < 2000 || year > new Date().getFullYear() + 1)) return "";
  return formatNocDate(text) || "";
}

function cleanNocExtracted(input) {
  const src = input && typeof input === "object" ? input : {};
  const bag = src.fields && typeof src.fields === "object" ? src.fields : src;
  const data = {};

  const take = (key, clean) => {
    const value = clean(fieldValue(bag[key]));
    if (value) data[key] = value;
  };

  take("ownerName", validName);
  take("emiratesId", validEmiratesId);
  const docType = raw(src.documentType).toLowerCase();
  if (docType !== "emirates_id") take("date", validDocDate);
  take("purpose", validPurpose);
  take("titleDeedPropertyType", (v) => {
    const text = raw(v);
    if (!text || isJunk(text)) return "";
    return prettyType(text).slice(0, 40);
  });
  take("propertyKind", (v) => {
    const text = raw(v);
    if (!text || isJunk(text)) return "";
    return propertyKindFromType(text);
  });
  take("location", validPlace);
  take("buildingNo", (v) => validPlace(v) || validCode(v, 1, 40));
  take("plotNo", (v) => validCode(v, 1, 24));
  take("municipalityNo", (v) => validCode(v, 3, 32));
  take("plotAreaSqft", (v) => moneyInRange(v, 3, 2000000));
  take("plotAreaSqm", (v) => moneyInRange(v, 1, 200000));
  take("askingAmount", (v) => moneyInRange(v, 1000, 500000000));
  take("askingPeriod", validPeriod);

  if (!data.propertyKind && data.titleDeedPropertyType) {
    data.propertyKind = propertyKindFromType(data.titleDeedPropertyType);
  }
  if (!data.titleDeedPropertyType && data.propertyKind) {
    data.titleDeedPropertyType = prettyType(data.propertyKind);
  }
  if (data.plotAreaSqft && !data.plotAreaSqm) data.plotAreaSqm = sqmFromSqft(data.plotAreaSqft);
  if (data.plotAreaSqm && !data.plotAreaSqft) data.plotAreaSqft = sqftFromSqm(data.plotAreaSqm);
  if (data.purpose === "sale") data.askingPeriod = "";
  if (data.purpose === "rental" && !data.askingPeriod) data.askingPeriod = "per year";

  return data;
}

async function callOpenAi(apiKey, image) {
  const prompt = [
    "Read this Dubai property / owner document photo and fill NOC form fields that are clearly visible.",
    "Return JSON: { documentType, fields }.",
    "documentType must be one of: title_deed, emirates_id, noc, advertisement, other.",
    "fields keys:",
    EXTRACT_KEYS.join(", "),
    "Each field is { value, confidence } where confidence is 0 to 1.",
    "Rules:",
    "- Owner / landlord / اسم المالك / name on Emirates ID = ownerName.",
    "- Emirates ID / الهوية / 784- = emiratesId. Format 784-XXXX-XXXXXXX-X.",
    "- Community / area / الموقع = location. Building name / Building No = buildingNo. Plot No / رقم القطعة = plotNo.",
    "- Municipality No / رقم البلدية = municipalityNo.",
    "- Property Type / Villa / Apartment / محل = titleDeedPropertyType and propertyKind.",
    "- Plot / suite area in sq.ft = plotAreaSqft. Area in sq.m = plotAreaSqm. Convert if only one is printed.",
    "- Asking rent or sale price = askingAmount. per year / per month = askingPeriod.",
    "- purpose is rental or sale only if the paper says rent/sale.",
    "- date is a letter date, contract date, or title-deed issue date only. Never date of birth or ID expiry.",
    "- Leave a field empty if it is not on the paper. Do not invent IDs, plot numbers, or prices.",
    "- Dates as YYYY-MM-DD or D Month YYYY. Money and areas are numbers only.",
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

export async function extractNocFromImage(image) {
  const keys = openaiKeys();
  if (!keys.length) {
    return { ok: false, error: "OpenAI keys are not set in .env." };
  }

  let lastError = "Could not read the photo.";
  let frontKeyLow = false;
  let frontKeyReason = "";
  for (let i = 0; i < keys.length; i += 1) {
    const used = i === 0 ? "front" : "backup";
    const result = await callOpenAi(keys[i], image);
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
    const data = cleanNocExtracted(parsed);
    if (!Object.keys(data).length) {
      return { ok: false, error: "No matching NOC fields were found in this picture.", frontKeyLow, frontKeyReason };
    }
    return { ok: true, data, usedKey: used, fields: Object.keys(data), frontKeyLow, frontKeyReason };
  }
  return { ok: false, error: lastError, frontKeyLow, frontKeyReason };
}

export { readImagePayload, cleanNocExtracted };
