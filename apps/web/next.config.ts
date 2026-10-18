import type { NextConfig } from "next";

const config: NextConfig = {
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  transpilePackages: ["@tdj/core"],
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  outputFileTracingIncludes: {
    "/api/**": ["../../data/index/**", "../../data/knowledge/**", "../../data/cache/**"],
  },
  experimental: { optimizePackageImports: ["lucide-react"] },
  images: { unoptimized: true },
};
export default config;
