import assert from "node:assert/strict";
import test from "node:test";
import { archiveExpiredListings } from "./listingExpiry.js";
import { dubaiToday } from "./listingModel.js";

function memoryDb(rows) {
  const data = rows.map((row) => ({ ...row }));
  return {
    data,
    async expiredLiveIds(today) {
      return data
        .filter((row) => (row.status === "live" || row.status === "pending" || row.pf_is_live === "1") && row.portal_expiry && row.portal_expiry < today)
        .map((row) => row.id);
    },
    async get(id) {
      return data.find((row) => row.id === id) || null;
    },
    async update(id, patch) {
      const row = data.find((item) => item.id === id);
      if (row) Object.assign(row, patch);
      return row;
    },
  };
}

test("archiveExpiredListings moves expired live and PF-live ads to Archive", async () => {
  const today = dubaiToday();
  const db = memoryDb([
    { id: "1", status: "live", portal_expiry: "2020-01-01", pf_is_live: "" },
    { id: "2", status: "live", portal_expiry: today, pf_is_live: "1" },
    { id: "3", status: "draft", portal_expiry: "2020-01-01", pf_is_live: "" },
    { id: "4", status: "archived", portal_expiry: "2020-01-01", pf_is_live: "1" },
    { id: "5", status: "live", portal_expiry: "", pf_is_live: "" },
    { id: "6", status: "pending", portal_expiry: "2021-06-01", pf_is_live: "" },
  ]);
  const n = await archiveExpiredListings(db, today);
  assert.equal(n, 3);
  assert.equal(db.data.find((row) => row.id === "1").status, "archived");
  assert.equal(db.data.find((row) => row.id === "2").status, "live");
  assert.equal(db.data.find((row) => row.id === "3").status, "draft");
  assert.equal(db.data.find((row) => row.id === "4").status, "archived");
  assert.equal(db.data.find((row) => row.id === "5").status, "live");
  assert.equal(db.data.find((row) => row.id === "6").status, "archived");
});
