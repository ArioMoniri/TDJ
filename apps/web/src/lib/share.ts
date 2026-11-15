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
import { coverSeedFor } from "./cover/entrySeed";
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

/** a web origin others can open: inside the apps the page lives at tauri://localhost, which nobody else can reach */
function webOrigin(): string | null {
  return /^https?:$/.test(location.protocol) ? location.origin : null;
}

export async function shareNight(p: Playlist): Promise<NightShare> {
  // wave 4: the cover family travels with the night, so the link preview and the .tdjnight show the same cover
  const night: NightFile & { coverSeed?: string } = { ...exportNight(p), coverSeed: coverSeedFor(p) };
  try {
    const payload = await encodeNightPayload(night);
    return {
      night,
      link: webOrigin() ? nightLink(webOrigin() as string, payload) : null,
      appLink: appNightLink(payload),
      linkError: null,
    };
  } catch (e) {
    return { night, link: null, appLink: null, linkError: (e as Error).message };
  }
}

/** Saves the night as a `.tdjnight` file; returns the text that was saved (the caller reads it back). */
export function saveNightFile(n: NightFile): string {
  const text = nightFileText(n);
  downloadBlob(nightFileName(n.name), text, NIGHT_MIME);
  return text;
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
  const origin = webOrigin();
  return id && origin ? `${origin}/night?s=${id}` : null;
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
