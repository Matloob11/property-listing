import assert from "node:assert/strict";
import test from "node:test";
import { findExactDuplicate, listingDuplicateError, sameProperty } from "./listingDuplicates.js";

const base = {
  id: "new",
  city: "Dubai",
  community: "Serena",
  sub_community: "Casa Dora",
  building: "Building 4",
  unit_no: "101",
  purpose: "rent",
  type: "apartment",
  category: "residential",
  beds: 3,
  baths: 2,
  area_sqft: 1200,
  permit_number: "7116752324",
};

const live = { ...base, id: "old", reference: "a7group-1001", status: "live" };

test("rejects only when every property field is the same", () => {
  assert.equal(sameProperty(base, live), true);
  assert.equal(findExactDuplicate(base, [live])?.reference, "a7group-1001");
  assert.match(listingDuplicateError(base, [live]), /a7group-1001/);
});

test("does not reject when any property field is different", () => {
  assert.equal(findExactDuplicate({ ...base, unit_no: "102" }, [live]), null);
  assert.equal(findExactDuplicate({ ...base, beds: 4 }, [live]), null);
  assert.equal(findExactDuplicate({ ...base, area_sqft: 1300 }, [live]), null);
  assert.equal(findExactDuplicate({ ...base, permit_number: "999" }, [live]), null);
  assert.equal(findExactDuplicate({ ...base, purpose: "sale" }, [live]), null);
  assert.equal(findExactDuplicate({ ...base, building: "Building 5" }, [live]), null);
  assert.equal(findExactDuplicate({ ...base, community: "Villanova" }, [live]), null);
});

test("does not reject archived, self, or incomplete identity", () => {
  assert.equal(findExactDuplicate(base, [{ ...live, status: "archived", pf_is_live: "" }]), null);
  assert.equal(findExactDuplicate(base, [{ ...live, status: "archived", pf_is_live: "1", pf_state: "live" }]), null);
  assert.equal(findExactDuplicate({ ...base, id: "old" }, [live]), null);
  assert.equal(findExactDuplicate({ ...base, unit_no: "", permit_number: "" }, [live]), null);
});

test("treats 1200 and '1200' size as the same property", () => {
  assert.equal(sameProperty(base, { ...live, area_sqft: "1200" }), true);
});
