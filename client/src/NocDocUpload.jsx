import { useRef } from "react";

export function NocDocUpload({ busy, onFile }) {
  const inputRef = useRef(null);

  return (
    <div className="tc-doc-upload">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        className="ui-btn ui-btn-primary"
        disabled={busy}
        aria-label="Upload document to fill matching form fields"
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Reading document…" : "Upload document"}
      </button>
    </div>
  );
}
