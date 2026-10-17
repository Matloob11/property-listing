import { useEffect, useMemo, useRef, useState } from "react";
import { loadNamedState, saveNamedState } from "./uiPersist.js";
import { ensureReportPrivacy, maskHalfName, maskPhoneInText } from "./reportPrivacyClient.js";

function fmt(n) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("en-US");
}

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

function thisMonthYm() {
  return todayYmd().slice(0, 7);
}

function daysAgoYmd(days) {
  const today = todayYmd();
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const CRM_ORIGIN = "https://crm.a7grouprealestatedxb.com";

function openCrmPath(path) {
  const clean = String(path || "");
  if (!clean) return;
  const local = clean.startsWith("http") ? clean.replace(CRM_ORIGIN, "") : clean;
  try {
    if (window.BX24?.openPath) {
      window.BX24.openPath(local);
      return;
    }
  } catch {
    /* open in a new tab */
  }
  window.open(`${CRM_ORIGIN}${local}`, "_blank", "noopener,noreferrer");
}

function openCrmLead(id) {
  const clean = String(id || "").replace(/\D/g, "");
  if (!clean) return;
  openCrmPath(`/crm/lead/details/${clean}/`);
}

function openCrmDeal(id) {
  const clean = String(id || "").replace(/\D/g, "");
  if (!clean) return;
  openCrmPath(`/crm/deal/details/${clean}/`);
}

function fmtDuration(seconds) {
  const n = Math.round(Number(seconds) || 0);
  if (n <= 0) return "—";
  const minutes = Math.floor(n / 60);
  const rest = n % 60;
  return minutes ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

function fmtMoney(amount, currency) {
  const n = Number(amount) || 0;
  const code = String(currency || "AED");
  return `${code} ${n.toLocaleString("en-US")}`;
}

function CrmMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h6v6M20 4 11 13M9 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrmLeadButton({ id }) {
  const clean = String(id || "").replace(/\D/g, "");
  if (!clean) return null;
  return (
    <button
      type="button"
      className="ci-crm-chip adr-row-crm"
      title={`Open lead #${clean} in CRM`}
      onClick={(event) => {
        event.stopPropagation();
        openCrmLead(clean);
      }}
    >
      <CrmMark />
    </button>
  );
}

function fmtDubai(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const parsed = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T") + (raw.includes(":") ? "" : ""));
  if (!Number.isFinite(parsed)) return raw.slice(0, 19);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(parsed));
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function uniqueIds(values) {
  return [...new Set((values || []).map(digits).filter(Boolean))];
}

function reportBoxPath(entity, ids, limit = 0) {
  const clean = uniqueIds(ids);
  const cap = Number(limit) || 0;
  if (!clean.length) return "";
  if (cap > 0 && clean.length !== cap) return "";
  if (entity === "owner") {
    if (clean.length === 1) return `/crm/type/1042/details/${clean[0]}/`;
    const params = new URLSearchParams();
    params.set("apply_filter", "Y");
    for (const id of clean) {
      params.append("ID[]", id);
      params.append("ID_label[]", `#${id}`);
    }
    return `/crm/type/1042/list/category/14/?${params.toString()}`;
  }
  if (clean.length === 1) {
    return entity === "deal" ? `/crm/deal/details/${clean[0]}/` : `/crm/lead/details/${clean[0]}/`;
  }
  const params = new URLSearchParams();
  params.set("apply_filter", "Y");
  for (const id of clean) {
    params.append("ID[]", id);
    params.append("ID_label[]", `#${id}`);
  }
  const base = entity === "deal" ? "/crm/deal/list/" : "/crm/lead/list/";
  return `${base}?${params.toString()}`;
}

function Stat({ label, value, onClick, active = false, hint = "", crmPath = "" }) {
  const clickable = typeof onClick === "function";
  const count = Number(value) || 0;
  const className = `adr-stat${clickable ? " adr-stat-click" : ""}${active ? " on" : ""}${count > 0 ? " has-crm" : ""}`;
  const body = (
    <>
      <small>{label}</small>
      <b>{fmt(value)}</b>
      {clickable ? <em>Open</em> : null}
    </>
  );
  return (
    <div className={className}>
      {clickable ? (
        <button type="button" className="adr-stat-main" onClick={onClick} title={hint || `Show ${label} details`}>
          {body}
        </button>
      ) : (
        <div className="adr-stat-main">{body}</div>
      )}
      {count > 0 ? (
        <button
          type="button"
          className="ci-crm-chip adr-stat-crm"
          title={crmPath ? `Open these ${count} in CRM` : `Show these ${count}`}
          aria-label={crmPath ? `Open these ${count} in CRM` : `Show these ${count}`}
          onClick={(event) => {
            event.stopPropagation();
            if (typeof onClick === "function") onClick();
            if (crmPath) openCrmPath(crmPath);
          }}
        >
          <CrmMark />
        </button>
      ) : null}
    </div>
  );
}

function Section({ title, note, children, sectionRef, highlight = false, panel = "", open = "" }) {
  if (open && panel !== open) return null;
  return (
    <div className={`adr-section${highlight ? " adr-section-focus" : ""}`} ref={sectionRef}>
      <div className="adr-section-head">
        <h4>{title}</h4>
        {note ? <small>{note}</small> : null}
      </div>
      {children}
    </div>
  );
}

function LeadTable({ rows, empty }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return <p className="adr-empty">{empty}</p>;
  return (
    <div className="adr-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Lead</th>
            <th>Status</th>
            <th>Source</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr
              key={row.id}
              className={row.id ? "adr-row-link" : ""}
              tabIndex={row.id ? 0 : undefined}
              title={row.id ? `Open lead #${row.id} in CRM` : undefined}
              onClick={() => openCrmLead(row.id)}
              onKeyDown={(event) => {
                if (!row.id) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openCrmLead(row.id);
                }
              }}
            >
              <td>
                <span>#{row.id} {row.title}</span>
                <CrmLeadButton id={row.id} />
              </td>
              <td>{row.status || "—"}</td>
              <td>{row.source || "—"}</td>
              <td>{fmtDubai(row.modified || row.created)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtShareWhen(value) {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (!match || hasZone) return fmtDubai(value);
  const seconds = match[6] ? `:${match[6]}` : "";
  return `${match[3]}/${match[2]}/${match[1]}, ${match[4]}:${match[5]}${seconds}`;
}

function sharePerson(row, direction) {
  if (direction === "out") return row.sharedToName || (row.sharedToId ? `User #${row.sharedToId}` : "—");
  return row.sharedByName || (row.sharedById ? `User #${row.sharedById}` : "—");
}

function shareGroups(rows, filterWork = "") {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.leadId || "");
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  let groups = [...map.values()];
  if (filterWork === "done") groups = groups.filter((sends) => sends.length && sends.every((row) => row.worked));
  if (filterWork === "idle") groups = groups.filter((sends) => sends.some((row) => !row.worked));
  for (const sends of groups) sends.sort((a, b) => String(a.sharedAt).localeCompare(String(b.sharedAt)));
  groups.sort((a, b) => String(b[b.length - 1]?.sharedAt || "").localeCompare(String(a[a.length - 1]?.sharedAt || "")));
  return groups;
}

function ShareTable({ rows, empty, direction, filterWork = "" }) {
  const groups = shareGroups(rows, filterWork);
  if (!groups.length) return <p className="adr-empty">{empty}</p>;
  return (
    <div className="adr-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Lead</th>
            <th>{direction === "out" ? "Shared with" : "Shared by"}</th>
            <th>Date and time</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((sends) => {
            const lead = sends[0] || {};
            return sends.map((row, index) => (
              <tr
                key={`${row.leadId}-${row.sharedToId || row.sharedById}-${row.sharedAt}-${index}`}
                className={row.leadId ? "adr-row-link" : ""}
                tabIndex={row.leadId ? 0 : undefined}
                title={row.leadId ? `Open lead #${row.leadId} in CRM` : undefined}
                onClick={() => openCrmLead(row.leadId)}
                onKeyDown={(event) => {
                  if (!row.leadId) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openCrmLead(row.leadId);
                  }
                }}
              >
                {index === 0 ? (
                  <td rowSpan={sends.length}>
                    <span>#{lead.leadId} {lead.leadTitle || ""}</span>
                    <CrmLeadButton id={lead.leadId} />
                  </td>
                ) : null}
                <td>{sharePerson(row, direction)}</td>
                <td>{fmtShareWhen(row.sharedAt)}</td>
                <td className={row.worked ? "adr-ok" : "adr-warn"}>{row.workLabel || "—"}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

function AgentSearchPicker({ agent, query, onQuery, onSelect }) {
  const box = useRef(null);
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState("");

  async function loadAgents(force = false) {
    if (busy) return;
    if (agents.length && !force) return;
    setBusy(true);
    setListError("");
    try {
      const res = await fetch("/api/crm-intelligence/agents", { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Could not load agents");
      setAgents(Array.isArray(body.agents) ? body.agents : []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load agents");
    } finally {
      setBusy(false);
    }
  }

  // Agents load only when the picker is opened — not on page mount (avoids Bitrix user.get spam).
  useEffect(() => {
    function onDoc(event) {
      if (!box.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = String(query || "").trim().toLowerCase();
  const shown = agents
    .filter((row) => !q || String(row.name || "").toLowerCase().includes(q))
    .slice(0, 100);

  function pick(row) {
    onSelect(row);
    onQuery(row.name);
    setOpen(false);
  }

  return (
    <div className="adr-agent-picker ci-agent" ref={box}>
      <span className="adr-filter-label">Agent / Team lead</span>
      <label className="ci-agent-field">
        <span className="sr-only">Agent / Team lead</span>
        <input
          value={open ? query : agent?.name || query || ""}
          placeholder={busy && !agents.length ? "Loading agents…" : "Type name to search…"}
          autoComplete="off"
          aria-expanded={open}
          aria-controls="adr-agent-list"
          onFocus={() => {
            setOpen(true);
            onQuery(agent?.name || query || "");
            loadAgents();
          }}
          onChange={(event) => {
            onQuery(event.target.value);
            onSelect(null);
            setOpen(true);
            loadAgents();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && shown[0]) {
              event.preventDefault();
              pick(shown[0]);
            }
          }}
        />
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </label>
      {open ? (
        <ul id="adr-agent-list" className="ci-agent-list" role="listbox">
          {listError ? <li className="ci-agent-empty">{listError}</li> : null}
          {busy && !agents.length ? <li className="ci-agent-empty">Loading all agents…</li> : null}
          {!busy && !listError && agents.length ? (
            <li className="ci-agent-empty">
              {q ? `${shown.length} match${shown.length === 1 ? "" : "es"}` : `${agents.length} agents`}
            </li>
          ) : null}
          {!busy && !listError && !shown.length ? (
            <li className="ci-agent-empty">No matching agent</li>
          ) : null}
          {shown.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={agent?.id === row.id ? "on" : ""}
                onClick={() => pick(row)}
              >
                {row.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AgentDailyReportCard({ defaultAgent = null, compact = false, viewer = null } = {}) {
  const restored = useMemo(() => loadNamedState("agentDailyReport"), []);
  // Never restore a specific agent name — only after user select/search (or parent Check sync).
  const [agentQ, setAgentQ] = useState("");
  const [agent, setAgent] = useState(null);
  const [mode, setMode] = useState(() => restored?.mode || "day");
  const [day, setDay] = useState(() => restored?.day || todayYmd());
  const [month, setMonth] = useState(() => restored?.month || thisMonthYm());
  const [from, setFrom] = useState(() => restored?.from || daysAgoYmd(6));
  const [to, setTo] = useState(() => restored?.to || todayYmd());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteMeta, setNoteMeta] = useState(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteMsg, setNoteMsg] = useState("");
  const [focusPanel, setFocusPanel] = useState("");
  const workedRef = useRef(null);
  const notWorkedRef = useRef(null);
  const proceededRef = useRef(null);
  const tlRef = useRef(null);
  const shareOutRef = useRef(null);
  const shareInRef = useRef(null);
  const optionRef = useRef(null);
  const meetingsRef = useRef(null);
  const dealsRef = useRef(null);
  const callsRef = useRef(null);
  const ownerRef = useRef(null);
  const junkRef = useRef(null);

  const safeData = useMemo(() => ensureReportPrivacy(data, viewer), [data, viewer]);
  const noteDay = mode === "day" ? day : "";

  function boxIds(stored, rows, key, count) {
    const fromRows = uniqueIds((rows || []).map((row) => row?.[key]));
    const fromStored = uniqueIds(stored);
    const cap = Number(count);
    const limit = Number.isFinite(cap) && cap >= 0 ? cap : 0;
    if (fromStored.length === limit) return fromStored;
    if (fromRows.length === limit) return fromRows;
    return [];
  }

  function boxCrm(kind) {
    if (!safeData) return "";
    const stored = safeData.crmLeadIds || {};
    const count = safeData.summary || {};
    const picked = {
      worked: ["lead", boxIds(stored.worked, safeData.leads?.worked, "id", count.leadsWorked), count.leadsWorked],
      notWorked: ["lead", boxIds(stored.notWorked, safeData.leads?.notWorked, "id", count.leadsNotWorked), count.leadsNotWorked],
      proceeded: ["lead", boxIds(stored.proceeded, safeData.leads?.proceeded, "id", count.leadsProceeded), count.leadsProceeded],
      junk: ["lead", boxIds(stored.junk, safeData.leads?.junk, "id", count.leadsJunk), count.leadsJunk],
      meetings: ["lead", boxIds([], safeData.meetingStages, "leadId", count.meetings), count.meetings],
      closedDeals: ["deal", boxIds([], safeData.closedDeals, "id", count.closedDeals), count.closedDeals],
      optionSent: ["lead", boxIds([], safeData.optionSent, "leadId", count.optionSent), count.optionSent],
      ownerWork: ["owner", boxIds([], safeData.ownerWork, "id", count.ownerWork), count.ownerWork],
      calls: ["lead", boxIds([], safeData.calls, "leadId", count.calls), count.calls],
      tlActions: ["lead", boxIds(stored.tlActions, safeData.teamLeadActions?.rows, "leadId", count.tlActions), count.tlActions],
      sharedOut: ["lead", boxIds(stored.sharedOut, safeData.shares?.sharedOut, "leadId", count.sharedOut), count.sharedOut],
      sharedOutWorked: ["lead", boxIds(stored.sharedOutWorked, (safeData.shares?.sharedOut || []).filter((row) => row?.worked), "leadId", count.sharedOutWorked), count.sharedOutWorked],
      sharedOutIdle: ["lead", boxIds(stored.sharedOutIdle, (safeData.shares?.sharedOut || []).filter((row) => !row?.worked), "leadId", count.sharedOutIdle), count.sharedOutIdle],
      sharedIn: ["lead", boxIds(stored.sharedIn, safeData.shares?.sharedIn, "leadId", count.sharedIn), count.sharedIn],
    }[kind];
    if (!picked) return "";
    return reportBoxPath(picked[0], picked[1], picked[2]);
  }

  function openPanel(kind) {
    setFocusPanel(kind);
    const node = {
      worked: workedRef,
      notWorked: notWorkedRef,
      proceeded: proceededRef,
      junk: junkRef,
      tlActions: tlRef,
      sharedOut: shareOutRef,
      sharedOutWorked: shareOutRef,
      sharedOutIdle: shareOutRef,
      sharedIn: shareInRef,
      optionSent: optionRef,
      meetings: meetingsRef,
      closedDeals: dealsRef,
      calls: callsRef,
      ownerWork: ownerRef,
    }[kind]?.current;
    requestAnimationFrame(() => {
      node?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    // Persist range only — never store agent name across reloads.
    saveNamedState("agentDailyReport", {
      agentQ: "",
      agent: null,
      mode,
      day,
      month,
      from,
      to,
    });
  }, [mode, day, month, from, to]);

  useEffect(() => {
    let cancelled = false;
    async function loadNotes() {
      if (!agent?.id || mode !== "day" || !noteDay) {
        setNoteText("");
        setNoteMeta(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/crm-intelligence/daily-report/notes?agentId=${encodeURIComponent(agent.id)}&day=${encodeURIComponent(noteDay)}`,
          { credentials: "same-origin" }
        );
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        const note = Array.isArray(body.notes) ? body.notes[0] : null;
        setNoteText(note?.text || "");
        setNoteMeta(note || null);
      } catch {
        if (!cancelled) {
          setNoteText("");
          setNoteMeta(null);
        }
      }
    }
    loadNotes();
    return () => {
      cancelled = true;
    };
  }, [agent?.id, mode, noteDay]);

  async function resolveAgent() {
    if (agent?.id) return agent;
    const typed = agentQ.trim();
    if (!typed) return null;
    const res = await fetch("/api/crm-intelligence/agents", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: typed }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false || !body.agent?.id) {
      throw new Error(body.error || "Select an agent from the list");
    }
    setAgent(body.agent);
    setAgentQ(body.agent.name);
    return body.agent;
  }

  async function onSaveNote() {
    setNoteBusy(true);
    setNoteMsg("");
    setError("");
    try {
      const picked = await resolveAgent();
      if (!picked?.id) throw new Error("Select an agent first.");
      if (mode !== "day") throw new Error("Save TL notes on One day mode (pick the day).");
      const res = await fetch("/api/crm-intelligence/daily-report/notes", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: picked.id, day: noteDay, text: noteText }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Save failed");
      setNoteMeta(body.note || null);
      setNoteMsg("Saved.");
      if (data) {
        setData({
          ...data,
          tlNotes: body.note?.text ? [body.note] : [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setNoteBusy(false);
    }
  }

  async function onCheck() {
    setBusy(true);
    setError("");
    try {
      const picked = await resolveAgent();
      if (!picked?.id) throw new Error("Select an agent from the list, then Check.");
      const res = await fetch("/api/crm-intelligence/daily-report", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: picked.id,
          agentName: picked.name,
          mode,
          day,
          month,
          from,
          to,
          force: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Report failed");
      setData(body);
      setFocusPanel("");
    } catch (err) {
      setData(null);
      setFocusPanel("");
      setError(err instanceof Error ? err.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPdf() {
    if (!data?.agentId) return;
    setPdfBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/daily-report/pdf", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Send the already-loaded report so PDF does not call Bitrix again.
          report: data,
          agentId: data.agentId,
          agentName: data.agentName,
          mode: data.range?.mode || mode,
          day: data.range?.mode === "day" ? data.range?.label : day,
          month: data.range?.mode === "month" ? data.range?.label : month,
        }),
      });
      const type = String(res.headers.get("content-type") || "");
      if (!res.ok || type.includes("application/json")) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `PDF failed (${res.status})`);
      }
      const blob = await res.blob();
      if (!blob || blob.size < 64) throw new Error("PDF file was empty.");
      const pdfBlob = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="?([^"]+)"?/)?.[1] ||
        `agent-report-${data.agentId}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Bitrix iframe often blocks <a download> — open PDF tab as reliable fallback.
      try {
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
          // popup blocked — download click above is the only path
        }
      } catch {
        /* ignore */
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setPdfBusy(false);
    }
  }

  const s = safeData?.summary;
  const phonesOpen = safeData?.privacy?.masked === false;

  return (
    <section className={`adr-card${compact ? " adr-card-compact" : ""}`} aria-label="Agent daily report">
      <div className="adr-head">
        <div className="adr-head-text">
          <h3>{compact ? "TL / Agent Report" : "Team / Agent Daily Report"}</h3>
          <p>Select an agent and period, then press Check to load the report from CRM.</p>
        </div>
        <div className="adr-actions">
          {safeData ? (
            <button type="button" className="ci-ghost adr-pdf-btn" disabled={pdfBusy || busy} onClick={onPdf}>
              {pdfBusy ? "PDF…" : "Download PDF"}
            </button>
          ) : null}
          <button type="button" className="ci-check" disabled={busy} onClick={onCheck}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      </div>

      <div className="adr-filters">
        <AgentSearchPicker
          agent={agent}
          query={agentQ}
          onQuery={(value) => {
            setAgentQ(value);
            setData(null);
          }}
          onSelect={(row) => {
            setAgent(row);
            setData(null);
          }}
        />
        <label>
          Range
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setData(null);
            }}
          >
            <option value="day">One day</option>
            <option value="days7">7 days</option>
            <option value="days15">15 days</option>
            <option value="days30">30 days</option>
            <option value="month">Full month</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {mode === "day" ? (
          <label>
            Day
            <input type="date" value={day} onChange={(e) => { setDay(e.target.value); setData(null); }} />
          </label>
        ) : null}
        {mode === "month" ? (
          <label>
            Month
            <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setData(null); }} />
          </label>
        ) : null}
        {mode === "custom" ? (
          <>
            <label>
              From
              <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setData(null); }} />
            </label>
            <label>
              To
              <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setData(null); }} />
            </label>
          </>
        ) : null}
      </div>

      {error ? <p className="adr-err">{error}</p> : null}

      {!safeData && !busy ? (
        <p className="adr-empty">No report yet. Select an agent from the list and press Check.</p>
      ) : null}

      {safeData ? (
        <>
          <p className="adr-scope">
            {safeData.agentName} (#{safeData.agentId}) · {safeData.range?.label}
            {safeData.range?.from && safeData.range?.to
              ? ` · ${String(safeData.range.from).slice(0, 16)} → ${String(safeData.range.to).slice(0, 16)}`
              : ""}
            {safeData.cached ? " · cached" : ""}
            {phonesOpen ? " · full phones (own report)" : " · phone last-4 hidden"}
            {safeData.shares?.ok === false ? ` · share history: ${safeData.shares.error || "unavailable"}` : ""}
            {safeData.verify
              ? ` · verified: ${safeData.verify.bitrixCreatedAssigned || 0} new assigned · ${safeData.verify.activityOnOwnLeads || 0} own-lead activities · ignored ${safeData.verify.ignoredModifyOnly || 0} old modify-only`
              : ""}
          </p>
          <div className="adr-stats">
            <Stat label="Leads worked" value={s?.leadsWorked} active={focusPanel === "worked"} hint="Leads worked" crmPath={boxCrm("worked")} onClick={() => openPanel("worked")} />
            <Stat label="Not worked" value={s?.leadsNotWorked} active={focusPanel === "notWorked"} hint="Leads not worked" crmPath={boxCrm("notWorked")} onClick={() => openPanel("notWorked")} />
            <Stat label="Proceeded" value={s?.leadsProceeded} active={focusPanel === "proceeded"} hint="Leads proceeded" crmPath={boxCrm("proceeded")} onClick={() => openPanel("proceeded")} />
            <Stat label="Junk" value={s?.leadsJunk} active={focusPanel === "junk"} hint="Junk leads" crmPath={boxCrm("junk")} onClick={() => openPanel("junk")} />
            <Stat label="Meetings" value={s?.meetings} active={focusPanel === "meetings"} hint="Leads whose stage was changed to Meeting or Viewing" crmPath={boxCrm("meetings")} onClick={() => openPanel("meetings")} />
            <Stat label="Closed deals" value={s?.closedDeals} active={focusPanel === "closedDeals"} hint="Deals this agent closed" crmPath={boxCrm("closedDeals")} onClick={() => openPanel("closedDeals")} />
            <Stat label="Option sent" value={s?.optionSent} active={focusPanel === "optionSent"} hint="Option sent after a call" crmPath={boxCrm("optionSent")} onClick={() => openPanel("optionSent")} />
            <Stat label="Owner data" value={s?.ownerWork} active={focusPanel === "ownerWork"} hint="Owner data worked" crmPath={boxCrm("ownerWork")} onClick={() => openPanel("ownerWork")} />
            <Stat label="Calls" value={s?.calls} active={focusPanel === "calls"} hint="Each call, number last digits hidden" crmPath={boxCrm("calls")} onClick={() => openPanel("calls")} />
            <Stat label="Shared out" value={s?.sharedOut} active={focusPanel === "sharedOut"} hint="Shared out details" crmPath={boxCrm("sharedOut")} onClick={() => openPanel("sharedOut")} />
            <Stat label="Share work done" value={s?.sharedOutWorked} active={focusPanel === "sharedOutWorked"} hint="Share work done details" crmPath={boxCrm("sharedOutWorked")} onClick={() => openPanel("sharedOutWorked")} />
            <Stat label="Share no work" value={s?.sharedOutIdle} active={focusPanel === "sharedOutIdle"} hint="Share no work details" crmPath={boxCrm("sharedOutIdle")} onClick={() => openPanel("sharedOutIdle")} />
            <Stat label="Shared in" value={s?.sharedIn} active={focusPanel === "sharedIn"} hint="Shared in details" crmPath={boxCrm("sharedIn")} onClick={() => openPanel("sharedIn")} />
          </div>
          {focusPanel && focusPanel !== "tlActions" ? (
            <p className="adr-focus-back">
              <button type="button" className="ci-ghost" onClick={() => setFocusPanel("")}>Show full report</button>
            </p>
          ) : null}

          <Section title={`Call records (${safeData.calls?.length || 0})`} panel="calls" open={focusPanel} sectionRef={callsRef} highlight={focusPanel === "calls"} note="Every call in this period. Play opens a recording already stored in the system. Contact number last digits stay hidden.">
            {safeData.calls?.length ? (
              <div className="adr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Call</th>
                      <th>Duration</th>
                      <th>From</th>
                      <th>Contact</th>
                      <th>Lead</th>
                      <th>Recording</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeData.calls.map((row) => (
                      <tr key={row.id || `${row.leadId}-${row.when}`} className={row.leadId ? "adr-row-link" : ""} onClick={() => openCrmLead(row.leadId)}>
                        <td>{fmtShareWhen(row.when)}</td>
                        <td>{row.direction || "Call"}</td>
                        <td>{fmtDuration(row.duration || row.talkTime)}</td>
                        <td>{row.from || "—"}</td>
                        <td>
                          {maskPhoneInText(row.phone) || "—"}
                          {row.name ? <div>{phonesOpen ? row.name : maskHalfName(row.name)}</div> : null}
                        </td>
                        <td>
                          {row.leadId ? <span>#{row.leadId} {phonesOpen ? row.leadTitle : maskPhoneInText(row.leadTitle)}</span> : (row.leadTitle || "—")}
                          <CrmLeadButton id={row.leadId} />
                        </td>
                        <td>
                          {row.deskLeadId ? (
                            <a href={`/api/leads/${encodeURIComponent(row.deskLeadId)}/recording`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Play</a>
                          ) : row.hasRecording ? "In Bitrix" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adr-empty">No calls in this period.</p>
            )}
          </Section>

          <Section title={`Meetings (${safeData.meetingStages?.length || 0})`} panel="meetings" open={focusPanel} sectionRef={meetingsRef} highlight={focusPanel === "meetings"} note="Only leads whose stage was changed to Meeting or Viewing in this period.">
            {safeData.meetingStages?.length ? (
              <div className="adr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Stage</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeData.meetingStages.map((row) => (
                      <tr key={row.leadId} className="adr-row-link" onClick={() => openCrmLead(row.leadId)}>
                        <td>#{row.leadId} {phonesOpen ? row.title : maskPhoneInText(row.title)} <CrmLeadButton id={row.leadId} /></td>
                        <td>{row.stage}</td>
                        <td>{fmtShareWhen(row.when)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adr-empty">No meeting or viewing stage change by this agent in this period.</p>
            )}
          </Section>

          <Section title="Closed deals" panel="closedDeals" open={focusPanel} sectionRef={dealsRef} highlight={focusPanel === "closedDeals"} note="Deals this agent closed in this period.">
            {safeData.closedDeals?.length ? (
              <div className="adr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Deal</th>
                      <th>Result</th>
                      <th>Amount</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeData.closedDeals.map((row) => (
                      <tr key={row.id} className="adr-row-link" onClick={() => openCrmDeal(row.id)}>
                        <td>
                          #{row.id} {phonesOpen ? row.title : maskPhoneInText(row.title)}
                          <button
                            type="button"
                            className="ci-crm-chip adr-row-crm"
                            title={`Open deal #${row.id} in CRM`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openCrmDeal(row.id);
                            }}
                          >
                            <CrmMark />
                          </button>
                        </td>
                        <td>{row.stage}{row.stageName ? ` · ${row.stageName}` : ""}</td>
                        <td>{fmtMoney(row.amount, row.currency)}</td>
                        <td>{fmtShareWhen(row.when)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adr-empty">No closed deals for this agent in this period.</p>
            )}
          </Section>

          <Section title="Option sent" panel="optionSent" open={focusPanel} sectionRef={optionRef} highlight={focusPanel === "optionSent"} note="Stage changed to Option Sent after a call.">
            {safeData.optionSent?.length ? (
              <div className="adr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Call</th>
                      <th>Stage changed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeData.optionSent.map((row) => (
                      <tr key={`${row.leadId}-${row.when}`} className="adr-row-link" onClick={() => openCrmLead(row.leadId)}>
                        <td>#{row.leadId} {phonesOpen ? row.title : maskPhoneInText(row.title)} <CrmLeadButton id={row.leadId} /></td>
                        <td>{phonesOpen ? row.callSubject : maskPhoneInText(row.callSubject)}{row.callAt ? ` · ${fmtShareWhen(row.callAt)}` : ""}</td>
                        <td>{fmtShareWhen(row.when)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adr-empty">No Option Sent stage change after a call in this period.</p>
            )}
          </Section>

          <Section
            title="Leads shared out"
            panel={focusPanel === "sharedOutWorked" || focusPanel === "sharedOutIdle" ? focusPanel : "sharedOut"}
            open={focusPanel}
            sectionRef={shareOutRef}
            highlight={focusPanel === "sharedOut" || focusPanel === "sharedOutWorked" || focusPanel === "sharedOutIdle"}
          >
            <ShareTable
              rows={safeData.shares?.sharedOut}
              direction="out"
              filterWork={focusPanel === "sharedOutWorked" ? "done" : focusPanel === "sharedOutIdle" ? "idle" : ""}
              empty="No shares out in this period."
            />
          </Section>
          <Section
            title="Leads shared in"
            panel="sharedIn"
            open={focusPanel}
            sectionRef={shareInRef}
            highlight={focusPanel === "sharedIn"}
          >
            <ShareTable rows={safeData.shares?.sharedIn} direction="in" empty="No shares received in this period." />
          </Section>

          <Section title="Team lead note" panel="note" open={focusPanel}>
            <div className="adr-note">
              <textarea
                rows={4}
                value={noteText}
                onChange={(e) => {
                  setNoteText(e.target.value);
                  setNoteMsg("");
                }}
                placeholder=""
                disabled={mode !== "day"}
              />
              <div className="adr-note-actions">
                <button type="button" className="btn primary" disabled={noteBusy || mode !== "day" || !agent?.id} onClick={onSaveNote}>
                  {noteBusy ? "Saving…" : "Save note"}
                </button>
                {noteMsg ? <small className="adr-ok">{noteMsg}</small> : null}
                {noteMeta?.authorName ? (
                  <small>
                    Last saved by {noteMeta.authorName}
                    {noteMeta.updatedAt ? ` · ${new Date(noteMeta.updatedAt).toLocaleString()}` : ""}
                  </small>
                ) : null}
              </div>
            </div>
            {Array.isArray(safeData.tlNotes) && safeData.tlNotes.length > 1 ? (
              <ul className="adr-note-list">
                {safeData.tlNotes.map((row) => (
                  <li key={`${row.day}-${row.updatedAt}`}>
                    <b>{row.day}</b> — {row.text}
                    {row.authorName ? <small> · {row.authorName}</small> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section title="Owner data" panel="ownerWork" open={focusPanel} sectionRef={ownerRef} highlight={focusPanel === "ownerWork"} note="Owner Data cards this agent updated.">
            {safeData.ownerWork?.length ? (
              <div className="adr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Card</th>
                      <th>Stage</th>
                      <th>What they did</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeData.ownerWork.map((row) => (
                      <tr key={row.id} className="adr-row-link" onClick={() => openCrmPath(`/crm/type/1042/details/${row.id}/`)}>
                        <td>#{row.id} {phonesOpen ? row.title : maskPhoneInText(row.title)}</td>
                        <td>{row.stage || "—"}</td>
                        <td>{phonesOpen ? row.detail : maskPhoneInText(row.detail)}</td>
                        <td>{fmtShareWhen(row.when)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adr-empty">No Owner Data work in this period.</p>
            )}
          </Section>

          <Section title={`Leads worked (${safeData.leads?.worked?.length || 0})`} panel="worked" open={focusPanel} sectionRef={workedRef} highlight={focusPanel === "worked"}>
            <LeadTable rows={safeData.leads?.worked} empty="No worked leads." />
          </Section>
          <Section title={`Leads not worked (${safeData.leads?.notWorked?.length || 0})`} panel="notWorked" open={focusPanel} sectionRef={notWorkedRef} highlight={focusPanel === "notWorked"}>
            <LeadTable rows={safeData.leads?.notWorked} empty="No idle leads." />
          </Section>
          <Section title={`Leads proceeded (${safeData.leads?.proceeded?.length || 0})`} panel="proceeded" open={focusPanel} sectionRef={proceededRef} highlight={focusPanel === "proceeded"}>
            <LeadTable rows={safeData.leads?.proceeded} empty="No proceeded leads." />
          </Section>
          <Section title={`Junk (${safeData.leads?.junk?.length || 0})`} panel="junk" open={focusPanel} sectionRef={junkRef} highlight={focusPanel === "junk"}>
            <LeadTable rows={safeData.leads?.junk} empty="No junk leads." />
          </Section>
          <Section title="Team lead / other actions" panel="tlActions" open={focusPanel} sectionRef={tlRef} highlight={focusPanel === "tlActions"}>
            {safeData.teamLeadActions?.rows?.length ? (
              <div className="adr-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date and time</th>
                      <th>Team lead</th>
                      <th>Action</th>
                      <th>What they did</th>
                      <th>Lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeData.teamLeadActions.rows.map((row) => (
                      <tr
                        key={row.id}
                        className={row.leadId ? "adr-row-link" : ""}
                        tabIndex={row.leadId ? 0 : undefined}
                        title={row.leadId ? `Open lead #${row.leadId} in CRM` : undefined}
                        onClick={() => openCrmLead(row.leadId)}
                        onKeyDown={(event) => {
                          if (!row.leadId) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openCrmLead(row.leadId);
                          }
                        }}
                      >
                        <td>{fmtShareWhen(row.created)}</td>
                        <td>{row.actorName || (row.actorId ? `User #${row.actorId}` : "—")}</td>
                        <td>{row.typeLabel || "Activity"}</td>
                        <td className="adr-action-detail">{phonesOpen ? (row.detail || row.subject) : maskPhoneInText(row.detail || row.subject)}</td>
                        <td>
                          {row.leadId ? <span>#{row.leadId}</span> : "—"}
                          <CrmLeadButton id={row.leadId} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="adr-empty">{safeData.teamLeadActions?.error || "No other actions in this period."}</p>
            )}
          </Section>
        </>
      ) : null}

      {!safeData && agent?.id && mode === "day" ? (
        <Section title="Team lead note">
          <div className="adr-note">
            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                setNoteMsg("");
              }}
              placeholder=""
            />
            <div className="adr-note-actions">
              <button type="button" className="btn primary" disabled={noteBusy} onClick={onSaveNote}>
                {noteBusy ? "Saving…" : "Save note"}
              </button>
              {noteMsg ? <small className="adr-ok">{noteMsg}</small> : null}
            </div>
          </div>
        </Section>
      ) : null}
    </section>
  );
}

function OfficeShareTable({ rows }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return <p className="adr-empty">No shared leads in this period.</p>;
  return (
    <div className="adr-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Lead</th>
            <th>Shared by</th>
            <th>Shared with</th>
            <th>When</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr
              key={`${row.leadId}-${row.sharedById}-${row.sharedToId}-${row.sharedAt}`}
              className={row.leadId ? "adr-row-link" : ""}
              tabIndex={row.leadId ? 0 : undefined}
              title={row.leadId ? `Open lead #${row.leadId} in CRM` : undefined}
              onClick={() => openCrmLead(row.leadId)}
              onKeyDown={(event) => {
                if (!row.leadId) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openCrmLead(row.leadId);
                }
              }}
            >
              <td>
                <span>#{row.leadId} {row.leadTitle || ""}</span>
                <CrmLeadButton id={row.leadId} />
              </td>
              <td>{row.sharedByName || (row.sharedById ? `User #${row.sharedById}` : "—")}</td>
              <td>{row.sharedToName || (row.sharedToId ? `User #${row.sharedToId}` : "—")}</td>
              <td>{fmtDubai(row.sharedAt)}</td>
              <td className={row.worked ? "adr-ok" : "adr-warn"}>{row.workLabel || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SharePerformance({ rows, note }) {
  const list = rows || [];
  const max = Math.max(0, ...list.map((row) => row.count || 0));
  return (
    <section className="adr-share-perf" aria-label="Agent performance">
      <h4>Agent performance</h4>
      <p>
        {note || "Highest to lowest. The number is leads that agent worked."}
        {" "}
        100% is the agent who worked the most leads in this range.
      </p>
      {!list.length && !/pick one day/i.test(note || "") ? <p className="adr-empty">No agent worked a lead in this range.</p> : null}
      <ul>
        {list.map((row) => {
          const percent = row.count > 0 && max > 0 ? Math.round((row.count / max) * 100) : 0;
          const width = percent > 0 ? Math.max(8, percent) : 6;
          return (
            <li key={row.id}>
              <span>{row.name}</span>
              <div className="ci-bar-track" aria-hidden="true">
                <i style={{ width: `${width}%`, background: "#5d78ff" }} />
              </div>
              <b>
                <span className="adr-share-count">{fmt(row.count)}</span>
                <span className="adr-share-pct">{percent}%</span>
              </b>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function OfficeShareHistoryCard() {
  const [mode, setMode] = useState("all");
  const [day, setDay] = useState(todayYmd);
  const [month, setMonth] = useState(thisMonthYm);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onCheck() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/office-shares", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, day, month, force: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Office share history failed");
      setData(body);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Office share history failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="adr-card" aria-label="Office share history">
      <div className="adr-head">
        <div className="adr-head-text">
          <h3>Office share history</h3>
          <p>Every lead shared in the office. Press Check, then click a row to open that lead in CRM.</p>
        </div>
        <div className="adr-actions">
          <button type="button" className="ci-check" disabled={busy} onClick={onCheck}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      </div>
      <div className="adr-filters">
        <label>
          Range
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setData(null);
            }}
          >
            <option value="all">All history</option>
            <option value="day">One day</option>
            <option value="week">One week</option>
            <option value="month">Full month</option>
          </select>
        </label>
        {mode === "day" || mode === "week" ? (
          <label>
            {mode === "week" ? "Any day in the week" : "Day"}
            <input type="date" value={day} onChange={(e) => { setDay(e.target.value); setData(null); }} />
          </label>
        ) : null}
        {mode === "month" ? (
          <label>
            Month
            <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setData(null); }} />
          </label>
        ) : null}
      </div>
      {error ? <p className="adr-err">{error}</p> : null}
      {!data && !busy ? (
        <p className="adr-empty">No office share history yet. Press Check to load it from CRM.</p>
      ) : null}
      {data?.ok ? (
        <>
          <p className="adr-scope">
            Whole office · {data.range?.label || "All history"}
            {data.range?.from && data.range?.to
              ? ` · ${String(data.range.from).slice(0, 16)} → ${String(data.range.to).slice(0, 16)}`
              : ""}
            {data.truncated ? ` · latest ${data.shares?.length || 0} of ${data.shareCount}` : ""}
            {data.missedAgents ? ` · ${data.missedAgents} agents unread` : ""}
          </p>
          <div className="adr-stats">
            <Stat label="Leads shared" value={data.leadCount} />
            <Stat label="Share events" value={data.shareCount} />
          </div>
          <SharePerformance rows={Array.isArray(data.performance) ? data.performance : []} note={data.performanceNote} />
          <Section title="Shared leads">
            <OfficeShareTable rows={data.shares} />
          </Section>
        </>
      ) : null}
    </section>
  );
}
