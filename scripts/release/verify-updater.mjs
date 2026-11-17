#!/usr/bin/env node
// Checks the Developer ID auto-update path before anything is published: latest.json names this version, points
// at this release's tarball, carries the tarball's .sig verbatim, and that signature verifies against the updater
// public key built into the app (TAURI_UPDATER_PUBKEY). A secret key that does not pair with the public key would
// otherwise ship a DMG whose every future update is refused. No dependencies: minisign is Ed25519 (+ BLAKE2b-512).
//   node scripts/release/verify-updater.mjs --manifest latest.json --tarball TDJ-macOS.app.tar.gz \
//        --sig TDJ-macOS.app.tar.gz.sig --version 1.0.0 [--pubkey <base64>|env TAURI_UPDATER_PUBKEY] [--repo o/r]
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** Tauri stores minisign files base64-encoded as a whole; accept either form. */
export function decodeBox(text) {
  const t = String(text ?? "").trim();
  if (t.startsWith("untrusted comment:")) return t;
  const decoded = Buffer.from(t, "base64").toString("utf8");
  if (!decoded.startsWith("untrusted comment:")) throw new Error("not a minisign key or signature");
  return decoded;
}

/** { keyId (hex, as minisign prints it), key (KeyObject) } from a minisign public key. */
export function parsePublicKey(text) {
  const lines = decodeBox(text).split("\n");
  const raw = Buffer.from(lines[1]?.trim() ?? "", "base64");
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== "Ed")
    throw new Error("malformed minisign public key");
  const id = raw.subarray(2, 10);
  const key = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: b64url(raw.subarray(10)) },
    format: "jwk",
  });
  return { keyId: Buffer.from(id).reverse().toString("hex").toUpperCase(), id, key };
}

/** Verifies a minisign signature (prehashed "ED" as Tauri writes, or legacy "Ed") of `data`. */
export function verifyMinisign({ data, signature, publicKey }) {
  const pk = parsePublicKey(publicKey);
  const lines = decodeBox(signature).split("\n");
  const raw = Buffer.from(lines[1]?.trim() ?? "", "base64");
  if (raw.length !== 74) throw new Error("malformed minisign signature");
  const alg = raw.subarray(0, 2).toString();
  const id = raw.subarray(2, 10);
  const sig = raw.subarray(10);
  if (!id.equals(pk.id)) {
    const sigId = Buffer.from(id).reverse().toString("hex").toUpperCase();
    throw new Error(
      `signed with key ${sigId}, but the app trusts key ${pk.keyId} (TAURI_SIGNING_PRIVATE_KEY and TAURI_UPDATER_PUBKEY are not a pair)`,
    );
  }
  const message = alg === "ED" ? createHash("blake2b512").update(data).digest() : alg === "Ed" ? data : null;
  if (!message) throw new Error(`unknown minisign algorithm ${alg}`);
  if (!verify(null, message, pk.key, sig))
    throw new Error("the updater signature does not match the tarball");
  const trusted = lines[2] ?? "";
  if (!trusted.startsWith("trusted comment: "))
    throw new Error("minisign signature without a trusted comment");
  const global = Buffer.from(lines[3]?.trim() ?? "", "base64");
  const comment = trusted.slice("trusted comment: ".length);
  if (!verify(null, Buffer.concat([sig, Buffer.from(comment)]), pk.key, global))
    throw new Error("the trusted comment of the updater signature is not signed by the same key");
  return { keyId: pk.keyId, comment };
}

/** Every check on latest.json + tarball + .sig; throws on the first problem, returns a one-line summary. */
export function verifyUpdater({
  manifest,
  tarball,
  sig,
  pubkey,
  version,
  repo = "ArioMoniri/TDJ",
  asset = "TDJ-macOS.app.tar.gz",
}) {
  if (!pubkey?.trim())
    throw new Error("updater public key missing (repository variable TAURI_UPDATER_PUBKEY)");
  if (manifest.version !== version)
    throw new Error(`latest.json says ${manifest.version}, this release is ${version}`);
  const url = `https://github.com/${repo}/releases/download/v${version}/${asset}`;
  const need = ["darwin-aarch64", "darwin-x86_64"];
  for (const p of need) if (!manifest.platforms?.[p]) throw new Error(`latest.json has no ${p} entry`);
  for (const [p, e] of Object.entries(manifest.platforms)) {
    if (e.url !== url) throw new Error(`latest.json ${p} points at ${e.url}, expected ${url}`);
    if (e.signature !== sig.trim()) throw new Error(`latest.json ${p} signature differs from ${asset}.sig`);
  }
  if (Number.isNaN(Date.parse(manifest.pub_date ?? "")))
    throw new Error("latest.json pub_date is not a date");
  const { keyId } = verifyMinisign({ data: tarball, signature: sig, publicKey: pubkey });
  return `updater: latest.json ${version} → ${asset}, signature valid (key ${keyId})`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string" },
      tarball: { type: "string" },
      sig: { type: "string" },
      version: { type: "string" },
      pubkey: { type: "string", default: process.env.TAURI_UPDATER_PUBKEY ?? "" },
      repo: { type: "string", default: process.env.GITHUB_REPOSITORY || "ArioMoniri/TDJ" },
    },
  });
  try {
    console.log(
      verifyUpdater({
        manifest: JSON.parse(readFileSync(values.manifest, "utf8")),
        tarball: readFileSync(values.tarball),
        sig: readFileSync(values.sig, "utf8"),
        pubkey: values.pubkey,
        version: values.version ?? "",
        repo: values.repo,
      }),
    );
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
