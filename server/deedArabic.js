export const TYPE_AR = {
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
  Building: "مبنى",
};

export const COMMUNITY_AR = {
  "Al Warsan First": "الورسان الأولى",
  "Al Warsan 1": "الورسان الأولى",
  "Al Warsan": "الورسان",
  "Business Bay": "الخليج التجاري",
  "Dubai Marina": "دبي مارينا",
  "Downtown Dubai": "وسط مدينة دبي",
  "Jumeirah Village Circle": "جميرا فيلدج سيركل",
  "Jumeirah Lake Towers": "أبراج بحيرات جميرا",
  "Palm Jumeirah": "نخلة جميرا",
  "Jumeirah Beach Residence": "جميرا بيتش ريزيدنس",
  "Dubai Hills": "دبي هيلز",
  "Arabian Ranches": "المرابع العربية",
  "Al Barsha": "البرشاء",
  "Al Quoz": "القوز",
  "Al Nahda": "النهدة",
  "Deira": "ديرة",
  "Bur Dubai": "بر دبي",
  "International City": "المدينة العالمية",
  "Sports City": "مدينة دبي الرياضية",
  "Motor City": "موتور سيتي",
  "Silicon Oasis": "واحة السيليكون",
  "Dubai South": "دبي الجنوب",
  "Jumeirah": "جميرا",
  "Mirdif": "مردف",
  "Al Furjan": "الفرجان",
  "Discovery Gardens": "حدائق ديسكفري",
};

const NAME_TOKENS = {
  mohammad: "محمد",
  mohammed: "محمد",
  muhammad: "محمد",
  mohamed: "محمد",
  muhamad: "محمد",
  ahmad: "أحمد",
  ahmed: "أحمد",
  ali: "علي",
  hassan: "حسن",
  hasan: "حسن",
  hussain: "حسين",
  hussein: "حسين",
  omar: "عمر",
  umar: "عمر",
  khalid: "خالد",
  khaled: "خالد",
  saeed: "سعيد",
  said: "سعيد",
  salim: "سليم",
  saleem: "سليم",
  salem: "سالم",
  sulaiman: "سليمان",
  suleiman: "سليمان",
  sulayman: "سليمان",
  saud: "سعود",
  faisal: "فيصل",
  abdullah: "عبد الله",
  abdul: "عبد",
  rahman: "الرحمن",
  raheem: "الرحيم",
  rahim: "الرحيم",
  karim: "الكريم",
  kareem: "الكريم",
  malik: "مالك",
  khan: "خان",
  khanan: "خانان",
  rafei: "رافي",
  rafeei: "رافي",
  rafi: "رافي",
  dabbab: "الضباب",
  aldabbab: "الضباب",
  alhumoudi: "الحمودي",
  alhumudi: "الحمودي",
  hamoudi: "الحمودي",
  humoudi: "الحمودي",
  bin: "بن",
  bint: "بنت",
  ibn: "ابن",
  first: "الأولى",
  second: "الثانية",
  third: "الثالثة",
  warsan: "الورسان",
};

function prettyType(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function mortgageArabic(status) {
  return /not/i.test(String(status || "")) ? "غير مرهونة" : String(status || "").trim() ? "مرهونة" : "";
}

export function typeArabic(type) {
  const key = prettyType(type);
  if (TYPE_AR[key]) return TYPE_AR[key];
  const hit = Object.keys(TYPE_AR).find((item) => item.toLowerCase() === String(type || "").toLowerCase());
  return hit ? TYPE_AR[hit] : "";
}

export function communityArabic(name) {
  const key = String(name || "").replace(/\s+/g, " ").trim();
  if (!key) return "";
  if (COMMUNITY_AR[key]) return COMMUNITY_AR[key];
  const hit = Object.keys(COMMUNITY_AR).find((item) => item.toLowerCase() === key.toLowerCase());
  if (hit) return COMMUNITY_AR[hit];
  return nameToArabic(key);
}

function phoneticAr(word) {
  let rest = String(word || "").toLowerCase().replace(/[^a-z']/g, "");
  if (!rest) return "";
  if (rest.startsWith("al") && rest.length > 3) {
    const inner = phoneticAr(rest.slice(2));
    return inner ? `ال${inner}` : "";
  }
  let out = "";
  const rules = [
    ["kh", "خ"],
    ["gh", "غ"],
    ["sh", "ش"],
    ["th", "ث"],
    ["dh", "ذ"],
    ["aa", "ا"],
    ["ee", "ي"],
    ["oo", "و"],
    ["ou", "و"],
    ["ai", "ي"],
    ["ay", "ي"],
    ["qu", "ق"],
    ["ph", "ف"],
  ];
  const single = {
    a: "ا",
    b: "ب",
    c: "ك",
    d: "د",
    e: "ي",
    f: "ف",
    g: "ج",
    h: "ه",
    i: "ي",
    j: "ج",
    k: "ك",
    l: "ل",
    m: "م",
    n: "ن",
    o: "و",
    p: "ب",
    q: "ق",
    r: "ر",
    s: "س",
    t: "ت",
    u: "و",
    v: "ف",
    w: "و",
    x: "كس",
    y: "ي",
    z: "ز",
  };
  while (rest) {
    const pair = rules.find(([from]) => rest.startsWith(from));
    if (pair) {
      out += pair[1];
      rest = rest.slice(pair[0].length);
      continue;
    }
    out += single[rest[0]] || "";
    rest = rest.slice(1);
  }
  return out;
}

export function nameToArabic(english) {
  const raw = String(english || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (/[\u0600-\u06FF]/.test(raw)) return raw;
  const bits = raw.split(/[\s-]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < bits.length; i += 1) {
    const token = bits[i].replace(/[^A-Za-z']/g, "");
    const lower = token.toLowerCase();
    if (!lower) continue;
    if (lower === "al" && bits[i + 1]) {
      const next = bits[i + 1].replace(/[^A-Za-z']/g, "").toLowerCase();
      const mapped = NAME_TOKENS[`al${next}`] || NAME_TOKENS[next] || phoneticAr(next);
      out.push(mapped.startsWith("ال") ? mapped : `ال${mapped}`);
      i += 1;
      continue;
    }
    out.push(NAME_TOKENS[lower] || phoneticAr(lower));
  }
  return out.filter(Boolean).join(" ");
}

function moneyNumber(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function to99Ar(n) {
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
  const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${ones[o]} و${tens[t]}` : tens[t];
}

function to999Ar(n) {
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (!h) return to99Ar(rest);
  if (!rest) return hundreds[h];
  return `${hundreds[h]} و${to99Ar(rest)}`;
}

export function amountInWordsAr(raw) {
  const n = Math.round(moneyNumber(raw));
  if (n <= 0) return "";
  const parts = [];
  let left = n;
  const million = Math.floor(left / 1000000);
  left %= 1000000;
  const thousand = Math.floor(left / 1000);
  left %= 1000;
  if (million === 1) parts.push("مليون");
  else if (million === 2) parts.push("مليونان");
  else if (million) parts.push(`${to999Ar(million)} مليون`);
  if (thousand === 1) parts.push("ألف");
  else if (thousand === 2) parts.push("ألفان");
  else if (thousand) parts.push(`${to999Ar(thousand)} ألف`);
  if (left) parts.push(to999Ar(left));
  return `${parts.join(" و")} درهم إماراتي فقط`;
}

export function fillArabicFromEnglish(data) {
  const next = { ...data };
  next.mortgageStatusAr = mortgageArabic(next.mortgageStatus);
  next.propertyTypeAr = typeArabic(next.propertyType);
  next.communityAr = communityArabic(next.community);
  next.ownerNameAr = nameToArabic(next.ownerName);
  next.owner2NameAr = nameToArabic(next.owner2Name);
  next.purchasedFromAr = nameToArabic(next.purchasedFrom);
  next.amountWordsAr = amountInWordsAr(next.amount);
  return next;
}
