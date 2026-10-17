import assert from "node:assert/strict";
import test from "node:test";
import { nocMoveoutPdf } from "./nocMoveinPdf.js";
import { missingDetails, normalizeForm, writeMoveout } from "./nocMoveout.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("move-out letter uses the same form as move-in with out wording", () => {
  const data = normalizeForm({
    recipient: "Security",
    property: "Villa 12",
    ownerName: "Sara Ali",
    tenantName: "Omar",
    tenantEid: "784-1",
  });
  assert.equal(missingDetails(data), "");
  const text = nocMoveoutPdf(data).toString("latin1");
  assert.match(text, /NOC FOR MOVE OUT/);
  assert.match(text, /move out/);
  assert.match(text, /moving out/);
  assert.doesNotMatch(text, /MOVE IN/);
  assert.doesNotMatch(text, /moving in/);
});

test("saved move-out NOCs stay in their own folder", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nocmo-"));
  try {
    const row = writeMoveout(root, {
      data: {
        recipient: "Security",
        property: "Villa 12",
        ownerName: "Sara",
        tenantName: "Omar",
        tenantEid: "784-1",
      },
    });
    assert.match(row.id, /^nocmo-/);
    assert.ok(fs.existsSync(path.join(root, "data", "noc-moveout", `${row.id}.pdf`)));
    assert.match(fs.readFileSync(row.pdf_path).toString("latin1"), /NOC FOR MOVE OUT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
