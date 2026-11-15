/**
 * Serves the bundled app UI (ui/dist) on Linux the way the app's asset protocol does (`/booth` → booth.html).
 * The bundle is standalone: its own adapter answers `/api/*` in the page, so this server serves files only and
 * counts any `/api/*` request that reaches it (there should be none). Used for store screenshots, the standalone
 * check (store/standalone.ts) and for reviewing the bundle in any browser:
 *   pnpm --filter @tdj/desktop exec tsx store/serve.ts   →  http://127.0.0.1:4173
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const DIST = fileURLToPath(new URL("../ui/dist/", import.meta.url));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".lottie": "application/zip",
  ".mp3": "audio/mpeg",
};

/** URL path → file in `root` (path, path.html, path/index.html), never outside `root`. */
export function resolveAsset(root: string, urlPath: string): string | null {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0] ?? "/")).replace(/^(\.\.(\/|\\|$))+/, "");
  if (clean.includes("..")) return null;
  const base = join(root, clean);
  for (const c of [base, `${base}.html`, join(base, "index.html")]) {
    if (c.startsWith(root) && existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

export type Preview = Server & { apiHits: string[] };

export function startPreview(port = 4173, root = DIST): Promise<Preview> {
  const apiHits: string[] = [];
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api/")) {
      apiHits.push(`${req.method} ${url}`);
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "The app answers /api itself; nothing is served here." }));
      return;
    }
    const file = resolveAsset(root, url) ?? resolveAsset(root, "/404.html");
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(file.endsWith("404.html") ? 404 : 200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    });
    res.end(readFileSync(file));
  }) as Preview;
  server.apiHits = apiHits;
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 4173);
  startPreview(port).then(() => console.log(`bundled UI on http://127.0.0.1:${port} (standalone)`));
}
