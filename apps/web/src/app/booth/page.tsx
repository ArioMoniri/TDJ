"use client";
import { Eye, Keyboard, ListMusic, LogOut, MonitorUp, SlidersVertical } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type RefObject, Suspense, useEffect, useRef, useState } from "react";
import { AdaptCard } from "@/components/booth/AdaptCard";
import { Banners } from "@/components/booth/Banners";
import { ControllerHost } from "@/components/booth/ControllerView";
import { ControlStrip } from "@/components/booth/ControlStrip";
import { ControlsPanel, loadControlsOpen, saveControlsOpen } from "@/components/booth/ControlsPanel";
import { EnergyRail } from "@/components/booth/EnergyRail";
import { HintLayer } from "@/components/booth/HintLayer";
import { LoadNightSheet } from "@/components/booth/LoadNightSheet";
import { NextCard } from "@/components/booth/NextCard";
import { NightBar } from "@/components/booth/NightBar";
import { NowCard } from "@/components/booth/NowCard";
import { NowPlayingView } from "@/components/booth/NowPlayingView";
import { OnboardingSheet } from "@/components/booth/OnboardingSheet";
import { PlayerToolbar, ShowSheet } from "@/components/booth/PlayerToolbar";
import { SetColumn } from "@/components/booth/SetColumn";
import {
  BreakSheet,
  CortinaSheet,
  FindFileSheet,
  LevelsSheet,
  ResumeSheet,
  ShortcutsSheet,
  StopSheet,
} from "@/components/booth/Sheets";
import { SongSheet } from "@/components/booth/SongSheet";
import { hasTransition, TransitionSheet } from "@/components/booth/TransitionSheet";
import { EmptyState } from "@/components/EmptyState";
import { ActionRow, Group } from "@/components/Form";
import { type MenuItem, MenuList } from "@/components/Menu";
import { PageHeader } from "@/components/PageHeader";
import { usePowerMenuItem } from "@/components/PowerSaver";
import { Sheet } from "@/components/Sheet";
import { BoothSongSearch } from "@/components/ui/BoothSongSearch";
import { arm, confirmArmed, confirmNeeded, disarm, guard, roomCut } from "@/lib/booth/confirm";
import { useBoothLoad } from "@/lib/booth/loadNight";
import { startRoomHearts } from "@/lib/booth/roomHearts";
import { boothContextState, boothEngine, useBooth } from "@/lib/booth/store";
import { showFloorScreen, startBoothFloor } from "@/lib/floorBooth";
import { useMediaQuery } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { type ActionId, actionOf, isAction } from "@/lib/keymap";
import { usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";

const THEME_KEY = "tdj-booth-theme";
/** the Booth's own keys (lib/keymap.ts); the edit keys are EditKeys' */
const BOOTH_KEYS: ActionId[] = [
  "booth.pause",
  "booth.prev",
  "booth.next",
  "booth.skipNext",
  "booth.fade",
  "booth.crossfade",
  "booth.hold",
  "booth.talk",
  "booth.faderUp",
  "booth.faderDown",
  "booth.cueCortina",
  "booth.prelisten",
  "booth.stopPrelisten",
  "booth.birthday",
  "booth.mute",
  "booth.keys",
  "booth.playNow",
  "booth.playNext",
];

/**
 * /booth (round7-booth.md §1): the night, played from the app. Dark forced while mounted (per-device choice in
 * localStorage), nothing on the content layer is glass, no layout animation; the page is interactive before the
 * DJ's first tap (no LazyHydrate). Opens on the current set; without one, "Compose a night first".
 */
/**
 * The deck's cards under an open Controls panel (two columns): every card shows whole or not at all. The Now card
 * always shows; from the first card that would run past the deck's foot, it and the cards after it are folded
 * (`data-fold`, booth.css) and `onFolded` gets how many — the page shows a pill that brings them back.
 */
function useDeckFold(ref: RefObject<HTMLDivElement | null>, on: boolean, onFolded: (n: number) => void) {
  useEffect(() => {
    const deck = ref.current;
    if (!deck) return;
    const cards = () =>
      [...deck.children].filter(
        (c): c is HTMLElement =>
          c instanceof HTMLElement && !c.hasAttribute("data-deck-pill") && c.dataset.testid !== "booth-now",
      );
    if (!on) {
      for (const c of cards()) c.removeAttribute("data-fold");
      onFolded(0);
      return;
    }
    let frame = 0;
    const root = document.documentElement;
    const measure = () => {
      frame = 0;
      // the Now card's height: the open panel's cap keeps the deck at least this tall (booth.css, item 9)
      const nowCard = deck.querySelector<HTMLElement>('[data-testid="booth-now"]');
      const h = nowCard ? `${Math.ceil(nowCard.offsetHeight)}px` : "";
      if (h && root.style.getPropertyValue("--booth-now-h") !== h) {
        root.style.setProperty("--booth-now-h", h);
        window.dispatchEvent(new Event("tdj:booth-now-h"));
      }
      const list = cards();
      for (const c of list) c.removeAttribute("data-fold");
      const cs = getComputedStyle(deck);
      // two columns only: the deck is its own scroller there (a phone's page scrolls instead)
      if (cs.overflowY !== "auto" && cs.overflowY !== "scroll") return onFolded(0);
      const top = deck.getBoundingClientRect().top - deck.scrollTop;
      const foot = deck.clientHeight - (Number.parseFloat(cs.paddingBottom) || 0);
      const shown = list.filter((c) => c.getBoundingClientRect().height > 0);
      let n = 0;
      for (const c of shown) {
        if (n > 0 || c.getBoundingClientRect().bottom - top > foot + 0.5) {
          c.setAttribute("data-fold", "");
          n++;
        }
      }
      deck.scrollTop = 0;
      onFolded(n);
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(soon) : null;
    ro?.observe(deck);
    const now = deck.querySelector<HTMLElement>('[data-testid="booth-now"]');
    if (now) ro?.observe(now);
    window.addEventListener("resize", soon);
    // a card that comes or goes (the Adapt suggestion) is measured too
    const mo = typeof MutationObserver === "function" ? new MutationObserver(soon) : null;
    mo?.observe(deck, { childList: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", soon);
      for (const c of cards()) c.removeAttribute("data-fold");
      root.style.removeProperty("--booth-now-h");
    };
  }, [ref, on, onFolded]);
}

export default function BoothPage() {
  return (
    <Suspense>
      <Booth />
    </Suspense>
  );
}

function Booth() {
  const composed = useStore((s) => s.playlist);
  // 2026-11: the Booth can be cleared (Compose keeps its night) and loads another night (LoadNightSheet)
  const cleared = useBoothLoad((s) => s.cleared);
  const loadSeq = useBoothLoad((s) => s.seq);
  const playlist = cleared ? null : composed;
  const [loadOpen, setLoadOpen] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const rehearsalParam = params.get("rehearsal") === "1";
  const boot = useBooth((s) => s.boot);
  const ready = useBooth((s) => s.ready);
  const state = useBooth((s) => s.state);
  const started = useBooth((s) => s.started);
  const rehearsal = useBooth((s) => s.rehearsal);
  const plan = useBooth((s) => s.plan);
  const sourceMode = useBooth((s) => s.sourceMode);
  // 2026-11: mid-night, Rehearsal asks first (the switch takes the room from the next song)
  const [rehearsalAsk, setRehearsalAsk] = useState<"preview" | "file" | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [more, setMore] = useState(false);
  // 2026-11: Battery saver's quick toggle in the More sheet (components/PowerSaver.tsx)
  const powerItem = usePowerMenuItem();
  const [keys, setKeys] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [find, setFind] = useState<{ id: string; title: string } | null>(null);
  const [jump, setJump] = useState<number | null>(null);
  const [light, setLight] = useState(false);
  const [levels, setLevels] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [cortina, setCortina] = useState<number | null>(null);
  // wave 4: the transition editor, at the transition after this plan item
  const [transition, setTransition] = useState<number | null>(null);
  const editTransitions = () => {
    const s = useBooth.getState();
    const items = s.plan?.items;
    const k = items?.findIndex((_, j) => j >= s.planIndex && hasTransition(items, j)) ?? -1;
    if (k >= 0) setTransition(k);
  };
  // round 22: the song sheet (tap any row, or Song info on Now), the phone's set-list sheet, the Show sheet
  const [song, setSong] = useState<number | null>(null);
  const songRef = useRef<number | null>(null);
  songRef.current = song;
  const [setOpen, setSetOpen] = useState(false);
  const [show, setShow] = useState(false);
  // 2026-11 ("can't start on the song I want"): before the night a tap also puts the playhead on the row — the Now
  // card shows it and Start (or the sheet's "Start the night here") begins there; during the night a tap only opens
  // the sheet (Play now / Play next), so an accidental tap never cuts the room
  const openRow = (i: number) => {
    const b = useBooth.getState();
    if (!b.started) b.select(i);
    setSong(i);
  };
  // 2026-11 ("every song playable on one tap"): a row, the Up Next card, the next tanda. Before the night a tap plays
  // that item in the room at once (the night starts there, from its start point); during the night it pre-listens in
  // the headphones (the room untouched) when a headphone output is chosen, else its sheet opens with "Play now in the
  // room" armed (one more tap). The row's number opens the sheet itself (openRow).
  const tapRow = (i: number) => {
    const b = useBooth.getState();
    const it = b.plan?.items[i];
    if (!it || it.kind === "break") return;
    if (!b.started) {
      if (b.select(i)) void b.start();
      return;
    }
    if (b.outputs.cue && !b.cueBlocked()) {
      void b.prelisten({ i });
      return;
    }
    setSong(i);
    if (i !== b.planIndex && confirmNeeded()) arm(`play-now:${i}`, () => void useBooth.getState().playNow(i));
  };
  // the Controls panel: open / closed per device; its toggle is on the transport
  const [ctlOpen, setCtlOpen] = useState(false);
  useEffect(() => setCtlOpen(loadControlsOpen()), []);
  const toggleControls = () =>
    setCtlOpen((o) => {
      saveControlsOpen(!o);
      return !o;
    });
  const phone = useMediaQuery("(max-width: 599.98px)", false);
  // QA 2026-11 (1440 × 900 and iPad landscape with Controls open: Up Next and Energy cut in half above the panel):
  // a deck card that does not fit whole steps aside; a pill names what is hidden and brings it back
  const deckRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(0);
  useDeckFold(deckRef, ctlOpen && !phone, setFolded);
  // a tanda tapped on the energy chart or the Next card: the set list scrolls to it (a phone opens the sheet first)
  const showInSet = (i: number) => {
    if (phone) setSetOpen(true);
    setJump(i);
  };
  // the stored theme, read at mount: the persisting effect waits until `light` holds it (round 18: with the booth
  // already ready at mount, its first run wrote "dark" over a stored "light" before setLight(true) landed)
  const storedLight = useRef<boolean | null>(null);
  const themeSynced = useRef(false);

  // 2026-11: in a room, the playing song goes to the room and its dancers' hearts come back (dancer favourites)
  useEffect(() => startRoomHearts(), []);
  // 2026-11: the dancers' Floor screen follows the Booth (a window it opened; a room's devices)
  useEffect(() => startBoothFloor(), []);

  // while a night runs the phone tab bar leaves (round8-ux.md §1.5); "Leave the booth" in ••• is the way out
  useEffect(() => {
    const el = document.documentElement;
    if (started) el.dataset.boothLive = "1";
    else delete el.dataset.boothLive;
    return () => {
      delete el.dataset.boothLive;
    };
  }, [started]);

  // wave 2: where the set column sits now (it is sticky: lower at the top of the page, 68 px once stuck), so it
  // reaches the viewport's foot and its last rows scroll clear of the transport (booth.css)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measured once the booth is ready (the column mounts)
  useEffect(() => {
    if (phone) return;
    const root = document.documentElement;
    let frame = 0;
    // 2026-11: on two columns the page holds still and each column scrolls on its own between the chip row (the
    // grid's top, below any banner) and the transport: the grid's top is measured at the page's own top
    const measure = () => {
      frame = 0;
      const grid = document.querySelector<HTMLElement>(".booth-grid");
      if (grid)
        root.style.setProperty(
          "--booth-grid-top",
          `${Math.max(0, Math.round(grid.getBoundingClientRect().top + window.scrollY))}px`,
        );
      // 2026-11 ("UI issues between boxes"; at 1920 px the transport and the Controls panel were wider than the
      // page): the bottom stack takes the content column's own edges, whatever the sidebar and the column's cap
      const page = document.querySelector<HTMLElement>(".booth");
      if (page) {
        const r = page.getBoundingClientRect();
        root.style.setProperty("--bx-l", `${Math.round(r.left)}px`);
        root.style.setProperty("--bx-r", `${Math.max(0, Math.round(window.innerWidth - r.right))}px`);
      }
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", soon);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(soon) : null;
    const grid = document.querySelector(".booth");
    if (grid) ro?.observe(grid);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
      ro?.disconnect();
      root.style.removeProperty("--booth-grid-top");
      root.style.removeProperty("--bx-l");
      root.style.removeProperty("--bx-r");
    };
  }, [phone, ready]);

  // dark forced while mounted; the DJ's per-device choice overrides it
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.dataset.theme;
    const prevDark = el.classList.contains("dark");
    let wantLight = false;
    try {
      wantLight = localStorage.getItem(THEME_KEY) === "light";
    } catch {}
    storedLight.current = wantLight;
    setLight(wantLight);
    el.dataset.theme = wantLight ? "light" : "dark";
    el.classList.toggle("dark", !wantLight);
    el.dataset.booth = "1";
    usePlayer.getState().close();
    return () => {
      if (prev) el.dataset.theme = prev;
      else delete el.dataset.theme;
      el.classList.toggle("dark", prevDark);
      delete el.dataset.booth;
      useBooth.getState().leave();
    };
  }, []);
  useEffect(() => {
    if (!ready || storedLight.current === null) return;
    if (!themeSynced.current) {
      if (light !== storedLight.current) return;
      themeSynced.current = true;
    }
    const el = document.documentElement;
    el.dataset.theme = light ? "light" : "dark";
    el.classList.toggle("dark", !light);
    try {
      localStorage.setItem(THEME_KEY, light ? "light" : "dark");
    } catch {}
  }, [light, ready]);

  // boot per set (by id): the booth writes its plan back into the set, which must not re-boot it
  const playlistId = playlist?.id ?? null;
  // (a night loaded back after a clear boots again: `cleared` is part of the key; a load (loadSeq) boots again, even
  // the same night)
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadSeq is the trigger, not read
  useEffect(() => {
    const p = useStore.getState().playlist;
    if (p && p.id === playlistId && !cleared) void boot(p, { rehearsal: rehearsalParam });
  }, [playlistId, boot, rehearsalParam, cleared, loadSeq]);

  // the plan for tests and the console (nothing secret: the set the DJ composed)
  useEffect(() => {
    const w = window as unknown as {
      __tdjBoothPlan?: unknown;
      __tdjBooth?: unknown;
      __tdjBoothEngine?: unknown;
      __tdjBoothCtx?: unknown;
    };
    w.__tdjBoothPlan = plan;
    w.__tdjBooth = useBooth;
    // round 20: the e2e measures the master output (the analyser right before the speakers) and the context state
    w.__tdjBoothEngine = boothEngine;
    w.__tdjBoothCtx = boothContextState;
  }, [plan]);

  // keyboard (§1.1, round 20): ignored while an input has focus or a sheet is up. Esc only closes sheets (wave 2:
  // esc used to open the Stop confirm, so the esc that closed Mix plus one more put "Fade out and stop" under Enter)
  useEffect(() => {
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return (
        !!a &&
        (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)
      );
    };
    /** Play now in the room from the keyboard: before the night it starts there; mid-night the first press arms */
    const keyPlayNow = (i: number) => {
      const b = useBooth.getState();
      const it = b.plan?.items[i];
      if (!it || it.kind === "break") return;
      if (!b.started) {
        if (b.select(i)) void b.start();
        return;
      }
      if (i === b.planIndex) {
        setSong(i);
        return;
      }
      const r = guard(`play-now:${i}`, () => {
        setSong(null);
        void useBooth.getState().playNow(i);
      });
      if (r !== "armed") return;
      setSong(i);
      // the sheet opens on Play now, armed and focused: Enter again confirms, Esc cancels
      const focus = (n: number) => {
        const el = document.getElementById("booth-play-now");
        if (el) el.focus({ preventScroll: true });
        else if (n > 0) setTimeout(() => focus(n - 1), 50);
      };
      setTimeout(() => focus(10), 60);
    };
    const down = (e: KeyboardEvent) => {
      // 2026-11: Esc cancels an armed control, Enter confirms it (a focused button confirms by its own click)
      if (e.key === "Escape") disarm();
      // 2026-11: Play now (lib/keymap.ts, Enter by default) on a focused row, or in the open song sheet off its controls, is "Play now
      // in the room": mid-night it arms (the sheet opens on Play now, focused) and Enter again confirms
      if (isAction("booth.playNow", e) && !e.repeat && !typing()) {
        const a = document.activeElement as HTMLElement | null;
        const row = a?.closest<HTMLElement>(".booth-row[data-plan-index]");
        const dialog = document.querySelector('[role="dialog"]');
        if (row && !dialog?.contains(row)) {
          e.preventDefault();
          keyPlayNow(Number(row.dataset.planIndex));
          return;
        }
        const sheet = document.querySelector('[data-testid="booth-play-sheet"]');
        const i = songRef.current;
        if (
          sheet &&
          i !== null &&
          (!a ||
            a === document.body ||
            // 2026-11 (the owner: Enter after the pop-up opened did nothing): the sheet opens with the focus on Play
            // now; the DJ's Play-now key there (Enter by default, or the key they bound) arms it or, armed, plays
            a.id === "booth-play-now" ||
            (sheet.contains(a) &&
              !a.closest("button, a, input, textarea, select, [role='slider'], [role='switch']")))
        ) {
          e.preventDefault();
          keyPlayNow(i);
          return;
        }
      }
      if (e.key === "Enter" && !typing()) {
        const a = document.activeElement as HTMLElement | null;
        if (!a?.closest("button, a, [role='button'], [role='slider']") && confirmArmed()) {
          e.preventDefault();
          return;
        }
      }
      if (typing() || document.querySelector('[role="dialog"]')) return;
      if (document.activeElement?.closest?.("[data-key-recorder]")) return;
      const b = useBooth.getState();
      // 2026-11: the keys are the DJ's (Settings → Keyboard, lib/keymap.ts); the defaults are the old ones
      const id = actionOf(e, BOOTH_KEYS);
      if (!id) return;
      // 2026-11: Enter / ⇧Enter (the DJ's keys) on the set-list row that has the focus: play it now in the room —
      // mid-night the first press arms, Enter again confirms (above) — or next
      if (id === "booth.playNow" || id === "booth.playNext") {
        const row = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-plan-index]");
        const i = row ? Number(row.dataset.planIndex) : Number.NaN;
        const it = Number.isFinite(i) ? b.plan?.items[i] : undefined;
        if (!it || it.kind === "break" || e.repeat) return;
        e.preventDefault();
        if (id === "booth.playNext") {
          b.playNext(i);
          toast(t("booth.keys.plays_next", { title: it.title }));
        } else if (!b.started) {
          if (b.select(i)) void b.start();
        } else guard(`play-now:${i}`, () => void useBooth.getState().playNow(i));
        return;
      }
      const slider = (document.activeElement as HTMLElement | null)?.getAttribute("role") === "slider";
      if (id === "booth.pause") {
        e.preventDefault();
        if (e.repeat) return;
        // QA 2026-11: mid-night Space cuts the room only on a second press (the Pause button shows it armed);
        // resuming never waits
        roomCut("pause", b.state === "playing" || b.state === "cortina", () =>
          useBooth.getState().togglePause(),
        );
      } else if (id === "booth.next" || id === "booth.prev") {
        // 2026-11: ← one back, → one ahead now (a focused seek bar or slider keeps its own arrows)
        if (slider) return;
        e.preventDefault();
        if (e.repeat) return;
        // mid-night the first press arms (the transport button shows it), the second (or Enter) runs
        if (id === "booth.next") guard("next", () => void useBooth.getState().nextNow());
        else guard("prev", () => void useBooth.getState().previous());
      } else if (id === "booth.skipNext") {
        if (!e.repeat) b.next();
      } else if (id === "booth.fade") guard("fade", () => useBooth.getState().fadeOutNow());
      else if (id === "booth.crossfade") guard("crossfade", () => void useBooth.getState().crossfadeNext());
      else if (id === "booth.hold") {
        if (b.state === "playing" || b.state === "cortina") b.toggleHold();
      } else if (id === "booth.talk") b.setDucked(!b.ducked);
      else if (id === "booth.faderUp" || id === "booth.faderDown") {
        if (slider) return;
        e.preventDefault();
        b.setCortinaFader(Math.max(0, Math.min(1, b.cortinaFader + (id === "booth.faderUp" ? 0.05 : -0.05))));
      } else if (id === "booth.cueCortina") b.cueCortina();
      // round 22: p pre-listens the next item in the headphones, P stops the pre-listen (the room keeps playing)
      else if (id === "booth.prelisten") {
        if (b.plan) void b.prelisten({ i: Math.min(b.plan.items.length - 1, b.planIndex + 1) });
      } else if (id === "booth.stopPrelisten") b.stopAudition();
      else if (id === "booth.birthday") b.birthdayVals();
      else if (id === "booth.mute") {
        // QA 2026-11: m mutes the room on a second press mid-night (Mute shows it armed); unmuting never waits
        if (!e.repeat) roomCut("mute", !b.muted, () => useBooth.getState().toggleMute());
      } else if (id === "booth.keys") setKeys(true);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  if (!playlist)
    return (
      <div data-testid="booth-empty">
        <PageHeader title={t("booth.booth")} />
        <EmptyState
          action={
            <span className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setLoadOpen(true)}
                data-testid="booth-empty-load"
              >
                {t("booth.load.menu")}
              </button>
              <Link href="/" className="btn btn-ghost">
                {t("booth.compose")}
              </Link>
            </span>
          }
        >
          <span className="text-headline block text-[var(--label)]">
            {cleared ? t("booth.load.empty_title") : t("booth.compose_a_night_first")}
          </span>
          <span className="block">
            {cleared ? t("booth.load.empty_text") : t("booth.the_booth_plays_the_set_on")}
          </span>
        </EmptyState>
        <LoadNightSheet open={loadOpen} onClose={() => setLoadOpen(false)} />
      </div>
    );

  const b = useBooth.getState();
  // a rehearsal because nothing but 30 s clips can play here (no Premium, no folder): there is nothing to switch to
  const onlyClips = rehearsal && sourceMode !== "preview";
  // round 22: every night and song tool has its own home (the night bar, the transport, Mix, the song sheet); the
  // overflow keeps set-up and the app
  const menu: Array<MenuItem | false> = [
    // 2026-11 (the owner: "better design for the lower bar on the phone"): the phone's bar keeps the transport; the
    // set list, the Controls panel and Mix live here
    phone && {
      label: t("booth.controlStrip.set_list"),
      icon: ListMusic,
      testId: "booth-set-open",
      onClick: () => setSetOpen(true),
    },
    phone && {
      label: t("booth.controls.title"),
      icon: SlidersVertical,
      checked: ctlOpen,
      testId: "booth-controls-toggle",
      onClick: toggleControls,
    },
    { label: t("booth.load.menu"), testId: "booth-menu-load", onClick: () => setLoadOpen(true) },
    { label: t("booth.set_up_source_output_night"), onClick: () => setOnboarding(true) },
    // (a phone's transport has Previous / Next now; Next at gap and Mix live here)
    started && phone && { label: t("booth.connect.skip_next_menu"), onClick: () => b.next() },
    phone && { label: t("booth.controlStrip.mix_menu"), onClick: () => setLevels(true) },
    // 2026-11 (the owner: "the Rehearsal button is always deactivated" — it was disabled for the whole night, with
    // no reason shown): before the night it switches at once; mid-night it asks first (from the next song); when
    // only clips can play here it says so instead of a silent grey row
    {
      label: t("booth.rehearsal_30_s"),
      checked: rehearsal,
      testId: "booth-menu-rehearsal",
      subtitle: onlyClips
        ? t("booth.ui2.rehearsal_only_clips")
        : rehearsal
          ? t("booth.ui2.rehearsal_sub_on")
          : t("booth.ui2.rehearsal_sub_off"),
      disabled: onlyClips,
      onClick: () => {
        const to = rehearsal ? "file" : "preview";
        if (started) setRehearsalAsk(to);
        else void b.setSourceMode(to);
      },
    },
    {
      label: t("booth.link_music_folder"),
      onClick: () =>
        b.folder.canKeep ? void b.linkFolder() : document.getElementById("booth-folder-input")?.click(),
    },
    { label: t("booth.show_energy_bpm_key_era_artwork"), icon: Eye, onClick: () => setShow(true) },
    { label: t("booth.keyboard_shortcuts"), icon: Keyboard, onClick: () => setKeys(true) },
    powerItem,
    // 2026-11: the dancers' Floor screen on the projector / TV, the Booth staying on this screen
    {
      label: t("floor.menu"),
      subtitle: t("floor.menu_sub"),
      icon: MonitorUp,
      testId: "booth-menu-floor",
      onClick: () => void showFloorScreen(),
    },
    { label: light ? t("booth.dark_theme") : t("booth.light_theme"), onClick: () => setLight((v) => !v) },
    // (a phone has no tab bar on the booth: this is its way out, before the night too)
    (started || phone) && {
      label: t("booth.leave_the_booth"),
      icon: LogOut,
      onClick: () => router.push("/"),
    },
    started && {
      label: t("booth.end_the_night"),
      destructive: true,
      onClick: () => {
        void b.endNight();
        toast(t("booth.the_night_s_log_is_in"));
      },
    },
  ];

  return (
    <div
      className="booth"
      data-state={state}
      data-testid="booth"
      data-rehearsal={rehearsal || undefined}
      data-controls={ctlOpen ? "open" : undefined}
    >
      {/* the title keeps one width; the mode is a chip under it (round8-ux.md §2 Booth) */}
      <PageHeader title={t("booth.booth")} />
      {/* the chips under the title and "Find songs" share one row */}
      <div className="booth-head-row">
        <PlayerToolbar rehearsal={rehearsal} />
        <BoothSongSearch onGoTo={showInSet} />
      </div>
      <Banners />
      <div className="booth-grid">
        <div className="booth-deck" data-testid="booth-deck-col" ref={deckRef}>
          <NowCard onInfo={(i) => setSong(i)} onPlay={tapRow} />
          {/* 2026-11: a suggestion for the next tandas after a floor reaction (never applied by itself) */}
          <AdaptCard />
          <div className="booth-deck-row">
            <NextCard onJump={showInSet} onPlay={tapRow} />
            <EnergyRail onJump={showInSet} />
          </div>
          {phone && <NightBar onBreak={() => setBreakOpen(true)} />}
        </div>
        {!phone && (
          <aside className="booth-col-set" aria-label={t("booth.the_night_and_its_set_list")}>
            <NightBar onBreak={() => setBreakOpen(true)} />
            <SetColumn
              jumpTo={jump}
              onFind={(id, title) => setFind({ id, title })}
              onCortina={(i) => setCortina(i)}
              onTapRow={tapRow}
              onOpenRow={openRow}
              onTransition={(i) => setTransition(i)}
              follow
            />
          </aside>
        )}
      </div>
      {phone && (
        <Sheet
          open={setOpen}
          onClose={() => setSetOpen(false)}
          title={t("booth.controlStrip.set_list")}
          trailing={t("booth.sheets.done")}
          detents={["large"]}
          testId="booth-set-sheet"
        >
          <div className="booth-set-sheet">
            <SetColumn
              jumpTo={jump}
              onFind={(id, title) => setFind({ id, title })}
              onCortina={(i) => setCortina(i)}
              onTapRow={tapRow}
              onOpenRow={openRow}
              onTransition={(i) => setTransition(i)}
            />
          </div>
        </Sheet>
      )}
      <ControlStrip
        onMore={() => setMore(true)}
        onLevels={() => setLevels(true)}
        onStop={() => setStopOpen(true)}
        onSet={phone ? () => setSetOpen(true) : undefined}
        controlsOpen={ctlOpen}
        onControls={toggleControls}
      />
      <ControlsPanel
        open={ctlOpen}
        deckFolded={folded > 0}
        onClose={toggleControls}
        onStop={() => setStopOpen(true)}
        onKeys={() => setKeys(true)}
        onSong={(i) => setSong(i)}
      />
      <SongSheet
        i={song}
        onClose={() => setSong(null)}
        onTransition={(i) => setTransition(i)}
        onPlayed={() => setSetOpen(false)}
      />
      <NowPlayingView onInfo={(i) => setSong(i)} />
      <ShowSheet open={show} onClose={() => setShow(false)} />
      <HintLayer />
      <LevelsSheet open={levels} onClose={() => setLevels(false)} onEditTransitions={editTransitions} />
      <TransitionSheet at={transition} onClose={() => setTransition(null)} />
      <StopSheet open={stopOpen} onClose={() => setStopOpen(false)} />
      <CortinaSheet planIndex={cortina} onClose={() => setCortina(null)} />
      {/* any browser: the folder as a FileList (Chromium prefers the persisted handle) */}
      <input
        id="booth-folder-input"
        type="file"
        multiple
        className="sr-only"
        aria-label={t("booth.music_folder")}
        data-testid="booth-folder-input"
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            // the File objects stay readable once copied; the input itself is cleared at once (Chromium's
            // renderer crashed when a sheet opened while the input still held a directory's FileList)
            const copy = Array.from(files);
            e.target.value = "";
            void b.loadFileList(copy);
          }
        }}
      />
      <OnboardingSheet
        open={onboarding}
        onClose={() => setOnboarding(false)}
        onStart={() => {
          setOnboarding(false);
          void b.start();
        }}
      />
      <Sheet
        open={more}
        onClose={() => setMore(false)}
        title={t("booth.booth")}
        detents={["medium", "large"]}
        testId="booth-menu"
      >
        <MenuList
          items={menu}
          onPick={(it) => {
            setMore(false);
            it.onClick?.();
          }}
        />
      </Sheet>
      <Sheet
        open={rehearsalAsk !== null}
        onClose={() => setRehearsalAsk(null)}
        title={
          rehearsalAsk === "preview" ? t("booth.ui2.rehearsal_ask_clips") : t("booth.ui2.rehearsal_ask_full")
        }
        testId="booth-rehearsal-ask"
      >
        <Group footer={t("booth.ui2.rehearsal_ask_footer")}>
          <ActionRow
            label={rehearsalAsk === "preview" ? t("booth.ui2.switch_clips") : t("booth.ui2.switch_full")}
            id="booth-rehearsal-switch"
            onClick={() => {
              const to = rehearsalAsk;
              setRehearsalAsk(null);
              if (to) void useBooth.getState().setSourceMode(to);
            }}
          />
        </Group>
      </Sheet>
      {/* 2026-11: a DJ controller over MIDI and the on-screen controller (Controls → Controller) */}
      <ControllerHost />
      <ShortcutsSheet open={keys} onClose={() => setKeys(false)} />
      <BreakSheet open={breakOpen} onClose={() => setBreakOpen(false)} />
      <FindFileSheet item={find} onClose={() => setFind(null)} />
      <ResumeSheet />
      <LoadNightSheet open={loadOpen} onClose={() => setLoadOpen(false)} />
    </div>
  );
}
