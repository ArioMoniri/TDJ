import "server-only";
import type { AiProvider } from "@/lib/types";

export interface CompleteArgs {
  provider: AiProvider;
  key: string;
  model: string;
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
}

export class LlmError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const PROVIDERS: AiProvider[] = ["anthropic", "openai", "gemini", "openrouter"];
export function isProvider(x: unknown): x is AiProvider {
  return typeof x === "string" && (PROVIDERS as string[]).includes(x);
}

/** Read the BYOK headers; the key is used for this request only and never logged or stored. */
export function aiFromHeaders(req: Request) {
  const provider = req.headers.get("x-ai-provider");
  return {
    provider: isProvider(provider) ? provider : ("anthropic" as AiProvider),
    key:
      req.headers.get("x-ai-key") ||
      req.headers.get("x-anthropic-key") ||
      process.env.ANTHROPIC_API_KEY ||
      "",
    model: req.headers.get("x-ai-model") || req.headers.get("x-anthropic-model") || "",
  };
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.2",
  gemini: "gemini-3-pro",
  openrouter: "openrouter/auto",
};

/** One text completion across providers. Returns the assistant text (JSON text when `json` is set). */
export async function complete(a: CompleteArgs): Promise<string> {
  const model = a.model || DEFAULT_MODEL[a.provider];
  const maxTokens = a.maxTokens ?? 1200;
  if (!a.key) throw new LlmError("No API key for this provider. Add one in Settings → Written reviews.", 401);
  try {
    if (a.provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: a.key });
      const msg = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: a.system + (a.json ? "\nRespond with a single JSON object and nothing else." : ""),
        messages: [{ role: "user", content: a.user }],
      });
      return msg.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("\n");
    }
    if (a.provider === "openai" || a.provider === "openrouter") {
      const base = a.provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${a.key}`,
          ...(a.provider === "openrouter" ? { "x-title": "TDJ" } : {}),
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          ...(a.json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: a.system },
            { role: "user", content: a.user },
          ],
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };
      if (!r.ok) throw new LlmError(j.error?.message || `${a.provider} returned ${r.status}`, r.status);
      return j.choices?.[0]?.message?.content ?? "";
    }
    // gemini
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(a.key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: a.system }] },
          contents: [{ role: "user", parts: [{ text: a.user }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...(a.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );
    const j = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (!r.ok) throw new LlmError(j.error?.message || `Gemini returned ${r.status}`, r.status);
    return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  } catch (e) {
    if (e instanceof LlmError) throw e;
    const msg = e instanceof Error ? e.message : "The model request failed.";
    const status = (e as { status?: number }).status;
    throw new LlmError(msg.slice(0, 300), typeof status === "number" && status >= 400 ? status : 502);
  }
}

/** Pull a JSON object out of model text (code fences, prose around it). Returns null when nothing parses. */
export function extractJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  const tries = [t, t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")];
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {}
  }
  return null;
}
