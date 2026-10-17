import assert from "node:assert/strict";
import test from "node:test";
import {
  loadUiState,
  saveUiState,
  clearUiState,
  setUiPersistUser,
  loadNamedState,
  saveNamedState,
  UI_PERSIST_TTL_MS,
} from "./uiPersist.js";

const empty = {
  ticket: "all",
  q: "",
  page: 1,
  pageSize: 10,
  sort: "updated_at",
  dir: "desc",
};

function mockStorage() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  return store;
}

test("ui persist is scoped per user — no cross-user leak", () => {
  const store = mockStorage();

  setUiPersistUser("100");
  clearUiState();
  saveUiState({
    view: "infographics",
    filters: { ...empty, q: "asma" },
    draft: { ...empty, q: "asma" },
    leadsRef: "ref-a",
  });
  saveNamedState("crmIntel", { agent: { id: "1", name: "Asma" } });

  setUiPersistUser("200");
  assert.equal(loadUiState(empty), null);
  assert.equal(loadNamedState("crmIntel"), null);

  saveUiState({
    view: "listings",
    filters: { ...empty, q: "javeria" },
    draft: { ...empty, q: "javeria" },
    leadsRef: "ref-b",
  });

  setUiPersistUser("100");
  const a = loadUiState(empty);
  assert.equal(a.view, "infographics");
  assert.equal(a.filters.q, "asma");
  assert.equal(a.leadsRef, "ref-a");
  assert.equal(loadNamedState("crmIntel").agent.name, "Asma");

  setUiPersistUser("200");
  const b = loadUiState(empty);
  assert.equal(b.view, "listings");
  assert.equal(b.filters.q, "javeria");
  assert.equal(b.leadsRef, "ref-b");

  assert.ok([...store.keys()].every((k) => k.includes(".u100.") || k.includes(".u200.")));
  assert.ok(UI_PERSIST_TTL_MS >= 60 * 60 * 1000);

  setUiPersistUser("100");
  clearUiState();
  assert.equal(loadUiState(empty), null);
});

test("without user id, persist does not read or write", () => {
  mockStorage();
  setUiPersistUser("");
  saveUiState({ view: "listings", filters: empty, draft: empty, leadsRef: "" });
  assert.equal(loadUiState(empty), null);
  saveNamedState("booking.form", { value: { x: 1 } });
  assert.equal(loadNamedState("booking.form"), null);
});
