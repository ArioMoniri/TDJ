import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP, main, parse } from "../src/cli.mjs";
import { banner, palette, useColor } from "../src/ui.mjs";
import * as v from "../src/validate.mjs";

/** A fake system: records every command, answers from a table. */
function fakeSys(/** @type {Record<string, {status?: number, stdout?: string}>} */ table = {}) {
  /** @type {{cmd: string, args: string[], input?: string, env?: Record<string, string | undefined>}[]} */
  const calls = [];
  /** @type {import("../src/sys.mjs").Run} */
  const run = (cmd, args, o = {}) => {
    calls.push({ cmd, args, input: o.input, env: o.env });
    const key = Object.keys(table).find((k) => `${cmd} ${args.join(" ")}`.startsWith(k));
    const r = key ? table[key] : { status: 0, stdout: "" };
    const res = { status: r?.status ?? 0, stdout: r?.stdout ?? "", stderr: "" };
    if (res.status !== 0 && !o.allowFail) throw new Error(`${cmd} failed`);
    return res;
  };
  /** @type {import("../src/sys.mjs").Live} */
  const live = async (cmd, args, o = {}) => {
    calls.push({ cmd, args, env: o.env });
    return 0;
  };
  return { run, live, calls };
}
const quiet = () => {};

describe("arguments and output", () => {
  it("defaults to deploy, rejects unknown flags", () => {
    expect(parse([]).command).toBe("deploy");
    expect(parse(["apple", "--repo", "a/b"]).flags.repo).toBe("a/b");
    expect(() => parse(["--spotify-secret", "x"])).toThrow();
  });

  it("--help lists every command and never suggests secrets as flags", async () => {
    const out = /** @type {string[]} */ ([]);
    expect(await main(["--help"], { log: (s = "") => out.push(s) })).toBe(0);
    expect(out.join("\n")).toMatch(/deploy[\s\S]*doctor[\s\S]*apple/);
    expect(HELP).not.toMatch(/--spotify-(client-)?secret/);
  });

  it("banner: bandoneon + wordmark, no escape codes without colour", () => {
    expect(useColor({ NO_COLOR: "1" }, true, true)).toBe(false);
    expect(useColor({}, false, true)).toBe(false);
    expect(useColor({}, true, true)).toBe(true);
    const plain = banner(palette({ color: false }));
    expect(plain).not.toContain("\x1b[");
    expect(plain).toMatch(/╱╲/);
    expect(plain.split("\n").length).toBeGreaterThan(8);
    expect(banner(palette({ color: true }))).toContain("\x1b[");
  });
});

describe("validation", () => {
  it("accepts real shapes and explains wrong ones", () => {
    expect(v.region("eu-central-1")).toBeNull();
    expect(v.region("Frankfurt")).toMatch(/us-east-1/);
    expect(v.roleArn("arn:aws:iam::123456789012:role/tdj-github-deploy")).toBeNull();
    expect(v.roleArn("arn:aws:iam::12:role/x")).not.toBeNull();
    expect(v.ascIssuer("69a6de70-03db-47e3-e053-5b8c7c11a4d1")).toBeNull();
    expect(v.ascKeyId("ABCDE12345")).toBeNull();
    expect(v.ascKeyId("abc")).not.toBeNull();
    expect(v.spotifyClientId("0123456789abcdef0123456789abcdef")).toBeNull();
    expect(v.optional(v.appleAppId)("")).toBeNull();
  });
});

describe("deploy --route aws", () => {
  it("deploys the checkout with secrets only in the child's environment, then issues the setup code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tdj-co-"));
    writeFileSync(join(dir, "sst.config.ts"), "");
    mkdirSync(join(dir, ".sst"));
    writeFileSync(join(dir, ".sst", "outputs.json"), JSON.stringify({ url: "https://abc.cloudfront.net" }));
    const sys = fakeSys({
      "aws sts get-caller-identity": { stdout: JSON.stringify({ Account: "123456789012", Arn: "x" }) },
      "aws ssm get-parameter": { status: 1 },
    });
    const out = /** @type {string[]} */ ([]);
    const code = await main(["deploy", "--route", "aws", "--region", "eu-west-1", "-y"], {
      ...sys,
      cwd: dir,
      log: (s = "") => out.push(s),
      env: { SPOTIFY_CLIENT_ID: "a".repeat(32), SPOTIFY_CLIENT_SECRET: "b".repeat(32) },
      open: quiet,
      isTTY: false,
    });
    expect(code).toBe(0);
    const sst = sys.calls.find((c) => c.cmd === "npx");
    expect(sst?.args).toEqual(["sst", "deploy", "--stage", "production"]);
    expect(sst?.env).toMatchObject({ AWS_REGION: "eu-west-1", SPOTIFY_CLIENT_SECRET: "b".repeat(32) });
    for (const c of sys.calls) expect(c.args.join(" ")).not.toContain("b".repeat(32));
    const put = sys.calls.find((c) => c.args.includes("put-parameter"));
    expect(put?.args.join(" ")).toMatch(/--cli-input-json file:\/\//);
    const text = out.join("\n");
    expect(text).toContain("https://abc.cloudfront.net/admin");
    expect(text).toMatch(/setup code \(24 h\): [0-9a-f]{32}/);
    expect(text).toContain("tdj://spotify-callback");
  });

  it("explains how to sign in when there are no AWS credentials", async () => {
    const sys = fakeSys({ "aws sts": { status: 255 } });
    await expect(
      main(["deploy", "--route", "aws", "-y"], { ...sys, log: quiet, env: {}, open: quiet, isTTY: false }),
    ).rejects.toThrow(/aws configure sso/);
  });
});

describe("deploy --route github", () => {
  it("forks, creates the role, sets variables, runs the workflow; Spotify goes in through stdin", async () => {
    const sys = fakeSys({
      "gh api user": { stdout: "dj\n" },
      "gh repo view": { status: 1 },
      "aws sts get-caller-identity": { stdout: JSON.stringify({ Account: "123456789012" }) },
      "aws iam list-open-id-connect-providers": {
        stdout: "arn:aws:iam::1:oidc-provider/token.actions.githubusercontent.com",
      },
      "aws cloudformation describe-stacks": { stdout: "arn:aws:iam::123456789012:role/tdj-github-deploy\n" },
      "gh run list": {
        stdout: JSON.stringify([{ databaseId: 42, url: "https://github.com/dj/TDJ/actions/runs/42" }]),
      },
    });
    const code = await main(["--route", "github", "-y"], {
      ...sys,
      cwd: mkdtempSync(join(tmpdir(), "tdj-")),
      log: quiet,
      env: { SPOTIFY_CLIENT_ID: "a".repeat(32), SPOTIFY_CLIENT_SECRET: "c".repeat(32) },
      open: quiet,
      isTTY: false,
    });
    expect(code).toBe(0);
    const line = (/** @type {{cmd: string, args: string[]}} */ c) => `${c.cmd} ${c.args.join(" ")}`;
    const lines = sys.calls.map(line);
    expect(lines).toContain(
      "gh repo fork ArioMoniri/TDJ --clone=false --default-branch-only --fork-name TDJ",
    );
    expect(lines.find((l) => l.startsWith("aws cloudformation deploy"))).toMatch(
      /GitHubOrg=dj GitHubRepo=TDJ CreateProvider=false/,
    );
    expect(lines).toContain(
      "gh variable set AWS_DEPLOY_ROLE_ARN --repo dj/TDJ --body arn:aws:iam::123456789012:role/tdj-github-deploy",
    );
    expect(lines).toContain("gh workflow run deploy-aws.yml --repo dj/TDJ -f stage=production");
    expect(lines).toContain("gh run watch 42 --repo dj/TDJ --exit-status");
    const secret = sys.calls.find((c) => c.args.includes("SPOTIFY_CLIENT_SECRET"));
    expect(secret?.input).toBe("c".repeat(32));
    expect(lines.join("\n")).not.toContain("c".repeat(32));
  });

  it("--dry-run prints the plan and runs nothing that changes anything", async () => {
    const sys = fakeSys({
      "gh api user": { stdout: "dj" },
      "gh repo view": { status: 1 },
      "aws sts": { status: 1 },
    });
    const out = /** @type {string[]} */ ([]);
    await main(["--route", "github", "-y", "--dry-run", "--role-arn", "arn:aws:iam::123456789012:role/r"], {
      ...sys,
      log: (s = "") => out.push(s),
      env: {},
      open: quiet,
      isTTY: false,
    });
    expect(out.join("\n")).toContain("$ gh workflow run deploy-aws.yml");
    expect(sys.calls.some((c) => c.args[0] === "workflow" || c.args[0] === "secret")).toBe(false);
  });
});

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
    expect(vars).toEqual([
      "TDJ_APP_BUNDLE_ID=com.ariomoniri.tdj",
      "APPLE_APP_ID=6740000000",
    ]);
    expect(sys.calls.some((c) => c.args.join(" ").includes("/environments/"))).toBe(false);
  });

  it("refuses a file that is not a .p8 key", async () => {
    const f = join(mkdtempSync(join(tmpdir(), "tdj-")), "x.p8");
    writeFileSync(f, "hello");
    const sys = fakeSys();
    await expect(
      main(
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
        {
          ...sys,
          log: quiet,
          env: {},
          open: quiet,
          isTTY: false,
        },
      ),
    ).rejects.toThrow(/not an App Store Connect/);
  });
});
