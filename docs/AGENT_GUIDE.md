# Agent guide: composing or reviewing a milonga set with TDJ

Who this is for: the AI DJ inside the app (`/api/ai/review`, `/api/ai/refine`), Claude Code sessions working on the engine, and human DJs who want to know what the machine assumes.

## 1. Load the knowledge
- `data/index/songs.json` (21,932 recordings, `yearApprox`, `rhythmOriginal`, notes for medleys/solo piano).
- `data/knowledge/orchestra_profiles.json` (44 profiles: energy, style, phases, notBefore/notAfter, maxPerNight, singers with years, tier, nonDanceTitles).
- `data/knowledge/track_energy.json` (338 famous recordings with intensity 0–100).
- `data/knowledge/reference_sets.json` (31 reference sets, 218 canonical tandas, 1,078 famous recordings with fame/role, 134 blacklisted titles).
- `data/knowledge/context_factors.json` (18 situational factors, evidence-graded) and `cortinas.json`.
- The condensed rule set is exported as `DJ_RULES` from `@tdj/core` (packages/core/src/rules.ts) and must be the system prompt of any AI reviewer.

## 2. Compose (what the engine does, in order)
1. Sanitise options; resolve context (season, weather, room, time, event, crowd, region, holiday, mood) into energy/tempo/share shifts.
2. Plan slots for the hours (TTVTTM, 4-3-3), assign a two-peak target curve, lift the última.
3. For every slot pick an orchestra family (one orchestra, one singer or instrumental, ≤4-year window) by sampling among the six best-weighted candidates. Weights: energy fit, phase affinity (hard phase filter), style per phase, tier, canonical-tanda match, fame, curator flag, singer canon share, placement median, opener bank for slot 0, vals/milonga banks, D'Arienzo-early rule, per-night caps (Pugliese once), Guardia Vieja ≤1 in the first 40 %, context prefer/avoid styles, repeat gap.
4. Pick 4 (or 3) recordings: danceable only (blacklist + profile nonDanceTitles), no title repeats, canonical titles and famous recordings first, then shape the tanda (slow → up → strongest → settle, or hammock).
5. Última tanda: vocal tango from a known orchestra (or Pugliese/D'Arienzo/Di Sarli instrumental), energy ≥ 62. La Cumparsita from a version DJs actually close with (D'Arienzo 1951, Troilo 1963…), never the última's orchestra.
6. Cortinas: one family for the night, never repeated while unused clips exist, each ~8 points below the next tanda; no cortina after the Cumparsita. Cortina lengths flex 25–60 s to land the requested duration.
7. Score with the rubric (docs/BENCHMARK.md). Unknown BPM and transfer data score low on purpose.

## 3. Review (what to check, in order)
Hard fails: mixed orchestra/rhythm/vocal in a tanda; vals next to milonga; Pugliese before 50 % or twice; concert piece or medley; same orchestra within 6 tandas (except a standalone Cumparsita); first tanda not tango; última not tango.
Soft checks: opener from the opener bank and 1935–43 material; first D'Arienzo early and instrumental 1935–39; Canaro/Lomuto in the first third; De Angelis/Fresedo later; Di Sarli 1950s instrumentals as late reset; singer canon per orchestra; cortina family consistency; energy steps ≤ 14 between tandas; context applied (heat → lower peaks and fewer milongas).
Say what to swap by tanda number and why, in dancer language. Never praise the score itself.

## 4. Refine (turning feedback into changes)
Map floor feedback to options: "more energetic" → floorMood energetic + mood energetic; "calmer" → balanced/romantic; "more vals" → custom pattern TTVTTMTTV; "warmer start" → gentle arc; "fewer repeats" → larger orchestra gap; "shorter cortinas" → −15 s; orchestra dislikes → excludeOrchestras; "no Pugliese tonight" → excludeOrchestras osvaldo-pugliese; "keep tanda 9" → locked. Return strict JSON `{ options, feedback, note }`.

## 5. Caveats
Reference sets are UK/EU/US set-blogs; Buenos Aires practice enters through the Weigel play-count survey and the musicology notes. Energy values are priors until BPM/key detection lands (roadmap Phase 1). The scorer is a grade, not a verdict: a human ear still decides openers, transitions and transfers.
