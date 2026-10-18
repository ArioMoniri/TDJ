/** Deterministic PRNG (mulberry32) so a seed reproduces the same playlist. */
export function makeRng(seed = Date.now() % 2147483647) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick<T>(arr: readonly T[]): T | undefined { return arr.length ? arr[Math.floor(next() * arr.length)] : undefined; },
    shuffle<T>(arr: T[]): T[] { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j]!, a2[i]!]; } return a2; },
    /** weighted pick, weights >= 0 */
    weighted<T>(arr: readonly T[], w: (t: T) => number): T | undefined {
      let total = 0; const ws = arr.map((t) => { const x = Math.max(0, w(t)); total += x; return x; });
      if (!arr.length || total <= 0) return undefined;
      let r = next() * total;
      for (let i = 0; i < arr.length; i++) { r -= ws[i]!; if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    },
  };
}
export type Rng = ReturnType<typeof makeRng>;
