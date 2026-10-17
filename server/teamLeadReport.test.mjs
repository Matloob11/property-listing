import assert from "node:assert/strict";
import test from "node:test";
import { shapeTlComments, TEAM_LEADS } from "./teamLeadReport.js";

test("built-in list uses Hassan TL and not a second Hassan", () => {
  assert.deepEqual(TEAM_LEADS.map((row) => row.name), [
    "Hassan TL",
    "Hussnain",
    "Javeria",
    "Asma",
    "Fozia",
    "Farhat",
  ]);
  assert.equal(TEAM_LEADS.filter((row) => row.id === "2560").length, 1);
});

test("team lead comment rows keep lead, responsible, and the note", () => {
  const rows = shapeTlComments([
    {
      id: 9,
      leadId: 79478,
      title: "Personal | nazim",
      responsibleId: 10,
      responsibleName: "Alina Zia",
      authorId: 2560,
      authorName: "Hassan T.L",
      rating: 0,
      text: "Kindly solve this issue",
      createdAt: "2026-10-13T08:56:42Z",
    },
    { id: 10, leadId: "", text: "missing lead" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].leadId, "79478");
  assert.equal(rows[0].responsibleName, "Alina Zia");
  assert.equal(rows[0].authorName, "Hassan T.L");
  assert.equal(rows[0].when, "2026-10-13T08:56:42Z");
});
