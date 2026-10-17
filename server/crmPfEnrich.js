const PF_CACHE_MS = 15 * 60 * 1000;
const PF_MAX_ENRICH = Number(process.env.CRM_PF_ENRICH_MAX || 35);
const memory = new Map();

function textOf(value) {
  return String(value || "").trim();
}

export function extractPfMessageUrl(comments = "") {
  const matches = String(comments || "").match(/https?:\/\/[^\s\]]+/gi) || [];
  for (const raw of matches) {
    const url = raw.replace(/\[\/url.*/i, "").replace(/[.,);]+$/g, "").trim();
    if (/propertyfinder\.ae\/leads\/v1\/lead\/message\//i.test(url)) return url;
  }
  return "";
}

export function parsePfWhatsAppText(text = "") {
  const raw = textOf(text);
  if (!raw) return { purpose: "", beds: null, type: "", community: "", subCommunity: "", goUrl: "" };
  const goUrl = (raw.match(/https?:\/\/www\.propertyfinder\.ae\/go\/[^\s]+/i) || [""])[0].replace(/[.,);]+$/g, "");
  const detail = raw.match(
    /enquiry about the following\s+(.+?)\s*:\s*https?:\/\//i
  );
  const detailText = textOf(detail?.[1] || "");
  if (!detailText || /^-\s*in\s*-$/i.test(detailText)) {
    return { purpose: "", beds: null, type: "", community: "", subCommunity: "", goUrl };
  }

  let beds = null;
  if (/studio/i.test(detailText)) beds = 0;
  else {
    const bedMatch = detailText.match(/(\d+)\s*bedroom/i);
    if (bedMatch) beds = Number(bedMatch[1]);
  }

  let type = "";
  const typeMatch = detailText.match(/\b(townhouse|apartment|villa|studio|shop|penthouse|office)\b/i);
  if (typeMatch) type = typeMatch[1].replace(/\b\w/g, (c) => c.toUpperCase());

  let community = "";
  let subCommunity = "";
  const inMatch = detailText.match(/\bin\s+(.+)$/i);
  if (inMatch) {
    const place = textOf(inMatch[1]);
    const key = place.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (/mudon|ranim/.test(key)) {
      community = "Mudon";
      subCommunity = /ranim|al\s*ranim/i.test(place) ? place : "";
    } else if (/internationalcity|englandcluster|greececluster|china|spain|persia|france|emirates|russia|warsan|jawzaa/.test(key)) {
      community = "International City";
      subCommunity = place;
    } else if (/casadora|villanova|amaranta/.test(key)) {
      community = /villanova|amaranta/.test(key) ? "Villanova" : place;
      subCommunity = place;
    } else if (place) {
      community = place;
    }
  }

  return { purpose: "", beds, type, community, subCommunity, goUrl, detailText };
}

export function purposeFromPfUrl(url = "") {
  const u = String(url || "").toLowerCase();
  if (/\/rent\/|for-rent|properties-for-rent|apartments-for-rent|townhouses-for-rent|villas-for-rent/.test(u)) return "rent";
  if (/\/buy\/|for-sale|properties-for-sale|apartments-for-sale|townhouses-for-sale|villas-for-sale/.test(u)) return "sale";
  return "";
}

async function fetchRedirectLocation(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  return {
    status: res.status,
    location: res.headers.get("location") || "",
    finalUrl: res.url || url,
  };
}

async function followFinalUrl(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  return res.url || url;
}

export async function resolvePfLeadEnrichment(messageUrl) {
  const key = String(messageUrl || "").trim();
  if (!key) return null;
  const cached = memory.get(key);
  if (cached && Date.now() - cached.at < PF_CACHE_MS) return cached.value;

  let value = null;
  try {
    const first = await fetchRedirectLocation(key);
    let waText = "";
    const loc = first.location || "";
    if (/api\.whatsapp\.com|wa\.me/i.test(loc)) {
      try {
        waText = new URL(loc).searchParams.get("text") || "";
      } catch {
        waText = "";
      }
    }
    const parsed = parsePfWhatsAppText(waText);
    let purpose = "";
    let finalUrl = "";
    if (parsed.goUrl) {
      try {
        finalUrl = await followFinalUrl(parsed.goUrl);
        purpose = purposeFromPfUrl(finalUrl);
      } catch {
        purpose = "";
      }
    }
    value = {
      purpose,
      beds: parsed.beds,
      type: parsed.type,
      community: parsed.community,
      subCommunity: parsed.subCommunity,
      goUrl: parsed.goUrl,
      finalUrl,
      source: "property_finder",
    };
    if (!value.purpose && !value.community && value.beds == null && !value.type) value = null;
  } catch {
    value = null;
  }

  memory.set(key, { at: Date.now(), value });
  return value;
}

export function clearPfEnrichCache() {
  memory.clear();
}

export async function enrichLeadRowsFromPf(rows, { sleep = null, max = PF_MAX_ENRICH } = {}) {
  const hints = new Map();
  const targets = [];
  for (const row of rows || []) {
    if (targets.length >= max) break;
    const clientType = row.UF_CRM_1756638760279;
    if (clientType) continue;
    const messageUrl = extractPfMessageUrl(row.COMMENTS || row.comments || "");
    if (!messageUrl) continue;
    targets.push({ id: String(row.ID || row.id || ""), messageUrl });
  }

  const concurrency = 3;
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const settled = await Promise.all(batch.map(async (item) => {
      const tip = await resolvePfLeadEnrichment(item.messageUrl);
      return { id: item.id, tip };
    }));
    for (const item of settled) {
      if (item.tip) hints.set(item.id, item.tip);
    }
    if (sleep && i + concurrency < targets.length) await sleep(60);
  }
  return { hints, enriched: hints.size };
}
