"use client";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { finishAppLogin } from "@/lib/app/login";
import { APP } from "@/lib/app/target";
import { t as tx } from "@/lib/i18n";
import { rise, t } from "@/lib/motion";
import { finishAuth } from "@/lib/spotify";
import { useStore } from "@/lib/store";

export default function Callback() {
  const { settings, setSpotifyToken } = useStore();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    // apps: back from Spotify through tdj://spotify-callback; the tokens go to the Keychain, not this page
    if (APP) {
      void finishAppLogin(location.search).then((r) =>
        "next" in r ? router.replace(r.next) : setError(r.error),
      );
      return;
    }
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (!code) {
      setError(
        params.get("error")
          ? tx("callback.spotify_did_not_grant_access")
          : tx("callback.spotify_did_not_return_a_code"),
      );
      return;
    }
    finishAuth(settings.spotifyClientId, code)
      .then((t) => {
        setSpotifyToken(t);
        router.replace("/");
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : tx("callback.could_not_finish_connecting")),
      );
  }, [settings.spotifyClientId, setSpotifyToken, router]);
  // the card mounts with `rise`; on error the spinner cross-fades to the alert icon (125 ms) and the copy rises in
  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      className="surface mx-auto max-w-md p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <span className="mx-auto inline-grid h-6 w-6 place-items-center">
        <AnimatePresence mode="wait" initial={false}>
          {error ? (
            <motion.span
              key="err"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={t.press}
            >
              <CircleAlert size={24} className="tone-tango" aria-hidden />
            </motion.span>
          ) : (
            <motion.span
              key="busy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={t.press}
            >
              <LoaderCircle size={24} className="animate-spin" aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {error ? (
        <motion.div variants={rise} initial="hidden" animate="show">
          <p className="mt-2 font-semibold">{tx("callback.could_not_connect_spotify")}</p>
          <p className="text-muted mt-1 text-sm">{error}</p>
          <Link href="/settings" className="btn btn-ghost mt-4">
            {tx("callback.back_to_settings")}
          </Link>
        </motion.div>
      ) : (
        <p className="mt-2 text-sm">{tx("callback.connecting_to_spotify")}</p>
      )}
    </motion.div>
  );
}
