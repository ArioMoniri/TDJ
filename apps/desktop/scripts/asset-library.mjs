#!/usr/bin/env node
// Upload what fastlane deliver cannot place to the App Store Connect App Asset Library (API 4.5.1+), with the team
// API key (never an Apple ID): the iPhone Duo screenshot sets (outer 1398x2034 and inner 2853x2007, 8 per locale),
// the iPhone app preview on the Duo slot when Apple's catalog accepts it, and the product page "Header and Search
// Results" images (header 3840x1646, universal 5244x2950). docs/RELEASING.md → Store creative → Asset Library.
//
//   node scripts/asset-library.mjs [--platform IOS|MAC_OS] [--only duo,preview,header] [--locales en-US,tr]
//                                  [--version 1.2.0] [--dir fastlane] [--dry-run] [--timeout 900]
//
// Apple's model (https://developer.apple.com/documentation/appstoreconnectapi/understanding-the-app-asset-library):
// an image or video is uploaded once into the app's library (reserve → PUT the parts → commit `uploaded: true` →
// poll until processed), then a *placement* puts it on an App Store version localization with a `placementType`
// (APP_SCREENSHOT, APP_PREVIEW, PRODUCT_PAGE_HEADER_ASSET, APP_STORE_SEARCH_RESULTS_ASSET) and a `placementGroup`
// (a device family). Group ids are not an enum: they come from GET /v1/appAssetLibraryRefData, so this script reads
// the catalog every run and picks each file's group from its pixel size (the spec whose dimensions match), the
// group's display class (IPHONE_DUO for the Duo sets) and the App Store version's per-group limits.
//
// Idempotent: a slot whose placements already show the same files (by content hash in `referenceName`) in the same
// order is left alone. Otherwise the new files are uploaded first (or reused from the library when an asset with the
// same hash is already there), and only once they are processed are the slot's old placements deleted, the new ones
// created and ordered, and our old assets (referenceName "tdj:…") that no placement uses any more deleted.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AscError, createClient, loadKey } from "../../../scripts/release/asc.mjs";
import { info, jpegSize } from "./png.mjs";

/** asset states after processing (`PREPARE_FOR_SUBMISSION` is the documented one; `COMPLETE` is in the enum too) */
export const PROCESSED = new Set([
  "COMPLETE",
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "ACCEPTED",
  "APPROVED",
]);
/** asset states we never reuse */
const DEAD = new Set(["FAILED", "REJECTED", "ARCHIVED", "AWAITING_UPLOAD"]);
/** App Store version states in which placements can be created */
export const EDITABLE = [
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
  "READY_FOR_REVIEW",
];
/** the placement platforms an App Store version of each platform shows */
export const PLATFORMS = {
  IOS: ["IPHONE_APP_STORE", "IPAD_APP_STORE", "ANY"],
  MAC_OS: ["MAC_APP_STORE", "ANY"],
};
export const HEADER_TYPES = ["PRODUCT_PAGE_HEADER_ASSET", "APP_STORE_SEARCH_RESULTS_ASSET"];
export const PREVIEW_TIME_CODE = "00:00:05:00";
const FEATURE = "APP_STORE_VERSIONS";
const REF_PREFIX = "tdj:";

/* ------------------------------------------------------------------ local files */

/**
 * @typedef {{ path: string, fileName: string, role: string, kind: "image" | "video", size: number, sha: string,
 *   ref: string, width: number, height: number, alpha: boolean }} LocalFile
 * @typedef {{ placementType: string, group: string, category: string, kind: "image" | "video", files: LocalFile[],
 *   specs: string[], limit: number }} Slot
 */

/** referenceName: content hash + file name, so the same picture is found again and a changed one is not */
export const refName = (sha, fileName) => `${REF_PREFIX}${sha.slice(0, 16)}:${fileName}`;

/** width, height, alpha of a PNG or JPEG */
export function imageInfo(buf, fileName) {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".png") {
    const i = info(buf);
    return { width: i.width, height: i.height, alpha: i.alpha };
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    const s = jpegSize(buf);
    return { width: s.width, height: s.height, alpha: false };
  }
  throw new Error(`${fileName}: not a PNG or JPEG`);
}

/** @returns {LocalFile} */
function describe(path, role, kind) {
  const buf = readFileSync(path);
  const fileName = path.split("/").pop();
  const sha = createHash("sha256").update(buf).digest("hex");
  const dims = kind === "image" ? imageInfo(buf, fileName) : { width: 0, height: 0, alpha: false };
  return { path, fileName, role, kind, size: buf.length, sha, ref: refName(sha, fileName), ...dims };
}

const listDir = (dir, re) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => re.test(f) && statSync(join(dir, f)).isFile())
        .sort()
    : [];

/**
 * The files `pnpm store:creative` writes for one locale (paths in store/creative/spec.ts):
 * screenshots_duo/<locale>/NN_<panel>_duoOuter.jpg and …_duoInner.jpg, app_previews/<locale>/IPHONE_67_tdj.mp4,
 * product_page/<locale>/header-21x9.png and universal-16x9.png.
 * @returns {{ duo: LocalFile[], header: LocalFile[], preview: LocalFile | null }}
 */
export function readLocal(root, locale) {
  const duoDir = join(root, "screenshots_duo", locale);
  const duo = [
    ...listDir(duoDir, /_duoOuter\.(jpe?g|png)$/i).map((f) => describe(join(duoDir, f), "duoOuter", "image")),
    ...listDir(duoDir, /_duoInner\.(jpe?g|png)$/i).map((f) => describe(join(duoDir, f), "duoInner", "image")),
  ];
  const pp = join(root, "product_page", locale);
  const header = [
    ...listDir(pp, /^header-21x9\.(png|jpe?g)$/i).map((f) => describe(join(pp, f), "header", "image")),
    ...listDir(pp, /^universal-16x9\.(png|jpe?g)$/i).map((f) => describe(join(pp, f), "universal", "image")),
  ];
  const pv = join(root, "app_previews", locale, "IPHONE_67_tdj.mp4");
  const preview = existsSync(pv) ? describe(pv, "duoPreview", "video") : null;
  return { duo, header, preview };
}

/* ------------------------------------------------------------------ Apple's catalog */

/** Lookups over one AppAssetLibraryRefDatum's attributes (Discovering asset specifications). */
export function catalog(attrs) {
  const features = attrs.features ?? [];
  const groups = new Map((attrs.placementProfileGroups ?? []).map((g) => [g.placementProfileGroupId, g]));
  const types = new Map((attrs.placementTypes ?? []).map((t) => [t.placementTypeId, t]));
  const imageSpecs = attrs.imageSpecs ?? [];
  const videoSpecs = attrs.videoSpecs ?? [];
  const policy = (type) =>
    features.find((f) => f.featureId === FEATURE)?.placementPolicies?.find((p) => p.placementType === type);
  return {
    group: (id) => groups.get(id),
    /** the max number of assets a group holds on an App Store version, or 0 when the version does not offer it */
    limit(type, groupId) {
      const gl = policy(type)?.groupLimits?.find((l) => (l.groupIds ?? []).includes(groupId));
      return gl ? (gl.maxCount ?? 0) : 0;
    },
    /** image specs whose exact size (or range) fits the file */
    imageSpecsFor({ width, height, fileName }) {
      const ext = extname(fileName).toLowerCase();
      return imageSpecs.filter((s) => {
        const d = s.dimensions ?? {};
        const fits =
          width >= (d.minWidth ?? 0) &&
          width <= (d.maxWidth ?? Number.MAX_SAFE_INTEGER) &&
          height >= (d.minHeight ?? 0) &&
          height <= (d.maxHeight ?? Number.MAX_SAFE_INTEGER);
        const extOk = !s.fileExtensions?.length || s.fileExtensions.map((e) => e.toLowerCase()).includes(ext);
        return fits && extOk;
      });
    },
    specById: (id) => imageSpecs.find((s) => s.specId === id) ?? videoSpecs.find((s) => s.specId === id),
    /** groups of a placement type whose mapping lists the spec */
    groupsFor(type, specId) {
      return (types.get(type)?.specMappings ?? [])
        .filter((m) => (m.specs ?? []).includes(specId))
        .map((m) => m.placementGroupId);
    },
    /** every group of a placement type, with the specs it takes */
    mappings: (type) => types.get(type)?.specMappings ?? [],
    accepts: (type) => types.get(type)?.acceptsAssetCategories ?? [],
  };
}

const onPlatform = (cat, groupId, platform) => {
  const g = cat.group(groupId);
  return !g?.platform || PLATFORMS[platform].includes(g.platform);
};

/**
 * What goes where for one locale: a list of slots { placementType, group, category, kind, files, specs, limit }.
 * Throws (before anything is changed) when a file fits no slot, more than one Duo group, or a slot's limit.
 * @returns {{ slots: Slot[], warnings: string[] }}
 */
export function plan(local, cat, { platform = "IOS", only = ["duo", "preview", "header"] } = {}) {
  const slots = new Map();
  const add = (type, group, file, specIds, category, kind) => {
    const key = `${type} ${group}`;
    if (!slots.has(key))
      slots.set(key, { placementType: type, group, category, kind, files: [], specs: new Set() });
    const s = slots.get(key);
    s.files.push(file);
    for (const id of specIds) s.specs.add(id);
  };
  /** @type {string[]} */
  const warnings = [];

  if (only.includes("duo") && platform === "IOS") {
    for (const f of local.duo) {
      const specs = cat
        .imageSpecsFor(f)
        .filter((s) => (s.compatiblePlacementTypes ?? ["APP_SCREENSHOT"]).includes("APP_SCREENSHOT"));
      if (!specs.length) throw new Error(`${f.fileName}: no APP_SCREENSHOT spec is ${f.width}x${f.height}`);
      if (f.alpha && specs.every((s) => s.alphaAllowed === false))
        throw new Error(`${f.fileName}: has an alpha channel, which the spec does not allow`);
      const groups = new Set();
      for (const s of specs)
        for (const g of cat.groupsFor("APP_SCREENSHOT", s.specId))
          if (
            cat.group(g)?.displayClassId === "IPHONE_DUO" &&
            onPlatform(cat, g, platform) &&
            cat.limit("APP_SCREENSHOT", g) > 0
          )
            groups.add(g);
      if (groups.size !== 1)
        throw new Error(
          `${f.fileName} (${f.width}x${f.height}): expected one iPhone Duo screenshot group in Apple's catalog, found ${
            [...groups].join(", ") || "none"
          }`,
        );
      const [g] = groups;
      const ok = specs.filter((s) => cat.groupsFor("APP_SCREENSHOT", s.specId).includes(g));
      add(
        "APP_SCREENSHOT",
        g,
        f,
        ok.map((s) => s.specId),
        "APP_SCREENSHOTS_AND_PREVIEWS",
        "image",
      );
    }
  }

  if (only.includes("preview") && platform === "IOS" && local.preview) {
    // the Duo slot takes the iPhone preview when a Duo group lists a video spec; the processed specId decides
    const groups = cat
      .mappings("APP_PREVIEW")
      .filter(
        (m) =>
          cat.group(m.placementGroupId)?.displayClassId === "IPHONE_DUO" &&
          onPlatform(cat, m.placementGroupId, platform) &&
          cat.limit("APP_PREVIEW", m.placementGroupId) > 0,
      );
    if (groups.length === 1)
      add(
        "APP_PREVIEW",
        groups[0].placementGroupId,
        local.preview,
        groups[0].specs ?? [],
        "APP_SCREENSHOTS_AND_PREVIEWS",
        "video",
      );
    else
      warnings.push(
        `iPhone Duo app preview: ${groups.length} Duo APP_PREVIEW groups in the catalog; not placed (set it by hand)`,
      );
  }

  if (only.includes("header")) {
    // every (header type, group) the file's spec fits; a size-specific spec wins over a universal one in a slot
    const cands = [];
    for (const f of local.header) {
      const specs = cat
        .imageSpecsFor(f)
        .filter((s) => (s.compatiblePlacementTypes ?? []).some((t) => HEADER_TYPES.includes(t)));
      if (!specs.length)
        throw new Error(`${f.fileName}: no header or search results spec is ${f.width}x${f.height}`);
      if (f.alpha && specs.every((s) => s.alphaAllowed === false))
        throw new Error(`${f.fileName}: has an alpha channel, which the spec does not allow`);
      for (const s of specs)
        for (const type of HEADER_TYPES.filter((t) => (s.compatiblePlacementTypes ?? []).includes(t)))
          for (const g of cat.groupsFor(type, s.specId))
            if (onPlatform(cat, g, platform) && cat.limit(type, g) > 0)
              cands.push({ type, group: g, file: f, spec: s });
    }
    const best = new Map();
    for (const c of cands) {
      const key = `${c.type} ${c.group}`;
      const cur = best.get(key);
      if (!cur || (cur.spec.universalAsset && !c.spec.universalAsset)) best.set(key, c);
    }
    for (const c of best.values()) add(c.type, c.group, c.file, [c.spec.specId], "CREATIVE_ASSETS", "image");
    for (const f of local.header)
      if (![...best.values()].some((c) => c.file === f))
        warnings.push(`${f.fileName}: every slot it fits is taken by a more specific file; not placed`);
  }

  const out = [...slots.values()].map((s) => ({
    ...s,
    specs: [...s.specs],
    limit: cat.limit(s.placementType, s.group),
    /** every spec the group takes for this placement type (the catalog's mapping) */
    accepted: cat
      .mappings(s.placementType)
      .filter((m) => m.placementGroupId === s.group)
      .flatMap((m) => m.specs ?? []),
  }));
  for (const s of out) {
    // one iPhone Duo group for both postures with fewer places than files: keep every scene once (open book first),
    // then the folded ones of the first scenes, in scene order (open before folded)
    if (
      s.placementType === "APP_SCREENSHOT" &&
      s.files.length > s.limit &&
      s.files.every((f) => /duo/i.test(f.fileName))
    ) {
      const picked = pickDuo(s.files, s.limit);
      warnings.push(
        `iPhone Duo: ${s.files.length} screenshots for ${s.limit} places in ${s.group}; placing ${picked.map((f) => f.fileName).join(", ")}`,
      );
      s.files = picked;
    }
    if (!cat.accepts(s.placementType).includes(s.category) && cat.accepts(s.placementType).length)
      throw new Error(`${s.placementType} does not accept ${s.category} assets`);
    if (s.files.length > s.limit)
      throw new Error(
        `${s.placementType} ${s.group}: ${s.files.length} files, Apple allows ${s.limit} per App Store version`,
      );
  }
  return { slots: out, warnings };
}

/** The Duo screenshots that fit `limit` places: each scene's open-book (inner) shot, then folded (outer) shots in scene
 * order until full; listed by scene, open before folded. */
export function pickDuo(files, limit) {
  const scene = (f) => f.fileName.match(/^(\d+)/)?.[1] ?? f.fileName;
  const inner = (f) => /inner/i.test(f.fileName);
  const sorted = [...files].sort((a, b) => a.fileName.localeCompare(b.fileName));
  const scenes = [...new Set(sorted.map(scene))];
  const first = scenes.map(
    (sc) => sorted.find((f) => scene(f) === sc && inner(f)) ?? sorted.find((f) => scene(f) === sc),
  );
  const chosen = new Set(first.slice(0, limit));
  for (const f of sorted) if (chosen.size < limit) chosen.add(f);
  return sorted
    .filter((f) => chosen.has(f))
    .sort((a, b) => scene(a).localeCompare(scene(b)) || Number(inner(b)) - Number(inner(a)));
}

/* ------------------------------------------------------------------ App Store Connect */

const q = (params) =>
  Object.entries(params)
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k).replace(/%5B/g, "[").replace(/%5D/g, "]")}=${encodeURIComponent(v)}`,
    )
    .join("&");

/** GET every page, keeping `included` */
export async function getAll(api, path) {
  const data = [];
  const included = [];
  let next = path;
  while (next) {
    const page = await api.get(next);
    data.push(...(page?.data ?? []));
    included.push(...(page?.included ?? []));
    const link = page?.links?.next;
    next = link
      ? (() => {
          const u = new URL(link);
          return u.pathname + u.search;
        })()
      : null;
  }
  return { data, included };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One run against App Store Connect. `deps`: api (asc.mjs client), uploadFetch (for the unauthenticated upload
 * URLs), log, wait (ms → Promise), now (ms clock), readFile.
 */
export function createSync(deps) {
  const { api, log = console.log, wait = sleep, now = Date.now, readFile = readFileSync } = deps;
  const uploadFetch = deps.uploadFetch ?? globalThis.fetch;
  const pollMs = deps.pollMs ?? 5000;
  const known = new Map(); // referenceName → asset, this run

  const assetPath = (kind) => (kind === "video" ? "appAssetLibraryVideos" : "appAssetLibraryImages");
  const libraryList = (kind) => (kind === "video" ? "videos" : "images");

  async function findApp(bundleId) {
    const res = await api.get(`/v1/apps?${q({ "filter[bundleId]": bundleId, "fields[apps]": "bundleId" })}`);
    const app = (res?.data ?? []).find((a) => a.attributes?.bundleId === bundleId) ?? res?.data?.[0];
    if (!app) throw new Error(`No app with bundle ID ${bundleId} in App Store Connect`);
    return app.id;
  }

  async function editableVersion(appId, platform, versionString) {
    const params = {
      "filter[platform]": platform,
      "filter[appVersionState]": EDITABLE.join(","),
      "fields[appStoreVersions]": "versionString,appVersionState,platform",
    };
    if (versionString) params["filter[versionString]"] = versionString;
    const { data } = await getAll(api, `/v1/apps/${appId}/appStoreVersions?${q(params)}`);
    if (!data.length)
      throw new Error(
        `No editable ${platform} App Store version${versionString ? ` ${versionString}` : ""} (placements need one in ${EDITABLE.join(", ")}); create the version first (fastlane deliver does)`,
      );
    return data[0];
  }

  async function localizations(versionId) {
    const { data } = await getAll(
      api,
      `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?${q({ "fields[appStoreVersionLocalizations]": "locale", limit: 200 })}`,
    );
    return new Map(data.map((l) => [l.attributes?.locale, l.id]));
  }

  async function libraryId(appId) {
    const res = await api.get(`/v1/apps/${appId}/assetLibrary`);
    if (!res?.data?.id) throw new Error("The app has no asset library (App Store Connect API 4.5.1+)");
    return res.data.id;
  }

  async function refData() {
    const res = await api.get("/v1/appAssetLibraryRefData");
    const attrs = res?.data?.[0]?.attributes;
    if (!attrs) throw new Error("App Store Connect returned no asset library reference data");
    return attrs;
  }

  /** placements in one slot of one localization, in display order, with their assets' referenceName */
  async function slotPlacements(locId, slot) {
    const inc = slot.kind === "video" ? "video" : "image";
    const { data, included } = await getAll(
      api,
      `/v1/appStoreVersionLocalizations/${locId}/placements?${q({
        "filter[placementType]": slot.placementType,
        "filter[placementGroup]": slot.group,
        sort: "placementGroupPosition",
        include: inc,
        limit: 50,
      })}`,
    );
    const assets = new Map(included.map((a) => [`${a.type} ${a.id}`, a]));
    return data.map((p) => {
      const rel = p.relationships?.[inc]?.data;
      const asset = rel ? assets.get(`${rel.type} ${rel.id}`) : undefined;
      return {
        id: p.id,
        state: p.attributes?.state,
        assetId: rel?.id,
        assetType: rel?.type,
        ref: asset?.attributes?.referenceName ?? null,
      };
    });
  }

  async function waitProcessed(kind, id, fileName, timeoutMs) {
    const start = now();
    for (;;) {
      const res = await api.get(`/v1/${assetPath(kind)}/${id}`);
      const a = res?.data?.attributes ?? {};
      if (PROCESSED.has(a.state)) return res.data;
      if (a.state === "FAILED") {
        const why = (a.stateDetails ?? []).map((d) => `${d.code}: ${d.description ?? ""}`).join("; ");
        throw new Error(`${fileName}: processing FAILED${why ? ` (${why})` : ""}`);
      }
      if (now() - start > timeoutMs)
        throw new Error(`${fileName}: still ${a.state} after ${timeoutMs / 1000} s`);
      await wait(pollMs);
    }
  }

  async function upload(libId, file, category, timeoutMs) {
    const attributes = { fileName: file.fileName, fileSize: file.size, category, referenceName: file.ref };
    if (file.kind === "video") attributes.previewFrameTimeCode = PREVIEW_TIME_CODE;
    const res = await api.post(`/v1/${assetPath(file.kind)}`, {
      data: {
        type: assetPath(file.kind),
        attributes,
        relationships: { assetLibrary: { data: { type: "appAssetLibraries", id: libId } } },
      },
    });
    const id = res.data.id;
    const buf = readFile(file.path);
    for (const op of res.data.attributes?.uploadOperations ?? []) {
      const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
      const r = await uploadFetch(op.url, {
        method: op.method ?? "PUT",
        headers,
        body: buf.subarray(op.offset ?? 0, (op.offset ?? 0) + (op.length ?? buf.length)),
      });
      if (!r.ok) throw new Error(`${file.fileName}: upload part at ${op.offset} → HTTP ${r.status}`);
    }
    await api.patch(`/v1/${assetPath(file.kind)}/${id}`, {
      data: { type: assetPath(file.kind), id, attributes: { uploaded: true } },
    });
    log(`  uploaded ${file.fileName}, waiting for processing`);
    return waitProcessed(file.kind, id, file.fileName, timeoutMs);
  }

  /** the library asset for a file: reused when the same content is already there and processed, else uploaded */
  async function ensureAsset(libId, file, category, timeoutMs) {
    if (known.has(file.ref)) return known.get(file.ref);
    const { data } = await getAll(
      api,
      `/v1/appAssetLibraries/${libId}/${libraryList(file.kind)}?${q({
        "filter[referenceName]": file.ref,
        "filter[category]": category,
      })}`,
    );
    let asset = data.find((a) => a.attributes?.referenceName === file.ref && !DEAD.has(a.attributes?.state));
    if (asset && !PROCESSED.has(asset.attributes.state))
      asset = await waitProcessed(file.kind, asset.id, file.fileName, timeoutMs);
    else if (asset) log(`  reusing ${file.fileName} (already in the library)`);
    if (!asset) asset = await upload(libId, file, category, timeoutMs);
    known.set(file.ref, asset);
    return asset;
  }

  async function deleteIfUnused(kind, id) {
    const res = await api.get(`/v1/${assetPath(kind)}/${id}/placements?limit=1`);
    if (res?.data?.length) return false;
    try {
      await api.del(`/v1/${assetPath(kind)}/${id}`);
      return true;
    } catch (e) {
      log(`  kept asset ${id}: ${e.message}`);
      return false;
    }
  }

  /** make one slot of one localization show exactly `slot.files`, in order */
  async function syncSlot({ libId, locId, slot, dryRun, timeoutMs }) {
    const label = `${slot.placementType} ${slot.group}`;
    const before = await slotPlacements(locId, slot);
    const same =
      before.length === slot.files.length &&
      before.every((p, i) => p.ref === slot.files[i].ref && p.state !== "FAILED");
    if (same) {
      log(`  ${label}: up to date (${before.length})`);
      return "unchanged";
    }
    if (dryRun) {
      log(
        `  ${label}: would replace ${before.length} placement(s) with ${slot.files.map((f) => f.fileName).join(", ")}`,
      );
      return "planned";
    }
    // 1. every new asset uploaded and processed before anything on the page changes
    const assets = [];
    for (const f of slot.files) {
      const a = await ensureAsset(libId, f, slot.category, timeoutMs);
      const specId = a.attributes?.specId;
      if (specId && slot.specs.length && !slot.specs.includes(specId)) {
        if (slot.kind === "video") {
          log(
            `  ${label}: Apple matched ${f.fileName} to spec ${specId}, which this group does not take; skipped`,
          );
          await deleteIfUnused("video", a.id);
          known.delete(f.ref);
          return "skipped";
        }
        // an image can fit more than one spec (a size-specific and a universal one): Apple picks; the placement
        // itself is the judge, and refuses an asset its group does not take
        if (!(slot.accepted ?? []).includes(specId))
          log(
            `  ${label}: Apple matched ${f.fileName} to spec ${specId} (expected ${slot.specs.join(", ")}); placing it, Apple decides`,
          );
      }
      assets.push(a);
    }
    // 2. the slot's old placements out, the new ones in, in order
    for (const p of before) await api.del(`/v1/appAssetLibraryPlacements/${p.id}`);
    const created = [];
    for (const a of assets) {
      const rel = slot.kind === "video" ? "video" : "image";
      const res = await api.post("/v1/appAssetLibraryPlacements", {
        data: {
          type: "appAssetLibraryPlacements",
          attributes: { placementType: slot.placementType, placementGroup: slot.group },
          relationships: {
            [rel]: { data: { type: assetPath(slot.kind), id: a.id } },
            appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: locId } },
          },
        },
      });
      created.push(res.data.id);
    }
    if (created.length > 1)
      await api.post("/v1/appAssetLibraryPlacementOrderingRequests", {
        data: {
          type: "appAssetLibraryPlacementOrderingRequests",
          attributes: { placementGroup: slot.group },
          relationships: {
            orderedPlacements: { data: created.map((id) => ({ type: "appAssetLibraryPlacements", id })) },
            appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: locId } },
          },
        },
      });
    // 3. our old assets that nothing uses any more
    const keep = new Set(assets.map((a) => a.id));
    for (const p of before)
      if (p.assetId && !keep.has(p.assetId) && p.ref?.startsWith(REF_PREFIX))
        await deleteIfUnused(p.assetType === "appAssetLibraryVideos" ? "video" : "image", p.assetId);
    log(`  ${label}: placed ${created.length} (replaced ${before.length})`);
    return "replaced";
  }

  /**
   * the whole run: every locale, every slot
   * @param {{ bundleId: string, root: string, locales: string[], platform?: string, only?: string[],
   *   versionString?: string, dryRun?: boolean, timeoutMs?: number }} o
   */
  async function run({
    bundleId,
    root,
    locales,
    platform = "IOS",
    only,
    versionString,
    dryRun = false,
    timeoutMs = 900_000,
  }) {
    const appId = await findApp(bundleId);
    const version = await editableVersion(appId, platform, versionString);
    log(`${platform} ${version.attributes?.versionString} (${version.attributes?.appVersionState})`);
    const locs = await localizations(version.id);
    const libId = await libraryId(appId);
    const cat = catalog(await refData());
    // plan every locale first: nothing changes if one file fits no slot
    const plans = locales.map((locale) => ({
      locale,
      ...plan(readLocal(root, locale), cat, { platform, only }),
    }));
    /** @type {{ version: string, slots: Array<{ locale: string, type: string, group: string, status: string }>, warnings: string[] }} */
    const result = { version: version.attributes?.versionString, slots: [], warnings: [] };
    for (const p of plans) {
      log(`${p.locale}:`);
      for (const w of p.warnings) {
        log(`  warning: ${w}`);
        result.warnings.push(`${p.locale}: ${w}`);
      }
      const locId = locs.get(p.locale);
      if (!locId) {
        const w = `${p.locale}: no localization on this version (run fastlane deliver first); skipped`;
        log(`  warning: ${w}`);
        result.warnings.push(w);
        continue;
      }
      if (!p.slots.length) log("  nothing to place");
      for (const slot of p.slots) {
        const status = await syncSlot({ libId, locId, slot, dryRun, timeoutMs });
        result.slots.push({ locale: p.locale, type: slot.placementType, group: slot.group, status });
      }
    }
    return result;
  }

  return { run, syncSlot, ensureAsset, slotPlacements, waitProcessed };
}

/* ------------------------------------------------------------------ CLI */

export function parseArgs(argv) {
  const o = {
    platform: "IOS",
    only: ["duo", "preview", "header"],
    locales: ["en-US", "tr"],
    dryRun: false,
    timeout: 900,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    const name = a.split("=")[0];
    if (name === "--platform") o.platform = val();
    else if (name === "--only") o.only = val().split(",").filter(Boolean);
    else if (name === "--locales") o.locales = val().split(",").filter(Boolean);
    else if (name === "--version") o.version = val();
    else if (name === "--dir") o.dir = val();
    else if (name === "--timeout") o.timeout = Number(val());
    else if (name === "--dry-run") o.dryRun = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!PLATFORMS[o.platform]) throw new Error(`--platform must be IOS or MAC_OS, not ${o.platform}`);
  for (const k of o.only)
    if (!["duo", "preview", "header"].includes(k))
      throw new Error(`--only takes duo, preview, header; not ${k}`);
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(o.dir ?? join(here, "..", "fastlane"));
  const api = createClient(loadKey());
  const sync = createSync({ api });
  const res = await sync.run({
    bundleId: process.env.TDJ_APP_BUNDLE_ID || "com.ariomoniri.tdj",
    root,
    locales: o.locales,
    platform: o.platform,
    only: o.only,
    versionString: o.version,
    dryRun: o.dryRun,
    timeoutMs: o.timeout * 1000,
  });
  const n = (s) => res.slots.filter((x) => x.status === s).length;
  console.log(
    `done: ${n("replaced")} replaced, ${n("unchanged")} up to date, ${n("planned")} planned, ${n("skipped")} skipped, ${res.warnings.length} warning(s)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof AscError ? `App Store Connect: ${e.message}` : e.message);
    process.exit(1);
  });
}
