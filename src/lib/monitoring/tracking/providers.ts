/**
 * Live tracked-prompt adapters — one organic consumer question per call.
 *
 * Reuses the validator layer's pinned models (`*_MODEL`) and key reader,
 * but sends ONLY the customer's question: no website evidence, no
 * GeoViz score, no business name. That's what makes the answer a
 * measurement of what the AI would tell a real customer, unlike the
 * audit validators (which are deliberately primed with evidence).
 *
 * Web grounding is used wherever the provider's API offers it; each
 * result records `groundingMode`. These are API answers, not the
 * consumer ChatGPT / Gemini / Claude apps — customer copy must say so.
 *
 * Every failure (missing key, timeout, HTTP error, unparseable body) is
 * returned as `ok: false` → stored as NOT_MEASURED. Never thrown.
 */
import Anthropic from "@anthropic-ai/sdk";

import { readApiKey } from "@/lib/validators/apiKey";
import { CLAUDE_MODEL } from "@/lib/validators/providers/claude";
import { GEMINI_MODEL } from "@/lib/validators/providers/gemini";
import { OPENAI_MODEL } from "@/lib/validators/providers/openai";
import { PERPLEXITY_MODEL } from "@/lib/validators/providers/perplexity";

import type { ProviderAnswer, TrackingProvider, TrackingProviderRunner } from "./types";

export const TRACKING_PROMPT_VERSION = "tracking-prompt@1.0.0";
const TIMEOUT_MS = 45_000;
const MAX_TOKENS = 1500;

const SYSTEM_PROMPT =
  "You are a helpful AI assistant answering a real person's question about local businesses or services. " +
  "Answer the way you normally would. When you recommend or mention specific businesses, name them. " +
  'Reply with ONLY a JSON object: {"answer": "<your full answer>", "businesses": ["<each specific business you named, in the order you named them>"]}. ' +
  "Use an empty businesses array if you named none.";

const KEY_ENV: Record<TrackingProvider, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

const MODELS: Record<TrackingProvider, string> = {
  claude: CLAUDE_MODEL,
  openai: OPENAI_MODEL,
  gemini: GEMINI_MODEL,
  perplexity: PERPLEXITY_MODEL,
};

export function groundingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GEO_TRACKING_GROUNDING !== "off";
}

/** Lenient parse of the `{answer, businesses}` contract; falls back to the raw text. */
export function parseAnswerPayload(text: string): { answerText: string; namedBusinesses: string[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as { answer?: unknown; businesses?: unknown };
      if (typeof obj.answer === "string") {
        const named = Array.isArray(obj.businesses) ? obj.businesses.filter((b): b is string => typeof b === "string") : [];
        return { answerText: obj.answer, namedBusinesses: named };
      }
    } catch {
      /* fall through */
    }
  }
  return { answerText: text.trim(), namedBusinesses: [] };
}

type Raw = { text: string; urls: string[]; grounded: boolean };

async function callClaude(prompt: string, grounded: boolean): Promise<Raw> {
  const client = new Anthropic({ apiKey: readApiKey(KEY_ENV.claude)! });
  const res = await client.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      ...(grounded ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as never] } : {}),
    },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  const urls: string[] = [];
  let text = "";
  for (const block of res.content as unknown as Array<Record<string, unknown>>) {
    if (block.type === "text") {
      text += String(block.text ?? "");
      for (const c of (block.citations as Array<{ url?: string }> | undefined) ?? []) if (c.url) urls.push(c.url);
    }
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content as Array<{ url?: string }>) if (r.url) urls.push(r.url);
    }
  }
  return { text, urls, grounded };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const raw = await res.text();
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${raw.slice(0, 200)}`), { status: res.status });
  return JSON.parse(raw) as Record<string, unknown>;
}

async function callOpenAI(prompt: string, grounded: boolean): Promise<Raw> {
  const data = await postJson(
    "https://api.openai.com/v1/responses",
    { Authorization: `Bearer ${readApiKey(KEY_ENV.openai)!}` },
    {
      model: OPENAI_MODEL,
      instructions: SYSTEM_PROMPT,
      input: prompt,
      max_output_tokens: MAX_TOKENS,
      ...(grounded ? { tools: [{ type: "web_search_preview" }] } : {}),
    },
  );
  const urls: string[] = [];
  let text = "";
  for (const item of (data.output as Array<Record<string, unknown>>) ?? []) {
    if (item.type !== "message") continue;
    for (const part of (item.content as Array<Record<string, unknown>>) ?? []) {
      if (part.type !== "output_text") continue;
      text += String(part.text ?? "");
      for (const a of (part.annotations as Array<{ type?: string; url?: string }>) ?? []) if (a.url) urls.push(a.url);
    }
  }
  return { text, urls, grounded };
}

async function callGemini(prompt: string, grounded: boolean): Promise<Raw> {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    { "x-goog-api-key": readApiKey(KEY_ENV.gemini)! },
    {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS },
      ...(grounded ? { tools: [{ google_search: {} }] } : {}),
    },
  );
  const cand = ((data.candidates as Array<Record<string, unknown>>) ?? [])[0] ?? {};
  const parts = ((cand.content as { parts?: Array<{ text?: string }> })?.parts) ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  const urls: string[] = [];
  const chunks = ((cand.groundingMetadata as { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> })?.groundingChunks) ?? [];
  for (const ch of chunks) {
    const title = ch.web?.title?.trim() ?? "";
    // Gemini returns redirect URIs; the title carries the real source domain.
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title)) urls.push(`https://${title.toLowerCase()}`);
    else if (ch.web?.uri && !/vertexaisearch\.cloud\.google\.com/.test(ch.web.uri)) urls.push(ch.web.uri);
  }
  return { text, urls, grounded };
}

async function callPerplexity(prompt: string): Promise<Raw> {
  const data = await postJson(
    "https://api.perplexity.ai/chat/completions",
    { Authorization: `Bearer ${readApiKey(KEY_ENV.perplexity)!}` },
    {
      model: PERPLEXITY_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    },
  );
  const msg = ((data.choices as Array<{ message?: { content?: string } }>) ?? [])[0]?.message?.content ?? "";
  const urls = [
    ...((data.citations as string[]) ?? []),
    ...(((data.search_results as Array<{ url?: string }>) ?? []).map((r) => r.url ?? "")),
  ].filter((u) => typeof u === "string" && u.length > 0);
  return { text: msg, urls, grounded: true }; // sonar is search-grounded natively
}

function classify(err: unknown): { errorCode: "timeout" | "provider_error"; errorMessage: string } {
  const e = err as { name?: string; message?: string };
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || /timed? ?out/i.test(e?.message ?? "")) {
    return { errorCode: "timeout", errorMessage: `Timed out after ${TIMEOUT_MS / 1000}s` };
  }
  return { errorCode: "provider_error", errorMessage: (e?.message ?? String(err)).slice(0, 300) };
}

export function createLiveTrackingRunner(env: Record<string, string | undefined> = process.env): TrackingProviderRunner {
  return async (provider, prompt): Promise<ProviderAnswer> => {
    const started = Date.now();
    const model = MODELS[provider];
    if (!readApiKey(KEY_ENV[provider])) {
      return { ok: false, provider, model, errorCode: "unavailable", errorMessage: `${KEY_ENV[provider]} not configured`, latencyMs: 0 };
    }
    const grounded = groundingEnabled(env);
    const call = (g: boolean) =>
      provider === "claude"
        ? callClaude(prompt, g)
        : provider === "openai"
          ? callOpenAI(prompt, g)
          : provider === "gemini"
            ? callGemini(prompt, g)
            : callPerplexity(prompt);
    try {
      let raw: Raw;
      try {
        raw = await call(grounded);
      } catch (err) {
        // A model/plan without web-search support → one ungrounded retry, recorded as such.
        const status = (err as { status?: number }).status;
        if (!grounded || provider === "perplexity" || status !== 400) throw err;
        raw = await call(false);
      }
      if (!raw.text.trim()) {
        return { ok: false, provider, model, errorCode: "parse_error", errorMessage: "Empty answer", latencyMs: Date.now() - started };
      }
      const parsed = parseAnswerPayload(raw.text);
      return {
        ok: true,
        provider,
        model,
        groundingMode: raw.grounded ? "web_search" : "none",
        answerText: parsed.answerText,
        namedBusinesses: parsed.namedBusinesses,
        nativeCitationUrls: raw.urls,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return { ok: false, provider, model, ...classify(err), latencyMs: Date.now() - started };
    }
  };
}
