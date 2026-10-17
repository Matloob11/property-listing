import { useEffect, useMemo, useState } from "react";
import { FormISheet, printFormI } from "./FormISheet.jsx";
import {
  A7_ADDRESS,
  A7_COMPANY,
  AAR_ADDRESS,
  AAR_COMPANY,
  FORM_I_COMPANIES,
  FORM_I_COMPANY_INFO,
  allFormIAgents,
  applyCompanyFields,
  companySelectValue,
  findFormIAgent,
  isAarAgentName,
} from "./formIAgents.js";
import { usePersistedState } from "./uiPersist.js";
function parseIssuedDate(value) {
  const raw = String(value || "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  return null;
}

function toIssuedDisplay(value) {
  const dated = parseIssuedDate(value);
  if (!dated || Number.isNaN(dated.getTime())) return String(value || "").trim();
  const dd = String(dated.getDate()).padStart(2, "0");
  const mm = String(dated.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dated.getFullYear()}`;
}

function toIssuedInput(value) {
  const dated = parseIssuedDate(value);
  if (!dated || Number.isNaN(dated.getTime())) return "";
  return `${dated.getFullYear()}-${String(dated.getMonth() + 1).padStart(2, "0")}-${String(dated.getDate()).padStart(2, "0")}`;
}

function reraTenure(value) {
  const dated = parseIssuedDate(value);
  if (!dated || Number.isNaN(dated.getTime())) return "";
  const now = new Date();
  let months = (now.getFullYear() - dated.getFullYear()) * 12 + (now.getMonth() - dated.getMonth());
  if (now.getDate() < dated.getDate()) months -= 1;
  if (months < 0) return "";
  if (months < 1) return "Issued this month";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (!years) return `${rem} month${rem === 1 ? "" : "s"} licensed`;
  if (!rem) return `${years} year${years === 1 ? "" : "s"} licensed`;
  return `${years}y ${rem}m licensed`;
}

function extraSelectValue(value, options) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = options.find((name) => name.toLowerCase() === raw.toLowerCase());
  return match ? "" : raw;
}

function CompanySelect({ label, value, onChange }) {
  const selected = companySelectValue(value);
  const extra = extraSelectValue(selected, FORM_I_COMPANIES);
  return (
    <label className="bf-wide">
      Name of the establishment
      <select value={selected} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        <option value="">Please select</option>
        {FORM_I_COMPANIES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {extra ? <option value={extra}>{extra}</option> : null}
      </select>
    </label>
  );
}

function DateIssuedField({ label, value, onChange }) {
  const age = reraTenure(value);
  return (
    <label className="formi-issued">
      {label}
      <span className="formi-issued-line">
        <input
          type="date"
          value={toIssuedInput(value)}
          onChange={(e) => onChange(toIssuedDisplay(e.target.value))}
          aria-label={label}
        />
        <small className={`formi-issued-age${age ? "" : " is-empty"}`}>{age || "How long licensed"}</small>
      </span>
    </label>
  );
}

function AgentSelect({ label, value, agents, onChange }) {
  const names = agents.map((row) => row.name);
  const selected = String(value || "").trim();
  const extra = extraSelectValue(selected, names);
  return (
    <label>
      Broker name
      <select value={selected} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        <option value="">Please select</option>
        {agents.map((row) => (
          <option key={row.name} value={row.name}>
            {row.name}
          </option>
        ))}
        {extra ? <option value={extra}>{extra}</option> : null}
      </select>
    </label>
  );
}

const EMPTY = {
  id: "",
  listingId: "",
  listingRef: "",
  date: "",
  aEstablishment: "",
  aAddress: "",
  aPhone: "",
  aFax: "",
  aOrn: "",
  aDedLic: "",
  aBrokerName: "",
  aBrn: "",
  aDateIssued: "",
  aMobile: "",
  aEmail: "",
  aFormAStr: "",
  bEstablishment: "",
  bAddress: "",
  bPhone: "",
  bFax: "",
  bOrn: "",
  bDedLic: "",
  bBrokerName: "",
  bBrn: "",
  bDateIssued: "",
  bMobile: "",
  bEmail: "",
  bFormBStr: "",
  projectName: "",
  propertyType: "",
  masterDeveloper: "",
  propertyDetails: "",
  tenanted: "",
  sellerCommission: "",
  buyerCommission: "",
  buyerName: "",
  buyerContact: "",
  transferFeeSeller: "",
  transferFeeBuyer: "",
  buyerBudget: "",
  listedPrice: "",
  agentASign: "",
  agentBSign: "",
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

function when(ts) {
  if (!ts) return "";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function FormIForm({ listings }) {
  const [step, setStep] = usePersistedState("formI.step", 1);
  const [form, setForm] = usePersistedState("formI.form", EMPTY);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listingQ, setListingQ] = usePersistedState("formI.listingQ", "");
  const [listingHits, setListingHits] = useState([]);

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  function applyCompany(side, name) {
    setForm((current) => {
      const prev = companySelectValue(current[`${side}Establishment`]);
      const nextCompany = companySelectValue(name);
      const next = { ...current, [`${side}Establishment`]: nextCompany || name };
      if (FORM_I_COMPANY_INFO[nextCompany]) applyCompanyFields(next, side, nextCompany);
      else if (current[`${side}Address`] === A7_ADDRESS || current[`${side}Address`] === AAR_ADDRESS) {
        next[`${side}Address`] = "";
        next[`${side}Phone`] = "";
        next[`${side}Orn`] = "";
        next[`${side}DedLic`] = "";
      }
      if (prev && nextCompany && prev !== nextCompany) {
        next[`${side}BrokerName`] = "";
        next[`${side}Email`] = "";
        next[`${side}Mobile`] = "";
        next[`${side}Brn`] = "";
        next[`${side}DateIssued`] = "";
      }
      return next;
    });
  }

  function applyAgent(side, name) {
    const person = findFormIAgent(name) || {};
    const aar = isAarAgentName(name);
    setForm((current) => {
      const next = { ...current, [`${side}BrokerName`]: name };
      const company = aar ? AAR_COMPANY : companySelectValue(current[`${side}Establishment`]) || A7_COMPANY;
      next[`${side}Establishment`] = company;
      applyCompanyFields(next, side, company);
      next[`${side}Email`] = person.email || "";
      next[`${side}Mobile`] = person.phone || "";
      next[`${side}Brn`] = person.brn || "";
      next[`${side}DateIssued`] = person.dateIssued || person.rera_issued || "";
      return next;
    });
  }

  async function loadSaved() {
    const body = await api("/api/form-i/list");
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

  async function pickListing(id) {
    if (!id) {
      set({ listingId: "", listingRef: "" });
      return;
    }
    const body = await api(`/api/form-i/from-listing/${encodeURIComponent(id)}`);
    if (body.ok && body.data) {
      set({
        ...body.data,
        listingId: body.data.listingId || id,
      });
      setStatus({ type: "ok", text: "Listing fields filled. Complete both agents, commission, and signatures." });
    }
  }

  function missing() {
    if (!form.date.trim()) return "Add the agreement date.";
    if (!form.aEstablishment.trim() && !form.bEstablishment.trim()) return "Add the seller or buyer establishment name.";
    if (!form.projectName.trim() && !form.propertyDetails.trim()) return "Add the project name or property details.";
    return "";
  }

  async function saveForm() {
    const miss = missing();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return;
    }
    setBusy(true);
    try {
      const body = await api("/api/form-i/save", form);
      if (!body.ok) {
        setStatus({ type: "err", text: body.error || "Could not save Form I." });
        return;
      }
      set({ ...body.item.data, id: body.item.id });
      setStatus({ type: "ok", text: "Saved. Download the PDF or keep editing." });
      setStep(2);
      await loadSaved();
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(item) {
    const body = await api(`/api/form-i/${encodeURIComponent(item.id)}`);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not open this Form I." });
      return;
    }
    set({ ...EMPTY, ...body.item.data, id: body.item.id });
    setStep(2);
    setStatus({ type: "ok", text: "Opened saved Form I." });
  }

  async function removeSaved(item) {
    if (!window.confirm("Delete this Form I?")) return;
    const res = await fetch(`/api/form-i/${encodeURIComponent(item.id)}`, { method: "DELETE", credentials: "same-origin" });
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
          2. Form I / PDF
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
          </section>

          <section>
            <h2>2. Part 1 — The parties</h2>
            <div className="tc-grid">
              <label>
                Date <input value={f("date")} placeholder="DD/MM/YYYY" onChange={(e) => set({ date: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>3. Seller’s agent (Agent A)</h2>
            <div className="tc-grid">
              <CompanySelect
                label="Seller’s agent establishment"
                value={f("aEstablishment")}
                onChange={(name) => applyCompany("a", name)}
              />
              <label className="bf-wide">
                Address <input value={f("aAddress")} onChange={(e) => set({ aAddress: e.target.value })} />
              </label>
              <label>
                PH <input value={f("aPhone")} onChange={(e) => set({ aPhone: e.target.value })} />
              </label>
              <label>
                FAX <input value={f("aFax")} onChange={(e) => set({ aFax: e.target.value })} />
              </label>
              <label>
                ORN <input value={f("aOrn")} onChange={(e) => set({ aOrn: e.target.value })} />
              </label>
              <label>
                DED LISC <input value={f("aDedLic")} onChange={(e) => set({ aDedLic: e.target.value })} />
              </label>
              <AgentSelect
                label="Seller’s agent broker name"
                value={f("aBrokerName")}
                agents={allFormIAgents()}
                onChange={(name) => applyAgent("a", name)}
              />
              <label>
                BRN <input value={f("aBrn")} onChange={(e) => set({ aBrn: e.target.value })} />
              </label>
              <DateIssuedField label="Date of issue (RERA)" value={f("aDateIssued")} onChange={(value) => set({ aDateIssued: value })} />
              <label>
                Mobil <input value={f("aMobile")} onChange={(e) => set({ aMobile: e.target.value })} />
              </label>
              <label className="bf-wide">
                Email <input value={f("aEmail")} onChange={(e) => set({ aEmail: e.target.value })} />
              </label>
              <label>
                Seller’s Agent Form A STR # <input value={f("aFormAStr")} onChange={(e) => set({ aFormAStr: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>4. Buyer’s agent (Agent B)</h2>
            <div className="tc-grid">
              <CompanySelect
                label="Buyer’s agent establishment"
                value={f("bEstablishment")}
                onChange={(name) => applyCompany("b", name)}
              />
              <label className="bf-wide">
                Address <input value={f("bAddress")} onChange={(e) => set({ bAddress: e.target.value })} />
              </label>
              <label>
                PH <input value={f("bPhone")} onChange={(e) => set({ bPhone: e.target.value })} />
              </label>
              <label>
                FAX <input value={f("bFax")} onChange={(e) => set({ bFax: e.target.value })} />
              </label>
              <label>
                ORN <input value={f("bOrn")} onChange={(e) => set({ bOrn: e.target.value })} />
              </label>
              <label>
                DED LISC <input value={f("bDedLic")} onChange={(e) => set({ bDedLic: e.target.value })} />
              </label>
              <AgentSelect
                label="Buyer’s agent broker name"
                value={f("bBrokerName")}
                agents={allFormIAgents()}
                onChange={(name) => applyAgent("b", name)}
              />
              <label>
                BRN <input value={f("bBrn")} onChange={(e) => set({ bBrn: e.target.value })} />
              </label>
              <DateIssuedField label="Date of issue (RERA)" value={f("bDateIssued")} onChange={(value) => set({ bDateIssued: value })} />
              <label>
                Mobile <input value={f("bMobile")} onChange={(e) => set({ bMobile: e.target.value })} />
              </label>
              <label className="bf-wide">
                Email <input value={f("bEmail")} onChange={(e) => set({ bEmail: e.target.value })} />
              </label>
              <label>
                Buyer’s Agent Form B STR # <input value={f("bFormBStr")} onChange={(e) => set({ bFormBStr: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>5. Part 2 — The property</h2>
            <div className="tc-grid">
              <label className="bf-wide">
                Project name <input value={f("projectName")} onChange={(e) => set({ projectName: e.target.value })} />
              </label>
              <label>
                Property type <input value={f("propertyType")} onChange={(e) => set({ propertyType: e.target.value })} />
              </label>
              <label>
                Master developer <input value={f("masterDeveloper")} onChange={(e) => set({ masterDeveloper: e.target.value })} />
              </label>
              <label className="bf-wide">
                Property details{" "}
                <input value={f("propertyDetails")} onChange={(e) => set({ propertyDetails: e.target.value })} />
              </label>
              <label>
                Is the property tenanted?{" "}
                <select value={f("tenanted")} onChange={(e) => set({ tenanted: e.target.value })}>
                  <option value="">Please select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </label>
            </div>
          </section>

          <section>
            <h2>6. Part 3 — The commission (split)</h2>
            <div className="tc-grid">
              <label>
                Seller’s agent % <input value={f("sellerCommission")} placeholder="50%" onChange={(e) => set({ sellerCommission: e.target.value })} />
              </label>
              <label>
                Buyer’s agent % <input value={f("buyerCommission")} placeholder="50%" onChange={(e) => set({ buyerCommission: e.target.value })} />
              </label>
              <label>
                Buyer’s name <input value={f("buyerName")} onChange={(e) => set({ buyerName: e.target.value })} />
              </label>
              <label>
                Contact <input value={f("buyerContact")} onChange={(e) => set({ buyerContact: e.target.value })} />
              </label>
              <label>
                Transfer fee seller <input value={f("transferFeeSeller")} placeholder="Yes / % / tick" onChange={(e) => set({ transferFeeSeller: e.target.value })} />
              </label>
              <label>
                Transfer fee buyer <input value={f("transferFeeBuyer")} placeholder="Yes / % / tick" onChange={(e) => set({ transferFeeBuyer: e.target.value })} />
              </label>
              <label>
                Buyer budget <input value={f("buyerBudget")} onChange={(e) => set({ buyerBudget: e.target.value })} />
              </label>
              <label>
                Listed price by Agent A <input value={f("listedPrice")} onChange={(e) => set({ listedPrice: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>7. Part 4 — Signatures</h2>
            <div className="tc-grid">
              <label>
                Agent A <input value={f("agentASign")} onChange={(e) => set({ agentASign: e.target.value })} />
              </label>
              <label>
                Agent B <input value={f("agentBSign")} onChange={(e) => set({ agentBSign: e.target.value })} />
              </label>
            </div>
          </section>

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
            <button type="button" className="ui-btn ui-btn-success" onClick={printFormI}>
              Download PDF
            </button>
          </div>
          <div className="deed-desk">
            <FormISheet data={form} />
          </div>
        </div>
      ) : null}

      <section className="bf-saved">
        <h2>Saved Form I agreements</h2>
        {!saved.length ? <p className="tc-hint">None yet. Fill both agents and the property, then save.</p> : null}
        <ul>
          {saved.map((item) => (
            <li key={item.id}>
              <button type="button" className="bf-saved-open" onClick={() => openSaved(item)}>
                <b>{item.title}</b>
                <span>
                  {item.ownerName || "No broker"} · {item.listingRef || "No listing"} · {when(item.updatedAt)}
                </span>
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => openSaved(item)}>
                Open
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => removeSaved(item)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
