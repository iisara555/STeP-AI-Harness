import type { Connection } from '../src/types';
import { compatibleEndpoint } from './preset-endpoint';
import type { Policy } from './policy';

/** Supported meeting recording extensions (covers phone voice memos, Zoom, Teams, Google Meet, OBS). */
export const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg', 'webm', 'flac', 'aac'] as const;
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

/** 20 MB cap (~40-60 minutes of compressed MP3/M4A meeting audio; safe for Gemini inlineData and OpenAI /audio/transcriptions). */
export const MAX_AUDIO_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 160_000;
const TRANSCRIPTION_TIMEOUT_MS = 240_000;

const AUDIO_MIMES: Record<AudioExtension, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

const DEFAULT_GEMINI_AUDIO_MODEL = 'gemini-2.5-flash';

const THAI_MEETING_TRANSCRIPTION_PROMPT = [
  'คุณคือผู้ถอดความบันทึกการประชุมของอุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)',
  'ถอดข้อความจากไฟล์เสียงนี้เป็นภาษาไทย (คงคำศัพท์ภาษาอังกฤษ ชื่อย่อทีม/โครงการ รหัสเอกสาร และตัวเลขที่ได้ยินจริงตามเดิม)',
  'กติกาเคร่งครัด:',
  '1. ถอดเฉพาะสิ่งที่ได้ยินจริง ห้ามแต่งเนื้อหา สรุปข้าม หรือเติมมติที่ไม่มีในเสียง',
  '2. แยกบรรทัดตามจังหวะการเปลี่ยนผู้พูด เช่น "[ผู้พูด 1]: ..." "[ผู้พูด 2]: ..." เท่าที่จำแนกได้ชัดเจน',
  '3. หากช่วงใดเสียงเบา ขาดหาย หรือฟังไม่ชัด ให้ใส่ [ฟังไม่ชัด] แทนการเดา',
  '4. ส่งออกเฉพาะบทถอดความเท่านั้น ไม่ต้องมีคำนำหรือคำปิดท้าย',
].join('\n');

export function isAudioExtension(ext: string): ext is AudioExtension {
  return (AUDIO_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

export function formatAudioBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Verify audio file size and container magic bytes so renamed non-audio files cannot be uploaded as recordings. */
export function validateAudioBuffer(extension: string, bytes: Buffer): { ext: AudioExtension; mime: string; bytes: number } {
  const ext = extension.toLowerCase();
  if (!isAudioExtension(ext)) throw new Error('AUDIO_FORMAT_INVALID');
  if (!bytes.length || bytes.length < 12) throw new Error('AUDIO_FORMAT_INVALID');
  if (bytes.length > MAX_AUDIO_FILE_BYTES) throw new Error('AUDIO_TOO_LARGE');

  const ascii = (start: number, end: number) => bytes.toString('ascii', start, end);
  let valid = false;
  if (ext === 'wav') {
    valid = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
  } else if (ext === 'mp3') {
    valid = ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  } else if (ext === 'm4a') {
    valid = ascii(4, 8) === 'ftyp';
  } else if (ext === 'aac') {
    valid = (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) || ascii(4, 8) === 'ftyp' || ascii(0, 4) === 'ADIF';
  } else if (ext === 'ogg') {
    valid = ascii(0, 4) === 'OggS';
  } else if (ext === 'webm') {
    valid = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  } else if (ext === 'flac') {
    valid = ascii(0, 4) === 'fLaC';
  }
  if (!valid) throw new Error('AUDIO_FORMAT_INVALID');
  return { ext, mime: AUDIO_MIMES[ext], bytes: bytes.length };
}

export type AudioTranscriptionTarget =
  | { kind: 'gemini'; baseUrl: string; model: string; hostLabel: string; keyRequired: boolean }
  | { kind: 'openai'; baseUrl: string; hostLabel: string; keyRequired: boolean };

function assertLocalTestUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('INVALID_INPUT');
  return raw.replace(/\/$/, '');
}

/** Decide whether the active AI connection supports direct meeting audio transcription under current policy. */
export function resolveAudioTranscriptionTarget(
  connection: Connection | undefined,
  policy: Policy,
  options: { geminiBaseUrl?: string; openaiBaseUrl?: string; testCompatibleBaseUrl?: string } = {},
): AudioTranscriptionTarget | null {
  if (!connection) return null;
  if (connection.provider === 'gemini' && connection.mode === 'api') {
    if (policy.network?.proxyUrl && !options.geminiBaseUrl) throw new Error('PROVIDER_PROXY_UNAVAILABLE');
    const baseUrl = options.geminiBaseUrl
      ? assertLocalTestUrl(options.geminiBaseUrl) + '/v1beta'
      : 'https://generativelanguage.googleapis.com/v1beta';
    const rawModel = (connection.model || DEFAULT_GEMINI_AUDIO_MODEL).replace(/^models\//, '');
    const model = /^gemini-[a-zA-Z0-9._-]{1,120}$/.test(rawModel) ? rawModel : DEFAULT_GEMINI_AUDIO_MODEL;
    return { kind: 'gemini', baseUrl, model, hostLabel: `Google Gemini API (${model})`, keyRequired: true };
  }
  if (connection.provider === 'openai' && connection.mode === 'api') {
    if (policy.network?.proxyUrl && !options.openaiBaseUrl) throw new Error('PROVIDER_PROXY_UNAVAILABLE');
    const baseUrl = options.openaiBaseUrl ? assertLocalTestUrl(options.openaiBaseUrl) + '/v1' : 'https://api.openai.com/v1';
    return { kind: 'openai', baseUrl, hostLabel: 'OpenAI Audio API', keyRequired: true };
  }
  if (connection.provider === 'compatible' && (connection.protocol || 'openai') === 'openai') {
    const endpoint = compatibleEndpoint(connection, policy, options.testCompatibleBaseUrl);
    // Strip trailing /chat/completions to reach the sibling /audio/transcriptions path on the same approved origin.
    const baseUrl = endpoint.toString().replace(/\/chat\/completions\/?$/, '');
    return {
      kind: 'openai',
      baseUrl,
      hostLabel: `${endpoint.host} (Audio API)`,
      keyRequired: Boolean(connection.preset !== 'ollama' && connection.preset !== 'lmstudio'),
    };
  }
  return null;
}

async function readBoundedText(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > limit) throw new Error('AUDIO_TRANSCRIPTION_FAILED');
      chunks.push(part.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function mapHttpError(status: number, bodyText: string): Error {
  if ([401, 403].includes(status)) return new Error('LOGIN_REQUIRED');
  if (status === 429) {
    return new Error(/PerDay|billing|credit|quota|limit:\s*0\b/i.test(bodyText) ? 'PROVIDER_QUOTA' : 'PROVIDER_BUSY');
  }
  if (status >= 500) return new Error('PROVIDER_BUSY');
  return new Error('AUDIO_TRANSCRIPTION_FAILED');
}

export async function transcribeMeetingAudio(
  input: {
    fileName: string;
    extension: string;
    bytes: Buffer;
    target: AudioTranscriptionTarget;
    apiKey?: string;
    signal?: AbortSignal;
  },
  fetcher: typeof fetch = fetch,
): Promise<{ transcript: string; backendLabel: string; charCount: number }> {
  const validated = validateAudioBuffer(input.extension, input.bytes);
  if (input.target.keyRequired && !input.apiKey) throw new Error('API_KEY_REQUIRED');
  const timeout = AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;

  if (input.target.kind === 'gemini') {
    let response: Response;
    try {
      response = await fetcher(`${input.target.baseUrl}/models/${input.target.model}:generateContent`, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey || '' },
        signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: THAI_MEETING_TRANSCRIPTION_PROMPT },
                { inlineData: { mimeType: validated.mime, data: input.bytes.toString('base64') } },
              ],
            },
          ],
          generationConfig: { temperature: 0.1 },
        }),
      });
    } catch {
      throw new Error(input.signal?.aborted ? 'CANCELLED' : timeout.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK');
    }
    const raw = await readBoundedText(response, MAX_TRANSCRIPT_CHARS * 4);
    if (!response.ok) throw mapHttpError(response.status, raw);
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('AUDIO_TRANSCRIPTION_FAILED');
    }
    const parts: any[] = parsed?.candidates?.[0]?.content?.parts || [];
    const transcript = parts
      .filter(p => typeof p?.text === 'string' && !p?.thought)
      .map(p => String(p.text))
      .join('')
      .trim()
      .slice(0, MAX_TRANSCRIPT_CHARS);
    if (!transcript) throw new Error('AUDIO_TRANSCRIPTION_FAILED');
    return { transcript, backendLabel: input.target.hostLabel, charCount: transcript.length };
  }

  // OpenAI & OpenAI-compatible /audio/transcriptions (try gpt-4o-mini-transcribe, fall back to whisper-1).
  const models = ['gpt-4o-mini-transcribe', 'whisper-1'];
  let lastError: Error | undefined;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const form = new FormData();
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._\u0E00-\u0E7F -]/g, '_') || `meeting.${validated.ext}`;
    form.append('file', new Blob([new Uint8Array(input.bytes)], { type: validated.mime }), safeName);
    form.append('model', model);
    form.append('language', 'th');
    form.append('response_format', 'text');
    let response: Response;
    try {
      response = await fetcher(`${input.target.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        redirect: 'error',
        headers: input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {},
        signal,
        body: form,
      });
    } catch {
      throw new Error(input.signal?.aborted ? 'CANCELLED' : timeout.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK');
    }
    const raw = await readBoundedText(response, MAX_TRANSCRIPT_CHARS * 4);
    if (response.ok) {
      let text = raw.trim();
      if (text.startsWith('{')) {
        try {
          const obj = JSON.parse(text);
          if (typeof obj?.text === 'string') text = obj.text.trim();
        } catch {
          // Plain text response starting with '{'
        }
      }
      const transcript = text.slice(0, MAX_TRANSCRIPT_CHARS);
      if (!transcript) throw new Error('AUDIO_TRANSCRIPTION_FAILED');
      return { transcript, backendLabel: `${input.target.hostLabel} (${model})`, charCount: transcript.length };
    }
    if (i === 0 && [400, 404].includes(response.status) && /model|not found|unsupported|invalid/i.test(raw)) {
      lastError = mapHttpError(response.status, raw);
      continue;
    }
    throw mapHttpError(response.status, raw);
  }
  throw lastError || new Error('AUDIO_TRANSCRIPTION_FAILED');
}

/** Format a verified audio transcript as structured meeting source text ready for meeting-summary or official minutes. */
export function formatMeetingTranscript(input: { fileName: string; bytes: number; backendLabel: string; transcript: string }): string {
  return [
    `[บทถอดความจากไฟล์เสียงประชุม: ${input.fileName}]`,
    `- ขนาดไฟล์เสียง: ${formatAudioBytes(input.bytes)}`,
    `- ช่องทางถอดเสียง: ${input.backendLabel}`,
    `- หมายเหตุ: ถอดข้อความอัตโนมัติจากไฟล์เสียง โปรดตรวจทานชื่อบุคคล ตัวเลข และมติให้ตรงกับข้อเท็จจริงก่อนนำไปเผยแพร่หรืออ้างอิง`,
    '',
    '### เนื้อหาที่ถอดจากบันทึกเสียง',
    input.transcript.trim(),
  ].join('\n');
}
