import { useEffect, useMemo, useState } from "react";
import { BookingReceiptSheet, bookingLogoSrc, bookingStampSrc } from "./BookingReceiptSheet.jsx";
import { downloadFile } from "./downloadFile.js";
import { usePersistedState } from "./uiPersist.js";
import {
  BOOKING_OFFICE_OPTIONS,
  PURPOSE_OPTIONS,
  THROUGH_OPTIONS,
  aedInWords,
  applyOffice,
  emptyBookingForm,
  formFromListing,
  formatVoucherDate,
  isoVoucherDate,
  joinPropertyLine,
  missingDetails,
  normalizeForm,
} from "../../server/bookingFormModel.js";

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

const EMPTY = emptyBookingForm();

export function BookingReceiptForm({ listings }) {
  const [step, setStep] = usePersistedState("bookingForm.step", 1);
  const [form, setForm] = usePersistedState("bookingForm.form", EMPTY);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listingQ, setListingQ] = usePersistedState("bookingForm.listingQ", "");
  const [listingHits, setListingHits] = useState([]);
  const [listingPool, setListingPool] = useState([]);
  const [listingOpen, setListingOpen] = useState(false);
  const [listingBusy, setListingBusy] = useState(false);
  const [manualListing, setManualListing] = useState(false);

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function loadSaved() {
    const body = await api("/api/booking-form/list");
    if (body.ok) setSaved(body.items || []);
  }

  useEffect(() => {
    loadSaved();
  }, []);

  useEffect(() => {
    if (!listingOpen) return undefined;
    const close = (event) => {
      if (!event.target.closest(".bfr-listing-search")) setListingOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [listingOpen]);

  useEffect(() => {
    if (form.voucherNo) return undefined;
    let cancelled = false;
    api("/api/booking-form/next-no").then((body) => {
      if (!cancelled && body.ok && body.voucherNo) {
        setForm((current) => (current.voucherNo ? current : { ...current, voucherNo: body.voucherNo }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [form.voucherNo]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/listings?pageSize=100&status=all", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setListingPool(body.listings || []);
      })
      .catch(() => {
        if (!cancelled) setListingPool([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = listingQ.trim();
    if (q.length < 1) {
      setListingHits([]);
      setListingBusy(false);
      return undefined;
    }
    setListingBusy(true);
    const timer = setTimeout(async () => {
      const body = await fetch(`/api/listings?q=${encodeURIComponent(q)}&pageSize=50&status=all`, { credentials: "same-origin" })
        .then((r) => r.json())
        .catch(() => ({}));
      setListingHits(body.listings || []);
      setListingBusy(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [listingQ]);

  const deskOptions = useMemo(() => {
    const q = listingQ.trim().toLowerCase();
    const rows = [...(listingPool || []), ...(listings || [])].filter((row, i, all) => all.findIndex((item) => item.id === row.id) === i);
    if (!q) return rows.slice(0, 80);
    return rows
      .filter((row) =>
        `${row.reference} ${row.title} ${row.community} ${row.sub_community} ${row.building} ${row.unit_no}`.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [listings, listingPool, listingQ]);

  const searchRows = listingQ.trim() ? (listingHits.length ? listingHits : deskOptions) : deskOptions;

  function listingLabel(row) {
    return [row.reference, row.unit_no, row.building || row.project_name, row.community, row.title].filter(Boolean).join(" · ");
  }

  function applyListingRow(id, extra = {}) {
    const local = searchRows.find((row) => String(row.id) === String(id)) || listingPool.find((row) => String(row.id) === String(id));
    const filled = extra.listingId || extra.propertyLine ? extra : local ? formFromListing(local) : null;
    if (!filled) {
      setStatus({ type: "err", text: "Could not load this listing. Use Add manually." });
      return;
    }
    setManualListing(false);
    setListingOpen(false);
    setListingQ(filled.listingRef || listingQ);
    setForm((current) => ({
      ...current,
      listingId: filled.listingId || id,
      listingRef: filled.listingRef || current.listingRef,
      unitNo: filled.unitNo || "",
      buildingName: filled.buildingName || "",
      community: filled.community || "",
      propertyLine: filled.propertyLine || current.propertyLine,
      rent: filled.rent || current.rent,
      date: current.date || filled.date,
    }));
    setStatus({ type: "ok", text: "Listing filled. You can still edit unit, rent, or add more details." });
  }

  async function pickListing(id) {
    if (!id) {
      set({ listingId: "", listingRef: "" });
      return;
    }
    const body = await api(`/api/booking-form/from-listing/${encodeURIComponent(id)}`);
    if (body.ok && body.data) {
      applyListingRow(id, body.data);
      return;
    }
    applyListingRow(id);
  }

  function setManualField(patch) {
    setForm((current) => {
      const next = { ...current, listingId: "", ...patch };
      next.propertyLine = joinPropertyLine(next) || next.propertyLine;
      return next;
    });
  }

  function pickOffice(id) {
    setForm((current) => applyOffice(current, id));
  }

  function pickStamp(id) {
    set({ stamp: id });
  }

  function setAmount(value) {
    setForm((current) => {
      const next = { ...current, amount: value };
      const auto = aedInWords(value);
      const prevAuto = aedInWords(current.amount);
      if (!current.amountWords || current.amountWords === prevAuto) next.amountWords = auto;
      return next;
    });
  }

  function setPurpose(value) {
    setForm((current) => {
      const next = { ...current, purpose: value };
      const prev = current.purpose ? String(current.onAccountOf || "").replace(current.purpose, "").trim() : current.onAccountOf;
      if (!current.onAccountOf || current.onAccountOf === current.purpose) next.onAccountOf = value;
      else if (value && prev) next.onAccountOf = `${prev} ${value}`.trim();
      return next;
    });
  }

  function missing() {
    return missingDetails(normalizeForm(form));
  }

  async function persist() {
    const miss = missing();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return null;
    }
    const body = await api("/api/booking-form/save", form);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not save the booking form." });
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
      if (item) {
        setStatus({
          type: "ok",
          text: "Saved. The voucher below shows the same fields you filled, including the selected stamp.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      const item = await persist();
      if (!item?.download) return;
      await downloadFile(item.download, item.pdfName || "booking-form.pdf");
      setStatus({ type: "ok", text: `Downloading ${item.pdfName || "the PDF"}.` });
    } catch (err) {
      setStatus({ type: "err", text: err instanceof Error ? err.message : "Could not download the PDF." });
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(item) {
    const body = await api(`/api/booking-form/${encodeURIComponent(item.id)}`);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not open this booking form." });
      return;
    }
    setForm({ ...EMPTY, ...body.item.data, id: body.item.id });
    setStep(2);
    setStatus({ type: "ok", text: "Opened saved booking form." });
  }

  async function removeSaved(item) {
    if (!window.confirm("Delete this booking form?")) return;
    const res = await fetch(`/api/booking-form/${encodeURIComponent(item.id)}`, { method: "DELETE", credentials: "same-origin" });
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

  async function markRefund(item, refunded) {
    if (refunded && !window.confirm("Move this booking to the refund list?")) return;
    const body = await api("/api/booking-form/refund", { id: item.id, refunded });
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not update the refund." });
      return;
    }
    setStatus({ type: "ok", text: refunded ? "Moved to the refund list." : "Moved back to saved booking forms." });
    await loadSaved();
  }

  const bookings = saved.filter((item) => !item.refunded);
  const refunds = saved.filter((item) => item.refunded);

  function resetForm() {
    setForm(EMPTY);
    setListingQ("");
    setManualListing(false);
    setListingOpen(false);
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
          2. Receipt / PDF
        </button>
      </nav>

      {status.text ? <div className={`tc-status ${status.type}`}>{status.text}</div> : null}

      {step === 1 ? (
        <form className="tc-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          <section>
            <h2>1. Office / address and stamp</h2>
            <p className="tc-hint">Jo office select karo usi ka logo aur address voucher par usi jagah aata hai.</p>
            <div className="bfr-office-pick" role="group" aria-label="Office address">
              {BOOKING_OFFICE_OPTIONS.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={f("office") === row.id ? "is-on" : ""}
                  onClick={() => pickOffice(row.id)}
                >
                  <img className={`bfr-office-logo bfr-office-logo-${row.id}`} src={bookingLogoSrc(row.id)} alt="" />
                  <span>{row.label}</span>
                </button>
              ))}
            </div>
            <div className="bfr-stamp-pick" role="group" aria-label="Stamp">
              {[
                { id: "a7", label: "A7 Group stamp" },
                { id: "aar", label: "Anwar Al Riyadh stamp" },
              ].map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={f("stamp") === row.id ? "is-on" : ""}
                  onClick={() => pickStamp(row.id)}
                >
                  <img src={bookingStampSrc(row.id)} alt="" />
                  <span>{row.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>2. Listing</h2>
            <div className="bfr-listing-modes">
              <button type="button" className={!manualListing ? "is-on" : ""} onClick={() => setManualListing(false)}>
                Search / pick listing
              </button>
              <button
                type="button"
                className={manualListing ? "is-on" : ""}
                onClick={() => {
                  setManualListing(true);
                  setListingOpen(false);
                  set({ listingId: "" });
                }}
              >
                Add manually
              </button>
            </div>

            {!manualListing ? (
              <>
                <label className="tc-listing-pick bfr-listing-search">
                  Search listing
                  <input
                    value={listingQ}
                    placeholder="Type reference, unit, building, or community"
                    onFocus={() => setListingOpen(true)}
                    onChange={(e) => {
                      setListingQ(e.target.value);
                      setListingOpen(true);
                    }}
                  />
                  {listingOpen ? (
                    <ul className="bfr-listing-hits">
                      {listingBusy ? <li className="bfr-listing-empty">Searching…</li> : null}
                      {!listingBusy && !searchRows.length ? (
                        <li className="bfr-listing-empty">No listing found. Use Add manually.</li>
                      ) : null}
                      {searchRows.map((row) => (
                        <li key={row.id}>
                          <button type="button" onClick={() => pickListing(row.id)}>
                            {listingLabel(row)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </label>
                <label className="tc-listing-pick">
                  Or pick from the desk
                  <select value={f("listingId")} onChange={(e) => pickListing(e.target.value)}>
                    <option value="">— none —</option>
                    {searchRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {listingLabel(row)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <div className="tc-grid">
                <label>
                  Listing ref
                  <input value={f("listingRef")} placeholder="Optional" onChange={(e) => setManualField({ listingRef: e.target.value })} />
                </label>
                <label>
                  Unit no.
                  <input value={f("unitNo")} placeholder="14-304" onChange={(e) => setManualField({ unitNo: e.target.value })} />
                </label>
                <label>
                  Building
                  <input value={f("buildingName")} onChange={(e) => setManualField({ buildingName: e.target.value })} />
                </label>
                <label>
                  Community
                  <input value={f("community")} onChange={(e) => setManualField({ community: e.target.value })} />
                </label>
                <label className="bf-wide">
                  Property / unit (as printed)
                  <input value={f("propertyLine")} onChange={(e) => set({ propertyLine: e.target.value })} />
                </label>
              </div>
            )}
            {f("listingId") || f("propertyLine") ? (
              <p className="tc-hint">
                {f("listingRef") ? `${f("listingRef")} · ` : ""}
                {f("propertyLine") || "No property line yet"}
              </p>
            ) : null}
          </section>

          <section>
            <h2>3. Receipt</h2>
            <div className="tc-grid">
              <label>
                No.
                <input value={f("voucherNo")} onChange={(e) => set({ voucherNo: e.target.value })} />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={isoVoucherDate(f("date"))}
                  onChange={(e) => set({ date: e.target.value ? formatVoucherDate(e.target.value) : "" })}
                />
              </label>
              <label className="bf-wide">
                Account
                <input value={f("accountName")} placeholder="Client / payer name" onChange={(e) => set({ accountName: e.target.value })} />
              </label>
              <label className="bf-wide">
                Property / unit
                <input value={f("propertyLine")} onChange={(e) => set({ propertyLine: e.target.value })} />
              </label>
              <label>
                Advance Booking
                <input value={f("advanceBooking")} onChange={(e) => set({ advanceBooking: e.target.value })} />
              </label>
              <label>
                Rent
                <input value={f("rent")} onChange={(e) => set({ rent: e.target.value })} />
              </label>
              <label>
                Security Deposit
                <input value={f("securityDeposit")} onChange={(e) => set({ securityDeposit: e.target.value })} />
              </label>
              <label>
                Commission
                <input value={f("commission")} onChange={(e) => set({ commission: e.target.value })} />
              </label>
              <label>
                Amount received
                <input value={f("amount")} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label>
                Through
                <select value={f("through")} onChange={(e) => set({ through: e.target.value })}>
                  <option value="">Please select</option>
                  {THROUGH_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {f("through") === "Cheque" ? (
                <label>
                  Cheque no.
                  <input value={f("chequeNo")} onChange={(e) => set({ chequeNo: e.target.value })} />
                </label>
              ) : null}
              <label>
                On account of
                <select value={f("purpose")} onChange={(e) => setPurpose(e.target.value)}>
                  <option value="">Please select</option>
                  {PURPOSE_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bf-wide">
                On account of (as printed)
                <input value={f("onAccountOf")} onChange={(e) => set({ onAccountOf: e.target.value })} />
              </label>
              <label className="bf-wide">
                Amount (in words)
                <input value={f("amountWords")} onChange={(e) => set({ amountWords: e.target.value })} />
              </label>
              <label className="bf-wide">
                Authorised signatory name
                <input value={f("signatory")} onChange={(e) => set({ signatory: e.target.value })} />
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
            <button type="button" className="ui-btn ui-btn-success" disabled={busy} onClick={downloadPdf}>
              {busy ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
          <div className="deed-desk">
            <BookingReceiptSheet data={form} />
          </div>
        </div>
      ) : null}

      <section className="bf-saved">
        <h2>Saved booking forms</h2>
        {!bookings.length ? <p className="tc-hint">None yet. Fill the office, stamp, account, amount, and through, then save.</p> : null}
        <ul>
          {bookings.map((item) => (
            <li key={item.id}>
              <button type="button" className="bf-saved-open" onClick={() => openSaved(item)}>
                <b>{item.title}</b>
                <span>
                  {item.voucherNo ? `No. ${item.voucherNo} · ` : ""}
                  {item.ownerName || "No account"} · {item.listingRef || "No listing"} · {when(item.updatedAt)}
                </span>
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => openSaved(item)}>
                Open
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => markRefund(item, true)}>
                Refund
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => removeSaved(item)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bf-saved">
        <h2>Refunds</h2>
        {!refunds.length ? <p className="tc-hint">Bookings that did not go through appear here after Refund.</p> : null}
        <ul>
          {refunds.map((item) => (
            <li key={item.id}>
              <button type="button" className="bf-saved-open" onClick={() => openSaved(item)}>
                <b>{item.title}</b>
                <span>
                  {item.voucherNo ? `No. ${item.voucherNo} · ` : ""}
                  {item.ownerName || "No account"} · {item.listingRef || "No listing"} · Refund {when(item.refundedAt)}
                </span>
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => openSaved(item)}>
                Open
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => markRefund(item, false)}>
                Put back
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
