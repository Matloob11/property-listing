import assert from "node:assert/strict";
import test from "node:test";
import {
  addLocation,
  catalogFromListings,
  catalogFromPfRows,
  catalogFromSeed,
  dedupeHits,
  hitFromParts,
  localLocationHits,
  mergeCatalogs,
} from "./locations.js";

test("seed catalog includes the communities agents already use", () => {
  const catalog = catalogFromSeed();
  assert.ok(catalog.communities.Dubai.includes("Serena"));
  assert.ok(catalog.communities.Dubai.includes("Villanova"));
  assert.ok(catalog.communities.Dubai.includes("Damac Lagoons"));
  assert.ok(catalog.communities.Dubai.length > 80);
});

test("listings and PF trees merge into the create-listing catalog", () => {
  const fromAds = catalogFromListings([
    { city: "Dubai", community: "Palm Jebel Ali", sub_community: "The Beach" },
    { city: "Dubai", community: "Serena" },
  ]);
  const fromPf = catalogFromPfRows([
    {
      name: "Amaranta",
      type: "SUBCOMMUNITY",
      tree: [
        { type: "CITY", name: "Dubai" },
        { type: "COMMUNITY", name: "Villanova" },
        { type: "SUBCOMMUNITY", name: "Amaranta" },
      ],
    },
  ]);
  const catalog = mergeCatalogs(catalogFromSeed(), fromAds, fromPf);
  assert.ok(catalog.communities.Dubai.includes("Palm Jebel Ali"));
  assert.ok(catalog.sub_communities.Dubai.Villanova.includes("Amaranta"));
  assert.ok(catalog.sub_communities.Dubai["Palm Jebel Ali"].includes("The Beach"));
});

test("local search finds a typed community", () => {
  const catalog = addLocation(catalogFromSeed(), { city: "Dubai", community: "Serena" });
  const hits = localLocationHits(catalog, { q: "ser", city: "Dubai", type: "COMMUNITY" });
  assert.ok(hits.some((hit) => hit.community === "Serena"));
});

test("location hits keep city / community / building for publish", () => {
  const hit = hitFromParts(
    { city: "Dubai", community: "Villanova", sub_community: "Amaranta", building: "", latitude: "25.1", longitude: "55.2" },
    { id: "8967", name: "Amaranta", type: "SUBCOMMUNITY" }
  );
  assert.equal(hit.path, "Dubai - Villanova - Amaranta");
  assert.equal(hit.id, "8967");
  assert.deepEqual(
    dedupeHits([hit, { ...hit, name: "Amaranta copy" }]).map((row) => row.id),
    ["8967"]
  );
});
