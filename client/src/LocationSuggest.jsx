import { useEffect, useMemo, useRef, useState } from "react";

async function api(path) {
  const res = await fetch(path, { credentials: "same-origin" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function asHit(option, fallback = {}) {
  if (option && typeof option === "object") return option;
  const name = String(option || "").trim();
  return {
    id: "",
    name,
    type: fallback.type || "",
    path: fallback.path || name,
    city: fallback.city || "",
    community: fallback.community || name,
    sub_community: fallback.sub_community || "",
    building: fallback.building || "",
    latitude: "",
    longitude: "",
  };
}

export function mergeClientCatalog(base, extra) {
  const cities = [...new Set([...(base?.cities || []), ...(extra?.cities || [])])].sort((a, b) => a.localeCompare(b));
  const communities = {};
  const subs = {};
  for (const catalog of [base, extra]) {
    for (const [city, comms] of Object.entries(catalog?.communities || {})) {
      communities[city] = [...new Set([...(communities[city] || []), ...comms])].sort((a, b) => a.localeCompare(b));
    }
    for (const [city, groups] of Object.entries(catalog?.sub_communities || {})) {
      subs[city] = { ...(subs[city] || {}) };
      for (const [community, rows] of Object.entries(groups || {})) {
        subs[city][community] = [...new Set([...(subs[city][community] || []), ...rows])].sort((a, b) =>
          a.localeCompare(b)
        );
      }
    }
  }
  return { cities, communities, sub_communities: subs };
}

export function SuggestField({
  label,
  required,
  tip,
  action,
  value,
  placeholder,
  options = [],
  search = {},
  onChange,
  onPick,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState([]);
  const [note, setNote] = useState("");
  const box = useRef(null);
  const timer = useRef(0);
  const query = String(value || "");

  const localHits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options
      .filter((item) => !needle || String(item).toLowerCase().includes(needle))
      .slice(0, 40)
      .map((item) =>
        asHit(item, {
          type: search.type || "",
          city: search.city || "",
          community: search.type === "COMMUNITY" ? item : search.community || "",
          sub_community: search.type === "SUBCOMMUNITY" ? item : "",
          building: search.type === "TOWER" ? item : "",
          path: [search.city, search.type === "COMMUNITY" ? item : search.community, search.type === "SUBCOMMUNITY" ? item : "", search.type === "TOWER" ? item : ""]
            .filter(Boolean)
            .join(" - "),
        })
      );
  }, [options, query, search.city, search.community, search.type]);

  const hits = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const hit of [...remote, ...localHits]) {
      const key = hit.id || hit.path || hit.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
    return out.slice(0, 40);
  }, [localHits, remote]);

  useEffect(() => {
    function hide(event) {
      if (!box.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  useEffect(() => {
    const q = query.trim();
    window.clearTimeout(timer.current);
    if (q.length < 2) {
      setRemote([]);
      setNote("");
      return undefined;
    }
    timer.current = window.setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (search.type) params.set("type", search.type);
      if (search.city) params.set("city", search.city);
      if (search.community) params.set("community", search.community);
      setNote("Searching Property Finder…");
      api(`/api/locations/search?${params}`)
        .then((body) => {
          setRemote(body.hits || []);
          setNote((body.hits || []).length ? "" : "No Property Finder match. You can still type it.");
        })
        .catch(() => {
          setRemote([]);
          setNote("Property Finder search is unavailable. Showing saved locations.");
        });
    }, 280);
    return () => window.clearTimeout(timer.current);
  }, [query, search.city, search.community, search.type]);

  function pick(hit) {
    setOpen(false);
    setNote("");
    if (onPick) onPick(hit);
    else onChange(hit.name);
  }

  function onKey(event) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(hits.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      pick(hits[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="studio-field studio-suggest" ref={box}>
      <span>
        {label}
        {required ? <em>*</em> : null}
        {tip ? (
          <i className="studio-info" title={tip}>
            i
          </i>
        ) : null}
        {action ? (
          <button type="button" className="studio-field-action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </span>
      <div className="studio-suggest-box">
        <input
          value={query}
          placeholder={placeholder || "Type to search all locations"}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        {open && hits.length ? (
          <ul className="studio-suggest-list" role="listbox">
            {hits.map((hit, index) => (
              <li key={`${hit.id || hit.path || hit.name}-${index}`}>
                <button
                  type="button"
                  className={index === active ? "on" : ""}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(hit);
                  }}
                >
                  <b>{hit.name}</b>
                  <small>{hit.path !== hit.name ? hit.path : hit.type || "Location"}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {note && open ? <p className="studio-suggest-note">{note}</p> : null}
    </div>
  );
}
