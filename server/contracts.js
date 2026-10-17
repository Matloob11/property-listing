// Contract documents (tenancy contract / sale agreement) and their PDFs.
import crypto from "node:crypto";
import { PdfDoc, dataUrlToJpeg } from "./pdf.js";

export const CONTRACT_KINDS = ["tenancy", "sale"];
export const CONTRACT_STATUSES = ["draft", "sent", "partially_signed", "signed", "cancelled"];
const TOKEN_DAYS = 30;

export function kindLabel(kind) {
  return kind === "sale" ? "Sale Agreement" : "Tenancy Contract";
}

export function partyLabel(kind) {
  return kind === "sale" ? "Buyer" : "Tenant";
}

export function ownerLabel(kind) {
  return kind === "sale" ? "Seller" : "Landlord";
}

function str(value) {
  return String(value ?? "").trim();
}

function money(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return n ? `AED ${n.toLocaleString("en-US")}` : "-";
}

function dateText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function stamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" })} (Dubai time)`;
}

export function newToken() {
  return crypto.randomBytes(20).toString("hex");
}

export function normalizeContract(input) {
  const kind = CONTRACT_KINDS.includes(input.kind) ? input.kind : "tenancy";
  const data = input.data && typeof input.data === "object" ? input.data : {};
  const party = data.party || {};
  const owner = data.owner || {};
  const property = data.property || {};
  const terms = data.terms || {};
  const signers = Array.isArray(input.signers) ? input.signers : [];
  return {
    id: str(input.id),
    listing_id: str(input.listing_id),
    reference: str(input.reference),
    kind,
    status: CONTRACT_STATUSES.includes(input.status) ? input.status : "draft",
    title: str(input.title) || `${kindLabel(kind)} - ${str(input.reference)}`,
    created_by: str(input.created_by),
    created_at: input.created_at || new Date().toISOString(),
    updated_at: input.updated_at || new Date().toISOString(),
    sent_at: str(input.sent_at),
    completed_at: str(input.completed_at),
    data: {
      party: { name: str(party.name), email: str(party.email), phone: str(party.phone), id_number: str(party.id_number), nationality: str(party.nationality) },
      owner: { name: str(owner.name), email: str(owner.email), phone: str(owner.phone), id_number: str(owner.id_number) },
      property: {
        usage: str(property.usage),
        location: str(property.location),
        building: str(property.building),
        unit: str(property.unit),
        type: str(property.type),
        size: str(property.size),
        plot: str(property.plot),
        dewa: str(property.dewa),
        title_deed: str(property.title_deed),
        permit: str(property.permit),
      },
      terms: {
        contract_date: str(terms.contract_date),
        date_from: str(terms.date_from),
        date_to: str(terms.date_to),
        annual_rent: str(terms.annual_rent),
        sale_price: str(terms.sale_price),
        contract_value: str(terms.contract_value),
        deposit: str(terms.deposit),
        payment_mode: str(terms.payment_mode),
        cheques: str(terms.cheques),
        completion_date: str(terms.completion_date),
        commission: str(terms.commission),
        notes: str(terms.notes),
      },
      agent: { name: str(data.agent?.name), email: str(data.agent?.email), phone: str(data.agent?.phone) },
    },
    signers: signers.map((signer) => ({
      role: signer.role === "owner" ? "owner" : "party",
      label: str(signer.label) || (signer.role === "owner" ? ownerLabel(kind) : partyLabel(kind)),
      name: str(signer.name),
      email: str(signer.email),
      phone: str(signer.phone),
      token: str(signer.token),
      expires_at: str(signer.expires_at),
      sent_at: str(signer.sent_at),
      viewed_at: str(signer.viewed_at),
      signed_at: str(signer.signed_at),
      signed_name: str(signer.signed_name),
      signature: str(signer.signature),
      ip: str(signer.ip),
      user_agent: str(signer.user_agent).slice(0, 200),
    })),
    history: Array.isArray(input.history) ? input.history.slice(-200) : [],
  };
}

export function buildSigners(contract) {
  const { data, kind } = contract;
  const list = [];
  if (data.party.name) {
    list.push({ role: "party", label: partyLabel(kind), name: data.party.name, email: data.party.email, phone: data.party.phone });
  }
  if (data.owner.name) {
    list.push({ role: "owner", label: ownerLabel(kind), name: data.owner.name, email: data.owner.email, phone: data.owner.phone });
  }
  return list;
}

export function issueTokens(contract) {
  const expires = new Date(Date.now() + TOKEN_DAYS * 86400000).toISOString();
  return contract.signers.map((signer) => ({
    ...signer,
    token: signer.signed_at ? signer.token : signer.token || newToken(),
    expires_at: signer.signed_at ? signer.expires_at : expires,
    sent_at: signer.sent_at || new Date().toISOString(),
  }));
}

export function contractStatus(contract) {
  if (contract.status === "cancelled") return "cancelled";
  const total = contract.signers.length;
  const signed = contract.signers.filter((signer) => signer.signed_at).length;
  if (total && signed === total) return "signed";
  if (signed > 0) return "partially_signed";
  if (contract.signers.some((signer) => signer.token)) return "sent";
  return "draft";
}

export function contractHash(contract) {
  const body = JSON.stringify({
    id: contract.id,
    kind: contract.kind,
    data: contract.data,
    signers: contract.signers.map((s) => ({ role: s.role, name: s.signed_name || s.name, signed_at: s.signed_at, ip: s.ip })),
  });
  return crypto.createHash("sha256").update(body).digest("hex").slice(0, 16).toUpperCase();
}

const TENANCY_TERMS = [
  "The tenant has inspected the premises and accepts them in their present condition, and shall use them only for the usage stated above.",
  "The annual rent is payable as stated in the payment schedule. Cheques are issued in favour of the landlord and are due on the dates agreed. A returned cheque is a breach of this contract.",
  "The security deposit is refundable at the end of the tenancy after inspection, less the cost of any damage beyond normal wear and tear and any unpaid utilities.",
  "The tenant shall pay DEWA, chiller, internet, and any other utility charges for the premises during the tenancy. Ejari registration and municipality fees are paid by the tenant unless agreed otherwise.",
  "The landlord shall carry out major maintenance and structural repairs. The tenant is responsible for minor maintenance and for keeping the premises clean and in good order.",
  "The tenant shall not sublet, assign, or share the premises without the written consent of the landlord.",
  "Either party who wishes to vacate or not renew shall give the other party ninety (90) days written notice before the expiry date. Renewal terms are subject to the applicable RERA rent index.",
  "Early termination requires the written agreement of both parties. Unless agreed otherwise, the tenant remains liable for the rent until the premises are re-let or the term ends.",
  "The number of occupants shall not exceed the limit permitted by Dubai Municipality. No structural changes may be made without written approval.",
  "This contract is governed by the laws of the Emirate of Dubai and the United Arab Emirates. Any dispute is referred to the Rental Disputes Centre of Dubai.",
  "This document was signed electronically by the parties through A7 Group's listing desk. Each signature is recorded with the signer's name, date, time, and network address, and forms part of this contract.",
];

const SALE_TERMS = [
  "The seller confirms that they are the legal owner of the property and that it is free from any mortgage, lien, or claim, or that any mortgage will be settled before transfer.",
  "The buyer shall pay the deposit stated above on signing this agreement. The balance of the purchase price is payable on the date of transfer at the Dubai Land Department (DLD).",
  "Transfer of ownership shall be completed at the DLD on or before the completion date. Both parties shall attend, or appoint a representative by power of attorney, with all documents required for transfer.",
  "DLD transfer fees, trustee fees, and any NOC fees are paid as agreed between the parties. Unless stated otherwise, the buyer pays the DLD transfer fee and the seller pays for the developer NOC.",
  "The agency commission stated above is due to A7 Group Real Estate on completion of the transfer.",
  "If the buyer fails to complete, the deposit is forfeited to the seller. If the seller fails to complete, the seller shall refund the deposit and pay an equal amount as compensation to the buyer.",
  "The property is sold with vacant possession on transfer unless it is subject to an existing tenancy, in which case the tenancy contract passes to the buyer with all rights and obligations.",
  "Service charges, utilities, and any fines are settled by the seller up to the transfer date and by the buyer thereafter.",
  "This agreement is governed by the laws of the Emirate of Dubai and the United Arab Emirates and is subject to RERA Form F where applicable.",
  "This document was signed electronically by the parties through A7 Group's listing desk. Each signature is recorded with the signer's name, date, time, and network address, and forms part of this agreement.",
];

export function contractPdf(contract, options = {}) {
  const { data, kind } = contract;
  const doc = new PdfDoc();
  const title = kindLabel(kind).toUpperCase();
  doc.text("A7 GROUP REAL ESTATE", { size: 10, bold: true, color: [0.45, 0.35, 0.2], gap: 2 });
  doc.text("Dubai, United Arab Emirates", { size: 9, color: [0.4, 0.4, 0.4], gap: 10 });
  doc.text(title, { size: 20, bold: true, align: "center", gap: 2 });
  doc.text(`Contract No. ${contract.reference}-${contract.id.slice(0, 6).toUpperCase()}   |   Date: ${dateText(data.terms.contract_date || contract.created_at)}`, {
    size: 9.5,
    align: "center",
    color: [0.35, 0.35, 0.35],
    gap: 12,
  });

  doc.heading("1. Parties");
  doc.rows([
    [ownerLabel(kind), data.owner.name],
    [`${ownerLabel(kind)} contact`, [data.owner.phone, data.owner.email].filter(Boolean).join("  |  ")],
    [`${ownerLabel(kind)} ID`, data.owner.id_number],
    [partyLabel(kind), data.party.name],
    [`${partyLabel(kind)} contact`, [data.party.phone, data.party.email].filter(Boolean).join("  |  ")],
    [`${partyLabel(kind)} ID`, data.party.id_number],
    [`${partyLabel(kind)} nationality`, data.party.nationality],
    ["Agent (A7 Group)", [data.agent.name, data.agent.phone, data.agent.email].filter(Boolean).join("  |  ")],
  ].filter(([, value]) => value));

  doc.heading("2. Property");
  doc.rows([
    ["Listing reference", contract.reference],
    ["Usage", data.property.usage],
    ["Location", data.property.location],
    ["Building / project", data.property.building],
    ["Unit / property no.", data.property.unit],
    ["Property type", data.property.type],
    ["Size", data.property.size ? `${data.property.size} sq.ft` : ""],
    ["Plot no.", data.property.plot],
    ["DEWA premises no.", data.property.dewa],
    ["Title deed no.", data.property.title_deed],
    ["Permit no.", data.property.permit],
  ].filter(([, value]) => value));

  if (kind === "sale") {
    doc.heading("3. Price and payment");
    doc.rows([
      ["Sale price", money(data.terms.sale_price)],
      ["Deposit on signing", money(data.terms.deposit)],
      ["Balance on transfer", money(Number(String(data.terms.sale_price).replace(/[^0-9.]/g, "")) - Number(String(data.terms.deposit).replace(/[^0-9.]/g, "")))],
      ["Payment", data.terms.payment_mode],
      ["Completion / transfer date", dateText(data.terms.completion_date)],
      ["Agency commission", data.terms.commission],
    ].filter(([, value]) => value && value !== "-"));
  } else {
    doc.heading("3. Term and rent");
    doc.rows([
      ["Contract period", `${dateText(data.terms.date_from)}  to  ${dateText(data.terms.date_to)}`],
      ["Annual rent", money(data.terms.annual_rent)],
      ["Contract value", money(data.terms.contract_value || data.terms.annual_rent)],
      ["Security deposit", money(data.terms.deposit)],
      ["Payment", [data.terms.payment_mode, data.terms.cheques ? `${data.terms.cheques} cheque(s)` : ""].filter(Boolean).join("  |  ")],
    ].filter(([, value]) => value && value !== "-"));
  }
  if (data.terms.notes) {
    doc.text("Additional terms", { size: 10.5, bold: true, gap: 2 });
    doc.text(data.terms.notes, { size: 10, gap: 8 });
  }

  doc.heading("4. Terms and conditions");
  (kind === "sale" ? SALE_TERMS : TENANCY_TERMS).forEach((clause, index) => {
    doc.text(`${index + 1}. ${clause}`, { size: 9.5, gap: 3 });
  });

  doc.heading("5. Signatures");
  const signers = contract.signers.length ? contract.signers : buildSigners(contract).map((s) => ({ ...s }));
  for (const signer of signers) {
    doc.ensure(120);
    doc.text(`${signer.label}: ${signer.name}`, { size: 10.5, bold: true, gap: 4 });
    const jpeg = signer.signature ? dataUrlToJpeg(signer.signature) : null;
    if (jpeg && doc.image(jpeg, { width: 200, height: 70 })) {
      doc.text(`Signed by ${signer.signed_name || signer.name} on ${stamp(signer.signed_at)}${signer.ip ? ` from ${signer.ip}` : ""}`, {
        size: 8.5,
        color: [0.35, 0.35, 0.35],
        gap: 10,
      });
    } else {
      doc.box(60, { width: 220 });
      doc.moveDown(64);
      doc.text(options.blank ? "Signature" : "Not signed yet", { size: 8.5, color: [0.5, 0.5, 0.5], gap: 10 });
    }
  }
  doc.text(`Document ID ${contract.id}   |   Verification code ${contractHash(contract)}   |   Generated ${stamp(new Date().toISOString())}`, {
    size: 8,
    color: [0.5, 0.5, 0.5],
    gap: 0,
  });
  return doc.render();
}

export function contractSummary(contract) {
  const { data, kind } = contract;
  const pairs = [
    ["Listing", contract.reference],
    [ownerLabel(kind), data.owner.name],
    [partyLabel(kind), data.party.name],
    ["Property", [data.property.location, data.property.building, data.property.unit].filter(Boolean).join(", ")],
  ];
  if (kind === "sale") {
    pairs.push(["Sale price", money(data.terms.sale_price)]);
    pairs.push(["Deposit", money(data.terms.deposit)]);
    pairs.push(["Transfer date", dateText(data.terms.completion_date)]);
  } else {
    pairs.push(["Period", `${dateText(data.terms.date_from)} to ${dateText(data.terms.date_to)}`]);
    pairs.push(["Annual rent", money(data.terms.annual_rent)]);
    pairs.push(["Deposit", money(data.terms.deposit)]);
    pairs.push(["Payment", [data.terms.payment_mode, data.terms.cheques ? `${data.terms.cheques} cheque(s)` : ""].filter(Boolean).join(", ")]);
  }
  return pairs.filter(([, value]) => value && value !== "-");
}

export function contractFromListing(listing, kind, user) {
  const isSale = kind === "sale";
  const rent = Number(listing.price_yearly || listing.price_aed || 0);
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate() - 1).toISOString().slice(0, 10);
  return {
    listing_id: listing.id,
    reference: listing.reference,
    kind,
    data: {
      party: { name: "", email: "", phone: "" },
      owner: { name: listing.landlord_name, email: listing.landlord_email, phone: listing.landlord_phone },
      property: {
        usage: listing.category === "commercial" ? "Commercial" : "Residential",
        location: [listing.city, listing.community, listing.sub_community].filter(Boolean).join(", "),
        building: listing.building || listing.project_name,
        unit: listing.unit_no,
        type: String(listing.type || "").replace(/\b\w/g, (c) => c.toUpperCase()),
        size: listing.area_sqft ? String(listing.area_sqft) : "",
        plot: listing.plot_size,
        dewa: "",
        title_deed: listing.title_deed && !/^\/|^http/.test(listing.title_deed) ? listing.title_deed : "",
        permit: listing.permit_number,
      },
      terms: isSale
        ? {
            contract_date: from,
            sale_price: String(listing.sale_price || listing.price_aed || ""),
            deposit: listing.price_aed ? String(Math.round(Number(listing.price_aed) * 0.1)) : "",
            payment_mode: "Manager's cheque on transfer",
            completion_date: "",
            commission: "2% of the sale price",
            notes: "",
          }
        : {
            contract_date: from,
            date_from: from,
            date_to: to,
            annual_rent: rent ? String(rent) : "",
            contract_value: rent ? String(rent) : "",
            deposit: rent ? String(Math.round(rent * 0.05)) : "",
            payment_mode: listing.payment_method || "Cheques",
            cheques: listing.cheques || "4",
            notes: "",
          },
      agent: { name: user?.name || listing.listing_agent, email: user?.email || "", phone: "" },
    },
  };
}
