import { useEffect, useMemo, useRef, useState } from "react";
import { CrmTypeahead } from "./CrmTypeahead.jsx";
import { downloadFile } from "./downloadFile.js";
import { chequeSchedule, commissionBreakdown, formatAed } from "../../server/tenancyCheques.js";
import { PHOTO_SECTION_KEYS, applyRelatedFields, keepUserValue } from "../../server/tenancyPhotoFields.js";
import {
  DEFAULT_TENANCY_TERMS,
  MAX_TENANCY_TERMS,
  formTenancyTerms,
  isStockTerms,
  packFromPropertyType,
  termsForPack,
} from "../../server/tenancyTerms.js";
import {
  compactPropertyFields,
  defaultTypeForUsage,
  findListingForUnit,
  inferPropertyType,
  listingSearchQueries,
  placeName,
  prettyPropertyType,
  propertyFieldsFromListing,
  propertyFieldsFromUnit,
  typesForUsage,
  usageFitsType,
  usageFromListing,
  usageFromPropertyType,
} from "../../server/tenancyProperty.js";
import { usePersistedState } from "./uiPersist.js";

// Clone of the Bitrix "Tenancy Contract" tool (/tenancy/): 1. Details, 2. Terms, 3. Template, 4. Send,
// plus the contract board (Draft / Under review / Sent / Partially signed / Signed).

const CRM_FAIL = "Could not load Bitrix CRM. Type the name in the boxes below.";

const EMPTY = {
  id: "",
  tenantId: "",
  tenantEntity: "",
  landlordId: "",
  unitId: "",
  listingId: "",
  tenantName: "",
  tenantEmail: "",
  tenantPhone: "",
  landlordName: "",
  landlordEmail: "",
  landlordPhone: "",
  usage: "Commercial",
  location: "",
  building: "",
  propertyNo: "",
  propertyType: "Shop",
  size: "",
  plotNo: "",
  dewaNo: "",
  contractDate: new Date().toISOString().slice(0, 10),
  dateFrom: "",
  dateTo: "",
  annualRent: "",
  contractValue: "",
  deposit: "",
  commission: "",
  commissionVat: "",
  ejariFee: "",
  paymentMode: "04 cheques",
  template: "ejari",
  termsPack: "",
  terms: [...DEFAULT_TENANCY_TERMS],
};

const EMPTY_SECTION_PHOTO_IDS = { tenant: "", owner: "", property: "", rent: "" };
const EMPTY_SECTION_PHOTO_FIELDS = { tenant: {}, owner: {}, property: {}, rent: {} };

const NO_RELATED_TITLE = "No related information";
const NO_RELATED_TEXT = "This document has no related tenancy details, so the form was not filled.";

function isNoRelatedExtract(error) {
  return /no matching tenancy fields|no related/i.test(String(error || ""));
}

function NoticeDialog({ title, text, onClose }) {
  const okRef = useRef(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="tc-notice" role="dialog" aria-modal="true" aria-labelledby="tc-notice-title" onClick={onClose}>
      <div className="tc-notice-card" onClick={(event) => event.stopPropagation()}>
        <h3 id="tc-notice-title">{title}</h3>
        <p>{text}</p>
        <button ref={okRef} type="button" className="ui-btn ui-btn-primary" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

function listingPickLabel(row) {
  const type = inferPropertyType(row?.type) || prettyPropertyType(row?.type) || "";
  const usage = usageFromListing(row);
  return {
    title: [row?.reference, type, row?.unit_no || row?.title].filter(Boolean).join(" · "),
    usage,
  };
}

function PropertyPick({ listings, onPickListing, onPickUnit, onClear, badge }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [listingHits, setListingHits] = useState([]);
  const [units, setUnits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (picked || !open) return undefined;
    const needle = q.trim().toLowerCase();
    const local = (listings || []).filter((row) => {
      if (!needle) return true;
      return [row.reference, row.title, row.unit_no, row.building, row.community, row.type, row.category]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    setListingHits(local.slice(0, 20));
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const [listBody, crm] = await Promise.all([
          needle
            ? fetch(`/api/listings?q=${encodeURIComponent(q.trim())}&pageSize=20&status=all`, { credentials: "same-origin" })
                .then((res) => res.json())
                .catch(() => ({}))
            : Promise.resolve({ listings: local.slice(0, 20) }),
          fetch(`/api/crm/search?${new URLSearchParams({ entities: "unit", q: q.trim() })}`, { credentials: "same-origin" })
            .then((res) => res.json())
            .catch(() => ({})),
        ]);
        if (cancelled) return;
        const remote = Array.isArray(listBody.listings) ? listBody.listings : [];
        const merged = [...remote, ...local].filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index);
        setListingHits(merged.slice(0, 20));
        setUnits(Array.isArray(crm.items) ? crm.items : []);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, needle ? 220 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open, picked, listings]);

  function clearPick() {
    setPicked(null);
    setQ("");
    setUnits([]);
    onClear?.();
  }

  if (picked) {
    return (
      <div className="tc-picker">
        <div className="tc-tag">
          <span>
            {picked.title} <small>({picked.kind})</small>
          </span>
          <button type="button" aria-label="Remove" onClick={clearPick}>
            ×
          </button>
        </div>
        {badge ? <small className={badge.found ? "ok" : "warn"}>{badge.message}</small> : null}
      </div>
    );
  }

  const list = open ? (
    <ul className="tc-picker-list">
      {busy && !listingHits.length && !units.length ? <li className="tc-picker-note">Loading…</li> : null}
      {listingHits.length ? <li className="tc-picker-note">Desk listings</li> : null}
      {listingHits.map((row) => {
        const label = listingPickLabel(row);
        return (
          <li key={`listing-${row.id}`}>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setPicked({ title: label.title, kind: label.usage || "listing" });
                setOpen(false);
                onPickListing(row);
              }}
            >
              {label.title}
              <small>{label.usage || "listing"}</small>
            </button>
          </li>
        );
      })}
      {units.length ? <li className="tc-picker-note">Bitrix units</li> : null}
      {units.map((item) => (
        <li key={`unit-${item.id}`}>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setPicked({ title: item.title, kind: "unit" });
              setOpen(false);
              onPickUnit(item);
            }}
          >
            {item.title}
            <small>unit</small>
          </button>
        </li>
      ))}
      {!busy && !listingHits.length && !units.length ? (
        <li className="tc-picker-note">Type a listing, unit, building, or owner name.</li>
      ) : null}
    </ul>
  ) : null;

  return (
    <div className="tc-picker">
      <div className={`tc-selector${open ? " open" : ""}`} onClick={() => !open && setOpen(true)}>
        {open ? (
          <input
            ref={inputRef}
            value={q}
            placeholder="Type listing, unit, building, or owner name…"
            autoComplete="off"
            onChange={(event) => {
              setQ(event.target.value);
              setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
          />
        ) : (
          <button type="button" className="tc-add">
            + Add
          </button>
        )}
      </div>
      {badge ? <small className={badge.found ? "ok" : "warn"}>{badge.message}</small> : null}
      {list}
    </div>
  );
}

function PhotoUploadSlot({ section, busy, canClear, onOpen, onClear }) {
  const reading = busy === section;
  return (
    <div className="tc-photo-slot">
      <button
        type="button"
        className="ui-btn ui-btn-primary"
        disabled={Boolean(busy)}
        aria-label={`Upload ${section} photo or PDF`}
        onClick={() => onOpen(section)}
      >
        {reading ? "Reading…" : "Upload photo or PDF"}
      </button>
      <button
        type="button"
        className="ui-btn ui-btn-light"
        disabled={Boolean(busy) || !canClear}
        aria-label={`Clear ${section} uploaded details`}
        onClick={() => onClear(section)}
      >
        Clear details
      </button>
    </div>
  );
}

function fileKind(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/^image\/(jpeg|jpg|png|webp)$/.test(type) || /\.(jpe?g|png|webp)$/.test(name)) return "image";
  return "";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

let pdfJsLoading = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfJsLoading) return pdfJsLoading;
  pdfJsLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      const lib = window.pdfjsLib;
      if (!lib) {
        reject(new Error("PDF reader did not load."));
        return;
      }
      lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(lib);
    };
    script.onerror = () => reject(new Error("Could not load the PDF reader."));
    document.head.appendChild(script);
  }).catch((error) => {
    pdfJsLoading = null;
    throw error;
  });
  return pdfJsLoading;
}

async function fileToExtractImage(file) {
  const kind = fileKind(file);
  if (kind === "pdf") {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.86), mime: "image/jpeg" };
  }
  if (kind !== "image") throw new Error("Use a JPG, PNG, WEBP, or PDF.");
  return { dataUrl: await readAsDataUrl(file), mime: /^image\//.test(file.type) ? file.type : "image/jpeg" };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function addOneYearTo(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!m) return "";
  const end = new Date(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3]));
  end.setDate(end.getDate() - 1);
  return `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
}

function moneyNumber(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function esc(value) {
  return String(value || "");
}

function when(ts) {
  if (!ts) return "";
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

async function loadBx24() {
  if (window.BX24) return window.BX24;
  await new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://api.bitrix24.com/api/v1/";
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
  return window.BX24 || null;
}

function personName(row) {
  return [row?.NAME, row?.SECOND_NAME, row?.LAST_NAME].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function firstValue(list) {
  if (!Array.isArray(list)) return "";
  const item = list.find((entry) => entry && entry.VALUE);
  return item ? String(item.VALUE) : "";
}

async function notifyMatloobOnBitrix(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  try {
    const rows =
      (await bxCall("user.search", { FILTER: { NAME: "Matloob" } }).catch(() => [])) ||
      [];
    const list = Array.isArray(rows) ? rows : [];
    const person =
      list.find((row) => /hasnain|hassnain/i.test(personName(row))) ||
      list.find((row) => /matloob/i.test(personName(row)));
    if (!person?.ID) return false;
    const tries = [
      ["im.notify.personal.add", { USER_ID: Number(person.ID), MESSAGE: text, TAG: "openai-front-key" }],
      ["im.notify.system.add", { USER_ID: Number(person.ID), MESSAGE: text }],
      ["im.message.add", { DIALOG_ID: String(person.ID), MESSAGE: text }],
    ];
    for (const [method, params] of tries) {
      try {
        await bxCall(method, params);
        return true;
      } catch {
        /* try next Bitrix notify method */
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function bxCall(method, params) {
  const bx = await loadBx24();
  if (!bx) throw new Error("Open this page from Bitrix24.");
  await new Promise((resolve) => {
    try {
      bx.init(() => resolve());
    } catch {
      resolve();
    }
  });
  return new Promise((resolve, reject) => {
    bx.callMethod(method, params || {}, (result) => {
      try {
        if (result.error()) {
          const desc = typeof result.error_description === "function" ? result.error_description() : "";
          reject(new Error(desc || String(result.error())));
          return;
        }
        resolve(result.data());
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function lookupEntityBx(entity, id) {
  try {
    const json = await api("/api/tenancy/lookup", { entity, id });
    if (json?.ok && json.found && json.data) return json.data;
    if (json?.ok && json.found === false) return null;
  } catch {
    /* fall through to live Bitrix */
  }
  return lookupEntityBxLive(entity, id);
}

async function lookupEntityBxLive(entity, id) {
  const numericId = Number(id || 0);
  if (!numericId) return null;
  if (entity === "contact") {
    const row = await bxCall("crm.contact.get", { id: numericId });
    if (!row) return null;
    const name = personName(row);
    return {
      id: numericId,
      name,
      email: firstValue(row.EMAIL),
      phone: firstValue(row.PHONE),
      emails: (row.EMAIL || []).map((item) => item.VALUE),
      phones: (row.PHONE || []).map((item) => item.VALUE),
      duplicates: [],
    };
  }
  if (entity === "company") {
    const row = await bxCall("crm.company.get", { id: numericId });
    if (!row) return null;
    return { id: numericId, name: String(row.TITLE || ""), email: firstValue(row.EMAIL), phone: firstValue(row.PHONE) };
  }
  if (entity === "lead") {
    const row = await bxCall("crm.lead.get", { id: numericId });
    if (!row) return null;
    return { id: numericId, name: String(row.TITLE || personName(row)), email: firstValue(row.EMAIL), phone: firstValue(row.PHONE) };
  }
  if (entity === "unit" || /1112/.test(String(entity))) {
    const result = await bxCall("crm.item.get", { entityTypeId: 1112, id: numericId });
    const item = result?.item || result;
    if (!item) return null;
    const get = (a, b) => String(item[a] ?? item[b] ?? "");
    const buildingId = Number(item.ufCrm21_1761836766 ?? item.UF_CRM_21_1761836766 ?? 0);
    const locationId = Number(item.ufCrm21_1760535808 ?? item.UF_CRM_21_1760535808 ?? 0);
    const communityId = Number(item.ufCrm21_1761836312 ?? item.UF_CRM_21_1761836312 ?? 0);
    const [building, location, community] = await Promise.all([
      buildingId
        ? bxCall("crm.item.get", { entityTypeId: 1082, id: buildingId })
            .then((row) => String(row?.item?.title || row?.title || ""))
            .catch(() => "")
        : "",
      locationId
        ? bxCall("crm.item.get", { entityTypeId: 1050, id: locationId })
            .then((row) => String(row?.item?.title || row?.title || ""))
            .catch(() => "")
        : "",
      communityId
        ? bxCall("crm.item.get", { entityTypeId: 1058, id: communityId })
            .then((row) => String(row?.item?.title || row?.title || ""))
            .catch(() => "")
        : "",
    ]);
    return {
      id: numericId,
      title: String(item.title || ""),
      unitNo: get("ufCrm21_1761837638901", "UF_CRM_21_1761837638901"),
      ownerName: `${get("ufCrm21_1758009535002", "UF_CRM_21_1758009535002")} ${get("ufCrm21_1758009542122", "UF_CRM_21_1758009542122")}`.trim(),
      ownerPhone: get("ufCrm21_1758009551211", "UF_CRM_21_1758009551211"),
      ownerEmail: get("ufCrm21_1758009557723", "UF_CRM_21_1758009557723"),
      building: placeName(building) || placeName(get("ufCrm21_1761837785108", "UF_CRM_21_1761837785108")),
      location: placeName(location) || placeName(community) || placeName(get("ufCrm21_1761837766987", "UF_CRM_21_1761837766987")) || placeName(get("ufCrm21_1760681070808", "UF_CRM_21_1760681070808")),
      community: placeName(community),
      plotNo: get("ufCrm21_1760537872927", "UF_CRM_21_1760537872927"),
      size: get("ufCrm21_1761836951413", "UF_CRM_21_1761836951413"),
    };
  }
  return null;
}

// Gets a fresh portal token from Bitrix and stores it in our session.
async function refreshBitrixToken() {
  const bx = await loadBx24();
  if (!bx) return false;
  const auth = await new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value || null);
    };
    try {
      bx.init(() => {
        try {
          if (typeof bx.refreshAuth === "function") {
            bx.refreshAuth((fresh) => finish(fresh || bx.getAuth()));
          } else {
            finish(bx.getAuth());
          }
        } catch {
          finish(bx.getAuth());
        }
      });
    } catch {
      finish(bx.getAuth && bx.getAuth());
    }
    setTimeout(() => finish(bx.getAuth && bx.getAuth()), 8000);
  });
  const token = auth?.access_token || auth?.AUTH_ID;
  if (!token) return false;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ AUTH_ID: token, DOMAIN: auth.domain || auth.DOMAIN }),
  });
  return res.ok;
}

async function api(path, body, retry = true) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }));
  if (res.status === 401 && json.code === "bitrix_token") {
    if (retry) {
      const refreshed = await refreshBitrixToken();
      if (refreshed) return api(path, body, false);
    }
    return { ok: false, error: CRM_FAIL };
  }
  return json;
}

function triggerDownload(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "tenancy-contract.pdf";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this photo."));
    image.src = url;
  });
}

function isChequePdf(file) {
  return String(file?.type || "").toLowerCase() === "application/pdf" || /\.pdf$/i.test(String(file?.name || ""));
}

function readChequeFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

async function chequeProofImage(file, crop) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    if (crop === "full") {
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d").drawImage(image, 0, 0);
    } else {
      const y = Math.floor(image.height * 0.58);
      const height = Math.max(1, image.height - y);
      canvas.width = image.width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, y, image.width, height, 0, 0, image.width, height);
    }
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function receiptWhen(value) {
  return value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) : "";
}

function receiptLine(row) {
  const cheque = row.particular || "Cheque";
  if (row.status === "pending") {
    return `Waiting for owner · emailed ${row.ownerEmail} · ${cheque}${row.sentAt ? ` · ${receiptWhen(row.sentAt)}` : ""}`;
  }
  if (row.status === "verified") {
    const tenant = row.tenantSentAt
      ? `tenant emailed ${row.tenantEmail}`
      : "owner verified, tenant email not sent yet";
    const note = row.note ? ` · “${String(row.note).slice(0, 80)}”` : "";
    return `Verified · ${tenant}${note} · ${cheque}`;
  }
  return `Sent ${receiptWhen(row.sentAt)} to ${row.tenantEmail || row.to}${row.particular ? ` · ${row.particular}` : ""}`;
}

function ChequeReceivedBlock({ item, onSent }) {
  const cheques = chequeSchedule({ ...(item.data || {}), dateFrom: item.data?.dateFrom || item.data?.contractDate }).rows;
  const [ownerEmail, setOwnerEmail] = useState(item.ownerEmail || "");
  const [tenantEmail, setTenantEmail] = useState(item.tenantEmail || "");
  const [chequeIndex, setChequeIndex] = useState(0);
  const [crop, setCrop] = useState("received");
  const [preview, setPreview] = useState("");
  const [previewKind, setPreviewKind] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const fileRef = useRef(null);
  const lastFile = useRef(null);
  const receipts = item.chequeReceipts || [];

  async function useFile(file, nextCrop = crop) {
    if (!file) return;
    lastFile.current = file;
    setBusy(true);
    setNote("");
    try {
      if (isChequePdf(file)) {
        setPreview(await readChequeFile(file));
        setPreviewKind("pdf");
        setCrop("full");
      } else {
        setPreview(await chequeProofImage(file, nextCrop));
        setPreviewKind("image");
      }
      setFileName(file.name);
    } catch (err) {
      setPreview("");
      setPreviewKind("");
      setNote(err instanceof Error ? err.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  }

  function changeCrop(next) {
    setCrop(next);
    if (lastFile.current && !isChequePdf(lastFile.current)) useFile(lastFile.current, next);
  }

  async function send() {
    if (!preview) {
      setNote("Upload the received cheque first.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(ownerEmail || "").trim())) {
      setNote("Type the owner email. They must verify first.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(tenantEmail || "").trim())) {
      setNote("Type the tenant email for the acknowledgment after the owner verifies.");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const json = await api("/api/tenancy/cheque-received", {
        id: item.id,
        ownerEmail,
        tenantEmail,
        chequeIndex,
        crop: previewKind === "pdf" ? "pdf" : crop,
        image: preview,
        mime: previewKind === "pdf" ? "application/pdf" : "image/jpeg",
      });
      if (!json?.ok) {
        setNote(json.error || "Could not ask the owner to verify.");
        return;
      }
      setPreview("");
      setPreviewKind("");
      setFileName("");
      setNote(`Owner verification emailed to ${json.mailed}. Tenant is emailed after the owner sends back.`);
      onSent?.(json.item);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tc-cheque-receipt">
      <b>Cheque received</b>
      <p>
        Upload a cheque photo or PDF. A7 emails the owner first. They must write that they received it and draw a signature.
        After they press Send back, A7 emails the tenant. Owner and tenant are not copied to each other.
      </p>
      {cheques.length ? (
        <label>
          Cheque
          <select value={chequeIndex} onChange={(e) => setChequeIndex(Number(e.target.value))}>
            {cheques.map((row, index) => (
              <option key={`${row.particular}-${index}`} value={index}>
                {row.particular} · {row.amount} · {row.date}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Owner email — verify first
        <input
          type="email"
          value={ownerEmail}
          placeholder="Owner email"
          autoComplete="off"
          onChange={(e) => setOwnerEmail(e.target.value)}
        />
      </label>
      <label>
        Tenant email — after owner sends back
        <input
          type="email"
          value={tenantEmail}
          placeholder="Tenant email"
          autoComplete="off"
          onChange={(e) => setTenantEmail(e.target.value)}
        />
      </label>
      <div className="tc-cheque-receipt-actions">
        <button type="button" onClick={() => fileRef.current?.click()}>
          {fileName ? "Change file" : "Upload cheque"}
        </button>
        {previewKind !== "pdf" ? (
          <>
            <button type="button" className={crop === "received" ? "is-on" : ""} onClick={() => changeCrop("received")}>
              Received area
            </button>
            <button type="button" className={crop === "full" ? "is-on" : ""} onClick={() => changeCrop("full")}>
              Full cheque
            </button>
          </>
        ) : null}
        <button type="button" disabled={busy} onClick={send}>
          {busy ? "Sending…" : "Ask owner to verify"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          useFile(file);
        }}
      />
      {preview && previewKind === "image" ? <img src={preview} alt="Received part that will be emailed" /> : null}
      {preview && previewKind === "pdf" ? <small>PDF ready: {fileName || "cheque.pdf"}</small> : null}
      {note ? <small>{note}</small> : null}
      {receipts.length ? (
        <ul>
          {receipts.map((row) => (
            <li key={row.id}>{receiptLine(row)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function cardLine(label, value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return (
    <small>
      <span className="tc-card-k">{label}</span> {text}
    </small>
  );
}

function signerImage(signer) {
  return signer?.signature && String(signer.signature).startsWith("data:image/") ? signer.signature : "";
}

function TenancyPdfView({ item, pdfUrl, kind, busy, err, onClose, onDownload, onEdit }) {
  const data = item.data || {};
  const tenant = (item.signers || []).find((signer) => signer.role !== "owner") || {};
  const owner = (item.signers || []).find((signer) => signer.role === "owner") || {};
  return (
    <div className="tc-pdf-view" role="dialog" aria-label="Tenancy contract PDF">
      <div className="tc-pdf-view-bar">
        <div>
          <b>{item.title}</b>
          <span>{item.stageLabel || item.stage}</span>
        </div>
        <div className="tc-pdf-view-actions">
          <button type="button" className="ui-btn ui-btn-sm ui-btn-light" disabled={busy} onClick={onDownload}>
            {busy ? "…" : "Download"}
          </button>
          <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => onEdit(item)}>
            Edit form
          </button>
          <button type="button" className="ui-btn ui-btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {err ? <p className="tc-status err">{err}</p> : null}
      {busy && !pdfUrl ? <p className="tc-hint">Opening the contract…</p> : null}
      <div className="tc-pdf-letter">
        {kind === "image" && pdfUrl ? <img className="tc-pdf-image" src={pdfUrl} alt={item.title} /> : null}
        {kind === "pdf" && pdfUrl ? (
          <object className="tc-pdf-embed" data={pdfUrl} type="application/pdf" aria-label={item.title}>
            <p className="tc-hint">Use Download if the PDF does not show here.</p>
          </object>
        ) : null}
        {kind !== "pdf" || !pdfUrl || err ? (
        <article className="tc-contract-sheet">
          <h2>Tenancy contract</h2>
          <p>{item.tenantName || "Tenant"} · {item.ownerName || "Owner"}</p>
          <dl>
            <div><dt>Property</dt><dd>{[data.propertyNo, data.building, data.location].filter(Boolean).join(" · ") || "—"}</dd></div>
            <div><dt>Period</dt><dd>{data.dateFrom || data.dateTo ? `${data.dateFrom || "—"} to ${data.dateTo || "—"}` : "—"}</dd></div>
            <div><dt>Annual rent</dt><dd>{data.annualRent ? `AED ${data.annualRent}` : "—"}</dd></div>
          </dl>
          <div className="tc-contract-signs">
            <div>
              <span>Tenant</span>
              {signerImage(tenant) ? <img src={signerImage(tenant)} alt="" /> : <em>{tenant.signed ? tenant.signed_name || tenant.name : "Not signed"}</em>}
              <small>{tenant.signed_at ? new Date(tenant.signed_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) : ""}</small>
            </div>
            <div>
              <span>Owner</span>
              {signerImage(owner) ? <img src={signerImage(owner)} alt="" /> : <em>{owner.signed ? owner.signed_name || owner.name : "Not signed"}</em>}
              <small>{owner.signed_at ? new Date(owner.signed_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) : ""}</small>
            </div>
          </div>
        </article>
        ) : null}
      </div>
    </div>
  );
}

function ContractCard({ item, columns, user, expanded, onToggle, onOpen, onEdit, onDownload, onMove, onDelete, onChequeSent, downloading }) {
  const data = item.data || {};
  const property = [data.propertyNo, data.building, data.location].filter(Boolean).join(" · ");
  const period = data.dateFrom || data.dateTo ? `${esc(data.dateFrom || "—")} to ${esc(data.dateTo || "—")}` : "";
  const rent = data.annualRent ? `AED ${data.annualRent}` : "";
  const signed = item.stage === "signed";
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!expanded) setShowInfo(false);
  }, [expanded]);

  function openInfo() {
    if (!expanded) onToggle(item.id);
    setShowInfo(true);
  }

  return (
    <article className={`tc-card${expanded ? " is-open" : ""}`}>
      <div className="tc-card-top">
        <b>{item.title}</b>
        <div className="tc-card-toggles">
          <button
            type="button"
            className="tc-card-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? `Close ${item.title}` : `Expand ${item.title}`}
            onClick={() => onToggle(item.id)}
          >
            {expanded ? "Close" : "Expand"}
          </button>
          {expanded ? (
            <button
              type="button"
              className="tc-card-toggle"
              aria-expanded={showInfo}
              aria-controls={`tc-card-info-${item.id}`}
              onClick={() => setShowInfo((open) => !open)}
            >
              {showInfo ? "Hide details" : "Show details"}
            </button>
          ) : null}
          {signed && !expanded ? (
            <button type="button" className="tc-card-toggle tc-card-cheque" onClick={openInfo}>
              Cheque received
            </button>
          ) : null}
        </div>
      </div>
      {expanded ? (
        <div className="tc-card-body">
          {showInfo ? (
            <div className="tc-card-info" id={`tc-card-info-${item.id}`}>
              {signed ? <ChequeReceivedBlock item={item} onSent={onChequeSent} /> : null}
              {cardLine("Tenant", [item.tenantName, item.tenantPhone, item.tenantEmail].filter(Boolean).join(" · "))}
              {cardLine("Owner", [item.ownerName, item.ownerPhone, item.ownerEmail].filter(Boolean).join(" · "))}
              {cardLine("Property", property)}
              {cardLine("Period", period)}
              {cardLine("Rent", rent)}
              {(item.signers || []).map((signer) =>
                cardLine(signer.label || signer.role, signer.signed ? "Signed and sent back" : "Waiting to sign")
              )}
              <small>
                {when(item.createdAt)}
                {item.createdBy ? ` · ${item.createdBy}` : ""}
              </small>
            </div>
          ) : (
            <small className="tc-card-preview">{item.tenantName || item.ownerName || "Contract"}</small>
          )}
          <div className="tc-card-actions">
            {item.signedDownload || item.download ? (
              <>
                <button type="button" onClick={() => onOpen(item)}>
                  {item.stage === "signed" ? "Open signed PDF" : "Open PDF"}
                </button>
                <button type="button" disabled={downloading} onClick={() => onDownload(item)}>
                  {downloading ? "…" : "Download PDF"}
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => onEdit(item)}>
              Edit form
            </button>
            <select
              value={item.stage}
              aria-label="Move to stage"
              onChange={(e) => onMove(item, e.target.value)}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {user?.admin ? (
              <button type="button" className="tc-danger" onClick={() => onDelete(item)}>
                Delete
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <small className="tc-card-preview">{item.tenantName || item.ownerName || "Contract"}</small>
      )}
    </article>
  );
}

export function TenancyPanel({ user, listings }) {
  const [step, setStep] = usePersistedState("tenancy.step", 1);
  const [form, setForm] = usePersistedState("tenancy.form", EMPTY);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [notice, setNotice] = useState(null);
  const [badges, setBadges] = useState({});
  const [sendEmails, setSendEmails] = useState({ tenant: undefined, owner: undefined });
  const [board, setBoard] = useState({ columns: [], items: [] });
  const [busy, setBusy] = useState(false);
  const [uploadFor, setUploadFor] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [boardOpen, setBoardOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState("");
  const [photoFields, setPhotoFields] = useState(() => ({ ...EMPTY_SECTION_PHOTO_FIELDS }));
  const [photoIds, setPhotoIds] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [viewPdfUrl, setViewPdfUrl] = useState("");
  const [viewKind, setViewKind] = useState("");
  const [viewBusy, setViewBusy] = useState(false);
  const [viewErr, setViewErr] = useState("");
  const [downloadId, setDownloadId] = useState("");
  const viewRef = useRef(null);
  const [sectionPhotoIds, setSectionPhotoIds] = useState(() => ({ ...EMPTY_SECTION_PHOTO_IDS }));
  const [listingPool, setListingPool] = useState([]);
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const photoSectionRef = useRef("tenant");

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  function fill(map) {
    const patch = {};
    for (const key of Object.keys(map)) if (map[key]) patch[key] = map[key];
    set(patch);
  }

  function syncDates(source, next) {
    const data = { ...form, ...next };
    let { dateFrom, dateTo } = data;
    if (source === "contract" && data.contractDate) dateFrom = data.contractDate;
    if (!dateFrom && data.contractDate) dateFrom = data.contractDate;
    if (dateFrom) dateTo = addOneYearTo(dateFrom);
    set({ ...next, dateFrom, dateTo });
  }

  function syncDeposit(next) {
    const data = { ...form, ...next };
    const rent = moneyNumber(data.annualRent);
    let contractValue = data.contractValue;
    if (!contractValue && rent > 0) contractValue = String(Math.round(rent * 100) / 100);
    const base = moneyNumber(contractValue) || rent;
    const deposit = base > 0 ? String(Math.round(base * 0.05 * 100) / 100) : data.deposit;
    set({ ...next, contractValue, deposit });
  }

  useEffect(() => {
    syncDates("contract", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBoard() {
    const body = await api("/api/tenancy/list");
    if (body.ok) setBoard({ columns: body.columns || [], items: body.items || [] });
  }

  useEffect(() => {
    loadBoard();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings?pageSize=100&status=all", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setListingPool(body.listings || []);
      })
      .catch(() => {
        if (!cancelled) setListingPool([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const deskListings = useMemo(() => {
    const rows = [...(listingPool || []), ...(listings || [])];
    return rows.filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index);
  }, [listingPool, listings]);

  useEffect(() => {
    return () => {
      if (viewPdfUrl) URL.revokeObjectURL(viewPdfUrl);
    };
  }, [viewPdfUrl]);

  function resetPhotoSession() {
    setPhotoBusy("");
    setPhotoFields({ ...EMPTY_SECTION_PHOTO_FIELDS });
    setPhotoIds([]);
    setSectionPhotoIds({ ...EMPTY_SECTION_PHOTO_IDS });
  }

  function toggleCard(id) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function formData() {
    const data = { ...form };
    if (!data.dateFrom && data.contractDate) data.dateFrom = data.contractDate;
    if (!data.dateTo && data.dateFrom) data.dateTo = addOneYearTo(data.dateFrom);
    if (!data.contractValue) data.contractValue = data.annualRent;
    const base = moneyNumber(data.contractValue || data.annualRent);
    if (!data.deposit && base > 0) data.deposit = String(Math.round(base * 0.05 * 100) / 100);
    data.photoIds = photoIds;
    data.terms = formTenancyTerms(data.terms);
    return data;
  }

  const terms = formTenancyTerms(form.terms);

  function setTerm(index, value) {
    const next = [...terms];
    next[index] = value;
    set({ terms: next });
  }

  function removeTerm(index) {
    set({ terms: terms.filter((_, i) => i !== index) });
  }

  function addTerm() {
    if (terms.length >= MAX_TENANCY_TERMS) return;
    set({ terms: [...terms, ""] });
  }

  function applyTermPack(pack) {
    set({ termsPack: pack, terms: termsForPack(pack) });
  }

  function restoreTerms() {
    applyTermPack(form.termsPack || packFromPropertyType(form.propertyType) || "shop");
  }

  function missingDetails() {
    const data = formData();
    if (!data.tenantName) return "Add the tenant name.";
    if (!data.landlordName) return "Add the owner name.";
    if (!data.dateFrom || !data.dateTo) return "Add the From and To dates.";
    if (!data.annualRent) return "Add the annual rent.";
    return "";
  }

  function emailForParty(party) {
    const typed = sendEmails[party];
    if (typed !== undefined && String(typed).trim()) return String(typed).trim();
    return String(party === "owner" ? form.landlordEmail : form.tenantEmail || "").trim();
  }

  function phoneForParty(party) {
    return String(party === "owner" ? form.landlordPhone : form.tenantPhone || "").trim();
  }

  function goto(n) {
    if (n > 1) {
      const miss = missingDetails();
      if (miss) {
        setStatus({ type: "err", text: miss });
        setStep(1);
        return;
      }
    }
    setStatus({ type: "", text: "" });
    setStep(n);
  }

  async function lookup(entity, id) {
    try {
      const data = await lookupEntityBx(entity, id);
      if (!data) return { ok: true, found: false, message: "This record is not in Bitrix CRM." };
      return { ok: true, found: true, message: "Found in Bitrix CRM.", data };
    } catch {
      return api("/api/tenancy/lookup", { entity, id });
    }
  }

  async function pickTenant(item) {
    if (!item) {
      set({ tenantId: "", tenantEntity: "" });
      setBadges((b) => ({ ...b, tenant: null }));
      return;
    }
    set({ tenantName: item.title || form.tenantName, tenantId: String(item.id), tenantEntity: item.entity });
    const info = await lookup(item.entity, item.id);
    if (info.found && info.data) {
      fill({ tenantName: info.data.name || item.title, tenantEmail: info.data.email, tenantPhone: info.data.phone });
      const extra = info.data.duplicates?.length ? `  (${info.data.duplicates.length + 1} contacts with a similar name — pick the right one)` : "";
      setBadges((b) => ({ ...b, tenant: { found: true, message: info.message + extra } }));
    } else {
      setBadges((b) => ({ ...b, tenant: { found: false, message: info.message || info.error || "Type the details below." } }));
    }
  }

  async function pickLandlord(item) {
    if (!item) {
      set({ landlordId: "" });
      setBadges((b) => ({ ...b, landlord: null }));
      return;
    }
    const picked = String(item.title || "").trim();
    set({ landlordId: String(item.id), landlordName: picked || form.landlordName });
    const info = await lookup("contact", item.id);
    if (info.found && info.data) {
      setForm((current) => ({
        ...current,
        landlordName: current.landlordName || info.data.name || picked,
        landlordEmail: keepUserValue(current.landlordEmail, info.data.email),
        landlordPhone: keepUserValue(current.landlordPhone, info.data.phone),
      }));
      const extra = info.data.duplicates?.length ? `  (${info.data.duplicates.length + 1} similar contacts)` : "";
      setBadges((b) => ({ ...b, landlord: { found: true, message: info.message + extra } }));
    } else {
      setBadges((b) => ({ ...b, landlord: { found: false, message: info.message || info.error || "Type the details below." } }));
    }
  }

  function applyProperty(fields, extra = {}) {
    const patch = compactPropertyFields(fields);
    setForm((current) => {
      const next = {
        ...current,
        ...extra,
        ...patch,
        landlordName: keepUserValue(current.landlordName, patch.landlordName),
        landlordEmail: keepUserValue(current.landlordEmail, patch.landlordEmail),
        landlordPhone: keepUserValue(current.landlordPhone, patch.landlordPhone),
      };
      const pack = packFromPropertyType(next.propertyType);
      if (pack && isStockTerms(current.terms)) {
        next.termsPack = pack;
        next.terms = termsForPack(pack);
      }
      return next;
    });
    if (patch.annualRent) syncDeposit({ annualRent: patch.annualRent });
  }

  function applyListing(row, extra = {}) {
    if (!row) return;
    applyProperty(propertyFieldsFromListing(row), { listingId: row.id, unitId: extra.unitId || "", ...extra });
    setBadges((b) => ({
      ...b,
      unit: { found: true, message: `${usageFromListing(row) || "Listing"} · ${inferPropertyType(row.type) || prettyPropertyType(row.type) || row.title}` },
    }));
  }

  async function searchListingsForUnit(unit) {
    const queries = listingSearchQueries(unit);
    const found = [];
    for (const query of queries.slice(0, 3)) {
      const body = await fetch(`/api/listings?q=${encodeURIComponent(query)}&pageSize=20&status=all`, {
        credentials: "same-origin",
      })
        .then((res) => res.json())
        .catch(() => ({}));
      if (Array.isArray(body.listings)) found.push(...body.listings);
    }
    return [...found, ...deskListings].filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index);
  }

  async function pickUnit(item) {
    if (!item) {
      set({ unitId: "" });
      setBadges((b) => ({ ...b, unit: null }));
      return;
    }
    const seed = { title: item.title };
    const local = findListingForUnit(seed, deskListings);
    if (local) applyListing(local, { unitId: String(item.id) });
    else applyProperty(propertyFieldsFromUnit(seed, deskListings), { unitId: String(item.id), listingId: "" });
    const info = await lookup("unit", item.id);
    const unit = info.found && info.data ? { ...info.data, title: info.data.title || item.title } : seed;
    const pool = await searchListingsForUnit(unit);
    const matched = findListingForUnit(unit, pool);
    if (matched) {
      applyListing(matched, { unitId: String(item.id) });
      applyProperty(
        {
          propertyNo: unit.unitNo || matched.unit_no,
          building: placeName(unit.building) || "",
          location: placeName(unit.location) || placeName(unit.community) || "",
          plotNo: unit.plotNo || "",
          size: unit.size || "",
          landlordName: unit.ownerName || "",
          landlordEmail: unit.ownerEmail || "",
          landlordPhone: unit.ownerPhone || "",
        },
        { unitId: String(item.id), listingId: matched.id }
      );
    } else {
      applyProperty(propertyFieldsFromUnit(unit, pool), { unitId: String(item.id) });
      setBadges((b) => ({
        ...b,
        unit: { found: Boolean(info.found), message: info.found ? unit.title || "Owner’s unit found." : "Unit not found — type property details." },
      }));
    }
  }

  async function dropSavedPhoto(id) {
    if (!id) return;
    await fetch(`/api/tenancy/photo/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
    setPhotoIds((ids) => ids.filter((item) => item !== id));
    setSectionPhotoIds((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) if (next[key] === id) next[key] = "";
      return next;
    });
  }

  function sectionHasUpload(section) {
    return Boolean(sectionPhotoIds[section] || Object.keys(photoFields[section] || {}).length);
  }

  function resetSectionPhotoFields(section) {
    const prev = photoFields[section] || {};
    const keep = new Set();
    for (const [other, fields] of Object.entries(photoFields)) {
      if (other === section) continue;
      for (const key of Object.keys(fields || {})) keep.add(key);
    }
    if (Object.keys(prev).length) {
      setForm((current) => {
        const next = { ...current };
        for (const key of Object.keys(prev)) {
          if (keep.has(key)) continue;
          next[key] = EMPTY[key] ?? "";
        }
        return next;
      });
    }
    setPhotoFields((current) => ({ ...current, [section]: {} }));
  }

  async function clearSectionPhoto(section) {
    if (!PHOTO_SECTION_KEYS[section] || !sectionHasUpload(section)) return;
    const previousId = sectionPhotoIds[section];
    resetSectionPhotoFields(section);
    if (previousId) await dropSavedPhoto(previousId);
    setNotice(null);
    setStatus({ type: "ok", text: `Cleared the uploaded ${section} details.` });
  }

  function applyExtracted(data, section) {
    const next = applyRelatedFields(form, data, section);
    const applied = {};
    for (const key of Object.keys(next)) {
      if (next[key] && next[key] !== form[key]) applied[key] = next[key];
    }
    setForm((current) => applyRelatedFields(current, data, section));
    setPhotoFields((current) => ({ ...current, [section]: applied }));
    return Object.keys(applied);
  }

  function openSectionPhoto(section) {
    photoSectionRef.current = section;
    photoRef.current?.click();
  }

  async function extractFromPhoto(file, section) {
    if (!file || !PHOTO_SECTION_KEYS[section]) return;
    if (!fileKind(file)) {
      setStatus({ type: "err", text: "Use a JPG, PNG, WEBP, or PDF." });
      return;
    }
    const previousId = sectionPhotoIds[section];
    if (previousId) await dropSavedPhoto(previousId);
    resetSectionPhotoFields(section);
    setPhotoBusy(section);
    setNotice(null);
    setStatus({ type: "", text: "" });
    try {
      const { dataUrl, mime } = await fileToExtractImage(file);
      const body = await api("/api/tenancy/extract", { image: dataUrl, mime, name: file.name, section });
      if (body.photo) {
        setSectionPhotoIds((current) => ({ ...current, [section]: body.photo.id }));
        setPhotoIds((ids) => [body.photo.id, ...ids.filter((id) => id !== body.photo.id)]);
      }
      if (body.frontKeyLow && !body.frontKeyAlerted) {
        await notifyMatloobOnBitrix(
          [
            "Property Listing New — OpenAI front key is running out.",
            "Tenancy photo extract switched to the backup OpenAI key.",
            "Please top up or replace the front OpenAI key.",
          ].join("\n")
        );
      }
      if (!body.ok) {
        if (isNoRelatedExtract(body.error)) {
          setNotice({ title: NO_RELATED_TITLE, text: NO_RELATED_TEXT });
          setStatus({ type: "err", text: NO_RELATED_TEXT });
          return;
        }
        setStatus({
          type: "err",
          text: body.photo
            ? `${body.error || "Could not read details from this photo."} Photo was still saved.`
            : body.error || "Could not read details from this photo.",
        });
        return;
      }
      const filled = applyExtracted(body.data, section);
      const names = filled.join(", ");
      const lowNote = body.frontKeyLow
        ? " Front OpenAI key is running out — Matloob Ul Hasnain was notified on Bitrix."
        : "";
      if (!filled.length) {
        setNotice({ title: NO_RELATED_TITLE, text: NO_RELATED_TEXT });
        setStatus({ type: "err", text: `${NO_RELATED_TEXT}${lowNote}` });
        return;
      }
      setStatus({
        type: "ok",
        text: `Saved the file and filled ${filled.length} related field${filled.length === 1 ? "" : "s"} (${names}).${lowNote}`,
      });
    } catch (error) {
      setStatus({ type: "err", text: error instanceof Error && error.message ? error.message : "Could not read this file. Try again." });
    } finally {
      setPhotoBusy("");
    }
  }

  async function useListing(id) {
    if (!id) {
      set({ listingId: "" });
      return;
    }
    let row = deskListings.find((item) => item.id === id);
    if (!row) {
      const body = await fetch(`/api/listings/${encodeURIComponent(id)}`, { credentials: "same-origin" })
        .then((res) => res.json())
        .catch(() => ({}));
      row = body.listing;
    }
    if (!row) {
      set({ listingId: "" });
      return;
    }
    applyListing(row);
  }

  async function prepareContract() {
    const data = formData();
    data.tenantEmail = emailForParty("tenant");
    data.landlordEmail = emailForParty("owner");
    set({ tenantEmail: data.tenantEmail, landlordEmail: data.landlordEmail });
    const prep = await api("/api/tenancy/prepare", data);
    if (!prep.ok) {
      setStatus({ type: "err", text: prep.error || "Could not make the PDF." });
      return null;
    }
    if (prep.id) set({ id: prep.id });
    return prep;
  }

  async function openDraftPdf() {
    const miss = missingDetails();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return;
    }
    setBusy(true);
    try {
      const prep = await prepareContract();
      if (!prep) return;
      const data = formData();
      await openPdf({
        id: prep.id,
        title: data.propertyNo || data.building ? `Tenancy contract — ${[data.propertyNo, data.building].filter(Boolean).join(" ")}` : "Tenancy contract",
        download: prep.download,
        pdfName: prep.pdfName,
        stage: "draft",
        stageLabel: "Preview",
        preview: true,
        data,
        tenantName: data.tenantName,
        ownerName: data.landlordName,
      });
    } finally {
      setBusy(false);
    }
  }

  async function action(kind, party) {
    const miss = missingDetails();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return;
    }
    setBusy(true);
    let waWin = null;
    let waWin2 = null;
    if (kind === "wa") {
      waWin = window.open("about:blank", "_blank");
    }
    try {
      if (kind === "email" && party === "both") {
        const tenantTo = emailForParty("tenant");
        const ownerTo = emailForParty("owner");
        if (!tenantTo && !ownerTo) {
          setStatus({ type: "err", text: "Add tenant and/or owner email below, then click again." });
          return;
        }
        const prep = await prepareContract();
        if (!prep) return;
        const first = tenantTo ? "tenant" : "owner";
        const json = await api("/api/tenancy/email", {
          id: prep.id,
          party: "both",
          tenantEmail: tenantTo,
          landlordEmail: ownerTo,
        });
        if (!json.ok) {
          setStatus({ type: "err", text: json.error || "Email failed." });
          return;
        }
        const next = json.next === "owner" ? "owner" : json.next === "tenant" ? "tenant" : "";
        setStatus({
          type: "ok",
          text: next
            ? `Contract emailed to ${json.mailed || (first === "tenant" ? tenantTo : ownerTo)}. After they sign, the ${next} is emailed automatically with the signed PDF.`
            : `Contract emailed to ${json.mailed || (first === "tenant" ? tenantTo : ownerTo)}.`,
        });
        await loadBoard();
        return;
      }
      if (kind === "email") {
        const to = emailForParty(party);
        if (!to) {
          setStatus({ type: "err", text: `Add the ${party} email in the box below, then click again.` });
          return;
        }
        const prep = await prepareContract();
        if (!prep) return;
        const json = await api("/api/tenancy/email", { id: prep.id, party, tenantEmail: emailForParty("tenant"), landlordEmail: emailForParty("owner") });
        if (!json.ok) {
          setStatus({ type: "err", text: json.error || "Email failed." });
          return;
        }
        setStatus({
          type: "ok",
          text: json.next
            ? `Contract emailed to ${json.mailed || to}. After they sign, the ${json.next} is emailed automatically with the signed PDF.`
            : `Contract emailed to ${json.mailed || to}.`,
        });
        await loadBoard();
        return;
      }
      if (kind === "save") {
        const stage = party === "review" ? "review" : "draft";
        const data = formData();
        data.tenantEmail = emailForParty("tenant");
        data.landlordEmail = emailForParty("owner");
        const json = await api("/api/tenancy/save", { ...data, stage });
        if (!json.ok) {
          setStatus({ type: "err", text: json.error || "Could not save." });
          return;
        }
        if (json.id) set({ id: json.id });
        setStatus({ type: json.signError ? "warn" : "ok", text: (stage === "review" ? "Saved to Under review." : "Saved to Draft.") + (json.signError ? ` ${json.signError}` : "") });
        await loadBoard();
        return;
      }
      if (kind === "download") {
        const json = await prepareContract();
        if (!json) return;
        triggerDownload(json.download, json.pdfName);
        setStatus({ type: "ok", text: `Downloading ${json.pdfName || "the contract PDF"}.` });
        await loadBoard();
        return;
      }
      if (kind === "wa" && party === "both") {
        const firstPhone = phoneForParty("tenant") ? "tenant" : phoneForParty("owner") ? "owner" : "";
        if (!firstPhone) {
          waWin?.close();
          setStatus({ type: "err", text: "Add a tenant or owner phone on step 1 first." });
          setStep(1);
          return;
        }
        const prep = await prepareContract();
        if (!prep) {
          waWin?.close();
          return;
        }
        triggerDownload(prep.download, prep.pdfName);
        const data = { ...formData(), id: prep.id };
        const json = await api("/api/tenancy/whatsapp", { ...data, party: firstPhone });
        if (!json.ok) {
          waWin?.close();
          setStatus({ type: "err", text: json.error || "WhatsApp failed." });
          return;
        }
        if (json.waMe && waWin) waWin.location.href = json.waMe;
        else waWin?.close();
        setStatus({
          type: "ok",
          text: `PDF downloaded. WhatsApp opened for the ${firstPhone}. After they sign, the other party is emailed automatically if their email is on the form.`,
        });
        await loadBoard();
        return;
      }
      if (kind === "wa") {
        const data = formData();
        data.tenantEmail = emailForParty("tenant");
        data.landlordEmail = emailForParty("owner");
        const json = await api("/api/tenancy/whatsapp", { ...data, party });
        if (!json.ok) {
          waWin?.close();
          setStatus({ type: "err", text: json.error || "WhatsApp failed." });
          return;
        }
        if (json.id) set({ id: json.id });
        if (json.download) triggerDownload(json.download, json.pdfName);
        if (json.waMe && waWin) waWin.location.href = json.waMe;
        else waWin?.close();
        setStatus({ type: "ok", text: `PDF downloaded (${json.pdfName || "contract"}). WhatsApp chat opened — attach the PDF and send.` });
        await loadBoard();
      }
    } catch {
      waWin?.close();
      waWin2?.close();
      setStatus({ type: "err", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  async function moveStage(item, stage, file) {
    let signedPdf;
    if (file) {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      signedPdf = { name: file.name, data };
    }
    const json = await api("/api/tenancy/stage", { id: item.id, stage, signedPdf });
    if (!json.ok) {
      setStatus({ type: "err", text: json.error || "Could not update the stage." });
      if (/Upload the signed PDF/.test(json.error || "")) {
        setUploadFor({ item, stage });
        fileRef.current?.click();
      }
      return;
    }
    setStatus({ type: "ok", text: `${json.item.title} moved to ${json.item.stageLabel}.` });
    await loadBoard();
  }

  function pdfHref(item) {
    return item.signedDownload || item.download || "";
  }

  async function openPdf(item) {
    const href = pdfHref(item);
    if (!href) {
      setStatus({ type: "err", text: "This contract has no PDF yet." });
      return;
    }
    if (viewPdfUrl) URL.revokeObjectURL(viewPdfUrl);
    setViewPdfUrl("");
    setViewKind("");
    setViewErr("");
    setViewing(item);
    setViewBusy(true);
    setBoardOpen(true);
    try {
      const detail = await api(`/api/tenancy/${encodeURIComponent(item.id)}?preview=1`);
      const shown = detail.ok && detail.item ? { ...item, ...detail.item } : item;
      setViewing(shown);
      const res = await fetch(`${href}${href.includes("?") ? "&" : "?"}inline=1`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not open the PDF.");
      const blob = await res.blob();
      const type = blob.type || "application/pdf";
      if (type.includes("json") || type.includes("html") || type.includes("text/plain")) {
        throw new Error("Could not open the PDF.");
      }
      setViewKind(type.includes("image") ? "image" : "pdf");
      setViewPdfUrl(URL.createObjectURL(blob));
      requestAnimationFrame(() => viewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      setViewErr(error instanceof Error ? error.message : "Could not open the PDF.");
    } finally {
      setViewBusy(false);
    }
  }

  function closePdf() {
    if (viewPdfUrl) URL.revokeObjectURL(viewPdfUrl);
    setViewPdfUrl("");
    setViewKind("");
    setViewErr("");
    setViewing(null);
    setBoardOpen(true);
  }

  async function downloadPdf(item) {
    const href = pdfHref(item);
    if (!href) {
      setStatus({ type: "err", text: "This contract has no PDF yet." });
      return;
    }
    setDownloadId(item.id);
    try {
      await downloadFile(href, item.signedName || item.pdfName || "tenancy-contract.pdf");
      setStatus({ type: "ok", text: `Downloading ${item.signedName || item.pdfName || "the contract PDF"}.` });
    } catch (error) {
      setStatus({ type: "err", text: error instanceof Error ? error.message : "Could not download the PDF." });
    } finally {
      setDownloadId("");
    }
  }

  async function downloadViewing() {
    if (!viewing) return;
    await downloadPdf(viewing);
  }

  function reopen(item) {
    if (!item.data || !Object.keys(item.data).length) {
      setStatus({ type: "warn", text: "This contract has no saved form data. Only the PDF is available." });
      return;
    }
    closePdf();
    setForm({ ...EMPTY, ...item.data, id: item.id });
    setSendEmails({ tenant: undefined, owner: undefined });
    setPhotoBusy("");
    setPhotoFields({ ...EMPTY_SECTION_PHOTO_FIELDS });
    setPhotoIds(Array.isArray(item.data.photoIds) ? item.data.photoIds : []);
    setSectionPhotoIds({ ...EMPTY_SECTION_PHOTO_IDS });
    setStep(1);
    setStatus({ type: "ok", text: `Opened ${item.title} in the form.` });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeItem(item) {
    if (!window.confirm(`Delete "${item.title}" from the board?`)) return;
    const res = await fetch(`/api/tenancy/${item.id}`, { method: "DELETE", credentials: "same-origin" });
    if (!res.ok) {
      setStatus({ type: "err", text: "Could not delete." });
      return;
    }
    await loadBoard();
  }

  const summary = useMemo(() => formData(), [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const rentSchedule = useMemo(
    () => chequeSchedule({ ...form, dateFrom: form.dateFrom || form.contractDate }),
    [form]
  );
  const commissionVatInfo = useMemo(() => commissionBreakdown(form), [form]);
  const tenantEmailShown = sendEmails.tenant !== undefined ? sendEmails.tenant : summary.tenantEmail || "";
  const ownerEmailShown = sendEmails.owner !== undefined ? sendEmails.owner : summary.landlordEmail || "";

  return (
    <div className="tc-wrap">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadFor) moveStage(uploadFor.item, uploadFor.stage, file);
          setUploadFor(null);
          e.target.value = "";
        }}
      />
      {viewing ? null : (
      <nav className="tc-stepper" aria-label="Steps">
        <button type="button" className={step === 1 ? "is-on" : ""} onClick={() => goto(1)}>
          1. Details
        </button>
        <button type="button" className={step === 2 ? "is-on" : ""} onClick={() => goto(2)}>
          2. Terms
        </button>
        <button type="button" className={step === 3 ? "is-on" : ""} onClick={() => goto(3)}>
          3. Template
        </button>
        <button type="button" className={step === 4 ? "is-on" : ""} onClick={() => goto(4)}>
          4. Send
        </button>
      </nav>
      )}

      {status.text ? <div className={`tc-status ${status.type}`}>{status.text}</div> : null}
      {notice ? (
        <NoticeDialog title={notice.title} text={notice.text} onClose={() => setNotice(null)} />
      ) : null}
      {viewing ? (
        <div ref={viewRef}>
          <TenancyPdfView
            item={viewing}
            pdfUrl={viewPdfUrl}
            kind={viewKind}
            busy={viewBusy || downloadId === viewing.id}
            err={viewErr}
            onClose={closePdf}
            onDownload={downloadViewing}
            onEdit={viewing.preview ? closePdf : reopen}
          />
        </div>
      ) : (
      <form className="tc-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        {step === 1 ? (
          <div>
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) extractFromPhoto(file, photoSectionRef.current);
              }}
            />
            <section>
              <h2>1. Tenant</h2>
              <p className="tc-hint">Click + Add for 20 Bitrix names. Type to search. Use Add new tenant if the name is not in CRM.</p>
              <CrmTypeahead
                mode="pick"
                entities={["contact", "company", "lead"]}
                placeholder="Type tenant name…"
                onPick={pickTenant}
                badge={badges.tenant}
                addNewLabel="+ Add new tenant to Bitrix"
                addName={f("tenantName")}
                addEmail={f("tenantEmail")}
                addPhone={f("tenantPhone")}
              />
              <div className="tc-grid">
                <label>
                  Tenant name <input value={f("tenantName")} required placeholder="DXL Delivery Services LLC" onChange={(e) => set({ tenantName: e.target.value })} />
                </label>
                <label>
                  Tenant email <input value={f("tenantEmail")} type="email" placeholder="optional" onChange={(e) => set({ tenantEmail: e.target.value })} />
                </label>
                <label>
                  Phone <input value={f("tenantPhone")} placeholder="WhatsApp number" onChange={(e) => set({ tenantPhone: e.target.value })} />
                </label>
                <PhotoUploadSlot section="tenant" busy={photoBusy} canClear={sectionHasUpload("tenant")} onOpen={openSectionPhoto} onClear={clearSectionPhoto} />
              </div>
            </section>

            <section>
              <h2>2. Owner</h2>
              <p className="tc-hint">Click + Add for 20 Bitrix owner names. Type to search. Use Add new owner if the name is not in CRM.</p>
              <CrmTypeahead
                mode="pick"
                entities={["contact"]}
                placeholder="Type owner name…"
                onPick={pickLandlord}
                badge={badges.landlord}
                addNewLabel="+ Add new owner to Bitrix"
                addName={f("landlordName")}
                addEmail={f("landlordEmail")}
                addPhone={f("landlordPhone")}
              />
              <div className="tc-grid">
                <label>
                  Owner name <input value={f("landlordName")} required placeholder="Owner name" onChange={(e) => set({ landlordName: e.target.value })} />
                </label>
                <label>
                  Owner email <input value={f("landlordEmail")} type="email" placeholder="optional" onChange={(e) => set({ landlordEmail: e.target.value })} />
                </label>
                <label>
                  Phone <input value={f("landlordPhone")} placeholder="WhatsApp number" onChange={(e) => set({ landlordPhone: e.target.value })} />
                </label>
                <PhotoUploadSlot section="owner" busy={photoBusy} canClear={sectionHasUpload("owner")} onOpen={openSectionPhoto} onClear={clearSectionPhoto} />
              </div>
            </section>

            <section>
              <h2>3. Property</h2>
              <p className="tc-hint">Click + Add and pick a desk listing or Bitrix unit. Usage and property type follow the selected property. Or upload a photo / PDF.</p>
              <PropertyPick
                listings={deskListings}
                badge={badges.unit}
                onPickListing={(row) => applyListing(row)}
                onPickUnit={pickUnit}
                onClear={() => {
                  set({ unitId: "", listingId: "" });
                  setBadges((b) => ({ ...b, unit: null }));
                }}
              />
              {deskListings.length ? (
                <label className="tc-listing-pick">
                  Or pick a listing from this desk
                  <select value={f("listingId")} onChange={(e) => void useListing(e.target.value)}>
                    <option value="">— none —</option>
                    {deskListings.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.reference} · {row.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="tc-grid">
                <label className="tc-usage-field">
                  Usage
                  <div className="tc-usage" role="radiogroup" aria-label="Property usage">
                    {["Commercial", "Residential", "Industrial"].map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="radio"
                        aria-checked={f("usage") === item}
                        className={f("usage") === item ? "on" : ""}
                        onClick={() => {
                          const currentType = f("propertyType");
                          const propertyType =
                            currentType && usageFitsType(item, currentType)
                              ? currentType
                              : defaultTypeForUsage(item);
                          set({ usage: item, propertyType });
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </label>
                <label>
                  Location <input value={f("location")} placeholder="International City" onChange={(e) => set({ location: e.target.value })} />
                </label>
                <label>
                  Building <input value={f("building")} placeholder="England Cluster Y-23" onChange={(e) => set({ building: e.target.value })} />
                </label>
                <label>
                  Property no <input value={f("propertyNo")} placeholder="Shop 22" onChange={(e) => set({ propertyNo: e.target.value })} />
                </label>
                <label>
                  Property type
                  <select
                    value={f("propertyType")}
                    onChange={(e) => {
                      const propertyType = e.target.value;
                      const pack = packFromPropertyType(propertyType);
                      const next = { propertyType, usage: usageFromPropertyType(propertyType) || f("usage") };
                      if (pack && isStockTerms(terms)) {
                        next.termsPack = pack;
                        next.terms = termsForPack(pack);
                      }
                      set(next);
                    }}
                  >
                    {f("propertyType") && !typesForUsage(f("usage")).includes(f("propertyType")) ? (
                      <option value={f("propertyType")}>{f("propertyType")}</option>
                    ) : null}
                    {typesForUsage(f("usage")).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Size (sqm) <input value={f("size")} onChange={(e) => set({ size: e.target.value })} />
                </label>
                <label>
                  Plot no <input value={f("plotNo")} onChange={(e) => set({ plotNo: e.target.value })} />
                </label>
                <label>
                  DEWA premises no <input value={f("dewaNo")} onChange={(e) => set({ dewaNo: e.target.value })} />
                </label>
                <PhotoUploadSlot section="property" busy={photoBusy} canClear={sectionHasUpload("property")} onOpen={openSectionPhoto} onClear={clearSectionPhoto} />
              </div>
            </section>

            <section>
              <h2>4. Rent</h2>
              <div className="tc-grid">
                <label>
                  Contract date <input type="date" value={f("contractDate")} onChange={(e) => syncDates("contract", { contractDate: e.target.value })} />
                </label>
                <label>
                  From <input type="date" value={f("dateFrom")} required onChange={(e) => syncDates("from", { dateFrom: e.target.value })} />
                </label>
                <label>
                  To <input type="date" value={f("dateTo")} required onChange={(e) => set({ dateTo: e.target.value })} />
                </label>
                <label>
                  Annual rent (AED) <input value={f("annualRent")} required placeholder="55000" onChange={(e) => syncDeposit({ annualRent: e.target.value, contractValue: "" })} />
                </label>
                <label>
                  Contract value (AED) <input value={f("contractValue")} placeholder="same as rent" onChange={(e) => syncDeposit({ contractValue: e.target.value })} />
                </label>
                <label>
                  Security deposit (AED) <input value={f("deposit")} placeholder="5% of contract value" onChange={(e) => set({ deposit: e.target.value })} />
                </label>
                <label>
                  Commission (AED) <input value={f("commission")} placeholder="optional" onChange={(e) => set({ commission: e.target.value })} />
                </label>
                <label>
                  Commission VAT
                  <select value={f("commissionVat")} onChange={(e) => set({ commissionVat: e.target.value })} aria-label="Commission VAT">
                    <option value="">Optional — no VAT</option>
                    <option value="exclude">Exclude VAT</option>
                    <option value="include">Include VAT</option>
                  </select>
                  {commissionVatInfo.vat > 0 ? (
                    <span className="tc-vat-note">
                      {commissionVatInfo.mode === "exclude"
                        ? `5% VAT ${formatAed(commissionVatInfo.vat)} added. Total ${formatAed(commissionVatInfo.total)}`
                        : `5% VAT ${formatAed(commissionVatInfo.vat)} already inside. Net ${formatAed(commissionVatInfo.net)}`}
                    </span>
                  ) : null}
                </label>
                <label>
                  Ejari fee (AED) <input value={f("ejariFee")} placeholder="optional" onChange={(e) => set({ ejariFee: e.target.value })} />
                </label>
                <label>
                  Payment
                  <select value={f("paymentMode")} onChange={(e) => set({ paymentMode: e.target.value })}>
                    <option>01 cheque</option>
                    <option>02 cheques</option>
                    <option>03 cheques</option>
                    <option>04 cheques</option>
                    <option>06 cheques</option>
                    <option>12 cheques</option>
                    <option>Cash / transfer</option>
                  </select>
                </label>
                <PhotoUploadSlot section="rent" busy={photoBusy} canClear={sectionHasUpload("rent")} onOpen={openSectionPhoto} onClear={clearSectionPhoto} />
              </div>
              {rentSchedule.rows.length ? (
                <div className="tc-cheque-preview">
                  <p className="tc-hint">This table is printed as the last PDF page. Rent is split across the selected cheques. Deposit, commission and Ejari fee use the contract start date. Exclude VAT adds 5% on commission. Include VAT keeps the typed commission as the total.</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Cheque amount</th>
                        <th>Date</th>
                        <th>Name on cheque</th>
                        <th>Particulars</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rentSchedule.rows.map((item, index) => (
                        <tr key={`${item.date}-${item.particular}-${index}`}>
                          <td>{item.amount}</td>
                          <td>{item.date}</td>
                          <td>{item.name}</td>
                          <td>{item.particular}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <div className="tc-actions">
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => goto(2)}>
                Next: terms and conditions
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <section>
              <h2>Terms and conditions</h2>
              <label className="tc-usage-field">
                Terms for
                <div className="tc-usage tc-usage-2" role="radiogroup" aria-label="Terms pack">
                  {[
                    { id: "villa", label: "Villa" },
                    { id: "shop", label: "Shop" },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={f("termsPack") === item.id}
                      className={f("termsPack") === item.id ? "on" : ""}
                      onClick={() => applyTermPack(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </label>
              <p className="tc-hint">
                Choose Villa or Shop. The matching additional terms fill below and print on the contract PDF. You can still edit, remove, or add lines. The first 8 sit on the Ejari form. Extra lines print on the next PDF page.
              </p>
              <div className="tc-terms-list">
                {terms.map((term, index) => (
                  <div className="tc-term-row" key={`term-${index}`}>
                    <span className="tc-term-no" aria-hidden="true">
                      {index + 1}
                    </span>
                    <label>
                      <span className="sr-only">Term {index + 1}</span>
                      <textarea
                        value={term}
                        rows={3}
                        placeholder="Write this term, or remove it"
                        onChange={(e) => setTerm(index, e.target.value)}
                      />
                    </label>
                    <button type="button" className="ui-btn ui-btn-light ui-btn-sm" onClick={() => removeTerm(index)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              {!terms.length ? <p className="tc-hint">No terms. Add a line or restore the usual A7 terms.</p> : null}
              <div className="tc-actions">
                <button type="button" className="ui-btn" disabled={terms.length >= MAX_TENANCY_TERMS} onClick={addTerm}>
                  Add term
                </button>
                <button type="button" className="ui-btn ui-btn-light" onClick={restoreTerms}>
                  Restore usual terms
                </button>
              </div>
            </section>
            <div className="tc-actions">
              <button type="button" className="ui-btn ui-btn-light" onClick={() => goto(1)}>
                Back
              </button>
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => goto(3)}>
                Next: choose template
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <section>
              <h2>Choose template</h2>
              <p className="tc-hint">The form you just filled is written onto this PDF. More templates can be added later.</p>
              <div className="tc-templates">
                <label className={`tc-template${f("template") === "ejari" ? " is-on" : ""}`} onClick={() => set({ template: "ejari" })}>
                  <input type="radio" name="template" value="ejari" checked={f("template") === "ejari"} readOnly />
                  <img src="/tenancy/ejari-blank-p1.jpg" alt="Unified Tenancy Contract preview" />
                  <span>
                    <strong>Unified Tenancy Contract (Ejari)</strong>
                    <span className="tc-hint">Dubai Land Department official bilingual form. Tenant, owner, property and rent go into this PDF.</span>
                    <button
                      type="button"
                      className="ui-btn"
                      disabled={busy}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openDraftPdf();
                      }}
                    >
                      {busy ? "Opening…" : "Open contract"}
                    </button>
                  </span>
                </label>
              </div>
            </section>
            <div className="tc-actions">
              <button type="button" className="ui-btn ui-btn-light" onClick={() => goto(2)}>
                Back
              </button>
              <button type="button" className="ui-btn" disabled={busy} onClick={openDraftPdf}>
                {busy ? "Opening…" : "Open contract"}
              </button>
              <button type="button" className="ui-btn ui-btn-primary" onClick={() => goto(4)}>
                Next: send
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <section>
              <h2>Send the contract</h2>
              <p className="tc-hint">
                Email goes to the <b>tenant first</b> when both emails are entered. After the tenant signs, the contract stays in <b>Partially signed</b> and the owner is emailed automatically with that signature on the PDF. It moves to <b>Signed</b> only after the owner also signs. If only one email is entered and that person signs, it stays in <b>Partially signed</b> until both tenant and owner have signed.
              </p>
              <div className="tc-summary">
                <div>
                  <b>Tenant:</b> {esc(summary.tenantName)}
                  {summary.tenantPhone ? ` · ${summary.tenantPhone}` : " · no phone"}
                </div>
                <label className="tc-send-email">
                  <span>Tenant email</span>
                  <input type="email" value={tenantEmailShown} placeholder="Enter tenant email" onChange={(e) => setSendEmails({ ...sendEmails, tenant: e.target.value })} />
                </label>
                <div>
                  <b>Owner:</b> {esc(summary.landlordName)}
                  {summary.landlordPhone ? ` · ${summary.landlordPhone}` : " · no phone"}
                </div>
                <label className="tc-send-email">
                  <span>Owner email</span>
                  <input type="email" value={ownerEmailShown} placeholder="Enter owner email" onChange={(e) => setSendEmails({ ...sendEmails, owner: e.target.value })} />
                </label>
                <div>
                  <b>Property:</b> {esc(summary.propertyNo || summary.building || "—")}
                  {summary.location ? ` · ${summary.location}` : ""}
                </div>
                <div>
                  <b>Period:</b> {esc(summary.dateFrom)} to {esc(summary.dateTo)} · Rent AED {esc(summary.annualRent)}
                </div>
                <div>
                  <b>Template:</b> Unified Tenancy Contract (Ejari)
                </div>
                <div>
                  <b>Terms:</b> {terms.filter((item) => String(item || "").trim()).length} additional terms
                </div>
              </div>
              <div className="tc-actions">
                <button type="button" className="ui-btn ui-btn-success" disabled={busy} onClick={() => action("wa", "tenant")}>
                  WhatsApp tenant
                </button>
                <button type="button" className="ui-btn ui-btn-success" disabled={busy} onClick={() => action("wa", "owner")}>
                  WhatsApp owner
                </button>
                <button type="button" className="ui-btn" disabled={busy} onClick={() => action("email", "tenant")}>
                  Email tenant
                </button>
                <button type="button" className="ui-btn" disabled={busy} onClick={() => action("email", "owner")}>
                  Email owner
                </button>
                <button type="button" className="ui-btn" disabled={busy} onClick={openDraftPdf}>
                  {busy ? "Opening…" : "Open contract"}
                </button>
                <button type="button" className="ui-btn" disabled={busy} onClick={() => action("download")}>
                  Download PDF
                </button>
              </div>
              <div className="tc-actions tc-send-both">
                <span className="tc-send-both-label">Send in order</span>
                <button type="button" className="ui-btn ui-btn-success ui-btn-sm" disabled={busy} onClick={() => action("wa", "both")}>
                  WhatsApp first person
                </button>
                <button type="button" className="ui-btn ui-btn-sm" disabled={busy} onClick={() => action("email", "both")}>
                  Email in order
                </button>
              </div>
              <div className="tc-actions">
                <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => action("save", "draft")}>
                  Save to draft
                </button>
                <button type="button" className="ui-btn" disabled={busy} onClick={() => action("save", "review")}>
                  Human review
                </button>
              </div>
            </section>
            <div className="tc-actions">
              <button type="button" className="ui-btn ui-btn-light" onClick={() => goto(3)}>
                Back
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-light"
                onClick={() => {
                  setForm({ ...EMPTY, contractDate: new Date().toISOString().slice(0, 10) });
                  setSendEmails({ tenant: undefined, owner: undefined });
                  setBadges({});
                  resetPhotoSession();
                  setStep(1);
                  setStatus({ type: "", text: "" });
                }}
              >
                New contract
              </button>
            </div>
          </div>
        ) : null}
      </form>
      )}

      {viewing ? null : (
      <div className={`tc-board${boardOpen ? " is-open" : ""}`}>
        <div className="tc-board-head">
          <div>
            <h2>Contracts board</h2>
            <p className="tc-hint">Expand a card for PDF and move. Show details for tenant, owner and property. Cheque received is only on Signed contracts: open that, then upload the cheque, ask the owner to verify, then the tenant gets the acknowledgment.</p>
          </div>
          <div className="tc-board-actions">
            <button
              type="button"
              className="ui-btn ui-btn-light ui-btn-sm"
              aria-expanded={boardOpen}
              aria-controls="tc-board-page"
              onClick={() => setBoardOpen((open) => !open)}
            >
              {boardOpen ? "Close" : "Expand"}
            </button>
            <button type="button" className="ui-btn ui-btn-light ui-btn-sm" onClick={loadBoard}>
              Refresh
            </button>
          </div>
        </div>
        {boardOpen ? (
        <div className="tc-columns" id="tc-board-page">
          {board.columns.map((column) => {
            const items = board.items.filter((item) => item.stage === column.id);
            return (
              <div className="tc-column" key={column.id}>
                <h3>
                  {column.label} <span>{items.length}</span>
                </h3>
                {items.map((item) => (
                  <ContractCard
                    key={item.id}
                    item={item}
                    columns={board.columns}
                    user={user}
                    expanded={expandedIds.has(item.id)}
                    onToggle={toggleCard}
                    onOpen={openPdf}
                    onEdit={reopen}
                    onDownload={downloadPdf}
                    downloading={downloadId === item.id}
                    onMove={(row, stage) => {
                      const tenantOk = (row.signers || []).some((signer) => signer.role === "tenant" && signer.signed);
                      const ownerOk = (row.signers || []).some((signer) => signer.role === "owner" && signer.signed);
                      if (stage === "signed" && !(tenantOk && ownerOk)) {
                        setUploadFor({ item: row, stage });
                        fileRef.current?.click();
                        return;
                      }
                      moveStage(row, stage);
                    }}
                    onDelete={removeItem}
                    onChequeSent={(next) => {
                      if (!next?.id) {
                        loadBoard();
                        return;
                      }
                      setBoard((current) => ({
                        ...current,
                        items: current.items.map((row) => (row.id === next.id ? next : row)),
                      }));
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
