export const NOC_SIGN_DAYS = 14;

export function normalizeNocSign(input) {
  const raw = input?.sign && typeof input.sign === "object" ? input.sign : input;
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    email: String(src.email || "").trim(),
    phone: String(src.phone || "").trim(),
    name: String(src.name || "").trim(),
    token: String(src.token || "").trim(),
    sent_at: String(src.sent_at || "").trim(),
    viewed_at: String(src.viewed_at || "").trim(),
    signed_at: String(src.signed_at || "").trim(),
    signed_name: String(src.signed_name || "").trim(),
    expires_at: String(src.expires_at || "").trim(),
  };
}

export function nocSignExpired(sign) {
  return Boolean(sign?.expires_at && !sign.signed_at && Date.parse(sign.expires_at) < Date.now());
}

export function nocSignStatus(sign) {
  if (sign?.signed_at) return "signed";
  if (sign?.sent_at) return "sent";
  return "";
}

export function nocSignView(sign) {
  const next = normalizeNocSign(sign);
  return {
    signStatus: nocSignStatus(next),
    signEmail: next.email,
    signPhone: next.phone,
    signedAt: next.signed_at,
    signSentAt: next.sent_at,
    signName: next.signed_name || next.name,
  };
}
