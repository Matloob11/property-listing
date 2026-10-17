export const FORM_I_COMPANIES = ["Anwar Al Riyadh Properties LLC", "A7 GROUP REAL ESTATE LLC"];
export const A7_COMPANY = "A7 GROUP REAL ESTATE LLC";
export const AAR_COMPANY = "Anwar Al Riyadh Properties LLC";
export const A7_ADDRESS = "Russia Cluster, Building V03, Shop 20, International City, Dubai, UAE";
export const AAR_ADDRESS = "Russia Cluster, Building V03, Shop 11, International City, Dubai, UAE";

export const FORM_I_COMPANY_INFO = {
  [A7_COMPANY]: {
    address: A7_ADDRESS,
    phone: "+971 50 392 8461",
    orn: "30104",
    ded: "1056530",
  },
  [AAR_COMPANY]: {
    address: AAR_ADDRESS,
    phone: "+971 4 570 6504",
    orn: "34208",
    ded: "1156278",
  },
};

export const FORM_I_A7_AGENTS = [
  { name: "Hajra Abdul Kareem", email: "hajra7properties@gmail.com", phone: "+971 50 236 3728" },
  { name: "Abdul Sattar Mughal", email: "7sattarproperties@gmail.com", phone: "+971 55 104 5207" },
  { name: "Muhammad Akmal", email: "akmal@a7grouprealestate.com", phone: "+971 56 482 1835" },
  { name: "Abdul Malik Abdul Karim", email: "khurram162@gmail.com", phone: "+971 55 548 4423" },
  { name: "Qasim Mehmood", email: "qasim.a7group@gmail.com", phone: "+971 58 514 2817" },
];

export const FORM_I_AAR_AGENTS = [
  { name: "Sajid Mahmood", email: "hajism.dxb@gmail.com", phone: "+971 55 669 8774" },
  { name: "Muhammad Ramzan", email: "ramzang4@gmail.com", phone: "+971 55 519 3758" },
  { name: "Abdul Mannan", email: "mannana7gp@gmail.com", phone: "+971 54 771 6378" },
];

function normName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function companySelectValue(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "a7 group" || lower === "a7 group real estate" || lower === "a7 group real estate llc") return A7_COMPANY;
  return FORM_I_COMPANIES.find((name) => name.toLowerCase() === lower) || raw;
}

export function isAarAgentName(name) {
  return FORM_I_AAR_AGENTS.some((row) => normName(row.name) === normName(name));
}

export function findFormIAgent(name) {
  const n = normName(name);
  return (
    FORM_I_AAR_AGENTS.find((row) => normName(row.name) === n) ||
    FORM_I_A7_AGENTS.find((row) => normName(row.name) === n) ||
    null
  );
}

export function allFormIAgents() {
  return [...FORM_I_A7_AGENTS, ...FORM_I_AAR_AGENTS];
}

export function agentsForCompany(company) {
  const selected = companySelectValue(company);
  if (selected === AAR_COMPANY) return FORM_I_AAR_AGENTS;
  if (selected === A7_COMPANY) return FORM_I_A7_AGENTS;
  return allFormIAgents();
}

export function applyCompanyFields(next, side, company) {
  const info = FORM_I_COMPANY_INFO[company];
  if (!info) return next;
  next[`${side}Address`] = info.address;
  next[`${side}Phone`] = info.phone;
  next[`${side}Orn`] = info.orn;
  next[`${side}DedLic`] = info.ded;
  return next;
}

export function fillFormISide(current, side, { company = "", broker = "" } = {}) {
  const next = { ...current };
  const chosenCompany = companySelectValue(company) || (isAarAgentName(broker) ? AAR_COMPANY : broker ? A7_COMPANY : "");
  if (chosenCompany) {
    next[`${side}Establishment`] = chosenCompany;
    applyCompanyFields(next, side, chosenCompany);
  }
  if (broker) {
    const person = findFormIAgent(broker) || {};
    next[`${side}BrokerName`] = person.name || broker;
    next[`${side}Email`] = person.email || "";
    next[`${side}Mobile`] = person.phone || "";
    next[`${side}Brn`] = person.brn || "";
    next[`${side}DateIssued`] = person.dateIssued || "";
  }
  return next;
}

export function brokerNames(company) {
  return agentsForCompany(company).map((row) => row.name);
}

export function noDuplicateBrokers() {
  const names = [...FORM_I_A7_AGENTS, ...FORM_I_AAR_AGENTS].map((row) => normName(row.name));
  return new Set(names).size === names.length;
}
