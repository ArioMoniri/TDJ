import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

// Data index (data/index, data/knowledge, data/cache) is traced into the server bundle (next.config outputFileTracingIncludes) so the Lambda reads it from /var/task.
const config: OpenNextConfig = {
  default: { override: { wrapper: "aws-lambda-streaming" } },
  buildCommand: "pnpm build",
};
export default config;
