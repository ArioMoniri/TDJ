"use client";
import { describeLearned } from "@tdj/core";
import {
  Brain,
  FolderOpen,
  Globe,
  HardDrive,
  Heart,
  ImageIcon,
  KeyRound,
  Languages,
  LoaderCircle,
  Music2,
  Palette,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { About } from "@/components/About";
import { AppConnections } from "@/components/AppConnections";
import { ControllerSettingsBody } from "@/components/booth/ControllerView";
import { DeviceSourcesGroup } from "@/components/booth/DeviceSources";
import { IndicatorSwitches } from "@/components/booth/IndicatorSwitches";
import { BoothAudioSettings } from "@/components/booth/OutputsView";
import { SilenceGroup } from "@/components/booth/SilenceSettings";
import { Connectors } from "@/components/Connectors";
import { PopularitySwitch } from "@/components/db/DatabaseFavourites";
import { FeaturedLearned } from "@/components/db/FeaturedLearned";
import {
  ActionRow,
  FieldRow,
  Group,
  PickerRow,
  Row,
  SegmentedRow,
  StepperRow,
  SwitchRow,
  Tile,
} from "@/components/Form";
import { ModelConnections } from "@/components/ModelConnections";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { TandaRulesGroup } from "@/components/TandaRules";
import { DataSources } from "@/components/ui/DataSources";
import { Tip } from "@/components/ui/Tip";
import { activeAcp } from "@/lib/ai/client";
import { KEY_PLACEHOLDER, MODEL_SUGGESTIONS } from "@/lib/ai/models";
import { chooseKeyProvider, keyOf, withKey } from "@/lib/ai/settings";
import { saveAiKey } from "@/lib/app/boot";
import { APP, KEYCHAIN_KEY } from "@/lib/app/target";
import { LOCALE_NAME, lazy, t as tx } from "@/lib/i18n";
import { fade, t as tw } from "@/lib/motion";
import { useStore } from "@/lib/store";
import {
  AI_DEFAULT_MODEL,
  AI_PROVIDERS,
  type AiProvider,
  CORTINA_STOP_RANGE,
  cortinaStopSec,
  DEFAULT_NAMING,
  DJ_APPS,
  type DjApp,
  type KeyProvider,
  type UserSettings,
} from "@/lib/types";

const REGIONS: Array<[UserSettings["region"], string]> = lazy(() => [
  ["buenos-aires", "Buenos Aires"],
  ["europe", tx("settings.europe")],
  ["istanbul", tx("settings.istanbul")],
  ["asia", tx("settings.asia")],
  ["us", tx("context.us")],
]);
const THEMES: Array<[UserSettings["theme"], string]> = lazy(() => [
  ["auto", tx("settings.auto")],
  ["light", tx("settings.light")],
  ["dark", tx("settings.dark")],
]);

/* The dotLottie player loads with the first test result, not with the page. */
const DotLottieReact = dynamic(() => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact), {
  ssr: false,
});

type TestState = "idle" | "busy" | "ok" | "fail";

/**
 * Test-connection icon (motion-system.md §3.6): idle → nothing; busy → spinner after a 300 ms grace; ok / fail →
 * the save-pulse / error-mark Lottie plays once in the same 20 px slot (final frame under reduced motion).
 */
function TestIcon({ state }: { state: TestState }) {
  const reduced = useReducedMotion();
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (state !== "busy") {
      setLate(false);
      return;
    }
    const id = setTimeout(() => setLate(true), 300);
    return () => clearTimeout(id);
  }, [state]);
  const show = state === "ok" || state === "fail" || (state === "busy" && late);
  return (
    <span className="relative inline-grid h-5 w-5 shrink-0 place-items-center align-middle" aria-hidden>
      <AnimatePresence mode="wait" initial={false}>
        {show && (
          <motion.span
            key={state}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tw.press}
            className="inline-grid h-5 w-5 place-items-center"
            data-testid={`test-icon-${state}`}
          >
            {state === "busy" ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <DotLottieReact
                src={state === "ok" ? "/anim/save-pulse.json" : "/anim/error-mark.json"}
                autoplay={!reduced}
                loop={false}
                dotLottieRefCallback={(d) => {
                  if (reduced) d?.setFrame(23);
                }}
                style={{ width: 20, height: 20 }}
              />
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Provider errors as one human line: "The key was rejected by Anthropic (401). Check it and try again." */
function humanError(provider: AiProvider, status: number, raw: unknown): string {
  const name = AI_PROVIDERS.find(([k]) => k === provider)?.[1] ?? provider;
  const text = typeof raw === "string" ? raw : "";
  // an Anthropic key made at organisation level must name the workspace it bills
  if (/not scoped to a workspace|anthropic-workspace-id/i.test(text))
    return tx("settings.this_key_belongs_to_an_organisation");
  if (status === 429 && /organiser/i.test(text)) return text;
  if (
    status === 401 ||
    status === 403 ||
    /invalid x-api-key|authentication|unauthori[sz]ed|invalid api key/i.test(text)
  )
    return tx("settings.the_key_was_rejected_by_check", { name, p1: status || 401 });
  if (status === 404 || /model.*not (found|exist)|does not exist/i.test(text))
    return tx("settings.does_not_know_this_model_leave", { name, status });
  if (status === 429 || /rate limit|quota/i.test(text))
    return tx("settings.is_rate_limiting_this_key_try", { name, status });
  if (status >= 500 || !status)
    return tx("settings.did_not_answer", { name, status: status || tx("settings.network") });
  const short = text
    .replace(/\{[\s\S]*\}/, "")
    .trim()
    .slice(0, 80);
  return tx("settings.answered", { name, status, p1: short ? `: ${short}` : "" });
}

export default function Settings() {
  const { settings, setSettings, storageMode, memory, options, setOptions, updateMemory } = useStore();
  const learnedLines = describeLearned(memory.learned);
  const router = useRouter();
  const [showKey, setShowKey] = useState(false);
  const [folderFor, setFolderFor] = useState<DjApp | null>(null);
  const [test, setTest] = useState<{ state: TestState; text?: string }>({ state: "idle" });
  /** the organiser's shared key (GET /api/ai/review): exists, and this DJ's use of today's allowance */
  const [shared, setShared] = useState<{ shared: boolean; limit: number; used: number } | null>(null);
  const [ownKey, setOwnKey] = useState(false);
  useEffect(() => {
    void fetch("/api/ai/review", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setShared(j ?? { shared: false, limit: 0, used: 0 }))
      .catch(() => setShared({ shared: false, limit: 0, used: 0 }));
  }, []);
  /** "Checking…" waits 300 ms so a fast answer never flashes it */
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (test.state !== "busy") {
      setChecking(false);
      return;
    }
    const id = setTimeout(() => setChecking(true), 300);
    return () => clearTimeout(id);
  }, [test.state]);
  // round 22: this group edits one provider's key; the one in use is chosen in Keys and agents below (or here,
  // while a key provider is in use). An ACP agent in use leaves the keys to edit, untouched.
  const agentInUse = activeAcp(settings);
  const [editP, setEditP] = useState<KeyProvider | null>(null);
  const editProvider: KeyProvider =
    settings.ai.provider === "acp" ? (editP ?? "anthropic") : settings.ai.provider;
  const ai = { provider: editProvider, ...keyOf(settings, editProvider) };
  const setAi = (patch: Partial<{ key: string; model: string; workspace: string }>) =>
    setSettings(withKey(useStore.getState().settings, editProvider, patch));
  const usingShared = !ai.key && !!shared?.shared;
  // the personal fields fold away under "Use my own key" while the organiser's key does the work
  const showOwn = ownKey || !!ai.key || shared?.shared === false;
  const switchProvider = (provider: AiProvider) => {
    if (provider === "acp") return;
    if (settings.ai.provider === "acp") setEditP(provider);
    else setSettings(chooseKeyProvider(useStore.getState().settings, provider));
    setTest({ state: "idle" });
    // apps: a draft belongs to the provider it was typed for
    if (APP) setDraft(null);
  };
  /** apps: what the DJ is typing (null = untouched); saved to the Keychain shortly after the last keystroke */
  const [draft, setDraft] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: saves on a new draft only (for the provider being edited)
  useEffect(() => {
    if (!APP || draft === null) return;
    const id = setTimeout(() => {
      void saveAiKey(editProvider, draft)
        .then(() => setAi({ key: draft ? KEYCHAIN_KEY : "" }))
        .catch(() => setTest({ state: "fail", text: tx("settings.the_key_could_not_be_saved") }));
    }, 450);
    return () => clearTimeout(id);
  }, [draft]);
  const testConnection = async () => {
    setTest({ state: "busy" });
    try {
      const r = await fetch("/api/ai/review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-provider": ai.provider,
          "x-ai-key": ai.key,
          "x-ai-model": ai.model,
          "x-ai-workspace": ai.workspace ?? "",
        },
        body: JSON.stringify({ test: true }),
      });
      const j = await r.json();
      if (r.ok) {
        setTest({
          state: "ok",
          text: j.shared
            ? tx("settings.connected_through_the_organiser_s_key", { text: j.text })
            : tx("settings.connected_answered", {
                p1: ai.model || tx("settings.the_default_model"),
                text: j.text,
              }),
        });
        if (j.shared && shared) setShared({ ...shared, used: Math.min(shared.limit, shared.used + 1) });
      } else setTest({ state: "fail", text: humanError(ai.provider, r.status, j.error) });
    } catch {
      setTest({ state: "fail", text: tx("settings.could_not_reach_the_server") });
    }
  };
  const app = DJ_APPS.find((a) => a.id === folderFor);
  const remembered = memory.notes.length + memory.sets.length + memory.feedbackHistory.length;

  return (
    <div className="settings-page mx-auto max-w-[720px] lg:max-w-none">
      <PageHeader title={tx("settings.settings")} />
      {/* wide screens (round 23): the groups flow in two columns, the Mac preferences way */}
      <div className="settings-cols">
        {/* order (round8-ux.md §1.10): what the DJ changes most first; accounts and the owner's rows last */}
        {/* wave 3: the app's language; Auto follows the browser (the system, in the apps) */}
        <Group header={tx("settings.language.header")} footer={tx("settings.language.footer")}>
          <SegmentedRow
            label={tx("settings.language.label")}
            tip={tx("settings.language.tip")}
            tips={{ auto: tx("settings.language.tip_auto"), en: LOCALE_NAME.en, tr: LOCALE_NAME.tr }}
            value={settings.language ?? "auto"}
            items={[
              ["auto", tx("settings.language.auto")],
              ["en", LOCALE_NAME.en],
              ["tr", LOCALE_NAME.tr],
            ]}
            onChange={(l) => setSettings({ language: l })}
            tile={
              <Tile color="#5856d6">
                <Languages size={16} strokeWidth={2} />
              </Tile>
            }
          />
        </Group>
        <Group
          header={tx("settings.appearance")}
          footer={tx("settings.reduce_transparency_makes_navigation_and_sheets")}
        >
          <SegmentedRow
            label={tx("settings.theme")}
            tips={{
              auto: tx("settings.follow_this_device_light_by_day"),
              light: tx("settings.always_light"),
              dark: tx("settings.always_dark_easier_on_the_eyes"),
            }}
            value={settings.theme}
            items={THEMES}
            onChange={(t) => setSettings({ theme: t })}
            tile={
              <Tile color="#636366">
                <Palette size={16} strokeWidth={2} />
              </Tile>
            }
          />
          <SwitchRow
            label={tx("settings.reduce_transparency")}
            tip={tx("settings.makes_the_bars_and_sheets_solid")}
            checked={settings.reduceGlass}
            onChange={(v) => setSettings({ reduceGlass: v })}
          />
          <SwitchRow
            label={tx("settings.sound_effects")}
            tip={tx("settings.small_clicks_and_chimes_when_you")}
            checked={settings.sounds !== false}
            onChange={(v) => setSettings({ sounds: v })}
          />
        </Group>

        <Group header={tx("settings.region")} footer={tx("settings.default_for_tonight_s_region_on")}>
          <PickerRow
            label={tx("settings.where_you_usually_play")}
            tip={tx("settings.sets_the_region_in_tonight_for")}
            value={settings.region}
            items={REGIONS}
            onChange={(r) => r && setSettings({ region: r })}
            tile={
              <Tile color="#007aff">
                <Globe size={16} strokeWidth={2} />
              </Tile>
            }
          />
        </Group>

        {/* round 22: the song indicators (energy, BPM, key, era, artwork), the same switches as the player's Show */}
        <IndicatorSwitches />

        {/* 2026-11: the Booth's light confirmation (lib/booth/confirm.ts) */}
        <Group
          header={tx("settings.booth.header")}
          footer={tx("settings.booth.confirm_footer")}
          data-testid="settings-booth"
        >
          <SwitchRow
            label={tx("settings.booth.confirm")}
            checked={settings.boothConfirm !== false}
            onChange={(v) => setSettings({ boothConfirm: v })}
          />
        </Group>
        {/* 2026-11: Booth → Gaps — a song's own silence and the gap (lib/booth/engine.ts, core silenceJoin) */}
        <SilenceGroup />
        {/* 2026-11: what can play the night on this device, and which one plays on Automatic */}
        <DeviceSourcesGroup />
        {/* 2026-11: Booth → Audio — outputs, the chain, a controller's pairs, two speaker sets, Before the night */}
        <BoothAudioSettings />
        {/* 2026-11: Booth → Controller — a DJ controller over MIDI, its mapping and MIDI Learn (lib/controller) */}
        <Group
          header={tx("controller.settings.header")}
          footer={tx("controller.settings.footer")}
          data-testid="settings-booth-controller"
        >
          <ControllerSettingsBody />
        </Group>

        <Group header={tx("settings.composing")} footer={tx("settings.after_every_compose_the_night_is")}>
          <SwitchRow
            label={tx("settings.auto_improve_against_published_sets")}
            tip={tx("settings.after_each_compose_t_dj_compares")}
            checked={settings.autoImprove}
            onChange={(v) => setSettings({ autoImprove: v })}
            tile={
              <Tile color="#34c759">
                <Sparkles size={16} strokeWidth={2} />
              </Tile>
            }
          />
        </Group>

        {/* the rule check before an edit (lib/ruleCheck.ts): ask first, or apply with a toast and Undo */}
        <Group
          header={tx("settings.compose_rules")}
          footer={tx("settings.compose_rules_footer")}
          data-testid="settings-compose-rules"
        >
          <SwitchRow
            label={tx("settings.ask_before_breaking_a_rule")}
            sub={tx("settings.ask_before_breaking_a_rule_sub")}
            checked={settings.askBeforeRuleBreak !== false}
            onChange={(v) => setSettings({ askBeforeRuleBreak: v })}
            tile={
              <Tile color="#ff9500">
                <ShieldCheck size={16} strokeWidth={2} />
              </Tile>
            }
          />
        </Group>

        <Group
          header={tx("settings.cortinas")}
          data-testid="settings-cortinas"
          footer={tx("settings.where_a_cortina_stops_t_dj", {
            p1:
              settings.cortinaStopSec === null
                ? tx("settings.following_the_composer_s_cortina_length", {
                    p1: cortinaStopSec(settings, options.cortinaLengthSec),
                  })
                : tx("settings.spotify_playlists_cannot_trim_tracks_cortinas"),
          })}
        >
          {/* 2026-11: a cortina must be told from tango at once: it starts at its chorus, not its intro */}
          <SwitchRow
            label={tx("settings.start_cortinas_at_the_chorus")}
            sub={
              settings.cortinaHookStart === false
                ? tx("settings.start_cortinas_at_the_chorus_sub")
                : undefined
            }
            tip={tx("settings.start_cortinas_at_the_chorus_tip")}
            checked={settings.cortinaHookStart !== false}
            onChange={(v) => setSettings({ cortinaHookStart: v })}
            tile={
              <Tile color="#ff2d55">
                <Music2 size={16} strokeWidth={2} />
              </Tile>
            }
          />
          <StepperRow
            label={tx("settings.cortina_play_length")}
            sub={
              settings.cortinaStopSec === null
                ? tx("settings.follows_the_composer")
                : tx("settings.your_own_length")
            }
            value={cortinaStopSec(settings, options.cortinaLengthSec)}
            unit=" s"
            min={CORTINA_STOP_RANGE.min}
            max={CORTINA_STOP_RANGE.max}
            step={CORTINA_STOP_RANGE.step}
            onChange={(v) => setSettings({ cortinaStopSec: v })}
            tile={
              <Tile color="#ff2d55">
                <Timer size={16} strokeWidth={2} />
              </Tile>
            }
          />
          <SwitchRow
            label={tx("settings.follow_the_composer_s_cortina_length")}
            tip={tx("settings.use_the_cortina_length_you_set")}
            checked={settings.cortinaStopSec === null}
            onChange={(v) =>
              setSettings({ cortinaStopSec: v ? null : cortinaStopSec(settings, options.cortinaLengthSec) })
            }
          />
        </Group>

        <Group
          header={tx("settings.dj_apps")}
          footer={tx("settings.exports_point_at_real_paths_once", {
            p1: settings.fileNaming || DEFAULT_NAMING,
            p2: (settings.fileNaming || DEFAULT_NAMING)
              .replace("{artist}", "Juan D'Arienzo")
              .replace("{orchestra}", "Juan D'Arienzo")
              .replace("{title}", "El Flete")
              .replace("{singer}", "")
              .replace("{year}", "1936")
              .replace("{rhythm}", "tango")
              .replace("{tanda}", "03")
              .replace("{n}", "011")
              .replace(/\s{2,}/g, " ")
              .trim(),
          })}
        >
          <FieldRow
            label={tx("settings.file_naming")}
            tip={tx("settings.how_your_music_files_are_named")}
            id="file-naming"
            tile={
              <Tile color="#ff9500">
                <FolderOpen size={16} strokeWidth={2} />
              </Tile>
            }
          >
            <input
              id="file-naming"
              className="field field-value min-w-0 flex-1 font-mono"
              value={settings.fileNaming}
              placeholder={DEFAULT_NAMING}
              onChange={(e) => setSettings({ fileNaming: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </FieldRow>
          {DJ_APPS.map((a) => (
            <Row
              key={a.id}
              label={a.label}
              sub={a.format}
              chevron
              onClick={() => setFolderFor(a.id)}
              tip={tx("settings.choose_the_folder_where_finds_your", { label: a.label })}
              value={settings.djApps[a.id]?.folder ? tx("settings.set") : tx("settings.off")}
              id={`folder-row-${a.id}`}
            />
          ))}
        </Group>

        {/* wave 4: the night's generated cover on the playlists it is exported to (Spotify) */}
        <Group header={tx("settings.export.header")} footer={tx("settings.export.footer")}>
          <SwitchRow
            label={tx("settings.export.cover")}
            tip={tx("settings.export.cover_tip")}
            checked={settings.exportCover !== false}
            onChange={(v) => setSettings({ exportCover: v })}
            tile={
              <Tile color="#a33159">
                <ImageIcon size={16} strokeWidth={2} />
              </Tile>
            }
          />
        </Group>

        <TandaRulesGroup
          id="settings-tanda-rules"
          value={options.tandaRules}
          onChange={(tandaRules) => setOptions({ tandaRules })}
        />

        <Group
          header={tx("settings.what_t_dj_learned_from_your")}
          footer={tx("settings.every_swap_search_and_swap_ai")}
          data-testid="learned-edits"
        >
          {learnedLines.length ? (
            learnedLines.slice(0, 12).map((l) => <Row key={l} label={l} />)
          ) : (
            <Row label={tx("settings.nothing_yet")} sub={tx("settings.swap_a_side_or_keep_a")} />
          )}
          {learnedLines.length > 0 && (
            <ActionRow
              label={tx("settings.forget_what_t_dj_learned_from")}
              tip={tx("settings.clears_what_your_swaps_and_pinned")}
              destructive
              onClick={() => updateMemory((m) => ({ ...m, learned: undefined }))}
            />
          )}
        </Group>
        {/* the featured night's edits: the repo-level store every night composes with (weigh, delete, switch off) */}
        <FeaturedLearned />

        <Group header={tx("settings.memory")} footer={tx("settings.the_assistant_keeps_notes_the_sets")}>
          <Row
            tile={
              <Tile color="#ff2d55">
                <Brain size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("settings.stored")}
            value={`${APP ? tx("settings.on_this_device") : storageMode === "server" ? tx("settings.kept_by_this_site") : tx("settings.in_this_browser")} · ${remembered} ${remembered === 1 ? tx("settings.item") : tx("settings.items")}`}
          />
          <SwitchRow
            label={tx("settings.let_the_assistant_learn_from_my")}
            tip={tx("settings.repeated_feedback_becomes_a_preference_for")}
            checked={settings.learn}
            onChange={(v) => setSettings({ learn: v })}
          />
          {/* 2026-11: dancer favourites live with the memory (Database → Memory) */}
          <Row
            tile={
              <Tile color="#c9426a">
                <Heart size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("fav.title")}
            tip={tx("fav.settings_tip")}
            chevron
            onClick={() => router.push("/database?tab=memory#dancer-favourites")}
            id="settings-dancer-favourites"
          />
          {/* 2026-11: popularity from databases (DJ sets, canonical tandas, set lists), default on */}
          <PopularitySwitch />
        </Group>

        {APP && <AppConnections />}
        <Connectors />
        {/* round 22: where missing BPM, key, level, artwork and dates come from, and "Add a source" */}
        <DataSources />

        {/* Models and the note under its footer are one block: a column break never parts them (wide screens) */}
        <div data-testid="ai-models">
          <Group
            header={tx("settings.models")}
            footer={
              <span
                role="status"
                aria-live="polite"
                className={
                  test.state === "fail"
                    ? "text-[var(--destructive)]"
                    : test.state === "ok"
                      ? "text-[var(--system-green)]"
                      : undefined
                }
              >
                <TestIcon state={test.state} />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={
                      test.state === "idle"
                        ? "idle"
                        : test.state === "busy"
                          ? checking
                            ? "busy"
                            : "idle"
                          : test.text
                    }
                    variants={fade}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    // the result text lands as the check in the Lottie completes (300 ms in)
                    transition={
                      test.state === "ok" || test.state === "fail" ? { ...tw.fade, delay: 0.3 } : tw.fade
                    }
                    className={test.state === "idle" ? "block" : "ml-1.5 inline"}
                  >
                    {test.state === "busy"
                      ? checking
                        ? tx("settings.checking")
                        : ""
                      : (test.text ??
                        (usingShared
                          ? tx("settings.the_organiser_s_key_writes_your", { p1: shared?.limit ?? 20 })
                          : APP
                            ? tx("settings.a_model_key_lets_you_ask_2")
                            : tx("settings.a_model_key_lets_you_ask")))}
                  </motion.span>
                </AnimatePresence>
              </span>
            }
          >
            <Row
              tile={
                <Tile color="#5856d6">
                  <KeyRound size={16} strokeWidth={2} />
                </Tile>
              }
              label={tx("settings.status")}
              value={
                agentInUse
                  ? tx("settings.using", { name: agentInUse.name })
                  : ai.key
                    ? tx("settings.key_saved")
                    : shared === null
                      ? tx("settings.checking")
                      : shared.shared
                        ? tx("settings.using_the_organiser_s_key_of", {
                            used: shared.used,
                            limit: shared.limit,
                          })
                        : tx("settings.off")
              }
              id="ai-status"
            />
            {!showOwn && (
              <Row
                label={tx("settings.use_my_own_key")}
                tip={tx("settings.paste_a_key_of_your_own")}
                sub={tx("settings.unlimited_kept_in_this_browser")}
                value={tx("settings.show")}
                onClick={() => setOwnKey(true)}
                id="ai-own-key"
              />
            )}
            {showOwn && (
              <>
                <SegmentedRow
                  label={tx("settings.provider")}
                  tip={tx("settings.the_company_whose_model_writes_your")}
                  value={ai.provider}
                  items={AI_PROVIDERS}
                  onChange={switchProvider}
                />
                <FieldRow
                  label={tx("settings.api_key")}
                  id="ai-key"
                  tip={tx("settings.your_own_key_from_the_provider")}
                >
                  <input
                    id="ai-key"
                    type={showKey ? "text" : "password"}
                    className="field field-value min-w-0 flex-1 font-mono"
                    placeholder={
                      APP && ai.key ? tx("settings.saved_in_your_keychain") : KEY_PLACEHOLDER[ai.provider]
                    }
                    value={APP ? (draft ?? "") : ai.key}
                    onChange={(e) =>
                      APP ? setDraft(e.target.value.trim()) : setAi({ key: e.target.value.trim() })
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Tip text={showKey ? tx("settings.hide_the_key") : tx("settings.show_the_key_to_check_it")}>
                    <button
                      type="button"
                      className="btn-plain -mr-2"
                      onClick={() => setShowKey((v) => !v)}
                      aria-pressed={showKey}
                    >
                      {showKey ? tx("settings.hide") : tx("settings.show")}
                    </button>
                  </Tip>
                </FieldRow>
                <FieldRow
                  label={tx("settings.model")}
                  sub={tx("settings.leave_blank_for_the_default")}
                  id="ai-model"
                >
                  <input
                    id="ai-model"
                    list="ai-model-list"
                    className="field field-value min-w-0 flex-1 font-mono"
                    placeholder={AI_DEFAULT_MODEL[ai.provider]}
                    value={ai.model}
                    onChange={(e) => setAi({ model: e.target.value.trim() })}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <datalist id="ai-model-list">
                    {MODEL_SUGGESTIONS[ai.provider].map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </FieldRow>
                {ai.provider === "anthropic" && (
                  <FieldRow
                    label={tx("settings.organisation_id")}
                    sub={tx("settings.only_for_an_anthropic_key_made")}
                    id="ai-workspace"
                  >
                    <input
                      id="ai-workspace"
                      className="field field-value min-w-0 flex-1 font-mono"
                      placeholder="wrkspc_…"
                      value={ai.workspace ?? ""}
                      onChange={(e) => setAi({ workspace: e.target.value.trim() })}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </FieldRow>
                )}
              </>
            )}
            <ActionRow
              label={
                !ai.key && !usingShared
                  ? tx("settings.test_connection_add_a_key_first")
                  : tx("settings.test_connection")
              }
              tip={tx("settings.sends_one_short_request_to_check")}
              onClick={testConnection}
              disabled={!ai.key && !usingShared}
              busy={test.state === "busy"}
              id="ai-test"
            />
          </Group>
          {showOwn && ai.provider === "anthropic" && (
            // its own paragraph under the group's footer: the -0.5 rem pull overlapped a long footer (wave 2)
            <p className="section-foot mt-1" data-testid="ai-workspace-note">
              {tx("settings.organisation_id_only_needed_when_the")}
            </p>
          )}
        </div>

        <ModelConnections />

        <Group
          header={tx("settings.storage")}
          footer={
            APP
              ? tx("settings.your_database_memory_settings_and_the")
              : storageMode === "server"
                ? tx("settings.your_database_and_memory_are_kept")
                : tx("settings.your_database_and_memory_stay_in")
          }
        >
          <Row
            tile={
              <Tile color="#636366">
                <HardDrive size={16} strokeWidth={2} />
              </Tile>
            }
            label={tx("settings.database")}
            value={
              APP
                ? tx("settings.this_device")
                : storageMode === "server"
                  ? tx("settings.this_site")
                  : tx("settings.this_browser")
            }
          />
        </Group>

        <About />
      </div>

      <Sheet
        open={!!app}
        onClose={() => setFolderFor(null)}
        title={app?.label ?? ""}
        trailing={tx("settings.done")}
      >
        {app && (
          <Group header={tx("settings.music_folder")} footer={app.note}>
            <label htmlFor={`folder-${app.id}`} className="cell">
              <span className="sr-only">{tx("settings.folder", { label: app.label })}</span>
              <input
                id={`folder-${app.id}`}
                className="field font-mono"
                data-autofocus
                value={settings.djApps[app.id]?.folder ?? ""}
                onChange={(e) =>
                  setSettings({ djApps: { ...settings.djApps, [app.id]: { folder: e.target.value } } })
                }
                placeholder={
                  app.id === "rekordbox" ? "/Users/you/Music/Tango" : tx("settings.music_folder_path")
                }
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </Group>
        )}
      </Sheet>
    </div>
  );
}
