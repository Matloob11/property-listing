import assert from "node:assert/strict";
import test from "node:test";
import { unpublishListingFromPortals } from "./pfPublish.js";

test("unpublishListingFromPortals removes Bayut from the desk feed set", async () => {
  const listing = {
    id: "1",
    reference: "a7group-1",
    portals: ["bayut", "website"],
    pf_id: "",
    pf_is_live: "",
    pf_state: "",
  };
  const db = {
    async updateDirect(current, data) {
      return { ...current, ...data };
    },
  };
  const out = await unpublishListingFromPortals(db, listing, ["bayut"], "test");
  assert.deepEqual(out.unpublished, ["bayut"]);
  assert.equal(out.listing.portals.includes("bayut"), false);
  assert.equal(out.listing.portals.includes("website"), true);
});

test("unpublishListingFromPortals rejects empty selection", async () => {
  await assert.rejects(
    () => unpublishListingFromPortals({ updateDirect: async () => ({}) }, { portals: ["website"] }, ["pf"], "test"),
    /not live/
  );
});
