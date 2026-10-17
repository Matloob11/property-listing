import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAgentReportPrivacy,
  canViewFullAgentReport,
  maskHalfName,
  maskPhoneInText,
  maskPrivateText,
} from "./reportPrivacy.js";

test("maskPhoneInText hides last 4 digits", () => {
  assert.equal(maskPhoneInText("Outgoing to 971559564378"), "Outgoing to 97155956****");
  assert.equal(maskPhoneInText("Outgoing to +971 52 415 4778"), "Outgoing to +971 52 415 ****");
  assert.equal(maskPhoneInText("Outgoing to 00971557221892"), "Outgoing to 0097155722****");
});

test("maskHalfName keeps first half", () => {
  assert.equal(maskHalfName("Abdul Qadir"), "Abd** Qad**");
  assert.equal(maskHalfName("Ali"), "Al*");
});

test("maskPrivateText keeps Outgoing prefix", () => {
  assert.match(maskPrivateText("Outgoing to 971559564378"), /^Outgoing to /);
  assert.match(maskPrivateText("Outgoing to 971559564378"), /\*\*\*\*$/);
});

test("only own report shows full phones — other viewers get last-4 masked", () => {
  assert.equal(canViewFullAgentReport({ id: "2371", admin: false }, "2371"), true);
  assert.equal(canViewFullAgentReport({ id: "9", admin: true }, "2371"), false);
  assert.equal(canViewFullAgentReport({ id: "10", admin: false }, "2371"), false);
  assert.equal(canViewFullAgentReport({ id: "2379", admin: false }, "32"), true);
  assert.equal(canViewFullAgentReport({ id: "1", email: "emanfazal.a7group@gmail.com" }, "32"), true);
});

test("applyAgentReportPrivacy masks activity subjects for others", () => {
  const report = {
    ok: true,
    agentId: "2371",
    note: "x",
    activities: { rows: [{ id: "1", subject: "Outgoing to 971559564378" }], meetings: [] },
    leads: { worked: [{ id: "1", title: "PF | James" }], notWorked: [], proceeded: [], junk: [] },
    shares: { sharedOut: [{ leadTitle: "Lead", sharedByName: "Tehreem", sharedToName: "Abdul Qadir" }], sharedIn: [], idleAlerts: [] },
  };
  const masked = applyAgentReportPrivacy(report, { id: "99", admin: false });
  assert.equal(masked.privacy.masked, true);
  assert.equal(masked.activities.rows[0].subject, "Outgoing to 97155956****");
  assert.equal(masked.shares.sharedOut[0].sharedToName, "Abd** Qad**");
  const adminOther = applyAgentReportPrivacy(report, { id: "1", admin: true });
  assert.equal(adminOther.privacy.masked, true);
  assert.equal(adminOther.activities.rows[0].subject, "Outgoing to 97155956****");
  const full = applyAgentReportPrivacy(report, { id: "2371", admin: false });
  assert.equal(full.privacy.masked, false);
  assert.equal(full.activities.rows[0].subject, "Outgoing to 971559564378");
});
