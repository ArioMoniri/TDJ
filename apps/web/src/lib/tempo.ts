/** Round 21: "126 BPM · −11.5 dB" for a row — only what was measured (Deezer, the analysed preview or the DJ's) */
export function tempoLevel(s: { tempo?: { bpm: number } | null; level?: { gainDb: number } | null }): string {
  const out: string[] = [];
  if (s.tempo?.bpm) out.push(`${Math.round(s.tempo.bpm)} BPM`);
  if (typeof s.level?.gainDb === "number") out.push(`${s.level.gainDb.toFixed(1).replace("-", "−")} dB`);
  return out.join(" · ");
}
