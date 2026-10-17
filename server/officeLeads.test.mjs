import assert from "node:assert/strict";
import test from "node:test";
import { LEAD_CLIENT_TYPE, LEAD_COMMUNITY_ID } from "./crmLeadBreakdown.js";
import { officeLeadBlankPath, officeLeadFilterPath, officeLeadRowPath } from "./crmUiLinks.js";
import { officeLeadFacts } from "./officeLeadFacts.js";
import { dubaiStampToUtc, leadIsBlank, officeLeadRange, shapeOfficeLeads, toOfficeLead } from "./officeLeads.js";

test("office leads keep the Bitrix community, cluster, beds and agent", () => {
  const raw = {
    ID: "9",
    TITLE: "Tenant lead",
    ASSIGNED_BY_ID: "2298",
    OPPORTUNITY: "0",
    [LEAD_CLIENT_TYPE]: "1220",
    [LEAD_COMMUNITY_ID]: "55",
  };
  const mapped = {
    id: "9",
    title: "Tenant lead",
    purpose: "rent",
    purposeLabel: "Rent",
    clientTypeId: "1220",
    community: "International City",
    subCommunity: "France Cluster",
    type: "Apartment",
    beds: 1,
    bedLabel: "1 Bedroom",
  };
  const lead = toOfficeLead(raw, mapped, "Asma Aslam");
  assert.equal(lead.agentName, "Asma Aslam");
  assert.equal(lead.statusId, "");
  assert.equal(lead.clientType, "");
  assert.equal(lead.communityId, "55");
  assert.equal(lead.cluster, "France Cluster");
  assert.equal(lead.bedLabel, "1 Bedroom");
  const shaped = shapeOfficeLeads([raw], new Map([["2298", "Asma Aslam"]]), {
    fields: { [LEAD_CLIENT_TYPE]: { items: [{ ID: "1220", VALUE: "Tenant" }] } },
    titles: { communities: { 55: "International City" }, subCommunities: {}, types: {} },
  });
  assert.equal(shaped.total, 1);
  assert.equal(shaped.rent, 1);
  assert.equal(shaped.leads[0].community, "International City");
  assert.equal(shaped.leads[0].blank, false);
  assert.equal(leadIsBlank({ ID: "4", TITLE: "Website", OPPORTUNITY: "0" }), true);
  assert.equal(toOfficeLead({ ID: "4", TITLE: "Website", OPPORTUNITY: "0" }, { id: "4", title: "Website", purpose: "unknown", purposeLabel: "Empty", clientTypeId: "", community: "", subCommunity: "", type: "", beds: null, bedLabel: "—" }, "").blank, true);
});

test("office lead CRM path opens only a single Bitrix field", () => {
  const leads = [
    { id: "1", communityId: "55", clientTypeId: "1220", agentId: "2298", clusterId: "", bedsId: "27", typeId: "" },
    { id: "2", communityId: "55", clientTypeId: "1220", agentId: "2298", clusterId: "", bedsId: "28", typeId: "" },
  ];
  const community = officeLeadFilterPath({
    from: "2026-09-07 00:00:00",
    to: "2026-10-07 23:59:59",
    leads,
    by: "community",
  });
  assert.match(community, /UF_CRM_1763390140=55/);
  assert.equal(community.includes("dynamic_"), false);
  assert.equal(community.includes("UF_CRM_1763390140%5B%5D"), false);
  assert.match(community, /UF_CRM_1756638760279=1220/);
  assert.match(community, /ASSIGNED_BY_ID=2298/);
  assert.equal(
    officeLeadFilterPath({ from: "2026-09-07 00:00:00", to: "2026-10-07 23:59:59", leads, by: "beds" }),
    ""
  );
  const slice = [
    { id: "1", communityId: "55", clientTypeId: "1220", agentId: "2298", clusterId: "", bedsId: "27", typeId: "" },
    { id: "2", communityId: "55", clientTypeId: "", agentId: "2298", clusterId: "", bedsId: "28", typeId: "" },
  ];
  const wider = officeLeadFilterPath({
    from: "2026-09-07 00:00:00",
    to: "2026-10-07 23:59:59",
    leads: slice,
    by: "community",
    universe: [
      ...slice,
      { id: "3", communityId: "55", clientTypeId: "972", agentId: "2298", clusterId: "", bedsId: "29", typeId: "" },
    ],
  });
  assert.equal(wider, "");
  const exact = officeLeadFilterPath({
    from: "2026-09-07 00:00:00",
    to: "2026-10-07 23:59:59",
    leads,
    by: "community",
    universe: leads,
  });
  assert.match(exact, /UF_CRM_1763390140=55/);
  const named = leads.map((row) => ({ ...row, communityText: "International City" }));
  const withText = officeLeadFilterPath({
    from: "2026-09-07 00:00:00",
    to: "2026-10-07 23:59:59",
    leads: named,
    by: "community",
    universe: named,
  });
  assert.match(withText, /UF_CRM_1770537051525=International\+City/);
  assert.match(withText, /UF_CRM_1763390140=55/);
  const city = officeLeadRowPath({
    from: "2026-09-07 00:00:00",
    to: "2026-10-07 23:59:59",
    by: "community",
    value: "55",
    label: "International City",
  });
  assert.match(city, /UF_CRM_1770537051525=International\+City/);
  assert.equal(city.includes("UF_CRM_1763390140="), false);
  assert.equal(city.includes("dynamic_"), false);
  const blank = officeLeadBlankPath({ from: "2026-09-08 00:00:00", to: "2026-10-07 23:59:59" });
  assert.match(blank, /UF_CRM_1760707563281_isEmpty=Y/);
  assert.match(blank, /UF_CRM_1763390140_isEmpty=Y/);
  assert.match(blank, /OPPORTUNITY_numsel=exact/);
  assert.match(blank, /OPPORTUNITY_from=0/);
  assert.match(blank, /DATE_CREATE_datesel=RANGE/);
  assert.equal(blank.includes("ID%5B%5D"), false);
  assert.equal(dubaiStampToUtc("2026-09-08 00:00:00"), "2026-09-07 20:00:00");
  assert.equal(dubaiStampToUtc("2026-10-07 23:59:59"), "2026-10-07 19:59:59");
  assert.match(city, /DATE_CREATE_datesel=RANGE/);
  assert.equal(city.includes("ASSIGNED_BY_ID"), false);
  assert.equal(officeLeadRowPath({ from: "2026-09-07 00:00:00", to: "2026-10-07 23:59:59", by: "purpose", value: "sale" }), "");
  assert.match(officeLeadRowPath({ by: "purpose", value: "rent", from: "2026-09-07 00:00:00", to: "2026-10-07 23:59:59" }), /UF_CRM_1756638760279=1220/);
});

test("office lead range is one Dubai day, a full month, or every CRM lead", () => {
  assert.deepEqual(officeLeadRange({ mode: "day", day: "2026-10-08" }), {
    mode: "day",
    period: "2026-10-08",
    from: "2026-10-08 00:00:00",
    to: "2026-10-08 23:59:59",
    label: "2026-10-08",
  });
  const month = officeLeadRange({ mode: "month", month: "2026-10" });
  assert.equal(month.from, "2026-10-01 00:00:00");
  assert.equal(month.to, "2026-10-31 23:59:59");
  const overall = officeLeadRange({ mode: "all" });
  assert.equal(overall.from, "");
  assert.equal(overall.to, "");
  assert.equal(overall.label, "Overall");
  const now = new Date("2026-10-09T08:00:00Z");
  const week = officeLeadRange({ mode: "days7" }, now);
  assert.equal(week.from, "2026-10-03 00:00:00");
  assert.equal(week.to, "2026-10-09 23:59:59");
  assert.equal(week.label, "Last 7 days");
  const days45 = officeLeadRange({ mode: "days45" }, now);
  assert.equal(days45.from, "2026-08-26 00:00:00");
  assert.equal(days45.to, "2026-10-09 23:59:59");
  const custom = officeLeadRange({ mode: "custom", from: "2026-09-15", to: "2026-09-01" });
  assert.equal(custom.from, "2026-09-01 00:00:00");
  assert.equal(custom.to, "2026-09-15 23:59:59");
  assert.equal(custom.label, "2026-09-01 → 2026-09-15");
});

test("office lead click counts both not-interested stages, junk, option sent and broker", () => {
  const statuses = [
    { id: "UC_RYQD1Z", name: "Not interested" },
    { id: "UC_ZQMREH", name: "Option Sent" },
    { id: "JUNK", name: "Junk Lead" },
    { id: "1", name: "Not Interested" },
    { id: "3", name: "Broker/Agent" },
    { id: "IN_PROCESS", name: "Contacted/In Progress" },
  ];
  const leads = [
    { statusId: "UC_RYQD1Z", clientType: "Tenant" },
    { statusId: "1", clientType: "Tenant" },
    { statusId: "1", clientType: "" },
    { statusId: "UC_ZQMREH", clientType: "Buyer" },
    { statusId: "JUNK", clientType: "Tenant" },
    { statusId: "3", clientType: "Tenant" },
    { statusId: "3", clientType: "" },
    { statusId: "IN_PROCESS", clientType: "Tenant" },
  ];
  const facts = officeLeadFacts(leads, statuses);
  assert.equal(facts.total, 8);
  assert.equal(facts.notInterested, 3);
  assert.equal(facts.notInterestedStages.length, 2);
  assert.equal(facts.optionSent, 1);
  assert.equal(facts.junk, 1);
  assert.equal(facts.broker, 2);
  assert.equal(facts.stages.reduce((sum, row) => sum + row.count, 0), 8);
  assert.equal(facts.stages[0].name, "Not interested");
  assert.deepEqual(
    facts.clients.map((row) => `${row.name}:${row.count}`),
    ["Tenant:5", "No client type:2", "Buyer:1"],
  );
  const shaped = shapeOfficeLeads(
    [{ ID: "9", TITLE: "Lead", STATUS_ID: "3", ASSIGNED_BY_ID: "1" }],
    new Map([["1", "Asma Aslam"]]),
    { fields: {}, titles: { communities: {}, subCommunities: {}, types: {} } },
    new Map([["3", "Broker/Agent"]]),
  );
  assert.equal(shaped.leads[0].statusId, "3");
  assert.equal(shaped.leads[0].statusName, "Broker/Agent");
});
