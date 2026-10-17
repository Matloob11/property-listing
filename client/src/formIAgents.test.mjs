import assert from "node:assert/strict";
import test from "node:test";
import {
  A7_COMPANY,
  AAR_COMPANY,
  FORM_I_A7_AGENTS,
  FORM_I_AAR_AGENTS,
  allFormIAgents,
  agentsForCompany,
  brokerNames,
  fillFormISide,
  findFormIAgent,
  noDuplicateBrokers,
} from "./formIAgents.js";

test("only the sent A7 and AAR brokers are listed, with no duplicates", () => {
  assert.equal(FORM_I_A7_AGENTS.length, 5);
  assert.equal(FORM_I_AAR_AGENTS.length, 3);
  assert.equal(noDuplicateBrokers(), true);
  assert.deepEqual(brokerNames(A7_COMPANY), [
    "Hajra Abdul Kareem",
    "Abdul Sattar Mughal",
    "Muhammad Akmal",
    "Abdul Malik Abdul Karim",
    "Qasim Mehmood",
  ]);
  assert.deepEqual(brokerNames(AAR_COMPANY), ["Sajid Mahmood", "Muhammad Ramzan", "Abdul Mannan"]);
  assert.deepEqual(
    allFormIAgents().map((row) => row.name),
    [
      "Hajra Abdul Kareem",
      "Abdul Sattar Mughal",
      "Muhammad Akmal",
      "Abdul Malik Abdul Karim",
      "Qasim Mehmood",
      "Sajid Mahmood",
      "Muhammad Ramzan",
      "Abdul Mannan",
    ]
  );
  assert.deepEqual(agentsForCompany("").map((row) => row.name), allFormIAgents().map((row) => row.name));
});

test("seller and buyer get the same A7 company and Qasim contacts", () => {
  const qasim = findFormIAgent("Qasim Mehmood");
  assert.equal(qasim.email, "qasim.a7group@gmail.com");
  assert.equal(qasim.phone, "+971 58 514 2817");
  for (const side of ["a", "b"]) {
    const row = fillFormISide({}, side, { company: A7_COMPANY, broker: "Qasim Mehmood" });
    assert.equal(row[`${side}Establishment`], A7_COMPANY);
    assert.equal(row[`${side}Orn`], "30104");
    assert.equal(row[`${side}DedLic`], "1056530");
    assert.equal(row[`${side}Phone`], "+971 50 392 8461");
    assert.match(row[`${side}Address`], /Shop 20/);
    assert.equal(row[`${side}Email`], "qasim.a7group@gmail.com");
    assert.equal(row[`${side}Mobile`], "+971 58 514 2817");
  }
});

test("seller and buyer get the same AAR company and Abdul Mannan contacts", () => {
  for (const side of ["a", "b"]) {
    const row = fillFormISide({}, side, { company: AAR_COMPANY, broker: "Abdul Mannan" });
    assert.equal(row[`${side}Establishment`], AAR_COMPANY);
    assert.equal(row[`${side}Orn`], "34208");
    assert.equal(row[`${side}DedLic`], "1156278");
    assert.equal(row[`${side}Phone`], "+971 4 570 6504");
    assert.match(row[`${side}Address`], /Shop 11/);
    assert.equal(row[`${side}Email`], "mannana7gp@gmail.com");
    assert.equal(row[`${side}Mobile`], "+971 54 771 6378");
  }
});

test("every sent broker fills email and mobile on both seller and buyer", () => {
  const expected = [
    ...FORM_I_A7_AGENTS.map((row) => ({ ...row, company: A7_COMPANY })),
    ...FORM_I_AAR_AGENTS.map((row) => ({ ...row, company: AAR_COMPANY })),
  ];
  assert.equal(expected.length, 8);
  for (const person of expected) {
    for (const side of ["a", "b"]) {
      const row = fillFormISide({}, side, { company: person.company, broker: person.name });
      assert.equal(row[`${side}BrokerName`], person.name);
      assert.equal(row[`${side}Email`], person.email);
      assert.equal(row[`${side}Mobile`], person.phone);
      assert.equal(row[`${side}Establishment`], person.company);
      assert.equal(row[`${side}Brn`], "");
      assert.equal(row[`${side}DateIssued`], "");
    }
  }
});
