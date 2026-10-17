import { PdfDoc } from "./pdf.js";
import { FORM_A_ELECTRONIC_EN, FORM_A_TERMS_EN, moneyAed, ownerDisplayName, yesNo } from "./formAModel.js";

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

function aed(value) {
  const n = moneyAed(value);
  return n ? `${n} AED` : "-";
}

export function formAPdf(data) {
  const doc = new PdfDoc();
  const person = v(data, "ownerKind") !== "company";
  const owner = ownerDisplayName(data) || "-";

  doc.text("DUBAI LAND DEPARTMENT  ·  RERA", { size: 9, align: "center", color: [0.25, 0.32, 0.45], gap: 2 });
  doc.text("FORM A", { size: 18, bold: true, align: "center", gap: 2 });
  doc.text("Marketing Contract  /  Create Contract A", { size: 12, bold: true, align: "center", gap: 2 });
  doc.text("A7 Group Real Estate LLC  ·  License 1056530", { size: 9, align: "center", gap: 10 });

  if (v(data, "listingRef")) doc.text(`Desk listing: ${v(data, "listingRef")}`, { size: 9, gap: 8 });

  doc.heading("Property Information", 12);
  doc.rows([
    ["Certificate number", v(data, "certificateNumber")],
    ["Certificate year", v(data, "certificateYear")],
    ["Property type", v(data, "propertyType")],
    ["Owner verification type", v(data, "ownerVerification")],
    ...(v(data, "ownerVerificationValue")
      ? [[v(data, "ownerVerification") || "Owner verification", v(data, "ownerVerificationValue")]]
      : []),
    ["Project name", v(data, "projectName")],
    ["Location", v(data, "location")],
    ["Plot number", v(data, "plotNumber")],
    ["Usage", v(data, "usage")],
    ["Is freehold", yesNo(v(data, "isFreehold"))],
    ["Size (sq.m)", v(data, "sizeSqm")],
    ["Bedrooms", v(data, "beds")],
    ["Bathrooms", v(data, "baths")],
    ["Kitchens", v(data, "kitchens")],
    ["Units", v(data, "units")],
    ["Car parks", v(data, "carParks")],
    ["Floor no.", v(data, "floorNo")],
    ["Floors", v(data, "floors")],
    ["Shops", v(data, "shops")],
    ["Facilities", v(data, "facilities")],
    ["Additional information", v(data, "additionalInfo")],
  ]);

  doc.heading(person ? "Owner 1" : "Owner company", 12);
  doc.rows(
    person
      ? [
          ["Name (English)", v(data, "ownerNameEn")],
          ["Name (Arabic)", v(data, "ownerNameAr")],
          ["Mobile number", v(data, "ownerMobile")],
          ["Email", v(data, "ownerEmail")],
          ["Nationality", v(data, "ownerNationality")],
          ["Passport number", v(data, "ownerPassport")],
        ]
      : [
          ["Company name (English)", v(data, "companyNameEn")],
          ["Company name (Arabic)", v(data, "companyNameAr")],
          ["Trade license", v(data, "companyLicense")],
          ["Authorized person", v(data, "authorizedPerson")],
          ["Mobile number", v(data, "ownerMobile")],
          ["Email", v(data, "ownerEmail")],
        ]
  );
  doc.rows([
    ["Green List source of lead", yesNo(v(data, "greenList"))],
    ["Selling area (sq.m)", v(data, "sellingArea") || v(data, "sizeSqm")],
    ["Percentage of sell / owning share", `${v(data, "owningShare") || "100"}%`],
    ["Who will represent", v(data, "representAs") === "representative" ? "Representative" : "Owner"],
  ]);

  doc.heading("Tenancy Information", 12);
  if (v(data, "noTenancy") === "1") {
    doc.text("No tenancy contract is attached to this property.", { size: 10 });
  } else {
    doc.rows([
      ["Tenant name", v(data, "tenantName")],
      ["Tenancy start", v(data, "tenancyStart")],
      ["Tenancy end", v(data, "tenancyEnd")],
      ["Annual rent", aed(v(data, "tenancyRent"))],
    ]);
  }

  doc.heading("Property Financial Information", 12);
  doc.rows([
    ["Sell price", aed(v(data, "sellPrice"))],
    ["Outstanding service charge", aed(v(data, "serviceCharge") || "0")],
  ]);

  doc.heading("Commission and Duration", 12);
  doc.rows([
    ["Contract start date", v(data, "contractStart")],
    ["Contract end date", v(data, "contractEnd")],
    ["Commission will be paid", yesNo(v(data, "commissionPaid"))],
    ["Commission %", v(data, "commissionPercent")],
    ["NOC from developer", yesNo(v(data, "nocDeveloper"))],
    ["Seller covering marketing fees", yesNo(v(data, "sellerMarketingFees"))],
    ["Is exclusive", yesNo(v(data, "isExclusive"))],
  ]);

  if (v(data, "notes")) {
    doc.heading("Notes", 12);
    doc.text(v(data, "notes"), { size: 10 });
  }

  doc.heading("Terms and Conditions", 12);
  for (const item of FORM_A_TERMS_EN) {
    doc.text(`${item.title} ${item.text}`, { size: 9.5, gap: item.bullets ? 2 : 6 });
    for (const bullet of item.bullets || []) {
      doc.text(`- ${bullet}`, { size: 9, indent: 14, gap: 1 });
    }
    if (item.bullets) doc.moveDown(6);
  }
  doc.moveDown(8);
  doc.text(FORM_A_ELECTRONIC_EN, { size: 9, bold: true });
  doc.text(
    v(data, "acceptedTerms") === "1"
      ? `Accepted by ${owner}. Submitted ${v(data, "submittedAt") || "on the desk"}.`
      : "Terms have not been accepted yet.",
    { size: 9 }
  );
  doc.text("A7 Group desk copy of Dubai Brokers Form A. Official registration remains on trakheesi.dubailand.gov.ae.", {
    size: 8,
    color: [0.4, 0.4, 0.4],
  });
  return doc.render();
}
