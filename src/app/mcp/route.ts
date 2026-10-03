/**
 * GeoViz MCP endpoint for ChatGPT (Streamable HTTP, stateless JSON mode).
 * See src/lib/chatgpt-plugin/server.ts. Read-only, no auth, no database.
 */
import { clientIpHashFromHeaders } from "@/lib/rate-limit";
import { handleMcpRequest } from "@/lib/chatgpt-plugin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 64 * 1024;

function jsonRpcError(status: number, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return jsonRpcError(413, -32600, "Request too large");
  let body: string;
  try {
    body = await req.text();
  } catch {
    return jsonRpcError(400, -32700, "Unreadable request body");
  }
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return jsonRpcError(413, -32600, "Request too large");

  const forwarded = new Request(req.url, { method: "POST", headers: req.headers, body });
  try {
    const res = await handleMcpRequest(forwarded, clientIpHashFromHeaders(req.headers));
    res.headers.set("cache-control", "no-store");
    return res;
  } catch (err) {
    console.error(`[chatgpt-plugin] mcp request failed err=${err instanceof Error ? err.name : "unknown"}`);
    return jsonRpcError(500, -32603, "Internal error");
  }
}

export async function GET(): Promise<Response> {
  return jsonRpcError(405, -32000, "Method not allowed");
}

export async function DELETE(): Promise<Response> {
  return jsonRpcError(405, -32000, "Method not allowed");
}
