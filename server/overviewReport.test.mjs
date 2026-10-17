import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentActivity, listingActivity } from "./overviewReport.js";

test("listing activity uses posted time and last desk edit, not PF sync", () => {
  const row = listingActivity({
    id: "1",
    reference: "a7group-1715",
    title: "Studio",
    status: "live",
    listing_agent: "Abdul Malik Abdul Karim",
    created_at: "2026-09-07T13:00:44.133Z",
    created_by: "FAMEEDA KP",
    history: [
      { at: "2026-09-07T13:00:44.133Z", by: "FAMEEDA KP", field: "created", value: "live" },
      { at: "2026-09-15T07:24:02.903Z", by: "Old desk CSV import", field: "portals", value: "pf" },
      { at: "2026-09-21T08:53:45.182Z", by: "Saad", field: "status", value: "archived" },
      { at: "2026-09-22T06:19:19.891Z", by: "Property Finder sync", field: "pf_state", value: "live" },
    ],
  });
  assert.equal(row.posted_at, "2026-09-07T13:00:44.133Z");
  assert.equal(row.posted_by, "FAMEEDA KP");
  assert.equal(row.edited_at, "2026-09-21T08:53:45.182Z");
  assert.equal(row.edited_by, "Saad");
  assert.equal(row.working, true);
});

test("agent activity groups listings and keeps last posted / edited", () => {
  const people = buildAgentActivity([
    {
      id: "1",
      reference: "a7group-1",
      status: "live",
      listing_agent: "Saad",
      created_at: "2026-09-01T10:00:00.000Z",
      history: [{ at: "2026-09-01T10:00:00.000Z", by: "Saad", field: "created", value: "live" }],
    },
    {
      id: "2",
      reference: "a7group-2",
      status: "archived",
      listing_agent: "Saad",
      created_at: "2026-09-02T10:00:00.000Z",
      history: [
        { at: "2026-09-02T10:00:00.000Z", by: "Saad", field: "created", value: "live" },
        { at: "2026-09-03T12:30:00.000Z", by: "Saad", field: "title", value: "Updated" },
      ],
    },
  ]);
  assert.equal(people.length, 1);
  assert.equal(people[0].ads, 2);
  assert.equal(people[0].working, 1);
  assert.equal(people[0].last_posted, "2026-09-02T10:00:00.000Z");
  assert.equal(people[0].last_edited, "2026-09-03T12:30:00.000Z");
  assert.equal(people[0].listings[0].reference, "a7group-2");
});
