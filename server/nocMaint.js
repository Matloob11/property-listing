import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prettyType } from "./noc.js";
import { findMaintCompany } from "./nocMaintCompanies.js";
import { nocMaintPdf } from "./nocMaintPdf.js";
import { withOwnerSign } from "./nocSign.js";
import { normalizeNocSign, nocSignView } from "./nocSignState.js";

export const FORM_KEYS = [
  "listingId",
  "listingRef",
  "date",
  "recipient",
  "ownerName",
  "propertyKind",
  "propertyDetails",
  "companyName",
  "tradeLicense",
  "workType",
  "scopeText",
];

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatMaintDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dmyDash = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(raw);
  if (dmyDash) return `${pad2(dmyDash[1])}-${pad2(dmyDash[2])}-${dmyDash[3]}`;
  const named = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw);
  if (named) {
    const mi = MONTHS.indexOf(named[2].toLowerCase());
    if (mi >= 0) return `${pad2(named[1])}-${pad2(mi + 1)}-${named[3]}`;
  }
  return raw;
}

export function todayMaintDate() {
  const now = new Date();
  return `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
}

export function scopeLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((row) => row.replace(/^[•\-\u2022]\s*/, "").trim())
    .filter(Boolean);
}

export const DEFAULT_SCOPE_OPTIONS = [
  "AC servicing and repair",
  "Plumbing repairs: leaking taps, pipes, shower, toilet, drainage",
  "Electrical repairs: switches, sockets, lights, breakers",
  "Washing machine repair",
  "Bathtub change",
  "Kitchen sink and drainage cleaning",
  "Painting and touch-up work",
  "Pest control",
  "Deep cleaning",
  "TV/wall-mount installation",
  "Light fixture installation",
  "Water heater/geyser servicing",
  "Door and lock repair/replacement",
];

export function normalizeScopeOption(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function mergeScopeOptions(extra = []) {
  const seen = new Set();
  const items = [];
  for (const item of [...DEFAULT_SCOPE_OPTIONS, ...extra]) {
    const text = normalizeScopeOption(item);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    items.push(text);
  }
  return items;
}

function scopeOptionsPath(root) {
  return path.join(maintDir(root), "scope-options.json");
}

export function readScopeOptions(root) {
  let extra = [];
  try {
    const raw = JSON.parse(fs.readFileSync(scopeOptionsPath(root), "utf8"));
    extra = Array.isArray(raw) ? raw : raw?.items || [];
  } catch {
    extra = [];
  }
  return mergeScopeOptions(extra);
}

export function addScopeOption(root, value) {
  const text = normalizeScopeOption(value);
  if (!text) return { ok: false, error: "Type a scope item to add." };
  if (text.length > 120) return { ok: false, error: "Keep the new scope item under 120 characters." };
  const items = readScopeOptions(root);
  if (items.some((item) => item.toLowerCase() === text.toLowerCase())) {
    return { ok: true, items, added: text, existed: true };
  }
  const extra = items.filter(
    (item) => !DEFAULT_SCOPE_OPTIONS.some((option) => option.toLowerCase() === item.toLowerCase())
  );
  extra.push(text);
  fs.writeFileSync(scopeOptionsPath(root), JSON.stringify({ items: extra }, null, 2));
  return { ok: true, items: mergeScopeOptions(extra), added: text };
}

export function normalizeForm(input) {
  const data = {};
  for (const key of FORM_KEYS) data[key] = String(input?.[key] ?? "").trim();
  if (!data.date) data.date = todayMaintDate();
  else data.date = formatMaintDate(data.date) || data.date;
  if (!data.propertyKind) data.propertyKind = "Villa";
  if (!data.workType) data.workType = "AC Maintenance";
  data.scopeText = scopeLines(data.scopeText).join("\n");
  const company = findMaintCompany(data.companyName);
  if (company) {
    data.companyName = company.name;
    data.tradeLicense = company.license;
  }
  return withOwnerSign(data, input);
}

export function missingDetails(data) {
  if (!data.recipient) return "Add who the letter is to.";
  if (!data.ownerName) return "Add the owner name.";
  if (!data.propertyDetails) return "Add the property details.";
  if (!data.companyName) return "Add the maintenance company.";
  if (!data.tradeLicense) return "Add the company license number.";
  return "";
}

export function formFromListing(listing) {
  if (!listing) return {};
  const kind = prettyType(listing.type) || "Villa";
  const details = [
    listing.unit_no,
    listing.building || listing.project_name || listing.bayut_building,
    listing.plot_no ? `Plot ${listing.plot_no}` : "",
    listing.community || listing.sub_community || listing.bayut_community,
    listing.city || "Dubai",
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  return normalizeForm({
    listingId: listing.id || "",
    listingRef: listing.reference || "",
    date: todayMaintDate(),
    ownerName: listing.landlord_name || "",
    propertyKind: kind,
    propertyDetails: details,
  });
}

export function pdfFilename(data) {
  const bits = ["NOC-Maintenance"];
  for (const key of ["propertyDetails", "ownerName", "listingRef"]) {
    const part = String(data[key] || "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

export function newId() {
  return `nocm-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function maintDir(root) {
  const dir = path.join(root, "data", "noc-maint");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonPath(root, id) {
  return path.join(maintDir(root), `${id}.json`);
}

function pdfPath(root, id) {
  return path.join(maintDir(root), `${id}.pdf`);
}

export function normalizeRow(input) {
  const data = normalizeForm(input.data || input);
  return {
    id: String(input.id || newId()),
    title: String(input.title || `NOC Maintenance — ${(data.propertyDetails || data.ownerName || "Property").trim()}`),
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

export function writeMaint(root, row) {
  const stored = normalizeRow(row);
  stored.pdf_path = pdfPath(root, stored.id);
  fs.writeFileSync(jsonPath(root, stored.id), JSON.stringify(stored, null, 2));
  fs.writeFileSync(stored.pdf_path, nocMaintPdf(stored.data));
  return stored;
}

export function readMaint(root, id) {
  const file = jsonPath(root, String(id || ""));
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeRow(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function listMaints(root) {
  const dir = maintDir(root);
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("nocm-") && name.endsWith(".json"))
    .map((name) => readMaint(root, name.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function removeMaint(root, id) {
  const row = readMaint(root, id);
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
    download: `/api/noc-maint/download?id=${encodeURIComponent(row.id)}`,
    preview: `/api/noc-maint/download?id=${encodeURIComponent(row.id)}&inline=1`,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...nocSignView(row.sign),
    data: row.data,
  };
}
