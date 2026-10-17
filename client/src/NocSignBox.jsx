import { useRef, useState } from "react";

export const NOC_SIGN_PRINT_CSS = `
.noc-sig, .noc-sig-has { display: flex; flex-direction: row; align-items: flex-end; gap: 8px; margin-top: 16pt; }
.noc-sig-label { white-space: nowrap; }
.noc-sig-line { display: inline-flex; align-items: flex-end; justify-content: flex-start; min-width: 70mm; min-height: 22mm; border-bottom: 1px solid #111; padding: 0 2px 1px; box-sizing: border-box; }
.noc-sign-img { display: block; width: auto; height: auto; max-width: 90mm; max-height: 28mm; margin: 0; object-fit: contain; object-position: left bottom; background: transparent; image-rendering: auto; }
`;

function lum(r, g, b) {
  return (r + g + b) / 3;
}

function paperOf(px, w, h) {
  const rs = [];
  const gs = [];
  const bs = [];
  const take = (x, y) => {
    const p = (y * w + x) * 4;
    if (px[p + 3] < 20) return;
    rs.push(px[p]);
    gs.push(px[p + 1]);
    bs.push(px[p + 2]);
  };
  for (let x = 0; x < w; x += 1) {
    take(x, 0);
    take(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    take(0, y);
    take(w - 1, y);
  }
  const step = Math.max(1, Math.floor((w * h) / 400));
  for (let i = 0; i < w * h; i += step) {
    const p = i * 4;
    if (px[p + 3] < 20) continue;
    rs.push(px[p]);
    gs.push(px[p + 1]);
    bs.push(px[p + 2]);
  }
  if (!rs.length) return { r: 240, g: 240, b: 240, L: 240, sat: 0 };
  const mid = (arr) => {
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  };
  const r = mid(rs);
  const g = mid(gs);
  const b = mid(bs);
  return { r, g, b, L: lum(r, g, b), sat: Math.max(r, g, b) - Math.min(r, g, b) };
}

function inkScore(r, g, b, a, paper) {
  if (a < 16) return 0;
  const L = lum(r, g, b);
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const dist = Math.abs(r - paper.r) + Math.abs(g - paper.g) + Math.abs(b - paper.b);
  const darker = paper.L - L;
  if (dist < 22 && darker < 10) return 0;
  let score = 0;
  if (darker > 0) score += darker;
  if (sat > paper.sat) score += (sat - paper.sat) * 0.85;
  if (b > r + 6 && b >= g) score += 24;
  if (r > g + 14 && r > b + 14) score += 20;
  return score;
}

function clusterInk(keep, w, h) {
  const labels = new Int32Array(w * h);
  const comps = [];
  const stack = [];
  const minArea = Math.max(12, Math.round(w * h * 0.0001));
  let next = 1;
  for (let start = 0; start < w * h; start += 1) {
    if (!keep[start] || labels[start]) continue;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let count = 0;
    labels[start] = next;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      count += 1;
      const x = p % w;
      const y = (p - x) / w;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (!keep[np] || labels[np]) continue;
          labels[np] = next;
          stack.push(np);
        }
      }
    }
    if (count >= minArea) comps.push({ id: next, minX, minY, maxX, maxY, count });
    next += 1;
  }
  if (!comps.length) return null;
  const ranked = comps
    .map((c) => {
      const edges =
        (c.minX <= 1 ? 1 : 0) + (c.minY <= 1 ? 1 : 0) + (c.maxX >= w - 2 ? 1 : 0) + (c.maxY >= h - 2 ? 1 : 0);
      const bw = c.maxX - c.minX + 1;
      const bh = c.maxY - c.minY + 1;
      const frame = edges >= 3 || (edges >= 2 && (bw * bh) / (w * h) > 0.4);
      const cx = (c.minX + c.maxX) / 2 / w - 0.5;
      const cy = (c.minY + c.maxY) / 2 / h - 0.5;
      const center = 1 - Math.min(1, Math.hypot(cx, cy) * 1.6);
      return { c, frame, score: frame ? -1 : c.count * (0.6 + 0.4 * center) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  const main = (ranked[0] || { c: comps.sort((a, b) => b.count - a.count)[0] }).c;
  const padX = Math.max(16, (main.maxX - main.minX + 1) * 0.55);
  const padY = Math.max(14, (main.maxY - main.minY + 1) * 0.7);
  const keepIds = new Set([main.id]);
  let minX = main.minX;
  let minY = main.minY;
  let maxX = main.maxX;
  let maxY = main.maxY;
  for (const row of ranked) {
    const c = row.c;
    if (keepIds.has(c.id) || row.frame) continue;
    const near =
      c.maxX >= main.minX - padX &&
      c.minX <= main.maxX + padX &&
      c.maxY >= main.minY - padY &&
      c.minY <= main.maxY + padY;
    if (!near) continue;
    keepIds.add(c.id);
    minX = Math.min(minX, c.minX);
    minY = Math.min(minY, c.minY);
    maxX = Math.max(maxX, c.maxX);
    maxY = Math.max(maxY, c.maxY);
  }
  const cleaned = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < w * h; i += 1) {
    if (keepIds.has(labels[i])) {
      cleaned[i] = 1;
      count += 1;
    }
  }
  return { cleaned, count, minX, minY, maxX, maxY };
}

function liftInk(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const paper = paperOf(px, w, h);
  const scores = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i += 1, p += 4) {
    scores[i] = inkScore(px[p], px[p + 1], px[p + 2], px[p + 3], paper);
  }
  let best = null;
  for (const need of [28, 42, 62, 88, 120]) {
    const keep = new Uint8Array(w * h);
    let raw = 0;
    for (let i = 0; i < w * h; i += 1) {
      if (scores[i] < need) continue;
      keep[i] = 1;
      raw += 1;
    }
    if (raw < 16) continue;
    const clustered = clusterInk(keep, w, h);
    if (!clustered || clustered.count < 16) continue;
    const box = (clustered.maxX - clustered.minX + 1) * (clustered.maxY - clustered.minY + 1);
    const fill = clustered.count / box;
    const cover = box / (w * h);
    if (fill > 0.55 && need !== 120) continue;
    if (cover > 0.7 && need !== 120) continue;
    best = clustered;
    if (fill <= 0.45 && cover <= 0.55) break;
  }
  if (!best) throw new Error("Could not find a written signature in this photo.");
  const pad = 8;
  const x0 = Math.max(0, best.minX - pad);
  const y0 = Math.max(0, best.minY - pad);
  const cw = Math.min(w - x0, best.maxX - best.minX + 1 + pad * 2);
  const ch = Math.min(h - y0, best.maxY - best.minY + 1 + pad * 2);
  const cut = document.createElement("canvas");
  cut.width = cw;
  cut.height = ch;
  const out = cut.getContext("2d").createImageData(cw, ch);
  const dest = out.data;
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const src = (y0 + y) * w + (x0 + x);
      if (!best.cleaned[src]) continue;
      const p = src * 4;
      const d = (y * cw + x) * 4;
      dest[d] = px[p];
      dest[d + 1] = px[p + 1];
      dest[d + 2] = px[p + 2];
      dest[d + 3] = 255;
    }
  }
  cut.getContext("2d").putImageData(out, 0, 0);
  return cut;
}

function fileToOwnerSign(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      reject(new Error("Use a JPG or PNG of the owner signature."));
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      reject(new Error("Signature image is too large. Use a file under 6 MB."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const maxSide = 2400;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = scale < 1;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const lifted = liftInk(canvas);
        let dataUrl = lifted.toDataURL("image/png");
        if (dataUrl.length > 650000) {
          const small = document.createElement("canvas");
          const factor = Math.sqrt(600000 / dataUrl.length);
          small.width = Math.max(80, Math.round(lifted.width * factor));
          small.height = Math.max(40, Math.round(lifted.height * factor));
          const sctx = small.getContext("2d");
          sctx.imageSmoothingEnabled = true;
          sctx.imageSmoothingQuality = "high";
          sctx.drawImage(lifted, 0, 0, small.width, small.height);
          dataUrl = small.toDataURL("image/png");
        }
        if (!dataUrl.startsWith("data:image/png") || dataUrl.length < 32) {
          reject(new Error("Could not copy this signature."));
          return;
        }
        resolve(dataUrl);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Could not extract the signature from this photo."));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this signature image."));
    };
    img.src = url;
  });
}

export function NocOwnerSign({ data, label = "Owner Signature:", blank = "______________________________", className = "" }) {
  const src = String(data?.ownerSign || "");
  const cls = ["noc-sig", src.startsWith("data:image/") ? "noc-sig-has" : "", className].filter(Boolean).join(" ");
  if (src.startsWith("data:image/")) {
    return (
      <p className={cls}>
        <span className="noc-sig-label">{label}</span>
        <span className="noc-sig-line">
          <img src={src} alt="" className="noc-sign-img" />
        </span>
      </p>
    );
  }
  return (
    <p className={cls}>
      <span className="noc-sig-label">{label}</span> {blank}
    </p>
  );
}

function cropDrawn(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const px = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let ink = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (px[(y * w + x) * 4 + 3] < 20) continue;
      ink += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (ink < 20) throw new Error("Draw the signature first.");
  const pad = 8;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const cw = Math.min(w - x0, maxX - minX + 1 + pad * 2);
  const ch = Math.min(h - y0, maxY - minY + 1 + pad * 2);
  const cut = document.createElement("canvas");
  cut.width = cw;
  cut.height = ch;
  cut.getContext("2d").drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
  return cut.toDataURL("image/png");
}

export function NocSignBox({ value, onChange }) {
  const inputRef = useRef(null);
  const drawRef = useRef(null);
  const drawingRef = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("");

  async function onFile(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMode("");
    try {
      onChange(await fileToOwnerSign(file));
    } catch (err) {
      setError(err.message || "Could not extract the signature from this photo.");
    } finally {
      setBusy(false);
    }
  }

  function startDraw() {
    setMode("draw");
    setError("");
    requestAnimationFrame(() => {
      const canvas = drawRef.current;
      if (!canvas) return;
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  function drawAt(event) {
    const canvas = drawRef.current;
    if (!canvas || !drawingRef.current) return;
    const r = canvas.getBoundingClientRect();
    const x = ((event.clientX - r.left) / r.width) * canvas.width;
    const y = ((event.clientY - r.top) / r.height) * canvas.height;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1d3f9f";
    ctx.lineWidth = 3.2;
    if (drawingRef.current === true) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      drawingRef.current = { x, y };
      return;
    }
    ctx.beginPath();
    ctx.moveTo(drawingRef.current.x, drawingRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawingRef.current = { x, y };
  }

  function applyDraw() {
    const canvas = drawRef.current;
    if (!canvas) return;
    try {
      onChange(cropDrawn(canvas));
      setMode("");
      setError("");
    } catch (err) {
      setError(err.message || "Draw the signature first.");
    }
  }

  function clearPad() {
    const canvas = drawRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setError("");
  }

  return (
    <div className="noc-sign-box">
      <p className="noc-sign-title">
        Owner signature <span>optional</span>
      </p>
      <p className="tc-hint">
        Upload the owner’s signature photo — only the written sign is placed on the line. Or draw the signature. Leave empty if the owner will sign themselves.
      </p>
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
      {busy ? (
        <div className="noc-sign-empty">Extracting signature…</div>
      ) : mode === "draw" ? (
        <div className="noc-draw">
          <p className="tc-hint">Draw the signature in this box.</p>
          <canvas
            ref={drawRef}
            className="noc-draw-pad"
            width={520}
            height={160}
            aria-label="Draw signature"
            onPointerDown={(e) => {
              drawingRef.current = true;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              drawAt(e);
            }}
            onPointerMove={drawAt}
            onPointerUp={() => {
              drawingRef.current = false;
            }}
            onPointerCancel={() => {
              drawingRef.current = false;
            }}
          />
          <div className="noc-sign-actions">
            <button type="button" className="ui-btn ui-btn-primary" onClick={applyDraw}>
              Use this signature
            </button>
            <button type="button" className="ui-btn ui-btn-light" onClick={clearPad}>
              Clear
            </button>
            <button type="button" className="ui-btn ui-btn-light" onClick={() => setMode("")}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {value ? <img className="noc-sign-preview" src={value} alt="Owner signature preview" /> : <div className="noc-sign-empty">No signature added</div>}
          <div className="noc-sign-actions">
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {value ? "Replace signature" : "Add signature from PC"}
            </button>
            <button type="button" className="ui-btn ui-btn-light" disabled={busy} onClick={startDraw}>
              Draw signature
            </button>
            {value ? (
              <button type="button" className="ui-btn ui-btn-light" disabled={busy} onClick={() => onChange("")}>
                Remove
              </button>
            ) : null}
          </div>
        </>
      )}
      {error ? <p className="tc-status err">{error}</p> : null}
    </div>
  );
}
