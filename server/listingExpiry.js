import { dubaiToday, isListingExpired, listingOccupiesDeskLive } from "./listingModel.js";
import { pushExpiryBitrixNotices } from "./listingExpiryAlerts.js";

export async function archiveExpiredListings(db, today = dubaiToday()) {
  const found = db.expiredLiveIds ? await db.expiredLiveIds(today) : [];
  const items = found.map((item) => (typeof item === "object" && item ? item : { id: item, status: "live" }));
  const seen = new Map(items.filter((item) => item.id).map((item) => [String(item.id), item.status || "live"]));
  if (!seen.size && db.all) {
    for (const row of await db.all()) {
      if (isListingExpired(row, today) && listingOccupiesDeskLive(row)) seen.set(String(row.id), row.status || "live");
    }
  }
  let n = 0;
  for (const [id, rawStatus] of seen) {
    const current = await db.get(id);
    if (!current || !isListingExpired(current, today)) continue;
    const previous = { ...current, status: rawStatus || current.status };
    if (db.updateDirect) await db.updateDirect(previous, { status: "archived" }, "Expiry Auto-Archive");
    else await db.update(id, { status: "archived" }, "Expiry Auto-Archive");
    n += 1;
  }
  return n;
}

export function scheduleExpiryArchive(db, hours = 1) {
  const run = () =>
    archiveExpiredListings(db)
      .then((n) => {
        if (n) console.log(`Auto-archived ${n} expired listing${n === 1 ? "" : "s"}`);
      })
      .then(() => pushExpiryBitrixNotices(db).catch((error) => console.error("Expiry notify failed:", error.message)))
      .catch((error) => console.error("Expiry auto-archive failed:", error.message));
  setTimeout(run, 15000);
  const ms = Math.max(1, Number(hours) || 1) * 60 * 60 * 1000;
  setInterval(run, ms);
}
