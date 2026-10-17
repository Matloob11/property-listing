/** Mask phones / names on agent reports for non-admin viewers who are not the subject. */

/** Full phones/names only on your own agent report — not when viewing someone else.
 * Eman Fazal (2379) may see the full agent report for every agent.
 */
const FULL_REPORT_IDS = new Set(["2379"]);
const FULL_REPORT_EMAILS = new Set(["emanfazal.a7group@gmail.com"]);

export function canViewFullAgentReport(viewer, agentId) {
  if (!viewer) return false;
  const vid = String(viewer.id || "").replace(/\D/g, "");
  if (FULL_REPORT_IDS.has(vid)) return true;
  const email = String(viewer.email || "").trim().toLowerCase();
  if (email && FULL_REPORT_EMAILS.has(email)) return true;
  const aid = String(agentId || "").replace(/\D/g, "");
  return Boolean(vid && aid && vid === aid);
}

function maskLastFourDigits(match) {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 7) return match;
  let hide = 4;
  let out = "";
  for (let i = match.length - 1; i >= 0; i -= 1) {
    const ch = match[i];
    if (/\d/.test(ch) && hide > 0) {
      out = `*${out}`;
      hide -= 1;
    } else {
      out = ch + out;
    }
  }
  return out;
}

/** Hide last 4 digits of phone-like digit runs (keeps +, spaces, dashes). */
export function maskPhoneInText(value) {
  const text = String(value ?? "");
  if (!text) return text;
  return text.replace(/(\+?\d[\d\s().-]{5,}\d)/g, maskLastFourDigits);
}

/** Show roughly the first half of each word; rest becomes *. */
export function maskHalfName(value) {
  const text = String(value ?? "").trim();
  if (!text) return text;
  return text
    .split(/\s+/)
    .map((word) => {
      if (word.length <= 2) return word;
      const keep = Math.ceil(word.length / 2);
      return word.slice(0, keep) + "*".repeat(word.length - keep);
    })
    .join(" ");
}

/** Mask phones in free text (activity subjects, etc.). */
export function maskPrivateText(value) {
  return maskPhoneInText(value);
}

function maskLeadTitle(title) {
  const raw = String(title || "");
  if (!raw) return raw;
  // "Source | Client Name" → mask name half after pipe
  const pipe = raw.indexOf("|");
  if (pipe >= 0) {
    const left = raw.slice(0, pipe + 1);
    const right = raw.slice(pipe + 1).trim();
    return `${left} ${maskHalfName(maskPhoneInText(right))}`.trim();
  }
  return maskPhoneInText(maskHalfName(raw));
}

function mapLead(row) {
  if (!row) return row;
  return {
    ...row,
    title: maskLeadTitle(row.title),
  };
}

function mapShare(row) {
  if (!row) return row;
  return {
    ...row,
    leadTitle: maskLeadTitle(row.leadTitle),
    sharedByName: maskHalfName(row.sharedByName),
    sharedToName: maskHalfName(row.sharedToName),
  };
}

function mapActivity(row) {
  if (!row) return row;
  return {
    ...row,
    subject: maskPrivateText(row.subject),
  };
}

/** Return a viewer-safe copy. Full data stays in cache for the owner/admin. */
export function applyAgentReportPrivacy(report, viewer) {
  if (!report || report.ok === false) return report;
  if (canViewFullAgentReport(viewer, report.agentId)) {
    return { ...report, privacy: { masked: false, reason: "owner_or_admin" } };
  }
  return {
    ...report,
    privacy: { masked: true, reason: "numbers_and_names_hidden" },
    note: `${report.note || ""} Phone last-4 and names are masked — full detail only for that agent or admins.`.trim(),
    leads: {
      ...report.leads,
      worked: (report.leads?.worked || []).map(mapLead),
      notWorked: (report.leads?.notWorked || []).map(mapLead),
      proceeded: (report.leads?.proceeded || []).map(mapLead),
      junk: (report.leads?.junk || []).map(mapLead),
    },
    activities: {
      ...report.activities,
      meetings: (report.activities?.meetings || []).map(mapActivity),
      rows: (report.activities?.rows || []).map(mapActivity),
    },
    teamLeadActions: {
      ...report.teamLeadActions,
      rows: (report.teamLeadActions?.rows || []).map((row) => (
        row ? { ...mapActivity(row), actorName: maskHalfName(row.actorName), detail: maskPhoneInText(row.detail) } : row
      )),
    },
    calls: (report.calls || []).map((row) => (
      row ? { ...row, phone: maskPhoneInText(row.phone), name: maskHalfName(row.name), leadTitle: maskLeadTitle(row.leadTitle) } : row
    )),
    meetingStages: (report.meetingStages || []).map((row) => (
      row ? { ...row, title: maskLeadTitle(row.title) } : row
    )),
    closedDeals: (report.closedDeals || []).map((row) => (
      row ? { ...row, title: maskLeadTitle(row.title) } : row
    )),
    optionSent: (report.optionSent || []).map((row) => (
      row ? { ...row, title: maskLeadTitle(row.title), callSubject: maskPhoneInText(row.callSubject) } : row
    )),
    ownerWork: (report.ownerWork || []).map((row) => (
      row ? { ...row, title: maskLeadTitle(row.title), detail: maskPhoneInText(row.detail) } : row
    )),
    shares: {
      ...report.shares,
      sharedOut: (report.shares?.sharedOut || []).map(mapShare),
      sharedIn: (report.shares?.sharedIn || []).map(mapShare),
      idleAlerts: (report.shares?.idleAlerts || []).map((row) => ({
        ...row,
        userName: maskHalfName(row.userName),
        sharedByName: maskHalfName(row.sharedByName),
      })),
    },
  };
}
