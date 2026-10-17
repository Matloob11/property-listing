import test from "node:test";
import assert from "node:assert/strict";
import { copiesForAgent, dueForSevenPm, dispatchAgentReportPdfs, workedAgentIds, AGENT_REPORT_SEND_ENABLED, scheduleAgentReportPdfs } from "./agentReportDispatch.js";

test("automatic agent report sending stays off", () => {
  assert.equal(AGENT_REPORT_SEND_ENABLED, false);
  scheduleAgentReportPdfs({
    getSetting: async () => {
      throw new Error("should not look for a report to send");
    },
  });
});

test("7pm Pakistan hour is the send window", () => {
  const seven = new Date("2026-10-07T14:00:00Z");
  const later = new Date("2026-10-07T14:20:00Z");
  const six = new Date("2026-10-07T13:00:00Z");
  const morning = new Date("2026-10-07T08:00:00Z");
  assert.equal(dueForSevenPm(seven, null), "2026-10-07");
  assert.equal(dueForSevenPm(later, null), "2026-10-07");
  assert.equal(dueForSevenPm(six, null), null);
  assert.equal(dueForSevenPm(morning, null), null);
  assert.equal(dueForSevenPm(seven, { day: "2026-10-07", finished: true }), null);
});

test("only agents who worked leads get a PDF", async () => {
  const sent = [];
  const post = async (method) => {
    if (method === "crm.lead.list") return { result: [{ ID: "1", ASSIGNED_BY_ID: "10" }, { ID: "2", ASSIGNED_BY_ID: "11" }] };
    if (method === "crm.activity.list") return { result: [{ ID: "9", RESPONSIBLE_ID: "12" }] };
    return { result: [] };
  };
  const state = await dispatchAgentReportPdfs({
    day: "2026-10-07",
    post,
    pause: async () => {},
    copyIds: [],
    check: async ({ agentId }) => ({
      ok: true,
      agentId,
      agentName: `Agent ${agentId}`,
      range: { label: "2026-10-07" },
      summary: { leadsWorked: agentId === "11" ? 0 : 2 },
    }),
    send: async ({ userId }) => {
      sent.push(userId);
    },
  });
  assert.deepEqual(sent.sort(), ["10", "12"]);
  assert.deepEqual(state.skipped, ["11"]);
  assert.equal(state.finished, true);
});

test("named people get every worked report, other agents only their own", async () => {
  const sent = [];
  const post = async (method) => {
    if (method === "crm.lead.list") return { result: [{ ID: "1", ASSIGNED_BY_ID: "10" }, { ID: "2", ASSIGNED_BY_ID: "11" }] };
    if (method === "crm.activity.list") return { result: [{ ID: "9", RESPONSIBLE_ID: "12" }] };
    return { result: [] };
  };
  await dispatchAgentReportPdfs({
    day: "2026-10-07",
    post,
    pause: async () => {},
    copyIds: ["32", "10"],
    check: async ({ agentId }) => ({
      ok: true,
      agentId,
      agentName: `Agent ${agentId}`,
      range: { label: "2026-10-07" },
      summary: { leadsWorked: agentId === "11" ? 0 : 2 },
    }),
    send: async ({ userId, message }) => {
      sent.push(`${userId}|${message}`);
    },
  });
  assert.deepEqual(sent, [
    "10|Daily report 2026-10-07",
    "32|Daily report 2026-10-07 - Agent 10",
    "12|Daily report 2026-10-07",
    "32|Daily report 2026-10-07 - Agent 12",
    "10|Daily report 2026-10-07 - Agent 12",
  ]);
});

test("only Sattar receives every report; everyone else receives their own", () => {
  assert.deepEqual(copiesForAgent("10"), ["32"]);
  assert.deepEqual(copiesForAgent("1"), ["32"]);
  assert.deepEqual(copiesForAgent("32"), []);
});

test("named leads get every report once, including Abdul Malik's", async () => {
  assert.deepEqual(copiesForAgent("1", ["32", "1", "2297"]), ["32", "2297"]);
  assert.deepEqual(copiesForAgent("10", ["32", "1"]), ["32", "1"]);
  const sent = [];
  const post = async (method) => {
    if (method === "crm.lead.list") return { result: [{ ID: "1", ASSIGNED_BY_ID: "1" }, { ID: "2", ASSIGNED_BY_ID: "10" }] };
    if (method === "crm.activity.list") return { result: [] };
    return { result: [] };
  };
  await dispatchAgentReportPdfs({
    day: "2026-10-09",
    post,
    pause: async () => {},
    copyIds: ["32", "1", "2297"],
    check: async ({ agentId }) => ({
      ok: true,
      agentId,
      agentName: agentId === "1" ? "Abdul Malik" : "Agent 10",
      range: { label: "2026-10-09" },
      summary: { leadsWorked: 2 },
    }),
    send: async ({ userId, message }) => {
      sent.push(`${userId}|${message}`);
    },
  });
  assert.deepEqual(sent, [
    "1|Daily report 2026-10-09",
    "32|Daily report 2026-10-09 - Abdul Malik",
    "2297|Daily report 2026-10-09 - Abdul Malik",
    "10|Daily report 2026-10-09",
    "32|Daily report 2026-10-09 - Agent 10",
    "1|Daily report 2026-10-09 - Agent 10",
    "2297|Daily report 2026-10-09 - Agent 10",
  ]);
});

test("a failed send stays open and the next pass retries it", async () => {
  const memory = { value: null };
  const db = {
    async getSetting() {
      return memory.value;
    },
    async setSetting(_key, value) {
      memory.value = value;
    },
  };
  const post = async (method) => {
    if (method === "crm.lead.list") return { result: [{ ID: "1", ASSIGNED_BY_ID: "10" }] };
    if (method === "crm.activity.list") return { result: [] };
    return { result: [] };
  };
  const check = async ({ agentId }) => ({
    ok: true,
    agentId,
    agentName: "Agent 10",
    summary: { leadsWorked: 2 },
  });
  const first = await dispatchAgentReportPdfs({
    db,
    day: "2026-10-07",
    post,
    pause: async () => {},
    copyIds: [],
    check,
    send: async () => {
      throw new Error("429");
    },
  });
  assert.equal(first.finished, false);
  assert.deepEqual(first.sent, []);
  const sent = [];
  const second = await dispatchAgentReportPdfs({
    db,
    day: "2026-10-07",
    post,
    pause: async () => {},
    copyIds: [],
    check,
    send: async ({ userId }) => {
      sent.push(userId);
    },
  });
  assert.deepEqual(sent, ["10"]);
  assert.equal(second.finished, true);
});

test("worked ids come from assigned leads and activity owners", async () => {
  const ids = await workedAgentIds(async (method) => {
    if (method === "crm.lead.list") return { result: [{ ASSIGNED_BY_ID: "4" }] };
    return { result: [{ RESPONSIBLE_ID: "8" }] };
  }, "2026-10-07 00:00:00", "2026-10-07 23:59:59");
  assert.deepEqual(ids.sort(), ["4", "8"]);
});
