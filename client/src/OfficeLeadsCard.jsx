import { useEffect, useMemo, useState } from "react";
import { officeLeadFacts, statusIsBroker, statusIsJunk, statusIsNotInterested, statusIsOptionSent } from "../../server/officeLeadFacts.js";
import { officeLeadRowsPath } from "../../server/crmUiLinks.js";

const CRM_ORIGIN = "https://crm.a7grouprealestatedxb.com";
const PURPOSE_ORDER = [
  ["rent", "Rent"],
  ["sale", "Sale"],
  ["unknown", "Empty"],
  ["other", "Other"],
];

function fmt(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString("en-US");
}

function openCrm(path) {
  if (!path) return;
  const url = `${CRM_ORIGIN}${path}`;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) return;
  try {
    if (window.BX24?.openPath) window.BX24.openPath(path);
  } catch {
    /* popup blocked */
  }
}

function communityKey(row) {
  const text = String(row?.communityText || "").trim();
  return text ? text.toLowerCase() : "empty";
}

function dimValue(row, dim) {
  if (dim === "purpose") return row.purpose || "";
  if (dim === "community") return communityKey(row);
  if (dim === "cluster") return row.clusterId || "empty";
  if (dim === "beds") return row.unitKind === "shop" ? "shop" : (row.bedsId || "empty");
  if (dim === "type") return row.unitKind === "shop" ? "shop" : (row.typeId || "empty");
  if (dim === "agent") return row.agentId || "empty";
  return "";
}

function countRows(leads, dim, nameOf) {
  const map = new Map();
  for (const row of leads) {
    const id = dimValue(row, dim);
    const name = nameOf(row) || "Empty";
    const prev = map.get(id) || { id, name, count: 0 };
    prev.count += 1;
    if (name && name !== "Empty") prev.name = name;
    map.set(id, prev);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function BoxIcon({ path, title }) {
  if (!path) return <span className="ol-icon-gap" aria-hidden="true" />;
  return (
    <button type="button" className="ci-crm-chip" title={title} aria-label={title} onClick={() => openCrm(path)}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 4h6v6M20 4 11 13M9 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function CrmIcon({ path, title }) {
  if (!path) return <span className="ol-icon-gap" aria-hidden="true" />;
  return (
    <button type="button" className="ci-crm-chip" title={title} aria-label={title} onClick={() => openCrm(path)}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 4h6v6M20 4 11 13M9 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

const RANGE_OPTIONS = [
  ["day", "One day"],
  ["days7", "Last 7 days"],
  ["days15", "Last 15 days"],
  ["days30", "Last 30 days"],
  ["days45", "Last 45 days"],
  ["days90", "Last 90 days"],
  ["month", "Month"],
  ["custom", "Custom dates"],
  ["all", "Overall"],
];

export function OfficeLeadsCard({ onChecked } = {}) {
  const [mode, setMode] = useState("day");
  const [day, setDay] = useState(todayYmd);
  const [month, setMonth] = useState(todayYmd().slice(0, 7));
  const [fromDay, setFromDay] = useState(todayYmd);
  const [toDay, setToDay] = useState(todayYmd);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [purpose, setPurpose] = useState("");
  const [community, setCommunity] = useState("");
  const [cluster, setCluster] = useState("");
  const [beds, setBeds] = useState("");
  const [type, setType] = useState("");
  const [agent, setAgent] = useState("");
  const [blankOn, setBlankOn] = useState(false);
  const [detail, setDetail] = useState(null);

  async function onCheck() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/office-leads/check", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ mode, day, month, from: fromDay, to: toDay }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Office leads check failed");
      setData(body);
      onChecked?.();
      setPurpose("");
      setCommunity("");
      setCluster("");
      setBeds("");
      setType("");
      setAgent("");
      setBlankOn(false);
      setDetail(null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Office leads check failed");
    } finally {
      setBusy(false);
    }
  }

  const leads = data?.leads || [];

  function matches(row, skip = "") {
    if (skip !== "purpose" && purpose && dimValue(row, "purpose") !== purpose) return false;
    if (skip !== "community" && community && dimValue(row, "community") !== community) return false;
    if (skip !== "cluster" && cluster && dimValue(row, "cluster") !== cluster) return false;
    if (skip !== "beds" && beds && dimValue(row, "beds") !== beds) return false;
    if (skip !== "type" && type && dimValue(row, "type") !== type) return false;
    if (skip !== "agent" && agent && dimValue(row, "agent") !== agent) return false;
    return true;
  }

  const filtered = useMemo(
    () => leads.filter((row) => matches(row)),
    [leads, purpose, community, cluster, beds, type, agent]
  );

  function slice(skip) {
    return leads.filter((row) => matches(row, skip));
  }

  function openDetail(title, rows, options = {}) {
    setDetail({
      title,
      rows,
      from: data?.from || "",
      to: data?.to || "",
      universe: leads,
      truncated: Boolean(data?.truncated),
      blank: Boolean(options.blank),
      ...officeLeadFacts(rows, data?.statuses || []),
    });
  }

  useEffect(() => {
    if (!detail) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setDetail(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  function toggle(dim, id) {
    const current = { purpose, community, cluster, beds, type, agent }[dim] || "";
    const next = current === id ? "" : id;
    if (dim === "purpose") setPurpose(next);
    if (dim === "community") setCommunity(next);
    if (dim === "cluster") setCluster(next);
    if (dim === "beds") setBeds(next);
    if (dim === "type") setType(next);
    if (dim === "agent") setAgent(next);
    setBlankOn(false);
  }

  function rowsPath(rows, blank = false) {
    if (!data || !rows?.length) return "";
    return officeLeadRowsPath({
      from: data.from,
      to: data.to,
      leads: rows,
      universe: leads,
      blank,
    });
  }

  const purposeRows = PURPOSE_ORDER.map(([id, name]) => ({
    id,
    name,
    count: slice("purpose").filter((row) => row.purpose === id).length,
  })).filter((row) => row.count > 0);
  const communities = countRows(slice("community"), "community", (row) => row.communityText || row.community);
  const clusters = countRows(slice("cluster"), "cluster", (row) => row.cluster);
  const bedRows = countRows(slice("beds"), "beds", (row) => row.bedLabel);
  const types = countRows(slice("type"), "type", (row) => row.type);
  const agents = countRows(slice("agent"), "agent", (row) => row.agentName);

  function pickedName(dim, id) {
    const row = leads.find((item) => dimValue(item, dim) === id);
    if (!row) return "";
    if (dim === "purpose") return PURPOSE_ORDER.find(([key]) => key === id)?.[1] || "";
    if (dim === "community") return row.communityText || row.community;
    if (dim === "cluster") return row.cluster;
    if (dim === "beds") return row.bedLabel;
    if (dim === "type") return row.type;
    return row.agentName;
  }

  const blankLeads = leads.filter((row) => row.blank);
  function clearFilters() {
    setPurpose("");
    setCommunity("");
    setCluster("");
    setBeds("");
    setType("");
    setAgent("");
    setBlankOn(false);
  }

  const scopeBits = [
    purpose ? pickedName("purpose", purpose) : "",
    community ? pickedName("community", community) : "",
    cluster ? pickedName("cluster", cluster) : "",
    beds ? pickedName("beds", beds) : "",
    type ? pickedName("type", type) : "",
    agent ? pickedName("agent", agent) : "",
  ].filter(Boolean);
  const scopeCounts = PURPOSE_ORDER.map(([id, name]) => ({
    name,
    count: filtered.filter((row) => row.purpose === id).length,
  })).filter((row) => row.count > 0);

  function rangeLabel(row) {
    if (!row) return "the selected range";
    if (row.mode === "all") return "every lead in CRM";
    if (row.mode === "month") return row.label || "this month";
    if (row.mode === "day") return row.label || "this day";
    return row.label || row.period || "this period";
  }

  function pendingRange() {
    if (mode === "all") return "every lead in CRM";
    if (mode === "month") return month;
    if (mode === "day") return day;
    if (mode === "custom") return fromDay && toDay ? `${fromDay} to ${toDay}` : "your dates";
    return RANGE_OPTIONS.find(([id]) => id === mode)?.[1]?.toLowerCase() || "the selected range";
  }

  return (
    <section className="oi-card ol-leads" aria-label="Office leads">
      <div className="oi-head">
        <div className="oi-head-text">
          <h3>Office leads</h3>
          <p>Check one day, the last 7 to 90 days, a month, your own dates, or every lead in CRM. The boxes stay the full totals. Click a CRM icon to open that same list in CRM with the community, cluster, bedrooms, property type, agent and client type already selected.</p>
        </div>
        <button type="button" className="ci-check" onClick={onCheck} disabled={busy}>
          {busy ? "Checking…" : "Check"}
        </button>
      </div>
      <div className="ol-range">
        <label>
          Range
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setData(null);
            }}
          >
            {RANGE_OPTIONS.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        {mode === "day" ? (
          <label>
            Day
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
              <input type="date" value={fromDay} onChange={(event) => { setFromDay(event.target.value); setData(null); }} />
            </label>
            <label>
              To
              <input type="date" value={toDay} onChange={(event) => { setToDay(event.target.value); setData(null); }} />
            </label>
          </>
        ) : null}
      </div>
      {error ? <p className="oi-err">{error}</p> : null}
      {!data && !busy ? (
        <div className="oi-empty">
          <p>Check to load {pendingRange()} from Bitrix.</p>
        </div>
      ) : null}
      {busy && !data ? (
        <div className="oi-empty">
          <p>Reading leads from Bitrix…</p>
        </div>
      ) : null}
      {data ? (
        <>
          {data.mode && data.mode !== mode ? (
            <p className="oi-source-note">Range changed. Press Check to load it.</p>
          ) : null}
          <p className="oi-source-note">
            {rangeLabel(data)}
            {data.from && data.to ? ` · ${String(data.from).slice(0, 16)} → ${String(data.to).slice(0, 16)} Dubai` : ""}
            {". "}
            {data.verified
              ? `Verified with Bitrix: ${fmt(data.total)} leads. Stage, community, cluster, property type, bedrooms and agent match CRM.`
              : data.truncated
                ? `Bitrix has ${fmt(data.bitrixTotal)} leads. This check read ${fmt(data.total)}.`
                : `Bitrix total ${fmt(data.bitrixTotal)}. This check read ${fmt(data.total)}.`}
            {data.spot?.bitrix != null ? ` ${data.spot.name}: ${fmt(data.spot.ours)} here, ${fmt(data.spot.bitrix)} in Bitrix.` : ""}
          </p>
          <div className="ol-kpis" role="group" aria-label="Office lead totals">
            {[
              ["", "Total", data.total],
              ["rent", "Rent", data.rent],
              ["sale", "Sale", data.sale],
              ["unknown", "Empty", data.unknown],
              ["other", "Other", data.other],
              ["blank", "No details", blankLeads.length],
            ].map(([id, label, value]) => {
              const path = id === "blank"
                ? rowsPath(leads.filter((row) => row.blank), true)
                : rowsPath(id ? leads.filter((row) => row.purpose === id) : leads);
              const active = id === "blank"
                ? blankOn
                : id
                  ? purpose === id && !blankOn
                  : !blankOn && !purpose && !community && !cluster && !beds && !type && !agent;
              return (
                <div key={label} className={`ol-kpi${active ? " is-active" : ""}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const rows = id === "blank"
                        ? leads.filter((row) => row.blank)
                        : id
                          ? leads.filter((row) => row.purpose === id)
                          : leads;
                      openDetail(label, rows, { blank: id === "blank" });
                      if (id === "blank") {
                        setPurpose("");
                        setCommunity("");
                        setCluster("");
                        setBeds("");
                        setType("");
                        setAgent("");
                        setBlankOn((on) => !on);
                        return;
                      }
                      if (id) toggle("purpose", id);
                      else clearFilters();
                    }}
                  >
                    <small>{label}</small>
                    <b>{fmt(value)}</b>
                  </button>
                  <BoxIcon path={path} title={`Open ${fmt(value)} ${label} leads in CRM`} />
                </div>
              );
            })}
          </div>
          {scopeBits.length ? (
            <p className="ol-scope">
              {scopeBits.join(" · ")}: {scopeCounts.map((row) => `${row.name} ${fmt(row.count)}`).join(" · ")}
            </p>
          ) : null}
          {blankOn ? (
            <div className="ol-blank">
              <p>Leads with no reference, community, cluster, bedrooms, property type, or client type.</p>
              {blankLeads.length ? (
                <ul>
                  {blankLeads.map((row) => (
                    <li key={row.id}>
                      <button type="button" onClick={() => openCrm(`/crm/lead/details/${row.id}/`)}>
                        <span>{row.title}</span>
                        <small>{row.agentName}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>None in this period.</p>
              )}
            </div>
          ) : null}
          {blankOn ? null : <div className="ol-grid">
            <LeadPanel title="Purpose" rows={purposeRows} active={purpose} onPick={(id, name) => { openDetail(name, slice("purpose").filter((row) => dimValue(row, "purpose") === id)); toggle("purpose", id); }} pathFor={(row) => rowsPath(slice("purpose").filter((lead) => dimValue(lead, "purpose") === row.id))} />
            <LeadPanel title="Community" rows={communities} active={community} onPick={(id, name) => { openDetail(name, slice("community").filter((row) => dimValue(row, "community") === id)); toggle("community", id); }} pathFor={(row) => rowsPath(slice("community").filter((lead) => dimValue(lead, "community") === row.id))} />
            <LeadPanel title="Cluster" rows={clusters} active={cluster} onPick={(id, name) => { openDetail(name, slice("cluster").filter((row) => dimValue(row, "cluster") === id)); toggle("cluster", id); }} pathFor={(row) => rowsPath(slice("cluster").filter((lead) => dimValue(lead, "cluster") === row.id))} />
            <LeadPanel title="Bedrooms" rows={bedRows} active={beds} onPick={(id, name) => { openDetail(name, slice("beds").filter((row) => dimValue(row, "beds") === id)); toggle("beds", id); }} pathFor={(row) => rowsPath(slice("beds").filter((lead) => dimValue(lead, "beds") === row.id))} />
            <LeadPanel title="Property type" rows={types} active={type} onPick={(id, name) => { openDetail(name, slice("type").filter((row) => dimValue(row, "type") === id)); toggle("type", id); }} pathFor={(row) => rowsPath(slice("type").filter((lead) => dimValue(lead, "type") === row.id))} />
            <LeadPanel title="Agent" rows={agents} active={agent} onPick={(id, name) => { openDetail(name, slice("agent").filter((row) => dimValue(row, "agent") === id)); toggle("agent", id); }} pathFor={(row) => rowsPath(slice("agent").filter((lead) => dimValue(lead, "agent") === row.id))} />
          </div>}
        </>
      ) : null}
      {detail ? <LeadFacts detail={detail} onClose={() => setDetail(null)} /> : null}
    </section>
  );
}

function LeadFacts({ detail, onClose }) {
  const source = detail.rows || [];
  function pathFor(rows, blank = false) {
    return officeLeadRowsPath({
      from: detail.from,
      to: detail.to,
      leads: rows,
      universe: detail.universe,
      blank,
    });
  }
  const highlights = [
    ["Option sent", detail.optionSent, source.filter((row) => statusIsOptionSent(row.statusName))],
    ["Not interested", detail.notInterested, source.filter((row) => statusIsNotInterested(row.statusName))],
    ["Junk", detail.junk, source.filter((row) => statusIsJunk(row.statusName))],
    ["Broker/Agent", detail.broker, source.filter((row) => statusIsBroker(row.statusName))],
  ];
  const stageTotal = (detail.stages || []).reduce((sum, row) => sum + row.count, 0);
  const headerPath = pathFor(source, detail.blank);
  return (
    <div className="ol-facts" role="presentation" onClick={onClose}>
      <div className="ol-facts-card" role="dialog" aria-modal="true" aria-label={`${detail.title} lead details`} onClick={(event) => event.stopPropagation()}>
        <div className="ol-facts-head">
          <div>
            <div className="ol-facts-title">
              <h3>{detail.title}</h3>
              <CrmIcon path={headerPath} title={`Open ${fmt(detail.total)} ${detail.title} leads in CRM`} />
            </div>
            <p>{fmt(detail.total)} leads in this selection</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className="ol-facts-highlights">
          {highlights.map(([label, value, rows]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{fmt(value)}</b>
              <CrmIcon path={pathFor(rows)} title={`Open ${fmt(value)} ${label} leads in CRM`} />
            </div>
          ))}
        </div>
        <div className="ol-facts-cols">
          <div>
            <h4>Every stage</h4>
            <ul>
              {(detail.stages || []).map((row) => {
                const rows = source.filter((lead) => (row.id ? lead.statusId === row.id : (lead.statusName || "No stage") === row.name));
                return (
                  <li key={row.id || row.name}>
                    <span>{row.name}</span>
                    <b>{fmt(row.count)}</b>
                    <CrmIcon path={pathFor(rows)} title={`Open ${fmt(row.count)} ${row.name} leads in CRM`} />
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h4>Client type</h4>
            <ul>
              {(detail.clients || []).map((row) => {
                const rows = source.filter((lead) => (String(lead.clientType || "").trim() || "No client type") === row.name);
                return (
                  <li key={row.name}>
                    <span>{row.name}</span>
                    <b>{fmt(row.count)}</b>
                    <CrmIcon path={pathFor(rows)} title={`Open ${fmt(row.count)} ${row.name} leads in CRM`} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        {stageTotal === detail.total ? null : <p className="ol-facts-warn">Stage counts add up to {fmt(stageTotal)}, not {fmt(detail.total)}.</p>}
      </div>
    </div>
  );
}

function LeadPanel({ title, rows, active, onPick, pathFor }) {
  return (
    <div className="ol-panel">
      <div className="ol-panel-head">
        <h4>{title}</h4>
        <small>{rows.length}</small>
      </div>
      {rows.length ? (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" className={`ol-main${active === row.id ? " is-active" : ""}`} onClick={() => onPick(row.id, row.name)} title={row.name}>
                <span>{row.name}</span>
                <b>{fmt(row.count)}</b>
              </button>
              <CrmIcon path={pathFor(row)} title={`Open ${fmt(row.count)} ${row.name} leads in CRM`} />
            </li>
          ))}
        </ul>
      ) : (
        <p>None in this selection.</p>
      )}
    </div>
  );
}
