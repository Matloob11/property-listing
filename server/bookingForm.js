import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { bookingFormPdf } from "./bookingFormPdf.js";
import {
  formFromListing,
  formatVoucherNo,
  missingDetails,
  normalizeForm,
  pdfFilename,
} from "./bookingFormModel.js";

export { bookingFormPdf } from "./bookingFormPdf.js";
export {
  BOOKING_OFFICE_OPTIONS,
  BOOKING_OFFICES,
  PURPOSE_OPTIONS,
  THROUGH_OPTIONS,
  aedInWords,
  applyOffice,
  emptyBookingForm,
  formFromListing,
  formatVoucherDate,
  formatVoucherNo,
  joinPropertyLine,
  isoVoucherDate,
  missingDetails,
  money,
  normalizeForm,
  officeBrand,
  officeById,
  onAccountLine,
  stampBrand,
  particularLines,
  pdfFilename,
  throughLine,
  todayVoucherDate,
} from "./bookingFormModel.js";

export function newId() {
  return `bkf-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function bookingFormDir(root) {
  const dir = path.join(root, "data", "booking-form");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function jsonPath(root, id) {
  return path.join(bookingFormDir(root), `${id}.json`);
}

function pdfPath(root, id) {
  return path.join(bookingFormDir(root), `${id}.pdf`);
}

export function nextVoucherNo(root) {
  const nums = listBookingForms(root)
    .map((row) => Number(String(row.data?.voucherNo || "").replace(/\D/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return formatVoucherNo(String((nums.length ? Math.max(...nums) : 0) + 1));
}

export function normalizeRow(input) {
  const data = normalizeForm(input.data || input);
  return {
    id: String(input.id || newId()),
    title: String(input.title || `Booking Form — ${(data.accountName || data.voucherNo || data.listingRef || "Receipt").trim()}`),
    listing_id: String(input.listing_id || data.listingId || ""),
    owner_name: String(input.owner_name || data.accountName || ""),
    pdf_name: String(input.pdf_name || pdfFilename(data)),
    pdf_path: String(input.pdf_path || ""),
    created_by: String(input.created_by || ""),
    created_at: Number(input.created_at || Math.floor(Date.now() / 1000)),
    updated_at: Number(input.updated_at || Math.floor(Date.now() / 1000)),
    refunded: Boolean(input.refunded),
    refunded_at: input.refunded ? Number(input.refunded_at || 0) : 0,
    data,
  };
}

export function writeBookingForm(root, row) {
  const stored = normalizeRow(row);
  stored.pdf_path = pdfPath(root, stored.id);
  fs.writeFileSync(jsonPath(root, stored.id), JSON.stringify(stored, null, 2));
  fs.writeFileSync(stored.pdf_path, bookingFormPdf(stored.data));
  return stored;
}

export function setBookingRefund(root, id, refunded) {
  const row = readBookingForm(root, id);
  if (!row) return null;
  const on = Boolean(refunded);
  row.refunded = on;
  row.refunded_at = on ? Math.floor(Date.now() / 1000) : 0;
  row.updated_at = row.refunded_at || Math.floor(Date.now() / 1000);
  return writeBookingForm(root, row);
}

export function readBookingForm(root, id) {
  const file = jsonPath(root, String(id || ""));
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeRow(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function listBookingForms(root) {
  const dir = bookingFormDir(root);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readBookingForm(root, name.replace(/\.json$/, "")))
    .filter(Boolean)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function removeBookingForm(root, id) {
  const row = readBookingForm(root, id);
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
    office: row.data?.office || "",
    stamp: row.data?.stamp || "",
    voucherNo: row.data?.voucherNo || "",
    refunded: Boolean(row.refunded),
    refundedAt: Number(row.refunded_at || 0),
    pdfName: row.pdf_name,
    download: `/api/booking-form/download?id=${encodeURIComponent(row.id)}`,
    preview: `/api/booking-form/download?id=${encodeURIComponent(row.id)}&inline=1`,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: row.data,
  };
}
