// One-off migration: imports the Bitrix /tenancy/ tracker rows (contracts.json) and their
// PDF files into this app's tenancy board. Usage (on the server, from the app root):
//   node server/scripts/importTenancy.js <contracts.json> <files.tsv> <files-dir>
// files.tsv: "<fileId>\t<subdir>\t<filename>" per line; files-dir holds upload/<subdir>/<filename>.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../loadEnv.js";
import { openDb } from "../db.js";
import { normalizeStage, tenancyDir } from "../tenancy.js";

loadEnv();
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [, , jsonPath, tsvPath, filesDir] = process.argv;
if (!jsonPath || !tsvPath || !filesDir) {
  console.error("usage: importTenancy.js <contracts.json> <files.tsv> <files-dir>");
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const files = new Map(
  fs
    .readFileSync(tsvPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id, subdir, name] = line.split("\t");
      return [String(id), path.join(filesDir, "upload", subdir, name)];
    })
);

const db = await openDb();
const dir = tenancyDir(root);
let created = 0;
let skipped = 0;
for (const row of rows) {
  const id = String(row.id || "");
  if (!id) continue;
  if (await db.tenancy(id)) {
    skipped += 1;
    continue;
  }
  let pdfPath = "";
  let signedPath = "";
  const pdfSrc = files.get(String(row.pdfFileId || ""));
  if (pdfSrc && fs.existsSync(pdfSrc)) {
    pdfPath = path.join(dir, `${id}.pdf`);
    fs.copyFileSync(pdfSrc, pdfPath);
  }
  const signedSrc = files.get(String(row.signedFileId || ""));
  if (signedSrc && fs.existsSync(signedSrc)) {
    const ext = String(row.signedFileName || "signed.pdf").toLowerCase().split(".").pop();
    signedPath = path.join(dir, `${id}-signed.${["pdf", "jpg", "jpeg", "png"].includes(ext) ? ext : "pdf"}`);
    fs.copyFileSync(signedSrc, signedPath);
  }
  await db.addTenancy({
    id,
    title: row.title || "Tenancy contract",
    stage: normalizeStage(row.stage),
    template: row.template || "ejari",
    send_to: row.sendTo || "",
    owner_name: row.ownerName || "",
    tenant_name: row.tenantName || "",
    owner_email: row.ownerEmail || "",
    tenant_email: row.tenantEmail || "",
    owner_phone: row.ownerPhone || "",
    tenant_phone: row.tenantPhone || "",
    pdf_name: row.pdfName || "",
    pdf_path: pdfPath,
    signed_name: row.signedFileName || "",
    signed_path: signedPath,
    created_by: "Imported from Bitrix Sign",
    created_at: Number(row.createdAt || Math.floor(Date.now() / 1000)),
    updated_at: Number(row.createdAt || Math.floor(Date.now() / 1000)),
    data: {},
    history: [
      {
        at: new Date().toISOString(),
        by: "Migration",
        event: "imported",
        detail: `From Bitrix tenancy tool (document #${row.documentId || 0}, stage ${row.stage || "draft"})`,
      },
    ],
  });
  created += 1;
}
console.log(JSON.stringify({ created, skipped, total: rows.length }));
process.exit(0);
