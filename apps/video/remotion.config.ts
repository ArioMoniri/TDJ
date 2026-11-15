import { existsSync, readdirSync } from "node:fs";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("swangle");

/**
 * Remotion needs a headless shell (full Chromium dropped the old headless mode). REMOTION_BROWSER wins; else the
 * cloud machines' pre-installed Playwright headless shell; else Remotion downloads its own.
 */
function headlessShell(): string | undefined {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => d.startsWith("chromium_headless_shell-"));
  const bin = dir && `${root}/${dir}/chrome-linux/headless_shell`;
  return bin && existsSync(bin) ? bin : undefined;
}
const shell = headlessShell();
if (shell) Config.setBrowserExecutable(shell);
