/** Send a PDF into a Bitrix private chat. Uses BITRIX_IM_WEBHOOK only. */

const METHODS = new Set(["user.current", "disk.storage.getlist", "disk.folder.uploadfile", "im.disk.file.commit"]);

export function messengerWebhook() {
  return String(process.env.BITRIX_IM_WEBHOOK || "").trim().replace(/\/$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryable(status, detail) {
  return status === 429 || status >= 500 || /too many|query_limit|429/i.test(String(detail || ""));
}

async function imCall(method, params, attempt = 0) {
  if (!METHODS.has(method)) throw new Error("blocked");
  const webhook = messengerWebhook();
  if (!webhook) {
    const error = new Error("Messenger webhook is not configured");
    error.status = 503;
    throw error;
  }
  const res = await fetch(`${webhook}/${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  const detail = body?.error_description || body?.error || text.slice(0, 160) || "Bitrix messenger failed";
  if ((!res.ok || body?.error) && attempt < 2 && retryable(res.status, detail)) {
    await sleep(4000 * (attempt + 1));
    return imCall(method, params, attempt + 1);
  }
  if (!res.ok || body?.error) {
    const error = new Error(String(detail).slice(0, 180));
    error.status = res.status || 502;
    throw error;
  }
  return body?.result;
}

let cachedFolderId = "";

async function senderFolderId() {
  if (cachedFolderId) return cachedFolderId;
  const me = await imCall("user.current", {});
  const ownerId = String(me?.ID || "").replace(/\D/g, "");
  const listed = await imCall("disk.storage.getlist", { filter: { ENTITY_TYPE: "user", ENTITY_ID: ownerId } });
  const rows = Array.isArray(listed) ? listed : [];
  cachedFolderId = String(rows[0]?.ROOT_OBJECT_ID || "");
  if (!cachedFolderId) throw new Error("Messenger file folder was not found");
  return cachedFolderId;
}

export async function sendPdfToUser({ userId, filename, pdf, message }) {
  const id = String(userId || "").replace(/\D/g, "");
  if (!id) throw new Error("Missing agent");
  const name = String(filename || "daily-report.pdf").replace(/[^\w.-]+/g, "-") || "daily-report.pdf";
  const folderId = await senderFolderId();
  const uploaded = await imCall("disk.folder.uploadfile", {
    id: folderId,
    data: { NAME: name },
    fileContent: [name, Buffer.from(pdf).toString("base64")],
    generateUniqueName: true,
  });
  const fileId = Number(uploaded?.ID || uploaded?.id || 0);
  if (!fileId) throw new Error("Messenger file upload failed");
  return imCall("im.disk.file.commit", {
    DIALOG_ID: id,
    FILE_ID: fileId,
    MESSAGE: String(message || "").slice(0, 500),
  });
}
