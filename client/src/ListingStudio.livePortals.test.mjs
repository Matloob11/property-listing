import assert from "node:assert/strict";
import test from "node:test";
import { withLiveGoPortals } from "./liveGoPortals.js";

test("last-step live portals can be any mix of PF, Bayut and Dubizzle", () => {
  assert.deepEqual(withLiveGoPortals(["pf", "bayut", "dubizzle"], "bayut", false), ["pf", "dubizzle"]);
  assert.deepEqual(withLiveGoPortals(["pf"], "dubizzle", true), ["pf", "dubizzle"]);
  assert.deepEqual(withLiveGoPortals(["pf", "website"], "bayut", true), ["pf", "bayut", "website"]);
  assert.deepEqual(withLiveGoPortals(["website"], "pf", true), ["pf", "website"]);
  assert.deepEqual(withLiveGoPortals(["pf", "bayut", "dubizzle"], "pf", false).includes("pf"), false);
});
