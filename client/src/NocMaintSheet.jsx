import { maintLetterModel } from "../../server/nocMaintLetter.js";

function SignLine({ data }) {
  const src = String(data?.ownerSign || "");
  if (src.startsWith("data:image/")) {
    return (
      <p className="nocm-sign">
        Signature: <img src={src} alt="" className="nocm-sign-img" />
      </p>
    );
  }
  return <p className="nocm-sign">Signature: ----------------------</p>;
}

export function NocMaintSheet({ data }) {
  const d = maintLetterModel(data);
  const owner = d.owner || "________________";
  const company = d.companyBit || "________________";
  return (
    <article className="nocm-sheet" id="nocm-sheet">
      <h1>{d.title}</h1>
      <table className="nocm-meta">
        <tbody>
          <tr>
            <th>TO:</th>
            <td>{d.recipient}</td>
          </tr>
          <tr>
            <th>REF:</th>
            <td>{d.ref}</td>
          </tr>
          <tr>
            <th>PROPERTY REF:</th>
            <td>{d.propertyRef}</td>
          </tr>
        </tbody>
      </table>
      <p className="nocm-body">
        I {owner} owner of the above mentioned properties have no objection for{" "}
        <strong>{company}</strong> to do {d.workPhrase} inside and outside the property with needful
        maintenance work.
      </p>
      <p className="nocm-body">
        Please give permission for maintenance to finishing the work provided that he will follow the
        guidelines and submit the required documents as per developer Rules.
      </p>
      <div className="nocm-end">
        <p>Landlord:</p>
        <p className="nocm-landlord-name">{owner}</p>
        <SignLine data={data} />
      </div>
    </article>
  );
}

export function printNocMaint() {
  const sheet = document.getElementById("nocm-sheet");
  if (!sheet) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>NOC for Maintenance</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; background: #fff; }
  ${NOCM_PRINT_CSS}
</style></head><body>${sheet.outerHTML}
<script>window.onload=function(){window.focus();window.print();}<\\/script>
</body></html>`);
  w.document.close();
}

export const NOCM_PRINT_CSS = `
.nocm-sheet {
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  margin: 0;
  padding: 25.4mm 25.4mm 25.4mm 25.4mm;
  color: #000;
  background: #fff;
  font-family: Calibri, "Segoe UI", Arial, sans-serif;
  font-size: 12pt;
  line-height: 1.35;
  font-weight: 400;
}
.nocm-sheet h1 {
  margin: 0 0 22pt;
  text-align: center;
  font-size: 16pt;
  font-weight: 700;
}
.nocm-meta {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 22pt;
}
.nocm-meta th,
.nocm-meta td {
  border: 0;
  padding: 0 0 10pt;
  text-align: left;
  vertical-align: top;
  font-size: 12pt;
  font-weight: 700;
}
.nocm-meta th { width: 48mm; padding-right: 10mm; }
.nocm-body { margin: 0 0 14pt; text-align: left; font-weight: 400; }
.nocm-body strong { font-weight: 700; }
.nocm-end { margin: 36pt 0 0; }
.nocm-end p { margin: 0 0 12pt; font-weight: 400; }
.nocm-landlord-name { font-weight: 700; margin: 16pt 0 18pt; }
.nocm-sign { margin: 0; font-weight: 400; }
.nocm-sign-img {
  display: inline-block;
  height: 16mm;
  width: auto;
  max-width: 70mm;
  vertical-align: middle;
}
`;
