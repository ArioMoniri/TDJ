// `.env.local` at the root of the checkout: the settings `tdj init` chose (stage, region, route, the public
// Spotify Client ID). Never a secret: `tdj init` refuses to write one here and `tdj doctor` warns if it finds one.
// The file is git-ignored (.gitignore) and written with mode 0600 all the same.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ENV_FILE = ".env.local";

/** Keys `tdj init` writes and `tdj deploy` reads. */
export const KEYS = /** @type {const} */ ([
  "TDJ_STAGE",
  "AWS_REGION",
  "TDJ_DEPLOY_ROUTE",
  "TDJ_GITHUB_REPO",
  "SPOTIFY_CLIENT_ID",
  "TDJ_DOMAIN",
  "NEXT_PUBLIC_APP_URL",
]);

/** Keys `tdj deploy` hands to `sst deploy` (sst.config.ts forwards them to the function when set). */
export const DEPLOY_KEYS = ["SPOTIFY_CLIENT_ID", "TDJ_DOMAIN", "NEXT_PUBLIC_APP_URL"];

/** Names that hold secrets: they belong in the deployment's encrypted store (or GitHub secrets), not here. */
export const SECRET_NAME = /(SECRET|PASSWORD|PASSPHRASE|TOKEN|PRIVATE|_KEY$|API_KEY)/;

/** @param {string} text @returns {Record<string, string>} */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = /** @type {string} */ (m[2]);
    const q = v[0];
    if (q === '"' && v.endsWith(q) && v.length >= 2) {
      try {
        v = JSON.parse(v);
      } catch {
        v = v.slice(1, -1);
      }
    } else if (q === "'" && v.endsWith(q) && v.length >= 2) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[/** @type {string} */ (m[1])] = v;
  }
  return out;
}

/** @param {Record<string, string>} values */
export function serializeEnv(values) {
  const lines = [
    "# Written by `tdj init` (packages/cli). Settings only: secrets live in AWS Parameter Store or GitHub secrets.",
    "# Change a value here or run `tdj init` again.",
  ];
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === "") continue;
    lines.push(`${k}=${/[\s#"'$`\\]/.test(v) ? JSON.stringify(v) : v}`);
  }
  return `${lines.join("\n")}\n`;
}

/** @param {string} dir */
export function readEnvFile(dir) {
  const file = join(dir, ENV_FILE);
  if (!existsSync(file)) return /** @type {Record<string, string>} */ ({});
  try {
    return parseEnv(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Merges `values` into the file (other keys are kept). Refuses secret-looking names.
 * @param {string} dir @param {Record<string, string | undefined>} values
 */
export function writeEnvFile(dir, values) {
  for (const k of Object.keys(values)) {
    if (SECRET_NAME.test(k) && k !== "SPOTIFY_CLIENT_ID")
      throw new Error(`${k} is a secret: not written to ${ENV_FILE}.`);
  }
  const file = join(dir, ENV_FILE);
  const merged = { ...readEnvFile(dir) };
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === "") delete merged[k];
    else merged[k] = v;
  }
  writeFileSync(file, serializeEnv(merged), { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {}
  return file;
}

/** Secret-looking keys found in the file (doctor warns). @param {Record<string, string>} values */
export const secretsIn = (values) =>
  Object.keys(values).filter((k) => SECRET_NAME.test(k) && k !== "SPOTIFY_CLIENT_ID" && values[k]);
