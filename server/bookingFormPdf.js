import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatVoucherNo, money, officeBrand, onAccountLine, particularLines, stampBrand, throughLine } from "./bookingFormModel.js";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 56;
const RIGHT = 539;
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "booking-form");

function esc(text) {
  return String(text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, "-")
    .replace(/[^\x20-\xFF]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function t(x, y, size, value, bold = false) {
  const v = String(value ?? "");
  if (!String(v).trim()) return "";
  const font = bold ? "/F2" : "/F1";
  return `q 0 w 0 Tr BT 0 Tc 0 Tw ${font} ${size.toFixed(1)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(v)}) Tj ET Q\n`;
}

function center(y, size, value, bold = false) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const w = v.length * size * 0.48;
  return t(Math.max(LEFT, (PAGE_W - w) / 2), y, size, v, bold);
}

function line(x1, y1, x2, y2, w = 1) {
  return `${w.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

function jpegSize(buf) {
  let i = 2;
  while (i + 8 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { h: (buf[i + 5] << 8) | buf[i + 6], w: (buf[i + 7] << 8) | buf[i + 8] };
    }
    i += 2 + len;
  }
  return { w: 100, h: 100 };
}

function loadJpeg(name) {
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  const size = jpegSize(bytes);
  return { bytes, ...size };
}

function drawImage(name, x, y, w, h) {
  return `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q\n`;
}

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

export function bookingFormPdf(data) {
  const officeKey = officeBrand(data);
  const stampKey = stampBrand(data);
  const logo = loadJpeg(officeKey === "aar" ? "aar-logo.jpg" : "a7-logo.jpg");
  const stamp = loadJpeg(stampKey === "aar" ? "aar-stamp.jpg" : "a7-stamp.jpg");
  const ops = ["0 0 0 RG\n0 0 0 rg\n"];
  let y = 760;

  if (logo) {
    const logoW = officeKey === "aar" ? 72 : 64;
    const logoH = (logo.h / logo.w) * logoW;
    const logoX = PAGE_W / 2 - 92 - logoW;
    ops.push(drawImage("ImLogo", logoX, y - 8, logoW, logoH));
  }

  const header = [
    v(data, "company"),
    v(data, "shop"),
    v(data, "building"),
    v(data, "area"),
    v(data, "emirate") ? `Emirate : ${v(data, "emirate")}` : "",
    v(data, "contact") ? `Contact : ${v(data, "contact")}` : "",
    v(data, "email") ? `E-Mail : ${v(data, "email")}` : "",
  ].filter(Boolean);

  for (const row of header) {
    ops.push(center(y, row === header[0] ? 11 : 10, row, true));
    y -= 13;
  }

  y -= 10;
  ops.push(center(y, 13, "Receipt Voucher", true));
  y -= 28;
  const noLabel = `No. : ${formatVoucherNo(v(data, "voucherNo"))}`;
  const noW = Math.max(92, noLabel.length * 6.4 + 16);
  ops.push(`${LEFT.toFixed(2)} ${(y - 4).toFixed(2)} ${noW.toFixed(2)} 16 re S\n`);
  ops.push(t(LEFT + 8, y, 11, noLabel, true));
  ops.push(t(360, y, 11, `Date : ${v(data, "date")}`, true));
  y -= 16;

  const mid = 400;
  const top = y + 8;
  ops.push(line(LEFT, top, RIGHT, top));
  ops.push(t(LEFT + 8, y, 10, "Particulars", true));
  ops.push(t(mid + 12, y, 10, "Amount", true));
  y -= 10;
  ops.push(line(LEFT, y + 4, RIGHT, y + 4));
  ops.push(line(mid, top, mid, 210));

  const amount = money(v(data, "amount"));
  const lines = particularLines(data);
  let lineNo = 0;
  const amountLine = v(data, "accountName") ? 1 : 0;
  for (const row of lines) {
    ops.push(t(LEFT + 8, y, 10, row, true));
    if (lineNo === amountLine && amount) ops.push(t(mid + 12, y, 10, amount, true));
    lineNo += 1;
    y -= 14;
  }
  y -= 18;

  const through = throughLine(data);
  if (through) {
    ops.push(t(LEFT + 8, y, 10, "Through :", true));
    y -= 14;
    ops.push(t(LEFT + 8, y, 10, through, true));
    y -= 18;
  }
  const accountOf = onAccountLine(data);
  if (accountOf) {
    ops.push(t(LEFT + 8, y, 10, "On Account of :", true));
    y -= 14;
    ops.push(t(LEFT + 8, y, 10, accountOf, true));
    y -= 18;
  }
  const words = v(data, "amountWords");
  if (words) {
    ops.push(t(LEFT + 8, y, 10, "Amount (in words) :", true));
    y -= 14;
    ops.push(t(LEFT + 8, y, 10, words, true));
  }
  y = Math.min(y, 250);
  ops.push(line(mid, 226, RIGHT, 226));
  if (amount) ops.push(t(mid + 12, 212, 10, amount, true));
  ops.push(line(LEFT, 210, RIGHT, 210));

  const nameY = 168;
  const lineY = 128;
  ops.push(t(LEFT, nameY + 16, 11, "Authorised Signatory", true));
  if (v(data, "signatory")) ops.push(t(LEFT, nameY, 10, v(data, "signatory"), true));
  ops.push(line(LEFT, lineY, LEFT + 160, lineY, 0.8));
  const payerX = 360;
  ops.push(t(payerX, v(data, "signatory") ? nameY : nameY + 16, 10, "Payer signature", true));
  ops.push(line(payerX, lineY, RIGHT, lineY, 0.8));
  if (stamp) {
    let stampW = stampKey === "aar" ? 108 : 128;
    let stampH = (stamp.h / stamp.w) * stampW;
    const maxH = lineY - 36;
    if (stampH > maxH) {
      stampW = (stamp.w / stamp.h) * maxH;
      stampH = maxH;
    }
    ops.push(drawImage("ImStamp", (PAGE_W - stampW) / 2, 24, stampW, stampH));
  }

  const stream = ops.join("");
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const images = {};
  if (logo) {
    images.ImLogo = add({
      head: `<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>`,
      stream: logo.bytes,
    });
  }
  if (stamp) {
    images.ImStamp = add({
      head: `<< /Type /XObject /Subtype /Image /Width ${stamp.w} /Height ${stamp.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${stamp.bytes.length} >>`,
      stream: stamp.bytes,
    });
  }
  const content = add({ head: `<< /Length ${Buffer.byteLength(stream, "latin1")} >>`, stream: Buffer.from(stream, "latin1") });
  const xObjects = Object.entries(images)
    .map(([name, id]) => `/${name} ${id} 0 R`)
    .join(" ");
  const page = add(
    `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${content} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << ${xObjects} >> >> >>`
  );
  const pages = add(`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  objects[page - 1] = objects[page - 1].replace("/Parent 0 0 R", `/Parent ${pages} 0 R`);
  const catalog = add(`<< /Type /Catalog /Pages ${pages} 0 R >>`);

  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = [];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const id = index + 1;
    let body;
    if (typeof object === "string") {
      body = Buffer.from(`${id} 0 obj\n${object}\nendobj\n`, "latin1");
    } else {
      body = Buffer.concat([
        Buffer.from(`${id} 0 obj\n${object.head}\nstream\n`, "latin1"),
        object.stream,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]);
    }
    chunks.push(body);
    length += body.length;
  });
  const xrefOffset = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer << /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}
