// Which connections can carry pictures (an attached image or the pages of a scanned PDF) to the model.
// ChatGPT (Codex), Claude Code and Gemini CLI/API take image parts; the OpenAI- and Anthropic-compatible services take
// standard image content parts, and the chosen model answers whether it reads them.
// Gemini through Antigravity cannot: agy 1.3.2's `--input-format stream-json` accepts only text content blocks
// ("stream input content block type %q is not supported (only %q)" in the CLI), and attaching pictures exists only in
// its interactive screen. Copilot runs text only. Those connections get the local OCR text instead.
const IMAGE_PROVIDERS = ['openai', 'claude', 'gemini', 'compatible'];

export function takesImages(provider?: string) {
  return Boolean(provider && IMAGE_PROVIDERS.includes(provider));
}
