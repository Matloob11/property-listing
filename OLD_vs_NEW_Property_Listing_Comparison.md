# Property Listing — OLD (app 46) vs NEW (app 81) — Exact Comparison

Verified live in browser on 2026-09-11 (logged into A7 Bitrix24).
- OLD = "Property Listing", app ID 46, hosted at youtupia.com/a7group
- NEW = "Property Listing New", app ID 81 / placement 395, hosted at listings.srv1802669.hstgr.cloud

---

## 1. Jo bilkul SAME hai (already copied correctly)

| Area | Detail |
|---|---|
| Page header | `Property Listing` + `Availability` toggle + `Listings` toggle (with count badges) |
| Top sections | Listing Infographics, Filters, Listing Tabs (status), Listings table |
| Table columns (14) | Actions, Portals, Reference, Title, Layout, Type, Price, Created, Updated, Status, Community, Listing Agent, Listing Owner, Expiry Date …Portals |
| Status tabs (8) | All Listing, My Listing, My Draft, My Live, My Pending, My Archived, My Duplicate, My Pocket Listing |
| Create button | "Create Listing" (floating) |
| Create wizard steps (7) | Property Details → Media → Location → Publishing → Notes → Documents → Completed |
| Create sections | Choose Property Type (Residential/Commercial, Rent/Sale), Specifications, Pricing, Description, Select Amenities, Draft Property, Management, Property Permit |
| Publishing statuses | Publish, Unpublish, Save as draft, Send for approval, Save as pocket listing |
| Row detail | View Details popup (photo, purpose, type, layout, price, status, community, agent) |

Row reference format `a7group-XXXX` bhi same hai.

---

## 2. Jo NEW mein BEHTAR / EXTRA hai (new is ahead here)

**Row Actions menu** — OLD mein 6, NEW mein 12 items:
- OLD (6): View Details, Copy Link, Download PDF, Download DLD Image, Copy Link as Logged in Agent, Download PDF as Logged in Agent
- NEW adds (6 more): **Download Brochure, Duplicate listing, Mark Live, Mark Pending, Archive, Move to Pocket**

**Specifications fields** — NEW ne bahut fields add kiye jo OLD mein nahi the:
- No of parking spaces, Total plot size, Lot size, Built-up Area (BUA)
- Layout Type (Standard / Duplex / Triplex / Loft / Penthouse Layout)
- Project Name, Developer, Build year
- Listing Source (Company / Agent / Owner / Referral)

**Permit / Agent fields** — NEW extra:
- Permit Issue Date, Permit Expiration Date
- Landlord Name + **Landlord Email + Landlord Contact** (OLD sirf "Add Landlord")
- "is Different Agent for portal" toggle, Listing Agent (RERA Agent) vs Listing Owner (non-RERA)
- Service Charges (Pricing mein)

**Filters** — NEW mein zyada granular search:
- Listing ID, Unit no, Permit no, Title/community/reference text search
- Full emirate + community location filter (Dubai, Abu Dhabi, Sharjah, Ajman, RAK, UAQ, Fujairah, Al Ain + Downtown, Marina, JVC, JLT, Business Bay, Palm, Dubai Hills, Arabian Ranches, etc.)

**UI** — NEW zyada polished/modern (colored collapsible cards, better spacing).

---

## 3. Jo OLD mein hai lekin NEW mein MISSING ya DIFFERENT (yeh check/add karna hai)

**A. Portals — sabse important**
- OLD Filters portal list (6): Property Finder, **Property Finder API**, Bayut, Dubizzle, Website, Rightmove
- NEW portals (5): Property Finder, Bayut, Dubizzle, Website, Rightmove
- ❗ MISSING in NEW: **"Property Finder API"** as a separate portal option.
- OLD har row par 4 portal status icons dikhata hai; NEW sirf 2 icons dikhata hai per row → NEW mein per-row portal status indicators kam hain (verify karna hai ke saare 5 portals ki live/publish status row par dikh rahi hai ya nahi).

**B. Pricing structure**
- OLD Pricing: alag-alag per-portal blocks — **"Property Finder" block aur "Bayut" block** dono ke apne Yearly/Monthly/Weekly/Daily fields.
- NEW Pricing: ek hi generic "Custom Pricing for Each Portal" (Yearly/Monthly/Weekly/Daily).
- ❗ Verify: kya NEW har portal ke liye alag price set karne deta hai (jaise OLD), ya sirf ek common price?

**C. Filters jo OLD mein the, NEW ke Filters mein nahi dikhe**
- Portal filter (listings ko portal ke hisab se filter karna)
- Project status filter (Ready Secondary / Off-Plan Secondary / Ready Primary / Off-Plan Primary)
- Residential/Commercial + Rent/Sale quick filter
- Page-size selector (10 / 25 / 50 / 100)
- **Bulk actions: "Transfer" aur "Transfer To Account"** (listings ko dusre account/agent ko transfer karna) — yeh NEW mein nahi mila.

**D. Specification options (dropdown values) OLD mein zyada**
- Ownership: OLD = Free Hold / None Hold / Lease Hold / GCC. NEW = sirf Freehold / Leasehold (GCC + None Hold missing).
- Furnished: OLD = Unfurnished / Semi furnished / Furnished (same). OK.
- Payment Method: OLD = Cash / Installments / Cash,Installments. NEW = Cheque / Cash / Bank Transfer / Installments (NEW zyada, OK).

**E. Naming difference (label)**
- OLD: "Enable NON-ADREC". NEW: "Enable NON-RERA". (ADREC = Abu Dhabi, RERA = Dubai — confirm karein kaunsa sahi chahiye.)
- OLD column "Expiry Date From Portals" → NEW "Expiry Date For Portals" (chhota wording farq).

**F. Verify karna baaqi (wizard ne aage steps block kiye, existing listing edit se check karein):**
- Media step: Add Photos, Floor Plan — dono mein hai? NEW mein confirm karna.
- Location step: System Location + Bayut Location (OLD mein dono the — Bayut ki apni location mapping). NEW mein "Bayut Location" mapping hai ya nahi.
- Side panels jo OLD create form mein the: **History, Listing Insights, Verification Status, Available Upgrades** — NEW mein yeh panels hain ya nahi, confirm karna.
- Publishing step ke per-portal Enable toggles + "Send for approval" flow NEW mein poora hai ya nahi.

---

### Summary (1 line)
NEW zyada tar OLD ka superset hai (behtar UI, zyada spec fields, zyada row actions). Jo cheezein khaas dhyan chahiye: **(1) Property Finder API portal, (2) per-portal alag pricing, (3) portal/project-status filters, (4) Transfer/Transfer-To-Account bulk action, (5) Bayut Location mapping, (6) History/Insights/Verification side panels, (7) NON-ADREC vs NON-RERA naming.**
