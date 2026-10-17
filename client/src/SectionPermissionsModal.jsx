import { useEffect, useMemo, useState } from "react";

function groupSections(sections) {
  const groups = [];
  const byName = new Map();
  for (const row of sections || []) {
    const name = row.group || "Other";
    if (!byName.has(name)) {
      const g = { name, items: [] };
      byName.set(name, g);
      groups.push(g);
    }
    byName.get(name).items.push(row);
  }
  return groups;
}

/** Settings modal: pick a user, tick which Property Listing sections they can see (UI only). */
export function SectionPermissionsModal({ open, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [sections, setSections] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [customized, setCustomized] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setBusy(true);
    setError("");
    setMsg("");
    setPicked(null);
    setQuery("");
    setSelected(new Set());
    setCustomized(false);
    fetch("/api/ui-permissions", { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) throw new Error(body.error || "Could not load permissions");
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setSections(Array.isArray(body.sections) ? body.sections : []);
        setUsers(Array.isArray(body.users) ? body.users : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load permissions");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const shownUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || [])
      .filter((row) => !q || row.name.toLowerCase().includes(q) || String(row.id).includes(q))
      .slice(0, 120);
  }, [users, query]);

  const groups = useMemo(() => groupSections(sections), [sections]);

  function pickUser(row) {
    setPicked(row);
    setMsg("");
    setError("");
    if (Array.isArray(row.sections)) {
      setCustomized(true);
      setSelected(new Set(row.sections));
    } else {
      setCustomized(false);
      setSelected(new Set((sections || []).map((item) => item.id)));
    }
  }

  function toggle(id) {
    setCustomized(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setCustomized(true);
    setSelected(new Set((sections || []).map((item) => item.id)));
  }

  function selectNone() {
    setCustomized(true);
    setSelected(new Set());
  }

  async function onSave() {
    if (!picked?.id || saving) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch(`/api/ui-permissions/${encodeURIComponent(picked.id)}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: [...selected] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "Save failed");
      const saved = Array.isArray(body.sections) ? body.sections : [...selected];
      setUsers((prev) =>
        prev.map((row) => (row.id === picked.id ? { ...row, sections: saved } : row))
      );
      setPicked((prev) => (prev ? { ...prev, sections: saved } : prev));
      setSelected(new Set(saved));
      setCustomized(true);
      onSaved?.(picked.id, saved);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="perm-overlay" role="presentation" onClick={onClose}>
      <div
        className="perm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="perm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="perm-head">
          <div>
            <h2 id="perm-title">Section permissions</h2>
            <p>Choose a user, tick the sections they can open, then Save. They must reopen Property Listing New from the left menu.</p>
          </div>
          <button type="button" className="perm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {error ? <p className="perm-err">{error}</p> : null}
        {msg ? <p className="perm-ok">{msg}</p> : null}

        <div className="perm-grid">
          <section className="perm-users" aria-label="Users">
            <label className="perm-search">
              <span className="sr-only">Search users</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search user…"
                autoComplete="off"
              />
            </label>
            {busy ? <p className="perm-empty">Loading users…</p> : null}
            {!busy && !shownUsers.length ? <p className="perm-empty">No matching users.</p> : null}
            <ul>
              {shownUsers.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={picked?.id === row.id ? "on" : ""}
                    onClick={() => pickUser(row)}
                  >
                    <span>{row.name}</span>
                    <small>
                      #{row.id}
                      {Array.isArray(row.sections) ? ` · ${row.sections.length} sections` : " · default"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="perm-sections" aria-label="Sections">
            {!picked ? (
              <p className="perm-empty">Select a user to edit their visible sections.</p>
            ) : (
              <>
                <div className="perm-sections-head">
                  <div>
                    <h3>{picked.name}</h3>
                    <small>
                      #{picked.id}
                      {customized ? " · custom list" : " · showing default (all for full desk)"}
                    </small>
                  </div>
                  <div className="perm-section-actions">
                    <button type="button" className="perm-ghost" onClick={selectAll}>
                      All
                    </button>
                    <button type="button" className="perm-ghost" onClick={selectNone}>
                      None
                    </button>
                    <button type="button" className="perm-save" disabled={saving} onClick={onSave}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
                {groups.map((group) => (
                  <div key={group.name} className="perm-group">
                    <h4>{group.name}</h4>
                    <ul className="perm-check-list">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`perm-check${selected.has(item.id) ? " on" : ""}`}
                            onClick={() => toggle(item.id)}
                          >
                            <span className="perm-box" aria-hidden="true">
                              {selected.has(item.id) ? "✓" : ""}
                            </span>
                            <span className="perm-check-text">{item.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
