import test from "node:test";
import assert from "node:assert/strict";
import { agentMonthBoardPdf, agentMonthBoardPdfName } from "./agentMonthBoardPdf.js";

test("all-agents PDF lists every loaded agent", () => {
  const pdf = agentMonthBoardPdf({
    month: "Last 30 days",
    totals: { deals: 2, rent: 2, sale: 0, optionSent: 1 },
    agents: [
      { id: "2298", name: "Asma Aslam", deals: 2, rent: 2, sale: 0, optionSent: 1 },
      { id: "9", name: "Idle Agent", deals: 0, rent: 0, sale: 0, optionSent: 0 },
    ],
  });
  const text = pdf.toString("latin1");
  assert.match(text, /^%PDF-1.4/);
  assert.match(text, /Asma Aslam/);
  assert.match(text, /Idle Agent/);
  assert.match(text, /Option sent/);
  assert.equal(agentMonthBoardPdfName({ month: "Last 30 days" }), "all-agents-report-Last_30_days.pdf");
});
