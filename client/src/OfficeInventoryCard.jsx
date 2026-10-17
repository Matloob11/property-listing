import { useEffect, useMemo, useRef, useState } from "react";
import { officeOwnerListPath } from "../../server/ownerDataPath.js";
import { loadNamedState, saveNamedState } from "./uiPersist.js";

function fmt(n) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("en-US");
}

function money(n) {
  if (n == null || n === "") return "—";
  return `AED ${Number(n).toLocaleString("en-US")}`;
}

function priceRange(min, max) {
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) return `${money(min)} – ${money(max)}`;
  return money(min ?? max);
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function AgentPerson({ name, photo }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = Boolean(photo) && !broken;
  return (
    <span className="oi-person">
      <span className={`oi-avatar${showPhoto ? " has-photo" : ""}`} aria-hidden="true">
        {showPhoto ? <img src={photo} alt="" onError={() => setBroken(true)} /> : initials(name)}
      </span>
      <span>{name}</span>
    </span>
  );
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

function ExportBtn({ title, columns, rows }) {
  const disabled = !(rows || []).length;
  return (
    <button
      type="button"
      className="ci-ghost"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
        const safe = String(title || "export")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        downloadCsv(`${safe || "export"}-${stamp}.csv`, columns, rows);
      }}
    >
      Export
    </button>
  );
}

function openCrm(path) {
  if (!path) return;
  const url = path.startsWith("http") ? path : `${CRM_ORIGIN}${path}`;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) return;
  try {
    if (window.BX24?.openPath) window.BX24.openPath(path);
  } catch {
    /* popup blocked */
  }
}

function CrmIcon({ path, title }) {
  if (!path) return <span className="ol-icon-gap" aria-hidden="true" />;
  return (
    <button
      type="button"
      className="ci-crm-chip"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        openCrm(path);
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 4h6v6M20 4 11 13M9 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Stat({ label, value, active, onClick, crmPath }) {
  return (
    <div className={`oi-stat${active ? " is-active" : ""}`}>
      <button type="button" onClick={onClick} aria-pressed={active}>
        <small>{label}</small>
        <b>{fmt(value)}</b>
      </button>
      {crmPath ? <CrmIcon path={crmPath} title={`Open ${fmt(value)} ${label} in CRM`} /> : null}
    </div>
  );
}

function rowIsActive(activeId, row) {
  const key = String(activeId || "").toLowerCase();
  return Boolean(key) && (key === String(row.id).toLowerCase() || key === String(row.name || "").toLowerCase());
}

function BreakdownTable({ title, rows, empty, activeId, onPick, crmFor }) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    <div className="oi-table-wrap">
      <div className="oi-table-head">
        <h4>{title}</h4>
        <small>{fmt(list.reduce((sum, row) => sum + Number(row.count || 0), 0))}</small>
      </div>
      <div className="oi-table-scroll">
        <table className="oi-table">
          <thead>
            <tr>
              <th>{title}</th>
              <th>Cards</th>
              <th className="oi-crm-col">CRM</th>
            </tr>
          </thead>
          <tbody>
            {list.length ? (
              list.map((row) => (
                <tr
                  key={row.id || row.name}
                  className={`oi-row-link${rowIsActive(activeId, row) ? " is-active" : ""}`}
                  tabIndex={0}
                  onClick={() => onPick?.(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onPick?.(row);
                    }
                  }}
                >
                  <td>{row.name}</td>
                  <td>{fmt(row.count)}</td>
                  <td className="oi-crm-col">
                    <CrmIcon path={crmFor ? crmFor(row) : ""} title={`Open ${fmt(row.count)} ${row.name} in CRM`} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3}>{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChipBlock({ title, rows, empty, valueKey = "count", limit = 14, onPick, activeId, crmFor }) {
  const list = Array.isArray(rows) ? rows : [];
  const shown = limit ? list.slice(0, limit) : list;
  return (
    <div className="oi-block">
      <h4>{title}</h4>
      {list.length ? (
        <ul>
          {shown.map((row) => {
            const count = row[valueKey] ?? row.count ?? row.total;
            const path = crmFor ? crmFor(row) : "";
            const active = rowIsActive(activeId, row);
            return (
              <li key={row.id || row.name}>
                {onPick ? (
                  <button
                    type="button"
                    className={`oi-chip-btn${active ? " is-active" : ""}`}
                    onClick={() => onPick(row)}
                  >
                    <span>{row.name}</span>
                    <b>{fmt(count)}</b>
                  </button>
                ) : (
                  <>
                    <span>{row.name}</span>
                    <b>{fmt(count)}</b>
                  </>
                )}
                <CrmIcon path={path} title={`Open ${fmt(count)} ${row.name} in CRM`} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

const CRM_ORIGIN = "https://crm.a7grouprealestatedxb.com";
const OWNER_DATA_TYPE_ID = 1042;

function ownerDataPath(id) {
  const clean = String(id || "").replace(/\D/g, "");
  return clean ? `/crm/type/${OWNER_DATA_TYPE_ID}/details/${clean}/` : "";
}

function openOwnerData(id) {
  const path = ownerDataPath(id);
  if (!path) return;
  try {
    if (window.BX24?.openPath) {
      window.BX24.openPath(path);
      return;
    }
  } catch {
    /* open in a new tab */
  }
  window.open(`${CRM_ORIGIN}${path}`, "_blank", "noopener,noreferrer");
}

function normText(value) {
  return String(value || "").trim().toLowerCase();
}

const EMPTY_FILTERS = {
  q: "",
  purpose: "",
  status: "",
  type: "",
  beds: "",
  community: "",
  cluster: "",
  agent: "",
};

/** KPI boxes on top — click filters everything below. */
const KPI = {
  listings: "listings",
  live: "live",
  sale: "sale",
  rent: "rent",
  saleRent: "sale_rent",
  liveSale: "live_sale",
  liveRent: "live_rent",
  agents: "agents",
  leads: "leads",
  owners: "owners",
  tenants: "tenants",
  needed: "needed",
  available: "available",
  expiry: "expiry",
  deals: "deals",
};

function purposeLabelOf(row) {
  if (row.purpose === "rent") return "Rent";
  if (row.purpose === "sale_rent") return "Sale / Rent";
  return "Sale";
}

function matchRow(row, filters) {
  const purpose = filters.purpose.trim();
  const type = filters.type.trim().toLowerCase();
  const beds = filters.beds.trim();
  const community = filters.community.trim().toLowerCase();
  const cluster = filters.cluster.trim().toLowerCase();
  const agent = filters.agent.trim().toLowerCase();
  const q = filters.q.trim().toLowerCase();
  if (purpose && row.purpose !== purpose) return false;
  if (type && row.type !== type && normText(row.typeLabel) !== type) return false;
  if (beds && String(row.bedKey) !== beds) return false;
  if (community && normText(row.community) !== community) return false;
  if (cluster && normText(row.cluster) !== cluster) return false;
  if (agent && normText(row.agent) !== agent) return false;
  if (q) {
    const id = String(row.id || "").trim();
    if (/^\d+$/.test(q)) return id === q;
    const fields = [
      row.id,
      row.community,
      row.cluster,
      row.agent,
      row.typeLabel,
      row.bedLabel,
    ].map(normText);
    if (fields.some((field) => field === q)) return true;
    if (q.length >= 3 && fields.some((field) => field.includes(q))) return true;
    return false;
  }
  return true;
}

function filtersForKpi(kpi) {
  if (kpi === KPI.sale) return { purpose: "sale", status: "" };
  if (kpi === KPI.rent) return { purpose: "rent", status: "" };
  if (kpi === KPI.saleRent) return { purpose: "sale_rent", status: "" };
  return { purpose: "", status: "" };
}

function countMap(rows, keyFn, nameFn) {
  const map = new Map();
  for (const row of rows) {
    const id = String(keyFn(row));
    const name = nameFn(row);
    const prev = map.get(id) || { id, name, count: 0 };
    prev.count += 1;
    map.set(id, prev);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Office-wide inventory card — separate Check, all employees, searchable. */
export function OfficeInventoryCard() {
  const restored = useMemo(() => loadNamedState("officeInventory"), []);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(() => {
    const next = { ...EMPTY_FILTERS, ...(restored?.filters || {}) };
    next.agent = "";
    return next;
  });
  const [applied, setApplied] = useState(() => {
    const next = { ...EMPTY_FILTERS, ...(restored?.applied || restored?.filters || {}) };
    next.agent = "";
    return next;
  });
  const [kpi, setKpi] = useState(() => {
    const saved = restored?.kpi;
    if (!Object.values(KPI).includes(saved) || saved === KPI.live) return KPI.listings;
    return saved;
  });
  const detailsRef = useRef(null);
  const skipDetailScroll = useRef(true);

  async function onCheck(opts = {}) {
    if (busy) return;
    const keepFilters = Boolean(opts && typeof opts === "object" && opts.keepFilters);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/office-inventory/check", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Office inventory check failed");
      setData(body);
      if (!keepFilters) {
        setDraft(EMPTY_FILTERS);
        setApplied(EMPTY_FILTERS);
        setKpi(KPI.listings);
      }
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Office inventory check failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    saveNamedState("officeInventory", {
      filters: { ...draft, agent: "" },
      applied: { ...applied, agent: "" },
      kpi,
      hadData: Boolean(data),
    });
  }, [draft, applied, kpi, data]);

  useEffect(() => {
    if (skipDetailScroll.current) {
      skipDetailScroll.current = false;
      return;
    }
    if (!data) return;
    const node = detailsRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [kpi, applied, data]);

  function selectKpi(next) {
    const same = kpi === next;
    const chosen = same && next !== KPI.listings ? KPI.listings : next;
    const resetFilters =
      chosen === KPI.needed ||
      chosen === KPI.leads ||
      chosen === KPI.owners ||
      chosen === KPI.tenants ||
      chosen === KPI.agents ||
      chosen === KPI.live ||
      chosen === KPI.deals;
    const patch = resetFilters ? { ...EMPTY_FILTERS } : { ...EMPTY_FILTERS, ...filtersForKpi(chosen) };
    setKpi(chosen);
    setDraft(patch);
    setApplied(patch);
  }

  function setFilter(key, value) {
    const next = { ...draft, [key]: value, ...(key === "community" ? { cluster: "" } : {}) };
    setDraft(next);
    setApplied(next);
    setKpi(kpiFromPurpose(String(next.purpose || "").trim()));
  }

  function kpiFromPurpose(purpose) {
    if (purpose === "sale") return KPI.sale;
    if (purpose === "rent") return KPI.rent;
    if (purpose === "sale_rent") return KPI.saleRent;
    return KPI.listings;
  }

  function runSearch() {
    setApplied({ ...draft });
    setKpi(kpiFromPurpose(String(draft.purpose || "").trim()));
  }

  function applyExact(nextFilters) {
    const next = { ...EMPTY_FILTERS, ...nextFilters };
    setDraft(next);
    setApplied(next);
    setKpi(kpiFromPurpose(String(next.purpose || "").trim()));
  }

  function openGroup(row) {
    const ids = (row.ids || []).filter(Boolean);
    if (ids.length === 1) {
      openOwnerData(ids[0]);
      return;
    }
    applyExact({
      ...applied,
      community: normText(row.community),
      cluster: normText(row.cluster),
      beds: String(row.bedKey || ""),
      type: String(row.type || ""),
    });
  }

  function openOwnerForLive(item) {
    const unit = normText(item.unitNo);
    const community = normText(item.community);
    const list = data?.rows || [];
    const hit =
      (unit &&
        list.find(
          (row) => normText(row.unitNo) === unit && (!community || normText(row.community) === community)
        )) ||
      (unit && list.find((row) => normText(row.unitNo) === unit));
    if (hit?.id) {
      openOwnerData(hit.id);
      return;
    }
    applyExact({ community, q: String(item.unitNo || item.reference || "").trim() });
  }

  function clearAll() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setKpi(KPI.listings);
  }

  const allRows = data?.rows || [];
  const rows = useMemo(() => allRows.filter((row) => matchRow(row, applied)), [allRows, applied]);

  const kpiTotals = useMemo(() => {
    const liveRows = allRows.filter((row) => row.live);
    const t = data?.totals || {};
    const crmNum = (value) => (value == null || value === "" ? null : Number(value));
    return {
      total: crmNum(t.total) ?? allRows.length,
      live: crmNum(t.live) ?? 0,
      livePf: crmNum(t.livePf) ?? 0,
      liveBayut: crmNum(t.liveBayut) ?? 0,
      liveDubizzle: crmNum(t.liveDubizzle) ?? 0,
      sale: crmNum(t.sale) ?? 0,
      rent: crmNum(t.rent) ?? 0,
      saleRent: crmNum(t.saleRent) ?? 0,
      deskSale: t.deskSale ?? allRows.filter((row) => row.purpose === "sale").length,
      deskRent: t.deskRent ?? allRows.filter((row) => row.purpose === "rent").length,
      liveSale: liveRows.filter((row) => row.purpose === "sale").length,
      liveRent: liveRows.filter((row) => row.purpose === "rent").length,
      agents: crmNum(t.agents) ?? new Set(allRows.map((row) => row.agent).filter((name) => name && name !== "Empty agent")).size,
      leads: t.leads ?? 0,
      owners: t.owners ?? 0,
      tenants: t.tenants ?? 0,
      needed: t.needed ?? data?.demand?.totalClients ?? 0,
      available: liveRows.length,
      expiring30: t.expiring30 ?? 0,
      expired: t.expired ?? allRows.filter((row) => row.expired).length,
      deals: t.deals ?? 0,
      dealAds: t.dealAds ?? 0,
    };
  }, [allRows, data]);

  const optionLists = useMemo(() => {
    const all = allRows;
    const community = String(draft.community || "").toLowerCase();
    const inCommunity = community ? all.filter((row) => String(row.community || "").toLowerCase() === community) : all;
    const uniq = (list, fn) => [...new Set(list.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      communities: uniq(all, (row) => row.community),
      clusters: uniq(inCommunity, (row) => row.cluster),
      types: uniq(all, (row) => row.type),
      agents: uniq(all, (row) => (row.agent && row.agent !== "Empty agent" ? row.agent : "")),
      beds: [...new Set(all.map((row) => row.bedKey).filter(Boolean))].sort((a, b) => {
        if (a === "studio") return -1;
        if (b === "studio") return 1;
        if (a === "na") return 1;
        if (b === "na") return -1;
        return Number(a) - Number(b);
      }),
      bedLabels: Object.fromEntries(all.map((row) => [row.bedKey, row.bedLabel])),
    };
  }, [allRows, draft.community]);

  const matrix = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const key = `${row.community}|${row.cluster}|${row.bedKey}|${row.type}`;
      const prev = map.get(key) || {
        id: key,
        community: row.community,
        cluster: row.cluster,
        bedKey: row.bedKey,
        bedLabel: row.bedLabel,
        type: row.type,
        typeLabel: row.typeLabel,
        ids: [],
        total: 0,
        live: 0,
        rent: 0,
        sale: 0,
        saleRent: 0,
        minPrice: null,
        maxPrice: null,
        minRentYearly: null,
        maxRentYearly: null,
        minSalePrice: null,
        maxSalePrice: null,
        agents: new Set(),
      };
      prev.total += 1;
      if (row.id) prev.ids.push(row.id);
      if (row.live) prev.live += 1;
      if (row.purpose === "rent") {
        prev.rent += 1;
        if (row.rentYearly != null) {
          prev.minRentYearly = prev.minRentYearly == null ? row.rentYearly : Math.min(prev.minRentYearly, row.rentYearly);
          prev.maxRentYearly = prev.maxRentYearly == null ? row.rentYearly : Math.max(prev.maxRentYearly, row.rentYearly);
        }
      } else if (row.purpose === "sale_rent") {
        prev.saleRent += 1;
        if (row.rentYearly != null) {
          prev.minRentYearly = prev.minRentYearly == null ? row.rentYearly : Math.min(prev.minRentYearly, row.rentYearly);
          prev.maxRentYearly = prev.maxRentYearly == null ? row.rentYearly : Math.max(prev.maxRentYearly, row.rentYearly);
        }
        if (row.salePrice != null) {
          prev.minSalePrice = prev.minSalePrice == null ? row.salePrice : Math.min(prev.minSalePrice, row.salePrice);
          prev.maxSalePrice = prev.maxSalePrice == null ? row.salePrice : Math.max(prev.maxSalePrice, row.salePrice);
        }
      } else {
        prev.sale += 1;
        if (row.salePrice != null) {
          prev.minSalePrice = prev.minSalePrice == null ? row.salePrice : Math.min(prev.minSalePrice, row.salePrice);
          prev.maxSalePrice = prev.maxSalePrice == null ? row.salePrice : Math.max(prev.maxSalePrice, row.salePrice);
        }
      }
      if (row.price != null) {
        prev.minPrice = prev.minPrice == null ? row.price : Math.min(prev.minPrice, row.price);
        prev.maxPrice = prev.maxPrice == null ? row.price : Math.max(prev.maxPrice, row.price);
      }
      prev.agents.add(row.agent);
      map.set(key, prev);
    }
    return [...map.values()]
      .map((row) => ({ ...row, agents: [...row.agents].sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => b.live - a.live || b.total - a.total || a.community.localeCompare(b.community));
  }, [rows]);

  const rollups = useMemo(() => {
    return {
      types: countMap(rows, (row) => row.type, (row) => row.typeLabel),
      beds: countMap(rows, (row) => row.bedKey, (row) => row.bedLabel),
      communities: countMap(rows, (row) => row.community.toLowerCase(), (row) => row.community),
      clusters: countMap(rows, (row) => row.cluster.toLowerCase(), (row) => row.cluster),
    };
  }, [rows]);

  function sliceLocks(extra = "") {
    return {
      lockCommunity: Boolean(applied.community) || extra === "community",
      lockSub: Boolean(applied.cluster) || extra === "cluster",
      lockType: Boolean(applied.type) || extra === "type",
      lockBeds: Boolean(applied.beds) || extra === "beds",
      lockAgent: Boolean(applied.agent) || extra === "agent",
    };
  }

  function pathFor(list, extra = "") {
    return officeOwnerListPath(list, sliceLocks(extra));
  }

  function purposePath(purpose) {
    return officeOwnerListPath(allRows.filter((row) => !purpose || row.purpose === purpose));
  }

  const showLeads = kpi === KPI.leads;
  const showDeals = kpi === KPI.deals;
  const showParties = kpi === KPI.owners || kpi === KPI.tenants;
  const showAgents = kpi === KPI.agents;
  const showListings = !showLeads && !showDeals && !showParties && !showAgents;

  const officeAgents = useMemo(() => {
    const source = rows.length === allRows.length ? data?.agents || [] : null;
    if (source) return source.filter((row) => row.name && row.name !== "Empty agent");
    const map = new Map();
    for (const row of rows) {
      if (!row.agent || row.agent === "Empty agent") continue;
      const prev = map.get(row.agent) || { id: row.agent, name: row.agent, total: 0, rent: 0, sale: 0, saleRent: 0 };
      prev.total += 1;
      if (row.purpose === "rent") prev.rent += 1;
      else if (row.purpose === "sale_rent") prev.saleRent += 1;
      else prev.sale += 1;
      map.set(row.agent, prev);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [data, rows, allRows.length]);

  const listingsDetailTitle =
    kpi === KPI.sale
      ? "Sale Availability"
      : kpi === KPI.rent
        ? "Rent Availability"
        : kpi === KPI.saleRent
          ? "Sale / Rent Availability"
          : "Owner Data Availability";

  return (
    <section className="oi-card" aria-label="Office inventory">
      <div className="oi-head">
        <div className="oi-head-text">
          <h3>Office Inventory</h3>
          <p>Bitrix Owner Data Availability · rent, sale, community, cluster, beds, type, agent and rent</p>
        </div>
        <button type="button" className="ci-check" onClick={() => onCheck()} disabled={busy}>
          {busy ? "Checking…" : "Check"}
        </button>
      </div>

      {error ? <p className="oi-err">{error}</p> : null}
      {data?.checkError ? <p className="oi-err">{data.checkError}</p> : null}
      {!data && !busy ? (
        <div className="oi-empty">
          <p>Check to load office-wide Owner Data Availability from Bitrix (not listing ads).</p>
        </div>
      ) : null}

      {busy && !data ? (
        <div className="oi-empty">
          <p>Loading office inventory…</p>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="oi-stats" role="group" aria-label="Office totals">
            <Stat label="Properties" value={kpiTotals.total} active={kpi === KPI.listings} onClick={() => selectKpi(KPI.listings)} crmPath={purposePath("")} />
            <Stat label="Sale Availability" value={kpiTotals.sale} active={kpi === KPI.sale} onClick={() => selectKpi(KPI.sale)} crmPath={purposePath("sale")} />
            <Stat label="Rent Availability" value={kpiTotals.rent} active={kpi === KPI.rent} onClick={() => selectKpi(KPI.rent)} crmPath={purposePath("rent")} />
            <Stat label="Sale / Rent Availability" value={kpiTotals.saleRent} active={kpi === KPI.saleRent} onClick={() => selectKpi(KPI.saleRent)} crmPath={purposePath("sale_rent")} />
            <Stat label="Leads" value={kpiTotals.leads} active={kpi === KPI.leads} onClick={() => selectKpi(KPI.leads)} />
            <Stat label="Owners" value={kpiTotals.owners} active={kpi === KPI.owners} onClick={() => selectKpi(KPI.owners)} />
            <Stat label="Tenants" value={kpiTotals.tenants} active={kpi === KPI.tenants} onClick={() => selectKpi(KPI.tenants)} />
            <Stat label="Agents" value={kpiTotals.agents} active={kpi === KPI.agents} onClick={() => selectKpi(KPI.agents)} />
            <Stat label="Won deals" value={kpiTotals.deals} active={kpi === KPI.deals} onClick={() => selectKpi(KPI.deals)} />
          </div>

          <div className="oi-filters">
            <label>
              <span className="sr-only">Search text</span>
              <input
                value={draft.q}
                onChange={(e) => setFilter("q", e.target.value)}
                placeholder="Owner Data ID…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
              />
            </label>
            <select value={draft.purpose} onChange={(e) => setFilter("purpose", e.target.value)} aria-label="Availability">
              <option value="">All availability</option>
              <option value="rent">Rent Availability</option>
              <option value="sale">Sale Availability</option>
              <option value="sale_rent">Sale / Rent Availability</option>
            </select>
            <select value={draft.beds} onChange={(e) => setFilter("beds", e.target.value)} aria-label="Beds">
              <option value="">All beds</option>
              {optionLists.beds.map((id) => (
                <option key={id} value={id}>
                  {optionLists.bedLabels[id] || (id === "studio" ? "Studio" : id === "na" ? "—" : `${id} Bedroom`)}
                </option>
              ))}
            </select>
            <select value={draft.type} onChange={(e) => setFilter("type", e.target.value)} aria-label="Type">
              <option value="">All types</option>
              <option value="shop">Shop</option>
              <option value="other">Other</option>
              {optionLists.types
                .filter((id) => id !== "shop" && id !== "other")
                .map((id) => (
                <option key={id} value={id}>
                  {id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
            <select value={draft.community} onChange={(e) => setFilter("community", e.target.value)} aria-label="Community">
              <option value="">All communities</option>
              {optionLists.communities.map((name) => (
                <option key={name} value={name.toLowerCase()}>
                  {name}
                </option>
              ))}
            </select>
            <select value={draft.cluster} onChange={(e) => setFilter("cluster", e.target.value)} aria-label="Cluster">
              <option value="">All clusters</option>
              {optionLists.clusters.map((name) => (
                <option key={name} value={name.toLowerCase()}>
                  {name}
                </option>
              ))}
            </select>
            <select value={draft.agent} onChange={(e) => setFilter("agent", e.target.value)} aria-label="Agent">
              <option value="">All agents</option>
              {optionLists.agents.map((name) => (
                <option key={name} value={name.toLowerCase()}>
                  {name}
                </option>
              ))}
            </select>
            <div className="oi-filter-actions">
              <button type="button" className="oi-search" onClick={runSearch}>
                Search
              </button>
              <button type="button" className="oi-clear" onClick={clearAll}>
                Clear
              </button>
            </div>
          </div>
          <div ref={detailsRef} className="oi-details">
          {showDeals ? (
            <>
              <div className="oi-sections">
                <div className="oi-block">
                  <h4>Won deals (Bitrix)</h4>
                  <p>
                    {fmt(kpiTotals.deals)} won · {fmt(data.totals?.dealsSale)} sale · {fmt(data.totals?.dealsRent)} rent ·{" "}
                    {fmt(kpiTotals.dealAds)} unique ads linked
                  </p>
                  <p className="oi-party-note">
                    {data.dealsSourceNote || "Each row shows listing / portal ad and lead source for that won deal."}
                  </p>
                </div>
                <ChipBlock title="1 · Deal split" rows={data.dealsBreakdown?.purposes} empty="No won deals yet." />
                <ChipBlock title="2 · By source" rows={data.dealsBreakdown?.sources} empty="No source split yet." />
              </div>
              <div className="oi-table-wrap">
                <div className="oi-table-head">
                  <h4>3 · Agent-wise deal report (won)</h4>
                  <ExportBtn
                    title="Agent deal report"
                    columns={["Agent", "Won deals", "Sale", "Rent", "Other"]}
                    rows={(data.dealsBreakdown?.byAgent || []).map((row) => ({
                      cells: [row.name, row.count, row.sale, row.rent, row.other],
                    }))}
                  />
                </div>
                <div className="oi-table-scroll">
                  <table className="oi-table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Won</th>
                        <th>Sale</th>
                        <th>Rent</th>
                        <th>Other</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.dealsBreakdown?.byAgent || []).length ? (
                        data.dealsBreakdown.byAgent.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <AgentPerson name={row.name} photo={row.photo} />
                            </td>
                            <td>{fmt(row.count)}</td>
                            <td>{fmt(row.sale)}</td>
                            <td>{fmt(row.rent)}</td>
                            <td>{fmt(row.other)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>No agent deal split yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="oi-table-wrap">
                <div className="oi-table-head">
                  <h4>4 · Won deals · listing / source</h4>
                  <small>{fmt((data.dealsBreakdown?.items || []).length)} deals</small>
                </div>
                <div className="oi-table-scroll tall">
                  <table className="oi-table">
                    <thead>
                      <tr>
                        <th>Deal</th>
                        <th>Type</th>
                        <th>Agent</th>
                        <th>Source</th>
                        <th>Listing / ad</th>
                        <th>Closed</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.dealsBreakdown?.items || []).length ? (
                        data.dealsBreakdown.items.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {row.adUrl ? (
                                <a href={row.adUrl} target="_blank" rel="noreferrer">
                                  {row.title}
                                </a>
                              ) : (
                                row.title
                              )}
                            </td>
                            <td>{row.purpose === "rent" ? "Rent" : row.purpose === "sale" ? "Sale" : "Other"}</td>
                            <td>{row.agentName || row.agentId || "—"}</td>
                            <td>{row.source || "—"}</td>
                            <td>
                              {row.listingRef ? (
                                <span>{row.listingLabel || row.listingRef}</span>
                              ) : row.adUrl ? (
                                <a href={row.adUrl} target="_blank" rel="noreferrer">
                                  Open ad
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>{row.closedAt || "—"}</td>
                            <td>{row.amount ? money(row.amount) : "—"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7}>No won deals found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}

          {showLeads ? (
            <div className="oi-sections">
              <div className="oi-block">
                <h4>Bitrix CRM leads</h4>
                <p>{fmt(kpiTotals.leads)} overall leads in Bitrix CRM (all statuses).</p>
                <p className="oi-party-note">
                  {data.leadsSourceNote ||
                    "This KPI is Bitrix CRM quantity only — not Property Listing New desk leads."}
                </p>
              </div>
              <ChipBlock
                title="1 · Source"
                rows={data.leadsBreakdown?.portals}
                empty="CRM total unavailable."
              />
              {data.leadsBreakdown?.channels?.length ? (
                <ChipBlock title="2 · By channel" rows={data.leadsBreakdown.channels} empty="No channel split." />
              ) : null}
            </div>
          ) : null}

          {showParties ? (
            <div className="oi-sections">
              <div className="oi-block">
                <h4>{kpi === KPI.owners ? "Owners" : "Tenants"}</h4>
                <p>
                  {kpi === KPI.owners
                    ? `${fmt(kpiTotals.owners)} unique owners`
                    : `${fmt(kpiTotals.tenants)} unique tenants`}
                </p>
                <p className="oi-party-note">
                  Quantity only — names are not shown on Check or click.
                </p>
              </div>
            </div>
          ) : null}

          {showAgents ? (
            <>
              <div className="oi-sections">
                <div className="oi-block">
                  <h4>Agents</h4>
                  <p className="oi-party-note">
                    {data.agentPerformanceNote ||
                      "Each agent’s Owner Data Availability cards (rent, sale, sale/rent)."}
                  </p>
                </div>
                <ChipBlock
                  title="1 · Agents · availability cards"
                  rows={officeAgents}
                  empty="No agents."
                  valueKey="total"
                  limit={0}
                  activeId={applied.agent}
                  onPick={(row) => {
                    const next = normText(row.name);
                    applyExact({ agent: applied.agent === next ? "" : next });
                  }}
                  crmFor={(row) => officeOwnerListPath(allRows.filter((item) => normText(item.agent) === normText(row.name)), { lockAgent: true })}
                />
                <ChipBlock title="2 · Property type" rows={rollups.types} empty="No types." />
                <ChipBlock title="3 · Community" rows={rollups.communities} empty="No communities." />
              </div>
              <div className="oi-table-wrap">
                <div className="oi-table-head">
                  <h4>4 · Agent · Owner Data Availability</h4>
                  <ExportBtn
                    title="Owner data agents"
                    columns={["Agent", "Cards", "Rent", "Sale", "Sale / Rent"]}
                    rows={officeAgents.map((row) => ({
                      cells: [row.name, row.total, row.rent, row.sale, row.saleRent || 0],
                    }))}
                  />
                </div>
                <div className="oi-table-scroll tall">
                  <table className="oi-table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Cards</th>
                        <th>Rent</th>
                        <th>Sale</th>
                        <th>Sale / Rent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officeAgents.length ? (
                        officeAgents.map((row) => (
                          <tr
                            key={row.id}
                            className="oi-row-link"
                            tabIndex={0}
                            onClick={() => applyExact({ agent: normText(row.name) })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                applyExact({ agent: normText(row.name) });
                              }
                            }}
                          >
                            <td>
                              <AgentPerson name={row.name} photo={(data.agentPerformance || []).find((item) => item.name === row.name)?.photo} />
                            </td>
                            <td>{fmt(row.total)}</td>
                            <td>{fmt(row.rent)}</td>
                            <td>{fmt(row.sale)}</td>
                            <td>{fmt(row.saleRent || 0)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>No Owner Data agents for this filter.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}

          {showListings && !showAgents ? (
            <>
              <div className="oi-breakdowns">
                <BreakdownTable
                  title="Property type"
                  rows={rollups.types}
                  empty="No types."
                  activeId={applied.type}
                  onPick={(row) => applyExact({ ...applied, type: applied.type === row.id ? "" : row.id })}
                  crmFor={(row) => pathFor(rows.filter((item) => item.type === row.id), "type")}
                />
                <BreakdownTable
                  title="Beds"
                  rows={rollups.beds}
                  empty="No beds."
                  activeId={applied.beds}
                  onPick={(row) => applyExact({ ...applied, beds: applied.beds === row.id ? "" : row.id })}
                  crmFor={(row) => pathFor(rows.filter((item) => item.bedKey === row.id), "beds")}
                />
                <BreakdownTable
                  title="Community"
                  rows={rollups.communities}
                  empty="No communities."
                  activeId={applied.community}
                  onPick={(row) => {
                    const next = String(row.name || "").toLowerCase();
                    applyExact({ ...applied, community: applied.community === next ? "" : next, cluster: "" });
                  }}
                  crmFor={(row) => pathFor(rows.filter((item) => normText(item.community) === row.id), "community")}
                />
                <BreakdownTable
                  title="Cluster"
                  rows={rollups.clusters}
                  empty="No clusters."
                  activeId={applied.cluster}
                  onPick={(row) => {
                    const next = String(row.name || "").toLowerCase();
                    applyExact({ ...applied, cluster: applied.cluster === next ? "" : next });
                  }}
                  crmFor={(row) => pathFor(rows.filter((item) => normText(item.cluster) === row.id), "cluster")}
                />
              </div>

              <div className="oi-table-wrap">
                <div className="oi-table-head">
                  <h4>{listingsDetailTitle}</h4>
                  <small>{fmt(rows.length)} cards</small>
                  <CrmIcon path={pathFor(rows)} title={`Open ${fmt(rows.length)} ${listingsDetailTitle} in CRM`} />
                  <ExportBtn
                    title="Owner data availability"
                    columns={["ID", "Availability", "Community", "Cluster", "Beds", "Type", "Rent", "Sale price", "Agent"]}
                    rows={rows.map((row) => ({
                      cells: [
                        row.id,
                        purposeLabelOf(row),
                        row.community,
                        row.cluster,
                        row.bedLabel,
                        row.typeLabel,
                        row.rentYearly ?? "",
                        row.salePrice ?? "",
                        row.agent,
                      ],
                    }))}
                  />
                </div>
                <div className="oi-table-scroll tall">
                  <table className="oi-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Availability</th>
                        <th>Community</th>
                        <th>Cluster</th>
                        <th>Beds</th>
                        <th>Type</th>
                        <th>Rent</th>
                        <th>Sale price</th>
                        <th>Agent</th>
                        <th className="oi-crm-col">CRM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length ? (
                        rows.map((row) => (
                          <tr
                            key={row.id}
                            className="oi-row-link"
                            tabIndex={0}
                            title={`Open Owner Data #${row.id}`}
                            onClick={() => openOwnerData(row.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openOwnerData(row.id);
                              }
                            }}
                          >
                            <td className="oi-id">{row.id || "—"}</td>
                            <td>{purposeLabelOf(row)}</td>
                            <td>{row.community}</td>
                            <td>{row.cluster}</td>
                            <td>{row.bedLabel}</td>
                            <td>{row.typeLabel}</td>
                            <td>{row.rentYearly != null ? money(row.rentYearly) : "—"}</td>
                            <td>{row.salePrice != null ? money(row.salePrice) : "—"}</td>
                            <td>{row.agent}</td>
                            <td className="oi-crm-col">
                              <CrmIcon path={ownerDataPath(row.id)} title={`Open Owner Data #${row.id}`} />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={10}>No Owner Data cards for this filter.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
