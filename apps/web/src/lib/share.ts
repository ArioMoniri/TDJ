"use client";
import {
  appNightLink,
  encodeNightPayload,
  exportNight,
  NIGHT_MIME,
  type NightFile,
  nightFileName,
  nightFileText,
  nightLink,
} from "@tdj/core";
import { downloadBlob } from "./download";
import type { Playlist } from "./types";

/** QR codes past this many characters get too dense to scan from a screen */
export const QR_MAX_CHARS = 1200;

export interface NightShare {
  night: NightFile;
  /** `https://this-site/night#n1.…` (null when the night is too long for a link) */
  link: string | null;
  /** `tdj://night#n1.…` */
  appLink: string | null;
  /** why there is no link */
  linkError: string | null;
}

export async function shareNight(p: Playlist): Promise<NightShare> {
  const night = exportNight(p);
  try {
    const payload = await encodeNightPayload(night);
    return {
      night,
      link: nightLink(location.origin, payload),
      appLink: appNightLink(payload),
      linkError: null,
    };
  } catch (e) {
    return { night, link: null, appLink: null, linkError: (e as Error).message };
  }
}

export function saveNightFile(n: NightFile) {
  downloadBlob(nightFileName(n.name), nightFileText(n), NIGHT_MIME);
}

/** a short link kept by this server (30 days), or null when it keeps none */
export async function shortNightLink(n: NightFile): Promise<string | null> {
  const r = await fetch("/api/night", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ night: n }),
  }).catch(() => null);
  if (!r?.ok) return null;
  const { id } = (await r.json()) as { id?: string };
  return id ? `${location.origin}/night?s=${id}` : null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // (an http origin or a denied permission: the old way)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
