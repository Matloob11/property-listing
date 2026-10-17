import assert from "node:assert/strict";
import test from "node:test";
import { bayutTimestamp, mapBayutStatLead, samePortalLead } from "./bayutLeadPull.js";
import { leadPortal } from "./leadPortal.js";

test("Bayut lead time is the Dubai clock", () => {
  assert.equal(bayutTimestamp("2026-10-13T05:47:46.931Z"), "2026-10-13 09:47:46");
});

test("email and sms rows become leads and a click without a person does not", () => {
  const email = mapBayutStatLead({
    lead_id: "e1",
    source: "dubizzle",
    listing_reference: "a7group-10",
    date_time: "2026-10-12 09:00:00",
    client_name: "Sara",
    email_address: "sara@example.com",
  }, "email");
  assert.equal(email.id, "dubizzle-email-e1");
  assert.equal(email.channel, "email");
  assert.equal(email.sender_name, "Sara");
  assert.equal(email.sender_email, "sara@example.com");
  assert.equal(leadPortal(email), "dubizzle");

  const sms = mapBayutStatLead({
    lead_id: "s1",
    source: "bayut",
    detail: { actor_name: "Omar", cell: "+971500000000" },
  }, "sms");
  assert.equal(sms.id, "bayut-sms-s1");
  assert.equal(sms.channel, "sms");
  assert.equal(sms.sender_phone, "+971500000000");

  assert.equal(mapBayutStatLead({ lead_id: "c1", listing_reference: "a7group-1", sms_clicks: 2 }, "sms"), null);

  const call = mapBayutStatLead({
    call_log_id: "44",
    listing_reference: "a7group-1892",
    caller_number: "+971503914447",
    call_status: "missed",
    date: "2026-10-12",
    time: "10:00:00",
  }, "call_logs");
  assert.equal(call.channel, "call");
  assert.equal(call.status, "missed");
  assert.equal(call.id, "bayut-call-44");
  assert.equal(samePortalLead({
    entity_type: "bayut",
    tags: ["bayut"],
    channel: "call",
    created_at: "2026-10-12T06:00:00.000Z",
    sender_phone: "0503914447",
    reference: "a7group-1892",
  }, call), true);
});
