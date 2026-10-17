/** Persist desk UI per Bitrix user (page + search/filters). Never share across users. */
import { useEffect, useState } from "react";

export const UI_PERSIST_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const ALLOWED_VIEWS = new Set([
  "overview",
  "listings",
  "leads",
  "infographics",
  "filters",
  "tenancy",
  "booking",
  "noc",
  "noc-movein",
  "noc-moveout",
  "noc-maintenance",
  "noc-trakheesi",
  "form-a",
  "form-i",
  "booking-form",
]);

/** Active Bitrix user id for scoped localStorage keys. */
let persistUserId = "";

export function setUiPersistUser(userId) {
  const next = String(userId || "").replace(/\D/g, "");
  persistUserId = next || "";
}

export function getUiPersistUser() {
  return persistUserId;
}

function scopedKey(name) {
  // No user yet → do not read/write shared keys (prevents cross-user leaks).
  if (!persistUserId) return "";
  return `a7.propertyListing.u${persistUserId}.${name}.v1`;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storageGet(key) {
  if (!key || typeof window === "undefined" || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function storageRemove(key) {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Named JSON blob with the same 4h TTL (infographics, office inventory, …). */
export function loadNamedState(name) {
  const key = scopedKey(name);
  if (!key) return null;
  const raw = storageGet(key);
  if (!raw) return null;
  const data = safeParse(raw);
  if (!data || typeof data !== "object") return null;
  const savedAt = Number(data.savedAt || 0);
  if (!savedAt || Date.now() - savedAt > UI_PERSIST_TTL_MS) {
    storageRemove(key);
    return null;
  }
  return data;
}

export function saveNamedState(name, payload) {
  const key = scopedKey(name);
  if (!key) return;
  storageSet(key, JSON.stringify({ ...payload, savedAt: Date.now(), userId: persistUserId }));
}

export function loadUiState(emptyFilters) {
  const key = scopedKey("uiState");
  if (!key) return null;
  const raw = storageGet(key);
  if (!raw) return null;
  try {
    const data = safeParse(raw);
    if (!data || typeof data !== "object") return null;
    // Reject blobs saved under another user id (extra guard).
    if (data.userId && String(data.userId) !== persistUserId) {
      storageRemove(key);
      return null;
    }
    const savedAt = Number(data.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > UI_PERSIST_TTL_MS) {
      storageRemove(key);
      return null;
    }
    const view = ALLOWED_VIEWS.has(data.view) ? data.view : "listings";
    const filters = { ...emptyFilters, ...(data.filters && typeof data.filters === "object" ? data.filters : {}) };
    const draft = { ...emptyFilters, ...(data.draft && typeof data.draft === "object" ? data.draft : {}) };
    filters.page = Math.max(1, Number(filters.page) || 1);
    filters.pageSize = Number(filters.pageSize) || emptyFilters.pageSize;
    draft.page = Math.max(1, Number(draft.page) || 1);
    return {
      view,
      filters,
      draft,
      leadsRef: String(data.leadsRef || ""),
      savedAt,
    };
  } catch {
    return null;
  }
}

export function saveUiState({ view, filters, draft, leadsRef }) {
  const key = scopedKey("uiState");
  if (!key) return;
  storageSet(
    key,
    JSON.stringify({
      savedAt: Date.now(),
      userId: persistUserId,
      view: ALLOWED_VIEWS.has(view) ? view : "listings",
      filters: filters && typeof filters === "object" ? filters : {},
      draft: draft && typeof draft === "object" ? draft : {},
      leadsRef: String(leadsRef || ""),
    })
  );
}

export function clearUiState() {
  storageRemove(scopedKey("uiState"));
}

/** React state that survives Bitrix tab switches (same 4h TTL, per user). */
export function usePersistedState(name, initialValue) {
  const [state, setState] = useState(() => {
    const saved = loadNamedState(name);
    if (saved && Object.prototype.hasOwnProperty.call(saved, "value")) return saved.value;
    return typeof initialValue === "function" ? initialValue() : initialValue;
  });
  useEffect(() => {
    saveNamedState(name, { value: state });
  }, [name, state]);
  return [state, setState];
}
