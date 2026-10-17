import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export function ensureUploadDir(root) {
  const dir = path.join(root, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveUpload(root, { filename, mime, data }) {
  const type = String(mime || "").toLowerCase();
  if (!ALLOWED.has(type)) {
    throw new Error("Only images and PDF files can be uploaded.");
  }
  const raw = String(data || "").replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length) throw new Error("File data is empty.");
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("File must be 8 MB or smaller.");
  }
  const ext =
    type === "application/pdf"
      ? "pdf"
      : type.split("/")[1] === "jpeg"
        ? "jpg"
        : type.split("/")[1];
  const safe = String(filename || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 40);
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe || "file"}.${ext}`;
  const dir = ensureUploadDir(root);
  fs.writeFileSync(path.join(dir, name), buffer);
  return { url: `/uploads/${name}`, name, mime: type };
}
