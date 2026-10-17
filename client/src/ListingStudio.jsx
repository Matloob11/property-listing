import { useEffect, useMemo, useRef, useState } from "react";
import { LIVE_GO_IDS, LIVE_GO_PORTALS, withLiveGoPortals } from "./liveGoPortals.js";
import { listingCopyErrors, listingLivePriceError, listingPublishError, parseMoney } from "../../server/listingErrors.js";
import { historyActorId, historyActorName, isListingExpired, listingExpiryError } from "../../server/listingModel.js";
import { mergeClientCatalog, SuggestField } from "./LocationSuggest.jsx";
import { STUDIO_ICONS } from "./studioIcons.js";
import { CrmTypeahead, lookupCrmItem, crmUnitLabel } from "./CrmTypeahead.jsx";

const STUDIO_STEPS = [
  { id: "details", label: "Property Details" },
  { id: "media", label: "Media" },
  { id: "location", label: "Location" },
  { id: "publishing", label: "Publishing" },
  { id: "notes", label: "Notes" },
  { id: "documents", label: "Documents" },
  { id: "completed", label: "Completed" },
];

const RES_TYPES = ["apartment", "villa", "townhouse", "penthouse", "duplex", "hotel_apartment", "compound", "whole_building", "land"];
const COM_TYPES = ["office", "warehouse", "shop", "retail", "showroom", "land", "labor_camp", "farm", "bulk_units", "whole_building"];
const FURNISHED = [
  { value: "", label: "Select furnished type" },
  { value: "unfurnished", label: "Unfurnished" },
  { value: "semi_furnished", label: "Semi furnished" },
  { value: "furnished", label: "Furnished" },
];
const PROJECT_STATUSES = [
  { value: "", label: "Select project status" },
  { value: "ready_secondary", label: "Ready Secondary" },
  { value: "offplan_secondary", label: "Off-Plan Secondary" },
  { value: "ready_primary", label: "Ready Primary" },
  { value: "offplan_primary", label: "Off-Plan Primary" },
];
const LAYOUTS = ["", "Standard", "Duplex", "Triplex", "Loft", "Penthouse Layout"];
const OWNERSHIP = ["Free Hold", "None Hold", "Lease Hold", "GCC"];
const SOURCES = ["", "Company", "Agent", "Owner", "Referral"];
const PAYMENTS = ["Cash", "Installments", "Cash,Installments", "Cheque", "Bank Transfer"];
const FINANCIAL = ["Mortgaged", "Cash"];
const CHEQUES = Array.from({ length: 12 }, (_, index) => String(index + 1));
const BEDS = ["0", ...Array.from({ length: 20 }, (_, index) => String(index + 1))];
const BATHS = Array.from({ length: 21 }, (_, index) => String(index));
const PERIODS = [
  { id: "yearly", label: "Yearly" },
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "daily", label: "Daily" },
];
export const PORTALS = [
  { id: "pf", name: "Property Finder", note: "Goes live on Property Finder when you submit. Also stays in the PF XML feed." },
  { id: "bayut", name: "Bayut", note: "Included in the Bayut feed. Uses the Bayut location and Bayut pricing when set." },
  { id: "dubizzle", name: "Dubizzle", note: "Included in the Dubizzle feed (shares the Bayut location)." },
  { id: "houza", name: "JE", note: "Flag for the JE portal feed." },
  { id: "trb", name: "TRB", note: "Flag for the TRB feed." },
  { id: "simsari", name: "Simsari", note: "Flag for the Simsari feed." },
  { id: "sudonum", name: "Sudonum", note: "Flag for the Sudonum feed." },
  { id: "properstar", name: "Properstar", note: "Flag for the Properstar feed." },
  { id: "website", name: "WWW Website", note: "Shows on the public share page and the website feed." },
  { id: "pf_api", name: "PF API", note: "Flag the listing for the Property Finder API sync." },
  { id: "rightmove", name: "Rightmove", note: "Flag for the Rightmove feed." },
];
const UPGRADES = ["Featured", "Premium", "Hot Listing", "Signature", "Verified Badge"];
const NOTE_TYPES = ["General", "Owner", "Viewing", "Follow-up", "Portal"];
const AGENT_ROLES = ["Agent", "Team Lead", "Marketing", "Admin"];
const OWNER_ROLES = ["Admin", "Staff"];

const DOC_SLOTS = [
  { id: "title_deed", label: "Title Deed" },
  { id: "noc", label: "NOC" },
  { id: "form_a", label: "Form A" },
  { id: "passport", label: "Passport / Emirates ID" },
  { id: "ejari", label: "Ejari / Tenancy" },
  { id: "sale_agreement", label: "Sale Agreement" },
];
const PRIVATE_AMENITIES = [
  "Maids Room",
  "Study",
  "Central AC And Heating",
  "Balcony",
  "Private Garden",
  "Private Pool",
  "Private Gym",
  "Private Jacuzzi",
  "Shared Pool",
  "Shared Spa",
  "Shared Gym",
  "Security",
  "Concierge Service",
  "Maid Service",
  "Covered Parking",
  "Built in Wardrobes",
  "Walk in Closet",
  "Built in Kitchen Appliances",
  "View of Water",
  "View of Landmark",
  "Pets Allowed",
  "Central Heating",
  "Central AC",
];
const COMMERCIAL_AMENITIES = [
  "Conference Room",
  "Covered Parking",
  "Available Networked",
  "Shared Gym",
  "Shared Pool",
  "Dining in Building",
  "Lobby in Building",
  "Vastu-compliant",
];

function pretty(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

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

function when(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function amenityList(value) {
  return Array.isArray(value) ? value : [];
}

function AmenityPills({ items, selected, onToggle, prefix }) {
  return (
    <div className="studio-amenity-grid">
      {items.map((item) => {
        const on = selected.includes(item);
        return (
          <label key={`${prefix}-${item}`} className={`studio-amenity${on ? " on" : ""}`}>
            <input type="checkbox" checked={on} onChange={() => onToggle(item, on)} />
            {item}
          </label>
        );
      })}
    </div>
  );
}

function fileList(value) {
  return Array.isArray(value) ? value.filter((item) => item && item.url) : [];
}

function matchesMediaKind(item, kind) {
  return kind === "floorplan" ? item.kind === "floorplan" : item.kind !== "floorplan";
}

function moveListItem(items, fromIndex, toIndex) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function reorderGalleryAt(items, kind, fromIndex, toIndex) {
  const subset = items.filter((item) => matchesMediaKind(item, kind));
  const nextSubset = moveListItem(subset, fromIndex, toIndex);
  if (nextSubset === subset) return items;
  let index = 0;
  return items.map((item) => (matchesMediaKind(item, kind) ? nextSubset[index++] : item));
}

function captureMediaSlots(kind) {
  const grid = document.querySelector(`[data-media-grid="${kind}"]`);
  if (!grid) return [];
  return Array.from(grid.querySelectorAll("[data-media-index]")).map((tile) => {
    const box = tile.getBoundingClientRect();
    return {
      index: Number(tile.getAttribute("data-media-index")),
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      cx: box.left + box.width / 2,
      cy: box.top + box.height / 2,
    };
  });
}

function slotIndexFromPoint(slots, clientX, clientY) {
  if (!slots.length) return -1;
  for (const slot of slots) {
    if (clientX >= slot.left && clientX <= slot.right && clientY >= slot.top && clientY <= slot.bottom) {
      return slot.index;
    }
  }
  let best = slots[0].index;
  let bestScore = Infinity;
  for (const slot of slots) {
    const dx = clientX - slot.cx;
    const dy = clientY - slot.cy;
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = slot.index;
    }
  }
  return best;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function watermarkDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const bar = Math.max(40, Math.round(canvas.height * 0.08));
      ctx.fillStyle = "rgba(24, 28, 50, 0.48)";
      ctx.fillRect(0, canvas.height - bar, canvas.width, bar);
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${Math.max(16, Math.round(canvas.width / 28))}px sans-serif`;
      ctx.fillText("A7 GROUP", 24, canvas.height - Math.round(bar * 0.35));
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function applyCrmLandlord(item, patch, draft) {
  if (!item) return;
  patch({ landlord_name: item.title || draft.landlord_name });
  try {
    const info = await lookupCrmItem(item);
    if (!info) return;
    patch({
      landlord_name: info.name || item.title,
      landlord_email: info.email || draft.landlord_email,
      landlord_phone: info.phone || draft.landlord_phone,
    });
  } catch {
    /* typed name still stays */
  }
}

async function applyCrmUnit(item, patch, draft) {
  if (!item) return;
  const fallback = crmUnitLabel(item);
  patch({ unit_no: fallback });
  try {
    const info = await lookupCrmItem(item);
    if (!info) return;
    const next = { unit_no: info.unitNo || info.title || fallback };
    if (info.building) next.building = info.building;
    if (info.size && !draft.area_sqft) next.area_sqft = info.size;
    if (info.ownerName && !String(draft.landlord_name || "").trim()) next.landlord_name = info.ownerName;
    if (info.ownerEmail && !String(draft.landlord_email || "").trim()) next.landlord_email = info.ownerEmail;
    if (info.ownerPhone && !String(draft.landlord_phone || "").trim()) next.landlord_phone = info.ownerPhone;
    patch(next);
  } catch {
    /* typed unit still stays */
  }
}

async function api(path, options) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body;
}

function Svg({ children, className = "studio-svg" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function Field({ label, required, boxed, tip, children, action }) {
  return (
    <label className={`studio-field${boxed ? " boxed" : ""}`}>
      <span>
        {label}
        {required ? <em>*</em> : null}
        {tip ? (
          <i className="studio-info" title={tip}>
            i
          </i>
        ) : null}
        {action ? (
          <button type="button" className="studio-field-action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function Choice({ active, label, image, onClick }) {
  return (
    <button
      className={`studio-choice${active ? " on" : ""}`}
      type="button"
      onClick={onClick}
    >
      <span className="studio-choice-label">{label}</span>
      <span className="studio-glyph">
        <img src={image} alt="" width="64" height="64" decoding="async" />
      </span>
    </button>
  );
}

function SectionTitle({ children }) {
  return (
    <h2>
      {children}
      <span className="studio-info" title={children}>
        i
      </span>
    </h2>
  );
}

function StepHero({ tone, kicker, title, children }) {
  return (
    <div className={`step-hero tone-${tone}`}>
      <span>{kicker}</span>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

function Switch({ on, onClick, label }) {
  return (
    <label className="studio-toggle">
      <span>{label}</span>
      <button
        className={`studio-switch${on ? " on" : ""}`}
        type="button"
        role="switch"
        aria-checked={Boolean(on)}
        onClick={onClick}
      />
    </label>
  );
}

function SelectWithLegacy({ value, options, placeholder, onChange, allowEmpty = true }) {
  const known = options.includes(value);
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty ? <option value="">{placeholder || "Please select"}</option> : null}
      {options.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
      {value && !known ? <option value={value}>{value}</option> : null}
    </select>
  );
}

function PriceBlock({ title, plan, onPlan, values, onValue }) {
  return (
    <div className="studio-price-block">
      {title ? <h3>{title}</h3> : null}
      <div className="studio-price-list">
        {PERIODS.map((item) => (
          <label
            key={item.id}
            className={`studio-price-row${plan === item.id ? " on" : ""}`}
          >
            <input
              type="radio"
              name={`plan-${title || "main"}`}
              checked={plan === item.id}
              onChange={() => onPlan(item.id)}
            />
            <span>{item.label}</span>
            <input
              className="studio-price-box"
              inputMode="decimal"
              placeholder="Price"
              value={values[item.id] || ""}
              onChange={(e) => onValue(item.id, String(e.target.value).replace(/,/g, ""))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function verificationChecks(draft) {
  const photos = fileList(draft.gallery).filter((item) => item.kind !== "floorplan");
  const price =
    draft.purpose === "rent"
      ? parseMoney(draft[`price_${draft.price_period || "yearly"}`] || draft.price_aed)
      : parseMoney(draft.sale_price || draft.price_aed);
  const out = [
    { label: "Property type & purpose", ok: Boolean(draft.category && draft.purpose && draft.type) },
    { label: "Size and unit number", ok: Boolean(Number(draft.area_sqft)) && Boolean(String(draft.unit_no || "").trim()) },
    { label: "Title and description", ok: Boolean(String(draft.title || "").trim() && String(draft.description || "").trim()) },
    { label: "Price entered", ok: price > 0 },
    { label: "Listing agent (RERA)", ok: Boolean(String(draft.listing_agent || "").trim()) },
    {
      label: draft.non_rera ? "NON-ADREC enabled" : "Permit number",
      ok: Boolean(draft.non_rera) || Boolean(String(draft.permit_number || draft.dtcm_permit || "").trim()),
    },
    {
      label: "Permit not expired",
      ok: Boolean(draft.non_rera) || !isListingExpired(draft),
    },
    { label: "At least one photo", ok: Boolean(draft.photo) || photos.length > 0 },
    { label: "Community set", ok: Boolean(String(draft.community || "").trim()) },
  ];
  const copyErrors = listingCopyErrors(draft);
  if (copyErrors.length) {
    for (const item of copyErrors) out.push({ label: item.message, ok: false });
  } else if (String(draft.title || "").trim() || String(draft.description || "").trim()) {
    out.push({ label: "Title and description match bedrooms", ok: true });
  }
  return out;
}

export function ListingStudio({
  listing,
  user,
  counts,
  websiteCounts,
  agents,
  owners,
  landlords,
  developers,
  directory,
  pfAccounts,
  bayutAccounts,
  onAddPerson,
  onChange,
  onClose,
  onSaved,
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [descLang, setDescLang] = useState("en");
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyNote, setCopyNote] = useState({ type: "", text: "" });
  const [amenityOpen, setAmenityOpen] = useState(false);
  const [dldNote, setDldNote] = useState("");
  const [dldInfo, setDldInfo] = useState(null);
  const [dldBusy, setDldBusy] = useState(false);
  const [catalog, setCatalog] = useState({
    cities: [],
    communities: {},
    sub_communities: {},
  });
  const [watermark, setWatermark] = useState(true);
  const [photoUrl, setPhotoUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [mediaDragUi, setMediaDragUi] = useState(null);
  const mediaDrag = useRef({
    url: "",
    kind: "",
    fromIndex: -1,
    toIndex: -1,
    moved: false,
    slots: [],
    listen: null,
  });
  const mediaDragMove = useRef(() => {});
  const mediaDragUp = useRef(() => {});
  const [noteType, setNoteType] = useState("General");
  const [noteText, setNoteText] = useState("");
  const [personModal, setPersonModal] = useState("");
  const [personForm, setPersonForm] = useState({});
  const [locationModal, setLocationModal] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insights, setInsights] = useState(null);
  const [sidePanel, setSidePanel] = useState("draft");
  const [finishStatus, setFinishStatus] = useState("");
  const [dupError, setDupError] = useState("");
  const draft = listing || {};
  const types = draft.category === "commercial" ? COM_TYPES : RES_TYPES;
  const selectedAmenities = amenityList(draft.amenities);
  const gallery = fileList(draft.gallery);
  const videos = fileList(draft.videos);
  const documents = fileList(draft.documents_list);
  const notes = Array.isArray(draft.notes_list) ? draft.notes_list : [];
  const history = Array.isArray(draft.history) ? draft.history : [];
  const upgrades = Array.isArray(draft.upgrades) ? draft.upgrades : [];
  const people = useMemo(
    () => [...new Set([user?.name, ...(agents || []), ...(owners || [])].filter(Boolean))].sort(),
    [user, agents, owners]
  );
  const agentNames = useMemo(
    () => [...new Set([...(agents || []), user?.name, draft.listing_agent].filter(Boolean))].sort(),
    [agents, user, draft.listing_agent]
  );
  const ownerNames = useMemo(
    () => [...new Set([...(owners || []), ...(agents || []), user?.name, draft.listing_owner].filter(Boolean))].sort(),
    [owners, agents, user, draft.listing_owner]
  );
  const landlordNames = useMemo(
    () => [...new Set([...(landlords || []), draft.landlord_name].filter(Boolean))].sort(),
    [landlords, draft.landlord_name]
  );
  const developerNames = useMemo(
    () => [...new Set([...(developers || []), draft.developer].filter(Boolean))].sort(),
    [developers, draft.developer]
  );
  const privateSelected = selectedAmenities.filter((name) => PRIVATE_AMENITIES.includes(name));
  const commercialSelected = selectedAmenities.filter((name) => COMMERCIAL_AMENITIES.includes(name));
  const checks = [
    ...verificationChecks(draft),
    ...(listingExpiryError(draft) ? [{ label: listingExpiryError(draft), ok: false }] : []),
    ...(dupError ? [{ label: dupError, ok: false }] : []),
  ];

  function toggleAmenity(item, on) {
    patch({
      amenities: on ? selectedAmenities.filter((name) => name !== item) : [...selectedAmenities, item],
    });
  }

  async function generateCopy() {
    if (copyBusy) return;
    if (!String(draft.type || "").trim() && !String(draft.category || "").trim()) {
      setCopyNote({ type: "err", text: "Add the property type first." });
      return;
    }
    if (!String(draft.community || draft.city || draft.building || draft.project_name || "").trim()) {
      setCopyNote({ type: "err", text: "Add community, city, or building first." });
      return;
    }
    if (
      (draft.title || draft.description || draft.title_ar || draft.description_ar) &&
      !window.confirm("Replace the current title and description with this listing's details?")
    ) {
      return;
    }
    setCopyBusy(true);
    setCopyNote({ type: "", text: "" });
    try {
      const body = await api("/api/listings/generate-copy", {
        method: "POST",
        body: JSON.stringify({
          category: draft.category,
          type: draft.type,
          purpose: draft.purpose,
          beds: draft.beds,
          baths: draft.baths,
          parking: draft.parking,
          furnished: draft.furnished,
          area_sqft: draft.area_sqft,
          city: draft.city,
          community: draft.community,
          sub_community: draft.sub_community,
          building: draft.building,
          project_name: draft.project_name,
          unit_no: draft.unit_no,
          layout_type: draft.layout_type,
          developer: draft.developer,
          cheques: draft.cheques,
          amenities: selectedAmenities,
          price_period: draft.price_period,
          price_yearly: draft.price_yearly,
          price_monthly: draft.price_monthly,
          price_weekly: draft.price_weekly,
          price_daily: draft.price_daily,
          price_aed: draft.price_aed,
          sale_price: draft.sale_price,
        }),
      });
      if (!body.ok || !body.data) {
        setCopyNote({ type: "err", text: body.error || "Could not generate title and description." });
        return;
      }
      patch({
        title: body.data.title,
        description: body.data.description,
        title_ar: body.data.title_ar,
        description_ar: body.data.description_ar,
      });
      const extra = body.frontKeyAlerted ? " Front OpenAI key is running out — Matloob Ul Hasnain was notified." : "";
      setCopyNote({ type: "ok", text: `Title and description filled from this listing's data.${extra}` });
    } catch (err) {
      setCopyNote({ type: "err", text: err instanceof Error ? err.message : "Could not generate title and description." });
    } finally {
      setCopyBusy(false);
    }
  }
  const failing = checks.filter((item) => !item.ok);

  useEffect(() => {
    api("/api/locations")
      .then((body) => {
        if (body.locations) setCatalog(body.locations);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!draft.city) return undefined;
    let cancelled = false;
    api(`/api/locations/browse?city=${encodeURIComponent(draft.city)}`)
      .then((body) => {
        if (!cancelled && body.locations) setCatalog((cur) => mergeClientCatalog(cur, body.locations));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [draft.city]);

  useEffect(() => {
    setFinishStatus(draft.status && draft.id ? draft.status : "live");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id]);

  useEffect(() => {
    if (step !== STUDIO_STEPS.length - 1) {
      setDupError("");
      return undefined;
    }
    let cancelled = false;
    api("/api/listings/duplicate-check", {
      method: "POST",
      body: JSON.stringify(draft),
    })
      .then((body) => {
        if (!cancelled) setDupError(body.error || "");
      })
      .catch(() => {
        if (!cancelled) setDupError("");
      });
    return () => {
      cancelled = true;
    };
    // Identity fields only — marketing copy changes should not retrigger.
  }, [
    step,
    draft.id,
    draft.city,
    draft.community,
    draft.sub_community,
    draft.building,
    draft.unit_no,
    draft.purpose,
    draft.type,
    draft.category,
    draft.beds,
    draft.baths,
    draft.area_sqft,
    draft.permit_number,
    draft.dtcm_permit,
  ]);

  useEffect(() => {
    return () => {
      if (mediaDrag.current.listen) mediaDrag.current.listen();
    };
  }, []);

  const cityOptions = catalog.cities || [];
  const communityOptions = catalog.communities?.[draft.city] || [];
  const subOptions = catalog.sub_communities?.[draft.city]?.[draft.community] || [];
  const bayutCommunityOptions = catalog.communities?.[draft.bayut_city || draft.city] || [];
  const bayutSubOptions =
    catalog.sub_communities?.[draft.bayut_city || draft.city]?.[draft.bayut_community] || [];
  const locationPaths = useMemo(() => {
    const out = [];
    for (const [city, groups] of Object.entries(catalog.sub_communities || {})) {
      for (const [community, subs] of Object.entries(groups)) {
        out.push(`${city} - ${community}`);
        for (const sub of subs) out.push(`${city} - ${community} - ${sub}`);
      }
    }
    return out;
  }, [catalog]);

  function patch(next) {
    onChange({ ...draft, ...next });
  }

  function selectedPrice() {
    if (draft.purpose === "sale") {
      return parseMoney(draft.sale_price || draft.price_aed);
    }
    const period = draft.price_period || "yearly";
    const map = {
      yearly: draft.price_yearly,
      monthly: draft.price_monthly,
      weekly: draft.price_weekly,
      daily: draft.price_daily,
    };
    return parseMoney(map[period] || draft.price_aed);
  }

  function validate(index) {
    if (index === 0) {
      if (!draft.category) return "Choose Residential or Commercial.";
      if (!draft.purpose) return "Choose Rent or Sale.";
      if (!draft.type) return "Property type is required.";
      if (!Number(draft.area_sqft)) return "Size (sq.ft) is required.";
      if (!String(draft.unit_no || "").trim()) return "Unit No is required.";
      if (!String(draft.project_status || "").trim()) return "Project status is required.";
      if (!String(draft.listing_agent || "").trim()) {
        return "Listing Agent (RERA Agent) is required.";
      }
      if (!draft.non_rera && !String(draft.permit_number || draft.dtcm_permit || "").trim()) {
        return "Listing Permit Number is required (or enable NON-ADREC).";
      }
      if (!String(draft.title || "").trim()) return "Title is required.";
      if (!String(draft.description || "").trim()) return "Description is required.";
      if (draft.purpose === "sale" && !selectedPrice()) return "Sale price (AED) is required.";
    }
    if (index === 1) {
      const photos = fileList(draft.gallery).filter((item) => item.kind !== "floorplan");
      if (!draft.photo && !photos.length) return "Add at least one photo.";
    }
    if (index === 2) {
      if (!String(draft.city || "").trim()) return "City is required.";
      if (!String(draft.community || "").trim()) return "Community is required.";
    }
    if (index === STUDIO_STEPS.length - 1) {
      const earlier = validate(0) || validate(1) || validate(2);
      if (earlier) return earlier;
      const publishing = !finishStatus || finishStatus === "live";
      const liveOn = (draft.portals || []).filter((item) => LIVE_GO_IDS.has(item));
      if (publishing && !liveOn.length) {
        return "Select Property Finder, Bayut, and/or Dubizzle so this listing can go live.";
      }
      const expiryError = listingExpiryError(draft);
      if (publishing && expiryError) return expiryError;
      const copyError = listingPublishError(draft);
      if (publishing && copyError) return copyError;
      const priceError = listingLivePriceError(draft);
      if (publishing && priceError) return priceError;
      if (publishing && dupError) return dupError;
    }
    return "";
  }

  function firstIncompleteBefore(target) {
    for (let index = 0; index < target; index += 1) {
      const message = validate(index);
      if (message) return { index, message };
    }
    return null;
  }

  function goToStep(target) {
    if (target === step) return;
    const blocked = firstIncompleteBefore(target);
    if (blocked) {
      setStep(blocked.index);
      setError(blocked.message);
      return;
    }
    setError("");
    setStep(target);
  }

  function payloadFor(nextStatus) {
    return {
      ...draft,
      status: nextStatus || draft.status || "draft",
      listing_owner: String(draft.listing_owner || "").trim() || draft.listing_agent || "",
      created_by: draft.created_by || user?.name || "",
      price_aed: selectedPrice(),
      portal_expiry: draft.portal_expiry || draft.permit_expiry_date || "",
      amenities: selectedAmenities,
      gallery,
      videos,
      documents_list: documents,
      notes_list: notes,
      upgrades,
      photo: draft.photo || gallery.find((item) => item.kind !== "floorplan")?.url || "",
    };
  }

  async function persist(nextStatus) {
    const payload = payloadFor(nextStatus);
    if (draft.id) {
      const body = await api(`/api/listings/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      onChange(body.listing);
      return body;
    }
    const body = await api("/api/listings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    onChange(body.listing);
    return body;
  }

  async function saveAndContinue() {
    const message = validate(step);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const last = step === STUDIO_STEPS.length - 1;
      if (last) {
        const blocked = await confirmNotDuplicate(finishStatus || "live");
        if (blocked) {
          setError(blocked);
          return;
        }
        const saved = await persist(finishStatus || "live");
        const note = portalPublishNote(saved);
        if (note) {
          setError(note);
          return;
        }
        await onSaved();
        return;
      }
      await persist(draft.id ? draft.status : "draft");
      setStep(step + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(draft.reference || "");
    } catch {
      /* ignore */
    }
  }

  async function uploadBlob(file, kind) {
    let data = await readFile(file);
    if (watermark && kind === "photo" && String(file.type || "").startsWith("image/")) {
      data = await watermarkDataUrl(data);
    }
    const body = await api("/api/uploads", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        mime: file.type || (kind === "document" ? "application/pdf" : "image/jpeg"),
        data,
      }),
    });
    return { url: body.url, name: body.name || file.name, kind: kind || "photo" };
  }

  async function addPhotos(files, kind) {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = [];
      for (const file of list) {
        uploaded.push(await uploadBlob(file, kind || "photo"));
      }
      const next = [...gallery, ...uploaded];
      patch({
        gallery: next,
        photo: draft.photo || uploaded.find((item) => item.kind !== "floorplan")?.url || "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addDocument(slot, files, multiple) {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = [];
      for (const file of multiple ? list : list.slice(0, 1)) {
        uploaded.push(await uploadBlob(file, slot));
      }
      const next = multiple ? [...documents] : documents.filter((item) => item.kind !== slot);
      next.push(...uploaded);
      const extra = {};
      if (slot === "title_deed") extra.title_deed = uploaded[0].url;
      patch({ documents_list: next, ...extra });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function stopMediaListen() {
    if (mediaDrag.current.listen) {
      mediaDrag.current.listen();
      mediaDrag.current.listen = null;
    }
  }

  mediaDragMove.current = (event) => {
    const drag = mediaDrag.current;
    if (!drag.url) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
    if (moved) drag.moved = true;
    const toIndex = slotIndexFromPoint(drag.slots, event.clientX, event.clientY);
    if (toIndex >= 0) drag.toIndex = toIndex;
    setMediaDragUi({
      url: drag.url,
      kind: drag.kind,
      fromIndex: drag.fromIndex,
      toIndex: drag.toIndex,
      x: event.clientX,
      y: event.clientY,
      moved: drag.moved,
    });
  };

  mediaDragUp.current = (event) => {
    const drag = mediaDrag.current;
    const kind = drag.kind;
    const fromIndex = drag.fromIndex;
    const toIndex = drag.toIndex;
    const moved = drag.moved;
    stopMediaListen();
    mediaDrag.current = {
      url: "",
      kind: "",
      fromIndex: -1,
      toIndex: -1,
      moved: false,
      slots: [],
      listen: null,
    };
    setMediaDragUi(null);
    if (!moved || fromIndex < 0) return;
    if (event) event.preventDefault();
    const swallowClick = (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      window.removeEventListener("click", swallowClick, true);
    };
    window.addEventListener("click", swallowClick, true);
    window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 400);
    const next = reorderGalleryAt(gallery, kind, fromIndex, toIndex);
    if (next !== gallery) patch({ gallery: next });
  };

  function onMediaPointerDown(event, url, kind, fromIndex) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("button, a, input, label")) return;
    event.preventDefault();
    stopMediaListen();
    const onMove = (moveEvent) => mediaDragMove.current(moveEvent);
    const onUp = (upEvent) => mediaDragUp.current(upEvent);
    mediaDrag.current = {
      url,
      kind,
      fromIndex,
      toIndex: fromIndex,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      slots: captureMediaSlots(kind),
      listen() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      },
    };
    setMediaDragUi({
      url,
      kind,
      fromIndex,
      toIndex: fromIndex,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function mediaTileClass(item) {
    return [
      "studio-media",
      draft.photo === item.url ? "main" : "",
      mediaDragUi?.url === item.url ? "dragging" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const photoItems = gallery.filter((item) => item.kind !== "floorplan");
  const floorItems = gallery.filter((item) => item.kind === "floorplan");
  const photoView =
    mediaDragUi?.kind === "photo"
      ? moveListItem(photoItems, mediaDragUi.fromIndex, mediaDragUi.toIndex)
      : photoItems;
  const floorView =
    mediaDragUi?.kind === "floorplan"
      ? moveListItem(floorItems, mediaDragUi.fromIndex, mediaDragUi.toIndex)
      : floorItems;

  function addPhotoUrl() {
    const url = photoUrl.trim();
    if (!url) return;
    const item = { url, name: url, kind: "photo" };
    patch({
      gallery: [...gallery, item],
      photo: draft.photo || url,
    });
    setPhotoUrl("");
  }

  function addVideo() {
    const url = videoUrl.trim();
    if (!url) return;
    patch({ videos: [...videos, { url, name: url, kind: "video" }] });
    setVideoUrl("");
  }

  async function addNote() {
    const text = noteText.trim();
    if (!text) return;
    const note = { at: new Date().toISOString(), by: user?.name || "Desk", type: noteType, text };
    if (draft.id) {
      setBusy(true);
      try {
        const body = await api(`/api/listings/${draft.id}/notes`, {
          method: "POST",
          body: JSON.stringify({ type: noteType, text }),
        });
        onChange({ ...draft, notes_list: body.listing.notes_list, history: body.listing.history });
      } catch (err) {
        setError(err.message);
        return;
      } finally {
        setBusy(false);
      }
    } else {
      patch({ notes_list: [...notes, note] });
    }
    setNoteText("");
  }

  async function confirmNotDuplicate(status) {
    if (status !== "live" && status !== "pending") return "";
    const body = await api("/api/listings/duplicate-check", {
      method: "POST",
      body: JSON.stringify(draft),
    });
    const message = body.error || "";
    setDupError(message);
    return message;
  }

function portalPublishNote(body) {
  const portals = body?.listing?.portals || [];
  const feeds = [
    portals.includes("bayut") ? "Bayut" : "",
    portals.includes("dubizzle") ? "Dubizzle" : "",
  ].filter(Boolean);
  const feedNote = feeds.length
    ? `${feeds.join(" and ")} ${feeds.length > 1 ? "are" : "is"} on the live feed those sites read.`
    : "";
  if (body?.pf_error) {
    return [`Property Finder did not go live: ${body.pf_error}`, feedNote].filter(Boolean).join(" ");
  }
  return "";
}

  async function finishAs(status) {
    const message = validate(STUDIO_STEPS.length - 1);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const blocked = await confirmNotDuplicate(status);
      if (blocked) {
        setError(blocked);
        return;
      }
      const saved = await persist(status);
      const note = portalPublishNote(saved);
      if (note) {
        setError(note);
        return;
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function fetchDld() {
    const permit = String(draft.permit_number || "").trim();
    if (!permit) {
      setError("Listing Permit Number is required for DLD info.");
      setDldNote("");
      setDldInfo(null);
      return;
    }
    setError("");
    setDldNote("");
    setDldInfo(null);
    setDldBusy(true);
    try {
      const body = await api("/api/dld/lookup", {
        method: "POST",
        body: JSON.stringify({ permit }),
      });
      if (body.patch) patch(body.patch);
      setDldInfo(body.info || null);
      const listingNo = body.info?.listingNumber || body.queried || permit;
      setDldNote(
        body.corrected
          ? `DLD found listing ${listingNo} (the typed number had an extra digit). Details were filled on this listing.`
          : `DLD details for listing ${listingNo} were filled on this listing.`
      );
    } catch (err) {
      setDldInfo(null);
      setError(err.message);
    } finally {
      setDldBusy(false);
    }
  }

  function pinMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser cannot share a location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        patch({
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        });
      },
      () => setError("Location permission was refused.")
    );
  }

  function applyLocationText(text) {
    const parts = String(text || "")
      .split(/\s+-\s+|\s*>\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const [city, community, sub, building] = parts;
    patch({
      location_text: parts.join(" - "),
      city: city || draft.city,
      community: community || "",
      sub_community: sub || "",
      building: building || draft.building || "",
      bayut_city: city || draft.city || "",
      bayut_community: community || "",
      bayut_sub_community: sub || "",
      bayut_building: building || "",
    });
  }

  function applyLocationHit(hit, mode = "") {
    if (!hit) return;
    if (mode === "city") {
      const city = hit.city || hit.name;
      patch({
        city,
        community: "",
        sub_community: "",
        building: "",
        pf_location_id: hit.id || "",
        bayut_city: city || "",
        bayut_community: "",
        bayut_sub_community: "",
        bayut_building: "",
      });
      return;
    }
    const city = hit.city || draft.city || "";
    const community = hit.community || (mode === "community" ? hit.name : draft.community || "");
    const sub = hit.sub_community || (mode === "sub" ? hit.name : "");
    const building = hit.building || (mode === "building" ? hit.name : draft.building || "");
    patch({
      location_text: hit.path || [city, community, sub, building].filter(Boolean).join(" - "),
      city,
      community,
      sub_community: mode === "community" ? hit.sub_community || "" : sub,
      building,
      pf_location_id: hit.id || draft.pf_location_id || "",
      latitude: hit.latitude || draft.latitude || "",
      longitude: hit.longitude || draft.longitude || "",
      bayut_city: city,
      bayut_community: community,
      bayut_sub_community: mode === "community" ? hit.sub_community || "" : sub,
      bayut_building: building,
    });
    if (city && community) {
      setCatalog((cur) =>
        mergeClientCatalog(cur, {
          cities: [city],
          communities: { [city]: [community] },
          sub_communities: { [city]: { [community]: [sub].filter(Boolean) } },
        })
      );
    }
  }

  async function openInsights() {
    setInsightsOpen(true);
    setInsights(null);
    if (!draft.id) return;
    try {
      const body = await api(`/api/listings/${draft.id}/insights`);
      setInsights(body.insights);
    } catch (err) {
      setError(err.message);
    }
  }

  async function savePerson() {
    if (!personForm.name) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const kind = personModal;
      const person = await onAddPerson(kind, personForm);
      if (kind === "agent") patch({ listing_agent: person.name });
      if (kind === "owner") patch({ listing_owner: person.name, listing_owner_role: person.role || draft.listing_owner_role });
      if (kind === "landlord") {
        patch({ landlord_name: person.name, landlord_email: person.email || draft.landlord_email, landlord_phone: person.phone || draft.landlord_phone });
      }
      setPersonModal("");
      setPersonForm({});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const saveLabel =
    step === STUDIO_STEPS.length - 1
      ? finishStatus === "live" || !finishStatus
        ? "Publish live"
        : "Submit"
      : "Save & Continue";
  const bayutPrices = {
    yearly: draft.bayut_price_yearly,
    monthly: draft.bayut_price_monthly,
    weekly: draft.bayut_price_weekly,
    daily: draft.bayut_price_daily,
  };
  const mainPrices = {
    yearly: draft.price_yearly,
    monthly: draft.price_monthly,
    weekly: draft.price_weekly,
    daily: draft.price_daily,
  };

  return (
    <div className="studio">
      <header className="studio-top">
        <div className="studio-brand">
          <button className="studio-home" type="button" onClick={onClose} aria-label="Back to listings">
            <Svg>
              <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="1.8" />
            </Svg>
          </button>
          <span className="brand-mark studio-logo" aria-hidden="true">
            <svg viewBox="0 0 40 16" fill="none">
              <path d="M3 13.5 20 3l17 10.5" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <b>A7</b>
          </span>
          <div className="studio-brand-text">
            <h1>
              <span>Property</span>
              <strong>Listing</strong>
            </h1>
            <em className="brand-kicker">A7 GROUP</em>
          </div>
        </div>
        <div className="studio-metrics">
          <span className="studio-metric avail">
            <i aria-hidden="true">
              <Svg>
                <path d="M12 21s-7-4.6-7-10a7 7 0 1 1 14 0c0 5.4-7 10-7 10Z" stroke="currentColor" strokeWidth="1.7" />
                <path d="m9.6 11.2 1.7 1.7 3.2-3.3" stroke="currentColor" strokeWidth="1.7" />
              </Svg>
            </i>
            <span>
              <em>Availability</em>
              <b>{websiteCounts?.ready ? Number(websiteCounts.any || 0).toLocaleString() : "—"}</b>
            </span>
          </span>
          <span className="studio-metric lists">
            <i aria-hidden="true">
              <Svg>
                <path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="1.7" />
              </Svg>
            </i>
            <span>
              <em>Listings</em>
              <b>{websiteCounts?.ready ? Number(websiteCounts.any || 0).toLocaleString() : "—"}</b>
            </span>
          </span>
        </div>
        <button className="studio-close" type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="studio-steps">
        <div className="studio-step-track">
          {STUDIO_STEPS.map((item, index) => (
            <span
              className={`studio-step-wrap${index === step ? " on" : ""}${index < step ? " done" : ""}${index > step && firstIncompleteBefore(index) ? " locked" : ""}`}
              key={item.id}
            >
              {index > 0 ? <i className="studio-dash" /> : null}
              <button
                className="studio-step"
                type="button"
                aria-disabled={index > step && Boolean(firstIncompleteBefore(index))}
                onClick={() => goToStep(index)}
              >
                <b>
                  {index < step ? (
                    <Svg>
                      <path d="m6 12 4 4 8-8" stroke="currentColor" strokeWidth="2.2" />
                    </Svg>
                  ) : (
                    index + 1
                  )}
                </b>
                <span>{item.label}</span>
              </button>
            </span>
          ))}
        </div>
        <button className="studio-save" type="button" disabled={busy} onClick={saveAndContinue}>
          {saveLabel}
          <Svg>
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" />
          </Svg>
        </button>
      </div>

      {error ? <p className="studio-error">{error}</p> : null}

      <div className="studio-body">
        {step === 0 && (
          <div className="studio-grid">
            <div className="studio-main">
              <section className="studio-card">
                <SectionTitle>Choose Property Type</SectionTitle>
                <div className="studio-choices">
                  <div className="studio-choice-row">
                    <Choice
                      active={draft.category === "residential"}
                      label="Residential"
                      image={STUDIO_ICONS.residential}
                      onClick={() => {
                        patch({
                          category: "residential",
                          type: RES_TYPES.includes(draft.type) ? draft.type : "",
                        });
                      }}
                    />
                    <Choice
                      active={draft.category === "commercial"}
                      label="Commercial"
                      image={STUDIO_ICONS.commercial}
                      onClick={() => {
                        patch({
                          category: "commercial",
                          type: COM_TYPES.includes(draft.type) ? draft.type : "",
                        });
                      }}
                    />
                  </div>
                  <i className="studio-split" />
                  <div className="studio-choice-row">
                    <Choice
                      active={draft.purpose === "rent"}
                      label="Rent"
                      image={STUDIO_ICONS.rent}
                      onClick={() => {
                        patch({ purpose: "rent" });
                      }}
                    />
                    <Choice
                      active={draft.purpose === "sale"}
                      label="Sale"
                      image={STUDIO_ICONS.sale}
                      onClick={() => {
                        patch({ purpose: "sale" });
                      }}
                    />
                  </div>
                </div>
              </section>

              <section className="studio-card">
                <SectionTitle>Specifications</SectionTitle>
                <div className="studio-fields">
                  <Field label="Title deed">
                    <input value={draft.title_deed || ""} onChange={(e) => patch({ title_deed: e.target.value })} />
                  </Field>
                  <Field label="Property type" required>
                    <select value={draft.type || ""} onChange={(e) => patch({ type: e.target.value })}>
                      <option value="">Please select</option>
                      {types.map((item) => (
                        <option key={item} value={item}>
                          {pretty(item)}
                        </option>
                      ))}
                      {draft.type && !types.includes(draft.type) ? <option value={draft.type}>{pretty(draft.type)}</option> : null}
                    </select>
                  </Field>
                  <Field label="Size (sq.ft)" required>
                    <input
                      type="number"
                      min="1"
                      value={draft.area_sqft || ""}
                      onChange={(e) => patch({ area_sqft: e.target.value })}
                    />
                  </Field>
                  <Field label="Unit No" required>
                    <CrmTypeahead
                      entities={["unit"]}
                      allowCustom
                      placeholder="Type a unit number, or search"
                      value={draft.unit_no || ""}
                      onChange={(unit_no) => patch({ unit_no })}
                      onPick={(item) => applyCrmUnit(item, patch, draft)}
                    />
                  </Field>
                  <Field label="Number of bedrooms">
                    <select
                      value={draft.beds === "" || draft.beds === undefined || draft.beds === null ? "" : String(draft.beds)}
                      onChange={(e) => patch({ beds: e.target.value === "" ? "" : Number(e.target.value) })}
                    >
                      <option value="">Select Number of Bedrooms</option>
                      {BEDS.map((item) => (
                        <option key={item} value={item}>
                          {item === "0" ? "Studio" : item}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Number of bathrooms">
                    <select
                      value={draft.baths === "" || draft.baths === undefined || draft.baths === null ? "" : String(draft.baths)}
                      onChange={(e) => patch({ baths: e.target.value === "" ? "" : Number(e.target.value) })}
                    >
                      <option value="">Select Number of Bathrooms</option>
                      {BATHS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="No of parking spaces">
                    <input
                      type="number"
                      min="0"
                      value={draft.parking || ""}
                      onChange={(e) => patch({ parking: e.target.value })}
                    />
                  </Field>
                  <Field label="Select furnished">
                    <select value={draft.furnished || ""} onChange={(e) => patch({ furnished: e.target.value })}>
                      {FURNISHED.map((item) => (
                        <option key={item.value || "none"} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Total plot size (sq.ft)">
                    <input value={draft.plot_size || ""} onChange={(e) => patch({ plot_size: e.target.value })} />
                  </Field>
                  <Field label="Lot size (sq.ft)">
                    <input value={draft.lot_size || ""} onChange={(e) => patch({ lot_size: e.target.value })} />
                  </Field>
                  <Field label="Built-up Area">
                    <input value={draft.built_up_area || ""} onChange={(e) => patch({ built_up_area: e.target.value })} />
                  </Field>
                  <Field label="Layout Type">
                    <select value={draft.layout_type || ""} onChange={(e) => patch({ layout_type: e.target.value })}>
                      {LAYOUTS.map((item) => (
                        <option key={item || "none"} value={item}>
                          {item || "Please select"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Project Name">
                    <input value={draft.project_name || ""} onChange={(e) => patch({ project_name: e.target.value })} />
                  </Field>
                  <Field label="Project status" required>
                    <select
                      value={draft.project_status || ""}
                      onChange={(e) => patch({ project_status: e.target.value })}
                    >
                      {PROJECT_STATUSES.map((item) => (
                        <option key={item.value || "none"} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Fireplace">
                    <select value={draft.fireplace || ""} onChange={(e) => patch({ fireplace: e.target.value })}>
                      <option value="">Please select</option>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </Field>
                  <Field label="Ownership">
                    <SelectWithLegacy
                      value={draft.ownership || ""}
                      options={OWNERSHIP}
                      placeholder="Select ownership"
                      onChange={(value) => patch({ ownership: value })}
                    />
                  </Field>
                  <Field label="Developer">
                    <input
                      list="studio-developers"
                      value={draft.developer || ""}
                      onChange={(e) => patch({ developer: e.target.value })}
                      placeholder="Please select"
                    />
                  </Field>
                  <Field label="Build year">
                    <input
                      type="number"
                      min="1950"
                      max="2100"
                      value={draft.build_year || ""}
                      onChange={(e) => patch({ build_year: e.target.value })}
                    />
                  </Field>
                  {draft.purpose === "rent" ? (
                    <Field label="Rental period">
                      <input
                        value={draft.rental_period || ""}
                        onChange={(e) => patch({ rental_period: e.target.value })}
                        placeholder="e.g. 12 months"
                      />
                    </Field>
                  ) : null}
                  <Field label="Listing Source">
                    <select
                      value={draft.listing_source || ""}
                      onChange={(e) => patch({ listing_source: e.target.value })}
                    >
                      {SOURCES.map((item) => (
                        <option key={item || "none"} value={item}>
                          {item || "Please select"}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>

              <section className="studio-card">
                <div className="studio-head">
                  <SectionTitle>Pricing</SectionTitle>
                  <Switch
                    label="Custom Pricing for Each Portal"
                    on={Boolean(draft.custom_portal_pricing)}
                    onClick={() =>
                      patch({ custom_portal_pricing: draft.custom_portal_pricing ? "" : "1" })
                    }
                  />
                </div>
                {draft.purpose === "sale" ? (
                  <div className="studio-fields">
                    <Field label="Sale price (AED)" required>
                      <input
                        inputMode="decimal"
                        placeholder="Price"
                        value={draft.sale_price || draft.price_aed || ""}
                        onChange={(e) => patch({ sale_price: e.target.value, price_aed: Number(String(e.target.value).replace(/[^0-9.]/g, "")) || 0 })}
                      />
                    </Field>
                    <Field label="Down payment price">
                      <input
                        inputMode="decimal"
                        value={draft.down_payment_price || ""}
                        onChange={(e) => patch({ down_payment_price: e.target.value })}
                      />
                    </Field>
                    <label className="studio-check">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.hide_price)}
                        onChange={(e) => patch({ hide_price: e.target.checked ? "1" : "" })}
                      />
                      Hide price on portals
                    </label>
                  </div>
                ) : (
                  <>
                    <PriceBlock
                      title={draft.custom_portal_pricing ? "Property Finder" : ""}
                      plan={draft.price_period || "yearly"}
                      onPlan={(value) => {
                        const amount = parseMoney(mainPrices[value]);
                        patch({ price_period: value, price_aed: amount || draft.price_aed || 0 });
                      }}
                      values={mainPrices}
                      onValue={(period, value) => {
                        const next = { [`price_${period}`]: value };
                        if ((draft.price_period || "yearly") === period) next.price_aed = parseMoney(value);
                        patch(next);
                      }}
                    />
                    {draft.custom_portal_pricing ? (
                      <PriceBlock
                        title="Bayut"
                        plan={draft.bayut_plan || "yearly"}
                        onPlan={(value) => patch({ bayut_plan: value })}
                        values={bayutPrices}
                        onValue={(period, value) => patch({ [`bayut_price_${period}`]: value })}
                      />
                    ) : null}
                    <label className="studio-check">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.hide_price)}
                        onChange={(e) => patch({ hide_price: e.target.checked ? "1" : "" })}
                      />
                      Hide price on portals
                    </label>
                  </>
                )}
                <div className="studio-fields">
                  <Field label="Payment Method">
                    <SelectWithLegacy
                      value={draft.payment_method || ""}
                      options={PAYMENTS}
                      placeholder="Select payment method"
                      onChange={(value) => patch({ payment_method: value })}
                    />
                  </Field>
                  <Field label="Number Of cheques">
                    <SelectWithLegacy
                      value={draft.cheques || ""}
                      options={CHEQUES}
                      placeholder="Select Number of cheques"
                      onChange={(value) => patch({ cheques: value })}
                    />
                  </Field>
                  <Field label="Service Charges">
                    <input
                      value={draft.service_charges || ""}
                      onChange={(e) => patch({ service_charges: e.target.value })}
                    />
                  </Field>
                  <Field label="Financial Status">
                    <SelectWithLegacy
                      value={draft.financial_status || ""}
                      options={FINANCIAL}
                      placeholder="Select financial status"
                      onChange={(value) => patch({ financial_status: value })}
                    />
                  </Field>
                </div>
              </section>

              <section className="studio-card">
                <SectionTitle>Description</SectionTitle>
                <p className="studio-hint">Uses only this listing's type, location, specs, price, and amenities. No dummy text.</p>
                <div className="studio-copy-bar">
                  <button type="button" className="studio-ghost" disabled={copyBusy} onClick={generateCopy}>
                    {copyBusy ? "Writing…" : "Generate with AI"}
                  </button>
                </div>
                {copyNote.text ? <p className={`studio-copy-note ${copyNote.type}`}>{copyNote.text}</p> : null}
                <div className="studio-langs" role="tablist">
                  <button
                    type="button"
                    className={descLang === "en" ? "on" : ""}
                    onClick={() => setDescLang("en")}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    className={descLang === "ar" ? "on" : ""}
                    onClick={() => setDescLang("ar")}
                  >
                    Arabic
                  </button>
                </div>
                {descLang === "en" ? (
                  <>
                    <Field label="Title" required>
                      <input
                        value={draft.title || ""}
                        onChange={(e) => patch({ title: e.target.value })}
                      />
                    </Field>
                    <Field label="Description" required>
                      <textarea
                        className="studio-desc"
                        rows={16}
                        placeholder="Enter English Description"
                        value={draft.description || ""}
                        onChange={(e) => patch({ description: e.target.value })}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Title (Arabic)">
                      <input
                        dir="rtl"
                        value={draft.title_ar || ""}
                        onChange={(e) => patch({ title_ar: e.target.value })}
                      />
                    </Field>
                    <Field label="Description (Arabic)">
                      <textarea
                        className="studio-desc"
                        dir="rtl"
                        rows={16}
                        placeholder="Enter Arabic Description"
                        value={draft.description_ar || ""}
                        onChange={(e) => patch({ description_ar: e.target.value })}
                      />
                    </Field>
                  </>
                )}
              </section>

              <section className="studio-card">
                <SectionTitle>Select Amenities</SectionTitle>
                {selectedAmenities.length === 0 ? (
                  <p className="studio-empty">There are no amenities uploaded yet</p>
                ) : (
                  <>
                    {privateSelected.length ? (
                      <div className="studio-amenity-picked">
                        <h3>Private Amenities</h3>
                        <div className="studio-chips">
                          {privateSelected.map((item) => (
                            <button
                              key={`p-${item}`}
                              type="button"
                              className="studio-chip"
                              onClick={() => toggleAmenity(item, true)}
                            >
                              {item}
                              <span aria-hidden="true">×</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {commercialSelected.length ? (
                      <div className="studio-amenity-picked">
                        <h3>Commercial Amenities</h3>
                        <div className="studio-chips">
                          {commercialSelected.map((item) => (
                            <button
                              key={`c-${item}`}
                              type="button"
                              className="studio-chip"
                              onClick={() => toggleAmenity(item, true)}
                            >
                              {item}
                              <span aria-hidden="true">×</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
                <button
                  className="studio-ghost"
                  type="button"
                  onClick={() => setAmenityOpen(true)}
                >
                  Update Amenities
                </button>
              </section>
            </div>

            <aside className="studio-side">
              <section className="studio-card">
                <div className="studio-side-tabs" role="tablist">
                  {[
                    ["draft", "Draft Property"],
                    ["verification", "Verification"],
                    ["upgrades", "Available Upgrades"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      className={sidePanel === id ? "on" : ""}
                      onClick={() => setSidePanel(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {sidePanel === "draft" ? (
                  <div className="studio-fields one">
                    <Field label="Last update">
                      <input readOnly value={draft.updated_at ? when(draft.updated_at) : ""} />
                    </Field>
                    <Field label="Creation date">
                      <input readOnly value={draft.created_at ? when(draft.created_at) : ""} />
                    </Field>
                    <Field label="Created by">
                      <input readOnly value={draft.id ? (draft.created_by || "") : ""} />
                    </Field>
                    <Field label="Status">
                      <input readOnly value={pretty(draft.status || "draft")} />
                    </Field>
                    <Field label="Listing views">
                      <input readOnly value={String(draft.views || 0)} />
                    </Field>
                  </div>
                ) : null}
                {sidePanel === "verification" ? (
                  <div className="studio-verify">
                    <p className={`studio-verify-status${failing.length ? " warn" : " ok"}`}>
                      {failing.length ? `${failing.length} item${failing.length === 1 ? "" : "s"} to complete` : "Verified — ready to publish"}
                    </p>
                    <ul>
                      {checks.map((item) => (
                        <li key={item.label} className={item.ok ? "ok" : "warn"}>
                          <span aria-hidden="true">{item.ok ? "✓" : "!"}</span>
                          {item.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {sidePanel === "upgrades" ? (
                  <div className="studio-upgrades">
                    <p className="studio-hint">Portal upgrades applied to this listing. They travel with the feed.</p>
                    {UPGRADES.map((item) => {
                      const on = upgrades.includes(item);
                      return (
                        <label key={item} className={`studio-check${on ? " on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              patch({ upgrades: on ? upgrades.filter((name) => name !== item) : [...upgrades, item] })
                            }
                          />
                          {item}
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                <button className="studio-ghost" type="button" onClick={openInsights}>
                  Listing Insights
                </button>
              </section>

              <section className="studio-card">
                <h2>Management</h2>
                <Field label="Reference">
                  <div className="studio-ref">
                    <input value={draft.reference || "-"} readOnly />
                    <button type="button" onClick={copyRef} aria-label="Copy reference">
                      <Svg>
                        <rect x="8" y="8" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                        <path d="M6 16V4h10" stroke="currentColor" strokeWidth="1.6" />
                      </Svg>
                    </button>
                  </div>
                </Field>
                <Switch
                  label="Is Different Agents for portal"
                  on={Boolean(draft.portal_agent_different)}
                  onClick={() =>
                    patch({
                      portal_agent_different: draft.portal_agent_different ? "" : "1",
                    })
                  }
                />
                <Field
                  label="Listing Agent (RERA Agent)"
                  required
                  action={{ label: "+ Add", onClick: () => { setPersonForm({ role: "Agent" }); setPersonModal("agent"); } }}
                >
                  <SelectWithLegacy
                    value={draft.listing_agent || ""}
                    options={agentNames}
                    onChange={(value) => patch({ listing_agent: value })}
                  />
                </Field>
                {draft.portal_agent_different ? (
                  <>
                    <Field label="Website agent">
                      <SelectWithLegacy
                        value={draft.portal_agent_web || ""}
                        options={agentNames}
                        onChange={(value) => patch({ portal_agent_web: value })}
                      />
                    </Field>
                    <Field label="Bayut agent">
                      <SelectWithLegacy
                        value={draft.portal_agent_bayut || ""}
                        options={agentNames}
                        onChange={(value) => patch({ portal_agent_bayut: value })}
                      />
                    </Field>
                    <Field label="PF API agent">
                      <SelectWithLegacy
                        value={draft.portal_agent_pf_api || ""}
                        options={agentNames}
                        onChange={(value) => patch({ portal_agent_pf_api: value })}
                      />
                    </Field>
                  </>
                ) : null}
                <Field
                  label="Listing Owner (non-RERA Agent)"
                  action={{ label: "+ Add", onClick: () => { setPersonForm({ role: "Staff" }); setPersonModal("owner"); } }}
                >
                  <SelectWithLegacy
                    value={draft.listing_owner || ""}
                    options={ownerNames}
                    onChange={(value) => patch({ listing_owner: value })}
                  />
                </Field>
                <Field label="Listing owner role">
                  <SelectWithLegacy
                    value={draft.listing_owner_role || ""}
                    options={OWNER_ROLES}
                    placeholder="Select Agent Role"
                    onChange={(value) => patch({ listing_owner_role: value })}
                  />
                </Field>
                <Field
                  label="Landlord Name"
                  action={{ label: "+ Add", onClick: () => { setPersonForm({}); setPersonModal("landlord"); } }}
                >
                  <CrmTypeahead
                    entities={["contact"]}
                    placeholder="Type landlord name…"
                    value={draft.landlord_name || ""}
                    onChange={(landlord_name) => patch({ landlord_name })}
                    onPick={(item) => applyCrmLandlord(item, patch, draft)}
                    addNewLabel="+ Add new landlord to Bitrix"
                    addName={draft.landlord_name}
                    addEmail={draft.landlord_email}
                    addPhone={draft.landlord_phone}
                  />
                </Field>
                <Field label="Landlord Email">
                  <input
                    type="email"
                    value={draft.landlord_email || ""}
                    onChange={(e) => patch({ landlord_email: e.target.value })}
                  />
                </Field>
                <Field label="Landlord Contact">
                  <input
                    value={draft.landlord_phone || ""}
                    onChange={(e) => patch({ landlord_phone: e.target.value })}
                  />
                </Field>
                <Field label="Available From" boxed>
                  <input
                    type="date"
                    value={draft.available_from || ""}
                    onChange={(e) => patch({ available_from: e.target.value })}
                  />
                </Field>
              </section>

              <section className="studio-card">
                <h2>Property Permit</h2>
                <p className="studio-hint">Select your license type</p>
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.non_rera) || draft.license_type === "non_rera"}
                    onChange={(e) =>
                      patch({
                        non_rera: e.target.checked ? "1" : "",
                        license_type: e.target.checked ? "non_rera" : "rera",
                      })
                    }
                  />
                  Enable NON-ADREC
                </label>
                {draft.non_rera || draft.license_type === "non_rera" ? null : (
                  <>
                    <div className="studio-license">
                      <button
                        type="button"
                        className={draft.license_type !== "dtcm" ? "on" : ""}
                        onClick={() => patch({ license_type: "rera", non_rera: "" })}
                      >
                        Rera
                      </button>
                      <button
                        type="button"
                        className={draft.license_type === "dtcm" ? "on" : ""}
                        onClick={() => patch({ license_type: "dtcm", non_rera: "" })}
                      >
                        DTCM
                      </button>
                    </div>
                    {draft.license_type === "dtcm" ? (
                      <Field label="DTCM permit number" required>
                        <input
                          value={draft.dtcm_permit || ""}
                          onChange={(e) => patch({ dtcm_permit: e.target.value })}
                        />
                      </Field>
                    ) : (
                      <>
                        <Field label="Listing Permit Number" required tip="DLD / RERA permit">
                          <input
                            value={draft.permit_number || ""}
                            onChange={(e) => patch({ permit_number: e.target.value })}
                          />
                        </Field>
                        <Field label="Permit Issue Date" boxed>
                          <input
                            type="date"
                            value={draft.permit_issue_date || ""}
                            onChange={(e) => patch({ permit_issue_date: e.target.value })}
                          />
                        </Field>
                        <Field label="Permit Expiration Date" boxed>
                          <input
                            type="date"
                            value={draft.permit_expiry_date || ""}
                            onChange={(e) =>
                              patch({
                                permit_expiry_date: e.target.value,
                                portal_expiry: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <button className="studio-dld" type="button" onClick={fetchDld} disabled={dldBusy}>
                          {dldBusy ? "Getting DLD…" : "Get DLD INFO"}
                          <Svg>
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" />
                          </Svg>
                        </button>
                        {dldNote ? <p className="studio-dld-note">{dldNote}</p> : null}
                        {dldInfo ? (
                          <dl className="studio-dld-card">
                            {dldInfo.transactionNumber ? (
                              <div>
                                <dt>Transaction</dt>
                                <dd>{dldInfo.transactionNumber}</dd>
                              </div>
                            ) : null}
                            {dldInfo.listingNumber ? (
                              <div>
                                <dt>Listing no.</dt>
                                <dd>{dldInfo.listingNumber}</dd>
                              </div>
                            ) : null}
                            {dldInfo.issued ? (
                              <div>
                                <dt>Issued</dt>
                                <dd>{dldInfo.issued}</dd>
                              </div>
                            ) : null}
                            {dldInfo.expires ? (
                              <div>
                                <dt>Expires</dt>
                                <dd>{dldInfo.expires}</dd>
                              </div>
                            ) : null}
                            {dldInfo.location ? (
                              <div>
                                <dt>Location</dt>
                                <dd>{dldInfo.location}</dd>
                              </div>
                            ) : null}
                            {dldInfo.permitType || dldInfo.listingType ? (
                              <div>
                                <dt>Type</dt>
                                <dd>{[dldInfo.permitType, dldInfo.listingType].filter(Boolean).join(" · ")}</dd>
                              </div>
                            ) : null}
                            {dldInfo.rooms ? (
                              <div>
                                <dt>Rooms</dt>
                                <dd>{dldInfo.rooms}</dd>
                              </div>
                            ) : null}
                            {dldInfo.sizeSqft || dldInfo.sizeSqm ? (
                              <div>
                                <dt>Size</dt>
                                <dd>
                                  {dldInfo.sizeSqft ? `${dldInfo.sizeSqft} sqft` : ""}
                                  {dldInfo.sizeSqft && dldInfo.sizeSqm ? " · " : ""}
                                  {dldInfo.sizeSqm ? `${dldInfo.sizeSqm} sqm` : ""}
                                </dd>
                              </div>
                            ) : null}
                            {dldInfo.price ? (
                              <div>
                                <dt>Price</dt>
                                <dd>{Number(dldInfo.price).toLocaleString("en-AE")} AED</dd>
                              </div>
                            ) : null}
                            {dldInfo.project ? (
                              <div>
                                <dt>Project</dt>
                                <dd>{dldInfo.project}</dd>
                              </div>
                            ) : null}
                            {dldInfo.developer ? (
                              <div>
                                <dt>Developer</dt>
                                <dd>{dldInfo.developer}</dd>
                              </div>
                            ) : null}
                            {dldInfo.validationUrl ? (
                              <div className="wide">
                                <dt>DLD card</dt>
                                <dd>
                                  <a href={dldInfo.validationUrl} target="_blank" rel="noreferrer">
                                    Open Madmoun validation
                                  </a>
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </section>

              {draft.pf_id ? (
                <section className="studio-card">
                  <h2>Property Finder</h2>
                  <div className="studio-fields one">
                    <Field label="PF status">
                      <input readOnly value={`${pretty(draft.pf_state || "-")}${draft.pf_is_live === "1" ? " (live on portal)" : ""}`} />
                    </Field>
                    <Field label="Quality score">
                      <input readOnly value={draft.pf_quality_score ? `${draft.pf_quality_score} / 100` : "-"} />
                    </Field>
                    <Field label="Published on PF">
                      <input readOnly value={draft.pf_published_at ? when(draft.pf_published_at) : "-"} />
                    </Field>
                  </div>
                  {(draft.pf_reasons || []).length ? <p className="studio-hint">Taken down: {draft.pf_reasons.join("; ")}</p> : null}
                  {draft.pf_quality?.details ? (
                    <ul className="pf-quality">
                      {Object.entries(draft.pf_quality.details)
                        .filter(([, item]) => item.help)
                        .map(([key, item]) => (
                          <li key={key} className={item.color || ""}>
                            <i />
                            <span>{pretty(key)}</span>
                            <small>{item.help}</small>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              <section className="studio-card">
                <h2>History</h2>
                {history.length === 0 ? (
                  <p className="studio-empty">No changes recorded yet.</p>
                ) : (
                  <div className="studio-history">
                    <table>
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
                        {[...history].reverse().slice(0, 40).map((item, index) => (
                          <tr key={`${item.at}-${index}`}>
                            <td>
                              <HistoryWho by={item.by} byId={item.byId} />
                            </td>
                            <td>{when(item.at)}</td>
                            <td>{pretty(item.field)}</td>
                            <td>{item.field === "created" ? "—" : item.from || "—"}</td>
                            <td>{item.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}

        {step === 1 && (
          <section className="studio-stage">
            <StepHero tone="media" kicker="Step 02" title="Add Photos">
              Photos, floor plans and video links for this listing. Set one main image for the desk.
            </StepHero>
            <div className="stage-grid media-grid">
              <article className="studio-card stage-card">
                <div className="stage-card-head">
                  <h3>Property photos</h3>
                  <Switch
                    on={watermark}
                    onClick={() => setWatermark((value) => !value)}
                    label="A7 watermark"
                  />
                </div>
                <label className="step-drop">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      addPhotos(e.target.files, "photo");
                      e.target.value = "";
                    }}
                  />
                  <b>Drop files here or click to upload</b>
                  <small>JPG, PNG or WEBP. 8 MB each.</small>
                </label>
                <div className="studio-url-row">
                  <input
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="Paste a photo URL"
                  />
                  <button className="btn" type="button" onClick={addPhotoUrl}>
                    Add URL
                  </button>
                </div>
                <p className="studio-media-hint">
                  Drag any photo to any place. The other photos will shift to make room.
                </p>
                <div className="studio-media-grid" data-media-grid="photo">
                  {photoView.map((item, viewIndex) => (
                      <article
                        className={mediaTileClass(item)}
                        key={item.url}
                        data-media-url={item.url}
                        data-media-kind="photo"
                        data-media-index={photoItems.findIndex((file) => file.url === item.url)}
                        onPointerDown={(event) =>
                          onMediaPointerDown(
                            event,
                            item.url,
                            "photo",
                            photoItems.findIndex((file) => file.url === item.url)
                          )
                        }
                      >
                        <span className="studio-media-slot">#{viewIndex + 1}</span>
                        <img src={item.url} alt="" draggable={false} />
                        <div>
                          <button className="btn" type="button" onClick={() => patch({ photo: item.url })}>
                            {draft.photo === item.url ? "Main photo" : "Set main"}
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => {
                              const next = gallery.filter((file) => file.url !== item.url);
                              patch({
                                gallery: next,
                                photo:
                                  draft.photo === item.url
                                    ? next.find((file) => file.kind !== "floorplan")?.url || ""
                                    : draft.photo,
                              });
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </article>
              <div className="stage-stack">
                <article className="studio-card stage-card">
                  <h3>Video & links</h3>
                  <div className="studio-fields one">
                    <Field label="YouTube link">
                      <input
                        value={draft.youtube_link || ""}
                        onChange={(e) => patch({ youtube_link: e.target.value })}
                        placeholder="https://youtube.com/..."
                      />
                    </Field>
                    <Field label="Video link">
                      <input
                        value={draft.video_link || ""}
                        onChange={(e) => patch({ video_link: e.target.value })}
                        placeholder="MP4 or tour URL"
                      />
                    </Field>
                    <Field label="QR code link">
                      <input
                        value={draft.qrcode_link || ""}
                        onChange={(e) => patch({ qrcode_link: e.target.value })}
                        placeholder="360 tour or QR target"
                      />
                    </Field>
                  </div>
                  <h3>More videos</h3>
                  <div className="studio-url-row">
                    <input
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="YouTube or MP4 URL"
                    />
                    <button className="btn" type="button" onClick={addVideo}>
                      Add
                    </button>
                  </div>
                  <ul className="studio-link-list">
                    {videos.map((item) => (
                      <li key={item.url}>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.name || item.url}
                        </a>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() =>
                            patch({ videos: videos.filter((file) => file.url !== item.url) })
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="studio-card stage-card">
                  <h3>Floor Plan</h3>
                  <label className="step-drop slim">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      onChange={(e) => {
                        addPhotos(e.target.files, "floorplan");
                        e.target.value = "";
                      }}
                    />
                    <b>Drop files here or click to upload</b>
                    <small>Image or PDF</small>
                  </label>
                  <div className="studio-media-grid" data-media-grid="floorplan">
                    {floorView.map((item, viewIndex) => (
                        <article
                          className={mediaTileClass(item)}
                          key={item.url}
                          data-media-url={item.url}
                          data-media-kind="floorplan"
                          data-media-index={floorItems.findIndex((file) => file.url === item.url)}
                          onPointerDown={(event) =>
                            onMediaPointerDown(
                              event,
                              item.url,
                              "floorplan",
                              floorItems.findIndex((file) => file.url === item.url)
                            )
                          }
                        >
                          <span className="studio-media-slot">#{viewIndex + 1}</span>
                          {String(item.url).toLowerCase().endsWith(".pdf") ? (
                            <a href={item.url} target="_blank" rel="noreferrer">
                              {item.name || "Floor plan PDF"}
                            </a>
                          ) : (
                            <img src={item.url} alt="" draggable={false} />
                          )}
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              patch({ gallery: gallery.filter((file) => file.url !== item.url) })
                            }
                          >
                            Remove
                          </button>
                        </article>
                      ))}
                  </div>
                </article>
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="studio-stage">
            <StepHero tone="location" kicker="Step 03" title="System Location">
              Search Property Finder locations. Type any community or building — Serena, Villanova, Damac Lagoons, towers — then pick the match.
            </StepHero>
            <div className="loc-path">
              {[draft.city || "City", draft.community || "Community", draft.sub_community || "Sub community", draft.building || "Building"]
                .map((item, index) => (
                  <span key={`${item}-${index}`}>
                    {item}
                    {index < 3 ? <i>/</i> : null}
                  </span>
                ))}
            </div>
            <article className="studio-card stage-card">
              <div className="studio-fields">
                <SuggestField
                  label="Location"
                  tip="Type a community or building. Pick the Property Finder match so the ad goes to the right place."
                  action={{ label: "+ Add Location", onClick: () => { setLocationText(draft.location_text || ""); setLocationModal(true); } }}
                  value={draft.location_text || ""}
                  placeholder="Type Serena, Villanova, Marina Gate..."
                  options={locationPaths}
                  onChange={(location_text) => patch({ location_text })}
                  onPick={(hit) => applyLocationHit(hit)}
                />
                <SuggestField
                  label="City"
                  required
                  value={draft.city || ""}
                  placeholder="Type Dubai, Abu Dhabi..."
                  options={cityOptions}
                  search={{ type: "CITY" }}
                  onChange={(city) => patch({ city, community: "", sub_community: "" })}
                  onPick={(hit) => applyLocationHit(hit, "city")}
                />
                <SuggestField
                  label="Community"
                  required
                  value={draft.community || ""}
                  placeholder="Type any community — Serena, Greens, Damac Lagoons..."
                  options={communityOptions}
                  search={{ type: "COMMUNITY", city: draft.city }}
                  onChange={(community) => patch({ community, sub_community: "" })}
                  onPick={(hit) => applyLocationHit(hit, "community")}
                />
                <SuggestField
                  label="Sub community"
                  value={draft.sub_community || ""}
                  placeholder="Type a sub-community or project"
                  options={subOptions}
                  search={{ type: "SUBCOMMUNITY", city: draft.city, community: draft.community }}
                  onChange={(sub_community) => patch({ sub_community })}
                  onPick={(hit) => applyLocationHit(hit, "sub")}
                />
                <SuggestField
                  label="Building / Cluster"
                  value={draft.building || ""}
                  placeholder="Type a tower, cluster or villa"
                  options={[]}
                  search={{ type: "TOWER", city: draft.city, community: draft.community }}
                  onChange={(building) => patch({ building })}
                  onPick={(hit) => applyLocationHit(hit, "building")}
                />
                <Field label="Unit No">
                  <CrmTypeahead
                    entities={["unit"]}
                    allowCustom
                    placeholder="Type a unit number, or search"
                    value={draft.unit_no || ""}
                    onChange={(unit_no) => patch({ unit_no })}
                    onPick={(item) => applyCrmUnit(item, patch, draft)}
                  />
                </Field>
                <Field label="Project name">
                  <input
                    value={draft.project_name || ""}
                    onChange={(e) => patch({ project_name: e.target.value })}
                  />
                </Field>
                <Field label="Latitude">
                  <input
                    value={draft.latitude || ""}
                    onChange={(e) => patch({ latitude: e.target.value })}
                    placeholder="25.2048"
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    value={draft.longitude || ""}
                    onChange={(e) => patch({ longitude: e.target.value })}
                    placeholder="55.2708"
                  />
                </Field>
              </div>
              <div className="wizard-actions">
                <button className="btn" type="button" onClick={pinMyLocation}>
                  Pin My Location
                </button>
                {draft.latitude && draft.longitude ? (
                  <a
                    className="btn ghost"
                    href={`https://www.google.com/maps?q=${encodeURIComponent(`${draft.latitude},${draft.longitude}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on map
                  </a>
                ) : null}
              </div>
            </article>
            <article className="studio-card stage-card">
              <h3>Bayut Location</h3>
              <p className="studio-hint">Bayut and Dubizzle use this location. It fills when you pick a Property Finder match above, such as International City or England Cluster. You can still search these fields.</p>
              <div className="studio-fields">
                <SuggestField
                  label="Bayut city"
                  value={draft.bayut_city || ""}
                  options={cityOptions}
                  search={{ type: "CITY" }}
                  onChange={(bayut_city) => patch({ bayut_city, bayut_community: "", bayut_sub_community: "" })}
                  onPick={(hit) => patch({ bayut_city: hit.city || hit.name, bayut_community: "", bayut_sub_community: "" })}
                />
                <SuggestField
                  label="Bayut community"
                  value={draft.bayut_community || ""}
                  options={bayutCommunityOptions}
                  search={{ type: "COMMUNITY", city: draft.bayut_city || draft.city }}
                  onChange={(bayut_community) => patch({ bayut_community, bayut_sub_community: "" })}
                  onPick={(hit) =>
                    patch({
                      bayut_city: hit.city || draft.bayut_city || draft.city,
                      bayut_community: hit.community || hit.name,
                      bayut_sub_community: hit.sub_community || "",
                      bayut_building: hit.building || draft.bayut_building || "",
                    })
                  }
                />
                <SuggestField
                  label="Bayut sub community"
                  value={draft.bayut_sub_community || ""}
                  options={bayutSubOptions}
                  search={{ type: "SUBCOMMUNITY", city: draft.bayut_city || draft.city, community: draft.bayut_community || draft.community }}
                  onChange={(bayut_sub_community) => patch({ bayut_sub_community })}
                  onPick={(hit) => patch({ bayut_sub_community: hit.sub_community || hit.name, bayut_building: hit.building || draft.bayut_building || "" })}
                />
                <SuggestField
                  label="Bayut building"
                  value={draft.bayut_building || ""}
                  options={[]}
                  search={{ type: "TOWER", city: draft.bayut_city || draft.city, community: draft.bayut_community || draft.community }}
                  onChange={(bayut_building) => patch({ bayut_building })}
                  onPick={(hit) => patch({ bayut_building: hit.building || hit.name })}
                />
              </div>
              <button
                className="studio-ghost"
                type="button"
                onClick={() =>
                  patch({
                    bayut_city: draft.city || "",
                    bayut_community: draft.community || "",
                    bayut_sub_community: draft.sub_community || "",
                    bayut_building: draft.building || "",
                  })
                }
              >
                Copy from system location
              </button>
            </article>
          </section>
        )}

        {step === 3 && (
          <section className="studio-stage">
            <StepHero tone="publish" kicker="Step 04" title="Add Publishing Information">
              Enable the portals this listing should go live on. Submit publishes it to those portals.
            </StepHero>
            <article className="studio-card stage-card publish-meta">
              <div className="studio-fields">
                <Field label="Price AED">
                  <input
                    type="number"
                    min="0"
                    value={draft.price_aed || selectedPrice() || ""}
                    onChange={(e) => patch({ price_aed: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Expiry date for portals">
                  <input
                    type="date"
                    value={draft.portal_expiry || draft.permit_expiry_date || ""}
                    onChange={(e) => patch({ portal_expiry: e.target.value })}
                  />
                </Field>
                <Field label="Property Finder account">
                  <input
                    list="studio-pf-accounts"
                    value={draft.pf_account || ""}
                    onChange={(e) => patch({ pf_account: e.target.value })}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Bayut account">
                  <input
                    list="studio-bayut-accounts"
                    value={draft.bayut_account || ""}
                    onChange={(e) => patch({ bayut_account: e.target.value })}
                    placeholder="Optional"
                  />
                </Field>
              </div>
              <div className="wizard-actions">
                <button className="btn" type="button" onClick={openInsights}>
                  View Insights
                </button>
              </div>
            </article>
            <div className="studio-portal-grid">
              {PORTALS.map((portal) => {
                const on = (draft.portals || []).includes(portal.id);
                return (
                  <article className={`studio-portal-card portal-${portal.id}${on ? " on" : ""}`} key={portal.id}>
                    <div className="portal-top">
                      <strong>{portal.name}</strong>
                      <em>{on ? "Enabled" : "Off"}</em>
                    </div>
                    <p>{portal.note}</p>
                    <Switch
                      on={on}
                      label="Enable"
                      onClick={() => {
                        const current = draft.portals || [];
                        patch({
                          portals: on
                            ? current.filter((item) => item !== portal.id)
                            : [...current, portal.id],
                        });
                      }}
                    />
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="studio-stage">
            <StepHero tone="notes" kicker="Step 05" title="Write a New Note">
              Internal only. Notes do not go to portals or the public page.
            </StepHero>
            <article className="studio-card stage-card notes-card">
              <div className="studio-note-row">
                <select value={noteType} onChange={(e) => setNoteType(e.target.value)}>
                  {NOTE_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Owner instructions, viewing times, keys, pocket remarks..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addNote();
                    }
                  }}
                />
                <button className="btn primary" type="button" disabled={busy} onClick={addNote}>
                  Add
                </button>
              </div>
              {notes.length === 0 && !draft.notes ? (
                <p className="studio-empty">No notes yet.</p>
              ) : (
                <ul className="studio-notes-list">
                  {draft.notes ? (
                    <li>
                      <div className="note-meta">
                        <b>General</b>
                        <span>Imported note</span>
                      </div>
                      <p>{draft.notes}</p>
                    </li>
                  ) : null}
                  {[...notes].reverse().map((item, index) => (
                    <li key={`${item.at}-${index}`}>
                      <div className="note-meta">
                        <b>{item.type || "General"}</b>
                        <span>
                          {item.by} · {when(item.at)}
                        </span>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => patch({ notes_list: notes.filter((note) => note !== item) })}
                        >
                          Remove
                        </button>
                      </div>
                      <p>{item.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        )}

        {step === 5 && (
          <section className="studio-stage">
            <StepHero tone="docs" kicker="Step 06" title="Add Documents">
              Title deed, NOC, Form A and related files. Images or PDF, up to 8 MB each.
            </StepHero>
            <article className="studio-card stage-card">
              <label className="step-drop">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(e) => {
                    addDocument("other", e.target.files, true);
                    e.target.value = "";
                  }}
                />
                <b>Drop files here or click to upload</b>
                <small>Any listing document. Use the slots below for the standard papers.</small>
              </label>
              {documents.filter((item) => item.kind === "other").length ? (
                <ul className="studio-link-list">
                  {documents
                    .filter((item) => item.kind === "other")
                    .map((item) => (
                      <li key={item.url}>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.name || item.url}
                        </a>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => patch({ documents_list: documents.filter((file) => file.url !== item.url) })}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
            </article>
            <div className="studio-doc-grid">
              {DOC_SLOTS.map((slot) => {
                const file = documents.find((item) => item.kind === slot.id);
                return (
                  <article className={`studio-doc${file ? " ready" : ""}`} key={slot.id}>
                    <strong>{slot.label}</strong>
                    {file ? (
                      <a href={file.url} target="_blank" rel="noreferrer">
                        {file.name || "Open file"}
                      </a>
                    ) : (
                      <span className="muted">Waiting for file</span>
                    )}
                    <label className="doc-browse">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => {
                          addDocument(slot.id, e.target.files, false);
                          e.target.value = "";
                        }}
                      />
                      {file ? "Replace" : "Upload"}
                    </label>
                    {file ? (
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() =>
                          patch({
                            documents_list: documents.filter((item) => item.kind !== slot.id),
                          })
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {step === 6 && (
          <section className="studio-stage">
            <StepHero tone="done" kicker="Step 07" title="Publishing Status">
              Tick Property Finder, Bayut and/or Dubizzle, then Publish live. The ad goes live only on the portals you select.
            </StepHero>
            <article className="studio-card stage-card done-card">
              {draft.photo ? <img className="studio-preview" src={draft.photo} alt="" /> : null}
              <div className="studio-review">
                <div><span>Reference</span><b>{draft.reference || "-"}</b></div>
                <div><span>Title</span><b>{draft.title || "-"}</b></div>
                <div><span>Type</span><b>{pretty(draft.type)} / {pretty(draft.purpose)}</b></div>
                <div><span>Size / Unit</span><b>{draft.area_sqft || "-"} sqft / {draft.unit_no || "-"}</b></div>
                <div>
                  <span>Location</span>
                  <b>{[draft.city, draft.community, draft.sub_community, draft.building].filter(Boolean).join(" > ") || "-"}</b>
                </div>
                <div><span>Price</span><b>{selectedPrice() || draft.price_aed || 0} AED</b></div>
                <div><span>Agent</span><b>{draft.listing_agent || "-"}</b></div>
                <div><span>Permit</span><b>{draft.permit_number || draft.dtcm_permit || (draft.non_rera ? "NON-ADREC" : "-")}</b></div>
                <div><span>Photos</span><b>{gallery.filter((item) => item.kind !== "floorplan").length}</b></div>
                <div><span>Portals</span><b>{PORTALS.filter((p) => (draft.portals || []).includes(p.id)).map((p) => p.name).join(", ") || "None"}</b></div>
                <div><span>Documents</span><b>{documents.length}</b></div>
                <div><span>Amenities</span><b>{selectedAmenities.length}</b></div>
                <div><span>Verification</span><b>{failing.length ? `${failing.length} to complete` : "Verified"}</b></div>
              </div>
              {listingExpiryError(draft) ? (
                <div className="studio-copy-alert" role="alert">
                  <b>Listing Expiry Auto-Archive</b>
                  <p>{listingExpiryError(draft)}</p>
                  <small>Expired ads move to Archive so they do not stay live by accident.</small>
                </div>
              ) : null}
              {listingCopyErrors(draft).length ? (
                <div className="studio-copy-alert" role="alert">
                  <b>Listing Error Detector</b>
                  {listingCopyErrors(draft).map((item) => (
                    <p key={item.message}>{item.message}</p>
                  ))}
                  <small>Fix the title or description, or change bedrooms in specifications, before Publish live.</small>
                </div>
              ) : null}
              {dupError ? (
                <div className="studio-copy-alert" role="alert">
                  <b>Duplicate Property Detector</b>
                  <p>{dupError}</p>
                  <small>Only an exact match is blocked. Change unit, permit, size, beds, or location if this is a different property.</small>
                </div>
              ) : null}
              <div className="studio-status-list" role="radiogroup" aria-label="Publishing status">
                {[
                  ["live", "Publish"],
                  ["archived", "Unpublish"],
                  ["draft", "Save as draft"],
                  ["pending", "Send for approval"],
                  ["pocket", "Save as pocket listing"],
                ].map(([value, label]) => (
                  <label key={value} className={`studio-status${finishStatus === value ? " on" : ""} ${value}`}>
                    <input
                      type="radio"
                      name="listing_status"
                      value={value}
                      checked={finishStatus === value}
                      onChange={() => setFinishStatus(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {finishStatus === "live" || !finishStatus ? (
                <div className="studio-live-portals" role="group" aria-label="Go live on portals">
                  <p className="studio-live-portals-label">Go live on</p>
                  <p className="studio-hint">Property Finder publishes now. Bayut and Dubizzle go on the live feed those sites read. Only the ticked sites are included.</p>
                  <div className="studio-live-portal-list">
                    {LIVE_GO_PORTALS.map((portal) => {
                      const on = (draft.portals || []).includes(portal.id);
                      return (
                        <label key={portal.id} className={`studio-live-portal portal-${portal.id}${on ? " on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => patch({ portals: withLiveGoPortals(draft.portals, portal.id, !on) })}
                          />
                          {portal.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="studio-finish">
                <button className="finish-btn live" type="button" disabled={busy} onClick={() => finishAs(finishStatus || "live")}>
                  {finishStatus === "live" || !finishStatus ? "Publish live" : "Submit"}
                </button>
              </div>
            </article>
          </section>
        )}
      </div>

      <footer className="studio-foot">
        <small>© 2026 A7 Group</small>
        <div className="studio-foot-actions">
          {step > 0 ? (
            <button className="btn" type="button" disabled={busy} onClick={() => goToStep(step - 1)}>
              Previous
            </button>
          ) : null}
          <button className="studio-save" type="button" disabled={busy} onClick={saveAndContinue}>
            {saveLabel}
            <Svg>
              <path d="m6 12 4 4 8-8" stroke="currentColor" strokeWidth="2" />
            </Svg>
          </button>
        </div>
      </footer>

      <datalist id="studio-people">
        {people.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="studio-landlords">
        {landlordNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="studio-developers">
        {developerNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="studio-locations">
        {locationPaths.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="studio-pf-accounts">
        {(pfAccounts || []).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="studio-bayut-accounts">
        {(bayutAccounts || []).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {amenityOpen ? (
        <div className="studio-modal" role="dialog" aria-label="Update Amenities">
          <div className="studio-modal-card studio-amenity-modal">
            <div className="studio-head">
              <h2>Private Amenities</h2>
              <button type="button" className="studio-close" onClick={() => setAmenityOpen(false)}>
                ×
              </button>
            </div>
            <AmenityPills items={PRIVATE_AMENITIES} selected={selectedAmenities} onToggle={toggleAmenity} prefix="private" />
            <div className="studio-head studio-amenity-subhead">
              <h2>Commercial Amenities</h2>
            </div>
            <AmenityPills items={COMMERCIAL_AMENITIES} selected={selectedAmenities} onToggle={toggleAmenity} prefix="commercial" />
            <button className="studio-save" type="button" onClick={() => setAmenityOpen(false)}>
              Select
            </button>
            <p className="studio-amenity-note">Amenities will be assigned to portals according to respective schema.</p>
          </div>
        </div>
      ) : null}

      {personModal ? (
        <div className="studio-modal" role="dialog" aria-label="Add person">
          <div className="studio-modal-card narrow">
            <div className="studio-head">
              <h2>
                {personModal === "agent" ? "Add Listing Agent" : personModal === "owner" ? "Add Listing Owner" : "Add Landlord"}
              </h2>
              <button type="button" className="studio-close" onClick={() => setPersonModal("")}>
                ×
              </button>
            </div>
            <div className="studio-fields one">
              <Field label="Name" required>
                <input value={personForm.name || ""} onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <input type="email" value={personForm.email || ""} onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })} />
              </Field>
              <Field label={personModal === "landlord" ? "Contact" : "Phone"}>
                <input value={personForm.phone || ""} onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })} />
              </Field>
              {personModal === "agent" ? (
                <Field label="Broker Number (BRN)" tip="If the agent does not have a BRN, enter 0">
                  <input value={personForm.brn || ""} onChange={(e) => setPersonForm({ ...personForm, brn: e.target.value })} />
                </Field>
              ) : null}
              {personModal !== "landlord" ? (
                <Field label="Role">
                  <select value={personForm.role || ""} onChange={(e) => setPersonForm({ ...personForm, role: e.target.value })}>
                    {(personModal === "agent" ? AGENT_ROLES : OWNER_ROLES).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>
            <button className="studio-save" type="button" disabled={busy} onClick={savePerson}>
              Save
            </button>
          </div>
        </div>
      ) : null}

      {locationModal ? (
        <div className="studio-modal" role="dialog" aria-label="Add Location">
          <div className="studio-modal-card narrow">
            <div className="studio-head">
              <h2>Add Location</h2>
              <button type="button" className="studio-close" onClick={() => setLocationModal(false)}>
                ×
              </button>
            </div>
            <p className="studio-hint">
              Write location like this "City - Community - Sub Community - Building".
              <br />
              Example: Dubai - Al Aweer - Al Aweer Village - Desert Palm
            </p>
            <div className="studio-fields one">
              <Field label="Location" required>
                <input value={locationText} onChange={(e) => setLocationText(e.target.value)} />
              </Field>
            </div>
            <button
              className="studio-save"
              type="button"
              onClick={() => {
                applyLocationText(locationText);
                setLocationModal(false);
              }}
            >
              Save changes
            </button>
          </div>
        </div>
      ) : null}

      {insightsOpen ? (
        <div className="studio-modal" role="dialog" aria-label="Listing Insights">
          <div className="studio-modal-card narrow">
            <div className="studio-head">
              <h2>Listing Insights</h2>
              <button type="button" className="studio-close" onClick={() => setInsightsOpen(false)}>
                ×
              </button>
            </div>
            {!draft.id ? (
              <p className="studio-hint">Save the listing first. Insights start once it exists on the desk.</p>
            ) : !insights ? (
              <p className="studio-hint">Loading...</p>
            ) : (
              <div className="studio-review">
                <div><span>Listing views</span><b>{insights.views}</b></div>
                <div><span>Days listed</span><b>{insights.days_listed}</b></div>
                <div><span>Status</span><b>{pretty(insights.status)}</b></div>
                <div><span>Portals enabled</span><b>{insights.portal_count}</b></div>
                <div><span>Photos</span><b>{insights.photos}</b></div>
                <div><span>Documents</span><b>{insights.documents}</b></div>
                <div><span>Notes</span><b>{insights.notes}</b></div>
                <div><span>History entries</span><b>{insights.history}</b></div>
                <div><span>Last update</span><b>{when(insights.last_update)}</b></div>
                <div>
                  <span>Public page</span>
                  <b>
                    <a href={insights.share_url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </b>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {mediaDragUi?.moved ? (
        <div
          className="studio-media-ghost"
          style={{ left: mediaDragUi.x, top: mediaDragUi.y }}
        >
          <img src={mediaDragUi.url} alt="" />
        </div>
      ) : null}
    </div>
  );
}
