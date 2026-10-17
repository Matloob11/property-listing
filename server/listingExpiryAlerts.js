import { dubaiToday, listingExpiryDate, listingOccupiesDeskLive, portfolioNameMatch } from "./listingModel.js";
import { notifyBitrixUser } from "./bitrixCrm.js";

export const EXPIRY_ALERT_DAYS = 30;
export const EXPIRY_BITRIX_NOTIFY_DAYS = 6;
export const EXPIRY_ALERT_DISMISS = "expiry_alert_dismiss_v1";
export const EXPIRY_ALERT_IM = "expiry_alert_im_v2";

export function daysUntilExpiry(row, today = dubaiToday()) {
  const day = listingExpiryDate(row);
  if (!day || !today) return null;
  const a = Date.parse(`${day}T00:00:00+04:00`);
  const b = Date.parse(`${today}T00:00:00+04:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

export function expiryAlertKey(row) {
  const id = String(row?.id || "").trim();
  const day = listingExpiryDate(row);
  return id && day ? `${id}:${day}` : "";
}

export function listingOwnedByUser(row, user) {
  const uid = String(user?.id || "").trim();
  if (uid && String(row?.agent_id || "").trim() === uid) return true;
  return portfolioNameMatch(row?.listing_agent, user?.name);
}

export function isExpiringSoonListing(row, today = dubaiToday(), windowDays = EXPIRY_ALERT_DAYS) {
  if (!row || row.status === "duplicate" || row.status === "archived") return false;
  if (row.status !== "live" && !listingOccupiesDeskLive(row)) return false;
  const days = daysUntilExpiry(row, today);
  return days != null && days >= 0 && days <= windowDays;
}

export function mapExpiryAlertItem(row, today = dubaiToday()) {
  const daysLeft = daysUntilExpiry(row, today);
  return {
    key: expiryAlertKey(row),
    id: String(row?.id || ""),
    reference: String(row?.reference || "").trim(),
    title: String(row?.title || row?.reference || "Listing").trim() || "Listing",
    community: String(row?.community || "").trim() || "—",
    purpose: String(row?.purpose || ""),
    status: String(row?.status || ""),
    expiry: listingExpiryDate(row),
    daysLeft,
  };
}

export function expiryAlertItems(rows = [], user = {}, today = dubaiToday(), dismissed = {}) {
  return (rows || [])
    .filter((row) => isExpiringSoonListing(row, today) && listingOwnedByUser(row, user))
    .map((row) => mapExpiryAlertItem(row, today))
    .filter((row) => row.key && !dismissed[row.key])
    .sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99) || a.reference.localeCompare(b.reference));
}

function asMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function readBucket(db, setting, userId) {
  const all = asMap(db?.getSetting ? await db.getSetting(setting, {}) : {});
  return { all, mine: asMap(all[String(userId || "")]) };
}

async function writeBucket(db, setting, all, userId, mine) {
  if (!db?.setSetting) return;
  await db.setSetting(setting, { ...all, [String(userId)]: mine });
}

export async function getExpiryAlerts(db, user, today = dubaiToday()) {
  const rows = db?.all ? await db.all() : [];
  const { mine } = await readBucket(db, EXPIRY_ALERT_DISMISS, user?.id);
  const items = expiryAlertItems(rows, user, today, mine);
  return { ok: true, items, windowDays: EXPIRY_ALERT_DAYS };
}

export async function dismissExpiryAlerts(db, user, keys = []) {
  const uid = String(user?.id || "").trim();
  if (!uid) return { ok: false, error: "Missing user" };
  const list = (Array.isArray(keys) ? keys : []).map((key) => String(key || "").trim()).filter(Boolean);
  if (!list.length) return { ok: true, dismissed: 0 };
  const { all, mine } = await readBucket(db, EXPIRY_ALERT_DISMISS, uid);
  const now = Date.now();
  for (const key of list) mine[key] = now;
  await writeBucket(db, EXPIRY_ALERT_DISMISS, all, uid, mine);
  return { ok: true, dismissed: list.length };
}

export function isBitrixExpiryNotifyItem(item) {
  const days = Number(item?.daysLeft);
  return Number.isFinite(days) && days >= 0 && days <= EXPIRY_BITRIX_NOTIFY_DAYS;
}

export function expiryNotifyMessage(items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return "";
  const lines = rows.slice(0, 8).map((row) => {
    const when = row.daysLeft === 0 ? "today" : row.daysLeft === 1 ? "in 1 day" : `in ${row.daysLeft} days`;
    return `• ${row.reference || row.title} (${row.community}) expires ${when} (${row.expiry})`;
  });
  if (rows.length > 8) lines.push(`• +${rows.length - 8} more`);
  return [
    "Property Listing New — listing expiry reminder.",
    `${rows.length} of your listing${rows.length === 1 ? "" : "s"} will expire in ${EXPIRY_BITRIX_NOTIFY_DAYS} days or less.`,
    ...lines,
    "Open Property Listing New and tap Got it when you have seen this.",
  ].join("\n");
}

export async function sendExpiryBitrixNotice(db, user, items) {
  const uid = Number(user?.id || 0);
  const rows = (Array.isArray(items) ? items : []).filter(isBitrixExpiryNotifyItem);
  if (!uid || !rows.length) return { ok: false, skipped: true };
  const keys = rows.map((row) => row.key).filter(Boolean);
  const { all, mine } = await readBucket(db, EXPIRY_ALERT_IM, uid);
  const pending = keys.filter((key) => !mine[key]);
  if (!pending.length) return { ok: true, already: true };
  const text = expiryNotifyMessage(rows);
  const got = await notifyBitrixUser(user, uid, text, `a7-listing-expiry-${uid}`);
  if (!got?.ok) return { ok: false, error: got?.error || "Bitrix notify failed" };
  const now = Date.now();
  for (const key of pending) mine[key] = now;
  await writeBucket(db, EXPIRY_ALERT_IM, all, uid, mine);
  return { ok: true, via: got.via, sent: pending.length };
}

export async function pushExpiryBitrixNotices(db, actor = {}, today = dubaiToday()) {
  const rows = db?.all ? await db.all() : [];
  const dismissedAll = asMap(db?.getSetting ? await db.getSetting(EXPIRY_ALERT_DISMISS, {}) : {});
  const groups = new Map();
  for (const row of rows) {
    if (!isExpiringSoonListing(row, today, EXPIRY_BITRIX_NOTIFY_DAYS)) continue;
    const uid = String(row.agent_id || "").trim();
    if (!/^\d+$/.test(uid)) continue;
    const key = expiryAlertKey(row);
    if (!key || dismissedAll[uid]?.[key]) continue;
    const list = groups.get(uid) || [];
    list.push(mapExpiryAlertItem(row, today));
    groups.set(uid, list);
  }
  let sent = 0;
  for (const [uid, items] of groups) {
    const got = await sendExpiryBitrixNotice(db, { ...actor, id: uid }, items);
    if (got?.ok && !got.already) sent += 1;
  }
  return { ok: true, agents: groups.size, sent };
}
