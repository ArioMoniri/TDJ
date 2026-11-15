import type { ModelReply, ModelRequest } from "@/lib/ai/provider";
import type { CatalogDeps } from "@/lib/api/catalog";
import type { AiCreds } from "./llm";

/**
 * What the device modules (lib/app/server/*) answer from: the engine worker sets it once the bundled index is
 * loaded (src/workers/engine.worker.ts). `ask` runs one model call on the page, which holds the Keychain-backed
 * native fetch and the ACP spawner (lib/app/ai.ts).
 */
export interface DeviceRuntime extends CatalogDeps {
  ask(ai: AiCreds, req: Omit<ModelRequest, "signal">): Promise<ModelReply>;
}

let current: DeviceRuntime | null = null;
export function setDeviceRuntime(r: DeviceRuntime | null) {
  current = r;
}
export function runtime(): DeviceRuntime {
  if (!current) throw new Error("T-DJ is still loading its catalogue.");
  return current;
}
