import { ExternalLink } from "lucide-react";
import { Group, Row } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { EVIDENCE_COLOR, EVIDENCE_LABEL, fmtShift } from "@/lib/context";
import { getCatalog } from "@/lib/server/catalog";

const REPO = "https://github.com/ArioMoniri/TDJ/blob/main";

export default function Guide() {
  const { contextModel } = getCatalog();
  const rows: Array<[string, string]> = [
    [
      "Tanda",
      "3–4 recordings of one orchestra, one singer (or all instrumental), recorded within ~4 years. Tango tandas have 4; vals and milonga 3.",
    ],
    [
      "Cycle",
      "TTVTTM: two tango tandas, a vals tanda, two tango tandas, a milonga tanda. Vals and milonga never touch.",
    ],
    [
      "Energy arc",
      "Warm-up (Fresedo, Di Sarli, Canaro) → build (Caló, Tanturi, Troilo) → peaks (D'Arienzo, Biagi, Rodríguez, Donato) → Pugliese late → cool-down → La Cumparsita.",
    ],
    [
      "Inside a tanda",
      "Default shape: slow start, climb, strongest third, settle on the fourth so the floor exits gracefully. Hammock (Buenos Aires): announce with a hit, dip, close strongest.",
    ],
    [
      "Cortina",
      "30–60 s of non-tango music that clears the floor and cues the next tanda; TDJ picks each one ~8 energy points below the tanda that follows.",
    ],
    [
      "Score",
      "The benchmark checks integrity, singer and era coherence, spacing, variety, arc fit, cortina discipline and the ending. 85 or more is headline marathon DJ territory.",
    ],
  ];
  const takes: Array<[string, string]> = [
    [
      "Musical",
      "One orchestra, one voice, a tight year window, energy that rises and settles; the right recording of a title, not just the title.",
    ],
    [
      "Structural",
      "The TTVTTM cycle, two peaks across the night, orchestras spaced out, a última tanda that sends people home singing.",
    ],
    [
      "Floor",
      "Who is dancing: level, age, ratio of roles, how full the room is, and when it empties. Milongueros and beginners want different Biagi.",
    ],
    [
      "Context",
      "Season, weather, room temperature, time slot, event type, holiday and region all move the energy, the vals and milonga share, and the cortina flavour.",
    ],
    [
      "Technical",
      "Real file paths, correct durations, cortinas that cue in cleanly, exports your DJ app can read without a fight.",
    ],
  ];
  const article = (items: Array<[string, string]>) =>
    items.map(([k, v]) => (
      <div key={k} className="cell flex-col items-stretch gap-1 py-3">
        <span className="text-headline">{k}</span>
        <span className="text-body text-[var(--label-2)]">{v}</span>
      </div>
    ));
  return (
    <article className="mx-auto max-w-[680px]">
      <PageHeader
        title="How TDJ composes"
        subtitle="Rules from working DJs and the research behind the index."
      />
      <Group className="mt-2">{article(rows)}</Group>
      <h2 className="text-title3 mt-8 px-4">What a great set takes into account</h2>
      <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">
        Five layers, from the notes inside a tanda to the booth.
      </p>
      <Group>{article(takes)}</Group>
      <Group header="Read more">
        <Row
          label="Factors, with sources"
          chevron={false}
          href={`${REPO}/docs/ENHANCEMENTS.md#3-factors-a-great-milonga-set-takes-into-account`}
          className="text-[var(--tint)]"
        >
          <ExternalLink size={14} strokeWidth={2} className="cell-chevron" aria-hidden />
        </Row>
        <Row
          label="Rules the DJ follows"
          chevron={false}
          href={`${REPO}/docs/AGENT_GUIDE.md`}
          className="text-[var(--tint)]"
        >
          <ExternalLink size={14} strokeWidth={2} className="cell-chevron" aria-hidden />
        </Row>
      </Group>
      {contextModel && (
        <>
          <h2 className="text-title3 mt-8 px-4">Context factors</h2>
          <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">
            What “Tonight” does. Shifts are energy points; vals and milonga are the share of the night.
          </p>
          {contextModel.factors.map((f) => (
            <Group key={f.id} header={f.label}>
              {f.options.map((o) => {
                const bits = [
                  fmtShift(o.energyShift) && `energy ${fmtShift(o.energyShift)}`,
                  o.valsShare != null && `vals ${Math.round(o.valsShare * 100)}%`,
                  o.milongaShare != null && `milonga ${Math.round(o.milongaShare * 100)}%`,
                  o.cortinaGenres?.length && `cortinas ${o.cortinaGenres.slice(0, 3).join(", ")}`,
                ].filter(Boolean);
                return (
                  <div key={o.id} className="cell items-start">
                    <span
                      className="mt-2 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: EVIDENCE_COLOR[o.evidence ?? "speculative"] }}
                      title={EVIDENCE_LABEL[o.evidence ?? "speculative"]}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {o.label}
                        {bits.length > 0 && (
                          <span className="text-subhead text-[var(--label-2)]"> · {bits.join(" · ")}</span>
                        )}
                      </span>
                      {o.notes && (
                        <span className="text-footnote block text-[var(--label-2)]">{o.notes}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </Group>
          ))}
          <p className="section-foot mt-3">
            Dot:{" "}
            {Object.entries(EVIDENCE_LABEL)
              .map(([, l]) => l)
              .join(" · ")}
          </p>
        </>
      )}
    </article>
  );
}
