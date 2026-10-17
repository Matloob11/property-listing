import assert from "node:assert/strict";
import test from "node:test";
import { infoSliceFilters, infoSliceTitle } from "./infoSlice.js";

const base = {
  ticket: "mine",
  q: "marina",
  listing_id: "A7-1",
  category: "",
  purpose: "rent",
  portal: "bayut",
  page: 4,
};

test("sales click keeps category and clears search and portal", () => {
  const next = infoSliceFilters(base, "commercial", "sale");
  assert.equal(next.ticket, "live");
  assert.equal(next.category, "commercial");
  assert.equal(next.purpose, "sale");
  assert.equal(next.portal, "");
  assert.equal(next.q, "");
  assert.equal(next.page, 1);
  assert.equal(infoSliceTitle("commercial", "sale"), "Commercial · Sales");
});

test("Property Finder click filters portal on that category", () => {
  const next = infoSliceFilters(base, "residential", "pf");
  assert.equal(next.category, "residential");
  assert.equal(next.purpose, "");
  assert.equal(next.portal, "pf");
  assert.equal(infoSliceTitle("residential", "pf"), "Residential · Property Finder");
});
