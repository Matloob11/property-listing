import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import {
  EXTRA_COLUMNS,
  EXTRA_TEXT_COLUMNS,
  LISTING_SQL_COLUMNS,
  LISTING_SQL_PLACEHOLDERS,
  STATUSES,
  collectMeta,
  diffHistory,
  filterListings,
  historyEntry,
  hydrateRow,
  isListingExpired,
  isPortalLive,
  listingOccupiesDeskLive,
  listingToParams,
  listingUpdateSql,
  nextA7Reference,
  normalizeListing,
  paginate,
  sortListings,
  summarize,
  withHistory,
} from "./listingModel.js";

import { normalizeContract } from "./contracts.js";
import { leadMatchesDate, leadMatchesDateRange } from "./leadDate.js";
import { leadMatchesQuery, leadPortal } from "./leadPortal.js";
import { normalizeTenancy } from "./tenancy.js";
import {
  LEAD_COLUMNS,
  LEAD_JSON,
  LOCATION_COLUMNS,
  PF_USER_COLUMNS,
  normalizeLead,
  normalizeLocation,
  normalizePfUser,
  normalizeTenancyPhoto,
  sqlCreate,
  sqlAlterLeads,
  TENANCY_PHOTO_COLUMNS,
  tenancyPhotoToParams,
} from "./dbExtra.js";

function leadToParams(lead) {
  return LEAD_COLUMNS.map((column) => (LEAD_JSON.has(column) ? JSON.stringify(lead[column] ?? (column === "tags" ? [] : {})) : lead[column] ?? ""));
}
function locationToParams(row) {
  return LOCATION_COLUMNS.map((column) => (column === "tree" ? JSON.stringify(row.tree || []) : row[column] ?? ""));
}
function pfUserToParams(row) {
  return PF_USER_COLUMNS.map((column) => row[column] ?? "");
}

function extraApi(x) {
  return {
    async listingOwnerRefs() {
      if (typeof x.listingOwnerRefs !== "function") return [];
      return x.listingOwnerRefs();
    },
    async getSetting(key, fallback = null) {
      const value = await x.settingGet(key);
      if (value == null) return fallback;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
    async setSetting(key, value) {
      await x.settingSet(key, JSON.stringify(value));
    },
    async leads(filters = {}) {
      let rows = await x.leadsAll();
      if (filters.listing_id) rows = rows.filter((row) => row.listing_id === filters.listing_id);
      if (filters.reference) rows = rows.filter((row) => row.reference === filters.reference);
      if (filters.channel) rows = rows.filter((row) => row.channel === filters.channel);
      if (filters.status) rows = rows.filter((row) => row.status === filters.status);
      if (filters.agent) rows = rows.filter((row) => row.agent_name === filters.agent);
      if (filters.since) rows = rows.filter((row) => row.created_at >= filters.since);
      if (filters.date) rows = rows.filter((row) => leadMatchesDate(row.created_at, filters.date));
      if (filters.date_from || filters.date_to) {
        rows = rows.filter((row) => leadMatchesDateRange(row.created_at, filters.date_from, filters.date_to));
      }
      if (filters.portal) rows = rows.filter((row) => leadPortal(row) === String(filters.portal));
      if (filters.q) rows = rows.filter((row) => leadMatchesQuery(row, filters.q));
      const recordingTotal = rows.filter((row) => String(row.call_record || "").trim()).length;
      if (filters.has_recording === "1" || filters.has_recording === 1 || filters.has_recording === true) {
        rows = rows.filter((row) => String(row.call_record || "").trim());
      }
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const total = rows.length;
      const size = [10, 25, 50, 100].includes(Number(filters.pageSize)) ? Number(filters.pageSize) : 25;
      const maxPage = Math.max(1, Math.ceil(total / size) || 1);
      const page = Math.min(maxPage, Math.max(1, Number(filters.page || 1)));
      return { leads: rows.slice((page - 1) * size, page * size), total, page, pageSize: size, recordingTotal };
    },
    async allLeads() {
      return x.leadsAll();
    },
    async lead(id) {
      const wanted = String(id || "");
      return (await x.leadsAll()).find((row) => row.id === wanted) || null;
    },
    async leadIds() {
      return new Set((await x.leadsAll()).map((row) => row.id));
    },
    async upsertLeads(rows) {
      let n = 0;
      for (const row of rows) {
        const incoming = normalizeLead({ ...row, synced_at: new Date().toISOString() });
        if (!incoming.bitrix_id && x.leadGet) {
          const previous = await x.leadGet(incoming.id);
          if (previous?.bitrix_id) incoming.bitrix_id = previous.bitrix_id;
        }
        await x.leadUpsert(incoming);
        n += 1;
      }
      return n;
    },
    async pfLocation(id) {
      return x.locationGet(String(id));
    },
    async pfLocations() {
      return x.locationsAll();
    },
    async upsertPfLocation(row) {
      await x.locationUpsert(normalizeLocation(row));
    },
    async pfUsers() {
      return x.pfUsersAll();
    },
    async upsertPfUsers(rows) {
      for (const row of rows) await x.pfUserUpsert(normalizePfUser(row));
      return rows.length;
    },
    async tenancyPhotos() {
      return x.tenancyPhotosAll ? x.tenancyPhotosAll() : [];
    },
    async tenancyPhoto(id) {
      return x.tenancyPhotoGet ? x.tenancyPhotoGet(String(id || "")) : null;
    },
    async addTenancyPhoto(row) {
      const photo = normalizeTenancyPhoto({ ...row, id: row.id || newId(), created_at: row.created_at || Date.now() });
      await x.tenancyPhotoInsert(photo);
      return photo;
    },
    async updateTenancyPhoto(id, patch) {
      const current = await x.tenancyPhotoGet(String(id || ""));
      if (!current) return null;
      const photo = normalizeTenancyPhoto({ ...current, ...patch, id: current.id });
      await x.tenancyPhotoUpdate(photo);
      return photo;
    },
    async removeTenancyPhoto(id) {
      const current = await x.tenancyPhotoGet(String(id || ""));
      if (!current) return null;
      if (x.tenancyPhotoRemove) await x.tenancyPhotoRemove(current.id);
      return current;
    },
    async restorePortalLive() {
      return x.restorePortalLiveStatus ? x.restorePortalLiveStatus() : 0;
    },
    async expiredLiveIds(today) {
      return x.expiredLiveIds ? x.expiredLiveIds(today) : [];
    },
  };
}

const TENANCY_COLUMNS = [
  "id",
  "title",
  "stage",
  "template",
  "send_to",
  "owner_name",
  "tenant_name",
  "owner_email",
  "tenant_email",
  "owner_phone",
  "tenant_phone",
  "pdf_name",
  "pdf_path",
  "signed_name",
  "signed_path",
  "listing_id",
  "contract_id",
  "created_by",
  "created_at",
  "updated_at",
  "data",
  "history",
];
const TENANCY_JSON = new Set(["data", "history"]);

function tenancyToParams(row) {
  return TENANCY_COLUMNS.map((column) =>
    TENANCY_JSON.has(column) ? JSON.stringify(row[column] ?? (column === "data" ? {} : [])) : row[column] ?? ""
  );
}

function hydrateTenancy(row) {
  if (!row) return null;
  const out = { ...row };
  for (const column of TENANCY_JSON) {
    if (typeof out[column] === "string") {
      try {
        out[column] = JSON.parse(out[column] || (column === "data" ? "{}" : "[]"));
      } catch {
        out[column] = column === "data" ? {} : [];
      }
    }
  }
  return normalizeTenancy(out);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DIRECTORY_KINDS = [
  "agent",
  "owner",
  "landlord",
  "pf_account",
  "bayut_account",
  "location",
];

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function useMysql() {
  return Boolean(process.env.MYSQL_HOST);
}

function normalizePerson(input) {
  return {
    id: String(input.id || newId()),
    kind: DIRECTORY_KINDS.includes(input.kind) ? input.kind : "agent",
    name: String(input.name || "").trim(),
    email: String(input.email || "").trim(),
    phone: String(input.phone || "").trim(),
    brn: String(input.brn || "").trim(),
    role: String(input.role || "").trim(),
    created_at: input.created_at || nowIso(),
  };
}

const CONTRACT_COLUMNS = [
  "id",
  "listing_id",
  "reference",
  "kind",
  "status",
  "title",
  "created_by",
  "created_at",
  "updated_at",
  "sent_at",
  "completed_at",
  "data",
  "signers",
  "history",
];
const CONTRACT_JSON = new Set(["data", "signers", "history"]);

function contractToParams(contract) {
  return CONTRACT_COLUMNS.map((column) =>
    CONTRACT_JSON.has(column) ? JSON.stringify(contract[column] ?? (column === "data" ? {} : [])) : contract[column] ?? ""
  );
}

function hydrateContract(row) {
  if (!row) return null;
  const out = { ...row };
  for (const column of CONTRACT_JSON) {
    if (typeof out[column] === "string") {
      try {
        out[column] = JSON.parse(out[column] || (column === "data" ? "{}" : "[]"));
      } catch {
        out[column] = column === "data" ? {} : [];
      }
    }
  }
  return normalizeContract(out);
}

function occupyingExpiredIds(rows, today) {
  return (rows || [])
    .filter((row) => listingOccupiesDeskLive(row) && isListingExpired(row, today))
    .map((row) => ({ id: String(row.id), status: row.status || "live" }));
}

function restorablePortalLiveIds(rows, today) {
  return (rows || [])
    .filter((row) => isPortalLive(row) && row.status !== "live" && row.status !== "archived" && !isListingExpired(row, today))
    .map((row) => String(row.id));
}

function storeApi(ops) {
  const { loadAll, insertRow, updateRow, deleteRows, touch, people, addPerson, removePerson, contracts, tenancy, extra } = ops;
  return {
    ...extraApi(extra),
    async findByPfId(pfId) {
      const key = String(pfId || "");
      if (!key) return null;
      return (await loadAll()).find((row) => row.pf_id === key) || null;
    },
    // Direct writes used by bulk sync jobs (no per-row table reload).
    async updateDirect(current, data, by) {
      const next = normalizeListing({ ...current, ...data, id: current.id, created_at: current.created_at, history: current.history });
      const listing = withHistory(next, diffHistory(current, next, by));
      await updateRow(listing);
      return listing;
    },
    async createDirect(data, by) {
      const listing = withHistory(normalizeListing({ ...data, id: newId() }), [
        historyEntry(by || data.created_by, "created", data.status || "draft"),
      ]);
      await insertRow(listing);
      return listing;
    },
    // ---- tenancy contract tool (clone of the Bitrix /tenancy/ page)
    async tenancies() {
      const rows = await tenancy.load();
      return rows.sort((a, b) => b.created_at - a.created_at);
    },
    async tenancy(id) {
      return (await tenancy.load()).find((row) => row.id === id) || null;
    },
    async addTenancy(data) {
      const row = normalizeTenancy(data);
      await tenancy.insert(row);
      return row;
    },
    async updateTenancy(id, patch) {
      const current = await this.tenancy(id);
      if (!current) return null;
      const row = normalizeTenancy({ ...current, ...patch, id, created_at: current.created_at, updated_at: Math.floor(Date.now() / 1000) });
      await tenancy.update(row);
      return row;
    },
    async removeTenancy(id) {
      return tenancy.remove(id);
    },
    // ---- contracts (e-signature)
    async contracts(listingId) {
      const rows = await contracts.load();
      return rows.filter((row) => !listingId || row.listing_id === listingId);
    },
    async allContracts() {
      return contracts.load();
    },
    async contract(id) {
      return (await contracts.load()).find((row) => row.id === id) || null;
    },
    async contractByToken(token) {
      const key = String(token || "");
      if (!key) return null;
      return (await contracts.load()).find((row) => row.signers.some((signer) => signer.token === key)) || null;
    },
    async createContract(data) {
      const contract = normalizeContract({ ...data, id: newId(), created_at: nowIso(), updated_at: nowIso() });
      await contracts.insert(contract);
      return contract;
    },
    async updateContract(id, data) {
      const current = await this.contract(id);
      if (!current) return null;
      const contract = normalizeContract({ ...current, ...data, id, created_at: current.created_at, updated_at: nowIso() });
      await contracts.update(contract);
      return contract;
    },
    async removeContract(id) {
      return contracts.remove(id);
    },
    async counts(filters) {
      return summarize(await loadAll(), filters).counts;
    },
    async infographics(filters) {
      return summarize(await loadAll(), filters).infographics;
    },
    async meta() {
      return collectMeta(await loadAll());
    },
    async list(filters) {
      const rows = sortListings(
        filterListings(await loadAll(), filters),
        filters.sort,
        filters.dir
      );
      return paginate(rows, filters.page, filters.pageSize);
    },
    async listAll(filters) {
      return sortListings(
        filterListings(await loadAll(), filters),
        filters.sort,
        filters.dir
      );
    },
    async all() {
      return loadAll();
    },
    async get(id) {
      return (await loadAll()).find((row) => row.id === id) || null;
    },
    async getByReference(reference) {
      const key = String(reference || "").trim().toLowerCase();
      if (!key) return null;
      return (
        (await loadAll()).find(
          (row) => String(row.reference || "").toLowerCase() === key
        ) || null
      );
    },
    async create(data, by) {
      const listing = withHistory(normalizeListing({ ...data, id: newId() }), [
        historyEntry(by || data.created_by, "created", data.status || "draft"),
      ]);
      await insertRow(listing);
      return listing;
    },
    async update(id, data, by) {
      const current = await this.get(id);
      if (!current) return null;
      const next = normalizeListing({
        ...current,
        ...data,
        id,
        created_at: current.created_at,
        history: current.history,
      });
      const listing = withHistory(next, diffHistory(current, next, by));
      await updateRow(listing);
      return listing;
    },
    async duplicate(id, by) {
      const current = await this.get(id);
      if (!current) return null;
      const stamp = String(Date.now()).slice(-4);
      return this.create(
        {
          ...current,
          id: undefined,
          reference: `${String(current.reference || "a7group").replace(/-copy.*$/, "")}-copy-${stamp}`,
          title: `${current.title || "Listing"} (Copy)`,
          status: "duplicate",
          views: 0,
          history: [],
          created_at: undefined,
          updated_at: undefined,
        },
        by
      );
    },
    async refreshCreate(id, by) {
      const current = await this.get(id);
      if (!current) return null;
      const rows = await loadAll();
      const reference = nextA7Reference(rows);
      let status = current.status;
      if (status === "archived" || status === "duplicate") status = "draft";
      const created = await this.create(
        {
          ...current,
          id: undefined,
          reference,
          title: current.title,
          status,
          views: 0,
          history: [],
          created_at: undefined,
          updated_at: undefined,
          contract_status: "",
          pf_id: "",
          pf_state: "",
          pf_state_type: "",
          pf_is_live: "",
          pf_published_at: "",
          pf_quality_score: "",
          pf_synced_at: "",
          pf_created_at: "",
          pf_updated_at: "",
          pf_quality: {},
          pf_reasons: [],
        },
        by
      );
      const stayLive = isPortalLive(current);
      if (!stayLive) await this.update(current.id, { status: "archived" }, by);
      return {
        listing: created,
        archivedId: stayLive ? "" : current.id,
        previousReference: current.reference,
        stayedLive: stayLive,
      };
    },
    async bulkStatus(ids, status, by) {
      if (!STATUSES.includes(status) || !ids.length) return 0;
      return this.transfer(ids, { status }, by);
    },
    // Apply a patch to many listings. `patch` may be an object or a function(row) => object.
    async transfer(ids, patch, by) {
      if (!ids.length) return 0;
      const rows = await loadAll();
      let n = 0;
      for (const id of ids) {
        const current = rows.find((row) => row.id === id);
        if (!current) continue;
        const change = typeof patch === "function" ? patch(current) : patch;
        if (!change) continue;
        const next = normalizeListing({
          ...current,
          ...change,
          id,
          created_at: current.created_at,
          history: current.history,
        });
        const entries = diffHistory(current, next, by);
        if (change.__note) entries.push(historyEntry(by, change.__note, change.__value || ""));
        await updateRow(withHistory(next, entries));
        n += 1;
      }
      return n;
    },
    async remove(ids) {
      if (!ids.length) return 0;
      return deleteRows(ids);
    },
    async addView(id) {
      const current = await this.get(id);
      if (!current) return null;
      const listing = normalizeListing(
        { ...current, views: Number(current.views || 0) + 1 },
        { keepDates: true }
      );
      await updateRow(listing);
      return listing;
    },
    async upsertByReference(data, by) {
      const existing = await this.getByReference(data.reference);
      if (existing) {
        return { listing: await this.update(existing.id, data, by), created: false };
      }
      return { listing: await this.create(data, by), created: true };
    },
    async seedIfEmpty(rows) {
      if ((await loadAll()).length) return;
      for (const row of rows) {
        await insertRow(normalizeListing({ ...row, id: row.id || newId() }));
      }
    },
    async enrich(rows) {
      const current = await loadAll();
      const byId = new Map(current.map((row) => [row.id, row]));
      for (const row of rows) {
        const listing = normalizeListing({ ...row, id: row.id || newId() });
        const existing = byId.get(listing.id);
        if (!existing) {
          await insertRow(listing);
        } else if (!existing.unit_no && listing.unit_no) {
          await updateRow(
            normalizeListing({
              ...existing,
              ...listing,
              id: existing.id,
              created_at: existing.created_at,
            })
          );
        }
      }
    },
    async touchUser(user) {
      await touch(user);
    },
    async people(kind) {
      const rows = await people();
      return kind ? rows.filter((row) => row.kind === kind) : rows;
    },
    async addPerson(data) {
      const person = normalizePerson(data);
      if (!person.name) throw new Error("Name is required");
      const rows = await people();
      const dup = rows.find(
        (row) => row.kind === person.kind && row.name.toLowerCase() === person.name.toLowerCase()
      );
      if (dup) return dup;
      await addPerson(person);
      return person;
    },
    async removePerson(id) {
      return removePerson(id);
    },
  };
}

function createMysql() {
  return import("mysql2/promise").then(async (mysql) => {
    const pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 8,
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id VARCHAR(32) PRIMARY KEY,
        reference VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        community VARCHAR(255) NOT NULL,
        city VARCHAR(128) NOT NULL,
        type VARCHAR(64) NOT NULL,
        purpose VARCHAR(16) NOT NULL,
        status VARCHAR(32) NOT NULL,
        beds INT NOT NULL,
        baths INT NOT NULL,
        area_sqft INT NOT NULL,
        price_aed BIGINT NOT NULL,
        photo VARCHAR(512) NOT NULL,
        portals TEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL
      )
    `);
    await pool.query(`ALTER TABLE listings MODIFY price_aed BIGINT NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE listings MODIFY photo TEXT NOT NULL`).catch(() => {});
    // InnoDB caps a row at 65535 bytes of VARCHAR data, so the many extra
    // columns are stored as TEXT (which does not count toward that cap).
    const [existing] = await pool.query(
      `SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'listings'`
    );
    const have = new Map(existing.map((row) => [String(row.name).toLowerCase(), String(row.type).toLowerCase()]));
    for (const column of EXTRA_COLUMNS) {
      const type = have.get(column);
      if (!type) {
        await pool.query(`ALTER TABLE listings ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
      } else if (type === "varchar") {
        await pool.query(`ALTER TABLE listings MODIFY ${column} TEXT NOT NULL DEFAULT ''`);
      }
    }
    for (const column of EXTRA_TEXT_COLUMNS) {
      const type = have.get(column);
      if (!type) {
        await pool.query(`ALTER TABLE listings ADD COLUMN ${column} MEDIUMTEXT`);
      } else if (type !== "mediumtext" && type !== "longtext") {
        await pool.query(`ALTER TABLE listings MODIFY ${column} MEDIUMTEXT`).catch(() => {});
      }
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS listing_media (
        id VARCHAR(32) PRIMARY KEY,
        listing_id VARCHAR(32) NOT NULL,
        url VARCHAR(512) NOT NULL,
        sort_order INT NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users_cache (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        admin TINYINT NOT NULL,
        last_seen VARCHAR(40) NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS directory (
        id VARCHAR(32) PRIMARY KEY,
        kind VARCHAR(32) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL DEFAULT '',
        phone VARCHAR(64) NOT NULL DEFAULT '',
        brn VARCHAR(64) NOT NULL DEFAULT '',
        role VARCHAR(64) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL
      )
    `);

    const loadAll = async () => {
      const [rows] = await pool.query("SELECT * FROM listings");
      return rows.map(hydrateRow);
    };
    const insertRow = async (listing) => {
      await pool.query(
        `INSERT INTO listings (${LISTING_SQL_COLUMNS}) VALUES (${LISTING_SQL_PLACEHOLDERS})`,
        listingToParams(listing)
      );
    };
    const updateRow = async (listing) => {
      await pool.query(listingUpdateSql(), [
        ...listingToParams(listing).slice(1),
        listing.id,
      ]);
    };
    const deleteRows = async (ids) => {
      const [result] = await pool.query(
        `DELETE FROM listings WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
      );
      return result.affectedRows || 0;
    };
    const touch = async (user) => {
      await pool.query(
        `INSERT INTO users_cache (id, name, email, admin, last_seen)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), email=VALUES(email),
           admin=VALUES(admin), last_seen=VALUES(last_seen)`,
        [
          String(user.id),
          user.name || "",
          user.email || "",
          user.admin ? 1 : 0,
          nowIso(),
        ]
      );
    };
    const people = async () => {
      const [rows] = await pool.query("SELECT * FROM directory ORDER BY name");
      return rows.map(normalizePerson);
    };
    const addPerson = async (person) => {
      await pool.query(
        `INSERT INTO directory (id, kind, name, email, phone, brn, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [person.id, person.kind, person.name, person.email, person.phone, person.brn, person.role, person.created_at]
      );
    };
    const removePerson = async (id) => {
      const [result] = await pool.query("DELETE FROM directory WHERE id = ?", [id]);
      return result.affectedRows || 0;
    };
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id VARCHAR(32) PRIMARY KEY,
        listing_id VARCHAR(32) NOT NULL,
        reference VARCHAR(64) NOT NULL DEFAULT '',
        kind VARCHAR(16) NOT NULL DEFAULT 'tenancy',
        status VARCHAR(24) NOT NULL DEFAULT 'draft',
        title VARCHAR(255) NOT NULL DEFAULT '',
        created_by VARCHAR(255) NOT NULL DEFAULT '',
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        sent_at VARCHAR(40) NOT NULL DEFAULT '',
        completed_at VARCHAR(40) NOT NULL DEFAULT '',
        data MEDIUMTEXT,
        signers MEDIUMTEXT,
        history MEDIUMTEXT,
        INDEX (listing_id)
      )
    `);
    const contracts = {
      load: async () => {
        const [rows] = await pool.query("SELECT * FROM contracts ORDER BY created_at DESC");
        return rows.map(hydrateContract);
      },
      insert: async (contract) => {
        await pool.query(
          `INSERT INTO contracts (${CONTRACT_COLUMNS.join(", ")}) VALUES (${CONTRACT_COLUMNS.map(() => "?").join(",")})`,
          contractToParams(contract)
        );
      },
      update: async (contract) => {
        const columns = CONTRACT_COLUMNS.filter((column) => column !== "id");
        await pool.query(
          `UPDATE contracts SET ${columns.map((column) => `${column}=?`).join(", ")} WHERE id=?`,
          [...contractToParams(contract).slice(1), contract.id]
        );
      },
      remove: async (id) => {
        const [result] = await pool.query("DELETE FROM contracts WHERE id = ?", [id]);
        return result.affectedRows || 0;
      },
    };
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenancy (
        id VARCHAR(40) PRIMARY KEY,
        title VARCHAR(255) NOT NULL DEFAULT '',
        stage VARCHAR(24) NOT NULL DEFAULT 'draft',
        template VARCHAR(32) NOT NULL DEFAULT 'ejari',
        send_to VARCHAR(24) NOT NULL DEFAULT '',
        owner_name VARCHAR(255) NOT NULL DEFAULT '',
        tenant_name VARCHAR(255) NOT NULL DEFAULT '',
        owner_email VARCHAR(255) NOT NULL DEFAULT '',
        tenant_email VARCHAR(255) NOT NULL DEFAULT '',
        owner_phone VARCHAR(64) NOT NULL DEFAULT '',
        tenant_phone VARCHAR(64) NOT NULL DEFAULT '',
        pdf_name VARCHAR(255) NOT NULL DEFAULT '',
        pdf_path VARCHAR(512) NOT NULL DEFAULT '',
        signed_name VARCHAR(255) NOT NULL DEFAULT '',
        signed_path VARCHAR(512) NOT NULL DEFAULT '',
        listing_id VARCHAR(32) NOT NULL DEFAULT '',
        contract_id VARCHAR(32) NOT NULL DEFAULT '',
        created_by VARCHAR(255) NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL DEFAULT 0,
        updated_at BIGINT NOT NULL DEFAULT 0,
        data MEDIUMTEXT,
        history MEDIUMTEXT
      )
    `);
    const tenancy = {
      load: async () => {
        const [rows] = await pool.query("SELECT * FROM tenancy ORDER BY created_at DESC");
        return rows.map(hydrateTenancy);
      },
      insert: async (row) => {
        await pool.query(
          `INSERT INTO tenancy (${TENANCY_COLUMNS.join(", ")}) VALUES (${TENANCY_COLUMNS.map(() => "?").join(",")})`,
          tenancyToParams(row)
        );
      },
      update: async (row) => {
        const columns = TENANCY_COLUMNS.filter((column) => column !== "id");
        await pool.query(`UPDATE tenancy SET ${columns.map((column) => `${column}=?`).join(", ")} WHERE id=?`, [
          ...tenancyToParams(row).slice(1),
          row.id,
        ]);
      },
      remove: async (id) => {
        const [result] = await pool.query("DELETE FROM tenancy WHERE id = ?", [id]);
        return result.affectedRows || 0;
      },
    };
    for (const sql of sqlCreate("mysql")) await pool.query(sql);
    for (const sql of sqlAlterLeads("mysql")) await pool.query(sql).catch(() => {});
    const upsertSql = (table, columns) =>
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(",")}) ON DUPLICATE KEY UPDATE ${columns
        .slice(1)
        .map((c) => `${c}=VALUES(${c})`)
        .join(", ")}`;
    const extra = {
      settingGet: async (key) => {
        const [rows] = await pool.query("SELECT v FROM settings WHERE k = ?", [key]);
        return rows[0]?.v ?? null;
      },
      settingSet: async (key, value) => {
        await pool.query("INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v=VALUES(v)", [key, value]);
      },
      listingOwnerRefs: async () => {
        const [rows] = await pool.query(
          "SELECT reference, listing_owner AS owner FROM listings WHERE TRIM(reference) <> '' AND TRIM(listing_owner) <> ''"
        );
        return rows;
      },
      leadsAll: async () => {
        const [rows] = await pool.query("SELECT * FROM leads");
        return rows.map(normalizeLead);
      },
      leadGet: async (id) => {
        const [rows] = await pool.query("SELECT * FROM leads WHERE id = ?", [String(id || "")]);
        return rows[0] ? normalizeLead(rows[0]) : null;
      },
      leadUpsert: async (lead) => {
        await pool.query(upsertSql("leads", LEAD_COLUMNS), leadToParams(lead));
      },
      locationGet: async (id) => {
        const [rows] = await pool.query("SELECT * FROM pf_locations WHERE id = ?", [id]);
        return rows[0] ? normalizeLocation(rows[0]) : null;
      },
      locationsAll: async () => {
        const [rows] = await pool.query("SELECT * FROM pf_locations");
        return rows.map(normalizeLocation);
      },
      locationUpsert: async (row) => {
        await pool.query(upsertSql("pf_locations", LOCATION_COLUMNS), locationToParams(row));
      },
      pfUsersAll: async () => {
        const [rows] = await pool.query("SELECT * FROM pf_users ORDER BY name");
        return rows.map(normalizePfUser);
      },
      pfUserUpsert: async (row) => {
        await pool.query(upsertSql("pf_users", PF_USER_COLUMNS), pfUserToParams(row));
      },
      tenancyPhotosAll: async () => {
        const [rows] = await pool.query("SELECT * FROM tenancy_photos ORDER BY created_at DESC");
        return rows.map(normalizeTenancyPhoto);
      },
      tenancyPhotoGet: async (id) => {
        const [rows] = await pool.query("SELECT * FROM tenancy_photos WHERE id = ?", [id]);
        return rows[0] ? normalizeTenancyPhoto(rows[0]) : null;
      },
      tenancyPhotoInsert: async (row) => {
        await pool.query(
          `INSERT INTO tenancy_photos (${TENANCY_PHOTO_COLUMNS.join(", ")}) VALUES (${TENANCY_PHOTO_COLUMNS.map(() => "?").join(",")})`,
          tenancyPhotoToParams(row)
        );
      },
      tenancyPhotoUpdate: async (row) => {
        const columns = TENANCY_PHOTO_COLUMNS.filter((column) => column !== "id");
        await pool.query(`UPDATE tenancy_photos SET ${columns.map((column) => `${column}=?`).join(", ")} WHERE id=?`, [
          ...tenancyPhotoToParams(row).slice(1),
          row.id,
        ]);
      },
      tenancyPhotoRemove: async (id) => {
        await pool.query("DELETE FROM tenancy_photos WHERE id = ?", [id]);
      },
      restorePortalLiveStatus: async () => {
        const [rows] = await pool.query(
          "SELECT id, status, portal_expiry, permit_expiry_date, pf_is_live, pf_state FROM listings WHERE status <> 'live' AND (pf_is_live = '1' OR pf_state = 'live')"
        );
        const ids = restorablePortalLiveIds(rows);
        if (!ids.length) return 0;
        const [result] = await pool.query(
          `UPDATE listings SET status = 'live' WHERE id IN (${ids.map(() => "?").join(",")})`,
          ids
        );
        return result.affectedRows || 0;
      },
      expiredLiveIds: async (today) => {
        const [rows] = await pool.query(
          "SELECT id, status, portal_expiry, permit_expiry_date, pf_is_live, pf_state FROM listings WHERE status IN ('live', 'pending') OR pf_is_live = '1' OR pf_state = 'live'"
        );
        return occupyingExpiredIds(rows, today);
      },
    };
    return storeApi({ loadAll, insertRow, updateRow, deleteRows, touch, people, addPerson, removePerson, contracts, tenancy, extra });
  });
}

function createSqlite() {
  return import("better-sqlite3").then((mod) => {
    const Database = mod.default;
    const dir = path.join(root, "data");
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(path.join(dir, "listings.sqlite"));
    db.exec(`
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        reference TEXT NOT NULL,
        title TEXT NOT NULL,
        community TEXT NOT NULL,
        city TEXT NOT NULL,
        type TEXT NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT NOT NULL,
        beds INTEGER NOT NULL,
        baths INTEGER NOT NULL,
        area_sqft INTEGER NOT NULL,
        price_aed INTEGER NOT NULL,
        photo TEXT NOT NULL,
        portals TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS listing_media (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        url TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users_cache (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        admin INTEGER NOT NULL,
        last_seen TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS directory (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        brn TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);
    const have = new Set(
      db.prepare("PRAGMA table_info(listings)").all().map((col) => col.name)
    );
    for (const column of [...EXTRA_COLUMNS, ...EXTRA_TEXT_COLUMNS]) {
      if (!have.has(column)) {
        db.exec(
          `ALTER TABLE listings ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`
        );
      }
    }

    const loadAll = async () =>
      db.prepare("SELECT * FROM listings").all().map(hydrateRow);
    const insertRow = async (listing) => {
      db.prepare(
        `INSERT INTO listings (${LISTING_SQL_COLUMNS}) VALUES (${LISTING_SQL_PLACEHOLDERS})`
      ).run(...listingToParams(listing));
    };
    const updateRow = async (listing) => {
      db.prepare(listingUpdateSql()).run(
        ...listingToParams(listing).slice(1),
        listing.id
      );
    };
    const deleteRows = async (ids) => {
      const result = db
        .prepare(`DELETE FROM listings WHERE id IN (${ids.map(() => "?").join(",")})`)
        .run(...ids);
      return result.changes || 0;
    };
    const touch = async (user) => {
      db.prepare(
        `INSERT INTO users_cache (id, name, email, admin, last_seen)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, email=excluded.email,
           admin=excluded.admin, last_seen=excluded.last_seen`
      ).run(
        String(user.id),
        user.name || "",
        user.email || "",
        user.admin ? 1 : 0,
        nowIso()
      );
    };
    const people = async () =>
      db.prepare("SELECT * FROM directory ORDER BY name").all().map(normalizePerson);
    const addPerson = async (person) => {
      db.prepare(
        `INSERT INTO directory (id, kind, name, email, phone, brn, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(person.id, person.kind, person.name, person.email, person.phone, person.brn, person.role, person.created_at);
    };
    const removePerson = async (id) =>
      db.prepare("DELETE FROM directory WHERE id = ?").run(id).changes || 0;
    db.exec(`
      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        reference TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'tenancy',
        status TEXT NOT NULL DEFAULT 'draft',
        title TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT '',
        completed_at TEXT NOT NULL DEFAULT '',
        data TEXT,
        signers TEXT,
        history TEXT
      );
    `);
    const contracts = {
      load: async () => db.prepare("SELECT * FROM contracts ORDER BY created_at DESC").all().map(hydrateContract),
      insert: async (contract) => {
        db.prepare(
          `INSERT INTO contracts (${CONTRACT_COLUMNS.join(", ")}) VALUES (${CONTRACT_COLUMNS.map(() => "?").join(",")})`
        ).run(...contractToParams(contract));
      },
      update: async (contract) => {
        const columns = CONTRACT_COLUMNS.filter((column) => column !== "id");
        db.prepare(`UPDATE contracts SET ${columns.map((column) => `${column}=?`).join(", ")} WHERE id=?`).run(
          ...contractToParams(contract).slice(1),
          contract.id
        );
      },
      remove: async (id) => db.prepare("DELETE FROM contracts WHERE id = ?").run(id).changes || 0,
    };
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenancy (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        stage TEXT NOT NULL DEFAULT 'draft',
        template TEXT NOT NULL DEFAULT 'ejari',
        send_to TEXT NOT NULL DEFAULT '',
        owner_name TEXT NOT NULL DEFAULT '',
        tenant_name TEXT NOT NULL DEFAULT '',
        owner_email TEXT NOT NULL DEFAULT '',
        tenant_email TEXT NOT NULL DEFAULT '',
        owner_phone TEXT NOT NULL DEFAULT '',
        tenant_phone TEXT NOT NULL DEFAULT '',
        pdf_name TEXT NOT NULL DEFAULT '',
        pdf_path TEXT NOT NULL DEFAULT '',
        signed_name TEXT NOT NULL DEFAULT '',
        signed_path TEXT NOT NULL DEFAULT '',
        listing_id TEXT NOT NULL DEFAULT '',
        contract_id TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0,
        data TEXT,
        history TEXT
      );
    `);
    const tenancy = {
      load: async () => db.prepare("SELECT * FROM tenancy ORDER BY created_at DESC").all().map(hydrateTenancy),
      insert: async (row) => {
        db.prepare(`INSERT INTO tenancy (${TENANCY_COLUMNS.join(", ")}) VALUES (${TENANCY_COLUMNS.map(() => "?").join(",")})`).run(
          ...tenancyToParams(row)
        );
      },
      update: async (row) => {
        const columns = TENANCY_COLUMNS.filter((column) => column !== "id");
        db.prepare(`UPDATE tenancy SET ${columns.map((column) => `${column}=?`).join(", ")} WHERE id=?`).run(
          ...tenancyToParams(row).slice(1),
          row.id
        );
      },
      remove: async (id) => db.prepare("DELETE FROM tenancy WHERE id = ?").run(id).changes || 0,
    };
    for (const sql of sqlCreate("sqlite")) db.exec(sql);
    for (const sql of sqlAlterLeads("sqlite")) {
      try {
        db.exec(sql);
      } catch {
        /* column already exists */
      }
    }
    const upsertSql = (table, columns, key) =>
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(${key}) DO UPDATE SET ${columns
        .slice(1)
        .map((c) => `${c}=excluded.${c}`)
        .join(", ")}`;
    const extra = {
      settingGet: async (key) => db.prepare("SELECT v FROM settings WHERE k = ?").get(key)?.v ?? null,
      settingSet: async (key, value) => {
        db.prepare("INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(key, value);
      },
      leadsAll: async () => db.prepare("SELECT * FROM leads").all().map(normalizeLead),
      leadGet: async (id) => {
        const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(String(id || ""));
        return row ? normalizeLead(row) : null;
      },
      leadUpsert: async (lead) => {
        db.prepare(upsertSql("leads", LEAD_COLUMNS, "id")).run(...leadToParams(lead));
      },
      locationGet: async (id) => {
        const row = db.prepare("SELECT * FROM pf_locations WHERE id = ?").get(id);
        return row ? normalizeLocation(row) : null;
      },
      locationsAll: async () => db.prepare("SELECT * FROM pf_locations").all().map(normalizeLocation),
      locationUpsert: async (row) => {
        db.prepare(upsertSql("pf_locations", LOCATION_COLUMNS, "id")).run(...locationToParams(row));
      },
      pfUsersAll: async () => db.prepare("SELECT * FROM pf_users ORDER BY name").all().map(normalizePfUser),
      pfUserUpsert: async (row) => {
        db.prepare(upsertSql("pf_users", PF_USER_COLUMNS, "pf_id")).run(...pfUserToParams(row));
      },
      tenancyPhotosAll: async () => db.prepare("SELECT * FROM tenancy_photos ORDER BY created_at DESC").all().map(normalizeTenancyPhoto),
      tenancyPhotoGet: async (id) => {
        const row = db.prepare("SELECT * FROM tenancy_photos WHERE id = ?").get(id);
        return row ? normalizeTenancyPhoto(row) : null;
      },
      tenancyPhotoInsert: async (row) => {
        db.prepare(
          `INSERT INTO tenancy_photos (${TENANCY_PHOTO_COLUMNS.join(", ")}) VALUES (${TENANCY_PHOTO_COLUMNS.map(() => "?").join(",")})`
        ).run(...tenancyPhotoToParams(row));
      },
      tenancyPhotoUpdate: async (row) => {
        const columns = TENANCY_PHOTO_COLUMNS.filter((column) => column !== "id");
        db.prepare(`UPDATE tenancy_photos SET ${columns.map((column) => `${column}=?`).join(", ")} WHERE id=?`).run(
          ...tenancyPhotoToParams(row).slice(1),
          row.id
        );
      },
      tenancyPhotoRemove: async (id) => {
        db.prepare("DELETE FROM tenancy_photos WHERE id = ?").run(id);
      },
      restorePortalLiveStatus: async () => {
        const rows = db
          .prepare(
            "SELECT id, status, portal_expiry, permit_expiry_date, pf_is_live, pf_state FROM listings WHERE status <> 'live' AND (pf_is_live = '1' OR pf_state = 'live')"
          )
          .all();
        const ids = restorablePortalLiveIds(rows);
        if (!ids.length) return 0;
        const result = db.prepare(`UPDATE listings SET status = 'live' WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
        return result.changes || 0;
      },
      expiredLiveIds: async (today) => {
        const rows = db
          .prepare(
            "SELECT id, status, portal_expiry, permit_expiry_date, pf_is_live, pf_state FROM listings WHERE status IN ('live', 'pending') OR pf_is_live = '1' OR pf_state = 'live'"
          )
          .all();
        return occupyingExpiredIds(rows, today);
      },
    };
    return storeApi({ loadAll, insertRow, updateRow, deleteRows, touch, people, addPerson, removePerson, contracts, tenancy, extra });
  });
}

function createJsonStore() {
  const file = path.join(root, "data", "listings.json");
  const peopleFile = path.join(root, "data", "directory.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const read = () => {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf8")).map(hydrateRow);
  };
  const write = (rows) => {
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  };
  const readPeople = () =>
    fs.existsSync(peopleFile) ? JSON.parse(fs.readFileSync(peopleFile, "utf8")) : [];
  const writePeople = (rows) => fs.writeFileSync(peopleFile, JSON.stringify(rows, null, 2));
  const loadAll = async () => read();
  const insertRow = async (listing) => {
    const rows = read();
    rows.push(listing);
    write(rows);
  };
  const updateRow = async (listing) => {
    write(read().map((row) => (row.id === listing.id ? listing : row)));
  };
  const deleteRows = async (ids) => {
    const rows = read();
    const keep = rows.filter((row) => !ids.includes(row.id));
    write(keep);
    return rows.length - keep.length;
  };
  const people = async () => readPeople().map(normalizePerson);
  const addPerson = async (person) => writePeople([...readPeople(), person]);
  const removePerson = async (id) => {
    const rows = readPeople();
    const keep = rows.filter((row) => row.id !== id);
    writePeople(keep);
    return rows.length - keep.length;
  };
  const contractsFile = path.join(root, "data", "contracts.json");
  const readContracts = () =>
    fs.existsSync(contractsFile) ? JSON.parse(fs.readFileSync(contractsFile, "utf8")).map(hydrateContract) : [];
  const writeContracts = (rows) => fs.writeFileSync(contractsFile, JSON.stringify(rows, null, 2));
  const contracts = {
    load: async () => readContracts(),
    insert: async (contract) => writeContracts([contract, ...readContracts()]),
    update: async (contract) => writeContracts(readContracts().map((row) => (row.id === contract.id ? contract : row))),
    remove: async (id) => {
      const rows = readContracts();
      const keep = rows.filter((row) => row.id !== id);
      writeContracts(keep);
      return rows.length - keep.length;
    },
  };
  const tenancyFile = path.join(root, "data", "tenancy.json");
  const readTenancy = () =>
    fs.existsSync(tenancyFile) ? JSON.parse(fs.readFileSync(tenancyFile, "utf8")).map(hydrateTenancy) : [];
  const writeTenancy = (rows) => fs.writeFileSync(tenancyFile, JSON.stringify(rows, null, 2));
  const tenancy = {
    load: async () => readTenancy(),
    insert: async (row) => writeTenancy([row, ...readTenancy()]),
    update: async (row) => writeTenancy(readTenancy().map((item) => (item.id === row.id ? row : item))),
    remove: async (id) => {
      const rows = readTenancy();
      const keep = rows.filter((row) => row.id !== id);
      writeTenancy(keep);
      return rows.length - keep.length;
    },
  };
  const jsonTable = (name, key) => {
    const file = path.join(root, "data", `${name}.json`);
    const read = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []);
    const write = (rows) => fs.writeFileSync(file, JSON.stringify(rows, null, 2));
    return {
      all: async () => read(),
      get: async (id) => read().find((row) => row[key] === id) || null,
      upsert: async (row) => {
        const rows = read().filter((item) => item[key] !== row[key]);
        rows.push(row);
        write(rows);
      },
      remove: async (id) => {
        const rows = read();
        write(rows.filter((item) => item[key] !== id));
      },
    };
  };
  const settingsT = jsonTable("settings", "k");
  const leadsT = jsonTable("leads", "id");
  const locT = jsonTable("pf_locations", "id");
  const usersT = jsonTable("pf_users", "pf_id");
  const photosT = jsonTable("tenancy_photos", "id");
  const extra = {
    settingGet: async (key) => (await settingsT.get(key))?.v ?? null,
    settingSet: async (key, value) => settingsT.upsert({ k: key, v: value }),
    leadsAll: async () => (await leadsT.all()).map(normalizeLead),
    leadGet: async (id) => {
      const row = await leadsT.get(String(id || ""));
      return row ? normalizeLead(row) : null;
    },
    leadUpsert: async (lead) => leadsT.upsert(lead),
    locationGet: async (id) => {
      const row = await locT.get(id);
      return row ? normalizeLocation(row) : null;
    },
    locationsAll: async () => (await locT.all()).map(normalizeLocation),
    locationUpsert: async (row) => locT.upsert(row),
    pfUsersAll: async () => (await usersT.all()).map(normalizePfUser),
    pfUserUpsert: async (row) => usersT.upsert(row),
    tenancyPhotosAll: async () => (await photosT.all()).map(normalizeTenancyPhoto),
    tenancyPhotoGet: async (id) => {
      const row = await photosT.get(id);
      return row ? normalizeTenancyPhoto(row) : null;
    },
    tenancyPhotoInsert: async (row) => photosT.upsert(normalizeTenancyPhoto(row)),
    tenancyPhotoUpdate: async (row) => photosT.upsert(normalizeTenancyPhoto(row)),
    tenancyPhotoRemove: async (id) => photosT.remove(id),
    restorePortalLiveStatus: async () => {
      if (!fs.existsSync(file)) return 0;
      const rows = JSON.parse(fs.readFileSync(file, "utf8"));
      const keep = new Set(restorablePortalLiveIds(rows));
      let n = 0;
      const next = rows.map((row) => {
        if (!keep.has(String(row.id))) return row;
        n += 1;
        return { ...row, status: "live" };
      });
      if (n) write(next);
      return n;
    },
    expiredLiveIds: async (today) => {
      if (!fs.existsSync(file)) return [];
      return occupyingExpiredIds(JSON.parse(fs.readFileSync(file, "utf8")), today);
    },
  };
  return storeApi({
    loadAll,
    insertRow,
    updateRow,
    deleteRows,
    touch: async () => {},
    people,
    addPerson,
    removePerson,
    contracts,
    tenancy,
    extra,
  });
}

export { STATUSES };

export async function openDb() {
  if (useMysql()) return createMysql();
  try {
    return await createSqlite();
  } catch (error) {
    console.warn("SQLite unavailable, using JSON store:", error.message);
    return createJsonStore();
  }
}
