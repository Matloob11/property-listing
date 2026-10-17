import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { formatNocDate, prettyType, todayNocDate } from "./noc.js";
import { nocTrakheesiPdf } from "./nocTrakheesiPdf.js";
import { withOwnerSign } from "./nocSign.js";
import { normalizeNocSign, nocSignView } from "./nocSignState.js";

export const FORM_KEYS = [
  "listingId",
  "listingRef",
  "date",
  "recipient",
  "recipientPlace",
  "ownerName",
  "companyName",
  "tradeLicense",
  "purpose",
  "propertyType",
  "building",
  "propertyNo",
  "plotNo",
  "location",
  "annualRent",
];

const DEFAULT_COMPANY = "A7 Group Real Estate LLC";
const DEFAULT_LICENSE = "1056530";
const DEFAULT_TO = "Dubai Land Department (DLD) - RERA / Trakheesi";
const DEFAULT_PLACE = "Dubai, United Arab Emirates";

function moneyNumber(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value) {
  const n = moneyNumber(value);
  if (n <= 0) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 });
}

export function isSale(purpose) {
  return String(purpose || "").toLowerCase() === "sale";
}

export function propertyTypeFromListing(listing) {
  const beds = Number(listing?.beds);
  if (Number.isFinite(beds) && beds > 0) return `${beds} Bedroom`;
  if (beds === 0 && /apartment|studio|hotel/i.test(String(listing?.type || ""))) return "Studio";
  return prettyType(listing?.type);
}

export function normalizeForm(input) {
  const data = {};
  for (const key of FORM_KEYS) data[key] = String(input?.[key] ?? "").trim();
  if (!data.companyName) data.companyName = DEFAULT_COMPANY;
  if (!data.tradeLicense) data.tradeLicense = DEFAULT_LICENSE;
  if (!data.recipient) data.recipient = DEFAULT_TO;
  if (!data.recipientPlace) data.recipientPlace = DEFAULT_PLACE;
  data.purpose = isSale(data.purpose) ? "sale" : "rental";
  if (!data.date) data.date = todayNocDate();
  else data.date = formatNocDate(data.date) || data.date;
  return withOwnerSign(data, input);
}

export function missingDetails(data) {
  if (!data.ownerName) return "Add the owner name.";
  if (!data.location) return "Add the location.";
  if (!data.building && !data.propertyNo && !data.plotNo) {
    return "Add building / cluster, property no., or plot no.";
  }
  if (!data.annualRent) return "Add the annual rent or asking price.";
  return "";
}

export function formFromListing(listing) {
  if (!listing) return {};
  const rental = listing.purpose !== "sale";
  const amount = rental
    ? listing.price_yearly || listing.price_aed || ""
    : listing.sale_price || listing.price_aed || "";
  return normalizeForm({
    listingId: listing.id || "",
    listingRef: listing.reference || "",
    date: todayNocDate(),
    ownerName: listing.landlord_name || "",
    purpose: rental ? "rental" : "sale",
    propertyType: propertyTypeFromListing(listing),
    building: listing.building || listing.project_name || listing.bayut_building || listing.sub_community || "",
    propertyNo: listing.unit_no || "",
    plotNo: listing.plot_no || "",
    location: listing.community || listing.sub_community || listing.bayut_community || listing.city || "",
    annualRent: amount ? String(amount) : "",
  });
}

export function letterBits(data) {
  const form = normalizeForm(data);
  const sale = isSale(form.purpose);
  const amount = formatMoney(form.annualRent);
  return {
    ...form,
    sale,
    purposeWord: sale ? "sale" : "rent",
    subject: sale ? "NOC for Advertising Property for Sale" : "NOC for Advertising Property for Rent",
    rentLabel: sale ? "Asking Price" : "Annual Rent",
    rentValue: amount ? `AED ${amount}` : "",
    portals: "Property Finder, Bayut, Dubizzle, and other DLD/RERA-approved advertising portals",
  };
}

export function pdfFilename(data) {
  const bits = ["NOC-For-Advertisement"];
  for (const key of ["propertyNo", "building", "ownerName", "listingRef"]) {
    const part = String(data[key] || "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

export function newId() {
  return `noct-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function trakheesiDir(root) {
  const dir = path.join(root, "data", "noc-trakheesi");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonPath(root, id) {
  return path.join(trakheesiDir(root), `${id}.json`);
}

function pdfPath(root, id) {
  return path.join(trakheesiDir(root), `${id}.pdf`);
}

export function normalizeRow(input) {
  const data = normalizeForm(input.data || input);
  return {
    id: String(input.id || newId()),
    title: String(input.title || `NOC For Advertisement — ${(data.propertyNo || data.building || data.ownerName || "Property").trim()}`),
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

export function writeTrakheesi(root, row) {
  const stored = normalizeRow(row);
  stored.pdf_path = pdfPath(root, stored.id);
  fs.writeFileSync(jsonPath(root, stored.id), JSON.stringify(stored, null, 2));
  fs.writeFileSync(stored.pdf_path, nocTrakheesiPdf(stored.data));
  return stored;
}

export function readTrakheesi(root, id) {
  const file = jsonPath(root, String(id || ""));
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeRow(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function listTrakheesi(root) {
  const dir = trakheesiDir(root);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readTrakheesi(root, name.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function removeTrakheesi(root, id) {
  const row = readTrakheesi(root, id);
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
    download: `/api/noc-trakheesi/download?id=${encodeURIComponent(row.id)}`,
    preview: `/api/noc-trakheesi/download?id=${encodeURIComponent(row.id)}&inline=1`,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...nocSignView(row.sign),
    data: row.data,
  };
}
