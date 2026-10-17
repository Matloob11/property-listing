import { useState } from "react";

function daysLabel(n) {
  if (n === 0) return "Expires today";
  if (n === 1) return "Expires tomorrow";
  return `Expires in ${n} days`;
}

export function ExpiryAlertModal({ alert, onDismiss, onOpenListing }) {
  const [busy, setBusy] = useState(false);
  const items = Array.isArray(alert?.items) ? alert.items : [];
  if (!items.length) return null;

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    try {
      await onDismiss(items.map((row) => row.key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="expiry-alert-overlay" role="alertdialog" aria-modal="true" aria-labelledby="expiry-alert-title">
      <div className="expiry-alert-card">
        <p className="expiry-alert-kicker">Listing expiry</p>
        <h2 id="expiry-alert-title">Your listing{items.length === 1 ? " is" : "s are"} about to expire</h2>
        <p>
          {items.length === 1 ? "This listing" : `${items.length} listings`} will expire within {alert.windowDays || 30} days.
          This stays on screen until you tap Got it or Dismiss.
        </p>
        <ul>
          {items.map((row) => (
            <li key={row.key}>
              <button type="button" onClick={() => onOpenListing?.(row.id, row.reference)}>
                <strong>{row.reference || row.title}</strong>
                <span>
                  {row.community} · {daysLabel(row.daysLeft)} · {row.expiry}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="expiry-alert-actions">
          <button type="button" className="btn" onClick={dismiss} disabled={busy}>
            {busy ? "Saving…" : "Got it"}
          </button>
          <button type="button" className="btn ghost" onClick={dismiss} disabled={busy}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
