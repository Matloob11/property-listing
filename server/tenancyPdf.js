// Exact port of the Bitrix tenancy tool's PdfMaker: writes the form values onto
// the two-page Unified Tenancy Contract (Ejari) template images.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataUrlToJpeg } from "./pdf.js";
import { chequeSchedule, formatAed, formatChequeDate } from "./tenancyCheques.js";
import { resolveTenancyTerms } from "./tenancyTerms.js";

const IMG_W = 1190;
const IMG_H = 1685;

const PAGE_W = 595.0;
const PAGE_H = 842.04;
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");

function jpegInfo(file) {
  const data = fs.readFileSync(file);
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: data.readUInt16BE(offset + 7), h: data.readUInt16BE(offset + 5), data };
    }
    offset += 2 + length;
  }
  throw new Error(`Could not read Ejari template image ${path.basename(file)}`);
}

let cache = null;
function templates() {
  if (!cache) {
    cache = {
      p1: jpegInfo(path.join(ASSETS, "ejari-blank-p1.jpg")),
      p2: jpegInfo(path.join(ASSETS, "ejari-blank-p2.jpg")),
    };
  }
  return cache;
}

function esc(text) {
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, "-")
    .replace(/[^\x20-\xFF]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function text(x, y, size, value, bold = false) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const font = bold ? "/F2" : "/F1";
  return `${font} ${size.toFixed(1)} Tf\n1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm\n(${esc(v)}) Tj\n`;
}

// Helvetica WinAnsi widths, 32-126. Stops Chrome from painting glyphs on top of each other.
const HELV_W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

function helveticaWidth(value, size) {
  let width = 0;
  for (const ch of String(value || "")) {
    const code = ch.charCodeAt(0);
    width += code >= 32 && code <= 126 ? HELV_W[code - 32] : 556;
  }
  return (width * Number(size || 0)) / 1000;
}

function fitHelvetica(value, size, maxWidth) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw || helveticaWidth(raw, size) <= maxWidth) return raw;
  let out = raw;
  while (out.length && helveticaWidth(`${out}...`, size) > maxWidth) out = out.slice(0, -1);
  return out ? `${out}...` : "";
}

function wrapHelvetica(value, size, maxWidth) {
  const words = String(value || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && helveticaWidth(next, size) > maxWidth) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function circlePath(cx, cy, r) {
  const k = r * 0.5522847498;
  const f = (n) => n.toFixed(2);
  return `${f(cx)} ${f(cy + r)} m ${f(cx + k)} ${f(cy + r)} ${f(cx + r)} ${f(cy + k)} ${f(cx + r)} ${f(cy)} c ${f(cx + r)} ${f(cy - k)} ${f(cx + k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ${f(cx - k)} ${f(cy - r)} ${f(cx - r)} ${f(cy - k)} ${f(cx - r)} ${f(cy)} c ${f(cx - r)} ${f(cy + k)} ${f(cx - k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c`;
}

function usageGraphics(mark) {
  const navy = "0.043 0.173 0.412";
  const cover = 7.15;
  const r = 5.85;
  const parts = ["q\n"];
  for (const opt of mark.options) {
    const on = opt.key === mark.selected;
    parts.push(`1 1 1 rg ${circlePath(opt.x, opt.y, cover)} f\n`);
    if (on) {
      parts.push(`${navy} rg ${navy} RG 0.85 w ${circlePath(opt.x, opt.y, r)} B\n`);
      parts.push(
        `1 1 1 RG 1.2 w 1 J 1 j ${(opt.x - 2.65).toFixed(2)} ${(opt.y - 0.1).toFixed(2)} m ${(opt.x - 0.6).toFixed(2)} ${(opt.y - 2.3).toFixed(2)} l ${(opt.x + 3.0).toFixed(2)} ${(opt.y + 2.5).toFixed(2)} l S\n`
      );
    } else {
      parts.push(`1 1 1 rg ${navy} RG 1.05 w ${circlePath(opt.x, opt.y, r)} B\n`);
    }
  }
  parts.push("Q\n");
  return parts.join("");
}

function pageContent(ops, imageNo, graphics = "", overlays = "") {
  return `q\n${PAGE_W} 0 0 ${PAGE_H} 0 0 cm\n/Im${imageNo} Do\nQ\n${graphics}${overlays}q\n0 w 0 Tr\nBT\n0 Tc 0 Tw\n${ops.join("")}ET\nQ\n`;
}

function pxX(px) {
  return (Number(px) * PAGE_W) / IMG_W;
}

function pxY(px) {
  return ((IMG_H - Number(px)) * PAGE_H) / IMG_H;
}

function jpegMeta(data) {
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: data.readUInt16BE(offset + 7), h: data.readUInt16BE(offset + 5), data };
    }
    offset += 2 + length;
  }
  return null;
}

function fitImage(img, box) {
  const padX = 8;
  const padY = 6;
  const maxW = Math.max(20, box.w - padX * 2);
  const maxH = Math.max(16, box.h - padY * 2);
  const scale = Math.min(maxW / img.w, maxH / img.h);
  const w = img.w * scale;
  const h = img.h * scale;
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

function imageDraw(name, placed) {
  return `q\n${placed.w.toFixed(2)} 0 0 ${placed.h.toFixed(2)} ${placed.x.toFixed(2)} ${placed.y.toFixed(2)} cm\n${name} Do\nQ\n`;
}

function boxFromPx(x0, y0, x1, y1) {
  const top = pxY(y0);
  const bottom = pxY(y1);
  return { x: pxX(x0), y: bottom, w: pxX(x1) - pxX(x0), h: top - bottom };
}

function signDateYmd(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return longDate(ymd);
}

export const EJARI_IMG = { w: IMG_W, h: IMG_H };
export const EJARI_PAGE = { w: PAGE_W, h: PAGE_H };

export const SIGN_BOX_PX = {
  p1: {
    tenant: { x: 72, y: 1402, w: 500, h: 214 },
    owner: { x: 614, y: 1402, w: 500, h: 214 },
  },
  p2: {
    tenant: { x: 70, y: 1316, w: 498, h: 220 },
    owner: { x: 612, y: 1316, w: 498, h: 220 },
  },
};

export function ejariBlankPath(page) {
  return path.join(ASSETS, page === 2 || page === "2" || page === "p2" ? "ejari-blank-p2.jpg" : "ejari-blank-p1.jpg");
}

export function pdfTextStyle(x, y, size) {
  return {
    left: `${((Number(x) / PAGE_W) * 100).toFixed(3)}%`,
    top: `${(((PAGE_H - Number(y) - Number(size)) / PAGE_H) * 100).toFixed(3)}%`,
    fontSize: `${((Number(size) / PAGE_W) * 100).toFixed(3)}cqw`,
  };
}

export function signBoxStyle(page, role) {
  const box = SIGN_BOX_PX[page]?.[role === "owner" ? "owner" : "tenant"];
  if (!box) return "";
  return `left:${((box.x / IMG_W) * 100).toFixed(3)}%;top:${((box.y / IMG_H) * 100).toFixed(3)}%;width:${((box.w / IMG_W) * 100).toFixed(3)}%;height:${((box.h / IMG_H) * 100).toFixed(3)}%`;
}

const SIGN_BOXES = {
  p1: {
    tenant: boxFromPx(72, 1402, 572, 1616),
    owner: boxFromPx(614, 1402, 1114, 1616),
    tenantDate: { x: pxX(148), y: pxY(1638) },
    ownerDate: { x: pxX(688), y: pxY(1638) },
  },
  p2: {
    tenant: boxFromPx(70, 1316, 568, 1536),
    owner: boxFromPx(612, 1316, 1110, 1536),
    tenantDate: { x: pxX(148), y: pxY(1554) },
    ownerDate: { x: pxX(688), y: pxY(1554) },
  },
};

function signatureOverlay(signers) {
  const extras = [];
  const draws = { p1: "", p2: "" };
  const dates = { p1: [], p2: [] };
  const tenant = (signers || []).find((item) => item.role !== "owner" && item.signed_at && item.signature);
  const owner = (signers || []).find((item) => item.role === "owner" && item.signed_at && item.signature);

  function add(role, signer) {
    const jpeg = dataUrlToJpeg(signer.signature);
    if (!jpeg) return;
    const meta = jpegMeta(jpeg);
    if (!meta) return;
    const name = role === "owner" ? "/SigO" : "/SigT";
    extras.push({ name, ...meta });
    for (const page of ["p1", "p2"]) {
      draws[page] += imageDraw(name, fitImage(meta, SIGN_BOXES[page][role]));
      const when = signDateYmd(signer.signed_at);
      if (when) {
        const pos = SIGN_BOXES[page][role === "owner" ? "ownerDate" : "tenantDate"];
        dates[page].push(text(pos.x, pos.y, 10, when, true));
      }
    }
  }

  if (tenant) add("tenant", tenant);
  if (owner) add("owner", owner);
  return { extras, draws, dates };
}

function ymdParts(ymd) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
}

export function longDate(ymd) {
  const m = ymdParts(ymd);
  if (!m) return String(ymd || "").trim();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${m[3]} ${months[Number(m[2]) - 1] || ""} ${m[1]}`.trim();
}

function headerDateFields(ymd) {
  const m = ymdParts(ymd);
  if (!m) {
    const raw = String(ymd || "").trim();
    return raw ? [field(50, 788.5, raw)] : [];
  }
  return [field(50, 788.5, m[3]), field(75, 788.5, m[2]), field(108, 788.5, m[1])];
}

function words(n) {
  if (n === 0) return "ZERO";
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  const to99 = (x) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`.trim());
  const chunk = (x) => {
    if (x < 100) return to99(x);
    const h = Math.floor(x / 100);
    const r = x % 100;
    return `${ones[h]} HUNDRED${r ? ` ${to99(r)}` : ""}`.trim();
  };
  const out = [];
  const m = Math.floor(n / 1000000);
  n %= 1000000;
  const th = Math.floor(n / 1000);
  n %= 1000;
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (m) out.push(`${chunk(m)} MILLION`);
  if (th) out.push(`${chunk(th)} THOUSAND`);
  if (h) out.push(`${ones[h]} HUNDRED`);
  if (r) out.push(to99(r));
  return out.join(" ");
}

function num(raw) {
  return Math.round(Number(String(raw || "").replace(/[^\d.]/g, "")) || 0);
}

export function moneyLine(raw) {
  const n = num(raw);
  if (n <= 0) return "";
  return `AED ${n.toLocaleString("en-US")}/- ${words(n)} ONLY`;
}

export function moneyShort(raw) {
  const n = num(raw);
  if (n <= 0) return "";
  return `AED ${n.toLocaleString("en-US")}/-`;
}

const TERM_MAX_W = 470;
const TERM_SIZE = 9;
const TERM_LINE_H = 11;
const TERM_GAP = 4;
const TERM_TOP = 404;
const TERM_MIN_Y = 252;

export function layoutTenancyTerms(data) {
  const terms = resolveTenancyTerms(data?.terms);
  const lines = [];
  let y = TERM_TOP;
  let overflowFrom = terms.length;
  for (let i = 0; i < terms.length; i += 1) {
    const wrapped = wrapHelvetica(`${i + 1}. ${terms[i]}`, TERM_SIZE, TERM_MAX_W);
    const block = Math.max(1, wrapped.length) * TERM_LINE_H + TERM_GAP;
    if (i > 0 && y - block < TERM_MIN_Y) {
      overflowFrom = i;
      break;
    }
    for (const piece of wrapped) {
      lines.push({ x: 52, y, size: TERM_SIZE, text: piece, bold: false });
      y -= TERM_LINE_H;
    }
    y -= TERM_GAP;
  }
  return { lines, overflow: terms.slice(overflowFrom), overflowStart: overflowFrom };
}

function termsCover() {
  return "q\n1 1 1 rg 40 248 520 168 re f\nQ\n";
}

function imageObj(img) {
  return {
    head: `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>`,
    stream: img.data,
  };
}

function streamObj(value) {
  const stream = Buffer.from(value, "latin1");
  return { head: `<< /Length ${stream.length} >>`, stream };
}

function assemble(p1, p2, c1, c2, extraImages = [], ...extraContents) {
  const extras = extraImages || [];
  const pages = [
    { content: c1, image: p1, imageName: "/Im1" },
    { content: c2, image: p2, imageName: "/Im2" },
  ];
  for (const content of extraContents) {
    if (content) pages.push({ content });
  }

  let nextId = 1;
  const take = () => nextId++;
  const catalogId = take();
  const pagesId = take();
  const fontId = take();
  const boldId = take();
  const pageIds = pages.map(() => take());
  const contentIds = pages.map(() => take());
  const imageIds = pages.map((page) => (page.image ? take() : 0));
  const extraIds = extras.map(() => take());
  const extraMap = extras.map((img, index) => `${img.name} ${extraIds[index]} 0 R`).join(" ");
  const objects = {
    [catalogId]: `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
    [pagesId]: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    [fontId]: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    [boldId]: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  };
  pages.forEach((page, index) => {
    const imagePart = page.image
      ? `/XObject << ${page.imageName} ${imageIds[index]} 0 R${extraMap ? ` ${extraMap}` : ""} >>`
      : extraMap
        ? `/XObject << ${extraMap} >>`
        : "";
    objects[pageIds[index]] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> ${imagePart} >> /Contents ${contentIds[index]} 0 R >>`;
    objects[contentIds[index]] = streamObj(page.content);
    if (page.image) objects[imageIds[index]] = imageObj(page.image);
  });
  extras.forEach((img, index) => {
    objects[extraIds[index]] = imageObj(img);
  });

  const lastId = nextId - 1;
  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  let length = chunks[0].length;
  const offsets = [0];
  for (let id = 1; id <= lastId; id += 1) {
    offsets[id] = length;
    const object = objects[id];
    const body =
      typeof object === "string"
        ? Buffer.from(`${id} 0 obj\n${object}\nendobj\n`, "latin1")
        : Buffer.concat([
            Buffer.from(`${id} 0 obj\n${object.head}\nstream\n`, "latin1"),
            object.stream,
            Buffer.from("\nendstream\nendobj\n", "latin1"),
          ]);
    chunks.push(body);
    length += body.length;
  }
  let xref = `xref\n0 ${lastId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= lastId; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer << /Size ${lastId + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

function chequePageContent(_data, schedule) {
  const left = 36;
  const width = 523;
  const right = left + width;
  const colX = [36, 150, 232, 390, right];
  const rowH = 26;
  const parts = [`q\n1 1 1 rg 0 0 ${PAGE_W} ${PAGE_H} re f\nQ\n`];

  function paintText(color, x, y, size, value, maxWidth = 0) {
    const shown = maxWidth > 0 ? fitHelvetica(value, size, maxWidth) : String(value || "").trim();
    if (!shown) return;
    parts.push(`q\n0 w 0 Tr ${color} rg\nBT\n0 Tc 0 Tw\n${text(x, y, size, shown)}ET\nQ\n`);
  }

  parts.push(`q\n0.12 0.14 0.22 rg\n${left} 768 ${width} 36 re f\nQ\n`);
  paintText("1 1 1", left + 12, 780, 16, "Cheque schedule", width - 24);

  let y = 748;
  const info = [
    "A7 Group Real Estate",
    schedule.property ? `Property: ${schedule.property}` : "",
    schedule.tenant ? `Tenant: ${schedule.tenant}` : "",
    `Period: ${formatChequeDate(schedule.start) || "-"} to ${formatChequeDate(schedule.end) || "-"}`,
    `Annual rent: ${formatAed(schedule.rent) || "-"}`,
    `Payment: ${schedule.paymentMode || "-"}`,
  ].filter(Boolean);
  for (const line of info) {
    const wrapped = wrapHelvetica(line, 11, width - 8);
    for (const piece of wrapped) {
      paintText("0 0 0", left, y, 11, piece, width - 8);
      y -= 16;
    }
  }
  y -= 8;

  const headers = ["Cheque amount", "Date", "Name on cheque", "Particulars"];
  const rows = [headers, ...schedule.rows.map((item) => [item.amount, item.date, item.name, item.particular])];
  rows.forEach((cells, index) => {
    const bottom = y - rowH;
    const fill = index === 0 ? "0.12 0.14 0.22" : index % 2 === 0 ? "0.95 0.96 0.97" : "1 1 1";
    parts.push(`q\n${fill} rg\n${left} ${bottom} ${width} ${rowH} re f\nQ\n`);
    parts.push(`q\n0.6 w 0.12 0.14 0.22 RG\n${left} ${bottom} ${width} ${rowH} re S\nQ\n`);
    const ink = index === 0 ? "1 1 1" : "0 0 0";
    cells.forEach((cell, col) => {
      const x = colX[col] + 6;
      const maxW = colX[col + 1] - colX[col] - 12;
      parts.push(`q\n${colX[col] + 3} ${bottom + 2} ${maxW + 6} ${rowH - 4} re W n\n`);
      paintText(ink, x, bottom + 9, 10, String(cell || ""), maxW);
      parts.push("Q\n");
    });
    y = bottom;
  });
  y -= 16;
  for (const piece of wrapHelvetica(
    "1st rental cheque, security deposit, commission and Ejari fee use the contract start date.",
    9,
    width
  )) {
    paintText("0 0 0", left, y, 9, piece, width);
    y -= 12;
  }
  return parts.join("");
}

function extraTermsPageContent(terms, startIndex = 0) {
  const left = 36;
  const width = 523;
  const parts = [`q\n1 1 1 rg 0 0 ${PAGE_W} ${PAGE_H} re f\nQ\n`];

  function paintText(color, x, y, size, value, maxWidth = 0) {
    const shown = maxWidth > 0 ? fitHelvetica(value, size, maxWidth) : String(value || "").trim();
    if (!shown) return;
    parts.push(`q\n0 w 0 Tr ${color} rg\nBT\n0 Tc 0 Tw\n${text(x, y, size, shown)}ET\nQ\n`);
  }

  parts.push(`q\n0.12 0.14 0.22 rg\n${left} 768 ${width} 36 re f\nQ\n`);
  paintText("1 1 1", left + 12, 780, 16, "Additional terms", width - 24);
  let y = 740;
  terms.forEach((body, index) => {
    const wrapped = wrapHelvetica(`${startIndex + index + 1}. ${body}`, 10, width - 8);
    if (!wrapped.length) y -= 16;
    for (const piece of wrapped) {
      paintText("0 0 0", left, y, 10, piece, width - 8);
      y -= 14;
    }
    y -= 8;
  });
  return parts.join("");
}

const VALUE_SIZE = 10;

const USAGE_OPTIONS = [
  { key: "industrial", x: 202.0, y: 744.2 },
  { key: "commercial", x: 316.0, y: 744.2 },
  { key: "residential", x: 428.0, y: 744.2 },
];

function usageKey(usage) {
  const key = String(usage || "").toLowerCase();
  if (key.includes("resid")) return "residential";
  if (key.includes("indus")) return "industrial";
  return "commercial";
}

function usageDotFor(usage) {
  const selected = usageKey(usage);
  const hit = USAGE_OPTIONS.find((item) => item.key === selected);
  return { x: hit.x, y: hit.y, r: 5.85, selected, options: USAGE_OPTIONS };
}

function field(x, y, value) {
  return { x, y, size: VALUE_SIZE, text: value, bold: false };
}

export function tenancyLayout(data) {
  const g = (k) => String(data[k] ?? "").trim();
  const owner = g("landlordName") || g("ownerName");
  const tenant = g("tenantName");
  const rent = moneyLine(g("annualRent"));
  const value = moneyLine(g("contractValue") !== "" ? g("contractValue") : g("annualRent"));
  const depositRaw = g("deposit");
  const deposit = depositRaw !== "" ? moneyShort(depositRaw) : "";
  const pay = (g("paymentMode") !== "" ? g("paymentMode") : "04 cheques").toUpperCase();
  const type = (g("propertyType") !== "" ? g("propertyType") : "SHOP").toUpperCase();
  const loc = g("location").toUpperCase();
  return {
    usageDot: usageDotFor(g("usage")),
    p1: [
      ...headerDateFields(g("contractDate") || g("dateFrom")),
      field(78, 721, owner),
      field(78, 703, owner),
      field(73, 682, tenant),
      field(88, 659, g("tenantEmail")),
      field(370, 659, g("landlordEmail")),
      field(88, 638, g("tenantPhone")),
      field(380, 638, g("landlordPhone")),
      field(112, 617, g("building")),
      field(376, 617, loc),
      field(98, 598, g("size")),
      field(317, 598, type),
      field(490, 598, g("propertyNo")),
      field(145, 577, g("dewaNo")),
      field(411, 577, g("plotNo")),
      field(121, 558, longDate(g("dateFrom"))),
      field(370, 558, longDate(g("dateTo"))),
      field(78, 536, rent),
      field(78, 514, value),
      field(121, 494, deposit),
      field(413, 494, pay),
    ].filter((item) => String(item.text || "").trim()),
    p2: layoutTenancyTerms(data).lines.filter((item) => item.text),
  };
}

// data: the normalized tenancy form (same keys as the Bitrix tool).
// signers: optional e-sign payloads; stamps Tenant / Owner boxes on both pages.
export function tenancyPdf(data, signers = []) {
  const { p1, p2 } = templates();
  const signed = signatureOverlay(signers);
  const layout = tenancyLayout(data);
  const termsPack = layoutTenancyTerms(data);
  const c2 = pageContent(
    [...layout.p2.map((item) => text(item.x, item.y, item.size, item.text, Boolean(item.bold))), ...signed.dates.p2],
    2,
    termsCover(),
    signed.draws.p2
  );
  const c1 = pageContent(
    [...layout.p1.map((item) => text(item.x, item.y, item.size, item.text, false)), ...signed.dates.p1],
    1,
    usageGraphics(layout.usageDot),
    signed.draws.p1
  );
  const schedule = chequeSchedule(data);
  const extraTerms = termsPack.overflow.length ? extraTermsPageContent(termsPack.overflow, termsPack.overflowStart) : "";
  const cheques = schedule.rows.length ? chequePageContent(data, schedule) : "";
  return assemble(p1, p2, c1, c2, signed.extras, extraTerms, cheques);
}
