import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { nocMoveoutPdf } from "./nocMoveinPdf.js";
import { withOwnerSign } from "./nocSign.js";
import { normalizeNocSign, nocSignView } from "./nocSignState.js";

export const FORM_KEYS = ["listingId", "listingRef", "recipient", "property", "ownerName", "tenantName", "tenantEid"];

export function normalizeForm(input) {
  const data = {};
  for (const key of FORM_KEYS) data[key] = String(input?.[key] ?? "").trim();
  return withOwnerSign(data, input);
}

export function missingDetails(data) {
  if (!data.recipient) return "Add who the letter is to.";
  if (!data.property) return "Add the property.";
  if (!data.ownerName) return "Add the owner name.";
  if (!data.tenantName) return "Add the tenant name.";
  if (!data.tenantEid) return "Add the tenant Emirates ID.";
  return "";
}

export function formFromListing(listing) {
  if (!listing) return {};
  const property = [
    listing.building || listing.project_name || listing.bayut_building,
    listing.unit_no || listing.reference,
    listing.community || listing.sub_community || listing.bayut_community,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return normalizeForm({
    listingId: listing.id || "",
    listingRef: listing.reference || "",
    ownerName: listing.landlord_name || "",
    tenantName: listing.tenant_name || "",
    property,
  });
}

export function pdfFilename(data) {
  const bits = ["NOC-Move-Out"];
  for (const key of ["property", "ownerName", "listingRef"]) {
    const part = String(data[key] || "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

export function newId() {
  return `nocmo-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function moveoutDir(root) {
  const dir = path.join(root, "data", "noc-moveout");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonPath(root, id) {
  return path.join(moveoutDir(root), `${id}.json`);
}

function pdfPath(root, id) {
  return path.join(moveoutDir(root), `${id}.pdf`);
}

export function normalizeRow(input) {
  const data = normalizeForm(input.data || input);
  return {
    id: String(input.id || newId()),
    title: String(input.title || `NOC For Move Out — ${(data.property || data.ownerName || "Property").trim()}`),
    listing_id: String(input.listing_id || data.listingId || ""),
    owner_name: String(input.owner_name || data.ownerName || ""),
    pdf_name: String(input.pdf_name || pdfFilename(data)),
    pdf_path: String(input.pdf_path || ""),
    created_by: String(input.created_by || ""),
    created_at: Number(input.created_at || Math.floor(Date.now() / 1000)),
    updated_at: Number(input.updated_at || Math.floor(Date.now() / 1000)),
    sign: normalizeNocSign(input),
    data,
  };
}

export function writeMoveout(root, row) {
  const stored = normalizeRow(row);
  stored.pdf_path = pdfPath(root, stored.id);
  fs.writeFileSync(jsonPath(root, stored.id), JSON.stringify(stored, null, 2));
  fs.writeFileSync(stored.pdf_path, nocMoveoutPdf(stored.data));
  return stored;
}

export function readMoveout(root, id) {
  const file = jsonPath(root, String(id || ""));
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeRow(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function listMoveouts(root) {
  const dir = moveoutDir(root);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name.startsWith("nocmo-"))
    .map((name) => readMoveout(root, name.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function removeMoveout(root, id) {
  const row = readMoveout(root, id);
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
    download: `/api/noc-moveout/download?id=${encodeURIComponent(row.id)}`,
    preview: `/api/noc-moveout/download?id=${encodeURIComponent(row.id)}&inline=1`,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...nocSignView(row.sign),
    data: row.data,
  };
}
