import assert from "node:assert/strict";
import test from "node:test";
import { findMaintCompany, licenseForCompany, MAINT_COMPANIES } from "./nocMaintCompanies.js";
import { derivedWorkType, maintLetterModel } from "./nocMaintLetter.js";
import { missingDetails, normalizeForm } from "./nocMaint.js";
import { nocMaintPdf } from "./nocMaintPdf.js";

test("letter uses the Nakheel AC format and company license line", () => {
  const letter = maintLetterModel({
    workType: "AC Maintenance",
    recipient: "NAKHEEL",
    ownerName: "AHMED ALI NASEER AL JASARI",
    propertyDetails: "Rutssia cluster V033 S111",
    companyName: "TAREEQ AL FOUZ TECHNICAL SERVICES L.L.C",
    tradeLicense: "6492300",
  });
  assert.equal(letter.title, "NOC for AC Maintenance");
  assert.equal(letter.recipient, "NAKHEEL");
  assert.equal(letter.ref, "NO OBJECTION FOR AC MAINTENANCE");
  assert.equal(letter.propertyRef, "Rutssia cluster V033 S111");
  assert.equal(letter.companyBit, "TAREEQ AL FOUZ TECHNICAL SERVICES L.L.C LICENSE NO: 6492300");
  assert.equal(letter.workPhrase, "AC maintenance");
});

test("scope can fill work when the work field is empty", () => {
  assert.equal(derivedWorkType({ scopeText: "AC servicing and repair" }), "AC Maintenance");
  assert.equal(derivedWorkType({ scopeText: "Pest control\nDeep cleaning" }), "Maintenance");
  assert.equal(derivedWorkType({ workType: "Plumbing Maintenance", scopeText: "Pest control" }), "Plumbing Maintenance");
});

test("each maintenance company fills its exact license number", () => {
  assert.equal(MAINT_COMPANIES.length, 3);
  assert.equal(licenseForCompany("RUKEN AL MARHABHA TECHNOLOGICAL SERVICES"), "10096470");
  assert.equal(licenseForCompany("TAREEQ AL FOUZ TECHNICAL SERVICES L.L.C"), "64692300");
  assert.equal(licenseForCompany("TAREEQ AL FOUZ TECHNICAL SERVICES LLC"), "64692300");
  assert.equal(licenseForCompany("MUHAMMAD UMAR BUILDING MATERIALS TRADING - FZE"), "12204355");
  const data = normalizeForm({
    recipient: "NAKHEEL",
    ownerName: "Sara",
    propertyDetails: "V033",
    companyName: "TAREEQ AL FOUZ TECHNICAL SERVICES LLC",
    tradeLicense: "6492300",
  });
  assert.equal(data.companyName, "TAREEQ AL FOUZ TECHNICAL SERVICES L.L.C");
  assert.equal(data.tradeLicense, "64692300");
  assert.equal(findMaintCompany("unknown"), null);
});

test("form no longer requires a scope list", () => {
  const data = normalizeForm({
    recipient: "NAKHEEL",
    ownerName: "Sara",
    propertyDetails: "V033",
    companyName: "Fix Co",
    tradeLicense: "123",
  });
  assert.equal(missingDetails(data), "");
  assert.equal(data.workType, "AC Maintenance");
});

test("pdf prints the letter and omits the old extra blocks", () => {
  const pdf = nocMaintPdf({
    recipient: "NAKHEEL",
    ownerName: "AHMED ALI NASEER AL JASARI",
    propertyDetails: "Rutssia cluster V033 S111",
    companyName: "TAREEQ AL FOUZ TECHNICAL SERVICES L.L.C",
    tradeLicense: "6492300",
    workType: "AC Maintenance",
  });
  const text = pdf.toString("latin1");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(text, /NOC for AC Maintenance/);
  assert.match(text, /PROPERTY REF:/);
  assert.match(text, /LICENSE NO: 6492300/);
  assert.match(text, /Landlord:/);
  assert.match(text, /developer/);
  assert.match(text, /Rules/);
  assert.match(text, /Signature: ----------------------/);
  assert.doesNotMatch(text, /SCOPE OF WORK ARE BELOW/);
  assert.doesNotMatch(text, /SUBJECT: NO OBJECTION CERTIFICATE/);
  assert.doesNotMatch(text, /Date:/);
});
