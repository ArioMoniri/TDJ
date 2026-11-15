/**
 * Audit (and with --write, regenerate) the repo-level learned store data/knowledge/dj_preferences.json against the
 * DJ's edits of the featured night (apps/web/public/featured/golden-double-peak.json), from its git history.
 *
 * The base is the night the DJ edited: the round-19 shipped file (commit 9b969bd, the last version the engine
 * composed). Versions before it are engine recomposes (seeds 20, 181, 199): diffing the first file (3563751) against
 * the head also lists sides the engine chose in round 19 and the DJ kept inside a pinned tanda (T2's Lo Pasado, Pasó
 * and Corazón, T5's Garúa, T8's No Mientas and La Bruja, T25's Así Se Baila el Tango, the Di Sarli / Rufino family) —
 * kept, not edited, so they do not teach (teaching them also costs the round-14 peakHits ratchet). `--base=<commit>`
 * audits against any version. The current file is the head.
 *
 * What the store must carry, from the engine's own editDiff (learn.ts):
 *   - every side the DJ added (a pinned tanda's sides, the opening and the closing Cumparsita) as a chosen side;
 *   - every pinned tanda's family as a chosen family, and the pinned tanda as a DJ tanda template (a tanda pinned
 *     only to keep a slot the engine filled, "(TDJ's pick)" in its reason, teaches nothing);
 *   - moved tandas (same sides, another slot: Biagi 13 → 10, D'Arienzo 8 → 7 …) are templates, not new sides;
 *   - the DJ's one-night approvals of mixed tandas (night.exceptions: reason, matched by song ids or by rhythm +
 *     orchestras + titles): refreshed here, never templates, never a compose signal;
 *   - the night-level choices the store had no place for: the Cumparsita rule and its opening version by T1's
 *     orchestra, the closing version, the big-four quartile spread, "last 4 tandas tango", the cortina culture and
 *     the cortinas the DJ chose (`night`, shown in Database → Memory; compose does not apply them to other nights).
 * Tandas listed in --skip (default none) are
 * audited but never rewritten: their entries stay as they are in the store.
 *
 * Run: pnpm --filter @tdj/core exec tsx ../../scripts/featured_learned.ts [--base=<commit>] [--write]
 * Exits non-zero (without --write) when the store misses anything.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  editDiff,
  familyKey,
  LEARN_LIMITS,
  type LearnedPreferences,
  type NightException,
  normTitle,
  type Playlist,
  type Song,
  type Tanda,
  tandaTitleKeyOf,
  templateMix,
} from "../packages/core/src/index";
import { loadCatalog } from "../packages/core/src/load";

const ROOT = new URL("..", import.meta.url).pathname;
const FEATURED = "apps/web/public/featured/golden-double-peak.json";
const STORE = `${ROOT}data/knowledge/dj_preferences.json`;
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const BASE = arg("base") ?? "9b969bd";
const SKIP = new Set((arg("skip") ?? "").split(",").filter(Boolean).map(Number));
const write = process.argv.includes("--write");

const cat = loadCatalog(ROOT).catalog;
const byId = new Map(
  cat.songs.flatMap((s) => [[s.id, s] as const, ...(s.altIds ?? []).map((a) => [a, s] as const)]),
);
/** the first versions (round 8) list `tracks` ({ id, title, year }) per tanda: the catalogue fills in the rest */
type OldTanda = Tanda & { tracks?: Array<{ id: string }> };
const normalise = (p: Playlist): Playlist => ({
  ...p,
  tandas: (p.tandas as OldTanda[]).map((t) =>
    t.songs
      ? t
      : {
          ...t,
          songs: (t.tracks ?? []).map((x: { id: string }) => byId.get(x.id) ?? (x as unknown as Song)),
        },
  ),
  closing: p.closing ? (byId.get(p.closing.id) ?? p.closing) : p.closing,
});
const base = normalise(
  JSON.parse(
    execFileSync("git", ["show", `${BASE}:${FEATURED}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }),
  ),
);
const head = JSON.parse(readFileSync(`${ROOT}${FEATURED}`, "utf8")) as Playlist;
const raw = JSON.parse(readFileSync(STORE, "utf8")) as LearnedPreferences & { about?: string };
const store: LearnedPreferences = structuredClone(raw);
store.sides ??= {};
store.families ??= {};
store.templates ??= [];

const isCumparsita = (title: string) => /cumparsita/i.test(title);
const tid = (t: Pick<Tanda, "rhythm" | "songs">) => `${t.rhythm}:${t.songs.map((s) => s.id).join(",")}`;
const nm = (t: Tanda) => `${t.orchestra}${t.singer ? ` / ${t.singer}` : ""} ${t.rhythm}`;
const missing: string[] = [];
const added: string[] = [];
// the DJ's one-night approvals of mixed tandas (night.exceptions, data): matched by song ids, else by rhythm +
// orchestras + titles (a take may change on another branch), and refreshed from the head night
const rawEx = (raw.night?.exceptions ?? []) as NightException[];
const exceptions: NightException[] = [];
const exceptionSlots = new Set<number>();
for (const x of rawEx) {
  const i = head.tandas.findIndex(
    (t) =>
      t.pinned?.by === "dj" &&
      (tid(t) === x.tandaId ||
        (x.titles?.length &&
          tandaTitleKeyOf(t) ===
            `${x.rhythm}|${[...x.orchestraIds].sort().join("+")}|${x.titles.join(",")}`)),
  );
  if (i < 0) {
    missing.push(`exception “${x.reason}” (${x.name ?? x.tandaId}): no pinned tanda of the night matches`);
    exceptions.push(x);
    continue;
  }
  const t = head.tandas[i]!;
  exceptionSlots.add(i + 1);
  const fresh: NightException = {
    nightId: head.id,
    tandaId: tid(t),
    rhythm: t.rhythm,
    orchestraIds: [...new Set(t.songs.map((s) => s.orchestraId))],
    titles: t.songs.map((s) => normTitle(s.title)),
    reason: x.reason,
    mixed: templateMix(t.songs, t.rhythm),
    name: `${[...new Set(t.songs.map((s) => s.orchestra))].join(" + ")} · ${t.songs.map((s) => s.title).join(", ")}`,
    ...(x.at ? { at: x.at } : {}),
  };
  if (JSON.stringify(fresh) !== JSON.stringify(x)) missing.push(`exception T${i + 1} refreshed`);
  exceptions.push(fresh);
}
// a one-night exception is never a reusable template
for (const slot of exceptionSlots) {
  const id = tid(head.tandas[slot - 1]!);
  if (store.templates.some((x) => x.id === id)) {
    missing.push(`T${slot} is a one-night exception, not a template`);
    store.templates = store.templates.filter((x) => x.id !== id);
  }
}

// 1. the sides and families the DJ put in (pinned tandas; the forced follow-ups the engine chose teach nothing)
const { added: addedSides, pinned } = editDiff(base, head);
// a tanda pinned to keep a slot the engine filled ("… (TDJ's pick)" in its reason) is the engine's choice: it teaches nothing
const djChose = (t: Tanda) => t.pinned?.by === "dj" && !/TDJ's pick/i.test(t.pinned.reason ?? "");
const pinnedSlots = head.tandas.map((t, i) => (djChose(t) ? i + 1 : 0)).filter(Boolean);
const addedIds = new Set(addedSides.map((s) => s.id));
for (const slot of pinnedSlots) {
  const t = head.tandas[slot - 1]!;
  const skip = SKIP.has(slot);
  // the families of the sides the DJ put in (learnFromEdit: +1 each); a pinned tanda moved whole (no new side)
  // is a lock vote for its family (learnFromLock: +0.5)
  const news = t.songs.filter((s) => addedIds.has(s.id));
  const fams = news.length
    ? [...new Set(news.map((s) => familyKey(s)))]
    : [familyKey({ ...t.songs[0]!, rhythm: t.rhythm })];
  for (const k of fams)
    if (!(store.families[k]! > 0)) {
      missing.push(`T${slot} family ${k} (${nm(t)})`);
      if (!skip) {
        store.families[k] = Math.min(
          LEARN_LIMITS.familyMax,
          (store.families[k] ?? 0) + (news.length ? 1 : 0.5),
        );
        added.push(`family ${k}`);
      }
    }
  if (!exceptionSlots.has(slot) && !store.templates.some((x) => x.id === tid(t))) {
    missing.push(`T${slot} template ${tid(t)} (${nm(t)})`);
    if (!skip) {
      store.templates.push({
        id: tid(t),
        rhythm: t.rhythm,
        name: `${[...new Set(t.songs.map((s) => s.orchestra))].join(" + ")} · ${t.songs.map((s) => s.title).join(", ")}`,
        songIds: t.songs.map((s) => s.id),
        at: t.pinned?.at ?? raw.updatedAt ?? new Date().toISOString(),
      });
      added.push(`template T${slot}`);
    }
  }
}
// a side the DJ added: in a pinned tanda (moved sides are neither added nor removed), the opening, the closing
const pinnedIds = new Set(
  head.tandas.flatMap((t, i) => (djChose(t) ? t.songs.map((s) => `${i + 1}:${s.id}`) : [])),
);
const slotOf = (id: string) => head.tandas.findIndex((t) => t.songs.some((s) => s.id === id)) + 1;
for (const s of addedSides) {
  const slot = slotOf(s.id);
  const dj = pinnedIds.has(`${slot}:${s.id}`) || s.id === head.opening?.id || s.id === head.closing?.id;
  if (!dj) continue;
  if (!(store.sides[s.id]! > 0)) {
    missing.push(`side ${s.id} “${s.title}” ${s.orchestra}${slot ? ` (T${slot})` : ""}`);
    if (!SKIP.has(slot)) {
      store.sides[s.id] = 1;
      added.push(`side ${s.id}`);
    }
  }
}
// moved tandas: the same sides in another slot (the template carries them)
const baseAt = new Map(base.tandas.map((t, i) => [tid(t), i + 1]));
const moved = head.tandas
  .map((t, i) => ({ from: baseAt.get(tid(t)), to: i + 1, t }))
  .filter((m) => m.from && m.from !== m.to)
  .map((m) => `${nm(m.t)} T${m.from} → T${m.to}`);
// tandas whose family stayed while the slot changed (D'Arienzo 8 → 7 style): reported for the spec
const famAt = (p: Playlist) => p.tandas.map((t) => familyKey({ ...t.songs[0]!, rhythm: t.rhythm }));
const fb = famAt(base);
const shifted = famAt(head)
  .map((k, i) => ({ k, to: i + 1, from: fb.indexOf(k) + 1 }))
  .filter((x) => x.from && x.from !== x.to && !fb.slice(x.to - 1, x.to).includes(x.k))
  .map((x) => `${x.k} T${x.from} → T${x.to}`);

// 2. the night-level choices
const cortinaOf = (p: Playlist) => p.tandas.map((t) => t.cortina?.title).filter((x): x is string => !!x);
const night = {
  cumparsita: head.options.rules?.cumparsita ?? "both",
  openingCumparsita: head.opening
    ? {
        id: head.opening.id,
        orchestraId: head.opening.orchestraId,
        matchesFirstTanda: head.opening.orchestraId === head.tandas[0]?.orchestraId,
      }
    : null,
  closingCumparsita:
    head.closing && isCumparsita(head.closing.title)
      ? { id: head.closing.id, orchestraId: head.closing.orchestraId }
      : null,
  bigFourQuartiles: head.options.tandaRules?.bigFour !== false,
  lastFourTango: true,
  cortinaCultures: head.options.cortinaCultures ?? [],
  cortinas: cortinaOf(head),
  exceptions,
};
const prevNight = (raw as { night?: typeof night }).night;
for (const [k, v] of Object.entries(night))
  if (JSON.stringify(prevNight?.[k as keyof typeof night]) !== JSON.stringify(v)) missing.push(`night.${k}`);
if (!head.options.rules?.lastFourTango)
  console.error(
    "note: the featured file's own options do not set rules.lastFourTango; the store records the DJ's rule (night.lastFourTango)",
  );

console.log(
  JSON.stringify(
    {
      base: BASE,
      pinnedSlots,
      pinnedTemplates: pinned.length,
      moved,
      shifted,
      newCortinas: cortinaOf(head).filter((c) => !cortinaOf(base).includes(c)),
      skipped: [...SKIP],
      missing,
      added: write ? added : undefined,
    },
    null,
    1,
  ),
);
if (write) {
  const about =
    "What TDJ learned from the DJ's edits of the featured night (packages/core/src/learn.ts): the repo-level store every composed night reads under the DJ's own memory (Database → Memory lists it; the DJ can weigh, delete or switch it off, recorded in the DJ's memory). `night` records the night-level choices; compose does not apply them to other nights. Audit / regenerate with scripts/featured_learned.ts.";
  const { about: _a, ...rest } = store as typeof store & { about?: string };
  writeFileSync(STORE, `${JSON.stringify({ about, ...rest, night }, null, 1)}\n`);
} else if (missing.length) process.exit(1);
