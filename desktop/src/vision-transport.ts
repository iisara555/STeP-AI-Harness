// Which connections can carry pictures (an attached image or the pages of a scanned PDF) to the model.
// ChatGPT (Codex), Claude Code and Gemini CLI/API take image parts; the OpenAI- and Anthropic-compatible services take
// standard image content parts, and the chosen model answers whether it reads them.
// Gemini through Antigravity takes them through a per-request MCP image tool (agy 1.3.2's `--input-format stream-json`
// accepts text blocks only; see antigravity-image-mcp.ts). Copilot runs text only and gets the local OCR text instead.
const IMAGE_PROVIDERS = ['openai', 'claude', 'gemini', 'compatible', 'antigravity'];

export function takesImages(provider?: string) {
  return Boolean(provider && IMAGE_PROVIDERS.includes(provider));
}
