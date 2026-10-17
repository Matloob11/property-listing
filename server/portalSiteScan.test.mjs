import assert from "node:assert/strict";
import test from "node:test";
import { agentNameFromPortalHit, bayutPortalFromHits, collectPortalAds, mergePortalReading, parseBayutHtml, parseDubizzleHtml, parsePropertyFinderHtml, portalAgentDetails, portalReadingReady, portalSliceRefs, propertyFinderLive, refsFromPfSearch } from "./portalSiteScan.js";

function page(data) {
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

test("property finder scan uses the agency active listings and each agent", () => {
  const parsed = parsePropertyFinderHtml(
    page({
      props: {
        pageProps: {
          broker: { totalProperties: 126, name: "A7 Group Real Estate" },
          agents: {
            data: [
              {
                name: "Muhammad Ramzan",
                totalProperties: 1,
                propertiesResidentialForRentCount: 1,
                propertiesResidentialForSaleCount: 0,
                propertiesCommercialForRentCount: 0,
                propertiesCommercialForSaleCount: 0,
              },
              {
                name: "Abdul Malik Abdul Karim",
                totalProperties: 63,
                propertiesResidentialForSaleCount: 19,
                propertiesCommercialForSaleCount: 7,
                propertiesResidentialForRentCount: 33,
                propertiesCommercialForRentCount: 4,
              },
            ],
          },
        },
      },
    })
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.count, 126);
  assert.deepEqual(parsed.agents, [
    { name: "Abdul Malik Abdul Karim", listings: 63, sale: 26, rent: 37 },
    { name: "Muhammad Ramzan", listings: 1, sale: 0, rent: 1 },
  ]);
});

test("property finder live set is the website active listings, not a newer search hit", () => {
  const parsed = { ok: true, count: 1, counts: { 2: 1 }, agents: [{ name: "A", listings: 1, sale: 1, rent: 0 }] };
  const refs = refsFromPfSearch({
    listings: [{ property: { reference: "A7GROUP-10", category_id: 2 } }, { property: { reference: "plain" } }],
  });
  assert.deepEqual(refs, ["a7group-10"]);
  const one = propertyFinderLive(parsed, { total: 1, rows: [{ ref: "a7group-10", categoryId: 2, listed: "2026-10-01" }] });
  assert.equal(one.ok, true);
  assert.equal(one.count, 1);
  assert.equal(propertyFinderLive(parsed, { total: 130, rows: [{ ref: "a7group-10", categoryId: 2, listed: "2026-10-01" }] }).ok, false);
  const heading = {
    ok: true,
    count: 2,
    counts: { 1: 1, 2: 1 },
    agents: [],
  };
  const live = propertyFinderLive(heading, {
    total: 3,
    rows: [
      { ref: "a7group-1", categoryId: 2, listed: "2026-10-01T00:00:00Z" },
      { ref: "a7group-2", categoryId: 2, listed: "2026-10-08T00:00:00Z" },
      { ref: "a7group-3", categoryId: 1, listed: "2026-10-02T00:00:00Z" },
    ],
  });
  assert.equal(live.ok, true);
  assert.equal(live.count, 2);
  assert.deepEqual([...live.refs].sort(), ["a7group-1", "a7group-3"]);
  const named = propertyFinderLive(
    { ok: true, count: 1, counts: { 1: 1 }, agents: [] },
    { total: 1, rows: [{ ref: "a7group-9", categoryId: 1, listed: "2026-10-01", agent: "Abdul Malik Abdul Karim" }] }
  );
  assert.equal(named.ads[0].agent, "Abdul Malik Abdul Karim");
  assert.equal(named.ads[0].side, "sale");
  assert.equal(named.agents[0].listings, 1);
  const leveled = propertyFinderLive(
    { ok: true, count: 3, counts: { 1: 3 }, agents: [] },
    {
      total: 3,
      rows: [
        { ref: "a7group-1", categoryId: 1, listed: "2026-10-01", listingLevel: "premium" },
        { ref: "a7group-2", categoryId: 1, listed: "2026-10-02", listingLevel: "featured" },
        { ref: "a7group-3", categoryId: 1, listed: "2026-10-03", listingLevel: "standard" },
      ],
    }
  );
  assert.deepEqual(leveled.products, { premium: 1, featured: 1, standard: 1 });
  assert.equal(leveled.ads[0].credit, "Premium");
});

test("an agent popup counts sale, rent, type, community and cluster from that person's ads", () => {
  const detail = portalAgentDetails(
    {
      ads: [
        { ref: "a7group-1", agent: "Abdul Malik Abdul Karim", side: "sale", type: "apartment", beds: 0, credit: "Premium" },
        { ref: "a7group-2", agent: "Abdul Malik Abdul Karim", side: "rent", type: "shop", credit: "Standard" },
        { ref: "a7group-3", agent: "Qasim khan", side: "rent", type: "apartment", beds: 1 },
      ],
    },
    [
      { reference: "a7group-1", status: "live", type: "apartment", beds: 0, community: "International City", sub_community: "France" },
      { reference: "a7group-2", status: "archived", type: "shop", beds: 0, community: "International City", building: "Shop 20" },
    ]
  );
  const malik = detail.get("Abdul Malik Abdul Karim");
  assert.equal(malik.total, 2);
  assert.equal(malik.sale, 1);
  assert.equal(malik.rent, 1);
  assert.equal(malik.live, 1);
  assert.deepEqual(malik.types, [
    { id: "shop", name: "shop", count: 1 },
    { id: "studio", name: "studio", count: 1 },
  ]);
  assert.deepEqual(malik.communities, [{ id: "International City", name: "International City", count: 2 }]);
  assert.deepEqual(malik.clusters, [
    { id: "France", name: "France", count: 1 },
    { id: "Shop 20", name: "Shop 20", count: 1 },
  ]);
  assert.equal(detail.get("Qasim khan").types[0].name, "apartment");
  const portal = {
    ads: [
      { ref: "a7group-1", agent: "Abdul Malik Abdul Karim", side: "sale", type: "apartment", beds: 0, credit: "Premium" },
      { ref: "a7group-2", agent: "Abdul Malik Abdul Karim", side: "rent", type: "shop", credit: "Standard" },
    ],
  };
  const desk = [
    { reference: "a7group-1", status: "live", type: "apartment", beds: 0, community: "International City", sub_community: "France" },
    { reference: "a7group-2", status: "archived", type: "shop", beds: 0, community: "International City", building: "Shop 20" },
  ];
  assert.deepEqual(portalSliceRefs(portal, { agent: "Abdul Malik Abdul Karim", type: "studio" }, desk), ["a7group-1"]);
  assert.deepEqual(portalSliceRefs(portal, { agent: "Abdul Malik Abdul Karim", community: "International City" }, desk), ["a7group-1", "a7group-2"]);
  assert.deepEqual(portalSliceRefs(portal, { live: "1" }, desk), ["a7group-1"]);
});

test("a portal click keeps only the agent, side, or credit that was clicked", () => {
  const portal = {
    ads: [
      { ref: "a7group-1", agent: "Abdul Malik Abdul Karim", side: "sale", credit: "Premium" },
      { ref: "a7group-2", agent: "Abdul Malik Abdul Karim", side: "rent", credit: "Standard" },
      { ref: "a7group-3", agent: "Qasim khan", side: "sale", credit: "Featured" },
    ],
  };
  assert.deepEqual(portalSliceRefs(portal, { agent: "Abdul Malik Abdul Karim" }), ["a7group-1", "a7group-2"]);
  assert.deepEqual(portalSliceRefs(portal, { agent: "Abdul Malik Abdul Karim", side: "sale" }), ["a7group-1"]);
  assert.deepEqual(portalSliceRefs(portal, { credit: "Featured" }), ["a7group-3"]);
  assert.equal(portalSliceRefs(portal, {}), null);
});

test("dubizzle scan reads the live property total, including zero", () => {
  const parsed = parseDubizzleHtml(
    '{"type":"propertyAgency/agencyCountStats/fulfilled","payload":{"agentsCount":0,"holidayHomesCount":0,"propertyForRentCount":0,"propertyForSaleCount":0,"totalPropertyCount":0}}'
  );
  assert.deepEqual(parsed, { ok: true, count: 0, refs: [], agents: [] });
});

test("portal hits keep the website reference and the listing agent", () => {
  const collected = collectPortalAds([
    {
      side: "sale",
      count: 1,
      hits: [{ property_reference: "Ref a7group-1814", listed_by: { name: "Muhammad Akmal" } }],
    },
    {
      side: "rent",
      count: 0,
      hits: [],
    },
  ]);
  assert.equal(collected.count, 1);
  assert.deepEqual(collected.refs, ["a7group-1814"]);
  assert.deepEqual(collected.agents, [{ name: "Muhammad Akmal", listings: 1, sale: 1, rent: 0, premium: 0, featured: 0, hot: 0, superhot: 0 }]);
});

test("dubizzle uses the listing agent and the premium or featured credit", () => {
  const collected = collectPortalAds([
    {
      side: "sale",
      count: 1,
      hits: [
        {
          property_reference: "Ref ID a7group-10",
          listed_by: { en: "Agent" },
          agent: { name: { en: "A7 GROUP REAL ESTATE" } },
          agent_profile: { name: { en: "Abdul Malik Abdul Karim" } },
          is_premium: true,
          featured_listing: false,
          name: { en: "Villa in Mudon" },
          price: 100,
          bedrooms: 3,
          bathrooms: 4,
          size: 2200,
          category_v2: { names_en: ["Villa", "Residential", "Property for Sale"] },
          location_path: { en: { lvl2: "UAE > Dubai > Mudon" } },
          city: { name: { en: "Dubai" } },
        },
      ],
    },
  ]);
  assert.equal(agentNameFromPortalHit({ agent: { name: { en: "A7 GROUP REAL ESTATE" } }, listed_by: { en: "Agent" } }), "");
  assert.equal(collected.agents[0].name, "Abdul Malik Abdul Karim");
  assert.equal(collected.agents[0].premium, 1);
  assert.equal(collected.products.premium, 1);
  assert.equal(collected.products.standard, 0);
  assert.equal(collected.ads[0].credit, "Premium");
  assert.equal(collected.ads[0].type, "villa");
  assert.equal(collected.ads[0].community, "Mudon");
  assert.equal(collected.ads[0].agent, "Abdul Malik Abdul Karim");
});

test("Bayut company hits keep the reference, agent, type and sqft", () => {
  const portal = bayutPortalFromHits([
    {
      referenceNumber: "a7group-1885",
      externalID: "16795655",
      purpose: "for-rent",
      price: 60000,
      rooms: 0,
      baths: 0,
      area: 66.98309184,
      title: "Spacious Ground Floor Shop",
      product: "superhot",
      furnishingStatus: "unfurnished",
      category: [
        { name: "Commercial", slug: "commercial" },
        { nameSingular: "Shop", name: "Shops", slug: "shops" },
      ],
      location: [
        { name: "UAE" },
        { name: "Dubai" },
        { name: "International City" },
        { name: "Greece Cluster" },
      ],
      agent: "Abdul Malik Abdul Karim",
      coverPhoto: "871845248",
    },
    { referenceNumber: "not-ours", externalID: "1", purpose: "for-sale" },
  ]);
  assert.equal(portal.ok, true);
  assert.equal(portal.count, 1);
  assert.equal(portal.refs[0], "a7group-1885");
  assert.equal(portal.ads[0].type, "shop");
  assert.equal(portal.ads[0].side, "rent");
  assert.equal(portal.ads[0].size, 721);
  assert.equal(portal.ads[0].credit, "Superhot");
  assert.equal(portal.ads[0].community, "International City");
  assert.equal(portal.ads[0].agent, "Abdul Malik Abdul Karim");
  assert.equal(portal.agents[0].listings, 1);
  assert.equal(portal.agents[0].superhot, 1);
  assert.equal(portal.agents[0].hot, 0);
  assert.equal(portal.agents[0].premium, 0);
  assert.equal(portalReadingReady(portal), true);
});

test("a human check does not invent a listing count", () => {
  assert.equal(parseDubizzleHtml("<html>Pardon Our Interruption</html>").ok, false);
  assert.equal(parseBayutHtml("<html><title>Security check | Bayut</title>Verify you are human</html>").ok, false);
  assert.equal(parseBayutHtml("<html>Verify you are human. 134 Properties</html>").ok, false);
  assert.equal(parseBayutHtml("<html><title>A7 Group | 14 Properties</title></html>").count, 14);
  assert.equal(parseBayutHtml("<html>Properties - 0</html>").count, 0);
  assert.equal(portalReadingReady({ ok: true, count: 0, refs: [] }), true);
  assert.equal(portalReadingReady({ ok: true, count: 14, refs: ["a7group-1"] }), false);
  assert.equal(portalReadingReady({ ok: true, count: 1, refs: ["a7group-1"] }), true);
});

test("a later Bayut check keeps the saved ads in the listing search", () => {
  const saved = {
    ok: true,
    count: 2,
    refs: ["a7group-1", "a7group-2"],
    ads: [{ ref: "a7group-1" }, { ref: "a7group-2" }],
  };
  const blocked = mergePortalReading(saved, { ok: false, error: "Bayut asked to verify you are human" });
  assert.equal(blocked.ads.length, 2);
  assert.match(blocked.lastError, /human/);
  const thin = mergePortalReading(saved, { ok: true, count: 2, refs: ["a7group-1", "a7group-2"], ads: [] });
  assert.deepEqual(thin.refs, ["a7group-1", "a7group-2"]);
  assert.equal(thin.ads.length, 2);
  const replaced = mergePortalReading(saved, { ok: true, count: 1, refs: ["a7group-9"], ads: [{ ref: "a7group-9" }] });
  assert.deepEqual(replaced.refs, ["a7group-9"]);
});
