/**
 * Live tracked-prompt adapters — one organic consumer question per call.
 *
 * The question is sent exactly as a customer would type it: no system
 * prompt, no website evidence, no GeoViz score, no business name, no
 * output-format instructions (prompt version 2). Reuses the validator
 * layer's pinned models and key reader. Web search is used wherever the
 * API offers it; every sample records its exact `searchSettings`.
 * These are API answers, NOT the consumer ChatGPT / Claude / Gemini /
 * Perplexity apps — results can differ from what those apps show.
 *
 * Outcomes: a definite provider error is `failed`; a timeout or dropped
 * connection is `unknown` (the provider may have processed and billed the
 * request) and is never retried automatically — see cycle.ts.
 *
 * OpenAI uses Responses API background mode: the response id is handed to
 * `onSubmitted` (persisted) BEFORE we wait for the answer, so after a crash
 * the result is retrieved by id instead of paying for a second request.
 * Anthropic Messages, Gemini generateContent, and Perplexity chat
 * completions offer no idempotency key or request retrieval.
 */
import Anthropic from "@anthropic-ai/sdk";

import { readApiKey } from "@/lib/validators/apiKey";
import { CLAUDE_MODEL } from "@/lib/validators/providers/claude";
import { GEMINI_MODEL } from "@/lib/validators/providers/gemini";
import { OPENAI_MODEL } from "@/lib/validators/providers/openai";
import { PERPLEXITY_MODEL } from "@/lib/validators/providers/perplexity";

import type { SampleUsage } from "./pricing";
import type {
  ProviderAnswer,
  RawCapture,
  SearchSettings,
  StillRunning,
  TrackingProvider,
  TrackingProviderClient,
} from "./types";

export const TRACKING_PROMPT_VERSION = "tracking-prompt@2.0.0";
const TIMEOUT_MS = 60_000;
const OPENAI_POLL_MS = 1_500;
const MAX_OUTPUT_TOKENS = 2_048;
const RAW_TEXT_LIMIT = 20_000;

const KEY_ENV: Record<TrackingProvider, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};
export const TRACKING_MODELS: Record<TrackingProvider, string> = {
  claude: CLAUDE_MODEL,
  openai: OPENAI_MODEL,
  gemini: GEMINI_MODEL,
  perplexity: PERPLEXITY_MODEL,
};

export function groundingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GEO_TRACKING_GROUNDING !== "off";
}

export function searchSettingsFor(provider: TrackingProvider, grounded: boolean): SearchSettings {
  if (provider === "perplexity") return { grounding: "web_search", tool: "sonar-native" };
  if (!grounded) return { grounding: "none", tool: null };
  const tool = { claude: "web_search_20250305", openai: "web_search_preview", gemini: "google_search" }[provider];
  return { grounding: "web_search", tool };
}

type Parsed = { text: string; raw: RawCapture; usage: SampleUsage; nativeUrls: string[] };

class ProviderHttpError extends Error {
  constructor(public status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

async function requestJson(method: "GET" | "POST", url: string, headers: Record<string, string>, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderHttpError(res.status, text);
  return JSON.parse(text) as Record<string, unknown>;
}

const capRaw = (raw: RawCapture): RawCapture => ({ ...raw, text: raw.text.slice(0, RAW_TEXT_LIMIT), citations: raw.citations.slice(0, 50) });

// ── Anthropic ───────────────────────────────────────────────────────────
async function callClaude(prompt: string, grounded: boolean): Promise<Parsed> {
  const client = new Anthropic({ apiKey: readApiKey(KEY_ENV.claude)!, maxRetries: 0 });
  const res = await client.messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: prompt }],
      ...(grounded ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as never] } : {}),
    },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  const citations: RawCapture["citations"] = [];
  const queries: string[] = [];
  let text = "";
  for (const block of res.content as unknown as Array<Record<string, unknown>>) {
    if (block.type === "text") {
      text += String(block.text ?? "");
      for (const c of (block.citations as Array<{ url?: string; title?: string; cited_text?: string }> | undefined) ?? []) {
        if (c.url) citations.push({ url: c.url, title: c.title ?? null, citedText: c.cited_text ?? null });
      }
    } else if (block.type === "server_tool_use") {
      const q = (block.input as { query?: string } | undefined)?.query;
      if (q) queries.push(q);
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content as Array<{ url?: string; title?: string }>) if (r.url) citations.push({ url: r.url, title: r.title ?? null });
    }
  }
  const u = res.usage as unknown as { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
  return {
    text,
    nativeUrls: citations.map((c) => c.url),
    usage: { inputTokens: u.input_tokens ?? null, outputTokens: u.output_tokens ?? null, searchCalls: u.server_tool_use?.web_search_requests ?? 0 },
    raw: { text, citations, searchQueries: queries, finishReason: res.stop_reason ?? null, responseId: res.id, usage: res.usage },
  };
}

// ── OpenAI (Responses API, background mode for retrieval) ───────────────
const openaiHeaders = () => ({ Authorization: `Bearer ${readApiKey(KEY_ENV.openai)!}` });

export function parseOpenAIResponse(data: Record<string, unknown>): Parsed {
  const citations: RawCapture["citations"] = [];
  const queries: string[] = [];
  let text = "";
  let searchCalls = 0;
  for (const item of (data.output as Array<Record<string, unknown>>) ?? []) {
    if (item.type === "web_search_call") {
      searchCalls += 1;
      const q = (item.action as { query?: string } | undefined)?.query;
      if (q) queries.push(q);
    }
    if (item.type !== "message") continue;
    for (const part of (item.content as Array<Record<string, unknown>>) ?? []) {
      if (part.type !== "output_text") continue;
      text += String(part.text ?? "");
      for (const a of (part.annotations as Array<{ url?: string; title?: string }>) ?? []) if (a.url) citations.push({ url: a.url, title: a.title ?? null });
    }
  }
  const u = (data.usage as { input_tokens?: number; output_tokens?: number } | undefined) ?? {};
  const incomplete = (data.incomplete_details as { reason?: string } | null | undefined)?.reason ?? null;
  return {
    text,
    nativeUrls: citations.map((c) => c.url),
    usage: { inputTokens: u.input_tokens ?? null, outputTokens: u.output_tokens ?? null, searchCalls },
    raw: { text, citations, searchQueries: queries, finishReason: incomplete ?? String(data.status ?? ""), responseId: String(data.id ?? "") || null, usage: data.usage ?? null },
  };
}

async function openaiRetrieve(id: string): Promise<{ status: string; data: Record<string, unknown> }> {
  const data = await requestJson("GET", `https://api.openai.com/v1/responses/${encodeURIComponent(id)}`, openaiHeaders());
  return { status: String(data.status ?? ""), data };
}

const isStill = (x: Record<string, unknown> | StillRunning): x is StillRunning => (x as StillRunning).pending === true;

/** Poll a background response until it finishes or the wait budget runs out. */
async function openaiAwait(id: string, budgetMs: number): Promise<Record<string, unknown> | StillRunning> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const { status, data } = await openaiRetrieve(id);
    if (status !== "queued" && status !== "in_progress") return data;
    if (Date.now() > deadline) return { pending: true };
    await new Promise((r) => setTimeout(r, OPENAI_POLL_MS));
  }
}

// ── Gemini ──────────────────────────────────────────────────────────────
async function callGemini(prompt: string, grounded: boolean): Promise<Parsed> {
  const data = await requestJson(
    "POST",
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    { "x-goog-api-key": readApiKey(KEY_ENV.gemini)! },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS * 2 },
      ...(grounded ? { tools: [{ google_search: {} }] } : {}),
    },
  );
  const cand = ((data.candidates as Array<Record<string, unknown>>) ?? [])[0] ?? {};
  const text = (((cand.content as { parts?: Array<{ text?: string }> })?.parts) ?? []).map((p) => p.text ?? "").join("");
  const gm = (cand.groundingMetadata as {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    groundingSupports?: Array<{ segment?: { text?: string }; groundingChunkIndices?: number[] }>;
    webSearchQueries?: string[];
  }) ?? {};
  const chunks = gm.groundingChunks ?? [];
  const spanFor = (i: number) => gm.groundingSupports?.find((s) => s.groundingChunkIndices?.includes(i))?.segment?.text ?? null;
  const citations: RawCapture["citations"] = chunks.map((ch, i) => {
    const title = ch.web?.title?.trim() ?? "";
    // Gemini returns redirect URIs; the title carries the real source domain.
    const url = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title) ? `https://${title.toLowerCase()}` : (ch.web?.uri ?? "");
    return { url, title: title || null, citedText: spanFor(i) };
  }).filter((c) => c.url && !/vertexaisearch\.cloud\.google\.com/.test(c.url));
  const um = (data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number }) ?? {};
  const queries = gm.webSearchQueries ?? [];
  return {
    text,
    nativeUrls: citations.map((c) => c.url),
    usage: {
      inputTokens: (um.promptTokenCount ?? 0) + (um.toolUsePromptTokenCount ?? 0),
      outputTokens: (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0),
      searchCalls: queries.length > 0 ? 1 : 0, // billed per grounded prompt
    },
    raw: { text, citations, searchQueries: queries, finishReason: String(cand.finishReason ?? "") || null, responseId: String(data.responseId ?? "") || null, usage: data.usageMetadata ?? null },
  };
}

// ── Perplexity ──────────────────────────────────────────────────────────
async function callPerplexity(prompt: string): Promise<Parsed> {
  const data = await requestJson(
    "POST",
    "https://api.perplexity.ai/chat/completions",
    { Authorization: `Bearer ${readApiKey(KEY_ENV.perplexity)!}` },
    { model: PERPLEXITY_MODEL, max_tokens: MAX_OUTPUT_TOKENS, messages: [{ role: "user", content: prompt }] },
  );
  const choice = ((data.choices as Array<{ message?: { content?: string }; finish_reason?: string }>) ?? [])[0];
  const text = choice?.message?.content ?? "";
  const results = (data.search_results as Array<{ url?: string; title?: string }>) ?? [];
  const citations: RawCapture["citations"] = [
    ...results.filter((r) => r.url).map((r) => ({ url: r.url!, title: r.title ?? null })),
    ...((data.citations as string[]) ?? []).filter((u) => typeof u === "string" && !results.some((r) => r.url === u)).map((url) => ({ url })),
  ];
  const u = (data.usage as { prompt_tokens?: number; completion_tokens?: number; search_context_size?: string; cost?: { total_cost?: number } }) ?? {};
  return {
    text,
    nativeUrls: citations.map((c) => c.url),
    usage: {
      inputTokens: u.prompt_tokens ?? null,
      outputTokens: u.completion_tokens ?? null,
      searchCalls: 1, // per-request fee
      searchContextSize: u.search_context_size ?? null,
      reportedCostUsd: typeof u.cost?.total_cost === "number" ? u.cost.total_cost : null,
    },
    raw: { text, citations, searchQueries: [], finishReason: choice?.finish_reason ?? null, responseId: String(data.id ?? "") || null, usage: data.usage ?? null },
  };
}

// ── Outcome classification ──────────────────────────────────────────────
export function classifyError(err: unknown): { outcome: "failed" | "unknown"; errorCode: "provider_error" | "timeout" | "network_error"; errorMessage: string } {
  const e = err as { name?: string; message?: string; status?: number };
  if (err instanceof ProviderHttpError || typeof e?.status === "number") {
    return { outcome: "failed", errorCode: "provider_error", errorMessage: (e.message ?? String(err)).slice(0, 300) };
  }
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || e?.name === "APIUserAbortError" || e?.name === "APIConnectionTimeoutError" || /timed? ?out/i.test(e?.message ?? "")) {
    return { outcome: "unknown", errorCode: "timeout", errorMessage: `No answer within ${TIMEOUT_MS / 1000}s — the request may still have been processed and billed.` };
  }
  return { outcome: "unknown", errorCode: "network_error", errorMessage: `Connection failed (${(e?.message ?? String(err)).slice(0, 160)}) — the request may have been processed.` };
}

function answerFrom(provider: TrackingProvider, parsed: Parsed, settings: SearchSettings, started: number, requestId: string | null): ProviderAnswer {
  if (!parsed.text.trim()) {
    return { ok: false, provider, model: TRACKING_MODELS[provider], outcome: "failed", errorCode: "empty_answer", errorMessage: `Empty answer (finish: ${parsed.raw.finishReason ?? "unknown"})`, providerRequestId: requestId, latencyMs: Date.now() - started };
  }
  return {
    ok: true,
    provider,
    model: TRACKING_MODELS[provider],
    searchSettings: settings,
    answerText: parsed.text,
    nativeCitationUrls: parsed.nativeUrls,
    raw: capRaw(parsed.raw),
    usage: parsed.usage,
    providerRequestId: requestId ?? parsed.raw.responseId,
    latencyMs: Date.now() - started,
  };
}

export function createLiveTrackingClient(env: Record<string, string | undefined> = process.env): TrackingProviderClient {
  const grounded = groundingEnabled(env);
  return {
    supportsRetrieval: (provider) => provider === "openai",

    async run(provider, prompt, hooks) {
      const started = Date.now();
      if (!readApiKey(KEY_ENV[provider])) {
        return { ok: false, provider, model: TRACKING_MODELS[provider], outcome: "failed", errorCode: "unavailable", errorMessage: `${KEY_ENV[provider]} not configured`, latencyMs: 0 };
      }
      const settings = searchSettingsFor(provider, grounded);
      try {
        if (provider === "openai") {
          let created: Record<string, unknown>;
          try {
            created = await requestJson("POST", "https://api.openai.com/v1/responses", openaiHeaders(), {
              model: OPENAI_MODEL,
              input: prompt,
              max_output_tokens: MAX_OUTPUT_TOKENS,
              background: true,
              store: true,
              ...(grounded ? { tools: [{ type: "web_search_preview" }] } : {}),
            });
          } catch (err) {
            // Background mode unsupported for this model/tool combination → synchronous (no retrieval).
            if (!(err instanceof ProviderHttpError) || err.status !== 400) throw err;
            const data = await requestJson("POST", "https://api.openai.com/v1/responses", openaiHeaders(), {
              model: OPENAI_MODEL,
              input: prompt,
              max_output_tokens: MAX_OUTPUT_TOKENS,
              ...(grounded ? { tools: [{ type: "web_search_preview" }] } : {}),
            });
            return answerFrom(provider, parseOpenAIResponse(data), { ...settings, tool: `${settings.tool ?? "none"}(sync)` }, started, String(data.id ?? "") || null);
          }
          const id = String(created.id ?? "");
          if (id && hooks?.onSubmitted) await hooks.onSubmitted(id);
          const done = await openaiAwait(id, TIMEOUT_MS);
          if (isStill(done)) return done; // still running provider-side → caller keeps it in_flight and retrieves later
          if (String(done.status) === "failed" || String(done.status) === "cancelled") {
            return { ok: false, provider, model: OPENAI_MODEL, outcome: "failed", errorCode: "provider_error", errorMessage: `Response ${done.status}: ${JSON.stringify(done.error ?? {}).slice(0, 200)}`, providerRequestId: id, latencyMs: Date.now() - started };
          }
          return answerFrom(provider, parseOpenAIResponse(done), settings, started, id);
        }
        const parsed = provider === "claude" ? await callClaude(prompt, grounded) : provider === "gemini" ? await callGemini(prompt, grounded) : await callPerplexity(prompt);
        return answerFrom(provider, parsed, settings, started, null);
      } catch (err) {
        return { ok: false, provider, model: TRACKING_MODELS[provider], ...classifyError(err), latencyMs: Date.now() - started };
      }
    },

    async retrieve(provider, providerRequestId) {
      const started = Date.now();
      if (provider !== "openai") throw new Error(`${provider} does not support request retrieval`);
      try {
        const { status, data } = await openaiRetrieve(providerRequestId);
        if (status === "queued" || status === "in_progress") return { pending: true };
        if (status === "failed" || status === "cancelled") {
          return { ok: false, provider, model: OPENAI_MODEL, outcome: "failed", errorCode: "provider_error", errorMessage: `Response ${status}`, providerRequestId, latencyMs: Date.now() - started };
        }
        return answerFrom(provider, parseOpenAIResponse(data), searchSettingsFor("openai", grounded), started, providerRequestId);
      } catch (err) {
        return { ok: false, provider, model: OPENAI_MODEL, ...classifyError(err), providerRequestId, latencyMs: Date.now() - started };
      }
    },
  };
}
