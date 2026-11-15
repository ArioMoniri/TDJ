"use client";
import {
  decodeNightPayload,
  type ImportResult,
  NIGHT_EXTENSION,
  type NightFile,
  parseNightFile,
  payloadFromLink,
} from "@tdj/core";
import { CircleAlert, FileUp, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, RhythmTile, Tile } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { TipRow } from "@/components/TipRow";
import { Tip } from "@/components/ui/Tip";
import { haptic } from "@/lib/haptics";
import { makeSnapshot } from "@/lib/history";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";

/** where the Mac / iPad app leaves a .tdjnight it was asked to open (apps/desktop: links::DeepLink::NightFile) */
const APP_FILE_KEY = "tdj-night-file";
const fmtMin = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${m} min`;
};

/**
 * Open a shared night (ROADMAP §13): from a link (the night in the fragment, or a short link this site keeps),
 * from a `.tdjnight` file (picked, dropped, or handed over by the app), or a pasted link. The night is matched to
 * this catalogue and shown first; "Import this night" puts it in History and opens it in Compose.
 */
export default function NightPage() {
  const router = useRouter();
  const { addSnapshot, setPlaylist, replaceOptions } = useStore();
  type View =
    | { kind: "pick" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; night: NightFile; result: ImportResult };
  const [state, setView] = useState<View>({ kind: "loading" });
  // every open (a link, a file, a new fragment) takes a ticket; an answer for an older ticket is dropped, so a
  // damaged link opened after a good one shows its error, never the good night still resolving (wave 2)
  const ticket = useRef(0);
  const setState = useCallback((v: View, t = ticket.current) => {
    if (t === ticket.current) setView(v);
  }, []);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const resolve = useCallback(
    async (night: NightFile, t = ++ticket.current) => {
      setState({ kind: "loading" }, t);
      try {
        const r = await fetch("/api/night/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ night }),
        });
        const body = (await r.json()) as ImportResult & { error?: string };
        if (!r.ok) throw new Error(body.error || "This night could not be opened.");
        setState({ kind: "ready", night, result: body }, t);
      } catch (e) {
        setState({ kind: "error", message: (e as Error).message }, t);
      }
    },
    [setState],
  );

  const fromLink = useCallback(
    async (link: string) => {
      const t = ++ticket.current;
      setState({ kind: "loading" }, t);
      const payload = payloadFromLink(link);
      try {
        if (payload) return resolve(await decodeNightPayload(payload), t);
        const id = /[?&]s=([a-z2-9]{10})\b/.exec(link)?.[1];
        if (id) {
          const r = await fetch(`/api/night?id=${id}`);
          const body = (await r.json()) as { night?: NightFile; error?: string };
          if (!r.ok || !body.night) throw new Error(body.error || "This link has expired.");
          return resolve(body.night, t);
        }
        setState({ kind: "error", message: "This is not a T-DJ night link." }, t);
      } catch (e) {
        setState({ kind: "error", message: (e as Error).message }, t);
      }
    },
    [resolve, setState],
  );

  const fromFile = useCallback(
    async (f: File) => {
      const t = ++ticket.current;
      try {
        if (f.size > 2_000_000) throw new Error("This file is too large to be a night.");
        await resolve(parseNightFile(await f.text()), t);
      } catch (e) {
        setState({ kind: "error", message: (e as Error).message }, t);
      }
    },
    [resolve, setState],
  );

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    let fromApp: string | null = null;
    try {
      fromApp = q.get("from") === "file" ? sessionStorage.getItem(APP_FILE_KEY) : null;
      if (fromApp) sessionStorage.removeItem(APP_FILE_KEY);
    } catch {}
    if (fromApp) {
      try {
        void resolve(parseNightFile(fromApp));
      } catch (e) {
        setState({ kind: "error", message: (e as Error).message });
      }
    } else if (location.hash.length > 1 || q.get("s")) void fromLink(location.href);
    else setState({ kind: "pick" }, ++ticket.current);
    // a new link in the same tab (the fragment changed, or back / forward): open it, or show its error
    let last = location.href;
    const onNav = () => {
      if (location.href === last) return;
      last = location.href;
      if (location.hash.length > 1 || new URLSearchParams(location.search).get("s"))
        void fromLink(location.href);
      else setState({ kind: "pick" }, ++ticket.current);
    };
    window.addEventListener("hashchange", onNav);
    window.addEventListener("popstate", onNav);
    return () => {
      window.removeEventListener("hashchange", onNav);
      window.removeEventListener("popstate", onNav);
    };
  }, [fromLink, resolve, setState]);

  const importIt = () => {
    if (state.kind !== "ready") return;
    const p = state.result.playlist;
    haptic(10);
    addSnapshot(makeSnapshot(p, p.options, "import"));
    setPlaylist(p);
    replaceOptions({ ...p.options });
    toast(`“${p.name}” is in History and open in Compose`);
    router.push("/#result");
  };

  const ready = state.kind === "ready" ? state : null;
  const p = ready?.result.playlist;
  const missing = ready?.result.missing ?? [];

  return (
    <section
      className="mx-auto max-w-[720px]"
      aria-label="Open a night"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) void fromFile(f);
      }}
    >
      <PageHeader
        title={p ? p.name : "Open a night"}
        subtitle={
          p
            ? `${p.tandas.length} tandas · ${p.tandas.reduce((a, t) => a + t.songs.length, 0)} songs · ${fmtMin(p.stats.durationSec)} · score ${p.score.total}`
            : "A night another DJ shared, from a link or a file."
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept={`${NIGHT_EXTENSION},application/json,application/vnd.tdj.night+json`}
        className="sr-only"
        aria-label="Choose a night file"
        data-testid="night-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void fromFile(f);
          e.target.value = "";
        }}
      />

      {state.kind === "loading" && (
        <p className="text-subhead py-10 text-center text-[var(--label-2)]" role="status">
          Opening the night…
        </p>
      )}

      {state.kind === "error" && (
        <Group>
          <div className="cell" role="alert" data-testid="night-error">
            <CircleAlert size={18} className="shrink-0 text-[var(--destructive)]" aria-hidden />
            <span className="min-w-0 flex-1">{state.message}</span>
          </div>
        </Group>
      )}

      {(state.kind === "pick" || state.kind === "error") && (
        <>
          <Group
            header="From a file"
            footer={
              dragging ? "Drop the file to open it." : "Or drop a .tdjnight file anywhere on this page."
            }
          >
            <TipRow
              tile={
                <Tile color="#ff9500">
                  <FileUp size={16} strokeWidth={2} />
                </Tile>
              }
              label="Choose a night file…"
              sub=".tdjnight"
              chevron
              onClick={() => fileInput.current?.click()}
              tip="Opens a .tdjnight file from this device"
            />
          </Group>
          <Group header="From a link" footer="Paste a T-DJ night link someone sent you.">
            <form
              className="cell gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void fromLink(pasted);
              }}
            >
              <Link2 size={18} className="shrink-0 text-[var(--label-2)]" aria-hidden />
              <input
                className="field min-w-0 flex-1"
                placeholder="https://…/night#…"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                aria-label="Night link"
              />
              <button type="submit" className="btn btn-primary min-h-[44px]" disabled={!pasted.trim()}>
                Open
              </button>
            </form>
          </Group>
        </>
      )}

      {ready && p && (
        <>
          <Group footer="It lands in History and opens in Compose, ready to edit, play and export to Spotify.">
            <Tip text="Keeps this night in History and opens it in Compose" className="w-full">
              <button
                type="button"
                className="btn btn-primary min-h-[50px] w-full"
                onClick={importIt}
                data-testid="night-import"
              >
                Import this night
              </button>
            </Tip>
          </Group>
          {missing.length > 0 && (
            <Group
              header={`Not in this catalogue (${missing.length})`}
              footer="These stay in their tandas as shared. Those with a Spotify recording still export to Spotify."
              data-testid="night-missing"
            >
              {missing.map((m) => (
                <TipRow
                  key={`${m.where}-${m.title}`}
                  label={m.title}
                  sub={`${m.where} · ${m.by}${m.year ? ` · ${m.year}` : ""}`}
                  value={m.streamable ? "Spotify" : "No stream"}
                />
              ))}
            </Group>
          )}
          <Group header="Tandas" data-testid="night-tandas">
            {p.tandas.map((t, i) => (
              <TipRow
                key={`${i}-${t.orchestraId}`}
                tile={<RhythmTile rhythm={t.rhythm} />}
                label={`${i + 1}. ${t.orchestra}${t.singer ? ` · ${t.singer}` : ""}`}
                sub={t.songs.map((s) => s.title).join(" · ")}
                value={
                  t.bypass
                    ? "Skipped"
                    : t.locked
                      ? "Locked"
                      : t.yearRange
                        ? `${t.yearRange[0]}–${t.yearRange[1]}`
                        : undefined
                }
              />
            ))}
            {p.closing && <TipRow label={`Closing · ${p.closing.title}`} sub={p.closing.orchestra} />}
          </Group>
        </>
      )}
    </section>
  );
}
