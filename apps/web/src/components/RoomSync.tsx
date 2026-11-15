"use client";
import { useEffect } from "react";
import { useRooms } from "@/lib/rooms";

/** Keeps the DJ's room in sync on every page (the composer, the booth and the Rooms page edit the same night). */
export function RoomSync() {
  const boot = useRooms((s) => s.boot);
  useEffect(() => boot(), [boot]);
  return null;
}
