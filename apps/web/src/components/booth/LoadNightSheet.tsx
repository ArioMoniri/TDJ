"use client";
import {
  ChevronRight,
  FileInput,
  FileText,
  Hand,
  ListMusic,
  ListRestart,
  ListVideo,
  Music2,
  Plug,
  Sparkles,
  Square,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { create } from "zustand";
import {
  clearBooth,
  loadAfterThisSong,
  loadNight,
  nightLive,
  resetBooth,
  useBoothLoad,
} from "@/lib/booth/loadNight";
import { useBooth, useRoomCaps } from "@/lib/booth/store";
import { FEATURED, type FeaturedId, loadFeatured } from "@/lib/featured";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { Group } from "../Form";
import { Menu } from "../Menu";
import { Sheet } from "../Sheet";

type Pick = { playlist: Playlist; historyId?: string | null } | { go: string };

/**
 * 2026-11 (the owner: "a clear or reset button for the Booth, to add another playlist to play"; then "Import from
 * Spotify in the Booth tab is not seen … you can't reset or close the night or import other nights"). The Booth's
 * night, always within reach:
 *
 * - the Night menu in the Booth's header (NightMenu): Load a night…, Import from Spotify, Import another way, Reset the
 *   night, Clear the Booth / Close the night;
 * - "Load a night…" (LoadNightSheet): tonight's night (Compose's), the recent nights (History), the featured nights,
 *   Import (Spotify — a link or one of your playlists —, YouTube, a DJ app's file, pasted text, connectors: the
 *   import's "Play in the Booth" brings it straight here), Build by hand, Compose a new night, and Clear;
 * - the Booth with no night shows the same choices in place (LoadNightChoices).
 *
 * Mid-night a load asks first (now, or after the current song); Clear / Close and Reset ask first (the music stops,
 * as Stop asks) and Undo brings the night back where it was (lib/booth/loadNight.ts). Going to Import never stops
 * the night: the import's own "Play in the Booth" asks then.
 */
export const useNightUi = create<{ load: boolean; ask: "clear" | "reset" | null }>(() => ({
  load: false,
  ask: null,
}));
export const openLoadNight = () => useNightUi.setState({ load: true });
/** Clear / Close: mid-night it asks first, else it clears at once (Undo in the toast) */
export function askClearBooth() {
  if (nightLive()) useNightUi.setState({ load: false, ask: "clear" });
  else {
    useNightUi.setState({ load: false });
    void clearBooth();
  }
}
/** Reset: mid-night it asks first */
export function askResetBooth() {
  if (nightLive()) useNightUi.setState({ load: false, ask: "reset" });
  else void resetBooth();
}

/** the Booth holds a night now */
function useLoaded() {
  const cleared = useBoothLoad((s) => s.cleared);
  const booth = useBooth((s) => s.playlist);
  return !!booth && !cleared;
}
function useLive() {
  return useBooth((s) => s.started && s.state !== "stopped" && s.state !== "idle");
}

/** The Booth header's Night menu: every way to load, import, reset or close the night, in one place */
export function NightMenu() {
  const router = useRouter();
  const loaded = useLoaded();
  const live = useLive();
  return (
    <Menu
      label={t("nights.menu")}
      tip={t("nights.menu_tip")}
      className="btn btn-plain booth-night-btn min-h-11 gap-1.5 px-3"
      items={[
        { label: t("booth.load.menu"), icon: ListMusic, onClick: openLoadNight, testId: "booth-night-load" },
        {
          label: t("nights.import_spotify"),
          icon: Music2,
          onClick: () => router.push("/import?from=spotify"),
          testId: "booth-night-spotify",
        },
        {
          label: t("nights.import_other"),
          icon: FileInput,
          onClick: () => router.push("/import"),
          testId: "booth-night-import",
        },
        {
          label: t("nights.reset"),
          icon: ListRestart,
          onClick: askResetBooth,
          disabled: !loaded,
          subtitle: t("nights.reset_sub"),
          testId: "booth-night-reset",
        },
        {
          label: live ? t("nights.close") : t("booth.load.clear"),
          icon: Square,
          destructive: true,
          onClick: askClearBooth,
          disabled: !loaded,
          subtitle: live ? t("nights.close_sub") : undefined,
          testId: "booth-night-clear",
        },
      ]}
    >
      <ListMusic size={18} strokeWidth={2} aria-hidden />
      <span>{t("nights.menu")}</span>
    </Menu>
  );
}

/** "Load a night…" as a list: the sheet's body, and the Booth's empty state in place */
export function LoadNightChoices({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  const compose = useStore((s) => s.playlist);
  const history = useStore((s) => s.history);
  const cleared = useBoothLoad((s) => s.cleared);
  const booth = useBooth((s) => s.playlist);
  const [ask, setAsk] = useState<Pick | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const close = () => {
    setAsk(null);
    useNightUi.setState({ load: false });
  };
  const run = async (p: Pick, when: "now" | "after" = "now") => {
    close();
    // Import, Build and Compose are other pages: the night that plays keeps playing (their own "Play in the
    // Booth" asks first)
    if ("go" in p) return router.push(p.go);
    if (when === "after") loadAfterThisSong(p.playlist);
    else await loadNight(p.playlist, { historyId: p.historyId });
  };
  // mid-night every load asks first
  const pick = (p: Pick) => ("go" in p || !nightLive() ? void run(p) : setAsk(p));
  const featured = async (id: FeaturedId) => {
    setBusy(id);
    try {
      pick({ playlist: await loadFeatured(id), historyId: null });
    } catch {
      toast(t("booth.load.failed"));
    } finally {
      setBusy(null);
    }
  };
  const recent = history.slice(0, inline ? 5 : 8);
  const loaded = !!booth && !cleared;
  const pre = inline ? "booth-empty" : "booth-load";
  return (
    <>
      {compose && (cleared || compose.id !== booth?.id) && (
        <Group header={t("booth.load.tonight")}>
          <Row
            title={compose.name || t("booth.load.untitled")}
            sub={t("booth.load.tandas", { n: compose.tandas.length })}
            onClick={() => pick({ playlist: compose })}
            testId={`${pre}-tonight`}
          />
        </Group>
      )}
      {recent.length > 0 && (
        <Group header={t("booth.load.recent")}>
          {recent.map((h, i) => (
            <Row
              key={h.id}
              title={h.title || h.playlist.name}
              sub={t("booth.load.tandas", { n: h.playlist.tandas.length })}
              onClick={() => pick({ playlist: h.playlist, historyId: h.id })}
              testId={`${pre}-history-${i}`}
            />
          ))}
        </Group>
      )}
      <Group header={t("booth.load.featured")}>
        {FEATURED.map((f) => (
          <Row
            key={f.id}
            title={f.title}
            sub={busy === f.id ? t("booth.load.loading") : f.sub}
            onClick={() => void featured(f.id)}
            testId={`${pre}-featured-${f.id}`}
          />
        ))}
      </Group>
      <Group header={t("booth.load.bring_in")} footer={t("booth.load.bring_in_footer")}>
        <Row
          icon={<Music2 size={18} aria-hidden />}
          title={t("nights.import_spotify")}
          sub={t("nights.import_spotify_sub")}
          onClick={() => pick({ go: "/import?from=spotify" })}
          testId={`${pre}-spotify`}
        />
        <Row
          icon={<ListVideo size={18} aria-hidden />}
          title={t("nights.import_youtube")}
          onClick={() => pick({ go: "/import?from=youtube" })}
          testId={`${pre}-youtube`}
        />
        <Row
          icon={<FileInput size={18} aria-hidden />}
          title={t("nights.import_file")}
          sub={t("nights.import_file_sub")}
          onClick={() => pick({ go: "/import?from=file" })}
          testId={`${pre}-import`}
        />
        <Row
          icon={<FileText size={18} aria-hidden />}
          title={t("nights.import_text")}
          onClick={() => pick({ go: "/import?from=text" })}
          testId={`${pre}-text`}
        />
        <Row
          icon={<Plug size={18} aria-hidden />}
          title={t("nights.connectors")}
          sub={t("nights.connectors_sub")}
          onClick={() => pick({ go: "/settings#connectors" })}
          testId={`${pre}-connectors`}
        />
        <Row
          icon={<Hand size={18} aria-hidden />}
          title={t("booth.load.build")}
          onClick={() => pick({ go: "/build" })}
          testId={`${pre}-build`}
        />
        <Row
          icon={<Sparkles size={18} aria-hidden />}
          title={t("booth.load.compose")}
          onClick={() => pick({ go: "/" })}
          testId={`${pre}-compose`}
        />
      </Group>
      {loaded && !inline && (
        <Group footer={t("booth.load.clear_footer")}>
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
            onClick={askClearBooth}
            data-testid="booth-load-clear"
          >
            {t("booth.load.clear")}
          </button>
        </Group>
      )}
      {/* mid-night: replace the playing night now, or once the room's song has played out */}
      <Sheet
        open={!!ask}
        onClose={() => setAsk(null)}
        title={t("booth.load.replace_title")}
        detents={["medium"]}
        testId="booth-load-replace"
        hideCancel
      >
        <Group footer={t("booth.load.replace_footer")}>
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold"
            data-autofocus
            onClick={() => setAsk(null)}
            data-testid="booth-load-replace-cancel"
          >
            {t("booth.sheets.cancel")}
          </button>
          {ask && !("go" in ask) && (
            <button
              type="button"
              className="cell cell-tap w-full justify-center font-semibold text-[var(--tint)]"
              onClick={() => ask && void run(ask, "after")}
              data-testid="booth-load-after"
            >
              {t("booth.load.after_this_song")}
            </button>
          )}
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
            onClick={() => ask && void run(ask, "now")}
            data-testid="booth-load-now"
          >
            {t("booth.load.now")}
          </button>
        </Group>
      </Sheet>
    </>
  );
}

/** "Load a night…" and the Booth's asks (Clear / Close, Reset mid-night); mounted once on the Booth page */
export function LoadNightSheet() {
  const open = useNightUi((s) => s.load);
  const ask = useNightUi((s) => s.ask);
  const canFade = useRoomCaps().fade;
  const done = () => useNightUi.setState({ ask: null, load: false });
  const reset = ask === "reset";
  return (
    <>
      <Sheet
        open={open && !ask}
        onClose={() => useNightUi.setState({ load: false })}
        title={t("booth.load.title")}
        detents={["large"]}
        testId="booth-load-sheet"
      >
        <LoadNightChoices />
      </Sheet>
      {/* Clear / Close or Reset mid-night: the music stops first, as Stop asks */}
      <Sheet
        open={!!ask}
        onClose={() => useNightUi.setState({ ask: null })}
        title={reset ? t("nights.reset_title") : t("nights.close_title")}
        detents={["medium"]}
        testId={reset ? "booth-reset-ask" : "booth-load-clear-ask"}
        hideCancel
      >
        <Group footer={reset ? t("nights.reset_footer") : t("nights.close_footer")}>
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold"
            data-autofocus
            onClick={() => useNightUi.setState({ ask: null })}
            data-testid="booth-ask-cancel"
          >
            {t("booth.sheets.cancel")}
          </button>
          {canFade && (
            <button
              type="button"
              className="cell cell-tap w-full justify-center font-semibold text-[var(--tint)]"
              onClick={() => {
                done();
                void (reset ? resetBooth({ fade: true }) : clearBooth({ fade: true }));
              }}
              data-testid={reset ? "booth-reset-fade" : "booth-load-clear-fade"}
            >
              {reset ? t("nights.reset_fade") : t("booth.load.clear_fade")}
            </button>
          )}
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
            onClick={() => {
              done();
              void (reset ? resetBooth() : clearBooth());
            }}
            data-testid={reset ? "booth-reset-now" : "booth-load-clear-now"}
          >
            {reset ? t("nights.reset_now") : t("booth.load.clear_now")}
          </button>
        </Group>
      </Sheet>
    </>
  );
}

function Row({
  title,
  sub,
  icon,
  onClick,
  testId,
}: {
  title: string;
  sub?: string;
  icon?: ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="cell cell-tap w-full gap-3 text-left"
      onClick={onClick}
      data-testid={testId}
    >
      {icon && <span className="flex-none text-[var(--tint)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {sub && <span className="text-footnote block truncate text-[var(--label-2)]">{sub}</span>}
      </span>
      <ChevronRight size={16} className="flex-none text-[var(--label-3)]" aria-hidden />
    </button>
  );
}
