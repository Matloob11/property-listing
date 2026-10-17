import { useEffect, useMemo, useState } from "react";
import { downloadFile } from "./downloadFile.js";
import { FormASheet } from "./FormASheet.jsx";
import { CrmTypeahead, lookupCrmItem } from "./CrmTypeahead.jsx";
import { usePersistedState } from "./uiPersist.js";
import {
  PROPERTY_TYPES,
  USAGE_TYPES,
  IDENTITY_VERIFICATION_TYPES,
  VERIFICATION_TYPES,
  certificateYears,
  emptyFormA,
  formatFormADate,
  isoFormADate,
  missingDetails,
  ownerDisplayName,
  stepMissing,
} from "../../server/formAModel.js";

const STEPS = [
  { id: "owner", label: "Owner type" },
  { id: "certificate", label: "Certificate Details" },
  { id: "property", label: "Property Information" },
  { id: "ownerinfo", label: "Owner Information" },
  { id: "tenancy", label: "Tenancy Information" },
  { id: "finance", label: "Property Financial Information" },
  { id: "commission", label: "Commission and Duration" },
  { id: "notes", label: "Documents and Notes" },
  { id: "review", label: "Terms" },
];

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

function Field({ label, required, className = "", children }) {
  return (
    <label className={className}>
      {label}
      {required ? " *" : ""}
      {children}
    </label>
  );
}

function DldRow({ label, required, children }) {
  return (
    <div className="forma-dld-row">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <div>{children}</div>
    </div>
  );
}

function DateInput({ value, onChange }) {
  return (
    <input
      type="date"
      value={isoFormADate(value)}
      onChange={(e) => onChange(e.target.value ? formatFormADate(e.target.value) : "")}
    />
  );
}

function YesNo({ name, value, onChange }) {
  return (
    <div className="forma-yn" role="radiogroup" aria-label={name}>
      {["yes", "no"].map((item) => (
        <label key={item} className={`forma-yn-btn ${item}${value === item ? " on" : ""}`}>
          <input type="radio" name={name} checked={value === item} onChange={() => onChange(item)} />
          {item === "yes" ? "Yes" : "No"}
        </label>
      ))}
    </div>
  );
}

export function FormAForm({ listings }) {
  const [step, setStep] = usePersistedState("formA.step", 0);
  const [form, setForm] = usePersistedState("formA.form", emptyFormA);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listingQ, setListingQ] = usePersistedState("formA.listingQ", "");
  const [listingHits, setListingHits] = useState([]);

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function loadSaved() {
    const body = await api("/api/form-a/list");
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
    const body = await api(`/api/form-a/from-listing/${encodeURIComponent(id)}`);
    if (!body.ok || !body.data) {
      setStatus({ type: "err", text: body.error || "Could not load this listing." });
      return;
    }
    set({
      ...body.data,
      listingId: body.data.listingId || id,
      ownerKind: form.ownerKind,
      acceptedTerms: "",
      submittedAt: "",
      id: form.id,
    });
    setStatus({ type: "ok", text: "Listing fields filled. Complete every Dubai Brokers step, then submit." });
  }

  function go(next) {
    if (next < 0 || next > STEPS.length - 1) return;
    setStatus({ type: "", text: "" });
    setStep(next);
  }

  function failMissing(miss, submitting) {
    setStatus({ type: "err", text: miss });
    if (submitting && miss.includes("terms")) setStep(8);
    else {
      for (let index = 0; index <= 6; index += 1) {
        if (stepMissing(index, form)) {
          setStep(index);
          break;
        }
      }
    }
  }

  async function persist({ submitting = false, requireComplete = false } = {}) {
    if (submitting || requireComplete) {
      const miss = missingDetails(form, { submitting });
      if (miss) {
        failMissing(miss, submitting);
        return null;
      }
    }
    const payload = {
      ...form,
      acceptedTerms: submitting ? "1" : form.acceptedTerms,
      submittedAt: submitting ? new Date().toISOString() : form.submittedAt,
    };
    const body = await api("/api/form-a/save", { ...payload, submitting });
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not save Form A." });
      return null;
    }
    set({ ...body.item.data, id: body.item.id });
    await loadSaved();
    return body.item;
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const item = await persist({ submitting: false });
      if (item) setStatus({ type: "ok", text: "Draft saved. You can keep editing." });
    } finally {
      setBusy(false);
    }
  }

  async function submitContract() {
    if (form.acceptedTerms !== "1") {
      setStatus({ type: "err", text: "Accept the terms and conditions to submit the contract." });
      return;
    }
    setBusy(true);
    try {
      const item = await persist({ submitting: true });
      if (item) setStatus({ type: "ok", text: "Submitted for approval. Download the PDF copy." });
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      const item = await persist({ submitting: false });
      if (!item?.download) return;
      await downloadFile(item.download, item.pdfName || "Form-A.pdf");
      setStatus({ type: "ok", text: `Downloading ${item.pdfName || "the PDF"}.` });
    } catch (err) {
      setStatus({ type: "err", text: err instanceof Error ? err.message : "Could not download the PDF." });
    } finally {
      setBusy(false);
    }
  }

  async function saveAndContinue() {
    setBusy(true);
    try {
      const item = await persist({ submitting: false });
      if (item) go(Math.min(step + 1, STEPS.length - 1));
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(item) {
    const body = await api(`/api/form-a/${encodeURIComponent(item.id)}`);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not open this Form A." });
      return;
    }
    set({ ...emptyFormA(), ...body.item.data, id: body.item.id });
    setStep(8);
    setStatus({ type: "ok", text: "Opened saved Form A." });
  }

  async function removeSaved(item) {
    if (!window.confirm("Delete this Form A?")) return;
    const res = await fetch(`/api/form-a/${encodeURIComponent(item.id)}`, { method: "DELETE", credentials: "same-origin" });
    const body = await res.json().catch(() => ({ ok: false }));
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not delete." });
      return;
    }
    if (form.id === item.id) {
      setForm(emptyFormA());
      setStep(0);
    }
    await loadSaved();
  }

  function resetForm() {
    setForm(emptyFormA());
    setListingQ("");
    setStep(0);
    setStatus({ type: "", text: "" });
  }

  const listingBlock = (
    <section>
      <h2>Listing</h2>
      <p className="tc-hint">Pick a desk listing to fill certificate, property, owner, and price.</p>
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
  );

  return (
    <div className="tc-wrap bf-wrap forma-wrap">
      <nav className="forma-stepper" aria-label="Create Contract A steps">
        {STEPS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`${step === index ? "is-on" : ""}${index < step ? " is-done" : ""}`}
            onClick={() => go(index)}
          >
            <span>{index + 1}</span>
            <b>{item.label}</b>
          </button>
        ))}
      </nav>

      {status.text ? <div className={`tc-status ${status.type}`}>{status.text}</div> : null}

      {step < 8 ? (
        <form className="tc-form forma-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          {step === 0 ? (
            <>
              {listingBlock}
              <section>
                <h2>Please select the ownership type</h2>
                <div className="forma-kinds">
                  <button
                    type="button"
                    className={`forma-kind${form.ownerKind === "company" ? " on" : ""}`}
                    onClick={() => set({ ownerKind: "company" })}
                  >
                    <i aria-hidden="true">🏢</i>
                    Owner Company
                  </button>
                  <button
                    type="button"
                    className={`forma-kind${form.ownerKind === "person" ? " on" : ""}`}
                    onClick={() => set({ ownerKind: "person" })}
                  >
                    <i aria-hidden="true">👤</i>
                    Owner Person
                  </button>
                </div>
              </section>
            </>
          ) : null}

          {step === 1 ? (
            <section>
              <h2>Certificate Details</h2>
              <p className="tc-hint">All fields marked with asterisk (*) are mandatory</p>
              <div className="forma-dld-list">
                <DldRow label="Certificate Number" required>
                  <input value={f("certificateNumber")} onChange={(e) => set({ certificateNumber: e.target.value })} />
                </DldRow>
                <DldRow label="Certificate Year" required>
                  <select value={f("certificateYear")} onChange={(e) => set({ certificateYear: e.target.value })}>
                    <option value="">Please select</option>
                    {f("certificateYear") && !certificateYears().includes(f("certificateYear")) ? (
                      <option value={f("certificateYear")}>{f("certificateYear")}</option>
                    ) : null}
                    {certificateYears().map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </DldRow>
                <DldRow label="Property Type" required>
                  <select value={f("propertyType")} onChange={(e) => set({ propertyType: e.target.value })}>
                    <option value="">Please select</option>
                    {f("propertyType") && !PROPERTY_TYPES.includes(f("propertyType")) ? (
                      <option value={f("propertyType")}>{f("propertyType")}</option>
                    ) : null}
                    {PROPERTY_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </DldRow>
                <DldRow label="Owner Verification Type" required>
                  <select
                    value={f("ownerVerification")}
                    onChange={(e) => set({ ownerVerification: e.target.value, ownerVerificationValue: "" })}
                  >
                    <option value="">Please select</option>
                    {VERIFICATION_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </DldRow>
                {IDENTITY_VERIFICATION_TYPES.includes(f("ownerVerification")) ? (
                  <DldRow label={f("ownerVerification")} required>
                    {f("ownerVerification") === "Date of Birth" ? (
                      <input
                        type="date"
                        value={f("ownerVerificationValue")}
                        onChange={(e) => set({ ownerVerificationValue: e.target.value })}
                      />
                    ) : (
                      <input
                        value={f("ownerVerificationValue")}
                        placeholder={
                          f("ownerVerification") === "Emirates ID Number" ? "784-XXXX-XXXXXXX-X" : "Passport number"
                        }
                        onChange={(e) => set({ ownerVerificationValue: e.target.value })}
                      />
                    )}
                  </DldRow>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h2>Property Information</h2>
              <p className="forma-banner">
                Property is registered under Taskeen. Owner MUST cancel his/her visa issued on this property before
                visiting Registration Trustee office to complete the transaction.
              </p>
              <div className="tc-grid">
                <Field label="Certificate Number">
                  <input value={f("certificateNumber")} readOnly />
                </Field>
                <Field label="Is Freehold">
                  <YesNo name="isFreehold" value={f("isFreehold")} onChange={(isFreehold) => set({ isFreehold })} />
                </Field>
                <Field label="Property Type">
                  <input value={f("propertyType")} readOnly />
                </Field>
                <Field label="Size (Sq.M)" required>
                  <input value={f("sizeSqm")} onChange={(e) => set({ sizeSqm: e.target.value, sellingArea: e.target.value || form.sellingArea })} />
                </Field>
                <Field label="Project Name">
                  <input value={f("projectName")} onChange={(e) => set({ projectName: e.target.value })} />
                </Field>
                <Field label="Plot Number">
                  <input value={f("plotNumber")} onChange={(e) => set({ plotNumber: e.target.value })} />
                </Field>
                <Field label="Location" required className="bf-wide">
                  <input value={f("location")} onChange={(e) => set({ location: e.target.value })} />
                </Field>
                <Field label="Usage" required>
                  <select value={f("usage")} onChange={(e) => set({ usage: e.target.value })}>
                    {USAGE_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="No. of Bedrooms">
                  <input value={f("beds")} onChange={(e) => set({ beds: e.target.value })} />
                </Field>
                <Field label="No. of Bathrooms">
                  <input value={f("baths")} onChange={(e) => set({ baths: e.target.value })} />
                </Field>
                <Field label="No. of Kitchens">
                  <input value={f("kitchens")} onChange={(e) => set({ kitchens: e.target.value })} />
                </Field>
                <Field label="No. of Units">
                  <input value={f("units")} onChange={(e) => set({ units: e.target.value })} />
                </Field>
                <Field label="No. of Car Parks">
                  <input value={f("carParks")} onChange={(e) => set({ carParks: e.target.value })} />
                </Field>
                <Field label="Floor No.">
                  <input value={f("floorNo")} onChange={(e) => set({ floorNo: e.target.value })} />
                </Field>
                <Field label="No. of Floors">
                  <input value={f("floors")} onChange={(e) => set({ floors: e.target.value })} />
                </Field>
                <Field label="No. of Shops">
                  <input value={f("shops")} onChange={(e) => set({ shops: e.target.value })} />
                </Field>
                <Field label="Facilities" className="bf-wide">
                  <input value={f("facilities")} onChange={(e) => set({ facilities: e.target.value })} />
                </Field>
                <Field label="Additional information" className="bf-wide">
                  <input value={f("additionalInfo")} onChange={(e) => set({ additionalInfo: e.target.value })} />
                </Field>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section>
              <h2>Owner Information</h2>
              <p className="forma-banner warn">
                The service of updating property owners&apos; data by brokers when creating a marketing contract (A) has
                been suspended. The property owner or their authorized representative must update their data.
              </p>
              <Field label="Is your source of lead through Green List?" required>
                <YesNo name="greenList" value={f("greenList")} onChange={(greenList) => set({ greenList })} />
              </Field>
              <h3>{form.ownerKind === "company" ? "Owner company" : "Owner 1"}</h3>
              <div className="tc-grid">
                {form.ownerKind === "company" ? (
                  <>
                    <Field label="Company name (English)" required className="bf-wide">
                      <CrmTypeahead
                        entities={["company"]}
                        placeholder="Type company name…"
                        value={f("companyNameEn")}
                        onChange={(companyNameEn) => set({ companyNameEn })}
                        onPick={async (item) => {
                          if (!item) return;
                          set({ companyNameEn: item.title });
                          const info = await lookupCrmItem(item).catch(() => null);
                          if (!info) return;
                          set({
                            companyNameEn: info.name || item.title,
                            ownerEmail: info.email || form.ownerEmail,
                            ownerMobile: info.phone || form.ownerMobile,
                          });
                        }}
                      />
                    </Field>
                    <Field label="Company name (Arabic)" className="bf-wide">
                      <input dir="rtl" value={f("companyNameAr")} onChange={(e) => set({ companyNameAr: e.target.value })} />
                    </Field>
                    <Field label="Trade license">
                      <input value={f("companyLicense")} onChange={(e) => set({ companyLicense: e.target.value })} />
                    </Field>
                    <Field label="Authorized person">
                      <input value={f("authorizedPerson")} onChange={(e) => set({ authorizedPerson: e.target.value })} />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Name (English)" required>
                      <CrmTypeahead
                        entities={["contact"]}
                        placeholder="Type owner name…"
                        addNewLabel="+ Add new owner to Bitrix"
                        addName={f("ownerNameEn")}
                        addEmail={f("ownerEmail")}
                        addPhone={f("ownerMobile")}
                        value={f("ownerNameEn")}
                        onChange={(ownerNameEn) => set({ ownerNameEn })}
                        onPick={async (item) => {
                          if (!item) return;
                          set({ ownerNameEn: item.title });
                          const info = await lookupCrmItem(item).catch(() => null);
                          if (!info) return;
                          set({
                            ownerNameEn: info.name || item.title,
                            ownerEmail: info.email || form.ownerEmail,
                            ownerMobile: info.phone || form.ownerMobile,
                          });
                        }}
                      />
                    </Field>
                    <Field label="Name (Arabic)">
                      <input dir="rtl" value={f("ownerNameAr")} onChange={(e) => set({ ownerNameAr: e.target.value })} />
                    </Field>
                    <Field label="Nationality">
                      <input value={f("ownerNationality")} onChange={(e) => set({ ownerNationality: e.target.value })} />
                    </Field>
                    <Field label="Passport Number">
                      <input value={f("ownerPassport")} onChange={(e) => set({ ownerPassport: e.target.value })} />
                    </Field>
                  </>
                )}
                <Field label="Mobile Number">
                  <input value={f("ownerMobile")} onChange={(e) => set({ ownerMobile: e.target.value })} />
                </Field>
                <Field label="Email">
                  <input type="email" value={f("ownerEmail")} onChange={(e) => set({ ownerEmail: e.target.value })} />
                </Field>
                <Field label="Selling Area (Sq.M)">
                  <input value={f("sellingArea")} onChange={(e) => set({ sellingArea: e.target.value })} />
                </Field>
                <Field label="Percentage of Sell / Owning Share">
                  <input value={f("owningShare")} onChange={(e) => set({ owningShare: e.target.value })} />
                </Field>
              </div>
              <fieldset className="forma-rep">
                <legend>Who will represent at the time of registration? *</legend>
                <label>
                  <input type="radio" name="representAs" checked={f("representAs") === "owner"} onChange={() => set({ representAs: "owner" })} />
                  Owner
                </label>
                <label>
                  <input
                    type="radio"
                    name="representAs"
                    checked={f("representAs") === "representative"}
                    onChange={() => set({ representAs: "representative" })}
                  />
                  Representative
                </label>
              </fieldset>
              <label className="forma-check">
                <input type="checkbox" checked={f("poaConfirm") === "1"} onChange={(e) => set({ poaConfirm: e.target.checked ? "1" : "" })} />
                I confirm that I am acting only as a real estate broker and not as a Power of Attorney holder or a
                representative of the property owner or buyer while completing this contract at the Registration Trustee
                office.
              </label>
            </section>
          ) : null}

          {step === 4 ? (
            <section>
              <h2>Tenancy Information</h2>
              <label className="forma-check">
                <input type="checkbox" checked={f("noTenancy") === "1"} onChange={(e) => set({ noTenancy: e.target.checked ? "1" : "" })} />
                I confirm that no tenancy contract is attached to this property
              </label>
              {f("noTenancy") !== "1" ? (
                <div className="tc-grid">
                  <Field label="Tenant name">
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
                  </Field>
                  <Field label="Tenancy start">
                    <DateInput value={f("tenancyStart")} onChange={(tenancyStart) => set({ tenancyStart })} />
                  </Field>
                  <Field label="Tenancy end">
                    <DateInput value={f("tenancyEnd")} onChange={(tenancyEnd) => set({ tenancyEnd })} />
                  </Field>
                  <Field label="Annual rent (AED)">
                    <input value={f("tenancyRent")} onChange={(e) => set({ tenancyRent: e.target.value })} />
                  </Field>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 5 ? (
            <section>
              <h2>Property Financial Information</h2>
              <div className="tc-grid">
                <Field label="Sell Price" required>
                  <input value={f("sellPrice")} onChange={(e) => set({ sellPrice: e.target.value })} />
                  <small className="forma-suffix">AED</small>
                </Field>
                <Field label="Outstanding service charge amount">
                  <input value={f("serviceCharge")} onChange={(e) => set({ serviceCharge: e.target.value })} />
                  <small className="forma-suffix">AED</small>
                </Field>
              </div>
            </section>
          ) : null}

          {step === 6 ? (
            <section>
              <h2>Commission and Duration</h2>
              <div className="tc-grid">
                <Field label="Contract Start Date" required>
                  <DateInput value={f("contractStart")} onChange={(contractStart) => set({ contractStart })} />
                </Field>
                <Field label="Contract End Date" required>
                  <DateInput value={f("contractEnd")} onChange={(contractEnd) => set({ contractEnd })} />
                </Field>
                <Field label="Commission will be Paid" required>
                  <YesNo name="commissionPaid" value={f("commissionPaid")} onChange={(commissionPaid) => set({ commissionPaid })} />
                </Field>
                <Field label="NOC from Developer" required>
                  <YesNo name="nocDeveloper" value={f("nocDeveloper")} onChange={(nocDeveloper) => set({ nocDeveloper })} />
                </Field>
                {f("commissionPaid") === "yes" ? (
                  <Field label="Commission %">
                    <input value={f("commissionPercent")} onChange={(e) => set({ commissionPercent: e.target.value })} />
                  </Field>
                ) : null}
                <Field label="Is Seller covering marketing fees" required>
                  <YesNo name="sellerMarketingFees" value={f("sellerMarketingFees")} onChange={(sellerMarketingFees) => set({ sellerMarketingFees })} />
                </Field>
                <Field label="Is Exclusive" required>
                  <YesNo name="isExclusive" value={f("isExclusive")} onChange={(isExclusive) => set({ isExclusive })} />
                </Field>
              </div>
            </section>
          ) : null}

          {step === 7 ? (
            <section>
              <h2>Documents and Notes</h2>
              <Field label="Notes" className="bf-wide">
                <textarea rows={6} value={f("notes")} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </section>
          ) : null}

          <div className="tc-actions">
            <button type="button" className="ui-btn ui-btn-light" onClick={resetForm}>
              New form
            </button>
            {step > 0 ? (
              <button type="button" className="ui-btn ui-btn-light" onClick={() => go(step - 1)}>
                Previous
              </button>
            ) : null}
            <button type="button" className="ui-btn ui-btn-light" disabled={busy} onClick={saveDraft}>
              {busy ? "Saving…" : "Save draft"}
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={saveAndContinue}>
              {busy ? "Saving…" : "Save & Continue"}
            </button>
          </div>
        </form>
      ) : (
        <div className="bf-preview">
          <label className="forma-check forma-accept">
            <input type="checkbox" checked={f("acceptedTerms") === "1"} onChange={(e) => set({ acceptedTerms: e.target.checked ? "1" : "" })} />
            I accept the above terms and conditions
          </label>
          <div className="tc-actions">
            <button type="button" className="ui-btn ui-btn-light" onClick={() => go(7)}>
              Previous
            </button>
            <button type="button" className="ui-btn ui-btn-light" onClick={resetForm}>
              Cancel
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={submitContract}>
              {busy ? "Submitting…" : "Submit Contract for Approval"}
            </button>
            <button type="button" className="ui-btn ui-btn-success" disabled={busy} onClick={downloadPdf}>
              {busy ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
          <div className="deed-desk">
            <FormASheet data={form} />
          </div>
        </div>
      )}

      <section className="bf-saved">
        <h2>Saved Form A contracts</h2>
        {!saved.length ? <p className="tc-hint">None yet. Complete the steps and submit or save a draft.</p> : null}
        <ul>
          {saved.map((item) => (
            <li key={item.id}>
              <button type="button" className="bf-saved-open" onClick={() => openSaved(item)}>
                <b>{item.title}</b>
                <span>
                  {item.submitted ? "Submitted" : "Draft"} · {item.ownerName || ownerDisplayName(item.data) || "No owner"} ·{" "}
                  {item.listingRef || "No listing"} · {when(item.updatedAt)}
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
