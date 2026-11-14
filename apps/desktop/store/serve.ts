/**
 * Serves the bundled app UI (ui/dist) on Linux the way the app's asset protocol does (`/booth` → booth.html),
 * and proxies `/api/*` to a TDJ server as a first-party request (what the native bridge does in the app).
 * Used for store screenshots and for reviewing the bundle in any browser:
 *   pnpm --filter @tdj/desktop exec tsx store/serve.ts   →  http://127.0.0.1:4173
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const DIST = fileURLToPath(new URL("../ui/dist/", import.meta.url));
export const DEFAULT_BACKEND = process.env.TDJ_STORE_BACKEND ?? "https://d3k5k2c1l0s5ri.cloudfront.net";

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

export function startPreview(port = 4173, backend = DEFAULT_BACKEND, root = DIST): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api/")) {
      const body = await new Promise<Buffer>((ok) => {
        const parts: Buffer[] = [];
        req.on("data", (c) => parts.push(c));
        req.on("end", () => ok(Buffer.concat(parts)));
      });
      const headers: Record<string, string> = {
        origin: backend,
        referer: `${backend}/`,
        "x-tdj-client": "app",
      };
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string" && /^(accept|content-type|cookie|x-ai-|x-anthropic-|x-tdj-)/.test(k))
          headers[k] = v;
      }
      try {
        const r = await fetch(backend + url, {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : new Uint8Array(body),
          redirect: "manual",
        });
        const out: Record<string, string> = {};
        r.headers.forEach((v, k) => {
          if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k))
            out[k] = v;
        });
        res.writeHead(r.status, out);
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "offline", offline: true }));
      }
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
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 4173);
  startPreview(port).then(() =>
    console.log(`bundled UI on http://127.0.0.1:${port} (API → ${DEFAULT_BACKEND})`),
  );
}
