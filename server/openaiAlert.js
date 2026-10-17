import { findBitrixUserByName, notifyBitrixUser } from "./bitrixCrm.js";
import { sendMail, smtpConfigured } from "./smtp.js";

const COOLDOWN_MS = 8 * 60 * 60 * 1000;
const SETTING_AT = "openai_front_low_alert_at";
const SETTING_USER = "openai_alert_bitrix_user";

export function isBalanceError(status, bodyText) {
  const text = String(bodyText || "");
  if (/insufficient_quota|billing_hard_limit|exceeded your current quota|plan and billing|credit|billing/i.test(text)) {
    return true;
  }
  return status === 429 && /quota|billing|credit/i.test(text);
}

function alertMessage(reason, fromName) {
  const when = new Date().toISOString();
  const who = fromName ? ` Reported by ${fromName}.` : "";
  return [
    "Property Listing New — OpenAI front key is running out.",
    "The first OpenAI key used for Tenancy photo extract hit a quota / billing / credit limit.",
    "The desk switched to the backup OpenAI key so extract can keep working.",
    "Please top up or replace the front OpenAI key.",
    reason ? `Reason: ${reason}` : "",
    `Time: ${when}.${who}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function alertFrontOpenAiLow({ user, db, reason, fromName }) {
  try {
    const last = Number((await db.getSetting(SETTING_AT, 0)) || 0);
    if (last && Date.now() - last < COOLDOWN_MS) {
      return { ok: true, skipped: "cooldown" };
    }
    const lastTry = Number((await db.getSetting("openai_front_low_alert_try_at", 0)) || 0);
    if (lastTry && Date.now() - lastTry < 15 * 60 * 1000) {
      return { ok: false, skipped: "retry-wait" };
    }
    await db.setSetting("openai_front_low_alert_try_at", Date.now());

    const cached = await db.getSetting(SETTING_USER, null);
    let target =
      cached && Number(cached.id) > 0
        ? cached
        : await findBitrixUserByName(user, process.env.OPENAI_ALERT_NAME || "Matloob Ul Hasnain");

    if (target?.id) await db.setSetting(SETTING_USER, { id: target.id, name: target.name, email: target.email || "" });

    const message = alertMessage(reason, fromName);
    let bitrix = { ok: false, error: "Matloob Ul Hasnain was not found on Bitrix." };
    if (target?.id) {
      bitrix = await notifyBitrixUser(user, target.id, message);
    }

    let email = { ok: false };
    const to = String(target?.email || process.env.OPENAI_ALERT_EMAIL || "").trim();
    if (smtpConfigured() && to) {
      email = await sendMail({
        to,
        subject: "OpenAI front key is running out — Property Listing New",
        body: message,
      });
    }

    if (bitrix.ok || email.ok) {
      await db.setSetting(SETTING_AT, Date.now());
      console.warn("OpenAI front-key alert sent", { bitrix: bitrix.ok, email: Boolean(email.ok), to: target?.name || "Matloob Ul Hasnain" });
      return { ok: true, bitrix: bitrix.ok, email: Boolean(email.ok), via: bitrix.ok ? bitrix.via : "email" };
    }

    console.warn("OpenAI front-key alert failed", bitrix.error || email.error || "no path");
    return { ok: false, error: bitrix.error || email.error || "Could not notify Matloob Ul Hasnain." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Notify failed." };
  }
}
