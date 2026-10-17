import { finishLetterPdf, jpegFromOwnerSign, placeOwnerSign } from "./nocSign.js";

const PAGE_W = 612;
const PAGE_H = 792;

function esc(text) {
  return String(text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, "-")
    .replace(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function t(x, y, size, value, bold = false) {
  const v = String(value ?? "");
  if (!String(v).trim() && value !== "") return "";
  if (!String(v).trim()) return "";
  const font = bold ? "/F2" : "/F1";
  return `q 0 w 0 Tr BT 0 Tc 0 Tw ${font} ${size.toFixed(1)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(v)}) Tj ET Q\n`;
}

function line(x1, y1, x2, y2, w = 0.5) {
  return `${w.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

function rectFill(x, y, w, h, r, g, b) {
  return `${r} ${g} ${b} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n0 0 0 rg\n`;
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

function money(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 });
}

function area(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function bits(data) {
  const rental = String(data?.purpose || "rental") !== "sale";
  const kind = String(data?.propertyKind || data?.titleDeedPropertyType || "property").toLowerCase();
  const sqft = area(data?.plotAreaSqft);
  const sqm = area(data?.plotAreaSqm);
  const amount = money(data?.askingAmount);
  return {
    date: String(data?.date || ""),
    ownerName: String(data?.ownerName || ""),
    emiratesId: String(data?.emiratesId || ""),
    companyName: String(data?.companyName || "A7 GROUP REAL ESTATE LLC"),
    kind,
    purposePhrase: rental ? "for rental purposes" : "for sale",
    findPhrase: rental ? "finding suitable tenants" : "finding suitable buyers",
    askingLabel: rental ? "Asking Rent" : "Asking Price",
    askingValue: amount ? `AED ${amount}${data?.askingPeriod ? ` ${data.askingPeriod}` : ""}` : "",
    areaValue: `${sqft ? `${sqft} sq. ft.` : ""}${sqft && sqm ? " " : ""}${sqm ? `(${sqm} sq. m.)` : ""}`.trim(),
    location: String(data?.location || ""),
    titleDeedPropertyType: String(data?.titleDeedPropertyType || ""),
    buildingNo: String(data?.buildingNo || ""),
    plotNo: String(data?.plotNo || ""),
    municipalityNo: String(data?.municipalityNo || ""),
  };
}

export function nocPdf(data) {
  const d = bits(data);
  const company = d.companyName || "A7 GROUP REAL ESTATE LLC";
  const owner = d.ownerName || "________________";
  const eid = d.emiratesId || "________________";
  const ops = ["0 0 0 RG\n0 0 0 rg\n"];

  ops.push(t(171.3, 728, 15, "NO OBJECTION CERTIFICATE (NOC)", true));
  ops.push(t(233.15, 703.55, 12, "For Property Advertisement", true));
  ops.push(t(60.1, 675.7, 11, `Date: ${d.date}`));
  ops.push(t(60.1, 653.05, 11, "To Whom It May Concern,"));

  let y = 630.4;
  for (const row of wrap(
    `I, ${owner}, holder of Emirates ID No. ${eid}, hereby confirm that I am the owner of the property described below.`,
    92
  )) {
    ops.push(t(60.1, y, 11, row));
    y -= 12.65;
  }
  y -= 15;
  for (const row of wrap(
    `I have no objection to ${company} advertising, marketing, and promoting the ${d.kind} situated on the below-mentioned plot ${d.purposePhrase}.`,
    92
  )) {
    ops.push(t(60.1, y, 11, row));
    y -= 12.65;
  }

  y = 548.85;
  ops.push(t(60.1, y, 12, "Property Details", true));

  const tableTop = 538.45;
  const tableBot = 450.25;
  const left = 60.3;
  const mid = 210.3;
  const right = 522.3;
  const rowH = 12.6;
  const rows = [
    ["Location", d.location],
    ["Title Deed Property Type", d.titleDeedPropertyType],
    ["Building No.", d.buildingNo],
    ["Plot No.", d.plotNo],
    ["Municipality No.", d.municipalityNo],
    ["Total Plot Area", d.areaValue],
    [d.askingLabel, d.askingValue],
  ];
  for (let i = 0; i < 7; i += 1) {
    const by = tableTop - (i + 1) * rowH;
    ops.push(rectFill(left, by, mid - left, rowH, 0.949, 0.949, 0.949));
  }
  ops.push(line(60.05, tableTop, 522.55, tableTop));
  for (let i = 1; i <= 7; i += 1) ops.push(line(60.55, tableTop - i * rowH, 522.05, tableTop - i * rowH));
  ops.push(line(left, tableTop, left, tableBot));
  ops.push(line(mid, 538.2, mid, 450.5));
  ops.push(line(right, tableTop, right, tableBot));
  rows.forEach((row, i) => {
    const ty = 528.45 - i * 12.6;
    ops.push(t(65.75, ty, 10.5, row[0], true));
    ops.push(t(215.75, ty, 10.5, row[1]));
  });

  y = 424.8;
  for (const row of wrap(
    `I hereby authorize ${company} to advertise the ${d.kind} through appropriate marketing channels, including online property portals, social media, and other advertising platforms, for the purpose of ${d.findPhrase}.`,
    92
  )) {
    ops.push(t(60.1, y, 11, row));
    y -= 12.65;
  }
  y -= 10;
  for (const row of wrap(
    `This NOC is issued with my full knowledge and consent and confirms that I have no objection to the advertising and marketing of the ${d.kind} by ${company}.`,
    92
  )) {
    ops.push(t(60.1, y, 11, row));
    y -= 12.65;
  }

  ops.push(t(60.1, 331.55, 11, `Owner Name: ${d.ownerName}`));
  const sigY = 248;
  const sigLabel = "Owner Signature:";
  const img = jpegFromOwnerSign(data?.ownerSign);
  ops.push(t(60.1, sigY, 11, sigLabel));
  const placed = placeOwnerSign(img, { left: 60.1, y: sigY, fontSize: 11, label: sigLabel });
  ops.push(line(placed.line.x1, placed.line.y1, placed.line.x2, placed.line.y2));
  return finishLetterPdf({
    pageW: PAGE_W,
    pageH: PAGE_H,
    stream: ops.join(""),
    image: placed.image,
  });
}
