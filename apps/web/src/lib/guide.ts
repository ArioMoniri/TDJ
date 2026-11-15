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
    short: "Compose",
    eyebrow: "Compose",
    title: "A whole night in a few seconds",
    text: "Say how long the night is, who is on the floor and how it should feel. You get every tanda: one orchestra and one voice each, cortinas between them, two peaks and La Cumparsita at the end. Lock a tanda you love and compose again: the rest changes around it.",
    art: { kind: "lottie", src: `${LOTTIE_DIR}/compose.json`, still: 68 },
    where: { label: "Open Compose", href: "/" },
  },
  {
    id: "edit-with-ai",
    short: "Edit with AI",
    eyebrow: "Compose",
    title: "Edit with AI",
    text: "Ask in plain words, the way you would ask a friend at the booth: “calmer after midnight”, “more Di Sarli”, “no Biagi before the second peak”. The suggestions come back one by one, each checked against the rules of a good night, and you keep or drop each of them. It runs on your own model key, which stays on this device.",
    art: { kind: "illustration", id: "chat" },
    where: { label: "Open Compose", href: "/" },
  },
  {
    id: "build-by-hand",
    short: "Build by hand",
    eyebrow: "Build by hand",
    title: "Every tanda your own choice",
    text: "Start from an empty night and pick every tanda yourself, from a suggestion or a song you search for. The tanda keeps its orchestra and years together, and the next suggestions are ranked by the night's rules (the cycle, the energy, orchestras spaced out), each with its reason.",
    art: { kind: "illustration", id: "hand" },
    where: { label: "Build by hand", href: "/build" },
  },
  {
    id: "booth",
    short: "The Booth",
    eyebrow: "The Booth",
    title: "Play the night from one screen",
    text: "The set list on one side, what is playing now and what comes next on the other, and the night's energy as a line with “we are here” on it.",
    points: [
      {
        title: "Pre-listen in your headphones",
        text: "Choose your headphones as the second output. Pre-listen plays a song only there: the room keeps dancing and never hears you check the next tanda.",
      },
      {
        title: "Mix",
        text: "Milonga floor plays each song to its last note, then a short silence. Tight leaves almost no gap; Smooth fades each ending gently. Or set the silence and the fades yourself.",
      },
      {
        title: "Cue and stop",
        text: "Open a song and drag the two handles on its waveform: where it starts (past a long intro or a scratchy first second) and where it ends.",
      },
      {
        title: "Skip tonight",
        text: "Leaves a tanda out of tonight's playing without deleting it: the set and your exports keep it. Play it brings it back.",
      },
    ],
    art: { kind: "lottie", src: `${LOTTIE_DIR}/headphones.json`, still: 22 },
    where: { label: "Open the Booth", href: "/booth" },
  },
  {
    id: "closing",
    short: "Closing the night",
    eyebrow: "The Booth",
    title: "Closing the night",
    text: "The night bar shows the time to La Cumparsita, so you always know how much night is left.",
    points: [
      {
        title: "Last 4 tandas tango only",
        text: "The vals and milonga tandas among the last four are skipped tonight, so the night ends on tangos. Turn it off and they come back.",
      },
      {
        title: "Jump to La Cumparsita",
        text: "Rest, then La Cumparsita lets this tanda play to its end and closes the night. La Cumparsita now asks first, then fades the song playing. The tandas between stay in the set.",
      },
    ],
    art: { kind: "illustration", id: "closing" },
    where: { label: "Open the Booth", href: "/booth" },
  },
  {
    id: "era-badges",
    short: "Era badges",
    eyebrow: "Everywhere",
    title: "Era badges",
    text: "A small badge on every side says where it sits in its orchestra's best years: best, good, uneven or outside. The grades come from your orchestra heatmap; tap a year there to change it and every badge follows. Hover or long-press a badge to read why.",
    art: { kind: "era" },
    where: { label: "Your heatmap", href: "/database" },
  },
  {
    id: "rooms",
    short: "Rooms",
    eyebrow: "Rooms",
    title: "One night, several DJs",
    text: "Make a room and share its six-character code. Everyone in the room sees the same night; a swap made by one DJ reaches the others, and the room's log says who changed what. No account needed: just your name.",
    art: { kind: "lottie", src: `${LOTTIE_DIR}/rooms.json`, still: 70 },
    where: { label: "Open Rooms", href: "/rooms" },
  },
  {
    id: "share",
    short: "Share",
    eyebrow: "Share",
    title: "Send a night by link, file or QR",
    text: "Copy a link, save the night as a file to send any way you like, or show the QR code and let the other DJ scan it with their phone. They open the night exactly as you built it and keep their own copy.",
    art: { kind: "illustration", id: "share" },
    where: { label: "Your history", href: "/history" },
  },
  {
    id: "find-songs",
    short: "Find songs",
    eyebrow: "Compose and the Booth",
    title: "Find songs",
    text: "Search by title, orchestra or singer, narrow to the years you want and play a preview. Add a side straight into a tanda of its own rhythm; in the Booth, tandas already played stay closed.",
    art: { kind: "lottie", src: `${LOTTIE_DIR}/search.json`, still: 70 },
    where: { label: "Open Compose", href: "/" },
  },
  {
    id: "versions-and-sources",
    short: "Versions and sources",
    eyebrow: "Database",
    title: "Versions and sources",
    text: "Under any song, Versions lists every recording of that title, any orchestra and any year, each one playable, so you choose the right take. Each number says where it came from: your own edit, Deezer, MusicBrainz, the Cover Art Archive, Discogs or Spotify. A source only fills what is missing; your edits always win.",
    art: { kind: "illustration", id: "versions" },
    where: { label: "Open the Database", href: "/database" },
  },
  {
    id: "learned-preferences",
    short: "Learned preferences",
    eyebrow: "Memory",
    title: "Learned preferences",
    text: "Ask for the same change again and again (three times “more energetic”, twice “shorter cortinas”) and T-DJ remembers it as your taste for the next night, always under what you choose tonight. You see and remove each one in Database › Memory, and you can turn learning off in Settings.",
    art: { kind: "lottie", src: `${LOTTIE_DIR}/learn.json`, still: 70 },
    where: { label: "Your memory", href: "/database" },
  },
];

/** every Lottie file the Guide loads */
export const GUIDE_LOTTIES = GUIDE_CHAPTERS.flatMap((c) => (c.art.kind === "lottie" ? [c.art.src] : []));
