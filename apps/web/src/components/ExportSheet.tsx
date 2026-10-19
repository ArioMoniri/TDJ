"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { EXPORT_META, type ExportFormat, toSpotifyPlan } from "@tdj/core";
import { FileDown, Radio, Webhook } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { withoutCortinas } from "@/lib/exportPaths";
import { haptic } from "@/lib/haptics";
import { DUR } from "@/lib/motion";
import { beginAuth, createPlaylist, refresh, resolveTrack } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { DJ_APPS, type DjApp, type Playlist } from "@/lib/types";
import { CountUp } from "./CountUp";
import { ActionRow, Group, PickerRow, Row, SwitchRow, Tile } from "./Form";
import { Sheet } from "./Sheet";

const FORMAT_ITEMS = (Object.keys(EXPORT_META) as ExportFormat[]).map(
  (f) => [f, EXPORT_META[f].label] as [ExportFormat, string],
);

/**
 * POST an export to the DJ's own automation (Pipedream, Make, Zapier, n8n…). The body is the file; the format and
 * set name travel as headers and query parameters. A webhook without CORS headers still receives the body
 * (the retry is `no-cors`, so the response is opaque and we only know it was sent).
 */
export async function sendToWebhook(
  url: string,
  text: string,
  f: ExportFormat,
  name: string,
): Promise<"ok" | "sent"> {
  const m = EXPORT_META[f];
  const u = new URL(url);
  u.searchParams.set("format", f);
  u.searchParams.set("filename", `${name.replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}`);
  const init = {
    method: "POST",
    headers: { "content-type": `${m.mime}; charset=utf-8`, "x-tdj-format": f, "x-tdj-set": name },
    body: text,
  };
  try {
    const r = await fetch(u.toString(), init);
    if (!r.ok) throw new Error(`Webhook answered ${r.status}`);
    return "ok";
  } catch (e) {
    if (e instanceof Error && /answered \d+/.test(e.message)) throw e;
    await fetch(u.toString(), { ...init, mode: "no-cors", headers: { "content-type": "text/plain" } });
    return "sent";
  }
}

const GROUPS: Array<[string, ExportFormat[]]> = [
  ["DJ software", ["rekordbox", "traktor", "serato"]],
  ["Playlist files", ["m3u8", "xspf", "csv"]],
  ["Other", ["json", "setlist"]],
];
/** Which DJ-app folder a format uses for real file paths. */
const APP_FOR: Partial<Record<ExportFormat, DjApp[]>> = {
  rekordbox: ["rekordbox"],
  traktor: ["traktor"],
  serato: ["serato"],
  m3u8: ["virtualdj", "enginedj"],
};
const TILE_COLOR: Record<ExportFormat, string> = {
  rekordbox: "#111",
  traktor: "#1d6fd6",
  serato: "#111",
  m3u8: "#ff9500",
  xspf: "#ff9500",
  csv: "#34c759",
  json: "#8e8e93",
  setlist: "#8e8e93",
};

export function ExportSheet({
  open,
  onClose,
  playlist: given,
}: {
  open: boolean;
  onClose: () => void;
  /** History re-export: a snapshot's playlist instead of the store's */
  playlist?: Playlist | null;
}) {
  const {
    playlist: current,
    settings,
    spotifyToken,
    setSpotifyToken,
    overrides,
    updateOverrides,
  } = useStore();
  const playlist = given ?? current;
  const webhookUrl = overrides.connectors?.webhookUrl ?? "";
  const [hookFormat, setHookFormat] = useState<ExportFormat>("m3u8");
  const [hookBusy, setHookBusy] = useState(false);
  const [hookOpen, setHookOpen] = useState(false);
  const [hookDraft, setHookDraft] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dlBusy, setDlBusy] = useState<ExportFormat | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [includeCortinas, setIncludeCortinas] = useState(true);
  const [done, setDone] = useState(false);
  const check = useRef<{ play: () => void } | null>(null);
  const reduced = useReducedMotion();

  // a fresh open starts clean: no stale "Playlist created" state
  useEffect(() => {
    if (open) {
      setDone(false);
      setResult(null);
      setLog([]);
    }
  }, [open]);

  const tracks = playlist
    ? playlist.tandas.reduce((a, t) => a + t.songs.length, 0) +
      (playlist.closing ? 1 : 0) +
      (playlist.opening ? 1 : 0)
    : 0;
  const cortinas = playlist ? playlist.tandas.filter((t) => t.cortina).length : 0;
  const count = tracks + (includeCortinas ? cortinas : 0);
  const folderFor = (f: ExportFormat) =>
    (APP_FOR[f] ?? []).map((a) => settings.djApps[a]?.folder?.trim()).find(Boolean) ?? "";
  const noFolders = DJ_APPS.every((a) => !settings.djApps[a.id]?.folder);

  const dl = async (f: ExportFormat) => {
    if (!playlist) return;
    const m = EXPORT_META[f];
    setDlBusy(f);
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playlist,
          format: f,
          includeCortinas,
          folder: folderFor(f),
          naming: settings.fileNaming,
        }),
      });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      downloadBlob(`${playlist.name.replace(/[^a-z0-9-]+/gi, "_")}.${m.ext}`, await r.text(), m.mime);
      haptic(6);
      toast(`Downloaded ${m.label} (.${m.ext})`);
      onClose();
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setDlBusy(null);
    }
  };

  const toSpotify = async () => {
    if (!settings.spotifyClientId || !playlist) return;
    let tok = spotifyToken;
    if (!tok) return beginAuth(settings.spotifyClientId);
    if (tok.expires < Date.now() + 60_000 && tok.refresh) {
      tok = await refresh(settings.spotifyClientId, tok.refresh);
      setSpotifyToken(tok);
    }
    setBusy(true);
    setLog([]);
    setResult(null);
    try {
      const plan = toSpotifyPlan(includeCortinas ? playlist : withoutCortinas(playlist));
      const uris: string[] = [...plan.uris];
      let miss = 0;
      for (const u of plan.unresolved) {
        const r = await resolveTrack(tok.access, u.query, u.track.year);
        if (r) {
          uris.push(r.uri);
          setLog((l) => [...l.slice(-8), `Found ${u.track.title} → ${r.artist} – ${r.name}`]);
        } else {
          miss++;
          setLog((l) => [...l.slice(-8), `Not found: ${u.query}`]);
        }
      }
      const pl = await createPlaylist(
        tok.access,
        `TDJ · ${playlist.name}`,
        `${playlist.tandas.length} tandas composed with TDJ, cortinas ${includeCortinas ? "included" : "excluded"}. Score ${playlist.score.total}/100.`,
        uris,
      );
      setResult(pl.external_urls.spotify);
      setDone(true);
      check.current?.play();
      haptic([10, 40, 10]);
      setLog((l) => [...l, `Created playlist with ${uris.length} tracks (${miss} unresolved).`]);
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
      if (String(e).includes("401")) setSpotifyToken(null);
    } finally {
      setBusy(false);
    }
  };

  const toWebhook = async () => {
    if (!playlist || !webhookUrl) return;
    setHookBusy(true);
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playlist,
          format: hookFormat,
          includeCortinas,
          folder: folderFor(hookFormat),
          naming: settings.fileNaming,
        }),
      });
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      const how = await sendToWebhook(webhookUrl, await r.text(), hookFormat, playlist.name);
      haptic([10, 40, 10]);
      setLog((l) => [
        ...l,
        how === "ok"
          ? `Webhook accepted the ${EXPORT_META[hookFormat].label}.`
          : `Sent the ${EXPORT_META[hookFormat].label} to the webhook (no CORS reply, so no confirmation).`,
      ]);
      toast(how === "ok" ? "Webhook accepted the export" : "Sent to the webhook");
    } catch (e) {
      setLog((l) => [...l, `Error: ${(e as Error).message}`]);
      haptic([20, 30, 20]);
    } finally {
      setHookBusy(false);
    }
  };
  const saveHook = () => {
    const v = hookDraft.trim();
    if (v && !/^https:\/\//i.test(v)) {
      toast("The webhook must be an https:// URL");
      return;
    }
    updateOverrides((o) => ({ ...o, connectors: { ...(o.connectors ?? {}), webhookUrl: v || undefined } }));
    setHookOpen(false);
  };

  const spotifyButton = (
    <>
      <button
        type="button"
        onClick={toSpotify}
        disabled={busy || done || !settings.spotifyClientId}
        className="btn btn-primary w-full"
        aria-describedby={settings.spotifyClientId ? undefined : "spotify-why"}
      >
        {(done || busy) && (
          <span className="inline-grid h-6 w-6 place-items-center" aria-hidden>
            {done ? (
              <DotLottieReact
                src="/anim/success-check.json"
                autoplay={!reduced}
                loop={false}
                dotLottieRefCallback={(d) => {
                  check.current = d;
                  if (reduced) d?.setFrame(35);
                }}
                style={{ width: 24, height: 24 }}
              />
            ) : (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
          </span>
        )}
        <span className="relative inline-grid">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={done ? "done" : "idle"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.fast }}
              className="col-start-1 row-start-1"
            >
              {done
                ? "Playlist created"
                : spotifyToken
                  ? "Create playlist in Spotify"
                  : "Connect Spotify and create playlist"}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      {!settings.spotifyClientId && (
        <p id="spotify-why" className="section-foot mt-2 text-center">
          Needs a Spotify Client ID. Add one in{" "}
          <Link href="/settings" className="text-[var(--tint)]">
            Settings
          </Link>
          .
        </p>
      )}
    </>
  );

  if (!playlist) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Export"
      describedBy="export-count"
      testId="export-sheet"
      detents={["large"]}
      footer={spotifyButton}
    >
      <Group
        footer={
          <span id="export-count">
            <CountUp value={tracks} /> {tracks === 1 ? "song" : "songs"}
            {includeCortinas ? ` + ${cortinas} ${cortinas === 1 ? "cortina" : "cortinas"}` : ""} (
            <CountUp value={count} /> {count === 1 ? "file" : "files"})
            {includeCortinas ? "" : ` · ${cortinas} cortinas left out`}.
          </span>
        }
      >
        <SwitchRow label="Include cortinas" checked={includeCortinas} onChange={setIncludeCortinas} />
      </Group>
      <Group
        header="Send to"
        footer={
          webhookUrl
            ? "The chosen format is POSTed to your webhook: Pipedream, Make, Zapier or n8n can file it, mail it or push it to a DJ app. The URL lives in this browser only."
            : "Spotify creates a playlist in your account. A webhook sends the file to your own automation (Pipedream, Make, Zapier, n8n)."
        }
      >
        <Row
          tile={
            <Tile color="#1db954">
              <Radio size={16} strokeWidth={2} />
            </Tile>
          }
          label="Spotify"
          value={spotifyToken ? "Connected" : settings.spotifyClientId ? "Connect" : "Needs a Client ID"}
          chevron
          onClick={toSpotify}
          disabled={busy || done || !settings.spotifyClientId}
          busy={busy}
        />
        {webhookUrl ? (
          <>
            <PickerRow
              label="Webhook format"
              ariaLabel="Webhook format"
              value={hookFormat}
              items={FORMAT_ITEMS}
              onChange={(f) => f && setHookFormat(f)}
              tile={
                <Tile color="#5856d6">
                  <Webhook size={16} strokeWidth={2} />
                </Tile>
              }
            />
            <Row
              label="Send to webhook"
              sub={webhookUrl.replace(/^https?:\/\//, "").slice(0, 48)}
              chevron
              onClick={toWebhook}
              busy={hookBusy}
              id="send-webhook"
            />
          </>
        ) : (
          <Row
            tile={
              <Tile color="#5856d6">
                <Webhook size={16} strokeWidth={2} />
              </Tile>
            }
            label="Webhook"
            value="Set up"
            chevron
            onClick={() => {
              setHookDraft(webhookUrl);
              setHookOpen(true);
            }}
          />
        )}
      </Group>
      {GROUPS.map(([g, keys]) => (
        <Group
          key={g}
          header={g}
          footer={
            g === "DJ software" && noFolders ? (
              <>
                Paths use a TDJ/ placeholder. Set each app's music folder in{" "}
                <Link href="/settings" className="text-[var(--tint)]">
                  Settings
                </Link>
                .
              </>
            ) : undefined
          }
        >
          {keys.map((f) => (
            <Row
              key={f}
              tile={
                <span className="tile" style={{ background: TILE_COLOR[f] }} aria-hidden>
                  <FileDown size={16} strokeWidth={2} />
                </span>
              }
              label={EXPORT_META[f].label}
              sub={folderFor(f) ? `Paths under ${folderFor(f)}` : undefined}
              value={`.${EXPORT_META[f].ext}`}
              chevron
              onClick={() => dl(f)}
              busy={dlBusy === f}
            />
          ))}
        </Group>
      ))}
      <Sheet
        open={hookOpen}
        onClose={() => setHookOpen(false)}
        title="Webhook"
        trailing="Save"
        onTrailing={saveHook}
        detents={["medium"]}
      >
        <Group
          header="Webhook URL"
          footer="Paste the HTTPS URL of a Pipedream, Make, Zapier or n8n webhook. TDJ POSTs the file as the request body with X-TDJ-Format and X-TDJ-Set headers plus ?format=&filename=. Stored in this browser only, never on the server."
        >
          <label htmlFor="webhook-url" className="cell">
            <span className="sr-only">Webhook URL</span>
            <input
              id="webhook-url"
              className="field font-mono"
              data-autofocus
              inputMode="url"
              placeholder="https://eo…m.pipedream.net/…"
              value={hookDraft}
              onChange={(e) => setHookDraft(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </Group>
      </Sheet>
      {result && (
        <Group>
          <ActionRow label="Open in Spotify" onClick={() => window.open(result, "_blank", "noreferrer")} />
        </Group>
      )}
      <div role="status" aria-live="polite">
        {log.length > 0 && (
          <Group header="Progress">
            <div className="cell text-footnote whitespace-pre-wrap text-[var(--label-2)]">
              {log.join("\n")}
            </div>
          </Group>
        )}
      </div>
    </Sheet>
  );
}
