import assert from "node:assert/strict";
import test from "node:test";
import { adFactMatches, countAdFacts, listingAdFacts } from "./listingAdBoard.js";

const rows = [
  { purpose: "sale", community: "International City", sub_community: "England Cluster", beds: 0, type: "apartment", listing_agent: "Asma Aslam" },
  { purpose: "rent", community: "International City", sub_community: "China Cluster", beds: 1, type: "shop", listing_agent: "Farhat Shahid" },
  { purpose: "sale", community: "Serena", sub_community: "", beds: "", type: "villa", listing_owner: "Qasim Mehmood" },
  { purpose: "", community: "", sub_community: "", beds: 3, type: "", listing_agent: "" },
];

test("all ads split into sale, rent, and rent plus sale", () => {
  const facts = listingAdFacts(rows);
  assert.equal(facts.length, 4);
  assert.equal(facts.filter((row) => row.purpose === "sale").length, 2);
  assert.equal(facts.filter((row) => row.purpose === "rent").length, 1);
  assert.equal(facts.filter((row) => adFactMatches(row, "both")).length, 3);
  assert.equal(facts[0].bedsName, "Studio");
  assert.equal(facts[1].bedsName, "1 Bedroom");
  assert.equal(facts[1].typeName, "Shop");
  assert.equal(facts[2].agent, "Qasim Mehmood");
  assert.equal(facts[2].bedsName, "Empty beds");
  assert.equal(facts[2].cluster, "Empty cluster");
  assert.equal(facts[3].community, "Empty community");
  assert.equal(facts[3].typeName, "Empty type");
});

test("a sale click keeps only sale rows in the sections below", () => {
  const facts = listingAdFacts(rows);
  const communities = countAdFacts(facts, "sale", {}, "community", "communityId", "community");
  assert.deepEqual(communities.map((row) => [row.name, row.count]), [
    ["International City", 1],
    ["Serena", 1],
  ]);
  const types = countAdFacts(facts, "both", { community: "international city" }, "type", "typeId", "typeName");
  assert.deepEqual(types.map((row) => row.name), ["Apartment", "Shop"]);
});

test("the board keeps only ads live on Property Finder, Bayut, or Dubizzle, once each", () => {
  const rows = [
    { reference: "live-both", purpose: "sale", community: "Serena", beds: 1, type: "apartment" },
    { reference: "live-pf", purpose: "rent", community: "Mudon", beds: 2, type: "villa" },
    { reference: "desk-only", purpose: "sale", community: "Serena", beds: 3, type: "apartment" },
  ];
  const websiteLive = {
    pf: { ok: true, refs: ["live-both", "live-pf"] },
    bayut: { ok: true, refs: ["live-both"] },
    dubizzle: { ok: true, refs: [] },
  };
  const facts = listingAdFacts(rows, websiteLive);
  assert.equal(facts.length, 2);
  assert.deepEqual(facts.map((row) => row.community), ["Serena", "Mudon"]);
});
