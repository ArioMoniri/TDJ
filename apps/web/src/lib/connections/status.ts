import type { MsgKey } from "@/lib/i18n";
import type { ByoState } from "./byo";
import type { ConnectionId } from "./catalog";
import { MANAGED_APP, type ManagedState, managedConnected } from "./managed";

/**
 * 2026-11 — one plain status per service for Settings → Connections, from what this device and this deployment
 * have. The order of preference is the same everywhere: the deployment's own credentials when the owner set them
 * (lib/server/config.ts: environment first, then Parameter Store), else the DJ's own (lib/connections/byo.ts), else
 * a sentence that says what is missing and who can add it. Pure: the vitest pins every branch.
 */
export interface ServerConnectors {
  spotify: boolean;
  google: boolean;
  dropbox: boolean;
  /** the deployment's YOUTUBE_API_KEY (search without a Google sign-in) */
  youtubeKey: boolean;
}
export interface ConnectionContext {
  /** the T-DJ app for Mac or iPad */
  app: boolean;
  /** the app is linked to a TDJ server (Settings → Connections) */
  linkedServer: boolean;
  /** what the deployment has; null while it is being asked */
  server: ServerConnectors | null;
  byo: ByoState;
  /** a Spotify Client ID is at hand: the DJ's own, or (apps) the one the build ships with */
  spotifyClientId: boolean;
  /** the server's Pipedream Connect (the managed one-tap sign-in), when it has one (lib/connections/managed.ts) */
  managed?: ManagedState;
}
export type Via = "keyless" | "server" | "managed" | "own" | "none" | "checking" | "soon";
export interface ConnectionStatus {
  via: Via;
  tone: "on" | "off" | "warn";
  /** the row's short value */
  short: MsgKey;
  /** one plain sentence: what works and, when nothing does, what to do */
  message: MsgKey;
}

const NO_SERVER: ServerConnectors = { spotify: false, google: false, dropbox: false, youtubeKey: false };
/** what counts as "the server's" here: a browser always talks to its deployment; an app only once linked */
export function serverFor(ctx: ConnectionContext): ServerConnectors | null {
  if (ctx.app && !ctx.linkedServer) return NO_SERVER;
  return ctx.server;
}

const s = (via: Via, tone: ConnectionStatus["tone"], short: MsgKey, message: MsgKey): ConnectionStatus => ({
  via,
  tone,
  short,
  message,
});
const CHECKING = s("checking", "off", "connections.short.checking", "connections.msg.checking");

/**
 * A connection through the server's Pipedream Connect counts first: it needs nobody's developer app. When the
 * server offers it but nothing else works yet, the plain sentence points at the one-tap button instead.
 */
export function connectionStatus(id: ConnectionId, ctx: ConnectionContext): ConnectionStatus {
  if (managedConnected(id, ctx.managed))
    return s(
      "managed",
      "on",
      "connections.short.connected",
      id === "spotify" ? "connections.msg.managed_spotify" : "connections.msg.managed_connected",
    );
  const base = baseStatus(id, ctx);
  if (ctx.managed?.enabled && MANAGED_APP[id] && (base.via === "none" || base.via === "checking"))
    return s("none", "warn", "connections.short.one_tap", "connections.msg.managed_available");
  return base;
}

function baseStatus(id: ConnectionId, ctx: ConnectionContext): ConnectionStatus {
  if (id === "deezer" || id === "musicbrainz" || id === "lrclib")
    return s("keyless", "on", "connections.short.keyless", "connections.msg.keyless");
  if (id === "apple_music") return s("soon", "off", "connections.short.soon", "connections.msg.apple_soon");
  const srv = serverFor(ctx);
  const own = (k: MsgKey) => s("own", "on", "connections.short.own", k);
  const server = (k: MsgKey) => s("server", "on", "connections.short.server", k);
  switch (id) {
    case "spotify":
      if (srv === null) return CHECKING;
      if (srv.spotify) return server("connections.msg.spotify_server");
      if (ctx.spotifyClientId) return own("connections.msg.spotify_own");
      return s("none", "warn", "connections.short.set_up", "connections.msg.spotify_none");
    case "youtube":
      // your own key works without any server, so it is said first even while the server is asked
      if (ctx.byo.youtubeKey) return own("connections.msg.youtube_own");
      if (srv === null) return CHECKING;
      if (srv.youtubeKey) return server("connections.msg.youtube_server_key");
      if (srv.google) return server("connections.msg.youtube_google");
      return s("none", "off", "connections.short.off", "connections.msg.youtube_none");
    case "dropbox":
      if (srv === null) return CHECKING;
      if (srv.dropbox) return server("connections.msg.dropbox_server");
      if (ctx.byo.dropbox?.connected) return own("connections.msg.dropbox_own");
      if (ctx.byo.dropbox?.clientId)
        return s("none", "warn", "connections.short.sign_in", "connections.msg.dropbox_own_signin");
      return s("none", "off", "connections.short.off", "connections.msg.dropbox_none");
    case "google_drive":
      if (srv === null) return CHECKING;
      if (srv.google) return server("connections.msg.drive_server");
      if (!ctx.app) return s("none", "off", "connections.short.off", "connections.msg.drive_none_web");
      if (ctx.byo.google?.connected) return own("connections.msg.drive_own");
      if (ctx.byo.google?.clientId)
        return s("none", "warn", "connections.short.sign_in", "connections.msg.drive_own_signin");
      return s("none", "off", "connections.short.off", "connections.msg.drive_none_app");
  }
}

/**
 * Where an export file goes for Dropbox or Google Drive: the deployment's sign-in when it has one (the server's
 * routes), else the DJ's own app when signed in, else nowhere (the Export sheet says to connect in Settings).
 */
export function uploadVia(
  target: "dropbox" | "google_drive",
  ctx: ConnectionContext,
): "server" | "own" | null {
  const srv = serverFor(ctx);
  if (target === "dropbox") {
    if (srv?.dropbox) return "server";
    return ctx.byo.dropbox?.connected ? "own" : null;
  }
  if (srv?.google) return "server";
  return ctx.app && ctx.byo.google?.connected ? "own" : null;
}

/** Whether the DJ may bring their own credentials for a service on this device (Google: the apps only). */
export function byoAvailable(id: ConnectionId, app: boolean): boolean {
  if (id === "youtube" || id === "dropbox" || id === "spotify") return true;
  if (id === "google_drive") return app;
  return false;
}
