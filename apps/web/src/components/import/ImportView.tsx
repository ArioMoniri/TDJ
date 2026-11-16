"use client";
import {
  groupsOf,
  type ImportEntry,
  type ImportSource,
  type MatchLevel,
  mergeWithNext,
  setRole,
  splitBefore,
} from "@tdj/core";
import {
  CircleAlert,
  ClipboardList,
  FileUp,
  FolderOpen,
  Info,
  Link2,
  ListMusic,
  LoaderCircle,
  Radio,
  Scissors,
  Sparkles,
  Undo2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionRow, FieldRow, Group, RhythmTile, SwitchRow, Tile } from "@/components/Form";
import { Menu } from "@/components/Menu";
import { PageHeader } from "@/components/PageHeader";
import { TipRow } from "@/components/TipRow";
import { Segmented } from "@/components/ui";
import { isMixedTanda, rhythmWord, TandaTypeBadge } from "@/components/ui/TandaTypeBadge";
import { haptic } from "@/lib/haptics";
import { fmtNumber, type MsgKey, t as tx } from "@/lib/i18n";
import {
  FILE_ACCEPT,
  ImportError,
  keepImported,
  learnFromNight,
  matchItems,
  nightOf,
  readFiles,
  readSpotify,
  readYoutube,
  resolveNight,
  spotifyPlaylists,
  spotifySignedIn,
  youtubePlaylists,
} from "@/lib/importFlow";
import type { PlaylistSummary } from "@/lib/playlistSources";
import { ruleText } from "@/lib/ruleCheck";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import "./import.css";

type SourceKind = "spotify" | "youtube" | "file" | "text";
const KINDS: SourceKind[] = ["spotify", "youtube", "file", "text"];
type View =
  | { kind: "pick" }
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string; login?: string }
  | { kind: "review"; entries: ImportEntry[]; name: string; source: ImportSource; skipped: number };

const LEVEL_KEY: Record<
  MatchLevel,
  "import.level_sure" | "import.level_likely" | "import.level_guess" | "import.level_none"
> = {
  sure: "import.level_sure",
  likely: "import.level_likely",
  guess: "import.level_guess",
  none: "import.level_none",
};

/**
 * "Import a playlist" (2026-11): pick a source, the rows are matched to the catalogue and split into tandas, the DJ
 * reviews the night (what a tanda breaks is information, never a blocker), fixes the splits, and opens it in
 * Compose, plays it in the Booth or starts a room with it. The night lands in History with its source link.
 */
export default function ImportView() {
  const router = useRouter();
  const learnOn = useStore((s) => s.settings.learn);
  const [source, setSource] = useState<SourceKind>("spotify");
  const [view, setViewState] = useState<View>({ kind: "pick" });
  const ticket = useRef(0);
  const setView = useCallback((v: View, t = ticket.current) => {
    if (t === ticket.current) setViewState(v);
  }, []);
  const [link, setLink] = useState("");
  const [text, setText] = useState("");
  const [lists, setLists] = useState<{ kind: "spotify" | "youtube"; items: PlaylistSummary[] } | null>(null);
  const [listsBusy, setListsBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linked, setLinked] = useState(true);
  const [learned, setLearned] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const from = new URLSearchParams(location.search).get("from") as SourceKind | null;
    if (from && KINDS.includes(from)) setSource(from);
  }, []);
  useEffect(() => {
    setLists(null);
    setLink("");
    if (source === "spotify") void spotifySignedIn().then(setSignedIn);
  }, [source]);

  const fail = useCallback(
    (e: unknown, t: number) => {
      const err = e as ImportError;
      setView({ kind: "error", message: err.message || tx("import.err_match"), login: err.login }, t);
    },
    [setView],
  );

  /** the rows → matched → the review */
  const review = useCallback(
    async (
      t: number,
      read: () => Promise<{
        name: string;
        items?: import("@tdj/core").ImportItem[];
        entries?: ImportEntry[];
        source: Omit<ImportSource, "at">;
        skipped?: number;
      }>,
    ) => {
      setView({ kind: "loading", message: tx("import.reading") }, t);
      try {
        const r = await read();
        let entries = r.entries;
        if (!entries) {
          if (!r.items?.length) throw new ImportError("empty", tx("import.err_empty"));
          setView(
            { kind: "loading", message: tx("import.matching", { count: fmtNumber(r.items.length) }) },
            t,
          );
          entries = await matchItems(r.items);
        }
        setLearned(false);
        setView(
          {
            kind: "review",
            entries,
            name: r.name,
            source: { ...r.source, at: new Date().toISOString() },
            skipped: r.skipped ?? 0,
          },
          t,
        );
        haptic(10);
      } catch (e) {
        fail(e, t);
      }
    },
    [fail, setView],
  );

  const fromService = (kind: "spotify" | "youtube", value: string) => {
    const t = ++ticket.current;
    void review(t, async () => {
      const p = kind === "spotify" ? await readSpotify(value) : await readYoutube(value);
      return {
        name: p.name,
        items: p.items,
        skipped: p.skipped,
        source: { service: kind, playlistId: p.id, url: p.url, name: p.name },
      };
    });
  };
  const fromFiles = (files: File[]) => {
    if (!files.length) return;
    const t = ++ticket.current;
    void review(t, async () => {
      const parsed = await readFiles(files);
      const src = { service: "file" as const, format: parsed.format, name: parsed.name };
      if (parsed.night) return { name: parsed.night.name, entries: await resolveNight(parsed), source: src };
      return { name: parsed.name, items: parsed.items, source: src };
    });
  };
  const fromText = () => {
    const t = ++ticket.current;
    void review(t, async () => {
      const { parseTextList } = await import("@tdj/core");
      const p = parseTextList(text, tx("import.pasted_list"));
      return { name: p.name, items: p.items, source: { service: "text", format: "text", name: p.name } };
    });
  };
  const loadLists = async (kind: "spotify" | "youtube") => {
    setListsBusy(true);
    try {
      setLists({ kind, items: kind === "spotify" ? await spotifyPlaylists() : await youtubePlaylists() });
    } catch (e) {
      fail(e, ticket.current);
    } finally {
      setListsBusy(false);
    }
  };

  const r = view.kind === "review" ? view : null;
  const night = useMemo(
    () =>
      r ? nightOf(r.entries, r.name, { ...r.source, ...(r.source.playlistId ? { linked } : {}) }) : null,
    [r, linked],
  );
  const edit = (entries: ImportEntry[]) => r && setViewState({ ...r, entries });

  const keep = (to: "compose" | "booth" | "room") => {
    if (!night || !r) return;
    haptic(10);
    keepImported(night, r.entries);
    toast(tx("import.kept", { name: night.playlist.name }));
    router.push(to === "compose" ? "/#result" : to === "booth" ? "/booth" : "/rooms");
  };
  const learn = () => {
    if (!night) return;
    if (learnFromNight(night)) {
      setLearned(true);
      toast(tx("import.learned"));
    }
  };

  const counts = night?.counts;
  const groups = r ? groupsOf(r.entries) : [];
  const warningsOf = (i: number) => night?.warnings.filter((w) => w.tanda === i) ?? [];

  const levelChip = (e: ImportEntry) => {
    const level: MatchLevel = e.match?.level ?? "none";
    return (
      <span className="import-level" data-level={level} data-testid="import-level">
        {tx(LEVEL_KEY[level])}
        {e.match ? ` · ${Math.round(e.match.confidence * 100)}%` : ""}
      </span>
    );
  };
  const sideLine = (e: ImportEntry) => {
    const s = e.song;
    const by = s ? [s.orchestra, s.singer, s.year].filter(Boolean).join(" · ") : e.item.artists.join(", ");
    const from = !e.match
      ? e.item.spotifyUri
        ? tx("import.plays_from_spotify")
        : e.item.youtubeId
          ? tx("import.plays_from_youtube")
          : tx("import.no_stream")
      : e.match.corrected
        ? tx("import.read_as", { text: `${e.item.title} – ${e.item.artists.join(", ")}` })
        : "";
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {levelChip(e)}
        <span className="min-w-0 truncate">{by}</span>
        {from && <span className="text-[var(--label-3)]">{from}</span>}
      </span>
    );
  };
  const rowMenu = (k: number, e: ImportEntry, first: boolean) => (
    <Menu
      label={tx("import.row_actions", { title: e.song?.title ?? e.item.title })}
      items={[
        !first && {
          label: tx("import.split_here"),
          icon: Scissors,
          onClick: () => edit(splitBefore(r!.entries, k)),
        },
        {
          label: tx("import.mark_cortina"),
          icon: Radio,
          onClick: () => edit(setRole(r!.entries, k, "cortina")),
        },
        {
          label: tx("import.leave_out"),
          icon: Undo2,
          destructive: true,
          onClick: () => edit(setRole(r!.entries, k, "skip")),
        },
      ]}
    />
  );

  return (
    <section
      className="import-drop mx-auto max-w-[760px]"
      aria-label={tx("import.title")}
      data-dragging={dragging || undefined}
      onDragOver={(e) => {
        if (view.kind === "review") return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (view.kind === "review") return;
        e.preventDefault();
        setDragging(false);
        fromFiles([...e.dataTransfer.files]);
      }}
    >
      <PageHeader
        title={r ? r.name || tx("import.imported_night") : tx("import.title")}
        subtitle={
          counts
            ? tx("import.summary", {
                matched: fmtNumber(counts.matched),
                sides: fmtNumber(counts.sides),
                tandas: fmtNumber(counts.tandas),
                cortinas: fmtNumber(counts.cortinas),
              })
            : tx("import.subtitle")
        }
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="sr-only"
        aria-label={tx("import.choose_file")}
        data-testid="import-file-input"
        onChange={(e) => {
          fromFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <input
        ref={(el) => {
          folderInput.current = el;
          el?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        multiple
        className="sr-only"
        aria-label={tx("import.choose_folder")}
        data-testid="import-folder-input"
        onChange={(e) => {
          fromFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {(view.kind === "pick" || view.kind === "error") && (
        <>
          {/* (QA fix 2026-11: the control sat 20 px in where every card starts at 16) */}
          <div className="mb-3">
            <Segmented
              size="large"
              label={tx("import.source")}
              value={source}
              items={[
                ["spotify", tx("import.src_spotify")],
                ["youtube", tx("import.src_youtube")],
                ["file", tx("import.src_file")],
                ["text", tx("import.src_text")],
              ]}
              onChange={(k) => {
                setSource(k);
                if (view.kind === "error") setView({ kind: "pick" });
              }}
            />
          </div>
          {view.kind === "error" && (
            <Group>
              <div className="cell" role="alert" data-testid="import-error">
                <CircleAlert size={18} className="shrink-0 text-[var(--destructive)]" aria-hidden />
                <span className="min-w-0 flex-1">{view.message}</span>
                {view.login && (
                  <a className="btn btn-plain min-h-11" href={view.login}>
                    {tx("import.connect")}
                  </a>
                )}
              </div>
            </Group>
          )}

          {(source === "spotify" || source === "youtube") && (
            <>
              <Group
                header={tx("import.paste_link")}
                footer={
                  source === "spotify" ? tx("import.spotify_link_foot") : tx("import.youtube_link_foot")
                }
              >
                <form
                  className="cell gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (link.trim()) fromService(source, link.trim());
                  }}
                >
                  <Link2 size={18} className="shrink-0 text-[var(--label-2)]" aria-hidden />
                  <input
                    className="field min-w-0 flex-1"
                    placeholder={
                      source === "spotify"
                        ? "https://open.spotify.com/playlist/…"
                        : "https://music.youtube.com/playlist?list=…"
                    }
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={tx("import.playlist_link")}
                    data-testid="import-link"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary min-h-[44px]"
                    disabled={!link.trim()}
                    data-testid="import-link-go"
                  >
                    {tx("import.import")}
                  </button>
                </form>
              </Group>
              <Group
                header={source === "spotify" ? tx("import.my_spotify") : tx("import.my_youtube")}
                footer={
                  source === "spotify" && signedIn === false
                    ? tx("import.spotify_signed_out_foot")
                    : source === "youtube"
                      ? tx("import.youtube_foot")
                      : tx("import.spotify_foot")
                }
                data-testid="import-my-lists"
              >
                {lists?.kind === source ? (
                  lists.items.length ? (
                    lists.items.map((p) => (
                      <TipRow
                        key={p.id}
                        tile={
                          p.image ? (
                            // biome-ignore lint/performance/noImgElement: a service's thumbnail, any host
                            <img src={p.image} alt="" className="tile object-cover" width={30} height={30} />
                          ) : (
                            <Tile color="var(--tint)">
                              <ListMusic size={16} strokeWidth={2} />
                            </Tile>
                          )
                        }
                        label={p.name}
                        sub={[tx("import.n_songs", { count: fmtNumber(p.total) }), p.owner]
                          .filter(Boolean)
                          .join(" · ")}
                        chevron
                        onClick={() => fromService(source, p.url)}
                        data-testid="import-my-list"
                      />
                    ))
                  ) : (
                    <TipRow label={tx("import.no_playlists")} />
                  )
                ) : source === "spotify" && signedIn === false ? (
                  <TipRow
                    label={tx("import.connect_spotify")}
                    chevron
                    onClick={() => router.push("/settings#connections")}
                  />
                ) : (
                  <TipRow
                    tile={
                      <Tile color="var(--tint)">
                        <ListMusic size={16} strokeWidth={2} />
                      </Tile>
                    }
                    label={tx("import.show_my_playlists")}
                    busy={listsBusy}
                    chevron
                    onClick={() => void loadLists(source)}
                    data-testid="import-show-lists"
                  />
                )}
              </Group>
            </>
          )}

          {source === "file" && (
            <Group
              header={tx("import.from_files")}
              footer={dragging ? tx("import.drop_now") : tx("import.files_foot")}
            >
              <TipRow
                tile={
                  <Tile color="#ff9500">
                    <FileUp size={16} strokeWidth={2} />
                  </Tile>
                }
                label={tx("import.choose_file")}
                sub={tx("import.file_formats")}
                chevron
                onClick={() => fileInput.current?.click()}
                data-testid="import-choose-file"
              />
              <TipRow
                tile={
                  <Tile color="#5856d6">
                    <FolderOpen size={16} strokeWidth={2} />
                  </Tile>
                }
                label={tx("import.choose_folder")}
                sub={tx("import.folder_sub")}
                chevron
                onClick={() => folderInput.current?.click()}
              />
            </Group>
          )}

          {source === "text" && (
            <Group header={tx("import.paste_list")} footer={tx("import.text_foot")}>
              <label htmlFor="import-text" className="cell">
                <span className="sr-only">{tx("import.paste_list")}</span>
                <textarea
                  id="import-text"
                  className="field min-h-[180px] resize-y leading-[1.4]"
                  placeholder={tx("import.text_placeholder")}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  spellCheck={false}
                  data-testid="import-text"
                />
              </label>
              <ActionRow
                label={
                  <span className="inline-flex items-center gap-2">
                    <ClipboardList size={16} aria-hidden /> {tx("import.match_list")}
                  </span>
                }
                disabled={!text.trim()}
                onClick={fromText}
                id="import-text-go"
              />
            </Group>
          )}
        </>
      )}

      {view.kind === "loading" && (
        <p
          className="text-subhead flex items-center justify-center gap-2 py-10 text-[var(--label-2)]"
          role="status"
          data-testid="import-loading"
        >
          <LoaderCircle size={18} className="animate-spin" aria-hidden /> {view.message}
        </p>
      )}

      {r && night && counts && (
        <>
          <Group footer={tx("import.keep_foot")} data-testid="import-actions">
            <FieldRow label={tx("import.night_name")} id="import-name">
              <input
                id="import-name"
                className="field min-w-0 flex-1 text-right"
                value={r.name}
                maxLength={120}
                onChange={(e) => setViewState({ ...r, name: e.target.value })}
                data-testid="import-name"
              />
            </FieldRow>
            {r.source.playlistId && (
              <SwitchRow
                label={tx("import.keep_linked")}
                sub={tx("import.keep_linked_sub")}
                checked={linked}
                onChange={setLinked}
              />
            )}
            <div className="cell flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary min-h-[44px] flex-1"
                onClick={() => keep("compose")}
                disabled={!counts.tandas}
                data-testid="import-open-compose"
              >
                {tx("import.open_in_compose")}
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-[44px] flex-1"
                onClick={() => keep("booth")}
                disabled={!counts.tandas}
                data-testid="import-play-booth"
              >
                {tx("import.play_in_booth")}
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-[44px] flex-1"
                onClick={() => keep("room")}
                disabled={!counts.tandas}
                data-testid="import-start-room"
              >
                <Users size={16} aria-hidden /> {tx("import.start_room")}
              </button>
            </div>
          </Group>

          <Group
            header={tx("import.found_header")}
            footer={
              learnOn ? (learned ? tx("import.learned") : tx("import.learn_foot")) : tx("import.learn_off")
            }
          >
            <TipRow
              label={tx("import.found_line", {
                sure: fmtNumber(counts.sure),
                likely: fmtNumber(counts.likely),
                guess: fmtNumber(counts.guess),
                external: fmtNumber(counts.external),
              })}
              sub={r.skipped ? tx("import.skipped_rows", { count: fmtNumber(r.skipped) }) : undefined}
            />
            <TipRow
              tile={
                <Tile color="var(--system-gold)">
                  <Sparkles size={16} strokeWidth={2} />
                </Tile>
              }
              label={learned ? tx("import.learned_short") : tx("import.learn")}
              disabled={!learnOn || learned}
              onClick={learn}
              data-testid="import-learn"
            />
          </Group>

          {r.entries.map((e, k) =>
            e.role === "opening" ? (
              <Group key={`o${k}`} header={tx("import.opening")}>
                <TipRow
                  tile={<RhythmTile rhythm="tango" label={rhythmWord("tango")} />}
                  label={e.song?.title ?? e.item.title}
                  sub={sideLine(e)}
                  data-testid="import-opening"
                />
              </Group>
            ) : null,
          )}

          {groups.map((g, i) => {
            const t = night.playlist.tandas[i];
            if (!t) return null;
            const warns = warningsOf(i);
            // every row from this tanda's first side to the next tanda's: its sides, its cortina, what was left out
            const end = groups[i + 1]?.[0] ?? r.entries.length;
            const rows: number[] = [];
            for (let k = g[0]!; k < end; k++)
              if (r.entries[k]!.role !== "opening" && r.entries[k]!.role !== "closing") rows.push(k);
            return (
              <Group
                key={`t${i}-${g[0]}`}
                header={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {tx("import.tanda_n", { n: i + 1 })}
                    <TandaTypeBadge
                      rhythm={t.rhythm}
                      singer={t.singer}
                      vocal={t.vocal}
                      mixed={isMixedTanda(t)}
                    />
                  </span>
                }
                data-testid="import-tanda"
              >
                {warns.map((w) => (
                  <div
                    key={`${w.rule}-${w.text}`}
                    className="cell gap-2 text-[var(--label-2)]"
                    data-testid="import-warning"
                  >
                    <Info size={16} className="shrink-0 text-[var(--tint)]" aria-hidden />
                    <span className="text-footnote min-w-0 flex-1">{ruleText(w.message, w.text)}</span>
                  </div>
                ))}
                {rows.map((k) => {
                  const e = r.entries[k]!;
                  const n = g.indexOf(k);
                  if (e.role === "side")
                    return (
                      <div
                        key={k}
                        className="import-row cell gap-1 pr-1"
                        data-role={e.role}
                        data-testid="import-side"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="cell-label block truncate" lang="es">
                            {n + 1}. {e.song?.title ?? e.item.title}
                          </span>
                          <span className="text-footnote cell-sub block text-[var(--label-2)]">
                            {sideLine(e)}
                          </span>
                        </span>
                        {rowMenu(k, e, n === 0)}
                      </div>
                    );
                  const back = e.match?.kind === "cortina" || e.why ? "cortina" : "side";
                  return (
                    <div
                      key={k}
                      className="import-row import-cortina cell gap-1 pr-1"
                      data-role={e.role}
                      data-testid={e.role === "cortina" ? "import-cortina" : "import-skipped"}
                    >
                      <Radio size={16} className="shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="cell-label block truncate">
                          {e.role === "cortina" ? tx("import.cortina") : tx("import.left_out")} ·{" "}
                          {e.cortina?.title ?? e.item.title}
                        </span>
                        <span className="text-footnote cell-sub block">
                          {e.cortina?.artist ?? e.item.artists.join(", ")}
                          {e.why && e.role === "cortina" ? ` · ${tx(`import.why_${e.why}` as MsgKey)}` : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn-plain min-h-11 shrink-0 px-2 text-[var(--tint)]"
                        onClick={() => edit(setRole(r.entries, k, e.role === "skip" ? back : "side"))}
                        data-testid={e.role === "cortina" ? "import-not-cortina" : "import-put-back"}
                      >
                        {e.role === "cortina" ? tx("import.not_cortina") : tx("import.put_back")}
                      </button>
                    </div>
                  );
                })}
                {i < groups.length - 1 && (
                  <ActionRow
                    label={tx("import.merge_next")}
                    onClick={() => edit(mergeWithNext(r.entries, i))}
                    id={`import-merge-${i + 1}`}
                  />
                )}
              </Group>
            );
          })}

          {r.entries.map((e, k) =>
            e.role === "closing" ? (
              <Group key={`c${k}`} header={tx("import.closing")}>
                <TipRow
                  tile={<RhythmTile rhythm="tango" label={rhythmWord("tango")} />}
                  label={e.song?.title ?? e.item.title}
                  sub={sideLine(e)}
                  data-testid="import-closing"
                />
              </Group>
            ) : null,
          )}

          <Group>
            <ActionRow
              label={tx("import.start_over")}
              onClick={() => {
                ticket.current++;
                setViewState({ kind: "pick" });
              }}
            />
          </Group>
          <p className="section-foot">
            <Link href="/history" className="text-[var(--tint)]">
              {tx("import.history_link")}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
