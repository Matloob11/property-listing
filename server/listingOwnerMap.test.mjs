import assert from "node:assert/strict";
import test from "node:test";
import { collapseOwnerRefs } from "./listingOwnerMap.js";

test("keeps one owner per reference and drops clashes", () => {
  const rows = collapseOwnerRefs([
    { reference: "A7Group-10", owner: "Qasim Mehmood" },
    { reference: " a7group-10 ", listing_owner: "Qasim Mehmood" },
    { reference: "a7group-11", owner: "Asma Aslam" },
    { reference: "a7group-11", owner: "Farhat Shahid" },
    { reference: "a7group-12", owner: "  " },
    { reference: "", owner: "Neha Mhaskar" },
  ]);
  assert.deepEqual(rows, [
    { ref: "a7group-10", owner: "Qasim Mehmood" },
  ]);
});
