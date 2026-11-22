// node --test scripts/release/test   (mocked App Store Connect API; real openssl for CSR/.p12)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  dirStore,
  ensureBundleId,
  ensureCapabilities,
  ensureCert,
  ensureProfile,
  exportSigning,
  ICLOUD_CAPABILITY,
  icloudContainer,
  manualSteps,
  profileHasICloud,
  setup,
} from "../apple-setup.mjs";
import { AscError, createClient, loadKey, makeToken } from "../asc.mjs";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const quiet = () => {};

// Apple's certificate for our CSR, issued by a throwaway CA (base64 DER, like certificateContent).
const CA = mkdtempSync(join(tmpdir(), "tdj-ca-"));
spawnSync("openssl", [
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-keyout",
  join(CA, "k"),
  "-out",
  join(CA, "c"),
  "-subj",
  "/CN=Test CA",
  "-days",
  "2",
]);
function appleSigns(csrPem) {
  const dir = mkdtempSync(join(tmpdir(), "tdj-t-"));
  writeFileSync(join(dir, "r.csr"), csrPem);
  const r = spawnSync("openssl", [
    "x509",
    "-req",
    "-in",
    join(dir, "r.csr"),
    "-CA",
    join(CA, "c"),
    "-CAkey",
    join(CA, "k"),
    "-set_serial",
    "7",
    "-days",
    "2",
    "-outform",
    "DER",
    "-out",
    join(dir, "c.der"),
  ]);
  assert.equal(r.status, 0, String(r.stderr));
  return readFileSync(join(dir, "c.der")).toString("base64");
}

/** Tiny router: handlers keyed "METHOD /path-prefix"; records every call. */
function mockApi(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://api.appstoreconnect.apple.com", "");
    const key = `${init.method} ${path}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.authorization });
    const hit = Object.keys(routes)
      .filter((k) => key.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!hit)
      return new Response(JSON.stringify({ errors: [{ title: "not mocked", detail: key }] }), {
        status: 404,
      });
    const r = await routes[hit](init.body ? JSON.parse(init.body) : null, path);
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
  return {
    api: createClient({ keyId: "KEY1234567", issuerId: "iss-uuid", privateKey: PEM, fetchImpl }),
    calls,
  };
}

test("JWT is ES256, 20 minutes max, audience appstoreconnect-v1, verifiable", () => {
  const t = makeToken({ keyId: "ABC", issuerId: "ISS", privateKey: PEM, now: 1000, ttl: 99999 });
  const [h, p, s] = t.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url"));
  const payload = JSON.parse(Buffer.from(p, "base64url"));
  assert.deepEqual(header, { alg: "ES256", kid: "ABC", typ: "JWT" });
  assert.deepEqual(payload, { iss: "ISS", iat: 1000, exp: 2200, aud: "appstoreconnect-v1" });
  const ok = verify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    { key: createPublicKey(PEM), dsaEncoding: "ieee-p1363" },
    Buffer.from(s, "base64url"),
  );
  assert.equal(ok, true);
});

test("loadKey: env text first, then ~/.appstoreconnect/private_keys/AuthKey_TDJ.p8", () => {
  assert.equal(
    loadKey({
      APP_STORE_CONNECT_KEY_ID: "K",
      APP_STORE_CONNECT_ISSUER_ID: "I",
      APP_STORE_CONNECT_PRIVATE_KEY: PEM,
    }).path,
    null,
  );
  const home = mkdtempSync(join(tmpdir(), "tdj-home-"));
  mkdirSync(join(home, ".appstoreconnect", "private_keys"), { recursive: true });
  writeFileSync(join(home, ".appstoreconnect", "private_keys", "AuthKey_TDJ.p8"), PEM);
  const k = loadKey({ APP_STORE_CONNECT_KEY_ID: "K", APP_STORE_CONNECT_ISSUER_ID: "I" }, home);
  assert.match(k.path, /AuthKey_TDJ\.p8$/);
  assert.throws(() => loadKey({}, home), /APP_STORE_CONNECT_KEY_ID/);
});

test("client: follows pagination and surfaces Apple's error text", async () => {
  const { api } = mockApi({
    "GET /v1/bundleIds?limit=1": () => ({
      body: {
        data: [{ id: "a" }],
        links: { next: "https://api.appstoreconnect.apple.com/v1/bundleIds?cursor=2" },
      },
    }),
    "GET /v1/bundleIds?cursor=2": () => ({ body: { data: [{ id: "b" }] } }),
    "GET /v1/apps": () => ({
      status: 403,
      body: { errors: [{ code: "FORBIDDEN_ERROR", title: "Forbidden", detail: "no" }] },
    }),
  });
  assert.deepEqual(
    (await api.all("/v1/bundleIds?limit=1")).map((x) => x.id),
    ["a", "b"],
  );
  await assert.rejects(
    api.get("/v1/apps"),
    (e) => e instanceof AscError && e.status === 403 && e.codes[0] === "FORBIDDEN_ERROR",
  );
});

test("bundle ID: reuses an exact match, registers UNIVERSAL otherwise, falls back to IOS", async () => {
  const one = mockApi({
    "GET /v1/bundleIds": () => ({
      body: {
        data: [
          { id: "x", attributes: { identifier: "com.ariomoniri.tdj.extra" } },
          { id: "B", attributes: { identifier: "com.ariomoniri.tdj", platform: "IOS" } },
        ],
      },
    }),
  });
  assert.equal((await ensureBundleId(one.api, "com.ariomoniri.tdj", "TDJ", quiet)).id, "B");
  assert.equal(one.calls.filter((c) => c.key.startsWith("POST")).length, 0);

  const platforms = [];
  const two = mockApi({
    "GET /v1/bundleIds": () => ({ body: { data: [] } }),
    "POST /v1/bundleIds": (b) => {
      platforms.push(b.data.attributes.platform);
      return b.data.attributes.platform === "UNIVERSAL"
        ? { status: 409, body: { errors: [{ code: "ENTITY_ERROR.ATTRIBUTE.INVALID", detail: "platform" }] } }
        : { status: 201, body: { data: { id: "NEW", attributes: b.data.attributes } } };
    },
  });
  assert.equal((await ensureBundleId(two.api, "com.ariomoniri.tdj", "TDJ", quiet)).id, "NEW");
  assert.deepEqual(platforms, ["UNIVERSAL", "IOS"]);
});

test("certificate: created from a local CSR, saved as .p12 + password, reused on the next run", async () => {
  let posted = 0;
  const far = new Date(Date.now() + 300 * 86400000).toISOString();
  const { api, calls } = mockApi({
    "POST /v1/certificates": (b) => {
      posted++;
      assert.match(b.data.attributes.csrContent, /BEGIN CERTIFICATE REQUEST/);
      assert.equal(b.data.attributes.certificateType, "DISTRIBUTION");
      return {
        status: 201,
        body: {
          data: {
            id: "C1",
            attributes: { certificateContent: appleSigns(b.data.attributes.csrContent), expirationDate: far },
          },
        },
      };
    },
    "GET /v1/certificates/C1": () => ({ body: { data: { id: "C1", attributes: { expirationDate: far } } } }),
  });
  const dir = mkdtempSync(join(tmpdir(), "tdj-store-"));
  const store = dirStore(join(dir, "signing"));
  assert.equal((await ensureCert(api, store, "distribution", { log: quiet })).status, "created");
  assert.equal(statSync(join(dir, "signing")).mode & 0o077, 0, "store folder is owner-only");
  assert.equal(statSync(join(dir, "signing", "APPLE_DISTRIBUTION_CERT_P12")).mode & 0o077, 0);
  assert.ok((await store.get("APPLE_DISTRIBUTION_CERT_PASSWORD")).length >= 24);
  assert.equal((await ensureCert(api, store, "distribution", { log: quiet })).status, "reused");
  assert.equal(posted, 1);
  assert.ok(calls.every((c) => c.auth.startsWith("Bearer ")));
  const out = join(dir, "export");
  const files = await exportSigning(store, out);
  assert.deepEqual(files, ["APPLE_DISTRIBUTION_CERT.p12"]);
});

test("Developer ID refused for a non-Account-Holder key → manual path keeps the key, then imports the .cer", async () => {
  let cert = "";
  const { api } = mockApi({
    "POST /v1/certificates": () => ({
      status: 403,
      body: {
        errors: [
          { code: "FORBIDDEN_ERROR", detail: "Only the Account Holder can create Developer ID certificates" },
        ],
      },
    }),
    "GET /v1/certificates?limit=200": () => ({
      body: { data: [{ id: "DEV9", attributes: { certificateContent: cert } }] },
    }),
  });
  const store = dirStore(mkdtempSync(join(tmpdir(), "tdj-store-")));
  const first = await ensureCert(api, store, "devid", { log: quiet });
  assert.equal(first.status, "manual");
  assert.match(first.csrPem, /BEGIN CERTIFICATE REQUEST/);
  assert.ok(await store.get("DEVELOPER_ID_APPLICATION_CERT_PENDING_KEY"));
  assert.match(
    manualSteps({ app: null, devid: first, bundleId: "b", teamId: "T" }).join("\n"),
    /--devid-cer/,
  );
  // a second run before the owner is done (e.g. the release script's own setup step) keeps the same key + CSR,
  // so the certificate made from the first CSR still matches
  const again = await ensureCert(api, store, "devid", { log: quiet });
  assert.equal(again.status, "manual");
  assert.equal(again.csrPem, first.csrPem);
  cert = appleSigns(first.csrPem); // the owner uploads the CSR and downloads the .cer
  const done = await ensureCert(api, store, "devid", { log: quiet, devidCer: cert });
  assert.deepEqual(done, { status: "imported", id: "DEV9" });
  assert.equal(await store.get("DEVELOPER_ID_APPLICATION_CERT_PENDING_KEY"), null);
});

test("certificate limit: explains, or revokes the oldest distribution cert with --revoke-oldest (never Developer ID)", async () => {
  let n = 0;
  const deleted = [];
  const routes = {
    "POST /v1/certificates": (body) =>
      n++ === 0
        ? {
            status: 409,
            body: {
              errors: [
                {
                  code: "ENTITY_ERROR",
                  detail:
                    "You already have a current Distribution certificate or a pending certificate request.",
                },
              ],
            },
          }
        : {
            status: 201,
            body: {
              data: {
                id: "C2",
                attributes: { certificateContent: appleSigns(body.data.attributes.csrContent) },
              },
            },
          },
    "GET /v1/certificates?filter": () => ({
      body: {
        data: [
          { id: "OLD", attributes: { expirationDate: "2026-12-01T00:00:00Z" } },
          { id: "NEW", attributes: { expirationDate: "2027-10-01T00:00:00Z" } },
        ],
      },
    }),
    "DELETE /v1/certificates/": (_b, p) => {
      deleted.push(p);
      return { status: 204 };
    },
  };
  const a = mockApi(routes);
  await assert.rejects(
    ensureCert(a.api, dirStore(mkdtempSync(join(tmpdir(), "s-"))), "distribution", { log: quiet }),
    /limit .*--revoke-oldest/,
  );
  n = 0;
  const b = mockApi(routes);
  const r = await ensureCert(b.api, dirStore(mkdtempSync(join(tmpdir(), "s-"))), "distribution", {
    log: quiet,
    revokeOldest: true,
  });
  assert.equal(r.status, "created");
  assert.deepEqual(deleted, ["/v1/certificates/OLD"]);
});

test("profile: reused when active, current and on our certificate; replaced when stale", async () => {
  const far = new Date(Date.now() + 200 * 86400000).toISOString();
  const good = {
    id: "P1",
    attributes: {
      name: "TDJ iPad App Store",
      profileState: "ACTIVE",
      profileType: "IOS_APP_STORE",
      expirationDate: far,
      profileContent: "QUJD",
    },
    relationships: { certificates: { data: [{ id: "C1" }] }, bundleId: { data: { id: "B" } } },
  };
  const store = dirStore(mkdtempSync(join(tmpdir(), "s-")));
  const a = mockApi({ "GET /v1/profiles": () => ({ body: { data: [good] } }) });
  assert.equal(
    (await ensureProfile(a.api, store, "ios", { id: "B" }, "C1", { log: quiet })).status,
    "reused",
  );
  assert.equal(await store.get("IOS_APPSTORE_PROFILE"), "QUJD");

  const deleted = [];
  const b = mockApi({
    "GET /v1/profiles": () => ({
      body: { data: [{ ...good, relationships: { certificates: { data: [{ id: "OLDCERT" }] } } }] },
    }),
    "DELETE /v1/profiles/P1": () => {
      deleted.push("P1");
      return { status: 204 };
    },
    "POST /v1/profiles": (body) => {
      assert.equal(body.data.relationships.certificates.data[0].id, "C1");
      assert.equal(body.data.attributes.profileType, "IOS_APP_STORE");
      return { status: 201, body: { data: { id: "P2", attributes: { profileContent: "TkVX" } } } };
    },
  });
  assert.equal(
    (await ensureProfile(b.api, store, "ios", { id: "B" }, "C1", { log: quiet })).status,
    "created",
  );
  assert.deepEqual(deleted, ["P1"]);
  assert.equal(await store.get("IOS_APPSTORE_PROFILE"), "TkVX");
});

test("setup: whole run tells the owner to create the app record when it is missing", async () => {
  const { api } = mockApi({
    "GET /v1/bundleIds": () => ({
      body: { data: [{ id: "B", attributes: { identifier: "com.ariomoniri.tdj", platform: "UNIVERSAL" } }] },
    }),
    "POST /v1/certificates": (b) => ({
      status: 201,
      body: {
        data: {
          id: `C${Math.random()}`,
          attributes: { certificateContent: appleSigns(b.data.attributes.csrContent) },
        },
      },
    }),
    "GET /v1/profiles": () => ({ body: { data: [] } }),
    "POST /v1/profiles": () => ({
      status: 201,
      body: { data: { id: "P", attributes: { profileContent: "QQ==" } } },
    }),
    "GET /v1/apps": () => ({ body: { data: [] } }),
  });
  const r = await setup({
    api,
    store: dirStore(mkdtempSync(join(tmpdir(), "s-"))),
    log: quiet,
    bundleId: "com.ariomoniri.tdj",
    teamId: "FF68N39FU5",
    appName: "TDJ",
  });
  assert.equal(r.distribution.status, "created");
  assert.equal(r.ios.status, "created");
  assert.equal(r.mac.status, "created");
  assert.equal(r.app, null);
  assert.match(r.manual[0], /appstoreconnect\.apple\.com\/apps.*New App/);
});

// docs/SYNC.md: the App ID's iCloud capability, and profiles that grant the container
const plistProfile = (ents) =>
  Buffer.from(
    `0\x82\x10junk<?xml version="1.0"?><plist><dict><key>Entitlements</key><dict>${ents}</dict></dict></plist>junk`,
    "latin1",
  ).toString("base64");
const WITH_ICLOUD = plistProfile(
  "<key>com.apple.developer.icloud-container-identifiers</key><array><string>iCloud.com.example.tdj</string></array>" +
    "<key>com.apple.developer.ubiquity-container-identifiers</key><array><string>iCloud.com.example.tdj</string></array>",
);
const WITHOUT = plistProfile("<key>application-identifier</key><string>T.com.example.tdj</string>");

test("iCloud: a profile is read for the container; one without it is replaced", async () => {
  assert.equal(profileHasICloud(WITH_ICLOUD, "iCloud.com.example.tdj"), true);
  assert.equal(profileHasICloud(WITH_ICLOUD, "iCloud.com.other.app"), false);
  assert.equal(profileHasICloud(WITHOUT, "iCloud.com.example.tdj"), false);
  assert.equal(profileHasICloud("", "iCloud.com.example.tdj"), false);
  assert.equal(icloudContainer("com.example.tdj"), "iCloud.com.example.tdj");

  const far = new Date(Date.now() + 200 * 86400000).toISOString();
  const prof = (content) => ({
    id: "P1",
    attributes: {
      name: "TDJ Mac App Store",
      profileState: "ACTIVE",
      profileType: "MAC_APP_STORE",
      expirationDate: far,
      profileContent: content,
    },
    relationships: { certificates: { data: [{ id: "C1" }] }, bundleId: { data: { id: "B" } } },
  });
  const opts = { log: quiet, icloud: "iCloud.com.example.tdj" };
  const store = dirStore(mkdtempSync(join(tmpdir(), "s-")));
  const keep = mockApi({ "GET /v1/profiles": () => ({ body: { data: [prof(WITH_ICLOUD)] } }) });
  assert.equal((await ensureProfile(keep.api, store, "mac", { id: "B" }, "C1", opts)).status, "reused");

  const deleted = [];
  const old = mockApi({
    "GET /v1/profiles": () => ({ body: { data: [prof(WITHOUT)] } }),
    "DELETE /v1/profiles/P1": () => {
      deleted.push("P1");
      return { status: 204 };
    },
    "POST /v1/profiles": () => ({
      status: 201,
      body: { data: { id: "P2", attributes: { profileContent: WITH_ICLOUD } } },
    }),
  });
  const r = await ensureProfile(old.api, store, "mac", { id: "B" }, "C1", opts);
  assert.deepEqual([r.status, r.icloudMissing, deleted], ["created", undefined, ["P1"]]);
  assert.equal(await store.get("MAC_APPSTORE_PROFILE"), WITH_ICLOUD);

  // the container is not assigned yet: the new profile still lacks it, and the owner is told what to do
  const unassigned = mockApi({
    "GET /v1/profiles": () => ({ body: { data: [] } }),
    "POST /v1/profiles": () => ({
      status: 201,
      body: { data: { id: "P3", attributes: { profileContent: WITHOUT } } },
    }),
  });
  const u = await ensureProfile(unassigned.api, store, "ios", { id: "B" }, "C1", opts);
  assert.equal(u.icloudMissing, true);
  const steps = manualSteps({
    app: { id: "A" },
    bundleId: "com.example.tdj",
    teamId: "T",
    icloud: opts.icloud,
    icloudMissing: true,
  });
  assert.match(steps[0], /iCloud → Configure → tick iCloud\.com\.example\.tdj/);
});

test("iCloud: the capability is enabled with its settings when the App ID lacks it", async () => {
  const posted = [];
  const { api } = mockApi({
    "GET /v1/bundleIds/B/bundleIdCapabilities": () => ({
      body: { data: [{ attributes: { capabilityType: "IN_APP_PURCHASE" } }] },
    }),
    "POST /v1/bundleIdCapabilities": (b) => {
      posted.push(b.data.attributes);
      return { status: 201, body: { data: {} } };
    },
  });
  await ensureCapabilities(api, { id: "B" }, [ICLOUD_CAPABILITY, "IN_APP_PURCHASE"], quiet);
  assert.deepEqual(posted, [
    {
      capabilityType: "ICLOUD",
      settings: [{ key: "ICLOUD_VERSION", options: [{ key: "XCODE_6", enabled: true }] }],
    },
  ]);
});
