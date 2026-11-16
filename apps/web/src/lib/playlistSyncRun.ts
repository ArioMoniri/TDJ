import type { Playlist } from "@tdj/core";
import { onEdit } from "@/lib/editHistory";
import { withoutCortinas } from "@/lib/exportPaths";
import { t } from "@/lib/i18n";
import { createSyncer, type SyncResult, type SyncService, type SyncTarget } from "@/lib/playlistSync";
import {
  byoWritePlaylist,
  directPost,
  fetchHosted,
  type HostedState,
  hostedCreatePlaylist,
  hostedMatch,
  refresh,
  resolveTrack,
  SpotifyRateLimit,
} from "@/lib/spotify";
import { spotifyBurstActive } from "@/lib/spotifyBurst";
import { batches, orderedRows, spotifyPlanFor } from "@/lib/spotifyPlan";
import { useStore } from "@/lib/store";
import { loadMatches, rememberMatches } from "@/lib/youtubeMatches";
import { youtubeQueries, youtubeRows } from "@/lib/youtubePlan";
import type { YoutubeCheck } from "@/lib/youtubeVerify";

/**
 * 2026-11: the exported playlists' sync in the browser (lib/playlistSync.ts is the runner): the real writers and the
 * one subscription to the night. Spotify: the rows the night plays tonight, matched (what the export or an earlier
 * sync found is reused; the rest searched like the export does), the playlist rewritten in order and read back
 * (hosted: /api/spotify/playlist; BYO: this browser), then its cover redrawn when the night's cover changed.
 * YouTube: the same rows, the videos the export found (the Booth's matches) and a search for the new ones, the
 * playlist put right in place (/api/google/youtube `sync`).
 */
const night = (p: Playlist, tg: SyncTarget): Playlist => (tg.includeCortinas ? p : withoutCortinas(p));
const opts = (tg: SyncTarget) => ({ includeCortinas: tg.includeCortinas, dropBypassed: true });

let hostedCache: { at: number; v: HostedState } | null = null;
async function hostedState(): Promise<HostedState> {
  if (hostedCache && Date.now() - hostedCache.at < 60_000) return hostedCache.v;
  const v = await fetchHosted();
  hostedCache = { at: Date.now(), v };
  return v;
}

/** the cover's key: what the cover is drawn from (lib/cover), so a changed night is a changed cover */
async function coverKeyOf(p: Playlist): Promise<string> {
  const [{ coverKey }, { withCoverSeed }] = await Promise.all([
    import("@/lib/cover"),
    import("@/lib/cover/entrySeed"),
  ]);
  return coverKey(withCoverSeed(p), { size: 640, theme: "light" });
}
let coverKeys = new WeakMap<Playlist, string>();
const syncCoverKey = (p: Playlist) => coverKeys.get(p) ?? "";

async function writeSpotify(p: Playlist, tg: SyncTarget): Promise<SyncResult> {
  const st = useStore.getState();
  const h = await hostedState();
  const hosted = h.hosted && !!h.user;
  let token = st.spotifyToken;
  if (!hosted) {
    if (!token || !st.settings.spotifyClientId) return { ok: false, error: t("sync.reconnect_spotify") };
    if (token.expires < Date.now() + 60_000 && token.refresh) {
      try {
        token = await refresh(st.settings.spotifyClientId, token.refresh);
        st.setSpotifyToken(token);
      } catch {
        return { ok: false, error: t("sync.reconnect_spotify") };
      }
    }
  }
  const plan = spotifyPlanFor(night(p, tg), st.overrides, opts(tg));
  const found = new Map(Object.entries(tg.found ?? {}));
  const need = plan.items.filter((it) => !found.has(it.id));
  try {
    if (hosted)
      for (const b of batches(need)) {
        const r = await hostedMatch(b);
        for (const m of r.matches) found.set(m.id, m.uri);
        if (r.rateLimited) break;
      }
    else
      for (const it of need) {
        const r = await resolveTrack(token!.access, it);
        if (r) found.set(it.id, r.uri);
      }
  } catch (e) {
    if (!(e instanceof SpotifyRateLimit)) throw e;
  }
  let market = "from_token";
  try {
    market = localStorage.getItem("tdj-sp-market") || "from_token";
  } catch {}
  const rows = orderedRows(plan, found, st.overrides.marketStreams?.[market]);
  const uris = rows.map((r) => r.uri);
  const items = rows.map((r) => r.item);
  const check = hosted
    ? (
        await hostedCreatePlaylist({
          uris,
          items,
          includeCortinas: tg.includeCortinas,
          playlistId: tg.id,
          url: tg.url,
          replace: true,
        })
      ).check
    : (await byoWritePlaylist(token!.access, { playlistId: tg.id }, uris, items, "replace")).check;
  if (!check) return { ok: false, error: t("sync.not_read_back") };
  const res: SyncResult = {
    ok: check.ok && !check.error,
    inPlace: check.inPlace,
    total: uris.length,
    ...(check.error ? { error: check.error } : {}),
    found: Object.fromEntries(found),
  };
  if (!res.ok && !res.error)
    res.error = t("sync.rows_in_place", { inPlace: check.inPlace, total: uris.length });
  // the cover follows the night: drawn again only when what it is drawn from changed (Settings → Export → cover)
  const key = syncCoverKey(p) || (await coverKeyOf(p));
  if (res.ok && st.settings.exportCover !== false && key !== tg.coverKey) {
    const { uploadSpotifyCover } = await import("@/lib/cover/spotify");
    const cover = await uploadSpotifyCover({
      playlist: p,
      playlistId: tg.id,
      enabled: true,
      hosted,
      access: hosted ? h.token?.access : token?.access,
      scopes: hosted ? h.scopes : token?.scope,
    });
    res.cover = cover;
    if (cover === "added") res.coverKey = key;
  } else res.cover = "same";
  return res;
}

async function writeYoutube(p: Playlist, tg: SyncTarget): Promise<SyncResult> {
  const rows = youtubeRows(night(p, tg), tg.includeCortinas);
  // the night as it plays tonight: skipped tandas out (youtubeRows keeps them, as the file export does)
  const playing = new Set(
    (await import("@/lib/playlistSync")).syncRows(night(p, tg), tg.includeCortinas).map((r) => r.id),
  );
  const kept = rows.map((r, i) => ({ r, i })).filter(({ r }) => playing.has(r.id));
  const queries = youtubeQueries(night(p, tg), tg.includeCortinas);
  const matches = { ...loadMatches(), ...(tg.found ?? {}) };
  const expected = kept.map(({ r, i }) => ({
    videoId: (r.id && matches[r.id]) || "",
    query: queries[i] ?? "",
  }));
  const region = (() => {
    try {
      return new Intl.Locale(navigator.language).maximize().region;
    } catch {
      return undefined;
    }
  })();
  const j = await directPost<{ check?: YoutubeCheck; videoIds?: string[]; error?: string }>(
    "/api/google/youtube",
    { verify: true, sync: true, playlistId: tg.id, expected, ...(region ? { region } : {}) },
  );
  if (!j.check) return { ok: false, error: j.error ?? t("sync.not_read_back") };
  const ids = j.check.videoIds;
  rememberMatches(
    kept.map(({ r }) => r),
    ids.map((videoId, row) => ({ row, videoId })).filter((x) => !!x.videoId),
  );
  const found: Record<string, string> = {};
  kept.forEach(({ r }, k) => {
    if (r.id && ids[k]) found[r.id] = ids[k]!;
  });
  return {
    ok: j.check.ok && !j.check.error,
    inPlace: j.check.inPlace,
    total: expected.length,
    ...(j.check.error ? { error: j.check.quota ? t("sync.youtube_quota") : j.check.error } : {}),
    found,
    // YouTube has no custom playlist cover: its first video's thumbnail is the cover
    cover: "skipped",
  };
}

const write = (service: SyncService, p: Playlist, tg: SyncTarget) =>
  service === "spotify" ? writeSpotify(p, tg) : writeYoutube(p, tg);

export const playlistSyncer = createSyncer({
  write,
  busy: spotifyBurstActive,
  coverKey: syncCoverKey,
});

let installed = false;
/** once per page (components/PlaylistSync.tsx): every change of the night, from anywhere, an undo included */
export function installPlaylistSync() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  let last = useStore.getState().playlist;
  const changed = async (p: Playlist | null) => {
    if (!p) return;
    // the cover key is known before the runner asks (it reads it synchronously)
    if (!coverKeys.has(p)) coverKeys.set(p, await coverKeyOf(p).catch(() => ""));
    playlistSyncer.noteChange(p);
  };
  useStore.subscribe((s) => {
    if (s.playlist === last) return;
    const prev = last;
    last = s.playlist;
    // a different night on screen is not an edit of this one
    if (!s.playlist || !prev || prev.id !== s.playlist.id) return;
    void changed(s.playlist);
  });
  // (an undo or redo lands in the store too; this catches the ones that only touch the night's copy in the Booth)
  onEdit(() => void changed(useStore.getState().playlist));
}

/** for tests: drop the cached cover keys */
export const _resetSyncCaches = () => {
  coverKeys = new WeakMap();
  hostedCache = null;
};
