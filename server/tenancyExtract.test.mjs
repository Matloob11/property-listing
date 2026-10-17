import assert from "node:assert/strict";
import test from "node:test";
import { cleanExtracted } from "./tenancyExtract.js";
import { applyRelatedFields, keepUserValue, relatedFormFields } from "./tenancyPhotoFields.js";

test("title deed synonym keys fill property fields", () => {
  const data = cleanExtracted({
    documentType: "title_deed",
    fields: {
      ownerName: { value: "Ahmed Ali", confidence: 0.9 },
      community: { value: "International City", confidence: 0.85 },
      buildingNo: { value: "Y-23", confidence: 0.8 },
      unitNo: { value: "22", confidence: 0.8 },
      titleDeedPropertyType: { value: "Shop", confidence: 0.9 },
      plotAreaSqm: { value: "45.2", confidence: 0.8 },
      plotNo: { value: "123", confidence: 0.7 },
    },
  });
  assert.equal(data.landlordName, "Ahmed Ali");
  assert.equal(data.location, "International City");
  assert.equal(data.building, "Y-23");
  assert.equal(data.propertyNo, "22");
  assert.equal(data.propertyType, "Shop");
  assert.equal(data.size, "45.2");
  assert.equal(data.plotNo, "123");
  assert.equal(data.usage, "Commercial");
  assert.equal(data.tenantName, undefined);
});

test("title deed label noise does not wipe property values", () => {
  const data = cleanExtracted({
    documentType: "title_deed",
    fields: {
      location: { value: "Al Warsan First — Dubai Land Department", confidence: 0.7 },
      propertyType: { value: "Villa Title Deed", confidence: 0.6 },
      building: { value: "1", confidence: 0.55 },
    },
  });
  assert.equal(data.location, "Al Warsan First");
  assert.equal(data.propertyType, "Villa");
  assert.equal(data.building, "1");
  assert.equal(data.usage, "Residential");
});

test("title deed suite area in sqft converts to sqm", () => {
  const data = cleanExtracted({
    documentType: "title_deed",
    fields: {
      plotAreaSqft: { value: "1000", confidence: 0.8 },
    },
  });
  assert.equal(data.size, "92.9");
});

test("title deed does not invent tenant or rent fields", () => {
  const data = cleanExtracted({
    documentType: "title_deed",
    fields: {
      tenantName: { value: "Should Ignore", confidence: 0.9 },
      annualRent: { value: "55000", confidence: 0.9 },
      landlordName: { value: "Omar Khan", confidence: 0.9 },
      location: { value: "Business Bay", confidence: 0.8 },
    },
  });
  assert.equal(data.landlordName, "Omar Khan");
  assert.equal(data.location, "Business Bay");
  assert.equal(data.tenantName, undefined);
  assert.equal(data.annualRent, undefined);
});

test("emirates id still fills tenant name", () => {
  const data = cleanExtracted({
    documentType: "other",
    fields: {
      tenantName: { value: "Sara Ali", confidence: 0.95 },
      tenantPhone: { value: "0501234567", confidence: 0.9 },
    },
  });
  assert.equal(data.tenantName, "Sara Ali");
  assert.equal(data.tenantPhone, "0501234567");
});

test("factory property type sets industrial usage", () => {
  const data = cleanExtracted({
    documentType: "title_deed",
    fields: {
      propertyType: { value: "Factory", confidence: 0.9 },
    },
  });
  assert.equal(data.propertyType, "Factory");
  assert.equal(data.usage, "Industrial");
});

test("tenancy contract fills names, property, and rent", () => {
  const data = cleanExtracted({
    documentType: "tenancy",
    fields: {
      tenantName: { value: "Sara Ali", confidence: 0.95 },
      landlordName: { value: "Omar Khan", confidence: 0.95 },
      location: { value: "Business Bay", confidence: 0.9 },
      building: { value: "Bay Square", confidence: 0.9 },
      propertyNo: { value: "1204", confidence: 0.9 },
      propertyType: { value: "Office", confidence: 0.9 },
      size: { value: "80", confidence: 0.8 },
      dateFrom: { value: "2026-01-01", confidence: 0.9 },
      dateTo: { value: "2026-12-31", confidence: 0.9 },
      annualRent: { value: "120000", confidence: 0.9 },
      deposit: { value: "10000", confidence: 0.85 },
      paymentMode: { value: "04 cheques", confidence: 0.9 },
    },
  });
  assert.equal(data.tenantName, "Sara Ali");
  assert.equal(data.landlordName, "Omar Khan");
  assert.equal(data.location, "Business Bay");
  assert.equal(data.building, "Bay Square");
  assert.equal(data.propertyNo, "1204");
  assert.equal(data.propertyType, "Office");
  assert.equal(data.size, "80");
  assert.equal(data.annualRent, "120000");
  assert.equal(data.deposit, "10000");
  assert.equal(data.paymentMode, "04 cheques");
});

test("photo extract maps two and three cheque payment modes", () => {
  const two = cleanExtracted({
    documentType: "tenancy",
    fields: { paymentMode: { value: "2 cheques", confidence: 0.9 } },
  });
  const three = cleanExtracted({
    documentType: "tenancy",
    fields: { paymentMode: { value: "03 cheques", confidence: 0.9 } },
  });
  assert.equal(two.paymentMode, "02 cheques");
  assert.equal(three.paymentMode, "03 cheques");
});

test("related fields from any upload fill the matching form boxes", () => {
  const deed = cleanExtracted({
    documentType: "title_deed",
    fields: {
      ownerName: { value: "Ahmed Ali", confidence: 0.9 },
      community: { value: "International City", confidence: 0.85 },
      buildingNo: { value: "Y-23", confidence: 0.8 },
      unitNo: { value: "22", confidence: 0.8 },
      titleDeedPropertyType: { value: "Shop", confidence: 0.9 },
      plotAreaSqm: { value: "45.2", confidence: 0.8 },
    },
  });
  const form = applyRelatedFields(
    { tenantName: "Already Typed", landlordName: "", location: "", building: "", propertyNo: "", size: "" },
    deed
  );
  assert.equal(form.tenantName, "Already Typed");
  assert.equal(form.landlordName, "Ahmed Ali");
  assert.equal(form.location, "International City");
  assert.equal(form.building, "Y-23");
  assert.equal(form.propertyNo, "22");
  assert.equal(form.size, "45.2");
  const keys = relatedFormFields(deed);
  assert.ok(keys.landlordName && keys.location && keys.building && keys.propertyNo && keys.size);
});

test("typed or selected owner name is not replaced by a later upload or listing", () => {
  assert.equal(keepUserValue("Matloob Khan", "Ahmed Ali"), "Matloob Khan");
  assert.equal(keepUserValue("", "Ahmed Ali"), "Ahmed Ali");
  const deed = cleanExtracted({
    documentType: "title_deed",
    fields: {
      ownerName: { value: "Ahmed Ali", confidence: 0.9 },
      community: { value: "International City", confidence: 0.85 },
    },
  });
  const form = applyRelatedFields(
    { tenantName: "Sara Ali", landlordName: "Matloob Khan", location: "" },
    deed,
    "property"
  );
  assert.equal(form.landlordName, "Matloob Khan");
  assert.equal(form.location, "International City");
  const fromOwnerSlot = applyRelatedFields(
    { landlordName: "Matloob Khan" },
    deed,
    "owner"
  );
  assert.equal(fromOwnerSlot.landlordName, "Ahmed Ali");
});
