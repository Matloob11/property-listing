import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addScopeOption,
  DEFAULT_SCOPE_OPTIONS,
  listMaints,
  mergeScopeOptions,
  readScopeOptions,
  writeMaint,
} from "./nocMaint.js";

test("default scope options stay first and duplicates are ignored", () => {
  const items = mergeScopeOptions(["pest control", "Gate motor repair", "Deep cleaning"]);
  assert.deepEqual(items.slice(0, DEFAULT_SCOPE_OPTIONS.length), DEFAULT_SCOPE_OPTIONS);
  assert.ok(items.includes("Gate motor repair"));
  assert.equal(items.filter((item) => item.toLowerCase() === "pest control").length, 1);
  assert.ok(items.includes("Kitchen sink and drainage cleaning"));
});

test("saved scope options persist and do not break the saved NOC list", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nocm-scope-"));
  try {
    const first = addScopeOption(root, " AC Service ");
    assert.equal(first.ok, true);
    assert.ok(first.items.includes("AC Service"));
    const again = addScopeOption(root, "ac service");
    assert.equal(again.existed, true);
    const empty = addScopeOption(root, "   ");
    assert.equal(empty.ok, false);
    assert.deepEqual(readScopeOptions(root), first.items);

    writeMaint(root, {
      id: "nocm-1-test",
      data: {
        recipient: "Building Management",
        ownerName: "Sara",
        propertyDetails: "101",
        companyName: "Fix Co",
        scopeText: "Pest control",
      },
    });
    assert.equal(listMaints(root).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
