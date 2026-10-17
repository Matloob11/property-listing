import { useState } from "react";
import { adFactMatches, countAdFacts } from "../../server/listingAdBoard.js";

const BOXES = [
  ["all", "All ads"],
  ["sale", "Sale"],
  ["rent", "Rent"],
  ["both", "Rent and sale"],
];

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function OpenIcon({ title, onClick }) {
  if (!onClick) return <span className="ol-icon-gap" aria-hidden="true" />;
  return (
    <button type="button" className="ci-crm-chip" title={title} aria-label={title} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 4h6v6M20 4 11 13M9 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function AdCountBoard({ facts, onOpen }) {
  const rows = Array.isArray(facts) ? facts : [];
  const [box, setBox] = useState("all");
  const [purpose, setPurpose] = useState("");
  const [community, setCommunity] = useState("");
  const [cluster, setCluster] = useState("");
  const [beds, setBeds] = useState("");
  const [type, setType] = useState("");
  const [agent, setAgent] = useState("");
  const picks = { purpose, community, cluster, beds, type, agent };

  function chooseBox(next) {
    setBox(next);
    setPurpose("");
    setCommunity("");
    setCluster("");
    setBeds("");
    setType("");
    setAgent("");
  }

  function toggle(dim, id) {
    const next = picks[dim] === id ? "" : id;
    if (dim === "purpose") setPurpose(next);
    if (dim === "community") setCommunity(next);
    if (dim === "cluster") setCluster(next);
    if (dim === "beds") setBeds(next);
    if (dim === "type") setType(next);
    if (dim === "agent") setAgent(next);
  }

  function named(id, keyId, keyName) {
    if (!id || id === "empty") return "";
    return rows.find((row) => row[keyId] === id)?.[keyName] || "";
  }

  function filtersFor(extra = {}) {
    const purposeId = extra.purpose ?? (box === "all" ? purpose : box === "both" ? "both" : box);
    const communityId = extra.communityId ?? community;
    const clusterId = extra.clusterId ?? cluster;
    const bedsId = extra.bedsId ?? beds;
    const typeId = extra.typeId ?? type;
    const agentId = extra.agentId ?? agent;
    if ([purposeId, communityId, clusterId, bedsId, typeId, agentId].includes("empty")) return null;
    return {
      purpose: purposeId === "all" ? "" : purposeId || "",
      community: communityId ? (extra.community || named(communityId, "communityId", "community")) : "",
      sub_community: clusterId ? (extra.cluster || named(clusterId, "clusterId", "cluster")) : "",
      beds: bedsId || "",
      type: typeId || "",
      listing_agent: agentId ? (extra.agent || named(agentId, "agentId", "agent")) : "",
    };
  }

  function openWith(extra) {
    const filters = filtersFor(extra);
    if (!filters || !onOpen) return null;
    return () => onOpen(filters);
  }

  const counts = {
    all: rows.length,
    sale: rows.filter((row) => row.purpose === "sale").length,
    rent: rows.filter((row) => row.purpose === "rent").length,
    both: rows.filter((row) => row.purpose === "sale" || row.purpose === "rent").length,
  };

  function pickedRows(skip) {
    return rows.filter((row) => adFactMatches(row, box, picks, skip));
  }

  const purposeRows = [
    ["rent", "Rent"],
    ["sale", "Sale"],
    ["empty", "Empty"],
  ].map(([id, name]) => ({
    id,
    name,
    count: pickedRows("purpose").filter((row) => row.purpose === id).length,
  })).filter((row) => row.count > 0);
  const communities = countAdFacts(pickedRows("community"), "all", {}, "community", "communityId", "community");
  const clusters = countAdFacts(pickedRows("cluster"), "all", {}, "cluster", "clusterId", "cluster");
  const bedRows = countAdFacts(pickedRows("beds"), "all", {}, "beds", "bedsId", "bedsName");
  const types = countAdFacts(pickedRows("type"), "all", {}, "type", "typeId", "typeName");
  const agents = countAdFacts(pickedRows("agent"), "all", {}, "agent", "agentId", "agent");

  function panel(title, list, active, dim, extraFor) {
    return (
      <div className="ol-panel">
        <div className="ol-panel-head">
          <h4>{title}</h4>
          <small>{list.length}</small>
        </div>
        {list.length ? (
          <ul>
            {list.map((row) => (
              <li key={row.id}>
                <button type="button" className={`ol-main${active === row.id ? " is-active" : ""}`} onClick={() => toggle(dim, row.id)}>
                  <span>{row.name}</span>
                  <b>{fmt(row.count)}</b>
                </button>
                <OpenIcon title={`Open ${fmt(row.count)} ${row.name} listings`} onClick={openWith(extraFor(row))} />
              </li>
            ))}
          </ul>
        ) : (
          <p>None in this selection.</p>
        )}
      </div>
    );
  }

  return (
    <section className="oi-card ol-leads ad-board" aria-label="All ads">
      <div className="oi-head">
        <div className="oi-head-text">
          <h3>All ads</h3>
          <p>Ads live on Property Finder, Bayut, or Dubizzle. A listing on more than one site is counted once. The boxes stay the full counts. Click a box to filter the tables below. Click a row to narrow them further.</p>
        </div>
      </div>
      <div className="ol-kpis" role="group" aria-label="Ad totals">
        {BOXES.map(([id, label]) => (
          <div key={id} className={`ol-kpi${box === id ? " is-active" : ""}`}>
            <button type="button" onClick={() => chooseBox(id)}>
              <small>{label}</small>
              <b>{fmt(counts[id])}</b>
            </button>
          </div>
        ))}
      </div>
      <div className="ol-grid">
        {panel("Purpose", purposeRows, purpose, "purpose", (row) => ({ purpose: row.id }))}
        {panel("Community", communities, community, "community", (row) => ({ communityId: row.id, community: row.name }))}
        {panel("Cluster", clusters, cluster, "cluster", (row) => ({ clusterId: row.id, cluster: row.name }))}
        {panel("Bedrooms", bedRows, beds, "beds", (row) => ({ bedsId: row.id }))}
        {panel("Property type", types, type, "type", (row) => ({ typeId: row.id }))}
        {panel("Agent", agents, agent, "agent", (row) => ({ agentId: row.id, agent: row.name }))}
      </div>
    </section>
  );
}
