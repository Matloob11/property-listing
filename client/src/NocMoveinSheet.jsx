import { NOC_SIGN_PRINT_CSS, NocOwnerSign } from "./NocSignBox.jsx";

function v(data, key) {
  return String(data?.[key] ?? "").trim();
}

export function NocMoveinSheet({ data, direction = "in" }) {
  const out = direction === "out";
  const owner = v(data, "ownerName");
  const tenant = v(data, "tenantName");
  const eid = v(data, "tenantEid");
  const title = out ? "NOC FOR MOVE OUT" : "NOC FOR MOVE IN";
  const verb = out ? "move out" : "move in";
  const moving = out ? "moving out" : "moving in";
  return (
    <article className="nocmi-sheet" id={out ? "nocmo-sheet" : "nocmi-sheet"}>
      <h1>{title}</h1>
      <p className="nocmi-to">To,</p>
      <p className="nocmi-to">{v(data, "recipient")}</p>
      <p className="nocmi-meta">Property: {v(data, "property")}</p>
      <p className="nocmi-meta">SUBJECT: {title}</p>
      <p className="nocmi-body">
        I, <strong>{owner || "________________"}</strong> owner of the above-mentioned property, I have no objection
        for my Tenant <strong>{tenant || "________________"} EID: {eid || "________________"}</strong> {verb} the
        above-mentioned property.
      </p>
      <p className="nocmi-body">
        This NOC letter is issued upon the request of the tenant for the purpose of {verb}. Kindly accept this letter
        and grant him permission for {moving}.
      </p>
      <p className="nocmi-regards">Regards,</p>
      <p className="nocmi-name">{owner}</p>
      <NocOwnerSign data={data} label="Signature:" blank="_________________" className="nocmi-sig" />
    </article>
  );
}

export function NocMoveoutSheet({ data }) {
  return <NocMoveinSheet data={data} direction="out" />;
}

export function printNocMovein() {
  const sheet = document.getElementById("nocmi-sheet") || document.getElementById("nocmo-sheet");
  if (!sheet) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />
<title>NOC FOR MOVE IN</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; background: #fff; }
  ${NOCMI_PRINT_CSS}
</style></head><body>${sheet.outerHTML}
<script>window.onload=function(){window.focus();window.print();}<\\/script>
</body></html>`);
  w.document.close();
}

export const NOCMI_PRINT_CSS = `
.nocmi-sheet {
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  margin: 0;
  padding: 25.4mm;
  color: #000;
  background: #fff;
  font-family: "Times New Roman", "Liberation Serif", Times, serif;
  font-size: 14pt;
  line-height: 1.25;
  font-weight: 400;
  text-align: justify;
}
.nocmi-sheet h1 {
  margin: 0 0 18pt;
  text-align: left;
  font-size: 24pt;
  font-weight: 700;
  text-decoration: underline;
}
.nocmi-to, .nocmi-meta { margin: 0 0 10pt; font-weight: 700; text-align: left; }
.nocmi-meta { margin: 0 0 12pt; }
.nocmi-body { margin: 16pt 0 0; font-weight: 400; }
.nocmi-body strong { font-weight: 700; }
.nocmi-regards { margin: 28pt 0 0; text-align: left; }
.nocmi-name { margin: 6pt 0 0; font-weight: 700; text-align: left; }
.nocmi-sig { margin: 22pt 0 0; text-align: left; }
${NOC_SIGN_PRINT_CSS}
`;
