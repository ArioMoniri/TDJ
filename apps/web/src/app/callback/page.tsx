"use client";
import { CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { finishAuth } from "@/lib/spotify";
import { useStore } from "@/lib/store";

export default function Callback() {
  const { settings, setSpotifyToken } = useStore();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (!code) {
      setError(params.get("error") ? "Spotify did not grant access." : "Spotify did not return a code.");
      return;
    }
    finishAuth(settings.spotifyClientId, code)
      .then((t) => {
        setSpotifyToken(t);
        router.replace("/");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not finish connecting."));
  }, [settings.spotifyClientId, setSpotifyToken, router]);
  return (
    <div className="surface mx-auto max-w-md p-6 text-center" role="status" aria-live="polite">
      {error ? (
        <>
          <CircleAlert size={24} className="tone-tango mx-auto" aria-hidden />
          <p className="mt-2 font-semibold">Could not connect Spotify</p>
          <p className="text-muted mt-1 text-sm">{error}</p>
          <Link href="/settings" className="btn btn-ghost mt-4">
            Back to Settings
          </Link>
        </>
      ) : (
        <>
          <LoaderCircle size={24} className="mx-auto animate-spin" aria-hidden />
          <p className="mt-2 text-sm">Connecting to Spotify…</p>
        </>
      )}
    </div>
  );
}
