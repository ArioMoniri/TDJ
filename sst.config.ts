/// <reference path="./.sst/platform/config.d.ts" />
/**
 * TDJ on AWS with SST v4 (OpenNext): CloudFront + Lambda + S3, one command: `pnpm deploy`.
 * Stages: `sst deploy --stage production` | `sst deploy --stage dev`.
 */
export default $config({
  app(input) {
    return {
      name: "tdj",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage ?? ""),
      home: "aws",
      providers: {
        aws: {
          region: (process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1") as "us-east-1",
        },
      },
    };
  },
  async run() {
    // Connector secrets (docs/DEPLOY.md → Connectors) travel from the GitHub Actions env into the function only
    // when set; they never reach the client bundle.
    const secrets = [
      "SPOTIFY_CLIENT_ID",
      "SPOTIFY_CLIENT_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "DROPBOX_APP_KEY",
      "DROPBOX_APP_SECRET",
      "TDJ_COOKIE_SECRET",
      "PIPEDREAM_PROJECT_ID",
      "PIPEDREAM_CLIENT_ID",
      "PIPEDREAM_CLIENT_SECRET",
      "PIPEDREAM_ENVIRONMENT",
    ] as const;
    const connectors: Record<string, string> = {};
    for (const k of secrets) if (process.env[k]) connectors[k] = process.env[k]!;
    const web = new sst.aws.Nextjs("Web", {
      path: "apps/web",
      environment: {
        TDJ_DATA_ROOT: "/var/task",
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
        ...connectors,
      },
      server: { memory: "1536 MB", timeout: "30 seconds", architecture: "arm64" },
      domain: process.env.TDJ_DOMAIN ? { name: process.env.TDJ_DOMAIN } : undefined,
    });
    return { url: web.url };
  },
});
