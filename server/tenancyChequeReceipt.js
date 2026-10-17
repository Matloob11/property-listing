import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chequeSchedule } from "./tenancyCheques.js";

const IMAGE_MAX = 6 * 1024 * 1024;
const VERIFY_DAYS = 30;

function str(value) {
  return String(value || "").trim();
}

export function chequeLine(particular, amount, date) {
  return [particular, amount, date].filter(Boolean).join(" · ") || "the cheque";
}

export function ownerVerifyEmail({ ownerName, property, particular, amount, date, verifyUrl }) {
  const who = ownerName || "Owner";
  const cheque = chequeLine(particular, amount, date);
  return [
    `Hello ${who},`,
    "",
    "A7 Group Real Estate needs you to confirm that you received a cheque.",
    property ? `Property: ${property}` : "",
    `Cheque: ${cheque}`,
    "",
    "Open this link, write that you received the cheque, draw your signature, then press Send back:",
    verifyUrl,
    "",
    "The tenant is not copied on this email.",
    "",
    "A7 Group Real Estate",
    "Dubai",
    "",
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");
}

export function tenantAckEmail({ tenantName, property, particular, amount, date, note }) {
  const who = tenantName || "";
  const cheque = chequeLine(particular, amount, date);
  return [
    who ? `Hello ${who},` : "Hello,",
    "",
    "The owner has verified that they received the cheque.",
    property ? `Property: ${property}` : "",
    `Cheque: ${cheque}`,
    note ? `Owner note: ${note}` : "",
    "",
    "The cheque file is attached. The owner’s signature is also attached.",
    "",
    "A7 Group Real Estate",
    "Dubai",
    "",
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");
}

export function chequeReceiptSubject(property) {
  return property ? `Cheque received — ${property}` : "Cheque received";
}

export function ownerVerifySubject(property) {
  return property ? `Please confirm you received the cheque — ${property}` : "Please confirm you received the cheque";
}

export function tenantAckSubject(property) {
  return property ? `Owner confirmed cheque received — ${property}` : "Owner confirmed cheque received";
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(value));
}

export function publicChequeReceipt(item = {}) {
  const tenantEmail = str(item.tenantEmail || item.to);
  const status =
    str(item.status) ||
    (item.verifiedAt ? "verified" : item.token && !item.verifiedAt ? "pending" : tenantEmail || item.sentAt ? "sent" : "");
  return {
    id: str(item.id),
    status,
    ownerEmail: str(item.ownerEmail),
    tenantEmail,
    to: tenantEmail,
    sentAt: str(item.sentAt),
    verifiedAt: str(item.verifiedAt),
    tenantSentAt: str(item.tenantSentAt),
    particular: str(item.particular),
    amount: str(item.amount),
    date: str(item.date),
    note: str(item.note),
    by: str(item.by),
    crop: str(item.crop || "received"),
  };
}

export function rawChequeReceipts(row) {
  return Array.isArray(row?.data?.chequeReceipts) ? row.data.chequeReceipts.slice() : [];
}

export function chequeProofPath(root, tenancyId, receipt) {
  const dir = path.resolve(path.join(root, "data", "tenancy", "cheques"));
  const stored = str(receipt?.proofPath);
  if (stored) {
    const resolved = path.resolve(stored);
    if ((resolved === dir || resolved.startsWith(`${dir}${path.sep}`)) && fs.existsSync(resolved)) return resolved;
  }
  const id = str(receipt?.id);
  const tid = str(tenancyId);
  if (!id || !tid) return "";
  for (const ext of ["jpg", "jpeg", "png", "webp", "gif", "pdf"]) {
    const file = path.join(dir, `${tid}-${id}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return "";
}

export function chequeProofMime(file) {
  const ext = path.extname(file || "").toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

export function chequeProofFileName(mime, ext) {
  if (String(mime || "").includes("pdf") || ext === "pdf") return "cheque-received.pdf";
  if (ext === "png") return "cheque-received.png";
  if (ext === "webp") return "cheque-received.webp";
  if (ext === "gif") return "cheque-received.gif";
  return "cheque-received.jpg";
}

export function listChequeReceipts(row) {
  const raw = row?.data?.chequeReceipts;
  if (!Array.isArray(raw)) return [];
  return raw.map(publicChequeReceipt).filter((item) => item.id && (item.ownerEmail || item.tenantEmail));
}

export function preserveTenancyChequeReceipts(existing, data) {
  const next = data && typeof data === "object" ? { ...data } : {};
  const kept = Array.isArray(existing?.data?.chequeReceipts) ? existing.data.chequeReceipts : [];
  if (kept.length) next.chequeReceipts = kept;
  return next;
}

export function pickChequeRow(data, index) {
  const rows = chequeSchedule(data || {}).rows || [];
  const i = Number(index);
  if (Number.isInteger(i) && i >= 0 && rows[i]) return rows[i];
  return rows[0] || { particular: "Cheque", amount: "", date: "", name: "" };
}

export function decodeChequeImage(raw, mimeHint = "") {
  const got = decodeChequeProof(raw, mimeHint);
  return got && String(got.mime).startsWith("image/") ? got : null;
}

export function decodeChequeProof(raw, mimeHint = "") {
  const text = String(raw || "").replace(/\s+/g, "");
  const data = /^data:((?:image\/(?:jpeg|jpg|png|webp|gif)|application\/pdf));base64,(.+)$/i.exec(text);
  let mime = String(mimeHint || "").toLowerCase();
  let b64 = text;
  if (data) {
    mime = data[1].toLowerCase();
    b64 = data[2];
  } else if (!/^[A-Za-z0-9+/=]+$/.test(text) || text.length < 80) {
    return null;
  }
  if (mime === "image/jpg") mime = "image/jpeg";
  if (mime === "application/pdf" || mime === "pdf") mime = "application/pdf";
  else if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) mime = "image/jpeg";
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length || buffer.length > IMAGE_MAX) return null;
  if (mime === "application/pdf" && !buffer.subarray(0, 5).toString("latin1").startsWith("%PDF")) return null;
  const ext =
    mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
  return { mime, buffer, ext };
}

export function storeChequeProof(root, tenancyId, receiptId, buffer, ext) {
  const dir = path.join(root, "data", "tenancy", "cheques");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${tenancyId}-${receiptId}.${ext}`);
  fs.writeFileSync(file, buffer);
  return file;
}

export function decodeSignatureImage(raw) {
  const got = decodeChequeImage(raw);
  return got && got.buffer.length < IMAGE_MAX ? got : null;
}

export function newChequeReceiptToken() {
  return crypto.randomBytes(20).toString("hex");
}

export function chequeReceiptExpiry() {
  return new Date(Date.now() + VERIFY_DAYS * 86400000).toISOString();
}

export function findChequeReceipt(rows, token) {
  const want = str(token);
  if (!want) return null;
  for (const row of rows || []) {
    const receipts = Array.isArray(row?.data?.chequeReceipts) ? row.data.chequeReceipts : [];
    const index = receipts.findIndex((item) => str(item?.token) === want);
    if (index >= 0) return { row, receipt: receipts[index], receipts, index };
  }
  return null;
}

export function chequeReceiptExpired(receipt) {
  if (!receipt || receipt.verifiedAt) return false;
  const at = Date.parse(receipt.expires_at || "");
  return Number.isFinite(at) && at < Date.now();
}
