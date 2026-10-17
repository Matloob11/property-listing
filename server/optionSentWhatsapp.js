const OPEN_PASSWORD = "admin123";
const rememberedChats = new Map();

export function optionSentChatKey({ agentId, from = "", to = "", sourceId = "", statusId = "" } = {}) {
  return [agentId, from, to, sourceId, statusId].join("|");
}

export function passwordOk(password) {
  return String(password || "") === OPEN_PASSWORD;
}

export function rememberOptionSentChats(key, data) {
  rememberedChats.set(key, { at: Date.now(), data });
}

export function unlockOptionSentChats(key, password) {
  if (!passwordOk(password)) return { ok: false };
  const hit = rememberedChats.get(key);
  if (!hit || Date.now() - hit.at > 15 * 60 * 1000) return { ok: false, expired: true };
  return { ok: true, chats: hit.data.chats || [], otherChats: hit.data.otherChats || [], missingChats: hit.data.missingChats || [] };
}
export function phoneTail(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

export function phonesFromLead(row) {
  const phones = Array.isArray(row?.PHONE) ? row.PHONE : [];
  const out = [];
  const seen = new Set();
  for (const item of phones) {
    const phone = String(item?.VALUE ?? item ?? "").trim();
    const tail = phoneTail(phone);
    if (!tail || seen.has(tail)) continue;
    seen.add(tail);
    out.push({ phone, tail });
  }
  return out;
}

export function optionSentStageChange(comments, agentId) {
  const author = String(agentId || "").replace(/\D/g, "");
  let best = "";
  for (const item of comments || []) {
    if (String(item?.AUTHOR_ID ?? item?.authorId ?? "").replace(/\D/g, "") !== author) continue;
    const text = String(item?.COMMENT ?? item?.comment ?? "");
    if (!/option sent/i.test(text)) continue;
    if (!/\bstage\s*:/i.test(text) && !/\bstatus\s*:/i.test(text)) continue;
    const at = String(item?.CREATED ?? item?.created ?? "");
    if (at > best) best = at;
  }
  return best;
}

export function tailsFromLead(row) {
  return phonesFromLead(row).map((item) => item.tail);
}

/** One row per Official API chat, using the number written on the lead. */
export function optionSentChatLists(leads, waChats) {
  const byTail = new Map();
  for (const chat of waChats || []) {
    const tail = String(chat?.tail || "");
    if (!tail) continue;
    if (!byTail.has(tail)) byTail.set(tail, []);
    byTail.get(tail).push(chat);
  }
  const whatsapp = [];
  const other = [];
  for (const lead of leads || []) {
    const hits = [];
    const seen = new Set();
    for (const phone of lead?.phones || []) {
      for (const chat of byTail.get(phone.tail) || []) {
        const key = String(chat.conversationId || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        hits.push({
          phone: phone.phone,
          conversationId: Number(chat.conversationId),
          agentName: String(chat.agentName || ""),
          onAgent: Boolean(chat.onAgent),
          leadId: String(lead.id || ""),
        });
      }
    }
    if (!hits.length) continue;
    whatsapp.push(...hits);
    other.push(...hits.filter((row) => !row.onAgent));
  }
  return { chats: whatsapp, otherChats: other };
}

/**
 * WhatsApp = a chat exists for any phone on the lead (the agent's own number,
 * or any company number the New-contact box would open).
 * No WhatsApp = the rest of this period's Option Sent leads.
 * onAgent is the subset that sits on this agent's own numbers.
 */
export function tallyOptionSentChats(leads, onAgent, onAny) {
  const own = onAgent instanceof Set ? onAgent : new Set(onAgent || []);
  const any = onAny instanceof Set ? onAny : new Set(onAny || []);
  let whatsapp = 0;
  let noWhatsapp = 0;
  let onAgentCount = 0;
  let onOther = 0;
  let noPhone = 0;
  for (const lead of leads || []) {
    const tails = Array.isArray(lead?.tails) ? lead.tails.filter(Boolean) : [];
    if (!tails.length) {
      noPhone += 1;
      noWhatsapp += 1;
      continue;
    }
    const onOwnNumber = tails.some((tail) => own.has(tail));
    const somewhere = onOwnNumber || tails.some((tail) => any.has(tail));
    if (somewhere) {
      whatsapp += 1;
      if (onOwnNumber) onAgentCount += 1;
      else onOther += 1;
    } else {
      noWhatsapp += 1;
    }
  }
  return {
    whatsapp,
    noWhatsapp,
    onAgent: onAgentCount,
    onOther,
    noPhone,
    total: whatsapp + noWhatsapp,
  };
}
