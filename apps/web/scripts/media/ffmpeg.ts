import { execFileSync } from "node:child_process";

/** ffmpeg from FFMPEG, else the one on PATH. (No bundled copy: the cloud machines and CI images ship ffmpeg.) */
export function ffmpegPath(): string {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    return execFileSync("which", ["ffmpeg"]).toString().trim() || "ffmpeg";
  } catch {
    throw new Error(
      "ffmpeg not found: install it (brew install ffmpeg / apt-get install ffmpeg) or set FFMPEG",
    );
  }
}

export function ffmpeg(args: string[]) {
  execFileSync(ffmpegPath(), ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}
