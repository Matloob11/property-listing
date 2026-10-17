import { useEffect, useState } from "react";

async function api(path, options) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const STATUS_LABEL = {
  draft: "Draft",
  sent: "Sent for signature",
  partially_signed: "Partially signed",
  signed: "Signed",
  cancelled: "Cancelled",
};

function when(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  }
}

function Field({ label, children, wide }) {
  return (
    <label className={`dialog-field${wide ? " wide" : ""}`}>
      {label}
      {children}
    </label>
  );
}

export function ContractPanel({ listing, user, onClose, onChanged }) {
  const [contracts, setContracts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isSale = (form?.kind || current?.kind) === "sale";

  function flash(message, ms = 2400) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), ms);
  }

  async function load(selectId) {
    const body = await api(`/api/listings/${listing.id}/contracts`);
    setContracts(body.contracts || []);
    if (selectId) {
      const next = (body.contracts || []).find((item) => item.id === selectId) || null;
      setCurrent(next);
      setForm(next ? JSON.parse(JSON.stringify(next.data)) : null);
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  async function run(label, request) {
    setBusy(true);
    setError("");
    try {
      const body = await request();
      if (label) flash(label);
      return body;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createContract(kind) {
    const body = await run("Draft created", () =>
      api(`/api/listings/${listing.id}/contracts`, { method: "POST", body: JSON.stringify({ kind }) })
    );
    if (body?.contract) {
      await load(body.contract.id);
      onChanged?.();
    }
  }

  function patch(section, key, value) {
    setForm({ ...form, [section]: { ...(form[section] || {}), [key]: value } });
  }

  async function saveDraft() {
    if (!current) return null;
    const body = await run("Saved", () =>
      api(`/api/contracts/${current.id}`, { method: "PATCH", body: JSON.stringify({ data: form }) })
    );
    if (body?.contract) await load(body.contract.id);
    return body?.contract || null;
  }

  async function sendForSignature() {
    if (!current) return;
    if (!form.party?.name || !form.owner?.name) {
      setError(`Enter the ${isSale ? "buyer" : "tenant"} and the ${isSale ? "seller" : "landlord"} names first.`);
      return;
    }
    const saved = current.signers.some((s) => s.signed_at) ? current : await saveDraft();
    if (!saved) return;
    const body = await run("", () => api(`/api/contracts/${saved.id}/send`, { method: "POST" }));
    if (body?.contract) {
      const mailed = body.emailed?.length || 0;
      const failed = body.email_errors?.length || 0;
      if (mailed) {
        flash(`Signing links ready. PDF emailed to ${mailed} recipient${mailed === 1 ? "" : "s"}.`, 5000);
      } else if (!body.smtp) {
        flash("Signing links are ready. SMTP is not configured, so the PDF was not emailed — use WhatsApp or Email.", 5000);
      } else if (failed) {
        flash(`Signing links are ready. PDF email failed: ${body.email_errors[0]?.error || "unknown error"}`, 5000);
      } else {
        flash("Signing links are ready. No signer email on file, so the PDF was not emailed.", 5000);
      }
      await load(body.contract.id);
      onChanged?.();
    }
  }

  async function cancelContract() {
    if (!current || !window.confirm("Cancel this contract? The signing links will stop working.")) return;
    const body = await run("Contract cancelled", () =>
      api(`/api/contracts/${current.id}/cancel`, { method: "POST", body: JSON.stringify({}) })
    );
    if (body?.contract) {
      await load(body.contract.id);
      onChanged?.();
    }
  }

  async function deleteContract() {
    if (!current || !window.confirm("Delete this contract permanently?")) return;
    const ok = await run("Contract deleted", () => api(`/api/contracts/${current.id}`, { method: "DELETE" }));
    if (ok) {
      setCurrent(null);
      setForm(null);
      await load();
      onChanged?.();
    }
  }

  const locked = current ? current.signers.some((s) => s.signed_at) || current.status === "cancelled" : false;

  return (
    <div className="overlay" role="dialog" aria-label="Contracts" onClick={onClose}>
      <div className="viewer dialog wide contract-panel" onClick={(event) => event.stopPropagation()}>
        <div className="viewer-top">
          <div>
            <small>{listing.reference}</small>
            <h2>Contracts & e-signature</h2>
            <p>{listing.title}</p>
          </div>
          <button className="btn ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {notice ? <div className="toast inline">{notice}</div> : null}
        {error ? <p className="err">{error}</p> : null}

        <div className="contract-actions">
          <button className="btn primary" type="button" disabled={busy} onClick={() => createContract("tenancy")}>
            + New Tenancy Contract
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => createContract("sale")}>
            + New Sale Agreement
          </button>
        </div>

        {contracts.length ? (
          <ul className="contract-list">
            {contracts.map((item) => (
              <li key={item.id} className={current?.id === item.id ? "on" : ""}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrent(item);
                    setForm(JSON.parse(JSON.stringify(item.data)));
                    setError("");
                  }}
                >
                  <b>{item.kind === "sale" ? "Sale Agreement" : "Tenancy Contract"}</b>
                  <span className={`status-pill ${item.status}`}>{STATUS_LABEL[item.status] || item.status}</span>
                  <small>
                    {item.data.party?.name || "(no name yet)"} · {when(item.created_at)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No contract yet for this listing. Create one above; the property details are filled from the listing.</p>
        )}

        {current && form ? (
          <div className="contract-editor">
            <h3>
              {isSale ? "Sale Agreement" : "Tenancy Contract"} · {STATUS_LABEL[current.status] || current.status}
            </h3>

            <div className="contract-cols">
              <fieldset disabled={locked}>
                <legend>{isSale ? "Buyer" : "Tenant"}</legend>
                <Field label="Full name">
                  <input value={form.party?.name || ""} onChange={(e) => patch("party", "name", e.target.value)} />
                </Field>
                <Field label="WhatsApp number">
                  <input value={form.party?.phone || ""} onChange={(e) => patch("party", "phone", e.target.value)} placeholder="+9715..." />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.party?.email || ""} onChange={(e) => patch("party", "email", e.target.value)} />
                </Field>
                <Field label="Emirates ID / Passport no.">
                  <input value={form.party?.id_number || ""} onChange={(e) => patch("party", "id_number", e.target.value)} />
                </Field>
                <Field label="Nationality">
                  <input value={form.party?.nationality || ""} onChange={(e) => patch("party", "nationality", e.target.value)} />
                </Field>
              </fieldset>
              <fieldset disabled={locked}>
                <legend>{isSale ? "Seller" : "Landlord / Owner"}</legend>
                <Field label="Full name">
                  <input value={form.owner?.name || ""} onChange={(e) => patch("owner", "name", e.target.value)} />
                </Field>
                <Field label="WhatsApp number">
                  <input value={form.owner?.phone || ""} onChange={(e) => patch("owner", "phone", e.target.value)} placeholder="+9715..." />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.owner?.email || ""} onChange={(e) => patch("owner", "email", e.target.value)} />
                </Field>
                <Field label="Emirates ID / Passport no.">
                  <input value={form.owner?.id_number || ""} onChange={(e) => patch("owner", "id_number", e.target.value)} />
                </Field>
              </fieldset>
            </div>

            <fieldset disabled={locked}>
              <legend>Property</legend>
              <div className="contract-grid">
                <Field label="Usage">
                  <select value={form.property?.usage || ""} onChange={(e) => patch("property", "usage", e.target.value)}>
                    <option value="">Select</option>
                    <option>Residential</option>
                    <option>Commercial</option>
                    <option>Industrial</option>
                  </select>
                </Field>
                <Field label="Location">
                  <input value={form.property?.location || ""} onChange={(e) => patch("property", "location", e.target.value)} />
                </Field>
                <Field label="Building / project">
                  <input value={form.property?.building || ""} onChange={(e) => patch("property", "building", e.target.value)} />
                </Field>
                <Field label="Unit / property no.">
                  <input value={form.property?.unit || ""} onChange={(e) => patch("property", "unit", e.target.value)} />
                </Field>
                <Field label="Property type">
                  <input value={form.property?.type || ""} onChange={(e) => patch("property", "type", e.target.value)} />
                </Field>
                <Field label="Size (sq.ft)">
                  <input value={form.property?.size || ""} onChange={(e) => patch("property", "size", e.target.value)} />
                </Field>
                <Field label="Plot no.">
                  <input value={form.property?.plot || ""} onChange={(e) => patch("property", "plot", e.target.value)} />
                </Field>
                <Field label="DEWA premises no.">
                  <input value={form.property?.dewa || ""} onChange={(e) => patch("property", "dewa", e.target.value)} />
                </Field>
                <Field label="Title deed no.">
                  <input value={form.property?.title_deed || ""} onChange={(e) => patch("property", "title_deed", e.target.value)} />
                </Field>
                <Field label="Permit no.">
                  <input value={form.property?.permit || ""} onChange={(e) => patch("property", "permit", e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <fieldset disabled={locked}>
              <legend>{isSale ? "Price and payment" : "Term and rent"}</legend>
              <div className="contract-grid">
                <Field label="Contract date">
                  <input type="date" value={form.terms?.contract_date || ""} onChange={(e) => patch("terms", "contract_date", e.target.value)} />
                </Field>
                {isSale ? (
                  <>
                    <Field label="Sale price (AED)">
                      <input value={form.terms?.sale_price || ""} onChange={(e) => patch("terms", "sale_price", e.target.value)} />
                    </Field>
                    <Field label="Deposit on signing (AED)">
                      <input value={form.terms?.deposit || ""} onChange={(e) => patch("terms", "deposit", e.target.value)} />
                    </Field>
                    <Field label="Payment">
                      <input value={form.terms?.payment_mode || ""} onChange={(e) => patch("terms", "payment_mode", e.target.value)} />
                    </Field>
                    <Field label="Completion / transfer date">
                      <input type="date" value={form.terms?.completion_date || ""} onChange={(e) => patch("terms", "completion_date", e.target.value)} />
                    </Field>
                    <Field label="Agency commission">
                      <input value={form.terms?.commission || ""} onChange={(e) => patch("terms", "commission", e.target.value)} />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="From">
                      <input type="date" value={form.terms?.date_from || ""} onChange={(e) => patch("terms", "date_from", e.target.value)} />
                    </Field>
                    <Field label="To">
                      <input type="date" value={form.terms?.date_to || ""} onChange={(e) => patch("terms", "date_to", e.target.value)} />
                    </Field>
                    <Field label="Annual rent (AED)">
                      <input value={form.terms?.annual_rent || ""} onChange={(e) => patch("terms", "annual_rent", e.target.value)} />
                    </Field>
                    <Field label="Contract value (AED)">
                      <input value={form.terms?.contract_value || ""} onChange={(e) => patch("terms", "contract_value", e.target.value)} />
                    </Field>
                    <Field label="Security deposit (AED)">
                      <input value={form.terms?.deposit || ""} onChange={(e) => patch("terms", "deposit", e.target.value)} />
                    </Field>
                    <Field label="Payment">
                      <select value={form.terms?.payment_mode || ""} onChange={(e) => patch("terms", "payment_mode", e.target.value)}>
                        <option value="">Select</option>
                        {["Cheques", "Cash", "Bank Transfer", "Installments", "Cash,Installments", "Cheque"].map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                        {form.terms?.payment_mode && !["Cheques", "Cash", "Bank Transfer", "Installments", "Cash,Installments", "Cheque"].includes(form.terms.payment_mode) ? (
                          <option value={form.terms.payment_mode}>{form.terms.payment_mode}</option>
                        ) : null}
                      </select>
                    </Field>
                    <Field label="Number of cheques">
                      <input value={form.terms?.cheques || ""} onChange={(e) => patch("terms", "cheques", e.target.value)} />
                    </Field>
                  </>
                )}
                <Field label="Additional terms" wide>
                  <textarea rows={3} value={form.terms?.notes || ""} onChange={(e) => patch("terms", "notes", e.target.value)} />
                </Field>
              </div>
            </fieldset>

            <div className="wizard-actions">
              {!locked ? (
                <button className="btn" type="button" disabled={busy} onClick={saveDraft}>
                  Save draft
                </button>
              ) : null}
              <a className="btn" href={`/api/contracts/${current.id}/pdf`} target="_blank" rel="noreferrer">
                {current.status === "signed" ? "Open signed PDF" : "Preview PDF"}
              </a>
              {current.status !== "cancelled" && current.status !== "signed" ? (
                <button className="btn primary" type="button" disabled={busy} onClick={sendForSignature}>
                  {current.status === "draft" ? "Send for signature" : "Refresh signing links"}
                </button>
              ) : null}
              {current.status !== "cancelled" && current.status !== "signed" ? (
                <button className="btn ghost" type="button" disabled={busy} onClick={cancelContract}>
                  Cancel contract
                </button>
              ) : null}
              {user?.admin ? (
                <button className="btn ghost danger-text" type="button" disabled={busy} onClick={deleteContract}>
                  Delete
                </button>
              ) : null}
            </div>

            {current.links?.some((link) => link.url) ? (
              <div className="contract-links">
                <h4>Signing links</h4>
                <p className="muted">
                  If a signer has an email, the desk also sends the PDF plus their private signing link. WhatsApp still opens the chat
                  with the message ready. The link works on any phone, no login needed.
                </p>
                {current.links.map((link) => (
                  <div className="contract-link" key={link.role}>
                    <div>
                      <b>
                        {link.label}: {link.name}
                      </b>
                      <small>
                        {link.signed_at
                          ? `Signed ${when(link.signed_at)}`
                          : link.viewed_at
                            ? `Opened ${when(link.viewed_at)}, not signed yet`
                            : `Sent ${when(link.sent_at)}, not opened yet`}
                        {link.expires_at && !link.signed_at ? ` · link valid until ${when(link.expires_at)}` : ""}
                      </small>
                    </div>
                    {!link.signed_at ? (
                      <div className="contract-link-actions">
                        {link.whatsapp ? (
                          <a className="btn" href={link.whatsapp} target="_blank" rel="noreferrer">
                            WhatsApp
                          </a>
                        ) : null}
                        {link.mailto ? (
                          <a className="btn" href={link.mailto}>
                            Email
                          </a>
                        ) : null}
                        <button
                          className="btn"
                          type="button"
                          onClick={async () => flash((await copyText(link.url)) ? "Link copied" : "Could not copy")}
                        >
                          Copy link
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {current.history?.length ? (
              <details className="contract-history">
                <summary>Activity ({current.history.length})</summary>
                <ul>
                  {[...current.history].reverse().map((item, index) => (
                    <li key={index}>
                      <span>{when(item.at)}</span> <b>{item.event}</b> {item.detail} <em>by {item.by}</em>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
