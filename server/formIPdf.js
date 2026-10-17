const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 36;
const RIGHT = 576;

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

function line(x1, y1, x2, y2, w = 1) {
  return `${w.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

function rect(x, y, w, h, fill) {
  const path = `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
  return fill ? `${path}f\n` : `${path}S\n`;
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

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

export function formIPdf(data) {
  const ops = ["0 0 0 RG\n0 0 0 rg\n"];
  let y = 760;
  ops.push(t(LEFT, y, 11, "ESTATE REAL REGULATORY AGENCY", true));
  ops.push(t(430, y, 14, "FORM I", true));
  y -= 16;
  ops.push(t(180, y, 12, "AGENT TO AGENT AGREEMENT", true));
  y -= 13;
  ops.push(t(150, y, 8, "As per the Real Estate Brokers By-Law No. (85) Of 2006"));
  y -= 18;
  ops.push("0.85 0.85 0.85 rg\n");
  ops.push(rect(LEFT, y - 4, RIGHT - LEFT, 16, true));
  ops.push("0 0 0 rg\n");
  ops.push(t(LEFT + 6, y, 9, `PART 1.  THE PARTIES                                     DATE:   ${v(data, "date")}`, true));
  y -= 18;
  const mid = 306;
  ops.push(line(LEFT, y + 10, RIGHT, y + 10));
  ops.push(line(mid, y + 10, mid, 210));
  ops.push(t(LEFT + 8, y, 8, "THE / BROKER (SELLER'S AGENT)", true));
  ops.push(t(mid + 8, y, 8, "THE AGENT BROKER (BUYER'S AGENT)", true));
  y -= 14;
  const leftLines = [
    `NAME OF THE ESTABLISHMENT: ${v(data, "aEstablishment")}`,
    `Address: ${v(data, "aAddress")}`,
    `PH: ${v(data, "aPhone")}     FAX: ${v(data, "aFax")}`,
    `ORN: ${v(data, "aOrn")}     DED LISC: ${v(data, "aDedLic")}`,
    `BROKER NAME: ${v(data, "aBrokerName")}`,
    `BRN: ${v(data, "aBrn")}     DATE ISSUED: ${v(data, "aDateIssued")}`,
    `MOBIL: ${v(data, "aMobile")}`,
    `EMAIL: ${v(data, "aEmail")}`,
    `SELLER'S AGENT FORM A STR #: ${v(data, "aFormAStr")}`,
  ];
  const rightLines = [
    `NAME OF THE ESTABLISHMENT: ${v(data, "bEstablishment")}`,
    `ADDRESS: ${v(data, "bAddress")}`,
    `PH: ${v(data, "bPhone")}     FAX: ${v(data, "bFax")}`,
    `ORN: ${v(data, "bOrn")}     DED LISC: ${v(data, "bDedLic")}`,
    `BROKER NAME: ${v(data, "bBrokerName")}`,
    `BRN: ${v(data, "bBrn")}     DATES OF ISSUE: ${v(data, "bDateIssued")}`,
    `MOBILE: ${v(data, "bMobile")}`,
    `EMAIL: ${v(data, "bEmail")}`,
    `BUYER'S AGENT FORM B STR #: ${v(data, "bFormBStr")}`,
  ];
  let rowY = y;
  for (let i = 0; i < leftLines.length; i += 1) {
    for (const row of wrap(leftLines[i], 42)) {
      ops.push(t(LEFT + 6, rowY, 7, row, true));
      rowY -= 10;
    }
  }
  rowY = y;
  for (let i = 0; i < rightLines.length; i += 1) {
    for (const row of wrap(rightLines[i], 44)) {
      ops.push(t(mid + 6, rowY, 7, row, true));
      rowY -= 10;
    }
  }
  y = Math.min(rowY, y - 92) - 8;
  ops.push("0.85 0.85 0.85 rg\n");
  ops.push(rect(LEFT, y - 4, mid - LEFT, 14, true));
  ops.push(rect(mid, y - 4, RIGHT - mid, 14, true));
  ops.push("0 0 0 rg\n");
  ops.push(t(LEFT + 40, y, 8, "DECLARATION BY AGENT \"A\"", true));
  ops.push(t(mid + 36, y, 8, "DECLARATION BTY AGENT \"B\"", true));
  y -= 14;
  const declA =
    "I hereby declare I have read & understood the Real Estate Brokers Code of Ethics, I have a current Signed Seller's Agreement FORM A, I shall respond to a reasonable offer to Purchase the listed property from Agent B, & shall not contact Agent B's, Buyer nor confer with their client under no circumstances unless the nominates buyer herein has already discussed the stated list property with our office";
  const declB =
    "I hereby declare I have read & understood the Real Estate Brokers Code of Ethics, I have a current Signed Seller's Agreement FORM B, I shall encourage my Buyers as named herein, to submit a reasonable offer to the stated property & not contact Agent A's Seller nor confer with their client under no circumstances unless the Agent A has delayed out the proposal on the prescribed FORM with a reasonable reply within 24 hours.";
  let ya = y;
  let yb = y;
  for (const row of wrap(declA, 44)) {
    ops.push(t(LEFT + 6, ya, 6.5, row, true));
    ya -= 8;
  }
  for (const row of wrap(declB, 46)) {
    ops.push(t(mid + 6, yb, 6.5, row, true));
    yb -= 8;
  }
  y = Math.min(ya, yb) - 10;
  ops.push("0.85 0.85 0.85 rg\n");
  ops.push(rect(LEFT, y - 4, RIGHT - LEFT, 14, true));
  ops.push("0 0 0 rg\n");
  ops.push(t(LEFT + 6, y, 8, "PART 2. THE PROPERTY                         PART 3.  THE COMMISSION (split)", true));
  y -= 16;
  const prop = [
    `PROJECT NAME: ${v(data, "projectName")}`,
    `Property Type: ${v(data, "propertyType")}`,
    `MASTER DEVELOPER: ${v(data, "masterDeveloper")}`,
    `PROPERTY DETAILS (Listing Agent to Complete): ${v(data, "propertyDetails")}`,
    `IS THE PROPERTY TENANTED? ${v(data, "tenanted")}`,
  ];
  const comm = [
    "The following commission split is agreed between the seller's & the Buyer's Agent.",
    `SELLER'S AGENT: ${v(data, "sellerCommission")}     BUYER'S AGENT: ${v(data, "buyerCommission")}`,
    `BUYER'S NAME: - ${v(data, "buyerName")}     CONTACT: ${v(data, "buyerContact")}`,
    `TRANSFER FEE PAID BY: SELLER: ${v(data, "transferFeeSeller")}     BUYER: ${v(data, "transferFeeBuyer")}`,
    `Buyer BUDGET: ${v(data, "buyerBudget")}`,
    `Listed Price by Agent A: ${v(data, "listedPrice") || "____________________________"}`,
  ];
  let yp = y;
  let yc = y;
  for (const row of prop) {
    for (const lineRow of wrap(row, 42)) {
      ops.push(t(LEFT + 6, yp, 7, lineRow, true));
      yp -= 10;
    }
  }
  for (const row of comm) {
    for (const lineRow of wrap(row, 44)) {
      ops.push(t(mid + 6, yc, 7, lineRow, true));
      yc -= 10;
    }
  }
  y = Math.min(yp, yc) - 8;
  ops.push("0.8 0.8 0.8 rg\n");
  ops.push(rect(LEFT, y - 4, RIGHT - LEFT, 14, true));
  ops.push("0 0 0 rg\n");
  ops.push(t(LEFT + 6, y, 9, "PART 4. SIGNATURES", true));
  y -= 14;
  for (const row of wrap(
    "1-Both Agents are required to co-operate with each other. 2-Fully complete this form & both retain a fully signed & stamped copy on file.",
    95
  )) {
    ops.push(t(LEFT + 6, y, 7, row, true));
    y -= 10;
  }
  y -= 16;
  ops.push(t(LEFT + 6, y, 8, `Agent A - ${v(data, "agentASign") || "______________________________________"}`, true));
  ops.push(t(mid + 6, y, 8, `Agent B - ${v(data, "agentBSign") || "______________________________________"}`, true));
  y -= 20;
  ops.push(t(90, y, 8, "IN THE EVENT AGENT NOT RESPOND WITHIN 24HOURS, AGENT B MUST CONTACT RERA", true));
  y -= 14;
  if (v(data, "bEstablishment")) ops.push(t(200, y, 8, v(data, "bEstablishment"), true));
  if (v(data, "bPhone")) ops.push(t(LEFT + 6, y - 12, 7, `Tel: ${v(data, "bPhone")}`, true));

  const boxH = 730;
  ops.push(line(LEFT, 770, RIGHT, 770, 1.4));
  ops.push(line(LEFT, 770, LEFT, 770 - boxH, 1.4));
  ops.push(line(RIGHT, 770, RIGHT, 770 - boxH, 1.4));
  ops.push(line(LEFT, 770 - boxH, RIGHT, 770 - boxH, 1.4));

  const stream = ops.join("");
  const objects = [];
  const add = (bodyObj) => {
    objects.push(bodyObj);
    return objects.length;
  };
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>");
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
    let part;
    if (typeof object === "string") {
      part = Buffer.from(`${id} 0 obj\n${object}\nendobj\n`, "latin1");
    } else {
      part = Buffer.concat([
        Buffer.from(`${id} 0 obj\n${object.head}\nstream\n`, "latin1"),
        object.stream,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]);
    }
    chunks.push(part);
    length += part.length;
  });
  const xrefOffset = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer << /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}
