/** 7:00 Pakistan daily report PDFs, and a one-off send for a given day. */
import { crmRead, dateFilter, listFilteredPages, normalizeAgentId } from "./crmIntelligence.js";
import { checkAgentDailyReport } from "./agentDailyReport.js";
import { agentDailyReportPdf, agentDailyReportPdfName } from "./agentDailyReportPdf.js";
import { sendPdfToUser } from "./bitrixImSend.js";

const SENT_KEY = "agent_report_messenger_v1";

/** Automatic Messenger PDFs are off until this is turned back on. */
export const AGENT_REPORT_SEND_ENABLED = false;

/** Only Sattar receives every worked agent's PDF. Everyone else gets only their own. */
export const REPORT_COPY_IDS = [
  "32", // Abdul Sattar Mughal
];

function copyIdsOf(value) {
  const source = Array.isArray(value) ? value : REPORT_COPY_IDS;
  return [...new Set(source.map((id) => normalizeAgentId(id)).filter(Boolean))];
}

function pairKey(agentId, userId) {
  return `${agentId}:${userId}`;
}

export function copiesForAgent(agentId, copyIds = REPORT_COPY_IDS) {
  const id = normalizeAgentId(agentId);
  return copyIdsOf(copyIds).filter((userId) => userId !== id);
}

export function clockParts(now = new Date(), timeZone = "Asia/Karachi") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function dubaiParts(now = new Date()) {
  return clockParts(now, "Asia/Dubai");
}

export function dueForSevenPm(now, state) {
  const clock = clockParts(now, "Asia/Karachi");
  if (clock.hour !== 19) return null;
  if (state?.day === clock.day && state?.finished) return null;
  return clock.day;
}

export async function workedAgentIds(post, from, to) {
  const ids = new Set();
  const leads = await listFilteredPages({
    post,
    method: "crm.lead.list",
    filter: dateFilter(from, to),
    select: ["ID", "ASSIGNED_BY_ID"],
    maxPages: 30,
  });
  for (const row of leads.rows || []) {
    const id = normalizeAgentId(row?.ASSIGNED_BY_ID);
    if (id) ids.add(id);
  }
  const acts = await listFilteredPages({
    post,
    method: "crm.activity.list",
    filter: dateFilter(from, to, "CREATED"),
    select: ["ID", "RESPONSIBLE_ID"],
    maxPages: 30,
  });
  for (const row of acts.rows || []) {
    const id = normalizeAgentId(row?.RESPONSIBLE_ID);
    if (id) ids.add(id);
  }
  return [...ids];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dispatchAgentReportPdfs({
  db,
  day,
  post = crmRead,
  check = checkAgentDailyReport,
  send = sendPdfToUser,
  pause = sleep,
  copyIds = REPORT_COPY_IDS,
} = {}) {
  const label = String(day || dubaiParts().day);
  const from = `${label} 00:00:00`;
  const to = `${label} 23:59:59`;
  const copies = copyIdsOf(copyIds);
  const previous = db?.getSetting ? await db.getSetting(SENT_KEY, null) : null;
  const state = previous?.day === label
    ? {
        ...previous,
        day: label,
        finished: false,
        sent: previous.sent || [],
        skipped: previous.skipped || [],
        failed: [],
        copies: previous.copies || [],
        copyFailed: [],
      }
    : { day: label, finished: false, sent: [], skipped: [], failed: [], copies: [], copyFailed: [] };
  const sentSet = new Set(state.sent);
  const skippedSet = new Set(state.skipped);
  const copiedSet = new Set(state.copies);
  const ids = await workedAgentIds(post, from, to);
  const save = async () => {
    if (db?.setSetting) await db.setSetting(SENT_KEY, state).catch(() => {});
  };
  const ready = [];
  for (const id of ids) {
    const pendingCopies = copiesForAgent(id, copies).filter((userId) => !copiedSet.has(pairKey(id, userId)));
    if (skippedSet.has(id)) continue;
    if (sentSet.has(id) && pendingCopies.length === 0) continue;
    let report;
    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        report = await check({ db, agentId: id, mode: "day", day: label, force: true, post });
        if (report?.ok) break;
        lastError = "Report was not ready";
        report = null;
      } catch (error) {
        lastError = String(error?.message || "send failed");
        report = null;
      }
      if (attempt < 3) await pause(2000);
    }
    if (!report?.ok) {
      state.failed.push({ id, error: lastError.slice(0, 180) });
      await save();
      continue;
    }
    const worked = Number(report?.summary?.leadsWorked || 0);
    if (worked < 1) {
      state.skipped.push(id);
      skippedSet.add(id);
      await save();
      continue;
    }
    ready.push({
      id,
      pdf: agentDailyReportPdf(report),
      filename: agentDailyReportPdfName(report),
      agentName: String(report.agentName || `Agent ${id}`).trim(),
      pendingCopies,
    });
  }
  for (const item of ready) {
    const deliveries = [];
    if (!sentSet.has(item.id)) {
      deliveries.push({ userId: item.id, message: `Daily report ${label}`, own: true });
    }
    for (const userId of item.pendingCopies) {
      deliveries.push({
        userId,
        message: `Daily report ${label} - ${item.agentName}`,
        own: false,
      });
    }
    for (const delivery of deliveries) {
      try {
        await send({
          userId: delivery.userId,
          filename: item.filename,
          pdf: item.pdf,
          message: delivery.message,
        });
        if (delivery.own) {
          state.sent.push(item.id);
          sentSet.add(item.id);
        } else {
          const key = pairKey(item.id, delivery.userId);
          state.copies.push(key);
          copiedSet.add(key);
        }
      } catch (error) {
        const note = String(error?.message || "send failed").slice(0, 180);
        if (delivery.own) state.failed.push({ id: item.id, error: note });
        else state.copyFailed.push({ id: pairKey(item.id, delivery.userId), error: note });
      }
      await save();
      await pause(1500);
    }
  }
  state.finished = state.failed.length === 0 && state.copyFailed.length === 0;
  await save();
  return state;
}

export function scheduleAgentReportPdfs(db) {
  if (!AGENT_REPORT_SEND_ENABLED) {
    console.log("Agent report PDFs are off. No report is sent.");
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    const state = db?.getSetting ? await db.getSetting(SENT_KEY, null) : null;
    const day = dueForSevenPm(new Date(), state);
    if (!day) return;
    running = true;
    try {
      const result = await dispatchAgentReportPdfs({ db, day });
      console.log(`Agent report PDFs ${result.day}: sent ${result.sent.length}, copies ${result.copies.length}, skipped ${result.skipped.length}, failed ${result.failed.length}`);
    } catch (error) {
      console.error("Agent report PDF send failed:", error?.message || error);
    } finally {
      running = false;
    }
  };
  setInterval(() => {
    tick().catch((error) => console.error("Agent report PDF tick failed:", error?.message || error));
  }, 30000);
}
