import { useEffect, useState } from "react";
import { downloadFile } from "./downloadFile.js";

export function NocEmailSend({ path, persist, loadSaved, form, disabled, current }) {
  const [email, setEmail] = useState(current?.signEmail || "");
  const [phone, setPhone] = useState(current?.signPhone || "");
  const [name, setName] = useState(form.ownerName || current?.ownerName || "");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    setEmail((value) => value || current?.signEmail || "");
  }, [current?.signEmail]);

  useEffect(() => {
    setPhone((value) => value || current?.signPhone || "");
  }, [current?.signPhone]);

  useEffect(() => {
    setName((value) => value || form.ownerName || current?.ownerName || "");
  }, [form.ownerName, current?.ownerName]);

  const signed = current?.signStatus === "signed";
  const sent = current?.signStatus === "sent";
  const locked = disabled || Boolean(busy);

  async function ensureId() {
    let id = form.id || current?.id;
    if (!id && persist) {
      const item = await persist();
      id = item?.id;
    }
    return id;
  }

  async function sendEmail() {
    setMsg({ type: "", text: "" });
    const to = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setMsg({ type: "err", text: "Enter a valid email." });
      return;
    }
    setBusy("email");
    try {
      const id = await ensureId();
      if (!id) {
        setMsg({ type: "err", text: "Save the NOC first, then email it." });
        return;
      }
      const res = await fetch(`${path}/email`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, email: to, name: name.trim() }),
      });
      const body = await res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }));
      if (!body.ok) {
        setMsg({ type: "err", text: body.error || "Could not send the email." });
        return;
      }
      setMsg({
        type: "ok",
        text: `PDF emailed to ${body.mailed || to}. Check Inbox, Spam, and Promotions. When they sign and send back, it appears in Signed NOCs.`,
      });
      if (loadSaved) await loadSaved();
    } catch {
      setMsg({ type: "err", text: "Could not send the email." });
    } finally {
      setBusy("");
    }
  }

  async function sendWhatsapp() {
    setMsg({ type: "", text: "" });
    if (!phone.trim()) {
      setMsg({ type: "err", text: "Enter a WhatsApp number." });
      return;
    }
    const waWin = window.open("about:blank", "_blank");
    setBusy("whatsapp");
    try {
      const id = await ensureId();
      if (!id) {
        waWin?.close();
        setMsg({ type: "err", text: "Save the NOC first, then send on WhatsApp." });
        return;
      }
      const res = await fetch(`${path}/whatsapp`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, phone: phone.trim(), name: name.trim() }),
      });
      const body = await res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }));
      if (!body.ok) {
        waWin?.close();
        setMsg({ type: "err", text: body.error || "Could not open WhatsApp." });
        return;
      }
      if (body.download) {
        try {
          await downloadFile(body.download, body.pdfName || "noc.pdf");
        } catch {
          /* chat still opens */
        }
      }
      if (body.waMe && waWin) waWin.location.href = body.waMe;
      else waWin?.close();
      setMsg({
        type: "ok",
        text: "WhatsApp opened with the PDF link and the sign link. They can open the PDF to verify, then sign and send back.",
      });
      if (loadSaved) await loadSaved();
    } catch {
      waWin?.close();
      setMsg({ type: "err", text: "Could not open WhatsApp." });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="noc-email-send" aria-label="Send NOC for signature">
      <h3>Send PDF for signature</h3>
      <p className="tc-hint">
        If you do not have the signature here, email the PDF or open WhatsApp. WhatsApp sends the PDF link so they can verify the document, then sign and send it back.
      </p>
      {signed ? (
        <p className="tc-status ok">Signed{current.signName ? ` by ${current.signName}` : ""}. It is in Signed NOCs.</p>
      ) : (
        <>
          <div className="tc-grid">
            <label>
              Email
              <input
                type="email"
                value={email}
                autoComplete="email"
                placeholder="owner@email.com"
                disabled={locked}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              WhatsApp number
              <input
                type="tel"
                value={phone}
                autoComplete="tel"
                placeholder="0501234567"
                disabled={locked}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={name}
                autoComplete="name"
                placeholder="Person who will sign"
                disabled={locked}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
          <div className="tc-actions">
            <button type="button" className="ui-btn ui-btn-primary" disabled={locked} onClick={sendEmail}>
              {busy === "email" ? "Sending…" : sent ? "Email PDF again" : "Email PDF for signature"}
            </button>
            <button type="button" className="ui-btn" disabled={locked} onClick={sendWhatsapp}>
              {busy === "whatsapp" ? "Opening…" : "WhatsApp PDF for signature"}
            </button>
          </div>
          {sent ? (
            <p className="tc-hint">
              Already sent
              {current.signEmail ? ` to ${current.signEmail}` : ""}
              {current.signPhone ? ` / WhatsApp ${current.signPhone}` : ""}. Waiting for them to sign and send back.
            </p>
          ) : null}
        </>
      )}
      {msg.text ? <p className={`tc-status ${msg.type}`}>{msg.text}</p> : null}
    </section>
  );
}
