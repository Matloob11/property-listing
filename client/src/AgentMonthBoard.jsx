import { useMemo, useState } from "react";

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function thisMonthYm() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 7);
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

function CrmMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h6v6M20 4 11 13M9 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CountCell({ value, path, label }) {
  return (
    <td className="adr-num">
      <span className="adr-count">
        {fmt(value)}
        {path ? (
          <button type="button" className="ci-crm-chip" title={`Open ${label} in CRM`} aria-label={`Open ${label} in CRM`} onClick={() => openCrmPath(path)}>
            <CrmMark />
          </button>
        ) : null}
      </span>
    </td>
  );
}

export default function AgentMonthBoard() {
  const [mode, setMode] = useState("last30");
  const [month, setMonth] = useState(thisMonthYm);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const rows = useMemo(() => {
    const all = Array.isArray(data?.agents) ? data.agents : [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((row) => String(row.name || "").toLowerCase().includes(q));
  }, [data, query]);

  async function onCheck() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/agent-month", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, month, force: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Monthly report failed");
      setData(body);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Monthly report failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPdf() {
    if (!data?.ok) return;
    setPdfBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/agent-month/pdf", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: {
            month: data.month,
            from: data.from,
            to: data.to,
            truncated: data.truncated,
            totals: data.totals,
            agents: (data.agents || []).map((row) => ({
              id: row.id,
              name: row.name,
              deals: row.deals,
              rent: row.rent,
              sale: row.sale,
              optionSent: row.optionSent,
            })),
          },
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
      const filename = res.headers.get("Content-Disposition")?.match(/filename="?([^"]+)"?/)?.[1] || "all-agents-report.pdf";
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        /* the download click is enough when the tab is blocked */
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setPdfBusy(false);
    }
  }

  const totals = data?.totals || {};

  return (
    <section className="adr-card" aria-label="Agent won deals">
      <div className="adr-head">
        <div className="adr-head-text">
          <h3>Agent won deals</h3>
          <p>Search any name after Check. The CRM icon opens that responsible person, then the Booking stage, then the dates you selected. Won deals, rent, and sale are that same list. Tenant is rent. Buyer is sale. Option sent uses that person, the Option Sent stage, and the same dates.</p>
        </div>
        <div className="adr-actions">
          <button type="button" className="ci-ghost adr-pdf-btn" disabled={pdfBusy || busy || !data?.ok} onClick={onPdf}>
            {pdfBusy ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button type="button" className="ci-check" disabled={busy || (mode === "month" && !month)} onClick={onCheck}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
      </div>
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
            <option value="last30">Last 30 days</option>
            <option value="month">One month</option>
          </select>
        </label>
        {mode === "month" ? (
          <label>
            Month
            <input
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setData(null);
              }}
            />
          </label>
        ) : null}
        <label>
          Agent
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter the loaded names"
            disabled={!data}
          />
        </label>
      </div>
      {error ? <p className="adr-err">{error}</p> : null}
      {!data && !busy ? (
        <p className="adr-empty">No monthly report yet. Choose a month and press Check.</p>
      ) : null}
      {busy ? <p className="adr-empty">Reading this month from Bitrix…</p> : null}
      {data?.ok ? (
        <>
          <p className="adr-scope">
            {data.month}
            {` · ${fmt(totals.deals)} won deals · ${fmt(totals.rent)} rent · ${fmt(totals.sale)} sale · ${fmt(totals.optionSent)} option sent`}
            {totals.other ? ` · ${fmt(totals.other)} other pipeline` : ""}
            {data.truncated ? " · Bitrix returned only part of this month, so these counts can be short" : ""}
          </p>
          <div className="adr-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th className="adr-num">Won deals</th>
                  <th className="adr-num">Rent</th>
                  <th className="adr-num">Sale</th>
                  <th className="adr-num">Option sent</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <CountCell value={row.deals} path={row.dealsPath} label={`${row.name} deals`} />
                    <CountCell value={row.rent} path={row.rentPath} label={`${row.name} rent bookings`} />
                    <CountCell value={row.sale} path={row.salePath} label={`${row.name} sale bookings`} />
                    <CountCell value={row.optionSent} path={row.optionPath} label={`${row.name} option sent`} />
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>No agent matches that name.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
