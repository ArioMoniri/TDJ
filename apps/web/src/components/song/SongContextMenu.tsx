"use client";
import { singerDisplay } from "@tdj/core";
import {
  AudioWaveform,
  Copy,
  Dna,
  Headphones,
  Info,
  ListMusic,
  ListPlus,
  type LucideIcon,
  Play,
  Repeat2,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { type Placement, placeMenu } from "@/lib/menuPlace";
import { boothNightRunning, openFind, tapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { measureFromFolder } from "@/lib/songMeasure";
import { closeSongMenu, type SongMenuOpen, useSongMenu } from "@/lib/songMenu";
import { dnaHref, inBooth, openSongDetails, useSongOpen } from "@/lib/songOpen";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist, Song } from "@/lib/types";
import { metaLine, yearText } from "@/lib/year";
import { AddToNight } from "../library/LibraryRow";
import { type MenuItem, MenuList } from "../Menu";
import { Sheet } from "../Sheet";
import { Artwork } from "../ui/Artwork";

interface Item extends MenuItem {
  key: string;
}

/** the menu's rows for one opening (pure but for the actions it runs) */
function itemsFor(
  o: SongMenuOpen,
  env: { dna: (song: Song) => void; addToTonight: ((song: Song) => void) | null },
): Item[] {
  const { spec, list } = o;
  const song = spec.song;
  const catalogue = !song.id.startsWith("ext:");
  const item: PlayItem = { kind: "song", song, where: list?.label };
  const headphones = boothNightRunning();
  const inList =
    !!list && list.items.length > 1 && list.items.some((x) => x.kind === "song" && x.song.id === song.id);
  const out: Array<Item | null> = [
    spec.play
      ? {
          key: "play",
          label: spec.play.label ?? t("songMenu.play"),
          icon: headphones ? Headphones : Play,
          onClick: spec.play.run,
          disabled: spec.play.disabled,
          subtitle: spec.play.subtitle,
        }
      : {
          key: "play",
          label: headphones ? t("songMenu.prelisten") : t("songMenu.play"),
          icon: headphones ? Headphones : Play,
          onClick: () => void tapPlay(item, list, { scope: "one", find: () => openFind(song) }),
        },
    spec.playFrom === false
      ? null
      : spec.playFrom
        ? {
            key: "play-from",
            label: spec.playFrom.label ?? t("play.play_from_here"),
            icon: ListMusic,
            onClick: spec.playFrom.run,
            disabled: spec.playFrom.disabled,
          }
        : inList && !headphones
          ? {
              key: "play-from",
              label: t("play.play_from_here"),
              icon: ListMusic,
              onClick: () => void tapPlay(item, list, { scope: "from", find: () => openFind(song) }),
            }
          : null,
    {
      key: "details",
      label: t("song.details"),
      icon: Info,
      shortcut: "i",
      onClick: () => (spec.details ? spec.details() : openSongDetails(song)),
    },
    catalogue ? { key: "dna", label: t("song.song_dna"), icon: Dna, onClick: () => env.dna(song) } : null,
    spec.swap
      ? {
          key: "swap",
          label: spec.swap.label ?? t("trackRow.swap"),
          icon: Repeat2,
          onClick: spec.swap.run,
          disabled: spec.swap.disabled,
          subtitle: spec.swap.subtitle,
        }
      : null,
    spec.insert
      ? {
          key: "insert",
          label: spec.insert.label ?? t("songMenu.insert"),
          icon: ListPlus,
          onClick: spec.insert.run,
          disabled: spec.insert.disabled,
          subtitle: spec.insert.subtitle,
        }
      : catalogue && !spec.noAddToTonight && env.addToTonight
        ? {
            key: "add",
            label: t("songMenu.add_to_tonight"),
            icon: ListPlus,
            onClick: () => env.addToTonight?.(song),
          }
        : null,
    {
      key: "find",
      label: t("trackRow.find_on_services"),
      icon: Search,
      onClick: () => (spec.find ? spec.find() : openFind(song)),
    },
    catalogue
      ? {
          key: "measure",
          label: t("song.measure_file"),
          icon: AudioWaveform,
          onClick: () => {
            if (!spec.measure) toast(t("songMenu.measuring", { title: song.title }));
            void (spec.measure ?? (() => measureFromFolder(song)))().then((why) => {
              if (why !== undefined) toast(why ?? t("song.measured_done"));
            });
          },
        }
      : null,
    {
      key: "copy",
      label: t("songMenu.copy_title"),
      icon: Copy,
      onClick: () => {
        const done = () => toast(t("songMenu.copied", { title: song.title }));
        try {
          void navigator.clipboard
            .writeText(song.title)
            .then(done)
            .catch(() => toast(t("songMenu.copy_failed")));
        } catch {
          toast(t("songMenu.copy_failed"));
        }
      },
    },
  ];
  return out.filter((x): x is Item => !!x).map((x) => ({ ...x, testId: `song-menu-${x.key}` }));
}

/**
 * 2026-11 — the one song menu (lib/songMenu.ts): a popover at the pointer on a right-click, a sheet with the side's
 * cover and name on a long press (and on a phone). Mounted once beside the app-wide song sheets; it stacks over the
 * Booth's sheets and the Song DNA overlay.
 */
export function SongContextMenu() {
  const open = useSongMenu((s) => s.open);
  const playlist = useStore((s) => s.playlist);
  const router = useRouter();
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  const [adding, setAdding] = useState<{ song: Song; playlist: Playlist } | null>(null);
  const items = useMemo(
    () =>
      open
        ? itemsFor(open, {
            dna: (song) => {
              const to = { kind: "song" as const, id: song.id };
              if (inBooth() || useSongOpen.getState().dna) useSongOpen.getState().openDna(to);
              else router.push(dnaHref(to));
            },
            addToTonight: playlist && !inBooth() ? (song) => setAdding({ song, playlist }) : null,
          })
        : [],
    [open, playlist, router],
  );
  const run = (it: MenuItem) => {
    if (it.disabled) return;
    const from = open?.from;
    closeSongMenu();
    it.onClick?.();
    // the keyboard comes back to the row it left (unless the action opened something that took it)
    setTimeout(() => {
      if (from?.isConnected && (document.activeElement === document.body || !document.activeElement))
        from.focus?.({ preventScroll: true });
    }, 0);
  };
  return (
    <>
      {open && (open.touch || isPhone) ? (
        <Sheet
          open
          onClose={() => {
            // the finger lifting off a long press is not a tap on the backdrop
            if (Date.now() - open.at > 400) closeSongMenu();
          }}
          title={open.spec.song.title}
          detents={["medium", "large"]}
          testId="song-menu-sheet"
        >
          <SheetHead song={open.spec.song} />
          <div role="menu" aria-label={t("songMenu.menu_of", { title: open.spec.song.title })}>
            <MenuList items={items} onPick={run} />
          </div>
        </Sheet>
      ) : open ? (
        <Popover key={open.at} open={open} items={items} onPick={run} />
      ) : null}
      {adding && (
        <AddToNight song={adding.song} playlist={adding.playlist} open onClose={() => setAdding(null)} />
      )}
    </>
  );
}

function SheetHead({ song }: { song: Song }) {
  return (
    <div className="mt-1 flex items-center gap-3 px-4" data-testid="song-menu-head">
      <Artwork src={null} song={song} orchestra={song.orchestra} orchestraId={song.orchestraId} />
      <div className="min-w-0 flex-1">
        <p className="text-headline truncate" lang="es">
          {song.title}
        </p>
        <p className="text-footnote truncate text-[var(--label-2)]" lang="es">
          {metaLine(
            song.orchestra,
            singerDisplay(song.singer) ?? t("song.instrumental"),
            yearText(song.year),
          )}
        </p>
      </div>
    </div>
  );
}

function Popover({
  open,
  items,
  onPick,
}: {
  open: SongMenuOpen;
  items: Item[];
  onPick: (it: MenuItem) => void;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<Placement | null>(null);
  const [focus, setFocus] = useState(0);
  useLayoutEffect(() => {
    const el = pop.current;
    const size = el
      ? { width: el.offsetWidth, height: el.scrollHeight }
      : { width: 260, height: items.length * 44 };
    setAt(
      placeMenu(
        { top: open.y, bottom: open.y, left: open.x, right: open.x },
        size,
        { width: document.documentElement.clientWidth, height: window.innerHeight },
        undefined,
        "left",
      ),
    );
  }, [open, items.length]);
  // the first row takes the focus (the keyboard is in the menu at once)
  useEffect(() => {
    pop.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
      ?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!pop.current?.contains(e.target as Node)) closeSongMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      const list = [...(pop.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
      if (e.key === "Escape" || e.key === "Tab") {
        // (capture: the sheet under the menu, or the DNA overlay, keeps its own Escape)
        e.preventDefault();
        e.stopPropagation();
        closeSongMenu();
        open.from?.focus?.({ preventScroll: true });
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
        e.preventDefault();
        e.stopPropagation();
        const live = list.filter((b) => !b.disabled);
        if (!live.length) return;
        const cur = live.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? live.length - 1
              : (cur + (e.key === "ArrowDown" ? 1 : -1) + live.length) % live.length;
        live[next]!.focus();
        setFocus(list.indexOf(live[next]!));
      }
    };
    const onMove = () => closeSongMenu();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("blur", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("blur", onMove);
    };
  }, [open.from]);
  return createPortal(
    <div
      ref={pop}
      role="menu"
      aria-label={t("songMenu.menu_of", { title: open.spec.song.title })}
      className="menu song-menu fixed"
      style={{ top: at?.top ?? open.y, left: at?.left ?? open.x, visibility: at ? "visible" : "hidden" }}
      data-testid="song-menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="menu-list"
        style={at?.maxHeight ? { maxHeight: at.maxHeight, overflowY: "auto" } : undefined}
      >
        {items.map((it, i) => (
          <MenuRow key={it.key} it={it} focused={focus === i} onPick={onPick} onHover={() => setFocus(i)} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function MenuRow({
  it,
  focused,
  onPick,
  onHover,
}: {
  it: Item;
  focused: boolean;
  onPick: (it: MenuItem) => void;
  onHover: () => void;
}) {
  const Icon = it.icon as LucideIcon | undefined;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={it.disabled}
      data-focus={focused || undefined}
      data-testid={it.testId}
      onMouseEnter={onHover}
      onClick={() => onPick(it)}
      className="menu-item"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{it.label}</span>
        {it.subtitle && <span className="text-footnote block text-[var(--label-2)]">{it.subtitle}</span>}
      </span>
      {it.shortcut && (
        <kbd className="text-footnote font-sans text-[var(--label-3)]" aria-hidden>
          {it.shortcut}
        </kbd>
      )}
      {Icon && <Icon size={18} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}
