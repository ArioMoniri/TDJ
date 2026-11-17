import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { test } from "node:test";
import { manifest } from "../latest-json.mjs";
import { parsePublicKey, verifyUpdater } from "../verify-updater.mjs";

// a minisign key pair and signature in Tauri's encoding (each file base64-encoded as a whole), built here
function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const id = randomBytes(8);
  const pk = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const file = `untrusted comment: minisign public key: ${Buffer.from(id).reverse().toString("hex").toUpperCase()}\n${Buffer.concat([Buffer.from("Ed"), id, pk]).toString("base64")}\n`;
  return { privateKey, id, pubkey: Buffer.from(file).toString("base64") };
}
function minisign(data, { privateKey, id }) {
  const sig = sign(null, createHash("blake2b512").update(data).digest(), privateKey);
  const comment = "timestamp:1794784320\tfile:TDJ.app.tar.gz\tversion:1.0.0";
  const global = sign(null, Buffer.concat([sig, Buffer.from(comment)]), privateKey);
  const file = `untrusted comment: signature from tauri secret key\n${Buffer.concat([Buffer.from("ED"), id, sig]).toString("base64")}\ntrusted comment: ${comment}\n${global.toString("base64")}\n`;
  return Buffer.from(file).toString("base64");
}

const tarball = Buffer.from("the universal TDJ.app, compressed");

test("updater: latest.json, the tarball and its signature pair with the app's public key", () => {
  const k = keypair();
  const sig = minisign(tarball, k);
  const m = manifest({ version: "1.0.0", signature: sig, notes: "n" });
  const line = verifyUpdater({ manifest: m, tarball, sig: `${sig}\n`, pubkey: k.pubkey, version: "1.0.0" });
  assert.match(line, new RegExp(`key ${parsePublicKey(k.pubkey).keyId}`));
});

test("updater: refuses a key that is not the pair of the app's public key", () => {
  const k = keypair();
  const other = keypair();
  const sig = minisign(tarball, other);
  const m = manifest({ version: "1.0.0", signature: sig, notes: "" });
  assert.throws(
    () => verifyUpdater({ manifest: m, tarball, sig, pubkey: k.pubkey, version: "1.0.0" }),
    /not a pair/,
  );
});

test("updater: refuses a changed tarball, another version, a foreign URL or a missing key", () => {
  const k = keypair();
  const sig = minisign(tarball, k);
  const m = manifest({ version: "1.0.0", signature: sig, notes: "" });
  const ok = { manifest: m, tarball, sig, pubkey: k.pubkey, version: "1.0.0" };
  assert.throws(() => verifyUpdater({ ...ok, tarball: Buffer.from("x") }), /does not match the tarball/);
  assert.throws(() => verifyUpdater({ ...ok, version: "1.0.1" }), /latest\.json says 1\.0\.0/);
  assert.throws(
    () => verifyUpdater({ ...ok, repo: "someone/else" }),
    /expected https:\/\/github\.com\/someone/,
  );
  assert.throws(() => verifyUpdater({ ...ok, sig: minisign(Buffer.from("y"), k) }), /signature differs/);
  assert.throws(() => verifyUpdater({ ...ok, pubkey: "" }), /TAURI_UPDATER_PUBKEY/);
});
