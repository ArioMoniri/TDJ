"use client";
import { singerDisplay } from "@tdj/core";
import { ArrowDown, ArrowUp, Check, LoaderCircle, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { haptic } from "@/lib/haptics";
import { t as tx } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import { fmtLen } from "@/lib/lengths";
import type { Version } from "@/lib/smartSearch";
import { commitEdit, spotCall, useInsert } from "@/lib/spot";
import { useStore } from "@/lib/store";
import { addSide, checkDraft, type DraftSide, draftOk, moveSide, removeSide } from "@/lib/tandaDraft";
import type { Playlist, Song, Tanda } from "@/lib/types";
import { useSmartSearch } from "@/lib/useSmartSearch";
import { yearText } from "@/lib/year";
import { Group, RhythmTile, Row } from "./Form";
import { Sheet } from "./Sheet";
import { SmartSearchField, SmartSearchResults } from "./ui/SmartSearch";
import { rhythmWord, TandaTypeBadge } from "./ui/TandaTypeBadge";

/**
 * 2026-11 (the owner: "songs and tandas should be insertable or removable in each tanda and before / after tandas, by
 * AI and manually"): the Insert sheet, one for every screen (mounted in the layout, opened through lib/spot.ts
 * `openInsert` with the night, the spot and the host's apply). For a side at a place in a tanda, or a whole tanda
 * before / after another:
 *  (a) Suggested — the engine's candidates ranked for that exact spot, each with its one-line why (a side of the
 *      tanda's family at the energy and tempo of its neighbours; a tanda at the energy the arc wants there, the rhythm
 *      cycle, the big-four spread and the repeat gaps);
 *  (b) Search — the shared smart search (catalogue and connected services): Add puts a side in at the spot, or into
 *      the tanda being built (then reorder, remove, "Insert tanda");
 *  (c) Ask my AI — the DJ's model chooses among the candidates with the night and the spot as context.
 * Every insert goes through the rule check (a broken rule asks first) and the undo history, then the guide says what
 * it did to the night (components/EditGuide.tsx).
 */

interface SpotSide {
  ok: boolean;
  reason?: string;
  fit: number;
  why: string;
  song: Song;
}
interface TandaOption {
  playlist: Playlist;
  why: string;
}

const asDraft = (s: Song): DraftSide => s as DraftSide;
const who = (t?: Tanda) =>
  t ? `${t.orchestra}${t.singer ? ` / ${singerDisplay(t.singer)}` : ""} · ${rhythmWord(t.rhythm)}` : "";

export function InsertSheet() {
  const ask = useInsert((s) => s.ask);
  const close = useInsert((s) => s.close);
  const settings = useStore((s) => s.settings);
  const spot = ask?.spot;
  const p = ask?.playlist ?? null;
  const open = !!ask && !!p;
  const songMode = spot?.kind === "song";
  const tanda = spot?.kind === "song" ? p?.tandas[spot.tanda] : undefined;
  const at = spot?.at ?? 0;
  /** the place in the tanda a side goes to (song mode: the DJ can move it before adding) */
  const [pos, setPos] = useState(at);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new spot starts at its own place
  useEffect(() => setPos(spot?.at ?? 0), [ask]);
  const [sides, setSides] = useState<SpotSide[] | null>(null);
  const [options, setOptions] = useState<TandaOption[] | null>(null);
  const [seed, setSeed] = useState(1);
  const [aiPick, setAiPick] = useState<{ id: string; why: string; source: "ai" | "engine" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSide[]>([]);
  const rhythm = tanda?.rhythm ?? options?.[0]?.playlist.tandas[at]?.rhythm ?? "tango";
  const s = useSmartSearch({ defaultFilters: songMode ? { rhythms: [rhythm] } : {}, limit: 30 });

  // a fresh sheet per spot: the engine's candidates for it
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opening
  useEffect(() => {
    setOptions(null);
    setAiPick(null);
    setNote(null);
    setDraft([]);
    s.setQ("");
    s.setFilters(songMode && tanda ? { rhythms: [tanda.rhythm] } : {});
    if (!open || !p || !spot || spot.kind === "song") return;
    const ctl = new AbortController();
    const sd = Date.now() % 1e9;
    setSeed(sd);
    void spotCall<{ options?: TandaOption[] }>(
      "tandaOptions",
      { playlist: p, at: spot.at, seed: sd },
      ctl.signal,
    ).then((r) => !ctl.signal.aborted && setOptions(r.json.options ?? []));
    return () => ctl.abort();
  }, [ask]);
  // song mode: the sides for the chosen place
  // biome-ignore lint/correctness/useExhaustiveDependencies: per spot and place
  useEffect(() => {
    setSides(null);
    setAiPick(null);
    if (!open || !p || spot?.kind !== "song") return;
    const ctl = new AbortController();
    void spotCall<{ suggestions?: SpotSide[] }>(
      "songOptions",
      { playlist: p, tandaIndex: spot.tanda, at: pos },
      ctl.signal,
    ).then((r) => !ctl.signal.aborted && setSides(r.json.suggestions ?? []));
    return () => ctl.abort();
  }, [ask, pos]);

  const where = useMemo(() => {
    if (!p || !spot) return "";
    if (spot.kind === "song" && tanda)
      return tx("spot.song_where", {
        n: spot.tanda + 1,
        who: who(tanda),
        at: pos + 1,
        k: tanda.songs.length + 1,
      });
    if (spot.at <= 0) return tx("spot.before_first", { who: who(p.tandas[0]) });
    if (spot.at >= p.tandas.length)
      return tx("spot.after_last", { n: p.tandas.length, who: who(p.tandas.at(-1)) });
    return tx("spot.between", {
      a: spot.at,
      b: spot.at + 1,
      wa: who(p.tandas[spot.at - 1]),
      wb: who(p.tandas[spot.at]),
    });
  }, [p, spot, tanda, pos]);

  const done = () => {
    close();
  };
  const insertSide = async (side: string | Song, title: string) => {
    if (!p || spot?.kind !== "song" || !ask) return;
    setBusy(typeof side === "string" ? side : side.id);
    setNote(null);
    try {
      const r = await spotCall("insertSong", { playlist: p, tandaIndex: spot.tanda, at: pos, side });
      const { changed, reason, ...after } = r.json;
      if (!r.ok || !changed) {
        setNote(reason ? tx("spot.not_applied_why", { reason }) : tx("spot.not_applied"));
        return;
      }
      const res = await commitEdit({
        before: p,
        after: after as Playlist,
        label: tx("spot.added_song", { title, n: spot.tanda + 1, at: pos + 1 }),
        apply: ask.apply,
      });
      if (res !== "cancelled") done();
    } finally {
      setBusy(null);
    }
  };
  const insertOption = async (o: TandaOption) => {
    if (!p || !ask || spot?.kind !== "tanda") return;
    const nt = o.playlist.tandas[spot.at];
    setBusy("option");
    try {
      const res = await commitEdit({
        before: p,
        after: o.playlist,
        label: tx("spot.added_tanda", { n: spot.at + 1, orchestra: nt?.orchestra ?? "" }),
        apply: ask.apply,
      });
      if (res !== "cancelled") done();
    } finally {
      setBusy(null);
    }
  };
  const insertDraft = async () => {
    if (!p || !ask || spot?.kind !== "tanda" || !draft.length) return;
    setBusy("draft");
    setNote(null);
    try {
      const r = await spotCall("insertTanda", {
        playlist: p,
        at: spot.at,
        sides: draft.map((x) => (x.id.startsWith("ext:") ? x : x.id)),
      });
      const { changed, reason, ...after } = r.json;
      if (!r.ok || !changed) {
        setNote(reason ? tx("spot.not_applied_why", { reason }) : tx("spot.not_applied"));
        return;
      }
      const res = await commitEdit({
        before: p,
        after: after as Playlist,
        label: tx("spot.added_tanda", { n: spot.at + 1, orchestra: draft[0]?.orchestra ?? "" }),
        apply: ask.apply,
      });
      if (res !== "cancelled") done();
    } finally {
      setBusy(null);
    }
  };
  const askAi = async () => {
    if (!p || !spot) return;
    setBusy("ai");
    setNote(null);
    try {
      const r = await fetch("/api/ai/insert", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-provider": settings.ai.provider,
          "x-ai-key": settings.ai.key,
          "x-ai-model": settings.ai.model,
          "x-ai-workspace": settings.ai.workspace ?? "",
        },
        body: JSON.stringify({
          playlist: p,
          kind: spot.kind,
          at: spot.kind === "song" ? pos : spot.at,
          ...(spot.kind === "song" ? { tandaIndex: spot.tanda } : { seed }),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        pick?: string;
        why?: string;
        source?: "ai" | "engine";
        error?: string;
      };
      if (!j.pick) {
        setNote(j.error ?? tx("spot.no_pick"));
        return;
      }
      setAiPick({ id: j.pick, why: j.why || "", source: j.source === "ai" ? "ai" : "engine" });
    } finally {
      setBusy(null);
    }
  };

  const addVersion = (v: Version) => {
    haptic(6);
    if (songMode) {
      void insertSide(v.hit ? v.song.id : v.song, v.song.title);
      return;
    }
    setDraft((d) => {
      const next = addSide(d, asDraft(v.song));
      setNote(next === d ? tx("tandaSwap.already_in") : null);
      return next;
    });
  };
  const check = useMemo(() => checkDraft(draft, { rhythm: draft[0]?.rhythm ?? "tango", size: 4 }), [draft]);
  const aiSide = aiPick && songMode ? sides?.find((x) => x.song.id === aiPick.id) : undefined;
  const aiOption = aiPick && !songMode ? options?.[Number(aiPick.id)] : undefined;
  const title =
    spot?.kind === "song"
      ? tx("spot.add_song_title", { n: spot.tanda + 1 })
      : spot && p && spot.at >= p.tandas.length
        ? tx("spot.insert_after_title", { n: p.tandas.length })
        : tx("spot.insert_tanda_title", { n: (spot?.at ?? 0) + 1 });

  const footer =
    open && !songMode && draft.length ? (
      <div className="flex items-center gap-2">
        <p className="text-footnote min-w-0 flex-1 text-[var(--label-2)]" data-testid="insert-draft-summary">
          {draftOk(check)
            ? tx("tandaSwap.all_rules_kept")
            : tx("tandaSwap.rules_broken", { n: check.filter((c) => !c.ok).length })}
        </p>
        <button
          type="button"
          className="btn btn-primary min-h-11 px-5"
          disabled={!!busy || !!ask?.lockedReason}
          onClick={() => void insertDraft()}
          data-testid="insert-draft-apply"
        >
          {tx("spot.insert_tanda")}
        </button>
      </div>
    ) : undefined;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      detents={["large"]}
      width={720}
      testId={ask?.testId ?? "insert-sheet"}
      footer={footer}
    >
      {open && p && spot && (
        <div className="flex flex-col gap-1 pb-4">
          <p className="text-footnote px-4 pt-2 text-[var(--label-2)]" data-testid="insert-where">
            {where}
          </p>
          {songMode && tanda && !ask?.lockedReason && (
            <fieldset className="m-0 flex flex-wrap items-center gap-1 border-0 px-4 py-0">
              <legend className="sr-only">{tx("spot.place")}</legend>
              <span className="text-footnote mr-1 text-[var(--label-2)]" aria-hidden>
                {tx("spot.place")}
              </span>
              {Array.from({ length: tanda.songs.length + 1 }, (_, k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={pos === k}
                  className={`min-h-11 min-w-11 rounded-full px-3 text-footnote tabular-nums ${pos === k ? "bg-[var(--tint)] text-white" : "bg-[var(--fill-4)]"}`}
                  onClick={() => setPos(k)}
                  data-testid="insert-place"
                >
                  {k + 1}
                </button>
              ))}
            </fieldset>
          )}
          {ask?.lockedReason && (
            <p className="text-footnote px-4 text-[var(--destructive)]" data-testid="insert-locked">
              {ask.lockedReason}
            </p>
          )}
          {note && (
            <p
              className="text-footnote px-4 text-[var(--destructive)]"
              role="status"
              data-testid="insert-note"
            >
              {note}
            </p>
          )}
          {!ask?.lockedReason && (
            <>
              <div className="flex px-4 pt-1">
                <button
                  type="button"
                  className="btn btn-ghost min-h-11 gap-2 px-4"
                  onClick={() => void askAi()}
                  disabled={!!busy}
                  data-testid="insert-ask-ai"
                >
                  {busy === "ai" ? (
                    <LoaderCircle size={16} className="animate-spin" aria-hidden />
                  ) : (
                    <Sparkles size={16} aria-hidden />
                  )}
                  {tx("spot.ask_ai")}
                </button>
              </div>
              {aiPick && (aiSide || aiOption) && (
                <Group
                  header={aiPick.source === "ai" ? tx("spot.ai_pick") : tx("spot.engine_pick")}
                  footer={aiPick.why}
                  data-testid="insert-ai-pick"
                >
                  {aiSide && (
                    <Row
                      tile={<RhythmTile rhythm={aiSide.song.rhythm} />}
                      label={aiSide.song.title}
                      sub={aiSide.why}
                      chevron
                      onClick={() => void insertSide(aiSide.song.id, aiSide.song.title)}
                    />
                  )}
                  {aiOption && (
                    <Row
                      tile={<RhythmTile rhythm={aiOption.playlist.tandas[at]?.rhythm ?? "tango"} />}
                      label={who(aiOption.playlist.tandas[at])}
                      sub={aiOption.why}
                      chevron
                      onClick={() => void insertOption(aiOption)}
                    />
                  )}
                </Group>
              )}
              <Group
                header={tx("spot.suggested")}
                footer={
                  (songMode ? sides : options) === null
                    ? tx("spot.finding")
                    : (songMode ? sides : options)?.length
                      ? tx("spot.suggested_footer")
                      : tx("spot.nothing_fits")
                }
                data-testid="insert-suggested"
              >
                {songMode
                  ? (sides ?? []).map((x) => (
                      <Row
                        key={x.song.id}
                        tile={<RhythmTile rhythm={x.song.rhythm} />}
                        label={x.song.title}
                        sub={x.why}
                        value={
                          busy === x.song.id ? <LoaderCircle size={14} className="animate-spin" /> : undefined
                        }
                        chevron
                        onClick={() => void insertSide(x.song.id, x.song.title)}
                        data-testid="insert-suggestion"
                      />
                    ))
                  : (options ?? []).map((o) => {
                      const nt = o.playlist.tandas[at];
                      return (
                        <Row
                          key={nt?.songs.map((y) => y.id).join(",")}
                          tile={<RhythmTile rhythm={nt?.rhythm ?? "tango"} />}
                          label={who(nt)}
                          sub={`${o.why} · ${nt?.songs.map((y) => y.title).join(", ")}`}
                          chevron
                          onClick={() => void insertOption(o)}
                          data-testid="insert-suggestion"
                        />
                      );
                    })}
              </Group>
              {!songMode && (
                <section data-testid="insert-draft">
                  <h2 className="section-head">{tx("spot.your_tanda", { n: draft.length })}</h2>
                  <ol className="group-inset">
                    {draft.map((x, k) => (
                      <li key={x.id} className="cell gap-2" data-testid="insert-draft-side">
                        <span className="w-5 shrink-0 text-center text-footnote tabular-nums text-[var(--label-2)]">
                          {k + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{x.title}</span>
                          <span className="text-footnote flex items-center gap-1.5 text-[var(--label-2)]">
                            <TandaTypeBadge rhythm={x.rhythm} compact className="shrink-0" />
                            <span className="truncate">
                              {[
                                x.orchestra,
                                singerDisplay(x.singer) ?? tx("tandaType.instrumental"),
                                yearText(x.year ?? null),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              {x.durationSec ? ` · ${fmtLen(x.durationSec)}` : ""}
                            </span>
                          </span>
                        </span>
                        <button
                          type="button"
                          className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
                          aria-label={tx("play.move_up")}
                          disabled={k === 0}
                          onClick={() => setDraft((d) => moveSide(d, k, k - 1))}
                        >
                          <ArrowUp size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
                          aria-label={tx("play.move_down")}
                          disabled={k >= draft.length - 1}
                          onClick={() => setDraft((d) => moveSide(d, k, k + 1))}
                        >
                          <ArrowDown size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--destructive)]"
                          aria-label={tx("tandaSwap.remove", { title: x.title })}
                          onClick={() => setDraft((d) => removeSide(d, k))}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </li>
                    ))}
                    {!draft.length && <Row label={tx("spot.draft_empty")} />}
                  </ol>
                  {draft.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 px-4" aria-label={tx("tandaSwap.rules")}>
                      {check.map((c) => (
                        <li
                          key={c.key}
                          className={`text-footnote flex items-center gap-2 ${c.ok ? "text-[var(--label-2)]" : "text-[var(--destructive)]"}`}
                        >
                          {c.ok ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
                          <span>
                            {tx(c.msg as MsgKey, {
                              ...(c.values as Record<string, string>),
                              ...(c.values?.rhythm ? { rhythm: rhythmWord(String(c.values.rhythm)) } : {}),
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              <section className="px-4" data-testid="insert-search">
                <h2 className="section-head -mx-4">
                  {songMode ? tx("spot.search_side") : tx("spot.search_tanda")}
                </h2>
                <SmartSearchField
                  s={s}
                  id="insert-q"
                  prefix="insert"
                  placeholder={tx("smartSearch.placeholder")}
                  label={tx("tandaSwap.search_label")}
                  onEnter={addVersion}
                />
                <SmartSearchResults
                  s={s}
                  id="insert-q"
                  prefix="insert"
                  onPick={addVersion}
                  rowTestId="insert-result"
                  dim={(v) => draft.some((x) => x.id === v.song.id)}
                  actions={(v) => (
                    <button
                      type="button"
                      className="icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--tint)]"
                      aria-label={tx("tandaSwap.add", { title: v.song.title })}
                      disabled={!!busy}
                      onClick={() => addVersion(v)}
                      data-testid="insert-add"
                    >
                      <Plus size={18} aria-hidden />
                    </button>
                  )}
                />
              </section>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
