import { fetchCompliance, pfConfigured } from "./pf.js";

function cleanPermit(value) {
  return String(value || "").replace(/\s+/g, "");
}

export function permitCandidates(raw) {
  const permit = cleanPermit(raw);
  const out = [];
  if (permit) out.push(permit);
  // Agents often paste an extra digit on the 10-digit 71… listing number.
  if (/^71\d{9}$/.test(permit)) out.push(permit.slice(0, 10));
  return [...new Set(out)];
}

function isoDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function asSqm(size) {
  const n = Number(size);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function asSqft(sqm) {
  return sqm ? Math.round(sqm * 10.76391041671) : 0;
}

function bedsFrom(roomsCount) {
  const rooms = String(roomsCount || "").trim().toLowerCase();
  if (!rooms) return "";
  if (rooms === "studio" || rooms === "none") return 0;
  if (/^\d+$/.test(rooms)) return Number(rooms);
  return "";
}

function purposeFrom(property) {
  const kind = `${property.permitType || ""} ${property.saleType || ""} ${property.listingType || ""}`.toLowerCase();
  if (kind.includes("rent")) return "rent";
  if (kind.includes("sale")) return "sale";
  return "";
}

export function mapDldToListing(row, queriedPermit) {
  const property = row.property || {};
  const project = row.project || {};
  const sqm = asSqm(property.size);
  const built = asSqm(property.builtUpArea);
  const sqft = asSqft(sqm);
  const beds = bedsFrom(property.roomsCount);
  const purpose = purposeFrom(property);
  const value = Number(property.value || 0);
  const unit = String(property.unitNumber || "").trim();
  const issue = isoDate(row.startedAt);
  const expiry = isoDate(row.expiresAt);
  const patch = {};
  if (queriedPermit) patch.permit_number = queriedPermit;
  if (issue) patch.permit_issue_date = issue;
  if (expiry) {
    patch.permit_expiry_date = expiry;
    patch.portal_expiry = expiry;
  }
  if (unit && unit !== "0") patch.unit_no = unit;
  if (sqft) patch.area_sqft = sqft;
  if (built) patch.built_up_area = String(built);
  else if (sqm) patch.built_up_area = String(sqm);
  if (beds !== "") patch.beds = beds;
  if (purpose) patch.purpose = purpose;
  if (value > 0) {
    patch.price_aed = value;
    if (purpose === "sale") patch.sale_price = String(value);
    else {
      patch.price_yearly = String(value);
      patch.price_period = "yearly";
    }
  }
  if (property.locationName) {
    patch.community = String(property.locationName);
    patch.city = "Dubai";
  }
  if (project.name) patch.project_name = String(project.name);
  if (project.developerName) patch.developer = String(project.developerName);

  return {
    patch,
    info: {
      listingNumber: queriedPermit || "",
      transactionNumber: String(row.permitNumber || ""),
      statusId: row.permitStatusId ?? null,
      issued: issue,
      expires: expiry,
      location: String(property.locationName || ""),
      listingType: String(property.listingType || property.listing_type || ""),
      permitType: String(property.permitType || ""),
      rooms: String(property.roomsCount || ""),
      unit: unit && unit !== "0" ? unit : "",
      sizeSqm: sqm || null,
      sizeSqft: sqft || null,
      price: value || null,
      project: String(project.name || ""),
      developer: String(project.developerName || ""),
      validationUrl: String(row.validationURL || ""),
    },
  };
}

function friendlyError(err) {
  const msg = String(err?.message || "");
  if (/invalid permit/i.test(msg)) {
    return Object.assign(new Error("This permit number was not found in DLD. Check the listing permit and try again."), {
      status: 422,
    });
  }
  if (/license number does not match/i.test(msg)) {
    return Object.assign(new Error("This permit is not registered to A7 Group Real Estate."), { status: 422 });
  }
  return err;
}

export async function lookupDld(permitInput) {
  if (!pfConfigured()) {
    throw Object.assign(new Error("Property Finder is not configured for DLD lookup."), { status: 503 });
  }
  const typed = cleanPermit(permitInput);
  const candidates = permitCandidates(typed);
  if (!candidates.length) {
    throw Object.assign(new Error("Listing Permit Number is required for DLD info."), { status: 400 });
  }
  let lastErr;
  for (const permit of candidates) {
    try {
      const body = await fetchCompliance(permit);
      const row = Array.isArray(body.data) ? body.data[0] : null;
      if (!row) {
        lastErr = Object.assign(new Error("No DLD record was returned for this permit."), { status: 404 });
        continue;
      }
      const mapped = mapDldToListing(row, permit);
      return {
        ok: true,
        queried: permit,
        corrected: permit !== typed,
        info: mapped.info,
        patch: mapped.patch,
      };
    } catch (err) {
      lastErr = friendlyError(err);
      if (err.status === 422 && /invalid permit/i.test(String(err.message || "")) && candidates.length > 1) {
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || Object.assign(new Error("This permit number was not found in DLD."), { status: 422 });
}
