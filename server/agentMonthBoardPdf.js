/** PDF of the all-agents booking report already loaded from Bitrix. */
import { assemblePdf } from "./agentDailyReportPdf.js";

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

function text(x, y, size, value, bold = false) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const font = bold ? "/F2" : "/F1";
  return `q 0 w 0 Tr BT 0 Tc 0 Tw ${font} ${size.toFixed(1)} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${esc(v)}) Tj ET Q\n`;
}

function num(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export function agentMonthBoardPdfName(report = {}) {
  const label = String(report.month || report.label || "report").replace(/[^a-zA-Z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  return `all-agents-report-${label || "report"}.pdf`;
}

export function agentMonthBoardPdf(report = {}) {
  const agents = Array.isArray(report.agents) ? report.agents : [];
  const totals = report.totals || {};
  const left = 36;
  const cols = [36, 250, 330, 400, 470];
  const right = 560;
  const rowH = 18;
  const pages = [];
  let ops = [];
  let y = 800;

  function flush() {
    if (ops.length) pages.push(ops.join(""));
    ops = [];
    y = 800;
  }
  function need(height) {
    if (y >= 42 + height) return;
    flush();
    header();
  }
  function header() {
    ops.push(text(left, y, 14, "A7 Property Listing - Agent won deals", true));
    y -= 18;
    ops.push(text(left, y, 10, String(report.month || "")));
    y -= 14;
    ops.push(text(
      left,
      y,
      10,
      `Total ${num(totals.deals)}    Rent ${num(totals.rent)}    Sale ${num(totals.sale)}    Option sent ${num(totals.optionSent)}`,
      true,
    ));
    y -= 16;
    if (report.truncated) {
      ops.push(text(left, y, 9, "Bitrix returned only part of this period, so these counts can be short."));
      y -= 14;
    }
    ops.push(text(left, y, 8, "Won deals are this responsible person's leads in the Booking stage, opened on the selected dates. Tenant is rent. Buyer is sale."));
    y -= 18;
    ops.push(`0.93 0.89 0.82 rg ${left} ${(y - 16).toFixed(2)} ${(right - left).toFixed(2)} 16 re f\n`);
    ops.push("0 0 0 rg\n");
    const labels = ["Agent", "Total deals", "Rent", "Sale", "Option sent"];
    labels.forEach((label, index) => ops.push(text(cols[index] + 4, y - 12, 8, label, true)));
    y -= 16;
  }

  header();
  if (!agents.length) {
    need(20);
    ops.push(text(left + 4, y - 14, 10, "No agents in this report."));
    y -= 20;
  }
  agents.forEach((row, index) => {
    need(rowH + 8);
    if (index % 2 === 1) {
      ops.push(`0.98 0.97 0.95 rg ${left} ${(y - rowH).toFixed(2)} ${(right - left).toFixed(2)} ${rowH} re f\n`);
      ops.push("0 0 0 rg\n");
    }
    const values = [row.name || `User ${row.id || ""}`, num(row.deals), num(row.rent), num(row.sale), num(row.optionSent)];
    values.forEach((value, col) => ops.push(text(cols[col] + 4, y - 13, 9, value, col > 0)));
    ops.push(`0.90 0.86 0.78 RG 0.4 w ${left} ${y - rowH} m ${right} ${y - rowH} l S\n`);
    y -= rowH;
  });
  flush();
  if (!pages.length) pages.push(text(left, 800, 12, "All agents report", true));
  return assemblePdf(pages);
}
