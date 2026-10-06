// OpenAI plugin domain verification for the GeoViz MCP submission.
// Must return exactly the portal-issued token as plain text, nothing else.
const TOKEN = "r0-jR8UsUilntwvAHpdVqx3-uyaJMAEzMkCUHRd5wUE";

export const dynamic = "force-static";

export function GET() {
  return new Response(TOKEN, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
