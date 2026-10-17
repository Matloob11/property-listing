// Apply PF / Bayut / Dubizzle portal ticks from the old-desk Properties Listing CSV.
// Updates matching desk rows. Creates missing Active rows so they appear on the desk.
//   node server/scripts/importPortalList.js <file.csv> [--apply]
import fs from "node:fs";
import { loadEnv } from "../loadEnv.js";
import { openDb } from "../db.js";
import { autoTitle } from "../listingModel.js";

loadEnv();
const [, , file, ...flags] = process.argv;
const APPLY = flags.includes("--apply");
if (!file) {
  console.error("usage: importPortalList.js <file.csv> [--apply]");
  process.exit(1);
}

function parseCsv(t) {
  const rows = [];
  let row = [];
  let f = "";
  let q = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          f += '"';
          i += 1;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i += 1;
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

const clean = (v) => String(v ?? "").replace(/\r/g, "").replace(/\s+/g, " ").trim();
const yes = (v) => /^yes$/i.test(clean(v));
const TYPE_MAP = {
  apartment: "apartment",
  villa: "villa",
  townhouse: "townhouse",
  penthouse: "penthouse",
  shop: "shop",
  retail: "retail",
  "residential land": "land",
  "commercial land": "land",
  "land/plot": "land",
  "office space": "office",
  office: "office",
  warehouse: "warehouse",
  "hotel apartment": "hotel_apartment",
  factory: "warehouse",
  duplex: "duplex",
  showroom: "showroom",
};
const PS_MAP = {
  "ready secondary": "ready_secondary",
  "off-plan secondary": "offplan_secondary",
  "ready primary": "ready_primary",
  "off-plan primary": "offplan_primary",
};

function titleFromUrl(url, fallback) {
  const slug = /\/properties\/([^/?#]+)/i.exec(clean(url) || "");
  if (!slug) return fallback;
  return slug[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function portalsFromRow(r, keepPfLive) {
  const out = [];
  if (yes(r[28]) || keepPfLive) out.push("pf");
  if (yes(r[29])) out.push("bayut");
  if (yes(r[30])) out.push("dubizzle");
  if (yes(r[41])) out.push("website");
  return out;
}

function samePortals(a, b) {
  const left = [...new Set(a || [])].sort().join(",");
  const right = [...new Set(b || [])].sort().join(",");
  return left === right;
}

function listingFromCsv(r) {
  const type = TYPE_MAP[clean(r[7]).toLowerCase()] || "apartment";
  const purpose = clean(r[9]).toLowerCase() === "rent" ? "rent" : "sale";
  const category = /commerc/i.test(clean(r[8])) ? "commercial" : "residential";
  const loc = clean(r[2]).split(">").map((x) => x.trim()).filter(Boolean);
  const beds = Number(clean(r[13])) || 0;
  const draft = {
    reference: clean(r[0]),
    type,
    purpose,
    category,
    beds,
    baths: Number(clean(r[14])) || 0,
    area_sqft: Number(clean(r[6]).replace(/[^\d.]/g, "")) || 0,
    price_aed: Number(clean(r[15]).replace(/[^\d.]/g, "")) || 0,
    city: loc[0] || "Dubai",
    community: clean(r[3]) || loc[1] || "",
    sub_community: clean(r[4]) || loc[2] || "",
    building: clean(r[5]) || loc[3] || "",
    location_text: clean(r[2]),
    unit_no: clean(r[11] || r[10]),
    permit_number: clean(r[1]),
    landlord_name: clean(r[42]),
    landlord_email: clean(r[43]),
    landlord_phone: clean(r[44]),
    developer: clean(r[17]),
    listing_agent: clean(r[24]),
    listing_owner: clean(r[27] || r[46]),
    created_by: clean(r[22]),
    project_status: PS_MAP[clean(r[48]).toLowerCase()] || "ready_secondary",
    listing_source: clean(r[53]) || "old desk csv",
    built_up_area: clean(r[12]),
    status: "live",
    portals: portalsFromRow(r, false),
    price_yearly: purpose === "rent" ? clean(r[15]) : "",
    sale_price: purpose === "sale" ? clean(r[15]) : "",
  };
  draft.title = titleFromUrl(r[49], autoTitle(draft));
  return draft;
}

const rows = parseCsv(fs.readFileSync(file, "utf8"));
const header = rows[0] || [];
if (!/property finder/i.test(clean(header[28])) || !/^bayut$/i.test(clean(header[29])) || !/^dubizzle$/i.test(clean(header[30]))) {
  console.error("Unexpected portal columns:", header[28], header[29], header[30]);
  process.exit(1);
}
const data = rows.slice(1).filter((r) => clean(r[0]));

const db = await openDb();
const listings = await db.all();
const byRef = new Map(listings.map((row) => [clean(row.reference).toLowerCase(), row]));

const report = {
  csv: data.length,
  updated: 0,
  unchanged: 0,
  created: 0,
  skipped_inactive_missing: 0,
  skipped_duplicate: 0,
  add_pf: 0,
  add_bayut: 0,
  add_dubizzle: 0,
  samples: [],
};

for (const r of data) {
  const ref = clean(r[0]).toLowerCase();
  const existing = byRef.get(ref);
  const active = clean(r[45]) === "Active";
  if (!existing) {
    if (!active) {
      report.skipped_inactive_missing += 1;
      continue;
    }
    report.created += 1;
    if (report.samples.length < 12) {
      report.samples.push({ action: "create", ref: clean(r[0]), portals: portalsFromRow(r, false) });
    }
    if (APPLY) {
      const created = await db.create(listingFromCsv(r), "Portal list CSV");
      byRef.set(ref, created);
    }
    continue;
  }

  const keepPf = existing.pf_is_live === "1" || existing.pf_state === "live";
  const wanted = new Set(portalsFromRow(r, keepPf));
  const kept = (existing.portals || []).filter((p) => !["pf", "bayut", "dubizzle", "website"].includes(p));
  const next = [...new Set([...kept, ...wanted])];
  if (samePortals(existing.portals, next)) {
    report.unchanged += 1;
    continue;
  }
  const before = new Set(existing.portals || []);
  if (next.includes("pf") && !before.has("pf")) report.add_pf += 1;
  if (next.includes("bayut") && !before.has("bayut")) report.add_bayut += 1;
  if (next.includes("dubizzle") && !before.has("dubizzle")) report.add_dubizzle += 1;
  report.updated += 1;
  if (report.samples.length < 12) {
    report.samples.push({ action: "update", ref: clean(r[0]), from: existing.portals || [], to: next });
  }
  if (APPLY) {
    await db.updateDirect(existing, { portals: next }, "Portal list CSV");
  }
}

report.mode = APPLY ? "APPLIED" : "DRY RUN";
console.log(JSON.stringify(report, null, 2));
process.exit(0);
