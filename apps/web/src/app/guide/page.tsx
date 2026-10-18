export default function Guide() {
  const rows: Array<[string, string]> = [
    ["Tanda", "3–4 recordings of one orchestra, one singer (or all instrumental), recorded within ~4 years. Tango tandas have 4; vals and milonga 3."],
    ["Cycle", "TTVTTM: two tango tandas, a vals tanda, two tango tandas, a milonga tanda. Vals and milonga never touch."],
    ["Energy arc", "Warm-up (Fresedo, Di Sarli, Canaro) → build (Caló, Tanturi, Troilo) → peaks (D'Arienzo, Biagi, Rodríguez, Donato) → Pugliese late → cool-down → La Cumparsita."],
    ["Inside a tanda", "Default shape: slow start, climb, strongest third, settle on the fourth so the floor exits gracefully. Hammock (BsAs): announce with a hit, dip, close strongest."],
    ["Cortina", "30–60 s of non-tango music that clears the floor and cues the next tanda; TDJ picks each one ~8 energy points below the tanda that follows."],
    ["Score", "The benchmark rubric (docs/BENCHMARK.md) checks integrity, singer and era coherence, spacing, variety, arc fit, cortina discipline and the ending. ≥85 = headline marathon DJ."],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="glass p-5"><h1 className="font-serif text-3xl font-semibold">How TDJ composes</h1><p className="text-muted mt-1 text-sm">The rules below come from working DJs and the research notes in docs/research.</p></div>
      {rows.map(([k, v]) => <div key={k} className="glass p-4"><div className="text-xs font-bold uppercase tracking-wider text-rose-400">{k}</div><p className="mt-1 text-sm leading-relaxed">{v}</p></div>)}
    </div>
  );
}
