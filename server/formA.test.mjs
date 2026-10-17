import assert from "node:assert/strict";
import test from "node:test";
import {
  VERIFICATION_TYPES,
  addMonthsFormA,
  emptyFormA,
  formFromListing,
  isoFormADate,
  missingDetails,
  normalizeForm,
  stepMissing,
} from "./formAModel.js";
import { formAPdf } from "./formAPdf.js";

test("owner verification type is only Dubai Brokers identity options", () => {
  assert.deepEqual(VERIFICATION_TYPES, ["Date of Birth", "Emirates ID Number", "Passport Number"]);
  assert.equal(normalizeForm({ ownerVerification: "Emirates ID Number" }).ownerVerification, "Emirates ID Number");
  assert.equal(normalizeForm({ ownerVerification: "Title Deed" }).ownerVerification, "");
});

test("Form A stays a draft until every official step and terms are complete", () => {
  const draft = normalizeForm(emptyFormA());
  assert.equal(stepMissing(0, draft), "Select owner company or owner person.");
  assert.equal(missingDetails(draft), "Select owner company or owner person.");
  assert.equal(missingDetails(draft, { submitting: false }), "Select owner company or owner person.");
});

test("listing fills property and price, submit still needs owner type and terms", () => {
  const data = formFromListing({
    id: "L1",
    reference: "a7group-100",
    title_deed: "105256/2024",
    permit_issue_date: "2024-03-01",
    type: "land",
    community: "The Acres",
    city: "Dubai",
    area_sqft: 4640,
    landlord_name: "Toolika Kanungo",
    sale_price: "2400000",
  });
  assert.equal(data.certificateNumber, "105256/2024");
  assert.equal(data.certificateYear, "2024");
  assert.equal(data.propertyType, "Land");
  assert.equal(data.location, "The Acres, Dubai");
  assert.equal(data.ownerNameEn, "Toolika Kanungo");
  assert.equal(
    formFromListing({ ...{ id: "L2", unit_no: "12" } }).plotNumber,
    "12"
  );
  assert.ok(Number(data.sizeSqm) > 400);
  assert.match(data.contractEnd, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(stepMissing(0, data), "Select owner company or owner person.");
  const ready = normalizeForm({
    ...data,
    ownerKind: "person",
    ownerVerification: "Emirates ID Number",
    ownerVerificationValue: "784-1234-1234567-1",
    noTenancy: "1",
    acceptedTerms: "",
  });
  assert.equal(missingDetails(ready), "");
  assert.match(missingDetails(ready, { submitting: true }), /terms/i);
  assert.match(
    stepMissing(1, { ...ready, ownerVerificationValue: "" }),
    /Emirates ID Number/
  );
});

test("date fields convert between desk and official day-month-year", () => {
  assert.equal(isoFormADate("23/09/2026"), "2026-09-23");
  assert.equal(isoFormADate("2026-09-23"), "2026-09-23");
});

test("two-month contract end date and PDF bytes", () => {
  assert.equal(addMonthsFormA("23/09/2026", 2), "23/11/2026");
  const pdf = formAPdf(
    normalizeForm({
      ownerKind: "person",
      certificateNumber: "105256/2024",
      certificateYear: "2024",
      propertyType: "Land",
      location: "Wadi Al Safa 7",
      sizeSqm: "431.03",
      ownerNameEn: "Toolika Kanungo",
      noTenancy: "1",
      sellPrice: "2400000",
      acceptedTerms: "1",
    })
  );
  assert.ok(pdf.slice(0, 4).toString() === "%PDF");
  assert.ok(pdf.length > 800);
});
