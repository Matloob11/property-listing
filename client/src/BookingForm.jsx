import { useEffect, useMemo, useState } from "react";
import { TitleDeedSheet } from "./TitleDeedSheet.jsx";
import { downloadFile } from "./downloadFile.js";
import { CrmTypeahead, lookupCrmItem } from "./CrmTypeahead.jsx";
import { usePersistedState } from "./uiPersist.js";

const TYPE_AR = {
  Shop: "محل",
  Apartment: "شقة",
  Villa: "فيلا",
  Office: "مكتب",
  Warehouse: "مستودع",
  Retail: "تجاري",
  Land: "أرض",
  Townhouse: "تاون هاوس",
  Penthouse: "بنتهاوس",
  "Hotel Apartment": "شقة فندقية",
};

const COMMUNITY_AR = {
  "Al Warsan First": "الورسان الأولى",
  "Al Warsan 1": "الورسان الأولى",
  "Business Bay": "الخليج التجاري",
  "Dubai Marina": "دبي مارينا",
  "Downtown Dubai": "وسط مدينة دبي",
  "Jumeirah Village Circle": "جميرا فيلدج سيركل",
  "Jumeirah Lake Towers": "أبراج بحيرات جميرا",
};

function arabicCommunity(name) {
  const key = String(name || "").replace(/\s+/g, " ").trim();
  if (COMMUNITY_AR[key]) return COMMUNITY_AR[key];
  const hit = Object.keys(COMMUNITY_AR).find((item) => item.toLowerCase() === key.toLowerCase());
  return hit ? COMMUNITY_AR[hit] : "";
}

function arabicType(name) {
  const key = String(name || "").trim();
  if (TYPE_AR[key]) return TYPE_AR[key];
  const pretty = key.replace(/\b\w/g, (c) => c.toUpperCase());
  return TYPE_AR[pretty] || "";
}

const EMPTY = {
  id: "",
  listingId: "",
  listingRef: "",
  documentNo: "",
  issueDate: "",
  mortgageStatus: "Not mortgaged",
  mortgageStatusAr: "غير مرهونة",
  propertyType: "",
  propertyTypeAr: "",
  community: "",
  communityAr: "",
  plotNo: "",
  buildingNo: "",
  buildingName: "",
  propertyNo: "",
  floorNo: "",
  parkings: "",
  suiteArea: "",
  balconyArea: "",
  areaSqMeter: "",
  areaSqFeet: "",
  ownersCount: "1",
  ownerName: "",
  ownerNameAr: "",
  ownerId: "",
  ownerShare: "",
  ownerAreaSqm: "",
  owner2Name: "",
  owner2NameAr: "",
  owner2Id: "",
  owner2Share: "",
  owner2AreaSqm: "",
  purchasedFrom: "",
  purchasedFromAr: "",
  landRegistrationNo: "",
  registrationDate: "",
  amount: "",
  amountWords: "",
  amountWordsAr: "",
};

function moneyNumber(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function amountInWords(raw) {
  const n = Math.round(moneyNumber(raw));
  if (n <= 0) return "";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const to99 = (x) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`.trim());
  const to999 = (x) => {
    const hundred = Math.floor(x / 100);
    const rest = x % 100;
    const bits = [];
    if (hundred) bits.push(`${ones[hundred]} Hundred`);
    if (rest) bits.push(to99(rest));
    return bits.join(" ");
  };
  const parts = [];
  let left = n;
  const million = Math.floor(left / 1000000);
  left %= 1000000;
  const thousand = Math.floor(left / 1000);
  left %= 1000;
  if (million) parts.push(`${to999(million)} Million`);
  if (thousand) parts.push(`${to999(thousand)} Thousand`);
  if (left) parts.push(to999(left));
  return `${parts.join(" ")} UAE Dirhams only`;
}

function sqmFromSqft(sqft) {
  const n = moneyNumber(sqft);
  return n > 0 ? String(Math.round(n * 0.092903 * 100) / 100) : "";
}

function sqftFromSqm(sqm) {
  const n = moneyNumber(sqm);
  return n > 0 ? String(Math.round(n / 0.092903)) : "";
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false, error: `Request failed (${res.status})` }));
  return json;
}

function when(ts) {
  if (!ts) return "";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function BookingForm({ listings }) {
  const [step, setStep] = usePersistedState("booking.step", 1);
  const [form, setForm] = usePersistedState("booking.form", EMPTY);
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);
  const [preview, setPreview] = useState("");
  const [listingQ, setListingQ] = usePersistedState("booking.listingQ", "");
  const [listingHits, setListingHits] = useState([]);

  const f = (key) => form[key] || "";
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function loadSaved() {
    const body = await api("/api/booking/list");
    if (body.ok) setSaved(body.items || []);
  }

  useEffect(() => {
    loadSaved();
  }, []);

  useEffect(() => {
    const q = listingQ.trim();
    if (q.length < 2) {
      setListingHits([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const body = await fetch(`/api/listings?q=${encodeURIComponent(q)}&pageSize=50`, { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}));
      setListingHits(body.listings || []);
    }, 280);
    return () => clearTimeout(timer);
  }, [listingQ]);

  const deskOptions = useMemo(() => {
    const q = listingQ.trim().toLowerCase();
    const rows = listings || [];
    if (!q) return rows.slice(0, 40);
    return rows.filter((row) => `${row.reference} ${row.title} ${row.community}`.toLowerCase().includes(q)).slice(0, 40);
  }, [listings, listingQ]);

  function applyListingData(data) {
    set({ ...EMPTY, ...data, id: form.id });
    setStatus({ type: "ok", text: "Listing fields filled. Complete any empty boxes, then save." });
  }

  async function pickListing(id) {
    if (!id) {
      set({ listingId: "", listingRef: "" });
      return;
    }
    const local = (listings || []).find((row) => row.id === id);
    const body = await api(`/api/booking/from-listing/${encodeURIComponent(id)}`);
    if (body.ok && body.data) {
      applyListingData(body.data);
      return;
    }
    if (local) {
      applyListingData({
        listingId: local.id,
        listingRef: local.reference,
        documentNo: local.reference || local.title_deed || "",
        propertyType: String(local.type || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        propertyTypeAr: arabicType(String(local.type || "").replace(/_/g, " ")),
        community: local.community || local.sub_community || "",
        communityAr: arabicCommunity(local.community || local.sub_community || ""),
        buildingName: local.building || local.project_name || "",
        propertyNo: local.unit_no || "",
        parkings: local.parking || "",
        areaSqFeet: local.area_sqft ? String(local.area_sqft) : "",
        areaSqMeter: sqmFromSqft(local.area_sqft),
        suiteArea: sqmFromSqft(local.area_sqft),
        ownerName: local.landlord_name || "",
        ownerShare: local.landlord_name ? "100%" : "",
        ownerAreaSqm: sqmFromSqft(local.area_sqft),
        landRegistrationNo: local.title_deed || "",
        amount: local.purpose === "sale" && local.price_aed ? String(local.price_aed) : "",
        amountWords: local.purpose === "sale" && local.price_aed ? amountInWords(local.price_aed) : "",
        mortgageStatus: "Not mortgaged",
        mortgageStatusAr: "غير مرهونة",
      });
    }
  }

  function changeArea(which, value) {
    if (which === "feet") {
      const sqm = sqmFromSqft(value);
      set({
        areaSqFeet: value,
        areaSqMeter: sqm || form.areaSqMeter,
        suiteArea: form.suiteArea || sqm,
        ownerAreaSqm: form.ownerAreaSqm || sqm,
      });
      return;
    }
    const sqft = sqftFromSqm(value);
    set({
      areaSqMeter: value,
      areaSqFeet: sqft || form.areaSqFeet,
      suiteArea: form.suiteArea || value,
      ownerAreaSqm: form.ownerAreaSqm || value,
    });
  }

  function changeAmount(value) {
    set({ amount: value, amountWords: amountInWords(value) });
  }

  function missing() {
    if (!form.ownerName.trim()) return "Add the owner name.";
    if (!form.community.trim() && !form.propertyNo.trim() && !form.buildingName.trim()) {
      return "Add community, building name, or property number.";
    }
    return "";
  }

  async function persist() {
    const miss = missing();
    if (miss) {
      setStatus({ type: "err", text: miss });
      setStep(1);
      return null;
    }
    const body = await api("/api/booking/save", { ...form, amountWords: form.amountWords || amountInWords(form.amount) });
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not save the title deed." });
      return null;
    }
    set({ id: body.item.id });
    setPreview(body.item.preview);
    setStep(2);
    await loadSaved();
    return body.item;
  }

  async function saveForm() {
    setBusy(true);
    try {
      const item = await persist();
      if (item) setStatus({ type: "ok", text: "Saved. Download the PDF or keep editing." });
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      const item = await persist();
      if (!item?.download) return;
      await downloadFile(item.download, item.pdfName || "title-deed.pdf");
      setStatus({ type: "ok", text: `Downloading ${item.pdfName || "the PDF"}.` });
    } catch (err) {
      setStatus({ type: "err", text: err instanceof Error ? err.message : "Could not download the PDF." });
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(item) {
    const body = await api(`/api/booking/${encodeURIComponent(item.id)}`);
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not open this form." });
      return;
    }
    set({ ...EMPTY, ...body.item.data, id: body.item.id });
    setPreview(body.item.preview);
    setStep(2);
    setStatus({ type: "ok", text: "Opened saved title deed." });
  }

  async function removeSaved(item) {
    if (!window.confirm("Delete this title deed?")) return;
    const res = await fetch(`/api/booking/${encodeURIComponent(item.id)}`, { method: "DELETE", credentials: "same-origin" });
    const body = await res.json().catch(() => ({ ok: false }));
    if (!body.ok) {
      setStatus({ type: "err", text: body.error || "Could not delete." });
      return;
    }
    if (form.id === item.id) {
      setForm(EMPTY);
      setPreview("");
      setStep(1);
    }
    await loadSaved();
  }

  function resetForm() {
    setForm(EMPTY);
    setPreview("");
    setListingQ("");
    setStep(1);
    setStatus({ type: "", text: "" });
  }

  return (
    <div className="tc-wrap bf-wrap">
      <nav className="tc-stepper" aria-label="Steps">
        <button type="button" className={step === 1 ? "is-on" : ""} onClick={() => setStep(1)}>
          1. Details
        </button>
        <button
          type="button"
          className={step === 2 ? "is-on" : ""}
          onClick={() => {
            const miss = missing();
            if (miss) {
              setStatus({ type: "err", text: miss });
              return;
            }
            if (!form.id) saveForm();
            else setStep(2);
          }}
        >
          2. Form / PDF
        </button>
      </nav>

      {status.text ? <div className={`tc-status ${status.type}`}>{status.text}</div> : null}

      {step === 1 ? (
        <form className="tc-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          <section>
            <h2>1. Listing</h2>
            <p className="tc-hint">Pick a desk listing to auto-fill matching title-deed fields. Empty fields stay for you to type.</p>
            <label className="tc-listing-pick">
              Search listing
              <input value={listingQ} placeholder="Reference, community, or title" onChange={(e) => setListingQ(e.target.value)} />
            </label>
            <label className="tc-listing-pick">
              Or pick from this page
              <select value={f("listingId")} onChange={(e) => pickListing(e.target.value)}>
                <option value="">— none —</option>
                {(listingHits.length ? listingHits : deskOptions).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.reference} · {row.title}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h2>2. Document</h2>
            <div className="tc-grid">
              <label>
                Document / file no. <input value={f("documentNo")} onChange={(e) => set({ documentNo: e.target.value })} />
              </label>
              <label>
                Issue Date <input value={f("issueDate")} placeholder="04/07/2022" onChange={(e) => set({ issueDate: e.target.value })} />
              </label>
              <label>
                Mortgage Status
                <select
                  value={f("mortgageStatus")}
                  onChange={(e) =>
                    set({
                      mortgageStatus: e.target.value,
                      mortgageStatusAr: e.target.value === "Not mortgaged" ? "غير مرهونة" : "مرهونة",
                    })
                  }
                >
                  <option>Not mortgaged</option>
                  <option>Mortgaged</option>
                </select>
              </label>
            </div>
          </section>

          <section>
            <h2>3. Property</h2>
            <div className="tc-grid">
              <label>
                Property Type
                <input
                  value={f("propertyType")}
                  placeholder="Shop"
                  onChange={(e) => {
                    const pretty = e.target.value;
                    set({ propertyType: pretty, propertyTypeAr: arabicType(pretty) });
                  }}
                />
              </label>
              <label>
                Community
                <input
                  value={f("community")}
                  placeholder="Al Warsan First"
                  onChange={(e) => {
                    const community = e.target.value;
                    set({ community, communityAr: arabicCommunity(community) || form.communityAr });
                  }}
                />
              </label>
              <label>
                Plot No <input value={f("plotNo")} onChange={(e) => set({ plotNo: e.target.value })} />
              </label>
              <label>
                Building No <input value={f("buildingNo")} onChange={(e) => set({ buildingNo: e.target.value })} />
              </label>
              <label>
                Building Name <input value={f("buildingName")} placeholder="K12" onChange={(e) => set({ buildingName: e.target.value })} />
              </label>
              <label>
                Property No <input value={f("propertyNo")} placeholder="506" onChange={(e) => set({ propertyNo: e.target.value })} />
              </label>
              <label>
                Floor No <input value={f("floorNo")} placeholder="G" onChange={(e) => set({ floorNo: e.target.value })} />
              </label>
              <label>
                Parkings <input value={f("parkings")} onChange={(e) => set({ parkings: e.target.value })} />
              </label>
            </div>
          </section>

          <section>
            <h2>4. Area</h2>
            <div className="tc-grid">
              <label>
                Suite Area <input value={f("suiteArea")} onChange={(e) => set({ suiteArea: e.target.value })} />
              </label>
              <label>
                Balcony Area <input value={f("balconyArea")} onChange={(e) => set({ balconyArea: e.target.value })} />
              </label>
              <label>
                Area sq Meter <input value={f("areaSqMeter")} onChange={(e) => changeArea("meter", e.target.value)} />
              </label>
              <label>
                Area sq Feet <input value={f("areaSqFeet")} onChange={(e) => changeArea("feet", e.target.value)} />
              </label>
            </div>
          </section>

          <section>
            <h2>5. Owners numbers and their shares</h2>
            <div className="tc-grid">
              <label>
                Number of owners
                <select value={f("ownersCount")} onChange={(e) => set({ ownersCount: e.target.value })}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>
              <label>
                Owner name
                <CrmTypeahead
                  entities={["contact"]}
                  placeholder="Type owner name…"
                  addNewLabel="+ Add new owner to Bitrix"
                  addName={f("ownerName")}
                  value={f("ownerName")}
                  onChange={(ownerName) => set({ ownerName })}
                  onPick={async (item) => {
                    if (!item) return;
                    set({ ownerName: item.title });
                    const info = await lookupCrmItem(item).catch(() => null);
                    if (info?.name) set({ ownerName: info.name });
                  }}
                />
              </label>
              <label>
                Owner no. / ID <input value={f("ownerId")} placeholder="0000000" onChange={(e) => set({ ownerId: e.target.value })} />
              </label>
              <label>
                Share <input value={f("ownerShare")} placeholder="100%" onChange={(e) => set({ ownerShare: e.target.value })} />
              </label>
              <label>
                Owner area (sq meter) <input value={f("ownerAreaSqm")} onChange={(e) => set({ ownerAreaSqm: e.target.value })} />
              </label>
            </div>
            {f("ownersCount") === "2" ? (
              <div className="tc-grid">
                <label>
                  2nd owner name
                  <CrmTypeahead
                    entities={["contact"]}
                    placeholder="Type second owner name…"
                    addNewLabel="+ Add new owner to Bitrix"
                    addName={f("owner2Name")}
                    value={f("owner2Name")}
                    onChange={(owner2Name) => set({ owner2Name })}
                    onPick={async (item) => {
                      if (!item) return;
                      set({ owner2Name: item.title });
                      const info = await lookupCrmItem(item).catch(() => null);
                      if (info?.name) set({ owner2Name: info.name });
                    }}
                  />
                </label>
                <label>
                  2nd owner no. / ID <input value={f("owner2Id")} onChange={(e) => set({ owner2Id: e.target.value })} />
                </label>
                <label>
                  2nd share <input value={f("owner2Share")} onChange={(e) => set({ owner2Share: e.target.value })} />
                </label>
                <label>
                  2nd owner area <input value={f("owner2AreaSqm")} onChange={(e) => set({ owner2AreaSqm: e.target.value })} />
                </label>
              </div>
            ) : null}
          </section>

          <section>
            <h2>6. Land registration</h2>
            <div className="tc-grid">
              <label>
                Purchased from <input value={f("purchasedFrom")} placeholder="Seller name" onChange={(e) => set({ purchasedFrom: e.target.value })} />
              </label>
              <label>
                Land Registration No. <input value={f("landRegistrationNo")} placeholder="100035/2022" onChange={(e) => set({ landRegistrationNo: e.target.value })} />
              </label>
              <label>
                Date <input value={f("registrationDate")} placeholder="04/07/2022" onChange={(e) => set({ registrationDate: e.target.value })} />
              </label>
              <label>
                Amount (AED) <input value={f("amount")} placeholder="350000" onChange={(e) => changeAmount(e.target.value)} />
              </label>
              <label className="bf-wide">
                Amount in words <input value={f("amountWords")} placeholder="Amount in words UAE Dirhams only" onChange={(e) => set({ amountWords: e.target.value })} />
              </label>
            </div>
          </section>

          <div className="tc-actions">
            <button type="button" className="ui-btn ui-btn-light" onClick={resetForm}>
              New form
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={saveForm}>
              {busy ? "Saving…" : "Save and make PDF"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <div className="bf-preview">
          <div className="tc-actions">
            <button type="button" className="ui-btn ui-btn-light" onClick={() => setStep(1)}>
              Back to details
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={saveForm}>
              {busy ? "Saving…" : "Save again"}
            </button>
            <button type="button" className="ui-btn ui-btn-success" disabled={busy} onClick={downloadPdf}>
              {busy ? "Preparing PDF…" : "Download PDF"}
            </button>
          </div>
          <div className="deed-desk">
            <TitleDeedSheet data={form} />
          </div>
        </div>
      ) : null}

      <section className="bf-saved">
        <h2>Saved title deeds</h2>
        {!saved.length ? <p className="tc-hint">None yet. Fill the fields and save.</p> : null}
        <ul>
          {saved.map((item) => (
            <li key={item.id}>
              <button type="button" className="bf-saved-open" onClick={() => openSaved(item)}>
                <b>{item.title}</b>
                <span>
                  {item.ownerName || "No owner"} · {item.listingRef || "No listing"} · {when(item.updatedAt)}
                </span>
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => openSaved(item)}>
                Open
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-light" onClick={() => removeSaved(item)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
