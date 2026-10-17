// Public signing page shown to the tenant / buyer / owner from the link they receive.
import { contractSummary, kindLabel } from "./contracts.js";
import { chequeSchedule, formatAed, formatChequeDate } from "./tenancyCheques.js";
import { EJARI_PAGE, pdfTextStyle, signBoxStyle, tenancyLayout } from "./tenancyPdf.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5f8; color: #222; font-family: Poppins, "Segoe UI", Arial, sans-serif; }
  main { width: min(720px, calc(100% - 24px)); margin: 18px auto 40px; background: #fff; border-radius: 14px; padding: 22px 22px 26px; box-shadow: 0 8px 30px rgba(24,28,50,.08); }
  main.wide { width: min(980px, calc(100% - 16px)); }
  body.paper { background: #c8c8c8; }
  main.paper { width: min(860px, 100%); margin: 0 auto; padding: 10px 10px 150px; background: transparent; border-radius: 0; box-shadow: none; }
  .brand.slim { margin-bottom: 8px; background: #fff; padding: 8px 10px; border-radius: 10px; }
  .sheet { position: relative; width: 100%; margin: 0 0 14px; background: #fff; box-shadow: 0 10px 28px rgba(0,0,0,.2); container-type: inline-size; }
  .sheet .blank { width: 100%; height: auto; display: block; }
  .field { position: absolute; margin: 0; padding: 0; font-family: Helvetica, Arial, sans-serif; font-weight: 400; color: #111; white-space: nowrap; line-height: 1; pointer-events: none; }
  .usage-radio { position: absolute; width: 2.05cqw; height: 2.05cqw; border: 0.18cqw solid #0b2c69; border-radius: 50%; background: #fff; transform: translate(-50%, -50%); pointer-events: none; box-sizing: border-box; }
  .usage-radio.on { background: #0b2c69; }
  .usage-radio.on::after { content: ""; position: absolute; left: 29%; top: 20%; width: 36%; height: 54%; border: solid #fff; border-width: 0 0.2cqw 0.2cqw 0; transform: rotate(45deg); }
  .sign-slot { position: absolute; }
  .sign-slot.active { outline: 2px solid #0bb783; outline-offset: 1px; background: rgba(11,183,131,.08); }
  .sign-slot canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: crosshair; }
  .sign-slot img { width: 100%; height: 100%; object-fit: contain; }
  .sign-hint { position: absolute; top: -22px; left: 0; font-size: 11px; font-weight: 700; color: #0b7a58; background: #e8fff6; padding: 2px 6px; border-radius: 4px; }
  .dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 8; background: #fff; border-top: 1px solid #d5d9e3; padding: 10px 12px 12px; box-shadow: 0 -8px 24px rgba(0,0,0,.08); }
  .dock-inner { width: min(860px, 100%); margin: 0 auto; display: grid; gap: 8px; }
  .dock .row { margin-top: 0; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .brand b { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: #181c32; color: #e8d5a8; font-size: 15px; }
  .brand small { display: block; color: #777; font-size: 11px; letter-spacing: .08em; }
  h1 { font-size: 22px; margin: 4px 0 6px; }
  .lead { color: #555; margin: 0 0 16px; line-height: 1.5; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin: 12px 0 16px; }
  .grid div span { display: block; font-size: 11px; color: #999; }
  .grid div b { font-weight: 600; }
  .pdf { display: inline-block; margin: 6px 0 18px; padding: 10px 14px; border-radius: 8px; background: #eef0ff; color: #3d4fd6; text-decoration: none; font-weight: 600; }
  .pages { margin: 8px 0 18px; }
  .page-label { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #555; }
  .cheque-sheet { padding: 28px 24px 36px; min-height: 480px; }
  .cheque-sheet h2 { margin: 0 0 8px; font-size: 20px; }
  .cheque-sheet p { margin: 0 0 6px; font-size: 13px; }
  .cheque-sheet table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
  .cheque-sheet th, .cheque-sheet td { border: 1px solid #cfcfcf; padding: 7px 8px; text-align: left; }
  .cheque-sheet th { background: #f3f3f3; }
  .box { border: 1px solid #e3e6ee; border-radius: 12px; padding: 14px; margin-top: 8px; }
  label { display: block; font-weight: 600; margin: 10px 0 6px; }
  input[type=text] { width: 100%; padding: 11px 12px; border: 1px solid #d5d9e3; border-radius: 8px; font: inherit; }
  textarea { width: 100%; min-height: 90px; padding: 11px 12px; border: 1px solid #d5d9e3; border-radius: 8px; font: inherit; resize: vertical; }
  .proof { width: 100%; max-height: 280px; object-fit: contain; border: 1px solid #e3e6ee; border-radius: 10px; margin: 8px 0 14px; background: #f7f8fb; }
  iframe.proof-pdf { width: 100%; height: 360px; border: 1px solid #e3e6ee; border-radius: 10px; margin: 8px 0 14px; background: #f7f8fb; }
  canvas { width: 100%; height: 190px; border: 2px dashed #c9cede; border-radius: 10px; background: #fff; touch-action: none; display: block; }
  .tabs { display: flex; gap: 8px; margin-bottom: 10px; }
  .tabs button { flex: 1; padding: 9px; border: 1px solid #d5d9e3; background: #fff; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; }
  .tabs button.on { background: #181c32; color: #fff; border-color: #181c32; }
  .typed { font-family: "Brush Script MT", "Segoe Script", cursive; font-size: 34px; padding: 18px 14px; border: 2px dashed #c9cede; border-radius: 10px; min-height: 90px; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
  .btn { padding: 12px 18px; border: 0; border-radius: 9px; font: inherit; font-weight: 600; cursor: pointer; }
  .btn.primary { background: #0bb783; color: #fff; }
  .btn.ghost { background: #f0f2f7; color: #333; }
  .consent { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; font-size: 13px; color: #444; line-height: 1.45; }
  .status { margin-top: 12px; color: #c0392b; font-weight: 600; min-height: 20px; }
  .done { text-align: center; padding: 30px 10px; }
  .done .tick { width: 64px; height: 64px; border-radius: 50%; background: #0bb783; color: #fff; display: inline-grid; place-items: center; font-size: 34px; margin-bottom: 12px; }
  .muted { color: #777; font-size: 12px; }
  .signers { list-style: none; padding: 0; margin: 10px 0 0; }
  .signers li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e3e6ee; font-size: 13px; }
  @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
`;

function head(title, wide = false, paper = false) {
  const mainClass = [wide ? "wide" : "", paper ? "paper" : ""].filter(Boolean).join(" ");
  const brand = paper
    ? `<div class="brand slim"><b>A7</b><div><strong>A7 Group Real Estate</strong><small>TENANCY CONTRACT</small></div></div>`
    : `<div class="brand"><b>A7</b><div><strong>A7 Group Real Estate</strong><small>E-SIGNATURE</small></div></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(title)}</title><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet" /><style>${STYLE}</style></head><body${paper ? ' class="paper"' : ""}><main${mainClass ? ` class="${mainClass}"` : ""}>${brand}`;
}

function tenancyFormData(row) {
  const data = { ...(row?.data || {}) };
  delete data.signers;
  data.tenantName = String(data.tenantName || row?.tenant_name || "").trim();
  data.landlordName = String(data.landlordName || data.ownerName || row?.owner_name || "").trim();
  data.tenantEmail = String(data.tenantEmail || row?.tenant_email || "").trim();
  data.landlordEmail = String(data.landlordEmail || row?.owner_email || "").trim();
  data.tenantPhone = String(data.tenantPhone || row?.tenant_phone || "").trim();
  data.landlordPhone = String(data.landlordPhone || row?.owner_phone || "").trim();
  return data;
}

function signerImage(signer) {
  return signer?.signature && String(signer.signature).startsWith("data:image/") ? signer.signature : "";
}

function tenancyChequeSheetHtml(row) {
  const schedule = chequeSchedule(tenancyFormData(row));
  if (!schedule.rows.length) return "";
  return `<p class="page-label">Page 3 of 3</p><section class="sheet cheque-sheet" aria-label="Cheque schedule"><h2>Cheque schedule</h2><p>A7 Group Real Estate</p>${schedule.property ? `<p>Property: ${esc(schedule.property)}</p>` : ""}${schedule.tenant ? `<p>Tenant: ${esc(schedule.tenant)}</p>` : ""}<p>Period: ${esc(formatChequeDate(schedule.start) || "—")} to ${esc(formatChequeDate(schedule.end) || "—")}</p><p>Annual rent: ${esc(formatAed(schedule.rent) || "—")} · Payment: ${esc(schedule.paymentMode || "—")}</p><table><thead><tr><th>Cheque amount</th><th>Date</th><th>Name on cheque</th><th>Particulars</th></tr></thead><tbody>${schedule.rows
    .map((item) => `<tr><td>${esc(item.amount)}</td><td>${esc(item.date)}</td><td>${esc(item.name)}</td><td>${esc(item.particular)}</td></tr>`)
    .join("")}</tbody></table></section>`;
}

function tenancyPaperPages(row, token) {
  const layout = tenancyLayout(tenancyFormData(row));
  const signers = row.data?.signers || [];
  const schedule = chequeSchedule(tenancyFormData(row));
  const total = schedule.rows.length ? 3 : 2;
  const pages = [
    { key: "p1", n: 1, fields: layout.p1, dot: layout.usageDot },
    { key: "p2", n: 2, fields: layout.p2 },
  ];
  return `<div class="pages">${pages
    .map((page) => {
      const fields = page.fields
        .map((item) => {
          const pos = pdfTextStyle(item.x, item.y, item.size);
          return `<span class="field" style="left:${pos.left};top:${pos.top};font-size:${pos.fontSize}">${esc(item.text)}</span>`;
        })
        .join("");
      const dot = page.dot
        ? (page.dot.options || [page.dot])
            .map((item) => {
              const on = (item.key || page.dot.selected) === page.dot.selected ? " on" : "";
              return `<span class="usage-radio${on}" style="left:${((item.x / EJARI_PAGE.w) * 100).toFixed(3)}%;top:${(((EJARI_PAGE.h - item.y) / EJARI_PAGE.h) * 100).toFixed(3)}%"></span>`;
            })
            .join("")
        : "";
      const slots = ["tenant", "owner"]
        .map((role) => {
          const signer = signers.find((item) => (role === "owner" ? item.role === "owner" : item.role !== "owner"));
          const image = signerImage(signer);
          return `<div class="sign-slot" style="${signBoxStyle(page.key, role)}">${image ? `<img src="${esc(image)}" alt="" />` : ""}</div>`;
        })
        .join("");
      return `<p class="page-label">Page ${page.n} of ${total}</p><section class="sheet" aria-label="Tenancy contract page ${page.n}"><img class="blank" src="/tc-sign/${esc(token)}/blank/${page.n}" alt="Tenancy contract page ${page.n}" />${fields}${dot}${slots}</section>`;
    })
    .join("")}${tenancyChequeSheetHtml(row)}</div>`;
}

function summaryHtml(contract) {
  return `<div class="grid">${contractSummary(contract)
    .map(([label, value]) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`)
    .join("")}</div>`;
}

function signersHtml(contract) {
  return `<ul class="signers">${contract.signers
    .map((s) => `<li><span>${esc(s.label)}: ${esc(s.name)}</span><span>${s.signed_at ? "Signed" : "Waiting for signature"}</span></li>`)
    .join("")}</ul>`;
}

export function signPageHtml(contract, signer, token) {
  const title = kindLabel(contract.kind);
  return `${head(`Sign ${title}`)}
  <h1>${esc(title)}</h1>
  <p class="lead">Hello <b>${esc(signer.name)}</b>. Please read the ${esc(title.toLowerCase())} for listing <b>${esc(contract.reference)}</b>, then sign below. Your signature is added to the document together with the date, time and network address.</p>
  ${summaryHtml(contract)}
  <a class="pdf" href="/sign/${esc(token)}/pdf" target="_blank" rel="noopener">Open the full contract (PDF)</a>
  ${signersHtml(contract)}
  <div class="box">
    <label>Your full name (as on your ID)</label>
    <input type="text" id="name" value="${esc(signer.name)}" autocomplete="name" />
    <label>Your signature</label>
    <div class="tabs"><button type="button" id="tab-draw" class="on">Draw</button><button type="button" id="tab-type">Type</button></div>
    <div id="pane-draw"><canvas id="pad" width="1200" height="380"></canvas><div class="row"><button type="button" class="btn ghost" id="clear">Clear</button><span class="muted">Sign with your finger or mouse.</span></div></div>
    <div id="pane-type" hidden><div class="typed" id="typed"></div><span class="muted">Your typed name is used as your signature.</span></div>
    <label class="consent"><input type="checkbox" id="consent" /> <span>I have read the contract and I agree that my electronic signature is legally binding, the same as a handwritten signature.</span></label>
    <div class="row"><button type="button" class="btn primary" id="sign">Sign the contract</button></div>
    <div class="status" id="status"></div>
  </div>
  <p class="muted">Link valid until ${esc(new Date(signer.expires_at).toLocaleDateString("en-GB"))}. Questions? Contact your A7 Group agent${contract.data.agent?.name ? `: ${esc(contract.data.agent.name)}` : ""}.</p>
  <script>
  (function () {
    var canvas = document.getElementById('pad');
    var ctx = canvas.getContext('2d');
    var drawing = false, drawn = false, mode = 'draw', last = null;
    function reset() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#141a33'; drawn = false; }
    reset();
    function pos(e) { var r = canvas.getBoundingClientRect(); var p = e.touches ? e.touches[0] : e; return { x: (p.clientX - r.left) * canvas.width / r.width, y: (p.clientY - r.top) * canvas.height / r.height }; }
    function start(e) { drawing = true; last = pos(e); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; e.preventDefault(); }
    function end() { drawing = false; }
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
    document.getElementById('clear').onclick = reset;
    var name = document.getElementById('name'), typed = document.getElementById('typed');
    function syncTyped() { typed.textContent = name.value || ' '; }
    name.addEventListener('input', syncTyped); syncTyped();
    document.getElementById('tab-draw').onclick = function () { mode = 'draw'; this.classList.add('on'); document.getElementById('tab-type').classList.remove('on'); document.getElementById('pane-draw').hidden = false; document.getElementById('pane-type').hidden = true; };
    document.getElementById('tab-type').onclick = function () { mode = 'type'; this.classList.add('on'); document.getElementById('tab-draw').classList.remove('on'); document.getElementById('pane-draw').hidden = true; document.getElementById('pane-type').hidden = false; };
    function typedImage(text) { var c = document.createElement('canvas'); c.width = 1200; c.height = 380; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#141a33'; x.font = '150px "Brush Script MT", "Segoe Script", cursive'; x.textBaseline = 'middle'; x.fillText(text, 60, 200); return c.toDataURL('image/jpeg', 0.9); }
    var status = document.getElementById('status');
    document.getElementById('sign').onclick = function () {
      var n = name.value.trim();
      if (n.length < 3) { status.textContent = 'Please enter your full name.'; return; }
      if (!document.getElementById('consent').checked) { status.textContent = 'Please tick the agreement box.'; return; }
      var image;
      if (mode === 'draw') { if (!drawn) { status.textContent = 'Please draw your signature.'; return; } image = canvas.toDataURL('image/jpeg', 0.9); }
      else { image = typedImage(n); }
      status.style.color = '#555'; status.textContent = 'Saving your signature...';
      this.disabled = true;
      fetch('/sign/${esc(token)}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, signature: image, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'Could not sign'); return b; }); })
        .then(function () { location.href = '/sign/${esc(token)}/done'; })
        .catch(function (e) { status.style.color = '#c0392b'; status.textContent = e.message; document.getElementById('sign').disabled = false; });
    };
  })();
  </script>
  </main></body></html>`;
}

export function signDoneHtml(contract, signer, token) {
  const complete = contract.status === "signed";
  return `${head("Signed")}
  <div class="done"><div class="tick">&#10003;</div>
  <h1>Thank you, ${esc(signer.signed_name || signer.name)}</h1>
  <p class="lead">Your signature on the ${esc(kindLabel(contract.kind).toLowerCase())} for <b>${esc(contract.reference)}</b> was recorded on ${esc(new Date(signer.signed_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }))} (Dubai time).</p>
  ${complete ? `<p>All parties have signed. The final document is ready.</p><a class="pdf" href="/sign/${esc(token)}/pdf" target="_blank" rel="noopener">Download the signed contract (PDF)</a>` : `<p>The other party still needs to sign. You will be able to download the final document from this same link once everyone has signed.</p><a class="pdf" href="/sign/${esc(token)}/pdf" target="_blank" rel="noopener">View the contract with your signature (PDF)</a>`}
  ${signersHtml(contract)}
  </div></main></body></html>`;
}

export function signErrorHtml(message) {
  return `${head("Link not available")}<div class="done"><h1>This link is not available</h1><p class="lead">${esc(message)}</p><p class="muted">Please contact your A7 Group agent for a new link.</p></div></main></body></html>`;
}

export function tenancySignPageHtml(row, signer, token, _summary) {
  const prior = (row.data?.signers || []).find((item) => item.signed_at && item.role !== signer.role);
  const priorNote = prior
    ? ` The ${prior.role === "owner" ? "owner" : "tenant"} has already signed. Their signature is already on the pages above.`
    : "";
  return `${head("Tenancy contract", true, true)}
  <p class="lead">Hello <b>${esc(signer.name)}</b>. Read both contract pages below, then draw your signature at the bottom and press <b>Send back</b>.${priorNote}</p>
  ${tenancyPaperPages(row, token)}
  ${signersHtml({ signers: (row.data?.signers || []).map((s) => ({ label: s.role === "owner" ? "Owner" : "Tenant", name: s.signed_name || s.name, signed_at: s.signed_at })) })}
  <div class="box">
    <label>Your full name (as on your ID)</label>
    <input type="text" id="name" value="${esc(signer.name)}" autocomplete="name" />
    <label>Your signature</label>
    <div class="tabs"><button type="button" id="tab-draw" class="on">Draw</button><button type="button" id="tab-type">Type</button></div>
    <div id="pane-draw"><canvas id="pad" width="1200" height="380"></canvas><div class="row"><button type="button" class="btn ghost" id="clear">Clear</button><span class="muted">Sign with your finger or mouse.</span></div></div>
    <div id="pane-type" hidden><div class="typed" id="typed"></div><span class="muted">Your typed name is used as your signature.</span></div>
    <label class="consent"><input type="checkbox" id="consent" /> <span>I have read the contract and I agree that my electronic signature is legally binding, the same as a handwritten signature. Pressing Send back returns this signed PDF to A7 Group.</span></label>
    <div class="row"><button type="button" class="btn primary" id="sign">Send back</button></div>
    <div class="status" id="status"></div>
  </div>
  <p class="muted">Link valid until ${esc(signer.expires_at ? new Date(signer.expires_at).toLocaleDateString("en-GB") : "the expiry date")}. Questions? Contact your A7 Group agent.</p>
  <script>
  (function () {
    var canvas = document.getElementById('pad');
    var ctx = canvas.getContext('2d');
    var drawing = false, drawn = false, mode = 'draw', last = null;
    function reset() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#141a33'; drawn = false; }
    reset();
    function pos(e) { var r = canvas.getBoundingClientRect(); var p = e.touches ? e.touches[0] : e; return { x: (p.clientX - r.left) * canvas.width / r.width, y: (p.clientY - r.top) * canvas.height / r.height }; }
    function start(e) { drawing = true; last = pos(e); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; e.preventDefault(); }
    function end() { drawing = false; }
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
    document.getElementById('clear').onclick = reset;
    var name = document.getElementById('name'), typed = document.getElementById('typed');
    function syncTyped() { typed.textContent = name.value || ' '; }
    name.addEventListener('input', syncTyped); syncTyped();
    document.getElementById('tab-draw').onclick = function () { mode = 'draw'; this.classList.add('on'); document.getElementById('tab-type').classList.remove('on'); document.getElementById('pane-draw').hidden = false; document.getElementById('pane-type').hidden = true; };
    document.getElementById('tab-type').onclick = function () { mode = 'type'; this.classList.add('on'); document.getElementById('tab-draw').classList.remove('on'); document.getElementById('pane-draw').hidden = true; document.getElementById('pane-type').hidden = false; };
    function typedImage(text) { var c = document.createElement('canvas'); c.width = 1200; c.height = 380; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#141a33'; x.font = '150px "Brush Script MT", "Segoe Script", cursive'; x.textBaseline = 'middle'; x.fillText(text, 60, 200); return c.toDataURL('image/jpeg', 0.9); }
    var status = document.getElementById('status');
    document.getElementById('sign').onclick = function () {
      var n = name.value.trim();
      if (n.length < 3) { status.textContent = 'Please enter your full name.'; return; }
      if (!document.getElementById('consent').checked) { status.textContent = 'Please tick the agreement box.'; return; }
      var image;
      if (mode === 'draw') { if (!drawn) { status.textContent = 'Please draw your signature.'; return; } image = canvas.toDataURL('image/jpeg', 0.9); }
      else { image = typedImage(n); }
      status.style.color = '#555'; status.textContent = 'Sending the signed contract back...';
      this.disabled = true;
      fetch('/tc-sign/${esc(token)}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, signature: image, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'Could not send back'); return b; }); })
        .then(function () { location.href = '/tc-sign/${esc(token)}/done'; })
        .catch(function (e) { status.style.color = '#c0392b'; status.textContent = e.message; document.getElementById('sign').disabled = false; });
    };
  })();
  </script>
  </main></body></html>`;
}

export function tenancySignDoneHtml(row, signer, token, complete) {
  return `${head("Sent back", true, true)}
  <div class="done"><div class="tick">&#10003;</div>
  <h1>Sent back, ${esc(signer.signed_name || signer.name)}</h1>
  <p class="lead">Your signed tenancy contract for <b>${esc(row.title)}</b> was returned to A7 Group on ${esc(new Date(signer.signed_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }))} (Dubai time).</p>
  ${complete ? `<p>All invited parties have signed. The signed PDF is now on the Tenancy Contract board.</p>` : `<p>Your copy was sent back. The other party still needs to sign before the contract is fully signed.</p>`}
  </div>
  ${tenancyPaperPages(row, token)}
  ${signersHtml({ signers: (row.data?.signers || []).map((s) => ({ label: s.role === "owner" ? "Owner" : "Tenant", name: s.signed_name || s.name, signed_at: s.signed_at })) })}
  </main></body></html>`;
}

export function nocSignPageHtml(row, signer, token, label) {
  const title = label || "NOC";
  return `${head(`Sign ${title}`)}
  <h1>${esc(title)}</h1>
  <p class="lead">Hello <b>${esc(signer.name || "there")}</b>. Please read the ${esc(title)}, sign below, then press <b>Send back</b>. The signed PDF returns to A7 Group's signed NOC list.</p>
  <div class="grid"><div><span>Document</span><b>${esc(row.title || title)}</b></div><div><span>Owner</span><b>${esc(row.owner_name || row.data?.ownerName || "—")}</b></div></div>
  <a class="pdf" href="/noc-sign/${esc(token)}/pdf" target="_blank" rel="noopener">Open the full NOC (PDF)</a>
  <div class="box">
    <label>Your full name (as on your ID)</label>
    <input type="text" id="name" value="${esc(signer.name)}" autocomplete="name" />
    <label>Your signature</label>
    <div class="tabs"><button type="button" id="tab-draw" class="on">Draw</button><button type="button" id="tab-type">Type</button></div>
    <div id="pane-draw"><canvas id="pad" width="1200" height="380"></canvas><div class="row"><button type="button" class="btn ghost" id="clear">Clear</button><span class="muted">Sign with your finger or mouse.</span></div></div>
    <div id="pane-type" hidden><div class="typed" id="typed"></div><span class="muted">Your typed name is used as your signature.</span></div>
    <label class="consent"><input type="checkbox" id="consent" /> <span>I have read this NOC and I agree that my electronic signature is legally binding, the same as a handwritten signature. Pressing Send back returns this signed PDF to A7 Group.</span></label>
    <div class="row"><button type="button" class="btn primary" id="sign">Send back</button></div>
    <div class="status" id="status"></div>
  </div>
  <p class="muted">Link valid until ${esc(signer.expires_at ? new Date(signer.expires_at).toLocaleDateString("en-GB") : "the expiry date")}. Questions? Contact your A7 Group agent.</p>
  <script>
  (function () {
    var canvas = document.getElementById('pad');
    var ctx = canvas.getContext('2d');
    var drawing = false, drawn = false, mode = 'draw', last = null;
    function reset() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#141a33'; drawn = false; }
    reset();
    function pos(e) { var r = canvas.getBoundingClientRect(); var p = e.touches ? e.touches[0] : e; return { x: (p.clientX - r.left) * canvas.width / r.width, y: (p.clientY - r.top) * canvas.height / r.height }; }
    function start(e) { drawing = true; last = pos(e); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; e.preventDefault(); }
    function end() { drawing = false; }
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
    document.getElementById('clear').onclick = reset;
    var name = document.getElementById('name'), typed = document.getElementById('typed');
    function syncTyped() { typed.textContent = name.value || ' '; }
    name.addEventListener('input', syncTyped); syncTyped();
    document.getElementById('tab-draw').onclick = function () { mode = 'draw'; this.classList.add('on'); document.getElementById('tab-type').classList.remove('on'); document.getElementById('pane-draw').hidden = false; document.getElementById('pane-type').hidden = true; };
    document.getElementById('tab-type').onclick = function () { mode = 'type'; this.classList.add('on'); document.getElementById('tab-draw').classList.remove('on'); document.getElementById('pane-draw').hidden = true; document.getElementById('pane-type').hidden = false; };
    function typedImage(text) { var c = document.createElement('canvas'); c.width = 1200; c.height = 380; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#141a33'; x.font = '150px "Brush Script MT", "Segoe Script", cursive'; x.textBaseline = 'middle'; x.fillText(text, 60, 200); return c.toDataURL('image/jpeg', 0.9); }
    var status = document.getElementById('status');
    document.getElementById('sign').onclick = function () {
      var n = name.value.trim();
      if (n.length < 3) { status.textContent = 'Please enter your full name.'; return; }
      if (!document.getElementById('consent').checked) { status.textContent = 'Please tick the agreement box.'; return; }
      var image;
      if (mode === 'draw') { if (!drawn) { status.textContent = 'Please draw your signature.'; return; } image = canvas.toDataURL('image/jpeg', 0.9); }
      else { image = typedImage(n); }
      status.style.color = '#555'; status.textContent = 'Sending the signed NOC back...';
      this.disabled = true;
      fetch('/noc-sign/${esc(token)}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, signature: image }) })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'Could not send back'); return b; }); })
        .then(function () { location.href = '/noc-sign/${esc(token)}/done'; })
        .catch(function (e) { status.style.color = '#c0392b'; status.textContent = e.message; document.getElementById('sign').disabled = false; });
    };
  })();
  </script>
  </main></body></html>`;
}

export function nocSignDoneHtml(row, signer, token, label) {
  return `${head("Sent back")}
  <div class="done"><div class="tick">&#10003;</div>
  <h1>Sent back, ${esc(signer.signed_name || signer.name)}</h1>
  <p class="lead">Your signed ${esc(label || "NOC")} for <b>${esc(row.title)}</b> was returned to A7 Group on ${esc(new Date(signer.signed_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }))} (Dubai time).</p>
  <p>The signed PDF is now on the signed NOC list.</p>
  <a class="pdf" href="/noc-sign/${esc(token)}/pdf" target="_blank" rel="noopener">Download the signed copy (PDF)</a>
  </div></main></body></html>`;
}

function chequePropertyLabel(row) {
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  return [data.propertyNo, data.building, data.location].map((part) => String(part || "").trim()).filter(Boolean).join(" · ");
}

export function chequeVerifyPageHtml(row, receipt, token) {
  const ownerName = String(row?.owner_name || row?.data?.landlordName || row?.data?.ownerName || "").trim();
  const property = chequePropertyLabel(row);
  const cheque = [receipt?.particular, receipt?.amount, receipt?.date].filter(Boolean).join(" · ") || "Cheque";
  const until = receipt?.expires_at ? new Date(receipt.expires_at).toLocaleDateString("en-GB") : "the expiry date";
  const pdf = String(receipt?.proofMime || "").includes("pdf") || receipt?.crop === "pdf";
  const proof = pdf
    ? `<a class="pdf" href="/tc-cheque/${esc(token)}/photo" target="_blank" rel="noopener">Open the cheque PDF</a><iframe class="proof-pdf" src="/tc-cheque/${esc(token)}/photo" title="Cheque PDF"></iframe>`
    : `<img class="proof" src="/tc-cheque/${esc(token)}/photo" alt="Received part of the cheque" />`;
  return `${head("Confirm cheque received")}
  <h1>Confirm you received this cheque</h1>
  <p class="lead">Hello <b>${esc(ownerName || "Owner")}</b>. A7 Group needs you to verify that this cheque reached you. Write that you received it, draw your signature, then press <b>Send back</b>. Both the note and the signature are required.</p>
  <div class="grid">
    ${property ? `<div><span>Property</span><b>${esc(property)}</b></div>` : ""}
    <div><span>Cheque</span><b>${esc(cheque)}</b></div>
  </div>
  ${proof}
  <div class="box">
    <label for="note">Note — write that you received this cheque</label>
    <textarea id="note" placeholder="I confirm I received this cheque."></textarea>
    <label for="name">Your full name</label>
    <input type="text" id="name" value="${esc(ownerName)}" autocomplete="name" />
    <label>Draw your signature</label>
    <canvas id="pad" width="1200" height="380" aria-label="Signature pad"></canvas>
    <div class="row"><button type="button" class="btn ghost" id="clear">Clear</button><span class="muted">Sign with your finger or mouse.</span></div>
    <div class="row"><button type="button" class="btn primary" id="sign">Send back</button></div>
    <div class="status" id="status"></div>
  </div>
  <p class="muted">The tenant is not copied on this page. Link valid until ${esc(until)}. Questions? Contact your A7 Group agent.</p>
  <script>
  (function () {
    var canvas = document.getElementById('pad');
    var ctx = canvas.getContext('2d');
    var drawing = false, drawn = false, last = null;
    function reset() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#141a33'; drawn = false; }
    reset();
    function pos(e) { var r = canvas.getBoundingClientRect(); var p = e.touches ? e.touches[0] : e; return { x: (p.clientX - r.left) * canvas.width / r.width, y: (p.clientY - r.top) * canvas.height / r.height }; }
    function start(e) { drawing = true; last = pos(e); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; e.preventDefault(); }
    function end() { drawing = false; }
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);
    document.getElementById('clear').onclick = reset;
    var status = document.getElementById('status');
    document.getElementById('sign').onclick = function () {
      var note = document.getElementById('note').value.trim();
      var n = document.getElementById('name').value.trim();
      if (note.length < 8) { status.textContent = 'Please write that you received this cheque.'; return; }
      if (n.length < 3) { status.textContent = 'Please enter your full name.'; return; }
      if (!drawn) { status.textContent = 'Please draw your signature.'; return; }
      status.style.color = '#555'; status.textContent = 'Sending your confirmation...';
      this.disabled = true;
      fetch('/tc-cheque/${esc(token)}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, note: note, signature: canvas.toDataURL('image/jpeg', 0.9) }) })
        .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || 'Could not send back'); return b; }); })
        .then(function () { location.href = '/tc-cheque/${esc(token)}/done'; })
        .catch(function (e) { status.style.color = '#c0392b'; status.textContent = e.message; document.getElementById('sign').disabled = false; });
    };
  })();
  </script>
  </main></body></html>`;
}

export function chequeVerifyDoneHtml(row, receipt) {
  const when = receipt?.verifiedAt ? new Date(receipt.verifiedAt).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) : "";
  const name = String(receipt?.signedName || row?.owner_name || "Owner").trim();
  return `${head("Cheque confirmed")}
  <div class="done"><div class="tick">&#10003;</div>
  <h1>Sent back, ${esc(name)}</h1>
  <p class="lead">You confirmed that you received the cheque${when ? ` on ${esc(when)} (Dubai time)` : ""}.</p>
  <p>A7 Group will send the acknowledgment to the tenant. They do not see this page or your email.</p>
  </div></main></body></html>`;
}
