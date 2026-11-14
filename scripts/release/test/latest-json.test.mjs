import assert from "node:assert/strict";
import { test } from "node:test";
import { manifest } from "../latest-json.mjs";

test("updater manifest: both architectures point at the universal tarball of that tag", () => {
  const m = manifest({
    version: "1.2.0",
    signature: "sig\n",
    notes: "## New\r\n- Cue",
    date: new Date("2026-11-14T10:00:00.123Z"),
  });
  assert.equal(m.pub_date, "2026-11-14T10:00:00Z");
  assert.equal(m.notes, "## New\n- Cue");
  const url = "https://github.com/ArioMoniri/TDJ/releases/download/v1.2.0/TDJ-macOS.app.tar.gz";
  for (const k of ["darwin-aarch64", "darwin-x86_64", "darwin-universal"]) {
    assert.deepEqual(m.platforms[k], { signature: "sig", url });
  }
});

test("updater manifest refuses a bad version or a missing signature", () => {
  assert.throws(() => manifest({ version: "v1.2", signature: "s" }), /semver/);
  assert.throws(() => manifest({ version: "1.2.0", signature: " " }), /signature/);
});
