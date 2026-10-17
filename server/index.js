import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { loadEnv } from "./loadEnv.js";
import { collapseOwnerRefs } from "./listingOwnerMap.js";
import { DIRECTORY_KINDS, openDb, STATUSES } from "./db.js";
import { DEMO_LISTINGS } from "./seed.js";
import { brochureHtml, dldSvg, listingPdf, publicListingHtml } from "./exports.js";
import { findExactDuplicate, listingDuplicateError } from "./listingDuplicates.js";
import { listingLivePriceError, listingPublishError } from "./listingErrors.js";
import { archiveExpiredListings, scheduleExpiryArchive } from "./listingExpiry.js";
import { dismissExpiryAlerts, getExpiryAlerts, sendExpiryBitrixNotice } from "./listingExpiryAlerts.js";
import { listingAdFacts } from "./listingAdBoard.js";
import { PORTALS, PORTAL_NAMES, UNPUBLISH_PORTALS, agentPortfolioSummary, autoTitle, emptyAgentPortfolio, groupListingHistory, listingExpiryError, listingHistoryRows, listingIsLiveOnPortal, listingQualityScore, liveCategoryBoard, liveTypesByPortal, liveUnpublishTargets, qualityGaps, summarize, websiteSearchCounts } from "./listingModel.js";
import { pushListingToPfSafe, unpublishListingFromPortals } from "./pfPublish.js";
import { browseCityCatalog, fullLocationCatalog, locationCatalog, mergeCatalogs, searchLocationHits } from "./locations.js";
import { ensureUploadDir, saveUpload } from "./uploads.js";
import { feedSummary, livePortalCounts, portalFeedXml } from "./feeds.js";
import { agentsFromAds, portalAgentDetails, portalSitesForOverview, portalSliceRefs, schedulePortalSiteScan, websiteLiveGate } from "./portalSiteScan.js";
import { pullCrmPortalLeadsLocked, scheduleCrmLeadSync } from "./crmLeadSync.js";
import { scheduleBayutLeadPull } from "./bayutLeadPull.js";
import { importRows, parseCsv } from "./importer.js";
import {
  CONTRACT_KINDS,
  buildSigners,
  contractFromListing,
  contractPdf,
  contractStatus,
  issueTokens,
  kindLabel,
} from "./contracts.js";
import {
  chequeVerifyDoneHtml,
  chequeVerifyPageHtml,
  nocSignDoneHtml,
  nocSignPageHtml,
  signDoneHtml,
  signErrorHtml,
  signPageHtml,
  tenancySignDoneHtml,
  tenancySignPageHtml,
} from "./signPage.js";
import {
  STAGES as TENANCY_STAGES,
  bothTenancyPartiesSigned,
  buildTenancyPdf,
  canInviteTenancyParty,
  findTenancySigner,
  firstTenancyEmailParty,
  isKnownStage,
  issueTenancySignTokens,
  missingDetails,
  nextUnsignedTenancyParty,
  normalizeForm,
  normalizeStage,
  pdfFilename,
  phoneDigits,
  photoView,
  prepareTenancyInvite,
  preserveTenancySigners,
  readFileSafe,
  removeTenancyPhotoFile,
  rowView as tenancyView,
  signedTenancyPdf,
  stageLabel,
  storePdf,
  storeSigned,
  storeTenancyPhotoFile,
  tenancyContractPdf,
  tenancySigners,
  tenancySignSummary,
  tenancyStageFromSigners,
  whatsappText,
} from "./tenancy.js";
import { BitrixTokenError, createCrmContact, logWhatsappActivity, lookupCrm, searchCrm, searchCrmMany } from "./bitrixCrm.js";
import { sendMail, smtpConfigured } from "./smtp.js";
import {
  chequeProofFileName,
  chequeProofMime,
  chequeProofPath,
  chequeReceiptExpiry,
  chequeReceiptExpired,
  decodeChequeProof,
  decodeSignatureImage,
  findChequeReceipt,
  isEmail,
  newChequeReceiptToken,
  ownerVerifyEmail,
  ownerVerifySubject,
  pickChequeRow,
  preserveTenancyChequeReceipts,
  rawChequeReceipts,
  storeChequeProof,
  tenantAckEmail,
  tenantAckSubject,
} from "./tenancyChequeReceipt.js";
import { applyNocSignature, emailNocForSign, findNocSign, markNocSignViewed, NOC_MAIL_KINDS, whatsappNocForSign } from "./nocMail.js";
import { nocSignExpired } from "./nocSignState.js";
import { attachLeadCounts, buildOverviewReport, topAgentsByLeads, topListingsByLeads } from "./overviewReport.js";
import { lookupDld } from "./dld.js";
import { pfConfigured } from "./pf.js";
import { runPfLeadSync, runPfSync, schedulePfSync, syncRunning } from "./pfSync.js";
import { ejariBlankPath } from "./tenancyPdf.js";
import { extractTenancyFromImage, readImagePayload } from "./tenancyExtract.js";
import { extractNocFromImage } from "./nocExtract.js";
import { generateListingCopy } from "./listingCopy.js";
import { alertFrontOpenAiLow } from "./openaiAlert.js";
import { leadView, leadsPageView, loadLeadRecording, sendAudio } from "./leadRecording.js";
import { leadActivity, portalLeadCounts } from "./leadPortal.js";
import { bayutPushLead } from "./bayutLeadWebhook.js";
import {
  amountInWords,
  formFromListing,
  listBookings,
  missingDetails as bookingMissing,
  normalizeForm as normalizeBookingForm,
  pdfFilename as bookingPdfName,
  readBooking,
  readFileSafe as readBookingFile,
  removeBooking,
  rowView as bookingView,
  writeBooking,
} from "./booking.js";
import {
  formFromListing as nocFromListing,
  listNocs,
  missingDetails as nocMissing,
  normalizeForm as normalizeNocForm,
  pdfFilename as nocPdfName,
  readFileSafe as readNocFile,
  readNoc,
  removeNoc,
  rowView as nocView,
  writeNoc,
} from "./noc.js";
import {
  addScopeOption as addNocMaintScopeOption,
  formFromListing as nocMaintFromListing,
  listMaints,
  missingDetails as nocMaintMissing,
  normalizeForm as normalizeNocMaintForm,
  pdfFilename as nocMaintPdfName,
  readFileSafe as readNocMaintFile,
  readMaint,
  readScopeOptions as readNocMaintScopeOptions,
  removeMaint,
  rowView as nocMaintView,
  writeMaint,
} from "./nocMaint.js";
import {
  formFromListing as nocMoveinFromListing,
  listMoveins,
  missingDetails as nocMoveinMissing,
  normalizeForm as normalizeNocMoveinForm,
  pdfFilename as nocMoveinPdfName,
  readFileSafe as readNocMoveinFile,
  readMovein,
  removeMovein,
  rowView as nocMoveinView,
  writeMovein,
} from "./nocMovein.js";
import {
  formFromListing as nocMoveoutFromListing,
  listMoveouts,
  missingDetails as nocMoveoutMissing,
  normalizeForm as normalizeNocMoveoutForm,
  pdfFilename as nocMoveoutPdfName,
  readFileSafe as readNocMoveoutFile,
  readMoveout,
  removeMoveout,
  rowView as nocMoveoutView,
  writeMoveout,
} from "./nocMoveout.js";
import {
  formFromListing as nocTrakheesiFromListing,
  listTrakheesi,
  missingDetails as nocTrakheesiMissing,
  normalizeForm as normalizeNocTrakheesiForm,
  pdfFilename as nocTrakheesiPdfName,
  readFileSafe as readNocTrakheesiFile,
  readTrakheesi,
  removeTrakheesi,
  rowView as nocTrakheesiView,
  writeTrakheesi,
} from "./nocTrakheesi.js";
import {
  formFromListing as formIFromListing,
  listFormI,
  missingDetails as formIMissing,
  normalizeForm as normalizeFormI,
  pdfFilename as formIPdfName,
  readFileSafe as readFormIFile,
  readFormI,
  removeFormI,
  rowView as formIView,
  writeFormI,
} from "./formI.js";
import {
  formFromListing as bookingFormFromListing,
  listBookingForms,
  missingDetails as bookingFormMissing,
  nextVoucherNo,
  normalizeForm as normalizeBookingReceipt,
  pdfFilename as bookingFormPdfName,
  readBookingForm,
  removeBookingForm,
  rowView as bookingFormView,
  setBookingRefund,
  writeBookingForm,
  bookingFormPdf,
} from "./bookingForm.js";
import {
  formFromListing as formAFromListing,
  listFormA,
  missingDetails as formAMissing,
  normalizeForm as normalizeFormA,
  ownerDisplayName as formAOwner,
  pdfFilename as formAPdfName,
  readFileSafe as readFormAFile,
  readFormA,
  removeFormA,
  rowView as formAView,
  writeFormA,
} from "./formA.js";
import { LISTING_ACCESS_DENIED } from "./listingAccess.js";
import {
  canManageUiPermissions,
  canManageUiPermissionsFor,
  getSectionsForUser,
  loadPermissionsMap,
  normalizeSavedSections,
  resolveSectionDesk,
  sectionCatalog,
  setSectionsForUser,
} from "./uiPermissions.js";
import {
  bindLeftMenu,
  clearSession,
  requireAuth,
  setAuthDb,
  verifyBitrix,
  writeSession,
} from "./auth.js";
import { addCrmIntelligenceAgent, armWhatsappChat, checkCrmIntelligence, crmRead, listCrmIntelligenceAgents, listCrmIntelligenceFilters, readOptionSentNumbers } from "./crmIntelligence.js";
import { checkAgentDailyReport, checkOfficeShareHistory } from "./agentDailyReport.js";
import { checkAgentMonthBoard } from "./agentMonthBoard.js";
import { agentMonthBoardPdf, agentMonthBoardPdfName } from "./agentMonthBoardPdf.js";
import { checkTeamLeadReport, listTeamLeadPeople, addTeamLeadPerson, removeTeamLeadPerson } from "./teamLeadReport.js";
import { scheduleAgentReportPdfs } from "./agentReportDispatch.js";
import { agentDailyReportPdf, agentDailyReportPdfName } from "./agentDailyReportPdf.js";
import { applyAgentReportPrivacy } from "./reportPrivacy.js";
import { getTlNote, listTlNotes, saveTlNote } from "./tlNotes.js";
import { checkOfficeInventory } from "./officeInventory.js";
import { checkOfficeLeads } from "./officeLeads.js";
import { checkCrmOwnerData } from "./crmOwnerData.js";
import { PF_LEAD_UF } from "./bitrixLeadSync.js";

loadEnv();

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "client", "dist");
const PORT = Number(process.env.PORT || 8844);
const HOST = process.env.HOST || "127.0.0.1";
const ORIGIN = process.env.PUBLIC_ORIGIN || `http://${HOST}:${PORT}`;

const db = await openDb();
setAuthDb(db);
const restoredLive = await db.restorePortalLive();
if (restoredLive) console.log(`Restored ${restoredLive} portal-live listings to Live`);
const archivedExpired = await archiveExpiredListings(db);
if (archivedExpired) console.log(`Auto-archived ${archivedExpired} expired listing${archivedExpired === 1 ? "" : "s"}`);
// Demo rows only for local development without Property Finder credentials.
if (process.env.DEMO_SEED === "1" && !pfConfigured()) {
  await db.seedIfEmpty(DEMO_LISTINGS);
  await db.enrich(DEMO_LISTINGS);
}
schedulePfSync(db, Number(process.env.PF_SYNC_MINUTES || 15));
scheduleCrmLeadSync(db);
scheduleBayutLeadPull(db);
scheduleExpiryArchive(db);
schedulePortalSiteScan(db);
scheduleAgentReportPdfs(db);

function actor(req) {
  return {
    agentId: req.user?.id || "",
    agentName: req.user?.name || "",
    admin: Boolean(req.user?.admin),
  };
}

function by(req) {
  const name = String(req.user?.name || "").trim();
  if (name) return name;
  const email = String(req.user?.email || "").trim();
  if (email) return email;
  if (req.user?.id) return `User ${req.user.id}`;
  return "Desk";
}

function listingBy(req) {
  return {
    name: by(req),
    id: String(req.user?.id || "").trim(),
  };
}

function requireAdmin(req, res, next) {
  if (!req.user?.admin) {
    res.status(403).json({ error: "Only an admin can do this." });
    return;
  }
  next();
}

function idsOf(req) {
  return Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : [];
}

async function listingFilters(req) {
  const filters = listFilters(req);
  if (filters.portal) {
    filters.websiteLive = await websiteLiveGate(db);
    const slice = {
      agent: req.query.portal_agent,
      side: req.query.portal_side,
      credit: req.query.portal_credit,
      type: req.query.portal_type,
      beds: req.query.portal_beds,
      community: req.query.portal_community,
      cluster: req.query.portal_cluster,
      live: req.query.portal_live,
    };
    if (slice.agent || slice.side || slice.credit || slice.type || slice.beds || slice.community || slice.cluster || slice.live) {
      const scan = await portalSitesForOverview(db);
      const refs = portalSliceRefs(scan?.portals?.[filters.portal], slice, await db.all()) || [];
      filters.websiteLive = {
        ...filters.websiteLive,
        [filters.portal]: { ok: true, count: refs.length, refs },
      };
    }
  }
  return filters;
}

function portalTypesFromAds(liveByType, scan) {
  const next = { ...liveByType };
  for (const id of ["bayut", "dubizzle"]) {
    const portal = scan?.portals?.[id];
    const ads = Array.isArray(portal?.ads) ? portal.ads : [];
    if (!portal?.ok || !ads.length) continue;
    const counts = {};
    for (const ad of ads) {
      const type = String(ad?.type || "apartment");
      counts[type] = (counts[type] || 0) + 1;
    }
    next[id] = Object.entries(counts).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  }
  return next;
}

function withAgentDetails(scan, rows) {
  if (!scan?.portals) return scan;
  const portals = {};
  for (const [id, portal] of Object.entries(scan.portals)) {
    if (!portal || typeof portal !== "object" || !Array.isArray(portal.agents)) {
      portals[id] = portal;
      continue;
    }
    const details = portalAgentDetails(portal, rows);
    const spots = new Map(agentsFromAds(portal.ads || []).map((agent) => [agent.name, agent]));
    portals[id] = {
      ...portal,
      agents: portal.agents.map((agent) => {
        const spot = spots.get(agent.name) || {};
        const detail = details.get(agent.name);
        return {
          ...agent,
          premium: Number(spot.premium || 0),
          featured: Number(spot.featured || 0),
          hot: Number(spot.hot || 0),
          superhot: Number(spot.superhot || 0),
          ...(detail ? { detail } : {}),
        };
      }),
    };
  }
  return { ...scan, portals };
}

function portalScanForClient(scan) {
  if (!scan?.portals) return scan;
  const portals = {};
  for (const [id, portal] of Object.entries(scan.portals)) {
    if (!portal || typeof portal !== "object") {
      portals[id] = portal;
      continue;
    }
    const { ads, ...rest } = portal;
    portals[id] = rest;
  }
  return { ...scan, portals };
}

async function attachPortalFacts(listings) {
  const scan = await portalSitesForOverview(db);
  const gate = await websiteLiveGate(db);
  const ads = new Map();
  const bayutAds = new Map();
  for (const ad of scan?.portals?.dubizzle?.ads || []) {
    const ref = String(ad?.ref || "").trim().toLowerCase();
    if (ref) ads.set(ref, ad);
  }
  for (const ad of scan?.portals?.bayut?.ads || []) {
    const ref = String(ad?.ref || "").trim().toLowerCase();
    if (ref) bayutAds.set(ref, ad);
  }
  return (listings || []).map((row) => {
    const ref = String(row?.reference || "").trim().toLowerCase();
    const ad = ads.get(ref);
    const bayutAd = bayutAds.get(ref);
    const live = ["pf", "bayut", "dubizzle"].filter((id) => listingIsLiveOnPortal(row, id, gate));
    return {
      ...row,
      live_portals: live,
      dubizzle: ad
        ? {
            agent: ad.agent || "",
            agentPhoto: ad.agentPhoto || "",
            credit: ad.credit || "Standard",
            premium: Boolean(ad.premium),
            featured: Boolean(ad.featured),
            promoted: Boolean(ad.promoted),
            highlighted: Boolean(ad.highlighted),
            url: ad.url || "",
            title: ad.title || "",
            type: ad.type || "",
            side: ad.side || "",
            category: ad.category || "",
            community: ad.community || "",
            beds: Number(ad.beds) || 0,
            baths: Number(ad.baths) || 0,
            size: Number(ad.size) || 0,
            price: Number(ad.price) || 0,
            photo: ad.photo || "",
          }
        : null,
      bayut: bayutAd
        ? {
            agent: bayutAd.agent || "",
            agentPhoto: bayutAd.agentPhoto || "",
            credit: bayutAd.credit || "Standard",
            url: bayutAd.url || "",
            title: bayutAd.title || "",
            type: bayutAd.type || "",
            side: bayutAd.side || "",
            category: bayutAd.category || "",
            community: bayutAd.community || "",
            beds: Number(bayutAd.beds) || 0,
            baths: Number(bayutAd.baths) || 0,
            size: Number(bayutAd.size) || 0,
            price: Number(bayutAd.price) || 0,
            photo: bayutAd.photo || "",
          }
        : null,
    };
  });
}

function listFilters(req) {
  return {
    ...actor(req),
    status: req.query.status,
    scope: req.query.scope,
    purpose: req.query.purpose,
    type: req.query.type,
    category: req.query.category,
    project_status: req.query.project_status,
    city: req.query.city,
    community: req.query.community,
    sub_community: req.query.sub_community,
    building: req.query.building,
    listing_agent: req.query.listing_agent,
    portal_agent: req.query.portal_agent,
    portal_side: req.query.portal_side,
    portal_credit: req.query.portal_credit,
    listing_owner: req.query.listing_owner,
    landlord: req.query.landlord,
    developer: req.query.developer,
    portal: req.query.portal,
    listing_id: req.query.listing_id,
    unit_no: req.query.unit_no,
    permit_number: req.query.permit_number,
    landlord_email: req.query.landlord_email,
    landlord_phone: req.query.landlord_phone,
    q: req.query.q,
    minBeds: req.query.minBeds,
    beds: req.query.beds,
    maxBeds: req.query.maxBeds,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    quality: req.query.quality,
    sort: req.query.sort,
    dir: req.query.dir,
    page: req.query.page,
    pageSize: req.query.pageSize,
  };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "40mb" }));
app.use(express.urlencoded({ extended: true, limit: "40mb" }));
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "40mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(ensureUploadDir(root)));

app.use((req, res, next) => {
  if (
    (req.path === "/" || req.path === "/install") &&
    req.method === "POST"
  ) {
    req.method = "GET";
  }
  next();
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, app: "a7-listing-v2" });
});

app.get("/api/internal/listing-owner-map", async (req, res) => {
  const expected = String(process.env.A7_LISTING_OWNER_MAP_TOKEN || "");
  const got = String(req.get("x-a7-map-token") || "");
  const same =
    expected.length > 0 &&
    got.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  if (!same) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  try {
    const rows = await db.listingOwnerRefs();
    res.json({ owners: collapseOwnerRefs(rows) });
  } catch (error) {
    console.error("listing-owner-map", error instanceof Error ? error.message : "failed");
    res.status(500).json({ error: "Map unavailable" });
  }
});

app.post("/webhook/bayut-leads", async (req, res) => {
  try {
    const lead = bayutPushLead(req.body);
    if (!lead) {
      res.status(200).json({ ok: true, stored: false });
      return;
    }
    if (lead.reference) {
      const rows = await db.all();
      const match = rows.find((row) => String(row.reference || "").toLowerCase() === lead.reference.toLowerCase());
      if (match) lead.listing_id = match.id;
    }
    await db.upsertLeads([lead]);
    console.log(`Bayut lead webhook stored ${lead.entity_type} ${lead.channel || "lead"}`);
    res.status(200).json({ ok: true, stored: true });
  } catch (error) {
    console.error("Bayut lead webhook failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ ok: false });
  }
});

// ---------------------------------------------------------------- auth

app.post("/api/auth/bitrix", async (req, res) => {
  try {
    const user = await verifyBitrix(
      req.body.AUTH_ID || req.body.authId,
      req.body.DOMAIN || req.body.domain
    );
    const deskUser = await resolveSectionDesk(db, user);
    if (!deskUser?.deskAccess) {
      res.status(403).json({ error: LISTING_ACCESS_DENIED });
      return;
    }
    writeSession(res, deskUser);
    await db.touchUser(deskUser);
    const sections = await getSectionsForUser(db, deskUser);
    res.json({
      ok: true,
      user: deskUser,
      sections,
      canManageUiPermissions: await canManageUiPermissionsFor(db, deskUser),
    });
  } catch (error) {
    res.status(403).json({ error: error.message || "Auth failed" });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const sections = await getSectionsForUser(db, req.user);
    res.json({
      user: req.user,
      sections,
      canManageUiPermissions: await canManageUiPermissionsFor(db, req.user),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load session" });
  }
});

app.get("/api/ui-permissions", requireAuth, async (req, res) => {
  try {
    if (!(await canManageUiPermissionsFor(db, req.user))) {
      res.status(403).json({ ok: false, error: "Only an admin can edit section permissions." });
      return;
    }
    const [map, agents] = await Promise.all([
      loadPermissionsMap(db),
      listCrmIntelligenceAgents({ db }).catch(() => ({ agents: [] })),
    ]);
    const users = (agents.agents || []).map((row) => ({
      id: String(row.id || ""),
      name: String(row.name || ""),
      sections: Object.prototype.hasOwnProperty.call(map, String(row.id))
        ? normalizeSavedSections(map[String(row.id)])
        : null,
    })).filter((row) => row.id && row.name);
    res.json({
      ok: true,
      sections: sectionCatalog(),
      users,
      map,
    });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Permissions failed" });
  }
});

app.put("/api/ui-permissions/:userId", requireAuth, async (req, res) => {
  try {
    if (!(await canManageUiPermissionsFor(db, req.user))) {
      res.status(403).json({ ok: false, error: "Only an admin can edit section permissions." });
      return;
    }
    const out = await setSectionsForUser(db, req.params.userId, req.body?.sections);
    res.json(out);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Save failed" });
  }
});

app.get("/api/ui-permissions/me", requireAuth, async (req, res) => {
  try {
    const sections = await getSectionsForUser(db, req.user);
    res.json({
      ok: true,
      sections,
      canManage: await canManageUiPermissionsFor(db, req.user),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Could not load permissions" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.post("/api/install", async (req, res) => {
  try {
    const user = await verifyBitrix(
      req.body.AUTH_ID || req.body.authId,
      req.body.DOMAIN || req.body.domain
    );
    const deskUser = await resolveSectionDesk(db, user);
    if (!deskUser?.deskAccess) {
      res.status(400).json({ error: LISTING_ACCESS_DENIED });
      return;
    }
    writeSession(res, deskUser);
    await db.touchUser(deskUser);
    const bind = await bindLeftMenu(deskUser.authId, deskUser.domain);
    res.json({ ok: true, user: deskUser, bind });
  } catch (error) {
    res.status(400).json({ error: error.message || "Install failed" });
  }
});

// ---------------------------------------------------------------- summary / meta

app.get("/api/listings/summary", requireAuth, async (req, res) => {
  const filters = actor(req);
  const rows = await db.all();
  const summary = summarize(rows, filters);
  const websiteLive = await websiteLiveGate(db);
  const board = liveCategoryBoard(rows, websiteLive);
  summary.infographics.byCategory = board.byCategory;
  summary.infographics.purpose = board.purpose;
  summary.infographics.category = board.category;
  summary.infographics.portals = {
    ...summary.infographics.portals,
    pf: board.portals.pf,
    bayut: board.portals.bayut,
    dubizzle: board.portals.dubizzle,
    houza: board.portals.houza,
    website: board.portals.website,
  };
  res.json({
    counts: summary.counts,
    infographics: summary.infographics,
    websiteCounts: websiteSearchCounts(rows, websiteLive),
  });
});

function personKey(name) {
  return String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
}

app.get("/api/listings/meta", requireAuth, async (_req, res) => {
  const people = await db.people();
  const pfPhotos = {};
  for (const user of await db.pfUsers()) {
    const key = personKey(user.name);
    if (key && user.photo) pfPhotos[key] = user.photo;
  }
  res.json({
    meta: {
      ...(await db.meta()),
      locations: await fullLocationCatalog(db),
      directory: people,
      pf_photos: pfPhotos,
      feeds: Object.fromEntries(
        PORTALS.map((portal) => [portal, `${ORIGIN.replace(/\/$/, "")}/feeds/${portal}.xml`])
      ),
    },
  });
});

app.get("/api/locations", requireAuth, async (_req, res) => {
  try {
    res.json({ locations: await fullLocationCatalog(db) });
  } catch (error) {
    res.json({ locations: locationCatalog() });
  }
});

app.get("/api/locations/search", requireAuth, async (req, res) => {
  try {
    const catalog = await fullLocationCatalog(db);
    const hits = await searchLocationHits({
      q: req.query.q,
      city: req.query.city,
      community: req.query.community,
      type: req.query.type,
      catalog,
    });
    res.json({ hits });
  } catch (error) {
    res.status(500).json({ error: error.message || "Location search failed.", hits: [] });
  }
});

app.get("/api/locations/browse", requireAuth, async (req, res) => {
  try {
    const city = String(req.query.city || "").trim();
    const extra = city ? await browseCityCatalog(city) : locationCatalog();
    const locations = mergeCatalogs(await fullLocationCatalog(db), extra);
    res.json({ locations });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load locations.", locations: locationCatalog() });
  }
});

// ---------------------------------------------------------------- directory (agents, owners, landlords, portal accounts)

app.get("/api/directory", requireAuth, async (req, res) => {
  res.json({ people: await db.people(req.query.kind) });
});

app.post("/api/directory", requireAuth, async (req, res) => {
  try {
    if (!DIRECTORY_KINDS.includes(req.body?.kind)) {
      res.status(400).json({ error: "Unknown directory kind" });
      return;
    }
    const person = await db.addPerson(req.body);
    res.status(201).json({ person });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not save" });
  }
});

app.delete("/api/directory/:id", requireAuth, requireAdmin, async (req, res) => {
  res.json({ removed: await db.removePerson(req.params.id) });
});

// ---------------------------------------------------------------- uploads

app.post("/api/uploads", requireAuth, (req, res) => {
  try {
    const file = saveUpload(root, {
      filename: req.body?.filename,
      mime: req.body?.mime,
      data: req.body?.data,
    });
    res.status(201).json(file);
  } catch (error) {
    res.status(400).json({ error: error.message || "Upload failed" });
  }
});

// ---------------------------------------------------------------- listings CRUD

app.get("/api/listings/agent-portfolio", requireAuth, async (req, res) => {
  const name = String(req.query.name || "").trim();
  const id = String(req.query.id || "").trim();
  if (!name && !id) return res.json(emptyAgentPortfolio(""));
  res.json(agentPortfolioSummary(await db.all(), name, id));
});

app.get("/api/listings/expiry-alerts", requireAuth, async (req, res) => {
  res.json(await getExpiryAlerts(db, req.user));
});

app.post("/api/listings/expiry-alerts/dismiss", requireAuth, async (req, res) => {
  const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
  res.json(await dismissExpiryAlerts(db, req.user, keys));
});

app.post("/api/listings/expiry-alerts/notify", requireAuth, async (req, res) => {
  const alerts = await getExpiryAlerts(db, req.user);
  res.json(await sendExpiryBitrixNotice(db, req.user, alerts.items || []));
});

app.post("/api/office-leads/check", requireAuth, async (req, res) => {
  try {
    const report = await checkOfficeLeads({
      mode: req.body?.mode,
      day: req.body?.day,
      month: req.body?.month,
      from: req.body?.from,
      to: req.body?.to,
      period: req.body?.period || "Last 30 Days",
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(report);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Office leads failed" });
  }
});

app.post("/api/office-inventory/check", requireAuth, async (_req, res) => {
  try {
    res.json(await checkOfficeInventory({ db }));
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Office inventory failed" });
  }
});

app.get("/api/listings", requireAuth, async (req, res) => {
  const result = await db.list(await listingFilters(req));
  const leads = await db.allLeads();
  res.json({ ...result, listings: await attachPortalFacts(attachLeadCounts(result.listings, leads)) });
});

app.post("/api/listings/generate-copy", requireAuth, async (req, res) => {
  try {
    const out = await generateListingCopy(req.body || {});
    let frontKeyAlerted = false;
    if (out.frontKeyLow) {
      const alert = await alertFrontOpenAiLow({
        user: req.user,
        db,
        reason: out.frontKeyReason || "front key quota / billing",
        fromName: by(req),
      });
      frontKeyAlerted = Boolean(alert.ok && !alert.skipped);
    }
    res.status(out.ok ? 200 : 400).json({ ...out, frontKeyAlerted });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not generate title and description.",
    });
  }
});

function isPublishStatus(status) {
  return status === "live" || status === "pending";
}

async function livePublishBlock(listing) {
  if (!isPublishStatus(listing?.status || "draft")) return "";
  const expired = listingExpiryError(listing);
  if (expired) return expired;
  const copy = listingPublishError(listing);
  if (copy) return copy;
  const price = listingLivePriceError(listing);
  if (price) return price;
  return listingDuplicateError(listing, await db.all());
}

app.post("/api/listings/duplicate-check", requireAuth, async (req, res) => {
  const listing = req.body || {};
  const hit = findExactDuplicate(listing, await db.all());
  res.json({
    duplicate: hit
      ? { id: hit.id, reference: hit.reference, title: hit.title, status: hit.status }
      : null,
    error: listingDuplicateError(listing, hit ? [hit] : []),
  });
});

app.post("/api/listings", requireAuth, async (req, res) => {
  if (!req.body?.reference) {
    res.status(400).json({ error: "Reference is required" });
    return;
  }
  const copyError = await livePublishBlock(req.body);
  if (copyError) {
    res.status(400).json({ error: copyError });
    return;
  }
  const clash = await db.getByReference(req.body.reference);
  if (clash) {
    res.status(409).json({ error: `Reference ${req.body.reference} already exists` });
    return;
  }
  const listing = await db.create(
    {
      ...req.body,
      title: autoTitle(req.body),
      listing_agent: req.body.listing_agent || req.user?.name || "",
      listing_owner: req.body.listing_owner || req.user?.name || "",
      agent_id: req.body.agent_id || req.user?.id || "",
      created_by: req.body.created_by || req.user?.name || "",
      views: 0,
      history: [],
    },
    listingBy(req)
  );
  const pushed = await pushListingToPfSafe(db, listing, by(req));
  res.status(201).json(pushed);
});

app.patch("/api/listings/:id", requireAuth, async (req, res) => {
  const body = { ...(req.body || {}) };
  delete body.history;
  delete body.views;
  const current = await db.get(req.params.id);
  if (!current) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const copyError = await livePublishBlock({ ...current, ...body });
  if (copyError) {
    res.status(400).json({ error: copyError });
    return;
  }
  const listing = await db.update(req.params.id, body, listingBy(req));
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.json(await pushListingToPfSafe(db, listing, by(req)));
});

app.delete("/api/listings/:id", requireAuth, requireAdmin, async (req, res) => {
  const removed = await db.remove([req.params.id]);
  if (!removed) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.json({ removed });
});

app.post("/api/listings/:id/unpublish", requireAuth, async (req, res) => {
  try {
    const listing = await db.get(req.params.id);
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    const raw = Array.isArray(req.body?.portals) ? req.body.portals : [];
    const allowed = new Set(UNPUBLISH_PORTALS.map((row) => row.id));
    const portals = raw.map((id) => (id === "pf_api" ? "pf" : String(id))).filter((id) => allowed.has(id));
    if (!portals.length) {
      res.status(400).json({ error: "Select at least one portal that is live on this listing." });
      return;
    }
    const out = await unpublishListingFromPortals(db, listing, portals, by(req));
    res.json({
      ok: true,
      listing: out.listing,
      unpublished: out.unpublished,
      available: liveUnpublishTargets(out.listing),
    });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message || "Could not unpublish this listing." });
  }
});

app.post("/api/listings/:id/duplicate", requireAuth, async (req, res) => {
  const listing = await db.duplicate(req.params.id, listingBy(req));
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.status(201).json({ listing });
});

app.post("/api/listings/:id/refresh-create", requireAuth, async (req, res) => {
  const result = await db.refreshCreate(req.params.id, listingBy(req));
  if (!result?.listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const pushed = await pushListingToPfSafe(db, result.listing, by(req));
  res.status(201).json({
    listing: pushed.listing,
    pf_error: pushed.pf_error || "",
    archivedId: result.archivedId,
    previousReference: result.previousReference,
  });
});

app.post("/api/listings/:id/notes", requireAuth, async (req, res) => {
  const current = await db.get(req.params.id);
  if (!current) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const text = String(req.body?.text || "").trim();
  if (!text) {
    res.status(400).json({ error: "Note text is required" });
    return;
  }
  const note = {
    at: new Date().toISOString(),
    by: by(req),
    type: String(req.body?.type || "General"),
    text,
  };
  const listing = await db.update(
    current.id,
    { notes_list: [...(current.notes_list || []), note] },
    listingBy(req)
  );
  res.status(201).json({ listing });
});

// ---------------------------------------------------------------- bulk options (parity with the old desk)

app.post("/api/listings/bulk-status", requireAuth, async (req, res) => {
  const ids = idsOf(req);
  const status = req.body?.status;
  if (!STATUSES.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  if (isPublishStatus(status)) {
    const rows = await db.all();
    for (const id of ids) {
      const row = await db.get(id);
      const next = { ...(row || {}), status };
      const expired = listingExpiryError(next);
      if (expired) {
        res.status(400).json({ error: `${row?.reference || id}: ${expired}` });
        return;
      }
      const copyError = listingPublishError(next);
      if (copyError) {
        res.status(400).json({ error: `${row?.reference || id}: ${copyError}` });
        return;
      }
      const dupError = listingDuplicateError(next, rows);
      if (dupError) {
        res.status(400).json({ error: `${row?.reference || id}: ${dupError}` });
        return;
      }
    }
  }
  const updated = await db.bulkStatus(ids, status, listingBy(req));
  if (status === "live") {
    for (const id of ids) {
      const listing = await db.get(id);
      await pushListingToPfSafe(db, listing, by(req));
    }
  }
  res.json({ updated });
});

app.post("/api/listings/bulk", requireAuth, async (req, res) => {
  const ids = idsOf(req);
  if (!ids.length) {
    res.status(400).json({ error: "Select at least one listing" });
    return;
  }
  const patch = {};
  if (req.body.status) {
    if (!STATUSES.includes(req.body.status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    patch.status = req.body.status;
  }
  if (req.body.listing_agent !== undefined) patch.listing_agent = req.body.listing_agent;
  if (req.body.listing_owner !== undefined) patch.listing_owner = req.body.listing_owner;
  if (Array.isArray(req.body.portals)) {
    patch.portals = req.body.portals.filter((item) => PORTALS.includes(item));
  }
  res.json({ updated: await db.transfer(ids, patch, listingBy(req)) });
});

// Transfer to Agent
app.post("/api/listings/transfer", requireAuth, async (req, res) => {
  const ids = idsOf(req);
  if (!ids.length || !req.body.listing_agent) {
    res.status(400).json({ error: "Agent and at least one listing are required" });
    return;
  }
  const updated = await db.transfer(
    ids,
    {
      listing_agent: req.body.listing_agent,
      ...(req.body.listing_owner ? { listing_owner: req.body.listing_owner } : {}),
    },
    listingBy(req)
  );
  res.json({ updated });
});

// Transfer Owner
app.post("/api/listings/transfer-owner", requireAuth, async (req, res) => {
  const ids = idsOf(req);
  if (!ids.length || !req.body.listing_owner) {
    res.status(400).json({ error: "Owner and at least one listing are required" });
    return;
  }
  const updated = await db.transfer(ids, { listing_owner: req.body.listing_owner }, listingBy(req));
  res.json({ updated });
});

// Transfer between portal accounts (admin only, like the old desk)
app.post("/api/listings/transfer-account", requireAuth, requireAdmin, async (req, res) => {
  const ids = idsOf(req);
  const patch = {};
  if (req.body.pf_account !== undefined && req.body.pf_account !== "") patch.pf_account = String(req.body.pf_account);
  if (req.body.bayut_account !== undefined && req.body.bayut_account !== "") patch.bayut_account = String(req.body.bayut_account);
  if (req.body.listing_owner) patch.listing_owner = String(req.body.listing_owner);
  if (!ids.length || !Object.keys(patch).length) {
    res.status(400).json({ error: "Pick an account and at least one listing" });
    return;
  }
  res.json({ updated: await db.transfer(ids, patch, listingBy(req)) });
});

// Refresh Listings: bumps the update stamp so portals re-read the feed.
app.post("/api/listings/bulk-refresh", requireAuth, requireAdmin, async (req, res) => {
  const ids = idsOf(req);
  if (!ids.length) {
    res.status(400).json({ error: "Select at least one listing" });
    return;
  }
  const updated = await db.transfer(ids, { __note: "refreshed", __value: "Feed refreshed" }, listingBy(req));
  res.json({ updated });
});

// Duplicate Listings
app.post("/api/listings/bulk-duplicate", requireAuth, async (req, res) => {
  const ids = idsOf(req);
  if (!ids.length) {
    res.status(400).json({ error: "Select at least one listing" });
    return;
  }
  const created = [];
  for (const id of ids) {
    const listing = await db.duplicate(id, listingBy(req));
    if (listing) created.push(listing);
  }
  res.status(201).json({ created: created.length, listings: created });
});

// Delete (admin only, like the old desk)
app.post("/api/listings/bulk-delete", requireAuth, requireAdmin, async (req, res) => {
  const ids = idsOf(req);
  if (!ids.length) {
    res.status(400).json({ error: "Select at least one listing" });
    return;
  }
  res.json({ removed: await db.remove(ids) });
});

// Publish / Unpublish / Publish To <portal> / Unpublish From <portal> / Push to Website
app.post("/api/listings/bulk-portals", requireAuth, requireAdmin, async (req, res) => {
  const ids = idsOf(req);
  if (!ids.length) {
    res.status(400).json({ error: "Select at least one listing" });
    return;
  }
  const add = (Array.isArray(req.body.add) ? req.body.add : []).filter((item) => PORTALS.includes(item));
  const remove = (Array.isArray(req.body.remove) ? req.body.remove : []).filter((item) => PORTALS.includes(item));
  const status = STATUSES.includes(req.body.status) ? req.body.status : "";
  const dropAds = [
    ...new Set(
      remove.map((id) => (id === "pf_api" ? "pf" : id)).filter((id) => id === "pf" || id === "bayut" || id === "dubizzle")
    ),
  ];
  if (dropAds.length) {
    try {
      for (const id of ids) {
        const listing = await db.get(id);
        if (!listing || !liveUnpublishTargets(listing).some((p) => dropAds.includes(p))) continue;
        await unpublishListingFromPortals(db, listing, dropAds, by(req));
      }
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message || "Could not unpublish from the portal." });
      return;
    }
  }
  const updated = await db.transfer(
    ids,
    (row) => {
      const portals = new Set(row.portals || []);
      for (const portal of add) portals.add(portal);
      for (const portal of remove) portals.delete(portal);
      const patch = { portals: [...portals] };
      if (status) patch.status = status;
      return patch;
    },
    listingBy(req)
  );
  if (add.includes("pf") || status === "live") {
    for (const id of ids) {
      const listing = await db.get(id);
      await pushListingToPfSafe(db, listing, by(req));
    }
  }
  res.json({ updated });
});

// ---------------------------------------------------------------- import from the old app

app.post("/api/import", requireAuth, requireAdmin, async (req, res) => {
  try {
    let rows = [];
    if (typeof req.body === "string") rows = parseCsv(req.body);
    else if (typeof req.body?.csv === "string") rows = parseCsv(req.body.csv);
    else if (Array.isArray(req.body?.rows)) rows = req.body.rows;
    else if (Array.isArray(req.body)) rows = req.body;
    if (!rows.length) {
      res.status(400).json({ error: "No rows found in the file" });
      return;
    }
    const { listings, skipped } = importRows(rows);
    let created = 0;
    let updated = 0;
    const overwrite = req.body?.overwrite === true || req.query.overwrite === "1";
    for (const listing of listings) {
      const existing = await db.getByReference(listing.reference);
      if (existing && !overwrite) {
        skipped.push({ row: listing.reference, reason: "Already exists (overwrite off)" });
        continue;
      }
      const result = await db.upsertByReference(
        { ...listing, created_by: listing.created_by || `Import by ${by(req)}` },
        listingBy(req)
      );
      if (result.created) created += 1;
      else updated += 1;
    }
    res.json({ created, updated, skipped: skipped.length, details: skipped.slice(0, 50) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Import failed" });
  }
});

// ---------------------------------------------------------------- Property Finder sync, leads, overview

app.get("/api/pf/status", requireAuth, async (_req, res) => {
  res.json({
    configured: pfConfigured(),
    running: syncRunning(),
    last_sync: await db.getSetting("pf_last_sync", null),
    last_lead_sync: await db.getSetting("pf_lead_sync", null),
    credits: await db.getSetting("pf_credits", null),
  });
});

app.post("/api/pf/sync", requireAuth, requireAdmin, async (req, res) => {
  try {
    const summary = await runPfSync(db, { by: `Property Finder sync (${by(req)})` });
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/listings/refresh-portals", requireAuth, async (req, res) => {
  const actorName = by(req);
  const out = { ok: true, pf: null, leads: null, portals: null, errors: [] };
  try {
    out.portals = await portalSitesForOverview(db, { force: true });
  } catch (error) {
    out.errors.push(error instanceof Error ? error.message : "Website scan failed");
  }
  try {
    out.leads = await pullCrmPortalLeadsLocked(db);
  } catch (error) {
    out.errors.push(error instanceof Error ? error.message : "Portal lead sync failed");
  }
  if (pfConfigured()) {
    try {
      out.pf = await runPfSync(db, { by: `Refresh listing (${actorName})` });
    } catch (error) {
      out.errors.push(error instanceof Error ? error.message : "Property Finder sync failed");
    }
  }
  res.json(out);
});

app.get("/api/leads", requireAuth, async (req, res) => {
  res.json(
    leadsPageView(
      await db.leads({
        listing_id: req.query.listing_id,
        reference: req.query.reference,
        channel: req.query.channel,
        status: req.query.status,
        agent: req.query.agent,
        since: req.query.since,
        date: req.query.date,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        portal: req.query.portal,
        has_recording: req.query.has_recording,
        q: req.query.q,
        page: req.query.page,
        pageSize: req.query.pageSize,
      })
    )
  );
});

app.get("/api/leads/:id", requireAuth, async (req, res) => {
  const lead = leadView(await db.lead(req.params.id));
  if (!lead) {
    res.status(404).json({ ok: false, error: "Lead not found." });
    return;
  }
  res.json({ lead });
});

app.get("/api/leads/:id/recording", requireAuth, async (req, res) => {
  const lead = await db.lead(req.params.id);
  if (!lead) {
    res.status(404).json({ ok: false, error: "Lead not found." });
    return;
  }
  if (lead.channel !== "call" || !String(lead.call_record || "").trim()) {
    res.status(404).json({ ok: false, error: "This lead has no call recording." });
    return;
  }
  try {
    const audio = await loadLeadRecording(lead, db);
    if (!audio.ok) {
      res.status(410).json({ ok: false, error: audio.error || "Could not open this recording." });
      return;
    }
    sendAudio(req, res, audio);
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Could not open this recording." });
  }
});

app.get("/api/listings/:id/lead-summary", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found" });
    return;
  }
  const leads = await db.allLeads();
  const ref = String(listing.reference || "").trim().toLowerCase();
  const desk = leads.filter(
    (lead) =>
      String(lead.listing_id || "") === String(listing.id) ||
      String(lead.reference || "").trim().toLowerCase() === ref
  ).length;
  let crm = null;
  let crmError = "";
  if (listing.reference) {
    try {
      const body = await crmRead("crm.lead.list", {
        filter: { [PF_LEAD_UF.reference]: listing.reference },
        select: ["ID"],
        start: 0,
      });
      const rows = Array.isArray(body?.result) ? body.result : [];
      crm = Number(body?.total ?? rows.length) || rows.length;
    } catch (error) {
      crmError = error instanceof Error ? error.message : "Could not read CRM leads";
    }
  }
  res.json({
    ok: true,
    id: listing.id,
    reference: listing.reference,
    desk,
    crm,
    crmError,
  });
});

app.get("/api/listings/:id/leads", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const byId = await db.leads({ listing_id: listing.id, pageSize: 100 });
  const byRef = listing.reference ? await db.leads({ reference: listing.reference, pageSize: 100 }) : { leads: [] };
  const seen = new Set();
  const leads = [...byId.leads, ...byRef.leads].filter((lead) => !seen.has(lead.id) && seen.add(lead.id));
  leads.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  res.json({ leads: leads.map(leadView), total: leads.length });
});

function refreshLeadsIfStale() {
  db.getSetting("pf_lead_sync", null)
    .then((saved) => {
      const age = saved?.at ? Date.now() - Date.parse(saved.at) : Infinity;
      if (age > 45000) runPfLeadSync(db).catch((error) => console.error("PF lead sync failed:", error.message));
    })
    .catch(() => {});
  db.getSetting("crm_lead_sync", null)
    .then((saved) => {
      const age = saved?.at ? Date.now() - Date.parse(saved.at) : Infinity;
      if (age > 120000) pullCrmPortalLeadsLocked(db).catch((error) => console.error("CRM portal lead sync failed:", error.message));
    })
    .catch(() => {});
}

async function latestLeadCards(leads) {
  const cards = [];
  for (const lead of leads) {
    let desk = null;
    if (lead.listing_id) desk = await db.get(lead.listing_id);
    if (!desk && lead.reference) desk = await db.getByReference(lead.reference);
    cards.push({ ...lead, listing_id: desk?.id || lead.listing_id || "", on_desk: Boolean(desk) });
  }
  return cards;
}

function leadWindowFromQuery(query, leads, now = Date.now()) {
  return leadActivity(leads, {
    now,
    range: String(query.lead_range || "day"),
    from: String(query.lead_from || ""),
    to: String(query.lead_to || ""),
  });
}

app.get("/api/overview/leads", requireAuth, async (req, res) => {
  refreshLeadsIfStale();
  const leads = await db.allLeads();
  const rows = await db.all();
  const activity = leadWindowFromQuery(req.query, leads);
  let websiteLive = {};
  try {
    websiteLive = await websiteLiveGate(db);
  } catch {
    websiteLive = {};
  }
  res.json({
    generated_at: new Date().toISOString(),
    label: activity.label,
    hourly: activity.hourly,
    from: activity.from,
    to: activity.to,
    daily: activity.daily,
    by_channel: activity.by_channel,
    latest: await latestLeadCards(activity.latest),
    top_listings: topListingsByLeads(rows, leads),
    report: buildOverviewReport(rows, leads, req.query.days, websiteLive),
  });
});

function overviewCacheKey(query = {}) {
  return [query.days || "7", query.lead_range || "day", query.lead_from || "", query.lead_to || ""].join("|");
}

const overviewSnapshots = new Map();
const overviewJobs = new Map();
const OVERVIEW_FRESH_MS = 25_000;

async function buildOverview(req) {
  refreshLeadsIfStale();
  const rows = await db.all();
  const leads = await db.allLeads();
  const now = Date.now();
  const dayMs = 86400000;
  const sinceIso = (days) => new Date(now - days * dayMs).toISOString();
  const leadsSince = (days) => leads.filter((lead) => lead.created_at >= sinceIso(days));
  const counts = await db.counts(actor(req));
  const portalLive = livePortalCounts(rows);
  const pfLive = rows.filter((row) => row.pf_is_live === "1");
  const takendown = rows.filter((row) => row.pf_id && row.pf_state && row.pf_state !== "live");
  const reasonCounts = {};
  for (const row of takendown) {
    const reason = row.pf_reasons?.[0] || "No reason given";
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
  const scored = rows.filter((row) => listingQualityScore(row) != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + listingQualityScore(row), 0) / scored.length)
    : 0;
  const quality = { below70: 0, mid: 0, high: 0, none: 0 };
  for (const row of rows) {
    const score = listingQualityScore(row);
    if (score == null) quality.none += 1;
    else if (score < 70) quality.below70 += 1;
    else if (score < 90) quality.mid += 1;
    else quality.high += 1;
  }
  let portalsLive = null;
  let websiteLive = {};
  try {
    portalsLive = await portalSitesForOverview(db);
    websiteLive = await websiteLiveGate(db);
  } catch (error) {
    portalsLive = { scannedAt: "", error: error instanceof Error ? error.message : "Portal scan failed", portals: {} };
  }
  const lowQualityAll = rows.filter((row) => {
    if (!listingIsLiveOnPortal(row, "pf", websiteLive)) return false;
    const score = listingQualityScore(row);
    if (score == null || score >= 90) return false;
    return qualityGaps(row).some((gap) => gap.color === "red");
  });
  const below70Live = rows.filter(
    (row) => listingIsLiveOnPortal(row, "pf", websiteLive) && listingQualityScore(row) != null && listingQualityScore(row) < 70
  ).length;
  const lowQuality = lowQualityAll
    .sort((a, b) => listingQualityScore(a) - listingQualityScore(b) || String(a.reference).localeCompare(String(b.reference)))
    .map((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      score: listingQualityScore(row),
      photo: row.photo,
      listing_agent: row.listing_agent,
      gaps: qualityGaps(row),
    }));
  const leads30 = leadsSince(30);
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const refIndex = new Map(rows.map((row) => [row.reference, row]));
  const idIndex = new Map(rows.map((row) => [row.id, row]));
  const deskRow = (lead) => (lead.listing_id && idIndex.get(lead.listing_id)) || refIndex.get(lead.reference) || null;
  const topListings = topListingsByLeads(rows, leads, now, 30);
  const topAgents = topAgentsByLeads(rows, leads, now, 30);
  const byType = {};
  const byPurpose = { sale: 0, rent: 0 };
  for (const row of rows) {
    byType[row.type] = (byType[row.type] || 0) + 1;
    byPurpose[row.purpose] = (byPurpose[row.purpose] || 0) + 1;
  }
  const activity = leadWindowFromQuery(req.query, leads, now);
  const byChannel = activity.by_channel;
  const daily = activity.daily;
  const latest = activity.latest.map((lead) => {
    const row = deskRow(lead);
    return { ...lead, listing_id: row?.id || lead.listing_id || "", on_desk: Boolean(row) };
  });
  return {
    generated_at: new Date().toISOString(),
    portals_live: portalScanForClient(withAgentDetails(portalsLive, rows)),
    pf: {
      configured: pfConfigured(),
      running: syncRunning(),
      last_sync: await db.getSetting("pf_last_sync", null),
      credits: await db.getSetting("pf_credits", null),
    },
    listings: {
      total: rows.length,
      counts,
      pf_synced: rows.filter((row) => row.pf_id).length,
      pf_live: portalLive.pf,
      bayut_live: portalLive.bayut,
      dubizzle_live: portalLive.dubizzle,
      pf_takendown: takendown.length,
      takendown_reasons: Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
      avg_quality: avgScore,
      low_quality_count: below70Live,
      low_quality: lowQuality,
      quality,
      by_type: Object.entries(byType).sort((a, b) => b[1] - a[1]),
      live_by_type: portalTypesFromAds(liveTypesByPortal(rows, websiteLive), portalsLive),
      by_purpose: byPurpose,
    },
    leads: {
      total: leads.length,
      today: leads.filter((lead) => lead.created_at && lead.created_at.slice(0, 10) === todayKey).length,
      week: leadsSince(7).length,
      month: leads30.length,
      by_channel: byChannel,
      by_status: leads30.reduce((acc, lead) => ({ ...acc, [lead.status || "unknown"]: (acc[lead.status || "unknown"] || 0) + 1 }), {}),
      latest,
      top_listings: topListings,
      top_agents: topAgents,
      daily,
      hourly: activity.hourly,
      activity_label: activity.label,
      by_portal: portalLeadCounts(leads, now),
    },
    report: buildOverviewReport(rows, leads, req.query.days, websiteLive),
    agents: (await db.pfUsers()).length,
    infographics: liveCategoryBoard(rows, websiteLive),
    adFacts: listingAdFacts(rows, websiteLive),
  };
}

app.get("/api/overview", requireAuth, async (req, res) => {
  const key = overviewCacheKey(req.query);
  const cached = overviewSnapshots.get(key);
  const age = cached ? Date.now() - cached.at : Infinity;
  const start = () => {
    if (overviewJobs.has(key)) return overviewJobs.get(key);
    const job = buildOverview(req)
      .then((body) => {
        overviewSnapshots.set(key, { at: Date.now(), body });
        return body;
      })
      .finally(() => overviewJobs.delete(key));
    overviewJobs.set(key, job);
    return job;
  };
  if (cached && age < OVERVIEW_FRESH_MS) {
    res.json(cached.body);
    return;
  }
  if (cached) {
    start().catch((error) => console.error("Overview refresh failed:", error?.message || error));
    res.json(cached.body);
    return;
  }
  try {
    res.json(await start());
  } catch (error) {
    console.error("Overview failed:", error?.message || error);
    res.status(500).json({ error: "Overview could not be loaded." });
  }
});

// ---------------------------------------------------------------- Tenancy Contract tool (clone of the Bitrix /tenancy/ page)

function bitrixError(res, error) {
  if (error instanceof BitrixTokenError) {
    res.status(401).json({ ok: false, error: "Bitrix session expired. Refreshing...", code: "bitrix_token" });
    return;
  }
  res.status(500).json({ ok: false, error: error.message || "Bitrix request failed" });
}

function tenancyEvent(by, event, detail) {
  return { at: new Date().toISOString(), by: String(by || "Desk"), event, detail: String(detail || "") };
}

async function sendTenancyInvite(row, party, actor, extra = {}) {
  const invite = prepareTenancyInvite(row, party, ORIGIN, extra);
  if (!invite.ok) return invite;
  if (!smtpConfigured()) return { ok: false, error: "Tenancy SMTP is not configured." };
  const sent = await sendMail({
    to: invite.to,
    subject: invite.subject,
    body: invite.body,
    pdf: invite.pdf,
    pdfName: invite.pdfName,
  });
  if (!sent.ok) return sent;
  const updated = await db.updateTenancy(row.id, {
    stage: invite.stage,
    data: { ...row.data, signers: invite.signers },
    history: [...row.history, tenancyEvent(actor, "email", `${invite.party} ${invite.to}`)],
  });
  return { ok: true, mailed: invite.to, stage: updated.stage, signUrl: Boolean(invite.signUrl), row: updated };
}

// Build the filled PDF and store the tracker row (same as tenancy_prepare()).
async function tenancyPrepare(req, payload) {
  const data = normalizeForm(payload);
  const missing = missingDetails(data);
  if (missing) return { ok: false, error: missing };
  const pdf = buildTenancyPdf(data);
  const pdfName = pdfFilename(data);
  const existingId = String(payload.id || "").trim();
  const existing = existingId ? await db.tenancy(existingId) : null;
  const fields = {
    title: `Tenancy Contract — ${(data.propertyNo || data.building || "Unit").trim()}`,
    template: data.template,
    send_to: "whatsapp",
    owner_name: data.landlordName,
    tenant_name: data.tenantName,
    owner_email: data.landlordEmail,
    tenant_email: data.tenantEmail,
    owner_phone: data.landlordPhone,
    tenant_phone: data.tenantPhone,
    pdf_name: pdfName,
    listing_id: data.listingId,
    data: preserveTenancyChequeReceipts(existing, {
      ...data,
      signers: preserveTenancySigners(existing, {
        owner_name: data.landlordName,
        tenant_name: data.tenantName,
        owner_email: data.landlordEmail,
        tenant_email: data.tenantEmail,
        owner_phone: data.landlordPhone,
        tenant_phone: data.tenantPhone,
      }),
    }),
  };
  let row;
  if (existing) {
    row = await db.updateTenancy(existing.id, {
      ...fields,
      pdf_path: storePdf(root, existing.id, pdf),
      history: [...existing.history, tenancyEvent(by(req), "prepared", pdfName)],
    });
  } else {
    row = await db.addTenancy({
      ...fields,
      stage: "draft",
      created_by: by(req),
      history: [tenancyEvent(by(req), "created", pdfName)],
    });
    row = await db.updateTenancy(row.id, { pdf_path: storePdf(root, row.id, pdf) });
  }
  const photoIds = Array.isArray(payload.photoIds) ? payload.photoIds : [];
  for (const photoId of photoIds) {
    if (photoId) await db.updateTenancyPhoto(String(photoId), { tenancy_id: row.id });
  }
  return {
    ok: true,
    id: row.id,
    trackId: row.id,
    pdfName,
    download: `/api/tenancy/download?id=${encodeURIComponent(row.id)}`,
    stage: row.stage,
    row,
  };
}

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const user = await verifyBitrix(req.body.AUTH_ID || req.body.authId, req.body.DOMAIN || req.body.domain);
    writeSession(res, user);
    await db.touchUser(user);
    res.json({ ok: true, user });
  } catch (error) {
    res.status(403).json({ ok: false, error: error.message || "Auth failed" });
  }
});

app.get("/api/tenancy/search", requireAuth, async (req, res) => {
  try {
    res.json({ ok: true, items: await searchCrm(req.user, String(req.query.entity || "contact"), req.query.q) });
  } catch (error) {
    bitrixError(res, error);
  }
});

app.get("/api/crm/search", requireAuth, async (req, res) => {
  try {
    const entities = String(req.query.entities || req.query.entity || "contact");
    res.json({ ok: true, items: await searchCrmMany(req.user, entities, req.query.q) });
  } catch (error) {
    bitrixError(res, error);
  }
});

app.get("/api/crm-intelligence/agents", requireAuth, async (_req, res) => {
  try {
    res.json(await listCrmIntelligenceAgents({ db }));
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Agents failed" });
  }
});

app.post("/api/crm-intelligence/agents", requireAuth, async (req, res) => {
  try {
    res.json(await addCrmIntelligenceAgent({ db, name: req.body?.name }));
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Could not add agent" });
  }
});

app.get("/api/crm-intelligence/filters", requireAuth, async (_req, res) => {
  try {
    res.json(await listCrmIntelligenceFilters({ db }));
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Filters failed" });
  }
});

app.post("/api/crm-intelligence/open-whatsapp", requireAuth, async (req, res) => {
  try {
    const conversationId = Number(req.body?.conversationId);
    const ok = await armWhatsappChat(req.user?.id, conversationId, req.body?.password);
    res.json({ ok, path: "/marketplace/app/76/" });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Could not open WhatsApp" });
  }
});

app.post("/api/crm-intelligence/option-sent-numbers", requireAuth, async (req, res) => {
  try {
    const opened = readOptionSentNumbers(req.body?.listKey, req.body?.password);
    if (!opened.ok) {
      res.status(opened.expired ? 410 : 403).json({ ok: false, expired: Boolean(opened.expired) });
      return;
    }
    res.json({ ok: true, chats: opened.chats, otherChats: opened.otherChats, missingChats: opened.missingChats || [] });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Could not load numbers" });
  }
});

app.post("/api/crm-intelligence/check", requireAuth, async (req, res) => {
  try {
    const report = await checkCrmIntelligence({
      db,
      period: req.body?.period,
      agentId: req.body?.agentId,
      agentName: req.body?.agentName,
      departmentId: req.body?.departmentId,
      sourceId: req.body?.sourceId,
      statusId: req.body?.statusId || req.body?.typeId,
      force: req.body?.force !== false,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(report);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Check failed" });
  }
});

app.post("/api/crm-intelligence/daily-report", requireAuth, async (req, res) => {
  try {
    const report = await checkAgentDailyReport({
      db,
      agentId: req.body?.agentId,
      agentName: req.body?.agentName,
      mode: req.body?.mode,
      day: req.body?.day,
      month: req.body?.month,
      period: req.body?.period,
      from: req.body?.from,
      to: req.body?.to,
      force: Boolean(req.body?.force),
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(applyAgentReportPrivacy(report, req.user));
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Daily report failed" });
  }
});

app.post("/api/crm-intelligence/agent-month", requireAuth, async (req, res) => {
  try {
    const report = await checkAgentMonthBoard({
      db,
      month: req.body?.month,
      mode: req.body?.mode,
      force: Boolean(req.body?.force),
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(report);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Monthly report failed" });
  }
});

app.post("/api/crm-intelligence/agent-month/pdf", requireAuth, async (req, res) => {
  try {
    let report = req.body?.report && typeof req.body.report === "object" ? req.body.report : null;
    if (!Array.isArray(report?.agents)) {
      report = await checkAgentMonthBoard({
        db,
        month: req.body?.month,
        mode: req.body?.mode,
        force: Boolean(req.body?.force),
      });
    }
    const pdf = agentMonthBoardPdf(report);
    const name = agentMonthBoardPdfName(report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "PDF failed" });
  }
});

app.get("/api/crm-intelligence/team-leads", requireAuth, async (req, res) => {
  try {
    const leaders = await listTeamLeadPeople(db);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, leaders });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Could not load team leads" });
  }
});

app.post("/api/crm-intelligence/team-leads", requireAuth, async (req, res) => {
  try {
    const action = String(req.body?.action || "add");
    const result = action === "remove"
      ? await removeTeamLeadPerson(db, req.body?.id)
      : await addTeamLeadPerson(db, { id: req.body?.id, name: req.body?.name });
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Could not update the list" });
  }
});

app.post("/api/crm-intelligence/team-lead-report", requireAuth, async (req, res) => {
  try {
    const report = await checkTeamLeadReport({
      db,
      leaderId: req.body?.leaderId,
      mode: req.body?.mode,
      day: req.body?.day,
      month: req.body?.month,
      from: req.body?.from,
      to: req.body?.to,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(report);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Team lead report failed" });
  }
});

app.post("/api/crm-intelligence/office-shares", requireAuth, async (req, res) => {
  try {
    const report = await checkOfficeShareHistory({
      db,
      mode: req.body?.mode,
      day: req.body?.day,
      month: req.body?.month,
      force: Boolean(req.body?.force),
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(report);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Office share history failed" });
  }
});

app.post("/api/crm-intelligence/daily-report/pdf", requireAuth, async (req, res) => {
  try {
    // Prefer already-checked report from the client so PDF does not re-hit Bitrix.
    let report = req.body?.report && typeof req.body.report === "object" ? req.body.report : null;
    if (!report?.agentId) {
      report = await checkAgentDailyReport({
        db,
        agentId: req.body?.agentId,
        agentName: req.body?.agentName,
        mode: req.body?.mode,
        day: req.body?.day,
        month: req.body?.month,
        period: req.body?.period,
        from: req.body?.from,
        to: req.body?.to,
        force: Boolean(req.body?.force),
      });
    }
    const safe = applyAgentReportPrivacy(report, req.user);
    const pdf = agentDailyReportPdf(safe);
    const name = agentDailyReportPdfName(safe);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "PDF failed" });
  }
});

app.get("/api/crm-intelligence/daily-report/notes", requireAuth, async (req, res) => {
  try {
    const agentId = req.query.agentId;
    const day = String(req.query.day || "").trim();
    const month = String(req.query.month || "").trim();
    if (day) {
      const note = await getTlNote(db, agentId, day);
      res.json({ ok: true, notes: note?.text ? [note] : [] });
      return;
    }
    const notes = await listTlNotes(db, { agentId, month });
    res.json({ ok: true, notes });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Notes failed" });
  }
});

app.put("/api/crm-intelligence/daily-report/notes", requireAuth, async (req, res) => {
  try {
    const saved = await saveTlNote(db, {
      agentId: req.body?.agentId,
      day: req.body?.day,
      text: req.body?.text,
      authorId: req.user?.id,
      authorName: req.user?.name,
    });
    res.json({ ok: true, note: saved });
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Save note failed" });
  }
});

app.get("/api/crm-intelligence/owner-data", requireAuth, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await checkCrmOwnerData({
      db,
      agentId: req.query.agentId,
      agentName: req.query.agentName,
      force: req.query.force === "1" || req.query.force === "true",
    }));
  } catch (error) {
    res.status(error.status || 502).json({ ok: false, error: error.message || "Owner data failed" });
  }
});

app.post("/api/crm/contact", requireAuth, async (req, res) => {
  try {
    res.json({ ok: true, item: await createCrmContact(req.user, req.body || {}) });
  } catch (error) {
    bitrixError(res, error);
  }
});

app.post("/api/tenancy/lookup", requireAuth, async (req, res) => {
  try {
    const entity = String(req.body?.entity || "");
    const key = /1112|unit/.test(entity) ? "unit" : entity;
    const info = await lookupCrm(req.user, key, req.body?.id);
    if (!info) {
      res.json({ ok: true, found: false, message: "This record is not in Bitrix CRM." });
      return;
    }
    res.json({ ok: true, found: true, message: "Found in Bitrix CRM.", data: info });
  } catch (error) {
    bitrixError(res, error);
  }
});

app.post("/api/tenancy/extract", requireAuth, async (req, res) => {
  const image = readImagePayload(req.body || {});
  if (image.error) {
    res.status(400).json({ ok: false, error: image.error });
    return;
  }
  const photoId = `tp-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  let photo = null;
  try {
    const stored = storeTenancyPhotoFile(root, photoId, image.mime, image.data);
    photo = await db.addTenancyPhoto({
      id: photoId,
      tenancy_id: String(req.body?.tenancyId || ""),
      file_name: stored.file_name,
      file_path: stored.file_path,
      mime: stored.mime,
      original_name: String(req.body?.name || "tenancy-photo").slice(0, 180),
      agent_id: actor(req).agentId,
      agent_name: by(req),
      fields: {},
      created_at: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Could not save this photo." });
    return;
  }
  try {
    const out = await extractTenancyFromImage(image, { section: String(req.body?.section || "") });
    if (out.ok && out.data) {
      photo = (await db.updateTenancyPhoto(photoId, { fields: out.data })) || photo;
    }
    let frontKeyAlerted = false;
    if (out.frontKeyLow) {
      const alert = await alertFrontOpenAiLow({
        user: req.user,
        db,
        reason: out.frontKeyReason || "front key quota / billing",
        fromName: by(req),
      });
      frontKeyAlerted = Boolean(alert.ok && !alert.skipped);
    }
    res.status(out.ok ? 200 : 400).json({ ...out, frontKeyAlerted, photo: photoView(photo) });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not read the photo.",
      photo: photoView(photo),
    });
  }
});

app.get("/api/tenancy/photos", requireAuth, async (_req, res) => {
  const rows = await db.tenancyPhotos();
  res.json({ ok: true, items: rows.map(photoView) });
});

app.get("/api/tenancy/photo/:id", requireAuth, async (req, res) => {
  const row = await db.tenancyPhoto(req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Photo not found." });
    return;
  }
  const file = readFileSafe(row.file_path);
  if (!file) {
    res.status(404).json({ ok: false, error: "Photo file is missing." });
    return;
  }
  res.setHeader("Content-Type", row.mime || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(file);
});

app.delete("/api/tenancy/photo/:id", requireAuth, async (req, res) => {
  const row = await db.removeTenancyPhoto(req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Photo not found." });
    return;
  }
  removeTenancyPhotoFile(row.file_path);
  res.json({ ok: true, id: row.id });
});

app.post("/api/tenancy/prepare", requireAuth, async (req, res) => {
  const out = await tenancyPrepare(req, req.body || {});
  delete out.row;
  res.status(out.ok ? 200 : 400).json(out);
});

app.post("/api/tenancy/whatsapp", requireAuth, async (req, res) => {
  const party = req.body?.party === "owner" ? "owner" : "tenant";
  const prepared = await tenancyPrepare(req, req.body || {});
  if (!prepared.ok) {
    res.status(400).json(prepared);
    return;
  }
  const row = prepared.row;
  const data = { ...row.data, landlordName: row.owner_name, tenantName: row.tenant_name, landlordPhone: row.owner_phone, tenantPhone: row.tenant_phone };
  const digits = phoneDigits(party === "owner" ? data.landlordPhone : data.tenantPhone);
  if (!digits) {
    res.status(400).json({ ok: false, error: `Add a ${party} phone number first.` });
    return;
  }
  const gate = canInviteTenancyParty(tenancySigners(row), party);
  if (!gate.ok) {
    res.status(400).json({ ok: false, error: gate.error });
    return;
  }
  const signers = issueTenancySignTokens(row, party);
  const signer = signers.find((item) => item.role === party);
  const signUrl = signer?.token ? `${ORIGIN.replace(/\/$/, "")}/tc-sign/${signer.token}` : "";
  const text = whatsappText(party, data, signUrl);
  const contactId = party === "owner" ? Number(data.landlordId || 0) : data.tenantEntity === "contact" ? Number(data.tenantId || 0) : 0;
  const bitrix = contactId ? await logWhatsappActivity(req.user, contactId, text, digits) : false;
  const stage = tenancyStageFromSigners(signers, "sent");
  await db.updateTenancy(row.id, {
    stage,
    data: { ...row.data, signers },
    history: [...row.history, tenancyEvent(by(req), "whatsapp", `${party} +${digits}`)],
  });
  res.json({
    ok: true,
    waMe: `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
    bitrix,
    party,
    digits,
    id: row.id,
    download: prepared.download,
    pdfName: prepared.pdfName,
    stage: "sent",
  });
});

app.post("/api/tenancy/email", requireAuth, async (req, res) => {
  const row = await db.tenancy(String(req.body?.id || ""));
  if (!row) {
    res.status(404).json({ ok: false, error: "Contract not found." });
    return;
  }
  const requested = req.body?.party === "both" ? firstTenancyEmailParty({
    tenant_email: req.body?.tenantEmail || row.tenant_email,
    owner_email: req.body?.landlordEmail || row.owner_email,
  }) : req.body?.party === "owner" ? "owner" : "tenant";
  if (!requested) {
    res.status(400).json({ ok: false, error: "Add tenant and/or owner email below, then try again." });
    return;
  }
  const patch = {};
  if (String(req.body?.tenantEmail || "").trim()) patch.tenant_email = String(req.body.tenantEmail).trim();
  if (String(req.body?.landlordEmail || "").trim()) patch.owner_email = String(req.body.landlordEmail).trim();
  const current = Object.keys(patch).length ? await db.updateTenancy(row.id, patch) : row;
  const sent = await sendTenancyInvite(current, requested, by(req));
  if (!sent.ok) {
    res.status(400).json(sent);
    return;
  }
  const waiting = nextUnsignedTenancyParty(tenancySigners(sent.row));
  res.json({
    ok: true,
    mailed: sent.mailed,
    stage: sent.stage,
    signUrl: sent.signUrl,
    next: waiting && waiting.role !== requested ? waiting.role : "",
  });
});

function tenancyPropertyLabel(row) {
  const form = row?.data && typeof row.data === "object" ? row.data : {};
  return [form.propertyNo, form.building, form.location].map((part) => String(part || "").trim()).filter(Boolean).join(" · ");
}

function chequeProofAttachment(row, receipt) {
  const file = chequeProofPath(root, row.id, receipt);
  if (!file) return null;
  const mime = receipt.proofMime || chequeProofMime(file);
  return { name: chequeProofFileName(mime, path.extname(file).slice(1)), mime, buffer: fs.readFileSync(file) };
}

async function mailChequeTenantAck(row, receipt, signature) {
  const attachments = [];
  const proof = chequeProofAttachment(row, receipt);
  if (proof) attachments.push(proof);
  if (signature?.buffer) attachments.push({ name: "owner-signature.png", mime: signature.mime, buffer: signature.buffer });
  return sendMail({
    to: receipt.tenantEmail,
    subject: tenantAckSubject(tenancyPropertyLabel(row)),
    body: tenantAckEmail({
      tenantName: row.tenant_name,
      property: tenancyPropertyLabel(row),
      particular: receipt.particular,
      amount: receipt.amount,
      date: receipt.date,
      note: receipt.note,
    }),
    attachments,
  });
}

app.post("/api/tenancy/cheque-received", requireAuth, async (req, res) => {
  const row = await db.tenancy(String(req.body?.id || ""));
  if (!row) {
    res.status(404).json({ ok: false, error: "Contract not found." });
    return;
  }
  if (tenancyStageFromSigners(tenancySigners(row), row.stage) !== "signed") {
    res.status(400).json({ ok: false, error: "Cheque received is only for signed contracts." });
    return;
  }
  const ownerEmail = String(req.body?.ownerEmail || row.owner_email || "").trim();
  const tenantEmail = String(req.body?.tenantEmail || req.body?.to || row.tenant_email || "").trim();
  if (!isEmail(ownerEmail)) {
    res.status(400).json({ ok: false, error: "Type the owner email for verification." });
    return;
  }
  if (!isEmail(tenantEmail)) {
    res.status(400).json({ ok: false, error: "Type the tenant email for the acknowledgment after the owner verifies." });
    return;
  }
  const proof = decodeChequeProof(req.body?.image, req.body?.mime);
  if (!proof) {
    res.status(400).json({ ok: false, error: "Upload the received cheque photo or PDF first." });
    return;
  }
  if (!smtpConfigured()) {
    res.status(400).json({ ok: false, error: "Tenancy SMTP is not configured." });
    return;
  }
  const form = row.data && typeof row.data === "object" ? row.data : {};
  const cheque = pickChequeRow(form, req.body?.chequeIndex);
  const property = tenancyPropertyLabel(row);
  const receiptId = `cr-${Date.now().toString(36)}`;
  const token = newChequeReceiptToken();
  const proofPath = storeChequeProof(root, row.id, receiptId, proof.buffer, proof.ext);
  const verifyUrl = `${ORIGIN.replace(/\/$/, "")}/tc-cheque/${token}`;
  const sent = await sendMail({
    to: ownerEmail,
    subject: ownerVerifySubject(property),
    body: ownerVerifyEmail({
      ownerName: row.owner_name,
      property,
      particular: cheque.particular,
      amount: cheque.amount,
      date: cheque.date,
      verifyUrl,
    }),
    attachments: [{ name: chequeProofFileName(proof.mime, proof.ext), mime: proof.mime, buffer: proof.buffer }],
  });
  if (!sent.ok) {
    res.status(400).json(sent);
    return;
  }
  const receipt = {
    id: receiptId,
    token,
    status: "pending",
    ownerEmail,
    tenantEmail,
    sentAt: new Date().toISOString(),
    expires_at: chequeReceiptExpiry(),
    particular: cheque.particular || "Cheque",
    amount: cheque.amount || "",
    date: cheque.date || "",
    by: by(req),
    crop: proof.mime === "application/pdf" ? "pdf" : String(req.body?.crop || "received"),
    proofPath,
    proofMime: proof.mime,
  };
  const updated = await db.updateTenancy(row.id, {
    data: { ...form, chequeReceipts: [...rawChequeReceipts(row), receipt] },
    history: [...row.history, tenancyEvent(by(req), "cheque-received", `${receipt.particular} asked owner to verify`)],
  });
  res.json({ ok: true, mailed: ownerEmail, next: "owner", item: tenancyView(updated) });
});

app.post("/api/tenancy/save", requireAuth, async (req, res) => {
  let stage = normalizeStage(req.body?.stage || "draft");
  if (stage !== "review") stage = "draft";
  const prepared = await tenancyPrepare(req, req.body || {});
  if (!prepared.ok) {
    res.status(400).json(prepared);
    return;
  }
  const row = await db.updateTenancy(prepared.id, {
    stage,
    history: [...prepared.row.history, tenancyEvent(by(req), "saved", stageLabel(stage))],
  });
  res.json({
    ok: true,
    id: row.id,
    download: prepared.download,
    pdfName: prepared.pdfName,
    stage,
    stageLabel: stageLabel(stage),
    signUrl: "",
    signError: "",
  });
});

app.get("/api/tenancy/list", requireAuth, async (_req, res) => {
  const rows = await db.tenancies();
  res.json({ ok: true, columns: TENANCY_STAGES, items: rows.map(tenancyView) });
});

app.get("/api/tenancy/download", requireAuth, async (req, res) => {
  const row = await db.tenancy(String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("Contract PDF not found.");
    return;
  }
  const eSigned = tenancySigners(row).some((signer) => signer.signed_at && signer.signature);
  const wantSigned = eSigned || String(req.query.signed || "") === "1" || row.stage === "signed" || row.stage === "partial";
  const bytes = tenancyContractPdf(row)
    || readFileSafe(wantSigned && row.signed_path ? row.signed_path : row.pdf_path)
    || readFileSafe(row.signed_path)
    || readFileSafe(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = eSigned || (wantSigned && row.signed_name) ? row.signed_name || "tenancy-signed.pdf" : row.pdf_name || "tenancy-contract.pdf";
  const ext = name.toLowerCase().split(".").pop();
  res.setHeader("Content-Type", ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.post("/api/tenancy/stage", requireAuth, async (req, res) => {
  const id = String(req.body?.id || "");
  const stage = normalizeStage(req.body?.stage || "");
  if (!id || !isKnownStage(stage)) {
    res.status(400).json({ ok: false, error: "Pick a contract and a stage." });
    return;
  }
  const current = await db.tenancy(id);
  if (!current) {
    res.status(404).json({ ok: false, error: "Contract not found." });
    return;
  }
  const patch = { stage };
  const upload = req.body?.signedPdf;
  if (upload && upload.data) {
    const ext = String(upload.name || "signed.pdf").toLowerCase().split(".").pop();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
      res.status(400).json({ ok: false, error: "Upload a PDF or image of the signed contract." });
      return;
    }
    const buffer = Buffer.from(String(upload.data).replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
      res.status(400).json({ ok: false, error: "The signed file is empty or larger than 15 MB." });
      return;
    }
    patch.signed_path = storeSigned(root, current.id, buffer, ext);
    patch.signed_name = String(upload.name || `signed.${ext}`);
  }
  if (stage === "signed" && !bothTenancyPartiesSigned(tenancySigners(current)) && !upload) {
    res.status(400).json({
      ok: false,
      error: "Both tenant and owner must sign before this moves to Signed. If only one person has signed, keep it in Partially signed — or upload the fully signed PDF.",
    });
    return;
  }
  if (stage === "signed" && !patch.signed_path && !current.signed_path) {
    res.status(400).json({ ok: false, error: "Upload the signed PDF, or move a Sign document." });
    return;
  }
  const row = await db.updateTenancy(current.id, {
    ...patch,
    history: [...current.history, tenancyEvent(by(req), "stage", stageLabel(stage))],
  });
  res.json({ ok: true, item: tenancyView(row) });
});

app.get("/api/tenancy/:id", requireAuth, async (req, res) => {
  const row = await db.tenancy(req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Contract not found." });
    return;
  }
  res.json({ ok: true, item: tenancyView(row, { includeSignatures: String(req.query.preview || "") === "1" }) });
});

app.delete("/api/tenancy/:id", requireAuth, requireAdmin, async (req, res) => {
  res.json({ ok: true, removed: await db.removeTenancy(req.params.id) });
});

async function tenancySignerFor(token) {
  const found = findTenancySigner(await db.tenancies(), token);
  if (!found) return { error: "This signing link does not exist." };
  if (!found.signer.signed_at && found.signer.expires_at && new Date(found.signer.expires_at).getTime() < Date.now()) {
    return { error: "This signing link has expired." };
  }
  return found;
}

async function chequeReceiptFor(token) {
  const found = findChequeReceipt(await db.tenancies(), token);
  if (!found) return { error: "This confirmation link does not exist." };
  if (chequeReceiptExpired(found.receipt)) return { error: "This confirmation link has expired." };
  return found;
}

app.get("/tc-cheque/:token", async (req, res) => {
  const found = await chequeReceiptFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  if (found.receipt.verifiedAt) {
    res.type("html").send(chequeVerifyDoneHtml(found.row, found.receipt));
    return;
  }
  res.type("html").send(chequeVerifyPageHtml(found.row, found.receipt, req.params.token));
});

app.get("/tc-cheque/:token/photo", async (req, res) => {
  const found = await chequeReceiptFor(req.params.token);
  if (found.error) {
    res.status(404).end();
    return;
  }
  const file = chequeProofPath(root, found.row.id, found.receipt);
  if (!file) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", found.receipt.proofMime || chequeProofMime(file));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(file);
});

app.get("/tc-cheque/:token/done", async (req, res) => {
  const found = await chequeReceiptFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  if (!found.receipt.verifiedAt) {
    res.redirect(`/tc-cheque/${req.params.token}`);
    return;
  }
  res.type("html").send(chequeVerifyDoneHtml(found.row, found.receipt));
});

app.post("/tc-cheque/:token", async (req, res) => {
  const found = await chequeReceiptFor(req.params.token);
  if (found.error) {
    res.status(404).json({ error: found.error });
    return;
  }
  const { row, receipt, receipts } = found;
  if (receipt.verifiedAt) {
    res.status(409).json({ error: "This cheque was already confirmed." });
    return;
  }
  const name = String(req.body?.name || "").trim();
  const note = String(req.body?.note || "").trim();
  if (note.length < 8 || note.length > 2000) {
    res.status(400).json({ error: "Please write that you received this cheque." });
    return;
  }
  if (name.length < 3) {
    res.status(400).json({ error: "Please enter your full name." });
    return;
  }
  const signature = decodeSignatureImage(req.body?.signature);
  if (!signature) {
    res.status(400).json({ error: "Please draw your signature." });
    return;
  }
  if (!isEmail(receipt.tenantEmail)) {
    res.status(400).json({ error: "A7 Group is missing the tenant email. Please contact your agent." });
    return;
  }
  if (!smtpConfigured()) {
    res.status(400).json({ error: "Tenancy SMTP is not configured." });
    return;
  }
  const when = new Date().toISOString();
  const nextReceipt = {
    ...receipt,
    status: "verified",
    note,
    signedName: name,
    signature: String(req.body?.signature || ""),
    verifiedAt: when,
    ip: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(),
  };
  const tenantMail = await mailChequeTenantAck(row, nextReceipt, signature);
  if (tenantMail.ok) nextReceipt.tenantSentAt = when;
  else nextReceipt.tenantError = tenantMail.error || "Could not email the tenant.";
  const nextReceipts = receipts.map((item) => (item.token === receipt.token ? nextReceipt : item));
  await db.updateTenancy(row.id, {
    data: { ...row.data, chequeReceipts: nextReceipts },
    history: [
      ...row.history,
      tenancyEvent(name, "cheque-verified", `${receipt.particular || "Cheque"} confirmed by owner`),
    ],
  });
  res.json({ ok: true, tenantMailed: Boolean(tenantMail.ok) });
});

app.get("/tc-sign/:token", async (req, res) => {
  const found = await tenancySignerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  const { row, signer, signers } = found;
  if (signer.signed_at) {
    res.type("html").send(tenancySignDoneHtml(row, signer, req.params.token, tenancyStageFromSigners(signers) === "signed"));
    return;
  }
  if (!signer.viewed_at) {
    const next = signers.map((item) =>
      item.token === signer.token ? { ...item, viewed_at: new Date().toISOString() } : item
    );
    await db.updateTenancy(row.id, {
      data: { ...row.data, signers: next },
      history: [...row.history, tenancyEvent(signer.name, "viewed", `${signer.label} opened the sign link`)],
    });
    row.data = { ...row.data, signers: next };
  }
  res.type("html").send(tenancySignPageHtml(row, signer, req.params.token, tenancySignSummary(row)));
});

app.get("/tc-sign/:token/pdf", async (req, res) => {
  const found = await tenancySignerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  const bytes = tenancyContractPdf(found.row) || readFileSafe(found.row.signed_path) || readFileSafe(found.row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("Contract PDF not found.");
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${(found.row.pdf_name || "tenancy-contract.pdf").replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/tc-sign/:token/blank/:page", async (req, res) => {
  const found = await tenancySignerFor(req.params.token);
  if (found.error) {
    res.status(404).end();
    return;
  }
  const file = ejariBlankPath(req.params.page);
  if (!fs.existsSync(file)) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(file);
});

app.get("/tc-sign/:token/done", async (req, res) => {
  const found = await tenancySignerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  if (!found.signer.signed_at) {
    res.redirect(`/tc-sign/${req.params.token}`);
    return;
  }
  res.type("html").send(tenancySignDoneHtml(found.row, found.signer, req.params.token, tenancyStageFromSigners(found.signers) === "signed"));
});

app.post("/tc-sign/:token", async (req, res) => {
  const found = await tenancySignerFor(req.params.token);
  if (found.error) {
    res.status(404).json({ error: found.error });
    return;
  }
  const { row, signer, signers } = found;
  if (signer.signed_at) {
    res.status(409).json({ error: "This contract was already sent back." });
    return;
  }
  const name = String(req.body?.name || "").trim();
  const signature = String(req.body?.signature || "");
  if (name.length < 3) {
    res.status(400).json({ error: "Please enter your full name." });
    return;
  }
  if (!/^data:image\/jpeg;base64,/.test(signature) || signature.length < 200 || signature.length > 400000) {
    res.status(400).json({ error: "The signature image is missing or too large." });
    return;
  }
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const when = new Date().toISOString();
  const nextSigners = signers.map((item) =>
    item.token === signer.token
      ? { ...item, signed_at: when, signed_name: name, signature, ip, user_agent: String(req.headers["user-agent"] || "") }
      : item
  );
  const stage = tenancyStageFromSigners(nextSigners, row.stage);
  const patched = {
    ...row,
    stage,
    data: { ...row.data, signers: nextSigners },
  };
  const signedBytes = signedTenancyPdf(patched);
  const updated = await db.updateTenancy(row.id, {
    stage,
    signed_path: storeSigned(root, row.id, signedBytes, "pdf"),
    signed_name: stage === "signed" ? "tenancy-signed.pdf" : "tenancy-returned.pdf",
    data: patched.data,
    history: [...row.history, tenancyEvent(name, "signed", `${signer.label} signed and sent back from ${ip}`)],
  });
  let nextMailed = "";
  let nextError = "";
  const nextParty = nextUnsignedTenancyParty(tenancySigners(updated));
  if (updated.stage === "partial" && nextParty) {
    const follow = await sendTenancyInvite(updated, nextParty.role, name, {
      alreadySignedBy: signer.label.toLowerCase(),
    });
    if (follow.ok) nextMailed = follow.mailed || "";
    else nextError = follow.error || "";
  }
  res.json({ ok: true, stage: updated.stage, nextMailed, nextError });
});

function nocSignerFor(token) {
  const found = findNocSign(root, token);
  if (!found) return { error: "This signing link does not exist." };
  if (nocSignExpired(found.sign)) {
    return { error: "This signing link has expired." };
  }
  return found;
}

app.get("/noc-sign/:token", async (req, res) => {
  const found = nocSignerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  if (found.sign.signed_at) {
    res.type("html").send(nocSignDoneHtml(found.row, found.sign, req.params.token, found.kind.label));
    return;
  }
  const viewed = markNocSignViewed(root, found);
  res.type("html").send(nocSignPageHtml(viewed.row, viewed.sign, req.params.token, viewed.kind.label));
});

app.get("/noc-sign/:token/pdf", async (req, res) => {
  const found = nocSignerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  const bytes = found.kind.readPdf(root, found.row);
  if (!bytes) {
    res.status(404).type("text").send("NOC PDF not found.");
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${(found.row.pdf_name || "noc.pdf").replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/noc-sign/:token/done", async (req, res) => {
  const found = nocSignerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  if (!found.sign.signed_at) {
    res.redirect(`/noc-sign/${req.params.token}`);
    return;
  }
  res.type("html").send(nocSignDoneHtml(found.row, found.sign, req.params.token, found.kind.label));
});

app.post("/noc-sign/:token", async (req, res) => {
  const found = nocSignerFor(req.params.token);
  if (found.error) {
    res.status(404).json({ error: found.error });
    return;
  }
  try {
    applyNocSignature(root, found, { name: req.body?.name, image: req.body?.signature });
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send back.";
    const code = /already sent back/.test(message) ? 409 : 400;
    res.status(code).json({ error: message });
  }
});

// ---------------------------------------------------------------- Title Deed

app.get("/api/booking/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listBookings(root).map(bookingView) });
});

app.get("/api/booking/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: formFromListing(listing) });
});

app.post("/api/booking/save", requireAuth, async (req, res) => {
  const data = normalizeBookingForm(req.body || {});
  const missing = bookingMissing(data);
  if (missing) {
    res.status(400).json({ ok: false, error: missing });
    return;
  }
  if (!data.amountWords && data.amount) data.amountWords = amountInWords(data.amount);
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readBooking(root, existingId) : null;
  const row = writeBooking(root, {
    id: existing?.id,
    title: `Title Deed — ${(data.propertyNo || data.buildingName || data.community || "Property").trim()}`,
    listing_id: data.listingId,
    owner_name: data.ownerName,
    pdf_name: bookingPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    data,
  });
  res.json({ ok: true, item: bookingView(row) });
});

app.get("/api/booking/download", requireAuth, async (req, res) => {
  const row = readBooking(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("Title deed not found.");
    return;
  }
  const bytes = readBookingFile(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "title-deed.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/booking/:id", requireAuth, async (req, res) => {
  const row = readBooking(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Title deed not found." });
    return;
  }
  res.json({ ok: true, item: bookingView(row) });
});

app.delete("/api/booking/:id", requireAuth, async (req, res) => {
  const row = readBooking(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Title deed not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeBooking(root, req.params.id) });
});

// ---------------------------------------------------------------- NOC

app.get("/api/noc/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listNocs(root).map(nocView) });
});

app.post("/api/noc/extract", requireAuth, async (req, res) => {
  const image = readImagePayload(req.body || {});
  if (image.error) {
    res.status(400).json({
      ok: false,
      error: image.error.replace("contract or title deed", "title deed, Emirates ID, or NOC"),
    });
    return;
  }
  try {
    const out = await extractNocFromImage(image);
    let frontKeyAlerted = false;
    if (out.frontKeyLow) {
      const alert = await alertFrontOpenAiLow({
        user: req.user,
        db,
        reason: out.frontKeyReason || "front key quota / billing",
        fromName: by(req),
      });
      frontKeyAlerted = Boolean(alert.ok && !alert.skipped);
    }
    res.status(out.ok ? 200 : 400).json({ ...out, frontKeyAlerted });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not read the photo.",
    });
  }
});

app.get("/api/noc/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: nocFromListing(listing) });
});

app.post("/api/noc/save", requireAuth, async (req, res) => {
  const data = normalizeNocForm(req.body || {});
  const missing = nocMissing(data);
  if (missing) {
    res.status(400).json({ ok: false, error: missing });
    return;
  }
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readNoc(root, existingId) : null;
  const row = writeNoc(root, {
    id: existing?.id,
    title: `NOC — ${(data.plotNo || data.location || data.ownerName || "Property").trim()}`,
    listing_id: data.listingId,
    owner_name: data.ownerName,
    pdf_name: nocPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    sign: existing?.sign,
    data,
  });
  res.json({ ok: true, item: nocView(row) });
});

app.get("/api/noc/download", requireAuth, async (req, res) => {
  const row = readNoc(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("NOC not found.");
    return;
  }
  const bytes = readNocFile(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "noc.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/noc/:id", requireAuth, async (req, res) => {
  const row = readNoc(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  res.json({ ok: true, item: nocView(row) });
});

app.get("/api/noc-maint/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listMaints(root).map(nocMaintView) });
});

app.get("/api/noc-maint/scope-options", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: readNocMaintScopeOptions(root) });
});

app.post("/api/noc-maint/scope-options", requireAuth, async (req, res) => {
  const added = addNocMaintScopeOption(root, req.body?.item);
  res.status(added.ok ? 200 : 400).json(added);
});

app.get("/api/noc-maint/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: nocMaintFromListing(listing) });
});

app.post("/api/noc-maint/save", requireAuth, async (req, res) => {
  const data = normalizeNocMaintForm(req.body || {});
  const missing = nocMaintMissing(data);
  if (missing) {
    res.status(400).json({ ok: false, error: missing });
    return;
  }
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readMaint(root, existingId) : null;
  const row = writeMaint(root, {
    id: existing?.id,
    title: `NOC Maintenance — ${(data.propertyDetails || data.ownerName || "Property").trim()}`,
    listing_id: data.listingId,
    owner_name: data.ownerName,
    pdf_name: nocMaintPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    sign: existing?.sign,
    data,
  });
  res.json({ ok: true, item: nocMaintView(row) });
});

app.get("/api/noc-maint/download", requireAuth, async (req, res) => {
  const row = readMaint(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("NOC not found.");
    return;
  }
  const bytes = readNocMaintFile(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "noc-maintenance.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/noc-maint/:id", requireAuth, async (req, res) => {
  const row = readMaint(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  res.json({ ok: true, item: nocMaintView(row) });
});

app.delete("/api/noc-maint/:id", requireAuth, async (req, res) => {
  const row = readMaint(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeMaint(root, req.params.id) });
});

app.get("/api/noc-movein/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listMoveins(root).map(nocMoveinView) });
});

app.get("/api/noc-movein/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: nocMoveinFromListing(listing) });
});

app.post("/api/noc-movein/save", requireAuth, async (req, res) => {
  const data = normalizeNocMoveinForm(req.body || {});
  const missing = nocMoveinMissing(data);
  if (missing) {
    res.status(400).json({ ok: false, error: missing });
    return;
  }
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readMovein(root, existingId) : null;
  const row = writeMovein(root, {
    id: existing?.id,
    title: `NOC For Move In — ${(data.property || data.ownerName || "Property").trim()}`,
    listing_id: data.listingId,
    owner_name: data.ownerName,
    pdf_name: nocMoveinPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    sign: existing?.sign,
    data,
  });
  res.json({ ok: true, item: nocMoveinView(row) });
});

app.get("/api/noc-movein/download", requireAuth, async (req, res) => {
  const row = readMovein(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("NOC not found.");
    return;
  }
  const bytes = readNocMoveinFile(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "noc-move-in.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/noc-movein/:id", requireAuth, async (req, res) => {
  const row = readMovein(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  res.json({ ok: true, item: nocMoveinView(row) });
});

app.delete("/api/noc-movein/:id", requireAuth, async (req, res) => {
  const row = readMovein(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeMovein(root, req.params.id) });
});

app.get("/api/noc-moveout/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listMoveouts(root).map(nocMoveoutView) });
});

app.get("/api/noc-moveout/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: nocMoveoutFromListing(listing) });
});

app.post("/api/noc-moveout/save", requireAuth, async (req, res) => {
  const data = normalizeNocMoveoutForm(req.body || {});
  const missing = nocMoveoutMissing(data);
  if (missing) {
    res.status(400).json({ ok: false, error: missing });
    return;
  }
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readMoveout(root, existingId) : null;
  const row = writeMoveout(root, {
    id: existing?.id,
    title: `NOC For Move Out — ${(data.property || data.ownerName || "Property").trim()}`,
    listing_id: data.listingId,
    owner_name: data.ownerName,
    pdf_name: nocMoveoutPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    sign: existing?.sign,
    data,
  });
  res.json({ ok: true, item: nocMoveoutView(row) });
});

app.get("/api/noc-moveout/download", requireAuth, async (req, res) => {
  const row = readMoveout(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("NOC not found.");
    return;
  }
  const bytes = readNocMoveoutFile(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "noc-move-out.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/noc-moveout/:id", requireAuth, async (req, res) => {
  const row = readMoveout(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  res.json({ ok: true, item: nocMoveoutView(row) });
});

app.delete("/api/noc-moveout/:id", requireAuth, async (req, res) => {
  const row = readMoveout(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeMoveout(root, req.params.id) });
});

app.get("/api/noc-trakheesi/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listTrakheesi(root).map(nocTrakheesiView) });
});

app.get("/api/noc-trakheesi/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: nocTrakheesiFromListing(listing) });
});

app.post("/api/noc-trakheesi/save", requireAuth, async (req, res) => {
  const data = normalizeNocTrakheesiForm(req.body || {});
  const missing = nocTrakheesiMissing(data);
  if (missing) {
    res.status(400).json({ ok: false, error: missing });
    return;
  }
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readTrakheesi(root, existingId) : null;
  const row = writeTrakheesi(root, {
    id: existing?.id,
    title: `NOC For Advertisement — ${(data.propertyNo || data.building || data.ownerName || "Property").trim()}`,
    listing_id: data.listingId,
    owner_name: data.ownerName,
    pdf_name: nocTrakheesiPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    sign: existing?.sign,
    data,
  });
  res.json({ ok: true, item: nocTrakheesiView(row) });
});

app.get("/api/noc-trakheesi/download", requireAuth, async (req, res) => {
  const row = readTrakheesi(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("NOC not found.");
    return;
  }
  const bytes = readNocTrakheesiFile(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "noc-for-advertisement.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/noc-trakheesi/:id", requireAuth, async (req, res) => {
  const row = readTrakheesi(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  res.json({ ok: true, item: nocTrakheesiView(row) });
});

app.delete("/api/noc-trakheesi/:id", requireAuth, async (req, res) => {
  const row = readTrakheesi(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeTrakheesi(root, req.params.id) });
});

function addNocEmailRoute(base, kindKey) {
  app.post(`${base}/email`, requireAuth, async (req, res) => {
    const kind = NOC_MAIL_KINDS[kindKey];
    const id = String(req.body?.id || "").trim();
    const row = kind.read(root, id);
    if (!row) {
      res.status(404).json({ ok: false, error: "NOC not found." });
      return;
    }
    try {
      const result = await emailNocForSign(root, kind, row, {
        email: req.body?.email,
        name: req.body?.name,
        origin: ORIGIN,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Could not send the NOC.",
      });
    }
  });
}

addNocEmailRoute("/api/noc", "noc");
addNocEmailRoute("/api/noc-maint", "noc-maint");
addNocEmailRoute("/api/noc-movein", "noc-movein");
addNocEmailRoute("/api/noc-moveout", "noc-moveout");
addNocEmailRoute("/api/noc-trakheesi", "noc-trakheesi");

function addNocWhatsappRoute(base, kindKey) {
  app.post(`${base}/whatsapp`, requireAuth, async (req, res) => {
    const kind = NOC_MAIL_KINDS[kindKey];
    const id = String(req.body?.id || "").trim();
    const row = kind.read(root, id);
    if (!row) {
      res.status(404).json({ ok: false, error: "NOC not found." });
      return;
    }
    try {
      const result = whatsappNocForSign(root, kind, row, {
        phone: req.body?.phone,
        name: req.body?.name,
        origin: ORIGIN,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Could not open WhatsApp.",
      });
    }
  });
}

addNocWhatsappRoute("/api/noc", "noc");
addNocWhatsappRoute("/api/noc-maint", "noc-maint");
addNocWhatsappRoute("/api/noc-movein", "noc-movein");
addNocWhatsappRoute("/api/noc-moveout", "noc-moveout");
addNocWhatsappRoute("/api/noc-trakheesi", "noc-trakheesi");

app.get("/api/form-a/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listFormA(root).map(formAView) });
});

app.get("/api/form-a/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: formAFromListing(listing) });
});

app.post("/api/form-a/save", requireAuth, async (req, res) => {
  const data = normalizeFormA(req.body || {});
  const submitting = Boolean(req.body?.submitting);
  if (submitting) data.acceptedTerms = "1";
  if (submitting) {
    const missing = formAMissing(data, { submitting: true });
    if (missing) {
      res.status(400).json({ ok: false, error: missing });
      return;
    }
  }
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readFormA(root, existingId) : null;
  const row = writeFormA(root, {
    id: existing?.id,
    title: `Form A — ${(formAOwner(data) || data.certificateNumber || data.listingRef || "Marketing contract").trim()}`,
    listing_id: data.listingId,
    owner_name: formAOwner(data),
    pdf_name: formAPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    data,
  });
  res.json({ ok: true, item: formAView(row) });
});

app.get("/api/form-a/download", requireAuth, async (req, res) => {
  const row = readFormA(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("Form A not found.");
    return;
  }
  const bytes = readFormAFile(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "form-a.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/form-a/:id", requireAuth, async (req, res) => {
  const row = readFormA(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Form A not found." });
    return;
  }
  res.json({ ok: true, item: formAView(row) });
});

app.delete("/api/form-a/:id", requireAuth, async (req, res) => {
  const row = readFormA(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Form A not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeFormA(root, req.params.id) });
});

app.get("/api/form-i/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listFormI(root).map(formIView) });
});

app.get("/api/form-i/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: formIFromListing(listing) });
});

app.post("/api/form-i/save", requireAuth, async (req, res) => {
  const data = normalizeFormI(req.body || {});
  const missing = formIMissing(data);
  if (missing) {
    res.status(400).json({ ok: false, error: missing });
    return;
  }
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readFormI(root, existingId) : null;
  const row = writeFormI(root, {
    id: existing?.id,
    title: `Form I — ${(data.projectName || data.bEstablishment || data.aEstablishment || "Agreement").trim()}`,
    listing_id: data.listingId,
    owner_name: data.aBrokerName || data.bBrokerName,
    pdf_name: formIPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    data,
  });
  res.json({ ok: true, item: formIView(row) });
});

app.get("/api/form-i/download", requireAuth, async (req, res) => {
  const row = readFormI(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("Form I not found.");
    return;
  }
  const bytes = readFormIFile(row.pdf_path);
  if (!bytes) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "form-i.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/form-i/:id", requireAuth, async (req, res) => {
  const row = readFormI(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Form I not found." });
    return;
  }
  res.json({ ok: true, item: formIView(row) });
});

app.delete("/api/form-i/:id", requireAuth, async (req, res) => {
  const row = readFormI(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Form I not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeFormI(root, req.params.id) });
});

app.get("/api/booking-form/list", requireAuth, async (_req, res) => {
  res.json({ ok: true, items: listBookingForms(root).map(bookingFormView) });
});

app.get("/api/booking-form/next-no", requireAuth, async (_req, res) => {
  res.json({ ok: true, voucherNo: nextVoucherNo(root) });
});

app.get("/api/booking-form/from-listing/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ ok: false, error: "Listing not found." });
    return;
  }
  res.json({ ok: true, listing, data: bookingFormFromListing(listing) });
});

app.post("/api/booking-form/save", requireAuth, async (req, res) => {
  const data = normalizeBookingReceipt(req.body || {});
  const missing = bookingFormMissing(data);
  if (missing) {
    res.status(400).json({ ok: false, error: missing });
    return;
  }
  const existingId = String(req.body?.id || "").trim();
  const existing = existingId ? readBookingForm(root, existingId) : null;
  const row = writeBookingForm(root, {
    id: existing?.id,
    title: `Booking Form — ${(data.accountName || data.voucherNo || data.listingRef || "Receipt").trim()}`,
    listing_id: data.listingId,
    owner_name: data.accountName,
    pdf_name: bookingFormPdfName(data),
    created_by: existing?.created_by || by(req),
    created_at: existing?.created_at,
    updated_at: Math.floor(Date.now() / 1000),
    refunded: Boolean(existing?.refunded),
    refunded_at: Number(existing?.refunded_at || 0),
    data,
  });
  res.json({ ok: true, item: bookingFormView(row) });
});

app.post("/api/booking-form/refund", requireAuth, async (req, res) => {
  const id = String(req.body?.id || "").trim();
  const row = readBookingForm(root, id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Booking form not found." });
    return;
  }
  const saved = setBookingRefund(root, id, Boolean(req.body?.refunded));
  res.json({ ok: true, item: bookingFormView(saved) });
});

app.get("/api/booking-form/download", requireAuth, async (req, res) => {
  const row = readBookingForm(root, String(req.query.id || ""));
  if (!row) {
    res.status(404).type("text").send("Booking form not found.");
    return;
  }
  const bytes = bookingFormPdf(row.data);
  if (!bytes?.length) {
    res.status(404).type("text").send("PDF file missing.");
    return;
  }
  const name = row.pdf_name || "booking-form.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="${name.replaceAll('"', "")}"`);
  res.send(bytes);
});

app.get("/api/booking-form/:id", requireAuth, async (req, res) => {
  const row = readBookingForm(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Booking form not found." });
    return;
  }
  res.json({ ok: true, item: bookingFormView(row) });
});

app.delete("/api/booking-form/:id", requireAuth, async (req, res) => {
  const row = readBookingForm(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "Booking form not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeBookingForm(root, req.params.id) });
});

app.delete("/api/noc/:id", requireAuth, async (req, res) => {
  const row = readNoc(root, req.params.id);
  if (!row) {
    res.status(404).json({ ok: false, error: "NOC not found." });
    return;
  }
  if (!req.user?.admin && row.created_by && row.created_by !== by(req)) {
    res.status(403).json({ ok: false, error: "Only the creator or an admin can delete this form." });
    return;
  }
  res.json({ ok: true, removed: removeNoc(root, req.params.id) });
});

// ---------------------------------------------------------------- contracts + e-signature

function contractEvent(by, event, detail) {
  return { at: new Date().toISOString(), by: String(by || "System"), event: String(event), detail: String(detail || "") };
}

function signerLinks(contract) {
  const origin = ORIGIN.replace(/\/$/, "");
  const label = kindLabel(contract.kind).toLowerCase();
  return contract.signers.map((signer) => {
    const url = signer.token ? `${origin}/sign/${signer.token}` : "";
    const message = `Dear ${signer.name}, please review and sign the ${label} for ${contract.reference} here: ${url}\nA7 Group Real Estate`;
    const digits = String(signer.phone || "").replace(/[^0-9]/g, "");
    return {
      role: signer.role,
      label: signer.label,
      name: signer.name,
      email: signer.email,
      phone: signer.phone,
      url,
      whatsapp: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : "",
      mailto: signer.email
        ? `mailto:${encodeURIComponent(signer.email)}?subject=${encodeURIComponent(`${kindLabel(contract.kind)} ${contract.reference} - please sign`)}&body=${encodeURIComponent(message)}`
        : "",
      sent_at: signer.sent_at,
      viewed_at: signer.viewed_at,
      signed_at: signer.signed_at,
      expires_at: signer.expires_at,
    };
  });
}

function contractView(contract) {
  return {
    ...contract,
    signers: contract.signers.map(({ signature, token, ...rest }) => ({ ...rest, has_signature: Boolean(signature), has_token: Boolean(token) })),
    links: signerLinks(contract),
  };
}

async function emailContractPdf(contract) {
  const emailed = [];
  const email_errors = [];
  if (!smtpConfigured()) {
    return { emailed, email_errors, smtp: false };
  }
  try {
    const pdf = contractPdf(contract);
    const links = signerLinks(contract);
    const label = kindLabel(contract.kind);
    for (const link of links) {
      if (!link.email) continue;
      const sent = await sendMail({
        to: link.email,
        subject: `${label} ${contract.reference} — please sign`,
        body: `Dear ${link.name || link.label},\n\nPlease review the attached ${label.toLowerCase()} for ${contract.reference} and sign here:\n${link.url}\n\nThe same PDF is attached for your records.\n\nA7 Group Real Estate\nDubai\n`,
        pdf,
        pdfName: `${contract.reference}-${contract.kind}.pdf`,
      });
      if (sent.ok) emailed.push({ role: link.role, email: link.email });
      else email_errors.push({ role: link.role, email: link.email, error: sent.error });
    }
  } catch (error) {
    email_errors.push({ error: error.message || "PDF email failed" });
  }
  return { emailed, email_errors, smtp: true };
}

async function syncListingContract(contract, by) {
  const listing = await db.get(contract.listing_id);
  if (!listing) return;
  const patch = { contract_status: `${contract.kind}:${contract.status}` };
  if (contract.status === "signed") {
    const kind = contract.kind === "sale" ? "sale_agreement" : "ejari";
    const url = `/api/contracts/${contract.id}/pdf`;
    const docs = (listing.documents_list || []).filter((item) => item.url !== url);
    docs.push({ url, name: `Signed ${kindLabel(contract.kind)} ${contract.reference}.pdf`, kind });
    patch.documents_list = docs;
  }
  await db.update(listing.id, patch, by);
}

app.get("/api/listings/:id/contracts", requireAuth, async (req, res) => {
  res.json({ contracts: (await db.contracts(req.params.id)).map(contractView) });
});

app.post("/api/listings/:id/contracts", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const kind = CONTRACT_KINDS.includes(req.body?.kind) ? req.body.kind : listing.purpose === "sale" ? "sale" : "tenancy";
  const base = contractFromListing(listing, kind, req.user);
  const data = req.body?.data && typeof req.body.data === "object" ? req.body.data : {};
  const merged = {
    ...base,
    data: {
      party: { ...base.data.party, ...(data.party || {}) },
      owner: { ...base.data.owner, ...(data.owner || {}) },
      property: { ...base.data.property, ...(data.property || {}) },
      terms: { ...base.data.terms, ...(data.terms || {}) },
      agent: { ...base.data.agent, ...(data.agent || {}) },
    },
    created_by: by(req),
    status: "draft",
    history: [contractEvent(by(req), "created", kindLabel(kind))],
  };
  let contract = await db.createContract(merged);
  contract = await db.updateContract(contract.id, { signers: buildSigners(contract) });
  await syncListingContract(contract, listingBy(req));
  res.status(201).json({ contract: contractView(contract) });
});

app.get("/api/contracts/:id", requireAuth, async (req, res) => {
  const contract = await db.contract(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  res.json({ contract: contractView(contract) });
});

app.patch("/api/contracts/:id", requireAuth, async (req, res) => {
  const current = await db.contract(req.params.id);
  if (!current) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  if (current.signers.some((signer) => signer.signed_at)) {
    res.status(409).json({ error: "This contract already has a signature. Create a new contract to change the terms." });
    return;
  }
  const data = req.body?.data && typeof req.body.data === "object" ? req.body.data : {};
  const nextData = {
    party: { ...current.data.party, ...(data.party || {}) },
    owner: { ...current.data.owner, ...(data.owner || {}) },
    property: { ...current.data.property, ...(data.property || {}) },
    terms: { ...current.data.terms, ...(data.terms || {}) },
    agent: { ...current.data.agent, ...(data.agent || {}) },
  };
  const draft = { ...current, data: nextData };
  // Keep issued tokens per role so already-sent links stay valid.
  const signers = buildSigners(draft).map((signer) => {
    const previous = current.signers.find((item) => item.role === signer.role);
    return previous ? { ...previous, name: signer.name, email: signer.email, phone: signer.phone } : signer;
  });
  const contract = await db.updateContract(current.id, {
    data: nextData,
    signers,
    history: [...current.history, contractEvent(by(req), "updated", "Details changed")],
  });
  res.json({ contract: contractView(contract) });
});

app.post("/api/contracts/:id/send", requireAuth, async (req, res) => {
  const current = await db.contract(req.params.id);
  if (!current) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  if (current.status === "cancelled") {
    res.status(409).json({ error: "This contract was cancelled." });
    return;
  }
  const signers = current.signers.length ? current.signers : buildSigners(current);
  if (!signers.length) {
    res.status(400).json({ error: "Add the tenant/buyer and the owner names first." });
    return;
  }
  const missing = signers.find((signer) => !signer.phone && !signer.email);
  if (missing) {
    res.status(400).json({ error: `${missing.label} needs a WhatsApp number or an email to receive the link.` });
    return;
  }
  const issued = issueTokens({ ...current, signers });
  const status = contractStatus({ ...current, signers: issued });
  const contract = await db.updateContract(current.id, {
    signers: issued,
    status,
    sent_at: current.sent_at || new Date().toISOString(),
    history: [...current.history, contractEvent(by(req), "sent", issued.map((s) => s.label).join(", "))],
  });
  await syncListingContract(contract, listingBy(req));
  const mail = await emailContractPdf(contract);
  if (mail.emailed.length) {
    await db.updateContract(contract.id, {
      history: [...contract.history, contractEvent(by(req), "emailed", mail.emailed.map((item) => item.email).join(", "))],
    });
  }
  res.json({ contract: contractView(contract), ...mail });
});

app.post("/api/contracts/:id/cancel", requireAuth, async (req, res) => {
  const current = await db.contract(req.params.id);
  if (!current) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  const contract = await db.updateContract(current.id, {
    status: "cancelled",
    history: [...current.history, contractEvent(by(req), "cancelled", req.body?.reason || "")],
  });
  await syncListingContract(contract, listingBy(req));
  res.json({ contract: contractView(contract) });
});

app.delete("/api/contracts/:id", requireAuth, requireAdmin, async (req, res) => {
  const current = await db.contract(req.params.id);
  if (!current) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  await db.removeContract(current.id);
  const listing = await db.get(current.listing_id);
  if (listing) {
    const remaining = await db.contracts(listing.id);
    const latest = remaining[0];
    await db.update(
      listing.id,
      {
        contract_status: latest ? `${latest.kind}:${latest.status}` : "",
        documents_list: (listing.documents_list || []).filter((item) => item.url !== `/api/contracts/${current.id}/pdf`),
      },
      listingBy(req)
    );
  }
  res.json({ removed: 1 });
});

app.get("/api/contracts/:id/pdf", requireAuth, async (req, res) => {
  const contract = await db.contract(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${req.query.download ? "attachment" : "inline"}; filename="${contract.reference}-${contract.kind}${contract.status === "signed" ? "-signed" : ""}.pdf"`
  );
  res.send(contractPdf(contract));
});

// ---- public signing pages (no login; the link itself is the key)

async function signerFor(token) {
  const contract = await db.contractByToken(token);
  if (!contract) return { error: "This signing link does not exist." };
  const signer = contract.signers.find((item) => item.token === token);
  if (!signer) return { error: "This signing link does not exist." };
  if (contract.status === "cancelled") return { error: "This contract was cancelled by the agent." };
  if (!signer.signed_at && signer.expires_at && new Date(signer.expires_at).getTime() < Date.now()) {
    return { error: "This signing link has expired." };
  }
  return { contract, signer };
}

app.get("/sign/:token", async (req, res) => {
  const found = await signerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  const { contract, signer } = found;
  if (signer.signed_at) {
    res.type("html").send(signDoneHtml(contract, signer, req.params.token));
    return;
  }
  if (!signer.viewed_at) {
    const signers = contract.signers.map((item) =>
      item.token === signer.token ? { ...item, viewed_at: new Date().toISOString() } : item
    );
    await db.updateContract(contract.id, {
      signers,
      history: [...contract.history, contractEvent(signer.name, "viewed", `${signer.label} opened the link`)],
    });
  }
  res.type("html").send(signPageHtml(contract, signer, req.params.token));
});

app.get("/sign/:token/pdf", async (req, res) => {
  const found = await signerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${found.contract.reference}-${found.contract.kind}.pdf"`);
  res.send(contractPdf(found.contract));
});

app.get("/sign/:token/done", async (req, res) => {
  const found = await signerFor(req.params.token);
  if (found.error) {
    res.status(404).type("html").send(signErrorHtml(found.error));
    return;
  }
  if (!found.signer.signed_at) {
    res.redirect(`/sign/${req.params.token}`);
    return;
  }
  res.type("html").send(signDoneHtml(found.contract, found.signer, req.params.token));
});

app.post("/sign/:token", async (req, res) => {
  const found = await signerFor(req.params.token);
  if (found.error) {
    res.status(404).json({ error: found.error });
    return;
  }
  const { contract, signer } = found;
  if (signer.signed_at) {
    res.status(409).json({ error: "This document is already signed." });
    return;
  }
  const name = String(req.body?.name || "").trim();
  const signature = String(req.body?.signature || "");
  if (name.length < 3) {
    res.status(400).json({ error: "Please enter your full name." });
    return;
  }
  if (!/^data:image\/jpeg;base64,/.test(signature) || signature.length < 200 || signature.length > 400000) {
    res.status(400).json({ error: "The signature image is missing or too large." });
    return;
  }
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const when = new Date().toISOString();
  const signers = contract.signers.map((item) =>
    item.token === signer.token
      ? { ...item, signed_at: when, signed_name: name, signature, ip, user_agent: String(req.headers["user-agent"] || "") }
      : item
  );
  const status = contractStatus({ ...contract, signers });
  const updated = await db.updateContract(contract.id, {
    signers,
    status,
    completed_at: status === "signed" ? when : contract.completed_at,
    history: [...contract.history, contractEvent(name, "signed", `${signer.label} signed from ${ip}`)],
  });
  await syncListingContract(updated, `${name} (${signer.label})`);
  res.json({ ok: true, status });
});

// ---------------------------------------------------------------- exports

app.get("/api/listings/:id/brochure", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const asAgent = req.query.as === "agent";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${listing.reference}${asAgent ? "-agent" : ""}.html"`
  );
  res.send(brochureHtml(listing, asAgent ? req.user?.name : ""));
});

app.get("/api/listings/:id/pdf", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const asAgent = req.query.as === "agent";
  const filename = `${listing.reference}${asAgent ? "-agent" : ""}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(listingPdf(listing, asAgent ? req.user?.name : ""));
});

app.post("/api/dld/lookup", requireAuth, async (req, res) => {
  try {
    const result = await lookupDld(req.body?.permit || req.body?.permit_number || "");
    res.json(result);
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || "DLD lookup failed" });
  }
});

app.get("/api/listings/:id/dld", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${listing.reference}-dld.svg"`
  );
  res.send(dldSvg(listing));
});

app.get("/api/listings/:id/history", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.json({
    id: listing.id,
    reference: listing.reference,
    title: listing.title,
    sessions: groupListingHistory(listing.history),
    rows: listingHistoryRows(listing.history),
  });
});

app.get("/api/listings/:id/insights", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const created = new Date(listing.created_at).getTime();
  const days = Math.max(0, Math.round((Date.now() - created) / 86400000));
  res.json({
    insights: {
      views: Number(listing.views || 0),
      days_listed: days,
      status: listing.status,
      portals: listing.portals,
      portal_count: listing.portals.length,
      photos: listing.gallery.filter((item) => item.kind !== "floorplan").length,
      documents: listing.documents_list.length,
      notes: listing.notes_list.length,
      history: listing.history.length,
      last_update: listing.updated_at,
      share_url: `${ORIGIN.replace(/\/$/, "")}/p/${encodeURIComponent(listing.reference)}`,
    },
  });
});

// Public share page (counts a view like the old app's "Listing Views").
app.get("/p/:reference", async (req, res) => {
  const listing = await db.getByReference(req.params.reference);
  if (!listing) {
    res.status(404).type("html").send(`<!doctype html><title>Not found</title><p>Listing not found.</p>`);
    return;
  }
  db.addView(listing.id).catch(() => {});
  res.type("html").send(
    publicListingHtml(listing, String(req.query.agent || "").slice(0, 80))
  );
});

// Portal feeds: point the portal account at these URLs.
app.get("/feeds/:portal.xml", async (req, res) => {
  const portal = String(req.params.portal || "").toLowerCase();
  if (!PORTALS.includes(portal)) {
    res.status(404).type("text").send("Unknown portal");
    return;
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(portalFeedXml(await db.all(), portal, ORIGIN));
});

app.get("/api/feeds", requireAuth, async (_req, res) => {
  const rows = await db.all();
  res.json({
    portals: PORTALS.map((portal) => ({
      id: portal,
      name: PORTAL_NAMES[portal],
      url: `${ORIGIN.replace(/\/$/, "")}/feeds/${portal}.xml`,
    })),
    live: feedSummary(rows, PORTALS),
  });
});

app.get("/api/listings.csv", requireAuth, async (req, res) => {
  const listings = await db.listAll(await listingFilters(req));
  const header = [
    "reference",
    "title",
    "city",
    "community",
    "sub_community",
    "building",
    "unit_no",
    "permit_number",
    "type",
    "purpose",
    "category",
    "project_status",
    "status",
    "beds",
    "baths",
    "area_sqft",
    "price_aed",
    "price_yearly",
    "price_monthly",
    "price_weekly",
    "price_daily",
    "listing_agent",
    "listing_owner",
    "landlord_name",
    "landlord_email",
    "landlord_phone",
    "developer",
    "furnished",
    "parking",
    "ownership",
    "portal_expiry",
    "permit_issue_date",
    "permit_expiry_date",
    "portals",
    "amenities",
    "created_at",
    "updated_at",
    "created_by",
    "views",
  ];
  const lines = [header.join(",")];
  for (const row of listings) {
    lines.push(
      header
        .map((key) => {
          const value = Array.isArray(row[key])
            ? row[key].join("|")
            : String(row[key] ?? "");
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(",")
    );
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="property-listing-new.csv"'
  );
  res.send(lines.join("\n"));
});

app.get("/api/listings/:id", requireAuth, async (req, res) => {
  const listing = await db.get(req.params.id);
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const [withCount] = attachLeadCounts([listing], await db.allLeads());
  const [withPortals] = await attachPortalFacts([withCount]);
  res.json({ listing: withPortals });
});

function sendInstall(_req, res) {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Install Property Listing New</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      background:#12171f; color:#e8e0d4; font-family:Georgia, serif; }
    main { width:min(420px,90vw); }
    h1 { font-size:1.4rem; margin:0 0 .5rem; }
    p { color:#b7aa98; line-height:1.5; }
    #status { margin-top:1rem; color:#c4a574; }
  </style>
</head>
<body>
  <main>
    <h1>Property Listing New</h1>
    <p>Installing the left-menu item on your Bitrix24 portal.</p>
    <p id="status">Waiting for Bitrix…</p>
  </main>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <script>
    const status = document.getElementById("status");
    function go() {
      if (!window.BX24) {
        status.textContent = "Open this page from Bitrix24 to install.";
        return;
      }
      BX24.init(function () {
        const auth = BX24.getAuth() || {};
        fetch("/api/install", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            AUTH_ID: auth.access_token || auth.AUTH_ID,
            DOMAIN: auth.domain || auth.DOMAIN
          })
        }).then(function (res) { return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "Install failed");
          status.textContent = "Installed. Opening the desk…";
          location.replace("/");
        }); }).catch(function (err) {
          status.textContent = err.message;
        });
      });
    }
    go();
  </script>
</body>
</html>`);
}

app.get("/install", sendInstall);

if (fs.existsSync(dist)) {
  app.use(
    express.static(dist, {
      setHeaders(res, filePath) {
        if (
          filePath.includes(`${path.sep}studio${path.sep}`) ||
          filePath.includes(`${path.sep}hero${path.sep}`) ||
          filePath.includes(`${path.sep}assets${path.sep}`)
        ) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res
      .type("html")
      .send(
        "<p>Property Listing New API is running. Build the client with <code>npm run build</code>.</p>"
      );
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`a7-listing-v2 listening on ${HOST}:${PORT}`);
  const key = overviewCacheKey({ days: "7", lead_range: "day" });
  const job = buildOverview({ query: { days: "7", lead_range: "day" } })
    .then((body) => {
      overviewSnapshots.set(key, { at: Date.now(), body });
      return body;
    })
    .finally(() => overviewJobs.delete(key));
  overviewJobs.set(key, job);
  job.catch((error) => console.error("Overview warm failed:", error?.message || error));
});
