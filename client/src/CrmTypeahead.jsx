import { useEffect, useRef, useState } from "react";

const FAIL = "Could not load Bitrix CRM. Type the name in the box.";

export async function lookupCrmItem(item) {
  if (!item?.id) return null;
  const res = await fetch("/api/tenancy/lookup", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity: item.entity || "contact", id: item.id }),
  });
  const json = await res.json().catch(() => ({}));
  return json?.found && json.data ? json.data : null;
}

export function crmUnitLabel(item) {
  return String(item?.title || "").split(" · ")[0].trim();
}

export async function createCrmContact(payload) {
  const res = await fetch("/api/crm/contact", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok || !json.item) throw new Error(json.error || "Could not add this name to Bitrix.");
  return json.item;
}

async function crmSearch(entities, query) {
  const params = new URLSearchParams({
    entities: entities.join(","),
    q: String(query || ""),
  });
  const res = await fetch(`/api/crm/search?${params}`, { credentials: "same-origin" });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) throw new Error(json.error || FAIL);
  return Array.isArray(json.items) ? json.items : [];
}

export function CrmTypeahead({
  entities,
  placeholder = "Type a name to search Bitrix…",
  mode = "fill",
  value = "",
  onChange,
  onPick,
  badge,
  addNewLabel = "",
  addName = "",
  addEmail = "",
  addPhone = "",
  allowCustom = false,
}) {
  const [q, setQ] = useState(mode === "fill" ? value : "");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const timer = useRef(null);
  const inputRef = useRef(null);
  const entityKey = (entities || []).join(",");

  useEffect(() => {
    if (mode === "fill") setQ(value || "");
  }, [mode, value]);

  useEffect(() => {
    if (open && mode === "pick" && inputRef.current) inputRef.current.focus();
  }, [open, mode]);

  useEffect(() => {
    if (picked && mode === "pick") return undefined;
    if (!open) return undefined;
    const list = entityKey.split(",").filter(Boolean);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        setItems(await crmSearch(list, q));
      } catch (err) {
        setItems([]);
        setError(err instanceof Error ? err.message : FAIL);
      } finally {
        setBusy(false);
      }
    }, q ? 220 : 0);
    return () => clearTimeout(timer.current);
  }, [q, open, picked, mode, entityKey]);

  if (mode === "pick" && picked) {
    return (
      <div className="tc-picker">
        <div className="tc-tag">
          <span>
            {picked.title} <small>({picked.entity})</small>
          </span>
          <button
            type="button"
            aria-label="Remove"
            onClick={() => {
              setPicked(null);
              setQ("");
              setItems([]);
              onPick?.(null);
            }}
          >
            ×
          </button>
        </div>
        {badge ? <small className={badge.found ? "ok" : "warn"}>{badge.message}</small> : null}
      </div>
    );
  }

  async function addNewContact() {
    const name = String(q || addName || value || "").replace(/\s+/g, " ").trim();
    if (name.length < 2) {
      setError("Type the new name first, then click Add new.");
      setOpen(true);
      return;
    }
    setAdding(true);
    setError("");
    try {
      const item = await createCrmContact({ name, email: addEmail, phone: addPhone });
      setPicked(mode === "pick" ? item : null);
      setOpen(false);
      if (mode === "fill") {
        setQ(item.title);
        onChange?.(item.title);
      }
      onPick?.(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this name to Bitrix.");
      setOpen(true);
    } finally {
      setAdding(false);
    }
  }

  function useTypedValue() {
    const typed = String(q || "").replace(/\s+/g, " ").trim();
    if (!typed) return;
    setQ(typed);
    setOpen(false);
    onChange?.(typed);
  }

  const typed = String(q || "").replace(/\s+/g, " ").trim();
  const showCustom = allowCustom && typed.length > 0;

  const list = open ? (
    <ul className="tc-picker-list">
      {addNewLabel ? (
        <li>
          <button type="button" className="tc-add-new" disabled={adding} onMouseDown={(e) => e.preventDefault()} onClick={addNewContact}>
            {adding ? "Saving to Bitrix…" : addNewLabel}
          </button>
        </li>
      ) : null}
      {showCustom ? (
        <li>
          <button type="button" className="tc-add-new" onMouseDown={(e) => e.preventDefault()} onClick={useTypedValue}>
            Add “{typed}”
          </button>
        </li>
      ) : null}
      {busy && !items.length ? <li className="tc-picker-note">Loading Bitrix…</li> : null}
      {!busy && error ? <li className="tc-picker-note">{error}</li> : null}
      {!busy && !error && !items.length ? (
        <li className="tc-picker-note">
          {entityKey.split(",").filter(Boolean).every((item) => item === "unit")
            ? "Type a unit, building, location, or owner name."
            : "Type to search tenant or owner names."}
        </li>
      ) : null}
      {items.map((item) => (
        <li key={`${item.entity}-${item.id}`}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setPicked(mode === "pick" ? item : null);
              setOpen(false);
              if (mode === "fill") {
                setQ(item.title);
                onChange?.(item.title);
              }
              onPick?.(item);
            }}
          >
            {item.title}
            <small>{item.entity}</small>
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  if (mode === "pick") {
    return (
      <div className="tc-picker">
        <div className={`tc-selector${open ? " open" : ""}`} onClick={() => !open && setOpen(true)}>
          {open ? (
            <input
              ref={inputRef}
              value={q}
              placeholder={placeholder}
              autoComplete="off"
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
            />
          ) : (
            <button type="button" className="tc-add">
              + Add
            </button>
          )}
        </div>
        {badge ? <small className={badge.found ? "ok" : "warn"}>{badge.message}</small> : null}
        {list}
      </div>
    );
  }

  return (
    <div className="tc-picker">
      <input
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !allowCustom) return;
          e.preventDefault();
          useTypedValue();
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          setOpen(true);
          onChange?.(next);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {badge ? <small className={badge.found ? "ok" : "warn"}>{badge.message}</small> : null}
      {list}
    </div>
  );
}
