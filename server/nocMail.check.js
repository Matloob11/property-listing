import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyNocSignature, findNocSign, issueNocSign, markNocSignViewed, NOC_MAIL_KINDS, whatsappNocForSign } from "./nocMail.js";
import { nocSignExpired, nocSignStatus } from "./nocSignState.js";
import { nocSignPageHtml } from "./signPage.js";
import { writeNoc } from "./noc.js";
import { writeMaint } from "./nocMaint.js";
import { writeMovein } from "./nocMovein.js";
import { writeMoveout } from "./nocMoveout.js";
import { writeTrakheesi } from "./nocTrakheesi.js";

const JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6qytLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKqsrO0tba3uLm6wsPExcbHyMnK20tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCdA//Z";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a7-noc-mail-"));

const writers = {
  noc: () =>
    writeNoc(root, {
      data: { ownerName: "Sara Ali", emiratesId: "784-1234", location: "Dubai", plotNo: "12", purpose: "rental" },
    }),
  "noc-maint": () =>
    writeMaint(root, {
      data: { ownerName: "Sara Ali", recipient: "Maintenance", propertyDetails: "Villa 12", propertyKind: "Villa" },
    }),
  "noc-movein": () =>
    writeMovein(root, {
      data: { ownerName: "Sara Ali", recipient: "Security", property: "Villa 12", tenantName: "Omar", tenantEid: "784-0000" },
    }),
  "noc-moveout": () =>
    writeMoveout(root, {
      data: { ownerName: "Sara Ali", recipient: "Security", property: "Villa 12", tenantName: "Omar", tenantEid: "784-0000" },
    }),
  "noc-trakheesi": () =>
    writeTrakheesi(root, {
      data: { ownerName: "Sara Ali", recipient: "DLD", propertyNo: "12", building: "Tower", purpose: "rental" },
    }),
};

function fail(fn, re) {
  try {
    fn();
    throw new Error("expected throw");
  } catch (error) {
    assert.match(String(error.message), re);
  }
}

for (const [key, write] of Object.entries(writers)) {
  const kind = NOC_MAIL_KINDS[key];
  const row = write();
  assert.equal(nocSignStatus(row.sign), "");
  fail(() => issueNocSign(root, kind, row, { email: "not-an-email" }), /valid email/);

  const queued = { ...row, sign: { email: "owner@example.com", token: "pending-token" } };
  assert.equal(kind.view({ ...row, sign: queued.sign }).signStatus, "");

  const issued = issueNocSign(root, kind, row, { email: "owner@example.com", name: "Sara Ali" });
  assert.equal(issued.saved.sign.email, "owner@example.com");
  assert.equal(kind.view(issued.saved).signStatus, "sent");
  assert.ok(issued.token.length >= 32);
  assert.ok(fs.existsSync(issued.saved.pdf_path));
  assert.ok(fs.readFileSync(issued.saved.pdf_path).subarray(0, 4).toString() === "%PDF");

  const found = findNocSign(root, issued.token);
  assert.equal(found.kind.key, key);
  assert.equal(found.row.id, issued.saved.id);

  const viewed = markNocSignViewed(root, found);
  assert.ok(viewed.sign.viewed_at);

  fail(() => applyNocSignature(root, viewed, { name: "Sa", image: JPEG }), /full name/);
  const signed = applyNocSignature(root, viewed, { name: "Sara Ali", image: JPEG });
  assert.equal(kind.view(signed.row).signStatus, "signed");
  assert.ok(signed.row.data.ownerSign.startsWith("data:image/"));
  assert.ok(signed.sign.signed_at);

  fail(() => issueNocSign(root, kind, signed.row, { email: "other@example.com" }), /already signed/);
  fail(() => applyNocSignature(root, signed, { name: "Sara Ali", image: JPEG }), /already sent back/);
}

{
  const kind = NOC_MAIL_KINDS.noc;
  const row = writeNoc(root, {
    data: { ownerName: "Sara Ali", emiratesId: "784-1234", location: "Dubai", plotNo: "99", purpose: "rental" },
  });
  const bad = whatsappNocForSign(root, kind, row, { phone: "12", name: "Sara Ali", origin: "https://example.com" });
  assert.equal(bad.ok, false);
  const wa = whatsappNocForSign(root, kind, row, { phone: "0501234567", name: "Sara Ali", origin: "https://example.com" });
  assert.equal(wa.ok, true);
  assert.match(wa.waMe, /^https:\/\/wa\.me\/971501234567\?text=/);
  const text = decodeURIComponent(new URL(wa.waMe).searchParams.get("text") || "");
  assert.match(text, /\/noc-sign\/[a-f0-9]+\/pdf/);
  assert.match(text, /Open the PDF and verify it/);
  assert.match(text, /sign and press Send back/);
  assert.equal(kind.view(kind.read(root, wa.item.id)).signStatus, "sent");
  assert.equal(kind.read(root, wa.item.id).sign.phone, "971501234567");
}

const expired = { expires_at: new Date(Date.now() - 1000).toISOString(), signed_at: "" };
assert.equal(nocSignExpired(expired), true);
assert.equal(nocSignExpired({ ...expired, signed_at: new Date().toISOString() }), false);

const html = nocSignPageHtml({ title: "NOC — 12", owner_name: "Sara Ali" }, { name: "Sara Ali", expires_at: new Date().toISOString() }, "abc", "NOC");
assert.match(html, /Send back/);
assert.match(html, /noc-sign\/abc/);

fs.rmSync(root, { recursive: true, force: true });
console.log("noc mail check ok");
