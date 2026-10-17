import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TENANCY_TERMS,
  SHOP_TENANCY_TERMS,
  VILLA_TENANCY_TERMS,
  isStockTerms,
  normalizeTenancyTerms,
  packFromPropertyType,
  resolveTenancyTerms,
  termsForPack,
} from "./tenancyTerms.js";
import { normalizeForm } from "./tenancy.js";
import { tenancyLayout, tenancyPdf } from "./tenancyPdf.js";

test("villa and shop packs load the matching additional terms", () => {
  assert.equal(packFromPropertyType("Villa"), "villa");
  assert.equal(packFromPropertyType("Shop"), "shop");
  assert.match(termsForPack("villa")[0], /villa will be used/i);
  assert.match(termsForPack("villa")[1], /major maintenance above AED 1,000/i);
  assert.match(termsForPack("villa")[6], /90 days/i);
  assert.match(termsForPack("shop")[0], /shop will be used/i);
  assert.equal(termsForPack("shop").some((line) => /major maintenance/i.test(line)), false);
  assert.equal(isStockTerms(VILLA_TENANCY_TERMS), true);
  assert.equal(isStockTerms(SHOP_TENANCY_TERMS), true);
  assert.equal(isStockTerms(["Custom desk term only."]), false);
});

test("villa terms print on the contract pdf", () => {
  const pdf = tenancyPdf({
    tenantName: "Sara",
    landlordName: "Omar",
    dateFrom: "2026-09-25",
    dateTo: "2027-09-24",
    annualRent: "40000",
    termsPack: "villa",
    terms: termsForPack("villa"),
  });
  const text = pdf.toString("latin1");
  assert.match(text, /villa will be used as per developer community rules/);
  assert.match(text, /90 days prior notice/);
  assert.equal(text.includes("The shop will be used as per developer community rules. Tenant pays any fine"), false);
});

test("missing terms keep the usual A7 additional terms", () => {
  assert.deepEqual(resolveTenancyTerms(undefined), DEFAULT_TENANCY_TERMS);
  assert.equal(resolveTenancyTerms(undefined).length, 8);
});

test("empty saved terms stay empty so a deleted list does not come back", () => {
  assert.deepEqual(resolveTenancyTerms([]), []);
  assert.deepEqual(normalizeTenancyTerms(["", "  Bounce rule  ", null]), ["Bounce rule"]);
  assert.deepEqual(normalizeTenancyTerms({ 1: "Second", 0: "First" }), ["First", "Second"]);
  assert.deepEqual(normalizeForm({ terms: ["Only bounce"] }).terms, ["Only bounce"]);
  assert.deepEqual(normalizeForm({}).terms, DEFAULT_TENANCY_TERMS);
});

test("updated form terms print in full on the pdf, not the old defaults", () => {
  const unique = "Updated desk term: no subletting without the landlord written approval.";
  const pdf = tenancyPdf({
    tenantName: "Sara",
    landlordName: "Omar",
    dateFrom: "2026-09-25",
    dateTo: "2027-09-24",
    annualRent: "40000",
    terms: [unique, "Handover as received."],
  });
  const text = pdf.toString("latin1");
  assert.match(text, /Updated desk term: no subletting without the landlord written approval/);
  assert.match(text, /Handover as received/);
  assert.equal(text.includes("developer community rules"), false);
  assert.equal(text.includes("..."), false);
});

test("edited terms print on page 2 in the same wording as the form", () => {
  const terms = ["Cheque bounce AED 1000.", "Handover ready to move in.", ...Array.from({ length: 8 }, (_, i) => `Extra term ${i + 1}`)];
  const layout = tenancyLayout({ tenantName: "Sara", terms });
  assert.ok(layout.p2.length >= 2);
  assert.match(layout.p2[0].text, /Cheque bounce/);
  const pdf = tenancyPdf({
    tenantName: "Sara",
    landlordName: "Omar",
    dateFrom: "2026-09-25",
    dateTo: "2027-09-24",
    annualRent: "40000",
    paymentMode: "04 cheques",
    terms,
  });
  const text = pdf.toString("latin1");
  assert.match(text, /Cheque bounce AED 1000/);
  assert.match(text, /Extra term 8/);
});
