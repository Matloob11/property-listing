import assert from "node:assert/strict";
import test from "node:test";
import {
  CACHE_MS,
  addCrmIntelligenceAgent,
  assembleReport,
  assertReadMethod,
  buildCountCmds,
  cacheKey,
  checkCrmIntelligence,
  classifyAgentHistory,
  clearCrmIntelligenceCache,
  crmScopeFilters,
  filterRowsForAgent,
  leadTouched,
  listCrmIntelligenceAgents,
  listCrmIntelligenceFilters,
  conversionRate,
  dateFilter,
  encodeListCmd,
  findStatus,
  junkStatusIds,
  normLabel,
  normalizeAgentId,
  normalizePeriod,
  ownerFilters,
  parseBatchTotals,
  periodRange,
  userInDepartment,
} from "./crmIntelligence.js";

const NOW = new Date("2026-09-28T10:00:00+04:00");

test("period range uses Dubai last 30 days and keeps All Time empty", () => {
  const month = periodRange("Last 30 Days", NOW);
  assert.equal(month.period, "Last 30 Days");
  assert.equal(month.from, "2026-08-30 00:00:00");
  assert.equal(month.to, "2026-09-28 23:59:59");
  assert.deepEqual(periodRange("All Time", NOW), { period: "All Time", from: "", to: "" });
  assert.equal(normalizePeriod("Custom"), "Last 30 Days");
  assert.equal(cacheKey("Custom", "", {}, NOW), "v10:Last 30 Days:2026-09-28:all:-:-:-");
  assert.equal(cacheKey("Last 30 Days", "9", {}, NOW), "v10:Last 30 Days:2026-09-28:9:-:-:-");
  assert.equal(cacheKey("Today", "9", {}, NOW), "v10:Today:2026-09-28:9:-:-:-");
  assert.equal(cacheKey("Last 7 Days", "9", { sourceId: "CALL", statusId: "NEW" }, NOW), "v10:Last 7 Days:2026-09-28:9:-:CALL:NEW");
  assert.equal(normalizeAgentId("user-12"), "12");
  assert.deepEqual(ownerFilters("9"), { ASSIGNED_BY_ID: "9" });
  assert.deepEqual(crmScopeFilters({ sourceId: "CALL", statusId: "NEW" }), { SOURCE_ID: "CALL", STATUS_ID: "NEW" });
  assert.deepEqual(crmScopeFilters({ sourceId: "CALL", statusId: "NEW", forDeals: true }), { SOURCE_ID: "CALL" });
  assert.equal(userInDepartment({ UF_DEPARTMENT: [3, 7] }, "7"), true);
  assert.equal(userInDepartment({ UF_DEPARTMENT: [3] }, "7"), false);
});

test("status labels match funnel names after normalize", () => {
  assert.equal(normLabel("Contacted / In Progress"), "contactedinprogress");
  const row = findStatus(
    [{ STATUS_ID: "UC1", NAME: "Contacted/In Progress" }],
    "Contacted / In Progress"
  );
  assert.equal(row.STATUS_ID, "UC1");
  assert.deepEqual(junkStatusIds([{ STATUS_ID: "JUNK", NAME: "Junk Lead" }]), ["JUNK"]);
  assert.equal(conversionRate(8, 5330), 0.2);
});

test("list commands are read-only and include date filters", () => {
  assert.equal(assertReadMethod("crm.lead.list"), "crm.lead.list");
  assert.equal(assertReadMethod("user.search"), "user.search");
  assert.equal(assertReadMethod("department.get"), "department.get");
  assert.equal(assertReadMethod("crm.item.list"), "crm.item.list");
  assert.equal(assertReadMethod("crm.item.fields"), "crm.item.fields");
  assert.throws(() => assertReadMethod("crm.lead.add"), /blocked_write/);
  assert.throws(() => encodeListCmd("crm.deal.update", {}), /blocked_write/);
  const cmd = encodeListCmd("crm.lead.list", { ...dateFilter("2026-08-30 00:00:00", "2026-09-28 23:59:59"), STATUS_SEMANTIC_ID: "S" });
  assert.match(cmd, /^crm\.lead\.list\?/);
  assert.match(cmd, /filter%5B%3E%3DDATE_CREATE%5D=2026-08-30/);
  assert.match(cmd, /STATUS_SEMANTIC_ID/);
});

test("batch totals assemble cards funnels and skip activity dump", () => {
  const leadStatuses = [
    { STATUS_ID: "NEW", NAME: "New Lead" },
    { STATUS_ID: "JUNK", NAME: "Junk Lead" },
  ];
  const dealStages = [{ STATUS_ID: "NEW", NAME: "New Booking" }];
  const sources = [{ STATUS_ID: "UC1", NAME: "Property Finder WhatsApp" }];
  const users = [{ ID: "9", NAME: "Admin", LAST_NAME: "Malik" }];
  const cmds = buildCountCmds({
    from: "2026-08-30 00:00:00",
    to: "2026-09-28 23:59:59",
    leadStatuses,
    dealStages,
    sources,
    users,
    includeActivity: true,
  });
  assert.ok(cmds.lead_total);
  assert.ok(cmds.lf_newlead);
  assert.ok(cmds.am_9);
  const one = buildCountCmds({
    from: "2026-08-30 00:00:00",
    to: "2026-09-28 23:59:59",
    leadStatuses,
    dealStages,
    sources,
    users,
    includeActivity: true,
    agentId: "9",
  });
  assert.match(one.lead_total, /ASSIGNED_BY_ID/);
  assert.ok(one.am_9);
  const filtered = buildCountCmds({
    from: "2026-08-30 00:00:00",
    to: "2026-09-28 23:59:59",
    leadStatuses,
    dealStages,
    sources,
    users,
    includeActivity: true,
    agentId: "9",
    sourceId: "UC1",
    statusId: "NEW",
  });
  assert.match(filtered.lead_total, /SOURCE_ID/);
  assert.match(filtered.lead_total, /STATUS_ID/);
  assert.match(filtered.deal_total, /SOURCE_ID/);
  assert.ok(!/STATUS_ID/.test(filtered.deal_total));
  assert.equal(Object.values(cmds).some((cmd) => /crm\.(lead|deal|activity)\.(add|update)/.test(cmd)), false);

  const report = assembleReport({
    period: "Last 30 Days",
    from: "2026-08-30 00:00:00",
    to: "2026-09-28 23:59:59",
    totals: {
      lead_total: 100,
      lead_progress: 80,
      lead_converted: 8,
      lead_junk_0: 12,
      deal_total: 10,
      deal_progress: 9,
      deal_won: 0,
      deal_lost: 1,
      lf_newlead: 40,
      df_newbooking: 3,
      src_UC1: 70,
      srcj_UC1: 10,
      srcc_UC1: 2,
      aw_9: 20,
      nl_9: 15,
      am_9: 1,
      aa_9: 40,
    },
    leadStatuses,
    dealStages,
    sources,
    users,
    includeActivity: true,
    calls: 6,
    checkedAt: 1,
  });
  assert.equal(report.leads.total, 100);
  assert.equal(report.leads.conversionRate, 8);
  assert.equal(report.leads.junk, 12);
  assert.equal(report.deals.revenue, 0);
  assert.equal(report.leadFunnel[0].count, 40);
  assert.equal(report.leadFunnel[0].statusId, "NEW");
  assert.equal(report.dealFunnel[0].statusId, "NEW");
  assert.equal(report.activity[0].avg, 2);
  assert.equal(report.sources[0].deals, 2);
  assert.equal(report.response[0].c5, null);
  assert.equal(report.history, null);
});

test("Check uses 15 min cache and does not call Bitrix again", async () => {
  clearCrmIntelligenceCache();
  let posts = 0;
  const post = async (method) => {
    posts += 1;
    if (method === "crm.status.list") return { result: [] };
    if (method === "user.get") return { result: [{ ID: "9", NAME: "Admin", LAST_NAME: "Malik", UF_DEPARTMENT: [1] }] };
    if (method === "batch") return { result: { result_total: { lead_total: 3 } } };
    return { result: [] };
  };
  const db = {
    store: {},
    async getSetting(key, fallback) {
      return key in this.store ? this.store[key] : fallback;
    },
    async setSetting(key, value) {
      this.store[key] = value;
    },
  };
  await assert.rejects(
    () => checkCrmIntelligence({ db, period: "Last 30 Days", post, sleep: async () => {} }),
    /Select an agent first/
  );
  const first = await checkCrmIntelligence({ db, period: "Last 30 Days", agentId: "9", post, sleep: async () => {} });
  assert.equal(first.cached, false);
  assert.equal(first.leads.total, 3);
  const before = posts;
  const second = await checkCrmIntelligence({ db, period: "Last 30 Days", agentId: "9", post, sleep: async () => {} });
  assert.equal(second.cached, true);
  assert.equal(posts, before);
  assert.ok(CACHE_MS >= 10 * 60 * 1000);
  const parsed = parseBatchTotals({ result: { result_total: { lead_total: 9 } } });
  assert.equal(parsed.totals.lead_total, 9);
  const agentCheck = await checkCrmIntelligence({
    db,
    period: "Last 30 Days",
    agentId: "9",
    sourceId: "CALL",
    post,
    sleep: async () => {},
  });
  assert.equal(agentCheck.cached, false);
  assert.equal(agentCheck.agentId, "9");
  assert.equal(agentCheck.sourceId, "CALL");
  assert.ok(agentCheck.history);
  assert.deepEqual(agentCheck.history.worked, []);
});

test("agent history splits worked leads, idle leads, and deals", () => {
  const statuses = [{ STATUS_ID: "NEW", NAME: "New Lead" }, { STATUS_ID: "IN_PROCESS", NAME: "Contacted / In Progress" }];
  const names = new Map(statuses.map((row) => [row.STATUS_ID, row.NAME]));
  assert.equal(leadTouched({ DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 10:00:10", STATUS_ID: "NEW" }, names), false);
  // Assigned/New stay idle even when DATE_MODIFY was bumped by assignment.
  assert.equal(leadTouched({ DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 12:00:00", STATUS_ID: "NEW" }, names), false);
  assert.equal(
    leadTouched({ DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 12:00:00", STATUS_ID: "ASSIGNED" }, new Map([["ASSIGNED", "Assigned"]])),
    false
  );
  assert.equal(
    leadTouched({ DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 12:00:00", STATUS_ID: "IN_PROCESS" }, names),
    true
  );
  const out = classifyAgentHistory({
    createdLeads: [
      { ID: "1", TITLE: "Idle", STATUS_ID: "NEW", SOURCE_ID: "UC1", DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 10:00:00", ASSIGNED_BY_ID: "9" },
      { ID: "2", TITLE: "Called", STATUS_ID: "IN_PROCESS", SOURCE_ID: "UC1", DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 11:00:00", ASSIGNED_BY_ID: "9" },
      { ID: "3", TITLE: "Only assigned", STATUS_ID: "ASSIGNED", SOURCE_ID: "UC1", DATE_CREATE: "2026-10-01 09:00:00", DATE_MODIFY: "2026-10-01 09:25:00", ASSIGNED_BY_ID: "9" },
    ],
    touchedLeads: [
      { ID: "2", TITLE: "Called", STATUS_ID: "IN_PROCESS", SOURCE_ID: "UC1", DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 11:00:00", ASSIGNED_BY_ID: "9" },
      { ID: "3", TITLE: "Only assigned", STATUS_ID: "ASSIGNED", SOURCE_ID: "UC1", DATE_CREATE: "2026-10-01 09:00:00", DATE_MODIFY: "2026-10-01 09:25:00", ASSIGNED_BY_ID: "9" },
    ],
    deals: [{ ID: "80", TITLE: "Unit 12", STAGE_ID: "NEW", OPPORTUNITY: 1000, CURRENCY_ID: "AED", DATE_CREATE: "2026-09-02 09:00:00", STAGE_SEMANTIC_ID: "P", ASSIGNED_BY_ID: "9" }],
    leadStatuses: [...statuses, { STATUS_ID: "ASSIGNED", NAME: "Assigned" }],
    dealStages: [{ STATUS_ID: "NEW", NAME: "New Booking" }],
    sources: [{ STATUS_ID: "UC1", NAME: "Property Finder WhatsApp" }],
    agentId: "9",
  });
  assert.equal(out.idle.find((row) => row.id === "1")?.id, "1");
  assert.equal(out.idle.find((row) => row.id === "3")?.id, "3");
  assert.equal(out.worked[0].id, "2");
  assert.equal(out.worked[0].title, "Called");
  assert.equal(out.deals[0].title, "Unit 12");
  assert.equal(out.deals[0].outcome, "Open");
});

test("activity on a lead marks it worked even if status still Assigned", () => {
  const out = classifyAgentHistory({
    createdLeads: [
      { ID: "10", TITLE: "Called via 3CX", STATUS_ID: "ASSIGNED", SOURCE_ID: "UC1", DATE_CREATE: "2026-10-01 09:00:00", DATE_MODIFY: "2026-10-01 09:10:00", ASSIGNED_BY_ID: "9" },
    ],
    touchedLeads: [
      { ID: "10", TITLE: "Called via 3CX", STATUS_ID: "ASSIGNED", SOURCE_ID: "UC1", DATE_CREATE: "2026-10-01 09:00:00", DATE_MODIFY: "2026-10-01 09:10:00", ASSIGNED_BY_ID: "9" },
    ],
    deals: [],
    leadStatuses: [{ STATUS_ID: "ASSIGNED", NAME: "Assigned" }],
    sources: [{ STATUS_ID: "UC1", NAME: "Property Finder WhatsApp" }],
    agentId: "9",
    activityLeadIds: ["10"],
  });
  assert.equal(out.worked.length, 1);
  assert.equal(out.worked[0].id, "10");
  assert.equal(out.idle.length, 0);
});

test("history drops leads assigned to a different agent", () => {
  assert.deepEqual(
    filterRowsForAgent(
      [
        { ID: "1", ASSIGNED_BY_ID: "9" },
        { ID: "2", ASSIGNED_BY_ID: "12" },
        { ID: "3" },
      ],
      "9"
    ).map((row) => row.ID),
    ["1", "3"]
  );
  const out = classifyAgentHistory({
    createdLeads: [
      { ID: "1", TITLE: "Mine", STATUS_ID: "NEW", SOURCE_ID: "UC1", DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 10:00:00", ASSIGNED_BY_ID: "9" },
      { ID: "99", TITLE: "Other agent", NAME: "Aila", LAST_NAME: "Shahzadi", STATUS_ID: "NEW", SOURCE_ID: "UC1", DATE_CREATE: "2026-09-01 10:00:00", DATE_MODIFY: "2026-09-01 10:00:00", ASSIGNED_BY_ID: "55" },
    ],
    touchedLeads: [],
    deals: [],
    leadStatuses: [{ STATUS_ID: "NEW", NAME: "New Lead" }],
    sources: [{ STATUS_ID: "UC1", NAME: "Property Finder WhatsApp" }],
    agentId: "9",
  });
  assert.equal(out.idle.length, 1);
  assert.equal(out.idle[0].id, "1");
  assert.equal(out.idle[0].title, "Mine");
});

test("agent list is cached and does not dump CRM rows", async () => {
  clearCrmIntelligenceCache();
  let posts = 0;
  const post = async (method, params) => {
    posts += 1;
    assert.equal(method, "user.get");
    assert.equal(params.filter, undefined);
    assert.equal(params.FILTER.ACTIVE, true);
    return { result: [{ ID: "9", NAME: "Admin", LAST_NAME: "Malik" }] };
  };
  const db = { store: {}, async getSetting() { return null; }, async setSetting() {} };
  const first = await listCrmIntelligenceAgents({ db, post, sleep: async () => {} });
  assert.equal(first.agents[0].name, "Admin Malik");
  const before = posts;
  const second = await listCrmIntelligenceAgents({ db, post, sleep: async () => {} });
  assert.equal(second.cached, true);
  assert.equal(posts, before);
});

test("empty agent cache is ignored so names can load again", async () => {
  clearCrmIntelligenceCache();
  let posts = 0;
  const post = async () => {
    posts += 1;
    return { result: [{ ID: "4", NAME: "Qasim", LAST_NAME: "Mehmood" }] };
  };
  const db = {
    async getSetting() { return { ok: true, checkedAt: Date.now(), agents: [] }; },
    async setSetting() {},
  };
  const got = await listCrmIntelligenceAgents({ db, post, sleep: async () => {} });
  assert.equal(got.cached, false);
  assert.equal(got.agents[0].name, "Qasim Mehmood");
  assert.equal(posts, 1);
});

test("missed agent name is resolved and saved without dumping CRM rows", async () => {
  clearCrmIntelligenceCache();
  const extras = [];
  const post = async (method, params) => {
    if (method === "user.add") throw new Error("blocked_write");
    if (method === "crm.lead.list" || method === "crm.deal.list") return { result: [] };
    if (method === "crm.status.list") return { result: [] };
    if (method === "batch") return { result: { result_total: { lead_total: 2 } } };
    if (method === "user.search" || params?.FILTER?.NAME || params?.ID) {
      return { result: [{ ID: "4", NAME: "Qasim", LAST_NAME: "Mehmood" }] };
    }
    return { result: [] };
  };
  const db = {
    store: {},
    async getSetting(key, fallback) {
      if (key === "crm_intel_extra_agents") return extras;
      return key in this.store ? this.store[key] : fallback;
    },
    async setSetting(key, value) {
      if (key === "crm_intel_extra_agents") {
        extras.splice(0, extras.length, ...value);
        return;
      }
      this.store[key] = value;
    },
  };
  const added = await addCrmIntelligenceAgent({ db, name: "Qasim Mehmood", post });
  assert.equal(added.agent.id, "4");
  assert.equal(extras[0].id, "4");
  const report = await checkCrmIntelligence({
    db,
    period: "This Month",
    agentName: "Qasim Mehmood",
    post,
    sleep: async () => {},
  });
  assert.equal(report.agentId, "4");
  assert.ok(report.history);
});

test("CRM filter names load once and stay cached", async () => {
  clearCrmIntelligenceCache();
  let posts = 0;
  const post = async (method, params) => {
    posts += 1;
    assert.notEqual(method, "crm.lead.list");
    assert.notEqual(method, "crm.activity.list");
    if (method === "department.get") return { result: [{ ID: "1", NAME: "Dubai" }, { ID: "2", NAME: "Pakistan" }] };
    if (method === "crm.status.list" && params.filter.ENTITY_ID === "SOURCE") {
      return { result: [{ STATUS_ID: "UC1", NAME: "Property Finder WhatsApp" }] };
    }
    if (method === "crm.status.list" && params.filter.ENTITY_ID === "STATUS") {
      return { result: [{ STATUS_ID: "NEW", NAME: "New Lead" }] };
    }
    throw new Error(`unexpected ${method}`);
  };
  const db = { store: {}, async getSetting() { return null; }, async setSetting(key, value) { this.store[key] = value; } };
  const first = await listCrmIntelligenceFilters({ db, post, sleep: async () => {} });
  assert.equal(first.cached, false);
  assert.equal(first.departments[0].name, "Dubai");
  assert.equal(first.sources[0].name, "Property Finder WhatsApp");
  assert.equal(first.types[0].name, "New Lead");
  const before = posts;
  const second = await listCrmIntelligenceFilters({ db, post, sleep: async () => {} });
  assert.equal(second.cached, true);
  assert.equal(posts, before);
});
