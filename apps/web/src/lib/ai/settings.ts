import type { AcpConnection } from "./acp";
import type { KeyProvider } from "./models";

/**
 * Round 22 — Settings → Models as pure functions over the DJ's settings: the keys per provider, the ACP connections,
 * and which one every generation uses (`ai`). Keys stay in this browser (BYOK).
 */
export interface ModelSettings {
  ai: {
    provider: KeyProvider | "acp";
    key: string;
    model: string;
    workspace?: string;
    acpId?: string;
  };
  aiKeys?: Partial<Record<KeyProvider, { key: string; model?: string; workspace?: string }>>;
  acp?: AcpConnection[];
}

/** the saved key of a provider (the active one may predate `aiKeys`) */
export function keyOf(s: ModelSettings, p: KeyProvider): { key: string; model: string; workspace?: string } {
  const saved = s.aiKeys?.[p];
  if (saved) return { key: saved.key, model: saved.model ?? "", workspace: saved.workspace };
  if (s.ai.provider === p) return { key: s.ai.key, model: s.ai.model, workspace: s.ai.workspace };
  return { key: "", model: "" };
}

/** edit a provider's key, model or workspace; the active model follows when it is that provider */
export function withKey(
  s: ModelSettings,
  p: KeyProvider,
  patch: Partial<{ key: string; model: string; workspace: string }>,
): Pick<ModelSettings, "ai" | "aiKeys"> {
  const next = { ...keyOf(s, p), ...patch };
  const aiKeys = { ...(s.aiKeys ?? {}), [p]: next };
  const ai = s.ai.provider === p ? { ...s.ai, ...next } : s.ai;
  return { ai, aiKeys };
}

/** every generation uses this provider's key from now on */
export function chooseKeyProvider(s: ModelSettings, p: KeyProvider): Pick<ModelSettings, "ai" | "aiKeys"> {
  const k = keyOf(s, p);
  // the key being left is kept, so switching back needs no retyping
  const aiKeys =
    s.ai.provider !== "acp" && s.ai.key && !s.aiKeys?.[s.ai.provider]
      ? {
          ...(s.aiKeys ?? {}),
          [s.ai.provider]: { key: s.ai.key, model: s.ai.model, workspace: s.ai.workspace },
        }
      : (s.aiKeys ?? {});
  return { ai: { provider: p, key: k.key, model: k.model, workspace: k.workspace }, aiKeys };
}

/** every generation uses this agent from now on */
export function chooseAgent(s: ModelSettings, id: string): Pick<ModelSettings, "ai" | "aiKeys"> {
  const aiKeys =
    s.ai.provider !== "acp" && s.ai.key && !s.aiKeys?.[s.ai.provider]
      ? {
          ...(s.aiKeys ?? {}),
          [s.ai.provider]: { key: s.ai.key, model: s.ai.model, workspace: s.ai.workspace },
        }
      : (s.aiKeys ?? {});
  return { ai: { provider: "acp", key: "", model: "", acpId: id }, aiKeys };
}

export function saveAgent(s: ModelSettings, c: AcpConnection): Pick<ModelSettings, "acp"> {
  const list = s.acp ?? [];
  return { acp: list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c] };
}

/** delete an agent; when it was in use, generations go back to Anthropic */
export function removeAgent(s: ModelSettings, id: string): Pick<ModelSettings, "acp" | "ai"> {
  const acp = (s.acp ?? []).filter((x) => x.id !== id);
  if (s.ai.provider === "acp" && s.ai.acpId === id) {
    const k = keyOf(s, "anthropic");
    return { acp, ai: { provider: "anthropic", key: k.key, model: k.model, workspace: k.workspace } };
  }
  return { acp, ai: s.ai };
}

export const newAgentId = () => `acp-${Math.random().toString(36).slice(2, 9)}`;
