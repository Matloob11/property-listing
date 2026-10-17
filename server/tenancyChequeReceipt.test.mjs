import assert from "node:assert/strict";
import test from "node:test";
import { buildMailData } from "./smtp.js";
import { chequeVerifyPageHtml } from "./signPage.js";
import {
  chequeReceiptExpired,
  chequeReceiptSubject,
  decodeChequeImage,
  decodeChequeProof,
  findChequeReceipt,
  listChequeReceipts,
  ownerVerifyEmail,
  ownerVerifySubject,
  pickChequeRow,
  preserveTenancyChequeReceipts,
  tenantAckEmail,
  tenantAckSubject,
} from "./tenancyChequeReceipt.js";

test("owner verify email has the link and never names the tenant", () => {
  const body = ownerVerifyEmail({
    ownerName: "Omar",
    property: "Shop 22 · Marina",
    particular: "1st rental cheque",
    amount: "AED 10,000/-",
    date: "25/09/2026",
    verifyUrl: "https://listings.example/tc-cheque/abc123",
  });
  assert.match(body, /Hello Omar/);
  assert.match(body, /1st rental cheque/);
  assert.match(body, /https:\/\/listings\.example\/tc-cheque\/abc123/);
  assert.match(body, /The tenant is not copied/);
  assert.doesNotMatch(body, /tenant@|050|Sara/i);
  assert.equal(ownerVerifySubject("Shop 22 · Marina"), "Please confirm you received the cheque — Shop 22 · Marina");
});

test("tenant acknowledgment is from A7 and does not expose owner contacts", () => {
  const body = tenantAckEmail({
    tenantName: "Sara Ali",
    property: "Shop 22 · Marina",
    particular: "1st rental cheque",
    amount: "AED 10,000/-",
    date: "25/09/2026",
    note: "I confirm I received this cheque.",
  });
  assert.match(body, /Hello Sara Ali/);
  assert.match(body, /owner has verified/);
  assert.match(body, /I confirm I received this cheque/);
  assert.doesNotMatch(body, /owner@|050|landlordEmail|tc-cheque/i);
  assert.equal(tenantAckSubject("Shop 22 · Marina"), "Owner confirmed cheque received — Shop 22 · Marina");
  assert.equal(chequeReceiptSubject("Shop 22 · Marina"), "Cheque received — Shop 22 · Marina");
});

test("owner verify page requires a note and a drawn signature and hides tenant contacts", () => {
  const html = chequeVerifyPageHtml(
    {
      owner_name: "Omar",
      tenant_name: "Sara Ali",
      tenant_email: "tenant@example.com",
      tenant_phone: "0501234567",
      data: { propertyNo: "Shop 22", building: "Marina", tenantEmail: "tenant@example.com" },
    },
    { particular: "1st rental cheque", amount: "AED 10,000/-", date: "25/09/2026", expires_at: "2026-10-26T00:00:00.000Z" },
    "abc123"
  );
  assert.match(html, /id="note"/);
  assert.match(html, /id="pad"/);
  assert.match(html, /Send back/);
  assert.match(html, /Please write that you received this cheque/);
  assert.match(html, /Please draw your signature/);
  assert.match(html, /\/tc-cheque\/abc123/);
  assert.doesNotMatch(html, /tenant@example.com|0501234567|Sara Ali/);
});

test("picked cheque comes from the generated schedule", () => {
  const row = pickChequeRow(
    {
      annualRent: "40000",
      paymentMode: "04 cheques",
      dateFrom: "2026-09-25",
      landlordName: "Omar",
    },
    1
  );
  assert.equal(row.particular, "Rental cheque 2");
  assert.equal(row.date, "25/12/2026");
});

test("saved cheque receipts stay when the form is prepared again", () => {
  const existing = { data: { chequeReceipts: [{ id: "cr-1", to: "a@b.com", particular: "1st rental cheque" }] } };
  const next = preserveTenancyChequeReceipts(existing, { tenantName: "Sara" });
  assert.equal(next.chequeReceipts[0].id, "cr-1");
  assert.equal(listChequeReceipts(existing)[0].tenantEmail, "a@b.com");
  assert.equal(listChequeReceipts(existing)[0].status, "sent");
});

test("pending receipts keep a token for lookup and public list hides it", () => {
  const rows = [
    {
      data: {
        chequeReceipts: [
          { id: "cr-2", token: "secret-token", status: "pending", ownerEmail: "owner@example.com", tenantEmail: "tenant@example.com" },
        ],
      },
    },
  ];
  const found = findChequeReceipt(rows, "secret-token");
  assert.equal(found.receipt.id, "cr-2");
  const listed = listChequeReceipts(rows[0]);
  assert.equal(listed[0].status, "pending");
  assert.equal(listed[0].token, undefined);
  assert.equal(listed[0].signature, undefined);
  assert.equal(chequeReceiptExpired({ expires_at: "2000-01-01T00:00:00.000Z" }), true);
  assert.equal(chequeReceiptExpired({ verifiedAt: "2026-09-26T00:00:00.000Z", expires_at: "2000-01-01T00:00:00.000Z" }), false);
});

test("mail builder attaches the received crop without putting the owner on the email", () => {
  const data = buildMailData({
    recipient: "tenant@example.com",
    subject: "Owner confirmed cheque received",
    body: "The owner has verified that they received the cheque.",
    fromName: "A7 Group Real Estate",
    fromEmail: "desk@example.com",
    attachments: [{ name: "cheque-received.jpg", mime: "image/jpeg", buffer: Buffer.from("jpeg") }],
  });
  assert.match(data, /From: A7 Group Real Estate <desk@example.com>/);
  assert.match(data, /filename="cheque-received.jpg"/);
  assert.doesNotMatch(data, /owner@/);
});

test("cheque photo must be a real image payload", () => {
  assert.equal(decodeChequeImage("hello"), null);
  const ok = decodeChequeImage(`data:image/jpeg;base64,${Buffer.from("jpeg-bytes").toString("base64")}`);
  assert.equal(ok.mime, "image/jpeg");
  assert.equal(ok.ext, "jpg");
});

test("cheque proof also accepts a PDF", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
  const ok = decodeChequeProof(`data:application/pdf;base64,${pdf.toString("base64")}`);
  assert.equal(ok.mime, "application/pdf");
  assert.equal(ok.ext, "pdf");
  assert.equal(decodeChequeImage(`data:application/pdf;base64,${pdf.toString("base64")}`), null);
});

test("owner verify page shows a PDF link when the cheque is a PDF", () => {
  const html = chequeVerifyPageHtml(
    { owner_name: "Omar", data: { propertyNo: "Shop 22" } },
    { particular: "1st rental cheque", proofMime: "application/pdf", expires_at: "2026-10-26T00:00:00.000Z" },
    "abc123"
  );
  assert.match(html, /Open the cheque PDF/);
  assert.match(html, /iframe class="proof-pdf"/);
  assert.doesNotMatch(html, /Received part of the cheque/);
});
