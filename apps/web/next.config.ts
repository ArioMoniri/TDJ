import type { NextConfig } from "next";
// one version for web + apps: the root package.json (docs/RELEASING.md → One version); Settings → About shows it
import { releaseEnv } from "../../scripts/release/version.mjs";

const config: NextConfig = {
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  transpilePackages: ["@tdj/core"],
  env: releaseEnv(),
  // wave 4: the Open Graph cover (api/night/og) rasterises with resvg, a native addon: loaded at run time, never bundled
  serverExternalPackages: ["@resvg/resvg-js"],
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  outputFileTracingIncludes: {
    "/api/**": ["../../data/index/**", "../../data/knowledge/**", "../../data/cache/**"],
  },
  experimental: { optimizePackageImports: ["lucide-react"] },
  // the repo keeps its agent notes in CLAUDE.md; no generated AGENTS.md in the app folder
  agentRules: false,
  images: { unoptimized: true },
};
export default config;
