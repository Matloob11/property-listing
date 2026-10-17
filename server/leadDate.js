const DUBAI = "Asia/Dubai";

export function dubaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  return {
    year,
    month: `${year}-${month}`,
    day: `${year}-${month}-${day}`,
  };
}

export function parseLeadDateFilter(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{4}-\d{2}$/.test(raw) || /^\d{4}$/.test(raw)) return raw;
  return "";
}

export function leadDateKey(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "";
  const dated = new Date(raw);
  if (Number.isNaN(dated.getTime())) return raw.slice(0, 10);
  return dated.toLocaleDateString("en-CA", { timeZone: DUBAI });
}

export function leadMatchesDate(iso, filter) {
  const wanted = parseLeadDateFilter(filter);
  if (!wanted) return true;
  const key = leadDateKey(iso);
  return Boolean(key) && key.startsWith(wanted);
}

function dayFilter(value) {
  const wanted = parseLeadDateFilter(value);
  return wanted.length === 10 ? wanted : "";
}

export function leadMatchesDateRange(iso, from, to) {
  let start = dayFilter(from);
  let end = dayFilter(to);
  if (!start && !end) return true;
  const key = leadDateKey(iso);
  if (!key) return false;
  if (start && end && start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  if (start && key < start) return false;
  if (end && key > end) return false;
  return true;
}

function shortDayLabel(ymd) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function leadDateRangeLabel(from, to) {
  let start = dayFilter(from);
  let end = dayFilter(to);
  if (start && end && start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  if (start && end) return `${shortDayLabel(start)} – ${shortDayLabel(end)}`;
  if (start) return `From ${shortDayLabel(start)}`;
  if (end) return `To ${shortDayLabel(end)}`;
  return "";
}

export function leadDateMode(value) {
  const wanted = parseLeadDateFilter(value);
  if (wanted.length === 10) return "day";
  if (wanted.length === 7) return "month";
  if (wanted.length === 4) return "year";
  return "all";
}

export function leadDateLabel(value) {
  const wanted = parseLeadDateFilter(value);
  if (wanted.length === 10) {
    return new Date(`${wanted}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }
  if (wanted.length === 7) {
    return new Date(`${wanted}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return wanted;
}
