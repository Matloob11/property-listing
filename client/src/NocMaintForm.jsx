import { useEffect, useMemo, useState } from "react";
import { MAINT_COMPANIES, findMaintCompany } from "../../server/nocMaintCompanies.js";
import { derivedWorkType } from "../../server/nocMaintLetter.js";
import { NocDocUpload } from "./NocDocUpload.jsx";
import { NocEmailSend } from "./NocEmailSend.jsx";
import { NocSavedLists } from "./NocSavedLists.jsx";
import { NocSignBox } from "./NocSignBox.jsx";
import { downloadFile } from "./downloadFile.js";
import { NocMaintSheet } from "./NocMaintSheet.jsx";
import { CrmTypeahead, crmUnitLabel, lookupCrmItem } from "./CrmTypeahead.jsx";
import { usePersistedState } from "./uiPersist.js";

const EMPTY = {
  id: "",
  listingId: "",
  listingRef: "",
  date: "",
  recipient: "",
  ownerName: "",
  propertyKind: "Villa",
  propertyDetails: "",
  companyName: "",
  tradeLicense: "",
  workType: "AC Maintenance",
  scopeText: "",
  ownerSign: "",
};

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toMaintDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(raw);
  if (dmy) return `${pad2(dmy[1])}-${pad2(dmy[2])}-${dmy[3]}`;
  const named = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw);
  if (named && MONTHS[named[2].toLowerCase()]) {
    return `${pad2(named[1])}-${MONTHS[named[2].toLowerCase()]}-${named[3]}`;
  }
  return raw;
}

function splitScope(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((row) => row.replace(/^[•\-\u2022]\s*/, "").trim())
    .filter(Boolean);
}

function sameScope(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

const DEFAULT_SCOPE_OPTIONS = [
  "AC servicing and repair",
  "Plumbing repairs: leaking taps, pipes, shower, toilet, drainage",
  "Electrical repairs: switches, sockets, lights, breakers",
  "Washing machine repair",
  "Bathtub change",
  "Kitchen sink and drainage cleaning",
  "Painting and touch-up work",
  "Pest control",
  "Deep cleaning",
  "TV/wall-mount installation",
  "Light fixture installation",
  "Water heater/geyser servicing",
  "Door and lock repair/replacement",
];

function NocMaintScopePicker({ value, options, busy, onChange, onAdd }) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const selected = useMemo(() => splitScope(value), [value]);
  const catalog = useMemo(() => {
    const extra = selected.filter((item) => !options.some((option) => sameScope(option, item)));
    return [...options, ...extra];
  }, [options, selected]);
  const allOn = catalog.length > 0 && catalog.every((item) => selected.some((row) => sameScope(row, item)));

  function write(next) {
    onChange(next.join("\n"));
  }

  function toggle(item) {
    if (selected.some((row) => sameScope(row, item))) {
      write(selected.filter((row) => !sameScope(row, item)));
      return;
    }
    write([...selected, item]);
  }

  function toggleAll() {
    write(allOn ? [] : catalog);
  }

  async function addItem() {
    const text = draft.trim();
    if (!text) return;
    setAdding(true);
    try {
      const added = await onAdd(text);
      if (added) {
        if (!selected.some((row) => sameScope(row, added))) write([...selected, added]);
        setDraft("");
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="nocm-scope-picker bf-wide">
      <span>Scope</span>
      <div className="nocm-scope-list" role="group" aria-label="Scope of work">
        <label className="nocm-scope-option nocm-scope-all">
          <input type="checkbox" checked={allOn} disabled={busy} onChange={toggleAll} />
          All
        </label>
        {catalog.map((item) => (
          <label key={item} className="nocm-scope-option">
            <input
              type="checkbox"
              checked={selected.some((row) => sameScope(row, item))}
              disabled={busy}
              onChange={() => toggle(item)}
            />
            <span>{item}</span>
          </label>
        ))}
        <div className="nocm-scope-add">
          <input
            value={draft}
            placeholder="Add a new item to this list"
            disabled={busy || adding}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
          />
          <button type="button" className="ui-btn ui-btn-sm" disabled={busy || adding || !draft.trim()} onClick={addItem}>
            {adding ? "…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }));
}

export function NocMaintForm({ listings }) {
  const [step, setStep] = usePersistedState("nocMaint.step", 1);
  const [form, setForm] = usePersistedState("nocMaint.form", EMPTY);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listingQ, setListingQ] = usePersistedState("nocMaint.listingQ", "");
  const [listingHits, setListingHits] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [scopeOptions, setScopeOptions] = useState(DEFAULT_SCOPE_OPTIONS);

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const matchedCompany = findMaintCompany(f("companyName"));

  function pickCompany(name) {
    const hit = findMaintCompany(name);
    set({ companyName: hit?.name || name, tradeLicense: hit?.license || "" });
  }

  async function loadSaved() {
    const body = await api("/api/noc-maint/list");
    if (body.ok) setSaved(body.items || []);
  }

  async function loadScopeOptions() {
    const body = await api("/api/noc-maint/scope-options");
    if (body.ok && Array.isArray(body.items) && body.items.length) setScopeOptions(body.items);
  }

  useEffect(() => {
    loadSaved();
    loadScopeOptions();
  }, []);

  async function addScopeOption(item) {
    const body = await api("/api/noc-maint/scope-options", { item });
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not save the new scope item." });
      return "";
    }
    if (Array.isArray(body.items) && body.items.length) setScopeOptions(body.items);
    setStatus({ type: "ok", text: body.existed ? "That scope item is already in the list." : `Saved "${body.added}" to the scope list.` });
    return body.added || item;
  }

  useEffect(() => {
    const q = listingQ.trim();
    if (q.length < 2) {
      setListingHits([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const body = await fetch(`/api/listings?q=${encodeURIComponent(q)}&pageSize=50`, { credentials: "same-origin" })
        .then((r) => r.json())
        .catch(() => ({}));
      setListingHits(body.listings || []);
    }, 280);
    return () => clearTimeout(timer);
  }, [listingQ]);

  const deskOptions = useMemo(() => {
    const q = listingQ.trim().toLowerCase();
    const rows = listings || [];
    if (!q) return rows.slice(0, 40);
    return rows.filter((row) => `${row.reference} ${row.title} ${row.community}`.toLowerCase().includes(q)).slice(0, 40);
  }, [listings, listingQ]);

  function applyPhotoData(data) {
    const details = [data?.buildingNo, data?.plotNo, data?.location].map((part) => String(part || "").trim()).filter(Boolean);
    const next = {};
    if (data?.ownerName) next.ownerName = String(data.ownerName).trim();
    if (data?.titleDeedPropertyType || data?.propertyKind) {
      next.propertyKind = String(data.titleDeedPropertyType || data.propertyKind).trim();
    }
    if (details.length) next.propertyDetails = details.join(", ");
    const dated = toMaintDate(data?.date);
    if (dated) next.date = dated;
    set(next);
    return Object.keys(next);
  }

  async function extractFromPhoto(file) {
    if (!file) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      setStatus({ type: "err", text: "Use a JPG, PNG, or WEBP document." });
      return;
    }
    setPhotoBusy(true);
    setStatus({ type: "", text: "" });
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read this document."));
        reader.readAsDataURL(file);
      });
      const body = await api("/api/noc/extract", { image: dataUrl, mime: file.type, name: file.name });
      if (!body.ok) {
        setStatus({ type: "err", text: body.error || "Could not read details from this document." });
        return;
      }
      const filled = applyPhotoData(body.data);
      setStatus({
        type: "ok",
        text: filled.length
          ? `Filled ${filled.length} field${filled.length === 1 ? "" : "s"} from the document. Add the company, license, and work, then save.`
          : "Document read. No matching fields were found.",
      });
    } catch {
      setStatus({ type: "err", text: "Could not read this document. Try again." });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function pickListing(id) {
    if (!id) {
      set({ listingId: "", listingRef: "" });
      return;
    }
    const body = await api(`/api/noc-maint/from-listing/${encodeURIComponent(id)}`);
    if (body.ok && body.data) {
      set({
        listingId: body.data.listingId || id,
        listingRef: body.data.listingRef || "",
        ownerName: body.data.ownerName || form.ownerName,
        propertyKind: body.data.propertyKind || form.propertyKind,
        propertyDetails: body.data.propertyDetails || form.propertyDetails,
        date: body.data.date || form.date,
      });
      setStatus({ type: "ok", text: "Listing fields filled. Add To, company, and license number." });
    }
  }

  function missing() {
    if (!form.recipient.trim()) return "Add who the letter is to.";
    if (!form.ownerName.trim()) return "Add the owner name.";
    if (!form.propertyDetails.trim()) return "Add the property details.";
    if (!form.companyName.trim()) return "Add the maintenance company.";
    if (!form.tradeLicense.trim()) return "Add the company license number.";
    return "";
  }

  async function persist() {
    const miss = missing();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return null;
    }
    const body = await api("/api/noc-maint/save", form);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not save the NOC." });
      return null;
    }
    set({ ...body.item.data, id: body.item.id });
    setStep(2);
    await loadSaved();
    return body.item;
  }

  async function saveForm() {
    setBusy(true);
    try {
      const item = await persist();
      if (item) setStatus({ type: "ok", text: "Saved. Download the PDF or keep editing." });
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      const item = await persist();
      if (!item?.download) return;
      await downloadFile(item.download, item.pdfName || "noc-maintenance.pdf");
      setStatus({ type: "ok", text: `Downloading ${item.pdfName || "the PDF"}.` });
    } catch (err) {
      setStatus({ type: "err", text: err instanceof Error ? err.message : "Could not download the PDF." });
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(item) {
    const body = await api(`/api/noc-maint/${encodeURIComponent(item.id)}`);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not open this NOC." });
      return;
    }
    set({ ...EMPTY, ...body.item.data, id: body.item.id });
    setStep(2);
    setStatus({ type: "ok", text: "Opened saved maintenance NOC." });
  }

  async function removeSaved(item) {
    if (!window.confirm("Delete this maintenance NOC?")) return;
    const res = await fetch(`/api/noc-maint/${encodeURIComponent(item.id)}`, { method: "DELETE", credentials: "same-origin" });
    const body = await res.json().catch(() => ({ ok: false }));
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not delete." });
      return;
    }
    if (form.id === item.id) {
      setForm(EMPTY);
      setStep(1);
    }
    await loadSaved();
  }

  function resetForm() {
    setForm(EMPTY);
    setListingQ("");
    setStep(1);
    setStatus({ type: "", text: "" });
  }

  return (
    <div className="tc-wrap bf-wrap">
      <nav className="tc-stepper" aria-label="Steps">
        <button type="button" className={step === 1 ? "is-on" : ""} onClick={() => setStep(1)}>
          1. Details
        </button>
        <button
          type="button"
          className={step === 2 ? "is-on" : ""}
          onClick={() => {
            const miss = missing();
            if (miss) {
              setStatus({ type: "err", text: miss });
              return;
            }
            if (!form.id) saveForm();
            else setStep(2);
          }}
        >
          2. Letter / PDF
        </button>
      </nav>

      {status.text ? <div className={`tc-status ${status.type}`}>{status.text}</div> : null}

      {step === 1 ? (
        <form className="tc-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          <section>
            <h2>1. Listing</h2>
            <label className="tc-listing-pick">
              Search listing
              <input value={listingQ} placeholder="Reference, community, or title" onChange={(e) => setListingQ(e.target.value)} />
            </label>
            <label className="tc-listing-pick">
              Or pick from this page
              <select value={f("listingId")} onChange={(e) => pickListing(e.target.value)}>
                <option value="">— none —</option>
                {(listingHits.length ? listingHits : deskOptions).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.reference} · {row.title}
                  </option>
                ))}
              </select>
            </label>
            <NocDocUpload busy={photoBusy} onFile={extractFromPhoto} />
          </section>

          <section>
            <h2>2. Letter</h2>
            <div className="tc-grid">
              <label>
                To <input value={f("recipient")} placeholder="NAKHEEL" onChange={(e) => set({ recipient: e.target.value })} />
              </label>
              <label>
                Work <input value={f("workType")} placeholder="AC Maintenance" onChange={(e) => set({ workType: e.target.value })} />
              </label>
              <label className="bf-wide">
                Property Ref
                <CrmTypeahead
                  entities={["unit"]}
                  placeholder="Type unit or owner name…"
                  value={f("propertyDetails")}
                  onChange={(propertyDetails) => set({ propertyDetails })}
                  onPick={async (item) => {
                    if (!item) return;
                    const info = await lookupCrmItem(item).catch(() => null);
                    const unit = info?.unitNo || info?.title || crmUnitLabel(item);
                    set({
                      propertyDetails: [info?.building, unit].filter(Boolean).join(" ") || item.title,
                      ownerName: info?.ownerName || form.ownerName,
                    });
                  }}
                />
              </label>
              <label className="bf-wide">
                Owner name
                <CrmTypeahead
                  entities={["contact"]}
                  placeholder="Type owner name…"
                  addNewLabel="+ Add new owner to Bitrix"
                  addName={f("ownerName")}
                  value={f("ownerName")}
                  onChange={(ownerName) => set({ ownerName })}
                  onPick={async (item) => {
                    if (!item) return;
                    set({ ownerName: item.title });
                    const info = await lookupCrmItem(item).catch(() => null);
                    if (info?.name) set({ ownerName: info.name });
                  }}
                />
              </label>
              <label className="bf-wide">
                Company name
                <select value={matchedCompany?.name || f("companyName")} onChange={(e) => pickCompany(e.target.value)}>
                  <option value="">Select company</option>
                  {MAINT_COMPANIES.map((row) => (
                    <option key={row.license} value={row.name}>
                      {row.name}
                    </option>
                  ))}
                  {f("companyName") && !matchedCompany ? <option value={f("companyName")}>{f("companyName")}</option> : null}
                </select>
              </label>
              <label>
                License No{" "}
                <input
                  value={f("tradeLicense")}
                  placeholder="Select a company"
                  readOnly={Boolean(matchedCompany)}
                  onChange={(e) => set({ tradeLicense: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section>
            <h2>3. Scope of work</h2>
            <p className="tc-hint">Optional. Tick the jobs if you want them on file. The letter uses Work, company, and license only.</p>
            <NocMaintScopePicker
              value={f("scopeText")}
              options={scopeOptions}
              busy={busy}
              onChange={(scopeText) => set({ scopeText, workType: derivedWorkType({ scopeText, workType: "" }) })}
              onAdd={addScopeOption}
            />
          </section>

          <section>
            <h2>4. Owner signature</h2>
            <NocSignBox value={form.ownerSign || ""} onChange={(ownerSign) => set({ ownerSign })} />
          </section>

          <NocEmailSend
            path="/api/noc-maint"
            persist={persist}
            loadSaved={loadSaved}
            form={form}
            disabled={busy}
            current={saved.find((item) => item.id === form.id)}
          />

          <div className="tc-actions">
            <button type="button" className="ui-btn ui-btn-light" onClick={resetForm}>
              New form
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={saveForm}>
              {busy ? "Saving…" : "Save and make PDF"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <div className="bf-preview">
          <div className="tc-actions">
            <button type="button" className="ui-btn ui-btn-light" onClick={() => setStep(1)}>
              Back to details
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={saveForm}>
              {busy ? "Saving…" : "Save again"}
            </button>
            <button type="button" className="ui-btn ui-btn-success" disabled={busy} onClick={downloadPdf}>
              {busy ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
          <NocEmailSend
            path="/api/noc-maint"
            persist={persist}
            loadSaved={loadSaved}
            form={form}
            disabled={busy}
            current={saved.find((item) => item.id === form.id)}
          />
          <div className="deed-desk">
            <NocMaintSheet data={form} />
          </div>
        </div>
      ) : null}

      <NocSavedLists
        kind="maint"
        signedTitle="Signed maintenance NOCs"
        savedTitle="Saved maintenance NOCs"
        items={saved}
        emptySaved="None yet. Fill the letter and save."
        removeSaved={removeSaved}
      />
    </div>
  );
}
