export const FORM_A_KEYS = [
  "listingId",
  "listingRef",
  "ownerKind",
  "certificateNumber",
  "certificateYear",
  "propertyType",
  "ownerVerification",
  "ownerVerificationValue",
  "isFreehold",
  "sizeSqm",
  "plotNumber",
  "projectName",
  "location",
  "usage",
  "beds",
  "baths",
  "kitchens",
  "units",
  "carParks",
  "floorNo",
  "floors",
  "shops",
  "facilities",
  "additionalInfo",
  "greenList",
  "ownerNameEn",
  "ownerNameAr",
  "ownerMobile",
  "ownerEmail",
  "ownerNationality",
  "ownerPassport",
  "companyNameEn",
  "companyNameAr",
  "companyLicense",
  "authorizedPerson",
  "sellingArea",
  "owningShare",
  "representAs",
  "poaConfirm",
  "noTenancy",
  "tenantName",
  "tenancyStart",
  "tenancyEnd",
  "tenancyRent",
  "sellPrice",
  "serviceCharge",
  "contractStart",
  "contractEnd",
  "commissionPaid",
  "nocDeveloper",
  "sellerMarketingFees",
  "isExclusive",
  "commissionPercent",
  "notes",
  "acceptedTerms",
  "submittedAt",
];

export const PROPERTY_TYPES = [
  "Apartment",
  "Villa",
  "Townhouse",
  "Penthouse",
  "Land",
  "Office",
  "Shop",
  "Retail",
  "Warehouse",
  "Hotel Apartment",
  "Building",
  "Whole Building",
  "Labour Camp",
  "Farm",
  "Duplex",
  "Showroom",
];

export const USAGE_TYPES = ["Residential", "Commercial", "Mixed", "Industrial"];
export const VERIFICATION_TYPES = ["Date of Birth", "Emirates ID Number", "Passport Number"];
export const IDENTITY_VERIFICATION_TYPES = VERIFICATION_TYPES;

export const FORM_A_TERMS_EN = [
  {
    title: "1.",
    text: "This agreement is the authorization of the owner of the property to the real estate brokerage office to carry out the marketing of the property and find a buyer for the property.",
  },
  {
    title: "2.",
    text: "Based on this agreement, the owner acknowledges the validity of the provided data and that there are no contradictions or restrictions on the property that prevent the completion of the sale process later.",
  },
  {
    title: "3.",
    text: "The owner has the right to cancel this agreement at any time by following the below mentioned steps:",
    bullets: ["Access to Dubai Brokers application", "Search for the agreement", "Cancel agreement"],
  },
  {
    title: "4.",
    text: "In case the broker wants to cancel the agreement, he should inform and take the approval of all agreement parties, based on the following steps:",
    bullets: [
      "Broker will login to Dubai Brokers application",
      "Choose the desired agreement to be cancelled",
      "Request for cancellation",
      "In case a confirmation is received from all owners, the agreement will be cancelled",
    ],
  },
  {
    title: "5.",
    text: "In case of (exclusive) contract type, the owner cannot enter into a contract with another broker during the validity agreement period.",
  },
  {
    title: "6.",
    text: "The broker agrees that he/she will not be funded for any marketing expenses.",
  },
  {
    title: "7.",
    text: "Both Parties acknowledge they have not acted or relied upon any representations except those contained in this Agreement and this Agreement constitutes the entire agreement between the parties hereto. No oral statements nor any other agreement can override what is in this Agreement. This Agreement shall enure to the benefit of and be binding upon the parties hereto and their heirs.",
  },
];

export const FORM_A_TERMS_AR = [
  {
    title: "1.",
    text: "يعد هذا الاتفاق تفويضاً من مالك العقار لمكتب الوساطة العقارية للقيام بتسويق العقار وإيجاد مشترٍ له.",
  },
  {
    title: "2.",
    text: "بناءً على هذا الاتفاق، يقر المالك بصحة البيانات المقدمة وبأنه لا توجد أي تناقضات أو قيود على العقار تمنع إتمام عملية البيع لاحقاً.",
  },
  {
    title: "3.",
    text: "يحق للمالك إلغاء هذا الاتفاق في أي وقت باتباع الخطوات التالية:",
    bullets: ["الدخول إلى تطبيق دبي للوسطاء", "البحث عن الاتفاق", "إلغاء الاتفاق"],
  },
  {
    title: "4.",
    text: "في حال رغبة الوسيط في إلغاء الاتفاق، يتوجب عليه إبلاغ جميع أطراف الاتفاق والحصول على موافقتهم، وفق الخطوات التالية:",
    bullets: [
      "يسجل الوسيط الدخول إلى تطبيق دبي للوسطاء",
      "يختار الاتفاق المراد إلغاؤه",
      "يقدم طلب الإلغاء",
      "في حال ورود تأكيد من جميع الملاك، يتم إلغاء الاتفاق",
    ],
  },
  {
    title: "5.",
    text: "في حال كان نوع العقد (حصرياً)، لا يحق للمالك التعاقد مع وسيط آخر خلال مدة سريان الاتفاق.",
  },
  {
    title: "6.",
    text: "يوافق الوسيط على أنه لن يتم تمويل أي مصاريف تسويقية.",
  },
  {
    title: "7.",
    text: "يقر الطرفان بأنهما لم يعتمدا على أي إقرارات سوى ما ورد في هذا الاتفاق، ويشكل هذا الاتفاق كامل التفاهم بينهما. ولا يجوز لأي تصريح شفهي أو اتفاق آخر أن يتجاوز ما ورد فيه. ويسري هذا الاتفاق لمصلحة الطرفين وورثتهما ويلزمهم.",
  },
];

export const FORM_A_ELECTRONIC_EN =
  "This is an approved electronic contract between the respective parties that is documented in RERA's system and does not require the parties' signatures.";
export const FORM_A_ELECTRONIC_AR =
  "هذا عقد إلكتروني معتمد بين الأطراف المعنية موثق في نظام مؤسسة التنظيم العقاري ولا يتطلب توقيع الأطراف.";

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatFormADate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = /^(\d{1,2})[\/\-\s]+(\d{1,2})[\/\-\s]+(\d{4})$/.exec(raw);
  if (dmy) return `${pad2(dmy[1])}/${pad2(dmy[2])}/${dmy[3]}`;
  return raw;
}

export function todayFormADate() {
  return formatFormADate(new Date().toISOString().slice(0, 10));
}

export function isoFormADate(value) {
  const raw = formatFormADate(value);
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : "";
}

export function addMonthsFormA(value, months) {
  const raw = formatFormADate(value) || todayFormADate();
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const date = parts ? new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1])) : new Date();
  date.setMonth(date.getMonth() + Number(months || 0));
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function yesNo(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "yes" || raw === "1" || raw === "true") return "Yes";
  if (raw === "no" || raw === "0" || raw === "false") return "No";
  return raw ? String(value) : "";
}

export function moneyAed(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 2, maximumFractionDigits: 2 });
}

export function ownerDisplayName(data) {
  if (data?.ownerKind === "company") {
    return String(data.companyNameEn || data.authorizedPerson || "").trim();
  }
  return String(data?.ownerNameEn || "").trim();
}

function prettyType(value) {
  const raw = String(value || "").replace(/_/g, " ").trim();
  if (!raw) return "";
  const hit = PROPERTY_TYPES.find((item) => item.toLowerCase() === raw.toLowerCase());
  return hit || raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sqmFromListing(listing) {
  const sqft = Number(listing?.area_sqft || 0);
  if (sqft > 0) return (sqft / 10.76391041671).toFixed(2);
  return "";
}

export function certificateYears() {
  const now = new Date().getFullYear();
  const years = [];
  for (let year = now; year >= 2000; year -= 1) years.push(String(year));
  return years;
}

export function emptyFormA() {
  return {
    listingId: "",
    listingRef: "",
    ownerKind: "",
    certificateNumber: "",
    certificateYear: "",
    propertyType: "",
    ownerVerification: "",
    ownerVerificationValue: "",
    isFreehold: "yes",
    sizeSqm: "",
    plotNumber: "",
    projectName: "",
    location: "",
    usage: "Residential",
    beds: "",
    baths: "",
    kitchens: "",
    units: "",
    carParks: "",
    floorNo: "",
    floors: "",
    shops: "",
    facilities: "",
    additionalInfo: "",
    greenList: "no",
    ownerNameEn: "",
    ownerNameAr: "",
    ownerMobile: "",
    ownerEmail: "",
    ownerNationality: "",
    ownerPassport: "",
    companyNameEn: "",
    companyNameAr: "",
    companyLicense: "",
    authorizedPerson: "",
    sellingArea: "",
    owningShare: "100",
    representAs: "owner",
    poaConfirm: "",
    noTenancy: "",
    tenantName: "",
    tenancyStart: "",
    tenancyEnd: "",
    tenancyRent: "",
    sellPrice: "",
    serviceCharge: "0.00",
    contractStart: todayFormADate(),
    contractEnd: addMonthsFormA(todayFormADate(), 2),
    commissionPaid: "no",
    nocDeveloper: "no",
    sellerMarketingFees: "no",
    isExclusive: "no",
    commissionPercent: "",
    notes: "",
    acceptedTerms: "",
    submittedAt: "",
  };
}

export function normalizeForm(input) {
  const data = emptyFormA();
  for (const key of FORM_A_KEYS) {
    if (input?.[key] != null) data[key] = String(input[key]).trim();
  }
  data.ownerKind = data.ownerKind === "company" ? "company" : data.ownerKind === "person" ? "person" : "";
  data.contractStart = formatFormADate(data.contractStart) || todayFormADate();
  data.contractEnd = formatFormADate(data.contractEnd) || addMonthsFormA(data.contractStart, 2);
  data.tenancyStart = formatFormADate(data.tenancyStart);
  data.tenancyEnd = formatFormADate(data.tenancyEnd);
  if (!data.owningShare) data.owningShare = "100";
  if (!data.serviceCharge) data.serviceCharge = "0.00";
  if (!VERIFICATION_TYPES.includes(data.ownerVerification)) data.ownerVerification = "";
  return data;
}

export function stepMissing(step, data) {
  const form = normalizeForm(data);
  if (step === 0 && !form.ownerKind) return "Select owner company or owner person.";
  if (step === 1) {
    if (!form.certificateNumber) return "Certificate number is required.";
    if (!form.certificateYear) return "Certificate year is required.";
    if (!form.propertyType) return "Property type is required.";
    if (!form.ownerVerification) return "Owner verification type is required.";
    if (IDENTITY_VERIFICATION_TYPES.includes(form.ownerVerification) && !form.ownerVerificationValue) {
      return `${form.ownerVerification} is required.`;
    }
  }
  if (step === 2) {
    if (!form.location) return "Location is required.";
    if (!form.usage) return "Usage is required.";
    if (!form.sizeSqm) return "Size (sq.m) is required.";
  }
  if (step === 3) {
    if (form.ownerKind === "company" && !form.companyNameEn) return "Company name (English) is required.";
    if (form.ownerKind !== "company" && !form.ownerNameEn) return "Owner name (English) is required.";
    if (!form.greenList) return "Say whether the source of lead is through Green List.";
    if (!form.representAs) return "Select who will represent at the time of registration.";
  }
  if (step === 4) {
    if (form.noTenancy === "1") return "";
    if (!form.tenantName && !form.tenancyStart) {
      return "Confirm that no tenancy contract is attached, or add the tenancy details.";
    }
  }
  if (step === 5 && !form.sellPrice) return "Sell price is required.";
  if (step === 6) {
    if (!form.contractStart || !form.contractEnd) return "Contract start and end dates are required.";
    if (!form.commissionPaid || !form.nocDeveloper || !form.sellerMarketingFees || !form.isExclusive) {
      return "Answer every Yes / No question on commission and duration.";
    }
    if (form.commissionPaid === "yes" && !form.commissionPercent) return "Commission % is required.";
  }
  return "";
}

export function missingDetails(data, { submitting = false } = {}) {
  for (let step = 0; step <= 6; step += 1) {
    const miss = stepMissing(step, data);
    if (miss) return miss;
  }
  if (submitting && String(data?.acceptedTerms || "") !== "1") {
    return "Accept the terms and conditions to submit the contract.";
  }
  return "";
}

export function formFromListing(listing) {
  if (!listing) return emptyFormA();
  const size = sqmFromListing(listing);
  const deed = String(listing.title_deed || "").trim();
  const permit = String(listing.permit_number || "").trim();
  const yearHit = /(\d{4})/.exec(listing.permit_issue_date || deed || "");
  const price = listing.sale_price || listing.price_aed || "";
  return normalizeForm({
    ...emptyFormA(),
    listingId: listing.id || "",
    listingRef: listing.reference || "",
    certificateNumber: deed || permit,
    certificateYear: yearHit ? yearHit[1] : "",
    propertyType: prettyType(listing.type),
    isFreehold: "yes",
    sizeSqm: size,
    plotNumber:
      String(listing.plot_no || "").trim() ||
      (listing.plot_size && Number.isNaN(Number(listing.plot_size)) ? String(listing.plot_size) : "") ||
      String(listing.unit_no || "").trim(),
    projectName: listing.project_name || listing.building || listing.bayut_building || "",
    location: [listing.community || listing.bayut_community, listing.city || "Dubai"].filter(Boolean).join(", "),
    usage: listing.category === "commercial" ? "Commercial" : "Residential",
    beds: listing.beds != null && listing.beds !== "" ? String(listing.beds) : "",
    baths: listing.baths != null && listing.baths !== "" ? String(listing.baths) : "",
    carParks: listing.parking || "",
    sellingArea: size,
    ownerNameEn: listing.landlord_name || "",
    ownerMobile: listing.landlord_phone || "",
    ownerEmail: listing.landlord_email || "",
    sellPrice: price ? String(price) : "",
    serviceCharge: listing.service_charges || "0.00",
  });
}

export function pdfFilename(data) {
  const bits = ["Form-A"];
  for (const key of ["listingRef", "certificateNumber", "ownerNameEn", "companyNameEn", "projectName"]) {
    const part = String(data[key] || "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

