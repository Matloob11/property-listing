import assert from "node:assert/strict";
import test from "node:test";
import {
  PF_LEAD_ORIGIN,
  PF_LEAD_SOURCE,
  PF_LEAD_UF,
  buildLeadFields,
  leadTitle,
  phoneDigits,
  pushOneLead,
  pushPfLeadsToBitrix,
  sourceIdForChannel,
} from "./bitrixLeadSync.js";

const sample = {
  id: "pf-1001",
  channel: "whatsapp",
  sender_name: "Ahmed Khan",
  sender_phone: "+971501234567",
  sender_email: "ahmed@example.com",
  reference: "A7-1803",
  agent_name: "Sara",
  created_at: "2026-09-25T10:00:00.000Z",
};

test("maps PF channels to the existing Bitrix Property Finder sources", () => {
  assert.equal(sourceIdForChannel("whatsapp"), PF_LEAD_SOURCE.whatsapp);
  assert.equal(sourceIdForChannel("email"), PF_LEAD_SOURCE.email);
  assert.equal(sourceIdForChannel("call"), PF_LEAD_SOURCE.call);
  assert.equal(phoneDigits("+971 50 123 4567"), "971501234567");
  assert.match(leadTitle(sample), /Property Finder WhatsApp/);
  assert.match(leadTitle(sample), /A7-1803/);
});

test("buildLeadFields stamps portal id, origin, and PF source", () => {
  const fields = buildLeadFields(sample);
  assert.equal(fields.SOURCE_ID, PF_LEAD_SOURCE.whatsapp);
  assert.equal(fields.ORIGINATOR_ID, PF_LEAD_ORIGIN);
  assert.equal(fields.ORIGIN_ID, "pf-1001");
  assert.equal(fields[PF_LEAD_UF.portalId], "pf-1001");
  assert.equal(fields[PF_LEAD_UF.reference], "A7-1803");
  assert.equal(fields.OPENED, "Y");
  assert.equal(fields.PHONE[0].VALUE, "+971501234567");
  assert.equal(fields.EMAIL[0].VALUE, "ahmed@example.com");
});

test("pushOneLead adds a new CRM lead when none exists", async () => {
  const calls = [];
  const bx = async (_user, method, params) => {
    calls.push({ method, params });
    if (method === "crm.lead.list") return { ok: true, result: [] };
    if (method === "crm.lead.add") return { ok: true, result: 88001 };
    return { ok: false, error: `unexpected ${method}` };
  };
  const out = await pushOneLead(sample, { bx, sleep: async () => {} });
  assert.equal(out.ok, true);
  assert.equal(out.action, "add");
  assert.equal(out.id, "88001");
  assert.equal(calls.at(-1).method, "crm.lead.add");
  assert.equal(calls.at(-1).params.params.REGISTER_SONET_EVENT, "N");
  assert.equal(calls.at(-1).params.fields[PF_LEAD_UF.portalId], "pf-1001");
});

test("pushOneLead updates an existing phone+ref match instead of adding a duplicate", async () => {
  const calls = [];
  const bx = async (_user, method, params) => {
    calls.push({ method, params });
    if (method === "crm.lead.list") {
      if (params.filter[PF_LEAD_UF.portalId] || params.filter.ORIGINATOR_ID) return { ok: true, result: [] };
      return {
        ok: true,
        result: [{ ID: "77001", TITLE: "Property Finder WhatsApp — Ahmed — A7-1803", SOURCE_ID: PF_LEAD_SOURCE.whatsapp }],
      };
    }
    if (method === "crm.lead.update") return { ok: true, result: true };
    return { ok: false, error: `unexpected ${method}` };
  };
  const out = await pushOneLead(sample, { bx, sleep: async () => {} });
  assert.equal(out.ok, true);
  assert.equal(out.action, "update");
  assert.equal(out.id, "77001");
  assert.equal(calls.some((call) => call.method === "crm.lead.add"), false);
  const update = calls.find((call) => call.method === "crm.lead.update");
  assert.equal(update.params.fields[PF_LEAD_UF.portalId], "pf-1001");
});

test("pushOneLead skips CRM writes when bitrix_id is already stored", async () => {
  const calls = [];
  const bx = async (_user, method) => {
    calls.push(method);
    return { ok: false, error: "should not call" };
  };
  const out = await pushOneLead({ ...sample, bitrix_id: "66001" }, { bx, sleep: async () => {} });
  assert.deepEqual(out, { ok: true, action: "linked", id: "66001" });
  assert.deepEqual(calls, []);
});

test("desk → CRM lead push is off by default so leads stay in Property Listing New", async () => {
  const prevPush = process.env.BITRIX_LEAD_PUSH;
  const prevHook = process.env.BITRIX_WEBHOOK;
  process.env.BITRIX_WEBHOOK = "https://example.test/rest/1/token/";
  delete process.env.BITRIX_LEAD_PUSH;
  try {
    const db = {
      allLeads: async () => [{ ...sample, bitrix_id: "" }],
      upsertLeads: async () => {},
    };
    const summary = await pushPfLeadsToBitrix(db, {
      bx: async () => {
        throw new Error("CRM must not be called");
      },
      sleep: async () => {},
    });
    assert.equal(summary.skipped, true);
    assert.equal(summary.reason, "push_disabled");
    assert.equal(summary.pushed, 0);
  } finally {
    if (prevPush == null) delete process.env.BITRIX_LEAD_PUSH;
    else process.env.BITRIX_LEAD_PUSH = prevPush;
    if (prevHook == null) delete process.env.BITRIX_WEBHOOK;
    else process.env.BITRIX_WEBHOOK = prevHook;
  }
});

test("pushPfLeadsToBitrix writes bitrix_id back onto pending desk leads", async () => {
  const prevPush = process.env.BITRIX_LEAD_PUSH;
  process.env.BITRIX_WEBHOOK = process.env.BITRIX_WEBHOOK || "https://example.test/rest/1/token/";
  process.env.BITRIX_LEAD_PUSH = "1";
  try {
    const stored = [];
    const db = {
      allLeads: async () => [{ ...sample, bitrix_id: "" }, { id: "done", bitrix_id: "1" }],
      upsertLeads: async (rows) => {
        stored.push(...rows);
      },
    };
    const bx = async (_user, method) => {
      if (method === "crm.lead.list") return { ok: true, result: [] };
      if (method === "crm.lead.add") return { ok: true, result: 99001 };
      return { ok: false, error: method };
    };
    const summary = await pushPfLeadsToBitrix(db, { bx, sleep: async () => {}, limit: 10 });
    assert.equal(summary.added, 1);
    assert.equal(summary.pushed, 1);
    assert.equal(stored[0].bitrix_id, "99001");
  } finally {
    if (prevPush == null) delete process.env.BITRIX_LEAD_PUSH;
    else process.env.BITRIX_LEAD_PUSH = prevPush;
  }
});
