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
import { NightCover } from "@/components/NightCover";
import { PageHeader } from "@/components/PageHeader";
import { TipRow } from "@/components/TipRow";
import { Tip } from "@/components/ui/Tip";
import { haptic } from "@/lib/haptics";
import { makeSnapshot } from "@/lib/history";
import { t as tx } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { yearSpan } from "@/lib/year";

/** where the Mac / iPad app leaves a .tdjnight it was asked to open (apps/desktop: links::DeepLink::NightFile) */
const APP_FILE_KEY = "tdj-night-file";
const fmtMin = (sec: number) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : tx("night.min", { m });
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
        if (!r.ok) throw new Error(body.error || tx("night.this_night_could_not_be_opened"));
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
          if (!r.ok || !body.night) throw new Error(body.error || tx("night.this_link_has_expired"));
          return resolve(body.night, t);
        }
        setState({ kind: "error", message: tx("night.this_is_not_a_t_dj") }, t);
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
        if (f.size > 2_000_000) throw new Error(tx("night.this_file_is_too_large_to"));
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
    toast(tx("night.is_in_history_and_open_in", { name: p.name }));
    router.push("/#result");
  };

  const ready = state.kind === "ready" ? state : null;
  const p = ready?.result.playlist;
  const missing = ready?.result.missing ?? [];

  return (
    <section
      className="mx-auto max-w-[720px]"
      aria-label={tx("night.open_a_night")}
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
        title={p ? p.name : tx("night.open_a_night")}
        subtitle={
          p
            ? tx("night.tandas_songs_score", {
                length: p.tandas.length,
                p1: p.tandas.reduce((a, t) => a + t.songs.length, 0),
                durationSec: fmtMin(p.stats.durationSec),
                total: p.score.total,
              })
            : tx("night.a_night_another_dj_shared_from")
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept={`${NIGHT_EXTENSION},application/json,application/vnd.tdj.night+json`}
        className="sr-only"
        aria-label={tx("night.choose_a_night_file_2")}
        data-testid="night-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void fromFile(f);
          e.target.value = "";
        }}
      />

      {state.kind === "loading" && (
        <p className="text-subhead py-10 text-center text-[var(--label-2)]" role="status">
          {tx("night.opening_the_night")}
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
            header={tx("night.from_a_file")}
            footer={
              dragging ? tx("night.drop_the_file_to_open_it") : tx("night.or_drop_a_tdjnight_file_anywhere")
            }
          >
            <TipRow
              tile={
                <Tile color="#ff9500">
                  <FileUp size={16} strokeWidth={2} />
                </Tile>
              }
              label={tx("night.choose_a_night_file")}
              sub={tx("night.tdjnight")}
              chevron
              onClick={() => fileInput.current?.click()}
              tip={tx("night.opens_a_tdjnight_file_from_this")}
            />
          </Group>
          <Group header={tx("night.from_a_link")} footer={tx("night.paste_a_t_dj_night_link")}>
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
                aria-label={tx("night.night_link")}
              />
              <button type="submit" className="btn btn-primary min-h-[44px]" disabled={!pasted.trim()}>
                {tx("night.open")}
              </button>
            </form>
          </Group>
        </>
      )}

      {ready && p && (
        <>
          {/* wave 4: the night's cover, the one its sender's History, Spotify and link preview show */}
          <div className="flex justify-center pb-3">
            <NightCover
              night={ready.night}
              size={640}
              display={168}
              testId="night-cover"
              alt={tx("cover.alt", { title: ready.night.name })}
              className="shadow-md"
            />
          </div>
          <Group footer={tx("night.it_lands_in_history_and_opens")}>
            <Tip text={tx("night.keeps_this_night_in_history_and")} className="w-full">
              <button
                type="button"
                className="btn btn-primary min-h-[50px] w-full"
                onClick={importIt}
                data-testid="night-import"
              >
                {tx("night.import_this_night")}
              </button>
            </Tip>
          </Group>
          {missing.length > 0 && (
            <Group
              header={tx("night.not_in_this_catalogue", { length: missing.length })}
              footer={tx("night.these_stay_in_their_tandas_as")}
              data-testid="night-missing"
            >
              {missing.map((m) => (
                <TipRow
                  key={`${m.where}-${m.title}`}
                  label={m.title}
                  sub={`${m.where} · ${m.by}${m.year ? ` · ${m.year}` : ""}`}
                  value={m.streamable ? tx("night.spotify") : tx("night.no_stream")}
                />
              ))}
            </Group>
          )}
          <Group header={tx("night.tandas")} data-testid="night-tandas">
            {p.tandas.map((t, i) => (
              <TipRow
                key={`${i}-${t.orchestraId}`}
                tile={<RhythmTile rhythm={t.rhythm} />}
                label={`${i + 1}. ${t.orchestra}${t.singer ? ` · ${t.singer}` : ""}`}
                sub={t.songs.map((s) => s.title).join(" · ")}
                value={
                  t.bypass
                    ? tx("night.skipped")
                    : t.locked
                      ? tx("night.locked")
                      : t.yearRange
                        ? (yearSpan(t.yearRange) ?? undefined)
                        : undefined
                }
              />
            ))}
            {p.closing && (
              <TipRow label={tx("night.closing", { title: p.closing.title })} sub={p.closing.orchestra} />
            )}
          </Group>
        </>
      )}
    </section>
  );
}
