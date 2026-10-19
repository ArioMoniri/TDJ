import { BookOpenText, ExternalLink } from "lucide-react";
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
      "Default shape: slow start, climb, strongest third, settle on the fourth so the floor exits gracefully. Hammock (BsAs): announce with a hit, dip, close strongest.",
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
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="surface p-5 sm:p-6">
        <h1 className="font-serif text-3xl font-semibold">How TDJ composes</h1>
        <p className="text-muted mt-1 text-sm">
          The rules below come from working DJs and the research behind the index.
        </p>
      </div>
      <div className="surface p-5 sm:p-6">
        <dl className="divide-y divide-[rgb(var(--text)/.08)]">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="tone-tango text-xs font-bold uppercase tracking-wider sm:pt-0.5">{k}</dt>
              <dd className="text-sm leading-relaxed">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="surface p-5 sm:p-6">
        <h2 className="font-semibold">What a great set takes into account</h2>
        <p className="text-muted mt-1 text-sm">
          Five layers, from the notes inside a tanda to the booth. The full list with sources is in the
          enhancements backlog.
        </p>
        <dl className="mt-3 divide-y divide-[rgb(var(--text)/.08)]">
          {takes.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className="tone-vals text-xs font-bold uppercase tracking-wider sm:pt-0.5">{k}</dt>
              <dd className="text-sm leading-relaxed">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`${REPO}/docs/ENHANCEMENTS.md#3-factors-a-great-milonga-set-takes-into-account`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost text-sm"
          >
            <ExternalLink size={14} /> Factors, with sources
          </a>
          <a
            href={`${REPO}/docs/AGENT_GUIDE.md`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost text-sm"
          >
            <BookOpenText size={14} /> Rules the DJ follows
          </a>
        </div>
      </div>
      {contextModel && (
        <div className="surface p-5 sm:p-6">
          <h2 className="font-semibold">Context factors</h2>
          <p className="text-muted mt-1 text-sm">
            What “Tonight” on the composer does. Shifts are in energy points; vals and milonga are the share
            of the night; the dot shows how solid the evidence is.
          </p>
          <ul className="text-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {Object.entries(EVIDENCE_LABEL).map(([k, l]) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: EVIDENCE_COLOR[k] }}
                  aria-hidden
                />{" "}
                {l}
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-4">
            {contextModel.factors.map((f) => (
              <section key={f.id}>
                <h3 className="text-sm font-semibold">{f.label}</h3>
                <ul className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {f.options.map((o) => {
                    const bits = [
                      fmtShift(o.energyShift) && `energy ${fmtShift(o.energyShift)}`,
                      o.valsShare != null && `vals ${Math.round(o.valsShare * 100)}%`,
                      o.milongaShare != null && `milonga ${Math.round(o.milongaShare * 100)}%`,
                      o.cortinaGenres?.length && `cortinas ${o.cortinaGenres.slice(0, 3).join(", ")}`,
                    ].filter(Boolean);
                    return (
                      <li key={o.id} className="flex items-baseline gap-2 text-sm">
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: EVIDENCE_COLOR[o.evidence ?? "speculative"] }}
                          title={EVIDENCE_LABEL[o.evidence ?? "speculative"]}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{o.label}</span>
                          {bits.length > 0 && <span className="text-muted"> · {bits.join(" · ")}</span>}
                          {o.notes && (
                            <span className="text-muted block text-xs leading-snug">{o.notes}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
