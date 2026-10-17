import { useEffect, useRef, useState } from "react";
import { usePersistedState } from "./uiPersist.js";
import { dubaiToday, leadDateLabel, leadDateMode, leadDateRangeLabel } from "../../server/leadDate.js";

async function api(path) {
  const res = await fetch(path, { credentials: "same-origin" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function when(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pretty(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function leadTitle(lead) {
  return lead?.sender_name || lead?.sender_phone || lead?.sender_email || "No name";
}

export function LeadRecording({ lead, compact }) {
  const [error, setError] = useState("");
  const talk =
    lead?.channel === "call"
      ? `${lead.call_talk_time || 0}s talk / ${lead.call_wait_time || 0}s wait`
      : "";
  if (!lead?.has_recording) {
    return <span className="muted">{talk || "-"}</span>;
  }
  return (
    <div className={`lead-rec${compact ? " is-compact" : ""}`}>
      <audio
        controls
        preload="none"
        src={`/api/leads/${encodeURIComponent(lead.id)}/recording`}
        aria-label={`Call recording for ${lead.sender_name || lead.sender_phone || "this lead"}`}
        onError={() => setError("Could not play this recording.")}
        onLoadedMetadata={() => setError("")}
      />
      {talk ? <small>{talk}</small> : null}
      {error ? <small className="err">{error}</small> : null}
    </div>
  );
}

const CHANNELS = ["whatsapp", "call", "email", "sms"];
const STATUSES = ["sent", "delivered", "read", "replied", "missed", "answered"];

const PORTALS = [
  { id: "pf", label: "Property Finder" },
  { id: "bayut", label: "Bayut" },
  { id: "dubizzle", label: "Dubizzle" },
  { id: "other", label: "Other CRM" },
];

function portalOf(lead) {
  return lead?.portal || "pf";
}

function portalLabel(lead) {
  return lead?.portal_label || PORTALS.find((row) => row.id === portalOf(lead))?.label || "Property Finder";
}

function PfLink({ lead, className = "btn" }) {
  if (!lead?.response_link) return null;
  return (
    <a className={className} href={lead.response_link} target="_blank" rel="noreferrer">
      Open with PF
    </a>
  );
}

function CrmLink({ lead, className = "btn" }) {
  if (!lead?.crm_url) return null;
  return (
    <a className={className} href={lead.crm_url} target="_blank" rel="noreferrer">
      Open in CRM
    </a>
  );
}

function LeadLinks({ lead, className = "btn" }) {
  const pf = <PfLink lead={lead} className={className} />;
  const crm = <CrmLink lead={lead} className={className} />;
  if (pf || crm) {
    return (
      <>
        {crm}
        {pf}
      </>
    );
  }
  return <span className="muted">No portal link</span>;
}

function LeadPanel({ lead, onClose, onOpenListing }) {
  if (!lead) return null;
  return (
    <div className="overlay" role="dialog" aria-label="Lead details" onClick={onClose}>
      <div className="viewer dialog wide" onClick={(event) => event.stopPropagation()}>
        <div className="viewer-top">
          <div>
            <small>
              {portalLabel(lead)} · {pretty(lead.channel)} · {pretty(lead.status)} · {when(lead.created_at)}
            </small>
            <h2>{leadTitle(lead)}</h2>
            <p>{lead.sender_phone || lead.sender_email || "No contact on this lead"}</p>
          </div>
          <button className="btn ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="viewer-grid">
          <div>
            <span>Phone</span>
            <b>{lead.sender_phone || "-"}</b>
          </div>
          <div>
            <span>Email</span>
            <b>{lead.sender_email || "-"}</b>
          </div>
          <div>
            <span>Listing</span>
            <b>
              {lead.reference ? (
                <button type="button" className="link" onClick={() => onOpenListing?.(lead.listing_id, lead.reference)}>
                  {lead.reference}
                </button>
              ) : (
                "-"
              )}
            </b>
          </div>
          <div>
            <span>Agent</span>
            <b>{lead.agent_name || "-"}</b>
          </div>
          <div>
            <span>Portal</span>
            <b>{portalLabel(lead)}</b>
          </div>
          <div>
            <span>Channel</span>
            <b>{pretty(lead.channel) || "-"}</b>
          </div>
          <div>
            <span>Status</span>
            <b>{pretty(lead.status) || "-"}</b>
          </div>
          <div>
            <span>Lead type</span>
            <b>{pretty(lead.entity_type) || "-"}</b>
          </div>
          <div>
            <span>Last synced</span>
            <b>{when(lead.synced_at)}</b>
          </div>
          {Array.isArray(lead.tags) && lead.tags.length ? (
            <div>
              <span>Tags</span>
              <b>{lead.tags.join(", ")}</b>
            </div>
          ) : null}
        </div>
        {lead.has_recording ? (
          <div className="viewer-recs">
            <h4>Call recording</h4>
            <p>This is the Property Finder call on this lead.</p>
            <LeadRecording lead={lead} />
          </div>
        ) : lead.channel === "call" ? (
          <p className="muted">This call has no recording yet.</p>
        ) : null}
        <div className="wizard-actions">
          <LeadLinks lead={lead} className="btn primary" />
          {lead.reference ? (
            <button className="btn" type="button" onClick={() => onOpenListing?.(lead.listing_id, lead.reference)}>
              Open listing
            </button>
          ) : null}
          <button className="btn ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeadsView({ onOpenListing, initialReference, toolbar }) {
  const defaults = {
    q: "",
    channel: "",
    status: "",
    portal: "",
    date: "",
    date_mode: "",
    date_from: "",
    date_to: "",
    has_recording: "",
    page: 1,
    pageSize: 25,
  };
  const [filters, setFilters] = usePersistedState("leadsView", () => ({
    ...defaults,
    ...(initialReference ? { q: initialReference } : {}),
  }));
  const [data, setData] = useState({ leads: [], total: 0, page: 1, pageSize: 25, recordingTotal: 0 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [openLead, setOpenLead] = useState(null);
  const [canBack, setCanBack] = useState(false);
  const filtersRef = useRef(filters);
  const requestRef = useRef(0);
  const historyRef = useRef([]);
  filtersRef.current = filters;

  function isTotalList(next) {
    return !next?.q && !next?.channel && !next?.status && !next?.portal && !next?.date && !next?.date_from && !next?.date_to && next?.has_recording !== "1" && Number(next?.page || 1) === 1;
  }

  function remember(next) {
    filtersRef.current = next;
    setFilters(next);
    return next;
  }

  useEffect(() => {
    if (!initialReference) return;
    commit({ ...filtersRef.current, q: initialReference, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReference]);

  async function load(next = filtersRef.current, silent = false) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!silent) setBusy(true);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        if (key === "date_mode" || !value) continue;
        params.set(key, String(value));
      }
      const body = await api(`/api/leads?${params}`);
      if (requestId !== requestRef.current) return;
      setData(body);
      if (body?.page && Number(body.page) !== Number(next.page || 1)) {
        remember({ ...filtersRef.current, page: Number(body.page) });
      }
      setUpdatedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      setError("");
    } catch (err) {
      if (requestId !== requestRef.current) return;
      if (!silent) setError(err.message);
    } finally {
      if (requestId === requestRef.current && !silent) setBusy(false);
    }
  }

  useEffect(() => {
    load(filtersRef.current);
    const tick = setInterval(() => load(filtersRef.current, true), 30000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openLead) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpenLead(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openLead]);

  function commit(next) {
    const current = filtersRef.current;
    const keys = ["q", "channel", "status", "portal", "date", "date_mode", "date_from", "date_to", "has_recording", "page"];
    if (keys.every((key) => String(current?.[key] || "") === String(next?.[key] || ""))) return;
    historyRef.current.push({ ...current });
    if (historyRef.current.length > 30) historyRef.current.shift();
    setCanBack(true);
    remember(next);
    load(next);
  }

  function back() {
    const prev = historyRef.current.pop();
    const next = prev || { ...defaults };
    setCanBack(historyRef.current.length > 0);
    remember(next);
    load(next);
  }

  function apply(patch) {
    const nextPage = patch.page != null ? Number(patch.page) : 1;
    commit({ ...filtersRef.current, ...patch, page: Math.max(1, nextPage || 1) });
  }

  function setRange(patch) {
    const next = { ...filtersRef.current, ...patch, date_mode: "range", date: "", page: 1 };
    const ready = /^\d{4}-\d{2}-\d{2}$/.test(next.date_from || "") && /^\d{4}-\d{2}-\d{2}$/.test(next.date_to || "");
    if (!ready) {
      remember(next);
      return;
    }
    commit(next);
  }

  async function showLead(lead) {
    setOpenLead(lead);
    try {
      const body = await api(`/api/leads/${encodeURIComponent(lead.id)}`);
      if (body.lead) setOpenLead(body.lead);
    } catch {
      /* keep the row we already have */
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const dateMode = filters.date_mode || leadDateMode(filters.date);
  const now = dubaiToday();
  const years = [];
  for (let year = Number(now.year); year >= 2024; year -= 1) years.push(String(year));
  const dateTitle = dateMode === "range"
    ? leadDateRangeLabel(filters.date_from, filters.date_to)
    : leadDateLabel(filters.date);

  function setDateMode(mode) {
    if (mode === "range") {
      const next = remember({ ...filtersRef.current, date_mode: "range", date: "", page: 1 });
      const ready = /^\d{4}-\d{2}-\d{2}$/.test(next.date_from || "") && /^\d{4}-\d{2}-\d{2}$/.test(next.date_to || "");
      if (ready) load(next);
      return;
    }
    if (mode === "day") apply({ date_mode: "day", date: now.day, date_from: "", date_to: "" });
    else if (mode === "month") apply({ date_mode: "month", date: now.month, date_from: "", date_to: "" });
    else if (mode === "year") apply({ date_mode: "year", date: now.year, date_from: "", date_to: "" });
    else apply({ date_mode: "all", date: "", date_from: "", date_to: "" });
  }

  return (
    <div className="leads-view">
      <div className="ov-pagebar">
        <div className="ov-pagebar-left">
          <span className="ov-pagebar-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16v10H8l-4 4V6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <small>A7 Group · Property Finder, Bayut & Dubizzle</small>
            <h1>Leads</h1>
            <p>Property Finder, Bayut and Dubizzle leads from the desk and CRM show here together.</p>
          </div>
        </div>
        <div className="ov-sync">
          <small>
            {data.total.toLocaleString()} leads
            {data.recordingTotal ? ` · ${data.recordingTotal} recordings` : ""}
            {updatedAt ? ` · updated ${updatedAt}` : ""}
          </small>
        </div>
      </div>
      {toolbar || null}
      <div className="desk-toolbar">
        <form
          className="lead-search"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ q: event.currentTarget.elements.q.value });
          }}
        >
          <label className="tool-search">
            <input
              name="q"
              value={filters.q}
              placeholder="Search name, phone, email, reference, agent, CRM id..."
              onChange={(e) => remember({ ...filtersRef.current, q: e.target.value })}
            />
          </label>
          <button className="btn gold tool-btn" type="submit">
            Search
          </button>
        </form>
        <button
          className={`btn tool-btn${filters.has_recording === "1" ? " is-on" : ""}`}
          type="button"
          onClick={() => apply({ has_recording: filters.has_recording === "1" ? "" : "1", channel: "" })}
        >
          Recordings{data.recordingTotal ? ` (${data.recordingTotal})` : ""}
        </button>
        <select className="tool-select" value={filters.portal} onChange={(e) => apply({ portal: e.target.value })}>
          <option value="">All portals</option>
          {PORTALS.map((portal) => (
            <option key={portal.id} value={portal.id}>
              {portal.label}
            </option>
          ))}
        </select>
        <select className="tool-select" value={filters.channel} onChange={(e) => apply({ channel: e.target.value, has_recording: "" })}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {pretty(c)}
            </option>
          ))}
        </select>
        <select className="tool-select" value={filters.status} onChange={(e) => apply({ status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {pretty(s)}
            </option>
          ))}
        </select>
        <div className="lead-date" role="group" aria-label="Lead date">
          <select className="tool-select" value={dateMode} onChange={(e) => setDateMode(e.target.value)}>
            <option value="all">Any date</option>
            <option value="range">Date to date</option>
            <option value="day">One day</option>
            <option value="month">Whole month</option>
            <option value="year">Whole year</option>
          </select>
          {dateMode === "range" ? (
            <>
              <label className="lead-date-range">
                From
                <input
                  className="tool-select lead-date-input"
                  type="date"
                  value={filters.date_from || ""}
                  max={filters.date_to || undefined}
                  onChange={(e) => setRange({ date_from: e.target.value })}
                />
              </label>
              <label className="lead-date-range">
                To
                <input
                  className="tool-select lead-date-input"
                  type="date"
                  value={filters.date_to || ""}
                  min={filters.date_from || undefined}
                  onChange={(e) => setRange({ date_to: e.target.value })}
                />
              </label>
            </>
          ) : null}
          {dateMode === "day" ? (
            <input className="tool-select lead-date-input" type="date" value={filters.date} onChange={(e) => apply({ date: e.target.value })} />
          ) : null}
          {dateMode === "month" ? (
            <input className="tool-select lead-date-input" type="month" value={filters.date} onChange={(e) => apply({ date: e.target.value })} />
          ) : null}
          {dateMode === "year" ? (
            <select className="tool-select" value={filters.date} onChange={(e) => apply({ date: e.target.value })}>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <span className="tool-spacer" />
        {canBack || !isTotalList(filters) ? (
          <button className="btn tool-btn" type="button" onClick={back}>
            Back
          </button>
        ) : null}
        <span className="muted">
          {data.total.toLocaleString()} leads{dateTitle ? ` · ${dateTitle}` : ""}
        </span>
      </div>
      {error ? <p className="err">{error}</p> : null}
      <div className={`table-shell${busy ? " is-busy" : ""}`}>
        <div className="table-wrap">
          <table className="stock leads-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Portal</th>
                <th>Channel</th>
                <th>Lead</th>
                <th>Contact</th>
                <th>Listing</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Call / recording</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty">
                    {busy ? "Loading leads..." : dateTitle ? `No leads in ${dateTitle}.` : "No leads match."}
                  </td>
                </tr>
              ) : null}
              {data.leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="when">{when(lead.created_at)}</td>
                  <td>
                    <span className={`lead-portal ${portalOf(lead)}`}>{portalLabel(lead)}</span>
                  </td>
                  <td>
                    <span className={`lead-ch ${lead.channel}`}>{lead.channel}</span>
                  </td>
                  <td>
                    <button type="button" className="link" onClick={() => showLead(lead)}>
                      {leadTitle(lead)}
                    </button>
                  </td>
                  <td>
                    {lead.sender_phone ? <div>{lead.sender_phone}</div> : null}
                    {lead.sender_email ? <div className="muted">{lead.sender_email}</div> : null}
                  </td>
                  <td>
                    {lead.reference ? (
                      <button type="button" className="link" onClick={() => onOpenListing(lead.listing_id, lead.reference)}>
                        {lead.reference}
                      </button>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>{lead.agent_name || <span className="muted">-</span>}</td>
                  <td>
                    <span className={`status-pill lead-${lead.status}`}>{lead.status || "-"}</span>
                  </td>
                  <td>
                    <LeadRecording lead={lead} compact />
                  </td>
                  <td>
                    <div className="lead-actions">
                      <button className="btn" type="button" onClick={() => showLead(lead)}>
                        Open lead
                      </button>
                      <LeadLinks lead={lead} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <div className="pager-meta">
            Showing <b>{data.total ? (data.page - 1) * data.pageSize + 1 : 0}</b> to <b>{Math.min(data.total, data.page * data.pageSize)}</b> of <b>{data.total}</b> leads
          </div>
          <div className="pager-controls">
            <div className="pager-pages">
              <button className="pager-btn" type="button" disabled={data.page <= 1} onClick={() => apply({ page: data.page - 1 })}>
                ‹
              </button>
              <span className="pager-gap">
                {data.page} / {pages}
              </span>
              <button className="pager-btn" type="button" disabled={data.page >= pages} onClick={() => apply({ page: data.page + 1 })}>
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
      {openLead ? (
        <LeadPanel
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onOpenListing={(id, reference) => {
            setOpenLead(null);
            onOpenListing?.(id, reference);
          }}
        />
      ) : null}
    </div>
  );
}
