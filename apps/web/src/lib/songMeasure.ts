"use client";
import { t } from "./i18n";
import { measureBufferTiming, useMarks, withMeasurement } from "./songMarks";
import type { Song } from "./types";

/**
 * 2026-11 — "Measure from your file" outside the Booth (Compose, Library, Database, search, History, Rooms): the
 * side's file from the DJ's linked music folder (the Booth's LocalAdapter class, our own instance — the Booth's is
 * not touched), decoded off any graph and measured like the Booth's sheet does. Resolves to why not, or null.
 */
type Local = {
  restore: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  fileFor: (id: string) => Promise<File | null>;
  permission: string;
};
let local: Promise<Local | null> | null = null;
const folder = () => {
  local ??= import("./booth/sources/local")
    .then(async (m) => {
      const a = new m.LocalAdapter(() => null) as unknown as Local;
      await a.restore();
      return a;
    })
    .catch(() => {
      local = null;
      return null;
    });
  return local;
};

export async function measureFromFolder(song: Song): Promise<string | null> {
  const a = await folder();
  if (!a) return t("song.measure_needs_file");
  // (a click is the gesture the folder's permission asks for)
  if (a.permission === "prompt" && !(await a.requestPermission().catch(() => false)))
    return t("song.measure_needs_file");
  const f = await a.fileFor(song.id).catch(() => null);
  if (!f) return t("song.measure_needs_file");
  const W = window as unknown as {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  };
  const Off = W.OfflineAudioContext ?? W.webkitOfflineAudioContext;
  if (!Off) return t("song.measure_nothing");
  let buffer: AudioBuffer;
  try {
    buffer = await new Off(1, 1, 44100).decodeAudioData(await f.arrayBuffer());
  } catch (x) {
    return `${t("song.measure_nothing")} (${x instanceof Error ? x.message : String(x)})`;
  }
  const m = measureBufferTiming(buffer, {
    bpm: song.tempo?.bpm ?? song.audio?.bpm ?? song.deezer?.bpm ?? song.bpm ?? null,
    rhythm: song.rhythm,
  });
  if (!m) return t("song.measure_nothing");
  useMarks.getState().set(song.id, withMeasurement(useMarks.getState().marks[song.id], m));
  return null;
}
