import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listBookingForms, setBookingRefund, writeBookingForm } from "./bookingForm.js";

test("refund moves a booking onto the refund list without deleting it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bkf-"));
  try {
    const saved = writeBookingForm(root, {
      data: { office: "a7", stamp: "a7", accountName: "Sample", amount: "1000", through: "Cash", voucherNo: "1" },
    });
    const moved = setBookingRefund(root, saved.id, true);
    assert.equal(moved.refunded, true);
    assert.ok(moved.refunded_at > 0);
    const listed = listBookingForms(root);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].refunded, true);
    const kept = writeBookingForm(root, { ...listed[0], refunded: listed[0].refunded, refunded_at: listed[0].refunded_at });
    assert.equal(kept.refunded, true);
    const back = setBookingRefund(root, saved.id, false);
    assert.equal(back.refunded, false);
    assert.equal(back.refunded_at, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
