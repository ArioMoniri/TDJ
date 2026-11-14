// `tdj doctor`: what is installed and signed in, and which deploy route that allows.

/** @param {import("./deploy.mjs").Ctx} ctx */
export function checks(ctx) {
  const ok = (/** @type {string} */ cmd, /** @type {string[]} */ args) =>
    ctx.run(cmd, args, { allowFail: true });
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const aws = ok("aws", ["--version"]).status === 0;
  const awsId = aws ? ok("aws", ["sts", "get-caller-identity", "--output", "json"]) : null;
  const gh = ok("gh", ["--version"]).status === 0;
  return [
    { name: "Node.js 22+", pass: nodeMajor >= 22, fix: "https://nodejs.org (LTS)" },
    { name: "git", pass: ok("git", ["--version"]).status === 0, fix: "https://git-scm.com/downloads" },
    { name: "pnpm (aws route)", pass: ok("pnpm", ["--version"]).status === 0, fix: "corepack enable" },
    {
      name: "AWS CLI",
      pass: aws,
      fix: "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
    },
    { name: "AWS credentials", pass: awsId?.status === 0, fix: "aws configure sso   (or aws configure)" },
    { name: "GitHub CLI", pass: gh, fix: "https://cli.github.com" },
    { name: "GitHub login", pass: gh && ok("gh", ["auth", "status"]).status === 0, fix: "gh auth login" },
  ];
}

/** @param {import("./deploy.mjs").Ctx} ctx */
export function doctor(ctx) {
  const { c, log } = ctx;
  const list = checks(ctx);
  for (const r of list)
    log(`${r.pass ? c.green("✓") : c.yellow("•")} ${r.name}${r.pass ? "" : c.dim(`  → ${r.fix}`)}`);
  const by = Object.fromEntries(list.map((r) => [r.name, r.pass]));
  const aws = by["AWS credentials"] && by["pnpm (aws route)"];
  const github = by["GitHub login"];
  log();
  log(
    aws || github
      ? `Ready for: ${[aws && "--route aws", github && "--route github"].filter(Boolean).join(" and ")}`
      : "Sign in with `gh auth login` (install the GitHub CLI first if needed): the fork route needs nothing else here.",
  );
  return aws || github ? 0 : 1;
}
