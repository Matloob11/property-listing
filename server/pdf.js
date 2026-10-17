// Small dependency-free PDF writer: A4 pages, Helvetica text with wrapping and
// automatic page breaks, and JPEG images (used for drawn signatures).

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;

function pdfString(value) {
  return String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, "-")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

// Rough Helvetica width table (per 1pt font size) for wrapping.
const WIDTHS = {
  " ": 0.278, "!": 0.278, '"': 0.355, "#": 0.556, "$": 0.556, "%": 0.889, "&": 0.667, "'": 0.191,
  "(": 0.333, ")": 0.333, "*": 0.389, "+": 0.584, ",": 0.278, "-": 0.333, ".": 0.278, "/": 0.278,
  "0": 0.556, "1": 0.556, "2": 0.556, "3": 0.556, "4": 0.556, "5": 0.556, "6": 0.556, "7": 0.556,
  "8": 0.556, "9": 0.556, ":": 0.278, ";": 0.278, "<": 0.584, "=": 0.584, ">": 0.584, "?": 0.556,
  "@": 1.015, A: 0.667, B: 0.667, C: 0.722, D: 0.722, E: 0.667, F: 0.611, G: 0.778, H: 0.722,
  I: 0.278, J: 0.5, K: 0.667, L: 0.556, M: 0.833, N: 0.722, O: 0.778, P: 0.667, Q: 0.778,
  R: 0.722, S: 0.667, T: 0.611, U: 0.722, V: 0.667, W: 0.944, X: 0.667, Y: 0.667, Z: 0.611,
  "[": 0.278, "\\": 0.278, "]": 0.278, "^": 0.469, _: 0.556, "`": 0.333, a: 0.556, b: 0.556,
  c: 0.5, d: 0.556, e: 0.556, f: 0.278, g: 0.556, h: 0.556, i: 0.222, j: 0.222, k: 0.5, l: 0.222,
  m: 0.833, n: 0.556, o: 0.556, p: 0.556, q: 0.556, r: 0.333, s: 0.5, t: 0.278, u: 0.556,
  v: 0.5, w: 0.722, x: 0.5, y: 0.5, z: 0.5, "{": 0.334, "|": 0.26, "}": 0.334, "~": 0.584,
};

export function textWidth(text, size, bold) {
  let width = 0;
  for (const char of String(text || "")) width += (WIDTHS[char] ?? 0.6) * (bold ? 1.05 : 1);
  return width * size;
}

export function wrapText(text, size, maxWidth, bold) {
  const lines = [];
  for (const paragraph of String(text || "").split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (textWidth(candidate, size, bold) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function jpegSize(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        components: buffer[offset + 9],
      };
    }
    offset += 2 + length;
  }
  return null;
}

export class PdfDoc {
  constructor() {
    this.pages = [];
    this.images = [];
    this.newPage();
  }

  newPage() {
    this.page = { ops: [], images: new Set() };
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
    return this;
  }

  get contentWidth() {
    return PAGE_W - MARGIN * 2;
  }

  ensure(height) {
    if (this.y - height < MARGIN) this.newPage();
  }

  moveDown(points) {
    this.y -= points;
    if (this.y < MARGIN) this.newPage();
    return this;
  }

  rawText(text, x, y, size, bold, color) {
    const font = bold ? "/F2" : "/F1";
    const rgb = color ? `${color.join(" ")} rg ` : "0 0 0 rg ";
    this.page.ops.push(`q 0 w 0 Tr BT 0 Tc 0 Tw ${rgb}${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfString(text)}) Tj ET Q`);
  }

  // Paragraph with wrapping and page breaks.
  text(text, options = {}) {
    const size = options.size || 10.5;
    const bold = Boolean(options.bold);
    const gap = options.gap ?? size * 0.45;
    const indent = options.indent || 0;
    const width = (options.width || this.contentWidth) - indent;
    const lines = wrapText(text, size, width, bold);
    const lineHeight = size * 1.35;
    for (const line of lines) {
      this.ensure(lineHeight);
      const x = options.align === "center"
        ? MARGIN + indent + (width - textWidth(line, size, bold)) / 2
        : options.align === "right"
          ? MARGIN + indent + width - textWidth(line, size, bold)
          : MARGIN + indent + (options.x || 0);
      this.rawText(line, x, this.y - size, size, bold, options.color);
      this.y -= lineHeight;
    }
    this.y -= gap;
    return this;
  }

  heading(text, size = 13) {
    this.ensure(size * 2.4);
    this.y -= 4;
    this.text(text, { size, bold: true, gap: 4 });
    this.line();
    return this;
  }

  line(color = [0.8, 0.8, 0.8]) {
    this.ensure(8);
    this.page.ops.push(`${color.join(" ")} RG 0.8 w ${MARGIN} ${this.y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${this.y.toFixed(2)} l S`);
    this.y -= 8;
    return this;
  }

  // Two-column label / value rows.
  rows(pairs, options = {}) {
    const size = options.size || 10;
    const labelWidth = options.labelWidth || 150;
    for (const [label, value] of pairs) {
      const valueLines = wrapText(value || "-", size, this.contentWidth - labelWidth - 8, false);
      const height = Math.max(1, valueLines.length) * size * 1.4 + 3;
      this.ensure(height);
      this.rawText(label, MARGIN, this.y - size, size, false, [0.42, 0.4, 0.38]);
      valueLines.forEach((line, index) => {
        this.rawText(line, MARGIN + labelWidth, this.y - size - index * size * 1.4, size, true);
      });
      this.y -= height;
    }
    this.y -= 4;
    return this;
  }

  // Draws a JPEG. Returns false if the buffer is not a JPEG.
  image(jpegBuffer, options = {}) {
    const meta = jpegSize(jpegBuffer);
    if (!meta) return false;
    const maxW = options.width || 180;
    const maxH = options.height || 70;
    const scale = Math.min(maxW / meta.width, maxH / meta.height, 1);
    const w = meta.width * scale;
    const h = meta.height * scale;
    this.ensure(h + 6);
    const index = this.images.push({ buffer: jpegBuffer, meta }) - 1;
    const name = `/Im${index}`;
    this.page.images.add(index);
    const x = MARGIN + (options.x || 0);
    const y = this.y - h;
    this.page.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm ${name} Do Q`);
    if (!options.keepY) this.y -= h + 6;
    return true;
  }

  box(height, options = {}) {
    this.ensure(height);
    const x = MARGIN + (options.x || 0);
    const w = options.width || this.contentWidth;
    this.page.ops.push(`0.85 0.85 0.85 RG 0.6 w ${x.toFixed(2)} ${(this.y - height).toFixed(2)} ${w.toFixed(2)} ${height.toFixed(2)} re S`);
    return this;
  }

  render() {
    const objects = [];
    const add = (body) => objects.push(body) - 1 + 1; // 1-based id
    const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const imageIds = this.images.map((image) => {
      const { meta, buffer } = image;
      const colorSpace = meta.components === 1 ? "/DeviceGray" : meta.components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
      return add({
        head: `<< /Type /XObject /Subtype /Image /Width ${meta.width} /Height ${meta.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${buffer.length} >>`,
        stream: buffer,
      });
    });
    const pagesId = objects.length + this.pages.length * 2 + 1;
    const pageIds = [];
    for (const [index, page] of this.pages.entries()) {
      const content = page.ops.join("\n");
      const contentId = add({ head: `<< /Length ${Buffer.byteLength(content, "latin1")} >>`, stream: Buffer.from(content, "latin1") });
      const xobjects = [...page.images].map((i) => `/Im${i} ${imageIds[i]} 0 R`).join(" ");
      const footer = `q 0 w 0 Tr BT 0 Tc 0 Tw /F1 8 Tf 0.5 0.5 0.5 rg ${MARGIN} 28 Td (Page ${index + 1} of ${this.pages.length}) Tj ET Q`;
      // Append the footer to the content stream.
      const withFooter = `${content}\n${footer}`;
      objects[contentId - 1] = { head: `<< /Length ${Buffer.byteLength(withFooter, "latin1")} >>`, stream: Buffer.from(withFooter, "latin1") };
      const pageId = add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> ${xobjects ? `/XObject << ${xobjects} >>` : ""} >> >>`
      );
      pageIds.push(pageId);
    }
    const realPagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    // Fix parent references (pagesId was predicted; patch if different).
    if (realPagesId !== pagesId) {
      for (const id of pageIds) {
        objects[id - 1] = objects[id - 1].replace(`/Parent ${pagesId} 0 R`, `/Parent ${realPagesId} 0 R`);
      }
    }
    const catalogId = add(`<< /Type /Catalog /Pages ${realPagesId} 0 R >>`);

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
    xref += `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    chunks.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(chunks);
  }
}

export function dataUrlToJpeg(dataUrl) {
  const match = /^data:image\/jpeg;base64,(.+)$/i.exec(String(dataUrl || "").trim());
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  return jpegSize(buffer) ? buffer : null;
}
