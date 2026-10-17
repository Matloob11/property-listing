import assert from "node:assert/strict";
import test from "node:test";
import {
  findListingForUnit,
  prettyPropertyType,
  propertyFieldsFromListing,
  propertyFieldsFromUnit,
  usageFromListing,
  usageFromPropertyType,
} from "./tenancyProperty.js";

test("shop listing fills commercial usage and shop type", () => {
  const fields = propertyFieldsFromListing({
    id: "s1",
    category: "commercial",
    type: "shop",
    community: "International City",
    building: "England Cluster Y-23",
    unit_no: "22",
    area_sqft: 484,
    purpose: "rent",
    price_yearly: "55000",
  });
  assert.equal(fields.usage, "Commercial");
  assert.equal(fields.propertyType, "Shop");
  assert.equal(fields.location, "International City");
  assert.equal(fields.building, "England Cluster Y-23");
  assert.equal(fields.propertyNo, "22");
  assert.equal(fields.size, "45");
  assert.equal(fields.annualRent, "55000");
});

test("apartment listing fills residential usage and apartment type", () => {
  const fields = propertyFieldsFromListing({
    id: "a1",
    category: "residential",
    type: "apartment",
    community: "Business Bay",
    building: "Bay Square",
    unit_no: "1204",
  });
  assert.equal(fields.usage, "Residential");
  assert.equal(fields.propertyType, "Apartment");
  assert.equal(fields.propertyNo, "1204");
});

test("villa and hotel apartment stay residential", () => {
  assert.equal(usageFromListing({ category: "residential", type: "villa" }), "Residential");
  assert.equal(prettyPropertyType("hotel_apartment"), "Hotel Apartment");
  assert.equal(usageFromPropertyType("Hotel Apartment"), "Residential");
});

test("office and warehouse listings stay commercial unless industrial", () => {
  assert.equal(usageFromListing({ category: "commercial", type: "office" }), "Commercial");
  assert.equal(prettyPropertyType("office"), "Office");
  assert.equal(usageFromListing({ category: "commercial", type: "warehouse" }), "Commercial");
  assert.equal(prettyPropertyType("warehouse"), "Warehouse");
});

test("labor camp and factory map to industrial", () => {
  assert.equal(prettyPropertyType("labor_camp"), "Labor Camp");
  assert.equal(usageFromPropertyType("Labor Camp"), "Industrial");
  assert.equal(usageFromListing({ category: "industrial", type: "warehouse" }), "Industrial");
  assert.equal(usageFromPropertyType("Factory"), "Industrial");
});

test("bitrix unit title shop updates usage and type", () => {
  const fields = propertyFieldsFromUnit({ title: "England Cluster Y-23 Shop 22", unitNo: "22", building: "Y-23" });
  assert.equal(fields.propertyType, "Shop");
  assert.equal(fields.usage, "Commercial");
  assert.equal(fields.propertyNo, "22");
});

test("international city shop codes become commercial shop", () => {
  const fields = propertyFieldsFromUnit({ title: "O-03 S-06 · Vivekananda" });
  assert.equal(fields.propertyType, "Shop");
  assert.equal(fields.usage, "Commercial");
  assert.equal(fields.propertyNo, "S-06");
  assert.equal(fields.building, "O-03");
  const short = propertyFieldsFromUnit({ title: "Y-15 S08 unit" });
  assert.equal(short.propertyType, "Shop");
  assert.equal(short.usage, "Commercial");
});

test("unit titles are not copied into property type", () => {
  const fields = propertyFieldsFromUnit({ title: "O-03 S-06 · Vivekananda", building: "O-03" });
  assert.equal(fields.propertyType, "Shop");
  assert.ok(!/O-03/.test(fields.propertyType));
});

test("bitrix unit title apartment updates usage and type", () => {
  const fields = propertyFieldsFromUnit({ title: "Bay Square Apartment 1204", unitNo: "1204" });
  assert.equal(fields.propertyType, "Apartment");
  assert.equal(fields.usage, "Residential");
});

test("garden and retail units change usage", () => {
  const garden = propertyFieldsFromUnit({ title: "Rufi Garden G-01 · Owner" });
  assert.equal(garden.propertyType, "Apartment");
  assert.equal(garden.usage, "Residential");
  const retail = propertyFieldsFromUnit({ title: "Petalz By Danube 1 RETAIL-5 · Owner" });
  assert.equal(retail.propertyType, "Retail");
  assert.equal(retail.usage, "Commercial");
});

test("bitrix shop code matches desk listing and keeps listing usage", () => {
  const listing = {
    id: "L2",
    category: "residential",
    type: "apartment",
    unit_no: "S-111",
    building: "Y-15",
    community: "International City",
  };
  const fields = propertyFieldsFromUnit({ title: "Y15 S111 · Owner" }, [listing]);
  assert.equal(fields.listingId, "L2");
  assert.equal(fields.usage, "Residential");
  assert.equal(fields.propertyType, "Apartment");
});

test("bitrix unit matches desk listing when title has no type", () => {
  const listing = {
    id: "L9",
    category: "residential",
    type: "villa",
    unit_no: "12",
    building: "Al Furjan",
    community: "Al Furjan",
  };
  const fields = propertyFieldsFromUnit({ title: "12", unitNo: "12", building: "Al Furjan" }, [listing]);
  assert.equal(fields.listingId, "L9");
  assert.equal(fields.usage, "Residential");
  assert.equal(fields.propertyType, "Villa");
  assert.equal(findListingForUnit({ unitNo: "12", building: "Al Furjan" }, [listing])?.id, "L9");
});
