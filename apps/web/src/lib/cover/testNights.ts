/**
 * Random nights shaped like the engine's Playlist (only what a cover reads), for the cover tests and the contact
 * sheet (scripts/cover-samples.ts). Seeded, so a failing case can be replayed.
 */
export function randomNight(seed: number) {
  let a = seed >>> 0 || 1;
  const rand = () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const n = 12 + Math.floor(rand() * 16);
  const shape = rand();
  const rhythms = ["tango", "tango", "vals", "tango", "tango", "milonga"];
  const tandas = Array.from({ length: n }, (_, i) => {
    const x = i / Math.max(1, n - 1);
    // a few arc shapes: two peaks, one peak, a plateau, a slow climb
    const base =
      shape < 0.3
        ? 50 + 25 * Math.sin(x * Math.PI * 2 - 1)
        : shape < 0.55
          ? 40 + 40 * Math.sin(x * Math.PI)
          : shape < 0.8
            ? 60 + 10 * Math.sin(x * 9)
            : 35 + 45 * x;
    return {
      index: i,
      rhythm: rhythms[(i + Math.floor(rand() * 2)) % rhythms.length]!,
      energy: Math.max(0, Math.min(100, base + (rand() - 0.5) * 20)),
      durationSec: 600 + Math.floor(rand() * 200),
      songs: Array.from({ length: 4 }, (_, k) => ({ id: `s${seed}-${i}-${k}-${Math.floor(rand() * 1e6)}` })),
      cortina: { id: `c${Math.floor(rand() * 40)}` },
    };
  });
  return {
    id: `night-${seed}`,
    name: `Night ${seed}`,
    options: { eras: ["golden"], hours: 4, seed },
    stats: { durationSec: tandas.reduce((s, t) => s + t.durationSec, 0) },
    tandas,
    opening: null,
    closing: { id: "cumparsita-1" },
  };
}
