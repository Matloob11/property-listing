// Fills fields that Property Finder does not provide (permit, unit, landlord, developer, permit dates,
// BUA, plot, listing source, project status, owner, extra portal flags) from the old desk CSV export.
// Matching is by exact reference AND a property sanity check (type / size / beds / community / purpose).
//   node server/scripts/importOldCsv.js <file.csv> [--apply]
import fs from "node:fs";
import { loadEnv } from "../loadEnv.js";
import { openDb } from "../db.js";

loadEnv();
const [, , file, ...flags] = process.argv;
const APPLY = flags.includes("--apply");
if (!file) {
  console.error("usage: importOldCsv.js <file.csv> [--apply]");
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

const BACKSLASH_QUOTE = String.fromCharCode(92) + "'";
const clean = (v) => String(v ?? "").split(BACKSLASH_QUOTE).join("'").replace(/\s+/g, " ").trim();
const yes = (v) => /^yes$/i.test(clean(v));
const TYPE_MAP = {
  apartment: "apartment", villa: "villa", townhouse: "townhouse", penthouse: "penthouse", shop: "shop", retail: "retail",
  "residential land": "land", "commercial land": "land", "land/plot": "land", "office space": "office", office: "office",
  warehouse: "warehouse", "hotel apartment": "hotel_apartment", factory: "warehouse", duplex: "duplex", showroom: "showroom",
};
const PS_MAP = { "ready secondary": "ready_secondary", "off-plan secondary": "offplan_secondary", "ready primary": "ready_primary", "off-plan primary": "offplan_primary" };
const PORTAL_COLS = { bayut: 29, dubizzle: 30, houza: 31, trb: 33, simsari: 34, sudonum: 37, properstar: 38, website: 41 };

function dateIso(v) {
  const s = clean(v);
  if (!s) return "";
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (a) return `${a[1]}-${a[2]}-${a[3]}`;
  const b = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
  if (b) return `${b[3]}-${b[2]}-${b[1]}`;
  return "";
}

const rows = parseCsv(fs.readFileSync(file, "utf8"));
const header = rows[0];
if (clean(header[0]) !== "REF ID#" || clean(header[1]) !== "RERA PERMIT NUMBER" || clean(header[11]) !== "UNIT NUMBER" || clean(header[42]) !== "Landlord Name") {
  console.error("Unexpected CSV columns, aborting:", header.slice(0, 12));
  process.exit(1);
}
const data = rows.slice(1).filter((r) => r.length === header.length);

const db = await openDb();
const listings = await db.all();
const byRef = new Map();
for (const row of listings) {
  const key = clean(row.reference).toLowerCase();
  if (key) byRef.set(key, (byRef.get(key) || []).concat(row));
}

const report = { total: data.length, matched: 0, applied: 0, unchanged: 0, skipped_no_listing: 0, skipped_sanity: [], duplicate_ref: [], agents_added: 0, fields: {} };
const agentsSeen = new Set();

for (const r of data) {
  const ref = clean(r[0]).toLowerCase();
  const hits = byRef.get(ref) || [];
  if (!hits.length) {
    report.skipped_no_listing += 1;
    continue;
  }
  if (hits.length > 1) {
    report.duplicate_ref.push(ref);
    continue;
  }
  const L = hits[0];
  report.matched += 1;

  // sanity check: the CSV row must describe the same property as the desk listing
  const csvType = TYPE_MAP[clean(r[7]).toLowerCase()] || "";
  const csvSize = Number(clean(r[6]).replace(/[^\d.]/g, "")) || 0;
  const csvBeds = clean(r[13]) === "" ? null : Number(clean(r[13]));
  const csvCommunity = clean(r[3]).toLowerCase();
  const csvSub = clean(r[4]).toLowerCase();
  const csvPurpose = clean(r[9]).toLowerCase() === "rent" ? "rent" : "sale";
  const deskSize = Number(L.area_sqft) || 0;
  const places = [L.community, L.sub_community, L.building, L.city].map((x) => clean(x).toLowerCase()).filter(Boolean);
  const checks = {
    type: Boolean(csvType) && csvType === L.type,
    size: csvSize > 0 && deskSize > 0 && Math.abs(csvSize - deskSize) / Math.max(csvSize, deskSize) <= 0.15,
    beds: csvBeds !== null && csvBeds === Number(L.beds),
    community: Boolean(csvCommunity) && places.some((x) => x === csvCommunity || x === csvSub || x.includes(csvCommunity) || csvCommunity.includes(x)),
    purpose: csvPurpose === L.purpose,
  };
  const score = Object.values(checks).filter(Boolean).length;
  if (score < 3 || !checks.purpose) {
    report.skipped_sanity.push({ ref: clean(r[0]), csv: { type: csvType, size: csvSize, beds: csvBeds, community: clean(r[3]), purpose: csvPurpose }, desk: { type: L.type, size: deskSize, beds: L.beds, community: L.community, purpose: L.purpose }, checks });
    continue;
  }

  const patch = {};
  const set = (key, value, { onlyIfEmpty = true } = {}) => {
    const v = clean(value);
    if (!v) return;
    if (onlyIfEmpty && clean(L[key])) return;
    if (clean(L[key]) === v) return;
    patch[key] = v;
    report.fields[key] = (report.fields[key] || 0) + 1;
  };
  set("permit_number", r[1]);
  set("unit_no", r[11] || r[10]);
  set("built_up_area", r[12]);
  set("landlord_name", r[42]);
  set("landlord_email", r[43]);
  set("landlord_phone", r[44]);
  set("developer", r[17]);
  set("permit_issue_date", dateIso(r[50]));
  set("permit_expiry_date", dateIso(r[51]));
  set("portal_expiry", dateIso(r[51]));
  const plot = Number(clean(r[52]).replace(/[^\d.]/g, "")) || 0;
  if (plot > 0) set("plot_size", String(plot));
  set("listing_source", r[53]);
  set("project_status", PS_MAP[clean(r[48]).toLowerCase()] || "", { onlyIfEmpty: false });
  set("listing_owner", r[27], { onlyIfEmpty: false });
  set("created_by", r[22], { onlyIfEmpty: false });
  const portals = new Set(L.portals || []);
  for (const [portal, col] of Object.entries(PORTAL_COLS)) if (yes(r[col])) portals.add(portal);
  const nextPortals = [...portals];
  if (nextPortals.length !== (L.portals || []).length) {
    patch.portals = nextPortals;
    report.fields.portals = (report.fields.portals || 0) + 1;
  }

  const agentName = clean(r[24]);
  if (agentName && !agentsSeen.has(agentName)) {
    agentsSeen.add(agentName);
    if (APPLY) {
      await db.addPerson({ kind: "agent", name: agentName, email: clean(r[26]), phone: clean(r[25]) }).then(() => { report.agents_added += 1; }).catch(() => {});
    }
  }

  if (!Object.keys(patch).length) {
    report.unchanged += 1;
    continue;
  }
  report.applied += 1;
  if (APPLY) {
    await db.updateDirect(L, patch, "Old desk CSV import");
  }
}

report.mode = APPLY ? "APPLIED" : "DRY RUN";
report.sanity_skipped_count = report.skipped_sanity.length;
console.log(JSON.stringify({ ...report, skipped_sanity: report.skipped_sanity.slice(0, 40) }, null, 1));
process.exit(0);
