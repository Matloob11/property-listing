import { useEffect, useState } from "react";

const FALLBACK = [
  { id: "2560", name: "Hassan TL" },
  { id: "2551", name: "Hussnain" },
  { id: "2297", name: "Javeria" },
  { id: "2298", name: "Asma" },
  { id: "2302", name: "Fozia" },
  { id: "2299", name: "Farhat" },
];

const CRM_ORIGIN = "https://crm.a7grouprealestatedxb.com";

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

function openLead(id) {
  const clean = String(id || "").replace(/\D/g, "");
  if (!clean) return;
  const path = `/crm/lead/details/${clean}/`;
  try {
    if (window.BX24?.openPath) {
      window.BX24.openPath(path);
      return;
    }
  } catch {
    /* new tab */
  }
  window.open(`${CRM_ORIGIN}${path}`, "_blank", "noopener,noreferrer");
}

function parts(value) {
  const raw = String(value || "").trim();
  if (!raw) return { date: "—", time: "—" };
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return { date: raw.slice(0, 10), time: raw.slice(11, 16) };
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(parsed));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(parsed));
  return { date, time };
}

export function TeamLeadReportCard() {
  const [leaders, setLeaders] = useState(FALLBACK);
  const [leaderId, setLeaderId] = useState(FALLBACK[0].id);
  const [mode, setMode] = useState("day");
  const [day, setDay] = useState(todayYmd);
  const [month, setMonth] = useState(thisMonthYm);
  const [from, setFrom] = useState(daysAgoYmd(6));
  const [to, setTo] = useState(todayYmd);
  const [addName, setAddName] = useState("");
  const [matches, setMatches] = useState([]);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm-intelligence/team-leads", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((body) => {
        if (cancelled || !Array.isArray(body?.leaders) || !body.leaders.length) return;
        setLeaders(body.leaders);
        setLeaderId((current) => body.leaders.some((row) => row.id === current) ? current : body.leaders[0].id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCheck() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/team-lead-report", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderId, mode, day, month, from, to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Team lead report failed");
      setData(body);
      if (Array.isArray(body.leaders) && body.leaders.length) setLeaders(body.leaders);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Team lead report failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(person) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/team-leads", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(person?.id ? { action: "add", id: person.id, name: person.name } : { action: "add", name: addName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Could not add that person");
      if (Array.isArray(body.leaders)) setLeaders(body.leaders);
      setMatches(Array.isArray(body.matches) ? body.matches : []);
      if (body.added?.id) {
        setLeaderId(body.added.id);
        setAddName("");
        setMatches([]);
        setData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that person");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/team-leads", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Could not remove that person");
      if (Array.isArray(body.leaders)) {
        setLeaders(body.leaders);
        if (!body.leaders.some((row) => row.id === leaderId)) setLeaderId(body.leaders[0]?.id || "");
      }
      setData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that person");
    } finally {
      setBusy(false);
    }
  }

  const comments = Array.isArray(data?.comments) ? data.comments : [];

  return (
    <section className="adr-card" aria-label="Team lead report">
      <div className="adr-head">
        <div className="adr-head-text">
          <h3>Team lead report</h3>
          <p>Comments from the Team Lead comments box on each lead. Date, time, lead number and the responsible agent.</p>
        </div>
        <div className="adr-actions">
          <button type="button" className="ci-check" disabled={busy || !leaderId} onClick={onCheck}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      </div>
      <div className="adr-tl-picks" role="listbox" aria-label="Team leads">
        {leaders.map((leader) => (
          <span key={leader.id} className="adr-tl-person">
            <button
              type="button"
              className={leaderId === leader.id ? "on" : ""}
              aria-selected={leaderId === leader.id}
              onClick={() => {
                setLeaderId(leader.id);
                setData(null);
              }}
            >
              {leader.name}
            </button>
            {leader.extra ? (
              <button type="button" className="adr-tl-remove" aria-label={`Remove ${leader.name}`} onClick={() => onRemove(leader.id)}>
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
      <div className="adr-tl-add">
        <input
          value={addName}
          placeholder="Add another person"
          onChange={(event) => setAddName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
        />
        <button type="button" className="btn" disabled={busy || addName.trim().length < 2} onClick={() => onAdd()}>
          Add
        </button>
      </div>
      {matches.length ? (
        <div className="adr-tl-matches">
          {matches.map((person) => (
            <button key={person.id} type="button" onClick={() => onAdd(person)}>
              {person.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="adr-filters">
        <label>
          Range
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setData(null);
            }}
          >
            <option value="day">One day</option>
            <option value="week">One week</option>
            <option value="month">Whole month</option>
            <option value="custom">Date to date</option>
          </select>
        </label>
        {mode === "day" || mode === "week" ? (
          <label>
            {mode === "week" ? "Any day in the week" : "Day"}
            <input type="date" value={day} onChange={(event) => { setDay(event.target.value); setData(null); }} />
          </label>
        ) : null}
        {mode === "month" ? (
          <label>
            Month
            <input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setData(null); }} />
          </label>
        ) : null}
        {mode === "custom" ? (
          <>
            <label>
              From
              <input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setData(null); }} />
            </label>
            <label>
              To
              <input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setData(null); }} />
            </label>
          </>
        ) : null}
      </div>
      {error ? <p className="adr-err">{error}</p> : null}
      {!data && !busy ? (
        <p className="adr-empty">Select a person and press Check.</p>
      ) : null}
      {data?.ok ? (
        <>
          <p className="adr-scope">
            {data.leader?.name} · {data.range?.label}
            {data.count != null ? ` · ${data.count} comment${data.count === 1 ? "" : "s"}` : ""}
          </p>
          {comments.length ? (
            <div className="adr-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Lead</th>
                    <th>Responsible</th>
                    <th>Team lead</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {comments.map((row) => {
                    const stamp = parts(row.when);
                    return (
                      <tr key={row.id} className="adr-row-link" onClick={() => openLead(row.leadId)}>
                        <td>{stamp.date}</td>
                        <td>{stamp.time}</td>
                        <td>#{row.leadId} {row.title}</td>
                        <td>{row.responsibleName}</td>
                        <td>{row.authorName}</td>
                        <td>{row.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="adr-empty">No Team Lead comments by {data.leader?.name} in this period.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
