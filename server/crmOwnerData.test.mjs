import assert from "node:assert/strict";
import test from "node:test";
import { assertReadMethod } from "./crmIntelligence.js";
import {
  assembleOwnerData,
  checkCrmOwnerData,
  clearCrmOwnerDataCache,
  collectOwnerPages,
  findOwnerField,
  isSuspiciouslySmallOwnerPull,
  purposeOf,
  availabilityPurposeOf,
  bedsOf,
  inventoryCommunity,
  typeOf,
} from "./crmOwnerData.js";

const FIELDS = {
  ufCrm10_1: { title: "Community" },
  ufCrm10_2: { title: "No. of Bedroom" },
  ufCrm10_3: { title: "Unit Type", items: [{ ID: "9", VALUE: "Townhouse" }] },
  ufCrm10_4: { title: "Purpose" },
  ufCrm10_5: { title: "Owner" },
  ufCrm10_6: { title: "Owner no" },
  ufCrm10_10: { title: "Tenant" },
  ufCrm10_7: { title: "Size (sq ft)" },
  ufCrm10_8: { title: "Selling Price" },
  ufCrm10_9: { title: "Source" },
};

const AVAIL_STAGES = [
  { STATUS_ID: "DT1042_14:RENT", NAME: "Rent Availability" },
  { STATUS_ID: "DT1042_14:SALE", NAME: "Sale Availability" },
  { STATUS_ID: "DT1042_14:BOTH", NAME: "Sale/Rent availability" },
  { STATUS_ID: "DT1042_14:NEW", NAME: "New Availability" },
];

test("owner field titles map from Bitrix labels", () => {
  assert.equal(findOwnerField(FIELDS, ["community"]), "ufCrm10_1");
  assert.equal(findOwnerField(FIELDS, ["bedroom", "beds"]), "ufCrm10_2");
  assert.equal(findOwnerField(FIELDS, ["unittype"]), "ufCrm10_3");
  assert.equal(findOwnerField(FIELDS, ["purpose"]), "ufCrm10_4");
  assert.equal(findOwnerField(FIELDS, ["owner"], ["ownerno"]), "ufCrm10_5");
  assert.equal(purposeOf("For Rent", ""), "rent");
  assert.equal(purposeOf("", "Sale Availability"), "sale");
  assert.equal(purposeOf("", "Sale/Rent availability"), "sale_rent");
  assert.equal(availabilityPurposeOf("Rent Availability"), "rent");
  assert.equal(availabilityPurposeOf("Sale Availability"), "sale");
  assert.equal(availabilityPurposeOf("Sale/Rent availability"), "sale_rent");
  assert.equal(availabilityPurposeOf("New Availability"), "");
  assert.equal(availabilityPurposeOf("", "DT1042_14:SALE"), "sale");
  assert.equal(availabilityPurposeOf("DT1042_14:SALE", "DT1042_14:SALE"), "sale");
  assert.equal(availabilityPurposeOf("", "DT1042_14:BOTH"), "sale_rent");
  assert.equal(typeOf("Apartment", 2), "Apartment");
  assert.equal(typeOf("Studio", null), "Studio");
  assert.equal(typeOf("", 0), "Studio");
  assert.equal(typeOf("Shop", 0), "Shop");
  assert.equal(typeOf("Retail Shop", 1), "Shop");
  assert.equal(typeOf("971501234567", 2), "Other");
  assert.equal(typeOf("3", 2), "Other");
  assert.equal(typeOf("0", 4), "Other");
  assert.equal(typeOf("", 0), "Studio");
  assert.equal(bedsOf("4 Bedrooms"), 4);
  assert.equal(bedsOf("1 B/R"), 1);
  assert.equal(bedsOf("3b1"), 3);
  assert.equal(bedsOf("7+"), 7);
  assert.equal(bedsOf("31"), null);
  assert.equal(bedsOf("434"), null);
  assert.equal(bedsOf("Studio"), 0);
  const place = inventoryCommunity({
    community: "Empty community",
    communityText: "International City",
    subCommunity: "England Cluster",
    agentName: "Asma Aslam",
  });
  assert.equal(place.community, "International City");
  assert.equal(place.cluster, "England Cluster");
  const acres = inventoryCommunity({ community: "Empty community", communityText: "The Acres", subCommunity: "The Acres" });
  assert.equal(acres.community, "The Acres");
  assert.equal(acres.cluster, "No cluster");
  const clusterName = inventoryCommunity({ community: "Greece Cluster", subCommunity: "" });
  assert.equal(clusterName.community, "International City");
  assert.equal(clusterName.cluster, "Greece Cluster");
});

test("community entity ids resolve to names", () => {
  const fields = {
    parentId1058: { title: "Community", type: "crm_entity" },
    ufCrm5_1734246780476: { title: "No. of Bedroom" },
    ufCrm5_1734246899822: { title: "Unit Type" },
    ufCrm5_1734247157896: { title: "Purpose" },
  };
  const out = assembleOwnerData(
    [
      {
        id: 1,
        title: "Sharada",
        stageId: "DT1042_14:RENT",
        parentId1058: 14,
        ufCrm5_1734246899822: "Townhouse",
        ufCrm5_1734247157896: "For Rent",
      },
      {
        id: 2,
        title: "Feryal",
        stageId: "DT1042_14:SALE",
        parentId1058: 6,
        ufCrm5_1734246899822: "Apartment",
        ufCrm5_1734247157896: "For Sale",
      },
    ],
    fields,
    "Asma Aslam",
    AVAIL_STAGES,
    { communityTitles: { 6: "International City", 14: "Mudon" } }
  );
  assert.equal(out.communities.find((row) => row.name === "Mudon").count, 1);
  assert.equal(out.communities.find((row) => row.name === "International City").count, 1);
  assert.equal(out.properties[0].community, "Mudon");
});

test("community chart matches CRM linked Community, not Mudon Al Ranim text", () => {
  const fields = {
    parentId1058: { title: "Community", type: "crm_entity" },
    ufCrm5_1777563155595: { title: "community text" },
    ufCrm5_1768487008300: { title: "cluster" },
    ufCrm5_1734247157896: { title: "Purpose" },
  };
  const out = assembleOwnerData(
    [
      {
        id: 21,
        title: "Minahil rent",
        stageId: "DT1042_14:RENT",
        ufCrm5_1777563155595: "Mudon Al Ranim 5",
        ufCrm5_1734247157896: "For Rent",
      },
      {
        id: 22,
        title: "Linked Mudon",
        stageId: "DT1042_14:RENT",
        parentId1058: 14,
        ufCrm5_1734247157896: "For Rent",
      },
    ],
    fields,
    "minahil sanaullah",
    AVAIL_STAGES,
    { communityTitles: { 14: "Mudon" } }
  );
  assert.equal(out.properties[0].community, "Empty community");
  assert.equal(out.properties[0].communityLinked, false);
  assert.equal(out.communities.find((row) => row.name === "Mudon")?.count, 1);
});

test("owner community and beds fall back to text fields", () => {
  const fields = {
    parentId1058: { title: "Community", type: "crm_entity" },
    ufCrm5_1777563155595: { title: "community text" },
    ufCrm5_1768487008300: { title: "cluster" },
    ufCrm5_1770020172403: { title: "bed" },
    ufCrm5_1734247157896: { title: "Purpose" },
  };
  const out = assembleOwnerData(
    [
      {
        id: 10,
        title: "FAWAD",
        stageId: "DT1042_14:RENT",
        ufCrm5_1777563155595: "International City",
        ufCrm5_1768487008300: "England Cluster",
        ufCrm5_1770020172403: "1 B/R",
        ufCrm5_1734247157896: "For Rent",
      },
      {
        id: 11,
        title: "HANY",
        stageId: "DT1042_14:SALE",
        ufCrm5_1777563155595: "Mudon Al Ranim 7",
        ufCrm5_1770020172403: "3",
        ufCrm5_1734247157896: "For Sale",
      },
    ],
    fields,
    "Asma Aslam",
    AVAIL_STAGES
  );
  assert.equal(out.properties[0].community, "Empty community");
  assert.equal(out.properties[0].communityLinked, false);
  assert.equal(out.properties[0].subCommunity, "England Cluster");
  assert.equal(out.properties[0].subCommunityLinked, false);
  assert.equal(out.properties[0].bedLabel, "1 Bedroom");
  assert.equal(out.properties[1].community, "Empty community");
  assert.equal(out.properties[1].communityLinked, false);
  assert.equal(out.properties[1].subCommunity, "Mudon Al Ranim 7");
  assert.equal(out.properties[1].beds, 3);
  // Free-text clusters stay on the row but do not inflate Sub Community chart.
  assert.equal((out.subCommunities || []).length, 0);
  assert.ok(!out.communities.find((row) => row.name === "Mudon"));
  assert.ok(!out.communities.find((row) => row.name === "International City"));

  const fromSub = assembleOwnerData(
    [
      {
        id: 12,
        title: "Owner Data #6599",
        stageId: "DT1042_14:RENT",
        ufCrm5_1768487008300: "RANIM 8 ",
        ufCrm5_1734247157896: "For Rent",
      },
    ],
    fields,
    "Asma Aslam",
    AVAIL_STAGES
  );
  assert.equal(fromSub.properties[0].community, "Empty community");
  assert.equal(fromSub.properties[0].communityLinked, false);
  assert.equal(fromSub.properties[0].subCommunity, "RANIM 8");

  const junk = assembleOwnerData(
    [
      {
        id: 13,
        title: "TALHA AU SHEIKH",
        stageId: "DT1042_14:RENT",
        sourceId: "UC_7J0E2Q",
        ufCrm5_1734247157896: "For Rent",
      },
      {
        id: 14,
        title: "naveed",
        stageId: "DT1042_14:SALE",
        ufCrm5_1777563155595: "raja",
        ufCrm5_1734247157896: "For Sale",
      },
      {
        id: 15,
        title: "note",
        stageId: "DT1042_14:RENT",
        ufCrm5_1777563155595: "Reh man, 3br, g+1",
        ufCrm5_1734247157896: "For Rent",
      },
    ],
    fields,
    "Asma Aslam",
    AVAIL_STAGES
  );
  assert.equal(junk.properties[0].community, "Empty community");
  assert.equal(junk.properties[1].community, "Empty community");
  assert.equal(junk.properties[2].community, "Empty community");
  assert.ok(!junk.communities.some((row) => /talha|naveed|raja|reh|uc_/i.test(row.name)));
});

test("sub community chart counts only linked Bitrix Sub Community field", () => {
  const fields = {
    parentId1058: { title: "Community", type: "crm_entity" },
    parentId1062: { title: "Sub Community", type: "crm_entity" },
    ufCrm5_1777563155595: { title: "community text" },
    ufCrm5_1768487008300: { title: "cluster" },
    ufCrm5_1734247157896: { title: "Purpose" },
  };
  const out = assembleOwnerData(
    [
      {
        id: 111506,
        title: "MUHAMMAD RAHIM",
        stageId: "DT1042_14:SALE",
        parentId1058: 6,
        parentId1062: 49,
        ufCrm5_1768487008300: "Grece cluster",
        ufCrm5_1734247157896: "For Sale",
      },
      {
        id: 109673,
        title: "OLEH KOPACH",
        stageId: "DT1042_14:SALE",
        ufCrm5_1777563155595: "International City",
        ufCrm5_1768487008300: "Grece cluster",
        ufCrm5_1734247157896: "For Sale",
      },
    ],
    fields,
    "mehnaz",
    AVAIL_STAGES,
    { communityTitles: { 6: "International City", 49: "Greece Cluster" } }
  );
  assert.equal(out.properties[0].subCommunity, "Greece Cluster");
  assert.equal(out.properties[0].subCommunityLinked, true);
  assert.equal(out.properties[1].subCommunity, "Grece cluster");
  assert.equal(out.properties[1].subCommunityLinked, false);
  assert.equal(out.subCommunities.length, 1);
  assert.equal(out.subCommunities[0].name, "Greece Cluster");
  assert.equal(out.subCommunities[0].count, 1);
});

test("owner data counts only availability stages rent sale sale-rent", () => {
  const out = assembleOwnerData(
    [
      {
        id: 1,
        title: "Sharada Basyal",
        stageId: "DT1042_14:RENT",
        ufCrm10_1: "Mudon",
        ufCrm10_2: "4 Bedrooms",
        ufCrm10_3: "9",
        ufCrm10_4: "For Rent",
        ufCrm10_5: "Sharada Basyal",
        ufCrm10_8: "3610000",
      },
      {
        id: 2,
        title: "Feryal",
        stageId: "DT1042_14:SALE",
        ufCrm10_1: "International City",
        ufCrm10_2: "3 Bedrooms",
        ufCrm10_3: "Apartment",
        ufCrm10_4: "For Sale",
      },
      {
        id: 3,
        title: "Studio shop",
        stageId: "DT1042_14:RENT",
        ufCrm10_1: "Mudon",
        ufCrm10_2: "Studio",
        ufCrm10_3: "Shop",
        ufCrm10_4: "For Rent",
      },
      {
        id: 4,
        title: "Old lead",
        stageId: "DT1042_14:NEW",
        ufCrm10_1: "Mudon",
        ufCrm10_4: "For Rent",
      },
      {
        id: 5,
        title: "Both",
        stageId: "DT1042_14:BOTH",
        ufCrm10_1: "Mudon",
        ufCrm10_4: "For Sale/Rent",
      },
    ],
    FIELDS,
    "Asma Aslam",
    AVAIL_STAGES
  );
  assert.equal(out.source, "owner_data");
  assert.equal(out.scope, "availability_stages");
  assert.equal(out.total, 4);
  assert.equal(out.rent, 2);
  assert.equal(out.sale, 1);
  assert.equal(out.saleRent, 1);
  assert.equal(out.allAssigned, 5);
  assert.equal(out.types.find((row) => row.name === "Townhouse").count, 1);
  assert.equal(out.types.find((row) => row.name === "Shop").count, 1);
  assert.equal(out.beds.find((row) => row.name === "Studio").count, 1);
  assert.equal(out.communities.find((row) => row.name === "Mudon").count, 3);
});

test("sale availability counts from stage id if Bitrix stage list omitted the name", () => {
  const out = assembleOwnerData(
    [{ id: 9, title: "Villa", stageId: "DT1042_14:SALE", ufCrm10_4: "For Sale" }],
    FIELDS,
    "Asma Aslam",
    []
  );
  assert.equal(out.sale, 1);
  assert.equal(out.total, 1);
  assert.equal(out.rent, 0);
});

test("owner data is agent scoped and cached", async () => {
  clearCrmOwnerDataCache();
  const methods = [];
  const post = async (method, params) => {
    methods.push(method);
    if (method === "crm.item.fields") return { result: { fields: FIELDS } };
    if (method === "crm.status.list") {
      if (params?.filter?.ENTITY_ID === "SOURCE") return { result: [{ STATUS_ID: "UC_7J0E2Q", NAME: "Personal" }] };
      return { result: [{ STATUS_ID: "DT1042_14:RENT", NAME: "Rent Availability" }] };
    }
    if (method === "crm.item.list") {
      assert.equal(params.entityTypeId, 1042);
      assert.equal(params.filter.assignedById, 4);
      return {
        result: { items: [{ id: 11, title: "Owner A", stageId: "DT1042_14:RENT", ufCrm10_4: "For Rent", ufCrm10_1: "Mudon", ufCrm10_3: "Apartment" }] },
      };
    }
    throw new Error(`unexpected ${method}`);
  };
  const db = { store: {}, async getSetting() { return null; }, async setSetting(key, value) { this.store[key] = value; } };
  const first = await checkCrmOwnerData({ db, agentId: "4", agentName: "Asma Aslam", post, sleep: async () => {} });
  assert.equal(first.ok, true);
  assert.equal(first.cached, false);
  assert.equal(first.total, 1);
  assert.equal(first.rent, 1);
  assert.equal(first.communities[0].name, "Mudon");
  assert.ok(methods.includes("crm.item.list"));
  assert.ok(!methods.includes("crm.activity.list"));
  const listCalls = methods.filter((name) => name === "crm.item.list").length;
  assert.ok(listCalls >= 1);
  const second = await checkCrmOwnerData({ db, agentId: "4", agentName: "Asma Aslam", post, sleep: async () => {} });
  assert.equal(second.cached, true);
  assert.equal(methods.filter((name) => name === "crm.item.list").length, listCalls);
  const third = await checkCrmOwnerData({
    db,
    agentId: "4",
    agentName: "Asma Aslam",
    force: true,
    post,
    sleep: async () => {},
  });
  assert.equal(third.cached, false);
  assert.ok(methods.filter((name) => name === "crm.item.list").length > listCalls);
});

test("a Check that verifies a smaller Owner Data pull replaces the old snapshot", async () => {
  clearCrmOwnerDataCache();
  let items = [
    { id: 11, title: "Owner A", stageId: "DT1042_14:RENT", ufCrm10_4: "For Rent" },
    { id: 12, title: "Owner B", stageId: "DT1042_14:RENT", ufCrm10_4: "For Rent" },
  ];
  const post = async (method, params) => {
    if (method === "crm.item.fields") return { result: { fields: FIELDS } };
    if (method === "crm.status.list") {
      if (params?.filter?.ENTITY_ID === "SOURCE") return { result: [] };
      return { result: [{ STATUS_ID: "DT1042_14:RENT", NAME: "Rent Availability" }] };
    }
    if (method === "crm.item.list") {
      return { result: { items } };
    }
    throw new Error(`unexpected ${method}`);
  };
  const db = { store: {}, async getSetting(key) { return this.store[key] || null; }, async setSetting(key, value) { this.store[key] = value; } };
  const first = await checkCrmOwnerData({ db, agentId: "4", agentName: "Asma Aslam", post, sleep: async () => {} });
  assert.equal(first.verified, true);
  assert.equal(first.total, 2);
  items = [items[0]];
  const second = await checkCrmOwnerData({
    db,
    agentId: "4",
    agentName: "Asma Aslam",
    force: true,
    post,
    sleep: async () => {},
  });
  assert.equal(second.cached, false);
  assert.equal(second.fromLastVerified, undefined);
  assert.equal(second.total, 1);
  assert.equal(second.rent, 1);
});

test("owner name comes from official owner field not card title", () => {
  const fields = {
    ...FIELDS,
    ufCrm5_1768314832600: { title: "Owner" },
  };
  const out = assembleOwnerData(
    [
      {
        id: 1,
        title: "Asma Aslam",
        stageId: "DT1042_14:RENT",
        ufCrm5_1768314832600: "Landlord Ali",
      },
      {
        id: 2,
        title: "Mehnaz",
        stageId: "DT1042_14:SALE",
      },
    ],
    fields,
    "Asma Aslam",
    AVAIL_STAGES
  );
  assert.equal(out.properties.find((row) => row.id === "1").owner, "Landlord Ali");
  assert.equal(out.properties.find((row) => row.id === "2").owner, "");
});

test("owner data tenant field is not the card title", () => {
  const fields = {
    ...FIELDS,
    ufCrm10_10: { title: "Tenant" },
  };
  const out = assembleOwnerData(
    [
      {
        id: 1,
        title: "Asma Aslam",
        stageId: "DT1042_14:RENT",
        ufCrm10_10: "Renter Ali",
      },
      {
        id: 2,
        title: "Mehnaz",
        stageId: "DT1042_14:SALE",
      },
    ],
    fields,
    "Asma Aslam",
    AVAIL_STAGES
  );
  assert.equal(out.properties.find((row) => row.id === "1").tenant, "Renter Ali");
  assert.equal(out.properties.find((row) => row.id === "2").tenant, "");
});

test("owner data refuses missing agent and allows item reads", async () => {
  assert.equal(assertReadMethod("crm.item.list"), "crm.item.list");
  assert.equal(assertReadMethod("crm.item.fields"), "crm.item.fields");
  await assert.rejects(() => checkCrmOwnerData({ agentId: "", agentName: "" }), /Select an agent first/);
});

test("collectOwnerPages keeps paging when Bitrix total equals page size and next is missing", async () => {
  const page1 = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, title: `A${i + 1}` }));
  const page2 = Array.from({ length: 12 }, (_, i) => ({ id: 51 + i, title: `B${i + 1}` }));
  const starts = [];
  const post = async (_method, params) => {
    starts.push(params.start);
    if (params.start === 0) return { result: page1, total: 50 };
    if (params.start === 50) return { result: page2, total: 50 };
    return { result: [] };
  };
  const out = await collectOwnerPages(post, { stageId: "RENT" }, async () => {});
  assert.deepEqual(starts, [0, 50]);
  assert.equal(out.rows.length, 62);
  assert.equal(out.truncated, false);
});

test("suspiciously small Owner Data pulls are rejected so a 50-card page cannot replace 589", () => {
  assert.equal(isSuspiciouslySmallOwnerPull(589, 50), true);
  assert.equal(isSuspiciouslySmallOwnerPull(589, 589), false);
  assert.equal(isSuspiciouslySmallOwnerPull(589, 600), false);
  assert.equal(isSuspiciouslySmallOwnerPull(40, 30), false);
});

test("collectOwnerPages marks truncated when Bitrix total is larger than fetched rows", async () => {
  const page1 = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));
  const post = async () => ({ result: page1, total: 589 });
  const out = await collectOwnerPages(post, { stageId: "RENT" }, async () => {});
  assert.equal(out.rows.length, 40);
  assert.equal(out.truncated, true);
});
