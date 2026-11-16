import type { NextConfig } from "next";

const config: NextConfig = {
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  transpilePackages: ["@tdj/core"],
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
  // `next dev` blocks dev assets and HMR for origins other than its own host: the e2e specs that open a night link
  // made on one origin on another (rooms-share) reach the same dev server as 127.0.0.1 and as localhost
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};
export default config;
