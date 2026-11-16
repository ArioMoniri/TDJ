"use client";
import { formatRoomCode, RoomClient, type RoomHearts } from "@tdj/core";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { skipPoll } from "@/lib/power";
import { Group } from "./Form";
import { PageHeader } from "./PageHeader";

const TOKEN_KEY = "tdj-dancer";
/** this device's anonymous dancer token (random, never a name; the server hashes it again) */
function dancerToken(): string {
  try {
    const had = localStorage.getItem(TOKEN_KEY);
    if (had && /^[A-Za-z0-9_-]{8,64}$/.test(had)) return had;
  } catch {}
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  const tok = `d-${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  try {
    localStorage.setItem(TOKEN_KEY, tok);
  } catch {}
  return tok;
}

/**
 * 2026-11, dancer hearts: what a dancer sees on `/rooms?dance=<code>` — the song the DJ's booth is playing and one
 * heart button. A heart counts once per dancer per song per night; no name, no account (an anonymous token of this
 * device, hashed by the server). Without the room's server the page says so.
 */
export function DancerHeart({ code, server }: { code: string; server: string }) {
  const [view, setView] = useState<RoomHearts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    const load = () =>
      RoomClient.hearts(server, code)
        .then((v) => {
          if (!live) return;
          setView(v);
          setError(null);
        })
        .catch(() => live && setError(t("fav.dancer_off")));
    void load();
    const key = {};
    // Battery saver: every 20 s (lib/power.ts)
    const h = setInterval(() => skipPoll(key, 20_000) || void load(), 5000);
    return () => {
      live = false;
      clearInterval(h);
    };
  }, [code, server]);
  const p = view?.playing ?? null;
  const key = p ? `${p.nightId}|${p.songId}` : "";
  const done = !!key && mine.has(key);
  const heart = async () => {
    if (!p || done) return;
    haptic(12);
    try {
      const r = await RoomClient.heart(server, code, {
        nightId: p.nightId,
        songId: p.songId,
        dancer: dancerToken(),
      });
      setMine((s) => new Set([...s, key]));
      setView((v) => (v ? { ...v, hearts: { ...v.hearts, [p.songId]: r.count } } : v));
    } catch {
      setError(t("fav.dancer_off"));
    }
  };
  return (
    <div className="mx-auto max-w-[720px]" data-testid="dancer-heart">
      <PageHeader title={t("fav.dancer_title")} subtitle={formatRoomCode(code)} />
      {error && (
        <Group>
          <div className="cell text-[var(--label-2)]" role="status">
            {error}
          </div>
        </Group>
      )}
      <Group header={t("fav.dancer_playing")}>
        {p ? (
          <div className="cell flex-col items-start gap-1">
            <span className="text-title3 font-semibold" lang="es" data-testid="dancer-title">
              {p.title}
            </span>
            <span className="text-footnote text-[var(--label-2)]" lang="es">
              {p.artist}
            </span>
          </div>
        ) : (
          <div className="cell text-[var(--label-2)]">{t("fav.dancer_nothing")}</div>
        )}
      </Group>
      {p && (
        <div className="flex flex-col items-center gap-2 px-4 py-4">
          <button
            type="button"
            className="btn btn-primary min-h-14 px-6 text-[17px]"
            onClick={() => void heart()}
            disabled={done}
            aria-pressed={done}
            data-testid="dancer-heart-btn"
          >
            <Heart size={20} fill={done ? "currentColor" : "none"} aria-hidden /> {t("fav.dancer_heart")}
          </button>
          <span className="text-footnote text-[var(--label-2)] tabular-nums" role="status" aria-live="polite">
            {done ? t("fav.dancer_thanks") : ""}
          </span>
        </div>
      )}
    </div>
  );
}
