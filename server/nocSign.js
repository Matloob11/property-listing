import zlib from "node:zlib";

const MAX_CHARS = 700000;

export function normalizeOwnerSign(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^data:image\/(?:jpeg|jpg|png);base64,[A-Za-z0-9+/=\s]+$/.test(raw)) return "";
  if (raw.length < 32 || raw.length > MAX_CHARS) return "";
  return raw.replace(/\s+/g, "");
}

export function withOwnerSign(data, input) {
  return { ...data, ownerSign: normalizeOwnerSign(input?.ownerSign) };
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
      };
    }
    offset += 2 + length;
  }
  return null;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function applyPngFilter(filter, row, out, prev, bpp) {
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bpp ? out[i - bpp] : 0;
    const up = prev[i];
    const upLeft = i >= bpp ? prev[i - bpp] : 0;
    let recon = row[i];
    if (filter === 1) recon = (recon + left) & 255;
    else if (filter === 2) recon = (recon + up) & 255;
    else if (filter === 3) recon = (recon + ((left + up) >> 1)) & 255;
    else if (filter === 4) recon = (recon + paeth(left, up, upLeft)) & 255;
    out[i] = recon;
  }
}

export function decodePng(buffer) {
  if (!buffer || buffer.length < 16) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 12 <= buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const end = offset + 8 + len;
    if (end + 4 > buffer.length) break;
    const data = buffer.subarray(offset + 8, end);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = end + 4;
  }
  if (!width || !height || width > 2400 || height > 2400 || depth !== 8) return null;
  if (colorType !== 2 && colorType !== 6) return null;
  const bpp = colorType === 6 ? 4 : 3;
  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idats));
  } catch {
    return null;
  }
  const stride = width * bpp;
  if (inflated.length < height * (stride + 1)) return null;
  const raw = Buffer.alloc(height * stride);
  const prev = Buffer.alloc(stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src];
    src += 1;
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const out = raw.subarray(y * stride, (y + 1) * stride);
    applyPngFilter(filter, row, out, prev, bpp);
    out.copy(prev);
  }
  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);
  for (let i = 0, p = 0; i < width * height; i += 1, p += bpp) {
    rgb[i * 3] = raw[p];
    rgb[i * 3 + 1] = raw[p + 1];
    rgb[i * 3 + 2] = raw[p + 2];
    alpha[i] = bpp === 4 ? raw[p + 3] : 255;
  }
  return { w: width, h: height, rgb, alpha };
}

function pixelLum(r, g, b) {
  return (r + g + b) / 3;
}

function paperOf(rgb, alpha, w, h) {
  const rs = [];
  const gs = [];
  const bs = [];
  const take = (i) => {
    if (alpha[i] < 20) return;
    rs.push(rgb[i * 3]);
    gs.push(rgb[i * 3 + 1]);
    bs.push(rgb[i * 3 + 2]);
  };
  for (let x = 0; x < w; x += 1) {
    take(x);
    take((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    take(y * w);
    take(y * w + (w - 1));
  }
  const step = Math.max(1, Math.floor((w * h) / 400));
  for (let i = 0; i < w * h; i += step) take(i);
  if (!rs.length) return { r: 240, g: 240, b: 240, L: 240, sat: 0 };
  const mid = (arr) => {
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  };
  const r = mid(rs);
  const g = mid(gs);
  const b = mid(bs);
  return { r, g, b, L: pixelLum(r, g, b), sat: Math.max(r, g, b) - Math.min(r, g, b) };
}

function inkScore(r, g, b, a, paper) {
  if (a < 16) return 0;
  const L = pixelLum(r, g, b);
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const dist = Math.abs(r - paper.r) + Math.abs(g - paper.g) + Math.abs(b - paper.b);
  const darker = paper.L - L;
  if (dist < 22 && darker < 10) return 0;
  let score = 0;
  if (darker > 0) score += darker;
  if (sat > paper.sat) score += (sat - paper.sat) * 0.85;
  if (b > r + 6 && b >= g) score += 24;
  if (r > g + 14 && r > b + 14) score += 20;
  return score;
}

function markInk(rgb, alpha, w, h, need = 28) {
  const paper = paperOf(rgb, alpha, w, h);
  const keep = Buffer.alloc(w * h);
  let count = 0;
  for (let i = 0; i < w * h; i += 1) {
    if (inkScore(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], alpha[i], paper) < need) continue;
    keep[i] = 1;
    count += 1;
  }
  return { keep, count, paper };
}

function findSignatureCluster(keep, w, h) {
  const labels = new Int32Array(w * h);
  const comps = [];
  const stack = [];
  const minArea = Math.max(8, Math.round(w * h * 0.00012));
  let next = 1;
  for (let start = 0; start < w * h; start += 1) {
    if (!keep[start] || labels[start]) continue;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let count = 0;
    labels[start] = next;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      count += 1;
      const x = p % w;
      const y = (p - x) / w;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (!keep[np] || labels[np]) continue;
          labels[np] = next;
          stack.push(np);
        }
      }
    }
    if (count >= minArea) comps.push({ id: next, minX, minY, maxX, maxY, count });
    next += 1;
  }
  if (!comps.length) return null;
  const ranked = comps
    .map((c) => {
      const edges =
        (c.minX <= 1 ? 1 : 0) + (c.minY <= 1 ? 1 : 0) + (c.maxX >= w - 2 ? 1 : 0) + (c.maxY >= h - 2 ? 1 : 0);
      const bw = c.maxX - c.minX + 1;
      const bh = c.maxY - c.minY + 1;
      const frame = edges >= 3 || (edges >= 2 && (bw * bh) / (w * h) > 0.4);
      const cx = (c.minX + c.maxX) / 2 / w - 0.5;
      const cy = (c.minY + c.maxY) / 2 / h - 0.5;
      const center = 1 - Math.min(1, Math.hypot(cx, cy) * 1.6);
      return { c, frame, score: frame ? -1 : c.count * (0.6 + 0.4 * center) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  const main = (ranked[0] || { c: comps.sort((a, b) => b.count - a.count)[0] }).c;
  const padX = Math.max(16, (main.maxX - main.minX + 1) * 0.5);
  const padY = Math.max(12, (main.maxY - main.minY + 1) * 0.65);
  const keepIds = new Set([main.id]);
  let minX = main.minX;
  let minY = main.minY;
  let maxX = main.maxX;
  let maxY = main.maxY;
  for (const row of ranked.length ? ranked : comps.map((c) => ({ c, frame: false }))) {
    const c = row.c;
    if (keepIds.has(c.id) || row.frame) continue;
    const near =
      c.maxX >= main.minX - padX &&
      c.minX <= main.maxX + padX &&
      c.maxY >= main.minY - padY &&
      c.minY <= main.maxY + padY;
    if (!near) continue;
    keepIds.add(c.id);
    minX = Math.min(minX, c.minX);
    minY = Math.min(minY, c.minY);
    maxX = Math.max(maxX, c.maxX);
    maxY = Math.max(maxY, c.maxY);
  }
  return { labels, keepIds, minX, minY, maxX, maxY };
}

function cropInk(img, cluster) {
  const { w, rgb, alpha } = img;
  const pad = 6;
  const x0 = Math.max(0, cluster.minX - pad);
  const y0 = Math.max(0, cluster.minY - pad);
  const x1 = Math.min(w - 1, cluster.maxX + pad);
  const y1 = Math.min(img.h - 1, cluster.maxY + pad);
  const nw = x1 - x0 + 1;
  const nh = y1 - y0 + 1;
  const nextRgb = Buffer.alloc(nw * nh * 3, 255);
  const nextAlpha = Buffer.alloc(nw * nh);
  for (let y = 0; y < nh; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      const src = (y0 + y) * w + (x0 + x);
      const dst = y * nw + x;
      const on = cluster.keepIds ? cluster.labels[src] && cluster.keepIds.has(cluster.labels[src]) : cluster.keep?.[src];
      if (!on) continue;
      nextRgb[dst * 3] = rgb[src * 3];
      nextRgb[dst * 3 + 1] = rgb[src * 3 + 1];
      nextRgb[dst * 3 + 2] = rgb[src * 3 + 2];
      nextAlpha[dst] = 255;
    }
  }
  return { kind: "png", w: nw, h: nh, rgb: nextRgb, alpha: nextAlpha };
}

function cropOpaque(img) {
  const { w, h, alpha } = img;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  const keep = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i += 1) {
    if (alpha[i] < 20) continue;
    keep[i] = 1;
    count += 1;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!count) return img;
  return cropInk(img, { keep, minX, minY, maxX, maxY });
}

export function extractSignatureInk(img) {
  if (!img?.rgb || !img?.alpha || !img.w || !img.h) return img;
  const { w, h, rgb, alpha } = img;
  let clear = 0;
  for (let i = 0; i < w * h; i += 1) if (alpha[i] < 16) clear += 1;
  if (clear / (w * h) > 0.08) return cropOpaque(img);

  for (const need of [28, 42, 62, 88, 120]) {
    const marked = markInk(rgb, alpha, w, h, need);
    if (marked.count < 8) continue;
    const cluster = findSignatureCluster(marked.keep, w, h);
    const used = cluster || (() => {
      let minX = w;
      let minY = h;
      let maxX = 0;
      let maxY = 0;
      for (let i = 0; i < w * h; i += 1) {
        if (!marked.keep[i]) continue;
        const x = i % w;
        const y = (i - x) / w;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      return { keep: marked.keep, minX, minY, maxX, maxY };
    })();
    const box = (used.maxX - used.minX + 1) * (used.maxY - used.minY + 1);
    const cover = box / (w * h);
    if (cover > 0.62 && need !== 120) continue;
    return cropInk(img, used);
  }
  return img;
}

export function placeOwnerSign(img, { left, y, fontSize, label }) {
  const labelW = String(label || "Owner Signature:").length * fontSize * 0.5;
  const lineX = left + labelW + 8;
  const lineW = 250;
  const lineY = y - 1;
  return {
    line: { x1: lineX, y1: lineY, x2: lineX + lineW, y2: lineY },
    image: img ? { ...img, x: lineX + 2, y: lineY, maxW: 248, maxH: 80 } : null,
  };
}

export function imageFromOwnerSign(value) {
  const raw = normalizeOwnerSign(value);
  const jpegMatch = /^data:image\/(?:jpeg|jpg);base64,(.+)$/i.exec(raw);
  if (jpegMatch) {
    try {
      const data = Buffer.from(jpegMatch[1], "base64");
      const size = jpegSize(data);
      if (!size || !size.width || !size.height) return null;
      return { kind: "jpeg", data, w: size.width, h: size.height };
    } catch {
      return null;
    }
  }
  const pngMatch = /^data:image\/png;base64,(.+)$/i.exec(raw);
  if (!pngMatch) return null;
  try {
    const decoded = decodePng(Buffer.from(pngMatch[1], "base64"));
    if (!decoded) return null;
    return extractSignatureInk({ kind: "png", ...decoded });
  } catch {
    return null;
  }
}

export function jpegFromOwnerSign(value) {
  return imageFromOwnerSign(value);
}

export function fitSign(img, maxW, maxH) {
  const scale = Math.min(1, maxW / Math.max(img.w, 1), maxH / Math.max(img.h, 1));
  return { w: img.w * scale, h: img.h * scale };
}

export function finishLetterPdf({ pageW, pageH, stream, image, roman = "Times-Roman", bold = "Times-Bold" }) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const f1 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${roman} /Encoding /WinAnsiEncoding >>`);
  const f2 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${bold} /Encoding /WinAnsiEncoding >>`);
  let extra = "";
  let imgId = 0;
  if (image?.w && image?.h) {
    const box = fitSign(image, image.maxW || 132, image.maxH || 36);
    extra = `q ${box.w.toFixed(2)} 0 0 ${box.h.toFixed(2)} ${image.x.toFixed(2)} ${image.y.toFixed(2)} cm /ImS Do Q\n`;
    if (image.kind === "png" && image.rgb && image.alpha) {
      const rgbZ = zlib.deflateSync(image.rgb);
      const aZ = zlib.deflateSync(image.alpha);
      const smaskId = add({
        head: `<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${aZ.length} >>`,
        stream: aZ,
      });
      imgId = add({
        head: `<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${smaskId} 0 R /Length ${rgbZ.length} >>`,
        stream: rgbZ,
      });
    } else if (image.data) {
      imgId = add({
        head: `<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>`,
        stream: image.data,
      });
    }
  }
  const full = `${stream}${extra}`;
  const content = add({ head: `<< /Length ${Buffer.byteLength(full, "latin1")} >>`, stream: Buffer.from(full, "latin1") });
  const xobj = imgId ? `/XObject << /ImS ${imgId} 0 R >>` : "";
  const page = add(
    `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${content} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${xobj} >> >>`
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
