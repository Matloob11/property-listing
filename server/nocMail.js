import crypto from "node:crypto";
import { sendMail, smtpConfigured } from "./smtp.js";
import { normalizeOwnerSign } from "./nocSign.js";
import { listNocs, readFileSafe as readNocFile, readNoc, rowView as nocView, writeNoc } from "./noc.js";
import { listMaints, readFileSafe as readMaintFile, readMaint, rowView as maintView, writeMaint } from "./nocMaint.js";
import { listMoveins, readFileSafe as readMoveinFile, readMovein, rowView as moveinView, writeMovein } from "./nocMovein.js";
import { listMoveouts, readFileSafe as readMoveoutFile, readMoveout, rowView as moveoutView, writeMoveout } from "./nocMoveout.js";
import { listTrakheesi, readFileSafe as readTrakheesiFile, readTrakheesi, rowView as trakheesiView, writeTrakheesi } from "./nocTrakheesi.js";
import { phoneDigits } from "./tenancy.js";
import { NOC_SIGN_DAYS, normalizeNocSign } from "./nocSignState.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NOC_MAIL_KINDS = {
  noc: {
    key: "noc",
    label: "NOC",
    list: listNocs,
    read: readNoc,
    write: writeNoc,
    view: nocView,
    readPdf: (_root, row) => readNocFile(row.pdf_path),
  },
  "noc-maint": {
    key: "noc-maint",
    label: "NOC Maintenance",
    list: listMaints,
    read: readMaint,
    write: writeMaint,
    view: maintView,
    readPdf: (_root, row) => readMaintFile(row.pdf_path),
  },
  "noc-movein": {
    key: "noc-movein",
    label: "NOC For Move In",
    list: listMoveins,
    read: readMovein,
    write: writeMovein,
    view: moveinView,
    readPdf: (_root, row) => readMoveinFile(row.pdf_path),
  },
  "noc-moveout": {
    key: "noc-moveout",
    label: "NOC For Move Out",
    list: listMoveouts,
    read: readMoveout,
    write: writeMoveout,
    view: moveoutView,
    readPdf: (_root, row) => readMoveoutFile(row.pdf_path),
  },
  "noc-trakheesi": {
    key: "noc-trakheesi",
    label: "NOC For Advertisement",
    list: listTrakheesi,
    read: readTrakheesi,
    write: writeTrakheesi,
    view: trakheesiView,
    readPdf: (_root, row) => readTrakheesiFile(row.pdf_path),
  },
};

export function findNocSign(root, token) {
  const wanted = String(token || "").trim();
  if (!wanted) return null;
  for (const kind of Object.values(NOC_MAIL_KINDS)) {
    for (const row of kind.list(root)) {
      if (row.sign?.token === wanted) return { kind, row, sign: normalizeNocSign(row.sign) };
    }
  }
  return null;
}

export function issueNocSign(root, kind, row, { email, name } = {}) {
  if (row?.sign?.signed_at) throw new Error("This NOC is already signed.");
  const to = String(email || row?.sign?.email || "").trim();
  if (!EMAIL_RE.test(to)) throw new Error("Enter a valid email.");
  const sign = {
    ...normalizeNocSign(row?.sign),
    email: to,
    name: String(name || row?.sign?.name || row?.owner_name || row?.data?.ownerName || "").trim(),
    token: crypto.randomBytes(20).toString("hex"),
    sent_at: new Date().toISOString(),
    viewed_at: "",
    signed_at: "",
    signed_name: "",
    expires_at: new Date(Date.now() + NOC_SIGN_DAYS * 864e5).toISOString(),
  };
  const saved = kind.write(root, {
    ...row,
    sign,
    updated_at: Math.floor(Date.now() / 1000),
  });
  return { saved, sign, token: sign.token };
}

export function markNocSignViewed(root, found) {
  if (!found?.row || found.sign?.viewed_at || found.sign?.signed_at) return found;
  const sign = { ...normalizeNocSign(found.sign), viewed_at: new Date().toISOString() };
  const row = found.kind.write(root, { ...found.row, sign });
  return { kind: found.kind, row, sign };
}

export function applyNocSignature(root, found, { name, image } = {}) {
  const signedName = String(name || "").trim();
  if (signedName.length < 3) throw new Error("Please enter your full name.");
  if (found.sign?.signed_at) throw new Error("This NOC was already sent back.");
  const ownerSign = normalizeOwnerSign(image);
  if (!ownerSign) throw new Error("The signature image is missing or too large.");
  const sign = {
    ...normalizeNocSign(found.sign),
    signed_at: new Date().toISOString(),
    signed_name: signedName,
    name: signedName,
  };
  const row = found.kind.write(root, {
    ...found.row,
    data: { ...found.row.data, ownerSign },
    sign,
    updated_at: Math.floor(Date.now() / 1000),
  });
  return { kind: found.kind, row, sign };
}

export function nocEmailBody(name, label, title, url) {
  const who = name || "there";
  return [
    `Hello ${who},`,
    "",
    `A7 Group Real Estate has prepared a ${label}${title ? ` (${title})` : ""} for your property.`,
    "The PDF is attached. Open this link, sign, then press Send back. The signed NOC returns to our signed list.",
    "",
    url,
    "",
    "A7 Group Real Estate",
    "Dubai",
  ].join("\n");
}

export async function emailNocForSign(root, kind, row, { email, name, origin } = {}) {
  if (!smtpConfigured()) return { ok: false, error: "Email is not set up. Add SMTP in .env first." };
  if (row?.sign?.signed_at) return { ok: false, error: "This NOC is already signed." };
  const to = String(email || row?.sign?.email || "").trim();
  if (!EMAIL_RE.test(to)) return { ok: false, error: "Enter a valid email." };
  const pdf = kind.readPdf(root, row);
  if (!pdf) return { ok: false, error: "PDF is missing. Save the NOC first." };
  const who = String(name || row?.sign?.name || row?.owner_name || row?.data?.ownerName || "").trim();
  const token = crypto.randomBytes(20).toString("hex");
  const url = `${String(origin || "").replace(/\/$/, "")}/noc-sign/${token}`;
  const sent = await sendMail({
    to,
    subject: `${kind.label} - please sign and send back`,
    body: nocEmailBody(who, kind.label, row.title, url),
    pdf,
    pdfName: row.pdf_name || "noc.pdf",
  });
  if (!sent.ok) return { ok: false, error: sent.error || "Could not send the email." };
  const sign = {
    ...normalizeNocSign(row?.sign),
    email: to,
    phone: String(row?.sign?.phone || "").trim(),
    name: who,
    token,
    sent_at: new Date().toISOString(),
    viewed_at: "",
    signed_at: "",
    signed_name: "",
    expires_at: new Date(Date.now() + NOC_SIGN_DAYS * 864e5).toISOString(),
  };
  const saved = kind.write(root, {
    ...row,
    sign,
    updated_at: Math.floor(Date.now() / 1000),
  });
  return { ok: true, mailed: to, item: kind.view(saved) };
}

export function nocWhatsappText(name, label, title, signUrl, pdfUrl) {
  const who = name || "there";
  const doc = title ? `${label} (${title})` : label;
  return [
    `Hello ${who}, A7 Group Real Estate has prepared a ${doc} for your property.`,
    `1) Open the PDF and verify it: ${pdfUrl}`,
    `2) Then sign and press Send back: ${signUrl}`,
  ].join(" ");
}

export function whatsappNocForSign(root, kind, row, { phone, name, origin } = {}) {
  if (row?.sign?.signed_at) return { ok: false, error: "This NOC is already signed." };
  const digits = phoneDigits(phone || row?.sign?.phone);
  if (!digits) return { ok: false, error: "Enter a WhatsApp number." };
  const pdf = kind.readPdf(root, row);
  if (!pdf) return { ok: false, error: "PDF is missing. Save the NOC first." };
  const who = String(name || row?.sign?.name || row?.owner_name || row?.data?.ownerName || "").trim();
  const token = crypto.randomBytes(20).toString("hex");
  const base = String(origin || "").replace(/\/$/, "");
  const url = `${base}/noc-sign/${token}`;
  const pdfUrl = `${url}/pdf`;
  const sign = {
    ...normalizeNocSign(row?.sign),
    phone: digits,
    name: who,
    token,
    sent_at: new Date().toISOString(),
    viewed_at: "",
    signed_at: "",
    signed_name: "",
    expires_at: new Date(Date.now() + NOC_SIGN_DAYS * 864e5).toISOString(),
  };
  const saved = kind.write(root, {
    ...row,
    sign,
    updated_at: Math.floor(Date.now() / 1000),
  });
  const view = kind.view(saved);
  return {
    ok: true,
    waMe: `https://wa.me/${digits}?text=${encodeURIComponent(nocWhatsappText(who, kind.label, saved.title, url, pdfUrl))}`,
    item: view,
    download: view.download,
    pdfName: saved.pdf_name || "noc.pdf",
  };
}
