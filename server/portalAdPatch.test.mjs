import assert from "node:assert/strict";
import test from "node:test";
import { portalAdPatch } from "./portalSiteScan.js";

test("a website ad marks the desk listing live and keeps the portal", () => {
  const patch = portalAdPatch(
    { status: "draft", portals: ["pf"], title: "Old", price_aed: 100, beds: 1, baths: 1, area_sqft: 10, photo: "", listing_agent: "" },
    { title: "New title", side: "rent", price: 250000, beds: 2, baths: 2, size: 900, photo: "https://images.bayut.com/x.webp", agent: "Amina" },
    "bayut"
  );
  assert.equal(patch.status, "live");
  assert.deepEqual(patch.portals, ["pf", "bayut"]);
  assert.equal(patch.title, "New title");
  assert.equal(patch.purpose, "rent");
  assert.equal(patch.price_aed, 250000);
  assert.equal(portalAdPatch({ status: "live", portals: ["bayut"], title: "Same", beds: 2, baths: 1, area_sqft: 1, price_aed: 1, photo: "", listing_agent: "" }, { title: "Same", beds: 2 }, "bayut"), null);
});
