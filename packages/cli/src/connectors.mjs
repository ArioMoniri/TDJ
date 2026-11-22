// `tdj connectors`: the music services of a self-hosted T-DJ, one at a time (docs/CONNECTORS.md). For each it
// says what it unlocks and its limits, opens the provider's console, prints the exact redirect addresses and scopes
// to paste there, then asks for the credentials (the public ID visibly, the secret typed hidden) and stores them
// where the deployment reads them:
//   aws    — AWS Parameter Store, /tdj/<stage>/<KEY> (SecureString), the store /admin writes and the app reads
//            within a minute, no redeploy (apps/web/src/lib/server/config.ts);
//   github — the fork's GitHub secrets (through stdin), forwarded by "Deploy to AWS" (sst.config.ts) on its next run;
//   local  — apps/web/.env.local (git-ignored, mode 0600) for `pnpm dev`.
// Nothing secret is printed, put on a command line or written to the checkout's root .env.local.
// `tdj connectors --check` shows what is set, and what the running app reports, without reading a value.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CliError, resolveConfig } from "./config.mjs";
import { awsIdentity, putSecure, readUrl, step } from "./deploy.mjs";
import { parseEnv } from "./envfile.mjs";
import * as v from "./validate.mjs";

export const DOCS = "docs/CONNECTORS.md";
export const LOCAL_ENV = "apps/web/.env.local";

/**
 * @typedef {{ key: string, label: string, secret: boolean, validate: (v: string) => string | null }} Field
 * @typedef {{ id: string, name: string, unlocks: string, limits: string, console: string,
 *   steps: (url: string) => string[], fields: Field[], provider?: "spotify" | "google" | "dropbox",
 *   docs: string, envOnly?: boolean }} Connector
 */

/** @type {Connector[]} */
export const CONNECTORS = [
  {
    id: "spotify",
    name: "Spotify",
    unlocks: "“Log in with Spotify” for every DJ: playlists, full tracks in Listen, ISRC matching.",
    limits:
      "Development Mode: 5 listed users. Extended quota: organisations with 250,000+ monthly users only.",
    console: "https://developer.spotify.com/dashboard",
    steps: (url) => [
      "Create app → APIs used: Web API and Web Playback SDK.",
      "Redirect URIs (add each, exactly):",
      `    ${url}/api/spotify/callback`,
      `    ${url}/callback`,
      "    tdj://spotify-callback            (the Mac / iPad / iPhone apps)",
      "iOS bundle ID (only for the apps): the T-DJ apps' bundle ID, or your own build's (docs/CONNECTORS.md).",
      "User Management: add the e-mail of each DJ who logs in (5 at most in Development Mode).",
      "Settings → Basic information: copy the Client ID and the Client secret.",
    ],
    fields: [
      { key: "SPOTIFY_CLIENT_ID", label: "Spotify Client ID", secret: false, validate: v.spotifyClientId },
      {
        key: "SPOTIFY_CLIENT_SECRET",
        label: "Spotify Client secret",
        secret: true,
        validate: v.spotifySecret,
      },
    ],
    provider: "spotify",
    docs: "spotify",
  },
  {
    id: "youtube",
    name: "YouTube Data API key",
    unlocks: "“Find a video” for every DJ without a Google sign-in (playlists still use the Google sign-in).",
    limits: "10,000 units a day per Google Cloud project; one search costs 100 (about 100 searches a day).",
    console: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    steps: () => [
      "Enable “YouTube Data API v3” in your Google Cloud project.",
      "APIs & Services → Credentials → Create credentials → API key.",
      "Edit the key → API restrictions → Restrict key → YouTube Data API v3 only.",
      "Application restrictions: None (the server calls Google from changing AWS addresses).",
    ],
    fields: [{ key: "YOUTUBE_API_KEY", label: "YouTube API key", secret: true, validate: v.youtubeKey }],
    docs: "youtube-data-api-v3",
  },
  {
    id: "google",
    name: "Google (Drive and YouTube playlists)",
    unlocks: "“Connect with Google”: export files to Drive (drive.file) and YouTube playlists (youtube).",
    limits:
      "Unverified apps: 100 test users and 7-day sign-ins; the youtube scope needs Google's verification.",
    console: "https://console.cloud.google.com/auth/clients",
    steps: (url) => [
      "Enable “Google Drive API” and “YouTube Data API v3”.",
      "Google Auth Platform → Branding (app name, support e-mail, your domain) → Audience: External; add test users.",
      "Data access → add scopes: openid, email, profile, …/auth/drive.file, …/auth/youtube.",
      "Clients → Create client → Web application → Authorised redirect URIs:",
      `    ${url}/api/google/callback`,
      "Copy the Client ID and the Client secret.",
    ],
    fields: [
      { key: "GOOGLE_CLIENT_ID", label: "Google Client ID", secret: false, validate: v.googleClientId },
      { key: "GOOGLE_CLIENT_SECRET", label: "Google Client secret", secret: true, validate: v.googleSecret },
    ],
    provider: "google",
    docs: "google-drive-oauth",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    unlocks: "“Connect Dropbox”: export files land in /Apps/<your app>/<set name>/ with a shared link.",
    limits: "Development status: 500 linked users; Dropbox asks for a production review at 50.",
    console: "https://www.dropbox.com/developers/apps",
    steps: (url) => [
      "Create app → Scoped access → App folder → name it (files land in /Apps/<name>/).",
      "Permissions: files.content.write, sharing.write (and the default account_info.read) → Submit.",
      "Settings → OAuth 2 → Redirect URIs:",
      `    ${url}/api/dropbox/callback`,
      "Copy the App key and the App secret.",
    ],
    fields: [
      { key: "DROPBOX_APP_KEY", label: "Dropbox App key", secret: false, validate: v.dropboxAppKey },
      { key: "DROPBOX_APP_SECRET", label: "Dropbox App secret", secret: true, validate: v.dropboxSecret },
    ],
    provider: "dropbox",
    docs: "dropbox",
  },
  {
    id: "pipedream",
    name: "Pipedream Connect (one-tap sign-in, optional)",
    unlocks:
      "“Connect Spotify (one tap)”, YouTube, Dropbox and Google Drive through Pipedream's own OAuth apps: no developer app per DJ.",
    limits:
      "Free plan: development only (10 test users). Production: Startup plan, $99/month yearly or $150 monthly, 100 users included, then $2 per user a month.",
    console: "https://pipedream.com/projects",
    steps: () => [
      "Create a project (Projects → New project); its ID starts with proj_.",
      "Workspace settings → API → New OAuth client: copy the Client ID and the Client secret.",
      "Connect → Configuration: add your app's address under Allowed origins.",
      "Production end users need a paid plan; until then keep PIPEDREAM_ENVIRONMENT=development.",
    ],
    fields: [
      {
        key: "PIPEDREAM_PROJECT_ID",
        label: "Pipedream project ID",
        secret: false,
        validate: v.pipedreamProject,
      },
      {
        key: "PIPEDREAM_CLIENT_ID",
        label: "Pipedream OAuth client ID",
        secret: false,
        validate: v.pipedreamClient,
      },
      {
        key: "PIPEDREAM_CLIENT_SECRET",
        label: "Pipedream OAuth client secret",
        secret: true,
        validate: v.pipedreamClient,
      },
    ],
    docs: "seamless-connectors-with-pipedream-connect",
    // the server reads these from its environment only (lib/server/connect.ts), not from Parameter Store
    envOnly: true,
  },
];

/** Every key a connector may set, in order. */
export const CONNECTOR_KEYS = CONNECTORS.flatMap((c) => c.fields.map((f) => f.key));

/** @param {string | undefined} raw @returns {Connector[]} */
export function pick(raw) {
  if (!raw) return CONNECTORS;
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unknown = ids.filter((id) => !CONNECTORS.some((c) => c.id === id));
  if (unknown.length)
    throw new CliError(`Unknown connector: ${unknown.join(", ")}.`, [
      `Choose from: ${CONNECTORS.map((c) => c.id).join(", ")}.`,
    ]);
  return CONNECTORS.filter((c) => ids.includes(c.id));
}

/** @param {Record<string, any>} flags @param {import("./config.mjs").Config} cfg @returns {"aws" | "github" | "local"} */
export function targetOf(flags, cfg) {
  const t = flags.target ?? (flags.github ? "github" : cfg.route);
  if (t !== "aws" && t !== "github" && t !== "local")
    throw new CliError(`--target must be aws, github or local, not "${t}".`);
  return t;
}

/* ---------- where the values go ---------- */

/** @param {string} dir */
const localFile = (dir) => join(dir, LOCAL_ENV);
/** @param {string} dir */
export function readLocal(dir) {
  const f = localFile(dir);
  if (!existsSync(f)) return /** @type {Record<string, string>} */ ({});
  try {
    return parseEnv(readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}
/** Merges values into apps/web/.env.local (mode 0600; `.env.local` is git-ignored). @param {string} dir @param {Record<string, string>} values */
export function writeLocal(dir, values) {
  const f = localFile(dir);
  const merged = { ...readLocal(dir), ...values };
  const lines = [
    "# Written by `tdj connectors` for `pnpm dev`. Git-ignored; never commit it. docs/CONNECTORS.md",
    ...Object.entries(merged)
      .filter(([, x]) => x !== "")
      .map(([k, x]) => `${k}=${/[\s#"'$`\\]/.test(x) ? JSON.stringify(x) : x}`),
  ];
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, `${lines.join("\n")}\n`, { mode: 0o600 });
  try {
    chmodSync(f, 0o600);
  } catch {}
  return f;
}

/**
 * The connector keys already set at the target: names only, never a value.
 * @param {import("./deploy.mjs").Ctx} ctx @param {"aws" | "github" | "local"} target
 * @param {import("./config.mjs").Config} cfg @returns {Set<string> | null} null when it cannot be read here
 */
export function existing(ctx, target, cfg) {
  if (target === "local")
    return new Set(Object.keys(readLocal(cfg.dir)).filter((k) => CONNECTOR_KEYS.includes(k)));
  if (target === "github") {
    if (!cfg.repo) return null;
    const r = ctx.run("gh", ["secret", "list", "--repo", cfg.repo, "--json", "name", "--jq", ".[].name"], {
      allowFail: true,
    });
    return r.status === 0 ? new Set(r.stdout.split(/\s+/).filter((k) => CONNECTOR_KEYS.includes(k))) : null;
  }
  const r = ctx.run(
    "aws",
    [
      "ssm",
      "get-parameters-by-path",
      "--path",
      `/tdj/${cfg.stage}/`,
      "--query",
      "Parameters[].Name",
      "--output",
      "json",
      "--region",
      cfg.region,
    ],
    { allowFail: true },
  );
  if (r.status !== 0) return null;
  try {
    const names = /** @type {string[]} */ (JSON.parse(r.stdout || "[]"));
    return new Set(names.map((n) => n.split("/").pop() ?? "").filter((k) => CONNECTOR_KEYS.includes(k)));
  } catch {
    return null;
  }
}

/**
 * Stores one value. The secret travels through stdin (gh) or a 0600 file that is deleted at once (aws), never
 * argv or a log line.
 * @param {import("./deploy.mjs").Ctx} ctx @param {"aws" | "github" | "local"} target
 * @param {import("./config.mjs").Config} cfg @param {string} key @param {string} value
 */
export async function store(ctx, target, cfg, key, value) {
  const { c, log } = ctx;
  if (target === "aws") {
    const name = `/tdj/${cfg.stage}/${key}`;
    if (ctx.dryRun) return log(c.dim(`would store ${name} (SecureString, hidden)`));
    putSecure(ctx, name, value, cfg.region);
    return log(`${c.green("✓")} ${name} ${c.dim("stored encrypted in Parameter Store (value hidden)")}`);
  }
  if (target === "github") {
    await step(ctx, "gh", ["secret", "set", key, "--repo", cfg.repo], { input: value }, [
      "Check `gh auth status` and that you can write to the fork's secrets.",
    ]);
    if (!ctx.dryRun)
      log(`${c.green("✓")} ${key} ${c.dim(`set on ${cfg.repo} (GitHub secret, value hidden)`)}`);
    return;
  }
  if (ctx.dryRun) return log(c.dim(`would write ${key} to ${LOCAL_ENV} (hidden)`));
  writeLocal(cfg.dir, { [key]: value });
  log(`${c.green("✓")} ${key} ${c.dim(`written to ${LOCAL_ENV} (git-ignored, mode 0600; value hidden)`)}`);
}

/* ---------- the command ---------- */

/** @param {import("./deploy.mjs").Ctx} ctx @param {Record<string, any>} flags */
export async function connectors(ctx, flags) {
  const { c, log } = ctx;
  const cfg = resolveConfig(ctx, flags);
  const target = targetOf(flags, cfg);
  const list = pick(flags.only);
  const url = (cfg.checkout && readUrl(cfg.checkout)) || cfg.file.NEXT_PUBLIC_APP_URL || "";
  const app = (url || (target === "local" ? "http://127.0.0.1:3000" : "https://<your app URL>")).replace(
    /\/$/,
    "",
  );
  if (target === "github" && !cfg.repo)
    throw new CliError("No fork recorded yet.", [
      "Run `tdj init --github` first, or pass --repo OWNER/NAME.",
    ]);
  if (target === "aws" && !ctx.dryRun && !awsIdentity(ctx))
    throw new CliError("AWS credentials are needed to store connector keys in Parameter Store.", [
      "Run `aws configure sso` (or `aws sso login`), then `tdj connectors` again.",
      "Or use `--target github` for a fork, or `--target local` for `pnpm dev`.",
    ]);
  const where =
    target === "aws"
      ? `Parameter Store /tdj/${cfg.stage}/* (${cfg.region})`
      : target === "github"
        ? `GitHub secrets of ${cfg.repo}`
        : LOCAL_ENV;
  const have = existing(ctx, target, cfg);

  if (flags.check) return check(ctx, { list, have, where, url, target });

  log(c.bold(`Music services for your T-DJ → ${where}`));
  log(c.dim("Each one is optional, and DJs can still bring their own keys in Settings → Connections."));
  log(c.dim("Secrets are typed hidden and never printed. Ctrl-C stops; nothing half-written is kept."));
  let changed = 0;
  for (const [i, k] of list.entries()) {
    log();
    log(
      `${c.bold(`${i + 1}/${list.length} ${k.name}`)}${have?.has(k.fields[0]?.key ?? "") ? c.green("  ✓ set") : ""}`,
    );
    log(`   ${k.unlocks}`);
    log(c.dim(`   Limits: ${k.limits}`));
    if (k.envOnly && target === "aws") {
      log(
        c.dim(
          `   The server reads these from its environment only: use \`tdj connectors --only ${k.id} --target github\` (a fork) or --target local.`,
        ),
      );
      continue;
    }
    const fromEnv = k.fields.every((f) => ctx.env[f.key]);
    const isSet = k.fields.every((f) => have?.has(f.key));
    if (!fromEnv) {
      const want = await ctx.confirm(
        `${k.id}.go`,
        isSet ? `Replace the ${k.name} credentials?` : `Set up ${k.name} now?`,
        false,
      );
      if (!want) {
        log(c.dim(`   skipped${isSet ? " (kept as it is)" : ""}`));
        continue;
      }
      log(`   Console: ${c.bold(k.console)}`);
      for (const s of k.steps(app)) log(`   ${s.startsWith("    ") ? c.cream(s) : `• ${s}`}`);
      ctx.open(k.console);
    }
    /** @type {Record<string, string>} */
    const values = {};
    for (const f of k.fields) {
      const env = ctx.env[f.key];
      if (env) {
        const bad = f.validate(env);
        if (bad) throw new CliError(`${f.key} in the environment: ${bad}`);
        values[f.key] = env;
        log(c.dim(`   ${f.key}: from the environment`));
        continue;
      }
      const value = await ctx.ask(`${k.id}.${f.key}`, `${f.label}${f.secret ? " (typed hidden)" : ""}`, {
        secret: f.secret,
        validate: f.validate,
      });
      const bad = f.validate(value);
      if (bad) throw new CliError(bad);
      values[f.key] = value;
    }
    for (const [key, value] of Object.entries(values)) await store(ctx, target, cfg, key, value);
    changed++;
  }
  log();
  if (!changed) {
    log(`Nothing changed. Later: ${c.bold("tdj connectors")} · guide: ${DOCS}`);
    return 0;
  }
  log(c.bold(c.green("Saved.")));
  if (target === "aws")
    log(
      "   The app reads Parameter Store within a minute: no redeploy needed. /admin shows them as configured.",
    );
  else if (target === "github")
    log(`   Run ${c.bold("tdj deploy --github")} (or Actions → Deploy to AWS) so the function gets them.`);
  else log("   Restart `pnpm dev` so Next.js reads apps/web/.env.local.");
  log(`   Check: ${c.bold("tdj connectors --check")}${url ? ` · ${url}/settings → Connections` : ""}`);
  return 0;
}

/**
 * What is set at the target (names only) and what the running app reports at /api/admin/public.
 * @param {import("./deploy.mjs").Ctx} ctx
 * @param {{ list: Connector[], have: Set<string> | null, where: string, url: string, target: string }} o
 */
async function check(ctx, { list, have, where, url, target }) {
  const { c, log } = ctx;
  log(c.bold(`Connectors · ${where}`));
  /** @type {{ providers?: Record<string, boolean>, keys?: { youtube?: boolean } } | null} */
  let pub = null;
  if (url) {
    try {
      const f = ctx.fetch ?? fetch;
      const r = await f(`${url}/api/admin/public`, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) pub = await r.json();
    } catch {}
  }
  /** whether the app answers /api/connect/accounts with `enabled` (Pipedream Connect is on) */
  let managed = /** @type {boolean | null} */ (null);
  if (url && list.some((k) => k.envOnly)) {
    try {
      const f = ctx.fetch ?? fetch;
      const r = await f(`${url}/api/connect/accounts`, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) managed = !!(/** @type {{ enabled?: boolean }} */ (await r.json()).enabled);
    } catch {}
  }
  let missing = 0;
  for (const k of list) {
    if (k.envOnly && target === "aws") {
      const on =
        managed === null ? "" : managed ? c.green(" · the app has it on") : c.dim(" · off in the app");
      log(`${c.dim("•")} ${k.name}: environment only (GitHub secrets or the server's shell)${on}`);
      continue;
    }
    const set = have ? k.fields.every((f) => have.has(f.key)) : null;
    const live = k.envOnly
      ? managed
      : !pub
        ? null
        : k.provider
          ? !!pub.providers?.[k.provider]
          : !!pub.keys?.youtube;
    if (set === false) missing++;
    const mark = set === null ? c.yellow("?") : set ? c.green("✓") : c.yellow("•");
    const state =
      set === null
        ? "cannot read the store from here"
        : set
          ? "set"
          : `not set: tdj connectors --only ${k.id}`;
    const app =
      live === null ? "" : live ? c.green(" · the app sees it") : c.yellow(" · the app does not see it yet");
    log(`${mark} ${k.name}: ${state}${app}`);
  }
  log(c.dim(`Keyless, nothing to set: Deezer, MusicBrainz, LRCLIB. Every step: ${DOCS}`));
  if (url && !pub) log(c.dim(`(no answer from ${url}/api/admin/public)`));
  return missing ? 1 : 0;
}
