/** Client-side last-4 phone mask (mirrors server reportPrivacy). */

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

export function maskPhoneInText(value) {
  const text = String(value ?? "");
  if (!text) return text;
  return text.replace(/(\+?\d[\d\s().-]{5,}\d)/g, maskLastFourDigits);
}

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

function maskLeadTitle(title) {
  const raw = String(title || "");
  if (!raw) return raw;
  const pipe = raw.indexOf("|");
  if (pipe >= 0) {
    const left = raw.slice(0, pipe + 1);
    const right = raw.slice(pipe + 1).trim();
    return `${left} ${maskHalfName(maskPhoneInText(right))}`.trim();
  }
  return maskPhoneInText(maskHalfName(raw));
}

/** Ensure report is masked for display when viewer is not admin/owner. */
export function ensureReportPrivacy(report, viewer) {
  if (!report || report.ok === false) return report;
  if (canViewFullAgentReport(viewer, report.agentId)) {
    return { ...report, privacy: { masked: false, reason: "owner_or_admin" } };
  }
  // Always force-mask for non-privileged viewers (even if API forgot privacy).
  return {
    ...report,
    privacy: { masked: true, reason: "numbers_and_names_hidden" },
    leads: {
      ...report.leads,
      worked: (report.leads?.worked || []).map((row) => (row ? { ...row, title: maskLeadTitle(row.title) } : row)),
      notWorked: (report.leads?.notWorked || []).map((row) => (row ? { ...row, title: maskLeadTitle(row.title) } : row)),
      proceeded: (report.leads?.proceeded || []).map((row) => (row ? { ...row, title: maskLeadTitle(row.title) } : row)),
      junk: (report.leads?.junk || []).map((row) => (row ? { ...row, title: maskLeadTitle(row.title) } : row)),
    },
    activities: {
      ...report.activities,
      meetings: (report.activities?.meetings || []).map((row) =>
        row ? { ...row, subject: maskPhoneInText(row.subject) } : row
      ),
      rows: (report.activities?.rows || []).map((row) =>
        row ? { ...row, subject: maskPhoneInText(row.subject) } : row
      ),
    },
    teamLeadActions: {
      ...report.teamLeadActions,
      rows: (report.teamLeadActions?.rows || []).map((row) =>
        row
          ? {
              ...row,
              subject: maskPhoneInText(row.subject),
              detail: maskPhoneInText(row.detail),
              actorName: maskHalfName(row.actorName),
            }
          : row
      ),
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
      sharedOut: (report.shares?.sharedOut || []).map((row) =>
        row
          ? {
              ...row,
              leadTitle: maskLeadTitle(row.leadTitle),
              sharedByName: maskHalfName(row.sharedByName),
              sharedToName: maskHalfName(row.sharedToName),
            }
          : row
      ),
      sharedIn: (report.shares?.sharedIn || []).map((row) =>
        row
          ? {
              ...row,
              leadTitle: maskLeadTitle(row.leadTitle),
              sharedByName: maskHalfName(row.sharedByName),
              sharedToName: maskHalfName(row.sharedToName),
            }
          : row
      ),
    },
  };
}
