import test from "node:test";
import assert from "node:assert/strict";
import { agentMeetingStageChanges, agentSharePerformance, applyShareStages, callRecords, checkOfficeShareHistory, closedDealRows, crmLeadIdsForReport, describeTeamLeadAction, meetingDoneWork, mergeDeskCallRecordings, mergeOfficeShares, optionSentWork, ownerDataWork, rankAgentsByLeadWork, reportRange, shareLeadBuckets, verifyDailyLeadWork } from "./agentDailyReport.js";
import { agentDailyReportPdf, meetingViewingCount, meetingViewingEntries, reportCountRows } from "./agentDailyReportPdf.js";
import { dubaiStampToUtc } from "./officeLeads.js";

test("a lead created after Dubai midnight is inside that Dubai day", () => {
  const from = dubaiStampToUtc("2026-10-08 00:00:00");
  const to = dubaiStampToUtc("2026-10-08 23:59:59");
  const out = verifyDailyLeadWork({
    agentId: "2219",
    from,
    to,
    leadStatuses: [{ STATUS_ID: "UC_ZQMREH", NAME: "Option Sent" }, { STATUS_ID: "UC_MJDO60", NAME: "Assigned" }],
    history: {
      createdRows: [
        {
          ID: "79129",
          TITLE: "Night lead",
          ASSIGNED_BY_ID: "2219",
          STATUS_ID: "UC_ZQMREH",
          DATE_CREATE: "2026-10-07T21:10:43+00:00",
          DATE_MODIFY: "2026-10-07T21:10:43+00:00",
        },
      ],
      worked: [],
      idle: [],
    },
  });
  assert.equal(out.worked.map((row) => row.id).join(","), "79129");
});

test("reportRange day uses Dubai calendar day bounds", () => {
  const out = reportRange({ mode: "day", day: "2026-09-15" }, new Date("2026-10-01T10:00:00Z"));
  assert.equal(out.from, "2026-09-15 00:00:00");
  assert.equal(out.to, "2026-09-15 23:59:59");
  assert.equal(out.label, "2026-09-15");
});

test("lead-work ranking is highest to lowest and ignores activity on someone else's lead", () => {
  const statuses = [{ STATUS_ID: "IN_PROCESS", NAME: "Contacted" }];
  const created = [
    { ID: "11", ASSIGNED_BY_ID: "1", STATUS_ID: "IN_PROCESS", STATUS_SEMANTIC_ID: "S", DATE_CREATE: "2026-10-08T06:00:00+00:00", TITLE: "A" },
    { ID: "12", ASSIGNED_BY_ID: "1", STATUS_ID: "IN_PROCESS", STATUS_SEMANTIC_ID: "S", DATE_CREATE: "2026-10-08T07:00:00+00:00", TITLE: "B" },
    { ID: "13", ASSIGNED_BY_ID: "2", STATUS_ID: "NEW", STATUS_SEMANTIC_ID: "", DATE_CREATE: "2026-10-08T08:00:00+00:00", TITLE: "C" },
  ];
  const assignees = new Map([
    ["13", { ID: "13", ASSIGNED_BY_ID: "2" }],
    ["40", { ID: "40", ASSIGNED_BY_ID: "2" }],
  ]);
  const rows = rankAgentsByLeadWork({
    createdLeads: created,
    activities: [
      { OWNER_TYPE_ID: "1", OWNER_ID: "13", RESPONSIBLE_ID: "1" },
      { OWNER_TYPE_ID: "1", OWNER_ID: "40", RESPONSIBLE_ID: "2" },
      { OWNER_TYPE_ID: "1", OWNER_ID: "40", RESPONSIBLE_ID: "2" },
    ],
    assignees,
    users: [{ id: "1", name: "Asma" }, { id: "2", name: "Fozia" }],
    from: "2026-10-08T00:00:00+04:00",
    to: "2026-10-08T23:59:59+04:00",
    leadStatuses: statuses,
  });
  assert.deepEqual(rows.map((row) => [row.name, row.count]), [["Asma", 2], ["Fozia", 1]]);
});

test("agent share performance ranks unique leads from high to low", () => {
  const rows = agentSharePerformance([
    { sharedById: "2", sharedByName: "Fozia", leadId: "10" },
    { sharedById: "2", sharedByName: "Fozia", leadId: "10" },
    { sharedById: "1", sharedByName: "Asma", leadId: "11" },
    { sharedById: "1", sharedByName: "Asma", leadId: "12" },
  ]);
  assert.deepEqual(rows.map((row) => [row.name, row.count]), [["Asma", 2], ["Fozia", 1]]);
});

test("reportRange week is Monday through Sunday", () => {
  const out = reportRange({ mode: "week", day: "2026-10-08" });
  assert.equal(out.from, "2026-10-05 00:00:00");
  assert.equal(out.to, "2026-10-11 23:59:59");
  assert.equal(out.label, "2026-10-05 → 2026-10-11");
});

test("reportRange last 7, 15 and 30 days end on the Dubai today", () => {
  const now = new Date("2026-10-09T10:00:00Z");
  const week = reportRange({ mode: "days7" }, now);
  assert.equal(week.from, "2026-10-03 00:00:00");
  assert.equal(week.to, "2026-10-09 23:59:59");
  assert.equal(week.label, "Last 7 days");
  const mid = reportRange({ mode: "days15" }, now);
  assert.equal(mid.from, "2026-09-25 00:00:00");
  assert.equal(mid.to, "2026-10-09 23:59:59");
  const month = reportRange({ mode: "days30" }, now);
  assert.equal(month.from, "2026-09-10 00:00:00");
  assert.equal(month.to, "2026-10-09 23:59:59");
});

test("reportRange custom uses the selected from and to dates", () => {
  const out = reportRange({ mode: "custom", from: "2026-10-09", to: "2026-10-01" });
  assert.equal(out.from, "2026-10-01 00:00:00");
  assert.equal(out.to, "2026-10-09 23:59:59");
  assert.equal(out.label, "2026-10-01 → 2026-10-09");
  const empty = reportRange({ mode: "custom", from: "", to: "" });
  assert.equal(empty.from, "");
  assert.equal(empty.to, "");
});

test("reportRange month covers full month", () => {
  const out = reportRange({ mode: "month", month: "2026-09" });
  assert.equal(out.from, "2026-09-01 00:00:00");
  assert.equal(out.to, "2026-09-30 23:59:59");
  assert.equal(out.label, "2026-09");
});

test("verifyDailyLeadWork ignores modify-only old leads and other agents' activity", () => {
  const statuses = [{ STATUS_ID: "NEW", NAME: "New" }, { STATUS_ID: "IN_PROCESS", NAME: "Contacted/In Progress" }];
  const out = verifyDailyLeadWork({
    agentId: "2258",
    from: "2026-10-02 00:00:00",
    to: "2026-10-02 23:59:59",
    leadStatuses: statuses,
    myActivityLeadIds: ["78740"], // activity on Asma's lead — must NOT count
    history: {
      createdRows: [],
      worked: [
        {
          id: "65217",
          title: "Old PF call",
          assignedById: "2258",
          status: "Broker/Agent",
          created: "2026-03-13 10:53:53",
          modified: "2026-10-02 07:22:45",
          worked: true,
        },
      ],
      idle: [],
    },
  });
  assert.equal(out.worked.length, 0);
  assert.equal(out.idle.length, 0);
  assert.equal(out.ignoredModifyOnly, 1);
});

test("verifyDailyLeadWork counts created-in-period non-idle and own-lead activity", () => {
  const statuses = [
    { STATUS_ID: "NEW", NAME: "New" },
    { STATUS_ID: "IN_PROCESS", NAME: "Contacted/In Progress" },
  ];
  const out = verifyDailyLeadWork({
    agentId: "2258",
    from: "2026-10-02 00:00:00",
    to: "2026-10-02 23:59:59",
    leadStatuses: statuses,
    myActivityLeadIds: ["90001"],
    history: {
      createdRows: [
        {
          ID: "90002",
          TITLE: "New lead",
          ASSIGNED_BY_ID: "2258",
          STATUS_ID: "IN_PROCESS",
          DATE_CREATE: "2026-10-02 09:00:00",
          DATE_MODIFY: "2026-10-02 10:00:00",
        },
        {
          ID: "90003",
          TITLE: "Idle lead",
          ASSIGNED_BY_ID: "2258",
          STATUS_ID: "NEW",
          DATE_CREATE: "2026-10-02 11:00:00",
          DATE_MODIFY: "2026-10-02 11:00:00",
        },
      ],
      worked: [
        {
          id: "90001",
          title: "Older own lead",
          assignedById: "2258",
          status: "Contacted/In Progress",
          created: "2026-09-01 10:00:00",
          modified: "2026-10-02 12:00:00",
          worked: true,
        },
      ],
      idle: [],
    },
  });
  const ids = out.worked.map((row) => row.id).sort();
  assert.deepEqual(ids, ["90001", "90002"]);
  assert.equal(out.idle.length, 1);
  assert.equal(out.idle[0].id, "90003");
});

test("agent report CRM ids are the same leads as each box", () => {
  const ids = crmLeadIdsForReport({
    worked: [{ id: "10" }, { id: "11" }],
    idle: [{ id: "12" }],
    proceeded: [{ id: "11" }],
    junk: [],
    meetings: [],
    activities: [{ OWNER_TYPE_ID: "1", OWNER_ID: "10" }, { OWNER_TYPE_ID: "1", OWNER_ID: "10" }, { OWNER_TYPE_ID: "3", OWNER_ID: "99" }],
    tlRows: [{ OWNER_TYPE_ID: "1", OWNER_ID: "12" }],
    sharedOut: [
      { leadId: "20", worked: false },
      { leadId: "21", worked: true },
    ],
    sharedIn: [{ leadId: "30" }],
  });
  assert.deepEqual(ids.worked, ["10", "11"]);
  assert.deepEqual(ids.notWorked, ["12"]);
  assert.deepEqual(ids.proceeded, ["11"]);
  assert.deepEqual(ids.junk, []);
  assert.deepEqual(ids.activities, ["10"]);
  assert.deepEqual(ids.tlActions, ["12"]);
  assert.deepEqual(ids.sharedOut, ["20", "21"]);
  assert.deepEqual(ids.sharedOutIdle, ["20"]);
  assert.deepEqual(ids.sharedOutWorked, ["21"]);
  assert.deepEqual(ids.sharedIn, ["30"]);
});

test("team lead action keeps the person's name and what they did", () => {
  const names = new Map([["2558", "Khadija Khan"]]);
  const row = describeTeamLeadAction({
    ID: "9",
    SUBJECT: "Called the client",
    DESCRIPTION: "Confirmed viewing for tomorrow",
    TYPE_ID: "2",
    DIRECTION: "2",
    CREATED: "2026-10-08T07:52:48+04:00",
    OWNER_TYPE_ID: "1",
    OWNER_ID: "79012",
    AUTHOR_ID: "2558",
    RESPONSIBLE_ID: "2298",
  }, names);
  assert.equal(row.actorName, "Khadija Khan");
  assert.equal(row.typeLabel, "Call · Outgoing");
  assert.equal(row.detail, "Confirmed viewing for tomorrow");
  assert.equal(row.leadId, "79012");
});

test("one shared lead stays one count even when sent again or to more than one person", () => {
  const stats = shareLeadBuckets([
    { leadId: "78310", sharedToName: "Shahid Nawab", sharedAt: "2026-10-08 05:45:10", worked: true },
    { leadId: "78310", sharedToName: "Mohammad Farhan", sharedAt: "2026-10-08 05:45:10", worked: true },
    { leadId: "78310", sharedToName: "Shahid Nawab", sharedAt: "2026-10-08 06:00:00", worked: true },
    { leadId: "79012", sharedToName: "Abdul Qadir", sharedAt: "2026-10-08 07:52:48", worked: false },
    { leadId: "79012", sharedToName: "Abdul Qadir", sharedAt: "2026-10-08 08:10:00", worked: true },
  ]);
  assert.equal(stats.count, 2);
  assert.deepEqual(stats.all, ["78310", "79012"]);
  assert.deepEqual(stats.worked, ["78310"]);
  assert.deepEqual(stats.idle, ["79012"]);
});

test("office shares keep one row per share and count distinct leads", () => {
  const out = mergeOfficeShares([
    {
      agentId: "1",
      agentName: "Sara",
      sharedOut: [{ leadId: "10", sharedToId: "2", sharedToName: "Ali", sharedAt: "2026-10-01 10:00:00", leadTitle: "PF | Client" }],
    },
    {
      agentId: "2",
      agentName: "Ali",
      sharedOut: [{ leadId: "10", sharedById: "1", sharedToId: "2", sharedAt: "2026-10-01 10:00:00", leadTitle: "PF | Client" }],
    },
    {
      agentId: "3",
      agentName: "Noor",
      sharedOut: [{ leadId: "11", sharedToId: "1", sharedAt: "2026-10-02 09:00:00", leadTitle: "Bayut" }],
    },
  ]);
  assert.equal(out.shareCount, 2);
  assert.equal(out.leadCount, 2);
  assert.equal(out.shares[0].leadId, "11");
  assert.equal(out.shares[1].sharedByName, "Sara");
});

test("office share includes inactive users who shared a lead", async () => {
  const asked = [];
  const out = await checkOfficeShareHistory({
    mode: "all",
    force: true,
    loadOfficeScope: async () => ({ unsupported: true }),
    listAgents: async () => ({ agents: [{ id: "1", name: "Active Only" }] }),
    fetchShare: async ({ agentId }) => {
      asked.push(String(agentId));
      if (String(agentId) === "9") {
        return {
          ok: true,
          sharedOut: [{ leadId: "11", sharedById: "9", sharedToId: "1", sharedAt: "2026-10-02 10:00:00", leadTitle: "Old share", sharedByName: "Former" }],
          sharedIn: [],
        };
      }
      return {
        ok: true,
        sharedOut: [{ leadId: "10", sharedById: "1", sharedToId: "2", sharedAt: "2026-10-01 10:00:00", leadTitle: "New share" }],
        sharedIn: [{ leadId: "11", sharedById: "9", sharedToId: "1", sharedAt: "2026-10-02 10:00:00", leadTitle: "Old share", sharedByName: "Former" }],
      };
    },
    post: async (method) => {
      if (method === "user.get") {
        return { result: [{ ID: "1", NAME: "Active", ACTIVE: "Y" }, { ID: "9", NAME: "Former", ACTIVE: "N" }] };
      }
      return { result: [] };
    },
  });
  assert.equal(out.ok, true);
  assert.equal(out.shareCount, 2);
  assert.ok(asked.includes("9"));
  assert.equal(out.shares.find((row) => row.leadId === "11")?.sharedByName, "Former");
});

test("office share check uses each agent's shared-out when scope is unsupported", async () => {
  const out = await checkOfficeShareHistory({
    mode: "all",
    force: true,
    loadOfficeScope: async () => ({ unsupported: true }),
    listAgents: async () => ({ agents: [{ id: "9", name: "Sara" }] }),
    fetchShare: async ({ agentId }) => ({
      ok: true,
      sharedOut: [{ leadId: "55", sharedToId: "3", sharedToName: "Ali", sharedAt: "2026-10-05 12:00:00", leadTitle: "Call", worked: true, workLabel: "Work done" }],
      agentId,
    }),
    post: async () => ({ result: [] }),
  });
  assert.equal(out.ok, true);
  assert.equal(out.leadCount, 1);
  assert.equal(out.shareCount, 1);
  assert.equal(out.shares[0].leadId, "55");
  assert.equal(out.shares[0].sharedByName, "Sara");
  assert.equal(out.shares[0].sharedToName, "Ali");
  assert.equal(out.shares[0].workLabel, "Work done");
  assert.equal(out.range.label, "All history");
});

test("shared lead shows its current stage and is not idle after a later stage change or recipient comment", () => {
  const rows = [
    { leadId: "78410", sharedToId: "2560", sharedAt: "2026-10-02 05:52:00", worked: false, workLabel: "No work (idle alert)" },
    { leadId: "78727", sharedToId: "2560", sharedAt: "2026-10-02 06:44:00", worked: false, workLabel: "No work (idle alert)" },
    { leadId: "99", sharedToId: "2560", sharedAt: "2026-10-02 06:44:00", worked: false, workLabel: "No work yet" },
  ];
  const statusNames = new Map([
    ["10", "Meeting/Viewing Scheduled"],
    ["11", "Meeting/Viewing Done"],
  ]);
  const leads = [
    { ID: "78410", STATUS_ID: "10" },
    { ID: "78727", STATUS_ID: "11" },
  ];
  const history = [
    { OWNER_ID: "78410", CREATED_TIME: "2026-09-29T06:08:45+00:00", STATUS_ID: "10" },
    { OWNER_ID: "78727", CREATED_TIME: "2026-10-02T06:45:54+00:00", STATUS_ID: "11" },
  ];
  const comments = [
    { ENTITY_ID: "78410", AUTHOR_ID: "2434", CREATED: "2026-10-02T06:53:04+00:00" },
    { ENTITY_ID: "78727", AUTHOR_ID: "2560", CREATED: "2026-10-02T06:50:00+00:00" },
  ];
  const out = applyShareStages(rows, { statusNames, leads, history, comments, activities: [] });
  assert.equal(out[0].workLabel, "Meeting/Viewing Scheduled");
  assert.equal(out[0].worked, false);
  assert.equal(out[1].workLabel, "Meeting/Viewing Done");
  assert.equal(out[1].worked, true);
  assert.equal(out[2].workLabel, "No work yet");
  assert.equal(out[2].worked, false);
});

test("meeting viewing pdf keeps each lead, person, time, stage and meeting note", () => {
  const report = {
    agentName: "Asma Aslam",
    range: { label: "2026-10-08", from: "2026-10-08 00:00:00", to: "2026-10-08 23:59:59" },
    summary: { meetings: 2, meetingViewings: 2 },
    meetingStages: [
      { leadId: "79098", title: "Property Finder Call", stage: "Meeting/Viewing Scheduled", when: "2026-10-08 14:25:56" },
      { leadId: "78727", title: "Viewing done lead", stage: "Meeting/Viewing Done", when: "2026-10-08 16:00:00" },
    ],
    shares: {
      sharedOut: [
        { leadId: "79098", leadTitle: "Property Finder Call", sharedToName: "Abdul Qadir", sharedAt: "2026-10-08 14:25:56", workLabel: "Meeting/Viewing Scheduled" },
        { leadId: "78310", leadTitle: "WhatsApp lead", sharedToName: "Shahid", sharedAt: "2026-10-08 05:45:10", workLabel: "Option Sent" },
      ],
    },
    leads: {
      worked: [{ id: "79098", title: "Property Finder Call", status: "Meeting/Viewing Scheduled" }],
      proceeded: [{ id: "78727", title: "Viewing done lead", status: "Meeting/Viewing Done", modified: "2026-10-08 16:00:00" }],
    },
    activities: {
      meetings: [{
        leadId: "79098",
        subject: "Client viewing",
        description: "Client coming for the apartment",
        location: "International City",
        start: "2026-10-08 15:00:00",
        end: "2026-10-08 15:30:00",
      }],
    },
  };
  const rows = meetingViewingEntries(report);
  assert.equal(rows.filter((row) => row.kind === "stage").length, 2);
  assert.equal(rows[0].leadId, "79098");
  assert.equal(rows[0].person, "Abdul Qadir");
  assert.equal(rows[0].personRole, "Shared with");
  assert.equal(rows[0].when, "2026-10-08 14:25:56");
  assert.equal(rows[0].stage, "Meeting/Viewing Scheduled");
  assert.equal(rows.some((row) => row.stage === "Option Sent"), false);
  assert.equal(rows.find((row) => row.leadId === "78727").stage, "Meeting/Viewing Done");
  const meeting = rows.find((row) => row.kind === "activity");
  assert.equal(meeting.note, "Client coming for the apartment");
  assert.equal(meeting.location, "International City");
  assert.equal(meeting.end, "2026-10-08 15:30:00");
  assert.equal(meetingViewingCount(report), 2);
  assert.equal(meetingViewingCount({
    ...report,
    meetingViewingLeads: [
      { leadId: "79098", stage: "Meeting / Viewing Scheduled" },
      { leadId: "80001", stage: "Meeting / Viewing Scheduled" },
      { leadId: "80002", stage: "Contacted" },
    ],
    leads: {
      worked: [{ id: "81111", title: "Already on the stage", status: "Meeting/Viewing Scheduled" }],
    },
  }), 2);
  const pdf = agentDailyReportPdf(report).toString("latin1");
  assert.match(pdf, /Meetings\/Viewings/);
  assert.equal(Object.fromEntries(reportCountRows(report))["Meetings/Viewings"], 2);
  assert.match(pdf, /Leads worked/);
  assert.match(pdf, /Option sent/);
  assert.match(pdf, /Shared out/);
  assert.match(pdf, /Shared in/);
  assert.equal(pdf.includes("Abdul Qadir"), false);
  assert.equal(pdf.includes("International City"), false);
  assert.match(pdf, /Exact Bitrix leads/);
  assert.match(pdf, /#79098/);
  assert.match(pdf, /Property Finder Call/);
});

test("each call is its own record and the contact number last digits stay hidden", () => {
  const rows = callRecords([
    {
      ID: "1",
      TYPE_ID: "2",
      DIRECTION: "2",
      OWNER_TYPE_ID: "1",
      OWNER_ID: "79158",
      START_TIME: "2026-10-08T17:09:13+00:00",
      SUBJECT: "Outgoing to 971501234567",
      COMMUNICATIONS: [{ TYPE: "PHONE", VALUE: "971501234567", ENTITY_SETTINGS: { NAME: "Rehan" } }],
    },
    {
      ID: "2",
      TYPE_ID: "2",
      DIRECTION: "1",
      OWNER_TYPE_ID: "1",
      OWNER_ID: "79158",
      START_TIME: "2026-10-08T18:00:00+00:00",
      SUBJECT: "Incoming from 971501234567",
    },
    { ID: "3", TYPE_ID: "1", SUBJECT: "Meeting", OWNER_ID: "1" },
  ], {
    leads: new Map([["79158", { TITLE: "Bayut | Rehan", SOURCE_ID: "PF", NAME: "Rehan" }]]),
    sourceNames: new Map([["PF", "Property Finder"]]),
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].direction, "Outgoing");
  assert.equal(rows[0].from, "Property Finder");
  assert.equal(rows[0].name, "Rehan");
  assert.equal(rows[0].phone.endsWith("****"), true);
  assert.equal(rows[0].phone.includes("4567"), false);
  assert.equal(rows[1].direction, "Incoming");
  assert.equal(rows[1].phone.includes("4567"), false);
  assert.equal(rows[1].id, "2");
  assert.equal(rows[0].hasRecording, false);
});

test("call rows keep duration and a recording flag when Bitrix stored them", () => {
  const rows = callRecords([
    {
      ID: "9",
      TYPE_ID: "2",
      DIRECTION: "2",
      OWNER_TYPE_ID: "1",
      OWNER_ID: "74141",
      START_TIME: "2026-10-09T12:13:00+00:00",
      SETTINGS: { DURATION: 95, RECORD_URL: "https://crm.example/record/9" },
      FILES: [{ id: 1 }],
    },
  ]);
  assert.equal(rows[0].duration, 95);
  assert.equal(rows[0].hasRecording, true);
  assert.equal(rows[0].recordUrl, undefined);
});

test("desk recordings attach to the matching lead and extra stored calls are added", () => {
  const rows = mergeDeskCallRecordings([
    { id: "1", when: "2026-10-09T12:00:00+00:00", direction: "Outgoing", leadId: "74747", phone: "****", duration: 0, hasRecording: false, deskLeadId: "" },
  ], [
    { id: "pf-1", bitrix_id: "74747", call_record: "https://pf-ae-documents.s3.amazonaws.com/a.wav", call_talk_time: 40, call_wait_time: 5, agent_name: "Fozia razzaq", created_at: "2026-10-09T12:00:00+00:00", sender_phone: "971501112233", sender_name: "Ali" },
    { id: "pf-2", bitrix_id: "", call_record: "https://pf-ae-documents.s3.amazonaws.com/b.wav", call_talk_time: 12, agent_name: "Fozia razzaq", created_at: "2026-10-09T13:00:00+00:00", reference: "a7group-1", sender_phone: "971509998877" },
    { id: "pf-3", call_record: "https://pf-ae-documents.s3.amazonaws.com/c.wav", agent_name: "Someone else", created_at: "2026-10-09T13:10:00+00:00" },
  ], { agentName: "Fozia razzaq", from: "2026-10-09 00:00:00", to: "2026-10-09 23:59:59" });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].deskLeadId, "pf-1");
  assert.equal(rows[0].hasRecording, true);
  assert.equal(rows[0].talkTime, 40);
  assert.equal(rows[0].duration, 40);
  assert.equal(rows[1].id, "desk-pf-2");
  assert.equal(rows[1].from, "Property Finder");
});

test("meetings count only the done stage this agent moved, not scheduled", () => {
  const from = "2026-10-07 20:00:00";
  const to = "2026-10-08 19:59:59";
  const rows = meetingDoneWork({
    agentId: "2298",
    from,
    to,
    doneStatusIds: ["11"],
    stageNames: new Map([["11", "Meeting/Viewing Done"]]),
    leads: [
      { ID: "78727", TITLE: "Met the client", STATUS_ID: "11", MOVED_BY_ID: "2298", MOVED_TIME: "2026-10-08T12:00:00+00:00" },
      { ID: "79098", TITLE: "Still scheduled", STATUS_ID: "10", MOVED_BY_ID: "2298", MOVED_TIME: "2026-10-08T14:25:56+00:00" },
      { ID: "79100", TITLE: "Done by someone else", STATUS_ID: "11", MOVED_BY_ID: "2560", MOVED_TIME: "2026-10-08T11:00:00+00:00" },
      { ID: "78310", TITLE: "Done another day", STATUS_ID: "11", MOVED_BY_ID: "2298", MOVED_TIME: "2026-10-01T11:00:00+00:00" },
    ],
  });
  assert.deepEqual(rows.map((row) => row.leadId), ["78727"]);
  assert.equal(rows[0].stage, "Meeting/Viewing Done");
});

test("meeting and viewing rows are the stage changes this agent made", () => {
  const from = "2026-10-09 00:00:00";
  const to = "2026-10-09 23:59:59";
  const stageNames = new Map([
    ["10", "Meeting / Viewing Scheduled"],
    ["11", "Meeting / Viewing Done"],
    ["8", "Option Sent"],
  ]);
  const leads = new Map([
    ["74141", { TITLE: "Viewing booked", ASSIGNED_BY_ID: "2302", MOVED_BY_ID: "2302" }],
    ["74827", { TITLE: "Met", ASSIGNED_BY_ID: "2302", MOVED_BY_ID: "999" }],
    ["70001", { TITLE: "Other agent", ASSIGNED_BY_ID: "999", MOVED_BY_ID: "999" }],
  ]);
  const rows = agentMeetingStageChanges({
    agentId: "2302",
    from,
    to,
    stageNames,
    leads,
    history: [
      { OWNER_ID: "74141", STATUS_ID: "10", CREATED_TIME: "2026-10-09T12:10:00+00:00", RESPONSIBLE_ID: "2302" },
      { OWNER_ID: "74827", STATUS_ID: "11", CREATED_TIME: "2026-10-09T15:00:00+00:00", AUTHOR_ID: "2302" },
      { OWNER_ID: "70001", STATUS_ID: "10", CREATED_TIME: "2026-10-09T16:00:00+00:00", AUTHOR_ID: "999" },
      { OWNER_ID: "74141", STATUS_ID: "8", CREATED_TIME: "2026-10-09T11:00:00+00:00", AUTHOR_ID: "2302" },
    ],
  });
  assert.deepEqual(rows.map((row) => row.leadId), ["74141", "74827"]);
  assert.equal(rows[0].stage, "Meeting / Viewing Scheduled");
  assert.equal(rows[1].stage, "Meeting / Viewing Done");
  const onlyAssigned = agentMeetingStageChanges({
    agentId: "2302",
    from,
    to,
    stageNames,
    leads: new Map([["75555", { TITLE: "Still on the stage", ASSIGNED_BY_ID: "2302", MOVED_BY_ID: "14" }]]),
    history: [
      { OWNER_ID: "75555", STATUS_ID: "10", TYPE_ID: "2", CREATED_TIME: "2026-10-09T12:00:00+00:00" },
      { OWNER_ID: "75556", STATUS_ID: "10", TYPE_ID: "1", CREATED_TIME: "2026-10-09T12:05:00+00:00", AUTHOR_ID: "2302" },
    ],
  });
  assert.deepEqual(onlyAssigned, []);
});

test("closed deals are the ones this agent closed in the window", () => {
  const rows = closedDealRows([
    { ID: "501", TITLE: "Marina sale", ASSIGNED_BY_ID: "2302", STAGE_ID: "WON", STAGE_SEMANTIC_ID: "S", OPPORTUNITY: "150000", CURRENCY_ID: "AED", CLOSEDATE: "2026-10-09", LEAD_ID: "74141" },
    { ID: "502", TITLE: "Lost rent", ASSIGNED_BY_ID: "2302", STAGE_ID: "LOSE", STAGE_SEMANTIC_ID: "F", OPPORTUNITY: "0", CLOSEDATE: "2026-10-09" },
    { ID: "503", TITLE: "Still open", ASSIGNED_BY_ID: "2302", STAGE_SEMANTIC_ID: "P", CLOSEDATE: "2026-10-09" },
    { ID: "504", TITLE: "Other agent", ASSIGNED_BY_ID: "999", STAGE_SEMANTIC_ID: "S", CLOSEDATE: "2026-10-09" },
    { ID: "505", TITLE: "Last month", ASSIGNED_BY_ID: "2302", STAGE_SEMANTIC_ID: "S", CLOSEDATE: "2026-09-01" },
  ], {
    agentId: "2302",
    from: "2026-10-09 00:00:00",
    to: "2026-10-09 23:59:59",
    stageNames: new Map([["WON", "Deal won"], ["LOSE", "Deal lost"]]),
  });
  assert.deepEqual(rows.map((row) => row.id), ["501", "502"]);
  assert.equal(rows[0].stage, "Won");
  assert.equal(rows[0].stageName, "Deal won");
  assert.equal(rows[0].amount, 150000);
  assert.equal(rows[1].stage, "Lost");
});

test("option sent is the stage change after this agent's call, and owner data keeps their note", () => {
  const from = "2026-10-07 20:00:00";
  const to = "2026-10-08 19:59:59";
  const sent = optionSentWork({
    from,
    to,
    optionStatusIds: ["UC_ZQMREH"],
    calls: [
      { TYPE_ID: "2", OWNER_TYPE_ID: "1", OWNER_ID: "78564", SUBJECT: "Called the client", CREATED: "2026-10-08T08:40:00+00:00" },
      { TYPE_ID: "2", OWNER_TYPE_ID: "1", OWNER_ID: "100", SUBJECT: "Other call", CREATED: "2026-10-08T09:00:00+00:00" },
    ],
    leads: new Map([["78564", { TITLE: "Personal | Elham" }]]),
    history: [
      { OWNER_ID: "78564", STATUS_ID: "UC_ZQMREH", CREATED_TIME: "2026-10-08T08:51:57+00:00" },
      { OWNER_ID: "78564", STATUS_ID: "UC_ZQMREH", CREATED_TIME: "2026-09-01T08:00:00+00:00" },
      { OWNER_ID: "999", STATUS_ID: "UC_ZQMREH", CREATED_TIME: "2026-10-08T10:00:00+00:00" },
    ],
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].leadId, "78564");
  assert.equal(sent[0].title, "Personal | Elham");
  assert.equal(sent[0].callSubject, "Called the client");
  assert.equal(sent[0].stage, "Option Sent");
  const owners = ownerDataWork({
    agentId: "2298",
    stageNames: new Map([["DT1042_13:UC_2C7RN8", "Follow up"]]),
    items: [{ id: "97910", title: "KULDIP", updatedTime: "2026-10-08T10:23:21+00:00", stageId: "DT1042_13:UC_2C7RN8" }],
    comments: [
      { ENTITY_ID: "97910", AUTHOR_ID: "2298", COMMENT: "Owner wants 6 cheques" },
      { ENTITY_ID: "97910", AUTHOR_ID: "1", COMMENT: "Ignore other user" },
    ],
  });
  assert.equal(owners.length, 1);
  assert.equal(owners[0].stage, "Follow up");
  assert.equal(owners[0].detail, "Owner wants 6 cheques");
  const pdfReport = {
    agentName: "Asma Aslam",
    range: { label: "2026-10-08" },
    leads: { worked: [{ id: "78564", title: "Personal | Elham", status: "Option Sent" }] },
    optionSent: sent,
    ownerWork: owners,
    shares: { sharedOut: [{ leadId: "1" }, { leadId: "2" }], sharedIn: [{ leadId: "9" }] },
    summary: {
      leadsWorked: 12,
      leadsNotWorked: 13,
      leadsProceeded: 11,
      leadsJunk: 0,
      meetings: 0,
      optionSent: 2,
      ownerWork: 4,
      activities: 48,
      tlActions: 7,
      sharedOut: 5,
      sharedOutWorked: 5,
      sharedOutIdle: 0,
      sharedIn: 0,
    },
  };
  const counts = Object.fromEntries(reportCountRows(pdfReport));
  assert.equal(counts["Leads worked"], 12);
  assert.equal(counts["Option sent"], 2);
  assert.equal(counts["Owner data"], 4);
  assert.equal(counts["Shared out"], 5);
  assert.equal(counts["Share work done"], 5);
  assert.equal(counts["Shared in"], 0);
  const pdf = agentDailyReportPdf(pdfReport).toString("latin1");
  assert.match(pdf, /Leads worked/);
  assert.match(pdf, /Option sent/);
  assert.match(pdf, /Shared out/);
  assert.match(pdf, /Shared in/);
  assert.match(pdf, /#78564/);
  assert.match(pdf, /Personal \| Elham/);
  assert.match(pdf, /#97910/);
  assert.match(pdf, /KULDIP/);
  assert.match(pdf, /Owner wants 6 cheques/);
  assert.equal(pdf.includes("Called the client"), false);
});
