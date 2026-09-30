import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Images } from '../electron/images';
import { isImageRequest } from '../src/image-routing';
import type { Connection } from '../src/types';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=', 'base64');
const connection = (provider: 'openai' | 'gemini', mode: 'api' | 'subscription' = 'api') =>
  ({ id: 'synthetic', provider, mode, ready: true }) as Connection;
test('image intent distinguishes explicit creation from ordinary discussion', () => {
  for (const q of ['สร้างรูปแมว', 'วาดภาพภูเขา', 'generate an image of a tree']) assert.equal(isImageRequest(q), true);
  for (const q of ['รูปนี้เป็นอะไร', 'ช่วยสรุปการประชุม', 'How do image models work?', 'อธิบายวิธีสร้างรูป', 'How do I generate an image?'])
    assert.equal(isImageRequest(q), false);
});
for (const provider of ['openai', 'gemini'] as const)
  test(`${provider} image request uses the account catalog, saves verified bytes, and keeps keys in the host`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'step-image-')),
      model = provider === 'openai' ? 'gpt-image-2.5-sunburst' : 'gemini-3.1-flash-image';
    const calls: { url: string; body: any; headers: any }[] = [];
    const request = (async (url: any, options: any) => {
      calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null, headers: options.headers });
      return new Response(
        JSON.stringify(
          String(url).endsWith('models')
            ? provider === 'openai'
              ? { data: [{ id: model }, { id: 'chat-model' }] }
              : { models: [{ name: 'models/' + model }] }
            : provider === 'openai'
              ? { data: [{ b64_json: png.toString('base64') }] }
              : {
                  steps: [
                    {
                      type: 'model_output',
                      content: [
                        { type: 'image', mime_type: 'image/png', data: Buffer.from('intermediate').toString('base64') },
                        { type: 'image', mime_type: 'image/png', data: png.toString('base64') },
                      ],
                    },
                  ],
                },
        ),
        { status: 200 },
      );
    }) as typeof fetch;
    try {
      const images = new Images(root, async () => 'synthetic-key', request);
      const artifact = await images.generate(connection(provider), 'synthetic tree', undefined, new AbortController().signal);
      assert.equal(artifact.model, model);
      assert.deepEqual(await readFile(images.path(artifact)), png);
      assert.match((await images.read(artifact)).url, /^data:image\/png;base64,/);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].body.model, model);
      if (provider === 'gemini') {
        assert.equal(calls[1].body.store, false);
        assert.deepEqual(calls[1].body.response_format, { type: 'image', delivery: 'inline' });
      }
      assert.doesNotMatch(JSON.stringify(artifact), /synthetic-key/);
      await assert.rejects(
        images.generate(connection(provider), 'tree', 'unknown-model', new AbortController().signal),
        /IMAGE_MODEL_UNAVAILABLE/,
      );
      assert.equal(calls.filter(c => c.body).length, 1);
      await assert.rejects(
        images.generate(connection(provider, 'subscription'), 'tree', undefined, new AbortController().signal),
        /IMAGE_API_REQUIRED/,
      );
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
test('provider errors and malformed image data do not become artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-image-errors-'));
  try {
    const denied = new Images(
      root,
      async () => 'synthetic-key',
      (async () => new Response('private provider detail', { status: 403 })) as typeof fetch,
    );
    await assert.rejects(denied.generate(connection('openai'), 'tree', undefined, new AbortController().signal), /IMAGE_ACCESS_DENIED/);
    const invalid = new Images(
      root,
      async () => 'synthetic-key',
      (async (url: any) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('models')
              ? { data: [{ id: 'gpt-image-2' }] }
              : { data: [{ b64_json: Buffer.from('not an image').toString('base64') }] },
          ),
        )) as typeof fetch,
    );
    await assert.rejects(invalid.generate(connection('openai'), 'tree', undefined, new AbortController().signal), /IMAGE_RESULT_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
