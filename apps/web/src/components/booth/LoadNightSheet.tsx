"use client";
import { ChevronRight, FileInput, Hand, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { clearBooth, loadAfterThisSong, loadNight, nightLive, useBoothLoad } from "@/lib/booth/loadNight";
import { useBooth, useRoomCaps } from "@/lib/booth/store";
import { FEATURED, type FeaturedId, loadFeatured } from "@/lib/featured";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { Group } from "../Form";
import { Sheet } from "../Sheet";

type Pick = { playlist: Playlist; historyId?: string | null } | { go: string };

/**
 * 2026-11 (the owner: "a clear or reset button for the Booth, to add another playlist to play"): "Load a night…" —
 * tonight's night (Compose's), the recent nights (History), the featured nights, Import (Spotify, YouTube, a DJ app's
 * file, pasted text: the import's "Play in the Booth" brings it straight here), Build by hand and Compose a new
 * night; and "Clear the Booth". Mid-night a load asks first (now, or after the current song) and a clear stops the
 * music first, as Stop does (lib/booth/loadNight.ts).
 */
export function LoadNightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const compose = useStore((s) => s.playlist);
  const history = useStore((s) => s.history);
  const cleared = useBoothLoad((s) => s.cleared);
  const booth = useBooth((s) => s.playlist);
  const canFade = useRoomCaps().fade;
  const [ask, setAsk] = useState<Pick | null>(null);
  const [askClear, setAskClear] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const close = () => {
    setAsk(null);
    setAskClear(false);
    onClose();
  };
  const run = async (p: Pick, when: "now" | "after" = "now") => {
    if ("go" in p) {
      if (nightLive()) await useBooth.getState().endNight();
      close();
      router.push(p.go);
      return;
    }
    close();
    if (when === "after") loadAfterThisSong(p.playlist);
    else await loadNight(p.playlist, { historyId: p.historyId });
  };
  // mid-night every load asks first
  const pick = (p: Pick) => (nightLive() ? setAsk(p) : void run(p));
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
  const recent = history.slice(0, 8);
  const loaded = !!booth && !cleared;
  return (
    <>
      <Sheet
        open={open && !ask && !askClear}
        onClose={close}
        title={t("booth.load.title")}
        detents={["large"]}
        testId="booth-load-sheet"
      >
        {compose && (cleared || compose.id !== booth?.id) && (
          <Group header={t("booth.load.tonight")}>
            <Row
              title={compose.name || t("booth.load.untitled")}
              sub={t("booth.load.tandas", { n: compose.tandas.length })}
              onClick={() => pick({ playlist: compose })}
              testId="booth-load-tonight"
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
                testId={`booth-load-history-${i}`}
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
              testId={`booth-load-featured-${f.id}`}
            />
          ))}
        </Group>
        <Group header={t("booth.load.bring_in")} footer={t("booth.load.bring_in_footer")}>
          <Row
            icon={<FileInput size={18} aria-hidden />}
            title={t("booth.load.import")}
            sub={t("booth.load.import_sub")}
            onClick={() => pick({ go: "/import" })}
            testId="booth-load-import"
          />
          <Row
            icon={<Hand size={18} aria-hidden />}
            title={t("booth.load.build")}
            onClick={() => pick({ go: "/build" })}
            testId="booth-load-build"
          />
          <Row
            icon={<Sparkles size={18} aria-hidden />}
            title={t("booth.load.compose")}
            onClick={() => pick({ go: "/" })}
            testId="booth-load-compose"
          />
        </Group>
        {loaded && (
          <Group footer={t("booth.load.clear_footer")}>
            <button
              type="button"
              className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
              onClick={() => {
                if (nightLive()) return setAskClear(true);
                close();
                void clearBooth();
              }}
              data-testid="booth-load-clear"
            >
              {t("booth.load.clear")}
            </button>
          </Group>
        )}
      </Sheet>
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
      {/* Clear mid-night: the music stops first, as Stop asks */}
      <Sheet
        open={askClear}
        onClose={() => setAskClear(false)}
        title={t("booth.load.clear_title")}
        detents={["medium"]}
        testId="booth-load-clear-ask"
        hideCancel
      >
        <Group footer={t("booth.load.clear_footer")}>
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold"
            data-autofocus
            onClick={() => setAskClear(false)}
          >
            {t("booth.sheets.cancel")}
          </button>
          {canFade && (
            <button
              type="button"
              className="cell cell-tap w-full justify-center font-semibold text-[var(--tint)]"
              onClick={() => {
                close();
                void clearBooth({ fade: true });
              }}
              data-testid="booth-load-clear-fade"
            >
              {t("booth.load.clear_fade")}
            </button>
          )}
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
            onClick={() => {
              close();
              void clearBooth();
            }}
            data-testid="booth-load-clear-now"
          >
            {t("booth.load.clear_now")}
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
