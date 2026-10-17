import assert from "node:assert/strict";
import test from "node:test";
import { moneyLine, tenancyLayout, tenancyPdf } from "./tenancyPdf.js";

const sample = {
  contractDate: "2026-09-25",
  dateFrom: "2026-09-25",
  dateTo: "2027-09-24",
  landlordName: "Matloob",
  tenantName: "Khadija",
  tenantEmail: "khadija@example.com",
  tenantPhone: "0501234567",
  building: "England Cluster",
  location: "International City",
  size: "37",
  propertyType: "Shop",
  propertyNo: "18",
  annualRent: "42000",
  deposit: "2100",
  paymentMode: "04 cheques",
  usage: "Commercial",
};

test("filled values share one size and sit on the form lines", () => {
  const layout = tenancyLayout(sample);
  assert.ok(layout.p1.length > 8);
  assert.ok(layout.p1.every((item) => item.size === 10));
  const names = layout.p1.filter((item) => item.text === "Matloob" || item.text === "Khadija");
  assert.equal(names.filter((item) => item.text === "Matloob").length, 2);
  assert.equal(names.filter((item) => item.text === "Khadija").length, 1);
  const ownerY = Math.max(...layout.p1.filter((item) => item.text === "Matloob").map((item) => item.y));
  const tenantY = layout.p1.find((item) => item.text === "Khadija").y;
  assert.ok(ownerY > tenantY);
  assert.ok(layout.p1.every((item) => item.bold !== true));
  assert.ok(layout.usageDot.y === 744.2);
  assert.equal(layout.usageDot.selected, "commercial");
  assert.equal(layout.usageDot.options.length, 3);
  const day = layout.p1.find((item) => item.text === "25");
  const month = layout.p1.find((item) => item.text === "09");
  const year = layout.p1.find((item) => item.text === "2026" && item.y > 780);
  assert.ok(day && month && year);
  assert.equal(day.y, 788.5);
  assert.ok(day.x < month.x && month.x < year.x);
});

test("additional terms are readable, not 6pt", () => {
  const layout = tenancyLayout(sample);
  assert.ok(layout.p2.length > 4);
  assert.ok(layout.p2.every((item) => item.size >= 9));
});

test("rent words include hundreds of thousands", () => {
  assert.match(moneyLine("120000"), /ONE HUNDRED TWENTY THOUSAND/);
  assert.equal(moneyLine("120000").includes("undefined"), false);
});

test("tenancy pdf still builds with cheque page", () => {
  const pdf = tenancyPdf(sample);
  const text = pdf.toString("latin1");
  assert.match(text, /Matloob/);
  assert.match(text, /Khadija/);
  assert.match(text, /Cheque schedule/);
  assert.match(text, /0.043 0.173 0.412/);
});
