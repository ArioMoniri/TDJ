/**
 * scripts/asset-library.mjs against an in-memory App Store Connect (the App Asset Library resources of API 4.5.1+:
 * apps, appStoreVersions, localizations, assetLibrary, appAssetLibraryRefData, images/videos, placements, ordering).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { catalog, createSync, parseArgs, plan, readLocal, refName } from "../scripts/asset-library.mjs";

/* ------------------------------------------------------------------ fixture files */

const jpeg = (w: number, h: number, salt = 0) => {
  const b = Buffer.alloc(32);
  b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  b.writeUInt16BE(h, 7);
  b.writeUInt16BE(w, 9);
  b[11] = 3;
  b[31] = salt;
  return b;
};
const png = (w: number, h: number, colorType = 2, salt = 0) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const len = Buffer.alloc(4);
  len.writeUInt32BE(13);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    len,
    Buffer.from("IHDR"),
    ihdr,
    Buffer.alloc(4),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("IEND"),
    Buffer.from([0, 0, 0, salt]),
  ]);
};

const PANELS = [
  "01_booth",
  "02_compose",
  "03_transition",
  "04_build",
  "05_dna",
  "06_rooms",
  "07_export",
  "08_offline",
];

function fixtureDir({ salt = 0, locales = ["en-US", "tr"], preview = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "tdj-al-"));
  for (const loc of locales) {
    const duo = join(root, "screenshots_duo", loc);
    const pp = join(root, "product_page", loc);
    const pv = join(root, "app_previews", loc);
    mkdirSync(duo, { recursive: true });
    mkdirSync(pp, { recursive: true });
    mkdirSync(pv, { recursive: true });
    PANELS.forEach((p, i) => {
      writeFileSync(join(duo, `${p}_duoOuter.jpg`), jpeg(1398, 2034, salt + i + (loc === "tr" ? 50 : 0)));
      writeFileSync(join(duo, `${p}_duoInner.jpg`), jpeg(2853, 2007, salt + i + (loc === "tr" ? 50 : 0)));
    });
    writeFileSync(join(pp, "header-21x9.png"), png(3840, 1646, 2, salt + (loc === "tr" ? 1 : 0)));
    writeFileSync(join(pp, "universal-16x9.png"), png(5244, 2950, 2, salt + (loc === "tr" ? 1 : 0)));
    if (preview) writeFileSync(join(pv, "IPHONE_67_tdj.mp4"), Buffer.from(`mp4 ${loc} ${salt}`));
  }
  return root;
}

/* ------------------------------------------------------------------ Apple's catalog (shape of AppAssetLibraryRefDatum) */

const spec = (specId: string, w: number, h: number, types: string[], extra = {}) => ({
  specId,
  shortName: specId,
  dimensions: { minWidth: w, maxWidth: w, minHeight: h, maxHeight: h },
  compatiblePlacementTypes: types,
  alphaAllowed: false,
  fileExtensions: [".jpg", ".jpeg", ".png"],
  universalAsset: false,
  ...extra,
});

function refData({ oneDuoGroup = false } = {}) {
  const duoGroups = oneDuoGroup
    ? ["IPHONE_DUO_PROFILE"]
    : ["IPHONE_DUO_OUTER_PROFILE", "IPHONE_DUO_INNER_PROFILE"];
  return {
    features: [
      {
        featureId: "APP_STORE_VERSIONS",
        placementPolicies: [
          {
            placementType: "APP_SCREENSHOT",
            groupLimits: [{ groupIds: ["IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE", ...duoGroups], maxCount: 10 }],
          },
          {
            placementType: "APP_PREVIEW",
            groupLimits: [{ groupIds: ["IPHONE_DUO_PREVIEW_PROFILE"], maxCount: 3 }],
          },
          {
            placementType: "PRODUCT_PAGE_HEADER_ASSET",
            groupLimits: [
              {
                groupIds: ["HEADER_WIDE_PROFILE", "HEADER_UNIVERSAL_PROFILE", "MAC_HEADER_PROFILE"],
                maxCount: 1,
              },
            ],
          },
          {
            placementType: "APP_STORE_SEARCH_RESULTS_ASSET",
            groupLimits: [{ groupIds: ["SEARCH_UNIVERSAL_PROFILE"], maxCount: 1 }],
          },
        ],
      },
    ],
    placementProfileGroups: [
      {
        placementProfileGroupId: "IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE",
        platform: "IPHONE_APP_STORE",
        displayClassId: "IPHONE_DYNAMIC_ISLAND_LARGE_DISPLAY",
      },
      ...duoGroups.map((g) => ({
        placementProfileGroupId: g,
        platform: "IPHONE_APP_STORE",
        displayClassId: "IPHONE_DUO",
      })),
      {
        placementProfileGroupId: "IPHONE_DUO_PREVIEW_PROFILE",
        platform: "IPHONE_APP_STORE",
        displayClassId: "IPHONE_DUO",
      },
      { placementProfileGroupId: "HEADER_WIDE_PROFILE", platform: "ANY", displayClassId: "DEFAULT" },
      { placementProfileGroupId: "HEADER_UNIVERSAL_PROFILE", platform: "ANY", displayClassId: "DEFAULT" },
      { placementProfileGroupId: "SEARCH_UNIVERSAL_PROFILE", platform: "ANY", displayClassId: "DEFAULT" },
      { placementProfileGroupId: "MAC_HEADER_PROFILE", platform: "MAC_APP_STORE", displayClassId: "DEFAULT" },
    ],
    imageSpecs: [
      spec("s-6.9", 1290, 2796, ["APP_SCREENSHOT", "IMESSAGE_APP_SCREENSHOT"]),
      spec("s-duo-outer", 1398, 2034, ["APP_SCREENSHOT"]),
      spec("s-duo-inner", 2853, 2007, ["APP_SCREENSHOT"]),
      spec("s-header", 3840, 1646, ["PRODUCT_PAGE_HEADER_ASSET"]),
      spec("s-universal", 5244, 2950, ["PRODUCT_PAGE_HEADER_ASSET", "APP_STORE_SEARCH_RESULTS_ASSET"], {
        universalAsset: true,
      }),
    ],
    videoSpecs: [
      { specId: "v-886", dimensions: { minWidth: 886, maxWidth: 886, minHeight: 1920, maxHeight: 1920 } },
    ],
    placementTypes: [
      {
        placementTypeId: "APP_SCREENSHOT",
        acceptsAssetCategories: ["APP_SCREENSHOTS_AND_PREVIEWS"],
        specMappings: [
          { placementGroupId: "IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE", specs: ["s-6.9"] },
          ...(oneDuoGroup
            ? [{ placementGroupId: "IPHONE_DUO_PROFILE", specs: ["s-duo-outer", "s-duo-inner"] }]
            : [
                { placementGroupId: "IPHONE_DUO_OUTER_PROFILE", specs: ["s-duo-outer"] },
                { placementGroupId: "IPHONE_DUO_INNER_PROFILE", specs: ["s-duo-inner"] },
              ]),
        ],
      },
      {
        placementTypeId: "APP_PREVIEW",
        acceptsAssetCategories: ["APP_SCREENSHOTS_AND_PREVIEWS"],
        specMappings: [{ placementGroupId: "IPHONE_DUO_PREVIEW_PROFILE", specs: ["v-886"] }],
      },
      {
        placementTypeId: "PRODUCT_PAGE_HEADER_ASSET",
        acceptsAssetCategories: ["CREATIVE_ASSETS"],
        specMappings: [
          { placementGroupId: "HEADER_WIDE_PROFILE", specs: ["s-header", "s-universal"] },
          { placementGroupId: "HEADER_UNIVERSAL_PROFILE", specs: ["s-universal"] },
          { placementGroupId: "MAC_HEADER_PROFILE", specs: ["s-universal"] },
        ],
      },
      {
        placementTypeId: "APP_STORE_SEARCH_RESULTS_ASSET",
        acceptsAssetCategories: ["CREATIVE_ASSETS"],
        specMappings: [{ placementGroupId: "SEARCH_UNIVERSAL_PROFILE", specs: ["s-universal"] }],
      },
    ],
    displayClasses: [],
  };
}

/* ------------------------------------------------------------------ a fake App Store Connect */

// biome-ignore lint/suspicious/noExplicitAny: JSON:API request bodies, read loosely by the fake
type Body = { data: any };
type Asset = { id: string; type: string; attributes: Record<string, unknown>; polls: number; bytes?: number };
type Placement = {
  id: string;
  type: string;
  group: string;
  loc: string;
  rel: string;
  assetType: string;
  assetId: string;
  pos: number;
};

function fakeAsc(
  opts: {
    versions?: string[];
    ref?: ReturnType<typeof refData>;
    failFile?: string;
    specOverride?: Record<string, string>;
  } = {},
) {
  const ref = opts.ref ?? refData();
  const assets = new Map<string, Asset>();
  const placements = new Map<string, Placement>();
  const calls: string[] = [];
  const uploads: Array<{ url: string; headers: Record<string, string>; bytes: number }> = [];
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const specFor = (fileName: string) => {
    if (opts.specOverride?.[fileName]) return opts.specOverride[fileName];
    if (fileName.includes("duoOuter")) return "s-duo-outer";
    if (fileName.includes("duoInner")) return "s-duo-inner";
    if (fileName.startsWith("header")) return "s-header";
    if (fileName.startsWith("universal")) return "s-universal";
    if (fileName.endsWith(".mp4")) return "v-886";
    return "unknown";
  };
  const locs = { "en-US": "loc-en", tr: "loc-tr" } as Record<string, string>;
  const versions = opts.versions ?? ["PREPARE_FOR_SUBMISSION"];
  const view = (a: Asset) => ({ type: a.type, id: a.id, attributes: { ...a.attributes } });
  const pview = (p: Placement) => ({
    type: "appAssetLibraryPlacements",
    id: p.id,
    attributes: { placementType: p.type, placementGroup: p.group, state: "PARENT_PREPARE_FOR_SUBMISSION" },
    relationships: { [p.rel]: { data: { type: p.assetType, id: p.assetId } } },
  });

  async function request(method: string, path: string, body?: Body) {
    calls.push(`${method} ${path.split("?")[0]}`);
    const u = new URL(`https://api.appstoreconnect.apple.com${path}`);
    const p = u.pathname;
    const f = (k: string) => u.searchParams.get(k);
    let m = [] as unknown as RegExpMatchArray;
    const hit = (verb: string, re: RegExp) => {
      if (method !== verb) return false;
      const r = p.match(re);
      if (r) m = r;
      return r !== null;
    };
    const g = (i: number) => m[i] ?? "";
    if (method === "GET" && p === "/v1/apps")
      return { data: [{ type: "apps", id: "app-1", attributes: { bundleId: f("filter[bundleId]") } }] };
    if (method === "GET" && p === "/v1/apps/app-1/appStoreVersions") {
      const allowed = (f("filter[appVersionState]") ?? "").split(",");
      return {
        data: versions
          .filter((s) => allowed.includes(s))
          .map((s) => ({
            type: "appStoreVersions",
            id: "ver-1",
            attributes: { versionString: "1.2.0", appVersionState: s },
          })),
      };
    }
    if (method === "GET" && p === "/v1/appStoreVersions/ver-1/appStoreVersionLocalizations")
      return {
        data: Object.entries(locs).map(([locale, i]) => ({
          type: "appStoreVersionLocalizations",
          id: i,
          attributes: { locale },
        })),
      };
    if (method === "GET" && p === "/v1/apps/app-1/assetLibrary")
      return { data: { type: "appAssetLibraries", id: "lib-1" } };
    if (method === "GET" && p === "/v1/appAssetLibraryRefData")
      return { data: [{ type: "appAssetLibraryRefData", id: "r", attributes: ref }] };
    if (hit("GET", /^\/v1\/appAssetLibraries\/lib-1\/(images|videos)$/)) {
      const t = g(1) === "images" ? "appAssetLibraryImages" : "appAssetLibraryVideos";
      return {
        data: [...assets.values()]
          .filter(
            (a) =>
              a.type === t &&
              a.attributes.referenceName === f("filter[referenceName]") &&
              a.attributes.category === f("filter[category]"),
          )
          .map(view),
      };
    }
    if (hit("POST", /^\/v1\/(appAssetLibraryImages|appAssetLibraryVideos)$/)) {
      const a: Asset = {
        id: id(g(1) === "appAssetLibraryImages" ? "img" : "vid"),
        type: g(1),
        attributes: { ...body!.data.attributes, state: "AWAITING_UPLOAD", specId: null },
        polls: 0,
      };
      assets.set(a.id, a);
      const size = body!.data.attributes.fileSize as number;
      const half = Math.ceil(size / 2);
      return {
        data: {
          ...view(a),
          attributes: {
            ...a.attributes,
            uploadOperations: [
              {
                method: "PUT",
                url: `https://blob.example/${a.id}/0`,
                offset: 0,
                length: half,
                requestHeaders: [{ name: "Content-Type", value: "application/octet-stream" }],
              },
              {
                method: "PUT",
                url: `https://blob.example/${a.id}/1`,
                offset: half,
                length: size - half,
                requestHeaders: [],
              },
            ],
          },
        },
      };
    }
    if (hit("PATCH", /^\/v1\/(appAssetLibraryImages|appAssetLibraryVideos)\/(.+)$/)) {
      const a = assets.get(g(2))!;
      if (body!.data.attributes.uploaded) {
        if (a.bytes !== a.attributes.fileSize) throw new Error("size mismatch");
        a.attributes.state = "UPLOAD_COMPLETE";
      }
      return { data: view(a) };
    }
    if (hit("GET", /^\/v1\/(appAssetLibraryImages|appAssetLibraryVideos)\/([^/]+)$/)) {
      const a = assets.get(g(2))!;
      if (a.attributes.state === "UPLOAD_COMPLETE" && ++a.polls >= 2) {
        const fn = a.attributes.fileName as string;
        if (fn === opts.failFile) {
          a.attributes.state = "FAILED";
          a.attributes.stateDetails = [{ code: "IMAGE_INCORRECT_DIMENSIONS", description: "bad size" }];
        } else {
          a.attributes.state = "PREPARE_FOR_SUBMISSION";
          a.attributes.specId = specFor(fn);
        }
      }
      return { data: view(a) };
    }
    if (hit("GET", /^\/v1\/(appAssetLibraryImages|appAssetLibraryVideos)\/([^/]+)\/placements$/))
      return { data: [...placements.values()].filter((x) => x.assetId === g(2)).map(pview) };
    if (hit("DELETE", /^\/v1\/(appAssetLibraryImages|appAssetLibraryVideos)\/([^/]+)$/)) {
      if ([...placements.values()].some((x) => x.assetId === g(2)))
        throw new Error("STATE_ERROR.ASSET_HAS_PLACEMENTS");
      assets.delete(g(2));
      return null;
    }
    if (hit("GET", /^\/v1\/appStoreVersionLocalizations\/([^/]+)\/placements$/)) {
      const list = [...placements.values()]
        .filter(
          (x) =>
            x.loc === g(1) &&
            x.type === f("filter[placementType]") &&
            x.group === f("filter[placementGroup]"),
        )
        .sort((a, b) => a.pos - b.pos);
      return {
        data: list.map(pview),
        included: list.map((x) => view(assets.get(x.assetId)!)),
      };
    }
    if (method === "POST" && p === "/v1/appAssetLibraryPlacements") {
      const d = body!.data;
      const rel = d.relationships.image ? "image" : "video";
      const loc = d.relationships.appStoreVersionLocalization.data.id;
      const same = [...placements.values()].filter(
        (x) =>
          x.loc === loc && x.type === d.attributes.placementType && x.group === d.attributes.placementGroup,
      );
      const pol = ref.features[0]?.placementPolicies.find(
        (pp) => pp.placementType === d.attributes.placementType,
      );
      const max =
        pol?.groupLimits.find((l) => l.groupIds.includes(d.attributes.placementGroup))?.maxCount ?? 0;
      if (same.length >= max) throw new Error("ENTITY_ERROR: limit");
      const a = assets.get(d.relationships[rel].data.id)!;
      const pl: Placement = {
        id: id("pl"),
        type: d.attributes.placementType,
        group: d.attributes.placementGroup,
        loc,
        rel,
        assetType: a.type,
        assetId: a.id,
        pos: 1000 - same.length, // the fake appends in reverse: only an ordering request puts them right
      };
      placements.set(pl.id, pl);
      return { data: pview(pl) };
    }
    if (hit("DELETE", /^\/v1\/appAssetLibraryPlacements\/(.+)$/)) {
      placements.delete(g(1));
      return null;
    }
    if (method === "POST" && p === "/v1/appAssetLibraryPlacementOrderingRequests") {
      body!.data.relationships.orderedPlacements.data.forEach((x: { id: string }, i: number) => {
        placements.get(x.id)!.pos = i;
      });
      return { data: { type: "appAssetLibraryPlacementOrderingRequests", id: id("ord") } };
    }
    throw new Error(`fake ASC: no route for ${method} ${path}`);
  }

  const api = {
    get: (p: string) => request("GET", p),
    post: (p: string, b: Body) => request("POST", p, b),
    patch: (p: string, b: Body) => request("PATCH", p, b),
    del: (p: string) => request("DELETE", p),
  };
  const uploadFetch = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: Buffer },
  ) => {
    uploads.push({ url, headers: init.headers, bytes: init.body.length });
    const aid = url.split("/")[3] ?? "";
    const a = assets.get(aid)!;
    a.bytes = (a.bytes ?? 0) + init.body.length;
    return { ok: true, status: 200 };
  };
  const shown = (loc: string, type: string, group: string) =>
    [...placements.values()]
      .filter((x) => x.loc === loc && x.type === type && x.group === group)
      .sort((a, b) => a.pos - b.pos)
      .map((x) => assets.get(x.assetId)!.attributes.fileName);
  return { api, uploadFetch, calls, uploads, assets, placements, shown };
}

const mutations = (calls: string[]) => calls.filter((c) => !c.startsWith("GET"));
const syncer = (asc: ReturnType<typeof fakeAsc>, logs: string[] = []) =>
  createSync({
    api: asc.api,
    uploadFetch: asc.uploadFetch,
    log: (s: string) => logs.push(s),
    wait: async () => {},
    pollMs: 0,
  });
const RUN = { bundleId: "com.ariomoniri.tdj", locales: ["en-US", "tr"] };

/* ------------------------------------------------------------------ tests */

describe("asset library: plan (Apple's catalog → slots, before anything changes)", () => {
  it("puts the outer and inner Duo sets in their own groups, in file order, and the header images in their slots", () => {
    const local = readLocal(fixtureDir(), "en-US");
    expect(local.duo).toHaveLength(16);
    const { slots, warnings } = plan(local, catalog(refData()));
    expect(warnings).toEqual([]);
    const by = Object.fromEntries(
      slots.map((s) => [`${s.placementType} ${s.group}`, s.files.map((f) => f.fileName)]),
    );
    expect(by["APP_SCREENSHOT IPHONE_DUO_OUTER_PROFILE"]).toEqual(PANELS.map((p) => `${p}_duoOuter.jpg`));
    expect(by["APP_SCREENSHOT IPHONE_DUO_INNER_PROFILE"]).toEqual(PANELS.map((p) => `${p}_duoInner.jpg`));
    expect(by["APP_PREVIEW IPHONE_DUO_PREVIEW_PROFILE"]).toEqual(["IPHONE_67_tdj.mp4"]);
    // the 21:9 file wins the slot both fit; the universal one fills the rest (not the Mac group on an iOS version)
    expect(by["PRODUCT_PAGE_HEADER_ASSET HEADER_WIDE_PROFILE"]).toEqual(["header-21x9.png"]);
    expect(by["PRODUCT_PAGE_HEADER_ASSET HEADER_UNIVERSAL_PROFILE"]).toEqual(["universal-16x9.png"]);
    expect(by["APP_STORE_SEARCH_RESULTS_ASSET SEARCH_UNIVERSAL_PROFILE"]).toEqual(["universal-16x9.png"]);
    expect(by["PRODUCT_PAGE_HEADER_ASSET MAC_HEADER_PROFILE"]).toBeUndefined();
    expect(slots.find((s) => s.group === "HEADER_WIDE_PROFILE")?.category).toBe("CREATIVE_ASSETS");
  });

  it("on a Mac version places only the header images, in the Mac and any-platform groups", () => {
    const { slots } = plan(readLocal(fixtureDir(), "en-US"), catalog(refData()), { platform: "MAC_OS" });
    expect(slots.map((s) => s.group).sort()).toEqual(
      [
        "HEADER_UNIVERSAL_PROFILE",
        "HEADER_WIDE_PROFILE",
        "MAC_HEADER_PROFILE",
        "SEARCH_UNIVERSAL_PROFILE",
      ].sort(),
    );
  });

  it("refuses 16 Duo screenshots in one group of 10 instead of cutting the set", () => {
    expect(() => plan(readLocal(fixtureDir(), "en-US"), catalog(refData({ oneDuoGroup: true })))).toThrow(
      /16 files, Apple allows 10/,
    );
  });

  it("refuses a file no spec takes, and an alpha channel where the spec forbids it", () => {
    const root = fixtureDir();
    writeFileSync(join(root, "product_page", "en-US", "header-21x9.png"), png(3840, 1600));
    expect(() => plan(readLocal(root, "en-US"), catalog(refData()))).toThrow(
      /no header or search results spec is 3840x1600/,
    );
    writeFileSync(join(root, "product_page", "en-US", "header-21x9.png"), png(3840, 1646, 6));
    expect(() => plan(readLocal(root, "en-US"), catalog(refData()))).toThrow(/alpha/);
  });

  it("refuses when the catalog has no (or two) Duo groups for a size", () => {
    const ref = refData();
    ref.placementProfileGroups = ref.placementProfileGroups.filter((g) => g.displayClassId !== "IPHONE_DUO");
    expect(() => plan(readLocal(fixtureDir(), "en-US"), catalog(ref), { only: ["duo"] })).toThrow(
      /found none/,
    );
  });

  it("names refs by content, so a changed picture is a new asset", () => {
    expect(refName("ab".repeat(32), "x.png")).toBe(`tdj:${"ab".repeat(8)}:x.png`);
    const a = readLocal(fixtureDir({ salt: 0 }), "en-US").duo[0]?.ref;
    const b = readLocal(fixtureDir({ salt: 9 }), "en-US").duo[0]?.ref;
    expect(a).not.toBe(b);
  });
});

describe("asset library: sync against App Store Connect (mocked)", () => {
  let root: string;
  beforeEach(() => {
    root = fixtureDir();
  });

  it("uploads every file once, waits until processed, places and orders them", async () => {
    const asc = fakeAsc();
    const res = await syncer(asc).run({ ...RUN, root });
    expect(res.version).toBe("1.2.0");
    expect(res.slots.every((s) => s.status === "replaced")).toBe(true);
    // 2 locales × (16 Duo + 1 preview + 2 header images); the universal image is uploaded once for its 2 slots
    expect([...asc.assets.values()].filter((a) => a.type === "appAssetLibraryImages")).toHaveLength(36);
    expect([...asc.assets.values()].filter((a) => a.type === "appAssetLibraryVideos")).toHaveLength(2);
    for (const a of asc.assets.values()) expect(a.attributes.state).toBe("PREPARE_FOR_SUBMISSION");
    expect(asc.shown("loc-en", "APP_SCREENSHOT", "IPHONE_DUO_OUTER_PROFILE")).toEqual(
      PANELS.map((p) => `${p}_duoOuter.jpg`),
    );
    expect(asc.shown("loc-tr", "APP_SCREENSHOT", "IPHONE_DUO_INNER_PROFILE")).toEqual(
      PANELS.map((p) => `${p}_duoInner.jpg`),
    );
    expect(asc.shown("loc-tr", "APP_STORE_SEARCH_RESULTS_ASSET", "SEARCH_UNIVERSAL_PROFILE")).toEqual([
      "universal-16x9.png",
    ]);
    expect(asc.shown("loc-en", "APP_PREVIEW", "IPHONE_DUO_PREVIEW_PROFILE")).toEqual(["IPHONE_67_tdj.mp4"]);
    const vid = [...asc.assets.values()].find((a) => a.type === "appAssetLibraryVideos")!;
    expect(vid.attributes.previewFrameTimeCode).toBe("00:00:05:00");
    expect(vid.attributes.category).toBe("APP_SCREENSHOTS_AND_PREVIEWS");
  });

  it("sends the bytes to Apple's upload URLs without the API token", async () => {
    const asc = fakeAsc();
    await syncer(asc).run({ ...RUN, root, locales: ["en-US"], only: ["header"] });
    expect(asc.uploads.length).toBe(4); // 2 images × 2 parts
    for (const u of asc.uploads) {
      expect(u.url).toMatch(/^https:\/\/blob\.example\//);
      expect(Object.keys(u.headers).map((h) => h.toLowerCase())).not.toContain("authorization");
    }
  });

  it("is idempotent: a second run with the same files changes nothing", async () => {
    const asc = fakeAsc();
    await syncer(asc).run({ ...RUN, root });
    asc.calls.length = 0;
    const res = await syncer(asc).run({ ...RUN, root });
    expect(res.slots.every((s) => s.status === "unchanged")).toBe(true);
    expect(mutations(asc.calls)).toEqual([]);
  });

  it("replaces a changed set: new assets first, then old placements out, and the old assets deleted", async () => {
    const asc = fakeAsc();
    await syncer(asc).run({ ...RUN, root, locales: ["en-US"], only: ["duo"] });
    const old = new Set([...asc.assets.keys()]);
    const root2 = fixtureDir({ salt: 7, locales: ["en-US"] });
    asc.calls.length = 0;
    await syncer(asc).run({ ...RUN, root: root2, locales: ["en-US"], only: ["duo"] });
    const m = mutations(asc.calls);
    // all uploads/commits come before the first placement delete
    const firstDelete = m.findIndex((c) => c.startsWith("DELETE /v1/appAssetLibraryPlacements"));
    const lastCommit = m.map((c, i) => (c.startsWith("PATCH") ? i : -1)).filter((i) => i >= 0);
    expect(firstDelete).toBeGreaterThan(Math.max(...lastCommit.slice(0, 8)));
    for (const id of old) expect(asc.assets.has(id)).toBe(false);
    expect(asc.assets.size).toBe(16);
    expect(asc.shown("loc-en", "APP_SCREENSHOT", "IPHONE_DUO_OUTER_PROFILE")).toEqual(
      PANELS.map((p) => `${p}_duoOuter.jpg`),
    );
  });

  it("reuses an asset already in the library instead of uploading it again", async () => {
    const asc = fakeAsc();
    await syncer(asc).run({ ...RUN, root, locales: ["en-US"], only: ["header"] });
    for (const p of [...asc.placements.keys()]) asc.placements.delete(p); // e.g. deliver cleared the page
    asc.uploads.length = 0;
    await syncer(asc).run({ ...RUN, root, locales: ["en-US"], only: ["header"] });
    expect(asc.uploads).toEqual([]);
    expect(asc.shown("loc-en", "PRODUCT_PAGE_HEADER_ASSET", "HEADER_WIDE_PROFILE")).toEqual([
      "header-21x9.png",
    ]);
  });

  it("stops on a FAILED upload with Apple's reason, before touching the page", async () => {
    const asc = fakeAsc();
    await syncer(asc).run({ ...RUN, root, locales: ["en-US"], only: ["duo"] });
    const before = asc.placements.size;
    const asc2Root = fixtureDir({ salt: 3, locales: ["en-US"] });
    const failing = fakeAsc({ failFile: "01_booth_duoOuter.jpg" });
    await expect(
      syncer(failing).run({ ...RUN, root: asc2Root, locales: ["en-US"], only: ["duo"] }),
    ).rejects.toThrow(/01_booth_duoOuter\.jpg: processing FAILED \(IMAGE_INCORRECT_DIMENSIONS: bad size\)/);
    expect(mutations(failing.calls).some((c) => c.includes("Placements"))).toBe(false);
    expect(asc.placements.size).toBe(before);
  });

  it("stops when Apple matches a screenshot to another spec than its group takes", async () => {
    const asc = fakeAsc({ specOverride: { "header-21x9.png": "s-6.9" } });
    await expect(syncer(asc).run({ ...RUN, root, locales: ["en-US"], only: ["header"] })).rejects.toThrow(
      /header-21x9\.png: Apple matched spec s-6\.9/,
    );
  });

  it("times out on an upload that never finishes processing", async () => {
    const asc = fakeAsc();
    let t = 0;
    const s = createSync({
      api: asc.api,
      uploadFetch: asc.uploadFetch,
      log: () => {},
      wait: async () => {},
      pollMs: 0,
      now: () => (t += 600_000),
    });
    // the fake needs 2 polls; the clock moves 600 s per read, the limit is 500 s
    await expect(
      s.run({ ...RUN, root, locales: ["en-US"], only: ["header"], timeoutMs: 500_000 }),
    ).rejects.toThrow(/still UPLOAD_COMPLETE/);
  });

  it("dry run reads but never writes", async () => {
    const asc = fakeAsc();
    const res = await syncer(asc).run({ ...RUN, root, dryRun: true });
    expect(mutations(asc.calls)).toEqual([]);
    expect(res.slots.every((s) => s.status === "planned")).toBe(true);
  });

  it("needs an editable version", async () => {
    const asc = fakeAsc({ versions: ["READY_FOR_DISTRIBUTION"] });
    await expect(syncer(asc).run({ ...RUN, root })).rejects.toThrow(/No editable IOS App Store version/);
  });

  it("skips a locale the version does not have, with a warning", async () => {
    const asc = fakeAsc();
    const res = await syncer(asc).run({
      ...RUN,
      root: fixtureDir({ locales: ["en-US", "tr", "de-DE"] }),
      locales: ["de-DE"],
      only: ["header"],
    });
    expect(res.warnings[0]).toMatch(/de-DE: no localization/);
    expect(mutations(asc.calls)).toEqual([]);
  });
});

describe("asset library: command line", () => {
  it("parses options and rejects unknown ones", () => {
    expect(parseArgs([])).toMatchObject({
      platform: "IOS",
      only: ["duo", "preview", "header"],
      locales: ["en-US", "tr"],
      dryRun: false,
    });
    expect(
      parseArgs(["--platform", "MAC_OS", "--only=header", "--dry-run", "--version", "1.2.0"]),
    ).toMatchObject({
      platform: "MAC_OS",
      only: ["header"],
      dryRun: true,
      version: "1.2.0",
    });
    expect(() => parseArgs(["--only", "icons"])).toThrow(/--only/);
    expect(() => parseArgs(["--platform", "TV_OS"])).toThrow(/--platform/);
    expect(() => parseArgs(["--force"])).toThrow(/unknown option/);
  });
});
