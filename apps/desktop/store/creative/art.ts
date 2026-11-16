/**
 * The small drawing kit of the store pictures: escaping, the small type's face (Inter, embedded), the headline's
 * marks, and what a screen draws over a capture (the status bar, the foldables' camera and fold). Everything is
 * HTML/CSS rendered by Chromium; sizes are in output pixels. The devices themselves are 3D (showcase.ts).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statusBar } from "../compose";
import type { CaptureDevice, Frame } from "./spec";

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Inter 500/600/700, the status bars' face; latin + latin-ext (Turkish ğ ş ı İ), as data URLs */
export function fonts(): string {
  const req = createRequire(join(fileURLToPath(new URL("../../../web/package.json", import.meta.url))));
  const face = (family: string, pkg: string, w: number) =>
    ["latin", "latin-ext"]
      .map((sub) => {
        const p = join(
          dirname(req.resolve(`${pkg}/package.json`)),
          "files",
          `${pkg.split("/")[1]}-${sub}-${w}-normal.woff2`,
        );
        return `@font-face{font-family:"${family}";font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${readFileSync(p).toString("base64")}) format("woff2")}`;
      })
      .join("\n");
  return [
    face("Inter", "@fontsource/inter", 500),
    face("Inter", "@fontsource/inter", 600),
    face("Inter", "@fontsource/inter", 700),
  ].join("\n");
}

/** `Compose a *milonga*\nin one tap` → two lines, the starred word bold */
export function headlineHtml(h: string): string {
  return h
    .split("\n")
    .map((line) => `<span class="ln">${esc(line).replace(/\*([^*]+)\*/g, "<b>$1</b>")}</span>`)
    .join("");
}

/** the overlay a screen needs: the status bar (phone, tablet), a camera hole and status column (Duo), nothing (Mac) */
export function screenChrome(frame: Frame, cap: CaptureDevice, k: number, dark: boolean): string {
  const c = dark ? "#fff" : "#000";
  if (frame === "phone") return statusBar({ kind: "phone", safe: cap.safe }, k, dark);
  if (frame === "tablet") return statusBar({ kind: "tablet", safe: cap.safe }, k, dark);
  if (frame === "duoOuter") {
    const t = cap.safe.top * k;
    const fs = 15 * k;
    return `<div style="position:absolute;inset:0 0 auto 0;height:${t}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${30 * k}px;box-sizing:border-box;color:${c};font:700 ${fs}px/1 Inter,sans-serif">
      <span>9:41</span><span style="display:flex;gap:${4 * k}px;align-items:center"><i style="width:${22 * k}px;height:${11 * k}px;border:${1.2 * k}px solid ${c};border-radius:${3 * k}px;opacity:.9;display:block"></i></span></div>
      <div style="position:absolute;top:${(t - 12 * k) / 2}px;left:50%;width:${12 * k}px;height:${12 * k}px;margin-left:${-6 * k}px;border-radius:50%;background:#000;box-shadow:0 0 0 ${2 * k}px rgba(255,255,255,.05)"></div>
      <div style="position:absolute;bottom:${7 * k}px;left:50%;width:${120 * k}px;height:${5 * k}px;margin-left:${-60 * k}px;background:${c};opacity:.85;border-radius:${3 * k}px"></div>`;
  }
  if (frame === "duoInner") {
    // 27.1 SDK: the status bar is a vertical bar on the trailing edge; the fold runs down the middle
    const r = cap.safe.right * k;
    const fs = 12 * k;
    return `<div style="position:absolute;top:0;right:0;bottom:0;width:${r}px;display:flex;flex-direction:column;align-items:center;padding-top:${14 * k}px;gap:${8 * k}px;color:${c};font:700 ${fs}px/1 Inter,sans-serif">
        <span style="writing-mode:vertical-rl">9:41</span><i style="width:${10 * k}px;height:${20 * k}px;border:${1.2 * k}px solid ${c};border-radius:${3 * k}px;opacity:.9;display:block"></i></div>
      <div style="position:absolute;top:0;bottom:0;left:50%;width:${3 * k}px;margin-left:${-1.5 * k}px;background:linear-gradient(90deg,rgba(0,0,0,.10),rgba(255,255,255,.14),rgba(0,0,0,.10))"></div>
      <div style="position:absolute;bottom:${6 * k}px;left:50%;width:${160 * k}px;height:${5 * k}px;margin-left:${-80 * k}px;background:${c};opacity:.8;border-radius:${3 * k}px"></div>`;
  }
  return "";
}
