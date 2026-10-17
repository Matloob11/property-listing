import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { nocPdf } from "./nocPdf.js";
import { withOwnerSign } from "./nocSign.js";
import { normalizeNocSign, nocSignView } from "./nocSignState.js";

export const FORM_KEYS = [
  "listingId",
  "listingRef",
  "date",
  "ownerName",
  "emiratesId",
  "companyName",
  "purpose",
  "propertyKind",
  "location",
  "titleDeedPropertyType",
  "buildingNo",
  "plotNo",
  "municipalityNo",
  "plotAreaSqft",
  "plotAreaSqm",
  "askingAmount",
  "askingPeriod",
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function prettyType(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function propertyKindFromType(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("villa")) return "villa";
  if (raw.includes("townhouse")) return "townhouse";
  if (raw.includes("apartment") || raw.includes("penthouse") || raw.includes("studio")) return "apartment";
  if (raw.includes("office")) return "office";
  if (raw.includes("shop") || raw.includes("retail")) return "shop";
  if (raw.includes("land") || raw.includes("plot")) return "plot";
  return raw.replace(/[_-]+/g, " ").trim() || "property";
}

export function moneyNumber(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value) {
  const n = moneyNumber(value);
  if (n <= 0) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 });
}

export function formatArea(value, digits = 2) {
  const n = moneyNumber(value);
  if (n <= 0) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function sqmFromSqft(sqft) {
  const n = moneyNumber(sqft);
  if (n <= 0) return "";
  return String(Math.round(n * 0.092903 * 100) / 100);
}

export function sqftFromSqm(sqm) {
  const n = moneyNumber(sqm);
  if (n <= 0) return "";
  return String(Math.round(n / 0.092903));
}

export function formatNocDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${Number(iso[3])} ${MONTHS[Number(iso[2]) - 1]} ${iso[1]}`;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(raw);
  if (dmy) return `${Number(dmy[1])} ${MONTHS[Number(dmy[2]) - 1]} ${dmy[3]}`;
  return raw;
}

export function todayNocDate() {
  const now = new Date();
  return `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

export function normalizeForm(input) {
  const data = {};
  for (const key of FORM_KEYS) data[key] = String(input?.[key] ?? "").trim();
  if (!data.companyName) data.companyName = "A7 GROUP REAL ESTATE LLC";
  if (!data.purpose || (data.purpose !== "sale" && data.purpose !== "rental")) data.purpose = "rental";
  if (!data.askingPeriod) data.askingPeriod = data.purpose === "sale" ? "" : "per year";
  if (!data.date) data.date = todayNocDate();
  else data.date = formatNocDate(data.date) || data.date;
  if (!data.propertyKind && data.titleDeedPropertyType) data.propertyKind = propertyKindFromType(data.titleDeedPropertyType);
  if (!data.titleDeedPropertyType && data.propertyKind) data.titleDeedPropertyType = prettyType(data.propertyKind);
  if (!data.plotAreaSqm && data.plotAreaSqft) data.plotAreaSqm = sqmFromSqft(data.plotAreaSqft);
  if (!data.plotAreaSqft && data.plotAreaSqm) data.plotAreaSqft = sqftFromSqm(data.plotAreaSqm);
  return withOwnerSign(data, input);
}

export function missingDetails(data) {
  if (!data.ownerName) return "Please fill the owner name.";
  if (!data.emiratesId) return "Please fill the Emirates ID.";
  if (!data.location) return "Please fill the location.";
  if (!data.plotNo && !data.buildingNo) return "Please fill plot no. or building no.";
  return "";
}

export function formFromListing(listing) {
  if (!listing) return {};
  const rental = listing.purpose !== "sale";
  const kind = propertyKindFromType(listing.type);
  const location = [listing.community || listing.sub_community || listing.bayut_community, listing.city || "Dubai"]
    .filter(Boolean)
    .join(", ");
  const sqft = listing.area_sqft ? String(listing.area_sqft) : listing.plot_size ? String(listing.plot_size) : "";
  const amount = listing.price_aed ? String(listing.price_aed) : "";
  return normalizeForm({
    listingId: listing.id || "",
    listingRef: listing.reference || "",
    date: todayNocDate(),
    ownerName: listing.landlord_name || "",
    emiratesId: "",
    companyName: "A7 GROUP REAL ESTATE LLC",
    purpose: rental ? "rental" : "sale",
    propertyKind: kind,
    location,
    titleDeedPropertyType: prettyType(listing.type),
    buildingNo: listing.building || listing.project_name || listing.bayut_building || "",
    plotNo: listing.plot_no || "",
    municipalityNo: "",
    plotAreaSqft: sqft,
    plotAreaSqm: sqmFromSqft(sqft),
    askingAmount: amount,
    askingPeriod: rental ? "per year" : "",
  });
}

export function letterBits(data) {
  const form = normalizeForm(data);
  const kind = String(form.propertyKind || "property").toLowerCase();
  const rental = form.purpose !== "sale";
  const amount = formatMoney(form.askingAmount);
  const sqft = formatArea(form.plotAreaSqft);
  const sqm = formatArea(form.plotAreaSqm);
  return {
    ...form,
    kind,
    rental,
    purposePhrase: rental ? "for rental purposes" : "for sale",
    findPhrase: rental ? "finding suitable tenants" : "finding suitable buyers",
    askingLabel: rental ? "Asking Rent" : "Asking Price",
    askingValue: amount ? `AED ${amount}${form.askingPeriod ? ` ${form.askingPeriod}` : ""}` : "",
    areaValue: sqft || sqm ? `${sqft ? `${sqft} sq. ft.` : ""}${sqft && sqm ? " " : ""}${sqm ? `(${sqm} sq. m.)` : ""}`.trim() : "",
  };
}

export function pdfFilename(data) {
  const bits = ["NOC"];
  for (const key of ["plotNo", "ownerName", "listingRef"]) {
    const part = String(data[key] || "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

export function newNocId() {
  return `noc-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function nocDir(root) {
  const dir = path.join(root, "data", "noc");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildNocPdf(data) {
  return nocPdf(data);
}

function jsonPath(root, id) {
  return path.join(nocDir(root), `${id}.json`);
}

function pdfPath(root, id) {
  return path.join(nocDir(root), `${id}.pdf`);
}

export function normalizeNoc(input) {
  const data = normalizeForm(input.data || input);
  return {
    id: String(input.id || newNocId()),
    title: String(input.title || `NOC — ${(data.plotNo || data.location || data.ownerName || "Property").trim()}`),
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

export function writeNoc(root, row) {
  const stored = normalizeNoc(row);
  stored.pdf_path = pdfPath(root, stored.id);
  fs.writeFileSync(jsonPath(root, stored.id), JSON.stringify(stored, null, 2));
  fs.writeFileSync(stored.pdf_path, buildNocPdf(stored.data));
  return stored;
}

export function readNoc(root, id) {
  const file = jsonPath(root, String(id || ""));
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeNoc(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function listNocs(root) {
  const dir = nocDir(root);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readNoc(root, name.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function removeNoc(root, id) {
  const row = readNoc(root, id);
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
    download: `/api/noc/download?id=${encodeURIComponent(row.id)}`,
    preview: `/api/noc/download?id=${encodeURIComponent(row.id)}&inline=1`,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...nocSignView(row.sign),
    data: row.data,
  };
}
