import assert from "node:assert/strict";
import test from "node:test";
import { leadDateKey, leadDateLabel, leadDateMode, leadDateRangeLabel, leadMatchesDate, leadMatchesDateRange, parseLeadDateFilter } from "./leadDate.js";

test("day, month, and year filters match Dubai calendar dates", () => {
  const sept = "2026-09-25T13:44:00.000Z";
  assert.equal(leadDateKey(sept), "2026-09-25");
  assert.equal(leadMatchesDate(sept, "2026-09-25"), true);
  assert.equal(leadMatchesDate(sept, "2026-09"), true);
  assert.equal(leadMatchesDate(sept, "2026"), true);
  assert.equal(leadMatchesDate(sept, "2026-08"), false);
  assert.equal(leadMatchesDate(sept, "2026-09-24"), false);
  assert.equal(leadMatchesDate(sept, "2025"), false);
});

test("UTC evening counts on the next Dubai day", () => {
  const late = "2026-09-30T21:30:00.000Z";
  assert.equal(leadDateKey(late), "2026-10-01");
  assert.equal(leadMatchesDate(late, "2026-09"), false);
  assert.equal(leadMatchesDate(late, "2026-10"), true);
  assert.equal(leadMatchesDate(late, "2026-10-01"), true);
});

test("date filter parsing and labels", () => {
  assert.equal(parseLeadDateFilter("2026-09"), "2026-09");
  assert.equal(parseLeadDateFilter("nope"), "");
  assert.equal(leadDateMode("2026-09-25"), "day");
  assert.equal(leadDateMode("2026-09"), "month");
  assert.equal(leadDateMode("2026"), "year");
  assert.equal(leadDateMode(""), "all");
  assert.equal(leadDateLabel("2026-09"), "September 2026");
  assert.equal(leadMatchesDate("2026-09-01T00:00:00.000Z", ""), true);
});

test("date to date includes both Dubai midnights", () => {
  const first = "2026-09-30T20:00:00.000Z";
  const last = "2026-10-10T19:59:00.000Z";
  const before = "2026-09-30T19:59:00.000Z";
  const after = "2026-10-10T20:00:00.000Z";
  assert.equal(leadDateKey(first), "2026-10-01");
  assert.equal(leadDateKey(last), "2026-10-10");
  assert.equal(leadMatchesDateRange(first, "2026-10-01", "2026-10-10"), true);
  assert.equal(leadMatchesDateRange(last, "2026-10-01", "2026-10-10"), true);
  assert.equal(leadMatchesDateRange(before, "2026-10-01", "2026-10-10"), false);
  assert.equal(leadMatchesDateRange(after, "2026-10-01", "2026-10-10"), false);
  assert.equal(leadMatchesDateRange(first, "2026-10-10", "2026-10-01"), true);
  assert.equal(leadMatchesDateRange(first, "", ""), true);
  assert.equal(leadDateRangeLabel("2026-10-01", "2026-10-10"), "1 Oct 2026 – 10 Oct 2026");
});
