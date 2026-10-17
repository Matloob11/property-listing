// Tenancy Contract tool: same behaviour as the Bitrix /tenancy/ page.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { tenancyPdf } from "./tenancyPdf.js";
import { listChequeReceipts } from "./tenancyChequeReceipt.js";
import { commissionVatMode } from "./tenancyCheques.js";
import { normalizeTermPack, resolveTenancyTerms } from "./tenancyTerms.js";

const SIGN_DAYS = 30;

export const STAGES = [
  { id: "draft", label: "Draft" },
  { id: "review", label: "Under review" },
  { id: "sent", label: "Sent" },
  { id: "partial", label: "Partially signed" },
  { id: "signed", label: "Signed" },
];

export function normalizeStage(stage) {
  const s = String(stage || "").toLowerCase().trim();
  if (["sign", "draft", "new", "uploaded", "ready", ""].includes(s)) return "draft";
  if (["review", "processing", "under_review", "human_review"].includes(s)) return "review";
  if (["owner_contract", "tenant_contract", "sent", "signing"].includes(s)) return "sent";
  if (["partial", "semisigned", "partially_signed"].includes(s)) return "partial";
  if (["signed", "done"].includes(s)) return "signed";
  return s;
}

export function isKnownStage(stage) {
  return STAGES.some((item) => item.id === normalizeStage(stage));
}

export function stageLabel(stage) {
  return STAGES.find((item) => item.id === normalizeStage(stage))?.label || String(stage);
}

const FORM_KEYS = [
  "tenantId", "tenantEntity", "landlordId", "unitId", "listingId", "template",
  "tenantName", "tenantEmail", "tenantPhone",
  "landlordName", "landlordEmail", "landlordPhone",
  "usage", "location", "building", "propertyNo", "propertyType", "size", "plotNo", "dewaNo", "termsPack",
  "contractDate", "dateFrom", "dateTo", "annualRent", "contractValue", "deposit", "commission", "commissionVat", "ejariFee", "paymentMode",
];

function addOneYear(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return "";
  const end = new Date(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3]));
  end.setDate(end.getDate() - 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

// Same defaults as tenancy_normalize() in the Bitrix tool.
export function normalizeForm(input) {
  const data = {};
  for (const key of FORM_KEYS) data[key] = String(input?.[key] ?? "").trim();
  if (!data.landlordName) data.landlordName = String(input?.ownerName || "").trim();
  data.commissionVat = commissionVatMode(data.commissionVat);
  data.terms = resolveTenancyTerms(input?.terms);
  data.termsPack = normalizeTermPack(data.termsPack || input?.termsPack);
  if (data.template === "") data.template = "ejari";
  if (data.usage === "") data.usage = "Commercial";
  if (data.propertyType === "") data.propertyType = "Shop";
  if (data.paymentMode === "") data.paymentMode = "04 cheques";
  if (data.dateFrom === "" && data.contractDate !== "") data.dateFrom = data.contractDate;
  if (data.dateTo === "" && data.dateFrom !== "") data.dateTo = addOneYear(data.dateFrom);
  if (data.contractValue === "") data.contractValue = data.annualRent;
  if (data.deposit === "") {
    const base = Number(String(data.contractValue !== "" ? data.contractValue : data.annualRent).replace(/[^\d.]/g, ""));
    if (base > 0) data.deposit = String(Math.round(base * 0.05 * 100) / 100);
  }
  return data;
}

export function missingDetails(data) {
  if (!data.tenantName) return "Please fill tenantName.";
  if (!data.landlordName) return "Please fill landlordName.";
  if (!data.dateFrom) return "Please fill dateFrom.";
  if (!data.dateTo) return "Please fill dateTo.";
  if (!data.annualRent) return "Please fill annualRent.";
  return "";
}

export function pdfFilename(data) {
  const bits = ["Tenancy"];
  for (const key of ["propertyNo", "tenantName", "dateFrom"]) {
    const part = String(data[key] || "").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

export function phoneDigits(phone) {
  let d = String(phone || "").replace(/\D+/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 10) d = `971${d.slice(1)}`;
  if (d.length === 9 && d.startsWith("5")) d = `971${d}`;
  return d.length >= 8 ? d : "";
}

export function whatsappText(party, data, signUrl = "") {
  const name = party === "owner" ? data.landlordName || "Owner" : data.tenantName || "Tenant";
  const unit = data.propertyNo || data.building || "the property";
  const link = signUrl
    ? ` Open the contract from A7 Group, read the PDF, draw your signature at the bottom, then press Send back: ${signUrl}`
    : " Please review the PDF I am sending and sign.";
  return `Hello ${name}, A7 Group Real Estate (broker) has prepared the tenancy contract for ${unit}.${link}`;
}

export function emailBody(name, role, title, signUrl = "", extra = {}) {
  const who = name || role;
  const prior = extra.alreadySignedBy
      ? `The ${extra.alreadySignedBy} has already signed. Open the contract, check their signature on the PDF, then draw yours at the bottom and press Send back.\n\n`
      : "";
  const signBlock = signUrl
    ? `This is the tenancy contract from A7 Group Real Estate. Open it, read the PDF pages, draw your signature at the bottom, then press Send back. The signed PDF will return to our Tenancy Contract list automatically.\n\n${signUrl}\n\nA copy is also attached for your records.\n`
    : "The filled PDF is attached. Please review and sign.\n";
  return `Hello ${who},\n\nA7 Group Real Estate (broker) has prepared a tenancy contract (${title || "the property"}).\n${prior}${signBlock}\nA7 Group Real Estate\nDubai\n`;
}

function strSigner(value) {
  return String(value ?? "").trim();
}

export function normalizeTenancySigner(input = {}) {
  const role = input.role === "owner" ? "owner" : "tenant";
  return {
    role,
    label: role === "owner" ? "Owner" : "Tenant",
    name: strSigner(input.name),
    email: strSigner(input.email),
    phone: strSigner(input.phone),
    token: strSigner(input.token),
    expires_at: strSigner(input.expires_at),
    sent_at: strSigner(input.sent_at),
    viewed_at: strSigner(input.viewed_at),
    signed_at: strSigner(input.signed_at),
    signed_name: strSigner(input.signed_name),
    signature: strSigner(input.signature),
    ip: strSigner(input.ip),
    user_agent: strSigner(input.user_agent).slice(0, 200),
  };
}

export function tenancySigners(row) {
  const list = Array.isArray(row?.data?.signers) ? row.data.signers : [];
  return list.map((item) => normalizeTenancySigner(item));
}

export function preserveTenancySigners(existing, nextFields) {
  return tenancySigners(existing).map((signer) => {
    if (signer.signed_at) return signer;
    if (signer.role === "owner") {
      return normalizeTenancySigner({
        ...signer,
        name: nextFields.owner_name || signer.name,
        email: nextFields.owner_email || signer.email,
        phone: nextFields.owner_phone || signer.phone,
      });
    }
    return normalizeTenancySigner({
      ...signer,
      name: nextFields.tenant_name || signer.name,
      email: nextFields.tenant_email || signer.email,
      phone: nextFields.tenant_phone || signer.phone,
    });
  });
}

export function issueTenancySignTokens(row, party) {
  const want = party === "both" ? ["tenant", "owner"] : [party === "owner" ? "owner" : "tenant"];
  const prev = Object.fromEntries(tenancySigners(row).map((signer) => [signer.role, signer]));
  const expires = new Date(Date.now() + SIGN_DAYS * 86400000).toISOString();
  const now = new Date().toISOString();

  function person(role) {
    const old = prev[role] || {};
    const next = {
      ...old,
      role,
      name: role === "owner" ? row.owner_name : row.tenant_name,
      email: role === "owner" ? row.owner_email : row.tenant_email,
      phone: role === "owner" ? row.owner_phone : row.tenant_phone,
    };
    if (want.includes(role) && !next.signed_at) {
      next.token = next.token || crypto.randomBytes(20).toString("hex");
      next.expires_at = expires;
      next.sent_at = now;
    }
    return normalizeTenancySigner(next);
  }

  const list = [];
  if (row.tenant_name || row.tenant_email || prev.tenant) list.push(person("tenant"));
  if (row.owner_name || row.owner_email || prev.owner) list.push(person("owner"));
  return list;
}

export function expectedTenancySigners(signers) {
  return (signers || []).filter((signer) => signer.signed_at || signer.email || signer.token || signer.sent_at);
}

export function tenancyPartySigned(signers, role) {
  return (signers || []).some((signer) => signer.role === role && Boolean(signer.signed_at));
}

export function bothTenancyPartiesSigned(signers) {
  return tenancyPartySigned(signers, "tenant") && tenancyPartySigned(signers, "owner");
}

export function tenancyStageFromSigners(signers, fallback = "sent") {
  if (bothTenancyPartiesSigned(signers)) return "signed";
  if (tenancyPartySigned(signers, "tenant") || tenancyPartySigned(signers, "owner")) return "partial";
  const parties = expectedTenancySigners(signers);
  if (parties.some((signer) => signer.token || signer.sent_at)) return "sent";
  return fallback;
}

export function canInviteTenancyParty(signers, party) {
  const role = party === "owner" ? "owner" : "tenant";
  const waiting = (signers || []).find((signer) => signer.role !== role && signer.sent_at && !signer.signed_at);
  if (!waiting) return { ok: true };
  const next = role === "owner" ? "owner" : "tenant";
  return {
    ok: false,
    error: `Wait until the ${waiting.label.toLowerCase()} signs. The ${next} is emailed automatically after that.`,
  };
}

export function nextUnsignedTenancyParty(signers) {
  return (signers || []).find((signer) => !signer.signed_at && signer.email) || null;
}

export function firstTenancyEmailParty(row) {
  if (String(row?.tenant_email || "").trim()) return "tenant";
  if (String(row?.owner_email || "").trim()) return "owner";
  return "";
}

export function tenancyContractPdf(row) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  if (data.annualRent || data.dateFrom || data.tenantName || data.landlordName) {
    try {
      return signedTenancyPdf(row);
    } catch {
      /* fall back to the stored file */
    }
  }
  return readFileSafe(row?.pdf_path);
}

export function prepareTenancyInvite(row, party, origin, extra = {}) {
  const role = party === "owner" ? "owner" : "tenant";
  const gate = canInviteTenancyParty(tenancySigners(row), role);
  if (!gate.ok) return gate;
  const to = String((role === "owner" ? row.owner_email : row.tenant_email) || "").trim();
  const name = role === "owner" ? row.owner_name : row.tenant_name;
  if (!to) return { ok: false, error: `Add the ${role} email below, then try again.` };
  const signers = issueTenancySignTokens(row, role);
  const signer = signers.find((item) => item.role === role);
  const signUrl = signer?.token ? `${String(origin || "").replace(/\/$/, "")}/tc-sign/${signer.token}` : "";
  const patched = { ...row, data: { ...(row.data || {}), signers } };
  const already = signers.find((item) => item.signed_at);
  const pdf = tenancyContractPdf(patched);
  if (!pdf) return { ok: false, error: "PDF is missing. Fill the form again." };
  return {
    ok: true,
    signers,
    signer,
    to,
    name,
    party: role,
    signUrl,
    pdf,
    pdfName: already ? row.signed_name || "tenancy-signed.pdf" : row.pdf_name || "tenancy-contract.pdf",
    subject: already
      ? "Tenancy contract - please review the signature and sign"
      : "Tenancy contract - sign and send back",
    body: emailBody(name, role, row.title, signUrl, {
      alreadySignedBy: extra.alreadySignedBy || (already ? already.label.toLowerCase() : ""),
    }),
    stage: tenancyStageFromSigners(signers, "sent"),
  };
}

export function findTenancySigner(rows, token) {
  const key = String(token || "").trim();
  if (key.length < 20) return null;
  for (const row of rows) {
    const signers = tenancySigners(row);
    const signer = signers.find((item) => item.token && item.token === key);
    if (signer) return { row, signer, signers };
  }
  return null;
}

export function tenancySignSummary(row) {
  const data = row.data || {};
  return [
    ["Contract", row.title],
    ["Tenant", row.tenant_name],
    ["Owner", row.owner_name],
    ["Property", [data.propertyNo, data.building, data.location].filter(Boolean).join(", ")],
    ["Period", data.dateFrom || data.dateTo ? `${data.dateFrom || "—"} to ${data.dateTo || "—"}` : ""],
    ["Annual rent", data.annualRent ? `AED ${data.annualRent}` : ""],
  ].filter(([, value]) => value);
}

export function signedTenancyPdf(row) {
  const data = row.data && typeof row.data === "object" ? { ...row.data } : {};
  delete data.signers;
  data.tenantName = String(data.tenantName || row.tenant_name || "").trim();
  data.landlordName = String(data.landlordName || data.ownerName || row.owner_name || "").trim();
  data.tenantEmail = String(data.tenantEmail || row.tenant_email || "").trim();
  data.landlordEmail = String(data.landlordEmail || row.owner_email || "").trim();
  data.tenantPhone = String(data.tenantPhone || row.tenant_phone || "").trim();
  data.landlordPhone = String(data.landlordPhone || row.owner_phone || "").trim();
  return tenancyPdf(data, tenancySigners(row));
}

export function newTrackId() {
  return `tc-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString("hex")}`;
}

export function normalizeTenancy(input) {
  return {
    id: String(input.id || newTrackId()),
    title: String(input.title || "Tenancy contract"),
    stage: normalizeStage(input.stage),
    template: String(input.template || "ejari"),
    send_to: String(input.send_to || "whatsapp"),
    owner_name: String(input.owner_name || ""),
    tenant_name: String(input.tenant_name || ""),
    owner_email: String(input.owner_email || ""),
    tenant_email: String(input.tenant_email || ""),
    owner_phone: String(input.owner_phone || ""),
    tenant_phone: String(input.tenant_phone || ""),
    pdf_name: String(input.pdf_name || ""),
    pdf_path: String(input.pdf_path || ""),
    signed_name: String(input.signed_name || ""),
    signed_path: String(input.signed_path || ""),
    listing_id: String(input.listing_id || ""),
    contract_id: String(input.contract_id || ""),
    created_by: String(input.created_by || ""),
    created_at: Number(input.created_at || Math.floor(Date.now() / 1000)),
    updated_at: Number(input.updated_at || Math.floor(Date.now() / 1000)),
    data: input.data && typeof input.data === "object" ? input.data : {},
    history: Array.isArray(input.history) ? input.history.slice(-100) : [],
  };
}

export function tenancyDir(root) {
  const dir = path.join(root, "data", "tenancy");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function tenancyPhotoDir(root) {
  const dir = path.join(root, "data", "tenancy", "photos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function removeTenancyPhotoFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* keep going — row can still be deleted */
  }
}

export function storeTenancyPhotoFile(root, id, mime, data) {
  const type = String(mime || "image/jpeg").toLowerCase();
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const file_name = `${id}.${ext}`;
  const file_path = path.join(tenancyPhotoDir(root), file_name);
  fs.writeFileSync(file_path, Buffer.from(String(data || ""), "base64"));
  return { file_name, file_path, mime: type };
}

export function photoView(row) {
  return {
    id: row.id,
    tenancyId: row.tenancy_id || "",
    name: row.original_name || row.file_name || "Photo",
    mime: row.mime,
    url: `/api/tenancy/photo/${encodeURIComponent(row.id)}`,
    agentName: row.agent_name || "",
    fields: row.fields && typeof row.fields === "object" ? row.fields : {},
    createdAt: row.created_at,
  };
}

export function buildTenancyPdf(data) {
  return tenancyPdf(data);
}

export function storePdf(root, id, buffer, suffix = "") {
  const dir = tenancyDir(root);
  const file = path.join(dir, `${id}${suffix}.pdf`);
  fs.writeFileSync(file, buffer);
  return file;
}

export function storeSigned(root, id, buffer, ext) {
  const dir = tenancyDir(root);
  const safeExt = ["pdf", "jpg", "jpeg", "png"].includes(ext) ? ext : "pdf";
  const file = path.join(dir, `${id}-signed.${safeExt}`);
  fs.writeFileSync(file, buffer);
  return file;
}

export function readFileSafe(file) {
  try {
    return file && fs.existsSync(file) ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

export function rowView(row, options = {}) {
  const includeSignatures = Boolean(options.includeSignatures);
  const stage = tenancyStageFromSigners(tenancySigners(row), row.stage);
  return {
    id: row.id,
    source: "form",
    title: row.title,
    stage,
    stageLabel: stageLabel(stage),
    ownerName: row.owner_name,
    tenantName: row.tenant_name,
    ownerEmail: row.owner_email,
    tenantEmail: row.tenant_email,
    ownerPhone: row.owner_phone,
    tenantPhone: row.tenant_phone,
    pdfName: row.pdf_name,
    download: row.pdf_path ? `/api/tenancy/download?id=${encodeURIComponent(row.id)}${row.stage === "signed" && row.signed_path ? "&signed=1" : ""}` : "",
    signedDownload: row.signed_path ? `/api/tenancy/download?id=${encodeURIComponent(row.id)}&signed=1` : "",
    signedName: row.signed_name,
    hasSigned: Boolean(row.signed_path),
    signers: tenancySigners(row).map(({ signature, token, ...rest }) => ({
      ...rest,
      signed: Boolean(rest.signed_at),
      ...(includeSignatures && signature ? { signature } : {}),
    })),
    listingId: row.listing_id,
    contractId: row.contract_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: (() => {
      const { signers: _signers, chequeReceipts: _receipts, ...form } =
        row.data && typeof row.data === "object" ? row.data : {};
      return form;
    })(),
    chequeReceipts: listChequeReceipts(row),
    history: row.history,
  };
}
