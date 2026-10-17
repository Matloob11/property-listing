import assert from "node:assert/strict";
import test from "node:test";
import { filenameFrom } from "./downloadFile.js";

test("download filename comes from the PDF attachment header", () => {
  assert.equal(filenameFrom('attachment; filename="NOC-Marina.pdf"', "noc.pdf"), "NOC-Marina.pdf");
  assert.equal(filenameFrom("attachment; filename*=UTF-8''Owner%20Sign.pdf", "noc.pdf"), "Owner Sign.pdf");
  assert.equal(filenameFrom("", "noc.pdf"), "noc.pdf");
});
