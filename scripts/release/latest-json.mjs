#!/usr/bin/env node
// Tauri updater manifest for the Developer ID (DMG) build, uploaded to the GitHub Release as latest.json.
// The app reads https://github.com/<repo>/releases/latest/download/latest.json, shows `notes` and installs.
//   node scripts/release/latest-json.mjs --version 1.2.0 --sig TDJ.app.tar.gz.sig --notes-file notes.md \
//        [--repo ArioMoniri/TDJ] [--asset TDJ-macOS.app.tar.gz] > latest.json
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

/** Release notes: the file if given, else the App Store "what's new" text, trimmed for a dialog. */
export function notesFrom(text) {
  return text.replace(/\r\n/g, "\n").trim().slice(0, 4000);
}

export function manifest({
  version,
  signature,
  notes,
  repo = "ArioMoniri/TDJ",
  asset = "TDJ-macOS.app.tar.gz",
  date = new Date(),
}) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`not a semver version: ${version}`);
  if (!signature?.trim())
    throw new Error("empty updater signature (TAURI_SIGNING_PRIVATE_KEY missing at build time?)");
  const url = `https://github.com/${repo}/releases/download/v${version}/${asset}`;
  const entry = { signature: signature.trim(), url };
  // one universal binary serves both architectures
  return {
    version,
    notes: notesFrom(notes ?? ""),
    pub_date: date.toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms: { "darwin-aarch64": entry, "darwin-x86_64": entry, "darwin-universal": entry },
  };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      version: { type: "string" },
      sig: { type: "string" },
      "notes-file": { type: "string" },
      repo: { type: "string", default: "ArioMoniri/TDJ" },
      asset: { type: "string", default: "TDJ-macOS.app.tar.gz" },
    },
  });
  const m = manifest({
    version: values.version ?? "",
    signature: values.sig ? readFileSync(values.sig, "utf8") : "",
    notes: values["notes-file"] ? readFileSync(values["notes-file"], "utf8") : "",
    repo: values.repo,
    asset: values.asset,
  });
  process.stdout.write(`${JSON.stringify(m, null, 2)}\n`);
}
