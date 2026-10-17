export const BOOKING_OFFICES = {
  a7: {
    id: "a7",
    company: "A7 GROUP REAL ESTATE L.L.C",
    shop: "Shop 20",
    building: "Building V03 Russia Cluster",
    area: "International City",
    emirate: "Dubai",
    contact: "52 553 1548",
    email: "receptiona7gp@gmail.com",
    stamp: "a7",
  },
  aar: {
    id: "aar",
    company: "ANWAR AL RIYADH PROPERTIES L.L.C",
    shop: "Shop 11",
    building: "Building V03 Russia Cluster",
    area: "International City",
    emirate: "Dubai",
    contact: "04 570 6504",
    email: "",
    stamp: "aar",
  },
};

export const BOOKING_OFFICE_OPTIONS = [
  { id: "a7", label: BOOKING_OFFICES.a7.company },
  { id: "aar", label: BOOKING_OFFICES.aar.company },
];

export const THROUGH_OPTIONS = ["Cash", "Cheque", "Bank Transfer", "Credit Card"];
export const PURPOSE_OPTIONS = ["Advance Booking", "Token", "Rent", "Security Deposit", "Commission"];

export const BOOKING_FORM_KEYS = [
  "listingId",
  "listingRef",
  "office",
  "stamp",
  "company",
  "shop",
  "building",
  "area",
  "emirate",
  "contact",
  "email",
  "voucherNo",
  "date",
  "accountName",
  "unitNo",
  "buildingName",
  "community",
  "propertyLine",
  "advanceBooking",
  "rent",
  "securityDeposit",
  "commission",
  "amount",
  "through",
  "chequeNo",
  "purpose",
  "onAccountOf",
  "amountWords",
  "signatory",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Receipt numbers print as 0001, 0002, and so on. */
export function formatVoucherNo(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return raw;
  return raw.padStart(4, "0");
}

export function officeById(id) {
  const key = String(id || "").trim().toLowerCase();
  if (key === "aar" || key === "anwar") return BOOKING_OFFICES.aar;
  if (key === "a7") return BOOKING_OFFICES.a7;
  return BOOKING_OFFICES[key] || null;
}

export function emptyBookingForm() {
  const data = {};
  for (const key of BOOKING_FORM_KEYS) data[key] = "";
  data.emirate = "Dubai";
  data.id = "";
  return data;
}

export function applyOffice(current, officeId) {
  const office = officeById(officeId);
  const next = { ...current, office: office ? office.id : String(officeId || "").trim() };
  if (!office) return next;
  next.company = office.company;
  next.shop = office.shop;
  next.building = office.building;
  next.area = office.area;
  next.emirate = office.emirate;
  next.contact = office.contact;
  next.email = office.email;
  next.stamp = office.stamp;
  return next;
}

export function parseAmount(value) {
  const raw = String(value || "").replace(/,/g, "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function money(value) {
  const n = parseAmount(value);
  if (n === null) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function chunk99(n) {
  if (n < 20) return ONES[n];
  const ten = TENS[Math.floor(n / 10)];
  const one = ONES[n % 10];
  return one ? `${ten} ${one}` : ten;
}

function chunk999(n) {
  if (n < 100) return chunk99(n);
  const hundred = ONES[Math.floor(n / 100)];
  const rest = n % 100;
  return rest ? `${hundred} Hundred ${chunk99(rest)}` : `${hundred} Hundred`;
}

export function numberToWords(value) {
  const n = Math.floor(Math.abs(Number(value) || 0));
  if (!n) return "Zero";
  if (n > 999999999) return String(n);
  const million = Math.floor(n / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts = [];
  if (million) parts.push(`${chunk999(million)} Million`);
  if (thousand) parts.push(`${chunk999(thousand)} Thousand`);
  if (rest) parts.push(chunk999(rest));
  return parts.join(" ");
}

export function aedInWords(value) {
  const n = parseAmount(value);
  if (n === null) return "";
  const dirhams = Math.floor(n);
  const fils = Math.round((n - dirhams) * 100);
  const words = `UAE Dirham ${numberToWords(dirhams)}`;
  if (fils) return `${words} and ${pad2(fils)}/100 Only`;
  return `${words} Only`;
}

function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const named = /^(\d{1,2})[-\s]+([A-Za-z]{3})[-\s]+(\d{2,4})$/.exec(raw);
  if (named) {
    const month = MONTHS.findIndex((m) => m.toLowerCase() === named[2].toLowerCase());
    if (month >= 0) {
      const year = named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3]);
      return new Date(year, month, Number(named[1]));
    }
  }
  const dmy = /^(\d{1,2})[\/\-\s]+(\d{1,2})[\/\-\s]+(\d{4})$/.exec(raw);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  return null;
}

export function formatVoucherDate(value) {
  const dated = parseDate(value);
  if (!dated || Number.isNaN(dated.getTime())) return String(value || "").trim();
  const yy = String(dated.getFullYear()).slice(-2);
  return `${dated.getDate()}-${MONTHS[dated.getMonth()]}-${yy}`;
}

export function isoVoucherDate(value) {
  const dated = parseDate(value);
  if (!dated || Number.isNaN(dated.getTime())) return "";
  return `${dated.getFullYear()}-${pad2(dated.getMonth() + 1)}-${pad2(dated.getDate())}`;
}

export function todayVoucherDate() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
  return formatVoucherDate(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`);
}

export function normalizeForm(input) {
  const data = emptyBookingForm();
  for (const key of BOOKING_FORM_KEYS) data[key] = String(input?.[key] ?? "").trim();
  const office = officeById(data.office) || (data.company.toLowerCase().includes("anwar") ? BOOKING_OFFICES.aar : data.company ? BOOKING_OFFICES.a7 : null);
  if (office && !data.office) data.office = office.id;
  if (data.stamp !== "a7" && data.stamp !== "aar") data.stamp = office?.stamp || "";
  if (office) {
    if (!data.company) data.company = office.company;
    if (!data.shop) data.shop = office.shop;
    if (!data.building) data.building = office.building;
    if (!data.area) data.area = office.area;
    if (!data.emirate) data.emirate = office.emirate;
    if (!data.contact) data.contact = office.contact;
    if (!data.email && office.email) data.email = office.email;
  }
  data.date = formatVoucherDate(data.date) || todayVoucherDate();
  data.voucherNo = formatVoucherNo(data.voucherNo);
  if (!data.amountWords && data.amount) data.amountWords = aedInWords(data.amount);
  if (data.purpose && data.onAccountOf && !data.onAccountOf.toLowerCase().includes(data.purpose.toLowerCase())) {
    /* keep both as entered */
  }
  return data;
}

export function missingDetails(data) {
  if (!data.office && !data.company) return "Select the office (A7 or Anwar Al Riyadh).";
  if (!data.stamp) return "Select the stamp that should print on the voucher.";
  if (!data.accountName) return "Add the account / client name.";
  if (!data.amount) return "Add the received amount.";
  if (!data.through) return "Select how the amount was received (Cash, Cheque, Bank Transfer, or Credit Card).";
  return "";
}

export function joinPropertyLine(data) {
  return [data.unitNo, data.buildingName, data.community]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

export function formFromListing(listing) {
  if (!listing) return emptyBookingForm();
  const unitNo = String(listing.unit_no || "").trim();
  const buildingName = String(listing.building || listing.project_name || listing.bayut_building || "").trim();
  const community = String(listing.community || listing.sub_community || listing.bayut_community || "").trim();
  const rent = listing.price_yearly || listing.price_aed || listing.sale_price || "";
  return normalizeForm({
    ...emptyBookingForm(),
    listingId: listing.id || "",
    listingRef: listing.reference || "",
    date: todayVoucherDate(),
    unitNo,
    buildingName,
    community,
    propertyLine: [unitNo, buildingName, community].filter(Boolean).join(", "),
    rent: rent ? String(rent) : "",
  });
}

export function pdfFilename(data) {
  const bits = ["Booking-Form"];
  for (const key of ["voucherNo", "accountName", "listingRef"]) {
    const part = String(data[key] || "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (part) bits.push(part);
  }
  return `${bits.join("-")}.pdf`;
}

export function officeBrand(data) {
  const office = String(data?.office || "").trim().toLowerCase();
  if (office === "aar") return "aar";
  if (office === "a7") return "a7";
  return String(data?.stamp || "").trim().toLowerCase() === "aar" ? "aar" : "a7";
}

export function stampBrand(data) {
  const stamp = String(data?.stamp || "").trim().toLowerCase();
  if (stamp === "aar" || stamp === "a7") return stamp;
  return officeBrand(data);
}

export function particularLines(data) {
  const lines = [];
  if (data.accountName) {
    lines.push("Account :");
    lines.push(data.accountName);
  }
  if (data.propertyLine) lines.push(data.propertyLine);
  if (data.advanceBooking) lines.push(`Advance Booking - ${data.advanceBooking} AED`);
  if (data.rent) lines.push(`Rent - ${data.rent} AED`);
  if (data.securityDeposit) lines.push(`Security Deposit : ${data.securityDeposit}`);
  if (data.commission) lines.push(`Commission ${data.commission}`);
  return lines;
}

export function throughLine(data) {
  const through = String(data.through || "").trim();
  if (!through) return "";
  if (through === "Cheque" && data.chequeNo) return `Cheque  No. ${data.chequeNo}`;
  return through;
}

export function onAccountLine(data) {
  const purpose = String(data.purpose || "").trim();
  const note = String(data.onAccountOf || "").trim();
  if (purpose && note && note.toLowerCase() !== purpose.toLowerCase()) return `${note}`;
  return note || purpose;
}
