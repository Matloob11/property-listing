import { locationPath } from "./listingModel.js";

function escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function brochureHtml(listing, agentName) {
  const portals = (listing.portals || []).join(", ") || "None";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escape(listing.reference)} brochure</title>
  <style>
    body { font-family: Georgia, serif; color: #1a1612; margin: 32px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .meta { color: #6b5e4e; font-family: Consolas, monospace; }
    img { max-width: 100%; height: 280px; object-fit: cover; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    td { border-bottom: 1px solid #ddd; padding: 8px 4px; }
    .label { width: 220px; color: #6b5e4e; }
  </style>
</head>
<body>
  <p class="meta">A7 Group · Property Listing New${agentName ? ` · Prepared by ${escape(agentName)}` : ""}</p>
  <h1>${escape(listing.title)}</h1>
  <p class="meta">${escape(listing.reference)} · ${escape(locationPath(listing))}</p>
  ${listing.photo ? `<p><img src="${escape(listing.photo)}" alt="" /></p>` : ""}
  ${(listing.gallery || [])
    .filter((item) => item.url && item.url !== listing.photo)
    .slice(0, 6)
    .map((item) => `<p><img src="${escape(item.url)}" alt="" /></p>`)
    .join("")}
  ${listing.description ? `<p>${escape(listing.description)}</p>` : ""}
  ${(listing.amenities || []).length ? `<p>Amenities: ${escape((listing.amenities || []).join(", "))}</p>` : ""}
  <table>
    <tr><td class="label">Type</td><td>${escape(listing.type)} / ${escape(listing.purpose)}</td></tr>
    <tr><td class="label">Category</td><td>${escape(listing.category)}</td></tr>
    <tr><td class="label">Layout</td><td>${listing.beds} bed / ${listing.baths} bath / ${listing.area_sqft} sqft</td></tr>
    <tr><td class="label">Price</td><td>${listing.hide_price ? "Price on request" : `AED ${Number(listing.price_aed).toLocaleString()}`}</td></tr>
    <tr><td class="label">Unit / Permit</td><td>${escape(listing.unit_no)} / ${escape(listing.permit_number)}</td></tr>
    <tr><td class="label">Agent / Owner</td><td>${escape(listing.listing_agent)} / ${escape(listing.listing_owner)}</td></tr>
    <tr><td class="label">Landlord</td><td>${escape(listing.landlord_name)} ${escape(listing.landlord_phone)}</td></tr>
    <tr><td class="label">Developer</td><td>${escape(listing.developer)}</td></tr>
    <tr><td class="label">Project status</td><td>${escape(listing.project_status)}</td></tr>
    <tr><td class="label">Portals</td><td>${escape(portals)}</td></tr>
    <tr><td class="label">Portal expiry</td><td>${escape(listing.portal_expiry || "N/A")}</td></tr>
  </table>
</body>
</html>`;
}

function pdfEscape(value) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, (char) => {
      if (char === "·") return "-";
      if (char === "—") return "-";
      return " ";
    })
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

export function listingPdf(listing, agentName) {
  const lines = [
    "A7 GROUP REAL ESTATE",
    agentName ? `Prepared by ${agentName}` : "Listing brochure",
    "",
    listing.title || "",
    listing.reference || "",
    locationPath(listing),
    "",
    `Purpose: ${listing.purpose || "-"}`,
    `Type: ${listing.type || "-"} / ${listing.category || "-"}`,
    `Layout: ${listing.beds ?? 0} bed / ${listing.baths ?? 0} bath / ${listing.area_sqft ?? 0} sqft`,
    listing.hide_price ? "Price: on request" : `Price: AED ${Number(listing.price_aed || 0).toLocaleString("en-US")}`,
    `Unit: ${listing.unit_no || "-"}`,
    `Permit: ${listing.permit_number || "-"}`,
    `Agent: ${listing.listing_agent || "-"}`,
    `Owner: ${listing.listing_owner || "-"}`,
    `Developer: ${listing.developer || "-"}`,
    `Portals: ${(listing.portals || []).join(", ") || "None"}`,
    `Portal expiry: ${listing.portal_expiry || "N/A"}`,
  ];
  const commands = ["q", "0 w", "0 Tr", "BT", "0 Tc", "0 Tw", "/F1 11 Tf", "16 TL", "48 780 Td"];
  for (const [index, line] of lines.entries()) {
    if (index) commands.push("T*");
    commands.push(`(${pdfEscape(line)}) Tj`);
  }
  commands.push("ET", "Q");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startxref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

export function publicListingHtml(listing, agentName) {
  const contact = agentName || listing.listing_agent || "A7 Group";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escape(listing.title)} · ${escape(listing.reference)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    body { margin:0; background:#f7f8fb; color:#3f4254; font-family:Poppins,sans-serif; }
    main { width:min(760px, calc(100% - 32px)); margin:24px auto 48px; background:#fff; border-radius:16px; padding:24px; box-shadow:0 10px 30px rgba(24,28,50,.06); }
    .ref { color:#a1a5b7; font-size:12px; letter-spacing:.04em; }
    h1 { margin:6px 0 8px; font-size:26px; color:#181c32; }
    .loc { color:#7e8299; margin-bottom:18px; }
    img { width:100%; max-height:360px; object-fit:cover; border-radius:12px; }
    .thumbs { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:12px 0 0; }
    .thumbs img { height:88px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px 18px; margin-top:20px; }
    .item span { display:block; color:#a1a5b7; font-size:11px; }
    .item b { font-weight:600; color:#181c32; }
    .copy { margin-top:22px; line-height:1.6; white-space:pre-wrap; }
    .tags { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
    .tags span { background:#f3f6f9; border-radius:99px; padding:6px 10px; font-size:12px; }
    .agent { margin-top:22px; padding:14px 16px; background:#f3f6f9; border-radius:12px; }
  </style>
</head>
<body>
  <main>
    <div class="ref">${escape(listing.reference)}</div>
    <h1>${escape(listing.title)}</h1>
    <div class="loc">${escape(locationPath(listing))}</div>
    ${listing.photo ? `<p><img src="${escape(listing.photo)}" alt="" /></p>` : ""}
    ${(listing.gallery || []).filter((item) => item.url && item.url !== listing.photo).length
      ? `<div class="thumbs">${(listing.gallery || [])
          .filter((item) => item.url && item.url !== listing.photo)
          .slice(0, 8)
          .map((item) => `<img src="${escape(item.url)}" alt="" />`)
          .join("")}</div>`
      : ""}
    <div class="grid">
      <div class="item"><span>Purpose</span><b>${escape(listing.purpose)}</b></div>
      <div class="item"><span>Type</span><b>${escape(listing.type)} / ${escape(listing.category)}</b></div>
      <div class="item"><span>Layout</span><b>${listing.beds} bed / ${listing.baths} bath / ${listing.area_sqft} sqft</b></div>
      <div class="item"><span>Price</span><b>${listing.hide_price ? "Price on request" : `AED ${Number(listing.price_aed || 0).toLocaleString()}`}</b></div>
      <div class="item"><span>Community</span><b>${escape(listing.community || "-")}</b></div>
      <div class="item"><span>Building</span><b>${escape(listing.building || "-")}</b></div>
      <div class="item"><span>Unit</span><b>${escape(listing.unit_no || "-")}</b></div>
      <div class="item"><span>Permit</span><b>${escape(listing.permit_number || "-")}</b></div>
    </div>
    ${listing.description ? `<div class="copy">${escape(listing.description)}</div>` : ""}
    ${(listing.amenities || []).length
      ? `<div class="tags">${(listing.amenities || [])
          .map((item) => `<span>${escape(item)}</span>`)
          .join("")}</div>`
      : ""}
    <div class="agent">Contact agent: <b>${escape(contact)}</b></div>
  </main>
</body>
</html>`;
}

export function dldSvg(listing) {
  const permit = listing.permit_number || listing.reference;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
  <rect width="900" height="520" fill="#f4efe4"/>
  <rect x="24" y="24" width="852" height="472" fill="none" stroke="#1d4d3a" stroke-width="4"/>
  <text x="48" y="80" font-family="Georgia" font-size="28" fill="#1d4d3a">Dubai Land Department</text>
  <text x="48" y="118" font-family="Consolas" font-size="16" fill="#6b5e4e">Advertisement permit (desk copy)</text>
  <text x="48" y="180" font-family="Georgia" font-size="22" fill="#16120e">${escape(listing.title).slice(0, 60)}</text>
  <text x="48" y="230" font-family="Consolas" font-size="18" fill="#16120e">Permit ${escape(permit)}</text>
  <text x="48" y="270" font-family="Consolas" font-size="16" fill="#16120e">Ref ${escape(listing.reference)}</text>
  <text x="48" y="310" font-family="Consolas" font-size="16" fill="#16120e">${escape(locationPath(listing))}</text>
  <text x="48" y="350" font-family="Consolas" font-size="16" fill="#16120e">${listing.hide_price ? "Price on request" : `AED ${Number(listing.price_aed).toLocaleString()}`} - ${escape(listing.purpose)}</text>
  <rect x="680" y="300" width="160" height="160" fill="#1d4d3a"/>
  <text x="760" y="388" text-anchor="middle" font-family="Consolas" font-size="14" fill="#f4efe4">QR</text>
</svg>`;
}
