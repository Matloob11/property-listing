import assert from "node:assert/strict";
import test from "node:test";
import {
  dismissExpiryAlerts,
  expiryAlertItems,
  expiryNotifyMessage,
  getExpiryAlerts,
  isBitrixExpiryNotifyItem,
  isExpiringSoonListing,
  listingOwnedByUser,
  sendExpiryBitrixNotice,
} from "./listingExpiryAlerts.js";
import { normalizeListing } from "./listingModel.js";

const today = "2026-10-05";
const user = { id: "81", name: "Asma Aslam" };

test("expiry alerts include live listings in 30 days for that agent only", () => {
  const rows = [
    normalizeListing({ id: "1", listing_agent: "Asma Aslam", agent_id: "81", status: "live", portal_expiry: "2026-10-12", community: "Al Warqaa", reference: "a7group-1" }),
    normalizeListing({ id: "2", listing_agent: "Asma Aslam", agent_id: "81", status: "live", portal_expiry: "2026-12-01", community: "JVC" }),
    normalizeListing({ id: "3", listing_agent: "Qasim Mehmood", agent_id: "9", status: "live", portal_expiry: "2026-10-10" }),
    normalizeListing({ id: "4", listing_agent: "Asma Aslam", agent_id: "81", status: "archived", portal_expiry: "2026-10-08" }),
  ];
  assert.equal(isExpiringSoonListing(rows[0], today), true);
  assert.equal(isExpiringSoonListing(rows[1], today), false);
  assert.equal(listingOwnedByUser(rows[0], user), true);
  const items = expiryAlertItems(rows, user, today, {});
  assert.equal(items.length, 1);
  assert.equal(items[0].reference, "a7group-1");
  assert.equal(items[0].daysLeft, 7);
});

test("dismissed expiry keys stay hidden until expiry date changes", async () => {
  const store = {};
  const db = {
    async all() {
      return [
        normalizeListing({ id: "1", listing_agent: "Asma Aslam", agent_id: "81", status: "live", portal_expiry: "2026-10-12", reference: "a7group-1" }),
      ];
    },
    async getSetting(key, fallback) {
      return store[key] ?? fallback;
    },
    async setSetting(key, value) {
      store[key] = value;
    },
  };
  const first = await getExpiryAlerts(db, user, today);
  assert.equal(first.items.length, 1);
  await dismissExpiryAlerts(db, user, first.items.map((row) => row.key));
  const again = await getExpiryAlerts(db, user, today);
  assert.equal(again.items.length, 0);
});

test("Bitrix notify only when 6 days or less remain", async () => {
  assert.equal(isBitrixExpiryNotifyItem({ daysLeft: 7 }), false);
  assert.equal(isBitrixExpiryNotifyItem({ daysLeft: 6 }), true);
  assert.equal(isBitrixExpiryNotifyItem({ daysLeft: 5 }), true);
  const text = expiryNotifyMessage([{ reference: "a7group-1", community: "Al Warqaa", daysLeft: 5, expiry: "2026-10-10" }]);
  assert.match(text, /a7group-1/);
  assert.match(text, /6 days or less/);
  const store = {};
  const db = {
    async getSetting(key, fallback) {
      return store[key] ?? fallback;
    },
    async setSetting(key, value) {
      store[key] = value;
    },
  };
  const skipped = await sendExpiryBitrixNotice(db, user, [{ key: "1:2026-10-12", daysLeft: 7, reference: "a7group-1" }]);
  assert.equal(skipped.skipped, true);
});
