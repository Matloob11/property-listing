// Archival A4 English layout matching the desk Title Deed sheet.
// On-screen / print copy is the HTML sheet (Arabic + Expo marks).

const PAGE_W = 595.28;
const PAGE_H = 841.89;

const ROWS = [
  ["issueDate", "Issue Date"],
  ["mortgageStatus", "Mortgage Status"],
  ["propertyType", "Property Type"],
  ["community", "Community"],
  ["plotNo", "Plot No"],
  ["buildingNo", "Building No"],
  ["buildingName", "Building Name"],
  ["propertyNo", "Property No"],
  ["floorNo", "Floor No"],
  ["parkings", "Parkings"],
  ["suiteArea", "Suite Area"],
  ["balconyArea", "Balcony Area"],
  ["areaSqMeter", "Area sq Meter"],
  ["areaSqFeet", "Area sq Feet"],
];

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
  const v = String(value ?? "").trim();
  if (!v) return "";
  const font = bold ? "/F2" : "/F1";
  return `q 0 w 0 Tr BT 0 Tc 0 Tw ${font} ${size.toFixed(1)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(v)}) Tj ET Q\n`;
}

function line(x1, y1, x2, y2, w = 0.7) {
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

export function bookingPdf(data) {
  const g = (key) => String(data?.[key] ?? "").trim();
  const ops = [];
  let y = 780;

  ops.push(t(220, y, 18, "Title Deed", true));
  y -= 28;

  for (const [key, label] of ROWS) {
    ops.push(t(48, y, 10, `${label}:`));
    ops.push(t(250, y, 10, g(key), true));
    y -= 16;
  }

  y -= 4;
  ops.push(line(48, y, 547, y, 0.8));
  y -= 16;
  ops.push(t(48, y, 9, "Owners numbers and their shares:"));
  ops.push(t(300, y, 9, "Area (sq Meter)"));
  y -= 16;

  const ownerId = g("ownerId");
  const owner = `${ownerId ? `(${ownerId}) ` : ""}${g("ownerName")}`;
  ops.push(t(48, y, 11, owner, true));
  ops.push(t(320, y, 11, g("ownerAreaSqm") || g("areaSqMeter"), true));
  y -= 16;
  if (g("owner2Name") || g("owner2Id")) {
    const owner2 = `${g("owner2Id") ? `(${g("owner2Id")}) ` : ""}${g("owner2Name")}`;
    ops.push(t(48, y, 11, owner2, true));
    ops.push(t(320, y, 11, g("owner2AreaSqm"), true));
    y -= 16;
  }

  y -= 8;
  const buy = [
    "Purchased from",
    g("purchasedFrom"),
    "by the Land Registration No.:",
    g("landRegistrationNo"),
    "Date",
    g("registrationDate") || g("issueDate"),
    "for the amount",
    g("amount") ? `${g("amount")} Dirham,` : "",
    g("amountWords"),
  ]
    .filter(Boolean)
    .join(" ");
  for (const row of wrap(buy, 92)) {
    ops.push(t(48, y, 9, row));
    y -= 12;
  }
  y -= 4;
  for (const row of wrap(
    "This property and its ownership is subject to the terms of the mentioned area and the benefits and instructions related thereto which are issued or amended from time to time.",
    92
  )) {
    ops.push(t(48, y, 9, row));
    y -= 12;
  }

  y -= 28;
  ops.push(t(48, y, 9, "Approved Signature"));
  ops.push(t(400, y, 8, "EXPO 2020"));
  y -= 36;
  if (g("documentNo")) ops.push(t(400, y, 9, g("documentNo")));
  y -= 22;
  ops.push(t(190, y, 11, "DUBAI LAND DEPARTMENT", true));
  y -= 20;
  for (const note of [
    "Digital data of this certificate is securely stored on blockchain",
    "Certificate is electronically issued and no signature or stamp is required",
    "Any change in the certificate makes it void",
    "It is prohibited to fold this certificate for any other party",
  ]) {
    ops.push(t(48, y, 7, `- ${note}`));
    y -= 10;
  }
  ops.push(t(280, 36, 10, "1 / 2"));

  const stream = ops.join("");
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const content = add({ head: `<< /Length ${Buffer.byteLength(stream, "latin1")} >>`, stream: Buffer.from(stream, "latin1") });
  const page = add(
    `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${content} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> >>`
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
