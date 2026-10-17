// Runs the Property Finder -> desk synchronisation.
import { fetchAllListings, fetchAllUsers, fetchCredits, fetchLeadPage, fetchLeads, fetchLocation, mapLead, mapListing, mapUser, pfConfigured } from "./pf.js";
import { pushPfLeadsToBitrix, scheduleBitrixLeadSync } from "./bitrixLeadSync.js";

let running = null;

export function syncRunning() {
  return Boolean(running);
}

export async function runPfSync(db, { by = "Property Finder sync", leadPages } = {}) {
  if (!pfConfigured()) throw new Error("Property Finder API is not configured (PF_API_KEY / PF_API_SECRET).");
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    const summary = { started_at: new Date(started).toISOString(), listings: 0, created: 0, updated: 0, leads: 0, users: 0, locations: 0, demo_removed: 0, errors: [] };
    try {
      // 1. agents
      try {
        const users = (await fetchAllUsers()).map(mapUser);
        await db.upsertPfUsers(users);
        summary.users = users.length;
        for (const user of users) {
          if (user.name) await db.addPerson({ kind: "agent", name: user.name, email: user.email, phone: user.phone, role: user.position || user.role }).catch(() => {});
        }
      } catch (error) {
        summary.errors.push(`users: ${error.message}`);
      }
      const users = await db.pfUsers();
      const userById = new Map(users.map((u) => [u.pf_id, u]));

      // 2. listings (+ locations)
      const pfListings = await fetchAllListings();
      summary.listings = pfListings.length;
      const locationIds = [...new Set(pfListings.map((row) => row.location?.id).filter(Boolean).map(String))];
      const locations = new Map();
      for (const id of locationIds) {
        let loc = await db.pfLocation(id);
        if (!loc) {
          try {
            const fetched = await fetchLocation(id);
            if (fetched) {
              await db.upsertPfLocation({ id: String(fetched.id), name: fetched.name, type: fetched.type, tree: fetched.tree, lat: fetched.coordinates?.lat, lng: fetched.coordinates?.lng });
              loc = await db.pfLocation(id);
              summary.locations += 1;
            }
          } catch (error) {
            summary.errors.push(`location ${id}: ${error.message}`);
          }
        }
        if (loc) locations.set(id, loc);
      }
      const pfIdToListingId = new Map();
      const currentRows = await db.all();
      const byPfId = new Map(currentRows.filter((row) => row.pf_id).map((row) => [row.pf_id, row]));
      const byRef = new Map(currentRows.map((row) => [String(row.reference || "").toLowerCase(), row]));
      for (const pf of pfListings) {
        try {
          const mapped = mapListing(pf, locations.get(String(pf.location?.id || "")), userById.get(String(pf.assignedTo?.id || "")));
          const existing = byPfId.get(mapped.pf_id) || byRef.get(mapped.reference.toLowerCase());
          if (existing) {
            const patch = { ...mapped };
            delete patch.created_at;
            delete patch.created_by;
            // Keep desk-entered data that PF does not know about (old desk import / manual edits).
            patch.portals = [...new Set([...(existing.portals || []), ...(mapped.portals || [])])];
            if (existing.project_status) patch.project_status = existing.project_status;
            if (existing.listing_owner) patch.listing_owner = existing.listing_owner;
            if (existing.plot_size && !mapped.plot_size) patch.plot_size = existing.plot_size;
            const changed = Object.keys(patch).some((key) => !["pf_synced_at", "updated_at"].includes(key) && JSON.stringify(existing[key]) !== JSON.stringify(patch[key]));
            if (changed) {
              await db.updateDirect(existing, patch, by);
              summary.updated += 1;
            }
            pfIdToListingId.set(mapped.pf_id, existing.id);
          } else {
            const created = await db.createDirect({ ...mapped, history: [] }, by);
            pfIdToListingId.set(mapped.pf_id, created.id);
            summary.created += 1;
          }
        } catch (error) {
          summary.errors.push(`listing ${pf.reference || pf.id}: ${error.message}`);
        }
        // let API requests breathe between rows
        await new Promise((resolve) => setImmediate(resolve));
      }

      // 3. remove the demo rows now that real data is in
      const demoIds = (await db.all()).filter((row) => /^demo\d+$/.test(row.id)).map((row) => row.id);
      if (demoIds.length) summary.demo_removed = await db.remove(demoIds);

      // 4. leads + recent call recordings
      try {
        const pfIdMap = pfIdToListingId.size ? pfIdToListingId : await listingIdMap(db);
        const leadSummary = await syncLeads(db, {
          pfIdToListingId: pfIdMap,
          maxPages: leadPages || 20,
          minPages: 8,
        });
        summary.leads = leadSummary.upserted;
        summary.leads_new = leadSummary.added;
      } catch (error) {
        summary.errors.push(`leads: ${error.message}`);
      }

      // 5. credits
      try {
        await db.setSetting("pf_credits", { ...(await fetchCredits()), fetched_at: new Date().toISOString() });
      } catch (error) {
        summary.errors.push(`credits: ${error.message}`);
      }
    } catch (error) {
      summary.errors.push(error.message);
    }
    summary.finished_at = new Date().toISOString();
    summary.duration_ms = Date.now() - started;
    await db.setSetting("pf_last_sync", summary);
    return summary;
  })().finally(() => {
    running = null;
  });
  return running;
}

async function listingIdMap(db) {
  const map = new Map();
  for (const row of await db.all()) {
    if (row.pf_id) map.set(String(row.pf_id), row.id);
  }
  return map;
}

export function enrichPfLead(lead, previous, pfIdToListingId, userByProfile) {
  return {
    ...lead,
    listing_id: pfIdToListingId.get(lead.pf_listing_id) || previous?.listing_id || "",
    agent_name: userByProfile.get(lead.agent_pf_profile)?.name || previous?.agent_name || "",
    call_record: lead.call_record || previous?.call_record || "",
    bitrix_id: previous?.bitrix_id || "",
  };
}

export function nextLeadRefreshPage(page, hasNext) {
  return hasNext ? Math.max(1, Number(page) || 1) + 1 : 1;
}

async function syncLeads(db, { pfIdToListingId, maxPages = 20, minPages = 8 } = {}) {
  const users = await db.pfUsers();
  const userByProfile = new Map(users.map((user) => [user.profile_id, user]));
  const known = await db.leadIds();
  const existingById = new Map((await db.allLeads()).map((row) => [row.id, row]));
  const raw = await fetchLeads({ maxPages, minPages, knownIds: known });
  const leads = raw.map(mapLead).map((lead) => enrichPfLead(lead, existingById.get(lead.id), pfIdToListingId, userByProfile));
  const added = leads.filter((lead) => !known.has(lead.id)).length;
  const recordings = leads.filter((lead) => lead.channel === "call" && String(lead.call_record || "").trim()).length;
  const upserted = await db.upsertLeads(leads);
  const newIds = leads.filter((lead) => !known.has(lead.id)).map((lead) => lead.id);
  let bitrix = { pushed: 0, added: 0, linked: 0, skipped: true, reason: "push_disabled" };
  try {
    bitrix = await pushPfLeadsToBitrix(db, {
      preferIds: newIds,
      limit: Math.max(40, newIds.length),
    });
  } catch (error) {
    bitrix = { pushed: 0, added: 0, linked: 0, failed: 1, errors: [error.message] };
  }
  const summary = {
    at: new Date().toISOString(),
    fetched: leads.length,
    upserted,
    added,
    recordings,
    bitrix,
  };
  await db.setSetting("pf_lead_sync", summary);
  return summary;
}

export async function runPfLeadSync(db) {
  if (!pfConfigured()) throw new Error("Property Finder API is not configured (PF_API_KEY / PF_API_SECRET).");
  if (running) return running;
  running = (async () => {
    try {
      return await syncLeads(db, {
        pfIdToListingId: await listingIdMap(db),
        maxPages: 12,
        minPages: 8,
      });
    } finally {
      running = null;
    }
  })();
  return running;
}

let refreshingLeads = null;

/** Walk every Property Finder lead page, then start again, so older leads and their status, contact, and recording updates reach the desk. */
export async function refreshStoredPfLeads(db, { pagesPerRun, readPage = fetchLeadPage } = {}) {
  if (refreshingLeads) return refreshingLeads;
  refreshingLeads = (async () => {
    const state = (await db.getSetting("pf_lead_refresh", null)) || {};
    const limit = pagesPerRun || (state.wrappedOnce ? 10 : 40);
    let page = Math.max(1, Number(state.page) || 1);
    const users = await db.pfUsers();
    const userByProfile = new Map(users.map((user) => [user.profile_id, user]));
    const pfIdToListingId = await listingIdMap(db);
    const existingById = new Map((await db.allLeads()).map((row) => [row.id, row]));
    const batch = [];
    const seen = new Set();
    let hasNext = true;
    let pages = 0;
    for (let step = 0; step < limit && hasNext; step += 1) {
      const body = await readPage(page);
      pages += 1;
      for (const raw of body.leads || []) {
        const mapped = mapLead(raw);
        if (!mapped.id || seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        batch.push(enrichPfLead(mapped, existingById.get(mapped.id), pfIdToListingId, userByProfile));
      }
      hasNext = Boolean(body.hasNext);
      page = nextLeadRefreshPage(page, hasNext);
      if (!hasNext) break;
    }
    const upserted = batch.length ? await db.upsertLeads(batch) : 0;
    const saved = {
      page,
      pages,
      upserted,
      wrappedOnce: Boolean(state.wrappedOnce) || !hasNext,
      at: new Date().toISOString(),
    };
    await db.setSetting("pf_lead_refresh", saved).catch(() => {});
    console.log(`PF lead refresh: page ${saved.page}, upserted ${upserted}`);
    return saved;
  })().finally(() => {
    refreshingLeads = null;
  });
  return refreshingLeads;
}

export function schedulePfSync(db, minutes = 15) {
  if (!pfConfigured() || !(minutes > 0)) return;
  const full = () => runPfSync(db).catch((error) => console.error("PF sync failed:", error.message));
  const leads = () => runPfLeadSync(db).catch((error) => console.error("PF lead sync failed:", error.message));
  const refresh = () => refreshStoredPfLeads(db).catch((error) => console.error("PF lead refresh failed:", error.message));
  setTimeout(full, 20000);
  setInterval(full, minutes * 60 * 1000);
  setTimeout(leads, 45000);
  setInterval(leads, Number(process.env.PF_LEAD_SYNC_SECONDS || 120) * 1000);
  setTimeout(refresh, 75000);
  setInterval(refresh, 2 * 60 * 1000);
  scheduleBitrixLeadSync(db);
}
