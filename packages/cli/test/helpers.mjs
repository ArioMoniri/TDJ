// A fake system for the CLI tests: records every command (argv, stdin, env) and answers from a table keyed by
// the start of the command line. Nothing is ever executed.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @param {Record<string, {status?: number, stdout?: string, stderr?: string}>} [table] @param {Record<string, number>} [liveCodes] */
export function fakeSys(table = {}, liveCodes = {}) {
  /** @type {{cmd: string, args: string[], input?: string, env?: Record<string, string | undefined>, cwd?: string, live?: boolean}[]} */
  const calls = [];
  /** @param {string} cmd @param {string[]} args */
  const lookup = (cmd, args) => {
    const line = `${cmd} ${args.join(" ")}`;
    const key = Object.keys(table)
      .filter((k) => line.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    return key ? table[key] : undefined;
  };
  /** @type {import("../src/sys.mjs").Run} */
  const run = (cmd, args, o = {}) => {
    calls.push({ cmd, args, input: o.input, env: o.env, cwd: o.cwd });
    const r = lookup(cmd, args) ?? {};
    const res = { status: r.status ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    if (res.status !== 0 && !o.allowFail) throw new Error(`${cmd} failed`);
    return res;
  };
  /** @type {import("../src/sys.mjs").Live} */
  const live = async (cmd, args, o = {}) => {
    calls.push({ cmd, args, env: o.env, cwd: o.cwd, live: true });
    const line = `${cmd} ${args.join(" ")}`;
    const key = Object.keys(liveCodes).find((k) => line.startsWith(k));
    return key ? (liveCodes[key] ?? 0) : 0;
  };
  const lines = () => calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
  return { run, live, calls, lines };
}

/** A minimal TDJ checkout in a temp folder. @param {{ url?: string }} [o] */
export function checkout(o = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tdj-co-"));
  writeFileSync(join(dir, "sst.config.ts"), "");
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages: []\n");
  if (o.url) {
    mkdirSync(join(dir, ".sst"));
    writeFileSync(join(dir, ".sst", "outputs.json"), JSON.stringify({ url: o.url }));
  }
  return dir;
}

export const IDENTITY = {
  stdout: JSON.stringify({ Account: "123456789012", Arn: "arn:aws:iam::123456789012:user/dj" }),
};

/** Collects log lines. */
export function output() {
  /** @type {string[]} */
  const out = [];
  return { out, log: (/** @type {string} */ s = "") => out.push(s), text: () => out.join("\n") };
}

export const quiet = () => {};
