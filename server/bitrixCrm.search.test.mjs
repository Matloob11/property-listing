import assert from "node:assert/strict";
import test from "node:test";
import {
  crmContactFields,
  crmOpenListEntities,
  crmSearchEntities,
  crmSearchJobs,
  crmSearchLimit,
  isCrmDirectoryName,
  isCrmDirectoryUnit,
  mapCrmSearchRow,
  splitCrmPersonName,
} from "./bitrixCrm.js";

test("crm search entities stay inside contact, company, lead, unit", () => {
  assert.deepEqual(crmSearchEntities("contact,unit,nope"), ["contact", "unit"]);
  assert.deepEqual(crmSearchEntities("CONTACT"), ["contact"]);
});

test("contact search looks at first name, last name, and second name", () => {
  const jobs = crmSearchJobs("contact", "Ali");
  const filters = jobs.map((job) => Object.keys(job.params.filter).join());
  assert.ok(filters.includes("%NAME"));
  assert.ok(filters.includes("%LAST_NAME"));
  assert.ok(filters.includes("%SECOND_NAME"));
});

test("unit search includes title, unit number, and owner names", () => {
  const jobs = crmSearchJobs("unit", "War");
  const keys = jobs.flatMap((job) => Object.keys(job.params.filter));
  assert.ok(keys.includes("%title"));
  assert.ok(keys.some((key) => /1761837638901/.test(key)));
  assert.ok(keys.some((key) => /1758009535002/.test(key)));
  assert.ok(keys.some((key) => /1760537872927/.test(key)));
  assert.ok(keys.some((key) => /1761837785108/.test(key)));
});

test("open tenant/owner list stays on contacts and caps at 20", () => {
  assert.equal(crmSearchLimit(), 20);
  assert.deepEqual(crmOpenListEntities(["contact", "company", "lead"], ""), ["contact"]);
  assert.deepEqual(crmOpenListEntities(["contact", "company", "lead"], "Ali"), ["contact", "company", "lead"]);
});

test("whatsapp integration names stay out of the first list", () => {
  assert.equal(isCrmDirectoryName("Nija"), true);
  assert.equal(isCrmDirectoryName("Property Finder WhatsApp | J"), false);
  assert.equal(isCrmDirectoryName("Property Finder WhatsApp | J", "whatsapp"), true);
});

test("new contact fields split the typed name and keep email/phone", () => {
  assert.deepEqual(splitCrmPersonName("Ahmed Ali Khan"), { NAME: "Ahmed", LAST_NAME: "Ali Khan" });
  const fields = crmContactFields({ name: "Ahmed Ali", email: "a@b.com", phone: "050123" });
  assert.equal(fields.NAME, "Ahmed");
  assert.equal(fields.LAST_NAME, "Ali");
  assert.equal(fields.EMAIL[0].VALUE, "a@b.com");
  assert.equal(fields.PHONE[0].VALUE, "050123");
});

test("empty business-bay stubs stay out of the unit list", () => {
  assert.equal(
    isCrmDirectoryUnit({
      title: "business bay",
      ufCrm21_1761837638901: "",
      ufCrm21_1758009535002: "sale",
    }),
    false
  );
  assert.equal(
    isCrmDirectoryUnit(
      {
        title: "business bay",
        ufCrm21_1761837638901: "",
        ufCrm21_1758009535002: "sale",
      },
      "business"
    ),
    false
  );
  assert.equal(
    isCrmDirectoryUnit({
      title: "Rufi Garden G-01",
      ufCrm21_1761837638901: "G-01",
      ufCrm21_1758009535002: "zhilei",
      ufCrm21_1758009542122: "zhao",
    }),
    true
  );
  assert.equal(
    isCrmDirectoryUnit(
      {
        title: "Marina Gate",
        ufCrm21_1761837638901: "",
        ufCrm21_1761837785108: "Marina Gate",
      },
      "Marina"
    ),
    true
  );
});

test("unit row title shows owner name next to the unit", () => {
  const item = mapCrmSearchRow("unit", {
    id: 9,
    title: "Greece L07",
    ufCrm21_1758009535002: "Javaid",
    ufCrm21_1758009542122: "Muhammad",
  });
  assert.equal(item.title, "Greece L07 · Javaid Muhammad");
});
