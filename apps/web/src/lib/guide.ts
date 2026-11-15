import { t } from "@/lib/i18n";
/**
 * The Guide's tour of the app (round 22 onward): one chapter per thing a DJ does, in the DJ's words. Each chapter has a
 * picture — a small Lottie loop from public/lottie or a drawn illustration — and points to where it lives.
 */
export type GuideArt =
  | { kind: "lottie"; src: string /** the frame shown still under reduced motion */; still: number }
  | { kind: "illustration"; id: "chat" | "hand" | "closing" | "share" | "versions" }
  | { kind: "era" };

export interface GuidePoint {
  title: string;
  text: string;
}

export interface GuideChapter {
  id: string;
  /** the chip in the jump list */
  short: string;
  eyebrow: string;
  title: string;
  text: string;
  points?: GuidePoint[];
  art: GuideArt;
  where?: { label: string; href: string };
}

export const LOTTIE_DIR = "/lottie";

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: "compose",
    get short() {
      return t("guide.compose");
    },
    get eyebrow() {
      return t("guide.compose");
    },
    get title() {
      return t("guide.a_whole_night_in_a_few");
    },
    get text() {
      return t("guide.say_how_long_the_night_is");
    },
    art: { kind: "lottie", src: `${LOTTIE_DIR}/compose.json`, still: 68 },
    where: {
      get label() {
        return t("guide.open_compose");
      },
      href: "/",
    },
  },
  {
    id: "edit-with-ai",
    get short() {
      return t("guide.edit_with_ai");
    },
    get eyebrow() {
      return t("guide.compose");
    },
    get title() {
      return t("guide.edit_with_ai");
    },
    get text() {
      return t("guide.ask_in_plain_words_the_way");
    },
    art: { kind: "illustration", id: "chat" },
    where: {
      get label() {
        return t("guide.open_compose");
      },
      href: "/",
    },
  },
  {
    id: "build-by-hand",
    get short() {
      return t("guide.build_by_hand");
    },
    get eyebrow() {
      return t("guide.build_by_hand");
    },
    get title() {
      return t("guide.every_tanda_your_own_choice");
    },
    get text() {
      return t("guide.start_from_an_empty_night_and");
    },
    art: { kind: "illustration", id: "hand" },
    where: {
      get label() {
        return t("guide.build_by_hand");
      },
      href: "/build",
    },
  },
  {
    id: "booth",
    get short() {
      return t("guide.the_booth");
    },
    get eyebrow() {
      return t("guide.the_booth");
    },
    get title() {
      return t("guide.play_the_night_from_one_screen");
    },
    get text() {
      return t("guide.the_set_list_on_one_side");
    },
    points: [
      {
        get title() {
          return t("guide.pre_listen_in_your_headphones");
        },
        get text() {
          return t("guide.choose_your_headphones_as_the_second");
        },
      },
      {
        get title() {
          return t("guide.mix");
        },
        get text() {
          return t("guide.milonga_floor_plays_each_song_to");
        },
      },
      {
        get title() {
          return t("guide.cue_and_stop");
        },
        get text() {
          return t("guide.open_a_song_and_drag_the");
        },
      },
      {
        get title() {
          return t("guide.skip_tonight");
        },
        get text() {
          return t("guide.leaves_a_tanda_out_of_tonight");
        },
      },
    ],
    art: { kind: "lottie", src: `${LOTTIE_DIR}/headphones.json`, still: 22 },
    where: {
      get label() {
        return t("guide.open_the_booth");
      },
      href: "/booth",
    },
  },
  {
    id: "closing",
    get short() {
      return t("guide.closing_the_night");
    },
    get eyebrow() {
      return t("guide.the_booth");
    },
    get title() {
      return t("guide.closing_the_night");
    },
    get text() {
      return t("guide.the_night_bar_shows_the_time");
    },
    points: [
      {
        get title() {
          return t("guide.last_4_tandas_tango_only");
        },
        get text() {
          return t("guide.the_vals_and_milonga_tandas_among");
        },
      },
      {
        get title() {
          return t("guide.jump_to_la_cumparsita");
        },
        get text() {
          return t("guide.rest_then_la_cumparsita_lets_this");
        },
      },
    ],
    art: { kind: "illustration", id: "closing" },
    where: {
      get label() {
        return t("guide.open_the_booth");
      },
      href: "/booth",
    },
  },
  {
    id: "era-badges",
    get short() {
      return t("guide.era_badges");
    },
    get eyebrow() {
      return t("guide.everywhere");
    },
    get title() {
      return t("guide.era_badges");
    },
    get text() {
      return t("guide.a_small_badge_on_every_side");
    },
    art: { kind: "era" },
    where: {
      get label() {
        return t("guide.your_heatmap");
      },
      href: "/database",
    },
  },
  {
    id: "rooms",
    get short() {
      return t("guide.rooms");
    },
    get eyebrow() {
      return t("guide.rooms");
    },
    get title() {
      return t("guide.one_night_several_djs");
    },
    get text() {
      return t("guide.make_a_room_and_share_its");
    },
    art: { kind: "lottie", src: `${LOTTIE_DIR}/rooms.json`, still: 70 },
    where: {
      get label() {
        return t("guide.open_rooms");
      },
      href: "/rooms",
    },
  },
  {
    id: "share",
    get short() {
      return t("guide.share");
    },
    get eyebrow() {
      return t("guide.share");
    },
    get title() {
      return t("guide.send_a_night_by_link_file");
    },
    get text() {
      return t("guide.copy_a_link_save_the_night");
    },
    art: { kind: "illustration", id: "share" },
    where: {
      get label() {
        return t("guide.your_history");
      },
      href: "/history",
    },
  },
  {
    id: "find-songs",
    get short() {
      return t("guide.find_songs");
    },
    get eyebrow() {
      return t("guide.compose_and_the_booth");
    },
    get title() {
      return t("guide.find_songs");
    },
    get text() {
      return t("guide.search_by_title_orchestra_or_singer");
    },
    art: { kind: "lottie", src: `${LOTTIE_DIR}/search.json`, still: 70 },
    where: {
      get label() {
        return t("guide.open_compose");
      },
      href: "/",
    },
  },
  {
    id: "versions-and-sources",
    get short() {
      return t("guide.versions_and_sources");
    },
    get eyebrow() {
      return t("guide.database");
    },
    get title() {
      return t("guide.versions_and_sources");
    },
    get text() {
      return t("guide.under_any_song_versions_lists_every");
    },
    art: { kind: "illustration", id: "versions" },
    where: {
      get label() {
        return t("guide.open_the_database");
      },
      href: "/database",
    },
  },
  {
    id: "learned-preferences",
    get short() {
      return t("guide.learned_preferences");
    },
    get eyebrow() {
      return t("guide.memory");
    },
    get title() {
      return t("guide.learned_preferences");
    },
    get text() {
      return t("guide.ask_for_the_same_change_again");
    },
    art: { kind: "lottie", src: `${LOTTIE_DIR}/learn.json`, still: 70 },
    where: {
      get label() {
        return t("guide.your_memory");
      },
      href: "/database",
    },
  },
];

/** every Lottie file the Guide loads */
export const GUIDE_LOTTIES = GUIDE_CHAPTERS.flatMap((c) => (c.art.kind === "lottie" ? [c.art.src] : []));
