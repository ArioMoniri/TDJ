// Running other programs. Secrets travel only through stdin or the child's environment, never through argv
// (argv is visible to every user of the machine in `ps`) and never through a file on disk.
import { spawn, spawnSync } from "node:child_process";

/**
 * @typedef {{ input?: string, env?: Record<string,string|undefined>, cwd?: string, allowFail?: boolean }} RunOpts
 * @typedef {{ status: number, stdout: string, stderr: string }} RunResult
 * @typedef {(cmd: string, args: string[], o?: RunOpts) => RunResult} Run
 * @typedef {(cmd: string, args: string[], o?: RunOpts) => Promise<number>} Live
 */

/** @type {Run} */
export function run(cmd, args, o = {}) {
  const r = spawnSync(cmd, args, {
    input: o.input,
    cwd: o.cwd,
    env: o.env ? { ...process.env, ...o.env } : process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const res = {
    status: r.error ? 127 : (r.status ?? 1),
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? (r.error?.message || ""),
  };
  if (res.status !== 0 && !o.allowFail) {
    throw new Error(
      `${cmd} ${args[0] ?? ""} failed${res.stderr ? `: ${res.stderr.trim().split("\n").pop()}` : ""}`,
    );
  }
  return res;
}

/** Streams the child's output to the terminal (long steps: deploys, installs). @type {Live} */
export function live(cmd, args, o = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: o.cwd,
      env: o.env ? { ...process.env, ...o.env } : process.env,
      stdio: ["inherit", "inherit", "inherit"],
    });
    child.on("error", () => resolve(127));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/** @param {Run} r @param {string} cmd */
export const has = (r, cmd) =>
  r(process.platform === "win32" ? "where" : "which", [cmd], { allowFail: true }).status === 0;

/** Opens a page in the default browser (best effort; the link is printed anyway). @param {Run} r @param {string} url */
export function openUrl(r, url) {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  r(opener, [url], { allowFail: true });
}
