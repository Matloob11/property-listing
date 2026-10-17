import { useEffect, useMemo, useState } from "react";
import { NocDocUpload } from "./NocDocUpload.jsx";
import { NocEmailSend } from "./NocEmailSend.jsx";
import { NocSavedLists } from "./NocSavedLists.jsx";
import { NocSignBox } from "./NocSignBox.jsx";
import { downloadFile } from "./downloadFile.js";
import { NocTrakheesiSheet } from "./NocTrakheesiSheet.jsx";
import { CrmTypeahead, crmUnitLabel, lookupCrmItem } from "./CrmTypeahead.jsx";
import { usePersistedState } from "./uiPersist.js";

const EMPTY = {
  id: "",
  listingId: "",
  listingRef: "",
  date: "",
  recipient: "Dubai Land Department (DLD) - RERA / Trakheesi",
  recipientPlace: "Dubai, United Arab Emirates",
  ownerName: "",
  companyName: "A7 Group Real Estate LLC",
  tradeLicense: "1056530",
  purpose: "rental",
  propertyType: "",
  building: "",
  propertyNo: "",
  plotNo: "",
  location: "",
  annualRent: "",
  ownerSign: "",
};

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }));
}

export function NocTrakheesiForm({ listings }) {
  const [step, setStep] = usePersistedState("nocTrakheesi.step", 1);
  const [form, setForm] = usePersistedState("nocTrakheesi.form", EMPTY);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listingQ, setListingQ] = usePersistedState("nocTrakheesi.listingQ", "");
  const [listingHits, setListingHits] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function loadSaved() {
    const body = await api("/api/noc-trakheesi/list");
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

  function applyPhotoData(data) {
    const next = {};
    if (data?.ownerName) next.ownerName = String(data.ownerName).trim();
    if (data?.date) next.date = String(data.date).trim();
    if (data?.purpose === "sale" || data?.purpose === "rental") next.purpose = data.purpose;
    if (data?.titleDeedPropertyType || data?.propertyKind) {
      next.propertyType = String(data.titleDeedPropertyType || data.propertyKind).trim();
    }
    if (data?.buildingNo) next.building = String(data.buildingNo).trim();
    if (data?.plotNo) next.plotNo = String(data.plotNo).trim();
    if (data?.location) next.location = String(data.location).trim();
    if (data?.askingAmount) next.annualRent = String(data.askingAmount).trim();
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
          ? `Filled ${filled.length} field${filled.length === 1 ? "" : "s"} from the document. Check the letter, then save.`
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
    const body = await api(`/api/noc-trakheesi/from-listing/${encodeURIComponent(id)}`);
    if (body.ok && body.data) {
      set({
        ...body.data,
        listingId: body.data.listingId || id,
        companyName: form.companyName || body.data.companyName,
        tradeLicense: form.tradeLicense || body.data.tradeLicense,
        recipient: form.recipient || body.data.recipient,
        recipientPlace: form.recipientPlace || body.data.recipientPlace,
        ownerSign: form.ownerSign || "",
      });
      setStatus({ type: "ok", text: "Listing fields filled. Check the letter, then save." });
    }
  }

  function missing() {
    if (!form.ownerName.trim()) return "Add the owner name.";
    if (!form.location.trim()) return "Add the location.";
    if (!form.building.trim() && !form.propertyNo.trim() && !form.plotNo.trim()) {
      return "Add building / cluster, property no., or plot no.";
    }
    if (!form.annualRent.trim()) return "Add the annual rent or asking price.";
    return "";
  }

  async function persist() {
    const miss = missing();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return null;
    }
    const body = await api("/api/noc-trakheesi/save", form);
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
      await downloadFile(item.download, item.pdfName || "noc-for-advertisement.pdf");
      setStatus({ type: "ok", text: `Downloading ${item.pdfName || "the PDF"}.` });
    } catch (err) {
      setStatus({ type: "err", text: err instanceof Error ? err.message : "Could not download the PDF." });
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(item) {
    const body = await api(`/api/noc-trakheesi/${encodeURIComponent(item.id)}`);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not open this NOC." });
      return;
    }
    set({ ...EMPTY, ...body.item.data, id: body.item.id });
    setStep(2);
    setStatus({ type: "ok", text: "Opened saved advertisement NOC." });
  }

  async function removeSaved(item) {
    if (!window.confirm("Delete this advertisement NOC?")) return;
    const res = await fetch(`/api/noc-trakheesi/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
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
            <p className="tc-hint">Pick a desk listing to fill the advertisement letter.</p>
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
                Date <input value={f("date")} placeholder="17 September 2026" onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label>
                Purpose
                <select value={f("purpose")} onChange={(e) => set({ purpose: e.target.value })}>
                  <option value="rental">Rent</option>
                  <option value="sale">Sale</option>
                </select>
              </label>
              <label className="bf-wide">
                To <input value={f("recipient")} onChange={(e) => set({ recipient: e.target.value })} />
              </label>
              <label className="bf-wide">
                City / country <input value={f("recipientPlace")} onChange={(e) => set({ recipientPlace: e.target.value })} />
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
              <label>
                Company name <input value={f("companyName")} onChange={(e) => set({ companyName: e.target.value })} />
              </label>
              <label>
                Trade license no. <input value={f("tradeLicense")} onChange={(e) => set({ tradeLicense: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>3. Property details</h2>
            <div className="tc-grid">
              <label>
                Property type <input value={f("propertyType")} placeholder="1 Bedroom" onChange={(e) => set({ propertyType: e.target.value })} />
              </label>
              <label>
                Building / Cluster <input value={f("building")} placeholder="Champions Tower 1" onChange={(e) => set({ building: e.target.value })} />
              </label>
              <label>
                Property No.
                <CrmTypeahead
                  entities={["unit"]}
                  placeholder="Type unit or owner name…"
                  value={f("propertyNo")}
                  onChange={(propertyNo) => set({ propertyNo })}
                  onPick={async (item) => {
                    if (!item) return;
                    const info = await lookupCrmItem(item).catch(() => null);
                    set({
                      propertyNo: info?.unitNo || info?.title || crmUnitLabel(item),
                      building: info?.building || form.building,
                      location: info?.location || form.location,
                      plotNo: info?.plotNo || form.plotNo,
                      ownerName: info?.ownerName || form.ownerName,
                    });
                  }}
                />
              </label>
              <label>
                Plot No. <input value={f("plotNo")} placeholder="433" onChange={(e) => set({ plotNo: e.target.value })} />
              </label>
              <label className="bf-wide">
                Location <input value={f("location")} placeholder="Al Hebiah Fourth" onChange={(e) => set({ location: e.target.value })} />
              </label>
              <label>
                {form.purpose === "sale" ? "Asking price (AED)" : "Annual rent (AED)"}{" "}
                <input value={f("annualRent")} placeholder="50000" onChange={(e) => set({ annualRent: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>4. Owner signature</h2>
            <NocSignBox value={form.ownerSign || ""} onChange={(ownerSign) => set({ ownerSign })} />
          </section>

          <NocEmailSend
            path="/api/noc-trakheesi"
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
            path="/api/noc-trakheesi"
            persist={persist}
            loadSaved={loadSaved}
            form={form}
            disabled={busy}
            current={saved.find((item) => item.id === form.id)}
          />
          <div className="deed-desk">
            <NocTrakheesiSheet data={form} />
          </div>
        </div>
      ) : null}

      <NocSavedLists
        kind="trakheesi"
        signedTitle="Signed advertisement NOCs"
        savedTitle="Saved advertisement NOCs"
        items={saved}
        emptySaved="None yet. Fill the fields and save."
        removeSaved={removeSaved}
      />
    </div>
  );
}
