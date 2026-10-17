import { useEffect, useMemo, useState } from "react";
import {
  EMPTY_PORTFOLIO_PICKS,
  portfolioPickCount,
  portfolioPickGroups,
  portfolioPicksMatch,
} from "../../server/listingModel.js";

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function money(n) {
  if (n == null || n === "") return "—";
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  return `AED ${value.toLocaleString("en-US")}`;
}

function ChipList({ title, rows, empty, activeId, onPick }) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    <div className="agent-listing-qty-block">
      <h4>{title}</h4>
      {list.length ? (
        <ul>
          {list.map((row) => {
            const selected = activeId === row.id;
            return (
              <li key={row.id || row.name}>
                <button
                  type="button"
                  className={`agent-listing-chip${selected ? " is-active" : ""}`}
                  onClick={() => onPick(row.id)}
                >
                  <span>{row.name}</span>
                  <b>{fmt(row.count)}</b>
                </button>
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

function Stat({ label, value, active, onPick }) {
  return (
    <button
      type="button"
      className={`agent-listing-stat${active ? " is-active" : ""}`}
      onClick={onPick}
      aria-pressed={active}
    >
      <small>{label}</small>
      <b>{fmt(value)}</b>
    </button>
  );
}

function pickLabel(picks) {
  const bits = [];
  if (picks.purpose) bits.push(picks.purpose === "sale" ? "Sale" : "Rent");
  if (picks.status === "live") bits.push("Live");
  if (picks.status === "archived") bits.push("Archived");
  if (picks.expired === "1") bits.push("Expired");
  if (picks.portal === "ads") bits.push("Portal ads");
  if (picks.portal === "pf") bits.push("Property Finder");
  if (picks.portal === "bayut") bits.push("Bayut");
  if (picks.portal === "dubizzle") bits.push("Dubizzle");
  if (picks.portal === "website") bits.push("Website");
  if (picks.beds === "studio") bits.push("Studio");
  else if (picks.beds) bits.push(picks.beds === "1" ? "1 Bedroom" : `${picks.beds} Bedroom`);
  return bits;
}

/** Desk listing / portal-ad breakdown for a searched agent. */
export function AgentListingHistoryCard({ agentName = "", agentId = "", refreshKey = 0, onOpenListing }) {
  const name = String(agentName || "").trim();
  const id = String(agentId || "").trim();
  const [body, setBody] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picks, setPicks] = useState(EMPTY_PORTFOLIO_PICKS);

  useEffect(() => {
    setPicks(EMPTY_PORTFOLIO_PICKS);
  }, [name, id]);

  useEffect(() => {
    if (!name && !id) {
      setBody(null);
      setError("");
      return undefined;
    }
    let cancelled = false;
    setBusy(true);
    setError("");
    const qs = new URLSearchParams();
    if (name) qs.set("name", name);
    if (id) qs.set("id", id);
    fetch(`/api/listings/agent-portfolio?${qs.toString()}`, { credentials: "same-origin" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.ok === false) throw new Error(json.error || "Could not load listing history");
        return json;
      })
      .then((json) => {
        if (!cancelled) setBody(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setBody(null);
          setError(err instanceof Error ? err.message : "Could not load listing history");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, id, refreshKey]);

  const items = Array.isArray(body?.items) ? body.items : [];
  const rows = useMemo(
    () => items.filter((row) => portfolioPicksMatch(row, picks)),
    [items, picks]
  );
  const count = (skip, require) => portfolioPickCount(items, picks, skip, require);
  const groups = (skip, idOf, nameOf, require) => portfolioPickGroups(items, picks, skip, idOf, nameOf, require);

  function toggle(key, value) {
    setPicks((prev) => ({ ...prev, [key]: prev[key] === value ? "" : value }));
  }

  function applyMany(next) {
    setPicks((prev) => {
      const same = Object.entries(next).every(([key, value]) => prev[key] === value);
      if (!same) return { ...prev, ...next };
      const cleared = { ...prev };
      for (const key of Object.keys(next)) cleared[key] = "";
      return cleared;
    });
  }

  const purposeOnly = (value) => picks.purpose === value && !picks.status && picks.expired !== "1";
  const statusOnly = (value) => picks.status === value && !picks.purpose && picks.expired !== "1";
  const noFilters = Object.values(picks).every((value) => !value);

  if (!name && !id) return null;

  const named = (key, labelKey) => items.find((row) => {
    if (key === "type") return row.type === picks.type;
    if (key === "beds") return row.bedKey === picks.beds;
    if (key === "community") return row.communityKey === picks.community;
    if (key === "city") return row.cityKey === picks.city;
    return false;
  })?.[labelKey] || "";
  const heading = noFilters
    ? "Listings"
    : ["Listings", ...pickLabel(picks), named("type", "typeLabel"), named("beds", "bedLabel"), named("community", "community"), named("city", "city")]
      .filter(Boolean)
      .filter((part, index, list) => list.indexOf(part) === index)
      .join(" · ");

  const types = groups("type", (row) => row.type, (row) => row.typeLabel);
  const beds = groups("beds", (row) => row.bedKey, (row) => row.bedLabel);
  const communities = groups("community", (row) => row.communityKey, (row) => row.community);
  const cities = groups("city", (row) => row.cityKey, (row) => row.city);
  const liveCommunities = picks.status && picks.status !== "live"
    ? []
    : portfolioPickGroups(
      items.filter((row) => row.status === "live"),
      { ...picks, status: "" },
      "community",
      (row) => row.communityKey,
      (row) => row.community
    );

  return (
    <aside className="agent-listing-qty" aria-label={`${name} listing history`}>
      <div className="agent-listing-qty-head">
        <div>
          <strong>{name}</strong>
          <span>Listings where this person is the Listing Agent or the Owner, the same fields as the listings desk. Click a box to filter the others. Click it again to clear that filter.</span>
        </div>
        {busy ? <em>Loading…</em> : null}
      </div>

      {error ? <p className="agent-listing-qty-err">{error}</p> : null}

      <div className="agent-listing-qty-grid">
        <Stat label="Listings" value={count()} active={noFilters} onPick={() => setPicks(EMPTY_PORTFOLIO_PICKS)} />
        <Stat label="Live" value={count("status", { status: "live" })} active={statusOnly("live")} onPick={() => toggle("status", "live")} />
        <Stat label="Sale" value={count("purpose", { purpose: "sale" })} active={purposeOnly("sale")} onPick={() => toggle("purpose", "sale")} />
        <Stat label="Rent" value={count("purpose", { purpose: "rent" })} active={purposeOnly("rent")} onPick={() => toggle("purpose", "rent")} />
        <Stat label="Portal ads" value={count("portal", { portal: "ads" })} active={picks.portal === "ads"} onPick={() => toggle("portal", "ads")} />
      </div>

      <div className="agent-listing-qty-grid agent-listing-qty-grid-3">
        <Stat label="Live sale" value={count("purpose,status", { purpose: "sale", status: "live" })} active={picks.purpose === "sale" && picks.status === "live" && picks.expired !== "1"} onPick={() => applyMany({ purpose: "sale", status: "live" })} />
        <Stat label="Live rent" value={count("purpose,status", { purpose: "rent", status: "live" })} active={picks.purpose === "rent" && picks.status === "live" && picks.expired !== "1"} onPick={() => applyMany({ purpose: "rent", status: "live" })} />
        <Stat label="Archived" value={count("status", { status: "archived" })} active={statusOnly("archived")} onPick={() => toggle("status", "archived")} />
      </div>

      <div className="agent-listing-qty-grid agent-listing-qty-grid-3">
        <Stat label="Expired" value={count("expired", { expired: "1" })} active={picks.expired === "1" && !picks.purpose && !picks.status} onPick={() => toggle("expired", "1")} />
        <Stat label="Expired sale" value={count("expired,purpose", { expired: "1", purpose: "sale" })} active={picks.expired === "1" && picks.purpose === "sale" && !picks.status} onPick={() => applyMany({ expired: "1", purpose: "sale" })} />
        <Stat label="Expired rent" value={count("expired,purpose", { expired: "1", purpose: "rent" })} active={picks.expired === "1" && picks.purpose === "rent" && !picks.status} onPick={() => applyMany({ expired: "1", purpose: "rent" })} />
      </div>

      <div className="agent-listing-qty-portals">
        <button type="button" className={picks.portal === "pf" ? "is-active" : ""} onClick={() => toggle("portal", "pf")}>
          PF <b>{fmt(count("portal", { portal: "pf" }))}</b>
        </button>
        <button type="button" className={picks.portal === "bayut" ? "is-active" : ""} onClick={() => toggle("portal", "bayut")}>
          Bayut <b>{fmt(count("portal", { portal: "bayut" }))}</b>
        </button>
        <button type="button" className={picks.portal === "dubizzle" ? "is-active" : ""} onClick={() => toggle("portal", "dubizzle")}>
          Dubizzle <b>{fmt(count("portal", { portal: "dubizzle" }))}</b>
        </button>
        <button type="button" className={picks.portal === "website" ? "is-active" : ""} onClick={() => toggle("portal", "website")}>
          Website <b>{fmt(count("portal", { portal: "website" }))}</b>
        </button>
      </div>

      <div className="agent-listing-qty-sections">
        <ChipList title="1 · Community" rows={communities} empty="No communities in this selection." activeId={picks.community} onPick={(id) => toggle("community", id)} />
        <ChipList title="2 · Beds" rows={beds} empty="No bed counts in this selection." activeId={picks.beds} onPick={(id) => toggle("beds", id)} />
        <ChipList title="3 · Property type" rows={types} empty="No property types in this selection." activeId={picks.type} onPick={(id) => toggle("type", id)} />
        <ChipList title="4 · Area / city" rows={cities} empty="No areas in this selection." activeId={picks.city} onPick={(id) => toggle("city", id)} />
        <ChipList title="5 · Live availability by community" rows={liveCommunities} empty="No live communities in this selection." activeId={picks.status === "live" ? picks.community : ""} onPick={(id) => applyMany({ community: id, status: "live" })} />
      </div>

      <div className="agent-listing-qty-table-wrap">
        <div className="agent-listing-qty-table-head">
          <h4>{heading}</h4>
          <small>
            {fmt(rows.length)} listing{rows.length === 1 ? "" : "s"} · count matches this filter
          </small>
        </div>
        <div className="agent-listing-qty-table">
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Title</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Community</th>
                <th>Type</th>
                        <th>Beds</th>
                        <th>Price</th>
                        <th>Portals</th>
                        <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr
                    key={row.id || row.reference}
                    onClick={() => onOpenListing?.(row.id, row.reference)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onOpenListing?.(row.id, row.reference);
                    }}
                    tabIndex={onOpenListing ? 0 : undefined}
                  >
                    <td>{row.reference || row.id || "—"}</td>
                    <td>{row.title}</td>
                    <td>{row.purpose || "—"}</td>
                    <td>{row.expired ? "expired" : row.status || "—"}</td>
                    <td>
                      {row.community}
                      {row.building ? ` · ${row.building}` : ""}
                    </td>
                    <td>{row.typeLabel}</td>
                    <td>{row.bedLabel}</td>
                    <td>{money(row.price_aed)}</td>
                    <td>
                      {[row.pf && "PF", row.bayut && "Bayut", row.dubizzle && "Dubizzle", row.website && "Web"]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td>
                      <span className="agent-listing-open">Show on Listings</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                          <td colSpan={10}>{busy ? "Loading listings…" : "No listings in this view."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  );
}

export function matchAgentFromSearch(query, agentNames = []) {
  const raw = String(query || "").trim();
  if (!raw || raw.length < 3) return "";
  if (/^a7group-?\d*$/i.test(raw) || /^\d{3,}$/.test(raw)) return "";
  const needle = raw.toLowerCase();
  const names = (agentNames || []).map((item) => String(item || "").trim()).filter(Boolean);
  const exact = names.find((item) => item.toLowerCase() === needle);
  if (exact) return exact;
  const hits = names.filter((item) => {
    const low = item.toLowerCase();
    return low.includes(needle) || needle.includes(low);
  });
  if (hits.length === 1) return hits[0];
  if (raw.split(/\s+/).filter(Boolean).length >= 2) return raw;
  return "";
}
