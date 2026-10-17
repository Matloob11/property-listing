import assert from "node:assert/strict";
import test from "node:test";
import { livePortalCounts } from "./feeds.js";

test("overview live counts are Property Finder live flag and Bayut or Dubizzle feed rows", () => {
  const counts = livePortalCounts([
    { status: "live", pf_is_live: "1", portals: ["pf", "bayut", "dubizzle"] },
    { status: "archived", pf_is_live: "1", portals: ["bayut", "dubizzle"] },
    { status: "live", pf_is_live: "", portals: ["bayut"] },
    { status: "draft", pf_is_live: "", portals: ["dubizzle"] },
    { status: "live", pf_is_live: "", portals: ["pf"] },
  ]);
  assert.deepEqual(counts, { pf: 2, bayut: 2, dubizzle: 1 });
});
