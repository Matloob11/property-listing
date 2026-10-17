import test from "node:test";
import assert from "node:assert/strict";
import { formatVoucherNo, normalizeForm } from "./bookingFormModel.js";
import { bookingFormPdf } from "./bookingFormPdf.js";

test("receipt numbers print as 0001", () => {
  assert.equal(formatVoucherNo("1"), "0001");
  assert.equal(formatVoucherNo("12"), "0012");
  assert.equal(formatVoucherNo("0007"), "0007");
  assert.equal(normalizeForm({ voucherNo: "1", office: "a7", stamp: "a7" }).voucherNo, "0001");
});

test("saved receipt keeps the number box and the two signature sides", () => {
  const pdf = bookingFormPdf({
    office: "a7",
    stamp: "a7",
    company: "A7 GROUP REAL ESTATE LLC",
    voucherNo: "1",
    date: "15-Oct-26",
    accountName: "Sample Account",
    amount: "1000",
    through: "Cash",
    signatory: "HINA SULTAN",
  }).toString("latin1");
  assert.match(pdf, /No\. : 0001/);
  assert.match(pdf, /56\.00 \d+\.\d+ 92\.00 16 re S/);
  const auth = pdf.indexOf("(Authorised Signatory) Tj");
  const payer = pdf.indexOf("(Payer signature) Tj");
  assert.ok(auth > 0 && payer > auth);
  assert.match(pdf.slice(auth - 40, auth), /1 0 0 1 56\.00 184\.00 Tm/);
  assert.match(pdf.slice(payer - 40, payer), /1 0 0 1 360\.00 168\.00 Tm/);
  assert.match(pdf, /0\.80 w 56\.00 128\.00 m 216\.00 128\.00 l S/);
  assert.match(pdf, /ImStamp Do/);
});
