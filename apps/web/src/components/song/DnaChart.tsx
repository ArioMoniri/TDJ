"use client";
import type { DnaRecording, Song } from "@tdj/core";
import { singerDisplay } from "@tdj/core";
import { useMemo, useState } from "react";
import { type ChartMark, chartLayout } from "@/lib/dnaChart";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { PlayListContext, tapPlay, useTapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { useSongMenuProps } from "@/lib/songMenu";

/**
 * 2026-11 — Song DNA's "Recordings over the years" (the owner: the dots were a pile): a horizontal timeline with
 * decade lines and year ticks, one lane per orchestra (named on the left, ordered by its first recording), a filled
 * mark for a sung recording and an outlined one for an instrumental, this recording ringed and labelled, the same
 * year's recordings side by side across the lane. A mark shows its recording on hover and focus and plays on a tap
 * (the song menu on a right-click or long press). The picture is summed up for a screen reader (role=img); each mark
 * is a button of its own. Its height follows its lanes; a long span scrolls inside its frame, never the page.
 */
export function DnaChart({
  recordings,
  sides,
  title,
}: {
  recordings: readonly DnaRecording[];
  sides: Record<string, Song>;
  title: string;
}) {
  const layout = useMemo(() => chartLayout(recordings), [recordings]);
  const items = useMemo<PlayItem[]>(
    () =>
      layout.lanes.flatMap((l) =>
        [...l.marks]
          .sort((a, b) => a.x - b.x)
          .map((m) => sides[m.r.id])
          .filter((s): s is Song => !!s)
          .map((song) => ({ kind: "song" as const, song, where: title })),
      ),
    [layout, sides, title],
  );
  const list = useMemo(() => ({ label: title, items }), [title, items]);
  const [tip, setTip] = useState<{ id: string; lane: number; x: number; dy: number } | null>(null);
  const hover = useMediaQuery("(hover: hover)");
  if (!layout.dated) return null;
  const cur = layout.current?.r;
  const summary = t("song.dna_chart_summary", {
    n: layout.dated,
    orchestras: layout.lanes.length,
    from: Math.min(...layout.lanes.map((l) => l.first)),
    to: Math.max(...layout.lanes.flatMap((l) => l.marks.map((m) => m.r.year ?? 0))),
    orchestra: cur?.orchestra ?? "–",
    year: cur?.year ?? "–",
  });
  const tipRec = tip ? recordings.find((r) => r.id === tip.id) : null;
  return (
    <PlayListContext.Provider value={list}>
      <figure className="dna-chart" data-testid="dna-timeline" data-lanes={layout.lanes.length}>
        <div className="dna-chart-frame" data-testid="dna-chart-frame">
          <div
            className="dna-chart-grid"
            style={{ ["--plot-min" as string]: `${layout.minWidth}px` }}
            onPointerLeave={() => setTip(null)}
          >
            {/* the picture as one image for a screen reader; the marks below are its buttons */}
            <div className="dna-chart-img" role="img" aria-label={summary} data-testid="dna-chart-img" />
            {layout.lanes.map((lane, li) => (
              <div className="dna-chart-lane" key={lane.orchestraId} style={{ height: lane.height }}>
                <div className="dna-chart-label" title={lane.orchestra} lang="es">
                  {lane.orchestra}
                </div>
                <div className="dna-chart-plot">
                  <Gridlines layout={layout} />
                  {lane.marks.map((m) => (
                    <Mark
                      key={m.r.id}
                      m={m}
                      song={sides[m.r.id]}
                      list={list}
                      active={tip?.id === m.r.id}
                      onShow={(on) =>
                        setTip((p) =>
                          on ? { id: m.r.id, lane: li, x: m.x, dy: m.dy } : p?.id === m.r.id ? null : p,
                        )
                      }
                    />
                  ))}
                  {tip && tip.lane === li && tipRec && <Tooltip r={tipRec} x={tip.x} dy={tip.dy} />}
                </div>
              </div>
            ))}
            {/* the axis: decade labels under their lines, a tick every year */}
            <div className="dna-chart-lane dna-chart-axis-row" aria-hidden>
              <div className="dna-chart-label" />
              <div className="dna-chart-plot dna-chart-axis">
                {layout.years.map((y) => (
                  <span
                    key={y.year}
                    className="dna-chart-tick"
                    data-decade={y.year % 10 === 0 || undefined}
                    style={{ left: `${y.x * 100}%` }}
                  />
                ))}
                {layout.decades.map((d) => (
                  <span key={d.year} className="dna-chart-decade" style={{ left: `${d.x * 100}%` }}>
                    {d.year}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <figcaption className="dna-chart-legend text-caption1">
          <span className="inline-flex items-center gap-1.5">
            <i className="dna-chart-key" data-vocal="" aria-hidden /> {t("song.dna_key_vocal")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="dna-chart-key" aria-hidden /> {t("song.dna_key_instrumental")}
          </span>
          {cur && (
            <span className="inline-flex items-center gap-1.5">
              <i className="dna-chart-key" data-vocal={cur.vocal || undefined} data-this="" aria-hidden />{" "}
              {t("song.dna_key_this")}
            </span>
          )}
          {layout.undated > 0 && (
            <span data-testid="dna-chart-undated">{t("song.dna_chart_undated", { n: layout.undated })}</span>
          )}
          <span className="dna-chart-hint">
            {hover ? t("song.dna_chart_hover") : t("song.dna_chart_tap")}
          </span>
        </figcaption>
      </figure>
    </PlayListContext.Provider>
  );
}

function Gridlines({ layout }: { layout: ReturnType<typeof chartLayout> }) {
  return (
    <div className="dna-chart-lines" aria-hidden>
      {layout.decades.map((d) => (
        <span key={d.year} className="dna-chart-line" style={{ left: `${d.x * 100}%` }} />
      ))}
    </div>
  );
}

const voiceOf = (r: Pick<DnaRecording, "singer">) => singerDisplay(r.singer) ?? t("song.instrumental");

function Mark({
  m,
  song,
  list,
  active,
  onShow,
}: {
  m: ChartMark<DnaRecording>;
  song: Song | undefined;
  list: { label: string; items: PlayItem[] };
  active: boolean;
  onShow: (on: boolean) => void;
}) {
  const r = m.r;
  const item = useMemo<PlayItem | null>(
    () => (song ? { kind: "song", song, where: list.label } : null),
    [song, list.label],
  );
  const tp = useTapPlay(item, list);
  const menu = useSongMenuProps({ song: song ?? null });
  const label = t("song.dna_chart_marker", { orchestra: r.orchestra, year: r.year ?? "", voice: voiceOf(r) });
  return (
    <button
      type="button"
      className="dna-chart-mark"
      style={{ left: `${m.x * 100}%`, top: `calc(50% + ${m.dy}px)` }}
      data-vocal={r.vocal || undefined}
      data-current={r.current || undefined}
      data-active={active || undefined}
      data-now={tp.state ?? undefined}
      data-year={r.year ?? undefined}
      data-testid="dna-chart-mark"
      aria-label={`${label}${r.current ? ` · ${t("song.dna_key_this")}` : ""}`}
      aria-pressed={tp.playing}
      onPointerEnter={(e) => e.pointerType === "mouse" && onShow(true)}
      onFocus={() => onShow(true)}
      onBlur={() => onShow(false)}
      onClick={() => {
        haptic(4);
        if (item) void tapPlay(item, list);
      }}
      {...menu}
    >
      <span className="dna-chart-dot" aria-hidden />
      {r.current && (
        <span className="dna-chart-this text-caption1" data-flip={m.x > 0.7 || undefined} aria-hidden>
          {t("song.dna_key_this")} · {r.year}
        </span>
      )}
    </button>
  );
}

function Tooltip({ r, x, dy }: { r: DnaRecording; x: number; dy: number }) {
  return (
    <div
      className="dna-chart-tip"
      role="status"
      data-flip={x > 0.6 || undefined}
      style={{ left: `${x * 100}%`, top: `calc(50% + ${dy}px)` }}
      data-testid="dna-chart-tip"
    >
      <strong className="block tabular-nums">{r.year}</strong>
      <span className="block" lang="es">
        {r.orchestra}
      </span>
      <span className="block text-[var(--label-2)]" lang="es">
        {voiceOf(r)}
      </span>
    </div>
  );
}
