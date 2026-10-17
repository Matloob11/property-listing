import assert from "node:assert/strict";
import test from "node:test";
import { enrichPfLead, nextLeadRefreshPage } from "./pfSync.js";

test("lead refresh walks forward and restarts after the last page", () => {
  assert.equal(nextLeadRefreshPage(3, true), 4);
  assert.equal(nextLeadRefreshPage(200, false), 1);
  assert.equal(nextLeadRefreshPage(0, true), 2);
});

test("lead refresh keeps the desk link, recording, and CRM id when Property Finder omits them", () => {
  const listings = new Map([["pf-9", "desk-9"]]);
  const agents = new Map([["55", "Asma Aslam"]]);
  const lead = enrichPfLead(
    {
      id: "call_lead_1",
      pf_listing_id: "",
      agent_pf_profile: "",
      call_record: "",
      status: "answered",
    },
    {
      listing_id: "desk-kept",
      agent_name: "Kept Agent",
      call_record: "https://pf-ae-documents.s3.amazonaws.com/a.wav",
      bitrix_id: "74747",
    },
    listings,
    agents
  );
  assert.equal(lead.listing_id, "desk-kept");
  assert.equal(lead.agent_name, "Kept Agent");
  assert.equal(lead.call_record, "https://pf-ae-documents.s3.amazonaws.com/a.wav");
  assert.equal(lead.bitrix_id, "74747");
  assert.equal(lead.status, "answered");
});
