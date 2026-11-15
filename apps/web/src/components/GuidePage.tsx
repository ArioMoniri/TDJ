"use client";
import { ExternalLink } from "lucide-react";
import { Group, Row } from "@/components/Form";
import { GuideBody } from "@/components/GuideSections";
import { Tip } from "@/components/ui/Tip";
import { EVIDENCE_COLOR, EVIDENCE_LABEL, fmtShift } from "@/lib/context";
import { t, tSource } from "@/lib/i18n";

/** the research model's factors as the Guide lists them (lib/api/catalog.ts `contextModel`) */
interface ContextModelLike {
  factors: Array<{
    id: string;
    label: string;
    options: Array<{
      id: string;
      label: string;
      notes?: string;
      evidence?: string;
      energyShift?: number;
      valsShare?: number | null;
      milongaShare?: number | null;
      cortinaGenres?: string[];
    }>;
  }>;
}

/**
 * Wave 3: the Guide renders on the client, in the DJ's language (the page only reads the research model on the
 * server). The model's labels are translated where the dictionary has the words; its research notes stay as written
 * (marked lang="en").
 */
const REPO = "https://github.com/ArioMoniri/TDJ/blob/main";

export function GuidePage({ contextModel }: { contextModel: ContextModelLike | null | undefined }) {
  const rows: Array<[string, string]> = [
    [t("guide.tanda"), t("guide.3_4_recordings_of_one_orchestra")],
    [t("guide.cycle"), t("guide.ttvttm_two_tango_tandas_a_vals")],
    [t("guide.energy_arc"), t("guide.warm_up_fresedo_di_sarli_canaro")],
    [t("guide.inside_a_tanda"), t("guide.default_shape_slow_start_climb_strongest")],
    [t("guide.cortina"), t("guide.30_60_s_of_non_tango")],
    [t("guide.score"), t("guide.the_score_reads_a_night_the")],
  ];
  const takes: Array<[string, string]> = [
    [t("guide.musical"), t("guide.one_orchestra_one_voice_a_tight")],
    [t("guide.structural"), t("guide.the_ttvttm_cycle_two_peaks_across")],
    [t("guide.floor"), t("guide.who_is_dancing_level_age_ratio")],
    [t("guide.context"), t("guide.season_weather_room_temperature_time_slot")],
    [t("guide.technical"), t("guide.every_song_found_in_your_music")],
  ];
  const slug = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const toSections = (items: Array<[string, string]>) =>
    items.map(([k, v]) => ({ id: slug(k), title: k, text: v }));
  return (
    <article className="mx-auto max-w-[680px]">
      <GuideBody
        title={t("guide.guide")}
        subtitle={t("guide.how_t_dj_works_in_a")}
        rows={toSections(rows)}
        takes={toSections(takes)}
      />
      <Group header={t("guide.read_more")} titleHeader>
        <Row
          label={t("guide.factors_with_sources")}
          chevron={false}
          href={`${REPO}/docs/ENHANCEMENTS.md#3-factors-a-great-milonga-set-takes-into-account`}
          className="text-[var(--tint)]"
        >
          <ExternalLink size={14} strokeWidth={2} className="cell-chevron" aria-hidden />
        </Row>
        <Row
          label={t("guide.rules_the_dj_follows")}
          chevron={false}
          href={`${REPO}/docs/AGENT_GUIDE.md`}
          className="text-[var(--tint)]"
        >
          <ExternalLink size={14} strokeWidth={2} className="cell-chevron" aria-hidden />
        </Row>
      </Group>
      {contextModel && (
        <>
          <h2 className="text-title3 mt-8 px-4">{t("guide.context_factors")}</h2>
          <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">
            {t("guide.what_tonight_does_livens_the_night")}
          </p>
          {contextModel.factors.map((f) => (
            <Group key={f.id} header={tSource(f.label)}>
              {f.options.map((o) => {
                const bits = [
                  fmtShift(o.energyShift) && t("guide.bit_energy", { v: fmtShift(o.energyShift) }),
                  o.valsShare != null && t("contextStrip.vals_2", { v: Math.round(o.valsShare * 100) }),
                  o.milongaShare != null &&
                    t("contextStrip.milonga_2", { m: Math.round(o.milongaShare * 100) }),
                  o.cortinaGenres?.length &&
                    t("guide.bit_cortinas", { list: o.cortinaGenres.slice(0, 3).join(", ") }),
                ].filter(Boolean);
                return (
                  <div key={o.id} className="cell items-start">
                    <Tip text={EVIDENCE_LABEL[o.evidence ?? "speculative"]} className="mt-2 shrink-0">
                      <span
                        className="block h-2 w-2 rounded-full"
                        style={{ background: EVIDENCE_COLOR[o.evidence ?? "speculative"] }}
                        role="img"
                        aria-label={EVIDENCE_LABEL[o.evidence ?? "speculative"]}
                      />
                    </Tip>
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {tSource(o.label)}
                        {bits.length > 0 && (
                          <span className="text-subhead text-[var(--label-2)]"> · {bits.join(" · ")}</span>
                        )}
                      </span>
                      {o.notes && (
                        <span className="text-footnote block text-[var(--label-2)]" lang="en">
                          {o.notes}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </Group>
          ))}
          <p className="section-foot mt-3">
            {t("guide.dot", {
              p1: " ",
              p2: Object.entries(EVIDENCE_LABEL)
                .map(([, l]) => l)
                .join(" · "),
            })}
          </p>
        </>
      )}
    </article>
  );
}
