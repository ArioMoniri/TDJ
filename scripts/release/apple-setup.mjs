#!/usr/bin/env node
// Idempotent Apple setup through the App Store Connect API (Linux or macOS, no Xcode):
//   1. register the bundle ID (one universal App ID for iPad + Mac) and its capabilities,
//   2. create or reuse the signing certificates from CSRs generated here (private keys never leave this
//      machine/store): Apple Distribution, Mac Installer Distribution, Developer ID Application,
//   3. create or refresh the App Store provisioning profiles (iPad, Mac),
//   4. keep the .p12 files + passwords + profiles in a store the release builds read:
//        --store dir:<folder>        e.g. ~/drive/tdj-signing on the rented Mac (default there)
//        --store ssm:/tdj/apple      AWS SSM SecureStrings (GitHub OIDC role, apple-setup.yml)
//   5. print what only a person can do (App record, agreements, MusicKit), with links.
// Re-running changes nothing that is still valid. Usage: node scripts/release/apple-setup.mjs --help
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AscError, createClient, loadKey } from "./asc.mjs";

export const DEFAULTS = { bundleId: "com.ariomoniri.tdj", teamId: "FF68N39FU5", appName: "TDJ" };
const DAY = 86_400_000;
const RENEW_DAYS = 30;

export const CERTS = {
  distribution: {
    types: ["DISTRIBUTION"],
    prefix: "APPLE_DISTRIBUTION_CERT",
    label: "Apple Distribution",
    revocable: true,
  },
  installer: {
    types: ["MAC_INSTALLER_DISTRIBUTION"],
    prefix: "MAC_INSTALLER_CERT",
    label: "Mac Installer Distribution",
    revocable: true,
  },
  // Revoking a Developer ID certificate breaks every installed DMG copy: never automatic.
  devid: {
    types: ["DEVELOPER_ID_APPLICATION_G2", "DEVELOPER_ID_APPLICATION"],
    prefix: "DEVELOPER_ID_APPLICATION_CERT",
    label: "Developer ID Application",
    revocable: false,
  },
};

export const PROFILES = {
  ios: {
    name: "TDJ iPad App Store",
    type: "IOS_APP_STORE",
    key: "IOS_APPSTORE_PROFILE",
    ext: "mobileprovision",
  },
  mac: {
    name: "TDJ Mac App Store",
    type: "MAC_APP_STORE",
    key: "MAC_APPSTORE_PROFILE",
    ext: "provisionprofile",
  },
};

export const LINKS = {
  newApp: "https://appstoreconnect.apple.com/apps",
  agreements: "https://appstoreconnect.apple.com/business",
  apiKeys: "https://appstoreconnect.apple.com/access/integrations/api",
  identifiers: "https://developer.apple.com/account/resources/identifiers/list",
  certificates: "https://developer.apple.com/account/resources/certificates/list",
  newCertificate: "https://developer.apple.com/account/resources/certificates/add",
  keys: "https://developer.apple.com/account/resources/authkeys/add",
  spotify: "https://developer.spotify.com/dashboard",
};

// ---------------------------------------------------------------- stores

/** A folder of owner-only files (the rented Mac keeps it under ~/drive between sessions). */
export function dirStore(dir) {
  const path = resolve(dir.replace(/^~(?=$|\/)/, homedir()));
  return {
    kind: `dir:${path}`,
    path,
    async get(name) {
      const p = join(path, name);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    },
    async put(name, value) {
      mkdirSync(path, { recursive: true, mode: 0o700 });
      chmodSync(path, 0o700);
      writeFileSync(join(path, name), value, { mode: 0o600 });
    },
    async del(name) {
      rmSync(join(path, name), { force: true });
    },
  };
}

/** AWS SSM Parameter Store SecureStrings under `prefix` (values never on a command line). */
export function ssmStore(prefix, run = defaultRun) {
  const name = (n) => `${prefix.replace(/\/$/, "")}/${n}`;
  return {
    kind: `ssm:${prefix}`,
    async get(n) {
      const r = run(
        "aws",
        [
          "ssm",
          "get-parameter",
          "--name",
          name(n),
          "--with-decryption",
          "--query",
          "Parameter.Value",
          "--output",
          "text",
        ],
        { allowFail: true },
      );
      return r.status === 0 ? r.stdout.replace(/\n$/, "") : null;
    },
    async put(n, value) {
      const dir = mkdtempSync(join(tmpdir(), "tdj-ssm-"));
      const file = join(dir, "in.json");
      // Intelligent-Tiering: Standard (free) when ≤ 4 KB, Advanced (8 KB, $0.05/month) for a larger .p12
      writeFileSync(
        file,
        JSON.stringify({
          Name: name(n),
          Value: value,
          Type: "SecureString",
          Overwrite: true,
          Tier: "Intelligent-Tiering",
        }),
        { mode: 0o600 },
      );
      try {
        run("aws", ["ssm", "put-parameter", "--cli-input-json", `file://${file}`]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    async del(n) {
      run("aws", ["ssm", "delete-parameter", "--name", name(n)], { allowFail: true });
    },
  };
}

export function storeFrom(spec, run = defaultRun) {
  if (spec.startsWith("dir:")) return dirStore(spec.slice(4));
  if (spec.startsWith("ssm:")) return ssmStore(spec.slice(4), run);
  throw new Error(`--store must be dir:<folder> or ssm:<prefix>, got ${spec}`);
}

// ---------------------------------------------------------------- local crypto (openssl)

export function defaultRun(cmd, args, { input, allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd} not found: ${r.error.message}`);
  if (r.status !== 0 && !allowFail)
    throw new Error(`${cmd} ${args[0]} failed: ${r.stderr.trim().split("\n").pop()}`);
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** RSA 2048 key + CSR, in a private temp folder. Returns PEM strings. */
export function makeCsr(label, run = defaultRun) {
  const dir = mkdtempSync(join(tmpdir(), "tdj-csr-"));
  try {
    const key = join(dir, "k.pem");
    const csr = join(dir, "c.csr");
    run("openssl", [
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      csr,
      "-subj",
      `/CN=TDJ ${label}/O=TDJ/C=TR`,
    ]);
    return { keyPem: readFileSync(key, "utf8"), csrPem: readFileSync(csr, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const derToPem = (b64) =>
  `-----BEGIN CERTIFICATE-----\n${b64
    .replace(/\s+/g, "")
    .match(/.{1,64}/g)
    .join("\n")}\n-----END CERTIFICATE-----\n`;

/** Password-protected .p12 (base64) that `security import` reads on every macOS version. */
export function makeP12(keyPem, certPem, password, run = defaultRun) {
  const dir = mkdtempSync(join(tmpdir(), "tdj-p12-"));
  try {
    writeFileSync(join(dir, "k.pem"), keyPem, { mode: 0o600 });
    writeFileSync(join(dir, "c.pem"), certPem);
    const base = [
      "pkcs12",
      "-export",
      "-inkey",
      join(dir, "k.pem"),
      "-in",
      join(dir, "c.pem"),
      "-out",
      join(dir, "o.p12"),
      "-passout",
      "env:TDJ_P12_PW",
    ];
    process.env.TDJ_P12_PW = password;
    // OpenSSL 3 needs -legacy for macOS's importer; LibreSSL (macOS) does not know the flag
    const legacy = run("openssl", [...base.slice(0, 2), "-legacy", ...base.slice(2)], { allowFail: true });
    if (legacy.status !== 0) run("openssl", base);
    return readFileSync(join(dir, "o.p12")).toString("base64");
  } finally {
    delete process.env.TDJ_P12_PW;
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- steps

const enc = encodeURIComponent;
const daysLeft = (iso, now) => (iso ? (Date.parse(iso) - now) / DAY : Number.POSITIVE_INFINITY);

export async function ensureBundleId(api, identifier, name, log) {
  const found = (await api.all(`/v1/bundleIds?filter[identifier]=${enc(identifier)}&limit=200`)).find(
    (b) => b.attributes?.identifier === identifier,
  );
  if (found) {
    log(`✓ bundle ID ${identifier} (${found.attributes.platform}) already registered`);
    return found;
  }
  for (const platform of ["UNIVERSAL", "IOS"]) {
    try {
      const r = await api.post("/v1/bundleIds", {
        data: { type: "bundleIds", attributes: { identifier, name, platform } },
      });
      log(`✓ bundle ID ${identifier} registered (${platform})`);
      return r.data;
    } catch (e) {
      if (platform === "IOS" || !(e instanceof AscError) || e.status !== 409) throw e;
    }
  }
  throw new Error("unreachable");
}

export async function ensureCapabilities(api, bundle, capabilities, log) {
  if (!capabilities.length) return;
  const have = new Set(
    (await api.all(`/v1/bundleIds/${bundle.id}/bundleIdCapabilities`)).map(
      (c) => c.attributes?.capabilityType,
    ),
  );
  for (const capabilityType of capabilities) {
    if (have.has(capabilityType)) {
      log(`✓ capability ${capabilityType}`);
      continue;
    }
    await api.post("/v1/bundleIdCapabilities", {
      data: {
        type: "bundleIdCapabilities",
        attributes: { capabilityType },
        relationships: { bundleId: { data: { type: "bundleIds", id: bundle.id } } },
      },
    });
    log(`✓ capability ${capabilityType} enabled`);
  }
}

export async function findApp(api, bundleId) {
  const apps = await api.all(`/v1/apps?filter[bundleId]=${enc(bundleId)}`);
  return apps.find((a) => a.attributes?.bundleId === bundleId) ?? null;
}

const isDevIdRefusal = (e) =>
  e instanceof AscError &&
  (e.status === 403 ||
    /account holder|not allowed|forbidden|permission/i.test(e.message) ||
    e.codes.some((c) => c.startsWith("FORBIDDEN")));
const isLimit = (e) =>
  e instanceof AscError && e.status === 409 && /already have|maximum|limit|pending/i.test(e.message);
const isBadType = (e) =>
  e instanceof AscError && e.status === 409 && /certificateType|INVALID/i.test(e.message);

/**
 * Returns { status: "reused" | "created" | "imported" | "manual", id?, csrPem? }.
 * `opts.devidCer` (base64 DER or PEM of a certificate the owner downloaded) finishes the manual Developer ID path.
 */
export async function ensureCert(api, store, kind, opts) {
  const c = CERTS[kind];
  const { log, run = defaultRun, now = Date.now(), revokeOldest = false } = opts;
  const storedId = await store.get(`${c.prefix}_ID`);
  if (storedId && (await store.get(`${c.prefix}_P12`))) {
    try {
      const cur = await api.get(`/v1/certificates/${storedId}`);
      const left = daysLeft(cur?.data?.attributes?.expirationDate, now);
      if (left > RENEW_DAYS) {
        log(`✓ ${c.label}: reusing ${storedId} (${Math.floor(left)} days left)`);
        return { status: "reused", id: storedId };
      }
      log(`… ${c.label}: ${storedId} expires in ${Math.floor(left)} days, renewing`);
    } catch (e) {
      if (!(e instanceof AscError && e.status === 404)) throw e;
      log(`… ${c.label}: ${storedId} no longer exists at Apple, creating a new one`);
    }
  }

  const save = async (id, certB64, keyPem, how) => {
    const password = randomBytes(24).toString("base64url");
    const p12 = makeP12(keyPem, derToPem(certB64), password, run);
    await store.put(`${c.prefix}_P12`, p12);
    await store.put(`${c.prefix}_PASSWORD`, password);
    await store.put(`${c.prefix}_ID`, id);
    await store.put(`${c.prefix}_CER`, certB64);
    await store.del(`${c.prefix}_PENDING_KEY`);
    log(`✓ ${c.label}: ${how} ${id}, .p12 + password saved to ${store.kind}`);
    return { status: how, id };
  };

  if (kind === "devid" && opts.devidCer) {
    const keyPem = await store.get(`${c.prefix}_PENDING_KEY`);
    if (!keyPem)
      throw new Error(
        "No pending Developer ID key in the store: run without --devid-cer first to get a CSR.",
      );
    const b64 = opts.devidCer.includes("BEGIN CERTIFICATE")
      ? opts.devidCer.replace(/-----[^-]+-----|\s+/g, "")
      : opts.devidCer.replace(/\s+/g, "");
    const all = await api.all(`/v1/certificates?limit=200`);
    const match = all.find((x) => x.attributes?.certificateContent?.replace(/\s+/g, "") === b64);
    return save(match?.id ?? "imported", b64, keyPem, "imported");
  }

  // Developer ID (Account Holder only): keep the pending key + CSR of an earlier run, so the certificate the owner
  // makes from the CSR printed then still matches the key here (a fresh CSR per run would orphan it)
  const pendingKey = kind === "devid" ? await store.get(`${c.prefix}_PENDING_KEY`) : null;
  const pendingCsr = pendingKey ? await store.get(`${c.prefix}_CSR`) : null;
  const { keyPem, csrPem } = pendingKey && pendingCsr ? { keyPem: pendingKey, csrPem: pendingCsr } : makeCsr(c.label, run);
  let lastErr = null;
  for (const certificateType of c.types) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await api.post("/v1/certificates", {
          data: { type: "certificates", attributes: { certificateType, csrContent: csrPem } },
        });
        return await save(r.data.id, r.data.attributes.certificateContent, keyPem, "created");
      } catch (e) {
        lastErr = e;
        if (kind === "devid" && isDevIdRefusal(e)) {
          await store.put(`${c.prefix}_PENDING_KEY`, keyPem);
          await store.put(`${c.prefix}_CSR`, csrPem);
          log(`! ${c.label}: Apple lets only the Account Holder create this certificate (${e.message}).`);
          return { status: "manual", csrPem };
        }
        if (isLimit(e) && c.revocable && revokeOldest && attempt === 0) {
          const same = (
            await api.all(`/v1/certificates?filter[certificateType]=${certificateType}&limit=200`)
          ).sort((a, b) => Date.parse(a.attributes.expirationDate) - Date.parse(b.attributes.expirationDate));
          const oldest = same[0];
          if (!oldest) throw e;
          log(
            `… ${c.label}: limit reached, revoking the oldest (${oldest.id}, expires ${oldest.attributes.expirationDate})`,
          );
          await api.del(`/v1/certificates/${oldest.id}`);
          continue;
        }
        if (isLimit(e)) {
          throw new Error(
            `${c.label}: Apple's limit for this certificate type is reached. Revoke an unused one at ${LINKS.certificates}` +
              (c.revocable
                ? " or re-run with --revoke-oldest."
                : " (never revoke a Developer ID certificate that signed shipped DMGs)."),
          );
        }
        if (isBadType(e) && certificateType !== c.types.at(-1)) break; // try the next type name
        throw e;
      }
    }
  }
  throw lastErr ?? new Error(`${c.label}: could not create`);
}

export async function ensureProfile(api, store, which, bundle, certId, { log, now = Date.now() }) {
  const p = PROFILES[which];
  const existing = (
    await api.all(`/v1/profiles?filter[name]=${enc(p.name)}&include=bundleId,certificates&limit=200`)
  ).filter((x) => x.attributes?.name === p.name);
  for (const prof of existing) {
    const certs = prof.relationships?.certificates?.data?.map((d) => d.id) ?? [];
    const bundleOk = !prof.relationships?.bundleId?.data || prof.relationships.bundleId.data.id === bundle.id;
    const ok =
      prof.attributes.profileState === "ACTIVE" &&
      prof.attributes.profileType === p.type &&
      daysLeft(prof.attributes.expirationDate, now) > RENEW_DAYS &&
      certs.includes(certId) &&
      bundleOk;
    if (ok && prof.attributes.profileContent) {
      await store.put(p.key, prof.attributes.profileContent);
      log(`✓ profile "${p.name}": reusing ${prof.id}`);
      return { status: "reused", id: prof.id };
    }
    log(`… profile "${p.name}" ${prof.id} is stale (state, expiry or certificate), replacing it`);
    await api.del(`/v1/profiles/${prof.id}`);
  }
  const r = await api.post("/v1/profiles", {
    data: {
      type: "profiles",
      attributes: { name: p.name, profileType: p.type },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bundle.id } },
        certificates: { data: [{ type: "certificates", id: certId }] },
      },
    },
  });
  await store.put(p.key, r.data.attributes.profileContent);
  log(`✓ profile "${p.name}": created ${r.data.id}`);
  return { status: "created", id: r.data.id };
}

/** Everything only a person can do, as clickable steps. */
export function manualSteps({ app, devid, bundleId, teamId }) {
  const out = [];
  if (!app) {
    out.push(
      `Create the App Store Connect app record (the API cannot): ${LINKS.newApp} → "+" → New App → platforms iOS and macOS, ` +
        `name "T-DJ", primary language English (U.S.), bundle ID ${bundleId}, SKU "tdj", Full Access. ` +
        "Then add the Turkish localisation (App Information → language menu).",
    );
  }
  if (devid?.status === "manual") {
    out.push(
      `Developer ID certificate (Account Holder only): open ${LINKS.newCertificate} → Developer ID Application (G2 Sub-CA) → ` +
        "upload the CSR printed above (saved as DEVELOPER_ID_APPLICATION_CERT_CSR in the store) → Download → run again with " +
        "--devid-cer <downloaded .cer>. The private key never left this machine/store.",
    );
  }
  out.push(
    `Accept the latest agreements if App Store Connect shows a banner: ${LINKS.agreements} (the Free Apps agreement needs nothing else).`,
    `MusicKit (only when Apple Music playback ships): ${LINKS.identifiers} → ${bundleId} → App Services → MusicKit; ` +
      `a MusicKit key: ${LINKS.keys} (Media IDs are created there too). Team ID ${teamId}.`,
    `Spotify (for the apps): ${LINKS.spotify} → your app → Settings → Redirect URIs → add tdj://spotify-callback; ` +
      `iOS bundle ID ${bundleId}.`,
    "App Privacy and the newer age-rating questions: answers in apps/desktop/fastlane/app_privacy.md (about 3 minutes).",
  );
  return out;
}

export async function setup(opts) {
  const { api, store, log } = opts;
  const bundle = await ensureBundleId(api, opts.bundleId, opts.appName, log);
  await ensureCapabilities(api, bundle, opts.capabilities ?? [], log);
  const results = { bundle: bundle.id };
  for (const kind of opts.certs ?? ["distribution", "installer", "devid"]) {
    try {
      results[kind] = await ensureCert(api, store, kind, opts);
    } catch (e) {
      results[kind] = { status: "failed", error: e.message };
      log(`✗ ${CERTS[kind].label}: ${e.message}`);
    }
  }
  const dist = results.distribution;
  if (dist?.id) {
    for (const which of opts.profiles ?? ["ios", "mac"]) {
      try {
        results[which] = await ensureProfile(api, store, which, bundle, dist.id, opts);
      } catch (e) {
        results[which] = { status: "failed", error: e.message };
        log(`✗ profile ${PROFILES[which].name}: ${e.message}`);
      }
    }
  }
  const app = await findApp(api, opts.bundleId).catch(() => null);
  results.app = app ? app.id : null;
  if (app) log(`✓ App Store Connect app record ${app.id} ("${app.attributes?.name}")`);
  if (results.devid?.csrPem)
    log(`\nDeveloper ID CSR (not secret; upload it at ${LINKS.newCertificate}):\n${results.devid.csrPem}`);
  results.manual = manualSteps({ app, devid: results.devid, bundleId: opts.bundleId, teamId: opts.teamId });
  return results;
}

/** Writes what a build needs from the store into `out`: .p12 files, password files, profiles. */
export async function exportSigning(store, out) {
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const written = [];
  for (const c of Object.values(CERTS)) {
    const p12 = await store.get(`${c.prefix}_P12`);
    const pw = await store.get(`${c.prefix}_PASSWORD`);
    if (!p12 || !pw) continue;
    writeFileSync(join(out, `${c.prefix}.p12`), Buffer.from(p12, "base64"), { mode: 0o600 });
    writeFileSync(join(out, `${c.prefix}.password`), pw, { mode: 0o600 });
    written.push(`${c.prefix}.p12`);
  }
  for (const p of Object.values(PROFILES)) {
    const b64 = await store.get(p.key);
    if (!b64) continue;
    writeFileSync(join(out, `${p.key}.${p.ext}`), Buffer.from(b64, "base64"), { mode: 0o600 });
    written.push(`${p.key}.${p.ext}`);
  }
  return written;
}

const HELP = `Usage: node scripts/release/apple-setup.mjs [setup|export] [options]

  setup (default)   register the bundle ID, create/reuse certificates and profiles, save them in the store
  export --out DIR  write the stored .p12 files, passwords and profiles to DIR for a build

Options
  --store SPEC        dir:<folder> (default dir:~/drive/tdj-signing) or ssm:/tdj/apple
  --bundle-id ID      default ${DEFAULTS.bundleId} (env TDJ_APP_BUNDLE_ID)
  --team-id ID        default ${DEFAULTS.teamId} (env APPLE_TEAM_ID)
  --capability TYPE   enable an App ID capability (repeatable), e.g. ASSOCIATED_DOMAINS
  --only LIST         certs,profiles subset: distribution,installer,devid,ios,mac
  --revoke-oldest     when Apple's certificate limit is reached, revoke the oldest Apple Distribution /
                      Mac Installer certificate (never a Developer ID one)
  --devid-cer FILE    finish the manual Developer ID path with the .cer downloaded from Apple
  --summary FILE      also write a Markdown summary (default: $GITHUB_STEP_SUMMARY when set)

Key: APP_STORE_CONNECT_KEY_ID + APP_STORE_CONNECT_ISSUER_ID, and APP_STORE_CONNECT_PRIVATE_KEY (text) or the file
~/.appstoreconnect/private_keys/AuthKey_TDJ.p8 (or AuthKey_<KEY_ID>.p8).`;

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      store: { type: "string", default: env.TDJ_SIGNING_STORE ?? "dir:~/drive/tdj-signing" },
      "bundle-id": { type: "string", default: env.TDJ_APP_BUNDLE_ID || DEFAULTS.bundleId },
      "team-id": { type: "string", default: env.APPLE_TEAM_ID || DEFAULTS.teamId },
      capability: { type: "string", multiple: true, default: [] },
      only: { type: "string" },
      "revoke-oldest": { type: "boolean", default: false },
      "devid-cer": { type: "string" },
      out: { type: "string" },
      summary: { type: "string", default: env.GITHUB_STEP_SUMMARY },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const store = storeFrom(values.store);
  const cmd = positionals[0] ?? "setup";
  if (cmd === "export") {
    if (!values.out) throw new Error("export needs --out DIR");
    const files = await exportSigning(store, values.out);
    console.log(`exported ${files.length} files to ${values.out}: ${files.join(", ")}`);
    return 0;
  }
  const key = loadKey(env);
  const api = createClient(key);
  const only = values.only?.split(",").map((s) => s.trim());
  const devidCer = values["devid-cer"]
    ? existsSync(values["devid-cer"])
      ? readFileSync(values["devid-cer"]).toString(
          readFileSync(values["devid-cer"]).includes("BEGIN CERTIFICATE") ? "utf8" : "base64",
        )
      : values["devid-cer"]
    : undefined;
  const lines = [];
  const log = (s) => {
    console.log(s);
    lines.push(s);
  };
  const results = await setup({
    api,
    store,
    log,
    bundleId: values["bundle-id"],
    teamId: values["team-id"],
    appName: DEFAULTS.appName,
    capabilities: values.capability,
    certs: only ? only.filter((x) => x in CERTS) : undefined,
    profiles: only ? only.filter((x) => x in PROFILES) : undefined,
    revokeOldest: values["revoke-oldest"],
    devidCer,
  });
  console.log("\nStill to do by hand:");
  results.manual.forEach((m, i) => console.log(`${i + 1}. ${m}`));
  if (values.summary) {
    const md = [
      "## Apple setup",
      "",
      ...lines.filter((l) => !l.includes("BEGIN CERTIFICATE REQUEST")).map((l) => `- ${l.split("\n")[0]}`),
      "",
      "### Still to do by hand",
      ...results.manual.map((m, i) => `${i + 1}. ${m}`),
      "",
    ].join("\n");
    appendFileSync(values.summary, md);
  }
  const failed = Object.values(results).filter((r) => r && typeof r === "object" && r.status === "failed");
  return failed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    });
}
