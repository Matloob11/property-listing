export const UAE_VAT_RATE = 0.05;

export function moneyAmount(value) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function moneyRound(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function commissionVatMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "exclude" || mode === "include" ? mode : "";
}

export function commissionBreakdown(data = {}) {
  const entered = moneyAmount(data.commission);
  const mode = commissionVatMode(data.commissionVat);
  if (entered <= 0) return { entered: 0, mode: "", net: 0, vat: 0, total: 0 };
  if (mode === "exclude") {
    const vat = moneyRound(entered * UAE_VAT_RATE);
    return { entered, mode, net: entered, vat, total: moneyRound(entered + vat) };
  }
  if (mode === "include") {
    const net = moneyRound(entered / (1 + UAE_VAT_RATE));
    const vat = moneyRound(entered - net);
    return { entered, mode, net, vat, total: entered };
  }
  return { entered, mode: "", net: entered, vat: 0, total: entered };
}

function commissionChequeLabel(mode) {
  if (mode === "exclude") return "Commission + 5% VAT";
  if (mode === "include") return "Commission (incl. VAT)";
  return "Commission";
}

export function chequeCount(paymentMode) {
  const raw = String(paymentMode || "").trim();
  if (!raw || /cash|transfer/i.test(raw)) return 0;
  const match = raw.match(/(\d+)/);
  const n = match ? Number(match[1]) : 0;
  return n > 0 && n <= 24 ? n : 0;
}

export function formatChequeDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return String(ymd || "").trim();
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function addMonthsYmd(ymd, months) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const next = new Date(Date.UTC(year, month - 1 + Number(months || 0), 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  const use = Math.min(day, last);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(use).padStart(2, "0")}`;
}

export function formatAed(value) {
  const n = moneyAmount(value);
  if (n <= 0) return "";
  const whole = Math.abs(n - Math.round(n)) < 0.001;
  return `AED ${n.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}/-`;
}

function splitAmounts(total, count) {
  const cents = Math.round(total * 100);
  const n = Math.max(1, count);
  const each = Math.floor(cents / n);
  return Array.from({ length: n }, (_, index) => {
    const value = index === n - 1 ? cents - each * (n - 1) : each;
    return value / 100;
  });
}

function row(amount, date, name, particular) {
  return {
    amount: formatAed(amount),
    amountValue: moneyAmount(amount),
    date: formatChequeDate(date),
    dateYmd: date,
    name: String(name || "").trim() || "—",
    particular,
  };
}

export function chequeSchedule(data = {}) {
  const rent = moneyAmount(data.annualRent || data.contractValue);
  const start = String(data.dateFrom || data.contractDate || "").trim();
  const tenant = String(data.tenantName || "").trim();
  const owner = String(data.landlordName || data.ownerName || data.owner_name || "").trim();
  const agency = "A7 Group Real Estate";
  const count = chequeCount(data.paymentMode);
  const cash = /cash|transfer/i.test(String(data.paymentMode || ""));
  const rows = [];

  if (rent > 0 && start) {
    if (count > 0) {
      const gap = Math.round(12 / count) || 1;
      const amounts = splitAmounts(rent, count);
      amounts.forEach((amount, index) => {
        rows.push(row(amount, addMonthsYmd(start, index * gap), owner, index === 0 ? "1st rental cheque" : `Rental cheque ${index + 1}`));
      });
    } else if (cash) {
      rows.push(row(rent, start, owner, "Rent (cash / transfer)"));
    }
  }

  const commission = commissionBreakdown(data);
  const extras = [
    [moneyAmount(data.deposit), owner, "Security deposit"],
    [commission.total, agency, commissionChequeLabel(commission.mode)],
    [moneyAmount(data.ejariFee), agency, "Ejari fee"],
  ];
  for (const [amount, name, particular] of extras) {
    if (amount > 0 && start) rows.push(row(amount, start, name, particular));
  }

  return {
    start,
    end: String(data.dateTo || "").trim(),
    rent,
    count,
    cash,
    rows,
    property: [data.propertyNo, data.building, data.location].map((part) => String(part || "").trim()).filter(Boolean).join(" · "),
    tenant,
    owner,
    paymentMode: String(data.paymentMode || "").trim(),
  };
}
