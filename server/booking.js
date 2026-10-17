import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { bookingPdf } from "./bookingPdf.js";
import {
  amountInWordsAr,
  communityArabic,
  fillArabicFromEnglish,
  mortgageArabic,
  typeArabic,
} from "./deedArabic.js";

export const FORM_KEYS = [
  "listingId",
  "listingRef",
  "documentNo",
  "issueDate",
  "mortgageStatus",
  "mortgageStatusAr",
  "propertyType",
  "propertyTypeAr",
  "community",
  "communityAr",
  "plotNo",
  "buildingNo",
  "buildingName",
  "propertyNo",
  "floorNo",
  "parkings",
  "suiteArea",
  "balconyArea",
  "areaSqMeter",
  "areaSqFeet",
  "ownersCount",
  "ownerName",
  "ownerNameAr",
  "ownerId",
  "ownerShare",
  "ownerAreaSqm",
  "owner2Name",
  "owner2NameAr",
  "owner2Id",
  "owner2Share",
  "owner2AreaSqm",
  "purchasedFrom",
  "purchasedFromAr",
  "landRegistrationNo",
  "registrationDate",
  "amount",
  "amountWords",
  "amountWordsAr",
];

export function prettyType(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export { mortgageArabic, typeArabic, communityArabic, amountInWordsAr };

export function moneyNumber(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function amountInWords(raw) {
  const n = Math.round(moneyNumber(raw));
  if (n <= 0) return "";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const to99 = (x) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`.trim());
  const to999 = (x) => {
    const hundred = Math.floor(x / 100);
    const rest = x % 100;
    const bits = [];
    if (hundred) bits.push(`${ones[hundred]} Hundred`);
    if (rest) bits.push(to99(rest));
    return bits.join(" ");
  };
  const parts = [];
  let left = n;
  const million = Math.floor(left / 1000000);
  left %= 1000000;
  const thousand = Math.floor(left / 1000);
  left %= 1000;
  if (million) parts.push(`${to999(million)} Million`);
  if (thousand) parts.push(`${to999(thousand)} Thousand`);
  if (left) parts.push(to999(left));
  return `${parts.join(" ")} UAE Dirhams only`;
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

export function formatDate(value) {
  const raw = String(value || "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

export function normalizeForm(input) {
  const data = {};
  for (const key of FORM_KEYS) data[key] = String(input?.[key] ?? "").trim();
  if (!data.mortgageStatus) data.mortgageStatus = "Not mortgaged";
  if (!data.ownersCount) data.ownersCount = data.owner2Name ? "2" : "1";
  if (!data.ownerShare && data.ownerName) data.ownerShare = data.owner2Name ? "" : "100%";
  if (!data.ownerAreaSqm && data.areaSqMeter) data.ownerAreaSqm = data.areaSqMeter;
  if (!data.suiteArea && data.areaSqMeter) data.suiteArea = data.areaSqMeter;
  if (!data.areaSqMeter && data.areaSqFeet) data.areaSqMeter = sqmFromSqft(data.areaSqFeet);
  if (!data.areaSqFeet && data.areaSqMeter) data.areaSqFeet = sqftFromSqm(data.areaSqMeter);
  if (!data.amountWords && data.amount) data.amountWords = amountInWords(data.amount);
  if (!data.registrationDate && data.issueDate) data.registrationDate = data.issueDate;
  return fillArabicFromEnglish(data);
}

export function missingDetails(data) {
  if (!data.ownerName) return "Please fill the owner name.";
  if (!data.community && !data.propertyNo && !data.buildingName) {
    return "Please fill community, building name, or property number.";
  }
  return "";
}

export function formFromListing(listing) {
  if (!listing) return {};
  const areaSqFeet = listing.area_sqft ? String(listing.area_sqft) : "";
  const areaSqMeter = sqmFromSqft(listing.area_sqft);
  const saleAmount = listing.purpose === "sale" ? String(listing.sale_price || listing.price_aed || "") : "";
  const amount = saleAmount && Number(saleAmount) > 0 ? String(Math.round(Number(saleAmount))) : "";
  return normalizeForm({
    listingId: listing.id || "",
    listingRef: listing.reference || "",
    documentNo: listing.reference || listing.title_deed || "",
    issueDate: formatDate(listing.permit_issue_date || ""),
    mortgageStatus: /mortgage/i.test(String(listing.financial_status || "")) ? "Mortgaged" : "Not mortgaged",
    mortgageStatusAr: /mortgage/i.test(String(listing.financial_status || "")) ? "مرهونة" : "غير مرهونة",
    propertyType: prettyType(listing.type),
    propertyTypeAr: typeArabic(listing.type),
    community: listing.community || listing.bayut_community || listing.sub_community || "",
    plotNo: listing.plot_size || "",
    buildingNo: "",
    buildingName: listing.building || listing.project_name || listing.bayut_building || "",
    propertyNo: listing.unit_no || "",
    floorNo: "",
    parkings: listing.parking || "",
    suiteArea: areaSqMeter,
    balconyArea: "",
    areaSqMeter,
    areaSqFeet,
    ownersCount: "1",
    ownerName: listing.landlord_name || "",
    ownerId: "",
    ownerShare: listing.landlord_name ? "100%" : "",
    ownerAreaSqm: areaSqMeter,
    purchasedFrom: "",
    landRegistrationNo: listing.title_deed || "",
    registrationDate: formatDate(listing.permit_issue_date || ""),
    amount,
    amountWords: amount ? amountInWords(amount) : "",
  });
}

export function pdfFilename(data) {
  const bits = ["Title-Deed"];
  for (const key of ["listingRef", "propertyNo", "ownerName"]) {
    const part = String(data[key] || "").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

export function newBookingId() {
  return `bf-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function bookingDir(root) {
  const dir = path.join(root, "data", "booking");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildBookingPdf(data) {
  return bookingPdf(data);
}

function jsonPath(root, id) {
  return path.join(bookingDir(root), `${id}.json`);
}

function pdfPath(root, id) {
  return path.join(bookingDir(root), `${id}.pdf`);
}

export function normalizeBooking(input) {
  const data = normalizeForm(input.data || input);
  return {
    id: String(input.id || newBookingId()),
    title: String(input.title || `Title Deed — ${(data.propertyNo || data.buildingName || data.community || "Property").trim()}`),
    listing_id: String(input.listing_id || data.listingId || ""),
    owner_name: String(input.owner_name || data.ownerName || ""),
    pdf_name: String(input.pdf_name || pdfFilename(data)),
    pdf_path: String(input.pdf_path || ""),
    created_by: String(input.created_by || ""),
    created_at: Number(input.created_at || Math.floor(Date.now() / 1000)),
    updated_at: Number(input.updated_at || Math.floor(Date.now() / 1000)),
    data,
  };
}

export function writeBooking(root, row) {
  const stored = normalizeBooking(row);
  stored.pdf_path = pdfPath(root, stored.id);
  fs.writeFileSync(jsonPath(root, stored.id), JSON.stringify(stored, null, 2));
  fs.writeFileSync(stored.pdf_path, buildBookingPdf(stored.data));
  return stored;
}

export function readBooking(root, id) {
  const file = jsonPath(root, String(id || ""));
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeBooking(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function listBookings(root) {
  const dir = bookingDir(root);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readBooking(root, name.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function removeBooking(root, id) {
  const row = readBooking(root, id);
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
    download: `/api/booking/download?id=${encodeURIComponent(row.id)}`,
    preview: `/api/booking/download?id=${encodeURIComponent(row.id)}&inline=1`,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: row.data,
  };
}
