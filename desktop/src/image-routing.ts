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
  return /(?:^|\n)\s*(?:(?:อยากให้|ช่วย|กรุณา)\s*)*(?:สร้าง|วาด|ทำ|ออกแบบ)\s*(?:รูปภาพ|ภาพ(?!รวม|ลักษณ์|จำ|พจน์)|รูป(?!แบบ|ธรรม)|โปสเตอร์|โลโก้)|(?:^|\n)\s*(?:(?:please|can you)\s+)?(?:generate|create|draw)\s+(?:an?\s+)?(?:image|picture|illustration|poster|logo)\b/i.test(
    text,
  );
}
export const IMAGE_MODELS = {
  openai: ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2', 'gpt-image-1.5'],
  gemini: ['gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image'],
  antigravity: [],
  claude: [],
  compatible: [],
  copilot: [],
} satisfies Record<string, string[]>;
export function imageModels(connection?: Connection) {
  return connection?.mode === 'api' ? IMAGE_MODELS[connection.provider] : [];
}
