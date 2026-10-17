import assert from "node:assert/strict";
import test from "node:test";
import { addMonthsYmd, chequeCount, chequeSchedule, commissionBreakdown } from "./tenancyCheques.js";
import { normalizeForm } from "./tenancy.js";
import { tenancyPdf } from "./tenancyPdf.js";

test("four cheques split rent and date every three months from the start date", () => {
  const schedule = chequeSchedule({
    tenantName: "Sara Ali",
    landlordName: "Omar Khan",
    annualRent: "40000",
    paymentMode: "04 cheques",
    dateFrom: "2026-09-25",
    dateTo: "2027-09-24",
    deposit: "2000",
    commission: "3000",
    ejariFee: "215",
  });
  const rent = schedule.rows.filter((row) => /rental/i.test(row.particular));
  assert.equal(rent.length, 4);
  assert.deepEqual(rent.map((row) => row.amount), ["AED 10,000/-", "AED 10,000/-", "AED 10,000/-", "AED 10,000/-"]);
  assert.deepEqual(rent.map((row) => row.date), ["25/09/2026", "25/12/2026", "25/03/2027", "25/06/2027"]);
  assert.equal(rent[0].name, "Omar Khan");
  assert.ok(rent.every((row) => row.name === "Omar Khan"));
  const extras = schedule.rows.filter((row) => !/rental/i.test(row.particular));
  assert.equal(extras.length, 3);
  assert.ok(extras.every((row) => row.date === "25/09/2026"));
  assert.equal(extras.find((row) => row.particular === "Security deposit").name, "Omar Khan");
  assert.equal(extras.find((row) => row.particular === "Commission").name, "A7 Group Real Estate");
  assert.equal(extras.find((row) => row.particular === "Commission").amount, "AED 3,000/-");
});

test("exclude VAT adds 5 percent on the commission cheque", () => {
  const vat = commissionBreakdown({ commission: "3000", commissionVat: "exclude" });
  assert.deepEqual(vat, { entered: 3000, mode: "exclude", net: 3000, vat: 150, total: 3150 });
  const schedule = chequeSchedule({
    landlordName: "Omar Khan",
    annualRent: "40000",
    paymentMode: "04 cheques",
    dateFrom: "2026-09-25",
    commission: "3000",
    commissionVat: "exclude",
  });
  const row = schedule.rows.find((item) => /commission/i.test(item.particular));
  assert.equal(row.particular, "Commission + 5% VAT");
  assert.equal(row.amount, "AED 3,150/-");
  assert.equal(row.name, "A7 Group Real Estate");
});

test("include VAT keeps the typed commission as the total", () => {
  const vat = commissionBreakdown({ commission: "3150", commissionVat: "include" });
  assert.deepEqual(vat, { entered: 3150, mode: "include", net: 3000, vat: 150, total: 3150 });
  const schedule = chequeSchedule({
    landlordName: "Omar Khan",
    dateFrom: "2026-09-25",
    commission: "3150",
    commissionVat: "include",
  });
  const row = schedule.rows.find((item) => /commission/i.test(item.particular));
  assert.equal(row.particular, "Commission (incl. VAT)");
  assert.equal(row.amount, "AED 3,150/-");
});

test("blank commission VAT leaves the typed amount unchanged", () => {
  const vat = commissionBreakdown({ commission: "3000", commissionVat: "" });
  assert.equal(vat.mode, "");
  assert.equal(vat.total, 3000);
  assert.equal(vat.vat, 0);
});

test("normalizeForm keeps exclude or include and drops unknown VAT", () => {
  assert.equal(normalizeForm({ commissionVat: "exclude" }).commissionVat, "exclude");
  assert.equal(normalizeForm({ commissionVat: "include" }).commissionVat, "include");
  assert.equal(normalizeForm({ commissionVat: "maybe" }).commissionVat, "");
});

test("two cheques split rent every six months", () => {
  assert.equal(chequeCount("02 cheques"), 2);
  const schedule = chequeSchedule({
    tenantName: "Sara",
    landlordName: "Omar",
    annualRent: "60000",
    paymentMode: "02 cheques",
    dateFrom: "2026-09-26",
  });
  const rent = schedule.rows.filter((row) => /rental/i.test(row.particular));
  assert.equal(rent.length, 2);
  assert.deepEqual(rent.map((row) => row.amount), ["AED 30,000/-", "AED 30,000/-"]);
  assert.deepEqual(rent.map((row) => row.date), ["26/09/2026", "26/03/2027"]);
  assert.equal(rent[0].particular, "1st rental cheque");
  assert.equal(rent[1].particular, "Rental cheque 2");
});

test("three cheques split rent every four months", () => {
  assert.equal(chequeCount("03 cheques"), 3);
  const schedule = chequeSchedule({
    tenantName: "Sara",
    landlordName: "Omar",
    annualRent: "36000",
    paymentMode: "03 cheques",
    dateFrom: "2026-09-26",
  });
  const rent = schedule.rows.filter((row) => /rental/i.test(row.particular));
  assert.equal(rent.length, 3);
  assert.deepEqual(rent.map((row) => row.amount), ["AED 12,000/-", "AED 12,000/-", "AED 12,000/-"]);
  assert.deepEqual(rent.map((row) => row.date), ["26/09/2026", "26/01/2027", "26/05/2027"]);
  assert.equal(rent[2].particular, "Rental cheque 3");
});

test("six cheques use two-month gaps and keep the leftover on the last cheque", () => {
  assert.equal(chequeCount("06 cheques"), 6);
  const schedule = chequeSchedule({
    tenantName: "Sara",
    landlordName: "Omar",
    annualRent: "100000",
    paymentMode: "06 cheques",
    dateFrom: "2026-01-31",
  });
  const rent = schedule.rows.filter((row) => /rental/i.test(row.particular));
  assert.equal(rent.length, 6);
  assert.equal(rent[0].date, "31/01/2026");
  assert.equal(rent[1].date, "31/03/2026");
  const total = rent.reduce((sum, row) => sum + row.amountValue, 0);
  assert.equal(total, 100000);
});

test("cash mode still lists the start-date extras", () => {
  const schedule = chequeSchedule({
    tenantName: "Sara",
    landlordName: "Omar Khan",
    annualRent: "40000",
    paymentMode: "Cash / transfer",
    dateFrom: "2026-09-25",
    deposit: "2000",
  });
  assert.equal(schedule.rows[0].particular, "Rent (cash / transfer)");
  assert.equal(schedule.rows[0].name, "Omar Khan");
  assert.equal(schedule.rows[0].date, "25/09/2026");
  assert.equal(schedule.rows[1].particular, "Security deposit");
  assert.equal(schedule.rows[1].name, "Omar Khan");
});

test("tenancy pdf adds a last cheque page", () => {
  const pdf = tenancyPdf({
    tenantName: "Sara Ali",
    landlordName: "Omar Khan",
    dateFrom: "2026-09-25",
    dateTo: "2027-09-24",
    annualRent: "40000",
    paymentMode: "04 cheques",
    deposit: "2000",
  });
  const text = pdf.toString("latin1");
  assert.match(text, /\/Count [34]/);
  assert.match(text, /Cheque schedule/);
  assert.match(text, /1st rental cheque/);
  assert.match(text, /Omar Khan/);
  assert.match(text, /AED 10,000\/-/);
  assert.match(text, /0 0 0 rg/);
  assert.match(text, /0 Tr/);
  assert.match(text, /Particulars/);
  assert.equal(text.includes("Chequee"), false);
  assert.equal(text.includes("1st rental cheque"), true);
  assert.equal(addMonthsYmd("2026-09-25", 3), "2026-12-25");
});

test("two cheque pdf schedule shows half-year rental rows", () => {
  const pdf = tenancyPdf({
    tenantName: "Sara Ali",
    landlordName: "Omar Khan",
    dateFrom: "2026-09-26",
    dateTo: "2027-09-25",
    annualRent: "60000",
    paymentMode: "02 cheques",
  });
  const text = pdf.toString("latin1");
  assert.match(text, /02 cheques/i);
  assert.match(text, /1st rental cheque/);
  assert.match(text, /Rental cheque 2/);
  assert.match(text, /AED 30,000\/-/);
  assert.equal(text.includes("Rental cheque 3"), false);
});
