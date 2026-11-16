"use client";
import { useEffect } from "react";
import { watchRoomCortinas } from "@/lib/roomCortinas";
import { useRooms } from "@/lib/rooms";

/**
 * Keeps the DJ's room in sync on every page (the composer, the booth and the Rooms page edit the same night), and
 * (2026-11) the room's cortinas mended after every change of its tandas, wherever it was made (lib/roomCortinas.ts).
 */
export function RoomSync() {
  const boot = useRooms((s) => s.boot);
  useEffect(() => boot(), [boot]);
  useEffect(() => watchRoomCortinas(), []);
  return null;
}
