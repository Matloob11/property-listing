import assert from "node:assert/strict";
import {
  assembleLeadBreakdown,
  bedsLabelOf,
  mapLeadRow,
  purposeOfLead,
} from "./crmLeadBreakdown.js";

assert.equal(purposeOfLead("Tenant"), "rent");
assert.equal(purposeOfLead("Buyer"), "sale");
assert.equal(purposeOfLead(""), "unknown");
assert.equal(purposeOfLead("", { opportunity: 460000 }), "sale");
assert.equal(purposeOfLead("", { opportunity: 40000 }), "rent");
assert.equal(purposeOfLead("", { listingPurpose: "for rent" }), "rent");
assert.equal(purposeOfLead("1220"), "rent");
assert.equal(purposeOfLead("972"), "sale");
assert.equal(bedsLabelOf("0 B/R"), "Studio");
assert.equal(bedsLabelOf("1 B/R"), "1 Bedroom");
assert.equal(bedsLabelOf("3 B/R"), "3 Bedroom");
assert.equal(bedsLabelOf("26"), "Studio");
assert.equal(bedsLabelOf("27"), "1 Bedroom");


const row = mapLeadRow(
  {
    ID: "1",
    TITLE: "Bayut WhatsApp | Test",
    UF_CRM_1770537051525: "International City",
    UF_CRM_1731838126127: "26",
    UF_CRM_1760707292: "2",
    UF_CRM_1756638760279: "1220",
    UF_CRM_1763390179: "49",
  },
  {
    UF_CRM_1731838126127: { items: [{ ID: "26", VALUE: "0 B/R" }] },
    UF_CRM_1756638760279: { items: [{ ID: "1220", VALUE: "Tenant" }] },
  },
  {
    types: { 2: "Apartment" },
    subCommunities: { 49: "Greece Cluster" },
    communities: {},
  }
);
assert.equal(row.purpose, "rent");
assert.equal(row.clientTypeId, "1220");
assert.equal(row.community, "International City");
assert.equal(row.type, "Apartment");
assert.equal(row.bedLabel, "Studio");
assert.equal(row.unitKind, "studio");
assert.equal(row.subCommunity, "Greece Cluster");

const shop = mapLeadRow(
  {
    ID: "8",
    TITLE: "Shop lead",
    UF_CRM_1731838126127: "26",
    UF_CRM_1760707292: "9",
  },
  { UF_CRM_1731838126127: { items: [{ ID: "26", VALUE: "0 B/R" }] } },
  { types: { 9: "Shop" } }
);
assert.equal(shop.type, "Shop");
assert.equal(shop.bedLabel, "Shop");
assert.equal(shop.unitKind, "shop");
assert.equal(shop.beds, null);

const out = assembleLeadBreakdown(
  [
    {
      ID: "1",
      TITLE: "A",
      UF_CRM_1770537051525: "Mudon",
      UF_CRM_1731838126127: "29",
      UF_CRM_1760707292: "768",
      UF_CRM_1756638760279: "972",
    },
    {
      ID: "2",
      TITLE: "B",
      UF_CRM_1770537051525: "International City",
      UF_CRM_1731838126127: "26",
      UF_CRM_1760707292: "2",
      UF_CRM_1756638760279: "1220",
    },
    {
      ID: "3",
      TITLE: "C",
      UF_CRM_1770537051525: "International City",
      UF_CRM_1731838126127: "26",
      UF_CRM_1760707292: "2",
    },
  ],
  {
    UF_CRM_1731838126127: {
      items: [
        { ID: "26", VALUE: "0 B/R" },
        { ID: "29", VALUE: "3 B/R" },
      ],
    },
    UF_CRM_1756638760279: {
      items: [
        { ID: "1220", VALUE: "Tenant" },
        { ID: "972", VALUE: "Buyer" },
      ],
    },
  },
  { types: { 2: "Apartment", 768: "Villa" }, subCommunities: {}, communities: {} }
);

assert.equal(out.total, 3);
assert.equal(out.rent, 1);
assert.equal(out.sale, 1);
assert.equal(out.unknown, 1);
assert.equal(out.communities.find((row) => row.name === "International City").count, 2);
assert.equal(out.types.find((row) => row.name === "Apartment").count, 2);
assert.equal(out.beds.find((row) => row.name === "Studio").count, 2);

console.log("crmLeadBreakdown tests ok");
