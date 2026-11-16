import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS, HELP, main, parse } from "../src/cli.mjs";
import { awsCredentialFix, checks, diagnoseLog } from "../src/doctor.mjs";
import { parseEnv, readEnvFile, secretsIn, serializeEnv, writeEnvFile } from "../src/envfile.mjs";
import { guideText } from "../src/guide.mjs";
import { asciiOnly, banner, palette, useColor } from "../src/ui.mjs";
import * as v from "../src/validate.mjs";
import { checkout, fakeSys, IDENTITY, output, quiet } from "./helpers.mjs";

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
const strip = (/** @type {string} */ s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const SECRET = "c".repeat(32);
const CLIENT = "a".repeat(32);
const base = { open: quiet, isTTY: false };

/** Wraps a fake run so `put-parameter --cli-input-json file://…` records the file's body (it is deleted after). */
function capturePuts(/** @type {ReturnType<typeof fakeSys>} */ sys) {
  /** @type {{ path: string, body: any }[]} */
  const puts = [];
  /** @type {import("../src/sys.mjs").Run} */
  const run = (cmd, args, o) => {
    const i = args.indexOf("--cli-input-json");
    if (i >= 0) {
      const path = /** @type {string} */ (args[i + 1]).replace("file://", "");
      puts.push({ path, body: JSON.parse(readFileSync(path, "utf8")) });
      expect(statSync(path).mode & 0o077).toBe(0);
    }
    return sys.run(cmd, args, o);
  };
  return { run, puts };
}

describe("arguments", () => {
  it("bare `tdj` is the guided start; every command parses; unknown flags are refused", () => {
    expect(parse([]).command).toBe("start");
    for (const c of COMMANDS) expect(parse([c]).command).toBe(c);
    expect(parse(["deploy", "--stage", "dev", "--github"]).flags).toMatchObject({
      stage: "dev",
      github: true,
    });
    expect(parse(["destroy", "--confirm", "dev", "-y"]).flags).toMatchObject({ confirm: "dev", yes: true });
    expect(() => parse(["--spotify-secret", "x"])).toThrow();
    expect(() => parse(["deploy", "extra"])).toThrow(/Unexpected/);
  });

  it("an unknown flag or command explains itself and exits 2", async () => {
    const o = output();
    expect(await main(["--nope"], { log: o.log })).toBe(2);
    expect(o.text()).toMatch(/tdj --help/);
    const o2 = output();
    expect(await main(["deplyo"], { log: o2.log, env: {}, ...base })).toBe(2);
    expect(o2.text()).toMatch(/Unknown command "deplyo"[\s\S]*deploy/);
  });

  it("--help shows the banner and lists every command, never a secret flag", async () => {
    const o = output();
    expect(await main(["--help"], { log: o.log, env: {}, ...base })).toBe(0);
    for (const c of ["init", "deploy", "doctor", "status", "destroy", "guide", "apple"])
      expect(o.text()).toMatch(new RegExp(`\\n  ${c}\\b`));
    expect(o.text()).toContain("Developed by Ariorad Moniri");
    expect(HELP).not.toMatch(/--spotify-(client-)?secret/);
    expect(await main(["help"], { log: quiet, env: {}, ...base })).toBe(0);
  });
});

describe("banner and colour", () => {
  it("NO_COLOR, a pipe or --no-color turn colour off", () => {
    expect(useColor({ NO_COLOR: "1" }, true, true)).toBe(false);
    expect(useColor({}, false, true)).toBe(false);
    expect(useColor({}, true, false)).toBe(false);
    expect(useColor({ TERM: "dumb" }, true, true)).toBe(false);
    expect(useColor({}, true, true)).toBe(true);
  });

  it("bandoneon + T-DJ wordmark + credit, at most 70 columns, plain without colour", () => {
    const plain = banner(palette({ color: false }));
    expect(plain).not.toContain("\x1b[");
    expect(plain).toMatch(/╱╲/);
    expect(plain).toContain("●");
    expect(plain).toContain("Developed by Ariorad Moniri");
    for (const line of plain.split("\n")) expect([...line].length).toBeLessThanOrEqual(70);
    const coloured = banner(palette({ color: true }));
    expect(coloured).toContain("\x1b[");
    expect(strip(coloured)).toBe(plain);
    for (const line of strip(HELP).split("\n")) expect(line.length, line).toBeLessThanOrEqual(110);
  });

  it("falls back to pure ASCII on dumb or non-UTF-8 terminals", () => {
    expect(asciiOnly({ TERM: "dumb" })).toBe(true);
    expect(asciiOnly({ LANG: "C" })).toBe(true);
    expect(asciiOnly({ LANG: "en_US.UTF-8" })).toBe(false);
    expect(asciiOnly({})).toBe(false);
    const ascii = banner(palette({ color: false }), { ascii: true });
    expect(ascii).toMatch(/^[\x20-\x7e\n]+$/);
    expect(ascii).toContain("/\\/\\");
  });

  it("guide covers the three ways, cost, update, remove, and the licence", () => {
    const g = guideText(palette({ color: false }));
    expect(g).toMatch(
      /curl -fsSL https:\/\/raw\.githubusercontent\.com\/ArioMoniri\/TDJ\/.*install\.sh \| bash/,
    );
    for (const w of [
      "tdj init",
      "tdj deploy",
      "init --github",
      "Deploy to AWS",
      "Cost",
      "Update",
      "tdj destroy",
      "Noncommercial",
    ])
      expect(g).toContain(w);
    expect(g).toMatch(/no public T-DJ server/i);
  });
});

describe("validation and .env.local", () => {
  it("accepts real shapes and explains wrong ones", () => {
    expect(v.region("eu-central-1")).toBeNull();
    expect(v.region("Frankfurt")).toMatch(/us-east-1/);
    expect(v.stage("production")).toBeNull();
    expect(v.stage("Prod!")).toMatch(/lowercase/);
    expect(v.roleArn("arn:aws:iam::123456789012:role/tdj-github-deploy")).toBeNull();
    expect(v.roleArn("arn:aws:iam::12:role/x")).not.toBeNull();
    expect(v.spotifyClientId(CLIENT)).toBeNull();
    expect(v.optional(v.spotifyClientId)("")).toBeNull();
  });

  it("parses and writes the settings file, merging keys and refusing secrets", () => {
    expect(parseEnv('A=1\n# c\nexport B="two words"\nC=x # note\n\nbad line')).toEqual({
      A: "1",
      B: "two words",
      C: "x",
    });
    expect(parseEnv(serializeEnv({ X: 'a "q"', Y: "plain" }))).toEqual({ X: 'a "q"', Y: "plain" });
    const dir = mkdtempSync(join(tmpdir(), "tdj-env-"));
    writeFileSync(join(dir, ".env.local"), "KEEP=me\n");
    writeEnvFile(dir, { TDJ_STAGE: "dev", AWS_REGION: "eu-west-1" });
    expect(readEnvFile(dir)).toEqual({ KEEP: "me", TDJ_STAGE: "dev", AWS_REGION: "eu-west-1" });
    expect(statSync(join(dir, ".env.local")).mode & 0o077).toBe(0);
    expect(() => writeEnvFile(dir, { SPOTIFY_CLIENT_SECRET: "x" })).toThrow(/secret/);
    expect(secretsIn({ SPOTIFY_CLIENT_ID: "a", ANTHROPIC_API_KEY: "k", TDJ_STAGE: "p" })).toEqual([
      "ANTHROPIC_API_KEY",
    ]);
  });
});

describe("doctor", () => {
  it("names each missing piece with its fix (mocked child_process)", () => {
    const sys = fakeSys({
      "pnpm --version": { status: 127 },
      "corepack --version": { stdout: "0.31.0" },
      "aws sts": {
        status: 255,
        stderr: "Error when retrieving token from sso: Token has expired and refresh failed",
      },
      "gh --version": { status: 127 },
    });
    const ctx = /** @type {any} */ ({ run: sys.run, nodeVersion: "20.11.0" });
    const byId = /** @type {Record<string, import("../src/doctor.mjs").Check>} */ (
      Object.fromEntries(checks(ctx).map((r) => [r.id, r]))
    );
    expect(byId.node?.pass).toBe(false);
    expect(byId.node?.fix).toMatch(/Node 22/);
    expect(byId.pnpm?.fix).toMatch(/corepack enable/);
    expect(byId["aws-credentials"]?.fix).toMatch(/aws sso login/);
    expect(byId.gh?.pass).toBe(false);
    expect(byId["gh-auth"]?.pass).toBe(false);
    expect(sys.lines()).not.toContain("gh auth status");
  });

  it("explains AWS credential errors in plain words", () => {
    expect(awsCredentialFix("Unable to locate credentials")).toMatch(/aws configure sso/);
    expect(awsCredentialFix("InvalidClientTokenId")).toMatch(/access key/);
    expect(awsCredentialFix("The config profile (x) could not be found")).toMatch(/configure/);
  });

  it("reads known failures from a deploy log", () => {
    const found = diagnoseLog(
      "…\nerror: ExpiredToken: the security token included in the request is expired\n",
    );
    expect(found[0]?.fix).toMatch(/aws sso login/);
    expect(diagnoseLog("JavaScript heap out of memory")[0]?.fix).toMatch(/max-old-space-size/);
    expect(diagnoseLog("all good")).toEqual([]);
  });

  it("exits 0 when ready, 1 with ✗ lines when not, and spots secrets in .env.local", async () => {
    const dir = checkout();
    writeFileSync(join(dir, ".env.local"), "TDJ_STAGE=production\nANTHROPIC_API_KEY=sk-x\n");
    const ok = output();
    expect(
      await main(["doctor"], {
        ...fakeSys({ "aws sts": IDENTITY }),
        cwd: dir,
        log: ok.log,
        env: {},
        ...base,
        nodeVersion: "22.3.0",
      }),
    ).toBe(0);
    expect(ok.text()).toMatch(/holds secrets: ANTHROPIC_API_KEY/);
    expect(ok.text()).toMatch(/Ready to deploy/);
    const bad = output();
    const sys = fakeSys({ "aws sts": { status: 255, stderr: "Unable to locate credentials" } });
    expect(
      await main(["doctor"], { ...sys, cwd: dir, log: bad.log, env: {}, ...base, nodeVersion: "22.3.0" }),
    ).toBe(1);
    expect(bad.text()).toMatch(/✗ AWS credentials\n.*aws configure sso/);
  });
});

describe("init", () => {
  it("asks stage, region and Spotify; saves settings to .env.local and the secret encrypted, never in argv", async () => {
    const dir = checkout();
    const sys = fakeSys({ "aws sts": IDENTITY });
    const { run, puts } = capturePuts(sys);
    const o = output();
    const code = await main(["init"], {
      ...sys,
      run,
      cwd: dir,
      log: o.log,
      env: {},
      ...base,
      nodeVersion: "22.3.0",
      answers: { stage: "dev", region: "eu-west-1", spotifyId: CLIENT, spotifySecret: SECRET },
    });
    expect(code).toBe(0);
    expect(readEnvFile(dir)).toEqual({
      TDJ_STAGE: "dev",
      AWS_REGION: "eu-west-1",
      TDJ_DEPLOY_ROUTE: "aws",
      SPOTIFY_CLIENT_ID: CLIENT,
    });
    expect(readFileSync(join(dir, ".env.local"), "utf8")).not.toContain(SECRET);
    expect(puts.map((p) => p.body.Name)).toEqual([
      "/tdj/dev/SPOTIFY_CLIENT_ID",
      "/tdj/dev/SPOTIFY_CLIENT_SECRET",
    ]);
    expect(puts[1]?.body).toMatchObject({ Type: "SecureString", Value: SECRET });
    for (const p of puts) expect(existsSync(p.path)).toBe(false);
    for (const l of sys.lines()) expect(l).not.toContain(SECRET);
    expect(o.text()).not.toContain(SECRET);
    expect(o.text()).toMatch(/Next: tdj deploy/);
  });

  it("stops before asking anything when the computer is not ready", async () => {
    const sys = fakeSys({ "aws --version": { status: 127 } });
    const o = output();
    const code = await main(["init", "-y"], {
      ...sys,
      cwd: checkout(),
      log: o.log,
      env: {},
      ...base,
      nodeVersion: "22.3.0",
    });
    expect(code).toBe(1);
    expect(o.text()).toMatch(/✗ AWS CLI[\s\S]*What to do next[\s\S]*tdj init/);
  });

  it("--github: forks, creates the OIDC role scoped to the fork, stores it and Spotify via gh (stdin)", async () => {
    const dir = checkout();
    const sys = fakeSys({
      "gh api user": { stdout: "dj\n" },
      "gh repo view": { status: 1 },
      "aws sts": IDENTITY,
      "aws iam list-open-id-connect-providers": {
        stdout: "arn:aws:iam::1:oidc-provider/token.actions.githubusercontent.com",
      },
      "aws cloudformation describe-stacks": { stdout: "arn:aws:iam::123456789012:role/tdj-github-deploy\n" },
    });
    const code = await main(["init", "--github", "--region", "eu-central-1", "-y"], {
      ...sys,
      cwd: dir,
      log: quiet,
      env: { SPOTIFY_CLIENT_ID: CLIENT, SPOTIFY_CLIENT_SECRET: SECRET },
      ...base,
      nodeVersion: "22.3.0",
    });
    expect(code).toBe(0);
    const lines = sys.lines();
    expect(lines).toContain(
      "gh repo fork ArioMoniri/TDJ --clone=false --default-branch-only --fork-name TDJ",
    );
    expect(lines.find((l) => l.startsWith("aws cloudformation deploy"))).toMatch(
      /--template-file .*github-oidc-role\.yaml.*GitHubOrg=dj GitHubRepo=TDJ CreateProvider=false/,
    );
    expect(lines).toContain(
      "gh variable set AWS_DEPLOY_ROLE_ARN --repo dj/TDJ --body arn:aws:iam::123456789012:role/tdj-github-deploy",
    );
    expect(lines).toContain("gh variable set AWS_REGION --repo dj/TDJ --body eu-central-1");
    expect(sys.calls.find((c) => c.args.includes("SPOTIFY_CLIENT_SECRET"))?.input).toBe(SECRET);
    expect(lines.join("\n")).not.toContain(SECRET);
    expect(readEnvFile(dir)).toMatchObject({ TDJ_DEPLOY_ROUTE: "github", TDJ_GITHUB_REPO: "dj/TDJ" });
  });
});

describe("deploy (this computer)", () => {
  it("checks, installs, builds, deploys with settings from .env.local, then prints URL and setup code", async () => {
    const dir = checkout({ url: "https://abc.cloudfront.net" });
    writeFileSync(
      join(dir, ".env.local"),
      `TDJ_STAGE=dev\nAWS_REGION=eu-west-1\nSPOTIFY_CLIENT_ID=${CLIENT}\n`,
    );
    const sys = fakeSys({ "aws sts": IDENTITY, "aws ssm get-parameter": { status: 1 } });
    const { run, puts } = capturePuts(sys);
    const o = output();
    const code = await main(["deploy", "-y"], {
      ...sys,
      run,
      cwd: dir,
      log: o.log,
      env: {},
      ...base,
      nodeVersion: "22.3.0",
    });
    expect(code).toBe(0);
    const live = sys.calls.filter((c) => c.live).map((c) => `${c.cmd} ${c.args.join(" ")}`);
    expect(live).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm --filter @tdj/web^... --if-present run build",
      "npx sst deploy --stage dev",
    ]);
    expect(sys.calls.find((c) => c.cmd === "npx")?.env).toEqual({
      AWS_REGION: "eu-west-1",
      SPOTIFY_CLIENT_ID: CLIENT,
    });
    expect(puts[0]?.body.Name).toBe("/tdj/dev/SETUP_CODE");
    const text = o.text();
    expect(text).toContain("https://abc.cloudfront.net/admin");
    expect(text).toMatch(/setup code \(valid 24 h\): [0-9a-f]{32}/);
    expect(text).toContain("Parameter Store → /tdj/dev/SETUP_CODE");
    expect(text).toContain("tdj://spotify-callback");
  });

  it("reuses an unexpired setup code instead of issuing a new one", async () => {
    const dir = checkout({ url: "https://abc.cloudfront.net" });
    const now = Math.floor(Date.now() / 1000);
    const sys = fakeSys({
      "aws sts": IDENTITY,
      "aws ssm get-parameter --name /tdj/production/OWNER_PASSPHRASE_HASH": { status: 1 },
      "aws ssm get-parameter --name /tdj/production/SETUP_CODE": {
        stdout: `${"d".repeat(32)}.${now - 60}\n`,
      },
    });
    const o = output();
    expect(
      await main(["deploy", "-y"], { ...sys, cwd: dir, log: o.log, env: {}, ...base, nodeVersion: "22.3.0" }),
    ).toBe(0);
    expect(o.text()).toContain("d".repeat(32));
    expect(sys.lines().some((l) => l.includes("put-parameter"))).toBe(false);
  });

  it("secrets from the environment reach only the child's environment", async () => {
    const dir = checkout({ url: "https://x.cloudfront.net" });
    const sys = fakeSys({ "aws sts": IDENTITY, "aws ssm get-parameter": { status: 0 } });
    await main(["deploy", "-y"], {
      ...sys,
      cwd: dir,
      log: quiet,
      env: { SPOTIFY_CLIENT_ID: CLIENT, SPOTIFY_CLIENT_SECRET: SECRET },
      ...base,
      nodeVersion: "22.3.0",
    });
    expect(sys.calls.find((c) => c.cmd === "npx")?.env?.SPOTIFY_CLIENT_SECRET).toBe(SECRET);
    for (const l of sys.lines()) expect(l).not.toContain(SECRET);
  });

  it("fails in plain words with next steps: no credentials, then a failed sst deploy", async () => {
    const o = output();
    const sys = fakeSys({ "aws sts": { status: 255, stderr: "Unable to locate credentials" } });
    expect(
      await main(["deploy", "-y"], {
        ...sys,
        cwd: checkout(),
        log: o.log,
        env: {},
        ...base,
        nodeVersion: "22.3.0",
      }),
    ).toBe(1);
    expect(o.text()).toMatch(
      /Not ready to deploy yet: AWS credentials[\s\S]*→ No AWS credentials on this computer: run `aws configure sso`/,
    );
    expect(sys.calls.some((c) => c.live)).toBe(false);

    const o2 = output();
    const sys2 = fakeSys({ "aws sts": IDENTITY }, { "npx sst deploy": 1 });
    expect(
      await main(["deploy", "-y"], {
        ...sys2,
        cwd: checkout(),
        log: o2.log,
        env: {},
        ...base,
        nodeVersion: "22.3.0",
      }),
    ).toBe(1);
    expect(o2.text()).toMatch(/`npx sst deploy` failed \(exit 1\)[\s\S]*tdj doctor/);
  });

  it("--dry-run prints the plan and runs nothing that changes anything", async () => {
    const sys = fakeSys({ "aws sts": IDENTITY });
    const o = output();
    expect(
      await main(["deploy", "-y", "--dry-run"], {
        ...sys,
        cwd: checkout(),
        log: o.log,
        env: {},
        ...base,
        nodeVersion: "22.3.0",
      }),
    ).toBe(0);
    expect(o.text()).toContain("$ npx sst deploy --stage production");
    expect(sys.calls.some((c) => c.live || c.args.includes("put-parameter"))).toBe(false);
  });
});

describe("deploy --github", () => {
  it("runs the fork's workflow and points at the run summary for the URL and code", async () => {
    const sys = fakeSys({
      "gh api user": { stdout: "dj" },
      "gh variable list": { stdout: "AWS_DEPLOY_ROLE_ARN\nAWS_REGION\n" },
      "gh run list": {
        stdout: JSON.stringify([{ databaseId: 42, url: "https://github.com/dj/TDJ/actions/runs/42" }]),
      },
    });
    const o = output();
    expect(
      await main(["deploy", "--github", "-y"], { ...sys, cwd: checkout(), log: o.log, env: {}, ...base }),
    ).toBe(0);
    expect(sys.lines()).toContain("gh workflow run deploy-aws.yml --repo dj/TDJ -f stage=production");
    expect(sys.lines()).toContain("gh run watch 42 --repo dj/TDJ --exit-status");
    expect(o.text()).toMatch(/runs\/42[\s\S]*Owner setup/);
  });

  it("tells you to run init --github when the fork has no deploy role", async () => {
    const sys = fakeSys({ "gh api user": { stdout: "dj" } });
    const o = output();
    expect(
      await main(["deploy", "--github", "-y"], { ...sys, cwd: checkout(), log: o.log, env: {}, ...base }),
    ).toBe(1);
    expect(o.text()).toMatch(/no AWS deploy role yet[\s\S]*tdj init --github/);
  });
});

describe("status", () => {
  it("reports the URL, the version it answers with and whether /admin waits", async () => {
    const dir = checkout({ url: "https://abc.cloudfront.net" });
    const sys = fakeSys({
      "aws sts": IDENTITY,
      "aws ssm get-parameter --name /tdj/production/OWNER_PASSPHRASE_HASH": { status: 1 },
    });
    /** @type {string[]} */
    const asked = [];
    const fetch = /** @type {any} */ (
      async (/** @type {string} */ url) => {
        asked.push(url);
        return { ok: true, status: 200, json: async () => ({ version: "1.4.0", commit: "abcdef1234" }) };
      }
    );
    const o = output();
    expect(await main(["status"], { ...sys, cwd: dir, log: o.log, env: {}, ...base, fetch })).toBe(0);
    expect(asked).toEqual(["https://abc.cloudfront.net/api/version"]);
    expect(o.text()).toMatch(/version 1\.4\.0 \(abcdef1\)/);
    expect(o.text()).toMatch(/\/admin waits for its owner.*\/tdj\/production\/SETUP_CODE/);
    expect(o.text()).not.toMatch(/[0-9a-f]{32}/);
  });

  it("says plainly when nothing is deployed from this folder", async () => {
    const o = output();
    expect(await main(["status"], { ...fakeSys(), cwd: checkout(), log: o.log, env: {}, ...base })).toBe(1);
    expect(o.text()).toMatch(/Not deployed from this folder yet/);
  });
});

describe("destroy", () => {
  it("removes nothing unless the stage name is typed exactly", async () => {
    const sys = fakeSys({ "aws sts": IDENTITY });
    const o = output();
    expect(
      await main(["destroy"], {
        ...sys,
        cwd: checkout(),
        log: o.log,
        env: {},
        ...base,
        answers: { confirm: "prod" },
      }),
    ).toBe(1);
    expect(o.text()).toMatch(/Nothing removed/);
    expect(await main(["destroy", "-y"], { ...sys, cwd: checkout(), log: o.log, env: {}, ...base })).toBe(1);
    expect(o.text()).toMatch(/pass --confirm production/);
    expect(sys.calls.some((c) => c.live)).toBe(false);
  });

  it("typed name: sst remove for that stage only, protection lifted for that run, leftovers listed", async () => {
    const sys = fakeSys({ "aws sts": IDENTITY });
    const o = output();
    const dir = checkout();
    expect(
      await main(["destroy", "--stage", "dev"], {
        ...sys,
        cwd: dir,
        log: o.log,
        env: {},
        ...base,
        answers: { confirm: "dev" },
      }),
    ).toBe(0);
    const rm = sys.calls.find((c) => c.live);
    expect(`${rm?.cmd} ${rm?.args.join(" ")}`).toBe("npx sst remove --stage dev");
    expect(rm?.env).toMatchObject({ TDJ_ALLOW_REMOVE: "1" });
    expect(o.text()).toMatch(/delete-stack --stack-name tdj-github-oidc/);
  });
});

describe("guide", () => {
  it("prints without the banner, so it can be piped", async () => {
    const o = output();
    expect(await main(["guide"], { log: o.log, env: {}, ...base })).toBe(0);
    expect(o.text()).not.toMatch(/████/);
    expect(o.text()).toMatch(/A\. One line/);
  });
});

// a checkout found from a sub-folder
describe("config", () => {
  it("finds the checkout from a sub-folder", async () => {
    const dir = checkout({ url: "https://sub.cloudfront.net" });
    const sub = join(dir, "apps", "web");
    await mkdir(sub, { recursive: true });
    const o = output();
    await main(["status"], {
      ...fakeSys({ "aws sts": { status: 1 } }),
      cwd: sub,
      log: o.log,
      env: {},
      ...base,
      fetch: /** @type {any} */ (
        async () => ({ ok: true, status: 200, json: async () => ({ version: "1" }) })
      ),
    });
    expect(o.text()).toContain("https://sub.cloudfront.net");
  });
});
