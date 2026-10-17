import { useEffect, useMemo, useState } from "react";
import { NocDocUpload } from "./NocDocUpload.jsx";
import { NocEmailSend } from "./NocEmailSend.jsx";
import { NocSavedLists } from "./NocSavedLists.jsx";
import { NocSignBox } from "./NocSignBox.jsx";
import { downloadFile } from "./downloadFile.js";
import { NocMoveinSheet, NocMoveoutSheet } from "./NocMoveinSheet.jsx";
import { CrmTypeahead, crmUnitLabel, lookupCrmItem } from "./CrmTypeahead.jsx";
import { usePersistedState } from "./uiPersist.js";

const EMPTY = {
  id: "",
  listingId: "",
  listingRef: "",
  recipient: "",
  property: "",
  ownerName: "",
  tenantName: "",
  tenantEid: "",
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

export function NocMoveoutForm({ listings }) {
  return <NocMoveinForm listings={listings} variant="out" />;
}

export function NocMoveinForm({ listings, variant = "in" }) {
  const out = variant === "out";
  const apiBase = out ? "/api/noc-moveout" : "/api/noc-movein";
  const listKind = out ? "moveout" : "movein";
  const label = out ? "move-out" : "move-in";
  const Sheet = out ? NocMoveoutSheet : NocMoveinSheet;
  const persistKey = out ? "nocMoveout" : "nocMovein";
  const [step, setStep] = usePersistedState(`${persistKey}.step`, 1);
  const [form, setForm] = usePersistedState(`${persistKey}.form`, EMPTY);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listingQ, setListingQ] = usePersistedState(`${persistKey}.listingQ`, "");
  const [listingHits, setListingHits] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function loadSaved() {
    const body = await api(`${apiBase}/list`);
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
    const details = [data?.buildingNo, data?.plotNo, data?.location].map((part) => String(part || "").trim()).filter(Boolean);
    const next = {};
    if (data?.ownerName) next.ownerName = String(data.ownerName).trim();
    if (data?.emiratesId) next.tenantEid = String(data.emiratesId).trim();
    if (details.length) next.property = details.join(" ");
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
          ? `Filled ${filled.length} field${filled.length === 1 ? "" : "s"} from the document. Add the tenant and recipient, then save.`
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
    const body = await api(`${apiBase}/from-listing/${encodeURIComponent(id)}`);
    if (body.ok && body.data) {
      set({
        listingId: body.data.listingId || id,
        listingRef: body.data.listingRef || "",
        ownerName: body.data.ownerName || form.ownerName,
        tenantName: body.data.tenantName || form.tenantName,
        property: body.data.property || form.property,
      });
      setStatus({ type: "ok", text: "Listing fields filled. Add recipient, tenant name, and Emirates ID." });
    }
  }

  function missing() {
    if (!form.recipient.trim()) return "Add who the letter is to.";
    if (!form.property.trim()) return "Add the property.";
    if (!form.ownerName.trim()) return "Add the owner name.";
    if (!form.tenantName.trim()) return "Add the tenant name.";
    if (!form.tenantEid.trim()) return "Add the tenant Emirates ID.";
    return "";
  }

  async function persist() {
    const miss = missing();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return null;
    }
    const body = await api(`${apiBase}/save`, form);
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
      await downloadFile(item.download, item.pdfName || (out ? "noc-move-out.pdf" : "noc-move-in.pdf"));
      setStatus({ type: "ok", text: `Downloading ${item.pdfName || "the PDF"}.` });
    } catch (err) {
      setStatus({ type: "err", text: err instanceof Error ? err.message : "Could not download the PDF." });
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(item) {
    const body = await api(`${apiBase}/${encodeURIComponent(item.id)}`);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not open this NOC." });
      return;
    }
    set({ ...EMPTY, ...body.item.data, id: body.item.id });
    setStep(2);
    setStatus({ type: "ok", text: `Opened saved ${label} NOC.` });
  }

  async function removeSaved(item) {
    if (!window.confirm(`Delete this ${label} NOC?`)) return;
    const res = await fetch(`${apiBase}/${encodeURIComponent(item.id)}`, { method: "DELETE", credentials: "same-origin" });
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
              <label className="bf-wide">
                To{" "}
                <input
                  value={f("recipient")}
                  placeholder="Dubai Holding Management"
                  onChange={(e) => set({ recipient: e.target.value })}
                />
              </label>
              <label className="bf-wide">
                Property
                <CrmTypeahead
                  entities={["unit"]}
                  placeholder="Type unit or owner name…"
                  value={f("property")}
                  onChange={(property) => set({ property })}
                  onPick={async (item) => {
                    if (!item) return;
                    const info = await lookupCrmItem(item).catch(() => null);
                    const unit = info?.unitNo || info?.title || crmUnitLabel(item);
                    set({
                      property: [info?.building, unit].filter(Boolean).join(" ") || item.title,
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
                Tenant name
                <CrmTypeahead
                  entities={["contact", "company", "lead"]}
                  placeholder="Type tenant name…"
                  addNewLabel="+ Add new tenant to Bitrix"
                  addName={f("tenantName")}
                  value={f("tenantName")}
                  onChange={(tenantName) => set({ tenantName })}
                  onPick={async (item) => {
                    if (!item) return;
                    set({ tenantName: item.title });
                    const info = await lookupCrmItem(item).catch(() => null);
                    if (info?.name) set({ tenantName: info.name });
                  }}
                />
              </label>
              <label className="bf-wide">
                Tenant Emirates ID{" "}
                <input value={f("tenantEid")} placeholder="784-1992-9372868-1" onChange={(e) => set({ tenantEid: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>3. Owner signature</h2>
            <NocSignBox value={form.ownerSign || ""} onChange={(ownerSign) => set({ ownerSign })} />
          </section>

          <NocEmailSend
            path={apiBase}
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
            path={apiBase}
            persist={persist}
            loadSaved={loadSaved}
            form={form}
            disabled={busy}
            current={saved.find((item) => item.id === form.id)}
          />
          <div className="deed-desk">
            <Sheet data={form} />
          </div>
        </div>
      ) : null}

      <NocSavedLists
        kind={listKind}
        signedTitle={`Signed ${label} NOCs`}
        savedTitle={`Saved ${label} NOCs`}
        items={saved}
        emptySaved="None yet. Fill the letter and save."
        removeSaved={removeSaved}
      />
    </div>
  );
}
