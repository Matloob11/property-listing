// Imports listings from the old Property Listing app (CSV export or JSON rows).
import { PORTALS, STATUSES, TYPES } from "./listingModel.js";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header = [], ...body] = rows.filter((line) => line.some((value) => String(value).trim()));
  const keys = header.map((key) => normalizeKey(key));
  return body.map((line) =>
    Object.fromEntries(keys.map((key, index) => [key, String(line[index] ?? "").trim()]))
  );
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ALIASES = {
  reference: ["reference", "reference_number", "ref", "listing_id", "property_id", "id", "ref_no"],
  title: ["title", "listing_title", "name", "title_en"],
  title_ar: ["title_ar", "listing_title_ar", "arabic_title"],
  description: ["description", "description_en", "desc"],
  description_ar: ["description_ar", "arabic_description"],
  city: ["city", "emirate"],
  community: ["community", "location", "area"],
  sub_community: ["sub_community", "subcommunity", "sub_location"],
  building: ["building", "buildings", "tower", "building_name", "property_name"],
  unit_no: ["unit_no", "unit", "unit_number"],
  permit_number: ["permit_number", "permit_no", "rera_permit_number", "permit", "trakheesi"],
  type: ["type", "property_type"],
  purpose: ["purpose", "offering_type", "listing_type"],
  category: ["category"],
  project_status: ["project_status", "completion_status"],
  status: ["status", "listing_status"],
  beds: ["beds", "bedrooms", "bedroom", "no_of_bedrooms"],
  baths: ["baths", "bathrooms", "bathroom", "no_of_bathrooms"],
  area_sqft: ["area_sqft", "size", "area", "size_sqft", "built_up_area_sqft"],
  price_aed: ["price_aed", "price", "sale_price", "amount"],
  price_yearly: ["price_yearly", "price_year", "yearly", "yearly_price"],
  price_monthly: ["price_monthly", "price_month", "monthly", "monthly_price"],
  price_weekly: ["price_weekly", "price_week", "weekly", "weekly_price"],
  price_daily: ["price_daily", "price_day", "daily", "daily_price"],
  listing_agent: ["listing_agent", "agent", "agent_name", "listing_agent_name"],
  listing_owner: ["listing_owner", "owner", "owner_name", "listing_owner_name"],
  landlord_name: ["landlord_name", "landlord"],
  landlord_email: ["landlord_email"],
  landlord_phone: ["landlord_phone", "landlord_contact", "landlord_mobile"],
  developer: ["developer", "developers"],
  portal_expiry: ["portal_expiry", "expiry_date", "expiry_date_from_portals", "expiry"],
  permit_issue_date: ["permit_issue_date", "rera_permit_issue_date"],
  permit_expiry_date: ["permit_expiry_date", "rera_permit_expiration_date", "permit_expiration_date"],
  furnished: ["furnished"],
  parking: ["parking", "no_parking_spaces", "parking_spaces"],
  plot_size: ["plot_size", "total_plot_size"],
  lot_size: ["lot_size"],
  built_up_area: ["built_up_area", "bua"],
  layout_type: ["layout_type", "layout"],
  project_name: ["project_name", "project"],
  ownership: ["ownership", "freehold"],
  build_year: ["build_year", "year_built"],
  listing_source: ["listing_source", "source"],
  payment_method: ["payment_method"],
  cheques: ["cheques", "number_of_cheques"],
  service_charges: ["service_charges", "service_charge"],
  financial_status: ["financial_status", "financial"],
  available_from: ["available_from", "availability_date"],
  photo: ["photo", "image", "main_image", "cover"],
  portals: ["portals", "portal"],
  created_at: ["created_at", "created", "date_created", "creation_date"],
  updated_at: ["updated_at", "updated", "last_update"],
  created_by: ["created_by"],
  amenities: ["amenities", "private_amenities"],
  youtube_link: ["youtube_link", "youtube"],
  video_link: ["video_link", "video"],
  qrcode_link: ["qrcode_link", "qr_code", "qrcodelink"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long"],
  dtcm_permit: ["dtcm_permit", "dtcm"],
  notes: ["notes", "note", "remarks"],
  title_deed: ["title_deed"],
};

function pick(row, field) {
  for (const alias of ALIASES[field] || [field]) {
    if (row[alias] !== undefined && String(row[alias]).trim() !== "") return String(row[alias]).trim();
  }
  return "";
}

function num(value) {
  const cleaned = String(value || "").replace(/[^0-9.]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function mapType(value) {
  const key = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (TYPES.includes(key)) return key;
  if (key.includes("apart") || key.includes("flat") || key === "ap") return "apartment";
  if (key.includes("villa") || key === "vh" || key === "vi") return "villa";
  if (key.includes("town") || key === "th") return "townhouse";
  if (key.includes("pent") || key === "ph") return "penthouse";
  if (key.includes("office") || key === "of") return "office";
  if (key.includes("ware") || key === "wh") return "warehouse";
  if (key.includes("shop") || key.includes("retail") || key === "sh") return "shop";
  return "apartment";
}

function mapStatus(value) {
  const key = String(value || "").toLowerCase().trim();
  if (STATUSES.includes(key)) return key;
  if (key === "1" || key === "publish" || key === "published" || key === "active") return "live";
  if (key === "2" || key.includes("approval") || key.includes("pending")) return "pending";
  if (key === "3" || key.includes("draft")) return "draft";
  if (key === "0" || key.includes("unpublish") || key.includes("archiv") || key.includes("inactive")) {
    return "archived";
  }
  if (key === "4" || key.includes("pocket")) return "pocket";
  if (key.includes("dup")) return "duplicate";
  return "draft";
}

function mapProject(value) {
  const key = String(value || "").toLowerCase();
  if (key.includes("off") && key.includes("primary")) return "offplan_primary";
  if (key.includes("off")) return "offplan_secondary";
  if (key.includes("primary")) return "ready_primary";
  return "ready_secondary";
}

function mapPortals(value) {
  return String(value || "")
    .split(/[|,;]/)
    .map((item) => item.trim().toLowerCase())
    .map((item) => {
      if (!item) return "";
      if (item.includes("api")) return "pf_api";
      if (item.includes("finder") || item === "pf") return "pf";
      if (item.includes("bayut")) return "bayut";
      if (item.includes("dubizz")) return "dubizzle";
      if (item.includes("web")) return "website";
      if (item.includes("right")) return "rightmove";
      if (item === "je" || item.includes("houza")) return "houza";
      return PORTALS.includes(item) ? item : "";
    })
    .filter(Boolean);
}

function mapDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const date = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return date.toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function rowToListing(row) {
  const purposeText = pick(row, "purpose").toLowerCase();
  const purpose = purposeText.includes("rent") || purposeText === "rr" || purposeText === "cr" ? "rent" : "sale";
  const categoryText = pick(row, "category").toLowerCase();
  const mappedType = mapType(pick(row, "type"));
  const category = categoryText
    ? categoryText.includes("comm")
      ? "commercial"
      : "residential"
    : ["office", "warehouse", "shop"].includes(mappedType)
      ? "commercial"
      : "residential";
  const beds = pick(row, "beds").toLowerCase();
  const listing = {
    reference: pick(row, "reference"),
    title: pick(row, "title"),
    title_ar: pick(row, "title_ar"),
    description: pick(row, "description"),
    description_ar: pick(row, "description_ar"),
    city: pick(row, "city") || "Dubai",
    community: pick(row, "community"),
    sub_community: pick(row, "sub_community"),
    building: pick(row, "building"),
    unit_no: pick(row, "unit_no"),
    permit_number: pick(row, "permit_number"),
    type: mapType(pick(row, "type")),
    purpose,
    category,
    project_status: mapProject(pick(row, "project_status")),
    status: mapStatus(pick(row, "status")),
    beds: beds.startsWith("studio") ? 0 : num(beds),
    baths: num(pick(row, "baths")),
    area_sqft: num(pick(row, "area_sqft")),
    price_aed: num(pick(row, "price_aed")) || num(pick(row, "price_yearly")),
    price_yearly: pick(row, "price_yearly"),
    price_monthly: pick(row, "price_monthly"),
    price_weekly: pick(row, "price_weekly"),
    price_daily: pick(row, "price_daily"),
    listing_agent: pick(row, "listing_agent"),
    listing_owner: pick(row, "listing_owner") || pick(row, "listing_agent"),
    landlord_name: pick(row, "landlord_name"),
    landlord_email: pick(row, "landlord_email"),
    landlord_phone: pick(row, "landlord_phone"),
    developer: pick(row, "developer"),
    portal_expiry: pick(row, "portal_expiry"),
    permit_issue_date: pick(row, "permit_issue_date"),
    permit_expiry_date: pick(row, "permit_expiry_date"),
    furnished: pick(row, "furnished").toLowerCase().replace(/\s+/g, "_"),
    parking: pick(row, "parking"),
    plot_size: pick(row, "plot_size"),
    lot_size: pick(row, "lot_size"),
    built_up_area: pick(row, "built_up_area"),
    layout_type: pick(row, "layout_type"),
    project_name: pick(row, "project_name"),
    ownership: pick(row, "ownership"),
    build_year: pick(row, "build_year"),
    listing_source: pick(row, "listing_source"),
    payment_method: pick(row, "payment_method"),
    cheques: pick(row, "cheques"),
    service_charges: pick(row, "service_charges"),
    financial_status: pick(row, "financial_status"),
    available_from: pick(row, "available_from"),
    photo: pick(row, "photo"),
    portals: mapPortals(pick(row, "portals")),
    created_at: mapDate(pick(row, "created_at")) || undefined,
    updated_at: mapDate(pick(row, "updated_at")) || undefined,
    created_by: pick(row, "created_by"),
    amenities: pick(row, "amenities")
      .split(/[|,;]/)
      .map((item) => item.trim())
      .filter(Boolean),
    youtube_link: pick(row, "youtube_link"),
    video_link: pick(row, "video_link"),
    qrcode_link: pick(row, "qrcode_link"),
    latitude: pick(row, "latitude"),
    longitude: pick(row, "longitude"),
    dtcm_permit: pick(row, "dtcm_permit"),
    notes: pick(row, "notes"),
    title_deed: pick(row, "title_deed"),
  };
  if (purpose === "sale" && !listing.sale_price) listing.sale_price = String(listing.price_aed || "");
  return listing;
}

export function importRows(rows) {
  const listings = [];
  const skipped = [];
  rows.forEach((row, index) => {
    const listing = rowToListing(row);
    if (!listing.reference) {
      skipped.push({ row: index + 2, reason: "Missing reference" });
      return;
    }
    if (!listing.title) listing.title = `${listing.reference}`;
    listings.push(listing);
  });
  return { listings, skipped };
}
