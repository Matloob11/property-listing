import assert from "node:assert/strict";
import test from "node:test";
import { officeOwnerListPath, ownerDataListPath } from "./ownerDataPath.js";

test("sale availability opens this agent's Owner Data sale stage", () => {
  const path = ownerDataListPath({
    agentId: 2297,
    purpose: "sale",
    stageIds: ["DT1042_14:PREPARATION"],
  });
  assert.match(path, /^\/crm\/type\/1042\/list\/category\/14\//);
  assert.match(path, /apply_filter=Y/);
  assert.match(path, /ASSIGNED_BY_ID=2297/);
  assert.match(path, /STAGE_ID%5B%5D=DT1042_14%3APREPARATION/);
  assert.equal(path.includes("RENT"), false);
});

test("total opens fallback availability stages for the agent", () => {
  const path = ownerDataListPath({ agentId: "2637" });
  assert.match(path, /ASSIGNED_BY_ID=2637/);
  assert.match(path, /RENT/);
  assert.match(path, /SALE/);
});

test("community slice opens CRM with Community field filter, not a long ID list", () => {
  const path = ownerDataListPath({
    agentId: "2298",
    stageIds: ["DT1042_14:UC_73SP7H", "DT1042_14:PREPARATION"],
    communityIds: ["88"],
    itemIds: ["103874", "103875", "111558"],
  });
  assert.match(path, /ASSIGNED_BY_ID=2298/);
  assert.match(path, /PARENT_ID_1058=88/);
  assert.match(path, /parentId1058=88/);
  assert.match(path, /STAGE_ID%5B%5D=/);
  assert.equal(/[?&]ID%5B%5D=/.test(path), false);
  assert.equal(path.includes("103874"), false);
});

test("one card opens by item id", () => {
  const path = ownerDataListPath({
    agentId: "2392",
    itemIds: ["101"],
    stageIds: ["DT1042_14:UC_73SP7H"],
  });
  assert.match(path, /ID=101/);
  assert.match(path, /STAGE_ID%5B%5D=/);
});

test("one availability stage is sent as STAGE_ID[] so Bitrix kanban does not get a string", () => {
  const path = ownerDataListPath({ agentId: "2298", purpose: "sale", stageIds: ["DT1042_14:SALE"] });
  assert.match(path, /STAGE_ID%5B%5D=/);
  assert.equal(/[?&]STAGE_ID=/.test(path), false);
});

test("community icon selects that community in the CRM filter and keeps the availability stages", () => {
  const path = ownerDataListPath({
    agentId: "2298",
    agentName: "Asma Aslam",
    stageIds: ["DT1042_14:UC_73SP7H", "DT1042_14:PREPARATION", "DT1042_14:UC_G0PCBL"],
    communityIds: ["55"],
    communityName: "International City",
  });
  assert.match(path, /ASSIGNED_BY_ID=2298/);
  assert.match(path, /ASSIGNED_BY_ID_label=Asma\+Aslam/);
  assert.match(path, /PARENT_ID_1058=55/);
  assert.match(path, /PARENT_ID_1058_label=International\+City/);
  assert.match(path, /parentId1058_label=International\+City/);
  assert.match(path, /STAGE_ID%5B%5D=DT1042_14%3AUC_73SP7H/);
  assert.match(path, /STAGE_ID%5B%5D=DT1042_14%3APREPARATION/);
  assert.match(path, /STAGE_ID%5B%5D=DT1042_14%3AUC_G0PCBL/);
  assert.equal(/[?&]ID%5B%5D=/.test(path), false);
});

test("bedroom icon uses the Bitrix bedroom enum, and an empty community uses isEmpty", () => {
  const beds = ownerDataListPath({
    agentId: "2298",
    stageIds: ["DT1042_14:PREPARATION"],
    stageName: "Sale Availability",
    bedValues: ["431", "1573"],
    bedName: "1 Bedroom",
  });
  assert.match(beds, /UF_CRM5_1734246780476%5B%5D=431/);
  assert.match(beds, /UF_CRM5_1734246780476%5B%5D=1573/);
  assert.match(beds, /UF_CRM5_1734246780476_label=1\+Bedroom/);
  assert.match(beds, /STAGE_ID_label=Sale\+Availability/);
  const empty = ownerDataListPath({
    agentId: "2298",
    stageIds: ["DT1042_14:PREPARATION"],
    communityEmpty: true,
  });
  assert.match(empty, /PARENT_ID_1058_isEmpty=Y/);
  assert.equal(/PARENT_ID_1058=\d/.test(empty), false);
});

test("office inventory sale box opens only that availability stage", () => {
  const path = officeOwnerListPath([
    { id: "1", stage: "DT1042_14:PREPARATION", stageLabel: "Sale Availability", communityId: "55", community: "International City" },
    { id: "2", stage: "DT1042_14:PREPARATION", stageLabel: "Sale Availability", community: "Empty community" },
  ]);
  assert.match(path, /STAGE_ID%5B%5D=DT1042_14%3APREPARATION/);
  assert.match(path, /STAGE_ID_label=Sale\+Availability/);
  assert.equal(path.includes("PARENT_ID_1058"), false);
  assert.equal(path.includes(":RENT"), false);
});

test("office inventory villa row keeps the sale stage and the unit type", () => {
  const path = officeOwnerListPath(
    [
      { id: "1", stage: "DT1042_14:PREPARATION", stageLabel: "Sale Availability", unitTypeId: "439", typeLabel: "Villa", communityId: "1", community: "Mudon" },
      { id: "2", stage: "DT1042_14:PREPARATION", stageLabel: "Sale Availability", unitTypeId: "900", typeLabel: "Villa", communityId: "2", community: "Villanova" },
    ],
    { lockType: true }
  );
  assert.match(path, /STAGE_ID%5B%5D=DT1042_14%3APREPARATION/);
  assert.match(path, /UF_CRM5_1734246899822%5B%5D=439/);
  assert.match(path, /UF_CRM5_1734246899822%5B%5D=900/);
  assert.match(path, /UF_CRM5_1734246899822_label=Villa/);
  assert.equal(path.includes("PARENT_ID_1058="), false);
});

test("office inventory does not open a wider list when the type is mixed", () => {
  const path = officeOwnerListPath(
    [
      { id: "1", stage: "DT1042_14:PREPARATION", unitTypeId: "439", typeLabel: "Villa" },
      { id: "2", stage: "DT1042_14:PREPARATION", typeLabel: "Villa" },
    ],
    { lockType: true }
  );
  assert.equal(path, "");
});

test("office inventory empty community uses isEmpty on that stage", () => {
  const path = officeOwnerListPath(
    [{ id: "1", stage: "DT1042_14:UC_73SP7H", stageLabel: "Rent Availability", community: "Empty community" }],
    { lockCommunity: true }
  );
  assert.match(path, /PARENT_ID_1058_isEmpty=Y/);
  assert.match(path, /UC_73SP7H/);
  assert.equal(/PARENT_ID_1058=\d/.test(path), false);
});
