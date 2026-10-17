import { useEffect, useMemo, useState } from "react";
import { NocDocUpload } from "./NocDocUpload.jsx";
import { NocEmailSend } from "./NocEmailSend.jsx";
import { NocSavedLists } from "./NocSavedLists.jsx";
import { NocSignBox } from "./NocSignBox.jsx";
import { downloadFile } from "./downloadFile.js";
import { NocSheet } from "./NocSheet.jsx";
import { CrmTypeahead, lookupCrmItem } from "./CrmTypeahead.jsx";
import { usePersistedState } from "./uiPersist.js";

const PHOTO_KEYS = [
  "ownerName",
  "emiratesId",
  "date",
  "purpose",
  "propertyKind",
  "titleDeedPropertyType",
  "location",
  "buildingNo",
  "plotNo",
  "municipalityNo",
  "plotAreaSqft",
  "plotAreaSqm",
  "askingAmount",
  "askingPeriod",
];

const PHOTO_LABELS = {
  ownerName: "owner name",
  emiratesId: "Emirates ID",
  date: "date",
  purpose: "purpose",
  propertyKind: "property kind",
  titleDeedPropertyType: "title deed type",
  location: "location",
  buildingNo: "building no.",
  plotNo: "plot no.",
  municipalityNo: "municipality no.",
  plotAreaSqft: "area (sq. ft.)",
  plotAreaSqm: "area (sq. m.)",
  askingAmount: "asking amount",
  askingPeriod: "period",
};

const EMPTY = {
  id: "",
  listingId: "",
  listingRef: "",
  date: "",
  ownerName: "",
  emiratesId: "",
  companyName: "A7 GROUP REAL ESTATE LLC",
  purpose: "rental",
  propertyKind: "",
  location: "",
  titleDeedPropertyType: "",
  buildingNo: "",
  plotNo: "",
  municipalityNo: "",
  plotAreaSqft: "",
  plotAreaSqm: "",
  ownerSign: "",
  askingAmount: "",
  askingPeriod: "per year",
};

function moneyNumber(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function sqmFromSqft(sqft) {
  const n = moneyNumber(sqft);
  return n > 0 ? String(Math.round(n * 0.092903 * 100) / 100) : "";
}

function sqftFromSqm(sqm) {
  const n = moneyNumber(sqm);
  return n > 0 ? String(Math.round(n / 0.092903)) : "";
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

export function NocForm({ listings }) {
  const [step, setStep] = usePersistedState("noc.step", 1);
  const [form, setForm] = usePersistedState("noc.form", EMPTY);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listingQ, setListingQ] = usePersistedState("noc.listingQ", "");
  const [listingHits, setListingHits] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function loadSaved() {
    const body = await api("/api/noc/list");
    if (body.ok) setSaved(body.items || []);
  }

  useEffect(() => {
    loadSaved();
  }, []);

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

  function applyListingData(data) {
    setForm((current) => ({
      ...EMPTY,
      ...data,
      id: current.id,
      ownerSign: current.ownerSign || data.ownerSign || "",
    }));
    setStatus({ type: "ok", text: "Listing fields filled. Complete any empty boxes, then save." });
  }

  function applyPhotoData(data) {
    const next = {};
    for (const key of PHOTO_KEYS) {
      const value = String(data?.[key] ?? "").trim();
      if (value) next[key] = value;
    }
    if (next.purpose === "sale") next.askingPeriod = "";
    if (next.purpose === "rental" && !next.askingPeriod) next.askingPeriod = form.askingPeriod || "per year";
    set(next);
    return Object.keys(next).filter((key) => String(next[key] || "").trim());
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
      const names = filled.map((key) => PHOTO_LABELS[key] || key).join(", ");
      const lowNote = body.frontKeyLow
        ? " Front OpenAI key is running out — Matloob Ul Hasnain was notified on Bitrix."
        : "";
      setStatus({
        type: "ok",
        text: filled.length
          ? `Filled ${filled.length} field${filled.length === 1 ? "" : "s"} from the document (${names}). Check and save.${lowNote}`
          : `Document read. No matching NOC fields were found.${lowNote}`,
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
    const body = await api(`/api/noc/from-listing/${encodeURIComponent(id)}`);
    if (body.ok && body.data) {
      applyListingData(body.data);
    }
  }

  function changeArea(which, value) {
    if (which === "feet") {
      set({ plotAreaSqft: value, plotAreaSqm: sqmFromSqft(value) || form.plotAreaSqm });
      return;
    }
    set({ plotAreaSqm: value, plotAreaSqft: sqftFromSqm(value) || form.plotAreaSqft });
  }

  function missing() {
    if (!form.ownerName.trim()) return "Add the owner name.";
    if (!form.emiratesId.trim()) return "Add the Emirates ID.";
    if (!form.location.trim()) return "Add the location.";
    if (!form.plotNo.trim() && !form.buildingNo.trim()) return "Add plot no. or building no.";
    return "";
  }

  async function persist() {
    const miss = missing();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return null;
    }
    const body = await api("/api/noc/save", form);
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
      await downloadFile(item.download, item.pdfName || "noc.pdf");
      setStatus({ type: "ok", text: `Downloading ${item.pdfName || "the PDF"}.` });
    } catch (err) {
      setStatus({ type: "err", text: err instanceof Error ? err.message : "Could not download the PDF." });
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(item) {
    const body = await api(`/api/noc/${encodeURIComponent(item.id)}`);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not open this NOC." });
      return;
    }
    set({ ...EMPTY, ...body.item.data, id: body.item.id });
    setStep(2);
    setStatus({ type: "ok", text: "Opened saved NOC." });
  }

  async function removeSaved(item) {
    if (!window.confirm("Delete this NOC?")) return;
    const res = await fetch(`/api/noc/${encodeURIComponent(item.id)}`, { method: "DELETE", credentials: "same-origin" });
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
          2. Form / PDF
        </button>
      </nav>

      {status.text ? <div className={`tc-status ${status.type}`}>{status.text}</div> : null}

      {step === 1 ? (
        <form className="tc-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          <section>
            <h2>1. Listing</h2>
            <p className="tc-hint">Pick a desk listing to auto-fill matching NOC fields. Empty fields stay for you to type.</p>
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
            <h2>2. Owner and date</h2>
            <p className="tc-hint">Grey text is only the writing format. Type the real owner and ID — do not copy a sample name.</p>
            <div className="tc-grid">
              <label>
                Date <input value={f("date")} placeholder="DD Month YYYY" onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label>
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
              <label>
                Emirates ID <input value={f("emiratesId")} placeholder="784-XXXX-XXXXXXX-X" onChange={(e) => set({ emiratesId: e.target.value })} />
              </label>
              <label>
                Company name <input value={f("companyName")} placeholder="Agency name as on trade license" onChange={(e) => set({ companyName: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>3. Property</h2>
            <div className="tc-grid">
              <label>
                Purpose
                <select
                  value={f("purpose")}
                  onChange={(e) =>
                    set({
                      purpose: e.target.value,
                      askingPeriod: e.target.value === "sale" ? "" : form.askingPeriod || "per year",
                    })
                  }
                >
                  <option value="rental">Rental</option>
                  <option value="sale">Sale</option>
                </select>
              </label>
              <label>
                Property kind (in the letter)
                <input value={f("propertyKind")} placeholder="villa / apartment / townhouse" onChange={(e) => set({ propertyKind: e.target.value })} />
              </label>
              <label>
                Title Deed Property Type
                <input value={f("titleDeedPropertyType")} placeholder="Villa / Apartment / Townhouse" onChange={(e) => set({ titleDeedPropertyType: e.target.value })} />
              </label>
              <label className="bf-wide">
                Location <input value={f("location")} placeholder="Community name, Dubai" onChange={(e) => set({ location: e.target.value })} />
              </label>
              <label>
                Building No. <input value={f("buildingNo")} placeholder="Building code" onChange={(e) => set({ buildingNo: e.target.value })} />
              </label>
              <label>
                Plot No. <input value={f("plotNo")} placeholder="Plot number" onChange={(e) => set({ plotNo: e.target.value })} />
              </label>
              <label>
                Municipality No. <input value={f("municipalityNo")} placeholder="XXX - XXXX" onChange={(e) => set({ municipalityNo: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>4. Area and asking amount</h2>
            <div className="tc-grid">
              <label>
                Total plot area (sq. ft.) <input value={f("plotAreaSqft")} placeholder="0.00" onChange={(e) => changeArea("feet", e.target.value)} />
              </label>
              <label>
                Total plot area (sq. m.) <input value={f("plotAreaSqm")} placeholder="0.00" onChange={(e) => changeArea("meter", e.target.value)} />
              </label>
              <label>
                Asking amount (AED) <input value={f("askingAmount")} placeholder="0" onChange={(e) => set({ askingAmount: e.target.value })} />
              </label>
              <label>
                Period <input value={f("askingPeriod")} placeholder="per year" onChange={(e) => set({ askingPeriod: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>5. Owner signature</h2>
            <NocSignBox value={form.ownerSign || ""} onChange={(ownerSign) => set({ ownerSign })} />
          </section>

          <NocEmailSend
            path="/api/noc"
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
            path="/api/noc"
            persist={persist}
            loadSaved={loadSaved}
            form={form}
            disabled={busy}
            current={saved.find((item) => item.id === form.id)}
          />
          <div className="deed-desk">
            <NocSheet data={form} />
          </div>
        </div>
      ) : null}

      <NocSavedLists
        kind="noc"
        signedTitle="Signed NOCs"
        savedTitle="Saved NOCs"
        items={saved}
        emptySaved="None yet. Fill the fields and save."
        removeSaved={removeSaved}
      />
    </div>
  );
}
