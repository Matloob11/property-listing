import assert from "node:assert/strict";
import test from "node:test";
import {
  diffHistory,
  dubaiToday,
  filterListings,
  websiteSearchCounts,
  groupListingHistory,
  historyActorLabel,
  listingHistoryRows,
  isListingExpired,
  isMine,
  isPortalLive,
  listingDeskStatus,
  listingExpiryError,
  listingIsLiveOnPortal,
  liveCategoryBoard,
  liveTypesByPortal,
  liveUnpublishTargets,
  qualityGaps,
  normalizeListing,
  agentPortfolioSummary,
  filterAgentPortfolioItems,
  portfolioPickCount,
  portfolioPickGroups,
} from "./listingModel.js";

test("listing edits keep who changed what from and to", () => {
  const before = normalizeListing({ id: "h1", title: "Old villa", price_aed: 1000000, status: "draft" });
  const after = normalizeListing({ ...before, title: "New villa", price_aed: 1200000 });
  const entries = diffHistory(before, after, "Abdul Malik");
  const title = entries.find((item) => item.field === "title");
  const price = entries.find((item) => item.field === "price_aed");
  assert.equal(title.from, "Old villa");
  assert.equal(title.value, "New villa");
  assert.equal(title.by, "Abdul Malik");
  assert.equal(price.from, "1000000");
  assert.equal(price.value, "1200000");
  const sessions = groupListingHistory(entries);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].by, "Abdul Malik");
  assert.ok(sessions[0].changes.length >= 2);
  const rows = listingHistoryRows(entries);
  assert.ok(rows.every((row) => row.by === "Abdul Malik"));
  assert.ok(rows.some((row) => row.label === "Title" && row.from === "Old villa" && row.value === "New villa"));
});

test("listing history stores Bitrix name with Bitrix ID", () => {
  const before = normalizeListing({ id: "h2", title: "Old title", status: "draft" });
  const after = normalizeListing({ ...before, title: "New title" });
  const entries = diffHistory(before, after, { name: "Abdul Malik", id: "2191" });
  const title = entries.find((item) => item.field === "title");
  assert.equal(title.by, "Abdul Malik");
  assert.equal(title.byId, "2191");
  const rows = listingHistoryRows(entries);
  assert.equal(rows[0].who, "Abdul Malik · Bitrix ID 2191");
  assert.equal(historyActorLabel("User 1", ""), "Bitrix ID 1");
  assert.equal(historyActorLabel("Saad", "2265"), "Saad · Bitrix ID 2265");
  const saved = normalizeListing({
    id: "h3",
    title: "Villa",
    listing_agent: "Saad",
    created_by: "Saad",
    agent_id: "2265",
    history: [{ at: "2026-09-21T08:53:45.182Z", by: "Saad", field: "title", value: "Villa" }],
  });
  assert.equal(saved.history[0].byId, "2265");
});

test("Property Finder live ads are live on the desk even if they were archived", () => {
  assert.equal(isPortalLive({ pf_is_live: "1" }), true);
  assert.equal(isPortalLive({ pf_state: "live" }), true);
  assert.equal(isPortalLive({ pf_is_live: "", pf_state: "draft" }), false);
  assert.equal(listingDeskStatus({ status: "archived", pf_is_live: "1" }), "live");
  assert.equal(listingDeskStatus({ status: "archived", pf_state: "live" }), "live");
  assert.equal(listingDeskStatus({ status: "archived", pf_is_live: "" }), "archived");
  assert.equal(listingDeskStatus({ status: "duplicate", pf_is_live: "1" }), "duplicate");
  assert.equal(listingDeskStatus({ status: "draft", pf_is_live: "1" }), "live");
  const row = normalizeListing({
    id: "t1",
    reference: "a7group-1715",
    title: "Studio",
    status: "archived",
    pf_is_live: "1",
    pf_state: "live",
  });
  assert.equal(row.status, "live");
});

test("expired live ads archive even when they are still PF-live", () => {
  const today = dubaiToday();
  assert.equal(isListingExpired({ portal_expiry: "2020-01-01" }, today), true);
  assert.equal(isListingExpired({ portal_expiry: today }, today), false);
  assert.equal(isListingExpired({ portal_expiry: "" }, today), false);
  assert.equal(listingDeskStatus({ status: "live", pf_is_live: "1", portal_expiry: "2020-01-01" }), "archived");
  assert.equal(listingDeskStatus({ status: "live", pf_is_live: "1", portal_expiry: today }), "live");
  assert.equal(listingDeskStatus({ status: "draft", portal_expiry: "2020-01-01" }), "draft");
  assert.equal(listingDeskStatus({ status: "pending", permit_expiry_date: "2020-01-01" }), "archived");
  assert.match(listingExpiryError({ status: "live", portal_expiry: "2020-01-01" }), /expired/);
  assert.equal(listingExpiryError({ status: "live", portal_expiry: today }), "");
  const row = normalizeListing({
    id: "t2",
    reference: "a7group-expired",
    title: "Villa",
    status: "live",
    pf_is_live: "1",
    pf_state: "live",
    portal_expiry: "2024-01-01",
  });
  assert.equal(row.status, "archived");
});

test("status tabs show every listing, My Listing shows only that user", () => {
  const rows = [
    { id: "1", status: "live", listing_agent: "Malik", listing_owner: "Malik", created_by: "Malik", agent_id: "1" },
    { id: "2", status: "archived", listing_agent: "Saad", listing_owner: "Saad", created_by: "Saad", agent_id: "2" },
    { id: "3", status: "draft", listing_agent: "Ibrahim", listing_owner: "Ibrahim", created_by: "Ibrahim", agent_id: "9" },
  ];
  assert.equal(filterListings(rows, { status: "live" }).map((row) => row.id).join(), "1");
  assert.equal(filterListings(rows, { status: "archived" }).map((row) => row.id).join(), "2");
  assert.equal(filterListings(rows, { status: "draft" }).map((row) => row.id).join(), "3");
  assert.equal(filterListings(rows, { status: "all" }).length, 3);

  const ibrahim = { agentName: "Ibrahim", agentId: "9", admin: true };
  assert.equal(isMine(rows[0], ibrahim), false);
  assert.equal(isMine(rows[2], ibrahim), true);
  assert.equal(filterListings(rows, { ...ibrahim, scope: "mine" }).map((row) => row.id).join(), "3");
  assert.equal(filterListings(rows, { ...ibrahim, status: "live", scope: "mine" }).length, 0);
  assert.equal(
    filterListings(rows, { agentName: "Malik", agentId: "1", scope: "mine" }).map((row) => row.id).join(),
    "1"
  );
});

test("agent portfolio counts sale rent type beds and community", () => {
  const rows = [
    normalizeListing({ id: "1", listing_agent: "Asma Aslam", purpose: "rent", type: "apartment", beds: 0, community: "International City", status: "live" }),
    normalizeListing({ id: "2", listing_agent: "Asma Aslam", purpose: "sale", type: "shop", beds: 0, community: "Business Bay", status: "live" }),
    normalizeListing({ id: "8", listing_owner: "Asma Aslam", created_by: "Asma Aslam", purpose: "sale", type: "villa", beds: 3, community: "JVC", status: "live" }),
    normalizeListing({ id: "3", listing_agent: "Asma Aslam", purpose: "rent", type: "apartment", beds: 2, community: "International City", status: "archived" }),
    normalizeListing({ id: "4", listing_agent: "Qasim Mehmood", purpose: "sale", type: "villa", beds: 4, community: "Arabian Ranches", status: "live" }),
  ];
  const got = agentPortfolioSummary(rows, "Asma Aslam");
  assert.equal(got.total, 4);
  assert.equal(got.live, 3);
  assert.equal(got.archived, 1);
  assert.equal(got.rent, 2);
  assert.equal(got.sale, 2);
  assert.equal(got.types.find((row) => row.id === "apartment").count, 2);
  assert.equal(got.types.find((row) => row.id === "shop").count, 1);
  assert.equal(got.beds.find((row) => row.id === "studio").count, 2);
  assert.equal(got.beds.find((row) => row.id === "2").count, 1);
  assert.equal(got.communities.find((row) => row.name === "International City").count, 2);
  assert.equal(got.liveSale, 2);
  assert.equal(got.liveRent, 1);
  assert.equal(got.cities.find((row) => row.name === "Dubai")?.count || got.cities[0]?.count, 4);
  assert.equal(got.liveCommunities.find((row) => row.name === "International City").count, 1);
  assert.equal(got.ads, 0);
  assert.equal(got.items.length, 4);
  assert.equal(got.items.filter((row) => row.purpose === "sale").length, 2);
  assert.equal(filterAgentPortfolioItems(got.items, "sale").length, 2);
  assert.equal(filterAgentPortfolioItems(got.items, "listings", { kind: "type", id: "apartment" }).length, 2);
  const studioRent = { beds: "studio", purpose: "rent" };
  assert.equal(portfolioPickCount(got.items, studioRent), 1);
  assert.equal(portfolioPickCount(got.items, studioRent, "purpose", { purpose: "sale" }), 1);
  assert.equal(portfolioPickCount(got.items, studioRent, "status", { status: "live" }), 1);
  assert.equal(
    portfolioPickGroups(got.items, studioRent, "community", (row) => row.communityKey, (row) => row.community)[0].name,
    "International City"
  );
  assert.equal(agentPortfolioSummary(rows, "Asma Asiam").total, 4);
  assert.equal(agentPortfolioSummary(rows, "Asma Aslam").items.length, 4);
  assert.equal(got.items.some((row) => row.id === "8"), true);
  assert.equal(
    agentPortfolioSummary(
      [normalizeListing({ id: "9", created_by: "Asma Aslam", listing_agent: "Qasim Mehmood", purpose: "rent", status: "live" })],
      "Asma Aslam"
    ).total,
    0
  );
  assert.equal(
    agentPortfolioSummary(
      [normalizeListing({ id: "5", listing_agent: "Other Name", agent_id: "81", purpose: "sale", status: "live" })],
      "Asma Aslam",
      "81"
    ).total,
    0
  );
  assert.equal(
    agentPortfolioSummary(
      [normalizeListing({ id: "6", listing_agent: "Asma Aslam · Bitrix ID 81", purpose: "sale", status: "live" })],
      "",
      "81"
    ).total,
    1
  );
});

test("agent portfolio counts portal ads", () => {
  const rows = [
    normalizeListing({
      id: "1",
      listing_agent: "Asma Aslam",
      purpose: "rent",
      status: "live",
      portals: ["pf", "bayut"],
      pf_is_live: "1",
    }),
    normalizeListing({
      id: "2",
      listing_agent: "Asma Aslam",
      purpose: "sale",
      status: "live",
      portals: ["dubizzle"],
    }),
    normalizeListing({
      id: "3",
      listing_agent: "Asma Aslam",
      purpose: "rent",
      status: "archived",
      portals: [],
    }),
  ];
  const got = agentPortfolioSummary(rows, "Asma Aslam");
  assert.equal(got.ads, 2);
  assert.equal(got.pf, 1);
  assert.equal(got.bayut, 1);
  assert.equal(got.dubizzle, 1);
  assert.equal(filterAgentPortfolioItems(got.items, "sale").length, 1);
  assert.equal(filterAgentPortfolioItems(got.items, "ads").length, 2);
  assert.equal(filterAgentPortfolioItems(got.items, "live").length, 2);
});

test("liveUnpublishTargets only lists PF / Bayut / Dubizzle that are on", () => {
  assert.deepEqual(
    liveUnpublishTargets({
      portals: ["pf", "bayut", "website"],
      pf_is_live: "1",
      pf_state: "live",
    }),
    ["pf", "bayut"]
  );
  assert.deepEqual(
    liveUnpublishTargets({ portals: ["dubizzle"], pf_is_live: "", pf_state: "draft" }),
    ["dubizzle"]
  );
  assert.deepEqual(
    liveUnpublishTargets({ portals: ["pf_api"], pf_is_live: "", pf_state: "" }),
    ["pf"]
  );
  assert.deepEqual(liveUnpublishTargets({ portals: ["website"], pf_is_live: "" }), []);
});

test("portal filter shows only live ads on that portal", () => {
  const pfLive = normalizeListing({
    id: "1",
    reference: "a7-pf",
    status: "live",
    pf_is_live: "1",
    pf_state: "live",
    portals: ["pf"],
  });
  const bayutLive = normalizeListing({
    id: "2",
    reference: "a7-by",
    status: "live",
    type: "villa",
    portals: ["bayut"],
  });
  const bayutArchived = normalizeListing({
    id: "3",
    reference: "a7-old",
    status: "archived",
    portals: ["bayut"],
  });
  const pfApiLive = normalizeListing({
    id: "4",
    reference: "a7-api",
    status: "live",
    portals: ["pf_api"],
  });
  const notLive = {
    id: "5",
    reference: "a7-draft",
    status: "draft",
    pf_is_live: "1",
    pf_state: "live",
    portals: ["pf"],
  };
  const pfTaggedOnly = normalizeListing({
    id: "6",
    reference: "a7-tag",
    status: "live",
    pf_is_live: "",
    pf_state: "draft",
    portals: ["pf"],
  });
  const dubizzleTagged = normalizeListing({
    id: "7",
    reference: "a7-dz",
    status: "live",
    type: "shop",
    portals: ["dubizzle"],
  });
  const websiteLive = {
    bayut: { ok: true, refs: ["a7-by"] },
    dubizzle: { ok: true, refs: ["a7-dz"] },
  };
  assert.equal(listingIsLiveOnPortal(pfLive, "pf"), true);
  assert.equal(listingIsLiveOnPortal(pfLive, "pf", { pf: { ok: true, refs: ["a7-pf"] } }), true);
  assert.equal(listingIsLiveOnPortal(pfLive, "pf", { pf: { ok: true, refs: ["a7-other"] } }), false);
  assert.equal(listingIsLiveOnPortal(bayutLive, "bayut"), false);
  assert.equal(listingIsLiveOnPortal(bayutLive, "bayut", websiteLive), true);
  assert.equal(listingIsLiveOnPortal(bayutArchived, "bayut", websiteLive), false);
  assert.equal(listingIsLiveOnPortal(pfApiLive, "pf"), false);
  assert.equal(listingIsLiveOnPortal(pfTaggedOnly, "pf"), false);
  assert.equal(listingIsLiveOnPortal(dubizzleTagged, "dubizzle"), false);
  assert.equal(listingIsLiveOnPortal(dubizzleTagged, "dubizzle", websiteLive), true);
  assert.equal(listingIsLiveOnPortal(notLive, "pf"), false);
  const bayutRows = filterListings([pfLive, bayutLive, bayutArchived, pfApiLive, notLive], {
    portal: "bayut",
    websiteLive,
  });
  assert.deepEqual(bayutRows.map((row) => row.id), ["2"]);
  const pfRows = filterListings([pfLive, bayutLive, bayutArchived, pfApiLive, pfTaggedOnly, notLive], { portal: "pf" });
  assert.deepEqual(pfRows.map((row) => row.id), ["1"]);
  const dubizzleRows = filterListings([dubizzleTagged, pfLive], { portal: "dubizzle", websiteLive: { dubizzle: { ok: true, refs: [] } } });
  assert.deepEqual(dubizzleRows, []);
  const dubizzleLiveRows = filterListings([dubizzleTagged, pfLive], { portal: "dubizzle", websiteLive });
  assert.deepEqual(dubizzleLiveRows.map((row) => row.id), ["7"]);
  const dubizzleArchived = normalizeListing({
    id: "8",
    reference: "a7-dz-old",
    status: "archived",
    portals: [],
  });
  const dubizzleWebsite = {
    dubizzle: { ok: true, refs: ["a7-dz", "a7-dz-old"] },
  };
  assert.deepEqual(
    filterListings([dubizzleTagged, dubizzleArchived, pfLive], {
      status: "live",
      portal: "dubizzle",
      websiteLive: dubizzleWebsite,
    }).map((row) => row.id),
    ["7", "8"]
  );
  const liveTypes = liveTypesByPortal([pfLive, bayutLive, bayutArchived, dubizzleTagged, notLive], websiteLive);
  assert.deepEqual(liveTypes.pf, [["apartment", 1]]);
  assert.deepEqual(liveTypes.bayut, [["villa", 1]]);
  assert.deepEqual(liveTypes.dubizzle, [["shop", 1]]);
  assert.deepEqual(liveTypesByPortal([dubizzleTagged], { dubizzle: { ok: true, refs: [] } }).dubizzle, []);
  const pfArchivedOnSite = normalizeListing({
    id: "9",
    reference: "a7-pf-old",
    status: "archived",
    portals: [],
  });
  const threeSites = {
    pf: { ok: true, refs: ["a7-pf", "a7-pf-old"] },
    bayut: { ok: true, refs: ["a7-by"] },
    dubizzle: { ok: true, refs: ["a7-dz"] },
  };
  assert.equal(listingIsLiveOnPortal(pfArchivedOnSite, "pf", threeSites), true);
  assert.deepEqual(
    filterListings([pfLive, pfArchivedOnSite, bayutLive, dubizzleTagged], { portal: "any", websiteLive: threeSites }).map((row) => row.id),
    ["1", "9", "2", "7"]
  );
  assert.equal(filterListings([pfLive, pfArchivedOnSite], { portal: "pf", websiteLive: threeSites }).length, 2);
  assert.deepEqual(
    websiteSearchCounts([pfLive, pfArchivedOnSite, bayutLive, dubizzleTagged], threeSites),
    { any: 4, pf: 2, bayut: 1, dubizzle: 1, ready: true }
  );
});

test("overview board uses live stock and the current website ads", () => {
  const commercialSale = normalizeListing({
    id: "c1",
    reference: "a7-shop",
    status: "live",
    purpose: "sale",
    category: "commercial",
    portals: ["website", "bayut"],
  });
  const commercialRent = normalizeListing({
    id: "c2",
    reference: "a7-office",
    status: "live",
    purpose: "rent",
    category: "commercial",
    portals: ["houza"],
  });
  const residentialSale = normalizeListing({
    id: "r1",
    reference: "a7-villa",
    status: "live",
    purpose: "sale",
    category: "residential",
    pf_is_live: "1",
    portals: ["pf", "website"],
  });
  const archivedStillOnBayut = normalizeListing({
    id: "r2",
    reference: "a7-old-flat",
    status: "archived",
    purpose: "rent",
    category: "residential",
    portals: ["bayut", "website"],
  });
  const oldCheckbox = normalizeListing({
    id: "r3",
    reference: "a7-flag-only",
    status: "live",
    purpose: "rent",
    category: "residential",
    portals: ["bayut", "dubizzle", "pf"],
  });
  const websiteLive = {
    pf: { ok: true, refs: ["a7-villa"] },
    bayut: { ok: true, refs: ["a7-shop", "a7-old-flat"] },
    dubizzle: { ok: true, refs: ["a7-office"] },
  };
  const board = liveCategoryBoard(
    [commercialSale, commercialRent, residentialSale, archivedStillOnBayut, oldCheckbox],
    websiteLive
  );
  assert.equal(board.byCategory.commercial.sale, 1);
  assert.equal(board.byCategory.commercial.rent, 1);
  assert.equal(board.byCategory.residential.sale, 1);
  assert.equal(board.byCategory.residential.rent, 1);
  assert.equal(board.byCategory.commercial.portals.bayut, 1);
  assert.equal(board.byCategory.residential.portals.bayut, 1);
  assert.equal(board.byCategory.commercial.portals.dubizzle, 1);
  assert.equal(board.byCategory.residential.portals.dubizzle, 0);
  assert.equal(board.byCategory.residential.portals.pf, 1);
  assert.equal(board.byCategory.commercial.portals.pf, 0);
  assert.equal(board.byCategory.commercial.portals.houza, 1);
  assert.equal(board.byCategory.commercial.portals.website, 1);
  assert.equal(board.byCategory.residential.portals.website, 1);
  assert.equal(board.purpose.sale, 2);
  assert.equal(board.purpose.rent, 2);
  assert.equal(listingIsLiveOnPortal(commercialSale, "website"), true);
  assert.equal(listingIsLiveOnPortal(archivedStillOnBayut, "website"), false);
  assert.equal(listingIsLiveOnPortal(oldCheckbox, "bayut", websiteLive), false);
});

test("quality gaps keep the reasons that lower a Property Finder rating", () => {
  const gaps = qualityGaps({
    pf_quality: {
      details: {
        image: { color: "red", help: "Add at least 8 photos", tag: "6 / 30" },
        title: { color: "green", help: "Title is fine", value: 10, weight: 10 },
        verified: { color: "orange", tag: "No" },
      },
    },
  });
  assert.deepEqual(gaps, [
    { key: "image", help: "Add at least 8 photos", color: "red" },
    { key: "verified", help: "No", color: "orange" },
  ]);
});

test("listing_id filter matches reference case-insensitively and a7group number", () => {
  const rows = [
    { id: "60047991b38688cd", reference: "a7group-1683", status: "live" },
    { id: "other", reference: "a7group-1684", status: "live" },
  ];
  assert.equal(filterListings(rows, { listing_id: "A7GROUP-1683" }).length, 1);
  assert.equal(filterListings(rows, { listing_id: "1683" })[0].id, "60047991b38688cd");
  assert.equal(filterListings(rows, { listing_id: "60047991b38688cd" }).length, 1);
  assert.equal(filterListings(rows, { listing_id: "1684" })[0].reference, "a7group-1684");
});

test("ad board filters can open sale, rent, both, and an exact bedroom count", () => {
  const rows = [
    { purpose: "sale", beds: 0, status: "live", community: "Serena" },
    { purpose: "rent", beds: 2, status: "archived", community: "Serena" },
    { purpose: "", beds: "", status: "draft", community: "Serena" },
  ];
  assert.equal(filterListings(rows, { purpose: "both" }).length, 2);
  assert.equal(filterListings(rows, { beds: "0" }).length, 1);
  assert.equal(filterListings(rows, { beds: "empty" }).length, 1);
  assert.equal(filterListings(rows, { beds: "2", purpose: "rent" })[0].status, "archived");
});
