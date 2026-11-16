"use client";
import { normalizeRoomCode } from "@tdj/core";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { FloorScreen } from "@/components/floor/FloorScreen";

/**
 * /screen — the dancers' Floor screen. Opened from the Booth (More → Floor screen) it follows that window; with
 * `?room=CODE` (and `&server=` for a room on another T-DJ site) any device — a TV's browser, a phone — follows the
 * room's booth. A query string: the apps ship a static export.
 */
export default function Page() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const q = useSearchParams();
  const code = normalizeRoomCode(q.get("room") ?? "");
  const server = q.get("server") ?? "";
  const room = useMemo(() => {
    if (!code) return null;
    const ok = !server || /^https?:\/\/[\w.-]+(:\d+)?\/?$/.test(server);
    return ok ? { code, server } : null;
  }, [code, server]);
  return <FloorScreen room={room} takeover />;
}
