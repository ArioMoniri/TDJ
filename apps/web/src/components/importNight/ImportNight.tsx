"use client";
import type { ImportEntry, ImportItem, ImportSource } from "@tdj/core";
import {
  ClipboardList,
  FileUp,
  Link2,
  ListMusic,
  ListPlus,
  LoaderCircle,
  LogIn,
  MonitorPlay,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { loadAfterThisSong, loadNight, nightLive } from "@/lib/booth/loadNight";
import { haptic } from "@/lib/haptics";
import { fmtNumber, t } from "@/lib/i18n";
import {
  FILE_ACCEPT,
  ImportError,
  keepImported,
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
import { startReview } from "@/lib/nightReview";
import { filterPlaylists, pagePlaylists, playlistLine } from "@/lib/playlistPicker";
import type { PlaylistSummary } from "@/lib/playlistSources";
import { hostedLoginUrl } from "@/lib/spotify";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { ActionRow, Group, Tile } from "../Form";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { TipRow } from "../TipRow";

/**
 * 2026-11 — "Import a night" (the owner: "the Import from Spotify in the Booth, Compose or History should show all the
 * user's playlists and allow importing from those"). One entry point on Compose, the Booth and History: a sheet with
 * the sources (the DJ's Spotify and YouTube playlists — searched, paged, each with its cover, its count and its owner —
 * a pasted link, a pasted list, a DJ app's file, and every other source and connector on the full Import page), read
 * and matched by the import flow (lib/importFlow.ts → /api/import/match, core playlistImport.ts) and kept in History.
 *
 * Where it lands:
 *   Compose — the night becomes tonight's night and the detailed review opens (ReviewPanel);
 *   the Booth — it loads, ready (mid-night it asks first: now or after the current song), and the Booth's short list of
 *     what matters most opens (ReviewBanner);
 *   History — it is listed there.
 *
 * Signed out of Spotify, the picker offers the sign-in and "use your own Spotify app" (Settings → Connections); the
 * auth code itself is not touched here. Self-contained: `<ImportNightSheet />` once per page, opened by
 * `openImportNight(target)` or `<ImportNightButton target=… />`.
 */
export type ImportTarget = "compose" | "booth" | "history";

export const useImportNight = create<{ target: ImportTarget | null }>(() => ({ target: null }));
export const openImportNight = (target: ImportTarget) => useImportNight.setState({ target });
const closeImportNight = () => useImportNight.setState({ target: null });

type Step =
  | { kind: "sources" }
  | { kind: "lists"; service: "spotify" | "youtube" }
  | { kind: "link" }
  | { kind: "text" }
  | { kind: "loading"; message: string }
  | { kind: "ask"; playlist: Playlist }
  | { kind: "error"; message: string; login?: string };

export function ImportNightButton({
  target,
  className = "btn btn-ghost min-h-[44px]",
  label,
}: {
  target: ImportTarget;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => openImportNight(target)}
      data-testid={`import-night-open-${target}`}
    >
      <ListPlus size={16} aria-hidden /> {label ?? t("importNight.entry")}
    </button>
  );
}

export function ImportNightSheet() {
  const target = useImportNight((s) => s.target);
  const router = useRouter();
  const path = usePathname() || "/";
  const [step, setStep] = useState<Step>({ kind: "sources" });
  const [lists, setLists] = useState<{ service: "spotify" | "youtube"; items: PlaylistSummary[] } | null>(
    null,
  );
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState(1);
  const [link, setLink] = useState("");
  const [text, setText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const ticket = useRef(0);

  useEffect(() => {
    if (!target) return;
    setStep({ kind: "sources" });
    setQuery("");
    setPages(1);
    void spotifySignedIn().then(setSignedIn);
  }, [target]);

  const close = () => {
    ticket.current++;
    closeImportNight();
  };
  const fail = (e: unknown) => {
    const err = e as ImportError;
    setStep({ kind: "error", message: err.message || t("import.err_match"), login: err.login });
  };

  const showLists = async (service: "spotify" | "youtube") => {
    setStep({ kind: "lists", service });
    setQuery("");
    setPages(1);
    if (lists?.service === service) return;
    setLists(null);
    if (service === "spotify" && signedIn === false) return;
    const tk = ++ticket.current;
    try {
      const items = service === "spotify" ? await spotifyPlaylists() : await youtubePlaylists();
      if (tk === ticket.current) setLists({ service, items });
    } catch (e) {
      if (tk !== ticket.current) return;
      if ((e as ImportError).code === "signed_out" && service === "spotify") setSignedIn(false);
      else fail(e);
    }
  };

  /** the night in where the DJ asked for it */
  const land = async (p: Playlist, entries: ImportEntry[], night: ReturnType<typeof nightOf>) => {
    haptic(10);
    if (target === "compose") {
      keepImported(night, entries);
      startReview(p.id, "compose");
      close();
      toast(t("importNight.in_compose", { name: p.name }));
      if (path !== "/") router.push("/#result");
      else document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    keepImported(night, entries, { current: false });
    if (target === "history") {
      close();
      toast(t("import.kept", { name: p.name }));
      return;
    }
    // the Booth: mid-night it asks first, as every load does
    if (nightLive()) {
      setStep({ kind: "ask", playlist: p });
      return;
    }
    close();
    await loadNight(p);
    startReview(p.id, "booth");
  };

  const run = async (
    read: () => Promise<{
      name: string;
      items?: ImportItem[];
      entries?: ImportEntry[];
      source: Omit<ImportSource, "at">;
    }>,
  ) => {
    const tk = ++ticket.current;
    setStep({ kind: "loading", message: t("import.reading") });
    try {
      const r = await read();
      let entries = r.entries;
      if (!entries) {
        if (!r.items?.length) throw new ImportError("empty", t("import.err_empty"));
        if (tk !== ticket.current) return;
        setStep({ kind: "loading", message: t("import.matching", { count: fmtNumber(r.items.length) }) });
        entries = await matchItems(r.items);
      }
      if (tk !== ticket.current) return;
      const source = { ...r.source, at: new Date().toISOString() } as ImportSource;
      const night = nightOf(entries, r.name, { ...source, ...(source.playlistId ? { linked: true } : {}) });
      if (!night.counts.tandas) throw new ImportError("empty", t("import.err_empty"));
      await land(night.playlist, entries, night);
    } catch (e) {
      if (tk === ticket.current) fail(e);
    }
  };
  const fromService = (service: "spotify" | "youtube", value: string) =>
    void run(async () => {
      const p = service === "spotify" ? await readSpotify(value) : await readYoutube(value);
      return {
        name: p.name,
        items: p.items,
        source: { service, playlistId: p.id, url: p.url, name: p.name },
      };
    });
  const fromFiles = (files: File[]) => {
    if (!files.length) return;
    void run(async () => {
      const parsed = await readFiles(files);
      const src = { service: "file" as const, format: parsed.format, name: parsed.name };
      if (parsed.night) return { name: parsed.night.name, entries: await resolveNight(parsed), source: src };
      return { name: parsed.name, items: parsed.items, source: src };
    });
  };
  const fromText = () =>
    void run(async () => {
      const { parseTextList } = await import("@tdj/core");
      const p = parseTextList(text, t("import.pasted_list"));
      return { name: p.name, items: p.items, source: { service: "text", format: "text", name: p.name } };
    });

  const shown = useMemo(() => filterPlaylists(lists?.items ?? [], query), [lists, query]);
  const page = pagePlaylists(shown, pages);
  const title =
    target === "booth"
      ? t("importNight.title_booth")
      : target === "history"
        ? t("importNight.title_history")
        : t("importNight.title_compose");
  const back =
    step.kind !== "sources" && step.kind !== "loading" && step.kind !== "ask" ? (
      <ActionRow label={t("importNight.back")} onClick={() => setStep({ kind: "sources" })} />
    ) : null;

  return (
    <Sheet open={!!target} onClose={close} title={title} detents={["large"]} testId="import-night-sheet">
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="sr-only"
        aria-label={t("import.choose_file")}
        data-testid="import-night-file"
        onChange={(e) => {
          fromFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {step.kind === "sources" && (
        <>
          <Group header={t("importNight.from_services")} footer={t("importNight.from_services_foot")}>
            <TipRow
              tile={
                <Tile color="#1db954">
                  <ListMusic size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("import.my_spotify")}
              sub={signedIn === false ? t("importNight.spotify_signed_out") : t("importNight.spotify_sub")}
              chevron
              onClick={() => void showLists("spotify")}
              data-testid="import-night-spotify"
            />
            <TipRow
              tile={
                <Tile color="#ff0033">
                  <MonitorPlay size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("import.my_youtube")}
              sub={t("importNight.youtube_sub")}
              chevron
              onClick={() => void showLists("youtube")}
              data-testid="import-night-youtube"
            />
            <TipRow
              tile={
                <Tile color="var(--tint)">
                  <Link2 size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("import.paste_link")}
              sub={t("importNight.link_sub")}
              chevron
              onClick={() => setStep({ kind: "link" })}
              data-testid="import-night-link"
            />
          </Group>
          <Group header={t("importNight.other_sources")} footer={t("importNight.other_sources_foot")}>
            <TipRow
              tile={
                <Tile color="#5856d6">
                  <ClipboardList size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("import.paste_list")}
              chevron
              onClick={() => setStep({ kind: "text" })}
              data-testid="import-night-text"
            />
            <TipRow
              tile={
                <Tile color="#ff9500">
                  <FileUp size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("importNight.dj_file")}
              sub={t("import.file_formats")}
              chevron
              onClick={() => fileInput.current?.click()}
              data-testid="import-night-choose-file"
            />
            <TipRow
              tile={
                <Tile color="#8e8e93">
                  <Settings2 size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("importNight.more_sources")}
              sub={t("importNight.more_sources_sub")}
              chevron
              onClick={() => {
                close();
                router.push("/import");
              }}
              data-testid="import-night-more"
            />
          </Group>
        </>
      )}

      {step.kind === "lists" && (
        <>
          {step.service === "spotify" && signedIn === false ? (
            <Group header={t("import.my_spotify")} footer={t("importNight.signin_foot")}>
              <TipRow
                tile={
                  <Tile color="#1db954">
                    <LogIn size={16} strokeWidth={2} />
                  </Tile>
                }
                label={t("importNight.signin_spotify")}
                chevron
                onClick={() => {
                  location.href = hostedLoginUrl(path);
                }}
                data-testid="import-night-signin"
              />
              <TipRow
                tile={
                  <Tile color="#8e8e93">
                    <Settings2 size={16} strokeWidth={2} />
                  </Tile>
                }
                label={t("importNight.own_app")}
                sub={t("importNight.own_app_sub")}
                chevron
                onClick={() => {
                  close();
                  router.push("/settings#connector-spotify");
                }}
                data-testid="import-night-own-app"
              />
            </Group>
          ) : (
            <>
              <div className="mb-3 px-1">
                <SearchField
                  id="import-night-search"
                  value={query}
                  onChange={(v) => {
                    setQuery(v);
                    setPages(1);
                  }}
                  placeholder={t("importNight.search_placeholder")}
                  label={t("importNight.search_label")}
                  busy={!lists}
                />
              </div>
              <Group
                header={step.service === "spotify" ? t("import.my_spotify") : t("import.my_youtube")}
                footer={
                  lists
                    ? t("importNight.lists_count", {
                        shown: fmtNumber(page.visible.length),
                        total: fmtNumber(shown.length),
                      })
                    : undefined
                }
                data-testid="import-night-lists"
              >
                {!lists ? (
                  <p
                    className="cell gap-2 text-[var(--label-2)]"
                    role="status"
                    data-testid="import-night-lists-loading"
                  >
                    <LoaderCircle size={16} className="animate-spin" aria-hidden />{" "}
                    {t("importNight.loading_lists")}
                  </p>
                ) : page.visible.length ? (
                  page.visible.map((p) => (
                    <TipRow
                      key={p.id}
                      tile={
                        p.image ? (
                          // biome-ignore lint/performance/noImgElement: a service's cover, any host
                          <img src={p.image} alt="" className="tile object-cover" width={30} height={30} />
                        ) : (
                          <Tile color="var(--tint)">
                            <ListMusic size={16} strokeWidth={2} />
                          </Tile>
                        )
                      }
                      label={p.name}
                      sub={playlistLine(p, (n) => t("import.n_songs", { count: fmtNumber(n) }))}
                      chevron
                      onClick={() => fromService(step.service, p.url)}
                      data-testid="import-night-list"
                    />
                  ))
                ) : (
                  <TipRow label={query ? t("importNight.no_match") : t("import.no_playlists")} />
                )}
                {page.more > 0 && (
                  <ActionRow
                    label={t("importNight.show_more", { count: fmtNumber(page.more) })}
                    onClick={() => setPages((n) => n + 1)}
                    id="import-night-more-lists"
                  />
                )}
              </Group>
            </>
          )}
          {back && <Group>{back}</Group>}
        </>
      )}

      {step.kind === "link" && (
        <Group header={t("import.paste_link")} footer={t("importNight.link_foot")}>
          <form
            className="cell gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = link.trim();
              if (!v) return;
              fromService(/youtu/i.test(v) || /^(PL|OL|RD)/.test(v) ? "youtube" : "spotify", v);
            }}
          >
            <Link2 size={18} className="shrink-0 text-[var(--label-2)]" aria-hidden />
            <input
              className="field min-w-0 flex-1"
              placeholder="https://open.spotify.com/playlist/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("import.playlist_link")}
              data-testid="import-night-link-field"
            />
            <button type="submit" className="btn btn-primary min-h-[44px]" disabled={!link.trim()}>
              {t("import.import")}
            </button>
          </form>
          {back}
        </Group>
      )}

      {step.kind === "text" && (
        <Group header={t("import.paste_list")} footer={t("import.text_foot")}>
          <label htmlFor="import-night-text" className="cell">
            <span className="sr-only">{t("import.paste_list")}</span>
            <textarea
              id="import-night-text"
              className="field min-h-[160px] resize-y leading-[1.4]"
              placeholder={t("import.text_placeholder")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              data-testid="import-night-text-field"
            />
          </label>
          <ActionRow
            label={t("import.match_list")}
            disabled={!text.trim()}
            onClick={fromText}
            id="import-night-text-go"
          />
          {back}
        </Group>
      )}

      {step.kind === "loading" && (
        <p
          className="text-subhead flex items-center justify-center gap-2 py-10 text-[var(--label-2)]"
          role="status"
          data-testid="import-night-loading"
        >
          <LoaderCircle size={18} className="animate-spin" aria-hidden /> {step.message}
        </p>
      )}

      {step.kind === "ask" && (
        <Group header={t("booth.load.replace_title")} footer={t("booth.load.replace_footer")}>
          <ActionRow
            label={t("booth.load.now")}
            id="import-night-load-now"
            onClick={() => {
              const p = step.playlist;
              close();
              void loadNight(p).then(() => startReview(p.id, "booth"));
            }}
          />
          <ActionRow
            label={t("booth.load.after_this_song")}
            id="import-night-load-after"
            onClick={() => {
              const p = step.playlist;
              close();
              loadAfterThisSong(p);
              startReview(p.id, "booth");
            }}
          />
        </Group>
      )}

      {step.kind === "error" && (
        <>
          <Group>
            <div className="cell" role="alert" data-testid="import-night-error">
              <span className="min-w-0 flex-1">{step.message}</span>
              {step.login && (
                <a className="btn btn-plain min-h-11" href={step.login}>
                  {t("import.connect")}
                </a>
              )}
            </div>
          </Group>
          <Group>
            <ActionRow label={t("importNight.back")} onClick={() => setStep({ kind: "sources" })} />
          </Group>
        </>
      )}
      <p className="section-foot">
        <Link href="/history" className="text-[var(--tint)]" onClick={close}>
          {t("import.history_link")}
        </Link>
      </p>
    </Sheet>
  );
}
