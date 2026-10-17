import assert from "node:assert/strict";
import test from "node:test";
import { buildOfficeInventory, filterOfficeInventory } from "./officeInventory.js";

test("office inventory rolls up all agents with clusters beds and demand", () => {
  const listings = [
    {
      id: "1",
      reference: "a7-1",
      title: "IC Studio",
      listing_agent: "Asma Aslam",
      listing_owner: "Owner One",
      purpose: "rent",
      type: "apartment",
      beds: 0,
      community: "International City",
      sub_community: "France Cluster",
      city: "Dubai",
      status: "live",
      price_aed: 35000,
    },
    {
      id: "2",
      reference: "a7-2",
      title: "IC 1BR Sale",
      listing_agent: "SAPNA SAPNA",
      listing_owner: "Owner Three",
      purpose: "sale",
      type: "apartment",
      beds: 1,
      community: "International City",
      sub_community: "England Cluster",
      city: "Dubai",
      status: "live",
      price_aed: 650000,
    },
    {
      id: "3",
      reference: "a7-3",
      title: "Shop",
      listing_agent: "Asma Aslam",
      listing_owner: "Owner One",
      purpose: "rent",
      type: "shop",
      beds: 0,
      community: "Business Bay",
      sub_community: "",
      city: "Dubai",
      status: "archived",
      price_aed: 120000,
    },
  ];
  const leads = [
    { id: "L1", listing_id: "1", reference: "a7-1", agent_name: "Asma Aslam" },
    { id: "L2", listing_id: "1", reference: "a7-1", agent_name: "Asma Aslam" },
    { id: "L3", listing_id: "2", reference: "a7-2", agent_name: "SAPNA SAPNA" },
  ];
  const tenancies = [
    { owner_name: "Owner One", tenant_name: "Tenant One" },
    { owner_name: "Owner Two", tenant_name: "Tenant Two" },
    { owner_name: "Owner One", tenant_name: "Tenant Three" },
  ];
  const got = buildOfficeInventory(listings, leads, tenancies, [{ kind: "owner", name: "Owner Four" }]);
  assert.equal(got.totals.total, 3);
  assert.equal(got.totals.live, 2);
  assert.equal(got.totals.agents, 2);
  assert.equal(got.beds.find((row) => row.id === "studio").count, 2);
  assert.equal(got.clusters.find((row) => row.name === "France Cluster").count, 1);
  assert.equal(got.matrix.find((row) => row.cluster === "France Cluster").liveRent, 1);
  assert.equal(got.agents.find((row) => row.name === "Asma Aslam").rent, 2);
  assert.equal(got.demand.totalClients, 3);
  assert.equal(got.demand.beds.find((row) => row.id === "studio").count, 2);
  assert.equal(got.totals.leads, 3);
  assert.equal(got.leadsSource, "desk_all_portals");
  assert.equal(got.leadsBreakdown?.total, 3);
  assert.ok(got.leadsBreakdown?.portals?.length);
  const crmLeads = buildOfficeInventory(listings, leads, tenancies, [], { formTenantNames: [], bitrixLeadTotal: 24137 });
  assert.equal(crmLeads.totals.leads, 24137);
  assert.equal(crmLeads.totals.deskLeads, 3);
  assert.equal(crmLeads.leadsSource, "bitrix_crm");

  const crmAvail = buildOfficeInventory(listings, leads, tenancies, [], {
    formTenantNames: [],
    bitrixOwnerAvailability: {
      ok: true,
      rent: 214,
      sale: 298,
      saleRent: 76,
      stages: [{ id: "s1", name: "Sale Availability", purpose: "sale", count: 298 }],
      items: [
        { id: "1", title: "Villa A", purpose: "sale", stageName: "Sale Availability", agentName: "A" },
        { id: "2", title: "Apt B", purpose: "rent", stageName: "Rent Availability", agentName: "B" },
      ],
    },
  });
  assert.equal(crmAvail.totals.sale, 298);
  assert.equal(crmAvail.totals.rent, 214);
  assert.equal(crmAvail.totals.saleRent, 76);
  assert.equal(crmAvail.totals.deskSale, 1);
  assert.equal(crmAvail.totals.deskRent, 2);
  assert.equal(crmAvail.availabilitySource, "bitrix_owner_data");
  assert.equal(crmAvail.availabilityBreakdown?.total, 588);
  assert.equal(crmAvail.availabilityBreakdown?.items?.length, 2);
  const withDeals = buildOfficeInventory(listings, leads, tenancies, [], {
    formTenantNames: [],
    bitrixLeadTotal: 10,
    bitrixDealStats: { ok: true, won: 59, sale: 21, rent: 8, other: 30, ads: 2 },
  });
  assert.equal(withDeals.totals.deals, 59);
  assert.equal(withDeals.totals.dealsSale, 21);
  assert.equal(withDeals.totals.dealsRent, 8);
  assert.equal(withDeals.totals.dealAds, 2);
  const withDealItems = buildOfficeInventory(listings, leads, tenancies, [], {
    formTenantNames: [],
    bitrixDealStats: {
      ok: true,
      won: 1,
      sale: 1,
      rent: 0,
      other: 0,
      ads: 1,
      sources: [{ id: "pf", name: "Property Finder Call", count: 1 }],
      items: [{ id: "1", title: "PF Call", purpose: "sale", source: "Property Finder Call", listingRef: "a7-1", adUrl: "", closedAt: "2026-01-01", amount: 1000, currency: "AED" }],
    },
  });
  assert.equal(withDealItems.dealsBreakdown.items[0].listingRef, "a7-1");
  assert.match(withDealItems.dealsBreakdown.items[0].listingLabel, /a7-1/);
  assert.equal(got.totals.needed, 3);
  assert.equal(got.totals.available, 2);
  // Owners = listing owners only (not directory / tenancy / agents)
  assert.equal(got.totals.owners, 2);
  assert.equal(got.partyLists.ownerStats.find((row) => row.name === "Owner One").count, 2);
  assert.equal(got.partyLists.ownerStats.find((row) => row.name === "Owner Three").count, 1);
  assert.equal(got.totals.tenants, 3);
  assert.equal(got.partyLists.tenantStats.find((row) => row.name === "Tenant One").count, 1);
  assert.equal(got.partyLists?.owners?.length, 2);
  assert.equal(got.partyLists?.tenants?.length, 3);
  const withForms = buildOfficeInventory(listings, leads, tenancies, [], {
    formTenantNames: ["Tenant Four", "Tenant One", "No name"],
  });
  assert.equal(withForms.totals.tenants, 4);
  assert.equal(buildOfficeInventory([], [], [{ tenant_name: "No name" }, { tenant_name: "Real Tenant" }], [], { formTenantNames: [] }).totals.tenants, 1);
  assert.equal(got.needVsAvailable.beds.find((row) => row.id === "studio").needed, 2);
  assert.equal(got.needVsAvailable.beds.find((row) => row.id === "studio").available, 1);
  assert.ok(Array.isArray(got.shortageBoard));
  assert.ok(got.shortageBoard[0].gap > 0);
  assert.equal(got.leadsSource, "desk_all_portals");
  assert.ok(got.priceBands.rent.length + got.priceBands.sale.length >= 1);
  assert.ok(got.expiry?.totals);
  assert.ok(got.agentLoad.find((row) => row.name === "Asma Aslam").leads >= 2);
  assert.equal(got.emptyAgentLeads ?? 0, 0);
  assert.ok(!got.agentLoad.some((row) => /unassigned/i.test(row.name)));
  assert.equal(got.rows.find((row) => row.id === "1").rentYearly, 35000);
  assert.equal(got.rows.find((row) => row.id === "2").salePrice, 650000);

  const expiredListings = [
    {
      id: "9",
      reference: "a7-exp-rent",
      title: "Expired Rent Studio",
      listing_agent: "Asma Aslam",
      listing_owner: "Owner One",
      purpose: "rent",
      type: "apartment",
      beds: 0,
      community: "Mudon",
      sub_community: "Mudon Al Ranim",
      city: "Dubai",
      status: "archived",
      portal_expiry: "2020-01-01",
      price_aed: 40000,
    },
    {
      id: "10",
      reference: "a7-exp-sale",
      title: "Expired Sale 2BR",
      listing_agent: "SAPNA SAPNA",
      listing_owner: "Owner Three",
      purpose: "sale",
      type: "townhouse",
      beds: 2,
      community: "International City",
      sub_community: "England Cluster",
      city: "Dubai",
      status: "archived",
      portal_expiry: "2020-02-01",
      price_aed: 900000,
    },
  ];
  const expiredGot = buildOfficeInventory(expiredListings, [], [], [], { formTenantNames: [] });
  assert.equal(expiredGot.expiry.totals.expired, 2);
  assert.equal(expiredGot.expiry.totals.expiredRent, 1);
  assert.equal(expiredGot.expiry.totals.expiredSale, 1);
  assert.equal(expiredGot.expiry.expired[0].community, "Mudon");
  assert.equal(expiredGot.expiry.expired[0].bedLabel, "Studio");
  assert.equal(expiredGot.expiry.expired[0].typeLabel, "Apartment");
  assert.equal(expiredGot.expiry.expired[1].bedLabel, "2 Bedroom");
  assert.equal(expiredGot.expiry.expired[1].typeLabel, "Townhouse");
  assert.ok(expiredGot.expiry.communities.find((row) => row.name === "Mudon"));
  assert.ok(expiredGot.expiry.beds.find((row) => row.id === "studio"));
  assert.ok(expiredGot.expiry.types.find((row) => row.id === "townhouse"));

  const filtered = filterOfficeInventory(got, { community: "international city", beds: "1" });
  assert.equal(filtered.totals.total, 1);
  assert.equal(filtered.rows[0].agent, "SAPNA SAPNA");
  assert.equal(filtered.rows[0].cluster, "England Cluster");
});

test("office inventory prefers Owner Data availability cards over listings", () => {
  const listings = [
    {
      id: "desk-1",
      reference: "a7-desk",
      listing_agent: "Desk Agent",
      listing_owner: "Desk Owner",
      purpose: "sale",
      type: "villa",
      beds: 5,
      community: "Palm Jumeirah",
      status: "live",
      price_aed: 1,
    },
  ];
  const got = buildOfficeInventory(listings, [], [], [], {
    formTenantNames: [],
    ownerAvailability: {
      ok: true,
      rent: 1,
      sale: 1,
      saleRent: 1,
      properties: [
        {
          id: "od-1",
          title: "IC Shop",
          purpose: "rent",
          purposeLabel: "Rent Availability",
          type: "Shop",
          beds: 0,
          bedLabel: "Studio",
          community: "International City",
          subCommunity: "England Cluster",
          unitNo: "Y23-11",
          rentPrice: 45000,
          salePrice: null,
          owner: "Owner One",
          agentName: "Asma Aslam",
          agentId: "12",
          stage: "DT1042_14:UC_73SP7H",
          stageLabel: "Rent Availability",
          communityId: "55",
          subCommunityId: "70",
          unitTypeId: "440",
          bedEnumId: "430",
        },
        {
          id: "od-2",
          title: "Mudon Villa",
          purpose: "sale",
          type: "Villa",
          beds: 3,
          bedLabel: "3 Bedroom",
          community: "Mudon",
          subCommunity: "Al Ranim 4",
          unitNo: "4",
          rentPrice: null,
          salePrice: 2100000,
          owner: "Villa Landlord",
          agentName: "SAPNA SAPNA",
          agentId: "15",
        },
        {
          id: "od-3",
          title: "Bay Apt",
          purpose: "sale_rent",
          type: "Apartment",
          beds: 1,
          bedLabel: "1 Bedroom",
          community: "Business Bay",
          subCommunity: "",
          unitNo: "1204",
          rentPrice: 85000,
          salePrice: 1200000,
          owner: "Asma Aslam",
          agentName: "Asma Aslam",
        },
      ],
    },
  });
  assert.equal(got.inventorySource, "bitrix_owner_data");
  assert.equal(got.totals.total, 3);
  assert.equal(got.totals.rent, 1);
  assert.equal(got.totals.sale, 1);
  assert.equal(got.totals.saleRent, 1);
  assert.equal(got.rows.some((row) => row.reference === "a7-desk"), false);
  const shop = got.rows.find((row) => row.id === "od-1");
  assert.equal(shop.community, "International City");
  assert.equal(shop.cluster, "England Cluster");
  assert.equal(shop.unitNo, "Y23-11");
  assert.equal(shop.typeLabel, "Shop");
  assert.equal(shop.bedLabel, "Studio");
  assert.equal(shop.agent, "Asma Aslam");
  assert.equal(shop.stage, "DT1042_14:UC_73SP7H");
  assert.equal(shop.communityId, "55");
  assert.equal(shop.unitTypeId, "440");
  assert.equal(shop.bedEnumId, "430");
  assert.equal(shop.rentYearly, 45000);
  assert.equal(got.types.find((row) => row.name === "Shop").count, 1);
  assert.equal(got.clusters.find((row) => row.name === "England Cluster").count, 1);
  assert.equal(got.totals.owners, 2);
  assert.equal(got.totals.ownerCardsNamedAsAgent, 1);
  assert.ok(got.partyLists.ownerStats.find((row) => row.name === "Owner One"));
  assert.ok(got.partyLists.ownerStats.find((row) => row.name === "Villa Landlord"));
  assert.equal(got.partyLists.ownerStats.some((row) => row.name === "Asma Aslam"), false);
  assert.equal(got.partyLists.ownerStats.find((row) => row.name === "Owner One").count, 1);
  assert.equal(got.partyLists.ownerStats.find((row) => row.name === "Villa Landlord").count, 1);
  assert.equal(got.totals.live, 0);
  const withLive = buildOfficeInventory(listings, [], [], [], {
    formTenantNames: [],
    ownerAvailability: {
      ok: true,
      verified: true,
      rent: 1,
      sale: 1,
      saleRent: 1,
      properties: got.rows.map((row, idx) => ({
        id: row.id,
        title: row.title,
        purpose: row.purpose,
        type: row.typeLabel,
        beds: row.beds,
        bedLabel: row.bedLabel,
        community: row.community,
        subCommunity: row.cluster === "No cluster" ? "" : row.cluster,
        unitNo: row.unitNo,
        rentPrice: row.rentYearly,
        salePrice: row.salePrice,
        owner: row.owner,
        agentName: row.agent,
      })),
    },
    liveListings: [
      {
        id: "L-live",
        reference: "a7-live",
        title: "Live shop",
        status: "live",
        community: "International City",
        unit_no: "Y23-11",
        listing_agent: "Asma Aslam",
        pf_is_live: "1",
        portals: ["pf", "bayut"],
        purpose: "rent",
        type: "shop",
      },
    ],
  });
  assert.equal(withLive.totals.live, 1);
  assert.equal(withLive.totals.livePf, 1);
  assert.equal(withLive.totals.liveBayut, 1);
  assert.equal(withLive.rows.find((row) => row.unitNo === "Y23-11").live, true);
  assert.equal(withLive.liveAds.communities.find((row) => row.name === "International City").count, 1);
});

test("listing owner matching agent is not counted as an owner", () => {
  const got = buildOfficeInventory(
    [
      {
        id: "1",
        listing_agent: "Asma Aslam",
        listing_owner: "Asma Aslam",
        purpose: "rent",
        type: "apartment",
        beds: 0,
        community: "Mudon",
        status: "live",
      },
      {
        id: "2",
        listing_agent: "Asma Aslam",
        listing_owner: "Real Owner",
        purpose: "sale",
        type: "villa",
        beds: 3,
        community: "Mudon",
        status: "live",
      },
    ],
    [],
    [],
    [],
    { formTenantNames: [] }
  );
  assert.equal(got.totals.owners, 1);
  assert.equal(got.totals.ownerCardsNamedAsAgent, 1);
  assert.equal(got.partyLists.ownerStats[0].name, "Real Owner");
  assert.equal(got.partyLists.ownerStats[0].count, 1);
});

test("office inventory keeps each price in its own column and reads community text", () => {
  const got = buildOfficeInventory([], [], [], [], {
    formTenantNames: [],
    ownerAvailability: {
      ok: true,
      verified: true,
      rent: 2,
      sale: 1,
      saleRent: 0,
      properties: [
        {
          id: "rent-1",
          purpose: "rent",
          type: "0",
          beds: 31,
          bedLabel: "31 Bedroom",
          community: "Empty community",
          communityText: "The Acres",
          subCommunity: "",
          rentPrice: null,
          salePrice: 900000,
          price: 900000,
          agentName: "Agent One",
        },
        {
          id: "rent-2",
          purpose: "rent",
          type: "Villa",
          beds: 3,
          community: "Empty community",
          communityText: "International City",
          subCommunity: "England Cluster",
          rentPrice: 55000,
          salePrice: null,
          agentName: "Agent Two",
        },
        {
          id: "sale-1",
          purpose: "sale",
          type: "Villa",
          beds: null,
          bedLabel: "—",
          community: "Mudon",
          rentPrice: 40000,
          salePrice: null,
          price: 40000,
          agentName: "Agent One",
        },
      ],
    },
  });
  const copied = got.rows.find((row) => row.id === "rent-1");
  assert.equal(copied.rentYearly, null);
  assert.equal(copied.salePrice, 900000);
  assert.equal(copied.community, "The Acres");
  assert.equal(copied.bedLabel, "—");
  assert.equal(copied.typeLabel, "Empty type");
  const city = got.rows.find((row) => row.id === "rent-2");
  assert.equal(city.community, "International City");
  assert.equal(city.cluster, "England Cluster");
  assert.equal(city.rentYearly, 55000);
  assert.equal(city.salePrice, null);
  const sale = got.rows.find((row) => row.id === "sale-1");
  assert.equal(sale.salePrice, null);
  assert.equal(sale.rentYearly, 40000);
  assert.equal(sale.bedLabel, "—");
  assert.equal(got.totals.agents, 2);
  assert.equal(got.rows.length, 3);
});
