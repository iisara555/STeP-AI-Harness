import type { Connection } from './types';

// Explicit creation verbs avoid sending discussion about images to a paid image endpoint.
export function isImageRequest(text: string) {
  // Ambiguous or explicitly excluded images stay in chat; image mode remains an explicit choice.
  if (
    /(?:ไม่(?:ต้อง|เอา|ขอ|ให้)|ห้าม|งด)\s*(?:(?:สร้าง|วาด|ทำ|ออกแบบ)\s*)?(?:รูปภาพ|ภาพ|รูป|โปสเตอร์|โลโก้)|\b(?:do not|don't|without|no)\s+(?:(?:generate|create|draw|use|an?|any)\s+)*(?:images?|pictures?|illustrations?|posters?|logos?)\b/i.test(
      text,
    )
  )
    return false;
  return /(?:^|\n)\s*(?:(?:อยากให้|ช่วย|กรุณา)\s*)*(?:สร้าง|วาด|ทำ|ออกแบบ)\s*(?:รูปภาพ|ภาพ(?!รวม|ลักษณ์|จำ|พจน์)|รูป(?!แบบ|ธรรม)|โปสเตอร์|โลโก้)|(?:^|\n)\s*(?:(?:please|can you)\s+)?(?:generate|create|draw)\s+(?:(?:an?|one)\s+)?(?:internal-use\s+)?(?:image|picture|illustration|announcement|how-to\s+guide|educational\s+visual|poster|logo)\b/i.test(
    text,
  );
}
export const IMAGE_MODELS = {
  openai: ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'],
  gemini: ['gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image'],
  antigravity: [],
  claude: [],
  compatible: [],
  copilot: [],
} satisfies Record<string, string[]>;
/** Image models on OpenRouter's Images API (POST /images), best first; only these are offered on an OpenRouter key. */
export const OPENROUTER_IMAGE_MODELS = [
  'openai/gpt-image-2.6-sunburst',
  'openai/gpt-image-2.5-sunburst',
  'openai/gpt-image-2.6-flare',
  'openai/gpt-image-2.5-flare',
  'openai/gpt-image-2',
  'google/gemini-3.1-flash-image',
  'google/gemini-3.1-flash-lite-image',
];
/**
 * Compatible connections that serve OpenRouter's Images API: OpenRouter itself, and "AI ขององค์กร", whose gateway lists
 * only the image models the organization allows (so its catalog is read from the gateway, not fixed here).
 */
export function imagePreset(connection?: Pick<Connection, 'provider' | 'preset'>) {
  return connection?.provider === 'compatible' && (connection.preset === 'openrouter' || connection.preset === 'organization')
    ? connection.preset
    : undefined;
}
/** Whether this connection can be asked to create a picture at all; the account's catalog decides which models. */
export function canGenerateImages(connection?: Connection) {
  return Boolean(
    connection?.mode === 'api' && (connection.provider === 'openai' || connection.provider === 'gemini' || imagePreset(connection)),
  );
}
/** The image models Desktop may use on this connection, before the account's own catalog narrows them. */
export function imageModels(connection?: Connection): string[] {
  if (!canGenerateImages(connection)) return [];
  const preset = imagePreset(connection);
  if (preset === 'openrouter') return OPENROUTER_IMAGE_MODELS;
  if (preset === 'organization') return [];
  return IMAGE_MODELS[connection!.provider];
}
