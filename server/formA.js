import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { formAPdf } from "./formAPdf.js";
import { normalizeForm, ownerDisplayName, pdfFilename } from "./formAModel.js";

export {
  FORM_A_ELECTRONIC_AR,
  FORM_A_ELECTRONIC_EN,
  FORM_A_KEYS,
  FORM_A_TERMS_AR,
  FORM_A_TERMS_EN,
  PROPERTY_TYPES,
  USAGE_TYPES,
  IDENTITY_VERIFICATION_TYPES,
  VERIFICATION_TYPES,
  addMonthsFormA,
  certificateYears,
  emptyFormA,
  formFromListing,
  formatFormADate,
  isoFormADate,
  missingDetails,
  moneyAed,
  normalizeForm,
  ownerDisplayName,
  pdfFilename,
  stepMissing,
  todayFormADate,
  yesNo,
} from "./formAModel.js";

export function newId() {
  return `forma-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function formADir(root) {
  const dir = path.join(root, "data", "form-a");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonPath(root, id) {
  return path.join(formADir(root), `${id}.json`);
}

function pdfPath(root, id) {
  return path.join(formADir(root), `${id}.pdf`);
}

export function normalizeRow(input) {
  const data = normalizeForm(input.data || input);
  return {
    id: String(input.id || newId()),
    title: String(input.title || `Form A — ${(ownerDisplayName(data) || data.certificateNumber || data.listingRef || "Marketing contract").trim()}`),
    listing_id: String(input.listing_id || data.listingId || ""),
    owner_name: String(input.owner_name || ownerDisplayName(data) || ""),
    pdf_name: String(input.pdf_name || pdfFilename(data)),
    pdf_path: String(input.pdf_path || ""),
    created_by: String(input.created_by || ""),
    created_at: Number(input.created_at || Math.floor(Date.now() / 1000)),
    updated_at: Number(input.updated_at || Math.floor(Date.now() / 1000)),
    data,
  };
}

export function writeFormA(root, row) {
  const stored = normalizeRow(row);
  stored.pdf_path = pdfPath(root, stored.id);
  fs.writeFileSync(jsonPath(root, stored.id), JSON.stringify(stored, null, 2));
  fs.writeFileSync(stored.pdf_path, formAPdf(stored.data));
  return stored;
}

export function readFormA(root, id) {
  const file = jsonPath(root, String(id || ""));
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeRow(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function listFormA(root) {
  const dir = formADir(root);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readFormA(root, name.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function removeFormA(root, id) {
  const row = readFormA(root, id);
  if (!row) return 0;
  for (const file of [jsonPath(root, id), pdfPath(root, id)]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* keep going */
    }
  }
  return 1;
}

export function readFileSafe(file) {
  try {
    return file && fs.existsSync(file) ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

export function rowView(row) {
  return {
    id: row.id,
    title: row.title,
    ownerName: row.owner_name,
    listingId: row.listing_id,
    listingRef: row.data?.listingRef || "",
    pdfName: row.pdf_name,
    download: `/api/form-a/download?id=${encodeURIComponent(row.id)}`,
    preview: `/api/form-a/download?id=${encodeURIComponent(row.id)}&inline=1`,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submitted: String(row.data?.acceptedTerms || "") === "1",
    data: row.data,
  };
}
