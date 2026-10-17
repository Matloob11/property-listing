import assert from "node:assert/strict";
import test from "node:test";
import { bitrixUiDate, crmLeadSlicePath, crmListPath, officeLeadRowsPath, officeLeadSelectionPath } from "./crmUiLinks.js";

test("CRM click URL uses the same created-date range as Infographics Check", () => {
  assert.equal(bitrixUiDate("2026-09-06 00:00:00"), "06.09.2026");
  assert.equal(bitrixUiDate("2026-10-05 23:59:59"), "05.10.2026");
  const path = crmListPath("lead", {
    semantic: "P",
    agentId: "2298",
    from: "2026-09-06 00:00:00",
    to: "2026-10-05 23:59:59",
  });
  assert.match(path, /STATUS_SEMANTIC_ID=P/);
  assert.match(path, /ASSIGNED_BY_ID=2298/);
  assert.match(path, /DATE_CREATE_datesel=RANGE/);
  assert.match(path, /DATE_CREATE_from=06\.09\.2026/);
  assert.match(path, /DATE_CREATE_to=05\.10\.2026/);
  const allTime = crmListPath("lead", { semantic: "P", agentId: "2298" });
  assert.equal(allTime.includes("DATE_CREATE"), false);
  const exact = crmListPath("lead", {
    agentId: "2290",
    from: "2026-09-06 00:00:00",
    to: "2026-10-05 23:59:59",
    leadIds: ["101", "102", "101"],
  });
  assert.match(exact, /apply_filter=Y/);
  assert.match(exact, /ASSIGNED_BY_ID=2290/);
  assert.match(exact, /DATE_CREATE_from=06\.09\.2026/);
  assert.match(exact, /ID%5B%5D=101/);
  assert.match(exact, /ID%5B%5D=102/);
  assert.equal(exact.includes("ID_from"), false);
  assert.equal(exact.split("ID%5B%5D=101").length - 1, 1);
  const one = crmListPath("lead", { leadIds: ["55"], agentId: "2298" });
  assert.match(one, /ID_numsel=exact/);
  assert.match(one, /ID_from=55/);
  assert.match(one, /ID_to=55/);
  assert.match(one, /ASSIGNED_BY_ID=2298/);
  const rent = crmLeadSlicePath({
    agentId: "2298",
    from: "2026-09-06 00:00:00",
    to: "2026-10-05 23:59:59",
    leads: [
      { id: "11", clientTypeId: "1220" },
      { id: "12", clientTypeId: "1220" },
    ],
  });
  assert.match(rent, /ASSIGNED_BY_ID=2298/);
  assert.match(rent, /UF_CRM_1756638760279=1220/);
  assert.equal(rent.includes("UF_CRM_1756638760279%5B%5D"), false);
  assert.equal(rent.includes("ID%5B%5D"), false);
  const saleLeads = [
    { id: "21", clientTypeId: "972" },
    { id: "22", clientTypeId: "" },
  ];
  const sale = crmLeadSlicePath({
    agentId: "2298",
    from: "2026-09-06 00:00:00",
    to: "2026-10-05 23:59:59",
    leads: saleLeads,
    universe: [...saleLeads, { id: "23", clientTypeId: "1220" }],
  });
  assert.match(sale, /ID%5B%5D=21/);
  assert.match(sale, /ID%5B%5D=22/);
  assert.equal(sale.includes("UF_CRM_1756638760279"), false);
  const cityLeads = [
    { id: "31", communityId: "55", community: "International City", communityText: "International City", clientTypeId: "1220" },
    { id: "32", communityId: "55", community: "International City", communityText: "International City", clientTypeId: "972" },
  ];
  const city = crmLeadSlicePath({
    agentId: "2298",
    agentName: "Asma Aslam",
    from: "2026-09-06 00:00:00",
    to: "2026-10-05 23:59:59",
    leads: cityLeads,
    universe: [...cityLeads, { id: "33", communityId: "9", community: "Mudon", communityText: "Mudon", clientTypeId: "1220" }],
  });
  assert.match(city, /UF_CRM_1763390140=55/);
  assert.match(city, /UF_CRM_1763390140_label=International\+City/);
  assert.match(city, /ASSIGNED_BY_ID_label=Asma\+Aslam/);
  assert.equal(city.includes("ID%5B%5D"), false);
});

test("office popup CRM link stays exact for the whole range, one stage, and a mixed slice", () => {
  const from = "2026-10-01 00:00:00";
  const to = "2026-10-09 23:59:59";
  const universe = [
    { id: "1", statusId: "UC_ZQMREH", statusName: "Option Sent", clientTypeId: "1220", clientType: "Tenant", communityId: "55", communityText: "International City", agentId: "8" },
    { id: "2", statusId: "UC_RYQD1Z", statusName: "Not interested", clientTypeId: "1220", clientType: "Tenant", communityId: "55", communityText: "International City", agentId: "8" },
    { id: "3", statusId: "1", statusName: "Not Interested", clientTypeId: "", clientType: "", communityId: "9", communityText: "Mudon", agentId: "9" },
    { id: "4", statusId: "3", statusName: "Broker/Agent", clientTypeId: "972", clientType: "Buyer", communityId: "9", communityText: "Mudon", agentId: "9" },
  ];
  const whole = officeLeadSelectionPath({ from, to, leads: universe, universe });
  assert.match(whole, /DATE_CREATE_from=01\.10\.2026/);
  assert.match(whole, /DATE_CREATE_to=09\.10\.2026/);
  assert.equal(whole.includes("STATUS_ID"), false);
  assert.equal(whole.includes("ID%5B%5D"), false);
  const option = officeLeadSelectionPath({ from, to, leads: [universe[0]], universe });
  assert.match(option, /STATUS_ID=UC_ZQMREH/);
  assert.match(option, /DATE_CREATE_from=01\.10\.2026/);
  assert.equal(option.includes("ID%5B%5D"), false);
  const notInterested = officeLeadSelectionPath({ from, to, leads: [universe[1], universe[2]], universe });
  assert.match(notInterested, /STATUS_ID%5B%5D=UC_RYQD1Z/);
  assert.match(notInterested, /STATUS_ID%5B%5D=1/);
  assert.equal(/(^|[?&])ID%5B%5D=/.test(notInterested), false);
  const cityOption = officeLeadSelectionPath({ from, to, leads: [universe[0]], universe: [...universe, { ...universe[0], id: "5", communityId: "70", communityText: "Serena", clientTypeId: "1220" }] });
  assert.match(cityOption, /STATUS_ID=UC_ZQMREH/);
  assert.match(cityOption, /International(\+|%20)City|UF_CRM_1763390140=55/);
  const mixed = [
    { id: "11", statusId: "JUNK", clientTypeId: "1220", opportunity: "10" },
    { id: "12", statusId: "NEW", clientTypeId: "", opportunity: "900000" },
  ];
  const ids = officeLeadSelectionPath({ from, to, leads: mixed, universe: mixed });
  assert.equal(ids.includes("ID%5B%5D"), false);
  const tooWide = officeLeadSelectionPath({
    from,
    to,
    leads: mixed,
    universe: [...mixed, { id: "13", statusId: "JUNK", clientTypeId: "972" }, { id: "14", statusId: "NEW", clientTypeId: "1220" }],
  });
  assert.match(tooWide, /ID%5B%5D=11/);
  assert.match(tooWide, /ID%5B%5D=12/);
  assert.equal(tooWide.includes("STATUS_ID"), false);
  const many = Array.from({ length: 501 }, (_, index) => ({ id: String(index + 1), statusId: index % 2 ? "NEW" : "JUNK", clientTypeId: index % 2 ? "1220" : "" }));
  assert.equal(officeLeadSelectionPath({
    from,
    to,
    leads: many,
    universe: [...many, { id: "9999", statusId: "NEW", clientTypeId: "1220" }],
  }), "");
});

test("office lead CRM icon fills the community filter for that row", () => {
  const from = "2026-08-17 00:00:00";
  const to = "2026-10-15 23:59:59";
  const city = officeLeadRowsPath({
    from,
    to,
    leads: [
      { id: "1", communityId: "55", communityText: "International City", clientTypeId: "1220", clientType: "Tenant", statusId: "NEW", clusterId: "9", cluster: "France Cluster" },
      { id: "2", communityId: "55", communityText: "International City", clientTypeId: "972", clientType: "Buyer", statusId: "UC_ZQMREH", clusterId: "10", cluster: "England Cluster" },
      { id: "3", communityId: "55", communityText: "International City", clientTypeId: "1220", statusId: "JUNK", clusterId: "11" },
      { id: "4", communityId: "55", communityText: "International City", clientTypeId: "973", statusId: "1", clusterId: "12" },
      { id: "5", communityId: "55", communityText: "International City", clientTypeId: "2410", statusId: "3", clusterId: "13" },
    ],
  });
  assert.match(city, /UF_CRM_1763390140=55/);
  assert.match(city, /UF_CRM_1763390140_label=International\+City/);
  assert.match(city, /UF_CRM_1770537051525=International\+City/);
  assert.match(city, /DATE_CREATE_from=17\.08\.2026/);
  assert.equal(city.includes("STATUS_ID"), false);
  assert.equal(city.includes("UF_CRM_1763390179="), false);
  const rentCity = officeLeadRowsPath({
    from,
    to,
    leads: [
      { id: "1", communityId: "55", communityText: "International City", clientTypeId: "1220", clientType: "Tenant", agentId: "2392", agentName: "minahil sanaullah" },
    ],
  });
  assert.match(rentCity, /UF_CRM_1756638760279=1220/);
  assert.match(rentCity, /ASSIGNED_BY_ID=2392/);
  assert.match(rentCity, /ASSIGNED_BY_ID_label=minahil\+sanaullah/);
  const sale = officeLeadRowsPath({
    from,
    to,
    leads: [{ id: "3", clientTypeId: "972", clientType: "Buyer", communityId: "1", communityText: "Mudon" }],
  });
  assert.match(sale, /UF_CRM_1756638760279=972/);
  const mixed = [
    { id: "1", clientTypeId: "1220", communityText: "International City", communityId: "55" },
    { id: "2", clientTypeId: "", communityText: "Mudon", communityId: "2" },
  ];
  assert.equal(officeLeadRowsPath({
    from,
    to,
    leads: mixed,
    universe: [...mixed, { id: "9", clientTypeId: "972", communityText: "Serena", communityId: "3" }],
  }).includes("ID%5B%5D=9"), false);
  const exactIds = officeLeadRowsPath({
    from,
    to,
    leads: mixed,
    universe: [...mixed, { id: "9", clientTypeId: "972", communityText: "Serena", communityId: "3" }],
  });
  assert.match(exactIds, /ID%5B%5D=1/);
  assert.match(exactIds, /ID%5B%5D=2/);
  const emptyPurpose = [
    { id: "11", clientTypeId: "" },
    { id: "12", clientTypeId: "" },
  ];
  const emptyPath = officeLeadRowsPath({
    from,
    to,
    leads: emptyPurpose,
    universe: [...emptyPurpose, { id: "13", clientTypeId: "", purpose: "rent" }],
  });
  assert.match(emptyPath, /ID%5B%5D=11/);
  assert.match(emptyPath, /ID%5B%5D=12/);
  assert.equal(emptyPath.includes("isEmpty"), false);
  const studios = [
    { id: "21", bedsId: "26", bedLabel: "Studio", typeId: "2", type: "Apartment" },
    { id: "22", bedsId: "26", bedLabel: "Studio", typeId: "2", type: "Apartment" },
  ];
  const shops = [{ id: "23", bedsId: "26", bedLabel: "Shop", typeId: "9", type: "Shop" }];
  const studioPath = officeLeadRowsPath({ from, to, leads: studios, universe: [...studios, ...shops] });
  assert.match(studioPath, /UF_CRM_1731838126127=26/);
  assert.match(studioPath, /UF_CRM_1760707292=2/);
  assert.equal(studioPath.includes("ID%5B"), false);
  const shopPath = officeLeadRowsPath({ from, to, leads: shops, universe: [...studios, ...shops] });
  assert.match(shopPath, /UF_CRM_1760707292=9/);
  assert.equal(shopPath.includes("UF_CRM_1760707292=2"), false);
  const fromDay = "2026-09-17 00:00:00";
  const toDay = "2026-10-16 23:59:59";
  const studioRent = [
    { id: "31", bedsId: "26", bedLabel: "Studio", clientTypeId: "1220", clientType: "Tenant", purpose: "rent", statusId: "NEW", typeId: "2" },
    { id: "32", bedsId: "26", bedLabel: "Studio", clientTypeId: "1220", clientType: "Tenant", purpose: "rent", statusId: "UC_1", typeId: "2" },
  ];
  const studioSale = [{ id: "33", bedsId: "26", bedLabel: "Studio", clientTypeId: "972", purpose: "sale", statusId: "NEW", typeId: "2" }];
  const otherBeds = [{ id: "34", bedsId: "27", clientTypeId: "1220", purpose: "rent", statusId: "NEW", typeId: "2" }];
  const universe = [...studioRent, ...studioSale, ...otherBeds];
  const rentPath = officeLeadRowsPath({ from: fromDay, to: toDay, leads: studioRent, universe });
  assert.match(rentPath, /UF_CRM_1731838126127=26/);
  assert.match(rentPath, /UF_CRM_1756638760279=1220/);
  assert.equal(rentPath.includes("isEmpty"), false);
  const stage = [studioRent[0]];
  const stagePath = officeLeadRowsPath({ from: fromDay, to: toDay, leads: stage, universe });
  assert.match(stagePath, /STATUS_ID=NEW/);
  assert.match(stagePath, /UF_CRM_1731838126127=26/);
  assert.match(stagePath, /UF_CRM_1756638760279=1220/);
});
