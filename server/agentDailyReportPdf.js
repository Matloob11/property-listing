/** Simple multi-page PDF for agent daily / monthly report. */

const PAGE_W = 595.28;
const PAGE_H = 841.89;

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

function countOf(value, list) {
  if (value != null && value !== "") return Number(value) || 0;
  return Array.isArray(list) ? list.length : 0;
}

/** Leads whose stage was changed to Meeting or Viewing in this report. */
export function meetingViewingCount(report = {}) {
  const seen = new Set();
  for (const row of report?.meetingStages || []) {
    const stage = String(row?.stage || "");
    if (!isMeetingViewingStage(stage)) continue;
    const leadId = String(row?.leadId || "").replace(/\D/g, "");
    if (!leadId || seen.has(leadId)) continue;
    seen.add(leadId);
  }
  return seen.size;
}

/** Quantity rows. The pages after this table list the exact Bitrix leads. */
export function reportCountRows(report = {}) {
  const s = report.summary || {};
  const viewings = s.meetingViewings != null && s.meetingViewings !== ""
    ? Number(s.meetingViewings) || 0
    : meetingViewingCount(report);
  return [
    ["Leads worked", countOf(s.leadsWorked, report.leads?.worked)],
    ["Leads not worked", countOf(s.leadsNotWorked, report.leads?.notWorked)],
    ["Proceeded", countOf(s.leadsProceeded, report.leads?.proceeded)],
    ["Junk", countOf(s.leadsJunk, report.leads?.junk)],
    ["Meetings/Viewings", viewings],
    ["Closed deals", countOf(s.closedDeals, report.closedDeals)],
    ["Option sent", countOf(s.optionSent, report.optionSent)],
    ["Owner data", countOf(s.ownerWork, report.ownerWork)],
    ["Activities", countOf(s.activities, report.activities?.rows)],
    ["Calls", countOf(s.calls, report.calls)],
    ["TL / other actions", countOf(s.tlActions, report.teamLeadActions?.rows)],
    ["Shared out", countOf(s.sharedOut, report.shares?.sharedOut)],
    ["Share work done", countOf(s.sharedOutWorked, null)],
    ["Share no work", countOf(s.sharedOutIdle, null)],
    ["Shared in", countOf(s.sharedIn, report.shares?.sharedIn)],
  ];
}

function buildPages(report) {
  const range = report.range || {};
  const rows = reportCountRows(report);
  const left = 48;
  const mid = 390;
  const right = 530;
  const rowH = 24;
  const headerH = 26;
  let y = 790;
  const ops = [];
  ops.push(t(left, y, 14, "A7 Property Listing - Agent Daily Report", true));
  y -= 22;
  ops.push(t(left, y, 11, `Agent: ${report.agentName || report.agentId || ""}`, true));
  y -= 16;
  ops.push(t(left, y, 10, `Period: ${range.label || ""}`));
  y -= 28;

  const tableTop = y;
  ops.push(`0.93 0.89 0.82 rg ${left} ${(y - headerH).toFixed(2)} ${(right - left).toFixed(2)} ${headerH} re f\n`);
  y -= headerH;
  for (let index = 0; index < rows.length; index += 1) {
    if (index % 2 === 1) {
      ops.push(`0.98 0.97 0.95 rg ${left} ${(y - rowH).toFixed(2)} ${(right - left).toFixed(2)} ${rowH} re f\n`);
    }
    y -= rowH;
  }
  const tableBottom = y;
  ops.push("0 0 0 rg\n");
  let textY = tableTop - 17;
  ops.push(t(left + 12, textY, 10, "Work", true));
  ops.push(t(mid + 16, textY, 10, "Count", true));
  textY -= headerH;
  for (const [label, count] of rows) {
    ops.push(t(left + 12, textY, 10, label));
    ops.push(t(mid + 16, textY, 10, String(count), true));
    textY -= rowH;
  }
  ops.push("0.75 0.70 0.62 RG 0.6 w\n");
  ops.push(`${left} ${tableTop} m ${right} ${tableTop} l ${right} ${tableBottom} l ${left} ${tableBottom} l h S\n`);
  ops.push(`${mid} ${tableTop} m ${mid} ${tableBottom} l S\n`);
  ops.push(`${left} ${tableTop - headerH} m ${right} ${tableTop - headerH} l S\n`);
  let lineY = tableTop - headerH;
  for (let index = 0; index < rows.length - 1; index += 1) {
    lineY -= rowH;
    ops.push(`${left} ${lineY} m ${right} ${lineY} l S\n`);
  }
  return [ops.join("")];
}

function clip(value, max = 78) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function exactLines(report) {
  const worked = (report?.leads?.worked || []).map((row) => `#${row.id}  ${clip(row.title)}`);
  const owners = (report?.ownerWork || []).map((row) => `#${row.id}  ${clip(row.title, 36)}  ${clip(row.detail, 32)}`);
  const meetings = (report?.meetingStages || []).map((row) => `#${row.leadId}  ${clip(row.title, 34)}  ${clip(row.stage, 28)}`);
  const options = (report?.optionSent || []).map((row) => `#${row.leadId}  ${clip(row.title)}`);
  return [
    ["Leads worked", worked],
    ["Owner data", owners],
    ["Meeting / viewing stage changes", meetings],
    ["Option sent", options],
  ];
}

/** One line per Bitrix lead the agent actually worked, changed, or sent an option on. */
function buildExactPages(report) {
  const left = 48;
  const pages = [];
  let ops = [];
  let y = 790;
  function flush() {
    if (ops.length) pages.push(ops.join(""));
    ops = [];
    y = 790;
  }
  function ensure(height) {
    if (y < 48 + height) flush();
  }
  function write(size, value, bold = false, gap = 6) {
    ensure(size + gap);
    ops.push(t(left, y, size, value, bold));
    y -= size + gap;
  }
  write(12, "Exact Bitrix leads", true, 8);
  write(9, report.agentName || report.agentId || "", true, 14);
  for (const [title, lines] of exactLines(report)) {
    write(10, `${title} (${lines.length})`, true, 8);
    if (!lines.length) {
      write(9, "None", false, 12);
      continue;
    }
    for (const line of lines) write(8, clip(line, 90), false, 4);
    y -= 8;
  }
  flush();
  return pages;
}

export function assemblePdf(pageContents) {
  const objects = [];
  objects.push({ head: "<< /Type /Catalog /Pages 2 0 R >>" }); // 1
  const kids = pageContents.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects.push({ head: `<< /Type /Pages /Kids [${kids}] /Count ${pageContents.length} >>` }); // 2

  const fontStart = 3 + pageContents.length * 2;
  for (let i = 0; i < pageContents.length; i++) {
    const contentId = 4 + i * 2;
    const pageId = 3 + i * 2;
    objects.push({
      head: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontStart} 0 R /F2 ${fontStart + 1} 0 R >> >> >>`,
    });
    const stream = Buffer.from(pageContents[i], "latin1");
    objects.push({
      head: `<< /Length ${stream.length} >>`,
      stream,
    });
  }
  objects.push({ head: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" });
  objects.push({ head: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>" });

  // Fix object numbering: catalog=1 pages=2 then alternating page/content, then fonts
  // Rebuild properly
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageRefs = [];
  let nextId = 3;
  const contentStreams = [];
  for (const content of pageContents) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageRefs.push(pageId);
    contentStreams.push({ pageId, contentId, content });
  }
  const f1 = nextId++;
  const f2 = nextId++;
  objs[2] = `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
  for (const item of contentStreams) {
    objs[item.pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${item.contentId} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> >>`;
    const stream = Buffer.from(item.content, "latin1");
    objs[item.contentId] = { head: `<< /Length ${stream.length} >>`, stream };
  }
  objs[f1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[f2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  let length = chunks[0].length;
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = length;
    const object = objs[id];
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
  }
  const xrefOffset = length;
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objs.length; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer << /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

export function isMeetingViewingStage(value) {
  return /meeting|viewing/i.test(String(value || ""));
}

/** Meeting/viewing rows for the download PDF and the 6pm PDF. */
export function meetingViewingEntries(report) {
  const entries = [];
  const seen = new Set();
  function addStage(row, direction) {
    const stage = String(row?.workLabel || row?.status || "");
    if (!isMeetingViewingStage(stage)) return;
    const leadId = String(row?.leadId || row?.id || "").replace(/\D/g, "");
    if (!leadId || seen.has(`${direction}:${leadId}:${row?.sharedAt || ""}:${row?.person || row?.sharedToId || row?.sharedById || ""}`)) return;
    const person = direction === "in"
      ? String(row?.sharedByName || "")
      : String(row?.sharedToName || "");
    seen.add(`${direction}:${leadId}:${row?.sharedAt || ""}:${person}`);
    entries.push({
      kind: "stage",
      leadId,
      title: String(row?.leadTitle || row?.title || "").trim(),
      stage,
      person,
      personRole: direction === "in" ? "Shared by" : person ? "Shared with" : "",
      when: String(row?.sharedAt || row?.modified || row?.created || ""),
    });
  }
  for (const row of report?.shares?.sharedOut || []) addStage(row, "out");
  for (const row of report?.shares?.sharedIn || []) addStage(row, "in");
  for (const bucket of ["worked", "proceeded", "notWorked"]) {
    for (const row of report?.leads?.[bucket] || []) {
      const leadId = String(row?.id || "").replace(/\D/g, "");
      if (!leadId || entries.some((item) => item.kind === "stage" && item.leadId === leadId)) continue;
      addStage({ ...row, leadId, sharedAt: row.modified || row.created }, "lead");
    }
  }
  for (const row of report?.activities?.meetings || []) {
    entries.push({
      kind: "activity",
      leadId: String(row?.leadId || ""),
      title: String(row?.subject || "Meeting"),
      when: String(row?.start || row?.created || ""),
      end: String(row?.end || ""),
      location: String(row?.location || ""),
      note: String(row?.description || ""),
    });
  }
  return entries;
}

export function agentDailyReportPdf(report) {
  const source = report || {};
  return assemblePdf([...buildPages(source), ...buildExactPages(source)]);
}

export function agentDailyReportPdfName(report) {
  const agent = String(report?.agentName || report?.agentId || "agent")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const label = String(report?.range?.label || "report").replace(/[^a-zA-Z0-9-]+/g, "_");
  return `agent-report-${agent}-${label}.pdf`;
}
