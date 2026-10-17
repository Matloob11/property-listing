export function leadPortal(row) {
  const tags = Array.isArray(row?.tags) ? row.tags.map((item) => String(item || "").toLowerCase()) : [];
  const entity = String(row?.entity_type || "").toLowerCase();
  if (tags.includes("bayut") || entity === "bayut") return "bayut";
  if (tags.includes("dubizzle") || entity === "dubizzle") return "dubizzle";
  if (tags.includes("other") || entity === "other") return "other";
  if (String(row?.id || "").startsWith("crm-")) return "other";
  return "pf";
}

const DUBAI = "Asia/Dubai";

function dubaiDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function portalLeadCounts(leads, now = Date.now()) {
  const dayMs = 86400000;
  const todayKey = dubaiDay(now);
  const weekFrom = new Date(now - 7 * dayMs).toISOString();
  const days15From = new Date(now - 15 * dayMs).toISOString();
  const monthFrom = new Date(now - 30 * dayMs).toISOString();
  const blank = () => ({ pf: 0, bayut: 0, dubizzle: 0 });
  const counts = { day: blank(), week: blank(), days15: blank(), month: blank(), all: blank(), by_day: {} };
  for (const lead of leads || []) {
    const at = String(lead?.created_at || "");
    const portal = leadPortal(lead);
    if (!at || !Object.prototype.hasOwnProperty.call(counts.day, portal)) continue;
    const dayKey = dubaiDay(at);
    if (!dayKey) continue;
    if (!counts.by_day[dayKey]) counts.by_day[dayKey] = blank();
    counts.by_day[dayKey][portal] += 1;
    if (dayKey === todayKey) counts.day[portal] += 1;
    counts.all[portal] += 1;
    if (at >= weekFrom) counts.week[portal] += 1;
    if (at >= days15From) counts.days15[portal] += 1;
    if (at >= monthFrom) counts.month[portal] += 1;
  }
  return counts;
}

const KARACHI = "Asia/Karachi";

export function karachiDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KARACHI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function karachiHour(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "00";
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value || "00";
  const n = Number(hour);
  return String(Number.isFinite(n) ? n % 24 : 0).padStart(2, "0");
}

function shiftDay(ymd, days) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveLeadWindow(now = Date.now(), range = "day", from = "", to = "") {
  const today = karachiDay(now);
  if (range === "week") return { from: shiftDay(today, -6), to: today, hourly: false, label: "Leads, last 7 days" };
  if (range === "days15") return { from: shiftDay(today, -14), to: today, hourly: false, label: "Leads, last 15 days" };
  if (range === "month") return { from: shiftDay(today, -29), to: today, hourly: false, label: "Leads, last 30 days" };
  if (range === "custom") {
    const start = String(from || "").slice(0, 10);
    const end = String(to || "").slice(0, 10);
    const ok = /^\d{4}-\d{2}-\d{2}$/;
    if (!ok.test(start) || !ok.test(end)) return { from: shiftDay(today, -6), to: today, hourly: false, label: "Leads, last 7 days" };
    let a = start <= end ? start : end;
    let b = start <= end ? end : start;
    if (shiftDay(a, 92) < b) a = shiftDay(b, -92);
    return { from: a, to: b, hourly: false, label: "Leads" };
  }
  return { from: today, to: today, hourly: true, label: "Leads today" };
}

export function leadActivity(leads, { now = Date.now(), range = "day", from = "", to = "" } = {}) {
  const window = resolveLeadWindow(now, range, from, to);
  const matched = [];
  for (const lead of leads || []) {
    const day = karachiDay(lead?.created_at);
    if (!day || day < window.from || day > window.to) continue;
    matched.push(lead);
  }
  const byChannel = {};
  const daily = [];
  if (window.hourly) {
    const hours = new Map();
    for (let hour = 0; hour < 24; hour += 1) {
      const key = String(hour).padStart(2, "0");
      const row = { day: key, count: 0 };
      hours.set(key, row);
      daily.push(row);
    }
    for (const lead of matched) {
      const row = hours.get(karachiHour(lead.created_at));
      if (row) row.count += 1;
      const channel = lead.channel || "other";
      byChannel[channel] = (byChannel[channel] || 0) + 1;
    }
  } else {
    const days = new Map();
    for (let day = window.from; day <= window.to; day = shiftDay(day, 1)) {
      const row = { day, count: 0 };
      days.set(day, row);
      daily.push(row);
      if (daily.length > 93) break;
    }
    for (const lead of matched) {
      const row = days.get(karachiDay(lead.created_at));
      if (row) row.count += 1;
      const channel = lead.channel || "other";
      byChannel[channel] = (byChannel[channel] || 0) + 1;
    }
  }
  const latest = [...matched]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 10);
  return { ...window, daily, by_channel: byChannel, latest };
}

export function leadPortalLabel(portal) {
  if (portal === "bayut") return "Bayut";
  if (portal === "dubizzle") return "Dubizzle";
  if (portal === "other") return "Other CRM";
  return "Property Finder";
}

export function leadMatchesQuery(row, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const tags = Array.isArray(row?.tags) ? row.tags.join(" ") : String(row?.tags || "");
  const hay = [
    row?.id,
    row?.sender_name,
    row?.sender_phone,
    row?.sender_email,
    row?.reference,
    row?.agent_name,
    row?.bitrix_id,
    row?.channel,
    row?.status,
    row?.entity_type,
    row?.listing_id,
    row?.pf_listing_id,
    tags,
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) {
    const phone = String(row?.sender_phone || "").replace(/\D/g, "");
    const wanted = digits.replace(/^0+/, "");
    if (wanted && phone.includes(wanted)) return true;
  }
  return false;
}
