import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { formIPdf } from "./formIPdf.js";

export const FORM_KEYS = [
  "listingId",
  "listingRef",
  "date",
  "aEstablishment",
  "aAddress",
  "aPhone",
  "aFax",
  "aOrn",
  "aDedLic",
  "aBrokerName",
  "aBrn",
  "aDateIssued",
  "aMobile",
  "aEmail",
  "aFormAStr",
  "bEstablishment",
  "bAddress",
  "bPhone",
  "bFax",
  "bOrn",
  "bDedLic",
  "bBrokerName",
  "bBrn",
  "bDateIssued",
  "bMobile",
  "bEmail",
  "bFormBStr",
  "projectName",
  "propertyType",
  "masterDeveloper",
  "propertyDetails",
  "tenanted",
  "sellerCommission",
  "buyerCommission",
  "buyerName",
  "buyerContact",
  "transferFeeSeller",
  "transferFeeBuyer",
  "buyerBudget",
  "listedPrice",
  "agentASign",
  "agentBSign",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatFormIDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = /^(\d{1,2})[\/\-\s]+(\d{1,2})[\/\-\s]+(\d{4})$/.exec(raw);
  if (dmy) return `${pad2(dmy[1])}/${pad2(dmy[2])}/${dmy[3]}`;
  return raw;
}

export function todayFormIDate() {
  const now = new Date();
  return `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
}

export function normalizeForm(input) {
  const data = {};
  for (const key of FORM_KEYS) data[key] = String(input?.[key] ?? "").trim();
  data.date = formatFormIDate(data.date) || todayFormIDate();
  return data;
}

export function missingDetails(data) {
  if (!data.date) return "Add the agreement date.";
  if (!data.aEstablishment && !data.bEstablishment) return "Add the seller or buyer establishment name.";
  if (!data.projectName && !data.propertyDetails) return "Add the project name or property details.";
  return "";
}

export function formFromListing(listing) {
  if (!listing) return {};
  const details = [
    listing.unit_no,
    listing.building || listing.project_name || listing.bayut_building,
    listing.community || listing.sub_community || listing.bayut_community,
    listing.city || "Dubai",
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  const price = listing.price_aed || listing.sale_price || listing.price_yearly || "";
  return normalizeForm({
    listingId: listing.id || "",
    listingRef: listing.reference || "",
    date: todayFormIDate(),
    aBrokerName: listing.listing_agent || "",
    projectName: listing.project_name || listing.building || listing.bayut_building || "",
    propertyType: listing.type || "",
    masterDeveloper: listing.developer || "",
    propertyDetails: details,
    listedPrice: price ? String(price) : "",
  });
}

export function pdfFilename(data) {
  const bits = ["Form-I"];
  for (const key of ["projectName", "bBrokerName", "aBrokerName", "listingRef"]) {
    const part = String(data[key] || "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

export function newId() {
  return `formi-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function formIDir(root) {
  const dir = path.join(root, "data", "form-i");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonPath(root, id) {
  return path.join(formIDir(root), `${id}.json`);
}

function pdfPath(root, id) {
  return path.join(formIDir(root), `${id}.pdf`);
}

export function normalizeRow(input) {
  const data = normalizeForm(input.data || input);
  return {
    id: String(input.id || newId()),
    title: String(input.title || `Form I — ${(data.projectName || data.bEstablishment || data.aEstablishment || "Agreement").trim()}`),
    listing_id: String(input.listing_id || data.listingId || ""),
    owner_name: String(input.owner_name || data.aBrokerName || data.bBrokerName || ""),
    pdf_name: String(input.pdf_name || pdfFilename(data)),
    pdf_path: String(input.pdf_path || ""),
    created_by: String(input.created_by || ""),
    created_at: Number(input.created_at || Math.floor(Date.now() / 1000)),
    updated_at: Number(input.updated_at || Math.floor(Date.now() / 1000)),
    data,
  };
}

export function writeFormI(root, row) {
  const stored = normalizeRow(row);
  stored.pdf_path = pdfPath(root, stored.id);
  fs.writeFileSync(jsonPath(root, stored.id), JSON.stringify(stored, null, 2));
  fs.writeFileSync(stored.pdf_path, formIPdf(stored.data));
  return stored;
}

export function readFormI(root, id) {
  const file = jsonPath(root, String(id || ""));
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeRow(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function listFormI(root) {
  const dir = formIDir(root);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readFormI(root, name.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function removeFormI(root, id) {
  const row = readFormI(root, id);
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
    download: `/api/form-i/download?id=${encodeURIComponent(row.id)}`,
    preview: `/api/form-i/download?id=${encodeURIComponent(row.id)}&inline=1`,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: row.data,
  };
}
