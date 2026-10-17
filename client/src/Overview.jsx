import { useEffect, useMemo, useRef, useState } from "react";
import { AdCountBoard } from "./AdCountBoard.jsx";

async function api(path, options) {
  const res = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function when(iso, withTime = true) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-GB", withTime ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" });
}

function whenFull(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prettyWord(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function listingFacts(item) {
  const beds = item.beds === 0 || item.beds === "0" ? "Studio" : item.beds !== "" && item.beds != null ? `${item.beds} bed` : "";
  const baths = item.baths !== "" && item.baths != null && Number(item.baths) > 0 ? `${item.baths} bath` : "";
  const size = Number(item.area_sqft) > 0 ? `${Number(item.area_sqft).toLocaleString()} sqft` : "";
  return [prettyWord(item.type), prettyWord(item.purpose), beds, baths, size, item.community].filter(Boolean).join(" · ");
}

function listingPrice(item) {
  const price = Number(item.price_aed) || 0;
  if (!price) return "Price not set";
  const period = item.purpose === "rent" ? " / year" : "";
  return `AED ${price.toLocaleString()}${period}`;
}

function pretty(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function scoreTone(score) {
  const n = Number(score || 0);
  if (n >= 85) return "good";
  if (n >= 70) return "ok";
  return "bad";
}

function GoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h8v2H7v10h10v-6h2v8H5V5Z" />
      <path d="M13 5h6v6h-2V8.4l-6.3 6.3-1.4-1.4L15.6 7H13V5Z" />
    </svg>
  );
}

function QtyStat({ label, value, onClick }) {
  return (
    <button type="button" className="agent-listing-stat" onClick={onClick}>
      <small>{label}</small>
      <b>{Number(value || 0).toLocaleString("en-US")}</b>
    </button>
  );
}

function QtyBlock({ title, rows, onRow }) {
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) return null;
  return (
    <div className="agent-listing-qty-block">
      <h4>{title}</h4>
      <ul>
        {items.map((row) => (
          <li key={row.id || row.name}>
            <button type="button" className="agent-listing-chip" onClick={() => onRow(row)}>
              <span>{pretty(row.name)}</span>
              <b>{Number(row.count || 0).toLocaleString("en-US")}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function nameTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = left[i - 1] === right[j - 1] ? rows[i - 1][j - 1] : 1 + Math.min(rows[i - 1][j], rows[i][j - 1], rows[i - 1][j - 1]);
    }
  }
  return rows[left.length][right.length];
}

function sameAgent(a, b) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  if (left.join(" ") === right.join(" ")) return true;
  if (left.length < 2 || right.length < 2 || left[0] !== right[0]) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.every((token, index) => longer[index] === token)) return true;
  const shared = left.filter((token) => right.includes(token));
  return shared.length >= 2 && editDistance(left[left.length - 1], right[right.length - 1]) <= 2;
}

function findPortalAgent(portals, portalId, name) {
  const agents = Array.isArray(portals?.[portalId]?.agents) ? portals[portalId].agents : [];
  return agents.find((row) => sameAgent(row.name, name)) || null;
}

const PORTAL_SITES = [
  ["pf", "Property Finder"],
  ["bayut", "Bayut"],
  ["dubizzle", "Dubizzle"],
];

function productParts(agent) {
  const parts = [
    ["premium", Number(agent?.premium || 0)],
    ["featured", Number(agent?.featured || 0)],
    ["hot", Number(agent?.hot || 0)],
  ];
  if (Number(agent?.superhot || 0) > 0) parts.push(["superhot", Number(agent.superhot)]);
  return parts;
}

function AgentPopup({ label, agent, portals, onClose, onOpen, onOpenPortal }) {
  const detail = agent?.detail || {};
  const go = (slice) => onOpen?.({ agent: agent.name, ...slice });
  return (
    <div className="overlay" role="dialog" aria-label={agent?.name || "Agent"} onClick={onClose}>
      <div className="viewer dialog ov-agent-dialog" onClick={(event) => event.stopPropagation()}>
        <aside className="agent-listing-qty">
          <div className="agent-listing-qty-head">
            <div>
              <strong>{agent?.name}</strong>
              <span>{label}</span>
            </div>
            <button className="btn ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="agent-listing-qty-grid">
            <QtyStat label="Total ads" value={detail.total ?? agent?.listings} onClick={() => go({ label: "Total ads" })} />
            <QtyStat label="Live" value={detail.live ?? agent?.listings} onClick={() => go({ live: "1", label: "Live" })} />
            <QtyStat label="Sale" value={detail.sale ?? agent?.sale} onClick={() => go({ side: "sale", label: "Sale" })} />
            <QtyStat label="Rent" value={detail.rent ?? agent?.rent} onClick={() => go({ side: "rent", label: "Rent" })} />
          </div>
          <div className="ov-agent-sites">
            {PORTAL_SITES.map(([id, title]) => {
              const match = findPortalAgent(portals, id, agent?.name);
              const parts = productParts(match).filter(([, count]) => count > 0);
              return (
                <div className="ov-agent-site" key={id}>
                  <strong>{title}</strong>
                  {parts.length ? (
                    <div className="ov-agent-site-pills">
                      {parts.map(([spot, count]) => (
                        <button
                          key={spot}
                          type="button"
                          className="ov-spot"
                          disabled={!match || !onOpenPortal}
                          onClick={() => onOpenPortal?.(id, { agent: match.name, credit: spot, label: pretty(spot) })}
                        >
                          <span>{pretty(spot)}</span>
                          <b>{count}</b>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <em>None</em>
                  )}
                </div>
              );
            })}
          </div>
          <div className="agent-listing-qty-sections">
            <QtyBlock title="1 · Property type" rows={detail.types} onRow={(row) => go({ type: row.id || row.name, label: pretty(row.name) })} />
            <QtyBlock title="2 · Beds" rows={detail.beds} onRow={(row) => go({ beds: row.id, label: row.name })} />
            <QtyBlock title="3 · Community" rows={detail.communities} onRow={(row) => go({ community: row.name, label: row.name })} />
            <QtyBlock title="4 · Cluster" rows={detail.clusters} onRow={(row) => go({ cluster: row.name, label: row.name })} />
            <QtyBlock title="5 · Credit" rows={detail.credits} onRow={(row) => go({ credit: row.name, label: pretty(row.name) })} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function portalProductNote(products) {
  if (!products || typeof products !== "object") return "";
  const parts = [];
  const push = (key, label) => {
    if (!Object.prototype.hasOwnProperty.call(products, key)) return;
    parts.push(`${Number(products[key]) || 0} ${label}`);
  };
  push("superhot", "superhot");
  push("hot", "hot");
  push("featured", "featured");
  push("premium", "premium");
  return parts.join(" · ");
}

function PortalLive({ label, portalId, portals, onOpenPortal }) {
  const portal = portals?.[portalId];
  const agents = Array.isArray(portal?.agents) ? portal.agents : [];
  const [picked, setPicked] = useState(null);
  const open = onOpenPortal && portal?.ok ? (slice) => onOpenPortal(portalId, slice) : null;
  const products = portalProductNote(portal?.products);
  return (
    <section className={`ov-stat tone-${portal?.ok ? "good" : "ok"} ov-portal`}>
      <span>{label}</span>
      <b>{portal?.ok ? portal.count : "—"}</b>
      {portal?.ok && products ? <small className="ov-portal-products">{products}</small> : null}
      <small className="ov-stat-sub">
        {portal?.ok
          ? portal.lastError
            ? "Last live reading from the website"
            : "Live on the website"
          : portal?.error || "Scanning the website"}
      </small>
      {portal?.ok ? (
        <ul className="ov-portal-agents">
          {agents.length ? (
            agents.map((agent) => (
              <li key={agent.name} className="ov-agent-line">
                <button type="button" className="ov-agent-name" onClick={() => setPicked(agent)}>
                  {agent.name}
                </button>
                <b>{agent.listings}</b>
                {open ? (
                  <button type="button" className="ov-agent-go" aria-label={`Open ${agent.name} listings`} onClick={() => open({ agent: agent.name })}>
                    <GoIcon />
                  </button>
                ) : null}
              </li>
            ))
          ) : (
            <li>
              <em>No agents listed</em>
            </li>
          )}
        </ul>
      ) : null}
      {picked ? (
        <AgentPopup
          label={label}
          agent={picked}
          portals={portals}
          onClose={() => setPicked(null)}
          onOpen={open}
          onOpenPortal={onOpenPortal}
        />
      ) : null}
    </section>
  );
}

function creditEnd(credits) {
  const raw = credits?.cycle?.endDate;
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
}

function creditHint(credits) {
  if (!credits || (credits.remaining == null && credits.total == null)) return "Sync to load";
  const remaining = Number(credits.remaining || 0);
  const total = Number(credits.total || 0);
  const end = creditEnd(credits);
  const until = end ? ` · ends ${end}` : "";
  if (remaining <= 0) return `None left${total ? ` · ${total.toLocaleString()} used` : ""}${until}`;
  return `${remaining.toLocaleString()} left${total ? ` of ${total.toLocaleString()}` : ""}${until}`;
}

function DeskBand({ leads, listings, credits, pfAgents, pfAgentsOk, dubizzleAgents, dubizzleOk, onFilterQuality }) {
  const today = leads?.by_portal?.day || { pf: 0, bayut: 0, dubizzle: 0 };
  const week = leads?.by_portal?.week || { pf: 0, bayut: 0, dubizzle: 0 };
  const weekTotal = Number(week.pf || 0) + Number(week.bayut || 0) + Number(week.dubizzle || 0);
  const low = listings.low_quality_count ?? listings.low_quality?.length ?? 0;
  const metrics = [
    {
      label: "PF quality",
      value: listings.avg_quality ? `${listings.avg_quality}%` : "—",
      hint: `${low} live ads below 70`,
      tone: scoreTone(listings.avg_quality),
      ink: "quality",
    },
    {
      label: "Leads this week",
      value: weekTotal.toLocaleString(),
      hint: `Last 7 days · PF ${Number(week.pf || 0).toLocaleString()} · Bayut ${Number(week.bayut || 0).toLocaleString()} · Dubizzle ${Number(week.dubizzle || 0).toLocaleString()}`,
      ink: "leads",
    },
    {
      label: "PF credits left",
      value: credits && credits.remaining != null ? Number(credits.remaining || 0).toLocaleString() : "—",
      hint: creditHint(credits),
      ink: "pf",
    },
    { label: "PF agents", value: pfAgentsOk ? pfAgents : "—", hint: "Named on live Property Finder ads", ink: "pf-agent" },
    {
      label: "DZ credits left",
      value: "—",
      hint: "Dubizzle does not send a remaining credit balance",
      ink: "dz",
    },
    { label: "DZ agents", value: dubizzleOk ? dubizzleAgents : "—", hint: "Named on live Dubizzle ads", ink: "dz-agent" },
  ];
  const portals = [
    ["pf", "Property Finder", today.pf],
    ["bayut", "Bayut", today.bayut],
    ["dubizzle", "Dubizzle", today.dubizzle],
  ];
  return (
    <section className="ov-band" aria-label="Desk summary">
      <div className="ov-band-head">
        <span>Portal leads</span>
        <span>Today</span>
      </div>
      <div className="ov-band-leads">
        {portals.map(([id, label, value]) => (
          <div key={id} className={`ov-band-lead ${id}`}>
            <i />
            <span>{label}</span>
            <b>{Number(value || 0).toLocaleString()}</b>
            <small>Today</small>
          </div>
        ))}
      </div>
      <div className="ov-band-metrics">
        {metrics.map((item) => (
          <div key={item.label} className={`ink-${item.ink}${item.tone ? ` tone-${item.tone}` : ""}`} title={item.hint}>
            <small>{item.label}</small>
            <b>{item.value}</b>
            <em>{item.hint}</em>
          </div>
        ))}
      </div>
      {listings.quality && onFilterQuality ? (
        <div className="ov-quality-filters ov-band-quality" aria-label="Filter listings by PF quality rating">
          <button type="button" className="q-low" onClick={() => onFilterQuality("below70")}>
            Below 70% <b>{listings.quality.below70}</b>
          </button>
          <button type="button" className="q-mid" onClick={() => onFilterQuality("70to89")}>
            70–89% <b>{listings.quality.mid}</b>
          </button>
          <button type="button" className="q-high" onClick={() => onFilterQuality("90plus")}>
            90%+ <b>{listings.quality.high}</b>
          </button>
          <button type="button" className="q-none" onClick={() => onFilterQuality("none")}>
            No rating <b>{listings.quality.none}</b>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`ov-stat tone-${tone || "plain"}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small className="ov-stat-sub">{sub}</small> : null}
    </div>
  );
}

function Bars({ items, max, onPick }) {
  const top = max || Math.max(1, ...items.map(([, n]) => n));
  return (
    <ul className="ov-bars">
      {items.map(([label, n]) => {
        const body = (
          <>
            <span>{pretty(label)}</span>
            <i style={{ width: `${Math.max(3, (n / top) * 100)}%` }} />
            <b>{n}</b>
          </>
        );
        return (
          <li key={label}>
            {onPick ? (
              <button type="button" className="ov-bar" onClick={() => onPick(label)}>
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LiveTypes({ title, portal, items, onOpen }) {
  const rows = Array.isArray(items) ? items : [];
  const total = rows.reduce((sum, [, n]) => sum + n, 0);
  return (
    <Card title={title} note={portal?.ok ? `${total} live on the website` : "Live on the website"}>
      {portal?.ok ? (
        rows.length ? (
          <Bars items={rows} onPick={onOpen} />
        ) : (
          <p className="ov-empty">No live listings on this website.</p>
        )
      ) : (
        <p className="ov-empty">{portal?.error || "Scanning the website"}</p>
      )}
    </Card>
  );
}

function ReportRow({ item, onOpen, extra }) {
  return (
    <li>
      {item.photo ? <img src={item.photo} alt="" /> : <span className="ov-thumb" />}
      <div>
        <button type="button" className="link" onClick={() => onOpen(item.id, item.reference)}>
          {item.reference}
        </button>
        <small>
          {item.listing_agent || item.title || "—"}
          {item.community ? ` · ${item.community}` : ""}
        </small>
      </div>
      <b className={extra || ""}>{item.leads ?? item.score ?? 0}</b>
    </li>
  );
}

function Card({ title, note, action, span, children }) {
  return (
    <section className={`ov-card${span ? " ov-span" : ""}`}>
      <div className="ov-card-head">
        <div>
          <h3>{title}</h3>
          {note ? <p className="ov-card-note">{note}</p> : null}
        </div>
        {action || null}
      </div>
      <div className="ov-card-body">{children}</div>
    </section>
  );
}

function listingMatchesActivity(item, filter) {
  if (filter === "working") return item.working;
  if (filter === "live") return item.status === "live";
  if (filter === "archived") return item.status === "archived";
  return true;
}

function AgentActivity({ people, onOpenListing }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("working");
  const [openName, setOpenName] = useState("");
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    return (people || [])
      .map((person) => {
        const listings = person.listings.filter((item) => listingMatchesActivity(item, filter));
        return {
          ...person,
          listings,
          shown: listings.length,
          last_posted: listings[0]?.posted_at || "",
          last_edited: listings.reduce((latest, item) => {
            if (!item.edited_at) return latest;
            return !latest || item.edited_at > latest ? item.edited_at : latest;
          }, ""),
        };
      })
      .filter((person) => person.shown > 0 && (!q || person.name.toLowerCase().includes(q)))
      .sort((a, b) => b.shown - a.shown || a.name.localeCompare(b.name));
  }, [people, filter, q]);

  return (
    <section className="ov-report ov-activity" aria-labelledby="ov-activity-title">
      <div className="ov-section-head">
        <div>
          <small>Desk activity</small>
          <h2 id="ov-activity-title">When agents posted and edited</h2>
          <p>Each agent’s listings with the date and time they were posted, and the last time someone on the desk edited them.</p>
        </div>
        <label className="ov-activity-search">
          <span className="sr-only">Find agent</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find agent..."
            type="search"
          />
        </label>
      </div>
      <div className="ov-days ov-activity-filters" role="group" aria-label="Listing filter">
        {[
          ["working", "Working"],
          ["live", "Live"],
          ["all", "All"],
          ["archived", "Archived"],
        ].map(([id, label]) => (
          <button key={id} className={filter === id ? "on" : ""} type="button" onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ov-activity-list">
        {rows.map((person) => {
          const open = openName === person.name;
          return (
            <details
              key={person.name}
              className="ov-activity-agent"
              open={open}
              onToggle={(e) => {
                if (e.currentTarget.open) setOpenName(person.name);
                else if (openName === person.name) setOpenName("");
              }}
            >
              <summary>
                <span className="ov-activity-name">{person.name}</span>
                <span>
                  {person.shown} {person.shown === 1 ? "listing" : "listings"}
                </span>
                <span>Last posted {whenFull(person.listings[0]?.posted_at || person.last_posted)}</span>
                <span>Last edited {whenFull(person.last_edited)}</span>
              </summary>
              <div className="ov-activity-table-wrap">
                <table className="ov-activity-table">
                  <thead>
                    <tr>
                      <th>Listing</th>
                      <th>Status</th>
                      <th>Posted</th>
                      <th>Last edited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {person.listings.map((item) => (
                      <tr key={item.id || item.reference}>
                        <td>
                          <button type="button" className="link" onClick={() => onOpenListing(item.id, item.reference)}>
                            {item.reference}
                          </button>
                          <small>{item.title || "—"}</small>
                        </td>
                        <td>
                          <span className={`ov-activity-status ${item.status}`}>{pretty(item.status)}</span>
                        </td>
                        <td>
                          <b>{whenFull(item.posted_at)}</b>
                          {item.posted_by ? <small>{item.posted_by}</small> : null}
                        </td>
                        <td>
                          <b>{item.edited_at ? whenFull(item.edited_at) : "—"}</b>
                          {item.edited_by ? <small>{item.edited_by}</small> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
        {!rows.length ? <p className="ov-empty">No agent listings match this filter.</p> : null}
      </div>
    </section>
  );
}

function overviewStoreKey(user) {
  const id = String(user?.id || "").replace(/\D/g, "");
  return id ? `a7.propertyListing.u${id}.overviewBoard.v1` : "";
}

function readSavedOverview(user) {
  const key = overviewStoreKey(user);
  if (!key) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved?.payload || typeof saved.payload !== "object") return null;
    if (Date.now() - Number(saved.savedAt || 0) > 4 * 60 * 60 * 1000) return null;
    return saved.payload;
  } catch {
    return null;
  }
}

function writeSavedOverview(user, payload) {
  const key = overviewStoreKey(user);
  if (!key || !payload) return;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    /* quota */
  }
}

export function Overview({ user, onOpenListing, onOpenLeads, onFilterQuality, onOpenLivePortal, onOpenLiveType, onOpenAdSlice, toolbar }) {
  const [data, setData] = useState(() => readSavedOverview(user));
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const hasData = useRef(Boolean(readSavedOverview(user)));
  const [days] = useState(7);

  function leadQuery(windowDays = days) {
    return new URLSearchParams({ days: String(windowDays), lead_range: "day" }).toString();
  }

  async function load(windowDays = days) {
    try {
      setData(await api(`/api/overview?${leadQuery(windowDays)}`));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    let stop = false;
    let pending = false;
    async function full() {
      if (pending) return;
      pending = true;
      if (!stop) setRefreshing(true);
      try {
        const next = await api(`/api/overview?${leadQuery()}`);
        if (!stop) {
          hasData.current = true;
          setData(next);
          writeSavedOverview(user, next);
          setError("");
        }
      } catch (err) {
        if (!stop && !hasData.current) setError(err.message);
      } finally {
        pending = false;
        if (!stop) setRefreshing(false);
      }
    }
    full();
    const timer = setInterval(full, 20000);
    const onShow = () => {
      if (document.visibilityState === "visible") full();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [days]);

  async function syncNow() {
    setSyncing(true);
    setNotice("Syncing with Property Finder... this takes about a minute.");
    try {
      const body = await api("/api/pf/sync", { method: "POST" });
      const s = body.summary;
      setNotice(`Synced: ${s.listings} listings (${s.created} new, ${s.updated} updated), ${s.leads} leads, ${s.users} agents${s.errors?.length ? `, ${s.errors.length} warnings` : ""}.`);
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const pf = data?.pf;
  const last = pf?.last_sync;
  const pagebar = (
    <div className="ov-pagebar">
      <div className="ov-pagebar-left">
        <span className="ov-pagebar-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <small>A7 Group · Property Finder</small>
          <h1>Overview</h1>
          <p>Live picture of the account, desk listings and incoming leads.</p>
        </div>
      </div>
      <div className="ov-sync">
        <small>
          {!data && !error
            ? "Loading..."
            : error && !data
              ? error
              : refreshing
                ? "Updating..."
                : pf?.configured
                ? last
                  ? `Last sync ${when(last.finished_at)}${pf.running ? " · running now" : ""}`
                  : "Not synced yet"
                : "Property Finder API not configured"}
        </small>
        {user?.admin && pf?.configured ? (
          <button className="btn gold" type="button" disabled={syncing || pf.running} onClick={syncNow}>
            {syncing || pf.running ? "Syncing..." : "Sync now"}
          </button>
        ) : null}
      </div>
    </div>
  );

  if (error && !data) {
    return (
      <div className="overview">
        {pagebar}
        {toolbar || null}
        <p className="err">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="overview">
        {pagebar}
        {toolbar || null}
        <div className="ov-loading">Loading overview...</div>
      </div>
    );
  }
  const { listings, leads, report } = data;
  const credits = pf.credits;
  const pfLive = data.portals_live?.portals?.pf;
  const dubizzleLive = data.portals_live?.portals?.dubizzle;
  const dubizzleAgents = Array.isArray(dubizzleLive?.agents) ? dubizzleLive.agents.length : 0;
  const pfAgents = Array.isArray(pfLive?.agents) ? pfLive.agents.length : 0;
  const windowDays = report?.days || days;

  return (
    <div className="overview">
      {pagebar}
      {toolbar || null}
      {notice ? <div className="tc-status ok">{notice}</div> : null}

      <div className="ov-info-top" aria-label="All ads">
        <AdCountBoard facts={data.adFacts} onOpen={onOpenAdSlice} />
      </div>

      <div className="ov-portal-row">
        <PortalLive label="Live on Property Finder" portalId="pf" portals={data.portals_live?.portals} onOpenPortal={onOpenLivePortal} />
        <PortalLive label="Live on Bayut" portalId="bayut" portals={data.portals_live?.portals} onOpenPortal={onOpenLivePortal} />
        <PortalLive label="Live on Dubizzle" portalId="dubizzle" portals={data.portals_live?.portals} onOpenPortal={onOpenLivePortal} />
      </div>

      <DeskBand
        leads={leads}
        listings={listings}
        credits={credits}
        pfAgents={pfAgents}
        pfAgentsOk={Boolean(pfLive?.ok)}
        dubizzleAgents={dubizzleAgents}
        dubizzleOk={Boolean(dubizzleLive?.ok)}
        onFilterQuality={onFilterQuality}
      />

      <div className="ov-type-row">
        <LiveTypes
          title="Property Finder by type"
          portal={data.portals_live?.portals?.pf}
          items={listings.live_by_type?.pf}
          onOpen={onOpenLiveType ? (type) => onOpenLiveType("pf", type) : null}
        />
        <LiveTypes
          title="Bayut by type"
          portal={data.portals_live?.portals?.bayut}
          items={listings.live_by_type?.bayut}
          onOpen={onOpenLiveType ? (type) => onOpenLiveType("bayut", type) : null}
        />
        <LiveTypes
          title="Dubizzle by type"
          portal={data.portals_live?.portals?.dubizzle}
          items={listings.live_by_type?.dubizzle}
          onOpen={onOpenLiveType ? (type) => onOpenLiveType("dubizzle", type) : null}
        />
      </div>

      <div className="ov-grid">
        <Card title="Top listings by leads (30 days)">
          <ul className="ov-list ov-top">
            {leads.top_listings.slice(0, 6).map((item) => (
              <li key={item.reference}>
                {item.photo ? <img src={item.photo} alt="" /> : <span className="ov-thumb" />}
                <div>
                  <button type="button" className="link" onClick={() => onOpenListing(item.id, item.reference)}>
                    {item.reference}
                  </button>
                  <small className="ov-top-title">{item.title || "Desk listing"}</small>
                  <small className="ov-top-meta">{listingFacts(item)}</small>
                  <small className="ov-top-meta">{listingPrice(item)}{item.agent ? ` · ${item.agent}` : ""}</small>
                </div>
                <div className="ov-lead-count">
                  <b>{Number(item.count || 0).toLocaleString()}</b>
                  <em>leads</em>
                  <small>PF {item.pf || 0} · Bayut {item.bayut || 0} · DZ {item.dubizzle || 0}</small>
                </div>
              </li>
            ))}
            {!leads.top_listings.length ? <li className="muted">No leads in the last 30 days.</li> : null}
          </ul>
        </Card>

        <Card
          title="Live listings to improve"
          action={
            onFilterQuality ? (
              <button className="btn" type="button" onClick={() => onFilterQuality(listings.low_quality_count > 0 ? "below70" : "70to89")}>
                {listings.low_quality_count > 0 ? "View all below 70%" : "View 70–89%"}
              </button>
            ) : null
          }
        >
          <ul className="ov-list ov-improve">
            {listings.low_quality.map((item) => (
              <li key={item.id}>
                {item.photo ? <img src={item.photo} alt="" /> : <span className="ov-thumb" />}
                <div>
                  <button type="button" className="link" onClick={() => onOpenListing(item.id, item.reference)}>
                    {item.reference}
                  </button>
                <small>{item.score}% · {item.title}</small>
                  {item.gaps?.length ? (
                    <span className="ov-gaps">
                      {item.gaps.map((gap) => (
                        <em key={gap.key} className={gap.color}>{gap.help}</em>
                      ))}
                    </span>
                  ) : null}
                </div>
                <b className={`score ${scoreTone(item.score)}`}>{item.score}</b>
              </li>
            ))}
            {!listings.low_quality.length ? <li className="muted">No live Property Finder listing is under 90 with a fix still open.</li> : null}
          </ul>
        </Card>

        <Card title="Top agents by leads (30 days)" span>
          <Bars items={leads.top_agents.slice(0, 6).map((a) => [a.name, a.count])} />
        </Card>
      </div>

      {report ? (
        <section className="ov-report">
          <div className="ov-grid">
            <Card title="Quality scores" note="Property Finder score, highest first.">
              <ul className="ov-list">
                {report.scores.slice(0, 6).map((item) => (
                  <ReportRow key={item.id} item={{ ...item, leads: item.score }} onOpen={onOpenListing} extra={`score ${scoreTone(item.score)}`} />
                ))}
                {!report.scores.length ? <li className="muted">No PF quality scores yet.</li> : null}
              </ul>
            </Card>

            <Card title="Why some ads get more leads" note={`From the last ${windowDays} days of this desk’s data.`} span>
              <ol className="ov-reasons">
                {report.reasons.map((reason, index) => (
                  <li key={reason}>
                    <span>{index + 1}</span>
                    <p>{reason}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </section>
      ) : null}

      {report?.agent_activity?.length ? (
        <AgentActivity people={report.agent_activity} onOpenListing={onOpenListing} />
      ) : null}
    </div>
  );
}
