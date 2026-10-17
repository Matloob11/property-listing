import { fetchLead, mapLead, pfConfigured } from "./pf.js";
import { leadPortal, leadPortalLabel } from "./leadPortal.js";

function crmPortalOrigin() {
  try {
    return new URL(String(process.env.BITRIX_WEBHOOK || "").trim()).origin;
  } catch {
    return "";
  }
}

export function crmLeadUrl(lead) {
  const bitrixId = String(lead?.bitrix_id || "").replace(/\D/g, "") || (String(lead?.id || "").startsWith("crm-") ? String(lead.id).slice(4) : "");
  const origin = crmPortalOrigin();
  return bitrixId && origin ? `${origin}/crm/lead/details/${bitrixId}/` : "";
}

const MAX_BYTES = 20_000_000;

export function leadView(lead) {
  if (!lead) return null;
  const { call_record: _url, raw: _raw, ...rest } = lead;
  const portal = leadPortal(lead);
  return {
    ...rest,
    has_recording: Boolean(String(lead.call_record || "").trim()),
    portal,
    portal_label: leadPortalLabel(portal),
    crm_url: crmLeadUrl(lead),
  };
}

export function leadsPageView(page) {
  return {
    ...page,
    leads: (page.leads || []).map(leadView),
  };
}

function pfAudioUrl(url) {
  const href = String(url || "").trim();
  if (!/^https:\/\/pf-ae-documents\.s3([.][a-z0-9-]+)?\.amazonaws\.com\//i.test(href)) return "";
  return href;
}

/** PF S3 often sends binary/octet-stream for WAV recordings. */
export function sniffAudioMime(buf) {
  if (!buf || buf.length < 12) return "";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    if (buf.toString("ascii", 8, 12) === "WAVE") return "audio/wav";
  }
  if (buf.toString("ascii", 0, 3) === "ID3") return "audio/mpeg";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (buf.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  if (buf.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  return "";
}

function headerLooksLikeAudio(mime) {
  const m = String(mime || "").split(";")[0].trim().toLowerCase();
  if (!m) return true;
  if (m.startsWith("audio/")) return true;
  return m === "application/octet-stream" || m === "binary/octet-stream" || m === "application/octetstream";
}

function audioFileName(mime) {
  if (mime === "audio/wav") return "pf-call.wav";
  if (mime === "audio/mp4") return "pf-call.m4a";
  if (mime === "audio/ogg") return "pf-call.ogg";
  return "pf-call.mp3";
}

async function downloadAudio(url) {
  const href = pfAudioUrl(url);
  if (!href) return { ok: false, error: "Recording link is not a Property Finder file." };
  const res = await fetch(href, { headers: { Accept: "audio/mpeg,audio/wav,audio/*,*/*" } });
  if (!res.ok) return { ok: false, error: `Recording file returned ${res.status}.` };
  const headerMime = String(res.headers.get("content-type") || "").split(";")[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return { ok: false, error: "Recording file was empty." };
  if (buf.length > MAX_BYTES) return { ok: false, error: "Recording file is too large." };
  const sniffed = sniffAudioMime(buf);
  if (!sniffed && !headerLooksLikeAudio(headerMime)) {
    return { ok: false, error: "This file is not an audio recording." };
  }
  if (!sniffed && !/^audio\//i.test(headerMime)) {
    return { ok: false, error: "This file is not an audio recording." };
  }
  const mime = sniffed || (/^audio\//i.test(headerMime) ? headerMime : "audio/mpeg");
  return { ok: true, mime, buffer: buf, url: href };
}

export async function loadLeadRecording(lead, db) {
  if (!lead || lead.channel !== "call") {
    return { ok: false, error: "This lead is not a Property Finder call." };
  }
  const stored = pfAudioUrl(lead.call_record);
  if (pfConfigured()) {
    try {
      const fresh = await fetchLead(lead.id);
      const mapped = fresh ? mapLead(fresh) : null;
      const url = pfAudioUrl(mapped?.call_record || fresh?.call?.recordFile);
      if (url) {
        const audio = await downloadAudio(url);
        if (audio.ok) {
          if (db && url !== String(lead.call_record || "")) {
            await db.upsertLeads([{ ...lead, call_record: url }]);
          }
          return audio;
        }
      }
    } catch {
      /* fall back to the stored link */
    }
  }
  if (!stored) return { ok: false, error: "No recording is attached to this call." };
  return downloadAudio(stored);
}

export function sendAudio(req, res, audio) {
  const buffer = audio.buffer;
  const total = buffer.length;
  const mime = audio.mime || "audio/mpeg";
  res.setHeader("Content-Type", mime);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `inline; filename="${audioFileName(mime)}"`);
  const range = String(req.headers.range || "");
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (match) {
    const start = Math.min(Number(match[1]), Math.max(0, total - 1));
    const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (start <= end) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", String(end - start + 1));
      res.end(buffer.subarray(start, end + 1));
      return;
    }
  }
  res.setHeader("Content-Length", String(total));
  res.end(buffer);
}
