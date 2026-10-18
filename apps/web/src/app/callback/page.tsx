"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { finishAuth } from "@/lib/spotify";
import { useStore } from "@/lib/store";

export default function Callback() {
  const { settings, setSpotifyToken } = useStore();
  const [msg, setMsg] = useState("Connecting to Spotify…");
  const router = useRouter();
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("code");
    if (!code) { setMsg("No code returned."); return; }
    finishAuth(settings.spotifyClientId, code).then((t) => { setSpotifyToken(t); router.replace("/"); }).catch((e) => setMsg(String(e)));
  }, [settings.spotifyClientId, setSpotifyToken, router]);
  return <div className="glass mx-auto max-w-md p-6 text-center">{msg}</div>;
}
