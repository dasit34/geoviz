# GeoViz ChatGPT plugin: submission package

Submission package for the GeoViz ChatGPT plugin. It is **not submitted**. Start with `SUBMISSION_AUDIT.md` for status, blockers and missing requirements.

- `plugin.json` and `mcp.json`: package manifest and the single MCP server (`https://www.geoviz.ai/mcp`).
- `assets/`: the logo and the starter-prompt screenshot.
- `dist/geoviz-chatgpt-plugin-1.0.0.zip`: the archive to upload in the OpenAI plugin submission portal.
- `review/`: review-form content (test cases, release notes, annotation justifications), the tool schema, and the sample output used for the screenshot.

Rebuild after any metadata or card change:

```bash
npm run chatgpt-plugin:package
```

The build validates the listing limits (character counts, category, URLs, brand colors, one screenshot per starter prompt). It then renders `assets/logo.png` from `src/app/icon.svg` and `assets/screenshot-1.png` from the real result card with `review/sample-output-geoviz.json`, and writes the ZIP.
