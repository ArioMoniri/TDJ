import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP, main, parse } from "../src/cli.mjs";
import { CONNECTOR_KEYS, CONNECTORS, LOCAL_ENV, pick, readLocal } from "../src/connectors.mjs";
import * as v from "../src/validate.mjs";
import { checkout, fakeSys, IDENTITY, output, quiet } from "./helpers.mjs";

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
const strip = (/** @type {string} */ s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const base = { open: quiet, isTTY: false };
/** obviously fake values (the leak check, scripts/security/leaks.test.mjs, recognises them) */
const SP_ID = "a".repeat(32);
const SP_SECRET = "c".repeat(32);
const YT_KEY = ["AI", "za"].join("") + "FAKEtestKEY0123456789abcdefghijklmn";
const DB_KEY = "fakeappkey12345";
const DB_SECRET = "fakesecret12345";
const G_ID = "123456789012-fakeclientidtest.apps.googleusercontent.com";
const G_SECRET = "GOCSPX-fake-test-secret-0123456789";
const ALL_SECRETS = [SP_SECRET, YT_KEY, DB_SECRET, G_SECRET];

/** records the Parameter Store bodies (`--cli-input-json file://…`, deleted right after) */
function capturePuts(/** @type {ReturnType<typeof fakeSys>} */ sys) {
  /** @type {any[]} */
  const puts = [];
  /** @type {import("../src/sys.mjs").Run} */
  const run = (cmd, args, o) => {
    const i = args.indexOf("--cli-input-json");
    if (i >= 0) {
      const path = /** @type {string} */ (args[i + 1]).replace("file://", "");
      puts.push(JSON.parse(readFileSync(path, "utf8")));
      expect(statSync(path).mode & 0o077).toBe(0);
    }
    return sys.run(cmd, args, o);
  };
  return { run, puts };
}

describe("tdj connectors: the catalogue", () => {
  it("covers Spotify, YouTube, Google and Dropbox with the env names sst.config.ts forwards", () => {
    expect(CONNECTORS.map((c) => c.id)).toEqual(["spotify", "youtube", "google", "dropbox", "pipedream"]);
    const sst = readFileSync(new URL("../../../sst.config.ts", import.meta.url), "utf8");
    const workflow = readFileSync(
      new URL("../../../.github/workflows/deploy-aws.yml", import.meta.url),
      "utf8",
    );
    for (const k of CONNECTOR_KEYS) {
      expect(sst).toContain(`"${k}"`);
      expect(workflow).toContain(`${k}: \${{ secrets.${k} }}`);
    }
    const config = readFileSync(
      new URL("../../../apps/web/src/lib/server/config.ts", import.meta.url),
      "utf8",
    );
    // Parameter Store keys (lib/server/config.ts); Pipedream is read from the environment only (lib/server/connect.ts)
    for (const c of CONNECTORS.filter((x) => !x.envOnly))
      for (const f of c.fields) expect(config).toContain(`"${f.key}"`);
    const connect = readFileSync(
      new URL("../../../apps/web/src/lib/server/connect.ts", import.meta.url),
      "utf8",
    );
    for (const f of CONNECTORS.find((x) => x.id === "pipedream")?.fields ?? [])
      expect(connect).toContain(`process.env.${f.key}`);
  });
  it("prints the exact redirect addresses for the app's URL", () => {
    const sp = CONNECTORS[0]?.steps("https://dj.example").join("\n") ?? "";
    expect(sp).toContain("https://dj.example/api/spotify/callback");
    expect(sp).toContain("https://dj.example/callback");
    expect(sp).toContain("tdj://spotify-callback");
    expect(CONNECTORS[2]?.steps("https://dj.example").join("\n")).toContain(
      "https://dj.example/api/google/callback",
    );
    expect(CONNECTORS[3]?.steps("https://dj.example").join("\n")).toContain(
      "https://dj.example/api/dropbox/callback",
    );
  });
  it("--only picks, and refuses what does not exist", () => {
    expect(pick("youtube, dropbox").map((c) => c.id)).toEqual(["youtube", "dropbox"]);
    expect(() => pick("tidal")).toThrow(/Unknown connector: tidal/);
  });
  it("checks each key's shape", () => {
    expect(v.youtubeKey(YT_KEY)).toBeNull();
    expect(v.youtubeKey("nope")).toMatch(/AIza/);
    expect(v.dropboxAppKey(DB_KEY)).toBeNull();
    expect(v.dropboxSecret("UPPER")).toMatch(/15/);
    expect(v.googleClientId(G_ID)).toBeNull();
    expect(v.googleSecret(G_SECRET)).toBeNull();
    expect(v.googleClientId("x")).toMatch(/googleusercontent/);
  });
  it("is in --help, with no secret flag", () => {
    expect(HELP).toMatch(/\n {2}connectors\b/);
    expect(HELP).not.toMatch(/--(youtube|dropbox|google)-[a-z-]*(secret|key)/);
    expect(parse(["connectors", "--only", "youtube", "--target", "local", "--check"]).flags).toMatchObject({
      only: "youtube",
      target: "local",
      check: true,
    });
  });
});

describe("tdj connectors: storing", () => {
  it("aws: each key to Parameter Store through a 0600 file, never argv or output", async () => {
    const dir = checkout({ url: "https://dj.example" });
    const sys = fakeSys({
      "aws sts get-caller-identity": IDENTITY,
      "aws ssm get-parameters-by-path": { stdout: "[]" },
    });
    const cap = capturePuts(sys);
    const o = output();
    const opened = /** @type {string[]} */ ([]);
    const code = await main(["connectors", "--stage", "dev", "--region", "eu-west-1"], {
      ...base,
      open: (u) => void opened.push(u),
      log: o.log,
      env: {},
      cwd: dir,
      run: cap.run,
      live: sys.live,
      answers: {
        "spotify.go": "y",
        "spotify.SPOTIFY_CLIENT_ID": SP_ID,
        "spotify.SPOTIFY_CLIENT_SECRET": SP_SECRET,
        "youtube.go": "y",
        "youtube.YOUTUBE_API_KEY": YT_KEY,
        "google.go": "n",
        "dropbox.go": "y",
        "dropbox.DROPBOX_APP_KEY": DB_KEY,
        "dropbox.DROPBOX_APP_SECRET": DB_SECRET,
      },
    });
    expect(code).toBe(0);
    expect(cap.puts.map((p) => p.Name)).toEqual([
      "/tdj/dev/SPOTIFY_CLIENT_ID",
      "/tdj/dev/SPOTIFY_CLIENT_SECRET",
      "/tdj/dev/YOUTUBE_API_KEY",
      "/tdj/dev/DROPBOX_APP_KEY",
      "/tdj/dev/DROPBOX_APP_SECRET",
    ]);
    expect(cap.puts.every((p) => p.Type === "SecureString")).toBe(true);
    const text = strip(o.text());
    for (const s of ALL_SECRETS) {
      expect(text).not.toContain(s);
      expect(sys.lines().join("\n")).not.toContain(s);
    }
    expect(text).toContain("https://dj.example/api/spotify/callback");
    expect(text).toContain("no redeploy needed");
    expect(opened).toContain("https://developer.spotify.com/dashboard");
    expect(text).toMatch(/Google[\s\S]*skipped/);
  });

  it("aws without credentials stops before any question, with the fix", async () => {
    const dir = checkout();
    const sys = fakeSys({ "aws sts get-caller-identity": { status: 255 } });
    const o = output();
    expect(
      await main(["connectors"], {
        ...base,
        log: o.log,
        env: {},
        cwd: dir,
        run: sys.run,
        live: sys.live,
        answers: {},
      }),
    ).toBe(1);
    expect(o.text()).toMatch(/aws configure sso/);
  });

  it("github: secrets through stdin to the fork, then a reminder to deploy", async () => {
    const dir = checkout();
    writeFileSync(join(dir, ".env.local"), "TDJ_DEPLOY_ROUTE=github\nTDJ_GITHUB_REPO=dj/TDJ\n");
    const sys = fakeSys({ "gh secret list": { stdout: "SPOTIFY_CLIENT_ID\nSPOTIFY_CLIENT_SECRET\n" } });
    const o = output();
    const code = await main(["connectors", "--only", "spotify,google"], {
      ...base,
      log: o.log,
      env: {},
      cwd: dir,
      run: sys.run,
      live: sys.live,
      answers: {
        "spotify.go": "n",
        "google.go": "y",
        "google.GOOGLE_CLIENT_ID": G_ID,
        "google.GOOGLE_CLIENT_SECRET": G_SECRET,
      },
    });
    expect(code).toBe(0);
    const sets = sys.calls.filter((c) => c.cmd === "gh" && c.args[0] === "secret" && c.args[1] === "set");
    expect(sets.map((c) => c.args.slice(2))).toEqual([
      ["GOOGLE_CLIENT_ID", "--repo", "dj/TDJ"],
      ["GOOGLE_CLIENT_SECRET", "--repo", "dj/TDJ"],
    ]);
    expect(sets.map((c) => c.input)).toEqual([G_ID, G_SECRET]);
    const text = strip(o.text());
    expect(text).toMatch(/Spotify ✓ set|Spotify\s+✓ set/);
    expect(text).toContain("kept as it is");
    expect(text).toContain("tdj deploy --github");
    expect(text).not.toContain(G_SECRET);
  });

  it("Pipedream Connect: the existing PIPEDREAM_* secret names on the fork; skipped (with the way) for Parameter Store", async () => {
    const dir = checkout();
    writeFileSync(join(dir, ".env.local"), "TDJ_DEPLOY_ROUTE=github\nTDJ_GITHUB_REPO=dj/TDJ\n");
    const sys = fakeSys({ "gh secret list": { stdout: "" } });
    const PD_SECRET = "fake-pd-secret-0123456789";
    const o = output();
    expect(
      await main(["connectors", "--only", "pipedream"], {
        ...base,
        log: o.log,
        env: {},
        cwd: dir,
        run: sys.run,
        live: sys.live,
        answers: {
          "pipedream.go": "y",
          "pipedream.PIPEDREAM_PROJECT_ID": "proj_fake123",
          "pipedream.PIPEDREAM_CLIENT_ID": "fake-pd-client-0123",
          "pipedream.PIPEDREAM_CLIENT_SECRET": PD_SECRET,
        },
      }),
    ).toBe(0);
    const sets = sys.calls.filter((c) => c.cmd === "gh" && c.args[1] === "set");
    expect(sets.map((c) => c.args[2])).toEqual([
      "PIPEDREAM_PROJECT_ID",
      "PIPEDREAM_CLIENT_ID",
      "PIPEDREAM_CLIENT_SECRET",
    ]);
    expect(o.text()).not.toContain(PD_SECRET);
    expect(sys.lines().join("\n")).not.toContain(PD_SECRET);

    const aws = fakeSys({
      "aws sts get-caller-identity": IDENTITY,
      "aws ssm get-parameters-by-path": { stdout: "[]" },
    });
    const cap = capturePuts(aws);
    const o2 = output();
    expect(
      await main(["connectors", "--only", "pipedream", "--target", "aws"], {
        ...base,
        log: o2.log,
        env: {},
        cwd: checkout(),
        run: cap.run,
        live: aws.live,
        answers: {},
      }),
    ).toBe(0);
    expect(cap.puts).toEqual([]);
    expect(o2.text()).toContain("--target github");
  });

  it("local: apps/web/.env.local, mode 0600, never the root .env.local", async () => {
    const dir = checkout();
    const o = output();
    const sys = fakeSys();
    const code = await main(["connectors", "--target", "local", "--only", "youtube"], {
      ...base,
      log: o.log,
      env: {},
      cwd: dir,
      run: sys.run,
      live: sys.live,
      answers: { "youtube.go": "y", "youtube.YOUTUBE_API_KEY": YT_KEY },
    });
    expect(code).toBe(0);
    expect(readLocal(dir)).toEqual({ YOUTUBE_API_KEY: YT_KEY });
    expect(statSync(join(dir, LOCAL_ENV)).mode & 0o077).toBe(0);
    expect(existsSync(join(dir, ".env.local"))).toBe(false);
    expect(o.text()).not.toContain(YT_KEY);
    expect(o.text()).toContain("Restart `pnpm dev`");
  });

  it("values from the environment need no question; a bad one stops with the reason", async () => {
    const dir = checkout();
    const o = output();
    const sys = fakeSys();
    expect(
      await main(["connectors", "--target", "local", "--only", "dropbox", "--yes"], {
        ...base,
        log: o.log,
        env: { DROPBOX_APP_KEY: DB_KEY, DROPBOX_APP_SECRET: DB_SECRET },
        cwd: dir,
        run: sys.run,
        live: sys.live,
      }),
    ).toBe(0);
    expect(readLocal(dir)).toMatchObject({ DROPBOX_APP_KEY: DB_KEY, DROPBOX_APP_SECRET: DB_SECRET });
    const bad = output();
    expect(
      await main(["connectors", "--target", "local", "--only", "youtube", "--yes"], {
        ...base,
        log: bad.log,
        env: { YOUTUBE_API_KEY: "not-a-key" },
        cwd: dir,
        run: sys.run,
        live: sys.live,
      }),
    ).toBe(1);
    expect(bad.text()).toMatch(/starts with AIza/);
    expect(bad.text()).not.toContain("not-a-key");
  });

  it("--yes without values skips every service and changes nothing", async () => {
    const dir = checkout();
    const o = output();
    const sys = fakeSys();
    expect(
      await main(["connectors", "--target", "local", "--yes"], {
        ...base,
        log: o.log,
        env: {},
        cwd: dir,
        run: sys.run,
        live: sys.live,
      }),
    ).toBe(0);
    expect(o.text()).toContain("Nothing changed");
    expect(existsSync(join(dir, LOCAL_ENV))).toBe(false);
  });

  it("--dry-run stores nothing", async () => {
    const dir = checkout();
    const sys = fakeSys({ "aws ssm get-parameters-by-path": { stdout: "[]" } });
    const cap = capturePuts(sys);
    const o = output();
    await main(["connectors", "--only", "youtube", "--dry-run"], {
      ...base,
      log: o.log,
      env: {},
      cwd: dir,
      run: cap.run,
      live: sys.live,
      answers: { "youtube.go": "y", "youtube.YOUTUBE_API_KEY": YT_KEY },
    });
    expect(cap.puts).toEqual([]);
    expect(o.text()).toContain("would store /tdj/production/YOUTUBE_API_KEY (SecureString, hidden)");
  });
});

describe("tdj connectors --check", () => {
  it("names what is set (never a value) and what the running app reports", async () => {
    const dir = checkout({ url: "https://dj.example" });
    const sys = fakeSys({
      "aws sts get-caller-identity": IDENTITY,
      "aws ssm get-parameters-by-path": {
        stdout: JSON.stringify([
          "/tdj/production/SPOTIFY_CLIENT_ID",
          "/tdj/production/SPOTIFY_CLIENT_SECRET",
          "/tdj/production/SETUP_CODE",
        ]),
      },
    });
    const o = output();
    /** @type {string[]} */
    const asked = [];
    const code = await main(["connectors", "--check"], {
      ...base,
      log: o.log,
      env: {},
      cwd: dir,
      run: sys.run,
      live: sys.live,
      fetch: /** @type {any} */ (
        async (/** @type {string} */ u) => {
          asked.push(u);
          return new Response(
            u.endsWith("/api/connect/accounts")
              ? JSON.stringify({ enabled: true, accounts: [] })
              : JSON.stringify({
                  providers: { spotify: true, google: false, dropbox: false },
                  keys: { youtube: false },
                }),
          );
        }
      ),
    });
    expect(code).toBe(1);
    expect(asked).toEqual(["https://dj.example/api/admin/public", "https://dj.example/api/connect/accounts"]);
    expect(strip(o.text())).toMatch(/Pipedream Connect .*: environment only .* · the app has it on/);
    const text = strip(o.text());
    expect(text).toMatch(/✓ Spotify: set · the app sees it/);
    expect(text).toMatch(
      /• YouTube Data API key: not set: tdj connectors --only youtube · the app does not see it yet/,
    );
    expect(text).not.toContain("SETUP_CODE");
    // reads names only: no --with-decryption anywhere
    expect(sys.lines().join("\n")).not.toContain("--with-decryption");
  });
});
