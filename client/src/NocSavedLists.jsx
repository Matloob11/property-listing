import { useEffect, useState } from "react";
import { downloadFile } from "./downloadFile.js";
import { NocMaintSheet } from "./NocMaintSheet.jsx";
import { NocMoveinSheet, NocMoveoutSheet } from "./NocMoveinSheet.jsx";
import { NocSheet } from "./NocSheet.jsx";
import { NocTrakheesiSheet } from "./NocTrakheesiSheet.jsx";

const SHEETS = {
  noc: NocSheet,
  maint: NocMaintSheet,
  movein: NocMoveinSheet,
  moveout: NocMoveoutSheet,
  trakheesi: NocTrakheesiSheet,
};

function whenUnix(ts) {
  if (!ts) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function whenIso(value) {
  if (!value) return "—";
  const n = Date.parse(value);
  if (!Number.isFinite(n)) return "—";
  return new Date(n).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusOf(item) {
  if (item.signStatus === "signed") return { key: "signed", label: "Signed" };
  if (item.signStatus === "sent") return { key: "sent", label: "Sent — waiting" };
  return { key: "draft", label: "Draft" };
}

function NocRecordTable({ title, items, empty, signed, onView, onDownload, onDelete, busyId }) {
  return (
    <div className="noc-records-block">
      <div className="noc-records-block-head">
        <h3>{title}</h3>
        <span className="noc-records-count">
          {items.length} {items.length === 1 ? "record" : "records"}
        </span>
      </div>
      {!items.length ? <p className="tc-hint">{empty}</p> : null}
      {items.length ? (
        <div className="noc-records-scroll">
          <table className="noc-records-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Status</th>
                <th>{signed ? "Signed by / email" : "Email"}</th>
                <th>{signed ? "Signed on" : "Updated"}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = statusOf(item);
                return (
                  <tr key={item.id}>
                    <td data-label="Document">
                      <b>{item.title}</b>
                      <span>
                        {item.ownerName || "No owner"}
                        {item.listingRef ? ` · ${item.listingRef}` : ""}
                      </span>
                    </td>
                    <td data-label="Status">
                      <span className={`noc-sign-badge ${status.key}`}>{status.label}</span>
                    </td>
                    <td data-label={signed ? "Signed by / email" : "Email"}>
                      {signed ? item.signName || item.ownerName || "—" : null}
                      {signed && item.signEmail ? <span>{item.signEmail}</span> : null}
                      {!signed ? item.signEmail || "—" : null}
                    </td>
                    <td data-label={signed ? "Signed on" : "Updated"}>
                      {signed ? whenIso(item.signedAt) : whenUnix(item.updatedAt)}
                    </td>
                    <td data-label="Actions">
                      <div className="noc-records-actions">
                        <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => onView(item)}>
                          View PDF
                        </button>
                        <button
                          type="button"
                          className="ui-btn ui-btn-sm ui-btn-light"
                          disabled={busyId === item.id}
                          onClick={() => onDownload(item)}
                        >
                          {busyId === item.id ? "…" : "Download"}
                        </button>
                        <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => onDelete(item)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function NocSavedLists({ kind, savedTitle, signedTitle, items, emptySaved, removeSaved }) {
  const Sheet = SHEETS[kind] || NocSheet;
  const signed = (items || []).filter((item) => item.signStatus === "signed");
  const rest = (items || []).filter((item) => item.signStatus !== "signed");
  const [viewing, setViewing] = useState(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  async function loadPdf(item) {
    const res = await fetch(item.preview || item.download, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Could not open the PDF.");
    const blob = await res.blob();
    if (blob.type && !blob.type.includes("pdf") && !blob.type.includes("octet-stream")) {
      throw new Error("Could not open the PDF.");
    }
    return URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  }

  async function onDownload(item) {
    setErr("");
    setBusyId(item.id);
    try {
      await downloadFile(item.download, item.pdfName || "noc.pdf");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not download the PDF.");
    } finally {
      setBusyId("");
    }
  }

  async function onView(item) {
    setErr("");
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl("");
    setViewing(item);
    setBusyId(item.id);
    try {
      const url = await loadPdf(item);
      setPdfUrl(url);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not open the PDF.");
    } finally {
      setBusyId("");
    }
  }

  function closeView() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl("");
    setViewing(null);
  }

  return (
    <section className="noc-records" aria-label="NOC records">
      <header className="noc-records-head">
        <h2>NOC records</h2>
        <p>Signed and saved documents live here, separate from the form. View or download the PDF, or delete a record.</p>
      </header>
      {err ? <p className="tc-status err">{err}</p> : null}
      {viewing ? (
        <div className="noc-pdf-view">
          <div className="noc-pdf-view-bar">
            <div>
              <b>{viewing.title}</b>
              <span>{statusOf(viewing).label}</span>
            </div>
            <div className="noc-records-actions">
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" disabled={busyId === viewing.id} onClick={() => onDownload(viewing)}>
                Download
              </button>
              {pdfUrl ? (
                <a className="ui-btn ui-btn-sm ui-btn-light" href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  Open PDF file
                </a>
              ) : null}
              <button type="button" className="ui-btn ui-btn-sm" onClick={closeView}>
                Close
              </button>
            </div>
          </div>
          <div className="deed-desk noc-pdf-letter">
            <Sheet data={viewing.data || {}} />
          </div>
        </div>
      ) : null}
      <NocRecordTable
        title={signedTitle}
        items={signed}
        empty="None signed yet. Email the PDF. When they sign and send back, the record appears here."
        signed
        onView={onView}
        onDownload={onDownload}
        onDelete={removeSaved}
        busyId={busyId}
      />
      <NocRecordTable
        title={savedTitle}
        items={rest}
        empty={emptySaved}
        onView={onView}
        onDownload={onDownload}
        onDelete={removeSaved}
        busyId={busyId}
      />
    </section>
  );
}
