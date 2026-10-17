import { finishLetterPdf, jpegFromOwnerSign, placeOwnerSign } from "./nocSign.js";

const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 72;

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

function line(x1, y1, x2, y2, w = 0.8) {
  return `${w.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

function wrap(textValue, width) {
  const words = String(textValue || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > width && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function approxWidth(text, size) {
  return String(text || "").length * size * 0.5;
}

export function nocMoveLetterPdf(data, direction = "in") {
  const out = direction === "out";
  const recipient = String(data?.recipient || "");
  const property = String(data?.property || "");
  const owner = String(data?.ownerName || "________________");
  const tenant = String(data?.tenantName || "________________");
  const eid = String(data?.tenantEid || "________________");
  const verb = out ? "move out" : "move in";
  const moving = out ? "moving out" : "moving in";
  const body1 = `I, ${owner} owner of the above-mentioned property, I have no objection for my Tenant ${tenant} EID: ${eid} ${verb} the above-mentioned property.`;
  const body2 = `This NOC letter is issued upon the request of the tenant for the purpose of ${verb}. Kindly accept this letter and grant him permission for ${moving}.`;

  const ops = ["0 0 0 RG\n0 0 0 rg\n"];
  let y = 752;
  const title = out ? "NOC FOR MOVE OUT" : "NOC FOR MOVE IN";
  ops.push(t(LEFT, y, 24, title, true));
  ops.push(line(LEFT, y - 3, LEFT + approxWidth(title, 24), y - 3));
  y -= 40;
  ops.push(t(LEFT, y, 14, "To,", true));
  y -= 28;
  ops.push(t(LEFT, y, 14, recipient, true));
  y -= 28;
  ops.push(t(LEFT, y, 14, `Property: ${property}`, true));
  y -= 28;
  ops.push(t(LEFT, y, 14, `SUBJECT: ${title}`, true));
  y -= 40;

  for (const row of wrap(body1, 68)) {
    ops.push(t(LEFT, y, 14, row));
    y -= 18;
  }
  y -= 16;
  for (const row of wrap(body2, 68)) {
    ops.push(t(LEFT, y, 14, row));
    y -= 18;
  }
  y -= 36;
  ops.push(t(LEFT, y, 14, "Regards,"));
  y -= 20;
  ops.push(t(LEFT, y, 14, String(data?.ownerName || ""), true));
  y -= 88;
  const sigLabel = "Signature:";
  const img = jpegFromOwnerSign(data?.ownerSign);
  ops.push(t(LEFT, y, 14, sigLabel));
  const placed = placeOwnerSign(img, { left: LEFT, y, fontSize: 14, label: sigLabel });
  ops.push(line(placed.line.x1, placed.line.y1, placed.line.x2, placed.line.y2));
  return finishLetterPdf({
    pageW: PAGE_W,
    pageH: PAGE_H,
    stream: ops.join(""),
    image: placed.image,
  });
}

export function nocMoveinPdf(data) {
  return nocMoveLetterPdf(data, "in");
}

export function nocMoveoutPdf(data) {
  return nocMoveLetterPdf(data, "out");
}
