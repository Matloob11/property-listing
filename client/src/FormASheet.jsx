import {
  FORM_A_ELECTRONIC_AR,
  FORM_A_ELECTRONIC_EN,
  FORM_A_TERMS_AR,
  FORM_A_TERMS_EN,
  moneyAed,
  ownerDisplayName,
  yesNo,
} from "../../server/formAModel.js";

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

function aed(value) {
  const n = moneyAed(value);
  return n ? `${n} AED` : "";
}

function Pair({ label, value }) {
  return (
    <div className="forma-kv">
      <span>{label}</span>
      <b>{value || "\u00a0"}</b>
    </div>
  );
}

function Term({ en, ar }) {
  return (
    <div className="forma-term">
      <div>
        <strong>{en.title}</strong> {en.text}
        {en.bullets?.length ? (
          <ul>
            {en.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="forma-term-ar" dir="rtl" lang="ar">
        <strong>{ar.title}</strong> {ar.text}
        {ar.bullets?.length ? (
          <ul>
            {ar.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function FormASheet({ data }) {
  const person = v(data, "ownerKind") !== "company";
  const owner = ownerDisplayName(data);
  return (
    <article className="forma-sheet" id="forma-sheet">
      <header className="forma-sheet-head">
        <small>Dubai Land Department · RERA</small>
        <h1>Create Contract A</h1>
        <p>Form A · Marketing contract · A7 Group Real Estate LLC</p>
      </header>

      <p className="forma-banner">
        Property is registered under Taskeen. Owner MUST cancel his/her visa issued on this property before visiting
        Registration Trustee office to complete the transaction.
      </p>

      <section>
        <h2>Property Information</h2>
        <div className="forma-sheet-grid">
          <Pair label="Certificate Number" value={v(data, "certificateNumber")} />
          <Pair label="Certificate Year" value={v(data, "certificateYear")} />
          <Pair label="Owner Verification Type" value={v(data, "ownerVerification")} />
          {v(data, "ownerVerificationValue") ? (
            <Pair label={v(data, "ownerVerification") || "Owner verification"} value={v(data, "ownerVerificationValue")} />
          ) : null}
          <Pair label="Is Freehold" value={yesNo(v(data, "isFreehold"))} />
          <Pair label="Property Type" value={v(data, "propertyType")} />
          <Pair label="Size (Sq.M)" value={v(data, "sizeSqm")} />
          <Pair label="Project Name" value={v(data, "projectName")} />
          <Pair label="Plot Number" value={v(data, "plotNumber")} />
          <Pair label="Location" value={v(data, "location")} />
          <Pair label="Usage" value={v(data, "usage")} />
          <Pair label="No. of Bedrooms" value={v(data, "beds")} />
          <Pair label="No. of Bathrooms" value={v(data, "baths")} />
          <Pair label="No. of Kitchens" value={v(data, "kitchens")} />
          <Pair label="No. of Units" value={v(data, "units")} />
          <Pair label="No. of Car Parks" value={v(data, "carParks")} />
          <Pair label="Floor No." value={v(data, "floorNo")} />
          <Pair label="No. of Floors" value={v(data, "floors")} />
          <Pair label="No. of Shops" value={v(data, "shops")} />
          <Pair label="Facilities" value={v(data, "facilities")} />
          <Pair label="Additional information" value={v(data, "additionalInfo")} />
        </div>
      </section>

      <p className="forma-banner warn">
        The service of updating property owners&apos; data by brokers when creating a marketing contract (A) has been
        suspended. The property owner or their authorized representative must update their data.
      </p>

      <section>
        <h2>{person ? "Owner 1" : "Owner company"}</h2>
        <div className="forma-sheet-grid">
          {person ? (
            <>
              <Pair label="Name (English)" value={v(data, "ownerNameEn")} />
              <Pair label="Name (Arabic)" value={v(data, "ownerNameAr")} />
              <Pair label="Mobile Number" value={v(data, "ownerMobile")} />
              <Pair label="Email" value={v(data, "ownerEmail")} />
              <Pair label="Nationality" value={v(data, "ownerNationality")} />
              <Pair label="Passport Number" value={v(data, "ownerPassport")} />
            </>
          ) : (
            <>
              <Pair label="Company name (English)" value={v(data, "companyNameEn")} />
              <Pair label="Company name (Arabic)" value={v(data, "companyNameAr")} />
              <Pair label="Trade license" value={v(data, "companyLicense")} />
              <Pair label="Authorized person" value={v(data, "authorizedPerson")} />
              <Pair label="Mobile Number" value={v(data, "ownerMobile")} />
              <Pair label="Email" value={v(data, "ownerEmail")} />
            </>
          )}
          <Pair label="Source of lead through Green List" value={yesNo(v(data, "greenList"))} />
          <Pair label="Selling Area" value={`${v(data, "sellingArea") || v(data, "sizeSqm") || ""} Sq.M`} />
          <Pair label="Percentage of Sell / Owning Share" value={`${v(data, "owningShare") || "100"}%`} />
          <Pair label="Who will represent" value={v(data, "representAs") === "representative" ? "Representative" : "Owner"} />
        </div>
      </section>

      <section>
        <h2>Tenancy Information</h2>
        <p>
          {v(data, "noTenancy") === "1"
            ? "No tenancy contract is attached to this property."
            : `Tenant ${v(data, "tenantName") || "-"} · ${v(data, "tenancyStart") || "-"} to ${v(data, "tenancyEnd") || "-"} · ${aed(v(data, "tenancyRent")) || "No rent entered"}`}
        </p>
      </section>

      <section>
        <h2>Property Financial Information</h2>
        <div className="forma-sheet-grid">
          <Pair label="Sell Price" value={aed(v(data, "sellPrice"))} />
          <Pair label="Outstanding service charge amount" value={aed(v(data, "serviceCharge") || "0")} />
        </div>
      </section>

      <section>
        <h2>Commission and Duration</h2>
        <div className="forma-sheet-grid">
          <Pair label="Contract Start Date" value={v(data, "contractStart")} />
          <Pair label="Contract End Date" value={v(data, "contractEnd")} />
          <Pair label="Commission will be Paid" value={yesNo(v(data, "commissionPaid"))} />
          <Pair label="NOC from Developer" value={yesNo(v(data, "nocDeveloper"))} />
          <Pair label="Seller covering marketing fees" value={yesNo(v(data, "sellerMarketingFees"))} />
          <Pair label="Is Exclusive" value={yesNo(v(data, "isExclusive"))} />
          {v(data, "commissionPercent") ? <Pair label="Commission %" value={`${v(data, "commissionPercent")}%`} /> : null}
        </div>
      </section>

      <section>
        <h2>Notes</h2>
        <p>{v(data, "notes") || "—"}</p>
      </section>

      <section>
        <h2>Terms and Conditions</h2>
        {FORM_A_TERMS_EN.map((en, index) => (
          <Term key={en.title} en={en} ar={FORM_A_TERMS_AR[index]} />
        ))}
        <div className="forma-term forma-electronic">
          <p>{FORM_A_ELECTRONIC_EN}</p>
          <p className="forma-term-ar" dir="rtl" lang="ar">
            {FORM_A_ELECTRONIC_AR}
          </p>
        </div>
        <p className="forma-accepted">
          {v(data, "acceptedTerms") === "1"
            ? `I accept the above terms and conditions. Submitted by ${owner || "the owner"}${v(data, "submittedAt") ? ` · ${v(data, "submittedAt")}` : ""}.`
            : "Terms have not been accepted yet."}
        </p>
      </section>
    </article>
  );
}
