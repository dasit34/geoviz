/**
 * GeoViz MCP server for ChatGPT (Streamable HTTP, stateless).
 *
 * One read-only tool (`check_business_visibility`) plus its result-card UI
 * resource. A fresh server + transport is built per HTTP request — no
 * sessions, no server-side state beyond the in-memory rate-limit buckets.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { CARD_HTML, CARD_MIME_TYPE, CARD_URI } from "./result-card";
import { checkBusinessVisibility, inputShape, outputShape, TOOL_NAME, type CheckDeps } from "./check-business-visibility";

export const SERVER_NAME = "geoviz";
export const SERVER_VERSION = "1.0.0";

const INSTRUCTIONS =
  "GeoViz checks how machine-readable a business website is for AI systems: structured data, crawl access, readable content, and business-identity consistency. " +
  "Use check_business_visibility when a user asks whether their (or a) business website is ready for AI search or AI assistants. " +
  "The result is a website AI-readiness check only: GeoViz does not query ChatGPT, Claude, Gemini, or Perplexity, so never present it as evidence that any AI system recommends or mentions the business.";

const TOOL_DESCRIPTION =
  "Run GeoViz's free website AI-readiness check on a business's public homepage. Returns a 0-100 readiness score, six category findings, up to three prioritized improvements, supporting evidence, and the check date. " +
  "It analyzes the website only — it does not ask any AI system whether it recommends the business.";

export type ServerDeps = Omit<CheckDeps, "clientKey">;

export function buildServer(clientKey: string, deps: ServerDeps = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  server.registerResource(
    "geoviz-visibility-card",
    CARD_URI,
    { title: "GeoViz website AI-readiness card", mimeType: CARD_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: CARD_URI,
          mimeType: CARD_MIME_TYPE,
          text: CARD_HTML,
          _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
        },
      ],
    }),
  );

  server.registerTool(
    TOOL_NAME,
    {
      title: "Check website AI-readiness",
      description: TOOL_DESCRIPTION,
      inputSchema: inputShape,
      outputSchema: outputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: {
        ui: { resourceUri: CARD_URI },
        "openai/outputTemplate": CARD_URI,
        "openai/toolInvocation/invoking": "Checking website AI-readiness…",
        "openai/toolInvocation/invoked": "Website check complete",
      },
    },
    async (args) => {
      const res = await checkBusinessVisibility(args, { ...deps, clientKey });
      if (!res.ok) {
        return { isError: true, content: [{ type: "text" as const, text: res.message }] };
      }
      return {
        structuredContent: res.output,
        content: [{ type: "text" as const, text: res.text }],
      };
    },
  );

  return server;
}

/** Handle one MCP HTTP request end to end. */
export async function handleMcpRequest(req: Request, clientKey: string, deps: ServerDeps = {}): Promise<Response> {
  const server = buildServer(clientKey, deps);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } finally {
    void server.close().catch(() => {});
  }
}
