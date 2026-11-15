import { lazy, t } from "@/lib/i18n";

/**
 * Wave 2 — one name, one era label and one length for a night, wherever it shows (History, Share, the result header,
 * the featured card, the sidebar). Before, one night read "Sunday milonga", "Milonga · 4 h · Golden Age" and
 * "Golden 1935–45"; the era "Golden Age 35–55" and "Golden age"; and "4 h" for a night that runs 4 h 36.
 */
export const ERA_NAME: Record<string, string> = lazy(() => ({
  golden: t("nightName.golden_age"),
  "golden-extended": t("nightName.golden_age_extended"),
  "guardia-vieja": t("nightName.guardia_vieja"),
  "post-golden": t("nightName.post_golden"),
  nuevo: t("nightName.nuevo"),
  contemporary: t("nightName.contemporary"),
  all: t("nightName.all_eras"),
}));
/** the era label: "Golden Age", "Nuevo"… */
export const eraName = (era: string | undefined | null) =>
  ERA_NAME[era ?? "golden"] ?? era ?? t("nightName.golden_age");

/** the night's actual length: "4 h 36 min", "3 h", "45 min" (rounded to the minute) */
export function lengthText(sec: number | null | undefined): string {
  const m = Math.max(0, Math.round((sec ?? 0) / 60));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return t("nightName.min", { r });
  return r ? t("nightName.h_min", { h, r }) : t("nightName.h", { h });
}

/** a planned length ("4 h", "2½ h") for controls and auto-names before a night exists */
export const hoursText = (h: number) =>
  t("nightName.h", { h: Number.isInteger(h) ? h : `${h}`.replace(".5", "½") });

interface Named {
  name?: string | null;
  options: { eras?: string[]; hours?: number };
  stats?: { durationSec?: number } | null;
}
/** the night's title: its name without the details older names carried after " · " */
export function nightTitle(p: Named): string {
  const n = (p.name ?? "").split(" · ")[0]?.trim();
  return n || t("nightName.tonight_s_milonga");
}
/** "4 h 36 min · Golden Age": the line under the title */
export function nightSub(p: Named): string {
  const len = p.stats?.durationSec ? lengthText(p.stats.durationSec) : hoursText(p.options.hours ?? 4);
  return `${len} · ${eraName(p.options.eras?.[0])}`;
}
