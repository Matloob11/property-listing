import a7Logo from "./assets/booking-form/a7-logo.png";
import aarLogo from "./assets/booking-form/aar-logo.png";
import a7Stamp from "./assets/booking-form/a7-stamp.png";
import aarStamp from "./assets/booking-form/aar-stamp.png";
import { formatVoucherNo, money, officeBrand, onAccountLine, particularLines, stampBrand, throughLine } from "../../server/bookingFormModel.js";

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

export function bookingStampSrc(stamp) {
  return stamp === "aar" ? aarStamp : a7Stamp;
}

export function bookingLogoSrc(office) {
  return office === "aar" ? aarLogo : a7Logo;
}

export function BookingReceiptSheet({ data }) {
  const office = officeBrand(data);
  const stamp = stampBrand(data);
  const lines = particularLines(data);
  const through = throughLine(data);
  const accountOf = onAccountLine(data);
  const amount = money(v(data, "amount"));
  const amountAfter = v(data, "accountName") ? 1 : 0;

  return (
    <article className="bfr-sheet" id="booking-receipt-sheet">
      <header className="bfr-head">
        <img className={`bfr-logo bfr-logo-${office}`} src={bookingLogoSrc(office)} alt="" />
        <div className="bfr-company">
          <p className="bfr-name">{v(data, "company")}</p>
          {v(data, "shop") ? <p>{v(data, "shop")}</p> : null}
          {v(data, "building") ? <p>{v(data, "building")}</p> : null}
          {v(data, "area") ? <p>{v(data, "area")}</p> : null}
          {v(data, "emirate") ? <p>Emirate : {v(data, "emirate")}</p> : null}
          {v(data, "contact") ? <p>Contact : {v(data, "contact")}</p> : null}
          {v(data, "email") ? <p>E-Mail : {v(data, "email")}</p> : null}
        </div>
      </header>

      <h1>Receipt Voucher</h1>

      <div className="bfr-meta">
        <span className="bfr-no">No. : {formatVoucherNo(v(data, "voucherNo"))}</span>
        <span>Date : {v(data, "date")}</span>
      </div>

      <table className="bfr-table">
        <thead>
          <tr>
            <th>Particulars</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bfr-body">
            <td>
              {lines.map((row) => (
                <p key={row}>{row}</p>
              ))}
              {through ? (
                <>
                  <p className="bfr-gap">Through :</p>
                  <p>{through}</p>
                </>
              ) : null}
              {accountOf ? (
                <>
                  <p className="bfr-gap">On Account of :</p>
                  <p>{accountOf}</p>
                </>
              ) : null}
              {v(data, "amountWords") ? (
                <>
                  <p className="bfr-gap">Amount (in words) :</p>
                  <p>{v(data, "amountWords")}</p>
                </>
              ) : null}
            </td>
            <td className={`bfr-amt${amountAfter ? " has-account" : ""}`}>
              <p className="bfr-amt-top">{amount}</p>
              <p className="bfr-amt-total">{amount}</p>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="bfr-sign">
        <div className="bfr-sign-row">
          <div className="bfr-auth">
            <p className="bfr-sign-label">Authorised Signatory</p>
            {v(data, "signatory") ? <p className="bfr-sign-name">{v(data, "signatory")}</p> : null}
            <span className="bfr-sign-line" aria-hidden="true" />
          </div>
          <div className="bfr-payer">
            <p className="bfr-payer-label">Payer signature</p>
            <span className="bfr-sign-line" aria-hidden="true" />
          </div>
        </div>
        <img className={`bfr-stamp bfr-stamp-${stamp}`} src={bookingStampSrc(stamp)} alt="" />
      </div>
    </article>
  );
}

export function printBookingReceipt() {
  const sheet = document.getElementById("booking-receipt-sheet");
  if (!sheet) return;
  const clone = sheet.cloneNode(true);
  clone.querySelectorAll("img").forEach((img) => {
    img.setAttribute("src", img.currentSrc || img.src);
  });
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>Receipt Voucher</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; background: #fff; }
  ${BOOKING_RECEIPT_PRINT_CSS}
</style></head><body>${clone.outerHTML}
<script>window.onload=function(){window.focus();window.print();}<\\/script>
</body></html>`);
  w.document.close();
}

export const BOOKING_RECEIPT_PRINT_CSS = `
.bfr-sheet {
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  margin: 0;
  padding: 16mm 20mm 18mm;
  color: #111;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  line-height: 1.28;
}
.bfr-head { display: flex; justify-content: center; align-items: flex-start; gap: 8pt; }
.bfr-logo { display: block; flex: 0 0 auto; }
.bfr-logo-a7 { width: 22mm; height: 22mm; object-fit: cover; }
.bfr-logo-aar { width: 26mm; height: auto; object-fit: contain; }
.bfr-company { text-align: center; font-weight: 700; }
.bfr-company p { margin: 0; }
.bfr-name { font-size: 12pt; }
.bfr-sheet h1 { margin: 12pt 0 14pt; text-align: center; font-size: 13pt; font-weight: 700; }
.bfr-meta { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin: 0 0 6pt; padding: 0 2pt; }
.bfr-no { display: inline-block; border: 1.5px solid #111; padding: 1pt 8pt 2pt; min-width: 32mm; text-align: center; }
.bfr-table { width: 100%; border-collapse: collapse; }
.bfr-table th, .bfr-table td { border-top: 1px solid #111; border-bottom: 1px solid #111; vertical-align: top; padding: 5pt 8pt; text-align: left; }
.bfr-table th:last-child, .bfr-table td:last-child { border-left: 1px solid #111; width: 32%; }
.bfr-table th { font-weight: 700; }
.bfr-body p { margin: 0 0 3pt; font-weight: 700; }
.bfr-gap { margin-top: 16pt !important; }
.bfr-amt { position: relative; min-height: 72mm; }
.bfr-amt-top { margin: 0; }
.bfr-amt.has-account .bfr-amt-top { margin-top: 14pt; }
.bfr-amt-total { position: absolute; left: 8pt; bottom: 6pt; margin: 0; padding-top: 6pt; border-top: 1px solid #111; width: calc(100% - 16pt); }
.bfr-sign { margin: 26pt 0 0; }
.bfr-sign-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16pt; }
.bfr-auth, .bfr-payer { display: flex; flex-direction: column; gap: 6pt; width: 62mm; }
.bfr-auth { align-items: flex-start; text-align: left; }
.bfr-payer { align-items: flex-end; text-align: right; }
.bfr-sign-label, .bfr-sign-name, .bfr-payer-label { margin: 0; font-weight: 700; }
.bfr-payer-label { font-size: 11pt; }
.bfr-sign-name { letter-spacing: 0.6pt; }
.bfr-sign-line { display: block; width: 52mm; height: 12mm; border-bottom: 1px solid #111; }
.bfr-stamp { display: block; margin: 8pt auto 0; }
.bfr-stamp-a7 { width: 46mm; height: auto; }
.bfr-stamp-aar { width: 38mm; height: auto; }
`;
