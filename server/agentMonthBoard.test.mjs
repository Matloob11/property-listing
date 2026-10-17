import test from "node:test";
import assert from "node:assert/strict";
import { boardRange, bookingStageAuthor, checkAgentMonthBoard, confirmedWonDeals, tallyAgentMonth } from "./agentMonthBoard.js";

const FROM = "2026-10-01 00:00:00";
const TO = "2026-10-31 23:59:59";

test("month board counts rent, sale, and option sent per agent", () => {
  const result = tallyAgentMonth({
    agents: [
      { id: "7", name: "Asma Aslam" },
      { id: "8", name: "Hajra Abdul Kareem" },
      { id: "9", name: "Idle Agent" },
    ],
    from: FROM,
    to: TO,
    optionStatusId: "UC_ZQMREH",
    bookingStatusId: "CONVERTED",
    leads: [
      { ID: "1", ASSIGNED_BY_ID: "7", UF_CRM_1756638760279: "1220", DATE_CREATE: "2026-10-06 09:00:00" },
      { ID: "2", ASSIGNED_BY_ID: "7", UF_CRM_1756638760279: "972", DATE_CREATE: "2026-10-06 09:00:00" },
      { ID: "3", ASSIGNED_BY_ID: "8", UF_CRM_1756638760279: "972", DATE_CREATE: "2026-10-07 09:00:00" },
      { ID: "5", ASSIGNED_BY_ID: "8", UF_CRM_1756638760279: "1220", DATE_CREATE: "2026-09-26 09:00:00" },
    ],
    optionLeads: [
      { ID: "55", ASSIGNED_BY_ID: "7", DATE_CREATE: "2026-10-04 10:00:00" },
      { ID: "56", ASSIGNED_BY_ID: "8", DATE_CREATE: "2026-09-09 10:00:00" },
    ],
  });
  const asma = result.rows.find((row) => row.id === "7");
  const hajra = result.rows.find((row) => row.id === "8");
  const idle = result.rows.find((row) => row.id === "9");
  assert.equal(idle, undefined);
  assert.equal(asma.deals, 2);
  assert.equal(asma.rent, 1);
  assert.equal(asma.sale, 1);
  assert.equal(asma.optionSent, 1);
  assert.match(asma.dealsPath, /^\/crm\/lead\/list\/\?apply_filter=Y&ASSIGNED_BY_ID=7&STATUS_ID=CONVERTED&DATE_CREATE_datesel=RANGE&DATE_CREATE_from=01\.10\.2026&DATE_CREATE_to=31\.10\.2026$/);
  assert.match(asma.rentPath, /ASSIGNED_BY_ID=7&STATUS_ID=CONVERTED&DATE_CREATE_datesel=RANGE/);
  assert.match(asma.rentPath, /UF_CRM_1756638760279=1220/);
  assert.match(asma.salePath, /ASSIGNED_BY_ID=7&STATUS_ID=CONVERTED/);
  assert.match(asma.salePath, /UF_CRM_1756638760279=972/);
  assert.match(asma.optionPath, /ASSIGNED_BY_ID=7&STATUS_ID=UC_ZQMREH&DATE_CREATE_datesel=RANGE/);
  assert.equal(hajra.rentPath, "");
  assert.equal(hajra.deals, 1);
  assert.equal(hajra.sale, 1);
  assert.equal(hajra.rent, 0);
  assert.equal(hajra.optionSent, 0);
  assert.equal(result.rows.some((row) => row.deals === 0 && row.optionSent === 0), false);
  assert.equal(result.totals.deals, 3);
  assert.equal(result.totals.rent, 1);
  assert.equal(result.totals.sale, 2);
  assert.equal(result.totals.optionSent, 1);
  assert.equal(result.rows[0].id, "7");
});

test("a won deal is the Booking stage change in that month, or a Booking deal that has a lead", () => {
  const comments = [{ AUTHOR_ID: "7", CREATED: "2026-10-06T05:00:00+00:00", COMMENT: "Stage: Option Sent → Booking" }];
  assert.equal(bookingStageAuthor(comments, "2026-10-06T05:00:10+00:00"), "7");
  const won = confirmedWonDeals({
    from: FROM,
    to: TO,
    history: [
      { OWNER_ID: "1", STATUS_ID: "CONVERTED", CREATED_TIME: "2026-10-06T05:00:00+00:00" },
      { OWNER_ID: "9", STATUS_ID: "CONVERTED", CREATED_TIME: "2026-09-30T20:30:00+00:00" },
      { OWNER_ID: "8", STATUS_ID: "CONVERTED", CREATED_TIME: "2026-09-30T18:00:00+00:00" },
    ],
    commentsByLead: { 1: comments },
    leadsById: {
      1: { ID: "1", STATUS_ID: "CONVERTED", ASSIGNED_BY_ID: "99", UF_CRM_1756638760279: "1220" },
      9: { ID: "9", STATUS_ID: "CONVERTED", ASSIGNED_BY_ID: "8", UF_CRM_1756638760279: "972" },
      4: { ID: "4", STATUS_ID: "CONVERTED", ASSIGNED_BY_ID: "7", UF_CRM_1756638760279: "972" },
      5: { ID: "5", STATUS_ID: "UC_ZQMREH", ASSIGNED_BY_ID: "7", UF_CRM_1756638760279: "1220" },
    },
    deals: [
      { LEAD_ID: "1", ASSIGNED_BY_ID: "5", DATE_CREATE: "2026-10-02T08:00:00+00:00" },
      { LEAD_ID: "4", ASSIGNED_BY_ID: "7", DATE_CREATE: "2026-10-03T08:00:00+00:00" },
      { LEAD_ID: "5", ASSIGNED_BY_ID: "7", DATE_CREATE: "2026-10-04T08:00:00+00:00" },
    ],
  });
  const ids = won.map((row) => row.ID).sort();
  assert.deepEqual(ids, ["1", "4", "9"]);
  assert.equal(won.find((row) => row.ID === "1").ASSIGNED_BY_ID, "7");
  assert.equal(won.find((row) => row.ID === "4").ASSIGNED_BY_ID, "7");
  assert.equal(won.find((row) => row.ID === "9").ASSIGNED_BY_ID, "8");
});

test("last 30 days is a Dubai window and does not need a month", () => {
  const range = boardRange({ mode: "last30" }, new Date("2026-10-16T06:00:00Z"));
  assert.equal(range.from, "2026-09-16 00:00:00");
  assert.equal(range.to, "2026-10-16 23:59:59");
});

test("CRM icon keeps responsible, then Booking, then the selected dates", async () => {
  const calls = [];
  const post = async (method, params) => {
    calls.push({ method, params });
    if (method === "crm.status.list") {
      return { result: [{ NAME: "Booking", STATUS_ID: "CONVERTED" }, { NAME: "Option Sent", STATUS_ID: "UC_ZQMREH" }] };
    }
    if (method === "crm.lead.list" && params?.filter?.STATUS_ID === "CONVERTED") {
      return {
        result: [{ ID: "10", STATUS_ID: "CONVERTED", ASSIGNED_BY_ID: "7", DATE_CREATE: "2026-10-06 09:00:00", UF_CRM_1756638760279: "1220" }],
        total: 1,
      };
    }
    return { result: [] };
  };
  const report = await checkAgentMonthBoard({
    mode: "month",
    month: "2026-10",
    force: true,
    post,
    sleep: async () => {},
    db: { getSetting: async () => [] },
  });
  const booking = calls.find((call) => call.method === "crm.lead.list" && call.params?.filter?.STATUS_ID === "CONVERTED");
  assert.equal(booking.params.filter[">=DATE_CREATE"], "2026-10-01 00:00:00");
  assert.equal(booking.params.filter["<=DATE_CREATE"], "2026-10-31 23:59:59");
  const asma = report.agents.find((row) => row.id === "7");
  assert.equal(asma.deals, 1);
  assert.equal(asma.rent, 1);
  assert.equal(
    asma.dealsPath,
    "/crm/lead/list/?apply_filter=Y&ASSIGNED_BY_ID=7&STATUS_ID=CONVERTED&DATE_CREATE_datesel=RANGE&DATE_CREATE_from=01.10.2026&DATE_CREATE_to=31.10.2026",
  );
  assert.equal(
    asma.rentPath,
    "/crm/lead/list/?apply_filter=Y&ASSIGNED_BY_ID=7&STATUS_ID=CONVERTED&DATE_CREATE_datesel=RANGE&DATE_CREATE_from=01.10.2026&DATE_CREATE_to=31.10.2026&UF_CRM_1756638760279=1220",
  );
});

test("a month is required before Bitrix is called", async () => {
  await assert.rejects(
    () => checkAgentMonthBoard({ month: "October", post: () => { throw new Error("called"); } }),
    /Pick a month/,
  );
});
