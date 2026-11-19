#!/usr/bin/env node
// Before App Review: answers export compliance on the uploaded builds (T-DJ uses only standard HTTPS/TLS, which is
// exempt: usesNonExemptEncryption = false) when App Store Connect still has it unanswered, and prints what the API
// shows of the other submission requirements (age rating, the version's state) so a refusal names its cause.
// No secret is printed.
//   node scripts/release/review-readiness.mjs --build 462004 [--app-id 6834924534] [--platforms IOS,MAC_OS]
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClient, loadKey } from "./asc.mjs";
import { readRelease } from "./version.mjs";

export async function readiness({ client, appId, build, platforms = ["IOS", "MAC_OS"], log = console.log }) {
  const report = { builds: {}, ageRating: null, versions: {} };
  for (const p of platforms) {
    const q = `/v1/builds?filter[app]=${appId}&filter[version]=${build}&filter[preReleaseVersion.platform]=${p}&fields[builds]=version,processingState,usesNonExemptEncryption&limit=1`;
    const b = (await client.get(q))?.data?.[0];
    if (!b) {
      log(`${p} build ${build}: not found`);
      report.builds[p] = "missing";
      continue;
    }
    const a = b.attributes ?? {};
    if (a.usesNonExemptEncryption == null) {
      await client.patch(`/v1/builds/${b.id}`, {
        data: { type: "builds", id: b.id, attributes: { usesNonExemptEncryption: false } },
      });
      log(`${p} build ${build}: export compliance answered (standard encryption only, exempt)`);
      report.builds[p] = "answered";
    } else {
      log(`${p} build ${build}: ${a.processingState}, usesNonExemptEncryption=${a.usesNonExemptEncryption}`);
      report.builds[p] = "ok";
    }
  }
  // the age rating declaration of the app's editable app info (its unanswered questions block a submission)
  const infos = (await client.get(`/v1/apps/${appId}/appInfos?limit=5`))?.data ?? [];
  for (const info of infos) {
    const decl = (await client.get(`/v1/appInfos/${info.id}/ageRatingDeclaration`))?.data;
    // T-DJ is a DJ tool, not a social media app: the newer required question is answered No (the owner asked for the
    // remaining submission steps to be done, 2026-11-18); the other nulls are optional (kids band, Korea GRAC, URL)
    if (decl?.id && decl.attributes?.socialMediaAgeRestricted === null) {
      await client.patch(`/v1/ageRatingDeclarations/${decl.id}`, {
        data: { type: "ageRatingDeclarations", id: decl.id, attributes: { socialMediaAgeRestricted: false } },
      });
      decl.attributes.socialMediaAgeRestricted = false;
      log("age rating: socialMediaAgeRestricted answered No (not a social media app)");
    }
    const unanswered = Object.entries(decl?.attributes ?? {})
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    log(
      `app info ${info.attributes?.appStoreState ?? info.attributes?.state ?? ""}: age rating ${
        unanswered.length ? `unanswered: ${unanswered.join(", ")}` : "answered"
      }`,
    );
    report.ageRating = unanswered;
  }
  const versions =
    (
      await client.get(
        `/v1/apps/${appId}/appStoreVersions?fields[appStoreVersions]=platform,versionString,appStoreState&limit=10`,
      )
    )?.data ?? [];
  for (const v of versions) {
    const a = v.attributes ?? {};
    log(`${a.platform} ${a.versionString}: ${a.appStoreState}`);
    report.versions[`${a.platform} ${a.versionString}`] = a.appStoreState;
  }
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      build: { type: "string" },
      "app-id": { type: "string", default: process.env.APPLE_APP_ID || "" },
      platforms: { type: "string", default: "IOS,MAC_OS" },
    },
  });
  try {
    await readiness({
      client: createClient(loadKey()),
      appId: values["app-id"] || readRelease().appStoreId,
      build: values.build,
      platforms: values.platforms
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
