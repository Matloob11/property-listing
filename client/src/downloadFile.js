export function filenameFrom(header, fallback) {
  const raw = String(header || "");
  const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(raw);
  const plain = /filename="([^"]+)"/i.exec(raw) || /filename=([^;]+)/i.exec(raw);
  const value = decodeURIComponent((encoded?.[1] || plain?.[1] || "").trim().replace(/^"|"$/g, ""));
  return value || fallback;
}

export async function downloadFile(url, fallbackName = "document.pdf") {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error("Could not download the PDF.");
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filenameFrom(res.headers.get("content-disposition"), fallbackName);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}
