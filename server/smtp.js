// Minimal SMTP (STARTTLS + AUTH LOGIN) sender with an optional PDF attachment.
// Mirrors the Bitrix tenancy tool's Mailer so the same Gmail app password works.
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP timeout"));
    }, 20000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function expect(socket, code, label) {
  const reply = await readReply(socket);
  if (!reply.startsWith(code)) throw new Error(`${label}: ${reply.trim().slice(0, 160)}`);
  return reply;
}

function write(socket, line) {
  socket.write(`${line}\r\n`);
}

function encodeHeader(text) {
  return /[^\x20-\x7E]/.test(text) ? `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=` : text;
}

function maskEmail(value) {
  const raw = String(value || "").trim();
  const at = raw.indexOf("@");
  if (at < 1) return "";
  const name = raw.slice(0, at);
  return `${name.slice(0, Math.min(2, name.length))}***@${raw.slice(at + 1)}`;
}

function smtpDate(date = new Date()) {
  return date.toUTCString().replace(/GMT$/, "+0000");
}

function smtpMessageId() {
  return `<${Date.now()}.${crypto.randomBytes(8).toString("hex")}@listings.srv1802669.hstgr.cloud>`;
}

function crlf(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}

function logSmtp(recipient, ok, extra = "") {
  const bits = [`smtp to=${maskEmail(recipient)}`, `ok=${ok}`];
  if (extra) bits.push(extra);
  console.log(bits.join(" "));
}

export function smtpConfigured() {
  return Boolean(process.env.TENANCY_SMTP_EMAIL && process.env.TENANCY_SMTP_APP_PASSWORD);
}

function mailFiles({ pdf, pdfName, attachments }) {
  const files = [];
  if (pdf && pdf.length) {
    files.push({ name: pdfName || "tenancy-contract.pdf", mime: "application/pdf", buffer: pdf });
  }
  for (const item of Array.isArray(attachments) ? attachments : []) {
    if (item?.buffer?.length) files.push(item);
  }
  return files;
}

export function buildMailData({
  recipient,
  subject,
  body,
  fromName,
  fromEmail,
  pdf,
  pdfName = "tenancy-contract.pdf",
  attachments = [],
}) {
  const headers = [
    `From: ${encodeHeader(fromName)} <${fromEmail}>`,
    `To: <${recipient}>`,
    `Reply-To: ${encodeHeader(fromName)} <${fromEmail}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${smtpDate()}`,
    `Message-ID: ${smtpMessageId()}`,
    "MIME-Version: 1.0",
  ];
  const files = mailFiles({ pdf, pdfName, attachments });
  if (!files.length) {
    headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit");
    return `${headers.join("\r\n")}\r\n\r\n${crlf(body)}\r\n.`;
  }
  const boundary = `bnd${crypto.randomBytes(8).toString("hex")}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  let data = `${headers.join("\r\n")}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${crlf(body)}\r\n`;
  for (const file of files) {
    const safeName = String(file.name || "file").replace(/[^\w.-]+/g, "_") || "file";
    const mime = String(file.mime || "application/octet-stream");
    const b64 = Buffer.from(file.buffer).toString("base64").replace(/(.{76})/g, "$1\r\n");
    data +=
      `--${boundary}\r\nContent-Type: ${mime}; name="${safeName}"\r\nContent-Disposition: attachment; filename="${safeName}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n`;
  }
  return `${data}--${boundary}--\r\n.`;
}

export async function sendMail({ to, subject, body, pdf, pdfName = "tenancy-contract.pdf", attachments = [] }) {
  const recipient = String(to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return { ok: false, error: "Invalid email" };
  const user = process.env.TENANCY_SMTP_EMAIL || "";
  const pass = String(process.env.TENANCY_SMTP_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) return { ok: false, error: "Tenancy SMTP is not configured." };
  const host = process.env.TENANCY_SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.TENANCY_SMTP_PORT || 587);
  const fromName = process.env.TENANCY_SMTP_FROM_NAME || "A7 Group Real Estate";
  const helo = "listings.srv1802669.hstgr.cloud";

  let socket;
  try {
    socket = await new Promise((resolve, reject) => {
      const s = net.connect({ host, port }, () => resolve(s));
      s.once("error", reject);
      s.setTimeout(20000, () => reject(new Error("SMTP connect timeout")));
    });
    await expect(socket, "220", "SMTP banner failed");
    write(socket, `EHLO ${helo}`);
    await expect(socket, "250", "EHLO failed");
    write(socket, "STARTTLS");
    await expect(socket, "220", "STARTTLS not accepted");
    socket = await new Promise((resolve, reject) => {
      const secure = tls.connect({ socket, servername: host }, () => resolve(secure));
      secure.once("error", reject);
    });
    write(socket, `EHLO ${helo}`);
    await expect(socket, "250", "EHLO after TLS failed");
    write(socket, "AUTH LOGIN");
    await expect(socket, "334", "AUTH not accepted");
    write(socket, Buffer.from(user).toString("base64"));
    await expect(socket, "334", "SMTP username rejected");
    write(socket, Buffer.from(pass).toString("base64"));
    await expect(socket, "235", "SMTP login failed");
    write(socket, `MAIL FROM:<${user}>`);
    await expect(socket, "250", "MAIL FROM rejected");
    write(socket, `RCPT TO:<${recipient}>`);
    await expect(socket, "250", "Recipient rejected");
    write(socket, "DATA");
    await expect(socket, "354", "DATA not accepted");

    const files = mailFiles({ pdf, pdfName, attachments });
    const data = buildMailData({
      recipient,
      subject,
      body,
      fromName,
      fromEmail: user,
      pdf,
      pdfName,
      attachments,
    });
    write(socket, data.replace(/\r\n\.(?=\r\n)/g, "\r\n.."));
    await expect(socket, "250", "Message not accepted");
    write(socket, "QUIT");
    socket.end();
    logSmtp(recipient, true, `files=${files.length}`);
    return { ok: true };
  } catch (error) {
    try {
      socket?.destroy();
    } catch {
      /* ignore */
    }
    const message = error.message || "SMTP failed";
    logSmtp(recipient, false, `err=${message.slice(0, 80)}`);
    return { ok: false, error: message };
  }
}
