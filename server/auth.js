import crypto from "node:crypto";
import { LISTING_ACCESS_DENIED, DESK_ACCESS_SECTIONS, deskAccess, isBitrixAdmin, isDailyReportApiAllowed, isDailyReportOnlyUser, withDeskAccess, DAILY_REPORT_ONLY_DENIED } from "./listingAccess.js";
import { isSectionApiAllowed, resolveSectionDesk } from "./uiPermissions.js";

const SECTION_ACCESS_DENIED = "This section is not included in your Property Listing access.";
let authDb = null;

export function setAuthDb(db) {
  authDb = db;
}

const COOKIE = "a7_listing_sess";
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

function secret() {
  return process.env.SESSION_SECRET || "dev-only-secret";
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const mac = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
  return `${body}.${mac}`;
}

function unsign(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function readSession(req) {
  return unsign(req.cookies?.[COOKIE]);
}

export function writeSession(res, user) {
  const token = sign({
    ...user,
    exp: Date.now() + MAX_AGE_MS,
  });
  const secure = process.env.NODE_ENV === "production";
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

export function requireAuth(req, res, next) {
  if (process.env.DEV_BYPASS === "1") {
    req.user = withDeskAccess({
      id: "dev",
      name: "Local Desk",
      email: "desk@local",
      admin: true,
    });
    return next();
  }
  const session = readSession(req);
  if (!session) {
    res.status(403).json({ error: "Open this app from Bitrix24." });
    return;
  }
  resolveSectionDesk(authDb, session).then((user) => {
    if (!user?.deskAccess) {
      res.status(403).json({ error: LISTING_ACCESS_DENIED });
      return;
    }
    req.user = user;
    if (isDailyReportOnlyUser(req.user) && !isDailyReportApiAllowed(req.method, req.path)) {
      res.status(403).json({ error: DAILY_REPORT_ONLY_DENIED });
      return;
    }
    if (req.user.deskAccess === DESK_ACCESS_SECTIONS && !isSectionApiAllowed(req.method, req.path, req.user.grantedSections)) {
      res.status(403).json({ error: SECTION_ACCESS_DENIED });
      return;
    }
    next();
  }).catch((error) => {
    res.status(500).json({ error: error?.message || "Could not check access" });
  });
}

function portalDomain() {
  return process.env.PORTAL_DOMAIN || "crm.a7grouprealestatedxb.com";
}

export async function verifyBitrix(authId, domain) {
  const host = String(domain || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (host !== portalDomain()) {
    throw new Error("Unknown portal");
  }
  const currentUrl = `https://${host}/rest/user.current.json?auth=${encodeURIComponent(authId)}`;
  const adminUrl = `https://${host}/rest/user.admin.json?auth=${encodeURIComponent(authId)}`;
  const [currentRes, adminRes] = await Promise.all([
    fetch(currentUrl),
    fetch(adminUrl),
  ]);
  const current = await currentRes.json();
  const admin = await adminRes.json();
  if (!current?.result?.ID) {
    throw new Error("Bitrix auth failed");
  }
  const first = current.result.NAME || "";
  const last = current.result.LAST_NAME || "";
  const login = current.result.LOGIN || "";
  return {
    id: String(current.result.ID),
    name: `${first} ${last}`.trim() || login || current.result.EMAIL || "Agent",
    email: current.result.EMAIL || "",
    admin: isBitrixAdmin({ admin: admin?.result }),
    domain: host,
    authId,
    deskAccess: deskAccess({
      id: String(current.result.ID),
      email: current.result.EMAIL || "",
    }),
  };
}

export async function bindLeftMenu(authId, domain) {
  const host = String(domain || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const origin = process.env.PUBLIC_ORIGIN || `https://${host}`;
  const handler = `${origin.replace(/\/$/, "")}/`;
  const listed = await fetch(`https://${host}/rest/placement.get.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      auth: authId,
      PLACEMENT: "LEFT_MENU",
    }),
  });
  const current = await listed.json();
  const rows = Array.isArray(current.result) ? current.result : [];
  const already = rows.some((item) => {
    const url = item.handler || item.PLACEMENT_HANDLER || "";
    return url.replace(/\/$/, "") === handler.replace(/\/$/, "");
  });
  if (already) {
    return { result: true, already: true };
  }
  const res = await fetch(`https://${host}/rest/placement.bind.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      auth: authId,
      PLACEMENT: "LEFT_MENU",
      HANDLER: handler,
      TITLE: "Property Listing New",
    }),
  });
  return res.json();
}
