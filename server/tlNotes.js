/** Team-lead notes saved against an agent + day (or month label). */
import { normalizeAgentId } from "./crmIntelligence.js";

export function tlNoteKey(agentId, day) {
  const id = normalizeAgentId(agentId);
  const d = String(day || "").trim().slice(0, 10);
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return `tl_agent_note:${id}:${d}`;
}

export function tlNoteMonthPrefix(agentId, month) {
  const id = normalizeAgentId(agentId);
  const m = String(month || "").trim().slice(0, 7);
  if (!id || !/^\d{4}-\d{2}$/.test(m)) return "";
  return `tl_agent_note:${id}:${m}`;
}

export async function getTlNote(db, agentId, day) {
  const key = tlNoteKey(agentId, day);
  if (!key || !db?.getSetting) return null;
  const row = await db.getSetting(key, null);
  if (!row || typeof row !== "object") return null;
  return {
    agentId: normalizeAgentId(agentId),
    day: String(day).slice(0, 10),
    text: String(row.text || ""),
    authorId: String(row.authorId || ""),
    authorName: String(row.authorName || ""),
    updatedAt: Number(row.updatedAt) || 0,
  };
}

/** List notes for an agent in a month (YYYY-MM) or a single day. */
export async function listTlNotes(db, { agentId, day = "", month = "" } = {}) {
  if (!db?.getSetting) return [];
  const id = normalizeAgentId(agentId);
  if (!id) return [];
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const one = await getTlNote(db, id, day);
    return one?.text ? [one] : [];
  }
  const ym = String(month || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return [];
  // Settings store is key-value — probe each day of the month.
  const y = Number(ym.slice(0, 4));
  const mo = Number(ym.slice(5, 7));
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= last; d += 1) {
    const dayKey = `${ym}-${String(d).padStart(2, "0")}`;
    const row = await getTlNote(db, id, dayKey);
    if (row?.text) out.push(row);
  }
  return out;
}

export async function saveTlNote(db, { agentId, day, text, authorId, authorName } = {}) {
  const key = tlNoteKey(agentId, day);
  if (!key) {
    const error = new Error("Pick an agent and a valid day to save the note.");
    error.status = 400;
    throw error;
  }
  if (!db?.setSetting) {
    const error = new Error("Notes storage is not available.");
    error.status = 503;
    throw error;
  }
  const payload = {
    agentId: normalizeAgentId(agentId),
    day: String(day).slice(0, 10),
    text: String(text || "").trim().slice(0, 8000),
    authorId: String(authorId || ""),
    authorName: String(authorName || ""),
    updatedAt: Date.now(),
  };
  await db.setSetting(key, payload);
  return payload;
}
