import assert from "node:assert/strict";
import test from "node:test";
import { leadMatchesQuery } from "./leadPortal.js";

const lead = {
  id: "call_lead_9",
  sender_name: "Omar",
  sender_phone: "+971 50 391 4447",
  sender_email: "omar@example.com",
  reference: "a7group-1892",
  agent_name: "Khadija Munir",
  bitrix_id: "81220",
  channel: "whatsapp",
  status: "new",
  tags: ["bayut"],
};

test("lead search matches name, reference, crm id and phone digits", () => {
  assert.equal(leadMatchesQuery(lead, "omar"), true);
  assert.equal(leadMatchesQuery(lead, "a7group-1892"), true);
  assert.equal(leadMatchesQuery(lead, "81220"), true);
  assert.equal(leadMatchesQuery(lead, "050 391 4447"), true);
  assert.equal(leadMatchesQuery(lead, "khadija"), true);
  assert.equal(leadMatchesQuery(lead, "bayut"), true);
  assert.equal(leadMatchesQuery(lead, "no-such-lead"), false);
  assert.equal(leadMatchesQuery(lead, "   "), true);
});
