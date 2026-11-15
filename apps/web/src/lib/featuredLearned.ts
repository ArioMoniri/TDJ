import {
  applyRepoOverrides,
  type FeaturedNightChoices,
  type LearnedPreferences,
  type LearnedRule,
  learnedRules,
  type RepoLearnedOverrides,
} from "@tdj/core";
import { t } from "@/lib/i18n";

/**
 * Database → Memory / Settings: "Learned from your edits to the featured night" — the repo-level store
 * (data/knowledge/dj_preferences.json, served by /api/meta as `featuredLearned`) as rules the DJ can weigh, delete or
 * switch off. Every change is an override kept in the DJ's memory (`AgentMemory.repoLearned`), sent with each request
 * (learnedForRequest) and applied by mergeLearned; the repo file is never edited at runtime.
 */

/** the store's rules as the DJ left them (deleted ones gone, reweighted ones at the DJ's weight) */
export function featuredRuleList(
  store: LearnedPreferences | null | undefined,
  repo: RepoLearnedOverrides | undefined,
  nameOf?: (orchestraId: string) => string,
  songOf?: Parameters<typeof learnedRules>[2],
): LearnedRule[] {
  const L = applyRepoOverrides(store, { ...(repo ?? {}), off: false });
  return learnedRules(L, nameOf, songOf).map((r) => ({ ...r, source: "edits" as const }));
}

export const featuredOn = (repo: RepoLearnedOverrides | undefined) => !repo?.off;

export const setFeaturedOn = (repo: RepoLearnedOverrides | undefined, on: boolean): RepoLearnedOverrides => ({
  ...(repo ?? {}),
  off: !on,
});

/** the DJ set a rule's weight (a template at 0 or below is deleted) */
export function weighFeatured(
  repo: RepoLearnedOverrides | undefined,
  id: string,
  weight: number,
): RepoLearnedOverrides {
  if (id.startsWith("template:") && weight <= 0) return forgetFeatured(repo, id);
  return { ...(repo ?? {}), weights: { ...(repo?.weights ?? {}), [id]: weight } };
}

/** the DJ deleted a rule (recorded as an override; the store keeps it) */
export function forgetFeatured(repo: RepoLearnedOverrides | undefined, id: string): RepoLearnedOverrides {
  const { [id]: _w, ...weights } = repo?.weights ?? {};
  return { ...(repo ?? {}), weights, deleted: [...new Set([...(repo?.deleted ?? []), id])] };
}

/** every override undone: the store as the featured night taught it (on/off stays as it is) */
export const restoreFeatured = (repo: RepoLearnedOverrides | undefined): RepoLearnedOverrides => ({
  ...(repo?.off ? { off: true } : {}),
});

/** the featured night's night-level choices in plain words (shown; compose does not apply them to other nights) */
export function featuredNightLines(
  n: FeaturedNightChoices | undefined,
  nameOf: (id: string) => string,
): string[] {
  if (!n) return [];
  const out: string[] = [];
  if (n.openingCumparsita)
    out.push(
      t("featuredLearned.opening_cumparsita", {
        orchestra: nameOf(n.openingCumparsita.orchestraId),
      }),
    );
  if (n.closingCumparsita)
    out.push(t("featuredLearned.closing_cumparsita", { orchestra: nameOf(n.closingCumparsita.orchestraId) }));
  if (n.bigFourQuartiles) out.push(t("featuredLearned.big_four"));
  if (n.lastFourTango) out.push(t("featuredLearned.last_four_tango"));
  if (n.cortinaCultures?.length)
    out.push(
      t("featuredLearned.cortinas", {
        cultures: n.cortinaCultures.join(", "),
        count: n.cortinas?.length ?? 0,
      }),
    );
  return out;
}
