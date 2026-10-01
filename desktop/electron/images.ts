import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Connection, ImageArtifact } from '../src/types';
import { IMAGE_MODELS } from '../src/image-routing';

export class Images {
  constructor(
    private directory: string,
    private key: (connection: Connection) => Promise<string | undefined>,
    private request = fetch,
  ) {}
  private async json(connection: Connection, path: string, signal: AbortSignal, body?: unknown) {
    if (connection.mode !== 'api' || !['openai', 'gemini'].includes(connection.provider)) throw new Error('IMAGE_API_REQUIRED');
    const secret = await this.key(connection);
    if (!secret) throw new Error('IMAGE_API_REQUIRED');
    const openai = connection.provider === 'openai';
    const response = await this.request(
      (openai ? 'https://api.openai.com/v1/' : 'https://generativelanguage.googleapis.com/v1beta/') + path,
      {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(openai ? { Authorization: 'Bearer ' + secret } : { 'x-goog-api-key': secret }) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? 'IMAGE_RATE_LIMIT'
          : [401, 403].includes(response.status)
            ? 'IMAGE_ACCESS_DENIED'
            : 'IMAGE_REQUEST_FAILED',
      );
    // Bound the response before parsing base64, including chunked responses.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('EMPTY_RESULT');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 32 * 1024 * 1024) throw new Error('IMAGE_LIMIT');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async models(connection: Connection, signal = AbortSignal.timeout(30_000)) {
    const available = new Set<string>();
    let page = '';
    for (let i = 0; i < 10; i++) {
      const data = await this.json(connection, 'models' + (page ? '?pageToken=' + encodeURIComponent(page) : ''), signal);
      for (const m of data.data || data.models || []) available.add(String(m.id || m.name || '').replace(/^models\//, ''));
      page = data.nextPageToken || '';
      if (!page) break;
    }
    return IMAGE_MODELS[connection.provider].filter(id => available.has(id));
  }
  async generate(connection: Connection, prompt: string, model: string | undefined, signal: AbortSignal): Promise<ImageArtifact> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(300_000)]);
    const available = await this.models(connection, deadline);
    const chosen = model || available[0];
    if (!chosen || !available.includes(chosen)) throw new Error('IMAGE_MODEL_UNAVAILABLE');
    const openai = connection.provider === 'openai';
    const data = await this.json(
      connection,
      openai ? 'images/generations' : 'interactions',
      deadline,
      openai
        ? { model: chosen, prompt, n: 1 }
        : { model: chosen, input: prompt, store: false, response_format: { type: 'image', delivery: 'inline' } },
    );
    const candidates = openai
      ? [{ data: data.data?.[0]?.b64_json }]
      : [
          data.output_image,
          ...(data.outputs || []),
          ...(data.steps || []).flatMap((s: any) => (s.type === 'model_output' ? s.content || [] : [])),
        ];
    // Gemini's convenience output_image denotes the last final model image, not an intermediate block.
    const finalImages = candidates.filter((c: any) => c?.data && (!c.type || c.type === 'image'));
    const encoded = openai ? finalImages[0]?.data : data.output_image?.data || finalImages.at(-1)?.data;
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('IMAGE_RESULT_INVALID');
    const bytes = Buffer.from(encoded, 'base64');
    const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? 'image/jpeg'
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
          ? 'image/webp'
          : '';
    if (!mime || bytes.length > 20 * 1024 * 1024) throw new Error('IMAGE_RESULT_INVALID');
    if (signal.aborted) throw new Error('CANCELLED');
    const id = randomUUID(),
      name = id + (mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : '.webp');
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, name), bytes, { flag: 'wx' });
    return { id, name, model: chosen, provider: connection.provider, mime, at: new Date().toISOString() };
  }
  async read(artifact: ImageArtifact) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(artifact.name)) throw new Error('INVALID_PATH');
    return { url: 'data:' + artifact.mime + ';base64,' + (await readFile(join(this.directory, artifact.name))).toString('base64') };
  }
  path(artifact: ImageArtifact) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(artifact.name)) throw new Error('INVALID_PATH');
    return join(this.directory, artifact.name);
  }
}
