import { finishLetterPdf, jpegFromOwnerSign, placeOwnerSign } from "./nocSign.js";

const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 68;
const RIGHT = 527;

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

function line(x1, y1, x2, y2, w = 0.6) {
  return `${w.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

function rect(x, y, w, h) {
  return `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`;
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
  return String(text || "").length * size * 0.48;
}

function titleX(text, size) {
  return Math.max(LEFT, (PAGE_W - approxWidth(text, size)) / 2);
}

function tableRow(ops, y, label, value, header = false) {
  const h = 18;
  const col = 168;
  ops.push(rect(LEFT, y - 5, RIGHT - LEFT, h));
  ops.push(line(LEFT + col, y - 5, LEFT + col, y - 5 + h));
  ops.push(t(LEFT + 8, y + 1, 11, label, true));
  ops.push(t(LEFT + col + 8, y + 1, 11, value, header || Boolean(value)));
  return y - h;
}

function bits(data) {
  const sale = String(data?.purpose || "").toLowerCase() === "sale";
  const n = parseFloat(String(data?.annualRent || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  const amount = Number.isFinite(n) && n > 0 ? n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 }) : "";
  return {
    date: String(data?.date || ""),
    recipient: String(data?.recipient || "Dubai Land Department (DLD) - RERA / Trakheesi"),
    recipientPlace: String(data?.recipientPlace || "Dubai, United Arab Emirates"),
    ownerName: String(data?.ownerName || ""),
    companyName: String(data?.companyName || "A7 Group Real Estate LLC"),
    tradeLicense: String(data?.tradeLicense || "1056530"),
    purposeWord: sale ? "sale" : "rent",
    subject: sale ? "NOC for Advertising Property for Sale" : "NOC for Advertising Property for Rent",
    propertyType: String(data?.propertyType || ""),
    building: String(data?.building || ""),
    propertyNo: String(data?.propertyNo || ""),
    plotNo: String(data?.plotNo || ""),
    location: String(data?.location || ""),
    rentLabel: sale ? "Asking Price" : "Annual Rent",
    rentValue: amount ? `AED ${amount}` : "",
    portals: "Property Finder, Bayut, Dubizzle, and other DLD/RERA-approved advertising portals",
  };
}

export function nocTrakheesiPdf(data) {
  const d = bits(data);
  const owner = d.ownerName || "________________";
  const company = d.companyName || "A7 Group Real Estate LLC";
  const body1 = `I, ${owner}, the owner of the property mentioned below, hereby confirm that I have no objection to ${company}, Trade License No. ${d.tradeLicense}, advertising and marketing my property for ${d.purposeWord} through ${d.portals}.`;
  const body2 = `I hereby authorize ${company} to advertise the above-mentioned property for ${d.purposeWord} and to obtain the required Trakheesi Advertisement Permit.`;
  const body3 = `This authorization is issued solely for the purpose of advertising and marketing the above property for ${d.purposeWord} and is subject to applicable DLD/RERA rules and regulations.`;

  const ops = ["0 0 0 RG\n0 0 0 rg\n"];
  let y = 780;
  const title = "NO OBJECTION CERTIFICATE";
  ops.push(t(titleX(title, 16), y, 16, title, true));
  ops.push(line(titleX(title, 16), y - 3, titleX(title, 16) + approxWidth(title, 16), y - 3, 0.8));
  y -= 32;
  ops.push(t(LEFT, y, 12, `Date: ${d.date}`));
  y -= 22;
  ops.push(t(LEFT, y, 12, "To:"));
  y -= 16;
  ops.push(t(LEFT, y, 12, d.recipient, true));
  y -= 15;
  ops.push(t(LEFT, y, 12, d.recipientPlace));
  y -= 24;
  ops.push(t(LEFT, y, 12, `Subject: ${d.subject}`, true));
  y -= 24;
  ops.push(t(LEFT, y, 12, "Dear Sir/Madam,"));
  y -= 20;
  wrap(body1, 86).forEach((row) => {
    ops.push(t(LEFT, y, 12, row));
    y -= 15;
  });
  y -= 14;
  ops.push(t(LEFT, y, 12, "PROPERTY DETAILS", true));
  y -= 22;
  y = tableRow(ops, y, "Property Information", "Details", true);
  y = tableRow(ops, y, "Owner Name", d.ownerName);
  y = tableRow(ops, y, "Property Type", d.propertyType);
  y = tableRow(ops, y, "Building / Cluster", d.building);
  y = tableRow(ops, y, "Property No.", d.propertyNo);
  y = tableRow(ops, y, "Plot No.", d.plotNo);
  y = tableRow(ops, y, "Location", d.location);
  y = tableRow(ops, y, d.rentLabel, d.rentValue);
  y -= 22;
  wrap(body2, 86).forEach((row) => {
    ops.push(t(LEFT, y, 12, row));
    y -= 15;
  });
  y -= 10;
  wrap(body3, 86).forEach((row) => {
    ops.push(t(LEFT, y, 12, row));
    y -= 15;
  });
  y -= 16;
  ops.push(t(LEFT, y, 12, "Thank you."));
  y -= 28;
  ops.push(t(LEFT, y, 12, "PROPERTY OWNER", true));
  y -= 20;
  ops.push(t(LEFT, y, 12, `Name: ${d.ownerName}`));
  y -= 88;
  const sigLabel = "Signature:";
  const img = jpegFromOwnerSign(data?.ownerSign);
  ops.push(t(LEFT, y, 12, sigLabel));
  const placed = placeOwnerSign(img, { left: LEFT, y, fontSize: 12, label: sigLabel });
  ops.push(line(placed.line.x1, placed.line.y1, placed.line.x2, placed.line.y2));
  return finishLetterPdf({
    pageW: PAGE_W,
    pageH: PAGE_H,
    stream: ops.join(""),
    image: placed.image,
  });
}
