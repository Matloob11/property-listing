import { NOC_SIGN_PRINT_CSS, NocOwnerSign } from "./NocSignBox.jsx";

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

function money(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 });
}

function letter(data) {
  const sale = v(data, "purpose") === "sale";
  const amount = money(v(data, "annualRent"));
  return {
    date: v(data, "date"),
    recipient: v(data, "recipient") || "Dubai Land Department (DLD) - RERA / Trakheesi",
    recipientPlace: v(data, "recipientPlace") || "Dubai, United Arab Emirates",
    ownerName: v(data, "ownerName"),
    companyName: v(data, "companyName") || "A7 Group Real Estate LLC",
    tradeLicense: v(data, "tradeLicense") || "1056530",
    purposeWord: sale ? "sale" : "rent",
    subject: sale ? "NOC for Advertising Property for Sale" : "NOC for Advertising Property for Rent",
    propertyType: v(data, "propertyType"),
    building: v(data, "building"),
    propertyNo: v(data, "propertyNo"),
    plotNo: v(data, "plotNo"),
    location: v(data, "location"),
    rentLabel: sale ? "Asking Price" : "Annual Rent",
    rentValue: amount ? `AED ${amount}` : "",
  };
}

function Row({ label, value }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value || "\u00a0"}</td>
    </tr>
  );
}

export function NocTrakheesiSheet({ data }) {
  const d = letter(data);
  const owner = d.ownerName || "________________";
  const company = d.companyName;
  return (
    <article className="noct-sheet" id="noct-sheet">
      <h1>NO OBJECTION CERTIFICATE</h1>
      <p className="noct-line">Date: {d.date || ""}</p>
      <p className="noct-line">
        To: {d.recipient}
        <br />
        {d.recipientPlace}
      </p>
      <p className="noct-subject">Subject: {d.subject}</p>
      <p className="noct-line">Dear Sir/Madam,</p>
      <p className="noct-body">
        I, {owner}, the owner of the property mentioned below, hereby confirm that I have no objection to {company},
        Trade License No. {d.tradeLicense}, advertising and marketing my property for {d.purposeWord} through Property
        Finder, Bayut, Dubizzle, and other DLD/RERA-approved advertising portals.
      </p>
      <h2>PROPERTY DETAILS</h2>
      <table className="noct-table">
        <thead>
          <tr>
            <th>Property Information</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Owner Name" value={d.ownerName} />
          <Row label="Property Type" value={d.propertyType} />
          <Row label="Building / Cluster" value={d.building} />
          <Row label="Property No." value={d.propertyNo} />
          <Row label="Plot No." value={d.plotNo} />
          <Row label="Location" value={d.location} />
          <Row label={d.rentLabel} value={d.rentValue} />
        </tbody>
      </table>
      <p className="noct-body">
        I hereby authorize {company} to advertise the above-mentioned property for {d.purposeWord} and to obtain the
        required Trakheesi Advertisement Permit.
      </p>
      <p className="noct-body">
        This authorization is issued solely for the purpose of advertising and marketing the above property for{" "}
        {d.purposeWord} and is subject to applicable DLD/RERA rules and regulations.
      </p>
      <p className="noct-line">Thank you.</p>
      <p className="noct-owner">PROPERTY OWNER</p>
      <p className="noct-foot">Name: {d.ownerName || ""}</p>
      <NocOwnerSign data={data} label="Signature:" blank="__________________________" className="noct-foot noct-sig" />
    </article>
  );
}

export function printNocTrakheesi() {
  const sheet = document.getElementById("noct-sheet");
  if (!sheet) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>NO OBJECTION CERTIFICATE</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; background: #fff; }
  ${NOCT_PRINT_CSS}
</style></head><body>${sheet.outerHTML}
<script>window.onload=function(){window.focus();window.print();}<\\/script>
</body></html>`);
  w.document.close();
}

export const NOCT_PRINT_CSS = `
.noct-sheet {
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  margin: 0;
  padding: 22mm 20mm 20mm;
  color: #000;
  background: #fff;
  font-family: "Times New Roman", "Liberation Serif", Times, serif;
  font-size: 12pt;
  line-height: 1.35;
  font-weight: 400;
}
.noct-sheet h1 {
  margin: 0 0 16pt;
  text-align: center;
  font-size: 16pt;
  font-weight: 700;
  text-decoration: underline;
}
.noct-sheet h2 {
  margin: 14pt 0 8pt;
  text-align: left;
  font-size: 12pt;
  font-weight: 700;
}
.noct-line { margin: 0 0 10pt; }
.noct-subject { margin: 0 0 12pt; font-weight: 700; }
.noct-body { margin: 0 0 12pt; text-align: justify; }
.noct-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 14pt;
}
.noct-table th,
.noct-table td {
  border: 0.6pt solid #000;
  padding: 4pt 8pt;
  font-size: 11pt;
  text-align: left;
  vertical-align: middle;
  font-weight: 700;
}
.noct-table thead th { width: 50%; }
.noct-table tbody th { width: 38%; font-weight: 700; }
.noct-owner { margin: 18pt 0 8pt; font-weight: 700; }
.noct-foot { margin: 0 0 8pt; }
.noct-sig { margin-top: 10pt; }
${NOC_SIGN_PRINT_CSS}
`;
