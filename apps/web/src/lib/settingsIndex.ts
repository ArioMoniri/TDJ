/**
 * 2026-11 (owner: "Settings is too overwhelming") — Settings in categories, the macOS System Settings / iOS Settings
 * way, and one search over every setting. This module is the map: the categories (their order, title and one-line
 * explanation), every setting in them (its label, its help text, the words a DJ might type for it in English and
 * Turkish, and where it sits on the page), and the search over that map. No React here: the vitest reads it as is.
 *
 * A setting's `target` lists CSS selectors, the first that is on the page wins: a row's own id or `data-setting`,
 * else its group's test id (a component that renders its own group). Deep links (`/settings#ai-key`,
 * `/settings?section=ai`) and the search results land through the same map (components/settings/SettingsShell.tsx).
 */
import type { MsgKey } from "@/lib/i18n/en";
import { en } from "@/lib/i18n/en";
import { tr } from "@/lib/i18n/tr";

export const SECTIONS = [
  "general",
  "appearance",
  "booth",
  "audio",
  "keyboard",
  "night",
  "connections",
  "ai",
  "library",
  "rooms",
  "battery",
  "about",
] as const;
export type SectionId = (typeof SECTIONS)[number];

export const isSection = (s: string | null | undefined): s is SectionId =>
  !!s && (SECTIONS as readonly string[]).includes(s);

export interface SectionMeta {
  title: MsgKey;
  blurb: MsgKey;
  /** the tile's colour (the icon is the page's: lucide-react stays out of this module) */
  color: string;
  /** words for the whole category (both languages) */
  syn: string;
}

export const SECTION_META: Record<SectionId, SectionMeta> = {
  general: {
    title: "settings.cat.general",
    blurb: "settings.cat.general_blurb",
    color: "#8e8e93",
    syn: "general genel",
  },
  appearance: {
    title: "settings.cat.appearance",
    blurb: "settings.cat.appearance_blurb",
    color: "#007aff",
    syn: "appearance look display görünüm ekran",
  },
  booth: {
    title: "settings.cat.booth",
    blurb: "settings.cat.booth_blurb",
    color: "#ff2d55",
    syn: "booth playback play kabin çalma",
  },
  audio: {
    title: "settings.cat.audio",
    blurb: "settings.cat.audio_blurb",
    color: "#ff9500",
    syn: "audio sound outputs speakers ses çıkış hoparlör",
  },
  keyboard: {
    title: "settings.cat.keyboard",
    blurb: "settings.cat.keyboard_blurb",
    color: "#636366",
    syn: "keyboard gestures shortcuts klavye hareket kısayol",
  },
  night: {
    title: "settings.cat.night",
    blurb: "settings.cat.night_blurb",
    color: "#af52de",
    syn: "night rules compose composer gece kural oluştur",
  },
  connections: {
    title: "settings.cat.connections",
    blurb: "settings.cat.connections_blurb",
    color: "#34c759",
    syn: "connections accounts services bağlantı hesap servis",
  },
  ai: {
    title: "settings.cat.ai",
    blurb: "settings.cat.ai_blurb",
    color: "#5856d6",
    syn: "ai artificial intelligence assistant yapay zeka zekâ asistan",
  },
  library: {
    title: "settings.cat.library",
    blurb: "settings.cat.library_blurb",
    color: "#a2845e",
    syn: "library data files storage sync devices icloud code export import kütüphane veri dosya depolama eşitleme cihaz kod dışa içe aktar",
  },
  rooms: {
    title: "settings.cat.rooms",
    blurb: "settings.cat.rooms_blurb",
    color: "#30b0c7",
    syn: "rooms room share oda odalar paylaş",
  },
  battery: {
    title: "settings.cat.battery",
    blurb: "settings.cat.battery_blurb",
    color: "#30d158",
    syn: "battery power pil batarya güç",
  },
  about: {
    title: "settings.cat.about",
    blurb: "settings.cat.about_blurb",
    color: "#8e8e93",
    syn: "about version hakkında sürüm",
  },
};

/** the grouped list on phones (iOS Settings): related categories share a group */
export const SECTION_GROUPS: SectionId[][] = [
  ["general", "appearance", "battery"],
  ["booth", "audio", "keyboard"],
  ["night", "library", "rooms"],
  ["connections", "ai"],
  ["about"],
];

export interface SettingEntry {
  id: string;
  section: SectionId;
  label: MsgKey;
  help?: MsgKey;
  /** CSS selectors, the first one on the page wins */
  target: string[];
  /** what a DJ might type for it, English and Turkish (never shown) */
  syn?: string;
  /** shown only in the Mac / iPhone / iPad apps, or only on the web */
  only?: "app" | "web";
}

const ds = (s: string) => `[data-setting="${s}"]`;
const tid = (s: string) => `[data-testid="${s}"]`;

export const SETTINGS: SettingEntry[] = [
  // General
  {
    id: "language",
    section: "general",
    label: "settings.language.label",
    help: "settings.language.footer",
    target: [ds("language")],
    syn: "language locale english turkish türkçe dil lisan ingilizce",
  },
  {
    id: "region",
    section: "general",
    label: "settings.where_you_usually_play",
    help: "settings.sets_the_region_in_tonight_for",
    target: [ds("region")],
    syn: "region country city location buenos aires istanbul europe bölge ülke şehir konum avrupa",
  },
  {
    id: "sounds",
    section: "general",
    label: "settings.sound_effects",
    help: "settings.small_clicks_and_chimes_when_you",
    target: [ds("sounds")],
    syn: "sound effects click chime mute ses efekt tıklama sessiz",
  },
  // Appearance
  {
    id: "theme",
    section: "appearance",
    label: "settings.theme",
    help: "settings.follow_this_device_light_by_day",
    target: [ds("theme")],
    syn: "theme dark mode light mode night mode colour color tema karanlık koyu açık gece modu renk",
  },
  {
    id: "reduce-transparency",
    section: "appearance",
    label: "settings.reduce_transparency",
    help: "settings.makes_the_bars_and_sheets_solid",
    target: [ds("reduce-transparency")],
    syn: "glass blur transparency opaque solid cam bulanık şeffaflık saydamlık opak",
  },
  {
    id: "indicators",
    section: "appearance",
    label: "booth.indicatorSwitches.indicators",
    help: "booth.indicatorSwitches.hover_or_long_press_any_indicator",
    target: [tid("indicator-switches")],
    syn: "energy bpm tempo key artwork cover indicator enerji tempo ton kapak gösterge",
  },
  {
    id: "era-badge",
    section: "appearance",
    label: "booth.indicatorSwitches.era_badge",
    help: "booth.indicatorSwitches.grades_from_your_orchestra_heatmap",
    target: [tid("indicator-switches")],
    syn: "era year decade golden age dönem yıl altın çağ rozet",
  },
  // Booth & Playback
  {
    id: "tap-play",
    section: "booth",
    label: "settings.tap_play",
    help: "settings.tap_play_footer",
    target: [ds("tap-play")],
    syn: "tap play song tandas next queue dokun çal şarkı sıradaki",
  },
  {
    id: "booth-confirm",
    section: "booth",
    label: "settings.booth.confirm",
    help: "settings.booth.confirm_footer",
    target: [ds("booth-confirm")],
    syn: "confirm double tap hold safety accidental skip onay iki kez dokun güvenlik",
  },
  {
    id: "gaps",
    section: "booth",
    label: "settings.gaps.short",
    help: "settings.gaps.footer",
    target: [tid("settings-gaps")],
    syn: "gap silence pause between songs trim sessizlik boşluk ara duraklama",
  },
  {
    id: "transitions",
    section: "booth",
    label: "settings.transitions.header",
    help: "settings.transitions.footer",
    target: [tid("settings-transitions")],
    syn: "transition crossfade fade mix template geçiş karışım şablon",
  },
  {
    id: "transition-defaults",
    section: "booth",
    label: "settings.transitions.defaults_header",
    help: "settings.transitions.defaults_footer",
    target: [tid("settings-transition-defaults")],
    syn: "default transition crossfade varsayılan geçiş",
  },
  {
    id: "device-sources",
    section: "booth",
    label: "deviceSources.header",
    target: [tid("booth-device-sources")],
    syn: "source youtube spotify preview stream automatic kaynak önizleme otomatik",
  },
  // Audio & Outputs
  {
    id: "outputs",
    section: "audio",
    label: "booth.outputs.header",
    target: [tid("settings-booth-audio")],
    syn: "output speaker speakers headphones audio device usb bluetooth latency çıkış hoparlör kulaklık ses cihaz gecikme",
  },
  {
    id: "two-sets",
    section: "audio",
    label: "booth.outputs.two_sets",
    target: [tid("settings-booth-mirror")],
    syn: "two speakers second room mirror iki hoparlör ikinci salon",
  },
  {
    id: "before-night",
    section: "audio",
    label: "booth.before.header",
    help: "booth.before.footer",
    target: [tid("booth-before-night"), tid("settings-booth-audio")],
    syn: "check test sound before soundcheck ses kontrolü deneme",
  },
  {
    id: "controller",
    section: "audio",
    label: "controller.settings.header",
    help: "controller.settings.footer",
    target: [tid("settings-booth-controller")],
    syn: "midi controller ddj pioneer mapping learn hardware kontrolcü eşleme donanım",
  },
  // Keyboard & Gestures
  {
    id: "shortcuts",
    section: "keyboard",
    label: "keys.header",
    help: "keys.footer",
    target: ["#settings-keyboard"],
    syn: "keyboard shortcut shortcuts hotkey keys bind rebind klavye kısayol tuş",
  },
  {
    id: "shake",
    section: "keyboard",
    label: "shake.header",
    help: "shake.footer",
    target: [tid("settings-shake")],
    syn: "shake undo gesture motion salla geri al hareket",
  },
  {
    id: "keys-reset",
    section: "keyboard",
    label: "keys.reset_all",
    target: ["#keys-reset-all"],
    syn: "reset default shortcuts sıfırla varsayılan kısayol",
  },
  // Night rules
  {
    id: "auto-improve",
    section: "night",
    label: "settings.auto_improve_against_published_sets",
    help: "settings.after_each_compose_t_dj_compares",
    target: [ds("auto-improve")],
    syn: "improve compose published sets benchmark iyileştir oluştur",
  },
  {
    id: "rule-check",
    section: "night",
    label: "settings.ask_before_breaking_a_rule",
    help: "settings.ask_before_breaking_a_rule_sub",
    target: [ds("rule-check")],
    syn: "rule warn ask before edit break kural uyar sor",
  },
  {
    id: "tanda-rules",
    section: "night",
    label: "tandaRules.tanda_rules",
    help: "tandaRules.every_tanda_you_compose_improve_swap",
    target: ["#settings-tanda-rules"],
    syn: "tanda length songs per tanda pattern orchestra şarkı sayısı düzen orkestra",
  },
  {
    id: "cortina-chorus",
    section: "night",
    label: "settings.start_cortinas_at_the_chorus",
    help: "settings.start_cortinas_at_the_chorus_tip",
    target: [ds("cortina-chorus")],
    syn: "cortina chorus hook start kortina nakarat başlangıç",
  },
  {
    id: "cortina-length",
    section: "night",
    label: "settings.cortina_play_length",
    target: [ds("cortina-length")],
    syn: "cortina length duration seconds kortina süre uzunluk saniye",
  },
  {
    id: "cortina-follow",
    section: "night",
    label: "settings.follow_the_composer_s_cortina_length",
    help: "settings.use_the_cortina_length_you_set",
    target: [ds("cortina-follow")],
    syn: "cortina composer length kortina süre",
  },
  {
    id: "night-closing",
    section: "night",
    label: "settings.night.header",
    help: "settings.night.footer",
    target: [tid("settings-night")],
    syn: "closing la cumparsita ending last tanda última opening kapanış son açılış",
  },
  {
    id: "learned-edits",
    section: "night",
    label: "settings.what_t_dj_learned_from_your",
    help: "settings.every_swap_search_and_swap_ai",
    target: [tid("learned-edits")],
    syn: "learned learning edits forget öğrendi öğrenme düzenleme unut",
  },
  {
    id: "floor-learning",
    section: "night",
    label: "floorLearn.header",
    help: "floorLearn.footer",
    target: [tid("floor-learning")],
    syn: "floor dancers reactions pist dansçı tepki",
  },
  {
    id: "featured-learned",
    section: "night",
    label: "featuredLearned.header",
    help: "featuredLearned.footer",
    target: [tid("featured-learned")],
    syn: "featured night learned rules öne çıkan gece öğrenilen kural",
  },
  // Connections
  {
    id: "tdj-server",
    section: "connections",
    label: "appConnections.tdj_server",
    help: "appConnections.t_dj_works_fully_on_this",
    target: ["#app-connections"],
    syn: "server link sync self hosted sunucu bağla eşitle",
    only: "app",
  },
  {
    id: "spotify",
    section: "connections",
    label: "connectors.spotify",
    target: ["#connector-spotify"],
    syn: "spotify account login log in premium hesap giriş",
  },
  {
    id: "spotify-own-app",
    section: "connections",
    label: "spotify_own.title",
    target: ["#connector-spotify"],
    syn: "spotify own app client id developer dashboard redirect kendi uygulama geliştirici",
  },
  {
    id: "google",
    section: "connections",
    label: "connectors.google",
    help: "connectors.one_google_account_for_two_things",
    target: ["#connector-google"],
    syn: "google youtube drive account hesap",
  },
  {
    id: "dropbox",
    section: "connections",
    label: "connectors.dropbox",
    target: ["#connector-dropbox"],
    syn: "dropbox files cloud dosya bulut",
  },
  {
    id: "also-used",
    section: "connections",
    label: "connectors.also_used",
    help: "connectors.deezer_and_musicbrainz_need_no_account",
    target: ["#connector-deezer"],
    syn: "deezer musicbrainz",
  },
  {
    id: "webhook",
    section: "connections",
    label: "connectors.bring_your_own_automation",
    help: "connectors.export_webhook_for_pipedream_make_zapier",
    target: ["#connector-webhook"],
    syn: "webhook automation zapier make pipedream otomasyon",
  },
  {
    id: "lyrics",
    section: "connections",
    label: "song.lyrics_sources_header",
    target: ["#lyrics-sources"],
    syn: "lyrics words musixmatch genius lrclib şarkı sözü söz",
  },
  {
    id: "import",
    section: "connections",
    label: "import.entry",
    help: "import.entry_sub",
    target: ["#settings-import"],
    syn: "import playlist youtube spotify file içe aktar çalma listesi dosya",
  },
  // AI
  {
    id: "ai-models",
    section: "ai",
    label: "settings.models",
    target: [tid("ai-models")],
    syn: "ai model claude anthropic openai gpt gemini llm assistant review yapay zeka zekâ asistan model",
  },
  {
    id: "ai-key",
    section: "ai",
    label: "settings.api_key",
    help: "settings.your_own_key_from_the_provider",
    target: ["#ai-key", "#ai-own-key", tid("ai-models")],
    syn: "api key token secret anahtar şifre",
  },
  {
    id: "ai-test",
    section: "ai",
    label: "settings.test_connection",
    help: "settings.sends_one_short_request_to_check",
    target: ["#ai-test"],
    syn: "test check connection dene bağlantı kontrol",
  },
  {
    id: "ai-agents",
    section: "ai",
    label: "modelConnections.keys_and_agents",
    help: "modelConnections.the_one_with_the_check_mark",
    target: [tid("model-connections")],
    syn: "agent acp provider keys ajan sağlayıcı anahtarlar",
  },
  // Library & Data
  {
    id: "file-naming",
    section: "library",
    label: "settings.file_naming",
    help: "settings.how_your_music_files_are_named",
    target: ["#file-naming"],
    syn: "file name naming pattern rename dosya adı adlandırma",
  },
  {
    id: "dj-apps",
    section: "library",
    label: "settings.dj_apps",
    target: [ds("dj-apps")],
    syn: "rekordbox serato traktor virtual dj engine folder music folder klasör müzik",
  },
  {
    id: "export-cover",
    section: "library",
    label: "settings.export.cover",
    help: "settings.export.cover_tip",
    target: [ds("export-cover")],
    syn: "cover artwork image playlist export kapak görsel resim dışa aktar",
  },
  {
    id: "memory",
    section: "library",
    label: "settings.let_the_assistant_learn_from_my",
    help: "settings.repeated_feedback_becomes_a_preference_for",
    target: [ds("memory-learn")],
    syn: "memory learn feedback preferences hafıza öğren geri bildirim tercih",
  },
  {
    id: "dancer-favourites",
    section: "library",
    label: "fav.title",
    help: "fav.settings_tip",
    target: ["#settings-dancer-favourites"],
    syn: "favourites favorites dancers hearts likes favori dansçı beğeni",
  },
  {
    id: "popularity",
    section: "library",
    label: "pop.use_switch",
    help: "pop.use_tip",
    target: [ds("popularity"), ds("memory-learn")],
    syn: "popularity popular top songs databases popüler en çok",
  },
  {
    id: "data-sources",
    section: "library",
    label: "dataSources.data_sources",
    help: "dataSources.where_missing_bpm_key_level_artwork",
    target: ["#data-sources"],
    syn: "bpm key level artwork discogs deezer metadata source token veri kaynağı ton kapak",
  },
  {
    id: "storage",
    section: "library",
    label: "settings.storage",
    target: [ds("storage")],
    syn: "storage database browser device local saved depolama veritabanı tarayıcı cihaz",
  },
  // Rooms
  {
    id: "rooms",
    section: "rooms",
    label: "settings.rooms.open",
    help: "settings.rooms.footer",
    target: ["#settings-rooms-open"],
    syn: "room rooms share live dancers co dj oda odalar paylaş canlı",
  },
  // Battery
  {
    id: "battery-saver",
    section: "battery",
    label: "power.label",
    help: "power.footer",
    target: [tid("settings-power")],
    syn: "battery power saver low power energy animations pil batarya güç tasarruf enerji",
  },
  // About
  {
    id: "about",
    section: "about",
    label: "about.about",
    target: ["#settings-about"],
    syn: "about version credits licence hakkında sürüm",
  },
  {
    id: "check-updates",
    section: "about",
    label: "about.check_updates",
    help: "about.check_updates_sub",
    target: ["#about-check-updates", "#settings-about"],
    syn: "update upgrade new version download güncelle güncelleme yeni sürüm",
    only: "app",
  },
];

/** the category an address's query names: `?section=<id>`; a service's sign-in coming back (`?error=`, `?connected=`) */
export function sectionOf(q: Record<string, string | string[] | undefined>): SectionId | null {
  const s = q.section;
  if (typeof s === "string" && isSection(s)) return s;
  return q.error !== undefined || q.connected !== undefined ? "connections" : null;
}

/** the setting (or category) a deep-link hash names: a target id, or an older anchor that moved */
const HASH_ALIASES: Record<string, string> = { connections: "connectors" };
/** anchors of whole groups that no single setting targets */
const ANCHORS: Record<string, SectionId> = { connectors: "connections" };
export function hashTarget(hash: string): { id: string; section: SectionId | null } {
  const raw = decodeURIComponent(hash.replace(/^#/, ""));
  const id = HASH_ALIASES[raw] ?? raw;
  if (isSection(id)) return { id: "", section: id };
  const hit = SETTINGS.find((e) => e.target.includes(`#${id}`));
  return { id, section: hit?.section ?? ANCHORS[id] ?? null };
}

/**
 * Text folded for matching: lower case (Turkish dotted and dotless i alike), no accents, so "kulaklik", "KULAKLIK"
 * and "kulaklık" all find Kulaklık, and "muzik" finds müzik.
 */
export function fold(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLowerCase()
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const text = (k: MsgKey | undefined, d: Partial<Record<MsgKey, string>>): string =>
  k ? (d[k] ?? "").replace(/\{\w+\}/g, " ") : "";

interface Indexed {
  entry: SettingEntry;
  label: string[];
  syn: string[];
  rest: string[];
}
let INDEX: Indexed[] | null = null;
function index(): Indexed[] {
  if (INDEX) return INDEX;
  const words = (s: string) => fold(s).split(" ").filter(Boolean);
  INDEX = SETTINGS.map((entry) => {
    const meta = SECTION_META[entry.section];
    return {
      entry,
      label: words(`${text(entry.label, en)} ${text(entry.label, tr)}`),
      syn: words(entry.syn ?? ""),
      rest: words(
        [
          text(entry.help, en),
          text(entry.help, tr),
          text(meta.title, en),
          text(meta.title, tr),
          meta.syn,
        ].join(" "),
      ),
    };
  });
  return INDEX;
}

export interface SearchGroup {
  section: SectionId;
  entries: SettingEntry[];
}

/**
 * Every setting whose label, help text or synonyms (English and Turkish, whatever the app's language) hold each
 * word of the query, as a word or the start of one; the best first (label words before help words), grouped by
 * category, the category with the best match first.
 */
export function searchSettings(query: string, opts: { app?: boolean } = {}): SearchGroup[] {
  const q = fold(query).split(" ").filter(Boolean);
  if (!q.length) return [];
  const scored: Array<{ e: SettingEntry; score: number; at: number }> = [];
  index().forEach(({ entry, label, syn, rest }, at) => {
    if (entry.only === "app" && !opts.app) return;
    if (entry.only === "web" && opts.app) return;
    // a word in the label counts most, then a synonym (chosen for this setting), then its help or its category
    let score = 0;
    for (const w of q) {
      const tier = [label, syn, rest].findIndex((ws) => ws.some((l) => l.startsWith(w)));
      if (tier < 0) return;
      const ws = [label, syn, rest][tier]!;
      score += (3 - tier) * 2 - (ws.includes(w) ? 0 : 1);
    }
    scored.push({ e: entry, score, at });
  });
  const groups = new Map<SectionId, Array<{ e: SettingEntry; score: number; at: number }>>();
  for (const s of scored) groups.set(s.e.section, [...(groups.get(s.e.section) ?? []), s]);
  return SECTIONS.filter((s) => groups.has(s))
    .map((section) => ({
      section,
      best: Math.max(...groups.get(section)!.map((x) => x.score)),
      entries: groups
        .get(section)!
        .sort((a, b) => b.score - a.score || a.at - b.at)
        .map((x) => x.e),
    }))
    .sort((a, b) => b.best - a.best || SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section))
    .map(({ section, entries }) => ({ section, entries }));
}
