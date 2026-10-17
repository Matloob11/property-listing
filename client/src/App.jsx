import { useEffect, useMemo, useRef, useState } from "react";
import { ListingStudio } from "./ListingStudio.jsx";
import { ContractPanel } from "./ContractPanel.jsx";
import { TenancyPanel } from "./TenancyPanel.jsx";
import { BookingForm } from "./BookingForm.jsx";
import { NocForm } from "./NocForm.jsx";
import { NocMaintForm } from "./NocMaintForm.jsx";
import { NocMoveinForm, NocMoveoutForm } from "./NocMoveinForm.jsx";
import { NocTrakheesiForm } from "./NocTrakheesiForm.jsx";
import { FormIForm } from "./FormIForm.jsx";
import { BookingReceiptForm } from "./BookingReceiptForm.jsx";
import { FormAForm } from "./FormAForm.jsx";
import { Overview, scoreTone } from "./Overview.jsx";
import { LeadRecording, LeadsView } from "./LeadsView.jsx";
import { historyActorId, historyActorName, historyFieldLabel, isListingExpired, liveUnpublishTargets, UNPUBLISH_PORTALS } from "../../server/listingModel.js";
import { infoSliceFilters, infoSliceTitle } from "./infoSlice.js";
import { CrmIntelligenceUi } from "./CrmIntelligenceUi.jsx";
import { AgentDailyReportCard, OfficeShareHistoryCard } from "./AgentDailyReportCard.jsx";
import AgentMonthBoard from "./AgentMonthBoard.jsx";
import { TeamLeadReportCard } from "./TeamLeadReportCard.jsx";
import { AgentListingHistoryCard, matchAgentFromSearch } from "./AgentListingHistoryCard.jsx";
import { loadUiState, saveUiState, setUiPersistUser, UI_PERSIST_TTL_MS } from "./uiPersist.js";
import { isDailyReportOnlyClient } from "./listingAccessClient.js";
import { isBitrixAdmin } from "../../server/listingAccess.js";
import { INFOGRAPHICS_PART_IDS } from "../../server/uiPermissions.js";
import { SectionPermissionsModal } from "./SectionPermissionsModal.jsx";
import { ExpiryAlertModal } from "./ExpiryAlertModal.jsx";

function isPortalLive(row) {
  return row?.pf_is_live === "1" || row?.pf_state === "live";
}

function PfChip({ row }) {
  if (!row.pf_id) return null;
  if (isPortalLive(row)) {
    return (
      <span className={`pf-chip live ${scoreTone(row.pf_quality_score)}`} title={`Live on Property Finder · quality score ${row.pf_quality_score || "-"}`}>
        PF live{row.pf_quality_score ? ` · ${row.pf_quality_score}` : ""}
      </span>
    );
  }
  return (
    <span className="pf-chip down" title={(row.pf_reasons || []).join("; ") || "Taken down on Property Finder"}>
      PF down
    </span>
  );
}
import "./studioIcons.js";

const CONTRACT_LABEL = {
  draft: "Contract draft",
  sent: "Contract sent",
  partially_signed: "Partially signed",
  signed: "Contract signed",
  cancelled: "Contract cancelled",
};

function PageBar({ kicker, title, note, icon, extra }) {
  return (
    <div className="ov-pagebar">
      <div className="ov-pagebar-left">
        <span className="ov-pagebar-ico" aria-hidden="true">{icon}</span>
        <div>
          {kicker ? <small>{kicker}</small> : null}
          <h1>{title}</h1>
          {note ? <p>{note}</p> : null}
        </div>
      </div>
      {extra ? <div className="ov-sync">{extra}</div> : null}
    </div>
  );
}

function ContractChip({ value }) {
  if (!value) return null;
  const [kind, status] = String(value).split(":");
  const label = `${kind === "sale" ? "Sale" : "Tenancy"}: ${CONTRACT_LABEL[status] || status}`.replace("Contract ", "");
  return <span className={`contract-chip ${status}`}>{label}</span>;
}

const TICKETS = [
  { id: "all", label: "All Listing", status: "all", scope: "" },
  { id: "mine", label: "My Listing", status: "all", scope: "mine" },
  { id: "draft", label: "My Draft", status: "draft", scope: "" },
  { id: "live", label: "My Live", status: "live", scope: "" },
  { id: "pending", label: "My Pending", status: "pending", scope: "" },
  { id: "archived", label: "My Archived", status: "archived", scope: "" },
  { id: "expired", label: "Expired", status: "expired", scope: "" },
  { id: "duplicate", label: "My Duplicate", status: "duplicate", scope: "" },
  { id: "pocket", label: "My Pocket Listing", status: "pocket", scope: "" },
];

const TYPES = ["apartment", "villa", "townhouse", "penthouse", "office", "warehouse", "shop", "retail", "land", "duplex", "whole_building", "hotel_apartment", "showroom", "labor_camp", "farm", "bulk_units", "compound"];
const NAV = [
  { id: "overview", label: "Overview", icon: "M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z" },
  { id: "listings", label: "Listings", icon: "M4 6.5c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5Zm0 0v11c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-11M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" },
  { id: "leads", label: "Leads", icon: "M4 6h16v10H8l-4 4V6Zm4 3h8M8 12h5" },
  { id: "infographics", label: "Listing Infographics", icon: "M5 19V11m7 8V5m7 14v-8" },
  { id: "filters", label: "Filters", icon: "M4 5h16l-6 8v6l-4-2v-4L4 5Z" },
  { id: "tenancy", label: "Tenancy Contract", icon: "M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h7M9 15.5h7M9 8.5h3" },
  { id: "booking", label: "Title Deed", icon: "M6 3h9l4 4v14H6V3Zm9 0v4h4M8 12h8M8 15.5h5M8 8.5h3" },
  { id: "noc", label: "NOC", icon: "M6 4h12v16H6V4Zm3 4h6M9 12h6M9 16h4" },
  { id: "form-a", label: "Form A", icon: "M6 3h12v18H6V3Zm4 5h8M10 10h8M10 13h6M8 18h8" },
  { id: "form-i", label: "Form I", icon: "M6 3h12v18H6V3Zm6 0v18M8 7.5h3.2M13.8 7.5H16M8 11h3.2M13.8 11H16M8 14.5h3.2M13.8 14.5H16" },
  { id: "booking-form", label: "Booking Form", icon: "M6 3h12v18H6V3Zm3 5h8M9 11h8M9 15h5M16 15l2 2 3-3" },
];
const NOC_SUBNAV = [
  { id: "noc-maintenance", label: "NOC Maintenance" },
  { id: "noc-movein", label: "NOC For Move In" },
  { id: "noc-moveout", label: "NOC For Move Out" },
  { id: "noc-trakheesi", label: "NOC For Advertisement" },
];
const NOC_VIEWS = new Set(["noc", ...NOC_SUBNAV.map((item) => item.id)]);
const NOC_PAGE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M6 4h12v16H6V4Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const FORM_A_PAGE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M6 3h12v18H6V3Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M9 8h7M9 12h7M9 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const FORM_I_PAGE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M6 3h12v18H6V3Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 3v18M8 8h3M14 8h2M8 12h3M14 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const BOOKING_FORM_PAGE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M6 3h12v18H6V3Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="M9 8h7M9 12h7M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const CATEGORIES = ["residential", "commercial"];
const PROJECT_STATUSES = [
  { value: "ready_secondary", label: "Ready Secondary" },
  { value: "offplan_secondary", label: "Off-Plan Secondary" },
  { value: "ready_primary", label: "Ready Primary" },
  { value: "offplan_primary", label: "Off-Plan Primary" },
];
export const PORTALS = [
  { id: "pf", label: "PF", name: "Property Finder" },
  { id: "pf_api", label: "API", name: "Property Finder API" },
  { id: "bayut", label: "BY", name: "Bayut" },
  { id: "dubizzle", label: "DZ", name: "Dubizzle" },
  { id: "houza", label: "JE", name: "JE" },
  { id: "trb", label: "TRB", name: "TRB" },
  { id: "simsari", label: "SM", name: "Simsari" },
  { id: "sudonum", label: "SD", name: "Sudonum" },
  { id: "properstar", label: "PS", name: "Properstar" },
  { id: "website", label: "WEB", name: "Website" },
  { id: "rightmove", label: "RM", name: "Rightmove" },
];

function pretty(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const QUALITY_FILTERS = [
  { id: "", label: "All ratings" },
  { id: "below70", label: "Below 70%" },
  { id: "70to89", label: "70% – 89%" },
  { id: "90plus", label: "90% and above" },
  { id: "none", label: "No PF rating" },
];

const emptyFilters = {
  ticket: "all",
  listing_id: "",
  unit_no: "",
  permit_number: "",
  q: "",
  landlord_email: "",
  landlord_phone: "",
  minBeds: "",
  maxBeds: "",
  beds: "",
  minPrice: "",
  maxPrice: "",
  city: "",
  community: "",
  sub_community: "",
  building: "",
  category: "",
  type: "",
  purpose: "",
  project_status: "",
  listing_agent: "",
  listing_owner: "",
  landlord: "",
  developer: "",
  portal: "",
  portal_agent: "",
  portal_side: "",
  portal_credit: "",
  portal_type: "",
  portal_beds: "",
  portal_community: "",
  portal_cluster: "",
  portal_live: "",
  quality: "",
  sort: "updated_at",
  dir: "desc",
  page: 1,
  pageSize: 10,
};

function isListingRefQuery(value, listing) {
  const w = String(value || "").trim().toLowerCase();
  if (!w || !listing) return false;
  const ref = String(listing.reference || "").trim().toLowerCase();
  const id = String(listing.id || "").trim().toLowerCase();
  return w === ref || w === id || `a7group-${w}` === ref;
}

function looksLikeAdRef(value) {
  const w = String(value || "").trim();
  return /^a7group-?\d*$/i.test(w) || /^\d{3,}$/.test(w);
}

const emptyForm = {
  title: "",
  reference: "",
  community: "",
  sub_community: "",
  building: "",
  city: "Dubai",
  type: "apartment",
  purpose: "sale",
  status: "draft",
  category: "residential",
  beds: 1,
  baths: 1,
  area_sqft: 1000,
  price_aed: 0,
  photo: "",
  portals: ["pf", "bayut", "dubizzle"],
  unit_no: "",
  permit_number: "",
  landlord_name: "",
  landlord_email: "",
  landlord_phone: "",
  listing_agent: "",
  listing_owner: "",
  developer: "",
  portal_expiry: "",
  title_deed: "",
  parking: "",
  furnished: "",
  portal_agent_different: "",
  notes: "",
  created_by: "",
  plot_size: "",
  lot_size: "",
  built_up_area: "",
  layout_type: "",
  project_name: "",
  ownership: "",
  build_year: "",
  listing_source: "",
  available_from: "",
  license_type: "rera",
  non_rera: "",
  permit_issue_date: "",
  permit_expiry_date: "",
  custom_portal_pricing: "",
  price_period: "yearly",
  price_yearly: "",
  price_monthly: "",
  price_weekly: "",
  price_daily: "",
  payment_method: "",
  cheques: "",
  service_charges: "",
  financial_status: "",
  title_ar: "",
  description: "",
  description_ar: "",
  amenities: [],
  portal_prices: {},
  gallery: [],
  videos: [],
  documents_list: [],
  notes_list: [],
  history: [],
  upgrades: [],
};

function money(n) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function when(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function relative(iso) {
  if (!iso) return "";
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} minutes ago`;
  if (sec < 86400) {
    const hours = Math.floor(sec / 3600);
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  const days = Math.floor(sec / 86400);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function locationPath(row) {
  return [row.city, row.community, row.sub_community].filter(Boolean).join(" > ");
}

function shareLink(row, agent) {
  const url = new URL(
    `${window.location.origin}/p/${encodeURIComponent(row.reference)}`
  );
  if (agent?.name) url.searchParams.set("agent", agent.name);
  return url.toString();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  }
}

function startDownload(href) {
  const link = document.createElement("a");
  link.href = href;
  link.setAttribute("download", "");
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const MENU_ICONS = {
  view: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z",
  link: "M9 13.5a4.5 4.5 0 0 0 6.36 0l1.8-1.8a4.5 4.5 0 0 0-6.37-6.36L9.5 6.6M15 10.5a4.5 4.5 0 0 0-6.36 0l-1.8 1.8a4.5 4.5 0 0 0 6.37 6.36L14.5 17.4",
  pdf: "M7 3h8l5 5v13H7V3Zm8 0v5h5",
  image: "M4 6h16v12H4V6Zm2.8 8.2 3.2-3.6 2.6 2.8 2-1.8 3.2 2.6",
  brochure: "M5 4h10l4 4v12H5V4Zm10 0v4h4",
  copy: "M8 8h10v12H8V8Zm-3 3V5h10",
  refresh: "M20 12a8 8 0 1 1-2.2-5.5M20 4v5h-5",
  live: "M5 12.5 9.2 17 19 7",
  archive: "M4 7h16l-1.4 13H5.4L4 7Zm4-3h8l1 3H7l1-3Z",
  pocket: "M6 8h12v10H6V8Zm3-3h6l1 3H8l1-3Z",
  sign: "M4 17c3-6 5-6 6-2s2 4 4-2 3-2 6 1M4 21h16",
  edit: "M4 20h4l10-10-4-4L4 16v4Zm10-14 4 4",
  history: "M12 7v5l3.2 1.8M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z",
  trash: "M5 7h14M9 7V4h6v3m-7 0 1 13h6l1-13",
  unpublish: "M12 4v10m0 0 4-4m-4 4-4-4M5 19h14",
};

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button type="button" className={danger ? "danger" : ""} onClick={onClick}>
      <Icon d={MENU_ICONS[icon]} />
      {label}
    </button>
  );
}

function ticketCount(ticket, counts) {
  if (ticket.scope === "mine") return counts.mine?.all ?? 0;
  if (!ticket.status || ticket.status === "all") return counts.all ?? 0;
  return counts[ticket.status] ?? 0;
}

const WEBSITE_VIEW = {
  any: "All 3 websites",
  pf: "Property Finder",
  bayut: "Bayut",
  dubizzle: "Dubizzle",
};

function liveWebsiteTotal(websiteCounts) {
  if (!websiteCounts?.ready) return "—";
  return Number(websiteCounts.any || 0).toLocaleString();
}

function liveWebsiteTitle(websiteCounts) {
  if (!websiteCounts?.ready) return "Waiting for the live website reading";
  return `Live on Property Finder ${websiteCounts.pf}, Bayut ${websiteCounts.bayut}, or Dubizzle ${websiteCounts.dubizzle}. A listing on more than one website counts once.`;
}

function websiteChoice(id, label, websiteCounts) {
  const n = websiteCounts?.[id];
  return n == null ? label : `${label} (${n})`;
}

function queryString(filters, ticket) {
  const params = new URLSearchParams();
  if (ticket.status && ticket.status !== "all") params.set("status", ticket.status);
  if (ticket.scope) params.set("scope", ticket.scope);
  const keys = [
    "listing_id",
    "unit_no",
    "permit_number",
    "q",
    "landlord_email",
    "landlord_phone",
    "minBeds",
    "maxBeds",
    "beds",
    "minPrice",
    "maxPrice",
    "city",
    "community",
    "sub_community",
    "building",
    "category",
    "type",
    "purpose",
    "project_status",
    "listing_agent",
    "listing_owner",
    "landlord",
    "developer",
    "portal",
    "portal_agent",
    "portal_side",
    "portal_credit",
    "portal_type",
    "portal_beds",
    "portal_community",
    "portal_cluster",
    "portal_live",
    "quality",
    "sort",
    "dir",
    "page",
    "pageSize",
  ];
  for (const key of keys) {
    if (filters[key]) params.set(key, String(filters[key]));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function api(path, options) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return body;
}

function Icon({ d, className = "ico" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dash() {
  return <span className="muted">-</span>;
}

function Chevron({ open }) {
  return (
    <svg className={`chev${open ? " open" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortMark({ dir }) {
  if (dir === "asc") {
    return (
      <svg className="sort on" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 14l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (dir === "desc") {
    return (
      <svg className="sort on" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 10l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="sort" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortTh({ label, field, sort, dir, onSort }) {
  return (
    <th>
      <button
        className={`sort-btn${sort === field ? " on" : ""}`}
        type="button"
        onClick={() => onSort(field)}
        aria-sort={sort === field ? (dir === "asc" ? "ascending" : "descending") : undefined}
      >
        {label}
        <SortMark dir={sort === field ? dir : ""} />
      </button>
    </th>
  );
}

function PortalBadge({ color, children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={color || "#0bb783"} />
      {children}
    </svg>
  );
}

function liveAd(row, portal) {
  if (portal === "bayut") return row?.bayut || null;
  return row?.dubizzle || null;
}

function PortalMark({ id }) {
  if (id === "pf") {
    return (
      <PortalBadge color="#e85d04">
        <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="sans-serif">
          PF
        </text>
      </PortalBadge>
    );
  }
  if (id === "bayut") {
    return (
      <PortalBadge color="#8950fc">
        <text x="12" y="16" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="sans-serif">
          BY
        </text>
      </PortalBadge>
    );
  }
  if (id === "dubizzle") {
    return (
      <PortalBadge color="#e31c3d">
        <text x="12" y="16" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="sans-serif">
          DZ
        </text>
      </PortalBadge>
    );
  }
  if (id === "website") {
    return (
      <PortalBadge>
        <circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" strokeWidth="1.5" />
        <path d="M7.6 12h8.8" stroke="#fff" strokeWidth="1.3" />
        <path
          d="M12 7.4c1.3 1.5 1.9 3 1.9 4.6s-.6 3.1-1.9 4.6C10.7 15.1 10.1 13.6 10.1 12s.6-3.1 1.9-4.6Z"
          fill="none"
          stroke="#fff"
          strokeWidth="1.3"
        />
      </PortalBadge>
    );
  }
  if (id === "pf_api") {
    return (
      <PortalBadge>
        <rect x="8" y="8" width="8" height="8" rx="1.4" fill="none" stroke="#fff" strokeWidth="1.5" />
        <path d="M10.4 12h3.2M12 10.4v3.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      </PortalBadge>
    );
  }
  const portal = PORTALS.find((item) => item.id === id);
  return (
    <PortalBadge>
      <text x="12" y="15.2" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="sans-serif">
        {portal?.label || "?"}
      </text>
    </PortalBadge>
  );
}

function PortalDots({ portals, livePortals }) {
  const order = ["pf", "bayut", "dubizzle", "website", "pf_api"];
  const selected = new Set([...(portals || []), ...(livePortals || [])]);
  const items = [
    ...order.filter((id) => selected.has(id)).map((id) => PORTALS.find((p) => p.id === id)).filter(Boolean),
    ...PORTALS.filter((portal) => selected.has(portal.id) && !order.includes(portal.id)),
  ];
  if (!items.length) return <Dash />;
  const shown = items.slice(0, 3);
  const extra = items.length - shown.length;
  return (
    <div className="portals" title={items.map((portal) => portal.name).join(", ")}>
      {shown.map((portal) => (
        <span className="portal-ico" key={portal.id} title={portal.name}>
          <PortalMark id={portal.id} />
        </span>
      ))}
      {extra > 0 ? <span className="portal-more">+{extra}</span> : null}
    </div>
  );
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const second = parts[1]?.[0] || "";
  return (first + second).toUpperCase();
}

function personKey(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function PersonCell({ name, photo }) {
  const [broken, setBroken] = useState(false);
  if (!name) return <Dash />;
  const showPhoto = Boolean(photo) && !broken;
  return (
    <div className="person">
      <span className={`avatar${showPhoto ? " has-photo" : ""}`} aria-hidden="true">
        {showPhoto ? (
          <img src={photo} alt="" onError={() => setBroken(true)} />
        ) : (
          initials(name)
        )}
      </span>
      <span>{name}</span>
    </div>
  );
}

function expiryLabel(value) {
  if (!value) return "N/A";
  const label = when(value);
  return isListingExpired({ portal_expiry: value }) ? `${label} · Expired` : label;
}

function pageList(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const marks = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) {
    marks.add(2);
    marks.add(3);
    marks.add(4);
  }
  if (current >= total - 2) {
    marks.add(total - 3);
    marks.add(total - 2);
    marks.add(total - 1);
  }
  const nums = [...marks].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const items = [];
  for (const num of nums) {
    if (items.length && num - items[items.length - 1] > 1) items.push("...");
    items.push(num);
  }
  return items;
}

function PagerArrow({ dir }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {dir === "prev" ? (
        <path
          d="M14.5 6.5 9 12l5.5 5.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M9.5 6.5 15 12l-5.5 5.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function StatusCell({ status }) {
  if (status === "live") {
    return (
      <span className="status-live">
        <span className="tick">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
            <path d="M5 12.5 9.2 17 19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        live
      </span>
    );
  }
  return <span className={`status-pill ${status}`}>{status}</span>;
}

// Bulk Options menu. Same items as the old desk, in the same order.
const BULK_OPTIONS = [
  { id: "transfer_agent", label: "Transfer to Agent" },
  { id: "transfer_owner", label: "Transfer Owner" },
  { id: "transfer_account", label: "Transfer", admin: true },
  { id: "refresh", label: "Refresh Listings", admin: true },
  { id: "duplicate", label: "Duplicate Listings" },
  { id: "delete", label: "Delete", admin: true, danger: true },
  { id: "publish", label: "Publish", admin: true },
  { id: "publish_bayut", label: "Publish To Bayut", admin: true },
  { id: "publish_dubizzle", label: "Publish To Dubizzle", admin: true },
  { id: "publish_pf", label: "Publish To PF", admin: true },
  { id: "unpublish", label: "Unpublish", admin: true },
  { id: "unpublish_pf", label: "Unpublish From Property Finder", admin: true },
  { id: "unpublish_bayut", label: "Unpublish From Bayut", admin: true },
  { id: "unpublish_dubizzle", label: "Unpublish From Dubizzle", admin: true },
  { id: "push_website", label: "Push to Website", admin: true },
  { id: "import", label: "Import from old desk (CSV)", admin: true, noPick: true },
];

function HistoryWho({ by, byId }) {
  const name = historyActorName(by, byId);
  const id = historyActorId(by, byId);
  return (
    <div className="history-who">
      <b>{name}</b>
      {id ? <small>Bitrix ID {id}</small> : null}
    </div>
  );
}

function whenDubai(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay" role="dialog" aria-label={title} onClick={onClose}>
      <div className={`viewer dialog${wide ? " wide" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="viewer-top">
          <div>
            <h2>{title}</h2>
          </div>
          <button className="btn ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GateScreen({ waiting, message }) {
  return (
    <div className={`gate${waiting ? "" : " is-still"}`} role="status" aria-live="polite" aria-busy={waiting}>
      <div className="gate-orb" aria-hidden="true">
        <svg className="gate-orbit gate-orbit-a" viewBox="0 0 120 120">
          <circle className="gate-orbit-track" cx="60" cy="60" r="52" />
          <circle className="gate-orbit-bar" cx="60" cy="60" r="52" />
        </svg>
        <svg className="gate-orbit gate-orbit-b" viewBox="0 0 120 120">
          <circle className="gate-orbit-inner" cx="60" cy="60" r="42" />
        </svg>
        <span className="gate-mark">
          <svg viewBox="0 0 40 16" fill="none">
            <path d="M3 13.5 20 3l17 10.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <b>A7</b>
        </span>
      </div>
      <div className="gate-copy">
        <em>A7 Group</em>
        <strong>Property Listing</strong>
        <p>{waiting ? "Opening the desk" : message}</p>
      </div>
    </div>
  );
}

export function App() {
  const [boot, setBoot] = useState("loading");
  const [user, setUser] = useState(null);
  const [gate, setGate] = useState("Opening Property Listing...");
  const [counts, setCounts] = useState({});
  const [websiteCounts, setWebsiteCounts] = useState(null);
  const [info, setInfo] = useState(null);
  const [meta, setMeta] = useState({});
  const [listings, setListings] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
  const [draft, setDraft] = useState(emptyFilters);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [menuId, setMenuId] = useState("");
  const [view, setView] = useState("listings");
  const pageStackRef = useRef([]);
  const [pageBack, setPageBack] = useState(null);
  const [nocMenuOpen, setNocMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalRefresh, setPortalRefresh] = useState(false);
  const [picked, setPicked] = useState([]);
  const [viewer, setViewer] = useState(null);
  const [insights, setInsights] = useState(null);
  const [notice, setNotice] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [dialogValue, setDialogValue] = useState({});
  const [contractFor, setContractFor] = useState(null);
  const [leadsRef, setLeadsRef] = useState("");
  const [listingLeadSummary, setListingLeadSummary] = useState(null);
  const [viewerLeads, setViewerLeads] = useState([]);
  const [changeLog, setChangeLog] = useState(null);
  const [crmAgentName, setCrmAgentName] = useState("");
  const [crmAgentId, setCrmAgentId] = useState("");
  const [listingRefreshKey, setListingRefreshKey] = useState(0);
  const [allowedSections, setAllowedSections] = useState(null);
  const [canManageUiPermissions, setCanManageUiPermissions] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [expiryAlert, setExpiryAlert] = useState(null);
  const heroSrc = "/hero/dubai-marina.jpg";
  const persistReady = useRef(false);

  function applyRestoredUi(restored) {
    if (!restored) return;
    if (restored.view) setView(restored.view);
    if (restored.filters) setFilters(restored.filters);
    if (restored.draft) setDraft(restored.draft);
    if (restored.leadsRef != null) setLeadsRef(restored.leadsRef);
  }

  function beginUserSession(nextUser, extras = {}) {
    setUser(nextUser);
    setUiPersistUser(nextUser?.id || "");
    if (Array.isArray(extras.sections)) setAllowedSections(extras.sections);
    setCanManageUiPermissions(isBitrixAdmin(nextUser));
    const restored = loadUiState(emptyFilters);
    applyRestoredUi(restored);
    return restored;
  }

  function canSeeSection(id) {
    // Fail closed: until /api/auth/me sections arrive, hide restricted nav.
    if (!Array.isArray(allowedSections)) return false;
    if (id === "infographics") {
      return (
        allowedSections.includes("infographics") ||
        allowedSections.some((sid) => String(sid).startsWith("ci-"))
      );
    }
    return allowedSections.includes(id);
  }

  const visibleNav = useMemo(() => {
    if (!Array.isArray(allowedSections)) return [];
    const allow = new Set(allowedSections);
    const ok = (id) => allow.has(id);
    const canInfo =
      allow.has("infographics") ||
      [...allow].some((id) => String(id).startsWith("ci-"));
    return NAV.filter((item) => {
      if (item.id === "infographics") return canInfo;
      if (item.id === "noc") return ok("noc") || NOC_SUBNAV.some((child) => ok(child.id));
      return ok(item.id);
    });
  }, [allowedSections]);
  const visibleNocSub = useMemo(() => {
    if (!Array.isArray(allowedSections)) return [];
    const allow = new Set(allowedSections);
    const ok = (id) => allow.has(id);
    return NOC_SUBNAV.filter((item) => ok(item.id));
  }, [allowedSections]);

  useEffect(() => {
    const pic = new Image();
    pic.src = heroSrc;
    if (pic.decode) pic.decode().catch(() => {});
  }, [heroSrc]);

  useEffect(() => {
    if (!NOC_VIEWS.has(view)) setNocMenuOpen(false);
  }, [view]);

  // If restored/current view is not allowed for this user, land on first allowed section.
  useEffect(() => {
    if (!Array.isArray(allowedSections)) return;
    const allow = new Set(allowedSections);
    const ok = (id) => allow.has(id);
    if (ok(view)) return;
    if (view === "noc" && visibleNocSub[0]) {
      setView(visibleNocSub[0].id);
      return;
    }
    const first = visibleNav[0]?.id;
    if (first === "noc" && visibleNocSub[0]) setView(visibleNocSub[0].id);
    else if (first) setView(first);
  }, [allowedSections, view, visibleNav, visibleNocSub]);

  useEffect(() => {
    if (!viewer?.id) return undefined;
    let cancelled = false;
    async function loadViewerLeads() {
      try {
        const body = await api(`/api/listings/${viewer.id}/leads`);
        if (!cancelled) setViewerLeads(body.leads || []);
      } catch {
        /* optional */
      }
    }
    const tick = setInterval(loadViewerLeads, 45000);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [viewer?.id]);

  function sectionLabel(id) {
    return NAV.find((item) => item.id === id)?.label || NOC_SUBNAV.find((item) => item.id === id)?.label || "previous page";
  }

  function rememberPage(nextView) {
    if (!nextView || nextView === view) return;
    const entry = { view, label: sectionLabel(view) };
    pageStackRef.current = [...pageStackRef.current, entry].slice(-8);
    setPageBack(entry);
  }

  function goBackPage() {
    const stack = pageStackRef.current.slice();
    const prev = stack.pop();
    pageStackRef.current = stack;
    setPageBack(stack[stack.length - 1] || null);
    if (prev?.view) setView(prev.view);
  }

  function openSection(id) {
    pageStackRef.current = [];
    setPageBack(null);
    setView(id);
  }

  async function openListingByRef(id, reference) {
    try {
      let row = null;
      if (id) {
        try {
          row = (await api(`/api/listings/${encodeURIComponent(id)}`)).listing;
        } catch {
          row = null;
        }
      }
      if (!row && reference) {
        const found = await api(`/api/listings?listing_id=${encodeURIComponent(reference)}`);
        row = found.listings?.[0] || null;
      }
      if (!row) {
        flash("This listing is no longer on the desk.");
        return;
      }
      const ref = String(row.reference || reference || "").trim();
      const canListings = !Array.isArray(allowedSections) || allowedSections.includes("listings");
      if (!canListings) {
        flash("This listing is on the desk, but Listings is not available for this user.");
        return;
      }
      const next = {
        ...emptyFilters,
        listing_id: ref,
        q: ref,
        ticket: "all",
        page: 1,
        pageSize: draft.pageSize || 10,
      };
      setDraft(next);
      setFilters(next);
      rememberPage("listings");
      setView("listings");
      setPicked([]);
      setEditor(null);
      setViewer(null);
      await refresh(next);
      flash(`Showing ${ref || "listing"} on Listings`);
    } catch (err) {
      setError(err.message);
    }
  }
  const [importResult, setImportResult] = useState(null);
  const tableWrapRef = useRef(null);
  const noticeTimer = useRef(0);
  const loadGen = useRef(0);
  const [tablePin, setTablePin] = useState({
    show: false,
    left: false,
    right: false,
    top: 0,
    leftX: 0,
    rightX: 0,
  });

  function updateTableScroll() {
    const el = tableWrapRef.current;
    if (!el) {
      setTablePin({
        show: false,
        left: false,
        right: false,
        top: 0,
        leftX: 0,
        rightX: 0,
      });
      return;
    }
    const box = el.getBoundingClientRect();
    const viewTop = 16;
    const viewBottom = window.innerHeight - 16;
    const visibleTop = Math.max(box.top, viewTop);
    const visibleBottom = Math.min(box.bottom, viewBottom);
    const visibleH = visibleBottom - visibleTop;
    setTablePin({
      show: visibleH > 72,
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
      top: visibleTop + visibleH / 2,
      leftX: Math.max(8, box.left + 10),
      rightX: Math.max(8, window.innerWidth - box.right + 10),
    });
  }

  function scrollTable(dir) {
    const el = tableWrapRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, Math.round(el.clientWidth * 0.65)), behavior: "smooth" });
  }

  function flash(message) {
    const text = String(message || "").trim();
    if (!text) return;
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 4200);
  }

  async function copyListingLink(row, asAgent) {
    const ok = await copyText(shareLink(row, asAgent ? user : null));
    flash(ok ? "Link copied" : "Could not copy link");
  }

  useEffect(() => {
    if (!menuId && !bulkOpen) return undefined;
    const close = () => {
      setMenuId("");
      setBulkOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId, bulkOpen]);

  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return undefined;
    const onMove = () => updateTableScroll();
    updateTableScroll();
    el.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("scroll", onMove, { passive: true, capture: true });
    window.addEventListener("resize", onMove);
    return () => {
      el.removeEventListener("scroll", onMove);
      window.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [listings, total, filters.pageSize, editor, viewer]);

  async function refreshPortals() {
    if (portalRefresh) return;
    setPortalRefresh(true);
    setError("");
    flash("Refreshing listings, websites, and leads...");
    try {
      const body = await api("/api/listings/refresh-portals", { method: "POST" });
      await refresh();
      const pfListings = body?.pf?.listings;
      const portalLeads = body?.leads?.upserted;
      const bits = [];
      if (pfListings != null) bits.push(`${pfListings} Property Finder listings`);
      if (portalLeads != null) bits.push(`${portalLeads} Bayut and Dubizzle leads`);
      const warn = Array.isArray(body?.errors) && body.errors.length ? ` ${body.errors[0]}` : "";
      flash(bits.length ? `Refreshed ${bits.join(" and ")}.${warn}` : `Listings refreshed.${warn}`);
    } catch (err) {
      setError(err.message);
      flash(err.message);
    } finally {
      setPortalRefresh(false);
    }
  }

  async function refresh(next = filters, opts = {}) {
    const gen = ++loadGen.current;
    const nextTicket = TICKETS.find((item) => item.id === next.ticket) || TICKETS[0];
    const qs = queryString(next, nextTicket);
    setBusy(true);
    try {
      const [summary, list, metaBody] = await Promise.all([
        opts.summary === false ? Promise.resolve(null) : api("/api/listings/summary"),
        api(`/api/listings${qs}`),
        opts.meta === false ? Promise.resolve(null) : api("/api/listings/meta"),
      ]);
      if (gen !== loadGen.current) {
        return { stale: true, listings: list.listings || [], total: list.total || 0 };
      }
      if (summary) {
        setCounts(summary.counts || {});
        setWebsiteCounts(summary.websiteCounts || null);
        setInfo(summary.infographics || null);
      }
      setListings(list.listings || []);
      setTotal(list.total || 0);
      if (metaBody?.meta) setMeta(metaBody.meta);
      return {
        listings: list.listings || [],
        total: list.total || 0,
        page: Number(list.page || next.page || 1),
        pageSize: Number(list.pageSize || next.pageSize || 10),
      };
    } finally {
      if (gen === loadGen.current) setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadBx24() {
      if (window.BX24) return window.BX24;
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://api.bitrix24.com/api/v1/";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      }).catch(() => {});
      return window.BX24 || null;
    }

    async function signInFromBitrix() {
      const BX24 = await loadBx24();
      if (!BX24) {
        throw new Error("Open this page from the Bitrix24 menu.");
      }
      return new Promise((resolve, reject) => {
        BX24.init(() => {
          const auth = BX24.getAuth();
          if (!auth) {
            reject(new Error("The portal did not provide a token."));
            return;
          }
          api("/api/auth/bitrix", {
            method: "POST",
            body: JSON.stringify({
              AUTH_ID: auth.access_token || auth.AUTH_ID,
              DOMAIN: auth.domain || auth.DOMAIN,
            }),
          })
            .then((body) => {
              beginUserSession(body.user, {
                sections: body.sections,
                canManageUiPermissions: Boolean(body.canManageUiPermissions),
              });
              resolve(body);
            })
            .catch(reject);
        });
      });
    }

    async function finishReady(me) {
      const restored = beginUserSession(me.user, {
        sections: me.sections,
        canManageUiPermissions: Boolean(me.canManageUiPermissions),
      });
      const needsDesk = !Array.isArray(me.sections)
        || me.sections.some((id) => ["overview", "listings", "filters", "leads"].includes(id));
      if (isDailyReportOnlyClient(me.user) || !needsDesk) {
        setBoot("ready");
        persistReady.current = true;
        return;
      }
      await refresh(restored?.filters || emptyFilters);
      setBoot("ready");
      persistReady.current = true;
      if (restored?.savedAt) {
        const mins = Math.max(1, Math.round((Date.now() - restored.savedAt) / 60000));
        flash(`Restored your last page & search (${mins} min ago · kept for ${Math.round(UI_PERSIST_TTL_MS / 3600000)}h)`);
      }
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const denied = (error) => /do not have access/i.test(String(error?.message || ""));

    async function openFromBitrix() {
      setGate("Signing in through Bitrix...");
      let lastError = null;
      for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
        try {
          const body = await signInFromBitrix();
          if (cancelled) return true;
          await finishReady({
            user: body.user,
            sections: body.sections,
            canManageUiPermissions: body.canManageUiPermissions,
          });
          return true;
        } catch (error) {
          lastError = error;
          if (denied(error)) break;
          setGate("Signing in through Bitrix...");
          await wait(1000 + attempt * 400);
        }
      }
      if (cancelled) return true;
      if (denied(lastError)) {
        setGate("You do not have access to Property Listing New.");
        setBoot("gate");
        return true;
      }
      return false;
    }

    (async () => {
      const BX24 = await loadBx24();
      if (cancelled) return;
      if (BX24) {
        const opened = await openFromBitrix();
        if (opened || cancelled) return;
        setGate("Signing in through Bitrix...");
        while (!cancelled) {
          await wait(3000);
          try {
            const body = await signInFromBitrix();
            if (cancelled) return;
            await finishReady({
              user: body.user,
              sections: body.sections,
              canManageUiPermissions: body.canManageUiPermissions,
            });
            return;
          } catch (error) {
            if (denied(error)) {
              setGate("You do not have access to Property Listing New.");
              setBoot("gate");
              return;
            }
          }
        }
        return;
      }

      try {
        const me = await api("/api/auth/me");
        if (cancelled) return;
        await finishReady(me);
      } catch {
        if (cancelled) return;
        setGate("Open this page from Bitrix24. The public URL stays locked.");
        setBoot("gate");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (boot !== "ready") return undefined;
    persistReady.current = true;
    saveUiState({ view, filters, draft, leadsRef });
    const onHide = () => saveUiState({ view, filters, draft, leadsRef });
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [boot, view, filters, draft, leadsRef]);

  useEffect(() => {
    const row = listings.length === 1 ? listings[0] : null;
    const wanted = String(filters.listing_id || "").trim() || String(filters.q || "").trim();
    if (!row || !wanted || !isListingRefQuery(wanted, row)) {
      setListingLeadSummary(null);
      return;
    }
    let cancelled = false;
    setListingLeadSummary({
      loading: true,
      id: row.id,
      reference: row.reference,
      desk: row.lead_count ?? 0,
      crm: null,
    });
    api(`/api/listings/${encodeURIComponent(row.id)}/lead-summary`)
      .then((body) => {
        if (!cancelled) setListingLeadSummary({ loading: false, ...body });
      })
      .catch(() => {
        if (!cancelled) {
          setListingLeadSummary({
            loading: false,
            id: row.id,
            reference: row.reference,
            desk: row.lead_count ?? 0,
            crm: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listings, filters.listing_id, filters.q]);

  useEffect(() => {
    if (boot !== "ready" || !user?.id || isDailyReportOnlyClient(user)) return undefined;
    let cancelled = false;
    api("/api/listings/expiry-alerts")
      .then((body) => {
        if (cancelled) return;
        const items = Array.isArray(body?.items) ? body.items : [];
        if (!items.length) {
          setExpiryAlert(null);
          return;
        }
        setExpiryAlert(body);
        fetch("/api/listings/expiry-alerts/notify", { method: "POST", credentials: "same-origin" }).catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setExpiryAlert(null);
      });
    return () => {
      cancelled = true;
    };
  }, [boot, user?.id]);

  async function dismissExpiryAlert(keys) {
    await api("/api/listings/expiry-alerts/dismiss", {
      method: "POST",
      body: JSON.stringify({ keys }),
    });
    setExpiryAlert(null);
  }

  const pageSize = Number(filters.pageSize || 10);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (Number(filters.page || 1) - 1) * pageSize + 1;
  const to = Math.min(total, Number(filters.page || 1) * pageSize);

  const optionLists = useMemo(() => {
    const directory = meta.directory || [];
    const names = (kind) => directory.filter((item) => item.kind === kind).map((item) => item.name);
    return {
      cities: [...new Set([...(meta.locations?.cities || []), ...(meta.cities || [])])],
      communities: [
        ...new Set([
          ...Object.values(meta.locations?.communities || {}).flat(),
          ...(meta.communities || []),
        ]),
      ],
      subCommunities: [
        ...new Set([
          ...Object.values(meta.locations?.sub_communities || {})
            .flatMap((groups) => Object.values(groups))
            .flat(),
          ...(meta.sub_communities || []),
        ]),
      ],
      buildings: meta.buildings || [],
      agents: [...new Set([...(meta.agents || []), ...names("agent")])].sort(),
      owners: [...new Set([...(meta.owners || []), ...names("owner")])].sort(),
      landlords: [...new Set([...(meta.landlords || []), ...names("landlord")])].sort(),
      developers: meta.developers || [],
      pfAccounts: [...new Set([...(meta.pf_accounts || []), ...names("pf_account")])].sort(),
      bayutAccounts: [...new Set([...(meta.bayut_accounts || []), ...names("bayut_account")])].sort(),
      directory,
      pfPhotos: meta.pf_photos || {},
    };
  }, [meta]);

  const agentListingName =
    matchAgentFromSearch(draft.q, optionLists.agents) || String(crmAgentName || "").trim();

  async function applyTicket(id) {
    const ticket = TICKETS.find((item) => item.id === id) || TICKETS[0];
    const next = {
      ...filters,
      ticket: id,
      portal: "",
      portal_agent: "",
      portal_side: "",
      portal_credit: "",
      portal_type: "",
      portal_beds: "",
      portal_community: "",
      portal_cluster: "",
      portal_live: "",
      page: 1,
    };
    setDraft((prev) => ({ ...prev, ...next }));
    setFilters(next);
    setPicked([]);
    setError("");
    flash(`Opening ${ticket.label}...`);
    tableWrapRef.current?.scrollTo({ left: 0, top: 0 });
    try {
      const result = await refresh(next, { meta: false, summary: false });
      if (result?.stale) return;
      const n = result?.total || 0;
      flash(n ? `Showing ${ticket.label} — ${n} listing${n === 1 ? "" : "s"}` : `No listings in ${ticket.label}`);
    } catch (err) {
      setError(err.message);
      flash(err.message);
    }
  }

  async function quickFilter(patch) {
    const nextDraft = { ...draft, ...patch };
    let ticket = filters.ticket;
    if (Object.prototype.hasOwnProperty.call(patch, "portal")) {
      nextDraft.q = "";
      nextDraft.listing_id = "";
      nextDraft.type = "";
      nextDraft.community = "";
      nextDraft.sub_community = "";
      nextDraft.building = "";
      nextDraft.city = "";
      nextDraft.listing_agent = "";
      nextDraft.listing_owner = "";
      nextDraft.purpose = "";
      nextDraft.category = "";
      nextDraft.quality = "";
      nextDraft.portal_agent = "";
      nextDraft.portal_side = "";
      nextDraft.portal_credit = "";
      nextDraft.portal_type = "";
      nextDraft.portal_beds = "";
      nextDraft.portal_community = "";
      nextDraft.portal_cluster = "";
      nextDraft.portal_live = "";
      if (nextDraft.portal === "any" || nextDraft.portal === "pf" || nextDraft.portal === "bayut" || nextDraft.portal === "dubizzle") {
        ticket = "all";
      }
    }
    setDraft(nextDraft);
    const next = { ...nextDraft, ticket, page: 1 };
    setFilters(next);
    setError("");
    try {
      await refresh(next);
    } catch (err) {
      setError(err.message);
    }
  }

  function createListing() {
    setEditor({
      ...emptyForm,
      type: "",
      purpose: "",
      category: "",
      listing_agent: "",
      listing_owner: "",
      created_by: "",
      area_sqft: "",
      beds: "",
      baths: "",
      reference: `a7group-${String(Date.now()).slice(-4)}`,
    });
  }

  async function applyFilters() {
    rememberPage("listings");
    setView("listings");
    const ticket = draft.portal === "any" || draft.portal === "pf" || draft.portal === "bayut" || draft.portal === "dubizzle" ? "all" : filters.ticket;
    const next = { ...draft, ticket, page: 1 };
    setFilters(next);
    setError("");
    try {
      await refresh(next);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openLivePortal(portal, slice = {}) {
    const names = { pf: "Property Finder", bayut: "Bayut", dubizzle: "Dubizzle" };
    const where = names[portal] || portal;
    const who = [slice.agent, slice.label || slice.side || slice.credit || slice.type || slice.community || slice.cluster].filter(Boolean).join(" · ");
    const title = who ? `${who} on ${where}` : `Live on ${where}`;
    const next = {
      ...emptyFilters,
      portal,
      portal_agent: slice.agent || "",
      portal_side: slice.side || "",
      portal_credit: slice.credit || "",
      portal_type: slice.type || "",
      portal_beds: slice.beds || "",
      portal_community: slice.community || "",
      portal_cluster: slice.cluster || "",
      portal_live: slice.live || "",
      ticket: "live",
      page: 1,
      sort: filters.sort,
      dir: filters.dir,
      pageSize: filters.pageSize,
    };
    setDraft(next);
    setFilters(next);
    rememberPage("listings");
    setView("listings");
    setPicked([]);
    setError("");
    flash(`Opening ${title}...`);
    try {
      const result = await refresh(next);
      if (result?.stale) return;
      const n = result?.total || 0;
      flash(n ? `${title} — ${n} listing${n === 1 ? "" : "s"}` : `No listings in ${title}`);
    } catch (err) {
      setError(err.message);
      flash(err.message);
    }
  }

  async function openLivePortalType(portal, type) {
    const names = { pf: "Property Finder", bayut: "Bayut", dubizzle: "Dubizzle" };
    const title = `${pretty(type)} live on ${names[portal] || portal}`;
    const next = {
      ...emptyFilters,
      portal,
      type,
      ticket: "live",
      page: 1,
      sort: filters.sort,
      dir: filters.dir,
      pageSize: filters.pageSize,
    };
    setDraft(next);
    setFilters(next);
    rememberPage("listings");
    setView("listings");
    setPicked([]);
    setError("");
    flash(`Opening ${title}...`);
    try {
      const result = await refresh(next);
      if (result?.stale) return;
      const n = result?.total || 0;
      flash(n ? `${title} — ${n} listing${n === 1 ? "" : "s"}` : `No listings in ${title}`);
    } catch (err) {
      setError(err.message);
      flash(err.message);
    }
  }

  async function openAdSlice(slice = {}) {
    const next = {
      ...emptyFilters,
      ticket: "all",
      portal: "any",
      purpose: slice.purpose || "",
      community: slice.community || "",
      sub_community: slice.sub_community || "",
      type: slice.type || "",
      listing_agent: slice.listing_agent || "",
      beds: slice.beds || "",
      page: 1,
    };
    const bits = [
      slice.purpose === "both" ? "Rent and sale" : slice.purpose === "sale" ? "Sale" : slice.purpose === "rent" ? "Rent" : "",
      slice.community,
      slice.sub_community,
      slice.type,
      slice.listing_agent,
      slice.beds === "0" ? "Studio" : slice.beds ? `${slice.beds} Bedroom` : "",
    ].filter(Boolean);
    const title = bits.join(" · ") || "All ads";
    setDraft(next);
    setFilters(next);
    rememberPage("listings");
    setView("listings");
    setPicked([]);
    setError("");
    flash(`Opening ${title}...`);
    try {
      const result = await refresh(next);
      if (result?.stale) return;
      const n = result?.total || 0;
      flash(n ? `${title} — ${n} listing${n === 1 ? "" : "s"}` : `No listings in ${title}`);
    } catch (err) {
      setError(err.message);
      flash(err.message);
    }
  }

  async function openInfoSlice(category, key) {
    const next = infoSliceFilters(draft, category, key);
    const title = infoSliceTitle(category, key);
    setDraft(next);
    setFilters(next);
    rememberPage("listings");
    setView("listings");
    setPicked([]);
    setError("");
    flash(`Opening ${title}...`);
    try {
      const result = await refresh(next);
      if (result?.stale) return;
      const n = result?.total || 0;
      flash(n ? `${title} — ${n} listing${n === 1 ? "" : "s"}` : `No listings in ${title}`);
    } catch (err) {
      setError(err.message);
      flash(err.message);
    }
  }

  async function resetFilters() {
    const next = { ...emptyFilters, ticket: filters.ticket };
    setDraft(next);
    setFilters(next);
    setError("");
    try {
      await refresh(next);
    } catch (err) {
      setError(err.message);
    }
  }

  async function backToListings() {
    const next = {
      ...filters,
      listing_id: "",
      q: looksLikeAdRef(filters.q) ? "" : filters.q,
      page: 1,
    };
    setDraft({ ...draft, listing_id: next.listing_id, q: next.q, page: 1 });
    setFilters(next);
    setListingLeadSummary(null);
    setError("");
    try {
      await refresh(next);
    } catch (err) {
      setError(err.message);
    }
  }

  async function changePage(page) {
    const size = Number(filters.pageSize || 10) || 10;
    const maxPage = Math.max(1, Math.ceil(Number(total || 0) / size) || 1);
    const safePage = Math.min(maxPage, Math.max(1, Number(page || 1)));
    const next = { ...filters, page: safePage };
    setFilters(next);
    setDraft((prev) => ({ ...prev, page: safePage, pageSize: next.pageSize }));
    try {
      const body = await refresh(next);
      // If server clamped page (stale restore), sync UI to returned page.
      if (body?.page && Number(body.page) !== safePage) {
        const synced = { ...next, page: Number(body.page) };
        setFilters(synced);
        setDraft((prev) => ({ ...prev, page: synced.page }));
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    }
  }

  async function applySort(field) {
    const dir = filters.sort === field && filters.dir === "desc" ? "asc" : "desc";
    const next = { ...filters, sort: field, dir, page: 1 };
    setFilters(next);
    try {
      await refresh(next);
    } catch (err) {
      setError(err.message);
    }
  }

  async function runAction(label, request) {
    setBusy(true);
    setError("");
    flash(`${label}...`);
    try {
      const body = await request();
      flash(label);
      setPicked([]);
      await refresh();
      return body;
    } catch (err) {
      setError(err.message);
      flash(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(status) {
    if (!picked.length) return;
    await runAction(`${pretty(status)} updated`, () =>
      api("/api/listings/bulk-status", {
        method: "POST",
        body: JSON.stringify({ ids: picked, status }),
      })
    );
  }

  async function bulkPortals(add, remove, status, label) {
    if (!picked.length) return;
    await runAction(label, () =>
      api("/api/listings/bulk-portals", {
        method: "POST",
        body: JSON.stringify({ ids: picked, add, remove, status }),
      })
    );
  }

  function openBulk(id) {
    setBulkOpen(false);
    const option = BULK_OPTIONS.find((item) => item.id === id);
    if (!option) return;
    if (option.admin && !user?.admin) {
      setError(`Only admin can use "${option.label}".`);
      return;
    }
    if (!option.noPick && !picked.length) {
      setError("Please select some properties.");
      return;
    }
    setError("");
    switch (id) {
      case "transfer_agent":
      case "transfer_owner":
      case "transfer_account":
      case "delete":
      case "import":
        setDialogValue({});
        setImportResult(null);
        setDialog(id);
        return;
      case "refresh":
        runAction("Listings refreshed", () =>
          api("/api/listings/bulk-refresh", { method: "POST", body: JSON.stringify({ ids: picked }) })
        );
        return;
      case "duplicate":
        runAction("Listings duplicated", () =>
          api("/api/listings/bulk-duplicate", { method: "POST", body: JSON.stringify({ ids: picked }) })
        );
        return;
      case "publish":
        bulkPortals([], [], "live", "Published");
        return;
      case "publish_bayut":
        bulkPortals(["bayut"], [], "live", "Published to Bayut");
        return;
      case "publish_dubizzle":
        bulkPortals(["dubizzle"], [], "live", "Published to Dubizzle");
        return;
      case "publish_pf":
        bulkPortals(["pf"], [], "live", "Published to Property Finder");
        return;
      case "unpublish":
        bulkPortals([], [], "archived", "Unpublished");
        return;
      case "unpublish_pf":
        bulkPortals([], ["pf", "pf_api"], "", "Removed from Property Finder");
        return;
      case "unpublish_bayut":
        bulkPortals([], ["bayut"], "", "Removed from Bayut");
        return;
      case "unpublish_dubizzle":
        bulkPortals([], ["dubizzle"], "", "Removed from Dubizzle");
        return;
      case "push_website":
        bulkPortals(["website"], [], "", "Pushed to website");
        return;
      default:
    }
  }

  async function submitDialog() {
    const value = dialogValue;
    if (dialog === "transfer_agent") {
      if (!value.name) return setError("Pick an agent.");
      setDialog(null);
      await runAction("Transferred to agent", () =>
        api("/api/listings/transfer", {
          method: "POST",
          body: JSON.stringify({ ids: picked, listing_agent: value.name }),
        })
      );
      return;
    }
    if (dialog === "transfer_owner") {
      if (!value.name) return setError("Pick an owner.");
      setDialog(null);
      await runAction("Owner transferred", () =>
        api("/api/listings/transfer-owner", {
          method: "POST",
          body: JSON.stringify({ ids: picked, listing_owner: value.name }),
        })
      );
      return;
    }
    if (dialog === "transfer_account") {
      if (!value.pf_account && !value.bayut_account) return setError("Pick a portal account.");
      setDialog(null);
      await runAction("Transferred between portal accounts", () =>
        api("/api/listings/transfer-account", {
          method: "POST",
          body: JSON.stringify({
            ids: picked,
            pf_account: value.pf_account || "",
            bayut_account: value.bayut_account || "",
          }),
        })
      );
      return;
    }
    if (dialog === "delete") {
      setDialog(null);
      await runAction("Listings deleted", () =>
        api("/api/listings/bulk-delete", { method: "POST", body: JSON.stringify({ ids: picked }) })
      );
      return;
    }
    if (dialog === "unpublish_portals") {
      const listingId = dialogValue.listingId;
      const selected = Array.isArray(dialogValue.selected) ? dialogValue.selected : [];
      if (!listingId || !selected.length) return setError("Select at least one portal.");
      setDialog(null);
      const names = selected
        .map((id) => UNPUBLISH_PORTALS.find((row) => row.id === id)?.label || id)
        .join(", ");
      await runAction(`Unpublished from ${names}`, () =>
        api(`/api/listings/${listingId}/unpublish`, {
          method: "POST",
          body: JSON.stringify({ portals: selected }),
        })
      );
    }
  }

  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      const res = await fetch(`/api/import${dialogValue.overwrite ? "?overwrite=1" : ""}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "text/csv" },
        body: text,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Import failed");
      setImportResult(body);
      flash(`Imported ${body.created} new, ${body.updated} updated`);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setRowStatus(row, status) {
    setMenuId("");
    await runAction(`Marked ${status}`, () =>
      api(`/api/listings/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
    );
  }

  async function duplicateRow(row) {
    setMenuId("");
    const body = await runAction("Duplicate created", () =>
      api(`/api/listings/${row.id}/duplicate`, { method: "POST" })
    );
    if (body?.listing) setEditor(body.listing);
  }

  async function refreshCreateRow(row) {
    setMenuId("");
    if (
      !window.confirm(
        isPortalLive(row)
          ? `Refresh ${row.reference} as a new listing with a new reference number? The current listing stays live.`
          : `Refresh ${row.reference} as a new listing with a new reference number? The current listing will be archived.`
      )
    ) {
      return;
    }
    const body = await runAction("Listing refreshed with a new reference", () =>
      api(`/api/listings/${row.id}/refresh-create`, { method: "POST" })
    );
    if (body?.listing) setEditor(body.listing);
  }

  async function deleteRow(row) {
    setMenuId("");
    if (!window.confirm(`Delete ${row.reference}? This cannot be undone.`)) return;
    await runAction("Listing deleted", () => api(`/api/listings/${row.id}`, { method: "DELETE" }));
  }

  async function openViewer(row) {
    setViewer(row);
    setInsights(null);
    setViewerLeads([]);
    try {
      const body = await api(`/api/listings/${row.id}/insights`);
      setInsights(body.insights);
    } catch {
      /* insights optional */
    }
    try {
      const body = await api(`/api/listings/${row.id}/leads`);
      setViewerLeads(body.leads || []);
    } catch {
      /* leads optional */
    }
  }

  async function openChangeLog(row) {
    setMenuId("");
    setChangeLog({
      reference: row.reference,
      title: row.title,
      sessions: [],
      rows: [],
      loading: true,
      error: "",
    });
    try {
      const body = await api(`/api/listings/${encodeURIComponent(row.id)}/history`);
      setChangeLog({
        reference: body.reference || row.reference,
        title: body.title || row.title,
        sessions: body.sessions || [],
        rows: body.rows || [],
        loading: false,
        error: "",
      });
    } catch (err) {
      setChangeLog({
        reference: row.reference,
        title: row.title,
        sessions: [],
        rows: [],
        loading: false,
        error: err instanceof Error ? err.message : "Could not load change history.",
      });
    }
  }

  async function addPerson(kind, data) {
    const body = await api("/api/directory", {
      method: "POST",
      body: JSON.stringify({ kind, ...data }),
    });
    await refresh();
    return body.person;
  }

  if (boot === "loading" || boot === "gate") {
    return <GateScreen waiting={boot === "loading"} message={gate} />;
  }

  if (isDailyReportOnlyClient(user)) {
    return (
      <div className="app-shell app-daily-report-only">
        <aside className="sidebar">
          <div className="side-brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 40 16" fill="none">
                <path d="M3 13.5 20 3l17 10.5" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <b>A7</b>
            </span>
            <div className="side-brand-text">
              <em>PROPERTY</em>
              <strong>LISTING</strong>
              <small>A7 GROUP</small>
            </div>
          </div>
          <nav className="side-nav" aria-label="Sections">
            <button type="button" className="on">
              <Icon d="M5 19V11m7 8V5m7 14v-8" />
              <span>Listing Infographics</span>
            </button>
          </nav>
          <div className="side-foot">
            <span>{user?.name || "Limited access"}</span>
            <span>TL agent report only</span>
            <i />
          </div>
        </aside>
        <main className="main">
          <div className="adr-only-wrap">
            <AgentDailyReportCard compact viewer={user} />
            <AgentMonthBoard />
            <OfficeShareHistoryCard />
            <TeamLeadReportCard />
          </div>
        </main>
      </div>
    );
  }

  if (editor) {
    return (
      <ListingStudio
        listing={editor}
        user={user}
        counts={counts}
        websiteCounts={websiteCounts}
        agents={optionLists.agents}
        owners={optionLists.owners}
        landlords={optionLists.landlords}
        developers={optionLists.developers}
        directory={optionLists.directory}
        pfAccounts={optionLists.pfAccounts}
        bayutAccounts={optionLists.bayutAccounts}
        onAddPerson={addPerson}
        onChange={(listing) => {
          setEditor(listing);
          if (listing?.id) {
            setListings((rows) => rows.map((row) => (row.id === listing.id ? { ...row, ...listing } : row)));
          }
        }}
        onClose={async () => {
          setEditor(null);
          await refresh();
        }}
        onSaved={async () => {
          setEditor(null);
          await refresh();
        }}
      />
    );
  }

  const currentTicket = TICKETS.find((item) => item.id === filters.ticket) || TICKETS[0];
  const csvHref = `/api/listings.csv${queryString(filters, currentTicket)}`;
  const searchBar = (
    <header className={`topbar${view !== "listings" ? " topbar-below" : ""}`}>
      <label className="global-search">
        <Icon d="M11 4a7 7 0 1 0 4.4 12.4L20 21m-2-10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
        <input
          value={draft.q}
          placeholder="Search by title, reference, community, or agent..."
          onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (view === "infographics") {
              e.preventDefault();
              return;
            }
            applyFilters();
          }}
        />
      </label>
      <button type="button" className="refresh-listings" disabled={portalRefresh} onClick={refreshPortals}>
        {portalRefresh ? "Refreshing..." : "Refresh listing"}
      </button>
      <div className="top-metrics">
        <span
          className="metric-chip tone-availability"
          title={liveWebsiteTitle(websiteCounts)}
        >
          <span className="metric-chip-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2.75a6.5 6.5 0 0 0-6.5 6.5c0 4.6 5.2 10.4 6.05 11.32a.6.6 0 0 0 .9 0C13.3 19.65 18.5 13.85 18.5 9.25A6.5 6.5 0 0 0 12 2.75Z"
                fill="currentColor"
                opacity="0.16"
              />
              <path
                d="M12 2.75a6.5 6.5 0 0 0-6.5 6.5c0 4.6 5.2 10.4 6.05 11.32a.6.6 0 0 0 .9 0C13.3 19.65 18.5 13.85 18.5 9.25A6.5 6.5 0 0 0 12 2.75Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="m9.6 9.4 1.7 1.7 3.2-3.3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="metric-chip-text">
            <span className="metric-chip-label">Availability</span>
            <b className="metric-chip-value">{liveWebsiteTotal(websiteCounts)}</b>
          </span>
        </span>
        <span className="metric-chip tone-listings" title={liveWebsiteTitle(websiteCounts)}>
          <span className="metric-chip-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect
                x="3.25"
                y="4.75"
                width="17.5"
                height="14.5"
                rx="2.4"
                fill="currentColor"
                opacity="0.16"
              />
              <rect
                x="3.25"
                y="4.75"
                width="17.5"
                height="14.5"
                rx="2.4"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M7 9h10M7 12h10M7 15h6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="metric-chip-text">
            <span className="metric-chip-label">Listings</span>
            <b className="metric-chip-value">{liveWebsiteTotal(websiteCounts)}</b>
          </span>
        </span>
        {user?.name ? (
          <span className="session-user" title={`Signed in as ${user.name}${user.id ? ` · Bitrix ID ${user.id}` : ""}`}>
            {user.name}
          </span>
        ) : null}
        {canManageUiPermissions || isBitrixAdmin(user) ? (
          <button
            type="button"
            className="top-settings"
            aria-label="Section permissions"
            title="Section permissions"
            onClick={() => setPermOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M19.4 13a7.7 7.7 0 0 0 .05-2l2-1.55-2-3.45-2.4.75a7.4 7.4 0 0 0-1.75-1L15 3h-6l-.3 2.75a7.4 7.4 0 0 0-1.75 1L4.55 6l-2 3.45L4.5 11a7.7 7.7 0 0 0 0 2l-2 1.55 2 3.45 2.4-.75a7.4 7.4 0 0 0 1.75 1L9 21h6l.3-2.75a7.4 7.4 0 0 0 1.75-1l2.4.75 2-3.45L19.4 13Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </header>
  );

  return (
    <div className="app-shell">
      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
      <aside className="sidebar">
        <div className="side-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 16" fill="none">
              <path d="M3 13.5 20 3l17 10.5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <b>A7</b>
          </span>
          <div className="side-brand-text">
            <em>PROPERTY</em>
            <strong>LISTING</strong>
            <small>A7 GROUP</small>
          </div>
        </div>
        <nav className="side-nav" aria-label="Sections">
          {visibleNav.map((item) => {
            if (item.id !== "noc") {
              return (
                <button
                  key={item.id}
                  type="button"
                  className={view === item.id ? "on" : ""}
                  onClick={() => openSection(item.id)}
                >
                  <Icon d={item.icon} />
                  <span>{item.label}</span>
                </button>
              );
            }
            const nocOn = NOC_VIEWS.has(view);
            return (
              <div key={item.id} className="side-nav-group">
                <button
                  type="button"
                  className={view === "noc" ? "on" : nocOn ? "open" : ""}
                  aria-expanded={nocMenuOpen}
                  aria-controls="noc-subnav"
                  onClick={() => {
                    if (canSeeSection("noc")) openSection("noc");
                    else if (visibleNocSub[0]) openSection(visibleNocSub[0].id);
                    setNocMenuOpen((open) => !open);
                  }}
                >
                  <Icon d={item.icon} />
                  <span>{item.label}</span>
                  <svg className="side-nav-caret" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {nocMenuOpen ? (
                  <div id="noc-subnav" className="side-nav-sub" role="group" aria-label="NOC sections">
                    {visibleNocSub.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        className={view === child.id ? "on" : ""}
                        onClick={() => {
                          setNocMenuOpen(true);
                          openSection(child.id);
                        }}
                      >
                        <span>{child.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <span>Building</span>
          <span>a brighter</span>
          <span>tomorrow</span>
          <i />
        </div>
      </aside>
      <main className="main">
      {pageBack ? (
        <button type="button" className="page-back" onClick={goBackPage} aria-label={`Back to ${pageBack.label}`}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
      ) : null}
      <div className={`hero-dock${view === "listings" ? " is-on" : ""}`} aria-hidden={view !== "listings"}>
        {searchBar}
        <section className="hero">
          <img className="hero-photo-img" src={heroSrc} alt="" decoding="sync" fetchPriority="high" />
          <div className="hero-copy">
            <small>A7 Group</small>
            <h1>Property Listings</h1>
            <p>Manage and organize all your property listings in one place.</p>
          </div>
          <div className="hero-tag">
            <span>Premium</span>
            <span>Properties</span>
            <small>Brighter tomorrows</small>
          </div>
        </section>
      </div>

      {view === "overview" && canSeeSection("overview") && (
        <Overview
          user={user}
          info={info}
          onOpenListing={openListingByRef}
          onOpenLeads={() => {
            rememberPage("leads");
            setView("leads");
          }}
          onOpenAdSlice={openAdSlice}
          onFilterQuality={(quality) => {
            rememberPage("listings");
            quickFilter({ quality });
            setView("listings");
          }}
          onOpenLivePortal={openLivePortal}
          onOpenLiveType={openLivePortalType}
          toolbar={searchBar}
        />
      )}

      {view === "leads" && canSeeSection("leads") && (
        <LeadsView
          onOpenListing={openListingByRef}
          initialReference={leadsRef}
          toolbar={searchBar}
        />
      )}

      {view === "infographics" && canSeeSection("infographics") && (() => {
        const infoParts = INFOGRAPHICS_PART_IDS;
        const allowedInfo = Array.isArray(allowedSections)
          ? infoParts.filter((id) => allowedSections.includes(id))
          : infoParts;
        const crmParts = new Set(["ci-crm", "ci-owner", "ci-leads-detail", "ci-history", "ci-funnels", "ci-reports"]);
        const hasCrm = allowedInfo.some((id) => crmParts.has(id));
        const onlyStandalone = !hasCrm && allowedInfo.length > 0;
        return (
      <section className={`panel panel-info open view-card${onlyStandalone ? " panel-info-parts-only" : ""}`}>
        <PageBar
          kicker="A7 Group · Desk"
          title={onlyStandalone && allowedInfo.length === 1 && allowedInfo[0] === "ci-daily"
            ? "TL / Agent Report"
            : "Listing Infographics"}
          note={
            onlyStandalone && allowedInfo.length === 1 && allowedInfo[0] === "ci-daily"
              ? "Select an agent and period, then press Check to load the report from CRM."
              : "CRM Intelligence, Owner Data, Office Inventory and daily report — press Check to load."
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 19V11M12 19V5M19 19v-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          }
        />
        {hasCrm || canSeeSection("ci-listing-history") ? searchBar : null}
        {agentListingName && canSeeSection("ci-listing-history") ? (
          <AgentListingHistoryCard
            agentName={agentListingName}
            agentId={matchAgentFromSearch(draft.q, optionLists.agents) ? "" : crmAgentId}
            refreshKey={listingRefreshKey}
            onOpenListing={openListingByRef}
          />
        ) : null}
        <div className="panel-body">
          <CrmIntelligenceUi
            viewer={user}
            allowedParts={allowedSections}
            onAgentChange={(name, id) => {
              setCrmAgentName(name || "");
              setCrmAgentId(id ? String(id) : "");
            }}
            onCheckDone={() => setListingRefreshKey((n) => n + 1)}
          />
        </div>
      </section>
        );
      })()}

      {view === "filters" && canSeeSection("filters") && (
      <section className="panel panel-filters open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="Filters"
          note="Narrow the listing desk by location, specs, people and portals."
          icon={
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          }
        />
        {searchBar}
        <div className="panel-body">
            <div className="filter-board">
              <div className="filter-group">
                <h4>Listing</h4>
                <div className="filter-grid">
                  <label>
                    Listing ID / Ad reference
                    <input
                      value={draft.listing_id}
                      onChange={(e) =>
                        setDraft({ ...draft, listing_id: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Unit no
                    <input
                      value={draft.unit_no}
                      onChange={(e) => setDraft({ ...draft, unit_no: e.target.value })}
                    />
                  </label>
                  <label>
                    Permit no
                    <input
                      value={draft.permit_number}
                      onChange={(e) =>
                        setDraft({ ...draft, permit_number: e.target.value })
                      }
                    />
                  </label>
                  <label className="wide">
                    Title / community / reference
                    <input
                      value={draft.q}
                      onChange={(e) => setDraft({ ...draft, q: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyFilters();
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="filter-group">
                <h4>Location & specs</h4>
                <div className="filter-grid">
                  <label>
                    City
                    <select
                      value={draft.city}
                      onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                    >
                      <option value="">Any</option>
                      {optionLists.cities.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Community
                    <select
                      value={draft.community}
                      onChange={(e) =>
                        setDraft({ ...draft, community: e.target.value })
                      }
                    >
                      <option value="">Any</option>
                      {optionLists.communities.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sub community
                    <select
                      value={draft.sub_community}
                      onChange={(e) =>
                        setDraft({ ...draft, sub_community: e.target.value })
                      }
                    >
                      <option value="">Any</option>
                      {optionLists.subCommunities.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Building
                    <select
                      value={draft.building}
                      onChange={(e) => setDraft({ ...draft, building: e.target.value })}
                    >
                      <option value="">Any</option>
                      {optionLists.buildings.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Category
                    <select
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    >
                      <option value="">Any</option>
                      {CATEGORIES.map((item) => (
                        <option key={item} value={item}>
                          {pretty(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Property type
                    <select
                      value={draft.type}
                      onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                    >
                      <option value="">Any</option>
                      {TYPES.map((item) => (
                        <option key={item} value={item}>
                          {pretty(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Purpose
                    <select
                      value={draft.purpose}
                      onChange={(e) => setDraft({ ...draft, purpose: e.target.value })}
                    >
                      <option value="">Any</option>
                      <option value="rent">Rent</option>
                      <option value="sale">Sale</option>
                    </select>
                  </label>
                  <label>
                    Project status
                    <select
                      value={draft.project_status}
                      onChange={(e) => setDraft({ ...draft, project_status: e.target.value })}
                    >
                      <option value="">Select project status</option>
                      {PROJECT_STATUSES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Beds min
                    <input
                      type="number"
                      value={draft.minBeds}
                      onChange={(e) => setDraft({ ...draft, minBeds: e.target.value })}
                    />
                  </label>
                  <label>
                    Beds max
                    <input
                      type="number"
                      value={draft.maxBeds}
                      onChange={(e) => setDraft({ ...draft, maxBeds: e.target.value })}
                    />
                  </label>
                  <label>
                    Price min
                    <input
                      type="number"
                      value={draft.minPrice}
                      onChange={(e) => setDraft({ ...draft, minPrice: e.target.value })}
                    />
                  </label>
                  <label>
                    Price max
                    <input
                      type="number"
                      value={draft.maxPrice}
                      onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value })}
                    />
                  </label>
                </div>
              </div>
              <div className="filter-group">
                <h4>People & portals</h4>
                <div className="filter-grid">
                  <label>
                    Listing agent
                    <select
                      value={draft.listing_agent}
                      onChange={(e) =>
                        setDraft({ ...draft, listing_agent: e.target.value })
                      }
                    >
                      <option value="">Any</option>
                      {optionLists.agents.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Listing owner
                    <select
                      value={draft.listing_owner}
                      onChange={(e) =>
                        setDraft({ ...draft, listing_owner: e.target.value })
                      }
                    >
                      <option value="">Any</option>
                      {optionLists.owners.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Landlord
                    <select
                      value={draft.landlord}
                      onChange={(e) => setDraft({ ...draft, landlord: e.target.value })}
                    >
                      <option value="">Any</option>
                      {optionLists.landlords.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Developer
                    <select
                      value={draft.developer}
                      onChange={(e) =>
                        setDraft({ ...draft, developer: e.target.value })
                      }
                    >
                      <option value="">Any</option>
                      {optionLists.developers.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Landlord email
                    <input
                      value={draft.landlord_email}
                      onChange={(e) =>
                        setDraft({ ...draft, landlord_email: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Landlord phone
                    <input
                      value={draft.landlord_phone}
                      onChange={(e) =>
                        setDraft({ ...draft, landlord_phone: e.target.value })
                      }
                    />
                  </label>
                    <label>
                    Live ads on
                    <select
                      value={draft.portal}
                      onChange={(e) => setDraft({ ...draft, portal: e.target.value })}
                    >
                      <option value="">All listings</option>
                      <option value="any">{websiteChoice("any", "All 3 websites", websiteCounts)}</option>
                      <option value="pf">{websiteChoice("pf", "Property Finder", websiteCounts)}</option>
                      <option value="bayut">{websiteChoice("bayut", "Bayut", websiteCounts)}</option>
                      <option value="dubizzle">{websiteChoice("dubizzle", "Dubizzle", websiteCounts)}</option>
                    </select>
                  </label>
                  <label>
                    PF quality rating
                    <select
                      value={draft.quality}
                      onChange={(e) => setDraft({ ...draft, quality: e.target.value })}
                    >
                      {QUALITY_FILTERS.map((item) => (
                        <option key={item.id || "all"} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="filter-actions">
                <button className="btn" type="button" onClick={resetFilters}>
                  Reset
                </button>
                <button className="btn primary" type="button" onClick={applyFilters}>
                  Apply
                </button>
              </div>
            </div>
          </div>
      </section>
      )}

      {view === "tenancy" && canSeeSection("tenancy") && (
      <section className="panel panel-tenancy open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="Tenancy Contract"
          note="Fill the details, edit terms, pick the PDF template, then send on WhatsApp."
          icon={
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M6 3h9l4 4v14H6V3Zm9 0v4h4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M9 12h7M9 15.5h7M9 8.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          }
        />
        {searchBar}
        <div className="panel-body">
          <TenancyPanel user={user} listings={listings} />
        </div>
      </section>
      )}

      {view === "booking" && canSeeSection("booking") && (
      <section className="panel panel-booking open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="Title Deed"
          note="Fill the title-deed fields, save, then download the PDF."
          icon={
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M6 3h9l4 4v14H6V3Zm9 0v4h4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M8 12h8M8 15.5h5M8 8.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          }
        />
        {searchBar}
        <div className="panel-body">
          <BookingForm listings={listings} />
        </div>
      </section>
      )}

      {view === "noc" && canSeeSection("noc") && (
      <section className="panel panel-booking open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="NOC"
          note="Fill the NOC fields, save, then download the same advertisement letter."
          icon={NOC_PAGE_ICON}
        />
        {searchBar}
        <div className="panel-body">
          <NocForm listings={listings} />
        </div>
      </section>
      )}

      {view === "noc-maintenance" && canSeeSection("noc-maintenance") && (
      <section className="panel panel-booking open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="NOC Maintenance"
          note="Fill the same maintenance letter, save, then download the PDF."
          icon={NOC_PAGE_ICON}
        />
        {searchBar}
        <div className="panel-body">
          <NocMaintForm listings={listings} />
        </div>
      </section>
      )}

      {view === "noc-movein" && canSeeSection("noc-movein") && (
      <section className="panel panel-booking open view-card">
        <PageBar kicker="A7 Group · Desk" title="NOC For Move In" icon={NOC_PAGE_ICON} />
        {searchBar}
        <div className="panel-body">
          <NocMoveinForm listings={listings} />
        </div>
      </section>
      )}

      {view === "noc-moveout" && canSeeSection("noc-moveout") && (
      <section className="panel panel-booking open view-card">
        <PageBar kicker="A7 Group · Desk" title="NOC For Move Out" icon={NOC_PAGE_ICON} />
        {searchBar}
        <div className="panel-body">
          <NocMoveoutForm listings={listings} />
        </div>
      </section>
      )}

      {view === "noc-trakheesi" && canSeeSection("noc-trakheesi") && (
      <section className="panel panel-booking open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="NOC For Advertisement"
          note="Fill the advertisement letter, save, then download the PDF."
          icon={NOC_PAGE_ICON}
        />
        {searchBar}
        <div className="panel-body">
          <NocTrakheesiForm listings={listings} />
        </div>
      </section>
      )}

      {view === "form-a" && canSeeSection("form-a") && (
      <section className="panel panel-booking open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="Form A"
          note="Fill any step, save a draft, then download the Form A PDF."
          icon={FORM_A_PAGE_ICON}
        />
        {searchBar}
        <div className="panel-body">
          <FormAForm listings={listings} />
        </div>
      </section>
      )}

      {view === "form-i" && canSeeSection("form-i") && (
      <section className="panel panel-booking open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="Form I"
          note="Fill every Agent-to-Agent field, save, then download the same RERA Form I."
          icon={FORM_I_PAGE_ICON}
        />
        {searchBar}
        <div className="panel-body">
          <FormIForm listings={listings} directory={optionLists.directory} />
        </div>
      </section>
      )}

      {view === "booking-form" && canSeeSection("booking-form") && (
      <section className="panel panel-booking open view-card">
        <PageBar
          kicker="A7 Group · Desk"
          title="Booking Form"
          note="Fill the receipt voucher first. The last page prints the same fields, selected stamp, and office logo."
          icon={BOOKING_FORM_PAGE_ICON}
        />
        {searchBar}
        <div className="panel-body">
          <BookingReceiptForm listings={listings} />
        </div>
      </section>
      )}

      <div className="listings-keep" hidden={view !== "listings" || !canSeeSection("listings")} aria-hidden={view !== "listings" || !canSeeSection("listings")}>
      <div className="tickets-bar">
        <div className="tickets">
          {TICKETS.map((item) => (
            <button
              key={item.id}
              className={`ticket ${item.id}${!WEBSITE_VIEW[filters.portal] && filters.ticket === item.id ? " active" : ""}`}
              type="button"
              onClick={() => applyTicket(item.id)}
            >
              <span className="count">{ticketCount(item, counts)}</span>
              <span className="label">{item.label}</span>
            </button>
          ))}
        </div>
        <p className="ticket-view-note">
          Viewing <b>{WEBSITE_VIEW[filters.portal] || currentTicket.label}</b>
          {busy ? " · loading…" : ` · ${total} listing${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="desk-toolbar">
        <label className="tool-search">
          <Icon d="M11 4a7 7 0 1 0 4.4 12.4L20 21m-2-10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          <input
            value={draft.q}
            placeholder="Search listings..."
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
        </label>
        <label className="tool-search tool-ref">
          <input
            value={draft.listing_id}
            placeholder="Ad reference (a7group-1683)"
            aria-label="Ad reference"
            onChange={(e) => setDraft({ ...draft, listing_id: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
          {draft.listing_id ? (
            <button className="tool-clear" type="button" aria-label="Clear ad reference" onClick={backToListings}>
              ×
            </button>
          ) : null}
        </label>
        <select className="tool-select" value={draft.type} onChange={(e) => quickFilter({ type: e.target.value })}>
          <option value="">All Types</option>
          {TYPES.map((item) => (
            <option key={item} value={item}>
              {pretty(item)}
            </option>
          ))}
        </select>
        <select className="tool-select" value={draft.community} onChange={(e) => quickFilter({ community: e.target.value })}>
          <option value="">All Communities</option>
          {optionLists.communities.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select className="tool-select" value={draft.listing_agent} onChange={(e) => quickFilter({ listing_agent: e.target.value })}>
          <option value="">All Agents</option>
          {optionLists.agents.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          className="tool-select"
          value={draft.portal}
          aria-label="Live ads on portal"
          onChange={(e) => quickFilter({ portal: e.target.value })}
        >
          <option value="">All listings</option>
          <option value="any">{websiteChoice("any", "All 3 websites", websiteCounts)}</option>
          <option value="pf">{websiteChoice("pf", "Property Finder", websiteCounts)}</option>
          <option value="bayut">{websiteChoice("bayut", "Bayut", websiteCounts)}</option>
          <option value="dubizzle">{websiteChoice("dubizzle", "Dubizzle", websiteCounts)}</option>
        </select>
        <select
          className="tool-select tool-select-wide"
          value={draft.quality}
          aria-label="PF quality rating"
          onChange={(e) => quickFilter({ quality: e.target.value })}
        >
          {QUALITY_FILTERS.map((item) => (
            <option key={item.id || "all"} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button className="btn tool-btn" type="button" onClick={() => { rememberPage("filters"); setView("filters"); }}>
          <Icon d="M4 6h16M7 12h10M10 18h4" />
          More Filters
        </button>
        <span className="tool-spacer" />
        <button className="btn tool-btn" type="button" onClick={() => startDownload(csvHref)}>
          <Icon d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
          Download CSV
        </button>
        <div className="bulk-menu-wrap" onClick={(event) => event.stopPropagation()}>
          <button
            className={`btn bulk-toggle${bulkOpen ? " on" : ""}`}
            type="button"
            aria-haspopup="menu"
            aria-expanded={bulkOpen}
            onClick={() => setBulkOpen((v) => !v)}
          >
            Bulk Options
            <Chevron open={bulkOpen} />
          </button>
          {bulkOpen && (
            <div className="menu bulk-menu" role="menu">
              {BULK_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={`${item.danger ? "danger" : ""}${item.admin && !user?.admin ? " locked" : ""}`}
                  onClick={() => openBulk(item.id)}
                >
                  {item.label}
                  {item.admin && !user?.admin ? <small>admin</small> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn gold" type="button" onClick={createListing}>
          <i>+</i>
          Create Listing
        </button>
      </div>

      {listingLeadSummary ? (
        <div className="listing-lead-banner">
          <p>
            <b>{listingLeadSummary.reference}</b>
            {listingLeadSummary.loading ? (
              <span> · checking CRM leads…</span>
            ) : (
              <>
                <span>
                  {" "}
                  · Desk leads: <b>{listingLeadSummary.desk ?? 0}</b>
                </span>
                <span>
                  {" "}
                  · Bitrix CRM: <b>{listingLeadSummary.crm == null ? "—" : listingLeadSummary.crm}</b>
                </span>
              </>
            )}
          </p>
          <div className="listing-lead-banner-actions">
            <button className="btn" type="button" onClick={backToListings}>
              Back to listings
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setLeadsRef(listingLeadSummary.reference);
                rememberPage("leads");
                setView("leads");
              }}
            >
              Open leads
            </button>
          </div>
        </div>
      ) : null}

      {error && <p className="err">{error}</p>}

      {picked.length > 0 && (
        <div className="bulk-bar">
          <b>{picked.length} selected</b>
          <button className="btn" type="button" onClick={() => runBulk("live")}>
            Mark live
          </button>
          <button className="btn" type="button" onClick={() => runBulk("pending")}>
            Pending
          </button>
          <button className="btn" type="button" onClick={() => runBulk("archived")}>
            Archive
          </button>
          <button className="btn" type="button" onClick={() => runBulk("pocket")}>
            Pocket
          </button>
          <button className="btn" type="button" onClick={() => runBulk("draft")}>
            Draft
          </button>
          <button className="btn" type="button" onClick={() => openBulk("transfer_agent")}>
            Transfer agent
          </button>
          <button className="btn" type="button" onClick={() => openBulk("transfer_owner")}>
            Transfer owner
          </button>
          <button className="btn" type="button" onClick={() => startDownload(csvHref)}>
            Download CSV
          </button>
          <button className="btn ghost" type="button" onClick={() => setPicked([])}>
            Clear
          </button>
        </div>
      )}

      <div className={`table-shell${busy ? " is-busy" : ""}`}>
        <div className="table-scroll-box">
        <div className="table-wrap" ref={tableWrapRef}>
        <table className="stock">
          <thead>
            <tr>
              <th>
                <input
                  className="check"
                  type="checkbox"
                  aria-label="Select all listings"
                  checked={listings.length > 0 && picked.length === listings.length}
                  onChange={(e) =>
                    setPicked(e.target.checked ? listings.map((row) => row.id) : [])
                  }
                />
              </th>
              <th>Portals</th>
              <SortTh label="Reference" field="reference" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <th>Leads</th>
              <SortTh label="Title" field="title" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Layout" field="area_sqft" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Type" field="type" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Price" field="price_aed" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Created" field="created_at" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Updated" field="updated_at" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Status" field="status" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Community" field="community" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Listing Agent" field="listing_agent" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Listing Owner" field="listing_owner" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <SortTh label="Expiry Date From Portals" field="portal_expiry" sort={filters.sort} dir={filters.dir} onSort={applySort} />
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listings.length === 0 && (
              <tr>
                <td colSpan={16} className="empty">
                  {filters.ticket === "archived"
                    ? "No archived listings here."
                    : filters.ticket === "mine"
                      ? "You have no listings here. My Listing shows only ads you posted or own."
                    : filters.ticket === "all"
                      ? "No listings in this view."
                      : `No ${currentTicket.label || "matching"} records.`}
                </td>
              </tr>
            )}
            {listings.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    className="check"
                    type="checkbox"
                    aria-label={`Select ${row.reference}`}
                    checked={picked.includes(row.id)}
                    onChange={(e) =>
                      setPicked((current) =>
                        e.target.checked
                          ? [...current, row.id]
                          : current.filter((id) => id !== row.id)
                      )
                    }
                  />
                </td>
                <td>
                  <PortalDots portals={row.portals} livePortals={row.live_portals} />
                </td>
                <td className="ref">{row.reference}</td>
                <td className="leads-count">
                  <button
                    type="button"
                    className="link"
                    title="Open leads for this listing"
                    onClick={() => {
                      setLeadsRef(row.reference);
                      rememberPage("leads");
                      setView("leads");
                    }}
                  >
                    {row.lead_count ?? 0}
                  </button>
                </td>
                <td>
                  <div className="title-cell">
                    {liveAd(row, filters.portal)?.photo || row.photo ? (
                      <img className="thumb" src={liveAd(row, filters.portal)?.photo || row.photo} alt="" />
                    ) : (
                      <div className="thumb" />
                    )}
                    <div>
                      <button
                        className="title-link"
                        type="button"
                        onClick={() => {
                          setEditor({ ...row });
                        }}
                      >
                        {liveAd(row, filters.portal)?.title || row.title}
                      </button>
                      <div className="title-sub">{liveAd(row, filters.portal)?.community || locationPath(row)}</div>
                    </div>
                  </div>
                </td>
                <td className="layout">
                  <div className="layout-line">
                    <b>{Number(liveAd(row, filters.portal) ? liveAd(row, filters.portal).size : row.area_sqft).toLocaleString()}</b> sq ft
                    <Icon d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" />
                  </div>
                  <div className="layout-line">
                    <Icon d="M4 19V10l8-5 8 5v9H4Z" />
                    <span>{liveAd(row, filters.portal) ? liveAd(row, filters.portal).beds : row.beds}</span>
                    <Icon d="M4 12h16v7H4v-7Zm2-5h4v5H6V7Zm8 2h4v3h-4V9Z" />
                    <span>{liveAd(row, filters.portal) ? liveAd(row, filters.portal).baths : row.baths}</span>
                  </div>
                </td>
                <td className="type-cell">
                  {pretty(liveAd(row, filters.portal)?.type || row.type)}
                  <small className={`tag ${liveAd(row, filters.portal)?.side || row.purpose}`}>{pretty(liveAd(row, filters.portal)?.side || row.purpose)}</small>
                </td>
                <td className="price">
                  {row.hide_price ? <span className="muted">Hidden</span> : money(liveAd(row, filters.portal) ? liveAd(row, filters.portal).price : row.price_aed)}
                  <small>{pretty(liveAd(row, filters.portal)?.category || row.category)}</small>
                </td>
                <td className="when">
                  {when(row.created_at)}
                  <small>{relative(row.created_at)}</small>
                </td>
                <td className="when">
                  {when(row.updated_at)}
                  <small>{relative(row.updated_at)}</small>
                </td>
                <td>
                  <StatusCell status={row.status} />
                  <PfChip row={row} />
                  <ContractChip value={row.contract_status} />
                </td>
                <td>{liveAd(row, filters.portal)?.community || row.community}</td>
                <td>
                  <PersonCell
                    name={liveAd(row, filters.portal)?.agent || row.listing_agent}
                    photo={
                      liveAd(row, filters.portal)?.agentPhoto ||
                      optionLists.pfPhotos[personKey(liveAd(row, filters.portal)?.agent || row.listing_agent)]
                    }
                  />
                  {liveAd(row, filters.portal)?.credit ? <small className="dz-credit">{liveAd(row, filters.portal).credit}</small> : null}
                </td>
                <td>
                  <PersonCell name={row.listing_owner} photo={optionLists.pfPhotos[personKey(row.listing_owner)]} />
                </td>
                <td className={`expiry${isListingExpired(row) ? " expired" : ""}`}>{expiryLabel(row.portal_expiry)}</td>
                <td className="actions">
                  <button
                    className={`kebab${menuId === row.id ? " on" : ""}`}
                    type="button"
                    aria-label={`Actions for ${row.reference}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuId(menuId === row.id ? "" : row.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="5" r="2.1" />
                      <circle cx="12" cy="12" r="2.1" />
                      <circle cx="12" cy="19" r="2.1" />
                    </svg>
                  </button>
                  {menuId === row.id && (
                    <div className="menu right" onClick={(event) => event.stopPropagation()}>
                      <MenuItem
                        icon="view"
                        label="View Details"
                        onClick={() => {
                          openViewer(row);
                          setMenuId("");
                        }}
                      />
                      <MenuItem
                        icon="link"
                        label="Copy Link"
                        onClick={() => {
                          setMenuId("");
                          copyListingLink(row, false);
                        }}
                      />
                      <MenuItem
                        icon="pdf"
                        label="Download PDF"
                        onClick={() => {
                          setMenuId("");
                          startDownload(`/api/listings/${row.id}/pdf`);
                        }}
                      />
                      <MenuItem
                        icon="image"
                        label="Download DLD Image"
                        onClick={() => {
                          setMenuId("");
                          startDownload(`/api/listings/${row.id}/dld`);
                        }}
                      />
                      <MenuItem
                        icon="link"
                        label="Copy Link as Logged in Agent"
                        onClick={() => {
                          setMenuId("");
                          copyListingLink(row, true);
                        }}
                      />
                      <MenuItem
                        icon="pdf"
                        label="Download PDF as Logged in Agent"
                        onClick={() => {
                          setMenuId("");
                          startDownload(`/api/listings/${row.id}/pdf?as=agent`);
                        }}
                      />
                      <MenuItem
                        icon="brochure"
                        label="Download Brochure"
                        onClick={() => {
                          setMenuId("");
                          startDownload(`/api/listings/${row.id}/brochure`);
                        }}
                      />
                      <MenuItem
                        icon="edit"
                        label="Edit listing"
                        onClick={() => {
                          setMenuId("");
                          setEditor({ ...row });
                        }}
                      />
                      <MenuItem
                        icon="history"
                        label="Change History"
                        onClick={() => openChangeLog(row)}
                      />
                      <MenuItem
                        icon="refresh"
                        label="Refresh Listing (Create New)"
                        onClick={() => refreshCreateRow(row)}
                      />
                      <MenuItem
                        icon="copy"
                        label="Duplicate listing"
                        onClick={() => duplicateRow(row)}
                      />
                      <MenuItem
                        icon="live"
                        label="Mark Live"
                        onClick={() => setRowStatus(row, "live")}
                      />
                      {liveUnpublishTargets(row).length ? (
                        <MenuItem
                          icon="unpublish"
                          label="Unpublish from portals"
                          onClick={() => {
                            setMenuId("");
                            setError("");
                            setDialogValue({
                              listingId: row.id,
                              reference: row.reference,
                              options: liveUnpublishTargets(row),
                              selected: liveUnpublishTargets(row),
                            });
                            setDialog("unpublish_portals");
                          }}
                        />
                      ) : null}
                      <MenuItem
                        icon="pdf"
                        label="Mark Pending"
                        onClick={() => setRowStatus(row, "pending")}
                      />
                      <MenuItem
                        icon="archive"
                        label="Archive"
                        onClick={() => setRowStatus(row, "archived")}
                      />
                      <MenuItem
                        icon="pocket"
                        label="Move to Pocket"
                        onClick={() => setRowStatus(row, "pocket")}
                      />
                      {user?.admin ? (
                        <MenuItem icon="trash" label="Delete" danger onClick={() => deleteRow(row)} />
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {tablePin.show && tablePin.left ? (
          <button
            className="table-scroll prev"
            type="button"
            aria-label="Scroll table left"
            style={{ top: tablePin.top, left: tablePin.leftX }}
            onClick={() => scrollTable(-1)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14.5 6 8.5 12l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
        {tablePin.show && tablePin.right ? (
          <button
            className="table-scroll next"
            type="button"
            aria-label="Scroll table right"
            style={{ top: tablePin.top, right: tablePin.rightX }}
            onClick={() => scrollTable(1)}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m9.5 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
        </div>
        <div className="pager">
          <div className="pager-meta">
            Showing <b>{from}</b> to <b>{to}</b> of <b>{total}</b> listings
          </div>
          <div className="pager-controls">
            <label className="pager-size">
              Rows
              <select
                aria-label="Rows per page"
                value={filters.pageSize}
                onChange={(e) => {
                  const next = { ...filters, pageSize: Number(e.target.value), page: 1 };
                  setFilters(next);
                  refresh(next);
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="pager-pages">
              <button
                className="pager-btn"
                type="button"
                aria-label="Previous page"
                disabled={filters.page <= 1}
                onClick={() => changePage(filters.page - 1)}
              >
                <PagerArrow dir="prev" />
              </button>
              {pageList(filters.page, pages).map((item, index) =>
                item === "..." ? (
                  <span className="pager-gap" key={`gap-${index}`}>
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    className={`pager-btn${filters.page === item ? " on" : ""}`}
                    type="button"
                    aria-current={filters.page === item ? "page" : undefined}
                    onClick={() => changePage(item)}
                  >
                    {item}
                  </button>
                )
              )}
              <button
                className="pager-btn"
                type="button"
                aria-label="Next page"
                disabled={filters.page >= pages}
                onClick={() => changePage(filters.page + 1)}
              >
                <PagerArrow dir="next" />
              </button>
            </div>
          </div>
        </div>
      </div>

      </div>

      {changeLog ? (
        <Modal
          wide
          title={`Change History · ${changeLog.reference || "Listing"}`}
          onClose={() => setChangeLog(null)}
        >
          <div className="change-log">
            {changeLog.title ? <p className="change-log-title">{changeLog.title}</p> : null}
            {changeLog.loading ? <p className="tc-hint">Loading every edit…</p> : null}
            {changeLog.error ? <p className="change-log-error">{changeLog.error}</p> : null}
            {!changeLog.loading && !changeLog.error && !(changeLog.rows || []).length ? (
              <p className="tc-hint">
                No change history yet. The next time someone edits this listing, their Bitrix name, Bitrix ID, date,
                time, and every field they changed will show here.
              </p>
            ) : null}
            {(changeLog.rows || []).length ? (
              <div className="change-log-table-wrap">
                <table className="change-log-table">
                  <thead>
                    <tr>
                      <th>Edited by</th>
                      <th>Date &amp; time</th>
                      <th>What they edited</th>
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeLog.rows.map((item, index) => (
                      <tr key={`${item.at}-${item.field}-${index}`}>
                        <td>
                          <HistoryWho by={item.by} byId={item.byId} />
                        </td>
                        <td>
                          <time dateTime={item.at}>{whenDubai(item.at)}</time>
                        </td>
                        <td>{item.label || historyFieldLabel(item.field)}</td>
                        <td>{item.field === "created" ? "—" : item.from || "—"}</td>
                        <td>{item.value || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {viewer && (
        <div
          className="overlay"
          role="dialog"
          aria-label="Listing details"
          onClick={() => setViewer(null)}
        >
          <div className="viewer" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-top">
              <div>
                <small>{viewer.reference}</small>
                <h2>{viewer.title}</h2>
                <p>{locationPath(viewer)}</p>
              </div>
              <button className="btn ghost" type="button" onClick={() => setViewer(null)}>
                Close
              </button>
            </div>
            {viewer.photo ? <img className="viewer-photo" src={viewer.photo} alt="" /> : null}
            {(viewer.gallery || []).filter((item) => item.url && item.url !== viewer.photo).length ? (
              <div className="viewer-thumbs">
                {(viewer.gallery || [])
                  .filter((item) => item.url && item.url !== viewer.photo)
                  .slice(0, 8)
                  .map((item) => (
                    <img key={item.url} src={item.url} alt="" />
                  ))}
              </div>
            ) : null}
            <div className="viewer-grid">
              <div><span>Purpose</span><b>{pretty(viewer.purpose)}</b></div>
              <div><span>Type</span><b>{pretty(viewer.type)} / {pretty(viewer.category)}</b></div>
              <div><span>Layout</span><b>{viewer.beds} bed / {viewer.baths} bath / {Number(viewer.area_sqft).toLocaleString()} sqft</b></div>
              <div><span>Price</span><b>{viewer.hide_price ? "Hidden on portals" : money(viewer.price_aed)}</b></div>
              <div><span>Status</span><b>{pretty(viewer.status)}</b></div>
              <div><span>Community</span><b>{viewer.community || "-"}</b></div>
              <div><span>Building</span><b>{viewer.building || "-"}</b></div>
              <div><span>Agent</span><b>{(viewer.dubizzle?.agent || viewer.listing_agent) ? <PersonCell name={viewer.dubizzle?.agent || viewer.listing_agent} photo={viewer.dubizzle?.agentPhoto || optionLists.pfPhotos[personKey(viewer.dubizzle?.agent || viewer.listing_agent)]} /> : "-"}</b></div>
              <div><span>Owner</span><b>{viewer.listing_owner ? <PersonCell name={viewer.listing_owner} photo={optionLists.pfPhotos[personKey(viewer.listing_owner)]} /> : "-"}</b></div>
              <div><span>Permit</span><b>{viewer.permit_number || "-"}</b></div>
              <div><span>Unit</span><b>{viewer.unit_no || "-"}</b></div>
              <div><span>Furnished</span><b>{pretty(viewer.furnished) || "-"}</b></div>
              <div><span>Parking spaces</span><b>{viewer.parking || "-"}</b></div>
              <div><span>Portals</span><b>{PORTALS.filter((p) => [...new Set([...(viewer.portals || []), ...(viewer.live_portals || [])])].includes(p.id)).map((p) => p.name).join(", ") || "None"}</b></div>
              <div><span>Created</span><b>{when(viewer.created_at)}</b></div>
              <div><span>Portal expiry</span><b>{viewer.portal_expiry ? when(viewer.portal_expiry) : "N/A"}</b></div>
              <div><span>Listing views</span><b>{insights ? insights.views : Number(viewer.views || 0)}</b></div>
              <div><span>Days listed</span><b>{insights ? insights.days_listed : "-"}</b></div>
              <div><span>Contract</span><b>{viewer.contract_status ? <ContractChip value={viewer.contract_status} /> : "None"}</b></div>
            </div>
            {viewer.pf_id ? (
              <div className="viewer-pf">
                <h3>
                  Property Finder <PfChip row={viewer} />
                </h3>
                <div className="viewer-grid">
                  <div><span>PF status</span><b>{pretty(viewer.pf_state || "-")}{viewer.pf_state_type && viewer.pf_state_type !== viewer.pf_state ? ` (${pretty(viewer.pf_state_type)})` : ""}</b></div>
                  <div><span>Published on PF</span><b>{viewer.pf_published_at ? when(viewer.pf_published_at) : "-"}</b></div>
                  <div><span>Quality score</span><b className={`score ${scoreTone(viewer.pf_quality_score)}`}>{viewer.pf_quality_score || "-"}</b></div>
                  <div><span>PF leads</span><b>{viewerLeads.length}</b></div>
                  <div><span>Created on PF</span><b>{viewer.pf_created_at ? when(viewer.pf_created_at) : "-"}</b></div>
                  <div><span>Last PF update</span><b>{viewer.pf_updated_at ? when(viewer.pf_updated_at) : "-"}</b></div>
                </div>
                {(viewer.pf_reasons || []).length ? (
                  <p className="pf-reasons">Taken down: {viewer.pf_reasons.join("; ")}</p>
                ) : null}
                {viewer.pf_quality?.details ? (
                  <ul className="pf-quality">
                    {Object.entries(viewer.pf_quality.details).map(([key, item]) => (
                      <li key={key} className={item.color || ""}>
                        <i />
                        <span>{pretty(key)}</span>
                        <em>{item.tag || ""}</em>
                        <small>{item.help || ""}</small>
                        <b>{item.value ?? "-"}/{item.weight ?? "-"}</b>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {viewerLeads.length ? (
                  <ul className="ov-leads compact">
                    {viewerLeads.slice(0, 8).map((lead) => (
                      <li key={lead.id}>
                        <span className={`lead-ch ${lead.channel}`}>{lead.channel}</span>
                        <div>
                          <b>{lead.sender_name || lead.sender_phone || "Empty"}</b>
                          <small>{lead.sender_phone || lead.sender_email || ""} · {when(lead.created_at)}</small>
                          {lead.has_recording ? <LeadRecording lead={lead} compact /> : null}
                        </div>
                        <em>{lead.status}</em>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {viewerLeads.some((lead) => lead.has_recording) ? (
                  <div className="viewer-recs">
                    <h4>Call recordings on this listing</h4>
                    <p>These are the Property Finder calls for this listing only.</p>
                    {viewerLeads
                      .filter((lead) => lead.has_recording)
                      .map((lead) => (
                        <div key={`rec-${lead.id}`} className="viewer-rec">
                          <div>
                            <b>{lead.sender_name || lead.sender_phone || "Empty"}</b>
                            <small>{when(lead.created_at)} · {lead.agent_name || "Agent"}</small>
                          </div>
                          <LeadRecording lead={lead} />
                        </div>
                      ))}
                  </div>
                ) : null}
                {viewerLeads.length > 8 ? (
                  <button type="button" className="link" onClick={() => { setLeadsRef(viewer.reference); setViewer(null); rememberPage("leads"); setView("leads"); }}>
                    See all {viewerLeads.length} leads
                  </button>
                ) : null}
              </div>
            ) : null}
            {viewer.bayut ? (
              <div className="viewer-pf">
                <h3>Bayut</h3>
                <div className="viewer-grid">
                  <div><span>Agent on this ad</span><b>{viewer.bayut.agent || "-"}</b></div>
                  <div><span>Credit on this ad</span><b>{viewer.bayut.credit || "Standard"}</b></div>
                  <div><span>Purpose</span><b>{pretty(viewer.bayut.side)}</b></div>
                  <div><span>Type</span><b>{pretty(viewer.bayut.type)} / {pretty(viewer.bayut.category)}</b></div>
                  <div><span>Layout</span><b>{viewer.bayut.beds} bed / {viewer.bayut.baths} bath / {Number(viewer.bayut.size || 0).toLocaleString()} sqft</b></div>
                  <div><span>Price</span><b>{money(viewer.bayut.price)}</b></div>
                  <div><span>Community</span><b>{viewer.bayut.community || "-"}</b></div>
                  <div>
                    <span>Bayut page</span>
                    <b>
                      {viewer.bayut.url ? (
                        <a href={viewer.bayut.url} target="_blank" rel="noreferrer">Open ad</a>
                      ) : (
                        "Live on Bayut"
                      )}
                    </b>
                  </div>
                </div>
              </div>
            ) : null}
            {viewer.dubizzle ? (
              <div className="viewer-pf">
                <h3>Dubizzle</h3>
                <div className="viewer-grid">
                  <div><span>Agent on this ad</span><b>{viewer.dubizzle.agent || "-"}</b></div>
                  <div><span>Credit on this ad</span><b>{viewer.dubizzle.credit || "Standard"}</b></div>
                  <div><span>Purpose</span><b>{pretty(viewer.dubizzle.side)}</b></div>
                  <div><span>Type</span><b>{pretty(viewer.dubizzle.type)} / {pretty(viewer.dubizzle.category)}</b></div>
                  <div><span>Layout</span><b>{viewer.dubizzle.beds} bed / {viewer.dubizzle.baths} bath / {Number(viewer.dubizzle.size || 0).toLocaleString()} sqft</b></div>
                  <div><span>Price</span><b>{money(viewer.dubizzle.price)}</b></div>
                  <div><span>Community</span><b>{viewer.dubizzle.community || "-"}</b></div>
                  <div>
                    <span>Dubizzle page</span>
                    <b>
                      {viewer.dubizzle.url ? (
                        <a href={viewer.dubizzle.url} target="_blank" rel="noreferrer">Open ad</a>
                      ) : (
                        "Live on Dubizzle"
                      )}
                    </b>
                  </div>
                </div>
              </div>
            ) : null}
            {viewer.description ? <p className="viewer-copy">{viewer.description}</p> : null}
            {(viewer.amenities || []).length ? (
              <div className="viewer-tags">
                {viewer.amenities.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
            <div className="wizard-actions">
              <button
                className="btn"
                type="button"
                onClick={() => startDownload(`/api/listings/${viewer.id}/pdf`)}
              >
                Download PDF
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => startDownload(`/api/listings/${viewer.id}/brochure`)}
              >
                Brochure
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => window.open(shareLink(viewer, null), "_blank", "noopener")}
              >
                Open public page
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setContractFor(viewer);
                  setViewer(null);
                }}
              >
                Contracts / e-sign
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  setEditor({ ...viewer });
                  setViewer(null);
                }}
              >
                Edit listing
              </button>
            </div>
          </div>
        </div>
      )}

      {contractFor ? (
        <ContractPanel
          listing={contractFor}
          user={user}
          onClose={() => setContractFor(null)}
          onChanged={() => refresh().catch(() => {})}
        />
      ) : null}

      {dialog === "transfer_agent" || dialog === "transfer_owner" ? (
        <Modal
          title={dialog === "transfer_agent" ? "Transfer to Agent" : "Transfer Owner"}
          onClose={() => setDialog(null)}
        >
          <p className="muted">{picked.length} listing{picked.length === 1 ? "" : "s"} selected.</p>
          <label className="dialog-field">
            Transfer to:
            <select
              value={dialogValue.name || ""}
              onChange={(e) => setDialogValue({ ...dialogValue, name: e.target.value })}
            >
              <option value="">Please select</option>
              {(dialog === "transfer_agent" ? optionLists.agents : optionLists.owners).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="dialog-field">
            Or type a new name
            <input
              value={dialogValue.custom || ""}
              onChange={(e) => setDialogValue({ ...dialogValue, custom: e.target.value, name: e.target.value })}
              placeholder="Full name"
            />
          </label>
          <div className="wizard-actions">
            <button className="btn primary" type="button" disabled={busy} onClick={submitDialog}>
              Transfer
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "transfer_account" ? (
        <Modal title="Transfer Between Portal Accounts" onClose={() => setDialog(null)}>
          <p className="muted">{picked.length} listing{picked.length === 1 ? "" : "s"} selected.</p>
          <label className="dialog-field">
            Property Finder account
            <input
              list="pf-accounts"
              value={dialogValue.pf_account || ""}
              onChange={(e) => setDialogValue({ ...dialogValue, pf_account: e.target.value })}
              placeholder="Account name or ID"
            />
            <datalist id="pf-accounts">
              {optionLists.pfAccounts.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label className="dialog-field">
            Bayut account
            <input
              list="bayut-accounts"
              value={dialogValue.bayut_account || ""}
              onChange={(e) => setDialogValue({ ...dialogValue, bayut_account: e.target.value })}
              placeholder="Account name or ID"
            />
            <datalist id="bayut-accounts">
              {optionLists.bayutAccounts.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <div className="wizard-actions">
            <button className="btn primary" type="button" disabled={busy} onClick={submitDialog}>
              Transfer To Account
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "delete" ? (
        <Modal title="Delete listings" onClose={() => setDialog(null)}>
          <p>
            Delete <b>{picked.length}</b> listing{picked.length === 1 ? "" : "s"}? This removes them from the
            desk, the feeds and the public pages. This cannot be undone.
          </p>
          <div className="wizard-actions">
            <button className="btn" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button className="btn danger" type="button" disabled={busy} onClick={submitDialog}>
              Delete
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "unpublish_portals" ? (
        <Modal title="Unpublish from portals" onClose={() => setDialog(null)}>
          <p>
            Take <b>{dialogValue.reference || "this listing"}</b> off the portals where it is currently live.
            Property Finder unpublishes immediately. Bayut and Dubizzle drop from the live XML feed.
          </p>
          <div className="unpub-picks" role="group" aria-label="Portals to unpublish">
            {(dialogValue.options || []).map((id) => {
              const label = UNPUBLISH_PORTALS.find((row) => row.id === id)?.label || id;
              const on = (dialogValue.selected || []).includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`unpub-pick${on ? " on" : ""}`}
                  aria-pressed={on}
                  onClick={() => {
                    const current = new Set(dialogValue.selected || []);
                    if (current.has(id)) current.delete(id);
                    else current.add(id);
                    setDialogValue({ ...dialogValue, selected: [...current] });
                  }}
                >
                  <span className="unpub-box" aria-hidden="true">{on ? "✓" : ""}</span>
                  {label}
                </button>
              );
            })}
          </div>
          <div className="wizard-actions">
            <button className="btn" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy || !(dialogValue.selected || []).length}
              onClick={submitDialog}
            >
              Unpublish
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "import" ? (
        <Modal title="Import from the old Property Listing desk" onClose={() => setDialog(null)} wide>
          <p>
            Open the old desk, tick the listings, use <b>Download CSV (Beta)</b>, then pick that file here.
            Rows are matched on the reference number. Existing references are skipped unless overwrite is on.
          </p>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={Boolean(dialogValue.overwrite)}
              onChange={(e) => setDialogValue({ ...dialogValue, overwrite: e.target.checked })}
            />
            Overwrite listings that already exist with the same reference
          </label>
          <label className="doc-browse import-browse">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                importFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {busy ? "Importing..." : "Choose CSV file"}
          </label>
          {importResult ? (
            <div className="import-result">
              <p>
                <b>{importResult.created}</b> created, <b>{importResult.updated}</b> updated,{" "}
                <b>{importResult.skipped}</b> skipped.
              </p>
              {importResult.details?.length ? (
                <ul>
                  {importResult.details.map((item, index) => (
                    <li key={index}>
                      {item.row}: {item.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Modal>
      ) : null}
      <SectionPermissionsModal
        open={Boolean(permOpen && (canManageUiPermissions || isBitrixAdmin(user)))}
        onClose={() => setPermOpen(false)}
        onSaved={(userId, sections) => {
          if (String(userId) === String(user?.id)) setAllowedSections(sections);
        }}
      />
      <ExpiryAlertModal
        alert={expiryAlert}
        onDismiss={dismissExpiryAlert}
        onOpenListing={openListingByRef}
      />
      </main>
    </div>
  );
}
