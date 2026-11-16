import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.mjs";
import { fakeSys, output, quiet } from "./helpers.mjs";

describe("apple", () => {
  it("sets every secret through stdin, the variables, and both environments", async () => {
    const home = mkdtempSync(join(tmpdir(), "tdj-"));
    const p8 = join(home, "AuthKey_ABCDE12345.p8");
    writeFileSync(p8, "-----BEGIN PRIVATE KEY-----\nMIGT\n-----END PRIVATE KEY-----\n");
    const sys = fakeSys({ "gh api user --jq .id": { stdout: "92126657\n" } });
    const code = await main(
      [
        "apple",
        "--repo",
        "ArioMoniri/TDJ",
        "--issuer-id",
        "69a6de70-03db-47e3-e053-5b8c7c11a4d1",
        "--key-id",
        "ABCDE12345",
        "--p8",
        p8,
        "--app-id",
        "6740000000",
        "-y",
      ],
      { ...sys, log: quiet, env: {}, open: quiet, isTTY: false },
    );
    expect(code).toBe(0);
    const secrets = Object.fromEntries(
      sys.calls.filter((c) => c.args[0] === "secret").map((c) => [c.args[2], c.input]),
    );
    expect(Object.keys(secrets).sort()).toEqual(
      [
        "APPLE_TEAM_ID",
        "APP_STORE_CONNECT_ISSUER_ID",
        "APP_STORE_CONNECT_KEY_ID",
        "APP_STORE_CONNECT_PRIVATE_KEY",
      ].sort(),
    );
    expect(secrets.APP_STORE_CONNECT_PRIVATE_KEY).toContain("BEGIN PRIVATE KEY");
    expect(secrets.APPLE_TEAM_ID).toBe("FF68N39FU5");
    for (const c of sys.calls) expect(c.args.join(" ")).not.toContain("BEGIN PRIVATE KEY");
    const vars = sys.calls
      .filter((c) => c.args[0] === "variable")
      .map((c) => `${c.args[2]}=${c.args.at(-1)}`);
    expect(vars).toEqual(["TDJ_APP_BUNDLE_ID=com.ariomoniri.tdj", "APPLE_APP_ID=6740000000"]);
    expect(sys.calls.some((c) => c.args.join(" ").includes("/environments/"))).toBe(false);
  });

  it("refuses a file that is not a .p8 key, in plain words", async () => {
    const f = join(mkdtempSync(join(tmpdir(), "tdj-")), "x.p8");
    writeFileSync(f, "hello");
    const sys = fakeSys();
    const o = output();
    const code = await main(
      [
        "apple",
        "--issuer-id",
        "69a6de70-03db-47e3-e053-5b8c7c11a4d1",
        "--key-id",
        "ABCDE12345",
        "--p8",
        f,
        "-y",
      ],
      { ...sys, log: o.log, env: {}, open: quiet, isTTY: false },
    );
    expect(code).toBe(1);
    expect(o.text()).toMatch(/✗ .*not an App Store Connect/);
  });
});
