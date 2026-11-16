"use client";
import { AppWindow, Download, Globe, Info, RefreshCw, Smartphone } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { nativeInfo } from "@/lib/app/native";
import { APP } from "@/lib/app/target";
import { t as tx } from "@/lib/i18n";
import {
  type Channel,
  channelOf,
  LINKS,
  type Remote,
  updateLink,
  updateState,
  VERSION,
  versionLabel,
} from "@/lib/release";
import { toast } from "@/lib/toast";
import { Group, Row, Tile } from "./Form";

/** How often an open web tab asks the server which version it runs (a night lasts hours; nothing reloads by itself). */
const EVERY_MS = 30 * 60_000;

/**
 * The deployed web version, asked on load, every 30 minutes and when the tab comes back. The web only: the apps
 * are standalone (no request to a server they were not linked to) and get updates from the App Store, TestFlight
 * or the DMG's own updater.
 */
export function useRemoteVersion(): Remote | null {
  const [remote, setRemote] = useState<Remote | null>(null);
  useEffect(() => {
    if (APP) return;
    let stop = false;
    const ask = () =>
      fetch("/api/version", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Remote | null) => {
          if (!stop && j?.version) setRemote(j);
        })
        .catch(() => {});
    void ask();
    const id = setInterval(ask, EVERY_MS);
    const vis = () => document.visibilityState === "visible" && void ask();
    document.addEventListener("visibilitychange", vis);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  return remote;
}

function useChannel(): Channel {
  const [channel, setChannel] = useState<Channel>(APP ? "ios" : "web");
  useEffect(() => {
    if (APP) void nativeInfo().then((i) => setChannel(channelOf(true, i)));
  }, []);
  return channel;
}

const CHANNEL_LABEL: Record<Channel, () => string> = {
  web: () => tx("about.channel_web"),
  dmg: () => tx("about.channel_dmg"),
  "mac-app-store": () => tx("about.channel_mac_app_store"),
  ios: () => tx("about.channel_ios"),
};

/**
 * Once per new deploy, a quiet toast outside the Booth: "A newer T-DJ is out. Reload when the night is over." Never
 * during a night (the Booth, or a night playing anywhere), never a reload by itself.
 */
export function UpdateWatch() {
  const remote = useRemoteVersion();
  const path = usePathname();
  useEffect(() => {
    if (!remote || updateState(remote) === "current") return;
    if (path?.startsWith("/booth") || document.documentElement.dataset.boothLive !== undefined) return;
    const key = `tdj-update-seen:${remote.version}:${remote.commit ?? ""}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    toast(tx("about.update_toast"), () => location.reload(), tx("about.reload"));
  }, [remote, path]);
  return null;
}

/** Settings → About: this copy's version, where it came from, a newer one if there is, and where else T-DJ runs. */
export function About() {
  const remote = useRemoteVersion();
  const channel = useChannel();
  const state = updateState(remote);
  const link = updateLink(channel);
  // a Mac App Store or iPhone/iPad build links to the App Store only (no outside download from a store app)
  const store = channel === "ios" || channel === "mac-app-store";
  return (
    <Group header={tx("about.about")} footer={tx("about.footer")} id="settings-about">
      <Row
        tile={
          <Tile color="#8e8e93">
            <Info size={16} strokeWidth={2} />
          </Tile>
        }
        label={tx("about.version")}
        value={<span data-testid="about-version">{versionLabel()}</span>}
      />
      <Row
        tile={
          <Tile color="#5856d6">
            <AppWindow size={16} strokeWidth={2} />
          </Tile>
        }
        label={tx("about.installed_from")}
        value={CHANNEL_LABEL[channel]()}
      />
      {state !== "current" && (
        <Row
          data-testid="about-update"
          tile={
            <Tile color="#34c759">
              <RefreshCw size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("about.update_available")}
          sub={
            state === "newer"
              ? tx("about.newer_version", { version: remote?.version ?? "", current: VERSION })
              : tx("about.newer_deploy")
          }
          onClick={() => location.reload()}
          tip={tx("about.reload_when_over")}
          chevron
        />
      )}
      {channel !== "web" && link && (
        <Row
          tile={
            <Tile color="#34c759">
              <Download size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("about.get_updates")}
          sub={channel === "dmg" ? tx("about.updates_dmg") : tx("about.updates_store")}
          href={link}
          chevron
        />
      )}
      {LINKS.appStoreLive && LINKS.appStore && channel !== "ios" && (
        <Row
          tile={
            <Tile color="#0a84ff">
              <Smartphone size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("about.iphone_ipad")}
          sub={tx("about.app_store")}
          href={LINKS.appStore}
          chevron
        />
      )}
      {!store && channel !== "dmg" && (
        <Row
          tile={
            <Tile color="#1c1c1e">
              <Download size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("about.mac_download")}
          sub={tx("about.mac_download_sub")}
          href={LINKS.releases}
          chevron
        />
      )}
      {channel !== "web" && LINKS.web && (
        <Row
          tile={
            <Tile color="#ff9500">
              <Globe size={16} strokeWidth={2} />
            </Tile>
          }
          label={tx("about.web_app")}
          sub={LINKS.web.replace(/^https:\/\//, "")}
          href={LINKS.web}
          chevron
        />
      )}
    </Group>
  );
}
