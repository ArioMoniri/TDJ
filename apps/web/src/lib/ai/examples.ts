import { lazy, t } from "@/lib/i18n";
/**
 * Wave 2 — the examples the edit bar offers (its placeholder and chips): each one works on a freshly composed night
 * (ai/words.test.ts checks them on several seeds). A whole-night request ("more vals please") runs its Adjust chip.
 */
export const EDIT_EXAMPLES = lazy(() => [
  t("ai.examples.make_tanda_7_calmer"),
  t("ai.examples.swap_the_last_song_of_tanda"),
  t("ai.examples.lock_the_first_tanda"),
]);
