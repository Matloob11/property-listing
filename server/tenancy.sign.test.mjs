import assert from "node:assert/strict";
import test from "node:test";
import { tenancySignDoneHtml, tenancySignPageHtml } from "./signPage.js";
import { tenancyPdf } from "./tenancyPdf.js";
import {
  canInviteTenancyParty,
  emailBody,
  firstTenancyEmailParty,
  issueTenancySignTokens,
  nextUnsignedTenancyParty,
  prepareTenancyInvite,
  rowView,
  signedTenancyPdf,
  tenancyStageFromSigners,
} from "./tenancy.js";

function row(extra = {}) {
  return {
    id: "tc-1",
    title: "Tenancy Contract — 101",
    tenant_name: "Sara Ali",
    tenant_email: "sara@example.com",
    tenant_phone: "0501111111",
    owner_name: "Omar Khan",
    owner_email: "omar@example.com",
    owner_phone: "0502222222",
    pdf_path: "",
    pdf_name: "tenancy-contract.pdf",
    data: { signers: [] },
    ...extra,
  };
}

test("first email party is tenant when both emails exist", () => {
  assert.equal(firstTenancyEmailParty(row()), "tenant");
  assert.equal(firstTenancyEmailParty(row({ tenant_email: "" })), "owner");
});

test("one person signing never reaches signed until tenant and owner both sign", () => {
  const tenantOnly = issueTenancySignTokens(row({ owner_email: "", owner_name: "" }), "tenant").map((item) =>
    item.role === "tenant" ? { ...item, signed_at: "2026-09-26T06:00:00.000Z" } : item
  );
  assert.equal(tenancyStageFromSigners(tenantOnly), "partial");

  const ownerOnly = issueTenancySignTokens(row({ tenant_email: "" }), "owner").map((item) =>
    item.role === "owner" ? { ...item, signed_at: "2026-09-26T06:00:00.000Z" } : item
  );
  assert.equal(tenancyStageFromSigners(ownerOnly), "partial");

  const both = [
    { role: "tenant", signed_at: "2026-09-26T06:00:00.000Z" },
    { role: "owner", signed_at: "2026-09-26T07:00:00.000Z" },
  ];
  assert.equal(tenancyStageFromSigners(both), "signed");
});

test("stage stays sent until first sign, then partial, then signed", () => {
  const sent = issueTenancySignTokens(row(), "tenant");
  assert.equal(tenancyStageFromSigners(sent), "sent");
  assert.equal(sent.find((item) => item.role === "owner").token, "");
  assert.ok(sent.find((item) => item.role === "tenant").token);

  const partial = sent.map((item) =>
    item.role === "tenant" ? { ...item, signed_at: "2026-09-25T06:00:00.000Z" } : item
  );
  assert.equal(tenancyStageFromSigners(partial), "partial");
  assert.equal(nextUnsignedTenancyParty(partial).role, "owner");

  const signed = partial.map((item) =>
    item.role === "owner" ? { ...item, signed_at: "2026-09-25T07:00:00.000Z" } : item
  );
  assert.equal(tenancyStageFromSigners(signed), "signed");
});

test("second party cannot be invited until the first person signs", () => {
  const sent = issueTenancySignTokens(row(), "tenant");
  const blocked = canInviteTenancyParty(sent, "owner");
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /tenant signs/i);

  const after = sent.map((item) =>
    item.role === "tenant" ? { ...item, signed_at: "2026-09-25T06:00:00.000Z" } : item
  );
  assert.equal(canInviteTenancyParty(after, "owner").ok, true);
});

test("second-person email mentions the first signature", () => {
  const text = emailBody("Omar", "owner", "Unit 101", "https://example.com/tc-sign/abc", {
    alreadySignedBy: "tenant",
  });
  assert.match(text, /tenant has already signed/i);
  assert.match(text, /check their signature/i);
  assert.match(text, /https:\/\/example.com\/tc-sign\/abc/);
  assert.match(text, /draw your signature/i);
});

test("email sign page shows both contract pages and a sign pad, with no Open", () => {
  const html = tenancySignPageHtml(
    {
      title: "Tenancy Contract — 101",
      tenant_name: "Sara Ali",
      owner_name: "Omar Khan",
      data: {
        signers: [
          { role: "tenant", name: "Sara Ali", signed_at: "2026-09-25T06:00:00.000Z" },
          { role: "owner", name: "Omar Khan" },
        ],
      },
    },
    { name: "Omar Khan", role: "owner", expires_at: "2026-10-25T00:00:00.000Z" },
    "abc123token",
    [["Property", "101"]]
  );
  assert.match(html, /Page 1 of 2/);
  assert.match(html, /Page 2 of 2/);
  assert.match(html, /\/tc-sign\/abc123token\/blank\/1/);
  assert.match(html, /\/tc-sign\/abc123token\/blank\/2/);
  assert.match(html, /id="pad"/);
  assert.match(html, /Send back/);
  assert.match(html, /already signed/);
  assert.doesNotMatch(html, /<object/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /Open /);
  assert.doesNotMatch(html, /Download/);
  assert.doesNotMatch(html, /target="_blank"/);

  const done = tenancySignDoneHtml(
    { title: "Tenancy Contract — 101", data: { signers: [] } },
    { name: "Omar Khan", signed_name: "Omar Khan", signed_at: "2026-09-25T07:00:00.000Z" },
    "abc123token",
    true
  );
  assert.match(done, /Page 1 of 2/);
  assert.match(done, /Page 2 of 2/);
  assert.doesNotMatch(done, /<object/);
});

test("contract PDF prints the typed owner, not a stale row owner", () => {
  const pdf = signedTenancyPdf({
    owner_name: "Stale Owner",
    tenant_name: "Stale Tenant",
    data: {
      landlordName: "Typed Owner",
      tenantName: "Typed Tenant",
      dateFrom: "2026-09-25",
      dateTo: "2027-09-24",
      annualRent: "10000",
    },
  });
  const text = pdf.toString("latin1");
  assert.match(text, /Typed Owner/);
  assert.match(text, /Typed Tenant/);
  assert.equal(text.includes("Stale Owner"), false);
  assert.equal(text.includes("Stale Tenant"), false);
});

test("tenancy pdf still builds after layout extract", () => {
  const pdf = tenancyPdf({
    tenantName: "Sara Ali",
    landlordName: "Omar Khan",
    dateFrom: "2026-06-01",
    dateTo: "2027-05-31",
    annualRent: "555555",
  });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("prepareTenancyInvite blocks the second email until the first sign", () => {
  const sent = issueTenancySignTokens(row(), "tenant");
  const current = { ...row(), data: { signers: sent } };
  const blocked = prepareTenancyInvite(current, "owner", "https://listings.example");
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /automatically/i);
});

test("board view keeps a one-signer contract in partially signed", () => {
  const current = {
    ...row(),
    stage: "signed",
    data: {
      signers: [
        { role: "tenant", signed_at: "2026-09-26T06:00:00.000Z", signature: "data:image/jpeg;base64,abc" },
      ],
    },
  };
  assert.equal(rowView(current).stage, "partial");
  current.data.signers.push({ role: "owner", signed_at: "2026-09-26T07:00:00.000Z" });
  assert.equal(rowView(current).stage, "signed");
});

test("preview view includes signatures only when asked", () => {
  const current = {
    ...row(),
    stage: "signed",
    data: {
      signers: [
        { role: "tenant", signed_at: "2026-09-25T06:00:00.000Z", signature: "data:image/jpeg;base64,abc" },
      ],
    },
  };
  assert.equal(rowView(current).signers[0].signature, undefined);
  assert.equal(rowView(current, { includeSignatures: true }).signers[0].signature, "data:image/jpeg;base64,abc");
});
