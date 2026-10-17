import { maintLetterModel } from "./nocMaintLetter.js";
import { finishLetterPdf, jpegFromOwnerSign, placeOwnerSign } from "./nocSign.js";

const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 72;
const VALUE_X = 198;
const SIZE = 12;
const WRAP = 78;

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
  if (!v) return "";
  const font = bold ? "/F2" : "/F1";
  return `q 0 w 0 Tr BT 0 Tc 0 Tw ${font} ${size.toFixed(1)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(v)}) Tj ET Q\n`;
}

function approxWidth(text, size, bold = false) {
  return String(text || "").length * size * (bold ? 0.52 : 0.48);
}

function richWords(segments) {
  const words = [];
  for (const seg of segments) {
    const bits = String(seg.text || "").split(/(\s+)/).filter(Boolean);
    for (const bit of bits) words.push({ text: bit, bold: !!seg.bold });
  }
  return words;
}

function wrapRich(segments, maxChars) {
  const words = richWords(segments);
  const lines = [];
  let line = [];
  let len = 0;
  for (const word of words) {
    if (word.text === "\n") {
      if (line.length) lines.push(line);
      line = [];
      len = 0;
      continue;
    }
    const wlen = word.text.length;
    if (line.length && len + wlen > maxChars && !/^\s+$/.test(word.text)) {
      lines.push(line);
      line = [word];
      len = wlen;
    } else {
      line.push(word);
      len += wlen;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function coalesce(line) {
  const out = [];
  for (const word of line) {
    const last = out[out.length - 1];
    if (last && last.bold === word.bold) last.text += word.text;
    else out.push({ text: word.text, bold: word.bold });
  }
  return out;
}

function drawRich(ops, x, y, size, line) {
  let cursor = x;
  for (const word of coalesce(line)) {
    ops.push(t(cursor, y, size, word.text, word.bold));
    cursor += approxWidth(word.text, size, word.bold);
  }
}

export function nocMaintPdf(data) {
  const letter = maintLetterModel(data);
  const owner = letter.owner || "________________";
  const company = letter.companyBit || "________________";
  const ops = ["0 0 0 RG\n0 0 0 rg\n"];
  let y = 762;
  const title = letter.title;
  const tw = approxWidth(title, 16, true);
  ops.push(t(Math.max(LEFT, (PAGE_W - tw) / 2), y, 16, title, true));
  y -= 44;

  for (const [label, value] of [
    ["TO:", letter.recipient],
    ["REF:", letter.ref],
    ["PROPERTY REF:", letter.propertyRef],
  ]) {
    ops.push(t(LEFT, y, SIZE, label, true));
    ops.push(t(VALUE_X, y, SIZE, value, true));
    y -= 20;
  }
  y -= 18;

  const body1 = wrapRich(
    [
      { text: `I ${owner} owner of the above mentioned properties have no objection for ` },
      { text: company, bold: true },
      { text: "\n" },
      { text: `to do ${letter.workPhrase} inside and outside the property with needful maintenance work.` },
    ],
    WRAP
  );
  for (const row of body1) {
    drawRich(ops, LEFT, y, SIZE, row);
    y -= 16;
  }
  y -= 10;
  const body2 = wrapRich(
    [
      {
        text: "Please give permission for maintenance to finishing the work provided that he will follow the guidelines and submit the required documents as per developer Rules.",
      },
    ],
    WRAP
  );
  for (const row of body2) {
    drawRich(ops, LEFT, y, SIZE, row);
    y -= 16;
  }

  y -= 36;
  ops.push(t(LEFT, y, SIZE, "Landlord:"));
  y -= 28;
  ops.push(t(LEFT, y, SIZE, owner, true));
  y -= 32;
  const img = jpegFromOwnerSign(data?.ownerSign);
  if (img) {
    ops.push(t(LEFT, y, SIZE, "Signature:"));
    const placed = placeOwnerSign(img, { left: LEFT, y, fontSize: SIZE, label: "Signature:" });
    return finishLetterPdf({
      pageW: PAGE_W,
      pageH: PAGE_H,
      stream: ops.join(""),
      image: placed.image,
      roman: "Helvetica",
      bold: "Helvetica-Bold",
    });
  }
  ops.push(t(LEFT, y, SIZE, "Signature: ----------------------"));
  return finishLetterPdf({
    pageW: PAGE_W,
    pageH: PAGE_H,
    stream: ops.join(""),
    roman: "Helvetica",
    bold: "Helvetica-Bold",
  });
}
