import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { decodePng, extractSignatureInk, fitSign, jpegFromOwnerSign, normalizeOwnerSign, placeOwnerSign } from "./nocSign.js";
import { missingDetails, normalizeForm } from "./noc.js";
import { nocPdf } from "./nocPdf.js";
import { nocMaintPdf } from "./nocMaintPdf.js";
import { nocMoveinPdf, nocMoveoutPdf } from "./nocMoveinPdf.js";
import { nocTrakheesiPdf } from "./nocTrakheesiPdf.js";

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const tag = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([len, tag, data, crc]);
}

function tinyPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.from([0, 20, 40, 180, 255]);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function tinyJpeg() {
  const buf = Buffer.alloc(32, 0);
  let i = 0;
  buf[i++] = 0xff;
  buf[i++] = 0xd8;
  buf[i++] = 0xff;
  buf[i++] = 0xc0;
  buf.writeUInt16BE(17, i);
  i += 2;
  buf[i++] = 8;
  buf.writeUInt16BE(1, i);
  i += 2;
  buf.writeUInt16BE(1, i);
  i += 2;
  buf[i++] = 3;
  buf[i++] = 1;
  buf[i++] = 0x11;
  buf[i++] = 0;
  buf[i++] = 2;
  buf[i++] = 0x11;
  buf[i++] = 0;
  buf[i++] = 3;
  buf[i++] = 0x11;
  buf[i++] = 0;
  buf[i++] = 0xff;
  buf[i++] = 0xd9;
  return buf.subarray(0, i);
}

const SIGN = `data:image/jpeg;base64,${tinyJpeg().toString("base64")}`;

test("owner signature is optional and keeps jpeg or png data urls", () => {
  assert.equal(normalizeOwnerSign(""), "");
  assert.equal(normalizeOwnerSign("not-an-image"), "");
  assert.equal(normalizeOwnerSign(SIGN), SIGN);
  const form = normalizeForm({
    ownerName: "TEST OWNER",
    emiratesId: "784-0000-0000000-0",
    location: "Dubai",
    plotNo: "12",
    ownerSign: SIGN,
  });
  assert.equal(form.ownerSign, SIGN);
  assert.equal(missingDetails(form), "");
  assert.equal(normalizeForm({ ownerName: "A", emiratesId: "1", location: "D", plotNo: "2" }).ownerSign, "");
});

test("NOC PDF stays valid without a sign and embeds a sign when present", () => {
  const data = {
    ownerName: "TEST OWNER",
    emiratesId: "784-0000-0000000-0",
    location: "Dubai",
    plotNo: "12",
    date: "22 September 2026",
  };
  const blank = nocPdf(data);
  assert.equal(blank.subarray(0, 5).toString(), "%PDF-");
  assert.equal(blank.includes(Buffer.from("/ImS")), false);

  const img = jpegFromOwnerSign(SIGN);
  assert.ok(img);
  const signed = nocPdf({ ...data, ownerSign: SIGN });
  assert.equal(signed.subarray(0, 5).toString(), "%PDF-");
  assert.equal(signed.includes(Buffer.from("/ImS")), true);
  assert.ok(signed.length > blank.length);

  const png = `data:image/png;base64,${tinyPng().toString("base64")}`;
  assert.equal(normalizeOwnerSign(png), png);
  const decoded = decodePng(tinyPng());
  assert.equal(decoded?.w, 1);
  assert.equal(decoded?.h, 1);
  assert.equal(decoded?.rgb[2], 180);
  const pngPdf = nocPdf({ ...data, ownerSign: png });
  assert.equal(pngPdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(pngPdf.includes(Buffer.from("/SMask")), true);
});

test("extractSignatureInk keeps only the pen stroke, not the paper photo", () => {
  const w = 40;
  const h = 20;
  const rgb = Buffer.alloc(w * h * 3, 244);
  const alpha = Buffer.alloc(w * h, 255);
  for (let x = 14; x <= 22; x += 1) {
    const i = 9 * w + x;
    rgb[i * 3] = 28;
    rgb[i * 3 + 1] = 46;
    rgb[i * 3 + 2] = 188;
  }
  const out = extractSignatureInk({ w, h, rgb, alpha });
  assert.ok(out.w < w);
  assert.ok(out.h < h);
  assert.ok(out.w < 28);
  assert.ok(out.h < 18);
  assert.ok(out.alpha.some((v) => v === 0));
  assert.ok(out.alpha.some((v) => v > 200));
  const ink = [...out.alpha].findIndex((v) => v > 200);
  assert.ok(ink >= 0);
  assert.ok(out.rgb[ink * 3 + 2] >= 160, "blue ink must stay exact, not a photo box");
});

test("extractSignatureInk lifts a centered sign off a paper photo with corner shadows", () => {
  const w = 200;
  const h = 120;
  const rgb = Buffer.alloc(w * h * 3, 248);
  const alpha = Buffer.alloc(w * h, 255);
  for (let y = 0; y < 14; y += 1) {
    for (let x = 0; x < 14; x += 1) {
      for (const [ox, oy] of [
        [0, 0],
        [w - 14, 0],
        [0, h - 14],
        [w - 14, h - 14],
      ]) {
        const i = (oy + y) * w + (ox + x);
        rgb[i * 3] = 92;
        rgb[i * 3 + 1] = 92;
        rgb[i * 3 + 2] = 96;
      }
    }
  }
  for (let y = 48; y <= 68; y += 1) {
    for (let x = 70; x <= 138; x += 1) {
      const along = (x - 70) / 68;
      const mid = Math.abs((y - 58) / 10);
      if (mid > 0.18 + 0.35 * Math.sin(along * Math.PI * 3)) continue;
      const i = y * w + x;
      rgb[i * 3] = 32;
      rgb[i * 3 + 1] = 48;
      rgb[i * 3 + 2] = 176;
    }
  }
  const out = extractSignatureInk({ w, h, rgb, alpha });
  assert.ok(out.w < 100, `crop width ${out.w}`);
  assert.ok(out.h < 50, `crop height ${out.h}`);
  assert.ok(out.w > 40, `sign too thin ${out.w}`);
  assert.ok(out.h > 12, `sign too flat ${out.h}`);
  assert.ok(out.alpha.some((v) => v === 0));
  const ink = [...out.alpha].filter((v) => v > 200).length;
  assert.ok(ink > 80, `ink pixels ${ink}`);
});

test("all four NOC PDFs put a signed image on the signature line", () => {
  const png = `data:image/png;base64,${tinyPng().toString("base64")}`;
  const base = {
    ownerName: "TEST OWNER",
    emiratesId: "784-0000-0000000-0",
    location: "Dubai",
    plotNo: "12",
    recipient: "Building Management",
    propertyDetails: "Villa 12",
    companyName: "A7 GROUP REAL ESTATE LLC",
    scopeText: "AC service",
    property: "Villa 12",
    tenantName: "Tenant",
    tenantEid: "784-1",
    building: "A",
    annualRent: "100000",
    ownerSign: png,
  };
  for (const pdf of [nocPdf(base), nocMaintPdf(base), nocMoveinPdf(base), nocMoveoutPdf(base), nocTrakheesiPdf(base)]) {
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.equal(pdf.includes(Buffer.from("/ImS")), true);
    assert.equal(pdf.includes(Buffer.from("/SMask")), true);
  }
});

test("gray camera paper is not kept as a white photo box", () => {
  const w = 80;
  const h = 50;
  const rgb = Buffer.alloc(w * h * 3);
  const alpha = Buffer.alloc(w * h, 255);
  for (let i = 0; i < w * h; i += 1) {
    rgb[i * 3] = 208;
    rgb[i * 3 + 1] = 206;
    rgb[i * 3 + 2] = 200;
  }
  for (let y = 18; y <= 30; y += 1) {
    for (let x = 22; x <= 56; x += 1) {
      if (Math.abs(y - 24) > 2) continue;
      const i = y * w + x;
      rgb[i * 3] = 30;
      rgb[i * 3 + 1] = 48;
      rgb[i * 3 + 2] = 170;
    }
  }
  const out = extractSignatureInk({ w, h, rgb, alpha });
  let paperish = 0;
  for (let i = 0; i < out.w * out.h; i += 1) {
    if (out.alpha[i] < 20) continue;
    const L = (out.rgb[i * 3] + out.rgb[i * 3 + 1] + out.rgb[i * 3 + 2]) / 3;
    if (L > 180) paperish += 1;
  }
  assert.ok(paperish < 20, `paper pixels ${paperish}`);
  assert.ok(out.alpha.some((v) => v === 0));
});

test("dark camera paper is not kept as a photo box", () => {
  const w = 80;
  const h = 50;
  const rgb = Buffer.alloc(w * h * 3);
  const alpha = Buffer.alloc(w * h, 255);
  for (let i = 0; i < w * h; i += 1) {
    rgb[i * 3] = 48;
    rgb[i * 3 + 1] = 46;
    rgb[i * 3 + 2] = 44;
  }
  for (let y = 18; y <= 30; y += 1) {
    for (let x = 22; x <= 56; x += 1) {
      if (Math.abs(y - 24) > 2) continue;
      const i = y * w + x;
      rgb[i * 3] = 30;
      rgb[i * 3 + 1] = 48;
      rgb[i * 3 + 2] = 170;
    }
  }
  const out = extractSignatureInk({ w, h, rgb, alpha });
  let darkBox = 0;
  let blue = 0;
  for (let i = 0; i < out.w * out.h; i += 1) {
    if (out.alpha[i] < 20) continue;
    const L = (out.rgb[i * 3] + out.rgb[i * 3 + 1] + out.rgb[i * 3 + 2]) / 3;
    if (out.rgb[i * 3 + 2] > 140) blue += 1;
    else if (L < 80) darkBox += 1;
  }
  assert.ok(blue > 10, `blue ink ${blue}`);
  assert.ok(darkBox < 30, `dark paper pixels ${darkBox}`);
});

test("placeOwnerSign sits the ink on the line next to the label", () => {
  const placed = placeOwnerSign({ w: 80, h: 24, kind: "png" }, { left: 60, y: 280, fontSize: 11, label: "Owner Signature:" });
  assert.ok(placed.line.x1 > 60);
  assert.equal(placed.image.x, placed.line.x1 + 2);
  assert.equal(placed.image.y, placed.line.y1);
  assert.ok(placed.image.maxW >= 220);
  assert.ok(placed.image.maxH >= 70);
  const exact = fitSign({ w: 120, h: 48 }, 248, 80);
  assert.equal(exact.w, 120);
  assert.equal(exact.h, 48);
});
