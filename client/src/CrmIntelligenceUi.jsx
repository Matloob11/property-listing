import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OfficeInventoryCard } from "./OfficeInventoryCard.jsx";
import { OfficeLeadsCard } from "./OfficeLeadsCard.jsx";
import { AgentDailyReportCard, OfficeShareHistoryCard } from "./AgentDailyReportCard.jsx";
import AgentMonthBoard from "./AgentMonthBoard.jsx";
import { TeamLeadReportCard } from "./TeamLeadReportCard.jsx";
import { loadNamedState, saveNamedState } from "./uiPersist.js";
import { sortRollupRows } from "../../server/rollupSort.js";
import { ownerDataListPath } from "../../server/ownerDataPath.js";
import { crmLeadSlicePath, crmListPath } from "../../server/crmUiLinks.js";

const PERIODS = [
  "All Time",
  "Today",
  "Last 7 Days",
  "Last 30 Days",
  "Last 90 Days",
  "This Month",
  "Last Month",
  "This Quarter",
  "This Year",
  "Custom",
];

const ICONS = {
  chart: "M3 3v18h18M7 14l4-4 3 3 5-6",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  briefcase: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  refresh: "M21 12a9 9 0 1 1-2.6-6.3M21 4v5h-5",
  check: "M20 6 9 17l-5-5",
  percent: "M19 5 5 19M8.5 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4M15.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  ban: "M18.4 5.6 5.6 18.4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 6h2a3 3 0 0 1-3 3M7 6H5a3 3 0 0 0 3 3",
  cash: "M4 7h16v10H4zM4 10c2 1 4 1 6 0s4-1 6 0 4 1 6 0M12 14.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  source: "M12 3v4M12 17v4M4.9 6.5l2.8 2.8M16.3 14.7l2.8 2.8M3 12h4M17 12h4M4.9 17.5l2.8-2.8M16.3 9.3l2.8-2.8",
  chevron: "M6 9l6 6 6-6",
  download: "M12 4v10m0 0 4-4m-4 4-4-4M5 19h14",
  home: "M4 10 12 3l8 7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM10 22V12h4v10",
  external: "M14 4h6v6M20 4 11 13M9 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3",
};

const CRM_ORIGIN = "https://crm.a7grouprealestatedxb.com";

const LEAD_CARDS = [
  { key: "total", label: "Total leads", note: "Created in this period", tone: "info", icon: "file", crm: { entity: "lead" } },
  { key: "inProgress", label: "In progress", note: "Open pipeline · click to open CRM", tone: "primary", icon: "refresh", crm: { entity: "lead", semantic: "P" } },
  { key: "converted", label: "Converted", note: "Moved to deals · click to open CRM", tone: "success", icon: "check", crm: { entity: "lead", semantic: "S" } },
  { key: "conversionRate", label: "Conversion rate", note: "Converted / total · click to open CRM", tone: "warn", icon: "percent", kind: "pct", crm: { entity: "lead", semantic: "S" } },
  { key: "junk", label: "Junk leads", note: "Closed as junk · click to open CRM", tone: "danger", icon: "ban", crm: { entity: "lead", semantic: "F" } },
];

const DEAL_CARDS = [
  { key: "total", label: "Total deals", note: "Created in this period", tone: "info", icon: "briefcase", crm: { entity: "deal" } },
  { key: "inProgress", label: "In progress", note: "Active bookings · click to open CRM", tone: "primary", icon: "refresh", crm: { entity: "deal", semantic: "P" } },
  { key: "won", label: "Won deals", note: "Closed won · click to open CRM", tone: "success", icon: "trophy", crm: { entity: "deal", semantic: "S" } },
  { key: "revenue", label: "Revenue", note: "Won deals · click to open CRM", tone: "warn", icon: "cash", kind: "money", crm: { entity: "deal", semantic: "S" } },
  { key: "lost", label: "Lost deals", note: "Closed lost · click to open CRM", tone: "danger", icon: "ban", crm: { entity: "deal", semantic: "F" } },
];

const LEAD_FUNNEL = [
  { name: "New Lead", color: "#38bdf8" },
  { name: "Assigned", color: "#22d3ee" },
  { name: "No name", color: "#fbbf24" },
  { name: "AI Qualified", color: "#84cc16" },
  { name: "Not interested", color: "#94a3b8" },
  { name: "Contacted / In Progress", color: "#a78bfa" },
  { name: "No Answer", color: "#f472b6" },
  { name: "Old Leads Before 6 Months", color: "#fb923c" },
  { name: "Option Sent", color: "#818cf8" },
  { name: "Meeting / Viewing Scheduled", color: "#34d399" },
  { name: "Meeting / Viewing Done", color: "#2dd4bf" },
  { name: "Future Prospect", color: "#86efac" },
  { name: "Booking", color: "#67e8f9" },
  { name: "Junk Lead", color: "#f59e0b" },
];

const DEAL_FUNNEL = [
  "New Booking",
  "Initial",
  "Active Contract",
  "Due in 90 Days",
  "Due in 60 Days",
  "Due in 30 Days",
  "Due in 15 Days",
  "Due in 7 Days",
  "Overdue",
].map((name) => ({ name, color: "#38bdf8" }));

function CiIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function dash(value) {
  return value == null || value === "" ? "—" : value;
}

function fmtNum(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString("en-US");
}

function fmtPeriodRange(from, to) {
  const a = String(from || "").slice(0, 10);
  const b = String(to || "").slice(0, 10);
  if (!a && !b) return "All time";
  if (a && b && a === b) return a;
  if (a && b) return `${a} → ${b}`;
  return a || b;
}

function fmtPct(value) {
  if (value == null || value === "") return "—";
  return `${Number(value).toFixed(1)}%`;
}

function fmtMoney(value) {
  if (value == null || value === "") return "—";
  return `AED ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function crmDetailPath(entity, id) {
  const clean = String(id || "").replace(/\D/g, "");
  if (!clean) return entity === "deal" ? "/crm/deal/list/" : "/crm/lead/list/";
  return entity === "deal" ? `/crm/deal/details/${clean}/` : `/crm/lead/details/${clean}/`;
}

function crmOwnerPath(id) {
  const clean = String(id || "").replace(/\D/g, "");
  return clean ? `/crm/type/1042/details/${clean}/` : ownerDataListPath();
}

function openCrm(path) {
  const href = path.startsWith("http") ? path : `${CRM_ORIGIN}${path}`;
  try {
    if (window.BX24?.openPath) {
      window.BX24.openPath(path.startsWith("http") ? path.replace(CRM_ORIGIN, "") : path);
      return;
    }
  } catch {
    /* fall through */
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function openOwnerCrm(path) {
  const href = path.startsWith("http") ? path : `${CRM_ORIGIN}${path}`;
  window.open(href, "_blank", "noopener,noreferrer");
}

function ownerSliceRows(rows, purpose) {
  return (rows || []).filter((row) => !purpose || row.purpose === purpose);
}

function openOwnerSlice(agentId, rows, purpose) {
  const slice = ownerSliceRows(rows, purpose);
  openOwnerItems(agentId, slice);
}

function uniqueOwnerVals(rows, pick) {
  return [...new Set((rows || []).map(pick).map((value) => String(value || "").trim()).filter(Boolean))];
}

function sameOwnerLabel(rows, pick) {
  const names = uniqueOwnerVals(rows, pick);
  return names.length === 1 ? names[0] : "";
}

function openOwnerItems(agentId, rows, agentName = "") {
  const slice = (rows || []).filter((row) => String(row?.id || "").replace(/\D/g, ""));
  if (!slice.length) return;
  const communitySlug = uniqueOwnerVals(slice, (row) => ownerCommunityId(row));
  const subSlug = uniqueOwnerVals(slice, (row) =>
    String(row.subCommunity || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
  );
  const communityEmpty = slice.every((row) => !row.communityLinked);
  const namedCommunity = communitySlug.length === 1 && !communityEmpty;
  const namedSub = subSlug.length === 1 && slice.every((row) => row.subCommunityLinked);
  const typeName = sameOwnerLabel(slice, (row) => row.type);
  const unitTypeIds = typeName && slice.every((row) => String(row.unitTypeId || "").replace(/\D/g, ""))
    ? uniqueOwnerVals(slice, (row) => row.unitTypeId)
    : [];
  const bedName = sameOwnerLabel(slice, (row) => row.bedLabel);
  const bedValues = bedName && bedName !== "—" && slice.every((row) => String(row.bedEnumId || "").replace(/\D/g, ""))
    ? uniqueOwnerVals(slice, (row) => row.bedEnumId)
    : [];
  const stages = uniqueOwnerVals(slice, (row) => row.stage);
  openOwnerCrm(
    ownerDataListPath({
      agentId,
      agentName,
      stageIds: stages,
      stageName: stages.length === 1 ? sameOwnerLabel(slice, (row) => row.stageLabel) : "",
      communityIds: namedCommunity ? uniqueOwnerVals(slice, (row) => row.communityId) : [],
      communityName: namedCommunity ? sameOwnerLabel(slice, (row) => row.community) : "",
      communityEmpty,
      subCommunityIds: namedSub ? uniqueOwnerVals(slice, (row) => row.subCommunityId) : [],
      subCommunityName: namedSub ? sameOwnerLabel(slice, (row) => row.subCommunity) : "",
      unitTypeIds,
      unitTypeName: unitTypeIds.length ? typeName : "",
      bedValues,
      bedName: bedValues.length ? bedName : "",
      itemIds: slice.length === 1 ? [slice[0].id] : [],
    })
  );
}

function cardValue(card, bucket) {
  const value = bucket?.[card.key];
  if (card.kind === "pct") return fmtPct(value);
  if (card.kind === "money") return fmtMoney(value);
  return fmtNum(value);
}

function csvCell(value) {
  const text = value == null || value === "" ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, columns, rows) {
  const lines = [
    (columns || []).map(csvCell).join(","),
    ...(rows || []).map((row) => (row.cells || []).map(csvCell).join(",")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

function exportFileName(title) {
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const safe = String(title || "export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "export"}-${stamp}.csv`;
}

function ExportBtn({ title, columns, rows }) {
  const disabled = !(rows || []).length;
  return (
    <button
      type="button"
      className="ci-ghost"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        downloadCsv(exportFileName(title), columns, rows);
      }}
    >
      <CiIcon name="download" />
      Export
    </button>
  );
}

function ownerTypeId(row) {
  return String(row?.type || "other").toLowerCase().replace(/[^a-z0-9]+/g, "") || "other";
}

function ownerBedsId(row) {
  return row?.beds == null ? "na" : String(row.beds);
}

function ownerCommunityId(row) {
  return String(row?.community || "none").toLowerCase().replace(/[^a-z0-9]+/g, "") || "none";
}

function ownerStageId(row) {
  return String(row?.stageLabel || "none").toLowerCase().replace(/[^a-z0-9]+/g, "") || "none";
}

function countOwnerRows(rows, keyFn, kind = "default") {
  const map = new Map();
  for (const row of rows || []) {
    const { id, name } = keyFn(row);
    if (!id) continue;
    const prev = map.get(id) || { id, name, count: 0 };
    prev.count += 1;
    map.set(id, prev);
  }
  return sortRollupRows([...map.values()], { kind });
}

function summarizeOwnerRows(rows) {
  return {
    total: rows.length,
    rent: rows.filter((row) => row.purpose === "rent").length,
    sale: rows.filter((row) => row.purpose === "sale").length,
    saleRent: rows.filter((row) => row.purpose === "sale_rent").length,
    types: countOwnerRows(
      rows.filter((row) => row.typeFromEnum !== false),
      (row) => ({ id: ownerTypeId(row), name: row.type || "Other" }),
      "types"
    ),
    beds: countOwnerRows(
      rows.filter((row) => row.bedsFromEnum),
      (row) => ({ id: ownerBedsId(row), name: row.bedLabel || "—" }),
      "beds"
    ),
    communities: countOwnerRows(
      rows,
      (row) => ({
        id: ownerCommunityId(row),
        name: row.community || "Empty community",
      }),
      "communities"
    ),
    subCommunities: countOwnerRows(
      rows.filter((row) => row.subCommunityLinked && row.subCommunity),
      (row) => ({
        id: String(row.subCommunity || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "") || "none",
        name: row.subCommunity,
      }),
      "default"
    ),
    stages: countOwnerRows(
      rows,
      (row) => ({
        id: ownerStageId(row),
        name: row.stageLabel || "—",
      }),
      "default"
    ),
  };
}

function matchOwnerFilters(row, filters, skip = "") {
  if (skip !== "purpose" && filters.purpose && row.purpose !== filters.purpose) return false;
  if (skip !== "type" && filters.type && ownerTypeId(row) !== filters.type) return false;
  if (skip !== "beds" && filters.beds && ownerBedsId(row) !== filters.beds) return false;
  if (skip !== "community" && filters.community && ownerCommunityId(row) !== filters.community) return false;
  if (skip !== "stage" && filters.stage && ownerStageId(row) !== filters.stage) return false;
  return true;
}

function CountFunnel({ title, rows, empty, color, activeId, onSelect, onOpen, onOpenRow, openLabel = "Owner Data" }) {
  const max = Math.max(0, ...(rows || []).map((row) => Number(row.count) || 0));
  const clickable = typeof onSelect === "function";
  const canOpen = typeof onOpen === "function";
  const canOpenRow = typeof onOpenRow === "function";
  return (
    <div className="ci-chips-block">
      <div className="ci-chips-head">
        <h4>{title}</h4>
        {canOpen ? (
          <button type="button" className="ci-crm-chip" title={`Open ${title} in ${openLabel}`} onClick={onOpen}>
            <CiIcon name="external" />
          </button>
        ) : null}
      </div>
      {rows?.length ? (
        <ul className="ci-port-funnel">
          {rows.map((row) => {
            const count = Number(row.count) || 0;
            const width = count > 0 && max > 0 ? Math.max(8, Math.round((count / max) * 100)) : 6;
            const active = activeId != null && activeId !== "" && String(activeId) === String(row.id);
            const rowIcon = canOpenRow ? (
              <button
                type="button"
                className="ci-crm-chip"
                title={`Open ${row.name} in ${openLabel}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenRow(row.id);
                }}
              >
                <CiIcon name="external" />
              </button>
            ) : null;
            return (
              <li key={row.id}>
                {clickable ? (
                  <div className={`ci-port-funnel-row is-clickable${active ? " is-active" : ""}${canOpenRow ? " has-crm-chip" : ""}`}>
                    <button type="button" className="ci-port-funnel-main" onClick={() => onSelect(row.id)}>
                      <span title={row.name}>{row.name}</span>
                      <div className="ci-bar-track">
                        <i style={{ width: `${width}%`, background: color, opacity: count ? 1 : 0.35 }} />
                      </div>
                      <b>{fmtNum(count)}</b>
                    </button>
                    {rowIcon}
                  </div>
                ) : (
                  <div className={`ci-port-funnel-row${canOpenRow ? " has-crm-chip-inline" : ""}`}>
                    <span title={row.name}>{row.name}</span>
                    <div className="ci-bar-track">
                      <i style={{ width: `${width}%`, background: color, opacity: count ? 1 : 0.35 }} />
                    </div>
                    <b>{fmtNum(count)}</b>
                    {rowIcon}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ci-chips-empty">{empty}</p>
      )}
    </div>
  );
}

const EMPTY_OWNER_FILTERS = { purpose: "", type: "", beds: "", community: "", stage: "" };

function AgentPortfolio({ agent, refreshKey = 0 }) {
  const [body, setBody] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(EMPTY_OWNER_FILTERS);

  useEffect(() => {
    const id = agent?.id || "";
    const name = agent?.name || "";
    setFilters(EMPTY_OWNER_FILTERS);
    // Owner Data loads only after Check (refreshKey > 0) — not on agent restore alone.
    if ((!id && !name) || !refreshKey) {
      setBody(null);
      setError("");
      setBusy(false);
      return undefined;
    }
    let cancelled = false;
    setBody(null);
    setBusy(true);
    setError("");
    const qs = new URLSearchParams();
    if (id) qs.set("agentId", id);
    if (name) qs.set("agentName", name);
    qs.set("_", String(refreshKey));
    qs.set("force", "1");
    fetch(`/api/crm-intelligence/owner-data?${qs}`, { credentials: "same-origin" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.ok === false) throw new Error(json.error || "Could not load Owner Data");
        return json;
      })
      .then((json) => {
        if (!cancelled) setBody(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setBody(null);
          setError(err instanceof Error ? err.message : "Could not load Owner Data");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agent?.id, agent?.name, refreshKey]);

  const allProperties = body?.properties || [];
  const hasFilter = Boolean(filters.purpose || filters.type || filters.beds || filters.community || filters.stage);
  const rowsFor = (skip = "") => allProperties.filter((row) => matchOwnerFilters(row, filters, skip));
  const properties = rowsFor();
  const full = summarizeOwnerRows(allProperties);
  const purposeScope = summarizeOwnerRows(rowsFor("purpose"));
  const typeScope = summarizeOwnerRows(rowsFor("type"));
  const bedsScope = summarizeOwnerRows(rowsFor("beds"));
  const communityScope = summarizeOwnerRows(rowsFor("community"));
  const stageScope = summarizeOwnerRows(rowsFor("stage"));

  function toggleFilter(key, next) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === next ? "" : next }));
  }

  function clearFilters() {
    setFilters(EMPTY_OWNER_FILTERS);
  }

  const filterBits = [
    filters.purpose === "rent" ? "Rent" : filters.purpose === "sale" ? "Sale" : filters.purpose === "sale_rent" ? "Sale / Rent" : "",
    filters.type ? typeScope.types.find((row) => row.id === filters.type)?.name || filters.type : "",
    filters.beds ? bedsScope.beds.find((row) => row.id === filters.beds)?.name || filters.beds : "",
    filters.community ? communityScope.communities.find((row) => row.id === filters.community)?.name || filters.community : "",
    filters.stage ? stageScope.stages.find((row) => row.id === filters.stage)?.name || filters.stage : "",
  ].filter(Boolean);

  return (
    <section className="ci-panel ci-section ci-portfolio" aria-label="Owner Data">
      <div className="ci-panel-head">
        <div className="ci-panel-title">
          <span className="ci-ico tone-owner">
            <CiIcon name="home" />
          </span>
          <div>
            <h3>Owner Data</h3>
            <small>
              {agent?.name
                ? `${agent.name} · Rent / Sale / Sale-Rent Availability only · Bitrix official fields (Unit Type, No. of Bedroom, linked Community / Sub Community)${filterBits.length ? ` · filtered: ${filterBits.join(" · ")}` : ""}`
                : "Select an agent to see CRM Owner Data"}
            </small>
          </div>
        </div>
      </div>
      {!agent ? (
        <div className="ci-empty">
          <span className="ci-ico tone-owner">
            <CiIcon name="home" />
          </span>
          <p>Select an agent, then press Check to load Owner Data from CRM.</p>
        </div>
      ) : busy ? (
        <div className="ci-empty">
          <p>Loading Owner Data…</p>
        </div>
      ) : error ? (
        <div className="ci-empty">
          <p>{error}</p>
        </div>
      ) : !body ? (
        <div className="ci-empty">
          <p>Press Check to load {agent.name}&apos;s Owner Data from Bitrix.</p>
        </div>
      ) : (
        <>
          <p className="oi-source-note">
            {body?.verifyNote ||
              "Bitrix verified: charts use official Owner Data fields only (Availability stage, Unit Type, No. of Bedroom, linked Community / Sub Community)."}
          </p>
          <div className="ci-port-kpis ci-lead-kpis">
            <div className={`ci-port-kpi${!hasFilter ? " is-active" : ""}`}>
              <button type="button" className="ci-port-kpi-main" onClick={clearFilters}>
                <small>Total</small>
                {fmtNum(full.total)}
              </button>
              <button
                type="button"
                className="ci-crm-chip ci-port-kpi-crm"
                title="Open these Owner Data items in CRM"
                onClick={() => openOwnerItems(agent?.id, allProperties, agent?.name)}
              >
                <CiIcon name="external" />
              </button>
            </div>
            <div className={`ci-port-kpi${filters.purpose === "rent" ? " is-active" : ""}`}>
              <button type="button" className="ci-port-kpi-main" onClick={() => toggleFilter("purpose", "rent")}>
                <small>Rent Availability</small>
                {fmtNum(full.rent)}
              </button>
              <button
                type="button"
                className="ci-crm-chip ci-port-kpi-crm"
                title="Open these Rent Availability items in CRM Owner Data"
                onClick={() => openOwnerItems(agent?.id, allProperties.filter((row) => row.purpose === "rent"), agent?.name)}
              >
                <CiIcon name="external" />
              </button>
            </div>
            <div className={`ci-port-kpi${filters.purpose === "sale" ? " is-active" : ""}`}>
              <button type="button" className="ci-port-kpi-main" onClick={() => toggleFilter("purpose", "sale")}>
                <small>Sale Availability</small>
                {fmtNum(full.sale)}
              </button>
              <button
                type="button"
                className="ci-crm-chip ci-port-kpi-crm"
                title="Open these Sale Availability items in CRM Owner Data"
                onClick={() => openOwnerItems(agent?.id, allProperties.filter((row) => row.purpose === "sale"), agent?.name)}
              >
                <CiIcon name="external" />
              </button>
            </div>
            <div className={`ci-port-kpi${filters.purpose === "sale_rent" ? " is-active" : ""}`}>
              <button type="button" className="ci-port-kpi-main" onClick={() => toggleFilter("purpose", "sale_rent")}>
                <small>Sale / Rent Availability</small>
                {fmtNum(full.saleRent)}
              </button>
              <button
                type="button"
                className="ci-crm-chip ci-port-kpi-crm"
                title="Open these Sale / Rent Availability items in CRM Owner Data"
                onClick={() => openOwnerItems(agent?.id, allProperties.filter((row) => row.purpose === "sale_rent"), agent?.name)}
              >
                <CiIcon name="external" />
              </button>
            </div>
          </div>
          <div className="ci-port-grid">
            <CountFunnel
              title="Availability"
              rows={[
                { id: "rent", name: "Rent Availability", count: purposeScope.rent },
                { id: "sale", name: "Sale Availability", count: purposeScope.sale },
                { id: "sale_rent", name: "Sale / Rent Availability", count: purposeScope.saleRent },
              ]}
              empty="No availability yet."
              color="#38bdf8"
              activeId={filters.purpose}
              onSelect={(id) => toggleFilter("purpose", id)}
              onOpen={() => openOwnerItems(agent?.id, rowsFor("purpose"), agent?.name)}
              onOpenRow={(id) => openOwnerItems(agent?.id, rowsFor("purpose").filter((row) => row.purpose === id), agent?.name)}
            />
            <CountFunnel
              title="Property type"
              rows={typeScope.types}
              empty="No types yet."
              color="#818cf8"
              activeId={filters.type}
              onSelect={(id) => toggleFilter("type", id)}
              onOpen={() => openOwnerItems(agent?.id, rowsFor("type").filter((row) => row.typeFromEnum !== false), agent?.name)}
              onOpenRow={(id) => openOwnerItems(agent?.id, rowsFor("type").filter((row) => row.typeFromEnum !== false && ownerTypeId(row) === id), agent?.name)}
            />
            <CountFunnel
              title="Beds"
              rows={bedsScope.beds}
              empty="No bed counts yet."
              color="#34d399"
              activeId={filters.beds}
              onSelect={(id) => toggleFilter("beds", id)}
              onOpen={() => openOwnerItems(agent?.id, rowsFor("beds").filter((row) => row.bedsFromEnum), agent?.name)}
              onOpenRow={(id) => openOwnerItems(agent?.id, rowsFor("beds").filter((row) => row.bedsFromEnum && ownerBedsId(row) === id), agent?.name)}
            />
            <CountFunnel
              title="Community"
              rows={communityScope.communities}
              empty="No communities yet."
              color="#fb923c"
              activeId={filters.community}
              onSelect={(id) => toggleFilter("community", id)}
              onOpen={() => openOwnerItems(agent?.id, rowsFor("community"), agent?.name)}
              onOpenRow={(id) => openOwnerItems(agent?.id, rowsFor("community").filter((row) => ownerCommunityId(row) === id), agent?.name)}
            />
            <CountFunnel
              title="Sub community"
              rows={summarizeOwnerRows(properties).subCommunities}
              empty="No sub communities yet."
              color="#fbbf24"
              onOpen={() =>
                openOwnerItems(
                  agent?.id,
                  properties.filter((row) => row.subCommunityLinked && row.subCommunity),
                  agent?.name
                )
              }
              onOpenRow={(id) =>
                openOwnerItems(
                  agent?.id,
                  properties.filter(
                    (row) =>
                      row.subCommunityLinked &&
                      String(row.subCommunity || "")
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "") === id
                  ),
                  agent?.name
                )
              }
            />
            <CountFunnel
              title="Owner Data stages"
              rows={stageScope.stages}
              empty="No stages yet."
              color="#f59e0b"
              activeId={filters.stage}
              onSelect={(id) => toggleFilter("stage", id)}
              onOpen={() => openOwnerItems(agent?.id, rowsFor("stage"), agent?.name)}
              onOpenRow={(id) => openOwnerItems(agent?.id, rowsFor("stage").filter((row) => ownerStageId(row) === id), agent?.name)}
            />
          </div>
          {properties.length ? (
            <div className="ci-port-table">
              <h4>
                {filterBits.length ? `${filterBits.join(" · ")} properties` : "Properties"}
                <button
                  type="button"
                  className="ci-crm-chip"
                  title="Open these properties in Owner Data"
                  onClick={() => openOwnerItems(agent?.id, properties, agent?.name)}
                >
                  <CiIcon name="external" />
                </button>
              </h4>
              <div className="ci-table-scroll tall">
                <table>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Community</th>
                      <th>Type</th>
                      <th>Beds</th>
                      <th>Purpose</th>
                      <th>Price</th>
                      <th>Size</th>
                      <th>Owner</th>
                      <th>Source</th>
                      <th>Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((row) => (
                      <tr key={row.id} className="ci-row-link" onClick={() => openCrm(crmOwnerPath(row.id))}>
                        <td>{row.title}</td>
                        <td>{dash(row.community)}</td>
                        <td>{dash(row.type)}</td>
                        <td>{dash(row.bedLabel)}</td>
                        <td>{dash(row.purposeLabel)}</td>
                        <td>{row.price ? fmtMoney(row.price) : "—"}</td>
                        <td>{dash(row.size)}</td>
                        <td>{dash(row.owner)}</td>
                        <td>{dash(row.source)}</td>
                        <td>{dash(row.stageLabel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="ci-port-empty">
              {filterBits.length ? `No Owner Data items for ${filterBits.join(" · ")}.` : "No Owner Data items for this agent."}
            </p>
          )}
        </>
      )}
    </section>
  );
}

const EMPTY_LEAD_FILTERS = { purpose: "", type: "", beds: "", community: "", subCommunity: "" };

function leadPurpose(row) {
  const id = String(row?.clientTypeId || "").replace(/\D/g, "");
  if (id === "1220") return "rent";
  if (id === "972") return "sale";
  if (id === "973" || id === "2410") return "other";
  return "unknown";
}

function leadTypeKey(row) {
  return String(row?.typeId || "").replace(/\D/g, "") || "empty";
}

function leadBedsKey(row) {
  return String(row?.bedsId || "").replace(/\D/g, "") || "empty";
}

function leadCommunityKey(row) {
  return String(row?.communityId || "").replace(/\D/g, "") || "empty";
}

function leadSubCommunityId(row) {
  return String(row?.clusterId || "").replace(/\D/g, "");
}

function matchLeadFilters(row, filters, skip = "") {
  if (skip !== "purpose" && filters.purpose && leadPurpose(row) !== filters.purpose) return false;
  if (skip !== "type" && filters.type && leadTypeKey(row) !== filters.type) return false;
  if (skip !== "beds" && filters.beds && leadBedsKey(row) !== filters.beds) return false;
  if (skip !== "community" && filters.community && leadCommunityKey(row) !== filters.community) return false;
  if (skip !== "subCommunity" && filters.subCommunity && leadSubCommunityId(row) !== filters.subCommunity) return false;
  return true;
}

function summarizeLeadRows(rows) {
  return {
    total: rows.length,
    rent: rows.filter((row) => leadPurpose(row) === "rent").length,
    sale: rows.filter((row) => leadPurpose(row) === "sale").length,
    unknown: rows.filter((row) => leadPurpose(row) === "unknown").length,
    other: rows.filter((row) => leadPurpose(row) === "other").length,
    types: countOwnerRows(rows, (row) => ({ id: leadTypeKey(row), name: row.typeId ? row.type || "Other" : "Empty type" }), "types"),
    beds: countOwnerRows(rows, (row) => ({ id: leadBedsKey(row), name: row.bedsId ? row.bedLabel || "—" : "Empty beds" }), "beds"),
    communities: countOwnerRows(
      rows,
      (row) => ({
        id: leadCommunityKey(row),
        name: row.communityId ? row.communityTitle || row.community || "Community" : "Empty community",
      }),
      "communities"
    ),
    subCommunities: countOwnerRows(
      rows.filter((row) => leadSubCommunityId(row)),
      (row) => ({ id: leadSubCommunityId(row), name: row.subCommunity && row.subCommunity !== "—" ? row.subCommunity : "Sub community" }),
      "default"
    ),
  };
}

function LeadDetailsPanel({ details, note, agentId = "", agentName = "", from = "", to = "" }) {
  const [filters, setFilters] = useState(EMPTY_LEAD_FILTERS);

  useEffect(() => {
    setFilters(EMPTY_LEAD_FILTERS);
  }, [details]);

  if (!details) {
    return (
      <section className="ci-panel ci-section ci-lead-details" aria-label="Lead details">
        <div className="ci-panel-head">
          <div className="ci-panel-title">
            <span className="ci-ico tone-blue">
              <CiIcon name="users" />
            </span>
            <div>
              <h3>Lead details</h3>
              <small>{note || "Select an agent to see community, rent / sale, type and beds"}</small>
            </div>
          </div>
        </div>
        <div className="ci-empty">
          <p>Lead community / rent / sale breakdown loads with the agent Check.</p>
        </div>
      </section>
    );
  }

  const allLeads = details.leads || [];
  const full = summarizeLeadRows(allLeads);
  const hasFilter = Boolean(filters.purpose || filters.type || filters.beds || filters.community || filters.subCommunity);
  const leads = hasFilter ? allLeads.filter((row) => matchLeadFilters(row, filters)) : allLeads;
  const purposeScope = summarizeLeadRows(allLeads.filter((row) => matchLeadFilters(row, filters, "purpose")));
  const typeScope = summarizeLeadRows(allLeads.filter((row) => matchLeadFilters(row, filters, "type")));
  const bedsScope = summarizeLeadRows(allLeads.filter((row) => matchLeadFilters(row, filters, "beds")));
  const communityScope = summarizeLeadRows(allLeads.filter((row) => matchLeadFilters(row, filters, "community")));
  const subScope = summarizeLeadRows(allLeads.filter((row) => matchLeadFilters(row, filters, "subCommunity")));

  function toggleFilter(key, next) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === next ? "" : next }));
  }

  function clearFilters() {
    setFilters(EMPTY_LEAD_FILTERS);
  }

  function openLeadSlice(patch = {}, { box = false } = {}) {
    const next = box ? { ...EMPTY_LEAD_FILTERS, ...patch } : { ...filters, ...patch };
    const slice = allLeads.filter((row) => matchLeadFilters(row, next));
    if (!slice.length) return;
    openOwnerCrm(crmLeadSlicePath({
      agentId,
      agentName,
      from,
      to,
      leads: slice,
      universe: allLeads,
      truncated: Boolean(details.truncated),
    }));
  }

  const filterBits = [
    filters.purpose === "rent"
      ? "Rent"
      : filters.purpose === "sale"
        ? "Sale"
        : filters.purpose === "unknown"
          ? "Empty"
          : filters.purpose === "other"
            ? "Other"
            : "",
    filters.type ? typeScope.types.find((row) => row.id === filters.type)?.name || filters.type : "",
    filters.beds ? bedsScope.beds.find((row) => row.id === filters.beds)?.name || filters.beds : "",
    filters.community ? communityScope.communities.find((row) => row.id === filters.community)?.name || filters.community : "",
    filters.subCommunity ? subScope.subCommunities.find((row) => row.id === filters.subCommunity)?.name || filters.subCommunity : "",
  ].filter(Boolean);

  return (
    <section className="ci-panel ci-section ci-lead-details" aria-label="Lead details">
      <div className="ci-panel-head">
        <div className="ci-panel-title">
          <span className="ci-ico tone-blue">
            <CiIcon name="users" />
          </span>
          <div>
            <h3>Lead details</h3>
            <small>
              {note}
              {" · Rent is Tenant, Sale is Buyer, same client type as CRM."}
              {details.expectedTotal != null && Number(details.expectedTotal) > 0 && details.total !== details.expectedTotal
                ? ` · showing ${fmtNum(details.total)} of ${fmtNum(details.expectedTotal)}`
                : ""}
              {filterBits.length ? ` · filtered: ${filterBits.join(" · ")}` : ""}
              {details.truncated ? " · latest pages only" : ""}
            </small>
          </div>
        </div>
      </div>
      <div className="ci-port-kpis ci-lead-kpis">
        <div className={`ci-port-kpi${!hasFilter ? " is-active" : ""}`}>
          <button type="button" className="ci-port-kpi-main" onClick={clearFilters}>
            <small>Total</small>
            {fmtNum(full.total)}
          </button>
          <button type="button" className="ci-crm-chip ci-port-kpi-crm" title="Open these leads in CRM" onClick={() => openLeadSlice({}, { box: true })}>
            <CiIcon name="external" />
          </button>
        </div>
        <div className={`ci-port-kpi${filters.purpose === "rent" ? " is-active" : ""}`}>
          <button type="button" className="ci-port-kpi-main" onClick={() => toggleFilter("purpose", "rent")}>
            <small>Rent</small>
            {fmtNum(full.rent)}
          </button>
          <button type="button" className="ci-crm-chip ci-port-kpi-crm" title="Open Rent leads in CRM" onClick={() => openLeadSlice({ purpose: "rent" }, { box: true })}>
            <CiIcon name="external" />
          </button>
        </div>
        <div className={`ci-port-kpi${filters.purpose === "sale" ? " is-active" : ""}`}>
          <button type="button" className="ci-port-kpi-main" onClick={() => toggleFilter("purpose", "sale")}>
            <small>Sale</small>
            {fmtNum(full.sale)}
          </button>
          <button type="button" className="ci-crm-chip ci-port-kpi-crm" title="Open Sale leads in CRM" onClick={() => openLeadSlice({ purpose: "sale" }, { box: true })}>
            <CiIcon name="external" />
          </button>
        </div>
        <div className={`ci-port-kpi${filters.purpose === "unknown" ? " is-active" : ""}`}>
          <button type="button" className="ci-port-kpi-main" onClick={() => toggleFilter("purpose", "unknown")}>
            <small>Empty</small>
            {fmtNum(full.unknown)}
          </button>
          <button type="button" className="ci-crm-chip ci-port-kpi-crm" title="Open Empty leads in CRM" onClick={() => openLeadSlice({ purpose: "unknown" }, { box: true })}>
            <CiIcon name="external" />
          </button>
        </div>
      </div>
      <div className="ci-port-grid">
        <CountFunnel
          title="Sale / Rent"
          rows={[
            { id: "rent", name: "Rent", count: purposeScope.rent },
            { id: "sale", name: "Sale", count: purposeScope.sale },
            { id: "unknown", name: "Empty", count: purposeScope.unknown },
            { id: "other", name: "Other", count: purposeScope.other },
          ]}
          empty="No purpose yet."
          color="#38bdf8"
          activeId={filters.purpose}
          onSelect={(id) => toggleFilter("purpose", id)}
          openLabel="CRM leads"
          onOpen={() => openLeadSlice()}
          onOpenRow={(id) => openLeadSlice({ purpose: id })}
        />
        <CountFunnel
          title="Property type"
          rows={typeScope.types}
          empty="No types yet."
          color="#818cf8"
          activeId={filters.type}
          onSelect={(id) => toggleFilter("type", id)}
          openLabel="CRM leads"
          onOpen={() => openLeadSlice()}
          onOpenRow={(id) => openLeadSlice({ type: id })}
        />
        <CountFunnel
          title="Beds"
          rows={bedsScope.beds}
          empty="No bed counts yet."
          color="#34d399"
          activeId={filters.beds}
          onSelect={(id) => toggleFilter("beds", id)}
          openLabel="CRM leads"
          onOpen={() => openLeadSlice()}
          onOpenRow={(id) => openLeadSlice({ beds: id })}
        />
        <CountFunnel
          title="Community"
          rows={communityScope.communities}
          empty="No communities yet."
          color="#fb923c"
          activeId={filters.community}
          onSelect={(id) => toggleFilter("community", id)}
          openLabel="CRM leads"
          onOpen={() => openLeadSlice()}
          onOpenRow={(id) => openLeadSlice({ community: id })}
        />
        <CountFunnel
          title="Sub community"
          rows={subScope.subCommunities}
          empty="No sub communities yet."
          color="#f59e0b"
          activeId={filters.subCommunity}
          onSelect={(id) => toggleFilter("subCommunity", id)}
          openLabel="CRM leads"
          onOpen={() => openLeadSlice()}
          onOpenRow={(id) => openLeadSlice({ subCommunity: id })}
        />
      </div>
      {leads.length ? (
        <div className="ci-port-table">
          <h4>{filterBits.length ? `${filterBits.join(" · ")} leads` : "Leads"}</h4>
          <div className="ci-table-scroll tall">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Community</th>
                  <th>Sub community</th>
                  <th>Type</th>
                  <th>Beds</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((row) => (
                  <tr key={row.id} className="ci-row-link" onClick={() => openCrm(crmDetailPath("lead", row.id))}>
                    <td>{row.title}</td>
                    <td>{dash(row.community)}</td>
                    <td>{dash(row.subCommunity)}</td>
                    <td>{dash(row.type)}</td>
                    <td>{dash(row.bedLabel)}</td>
                    <td>{dash(row.purposeLabel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="ci-port-empty">{filterBits.length ? `No leads for ${filterBits.join(" · ")}.` : "No lead details in this period."}</p>
      )}
    </section>
  );
}

function StatCards({ title, note, tone, icon, cards, bucket, agentId, from, to, sourceId, statusId }) {
  return (
    <section className={`ci-panel ci-section ci-section-${tone}`} aria-label={title}>
      <div className="ci-panel-head">
        <div className="ci-panel-title">
          <span className={`ci-ico tone-${tone}`}>
            <CiIcon name={icon} />
          </span>
          <div>
            <h3>{title}</h3>
            <small>{note}</small>
          </div>
        </div>
      </div>
      <div className="ci-cards">
        {cards.map((card) => (
          <button
            key={card.label}
            type="button"
            className={`ci-card tone-${card.tone}`}
            onClick={() =>
              openCrm(
                crmListPath(card.crm.entity, {
                  semantic: card.crm.semantic,
                  agentId,
                  sourceId,
                  statusId,
                  from,
                  to,
                })
              )
            }
          >
            <div className="ci-card-top">
              <span className="ci-card-label">{card.label}</span>
              <span className={`ci-mini tone-${card.tone}`}>
                <CiIcon name={card.icon} />
              </span>
            </div>
            <b>{cardValue(card, bucket)}</b>
            <small>{card.note || " "}</small>
            <i className="ci-card-bar" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.1c-.24.68-1.42 1.31-1.96 1.36-.5.05-.98.23-3.3-.69-2.78-1.1-4.55-3.93-4.69-4.11-.14-.18-1.12-1.49-1.12-2.84s.71-2.02.96-2.29c.25-.28.55-.35.73-.35.18 0 .37 0 .53.01.17.01.4-.07.62.47.24.57.8 1.97.87 2.11.07.14.12.31.02.49-.09.18-.14.29-.28.45-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.07.95 1.97 1.25 2.25 1.39.28.14.44.12.6-.07.17-.19.69-.8.87-1.08.18-.28.36-.23.61-.14.25.09 1.6.75 1.87.89.28.14.46.21.53.32.07.12.07.66-.17 1.34z"
      />
    </svg>
  );
}

const OPTION_SENT_PASSWORD = "admin123";

async function openWhatsappConversation(conversationId) {
  const res = await fetch("/api/crm-intelligence/open-whatsapp", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, password: OPTION_SENT_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) return;
  const path = body.path || "/marketplace/app/76/";
  if (window.BX24?.openPath) window.BX24.openPath(path);
  else window.open(`https://crm.a7grouprealestatedxb.com${path}`, "_blank", "noopener");
}

function ChatNumberList({ rows, showAgent }) {
  if (!rows?.length) return <p>No numbers in this group.</p>;
  return (
    <>
      <p className="ci-wa-count">{fmtNum(rows.length)} numbers. Scroll to see every one.</p>
      <ul className="ci-wa-numbers">
        {rows.map((row) => (
          <li key={`${row.leadId || ""}-${row.conversationId || "none"}-${row.phone}`}>
            <button
              type="button"
              disabled={!row.conversationId}
              onClick={() => row.conversationId && openWhatsappConversation(row.conversationId)}
            >
              <b>{row.phone}</b>
              {showAgent ? <small>{row.agentName || "No agent on the chat"}</small> : null}
              {!row.conversationId ? <small>No WhatsApp chat</small> : null}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function OptionSentWhatsapp({ split }) {
  const [stage, setStage] = useState("closed");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [list, setList] = useState("whatsapp");
  const [numbers, setNumbers] = useState(null);
  const [numbersNote, setNumbersNote] = useState("");
  const close = () => {
    setStage("closed");
    setPassword("");
    setPasswordError("");
    setList("whatsapp");
    setNumbers(null);
    setNumbersNote("");
  };
  const loadNumbers = async (typed) => {
    setNumbersNote("");
    if (!split?.listKey) {
      setNumbersNote("Check this agent again, then open WhatsApp.");
      return false;
    }
    const res = await fetch("/api/crm-intelligence/option-sent-numbers", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listKey: split.listKey, password: typed }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      setNumbers(null);
      setNumbersNote(body.expired ? "Check this agent again, then open WhatsApp." : "Could not load numbers.");
      return false;
    }
    setNumbers({ chats: body.chats || [], otherChats: body.otherChats || [], missingChats: body.missingChats || [] });
    return true;
  };
  const whatsapp = Number(split.whatsapp) || 0;
  const missing = Number(split.noWhatsapp) || 0;
  const chats = numbers?.chats || [];
  const focused = split.changed != null;
  const rows = focused
    ? [
        ["changed", "Stage changed by this agent", Number(split.changed) || 0, null],
        ["whatsapp", "WhatsApp chats", whatsapp, chats],
        ["missing", "No WhatsApp chat", missing, numbers?.missingChats || []],
      ]
    : [
        ["whatsapp", "WhatsApp chat", whatsapp, chats],
        ["missing", "No WhatsApp chat", missing, null],
        ["own", "On this agent's numbers", Number(split.onAgent) || 0, chats.filter((row) => row.onAgent)],
        ["other", "On another agent's number", Number(split.onOther) || 0, numbers?.otherChats || []],
        ["none", "Lead has no number", Number(split.noPhone) || 0, null],
      ];
  const selected = rows.find((row) => row[0] === list);
  return (
    <div className="ci-wa-box">
      <button
        type="button"
        className="ci-wa-icon"
        aria-label="Option Sent WhatsApp details"
        aria-expanded={stage !== "closed"}
        onClick={() => setStage("password")}
      >
        <WhatsAppMark />
      </button>
      {stage !== "closed"
        ? createPortal(
            <div className="ci-wa-page" role="dialog" aria-label="Option Sent WhatsApp">
              <button type="button" className="ci-wa-close" onClick={close}>
                Close
              </button>
              {stage === "password" ? (
                <form
                  className="ci-wa-lock"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (password === OPTION_SENT_PASSWORD) {
                      const opened = await loadNumbers(password);
                      if (!opened) {
                        setPasswordError("Check this agent again, then open WhatsApp.");
                        return;
                      }
                      setStage("details");
                      setPasswordError("");
                      return;
                    }
                    setPasswordError("Wrong password");
                  }}
                >
                  <strong>Option Sent</strong>
                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      autoFocus
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  {passwordError ? <p>{passwordError}</p> : null}
                  <button type="submit">Open</button>
                </form>
              ) : (
                <div className="ci-wa-sheet">
                  <h2>Option Sent</h2>
                  {split.unavailable ? <p>WhatsApp check unavailable.</p> : null}
                  <div className="ci-wa-stats">
                    {rows.map(([key, label, value, numbers]) =>
                      numbers ? (
                        <button
                          key={key}
                          type="button"
                          className={`ci-wa-stat${list === key ? " is-on" : ""}`}
                          onClick={() => setList(key)}
                        >
                          <span>{label}</span>
                          <b>{fmtNum(value)}</b>
                        </button>
                      ) : (
                        <div key={key} className="ci-wa-stat">
                          <span>{label}</span>
                          <b>{fmtNum(value)}</b>
                        </div>
                      )
                    )}
                  </div>
                  {numbersNote ? <p>{numbersNote}</p> : null}
                  {selected?.[3] ? (
                    <ChatNumberList rows={selected[3]} showAgent={selected[0] === "other" || selected[0] === "whatsapp"} />
                  ) : null}
                  {split.truncated ? <p>This period’s list was cut off.</p> : null}
                </div>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function Funnel({ title, rows, counts, hint, entity, agentId, from, to, sourceId, optionSentWhatsapp = null }) {
  const byName = new Map((counts || []).map((row) => [row.name, row]));
  const filled = rows.map((row) => {
    const got = byName.get(row.name);
    return { ...row, count: got ? Number(got.count) || 0 : null, statusId: got?.statusId || "" };
  });
  const exportRows = filled.map((row) => ({
    id: row.name,
    cells: [row.name, row.count == null ? "—" : fmtNum(row.count)],
  }));
  const max = Math.max(0, ...filled.map((row) => row.count || 0));
  return (
    <section className="ci-panel ci-section ci-funnel" aria-label={title}>
      <div className="ci-panel-head">
        <div className="ci-panel-title">
          <span className="ci-ico tone-info">
            <CiIcon name="chart" />
          </span>
          <div>
            <h3>{title}</h3>
            <small>{hint}</small>
          </div>
        </div>
        <ExportBtn title={title} columns={["Stage", "Count"]} rows={exportRows} />
      </div>
      <ul>
        {filled.map((row) => {
          const width = row.count > 0 && max > 0 ? Math.max(8, Math.round((row.count / max) * 100)) : 6;
          return (
            <li key={row.name}>
              <button
                type="button"
                className="ci-funnel-row"
                onClick={() => openCrm(crmListPath(entity, { agentId, statusId: row.statusId, sourceId, from, to }))}
              >
                <span>{row.name}</span>
                <div className="ci-bar-track">
                  <i style={{ width: `${width}%`, background: row.color, opacity: row.count ? 1 : 0.35 }} />
                </div>
                <b>{fmtNum(row.count)}</b>
              </button>
              {row.name === "Option Sent" && optionSentWhatsapp ? <OptionSentWhatsapp split={optionSentWhatsapp} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function fmtWhen(value) {
  const text = String(value || "").replace("T", " ");
  return text ? text.slice(0, 16) : "—";
}

function ReportTable({ title, note, icon, tone, columns, empty, rows, tall, onRow }) {
  const hasRows = Boolean(rows?.length);
  return (
    <section className={`ci-panel ci-section ci-table-wrap ci-section-${tone}${hasRows ? "" : " is-empty"}`} aria-label={title}>
      <div className="ci-panel-head">
        <div className="ci-panel-title">
          <span className={`ci-ico tone-${tone}`}>
            <CiIcon name={icon} />
          </span>
          <div>
            <h3>
              {title}
              {hasRows ? <em className="ci-count-pill">{rows.length}</em> : null}
            </h3>
            <small>{note}</small>
          </div>
        </div>
        {hasRows ? <ExportBtn title={title} columns={columns} rows={rows} /> : null}
      </div>
      {hasRows ? (
        <div className={`ci-table-scroll${tall ? " tall" : ""}`}>
          <table>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id || row.name}
                  className={onRow ? "ci-row-link" : ""}
                  onClick={onRow ? () => onRow(row) : undefined}
                >
                  {row.cells.map((cell, index) => (
                    <td key={`${row.id || row.name}-${index}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ci-empty">
          <span className={`ci-ico tone-${tone}`}>
            <CiIcon name={icon} />
          </span>
          <p>{empty}</p>
        </div>
      )}
    </section>
  );
}

function FilterPicker({ allLabel, items, busy, error, onOpen, value, onChange }) {
  const box = useRef(null);
  const [open, setOpen] = useState(false);
  const picked = value || null;

  useEffect(() => {
    function onDoc(event) {
      if (!box.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="ci-agent ci-filter" ref={box}>
      <button
        type="button"
        className="ci-agent-field ci-filter-btn"
        aria-expanded={open}
        onClick={() => {
          setOpen((was) => !was);
          onOpen?.();
        }}
      >
        <span>{picked?.name || allLabel}</span>
        <CiIcon name="chevron" />
      </button>
      {open ? (
        <ul className="ci-agent-list" role="listbox">
          <li>
            <button
              type="button"
              className={!picked ? "on" : ""}
              onClick={() => {
                onChange?.(null);
                setOpen(false);
              }}
            >
              {allLabel}
            </button>
          </li>
          {error ? <li className="ci-agent-empty">{error}</li> : null}
          {busy && !items.length ? <li className="ci-agent-empty">Loading CRM list…</li> : null}
          {!busy && !error && !items.length ? (
            <li className="ci-agent-empty">Open again to load CRM options…</li>
          ) : null}
          {items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={picked?.id === row.id ? "on" : ""}
                onClick={() => {
                  onChange?.(row);
                  setOpen(false);
                }}
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

function AgentPicker({ agent, onChange, onDraft }) {
  const box = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function loadAgents() {
    if (busy || agents.length) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/agents", { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Could not load agents");
      setAgents(Array.isArray(body.agents) ? body.agents : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load agents");
    } finally {
      setBusy(false);
    }
  }

  async function addTyped() {
    const name = query.trim();
    if (name.length < 2 || adding) return;
    const existing = agents.find((row) => row.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      onChange(existing);
      onDraft?.(existing.name);
      setQuery(existing.name);
      setOpen(false);
      return;
    }
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/crm-intelligence/agents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Could not add agent");
      const row = body.agent;
      if (!row?.id) throw new Error("Could not add agent");
      setAgents((prev) => {
        if (prev.some((item) => item.id === row.id)) return prev;
        return [...prev, row].sort((a, b) => a.name.localeCompare(b.name));
      });
      onChange(row);
      onDraft?.(row.name);
      setQuery(row.name);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add agent");
    } finally {
      setAdding(false);
    }
  }

  useEffect(() => {
    function onDoc(event) {
      if (!box.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const shown = agents.filter((row) => !q || row.name.toLowerCase().includes(q)).slice(0, 80);
  const exact = agents.some((row) => row.name.toLowerCase() === q);
  const canAdd = q.length >= 2 && !exact;

  return (
    <div className="ci-agent" ref={box}>
      <label className="ci-agent-field">
        <span className="sr-only">Agent</span>
        <input
          value={open ? query : agent?.name || ""}
          placeholder={busy ? "Loading agents…" : "Type or select agent"}
          autoComplete="off"
          aria-expanded={open}
          aria-controls="ci-agent-list"
          onFocus={() => {
            setOpen(true);
            setQuery(agent?.name || "");
            loadAgents();
          }}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            onDraft?.(next);
            setOpen(true);
            if (agent) onChange(null);
            loadAgents();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter") {
              event.preventDefault();
              addTyped();
            }
          }}
        />
        <CiIcon name="chevron" />
      </label>
      {open ? (
        <ul id="ci-agent-list" className="ci-agent-list" role="listbox">
          <li>
            <button type="button" className={!agent ? "on" : ""} onClick={() => { onChange(null); onDraft?.(""); setQuery(""); setOpen(false); }}>
              All Agents
            </button>
          </li>
          {error ? <li className="ci-agent-empty">{error}</li> : null}
          {busy && !agents.length ? <li className="ci-agent-empty">Loading…</li> : null}
          {adding ? <li className="ci-agent-empty">Finding in CRM…</li> : null}
          {canAdd && !adding ? (
            <li>
              <button type="button" onClick={addTyped}>
                Add “{query.trim()}” from CRM
              </button>
            </li>
          ) : null}
          {!busy && !error && !shown.length && !canAdd ? <li className="ci-agent-empty">No agent matches. Type the name and add it.</li> : null}
          {shown.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={agent?.id === row.id ? "on" : ""}
                onClick={() => { onChange(row); onDraft?.(row.name); setQuery(row.name); setOpen(false); }}
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

export function CrmIntelligenceUi({ onAgentChange, onCheckDone, viewer = null, allowedParts = null } = {}) {
  const restored = useMemo(() => loadNamedState("crmIntel"), []);
  const [period, setPeriod] = useState(() =>
    PERIODS.includes(restored?.period) ? restored.period : "Last 30 Days"
  );
  // Never restore a specific agent — only show a name after the user selects/searches.
  const [agent, setAgent] = useState(null);
  const [agentDraft, setAgentDraft] = useState("");
  const [department, setDepartment] = useState(() => restored?.department || null);
  const [source, setSource] = useState(() => restored?.source || null);
  const [leadType, setLeadType] = useState(() => restored?.leadType || null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyQ, setHistoryQ] = useState("");
  const [filterLists, setFilterLists] = useState(null);
  const [filterBusy, setFilterBusy] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [checkPulse, setCheckPulse] = useState(0);
  const allowPart = (id) => {
    if (!Array.isArray(allowedParts)) return true;
    return allowedParts.includes(id);
  };
  const showCrmShell =
    allowPart("ci-crm") ||
    allowPart("ci-owner") ||
    allowPart("ci-leads-detail") ||
    allowPart("ci-history") ||
    allowPart("ci-funnels") ||
    allowPart("ci-reports");
  const showStandalone =
    allowPart("ci-office-leads") ||
    allowPart("ci-office") ||
    allowPart("ci-daily") ||
    allowPart("ci-share-history") ||
    allowPart("ci-listing-history");
  // Only office / daily / listing-history — no CRM shell chrome above them.
  const partsOnly = !showCrmShell && showStandalone;
  const scopeBits = [
    period,
    agent?.id ? `${agent.name || "Agent"} #${agent.id}` : agent?.name || "",
    department?.name || "",
    source?.name || "",
    leadType?.name || "",
  ].filter(Boolean);
  const scopeNote = scopeBits.join(" · ");

  useEffect(() => {
    // Persist period/filters only — never store agent so a name cannot reappear on open.
    saveNamedState("crmIntel", {
      period,
      agent: null,
      agentDraft: "",
      department: department ? { id: department.id, name: department.name } : null,
      source: source ? { id: source.id, name: source.name } : null,
      leadType: leadType ? { id: leadType.id, name: leadType.name } : null,
      historyQ: "",
    });
  }, [period, department, source, leadType]);

  async function loadFilterLists() {
    // Departments / sources / lead types are global CRM lists — load on dropdown open
    // (cached). Do not require an agent; heavy Check / Owner Data stay Check-only.
    if (filterBusy || filterLists) return;
    setFilterBusy(true);
    setFilterError("");
    try {
      const res = await fetch("/api/crm-intelligence/filters", { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Could not load CRM lists");
      setFilterLists({
        departments: Array.isArray(body.departments) ? body.departments : [],
        sources: Array.isArray(body.sources) ? body.sources : [],
        types: Array.isArray(body.types) ? body.types : [],
      });
    } catch (err) {
      setFilterError(err instanceof Error ? err.message : "Could not load CRM lists");
    } finally {
      setFilterBusy(false);
    }
  }

  async function runCheck({
    agentId = "",
    agentName = "",
    periodLabel = period,
    departmentId = department?.id || "",
    sourceId = source?.id || "",
    statusId = leadType?.id || "",
  } = {}) {
    if (!agentId && !String(agentName || "").trim()) {
      throw new Error("Select an agent first — Bitrix is only checked for a named agent.");
    }
    const res = await fetch("/api/crm-intelligence/check", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period: periodLabel,
        agentId,
        agentName,
        departmentId,
        sourceId,
        statusId,
        force: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) throw new Error(body.error || `Check failed (${res.status})`);
    return body;
  }

  async function onCheck() {
    if (busy) return;
    if (!agent?.id && !agent?.name && !agentDraft.trim()) {
      setError("Select an agent first — Bitrix is only checked for a named agent.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = await runCheck({
        agentId: agent?.id || "",
        agentName: agent?.name || agentDraft || "",
        periodLabel: period,
      });
      setData(body);
      setCheckPulse((n) => n + 1);
      onCheckDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    onAgentChange?.(agent?.name || "", agent?.id || "");
  }, [agent?.name, agent?.id, onAgentChange]);

  // Do not auto-call Bitrix on agent/period change — Report + Owner Data load only when Check is pressed.
  useEffect(() => {
    setData(null);
    setError("");
    setCheckPulse(0);
  }, [agent?.id, agent?.name, period, department?.id, source?.id, leadType?.id]);

  const activityRows = (data?.activity || []).map((row) => ({
    id: row.id,
    agentId: row.id,
    cells: [row.name, fmtNum(row.leadsWorked), fmtNum(row.meetings), dash(row.comments), fmtNum(row.total), dash(row.avg)],
  }));
  const responseRows = (data?.response || []).map((row) => ({
    id: row.id,
    agentId: row.id,
    cells: [row.name, fmtNum(row.newLeads), dash(row.c5), dash(row.c30), dash(row.never), dash(row.avg)],
  }));
  const sourceRows = (data?.sources || []).map((row) => ({
    id: row.name,
    name: row.name,
    sourceId: row.id,
    cells: [row.name, fmtNum(row.leads), dash(row.meetings), fmtNum(row.deals), fmtPct(row.conversionRate), fmtNum(row.junk)],
  }));
  const hq = historyQ.trim().toLowerCase();
  const matchHist = (row) => !hq || [row.title, row.status, row.source, row.stage, row.outcome].filter(Boolean).join(" ").toLowerCase().includes(hq);
  const workedRows = (data?.history?.worked || []).filter(matchHist).map((row) => ({
    id: `w-${row.id}`,
    crmId: row.id,
    cells: [row.id, row.title, row.status, row.source, fmtWhen(row.created), fmtWhen(row.modified)],
  }));
  const idleRows = (data?.history?.idle || []).filter(matchHist).map((row) => ({
    id: `i-${row.id}`,
    crmId: row.id,
    cells: [row.id, row.title, row.status, row.source, fmtWhen(row.created)],
  }));
  const dealHistRows = (data?.history?.deals || []).filter(matchHist).map((row) => ({
    id: `d-${row.id}`,
    crmId: row.id,
    cells: [row.id, row.title, row.stage, row.outcome, row.amount ? `${row.currency} ${fmtNum(row.amount)}` : "—", fmtWhen(row.created)],
  }));

  return (
    <div className={`ci-wrap${partsOnly ? " ci-wrap-parts-only" : ""}`}>
      {showCrmShell ? (
      <header className="ci-toolbar">
        <div className="ci-toolbar-bar">
          <div className="ci-brand">
            <span className="ci-ico tone-owner">
              <CiIcon name="chart" />
            </span>
            <div>
              <h2>
                CRM Intelligence
                <em className="ci-live">Live</em>
              </h2>
              <p>Leads, deals, agents and sources</p>
            </div>
          </div>
          <div className="ci-toolbar-end">
            <div className="ci-kpis">
              <b>
                <small>Leads</small>
                {fmtNum(data?.leads?.total)}
              </b>
              <b>
                <small>New deals</small>
                {fmtNum(data?.deals?.total)}
              </b>
            </div>
            <button type="button" className="ci-check" onClick={onCheck} disabled={busy}>
              {busy ? "Checking…" : "Check"}
            </button>
          </div>
        </div>
        <div className="ci-toolbar-filters">
          <div className="ci-filters">
            <FilterPicker
              allLabel="All Departments"
              items={filterLists?.departments || []}
              busy={filterBusy}
              error={filterError}
              value={department}
              onChange={setDepartment}
              onOpen={loadFilterLists}
            />
            <FilterPicker
              allLabel="All Sources"
              items={filterLists?.sources || []}
              busy={filterBusy}
              error={filterError}
              value={source}
              onChange={setSource}
              onOpen={loadFilterLists}
            />
            <FilterPicker
              allLabel="All Lead Types"
              items={filterLists?.types || []}
              busy={filterBusy}
              error={filterError}
              value={leadType}
              onChange={setLeadType}
              onOpen={loadFilterLists}
            />
            <AgentPicker agent={agent} onChange={setAgent} onDraft={setAgentDraft} />
          </div>
        </div>
        {error ? <p className="ci-toolbar-err">{error}</p> : null}
        <div className="ci-periods" role="group" aria-label="Period">
          {PERIODS.map((label) => (
            <button
              key={label}
              type="button"
              className={label === period ? "on" : ""}
              onClick={() => setPeriod(label === "Custom" ? "Last 30 Days" : label)}
            >
              {label}
            </button>
          ))}
        </div>
        {agent ? (
          <p className="ci-period-range">
            {busy && !data
              ? `Loading ${period}…`
              : data
                ? `${period}: ${fmtPeriodRange(data.from, data.to)}`
                : `${period} — select Check if needed`}
          </p>
        ) : null}
      </header>
      ) : null}

      {allowPart("ci-owner") ? <AgentPortfolio agent={agent} refreshKey={checkPulse} /> : null}
      {allowPart("ci-crm") ? (
        <>
          <StatCards
            title="Leads"
            note={scopeNote}
            tone="blue"
            icon="users"
            cards={LEAD_CARDS}
            bucket={data?.leads}
            agentId={agent?.id}
            from={data?.from}
            to={data?.to}
            sourceId={source?.id}
            statusId={leadType?.id}
          />
          <StatCards
            title="Deals"
            note={scopeNote}
            tone="teal"
            icon="briefcase"
            cards={DEAL_CARDS}
            bucket={data?.deals}
            agentId={agent?.id}
            from={data?.from}
            to={data?.to}
            sourceId={source?.id}
          />
        </>
      ) : null}
      {allowPart("ci-leads-detail") ? (
        <LeadDetailsPanel details={data?.leadDetails} note={scopeNote} agentId={agent?.id} agentName={agent?.name} from={data?.from} to={data?.to} />
      ) : null}
      {allowPart("ci-history") && data?.history ? (
        <section className="ci-history" aria-label="Agent history">
          <div className="ci-history-bar">
            <div className="ci-history-title">
              <span className="ci-ico tone-owner" aria-hidden="true">
                <CiIcon name="users" />
              </span>
              <div>
                <h3>Agent history</h3>
                <small>
                  Exact agent {agent?.name || "—"}
                  {agent?.id ? ` (#${agent.id})` : ""} · {scopeNote}
                  {data.history.truncated ? " · latest pages only" : ""}
                </small>
              </div>
            </div>
            <div className="ci-history-actions">
              <div className="ci-history-stats" aria-label="History counts">
                <span className="ci-history-chip is-ok">{fmtNum(data.history.worked.length)} worked</span>
                <span className="ci-history-chip is-idle">{fmtNum(data.history.idle.length)} not worked</span>
                <span className="ci-history-chip is-deal">{fmtNum(data.history.deals.length)} deals</span>
              </div>
              <label className="ci-history-search">
                <span className="sr-only">Search this agent history</span>
                <input value={historyQ} onChange={(event) => setHistoryQ(event.target.value)} placeholder="Search lead, status, source…" />
              </label>
            </div>
          </div>
          <ReportTable
            title="Leads worked"
            note="Touched or moved in this period"
            icon="check"
            tone="success"
            tall
            columns={["ID", "Lead", "Status", "Source", "Created", "Updated"]}
            empty="No worked leads in this period."
            rows={workedRows}
            onRow={(row) => openCrm(crmDetailPath("lead", row.crmId))}
          />
          <ReportTable
            title="Leads not worked"
            note="Assigned in this period, still untouched"
            icon="clock"
            tone="warn"
            tall
            columns={["ID", "Lead", "Status", "Source", "Created"]}
            empty="No idle assigned leads in this period."
            rows={idleRows}
            onRow={(row) => openCrm(crmDetailPath("lead", row.crmId))}
          />
          <ReportTable
            title="Deals"
            note="Deals created for this agent in this period"
            icon="briefcase"
            tone="teal"
            tall
            columns={["ID", "Deal", "Stage", "Outcome", "Amount", "Created"]}
            empty="No deals in this period."
            rows={dealHistRows}
            onRow={(row) => openCrm(crmDetailPath("deal", row.crmId))}
          />
        </section>
      ) : null}

      {allowPart("ci-funnels") ? (
      <div className="ci-funnels">
        <Funnel
          title="Leads Funnel"
          rows={LEAD_FUNNEL}
          counts={data?.leadFunnel}
          hint={data ? `${fmtNum(data.leads?.total)} leads · click a stage` : "Check, then click a stage to open CRM"}
          entity="lead"
          agentId={agent?.id}
          from={data?.from}
          to={data?.to}
          sourceId={source?.id}
          optionSentWhatsapp={data?.optionSentWhatsapp}
        />
        <Funnel
          title="Deals Funnel"
          rows={DEAL_FUNNEL}
          counts={data?.dealFunnel}
          hint={data ? `${fmtNum(data.deals?.total)} deals · click a stage` : "Check, then click a stage to open CRM"}
          entity="deal"
          agentId={agent?.id}
          from={data?.from}
          to={data?.to}
          sourceId={source?.id}
        />
      </div>
      ) : null}

      {allowPart("ci-reports") ? (
      <div className="ci-reports">
        <ReportTable
          title="Activity Summary"
          note={scopeNote}
          icon="bolt"
          tone="warn"
          columns={["Agent", "Leads worked", "Meetings done", "Comments", "Total activities", "Avg / lead"]}
          empty={data ? "No agent activity in this period." : "Check to load agent activity."}
          rows={activityRows}
          onRow={(row) => openCrm(crmListPath("lead", { agentId: row.agentId }))}
        />
        <ReportTable
          title="Response Time Analysis"
          note={scopeNote}
          icon="clock"
          tone="info"
          columns={["Agent", "New leads", "Contacted < 5 min", "Contacted < 30 min", "Never contacted", "Avg time"]}
          empty={data ? "No new leads in this period." : "Check to load response times."}
          rows={responseRows}
          onRow={(row) => openCrm(crmListPath("lead", { agentId: row.agentId, from: data?.from, to: data?.to }))}
        />
        <ReportTable
          title="Source Quality Report"
          note={scopeNote}
          icon="source"
          tone="primary"
          columns={["Source", "Leads", "Meetings", "Deals", "Conversion rate", "Junk"]}
          empty={data ? "No sources in this period." : "Check to load source quality."}
          rows={sourceRows}
          onRow={(row) => openCrm(crmListPath("lead", { agentId: agent?.id, sourceId: row.sourceId, from: data?.from, to: data?.to }))}
        />
      </div>
      ) : null}

      {allowPart("ci-office-leads") ? <OfficeLeadsCard onChecked={onCheckDone} /> : null}
      {allowPart("ci-office") ? <OfficeInventoryCard /> : null}
      {allowPart("ci-daily") ? <AgentDailyReportCard viewer={viewer} /> : null}
      {allowPart("ci-daily") ? <AgentMonthBoard /> : null}
      {allowPart("ci-share-history") ? <OfficeShareHistoryCard /> : null}
      {allowPart("ci-share-history") ? <TeamLeadReportCard /> : null}
    </div>
  );
}
