import { NOC_SIGN_PRINT_CSS, NocOwnerSign } from "./NocSignBox.jsx";

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

function money(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 });
}

function area(value) {
  const n = parseFloat(String(value || "").replace(/,/g, "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function letter(data) {
  const rental = v(data, "purpose") !== "sale";
  const kind = (v(data, "propertyKind") || v(data, "titleDeedPropertyType") || "property").toLowerCase();
  const company = v(data, "companyName") || "A7 GROUP REAL ESTATE LLC";
  const sqft = area(v(data, "plotAreaSqft"));
  const sqm = area(v(data, "plotAreaSqm"));
  const amount = money(v(data, "askingAmount"));
  const period = v(data, "askingPeriod");
  return {
    date: v(data, "date"),
    ownerName: v(data, "ownerName"),
    emiratesId: v(data, "emiratesId"),
    company,
    kind,
    purposePhrase: rental ? "for rental purposes" : "for sale",
    findPhrase: rental ? "finding suitable tenants" : "finding suitable buyers",
    askingLabel: rental ? "Asking Rent" : "Asking Price",
    askingValue: amount ? `AED ${amount}${period ? ` ${period}` : ""}` : "",
    areaValue: `${sqft ? `${sqft} sq. ft.` : ""}${sqft && sqm ? " " : ""}${sqm ? `(${sqm} sq. m.)` : ""}`.trim(),
    location: v(data, "location"),
    titleDeedPropertyType: v(data, "titleDeedPropertyType"),
    buildingNo: v(data, "buildingNo"),
    plotNo: v(data, "plotNo"),
    municipalityNo: v(data, "municipalityNo"),
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

export function NocSheet({ data }) {
  const d = letter(data);
  const owner = d.ownerName || "________________";
  const eid = d.emiratesId || "________________";
  return (
    <article className="noc-sheet" id="noc-sheet">
      <h1>NO OBJECTION CERTIFICATE (NOC)</h1>
      <h2>For Property Advertisement</h2>
      <p className="noc-line">Date: {d.date || ""}</p>
      <p className="noc-line">To Whom It May Concern,</p>
      <p className="noc-body">
        I, {owner}, holder of Emirates ID No. {eid}, hereby confirm that I am the owner of the property described below.
      </p>
      <p className="noc-body">
        I have no objection to {d.company} advertising, marketing, and promoting the {d.kind} situated on the
        below-mentioned plot {d.purposePhrase}.
      </p>
      <h3>Property Details</h3>
      <table className="noc-table">
        <tbody>
          <Row label="Location" value={d.location} />
          <Row label="Title Deed Property Type" value={d.titleDeedPropertyType} />
          <Row label="Building No." value={d.buildingNo} />
          <Row label="Plot No." value={d.plotNo} />
          <Row label="Municipality No." value={d.municipalityNo} />
          <Row label="Total Plot Area" value={d.areaValue} />
          <Row label={d.askingLabel} value={d.askingValue} />
        </tbody>
      </table>
      <p className="noc-body">
        I hereby authorize {d.company} to advertise the {d.kind} through appropriate marketing channels, including
        online property portals, social media, and other advertising platforms, for the purpose of {d.findPhrase}.
      </p>
      <p className="noc-body">
        This NOC is issued with my full knowledge and consent and confirms that I have no objection to the advertising
        and marketing of the {d.kind} by {d.company}.
      </p>
      <p className="noc-foot">Owner Name: {d.ownerName || ""}</p>
      <NocOwnerSign data={data} className="noc-foot" />
    </article>
  );
}

export function printNoc() {
  const sheet = document.getElementById("noc-sheet");
  if (!sheet) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>NO OBJECTION CERTIFICATE (NOC)</title>
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0; background: #fff; }
  ${NOC_PRINT_CSS}
</style></head><body>${sheet.outerHTML}
<script>window.onload=function(){window.focus();window.print();}<\\/script>
</body></html>`);
  w.document.close();
}

export const NOC_PRINT_CSS = `
.noc-sheet {
  box-sizing: border-box;
  width: 8.5in;
  min-height: 11in;
  margin: 0;
  padding: 0.64in 0.83in 0.7in 0.83in;
  color: #000;
  background: #fff;
  font-family: "Times New Roman", "Liberation Serif", Times, serif;
  font-size: 11pt;
  line-height: 1.15;
  font-weight: 400;
}
.noc-sheet h1 {
  margin: 0 0 10pt;
  text-align: center;
  font-size: 15pt;
  font-weight: 700;
  letter-spacing: 0;
}
.noc-sheet h2 {
  margin: 0 0 16pt;
  text-align: center;
  font-size: 12pt;
  font-weight: 700;
}
.noc-line { margin: 0 0 10pt; font-weight: 400; text-align: left; }
.noc-body { margin: 0 0 11pt; font-weight: 400; text-align: left; }
.noc-sheet h3 {
  margin: 10pt 0 6pt;
  text-align: left;
  font-size: 12pt;
  font-weight: 700;
  border: 0;
  padding: 0;
}
.noc-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 14pt;
  border: 0.5pt solid #000;
}
.noc-table th, .noc-table td {
  border: 0.5pt solid #000;
  padding: 1.5pt 6pt;
  font-size: 10.5pt;
  line-height: 1.2;
  vertical-align: middle;
  text-align: left;
}
.noc-table th {
  width: 150pt;
  background: #f2f2f2;
  font-weight: 700;
}
.noc-table td { font-weight: 400; }
.noc-foot { margin: 14pt 0 0; text-align: left; font-weight: 400; }
.noc-sig { margin-top: 10pt; }
${NOC_SIGN_PRINT_CSS}
`;
