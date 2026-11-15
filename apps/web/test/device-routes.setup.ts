import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeDeviceRoutes } from "../scripts/device-routes.mjs";

/**
 * The device copies of the server routes the apps run unchanged, written the way the app build writes them, so
 * src/lib/app/routes.test.ts checks exactly what ships (they are removed after the run).
 */
const src = fileURLToPath(new URL("../src", import.meta.url));
const out = fileURLToPath(new URL("../src/lib/app/__device__", import.meta.url));

export function setup() {
  rmSync(out, { recursive: true, force: true });
  writeDeviceRoutes(src, out);
}
export function teardown() {
  rmSync(out, { recursive: true, force: true });
}
