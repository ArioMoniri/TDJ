import assert from "node:assert/strict";
import { test } from "node:test";
import { readiness } from "../review-readiness.mjs";

function fake({ encryption = null } = {}) {
  const calls = [];
  return {
    calls,
    get: async (p) => {
      calls.push(["GET", p]);
      if (p.startsWith("/v1/builds?"))
        return {
          data: [{ id: "b1", attributes: { processingState: "VALID", usesNonExemptEncryption: encryption } }],
        };
      if (p.includes("/appInfos?"))
        return { data: [{ id: "i1", attributes: { state: "PREPARE_FOR_SUBMISSION" } }] };
      if (p.includes("/ageRatingDeclaration"))
        return {
          data: {
            id: "d1",
            attributes: { violenceRealistic: "NONE", gambling: null, socialMediaAgeRestricted: null },
          },
        };
      if (p.includes("/appStoreVersions"))
        return {
          data: [
            {
              attributes: {
                platform: "IOS",
                versionString: "1.0.0",
                appStoreState: "PREPARE_FOR_SUBMISSION",
              },
            },
          ],
        };
      return { data: [] };
    },
    patch: async (p, b) => {
      calls.push(["PATCH", p, b]);
      return {};
    },
  };
}

test("answers an unanswered export compliance as exempt and names unanswered age-rating questions", async () => {
  const c = fake();
  const lines = [];
  const r = await readiness({
    client: c,
    appId: "1",
    build: "462004",
    platforms: ["IOS"],
    log: (l) => lines.push(l),
  });
  const patch = c.calls.find((x) => x[0] === "PATCH");
  assert.equal(patch[1], "/v1/builds/b1");
  assert.equal(patch[2].data.attributes.usesNonExemptEncryption, false);
  assert.equal(r.builds.IOS, "answered");
  assert.deepEqual(r.ageRating, ["gambling"]);
  const social = c.calls.find((x) => x[0] === "PATCH" && x[1] === "/v1/ageRatingDeclarations/d1");
  assert.equal(social[2].data.attributes.socialMediaAgeRestricted, false);
  assert.ok(lines.some((l) => /unanswered: gambling/.test(l)));
});

test("leaves an answered build alone", async () => {
  const c = fake({ encryption: false });
  await readiness({ client: c, appId: "1", build: "462004", platforms: ["IOS"], log: () => {} });
  assert.equal(c.calls.filter((x) => x[0] === "PATCH").length, 0);
});
