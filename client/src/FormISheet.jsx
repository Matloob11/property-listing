import formILogo from "./assets/form-i/logo.jpeg";
import formIStamp from "./assets/form-i/stamp.png";
import formISign from "./assets/form-i/sign.png";

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

function mark(value) {
  return value ? String(value) : "";
}

export function FormISheet({ data }) {
  return (
    <article className="formi-sheet" id="formi-sheet">
      <header className="formi-head">
        <div className="formi-head-copy">
          <p className="formi-agency">ESTATE REAL REGULATORY AGENCY</p>
          <p className="formi-formno">FORM I</p>
        </div>
        <img className="formi-logo" src={formILogo} alt="" />
      </header>
      <h1>AGENT TO AGENT AGREEMENT</h1>
      <p className="formi-bylaw">As per the Real Estate Brokers By-Law No. (85) Of 2006</p>

      <table className="formi-table">
        <colgroup>
          <col className="formi-col-a" />
          <col className="formi-col-b" />
        </colgroup>
        <tbody>
          <tr>
            <th className="formi-bar" colSpan={2}>
              <span>PART 1.</span>
              <span>THE PARTIES</span>
              <span>DATE: {v(data, "date")}</span>
            </th>
          </tr>
          <tr>
            <th>THE / BROKER (SELLER’S AGENT)</th>
            <th>THE AGENT BROKER (BUYER’S AGENT)</th>
          </tr>
          <tr className="formi-party">
            <td>
              <p>NAME OF THE ESTABLISHMENT: {mark(v(data, "aEstablishment"))}</p>
              <p>Address: {mark(v(data, "aAddress"))}</p>
              <p>
                PH: {mark(v(data, "aPhone"))}
                <span>FAX: {mark(v(data, "aFax"))}</span>
              </p>
              <p>
                ORN: {mark(v(data, "aOrn"))}
                <span>DED LISC: {mark(v(data, "aDedLic"))}</span>
              </p>
              <p>BROKER NAME: {mark(v(data, "aBrokerName"))}</p>
              <p>
                BRN: {mark(v(data, "aBrn"))}
                <span>DATE ISSUED: {mark(v(data, "aDateIssued"))}</span>
              </p>
              <p>MOBIL: {mark(v(data, "aMobile"))}</p>
              <p>EMAIL: {mark(v(data, "aEmail"))}</p>
              <p>SELLER’S AGENT FORM A STR #: {mark(v(data, "aFormAStr"))}</p>
            </td>
            <td>
              <p>NAME OF THE ESTABLISHMENT: {mark(v(data, "bEstablishment"))}</p>
              <p>ADDRESS: {mark(v(data, "bAddress"))}</p>
              <p>
                PH: {mark(v(data, "bPhone"))}
                <span>FAX: {mark(v(data, "bFax"))}</span>
              </p>
              <p>
                ORN: {mark(v(data, "bOrn"))}
                <span>DED LISC: {mark(v(data, "bDedLic"))}</span>
              </p>
              <p>BROKER NAME: {mark(v(data, "bBrokerName"))}</p>
              <p>
                BRN: {mark(v(data, "bBrn"))}
                <span>DATES OF ISSUE: {mark(v(data, "bDateIssued"))}</span>
              </p>
              <p>MOBILE: {mark(v(data, "bMobile"))}</p>
              <p>EMAIL: {mark(v(data, "bEmail"))}</p>
              <p>BUYER’S AGENT FORM B STR #: {mark(v(data, "bFormBStr"))}</p>
            </td>
          </tr>
          <tr>
            <th className="formi-declh">DECLARATION BY AGENT “A”</th>
            <th className="formi-declh">DECLARATION BTY AGENT “B”</th>
          </tr>
          <tr className="formi-decl">
            <td>
              I hereby declare I have read &amp; understood the Real Estate Brokers Code of Ethics, I have a current
              Signed Seller’s Agreement FORM A, I shall respond to a reasonable offer to Purchase the listed property
              from Agent B, &amp; shall not contact Agent B’s, Buyer nor confer with their client under no circumstances
              unless the nominates buyer herein has already discussed the stated list property with our office
            </td>
            <td>
              I hereby declare I have read &amp; understood the Real Estate Brokers Code of Ethics, I have a current
              Signed Seller’s Agreement FORM B, I shall encourage my Buyers as named herein, to submit a reasonable
              offer to the stated property &amp; not contact Agent A’s Seller nor confer with their client under no
              circumstances unless the Agent A has delayed out the proposal on the prescribed FORM with a reasonable
              reply within 24 hours.
            </td>
          </tr>
          <tr>
            <th className="formi-bar" colSpan={2}>
              <span>PART 2. THE PROPERTY</span>
              <span>PART 3. THE COMMISSION (split)</span>
            </th>
          </tr>
          <tr className="formi-party">
            <td>
              <p>PROJECT NAME: {mark(v(data, "projectName"))}</p>
              <p>Property Type: {mark(v(data, "propertyType"))}</p>
              <p>MASTER DEVELOPER: {mark(v(data, "masterDeveloper"))}</p>
              <p>PROPERTY DETAILS (Listing Agent to Complete): {mark(v(data, "propertyDetails"))}</p>
              <p>IS THE PROPERTY TENANTED? {mark(v(data, "tenanted"))}</p>
            </td>
            <td>
              <p>The following commission split is agreed between the seller’s &amp; the Buyer’s Agent.</p>
              <p>
                SELLER’S AGENT: {mark(v(data, "sellerCommission"))}
                <span>BUYER’S AGENT: {mark(v(data, "buyerCommission"))}</span>
              </p>
              <p>
                BUYER’S NAME: - {mark(v(data, "buyerName"))}
                <span>CONTACT: {mark(v(data, "buyerContact"))}</span>
              </p>
              <p>
                TRANSFER FEE PAID BY: SELLER: {mark(v(data, "transferFeeSeller"))}
                <span>BUYER: {mark(v(data, "transferFeeBuyer"))}</span>
              </p>
              <p>Buyer BUDGET: {mark(v(data, "buyerBudget"))}</p>
              <p>Listed Price by Agent A: {mark(v(data, "listedPrice")) || "____________________________"}</p>
            </td>
          </tr>
          <tr>
            <th className="formi-sigbar" colSpan={2}>
              PART 4. SIGNATURES
            </th>
          </tr>
          <tr>
            <td colSpan={2} className="formi-sigcell">
              <p className="formi-rules">
                1-Both Agents are required to co-operate with each other. 2-Fully complete this form &amp; both retain a
                fully signed &amp; stamped copy on file.
              </p>
              <div className="formi-marks">
                <img className="formi-stamp" src={formIStamp} alt="" />
                <img className="formi-sign" src={formISign} alt="" />
              </div>
              <p className="formi-signs">
                Agent A - {v(data, "agentASign") || "______________________________________"}
                <span>Agent B - {v(data, "agentBSign") || "______________________________________"}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="formi-rera">
              IN THE EVENT AGENT NOT RESPOND WITHIN 24HOURS, AGENT B MUST CONTACT RERA
            </td>
          </tr>
        </tbody>
      </table>
      {(v(data, "bEstablishment") || v(data, "bPhone")) && (
        <footer className="formi-foot">
          <b>{v(data, "bEstablishment")}</b>
          <p>
            {v(data, "bPhone") ? `Tel: ${v(data, "bPhone")}` : ""}
            <span>www.aarpropertiesllc.com</span>
          </p>
        </footer>
      )}
    </article>
  );
}

export function printFormI() {
  const sheet = document.getElementById("formi-sheet");
  if (!sheet) return;
  const clone = sheet.cloneNode(true);
  clone.querySelectorAll("img").forEach((img) => {
    img.setAttribute("src", img.currentSrc || img.src);
  });
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>FORM I — Agent to Agent Agreement</title>
<style>
  @page { size: letter; margin: 0; }
  html, body { margin: 0; background: #fff; }
  ${FORMI_PRINT_CSS}
</style></head><body>${clone.outerHTML}
<script>window.onload=function(){window.focus();window.print();}<\\/script>
</body></html>`);
  w.document.close();
}

export const FORMI_PRINT_CSS = `
.formi-sheet {
  box-sizing: border-box;
  width: 215.9mm;
  min-height: 279.4mm;
  margin: 0;
  padding: 6mm 10mm 8mm 14mm;
  color: #000;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10pt;
  line-height: 1.15;
  font-weight: 700;
}
.formi-head { display: flex; justify-content: space-between; align-items: flex-start; }
.formi-head-copy { display: flex; gap: 18pt; align-items: baseline; }
.formi-agency { margin: 0; font-size: 11pt; letter-spacing: 0.2pt; }
.formi-formno { margin: 0; font-size: 16pt; }
.formi-logo { width: 28mm; height: auto; }
.formi-sheet h1 { margin: 2pt 0 0; text-align: center; font-size: 13pt; letter-spacing: 1pt; }
.formi-bylaw { margin: 1pt 0 6pt; text-align: center; font-size: 9pt; font-weight: 400; }
.formi-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.formi-table col.formi-col-a { width: 47.7%; }
.formi-table col.formi-col-b { width: 52.3%; }
.formi-table th, .formi-table td {
  border: 1.6pt solid #000;
  vertical-align: top;
  padding: 3pt 4pt;
}
.formi-table th { font-size: 10pt; text-align: center; }
.formi-bar { background: #d9d9d9; text-align: left !important; }
.formi-bar span { display: inline-block; min-width: 28%; }
.formi-declh { background: #d9d9d9; }
.formi-sigbar { background: #cccccc; text-align: left !important; font-size: 12pt; }
.formi-party p { margin: 0 0 3pt; }
.formi-party span { margin-left: 10pt; }
.formi-decl td { font-size: 8.5pt; font-weight: 700; }
.formi-sigcell { position: relative; min-height: 28mm; }
.formi-rules { margin: 0 0 10pt; font-size: 9pt; }
.formi-marks { position: absolute; right: 8mm; top: 2mm; display: flex; gap: 6mm; align-items: center; }
.formi-stamp { width: 28mm; height: auto; }
.formi-sign { width: 32mm; height: auto; }
.formi-signs { margin: 16pt 0 0; }
.formi-signs span { margin-left: 18pt; }
.formi-rera { text-align: center; font-size: 10pt; }
.formi-foot { margin: 6pt 0 0; text-align: center; }
.formi-foot p { margin: 2pt 0 0; display: flex; justify-content: space-between; font-size: 9pt; }
`;
