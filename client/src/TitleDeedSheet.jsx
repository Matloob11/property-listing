import { fillArabicFromEnglish } from "../../server/deedArabic.js";

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

function dash(value) {
  return value || "\u00a0";
}

function Row({ en, value, arValue, ar }) {
  return (
    <div className="deed-row">
      <span className="deed-en">{en}:</span>
      <span className="deed-mid">
        <b className="deed-val">{dash(value)}</b>
        {arValue ? <b className="deed-val-ar">{arValue}</b> : null}
      </span>
      <span className="deed-ar">{ar}:</span>
    </div>
  );
}

function ExpoMark() {
  const rays = [];
  for (let i = 0; i < 24; i += 1) {
    rays.push(
      <line
        key={i}
        x1="40"
        y1="8"
        x2="40"
        y2="18"
        stroke="#c4a36a"
        strokeWidth={i % 2 ? 0.55 : 0.9}
        transform={`rotate(${i * 15} 40 40)`}
      />
    );
  }
  return (
    <div className="deed-expo">
      <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden="true">
        <circle cx="40" cy="40" r="38.5" fill="none" stroke="#c4a36a" strokeWidth="0.7" />
        <circle cx="40" cy="40" r="32" fill="none" stroke="#d4b57a" strokeWidth="0.45" />
        <circle cx="40" cy="40" r="26" fill="none" stroke="#c4a36a" strokeWidth="0.45" />
        <circle cx="40" cy="40" r="7.2" fill="none" stroke="#b8954a" strokeWidth="1.1" />
        {rays}
      </svg>
      <div className="deed-expo-text">
        <span>EXPO 2020 إكسبو ٢٠٢٠</span>
        <small>DUBAI UNITED ARAB EMIRATES</small>
      </div>
    </div>
  );
}

export function TitleDeedSheet({ data }) {
  const ar = fillArabicFromEnglish(data || {});
  const issue = v(ar, "issueDate");
  const amount = v(ar, "amount");
  const words = v(ar, "amountWords");
  const wordsAr = v(ar, "amountWordsAr");
  const seller = v(ar, "purchasedFrom");
  const sellerAr = v(ar, "purchasedFromAr");
  const regNo = v(ar, "landRegistrationNo");
  const regDate = v(ar, "registrationDate") || issue;
  const ownerId = v(ar, "ownerId");
  const owner = v(ar, "ownerName");
  const ownerAr = v(ar, "ownerNameAr");
  const owner2Id = v(ar, "owner2Id");
  const owner2 = v(ar, "owner2Name");
  const owner2Ar = v(ar, "owner2NameAr");
  const area = v(ar, "ownerAreaSqm") || v(ar, "areaSqMeter");
  const area2 = v(ar, "owner2AreaSqm");
  const docNo = v(ar, "documentNo");

  const buyEn = [
    "Purchased from",
    seller || "",
    "by the Land Registration No.:",
    regNo || "",
    "Date",
    regDate || "",
    "for the amount",
    amount ? `${amount} Dirham,` : "",
    words || "",
  ]
    .filter(Boolean)
    .join(" ");

  const buyAr = [
    "تم الشراء من",
    sellerAr || seller || "",
    "بموجب رقم",
    regNo || "",
    "بتاريخ",
    regDate || "",
    "بمبلغ",
    amount ? `${amount} درهم،` : "",
    wordsAr || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className="deed-sheet" id="title-deed-sheet">
      <header className="deed-head">
        <h1 className="deed-title-ar">شهادة ملكية عقار</h1>
        <h2 className="deed-title-en">Title Deed</h2>
      </header>

      <div className="deed-fields">
        <Row en="Issue Date" value={issue} ar="تاريخ الإصدار" />
        <Row en="Mortgage Status" value={v(ar, "mortgageStatus")} arValue={v(ar, "mortgageStatusAr")} ar="حالة الرهن" />
        <Row en="Property Type" value={v(ar, "propertyType")} arValue={v(ar, "propertyTypeAr")} ar="نوع العقار" />
        <Row en="Community" value={v(ar, "community")} arValue={v(ar, "communityAr")} ar="المنطقة" />
        <Row en="Plot No" value={v(ar, "plotNo")} ar="رقم الأرض" />
        <Row en="Building No" value={v(ar, "buildingNo")} ar="رقم المبنى" />
        <Row en="Building Name" value={v(ar, "buildingName")} ar="اسم المبنى" />
        <Row en="Property No" value={v(ar, "propertyNo")} ar="رقم العقار" />
        <Row en="Floor No" value={v(ar, "floorNo")} ar="رقم الطابق" />
        <Row en="Parkings" value={v(ar, "parkings")} ar="المواقف" />
        <Row en="Suite Area" value={v(ar, "suiteArea")} ar="المساحة الداخلية" />
        <Row en="Balcony Area" value={v(ar, "balconyArea")} ar="مساحة البلكونة" />
        <Row en="Area sq Meter" value={v(ar, "areaSqMeter")} ar="المساحة الكلية متر مربع" />
        <Row en="Area sq Feet" value={v(ar, "areaSqFeet")} ar="المساحة الكلية بالقدم المربع" />
      </div>

      <div className="deed-owners">
        <div className="deed-owners-head">
          <span>Owners numbers and their shares:</span>
          <span>
            Area (sq Meter) <em>المساحة بالمتر المربع</em>
          </span>
          <span className="deed-ar">أرقام و أسماء الملاك وحصصهم</span>
        </div>
        <div className="deed-owner">
          <span>
            {ownerId ? `(${ownerId})` : ""} {owner}
          </span>
          <span>{area}</span>
          <span className="deed-ar">
            {ownerAr} {ownerId ? `(${ownerId})` : ""}
          </span>
        </div>
        {owner2 || owner2Id ? (
          <div className="deed-owner">
            <span>
              {owner2Id ? `(${owner2Id})` : ""} {owner2}
            </span>
            <span>{area2}</span>
            <span className="deed-ar">
              {owner2Ar} {owner2Id ? `(${owner2Id})` : ""}
            </span>
          </div>
        ) : null}
      </div>

      <div className="deed-buy">
        <div>
          <p>{buyEn}</p>
          <p>This property and its ownership is subject to the terms of the mentioned area and the benefits and instructions related thereto which are issued or amended from time to time.</p>
        </div>
        <div className="deed-ar">
          <p>{buyAr}</p>
          <p>يخضع هذا العقار وملكيته لأحكام المنطقة المذكورة أعلاه والفوائد والتعليمات المتعلقة بذلك والتي يتم إصدارها أو تعديلها من وقت لآخر.</p>
        </div>
      </div>

      <div className="deed-marks">
        <ExpoMark />
        <div className="deed-sign">
          <div className="deed-sign-copy">
            <span>Approved Signature</span>
            <span className="deed-ar">توقيع معتمد</span>
          </div>
          <div className="deed-qr" aria-hidden="true" />
          {docNo ? <small className="deed-docno">{docNo}</small> : <small className="deed-docno">&nbsp;</small>}
        </div>
      </div>

      <div className="deed-dld">
        <strong>DUBAI LAND DEPARTMENT</strong>
        <span className="deed-ar">دائرة الأراضي والأملاك</span>
      </div>

      <div className="deed-notes">
        <ul>
          <li>Digital data of this certificate is securely stored on blockchain</li>
          <li>Certificate is electronically issued and no signature or stamp is required</li>
          <li>Any change in the certificate makes it void</li>
          <li>It is prohibited to fold this certificate for any other party</li>
        </ul>
        <div className="deed-page">1 / 2</div>
        <ul className="deed-ar">
          <li>يتم تخزين بيانات هذه الشهادة رقمياً على البلوك تشين</li>
          <li>هذه الشهادة صادرة إلكترونياً ولا يتطلب الأمر توقيع أو ختم</li>
          <li>أي تغيير في الشهادة يجعلها لاغية</li>
          <li>يمنع طي هذه الشهادة أو تسليمها لأي طرف آخر</li>
        </ul>
      </div>
    </article>
  );
}

export function printTitleDeed() {
  const sheet = document.getElementById("title-deed-sheet");
  if (!sheet) return;
  const font =
    "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@500;700&family=Noto+Sans:wght@400;600;700&display=swap";
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>Title Deed</title>
<link rel="stylesheet" href="${font}" />
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; background: #fff; }
  ${DEED_PRINT_CSS}
</style></head><body>${sheet.outerHTML}
<script>window.onload=function(){window.focus();window.print();}<\\/script>
</body></html>`);
  w.document.close();
}

export const DEED_PRINT_CSS = `
.deed-sheet { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 28mm 16mm 10mm; color: #111; background: #fff; font-family: Arial, "Noto Sans", Helvetica, sans-serif; }
.deed-head { text-align: center; margin: 0 0 22mm; }
.deed-title-ar { margin: 0; font-family: "Noto Naskh Arabic", serif; font-size: 21pt; font-weight: 700; }
.deed-title-en { margin: 2mm 0 0; font-size: 20pt; font-weight: 700; }
.deed-row { display: grid; grid-template-columns: 34mm 1fr 42mm; align-items: baseline; min-height: 5.1mm; font-size: 10pt; }
.deed-en { text-align: left; }
.deed-mid { display: flex; justify-content: center; align-items: baseline; gap: 10mm; }
.deed-val, .deed-val-ar { font-weight: 700; }
.deed-val-ar, .deed-ar { font-family: "Noto Naskh Arabic", serif; }
.deed-ar { text-align: right; direction: rtl; }
.deed-owners { border-top: 0.6pt solid #111; margin-top: 3.5mm; padding-top: 2mm; }
.deed-owners-head, .deed-owner { display: grid; grid-template-columns: 1.35fr 1fr 1.35fr; font-size: 9.5pt; padding: 0.6mm 0; }
.deed-owner { font-weight: 700; font-size: 10.5pt; }
.deed-owners-head em { font-style: normal; font-family: "Noto Naskh Arabic", serif; margin-left: 4px; }
.deed-buy { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin: 5mm 0 6mm; font-size: 8.6pt; line-height: 1.45; }
.deed-buy p { margin: 0 0 2.2mm; }
.deed-marks { display: flex; justify-content: space-between; align-items: flex-end; margin: 2mm 0 1mm; }
.deed-expo { display: flex; flex-direction: column; align-items: flex-start; }
.deed-expo-text { margin-top: 1mm; }
.deed-expo-text span { display: block; font-size: 8pt; letter-spacing: 0.04em; color: #7a6230; }
.deed-expo-text small { display: block; font-size: 6.2pt; letter-spacing: 0.05em; color: #8a7340; }
.deed-sign { display: grid; grid-template-columns: auto 18mm; column-gap: 3mm; justify-items: end; align-items: start; font-size: 10pt; }
.deed-sign-copy { text-align: right; padding-top: 1mm; }
.deed-sign-copy span { display: block; }
.deed-qr { width: 18mm; height: 18mm; border: 0.6pt solid #111; background:
  linear-gradient(#111 0 0) 1.2mm 1.2mm/5mm 5mm,
  linear-gradient(#111 0 0) 11.6mm 1.2mm/5mm 5mm,
  linear-gradient(#111 0 0) 1.2mm 11.6mm/5mm 5mm,
  repeating-linear-gradient(90deg,#111 0 1.1mm,#fff 1.1mm 2.2mm);
  background-repeat: no-repeat; }
.deed-docno { grid-column: 2; display: block; text-align: center; font-size: 8.5pt; margin-top: 1mm; }
.deed-dld { text-align: center; margin: 2mm 0 4mm; }
.deed-dld strong { display: block; font-size: 11pt; letter-spacing: 0.08em; }
.deed-dld .deed-ar { display: block; font-size: 11pt; }
.deed-notes { display: grid; grid-template-columns: 1fr 16mm 1fr; gap: 4mm; align-items: start; }
.deed-notes ul { margin: 0; padding: 0 0 0 3.2mm; font-size: 6.4pt; line-height: 1.35; color: #222; }
.deed-notes .deed-ar { padding: 0 3.2mm 0 0; }
.deed-page { font-size: 11pt; padding-top: 2mm; text-align: center; }
`;
