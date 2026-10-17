// Portal XML feeds. Property Finder, Bayut and Dubizzle all ingest listings
// from an XML feed URL that the portal account is pointed at. These feeds
// contain every listing that is LIVE and switched on for that portal.
import { locationPath } from "./listingModel.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cdata(value) {
  return `<![CDATA[${String(value ?? "").replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function stamp(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace("T", " ").slice(0, 19);
}

const PF_TYPES = {
  apartment: "AP",
  villa: "VI",
  townhouse: "TH",
  penthouse: "PH",
  office: "OF",
  warehouse: "WH",
  shop: "SH",
};

function offering(listing) {
  const commercial = listing.category === "commercial";
  if (listing.purpose === "rent") return commercial ? "CR" : "RR";
  return commercial ? "CS" : "RS";
}

function absolute(origin, url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

function priceAmount(value) {
  const cleaned = String(value ?? "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function priceBlock(listing, portal) {
  const bayut = portal === "bayut" || portal === "dubizzle";
  const custom = Boolean(listing.custom_portal_pricing);
  const pick = (key) =>
    bayut && custom ? listing[`bayut_price_${key}`] || listing[`price_${key}`] : listing[`price_${key}`];
  if (listing.purpose === "rent") {
    const parts = ["yearly", "monthly", "weekly", "daily"]
      .map((key) => {
        const amount = priceAmount(pick(key));
        return amount ? `<${key}>${amount}</${key}>` : "";
      })
      .filter(Boolean);
    if (parts.length) return `<price>${parts.join("")}</price>`;
  }
  const sale = priceAmount(listing.sale_price || listing.price_aed);
  return `<price>${sale}</price>`;
}

function furnished(value) {
  if (value === "furnished") return "Yes";
  if (value === "semi_furnished") return "Partly";
  if (value === "unfurnished") return "No";
  return "";
}

function agentFor(listing, portal) {
  if (listing.portal_agent_different) {
    if (portal === "website" && listing.portal_agent_web) return listing.portal_agent_web;
    if ((portal === "bayut" || portal === "dubizzle") && listing.portal_agent_bayut) {
      return listing.portal_agent_bayut;
    }
    if (portal === "pf_api" && listing.portal_agent_pf_api) return listing.portal_agent_pf_api;
  }
  return listing.listing_agent || listing.listing_owner || "";
}

export function portalFeedXml(listings, portal, origin) {
  const items = listings
    .filter((row) => row.status === "live" && (row.portals || []).includes(portal))
    .map((row) => {
      const photos = (row.gallery || []).filter((item) => item.kind !== "floorplan");
      const plans = (row.gallery || []).filter((item) => item.kind === "floorplan");
      const useBayut = (portal === "bayut" || portal === "dubizzle") && row.bayut_community;
      const city = useBayut ? row.bayut_city || row.city : row.city;
      const community = useBayut ? row.bayut_community : row.community;
      const sub = useBayut ? row.bayut_sub_community : row.sub_community;
      const building = useBayut ? row.bayut_building || row.building : row.building;
      const geo =
        row.latitude && row.longitude ? `<geopoints>${esc(row.longitude)},${esc(row.latitude)}</geopoints>` : "";
      return `  <property last_update="${stamp(row.updated_at)}" status="live">
    <reference_number>${esc(row.reference)}</reference_number>
    <permit_number>${esc(row.permit_number)}</permit_number>
    <offering_type>${offering(row)}</offering_type>
    <property_type>${PF_TYPES[row.type] || "AP"}</property_type>
    ${priceBlock(row, portal)}
    ${row.hide_price ? "<hide_price>1</hide_price>" : ""}
    <city>${esc(city)}</city>
    <community>${esc(community)}</community>
    <sub_community>${esc(sub)}</sub_community>
    <property_name>${esc(building)}</property_name>
    <unit_no>${esc(row.unit_no)}</unit_no>
    <title_en>${cdata(row.title)}</title_en>
    <description_en>${cdata(row.description)}</description_en>
    <title_ar>${cdata(row.title_ar)}</title_ar>
    <description_ar>${cdata(row.description_ar)}</description_ar>
    <size>${Number(row.area_sqft || 0)}</size>
    <plot_size>${esc(row.plot_size)}</plot_size>
    <bedroom>${Number(row.beds || 0)}</bedroom>
    <bathroom>${Number(row.baths || 0)}</bathroom>
    <parking>${esc(row.parking)}</parking>
    <furnished>${furnished(row.furnished)}</furnished>
    <completion_status>${/offplan/.test(row.project_status) ? "off_plan" : "completed"}</completion_status>
    <developer>${esc(row.developer)}</developer>
    <project_name>${esc(row.project_name)}</project_name>
    <build_year>${esc(row.build_year)}</build_year>
    <availability_date>${esc(row.available_from)}</availability_date>
    <cheques>${esc(row.cheques)}</cheques>
    <service_charge>${esc(row.service_charges)}</service_charge>
    <agent>
      <name>${esc(agentFor(row, portal))}</name>
      <listing_owner>${esc(row.listing_owner)}</listing_owner>
    </agent>
    ${geo}
    <private_amenities>${esc((row.amenities || []).join(","))}</private_amenities>
    <video_tour_url>${esc(row.youtube_link || row.video_link || (row.videos || [])[0]?.url || "")}</video_tour_url>
    <view360>${esc(row.qrcode_link)}</view360>
    <photo last_update="${stamp(row.updated_at)}">
${photos.map((item) => `      <url>${esc(absolute(origin, item.url))}</url>`).join("\n")}
    </photo>
    <floor_plan>
${plans.map((item) => `      <url>${esc(absolute(origin, item.url))}</url>`).join("\n")}
    </floor_plan>
    <public_url>${esc(`${origin.replace(/\/$/, "")}/p/${encodeURIComponent(row.reference)}`)}</public_url>
  </property>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<list last_update="${stamp()}" listing_count="${items.length}" portal="${esc(portal)}">
${items.join("\n")}
</list>
`;
}

export function feedSummary(listings, portals) {
  return Object.fromEntries(
    portals.map((portal) => [
      portal,
      listings.filter((row) => row.status === "live" && (row.portals || []).includes(portal)).length,
    ])
  );
}

/** Live quantities for the overview. PF uses the Property Finder live flag.
 *  Bayut and Dubizzle use the same live rows their XML feeds publish. */
export function livePortalCounts(listings) {
  const counts = { pf: 0, bayut: 0, dubizzle: 0 };
  for (const row of listings || []) {
    if (String(row?.pf_is_live || "") === "1") counts.pf += 1;
    if (String(row?.status || "") !== "live") continue;
    const portals = Array.isArray(row?.portals) ? row.portals : [];
    if (portals.includes("bayut")) counts.bayut += 1;
    if (portals.includes("dubizzle")) counts.dubizzle += 1;
  }
  return counts;
}

export { locationPath };
