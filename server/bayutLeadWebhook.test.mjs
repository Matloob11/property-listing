import assert from "node:assert/strict";
import test from "node:test";
import { bayutPushLead } from "./bayutLeadWebhook.js";
import { leadPortal } from "./leadPortal.js";

test("bayut push lead uses their id and shows as Bayut", () => {
  const lead = bayutPushLead({
    id: "991",
    type: "whatsapp",
    enquirer: { name: "Omar", phone: "+971503914447", email: "omar@example.com" },
    listing: { reference: "a7group-1892" },
    agent_name: "Khadija",
    created_at: "2026-10-12T06:00:00Z",
  });
  assert.equal(lead.id, "bayut-991");
  assert.equal(lead.channel, "whatsapp");
  assert.equal(lead.sender_name, "Omar");
  assert.equal(lead.sender_phone, "+971503914447");
  assert.equal(lead.reference, "a7group-1892");
  assert.equal(lead.agent_name, "Khadija");
  assert.equal(leadPortal(lead), "bayut");
  assert.equal(bayutPushLead({ id: "991", type: "call" }).id, "bayut-991");
});

test("dubizzle in the payload stays Dubizzle and an empty body is ignored", () => {
  const lead = bayutPushLead({ source: "dubizzle", lead_id: "12", enquiry_type: "phone" });
  assert.equal(lead.id, "dubizzle-12");
  assert.equal(lead.channel, "call");
  assert.equal(leadPortal(lead), "dubizzle");
  assert.equal(bayutPushLead(null), null);
  assert.equal(bayutPushLead({}), null);
});
