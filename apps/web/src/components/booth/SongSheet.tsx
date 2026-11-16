"use client";
import { type Cortina, cortinaDurationSec, type Song } from "@tdj/core";
import { Headphones, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { spotifyLengthSec } from "@/lib/booth/clips";
import { cortinaHookOf, cortinaStartOf } from "@/lib/booth/cortinaStart";
import { durationLabel } from "@/lib/booth/plan";
import { decodeAudio, useBooth, useRoomCaps, type Waveform as WaveData } from "@/lib/booth/store";
import { eraOf } from "@/lib/era";
import { t } from "@/lib/i18n";
import { gateEdit } from "@/lib/ruleCheck";
import { parseClock } from "@/lib/seek";
import { measureBufferTiming, useMarks, withMeasurement } from "@/lib/songMarks";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { ActionRow, Group } from "../Form";
import { Sheet } from "../Sheet";
import { SongDetails } from "../song/SongDetails";
import { Artwork } from "../ui/Artwork";
import { BpmKey, EnergyChip } from "../ui/BpmKey";
import { EraBadge } from "../ui/EraBadge";
import { ArmButton } from "./Confirm";
import { movable, moveSong, stepTarget } from "./reorder";
import { hasTransition } from "./TransitionSheet";
import { Waveform } from "./Waveform";

/**
 * Round 22 — tap any song in the set: one sheet to play it (now, next, or from here before the night), pre-listen
 * it in the headphones, set its cue and stop on the waveform, and hear or play any other version of it (the same
 * title by the same orchestra). The room and the headphones are named on every button.
 */
export function SongSheet({
  i,
  onClose,
  onTransition,
  onPlayed,
}: {
  i: number | null;
  onClose: () => void;
  /** 2026-11: a play action ran (the phone's set-list sheet closes so the DJ sees the Now card) */
  onPlayed?: () => void;
  /** wave 4: "Transition…" opens the editor of the transition out of this item */
  onTransition?: (i: number) => void;
}) {
  const it = useBooth((s) => (i === null ? null : s.plan?.items[i]));
  const canTransition = useBooth((s) => i !== null && hasTransition(s.plan?.items, i));
  const entity = useBooth((s) => (i === null ? null : (s.entities[i] ?? null)));
  const started = useBooth((s) => s.started);
  const planIndex = useBooth((s) => s.planIndex);
  const live = useBooth((s) => s.state === "playing");
  const audition = useBooth((s) => s.audition);
  const fade = useBooth((s) => s.settings.fadeNowSec);
  // 2026-11: Spotify Connect switches at once (it can't fade): the footer never promises a fade
  const canFade = useRoomCaps().fade;
  const cues = useBooth((s) => s.playlist?.booth?.songCues);
  const outputs = useBooth((s) => s.outputs);
  const b = useBooth.getState();
  const open = i !== null && !!it && it.kind !== "break";
  const blocked = open ? b.cueBlocked() : null;
  const curTanda = useBooth((s) => s.plan?.items[s.planIndex]?.tanda ?? 0);
  const readOnly = started && !!it && it.tanda <= curTanda && it.tanda > 0;
  const song = entity && "rhythm" in entity && "orchestraId" in entity ? (entity as Song) : null;
  const cueLabel = blocked
    ? started
      ? null
      : t("booth.songSheet.test_on_this_device")
    : t("booth.songSheet.pre_listen_in_headphones");
  const hearing = audition && i !== null && audition.i === i;
  // (re-read on every render: the playhead moves, a reorder moves the rows)
  useBooth((s) => s.planIndex);
  const canMove = i !== null && movable(i);
  const upTo = i !== null && canMove ? stepTarget(i, -1) : null;
  const downTo = i !== null && canMove ? stepTarget(i, 1) : null;
  const prelisten = async (o: { song?: Song; startSec?: number } = {}) => {
    if (i === null) return;
    const why = await b.prelisten(o.song ? { song: o.song } : { i }, { startSec: o.startSec });
    if (why) toast(t("booth.songSheet.can_t_pre_listen", { why }));
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={it ? it.title : t("booth.songSheet.song")}
      detents={["large"]}
      trailing={t("booth.songSheet.done")}
      testId="booth-play-sheet"
    >
      {it && entity && i !== null && (
        <>
          <div className="mt-2 flex items-start gap-3 px-4">
            <Artwork entity={entity} orchestra={song?.orchestra ?? it.artist} size={72} />
            <div className="min-w-0 flex-1">
              <p className="text-headline">{it.title}</p>
              <p className="text-subhead text-[var(--label-2)]">
                {it.artist}
                {it.year ? ` · ${it.year}` : ""}
                {` · ${durationLabel(it.lengthSec)}`}
              </p>
              <div className="booth-meta">
                {song && <EraBadge entity={song} />}
                {song && eraOf(song) && (
                  <span className="text-footnote text-[var(--label-2)]">{eraOf(song)!.label}</span>
                )}
                <BpmKey e={entity} />
                <EnergyChip e={entity} />
              </div>
            </div>
          </div>
          <Group
            header={t("booth.songSheet.play")}
            footer={
              started ? (
                <>
                  {t(
                    canFade ? "booth.songSheet.play_now_fades_the_room_s" : "booth.connect.play_now_at_once",
                    { fade, p1: blocked ? "" : t("booth.songSheet.pre_listen_plays_only_in_your_2") },
                  )}
                  {/* 2026-11: no headphones chosen — the line opens the Headphones picker (closing this sheet) */}
                  {blocked && (
                    <button
                      type="button"
                      className="booth-sheet-link"
                      data-testid="booth-pick-headphones"
                      onClick={() => {
                        onClose();
                        setTimeout(
                          () =>
                            (
                              document.querySelector<HTMLElement>('[data-testid="booth-out-cue"]') ??
                              document.querySelector<HTMLElement>('[data-testid="booth-out-cue-unsupported"]')
                            )?.click(),
                          60,
                        );
                      }}
                    >
                      {`Pre-listen: ${blocked}`}
                    </button>
                  )}
                </>
              ) : blocked ? (
                t("booth.songSheet.the_night_has_not_started_so", { blocked })
              ) : (
                t("booth.songSheet.pre_listen_plays_only_in_your")
              )
            }
          >
            {started ? (
              <>
                {/* 2026-11: it cuts the room's song — the first tap arms it, the second plays (Confirm.tsx) */}
                <ArmButton
                  armKey={`play-now:${i}`}
                  className="cell cell-tap w-full justify-center text-[var(--tint)] disabled:text-[var(--label-3)]"
                  disabled={i === planIndex}
                  onConfirm={() => {
                    // 2026-11: the room's song changes now (the store no longer waits on an interrupted context)
                    useBooth
                      .getState()
                      .playNow(i)
                      .catch(() => toast(t("booth.ui2.play_now_failed", { title: it.title })));
                    onClose();
                    onPlayed?.();
                  }}
                  id="booth-play-now"
                  data-testid="booth-play-now"
                  // the sheet opens with the focus here (never on Cancel): Enter plays it in the room
                  data-autofocus={i !== planIndex || undefined}
                >
                  {t("booth.songSheet.play_now_in_the_room")}
                </ArmButton>
                <ActionRow
                  label={t("booth.songSheet.play_next")}
                  disabled={i === planIndex}
                  onClick={() => {
                    // 2026-11: after the running song; Up Next and the set list show it; Undo puts the plan back
                    useBooth.getState().playNext(i);
                    toast(t("booth.songSheet.plays_next", { title: it.title }), () =>
                      useBooth.getState().undoPlayNext(),
                    );
                    onClose();
                  }}
                  id="booth-play-next"
                />
              </>
            ) : (
              <ActionRow
                label={t("booth.songSheet.start_the_night_here")}
                onClick={() => {
                  void b.playNow(i);
                  onClose();
                  onPlayed?.();
                }}
                id="booth-start-here"
              />
            )}
            {hearing ? (
              <button
                type="button"
                className="cell cell-tap w-full text-left"
                onClick={() => b.stopAudition()}
                data-testid="booth-cue-stop"
              >
                <Square
                  size={16}
                  fill="currentColor"
                  strokeWidth={0}
                  className="text-[var(--cue)]"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-[var(--cue)]">
                  {audition.where === "headphones"
                    ? t("booth.songSheet.stop_pre_listen")
                    : t("booth.songSheet.stop_test")}
                </span>
              </button>
            ) : (
              cueLabel && (
                <button
                  type="button"
                  className="cell cell-tap w-full text-left"
                  onClick={() => void prelisten()}
                  data-testid="booth-prelisten"
                  data-where={blocked ? "device" : "headphones"}
                >
                  {blocked ? (
                    <Volume2 size={16} strokeWidth={2} aria-hidden />
                  ) : (
                    <Headphones size={16} strokeWidth={2} className="text-[var(--cue)]" aria-hidden />
                  )}
                  <span className={`min-w-0 flex-1 ${blocked ? "text-[var(--tint)]" : "text-[var(--cue)]"}`}>
                    {cueLabel}
                  </span>
                  <span className="text-footnote text-[var(--label-2)]">
                    {blocked
                      ? t("booth.songSheet.this_device")
                      : (outputs.devices.find((d) => d.id === outputs.cue)?.label ??
                        t("booth.songSheet.headphones"))}
                  </span>
                </button>
              )
            )}
          </Group>
          {/* 2026-11: Spotify cannot be heard by the browser: the DJ teaches a side its real end (its stop cue) */}
          {started && i === planIndex && live && it.kind !== "cortina" && (
            <Group footer={t("booth.songSheet.ends_early_sub")}>
              <ActionRow
                label={t("booth.songSheet.ends_early")}
                tip={t("booth.songSheet.ends_early_sub")}
                onClick={() => {
                  const at = useBooth.getState().songEndsEarly();
                  if (at !== null)
                    toast(t("booth.songSheet.ends_early_saved", { title: it.title, at: durationLabel(at) }));
                  onClose();
                }}
                id="booth-ends-early"
              />
            </Group>
          )}
          {/* 2026-11: the order inside the tanda (only songs not played nor playing; no confirmation, Undo) */}
          {canMove && (
            <Group header={t("booth.reorder.header")} footer={t("booth.reorder.footer")}>
              <ActionRow
                label={t("booth.reorder.move_up")}
                disabled={upTo === null}
                onClick={() => {
                  if (upTo === null) return;
                  onClose();
                  void moveSong(i, upTo);
                }}
                id="booth-move-up"
              />
              <ActionRow
                label={t("booth.reorder.move_down")}
                disabled={downTo === null}
                onClick={() => {
                  if (downTo === null) return;
                  onClose();
                  void moveSong(i, downTo);
                }}
                id="booth-move-down"
              />
            </Group>
          )}
          {onTransition && canTransition && (
            <Group footer={t("booth.songSheet.transition_footer")}>
              <ActionRow
                label={t("booth.songSheet.transition")}
                tip={t("booth.songSheet.transition_footer")}
                onClick={() => {
                  onClose();
                  onTransition(i);
                }}
              />
            </Group>
          )}
          {it.kind === "cortina" && it.id && (
            <CortinaStart
              id={it.id}
              trimInSec={it.trimInSec ?? 0}
              lengthSec={it.lengthSec}
              entity={entity as Cortina}
              readOnly={started && i <= planIndex}
            />
          )}
          {it.kind !== "cortina" && song && (
            <CueEditor
              i={i}
              song={song}
              cue={cues?.[song.id]}
              readOnly={started && i <= planIndex}
              onListen={(at) => void prelisten({ startSec: at })}
            />
          )}
          {song && it.kind !== "cortina" && (
            <BoothSongDetails
              i={i}
              song={song}
              readOnly={readOnly}
              durationSec={spotifyLengthSec(song) ?? song.durationSec}
              onListen={(v) => void prelisten({ song: v })}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

function CueEditor({
  i,
  song,
  cue,
  readOnly,
  onListen,
}: {
  i: number;
  song: Song;
  cue?: { inSec?: number; outSec?: number };
  readOnly: boolean;
  onListen: (at: number) => void;
}) {
  const [wave, setWave] = useState<WaveData | null | undefined>(undefined);
  const cuePos = useBooth((s) => s.cuePos);
  const hearing = useBooth((s) => s.audition?.songId === song.id);
  useEffect(() => {
    let live = true;
    setWave(undefined);
    void useBooth
      .getState()
      .waveformOf(i)
      .then((w) => live && setWave(w));
    return () => {
      live = false;
    };
  }, [i]);
  const dur =
    (wave?.from === "file" ? wave.durationSec : null) ?? spotifyLengthSec(song) ?? song.durationSec ?? 170;
  const [local, setLocal] = useState({ inSec: cue?.inSec ?? 0, outSec: cue?.outSec ?? dur });
  useEffect(() => {
    setLocal({ inSec: cue?.inSec ?? 0, outSec: cue?.outSec ?? dur });
  }, [cue?.inSec, cue?.outSec, dur]);
  const commit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (c: { inSec: number; outSec: number }) => {
    setLocal(c);
    if (commit.current) clearTimeout(commit.current);
    commit.current = setTimeout(() => {
      useBooth.getState().setSongCue(song.id, {
        inSec: c.inSec > 0 ? c.inSec : undefined,
        outSec: c.outSec < dur ? c.outSec : undefined,
      });
    }, 250);
  };
  const edited = local.inSec > 0 || local.outSec < dur;
  // the clip's waveform covers its own 30 s, not the song: then the bars are left out
  const peaks = wave && wave.from === "file" ? wave.peaks : null;
  return (
    <Group
      header={t("booth.songSheet.cue_and_stop")}
      footer={
        readOnly
          ? t("booth.songSheet.this_tanda_is_playing_or_has_2")
          : t("booth.songSheet.drag_cue_and_stop_on_the", {
              p1:
                wave?.from === "file"
                  ? t("booth.songSheet.the_waveform_is_your_file")
                  : t("booth.songSheet.link_the_file_to_see_its"),
            })
      }
    >
      <div className="cell block">
        <Waveform
          peaks={peaks}
          durationSec={dur}
          cue={local}
          disabled={readOnly}
          at={hearing ? cuePos.at : null}
          onChange={(c) => change(c)}
        />
        <div className="text-footnote mt-2 flex items-center justify-between tabular-nums text-[var(--label-2)]">
          <span data-testid="booth-cue-in-label">
            {t("booth.songSheet.cue", { p1: durationLabel(local.inSec) })}
          </span>
          <span>{t("booth.songSheet.plays", { p1: durationLabel(local.outSec - local.inSec) })}</span>
          <span data-testid="booth-cue-out-label">
            {t("booth.songSheet.stop", { p1: durationLabel(local.outSec) })}
          </span>
        </div>
      </div>
      <StartPoint
        inSec={local.inSec}
        max={Math.max(0, local.outSec - 1)}
        readOnly={readOnly}
        onChange={(inSec) => {
          const c = { inSec, outSec: local.outSec };
          setLocal(c);
          if (commit.current) clearTimeout(commit.current);
          useBooth.getState().setSongCue(song.id, {
            inSec: inSec > 0 ? inSec : undefined,
            outSec: c.outSec < dur ? c.outSec : undefined,
          });
        }}
      />
      <button
        type="button"
        className="cell cell-tap w-full text-left"
        onClick={() => onListen(local.inSec)}
        data-testid="booth-cue-listen"
      >
        <Headphones size={16} strokeWidth={2} className="text-[var(--cue)]" aria-hidden />
        <span className="min-w-0 flex-1 text-[var(--cue)]">{t("booth.songSheet.listen_from_the_cue")}</span>
      </button>
      {edited && !readOnly && (
        <ActionRow
          label={t("booth.songSheet.play_the_whole_song")}
          onClick={() => {
            setLocal({ inSec: 0, outSec: dur });
            useBooth.getState().setSongCue(song.id, null);
          }}
        />
      )}
    </Group>
  );
}

/**
 * 2026-11 (the owner: "cortinas play 40 s from the start, so dancers don't recognise them"): where this cortina
 * starts tonight — its chorus, or the DJ's own start, saved per cortina id with the night (`cortinaEdits`) — with
 * the same "Start at" field as a song and a one-tap way back to the chorus.
 */
function CortinaStart({
  id,
  trimInSec,
  lengthSec,
  entity,
  readOnly,
}: {
  id: string;
  trimInSec: number;
  lengthSec: number;
  entity: Cortina | null;
  readOnly: boolean;
}) {
  const edits = useBooth((s) => s.playlist?.booth?.cortinaEdits);
  const hookOn = useStore((s) => s.settings.cortinaHookStart !== false);
  const info = cortinaStartOf({ id, trimInSec }, edits);
  const hook = cortinaHookOf(id);
  const own = edits?.[id]?.startSec !== undefined;
  const dur = entity ? cortinaDurationSec(entity) : undefined;
  const set = (startSec: number | undefined) => useBooth.getState().setCortinaEdit(id, { startSec });
  return (
    <Group
      header={t("booth.cortinaStart.header")}
      footer={hookOn ? t("booth.cortinaStart.footer") : t("booth.cortinaStart.footer_off")}
    >
      <div className="cell" data-testid="booth-cortina-start-label">
        {info.label}
      </div>
      <StartPoint
        inSec={trimInSec}
        max={Math.max(0, (dur ?? 600) - Math.min(lengthSec, dur ?? lengthSec))}
        readOnly={readOnly}
        label={t("booth.cortinaStart.label")}
        resetLabel={t("booth.cortinaStart.from_zero")}
        onChange={(v) => set(v)}
      />
      {own && hookOn && hook && hook.source !== "none" && !readOnly && (
        <ActionRow
          label={t("booth.cortinaStart.use_chorus", { p1: durationLabel(hook.startSec) })}
          onClick={() => set(undefined)}
          id="booth-cortina-use-chorus"
        />
      )}
    </Group>
  );
}

/**
 * 2026-11 ("can't change the start point"): where this song starts tonight, as a number — "Start at 0:12" — beside
 * the waveform's drag, with a one-tap reset. Saved with the night (the set's song cues); files, clips and Spotify
 * (position_ms) all start there.
 */
function StartPoint({
  inSec,
  max,
  readOnly,
  onChange,
  label,
  resetLabel,
}: {
  inSec: number;
  max: number;
  readOnly: boolean;
  onChange: (sec: number) => void;
  label?: string;
  resetLabel?: string;
}) {
  const [text, setText] = useState(durationLabel(inSec));
  useEffect(() => setText(durationLabel(inSec)), [inSec]);
  const commit = () => {
    const v = parseClock(text);
    if (v === null) return setText(durationLabel(inSec));
    const to = Math.max(0, Math.min(max, Math.round(v)));
    setText(durationLabel(to));
    if (to !== Math.round(inSec)) onChange(to);
  };
  return (
    <div className="cell flex items-center gap-2" data-testid="booth-start-point">
      <label htmlFor="booth-start-at" className="min-w-0 flex-1">
        <span className="block">{t("booth.songSheet.start_at", { p1: durationLabel(inSec) })}</span>
        <span className="text-footnote block text-[var(--label-2)]">
          {t("booth.songSheet.start_point_footer")}
        </span>
      </label>
      <input
        id="booth-start-at"
        className="field min-h-11 w-20 text-center tabular-nums"
        inputMode="numeric"
        aria-label={label ?? t("booth.songSheet.start_at_label")}
        value={text}
        disabled={readOnly}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        data-testid="booth-start-at"
      />
      {inSec > 0 && !readOnly && (
        <button
          type="button"
          className="btn-plain min-h-11 px-2"
          onClick={() => onChange(0)}
          data-testid="booth-start-reset"
        >
          {resetLabel ?? t("booth.songSheet.start_from_zero")}
        </button>
      )}
    </div>
  );
}

/**
 * 2026-11 — the shared song details inside the Booth's sheet: the facts, the rhythm lane and synced lyrics while the
 * side plays (the room, or a pre-listen of its file), "Mark now" for the singer's entry and the first downbeat,
 * "Measure" from the DJ's file, and every other version of the work — pre-listened in the headphones, or used
 * tonight instead (the rule check asks first: another orchestra or voice may break the tanda).
 */
function BoothSongDetails({
  i,
  song,
  readOnly,
  durationSec,
  onListen,
}: {
  i: number;
  song: Song;
  readOnly: boolean;
  durationSec?: number;
  onListen: (v: Song) => void;
}) {
  const hearing = useBooth((s) => s.audition?.songId ?? null);
  const position = useCallback(() => useBooth.getState().positionOf(song.id), [song.id]);
  const set = useMarks((s) => s.set);
  const measure = async (): Promise<string | null> => {
    const b = useBooth.getState();
    const it = b.plan?.items[i];
    const e = b.entities[i];
    if (!it || !e) return t("song.measure_needs_file");
    let d: Awaited<ReturnType<typeof decodeAudio>> = null;
    try {
      d = await decodeAudio(it.id ?? song.id, e);
    } catch (x) {
      return `${t("song.measure_nothing")} (${x instanceof Error ? x.message : String(x)})`;
    }
    if (d?.from !== "file") return t("song.measure_needs_file");
    const m = measureBufferTiming(d.buffer, {
      bpm: song.tempo?.bpm ?? song.audio?.bpm ?? song.deezer?.bpm ?? song.bpm ?? null,
      rhythm: song.rhythm,
    });
    if (!m) return t("song.measure_nothing");
    set(song.id, withMeasurement(useMarks.getState().marks[song.id], m));
    return null;
  };
  const use = async (v: Song) => {
    const b = useBooth.getState();
    const before = b.playlist;
    const after = b.versionNight(song.id, v);
    if (!before || !after) {
      toast(t("booth.songSheet.this_tanda_is_read_only_now"));
      return;
    }
    // another version may be another singer's or another year's: the rule check asks first
    const said = t("booth.songSheet.tonight_plays_the_version", { p1: v.year ?? "" });
    const res = await gateEdit({
      before,
      after,
      label: said,
      apply: async (np) => {
        useBooth.getState().stopAudition();
        await useBooth.getState().applySwappedPlaylist(np);
      },
      learn: false,
    });
    if (res === "applied") toast(said);
  };
  return (
    <SongDetails
      song={song}
      header={false}
      position={position}
      onMeasure={measure}
      durationSec={durationSec}
      booth={{
        readOnly,
        hearingId: hearing,
        onListen,
        onStop: () => useBooth.getState().stopAudition(),
        onUse: (v) => void use(v),
      }}
    />
  );
}
