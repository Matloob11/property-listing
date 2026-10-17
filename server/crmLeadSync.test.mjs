import assert from "node:assert/strict";
import test from "node:test";
import {
  crmDateToIso,
  crmLeadId,
  crmLeadName,
  crmPortalSource,
  isPfCrmSource,
  mapCrmPortalLead,
  pullCrmPortalLeads,
} from "./crmLeadSync.js";
import { karachiDay, leadActivity, leadPortal, portalLeadCounts } from "./leadPortal.js";
import { buildOverviewReport, topAgentsByLeads, topListingsByLeads } from "./overviewReport.js";
import { leadView } from "./leadRecording.js";

test("Bayut and Dubizzle sources map; Property Finder sources stay out", () => {
  assert.deepEqual(crmPortalSource("UC_Y3VNS9"), { id: "UC_Y3VNS9", portal: "bayut", channel: "whatsapp" });
  assert.deepEqual(crmPortalSource("UC_JPSVQU"), { id: "UC_JPSVQU", portal: "dubizzle", channel: "call" });
  assert.equal(crmPortalSource("UC_KQ0WO3"), null);
  assert.equal(isPfCrmSource("UC_KQ0WO3"), true);
  assert.equal(isPfCrmSource("UC_Y3VNS9"), false);
});

test("CRM portal lead becomes a desk row with crm id and Bayut tag", () => {
  const lead = mapCrmPortalLead(
    {
      ID: "88001",
      TITLE: "Bayut WhatsApp — Sara Ali — A7-100",
      NAME: "Sara",
      LAST_NAME: "Ali",
      SOURCE_ID: "UC_Y3VNS9",
      STATUS_ID: "NEW",
      DATE_CREATE: "2026-09-10 11:30:00",
      PHONE: [{ VALUE: "+971501112222" }],
      EMAIL: [{ VALUE: "sara@example.com" }],
      UF_CRM_1760707563281: "A7-100",
    },
    new Map([["a7-100", { id: "lst-1", reference: "A7-100" }]])
  );
  assert.equal(lead.id, "crm-88001");
  assert.equal(lead.bitrix_id, "88001");
  assert.equal(lead.channel, "whatsapp");
  assert.equal(lead.entity_type, "bayut");
  assert.deepEqual(lead.tags, ["bayut"]);
  assert.equal(lead.sender_name, "Sara Ali");
  assert.equal(lead.sender_phone, "+971501112222");
  assert.equal(lead.listing_id, "lst-1");
  assert.equal(lead.reference, "A7-100");
  assert.equal(leadPortal(lead), "bayut");
  assert.match(lead.created_at, /^2026-09-10T/);
});

test("Property Finder CRM rows are not imported again", () => {
  assert.equal(mapCrmPortalLead({ ID: "1", SOURCE_ID: "UC_KQ0WO3", TITLE: "PF" }), null);
  assert.equal(crmLeadId(""), "");
  assert.equal(crmLeadName({ TITLE: "Bayut WhatsApp — Omar" }), "Omar");
  assert.match(crmDateToIso("2026-09-01 08:00:00"), /^2026-09-01T/);
});

test("Personal CRM source lands as other, not Property Finder", () => {
  const lead = mapCrmPortalLead({
    ID: "12",
    TITLE: "Personal WhatsApp",
    SOURCE_ID: "UC_7J0E2Q",
    DATE_CREATE: "2026-09-03 09:00:00",
  });
  assert.equal(lead.entity_type, "other");
  assert.equal(leadPortal(lead), "other");
});

test("pull skips Property Finder sources and upserts Bayut pages", async () => {
  const saved = [];
  const db = {
    getSetting: async () => ({}),
    setSetting: async () => {},
    all: async () => [],
    upsertLeads: async (rows) => {
      saved.push(...rows);
      return rows.length;
    },
  };
  const bx = async (_user, method, params) => {
    assert.equal(method, "crm.lead.list");
    if (params.filter.SOURCE_ID === "UC_Y3VNS9" && params.start === 0) {
      return {
        ok: true,
        result: [{ ID: "9", TITLE: "Bayut", SOURCE_ID: "UC_Y3VNS9", DATE_CREATE: "2026-09-02 10:00:00" }],
      };
    }
    return { ok: true, result: [] };
  };
  const out = await pullCrmPortalLeads(db, { bx, sleep: async () => {}, maxPages: 2, ready: () => true });
  assert.equal(out.fetched, 1);
  assert.equal(out.upserted, 1);
  assert.equal(saved[0].id, "crm-9");
  assert.equal(saved[0].entity_type, "bayut");
});

test("lead view exposes portal label and hides raw/call url", () => {
  const view = leadView({
    id: "crm-9",
    channel: "whatsapp",
    entity_type: "bayut",
    tags: ["bayut"],
    bitrix_id: "9",
    call_record: "https://example.test/secret.mp3",
    raw: { source_id: "UC_Y3VNS9" },
  });
  assert.equal(view.portal, "bayut");
  assert.equal(view.portal_label, "Bayut");
  assert.equal(view.raw, undefined);
  assert.equal(view.call_record, undefined);
});

test("portal lead counts split Property Finder, Bayut and Dubizzle by day week and month", () => {
  const now = Date.parse("2026-10-06T12:00:00.000Z");
  const counts = portalLeadCounts(
    [
      { id: "pf-1", created_at: "2026-10-06T08:00:00.000Z" },
      { id: "pf-early", created_at: "2026-10-05T22:00:00.000Z" },
      { id: "crm-2", entity_type: "bayut", tags: ["bayut"], created_at: "2026-10-06T09:00:00.000Z" },
      { id: "crm-3", entity_type: "dubizzle", tags: ["dubizzle"], created_at: "2026-10-04T09:00:00.000Z" },
      { id: "crm-4", entity_type: "bayut", tags: ["bayut"], created_at: "2026-09-20T09:00:00.000Z" },
      { id: "crm-5", entity_type: "other", tags: ["other"], created_at: "2026-10-06T09:00:00.000Z" },
      { id: "pf-old", created_at: "2026-08-01T09:00:00.000Z" },
    ],
    now
  );
  assert.deepEqual(counts.day, { pf: 2, bayut: 1, dubizzle: 0 });
  assert.deepEqual(counts.week, { pf: 2, bayut: 1, dubizzle: 1 });
  assert.deepEqual(counts.days15, { pf: 2, bayut: 1, dubizzle: 1 });
  assert.deepEqual(counts.month, { pf: 2, bayut: 2, dubizzle: 1 });
  assert.deepEqual(counts.by_day["2026-10-06"], { pf: 2, bayut: 1, dubizzle: 0 });
  assert.equal(counts.by_day["2026-08-01"].pf, 1);
  assert.deepEqual(counts.all, { pf: 3, bayut: 2, dubizzle: 1 });
});

test("lead activity follows the selected Karachi window and keeps today hourly", () => {
  const now = Date.parse("2026-10-06T12:00:00.000Z");
  assert.equal(karachiDay(now), "2026-10-06");
  const leads = [
    { id: "now", channel: "whatsapp", created_at: "2026-10-06T08:00:00.000Z" },
    { id: "late", channel: "call", created_at: "2026-10-05T20:30:00.000Z" },
    { id: "older", channel: "email", created_at: "2026-09-20T09:00:00.000Z" },
  ];
  const today = leadActivity(leads, { now, range: "day" });
  assert.equal(today.hourly, true);
  assert.equal(today.daily.length, 24);
  assert.equal(today.by_channel.whatsapp, 1);
  assert.equal(today.by_channel.call, 1);
  assert.equal(today.latest[0].id, "now");
  const week = leadActivity(leads, { now, range: "week" });
  assert.equal(week.daily.length, 7);
  assert.equal(week.daily.at(-1).count, 2);
  assert.equal(week.by_channel.email, undefined);
  const custom = leadActivity(leads, { now, range: "custom", from: "2026-09-01", to: "2026-09-30" });
  assert.equal(custom.latest.length, 1);
  assert.equal(custom.latest[0].id, "older");
});

test("top listings count the latest 30 Karachi days and match a reference once", () => {
  const now = Date.parse("2026-10-06T12:00:00.000Z");
  const listings = [
    { id: "a", reference: "a7group-1713", title: "Studio", photo: "p" },
    { id: "b", reference: "a7group-1719", title: "Villa", photo: "" },
  ];
  const ranked = topListingsByLeads(listings, [
    { listing_id: "a", reference: "a7group-1713", created_at: "2026-10-06T08:00:00.000Z" },
    { reference: "A7GROUP-1713", created_at: "2026-10-05T20:30:00.000Z" },
    { listing_id: "b", created_at: "2026-09-20T09:00:00.000Z" },
    { listing_id: "a", created_at: "2026-08-01T09:00:00.000Z" },
  ], now, 30);
  assert.equal(ranked[0].reference, "a7group-1713");
  assert.equal(ranked[0].count, 2);
  assert.equal(ranked[1].reference, "a7group-1719");
  assert.equal(ranked[1].count, 1);
  const agents = topAgentsByLeads(
    listings.map((row) => (row.id === "a" ? { ...row, listing_agent: "Muhammad Akmal Saeed" } : row)),
    [
      { listing_id: "a", agent_name: "Someone Else", created_at: "2026-10-06T08:00:00.000Z" },
      { reference: "a7group-1713", created_at: "2026-10-05T20:30:00.000Z" },
      { agent_name: "Hajra", created_at: "2026-10-04T08:00:00.000Z" },
    ],
    now,
    30
  );
  assert.deepEqual(agents[0], { name: "Muhammad Akmal Saeed", count: 2 });
  assert.deepEqual(agents[1], { name: "Hajra", count: 1 });
});

test("team report uses the latest Karachi window, not older leads", () => {
  const now = Date.parse("2026-10-06T12:00:00.000Z");
  const listings = [{
    id: "a",
    reference: "a7group-1",
    title: "Studio",
    listing_agent: "Malik",
    pf_quality_score: "",
    status: "live",
    photo: "",
    community: "Mudon",
    gallery: [],
  }];
  const report = buildOverviewReport(listings, [
    { listing_id: "a", reference: "a7group-1", agent_name: "Malik", created_at: "2026-10-06T08:00:00.000Z" },
    { listing_id: "a", agent_name: "Malik", created_at: "2026-09-20T09:00:00.000Z" },
  ], 7, null, now);
  assert.equal(report.days, 7);
  assert.equal(report.window_leads, 1);
  assert.equal(report.extremes.highest.leads, 1);
  assert.equal(report.leads_per_listing[0].leads, 1);
  assert.equal(report.ads_per_person[0].leads_window, 1);
});

test("overview reasons use listing lead totals and ignore website sync edits", () => {
  const now = Date.parse("2026-10-13T07:00:00.000Z");
  const listings = [
    {
      id: "a",
      reference: "a7group-1727",
      title: "Premium Studio | China Cluster",
      listing_agent: "Muhammad Akmal Saeed",
      pf_quality_score: 99,
      status: "live",
      community: "International City",
      gallery: [],
      history: [
        { at: "2026-10-01T08:00:00.000Z", by: "Saad", field: "price_aed", value: "29000" },
        { at: "2026-10-13T06:52:00.000Z", by: "bayut website", field: "community", value: "International City" },
      ],
    },
    {
      id: "b",
      reference: "a7group-1883",
      title: "Townhouse",
      listing_agent: "Abdul Malik Abdul Karim",
      pf_quality_score: 99,
      status: "live",
      community: "DAMAC Lagoons",
      gallery: [],
      history: [],
    },
  ];
  const report = buildOverviewReport(listings, [
    { listing_id: "a", created_at: "2026-10-12T08:00:00.000Z" },
    { listing_id: "a", created_at: "2026-10-11T08:00:00.000Z" },
    { listing_id: "b", created_at: "2026-10-10T08:00:00.000Z" },
  ], 7, null, now);
  const text = report.reasons.join(" ");
  assert.match(text, /a7group-1727 has the most leads \(2\)/);
  assert.match(text, /Muhammad Akmal Saeed/);
  assert.match(text, /International City \(2\)/);
  assert.match(text, /China Cluster \(2\)/);
  assert.equal(report.reasons.some((line) => /quality scores/i.test(line)), false);
  const saeed = report.agent_activity.find((person) => person.name === "Muhammad Akmal Saeed");
  assert.equal(saeed.listings[0].edited_at, "2026-10-01T08:00:00.000Z");
  assert.equal(saeed.listings[0].edited_by, "Saad");
});
