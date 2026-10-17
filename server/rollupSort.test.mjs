import test from "node:test";
import assert from "node:assert/strict";
import { sortRollupRows } from "./rollupSort.js";

test("types: Other and empty labels sort last; rest by count", () => {
  const rows = sortRollupRows(
    [
      { id: "other", name: "Other", count: 43 },
      { id: "townhouse", name: "Townhouse", count: 13 },
      { id: "apartment", name: "Apartment", count: 6 },
      { id: "shop", name: "Shop", count: 6 },
      { id: "studio", name: "Studio", count: 4 },
      { id: "commercial", name: "Commercial", count: 2 },
    ],
    { kind: "types" }
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ["Townhouse", "Apartment", "Shop", "Studio", "Commercial", "Other"]
  );
});

test("beds: Studio then numeric then empty dash last", () => {
  const rows = sortRollupRows(
    [
      { id: "na", name: "—", count: 30 },
      { id: "3", name: "3 Bedroom", count: 20 },
      { id: "4", name: "4 Bedroom", count: 13 },
      { id: "0", name: "Studio", count: 6 },
      { id: "1", name: "1 Bedroom", count: 5 },
    ],
    { kind: "beds" }
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ["Studio", "1 Bedroom", "3 Bedroom", "4 Bedroom", "—"]
  );
});

test("communities: Empty community last, rest by count", () => {
  const rows = sortRollupRows(
    [
      { id: "emptycommunity", name: "Empty community", count: 12 },
      { id: "mudon", name: "Mudon", count: 32 },
      { id: "internationalcity", name: "International City", count: 34 },
    ],
    { kind: "communities" }
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ["International City", "Mudon", "Empty community"]
  );
});
