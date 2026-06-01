/**
 * LLM polish step for the customer-facing consensus bullets.
 *
 * Takes the deterministic `ConsensusBullets` from
 * `buildConsensusBullets()` and asks Claude Haiku to rewrite each
 * bullet into more natural customer-facing prose. The output keeps
 * the four groups, preserves item count and order, and never adds
 * new facts.
 *
 * Fail-soft contract: on ANY failure (missing key, timeout, parse
 * error, schema mismatch, network) this function returns `null`.
 * The caller is expected to persist `bullets_raw` regardless and
 * persist `bullets_polished` only when this returns a non-null
 * value. The renderer falls back to `bullets_raw` when polished
 * is absent.
 *
 * Frozen-surface note: presentation-layer only. Never touches
 * scoring, never feeds back into validator outputs.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { ConsensusBullets } from "./types";

const POLISH_MODEL = "claude-haiku-4-5-20251001";
const POLISH_TIMEOUT_MS = 15_000;
const POLISH_MAX_TOKENS = 800;
const POLISH_TEMPERATURE = 0.2;
const POLISH_TOOL_NAME = "polish_bullets";

const POLISH_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    agreed: { type: "array", items: { type: "string" } },
    uncertain: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
    barriers: { type: "array", items: { type: "string" } },
  },
  required: ["agreed", "uncertain", "missing", "barriers"],
};

type ToolInput = {
  agreed?: unknown[];
  uncertain?: unknown[];
  missing?: unknown[];
  barriers?: unknown[];
};

function asStringArrayPreserveLength(
  value: unknown,
  expectedLength: number,
): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length !== expectedLength) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed) return null;
    out.push(trimmed);
  }
  return out;
}

export async function polishConsensusBullets(
  raw: ConsensusBullets,
): Promise<ConsensusBullets | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (typeof apiKey !== "string" || apiKey.length === 0) return null;

  const totalItems =
    raw.agreed.length +
    raw.uncertain.length +
    raw.missing.length +
    raw.barriers.length;
  if (totalItems === 0) return null;

  try {
    const client = new Anthropic({ apiKey });

    const system =
      "You rewrite consensus bullets from a GeoViz audit into clear, " +
      "customer-facing language. Rules:\n" +
      "  - Preserve the four groups (agreed, uncertain, missing, " +
      "barriers).\n" +
      "  - Preserve item count and order in every group.\n" +
      "  - Each bullet ≤ 18 words.\n" +
      "  - Do not add facts not present in the input.\n" +
      "  - No markdown markers (no >, no *, no -).\n" +
      "  - Customer-friendly tone — no jargon, no acronyms.\n" +
      "  - Speak directly to a small business owner.\n" +
      "Invoke the polish_bullets tool with the rewritten arrays.";

    const user =
      "Rewrite each bullet below for clarity. Keep arrays the same " +
      "length and order.\n\n" +
      JSON.stringify(raw);

    const response = await client.messages.create(
      {
        model: POLISH_MODEL,
        max_tokens: POLISH_MAX_TOKENS,
        temperature: POLISH_TEMPERATURE,
        system,
        tools: [
          {
            name: POLISH_TOOL_NAME,
            description:
              "Return the four polished bullet arrays with the same counts and order as the input.",
            input_schema: POLISH_INPUT_SCHEMA,
          },
        ],
        tool_choice: { type: "tool", name: POLISH_TOOL_NAME },
        messages: [{ role: "user", content: user }],
      },
      { signal: AbortSignal.timeout(POLISH_TIMEOUT_MS) },
    );

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;
    if (toolUse.name !== POLISH_TOOL_NAME) return null;

    const parsed = toolUse.input as ToolInput;
    const agreed = asStringArrayPreserveLength(parsed.agreed, raw.agreed.length);
    const uncertain = asStringArrayPreserveLength(
      parsed.uncertain,
      raw.uncertain.length,
    );
    const missing = asStringArrayPreserveLength(
      parsed.missing,
      raw.missing.length,
    );
    const barriers = asStringArrayPreserveLength(
      parsed.barriers,
      raw.barriers.length,
    );
    if (!agreed || !uncertain || !missing || !barriers) return null;

    return { agreed, uncertain, missing, barriers };
  } catch {
    return null;
  }
}
