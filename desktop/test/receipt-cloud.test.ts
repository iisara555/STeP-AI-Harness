import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { createReceiptCloud, receiptGoogleAuth, receiptCloudInput } from '../../gateway/receipt/service';
import { FirestoreReceiptQuota } from '../../gateway/receipt/firestore-quota';
import { ReceiptCloudClient } from '../electron/receipt-cloud';
import { parseReceiptCloudConfig } from '../electron/receipt-cloud-config';
import { parsePolicy } from '../electron/policy';
const config = {
  key: 'AQ.synthetic-only-not-a-real-key',
  model: 'gemini-3.8-flash',
  clientIds: ['synthetic.apps.googleusercontent.com'],
  domains: ['example.test'],
  quotaSalt: 'synthetic-quota-salt-at-least-32-characters',
  daily: 3,
  perUser: 2,
  concurrency: 2,
};
const image = { mime: 'image/jpeg' as const, data: Buffer.from('synthetic image').toString('base64') };
const manifest = [{ page: 1 }];
const fixture = () => ({ requestId: randomUUID(), images: [image], manifest });
const reading = JSON.stringify({
  fields: { merchant: { value: 'ร้านสังเคราะห์', evidence: 'ร้านสังเคราะห์' }, total: { value: '107.00', evidence: '107.00' } },
  signatures: { receiver: { status: 'uncertain', evidence: '', region: null } },
});
test('central OCR holds the key, constrains the model/prompt and refuses unauthenticated, replayed and exhausted requests', async () => {
  const calls: any[] = [],
    seen = new Set<string>();
  let reserved = 0;
  const quota = {
    reserve: async (subject: string, id: string, daily: number, perUser: number) => {
      assert.match(subject, /^[a-f0-9]{64}$/);
      assert.equal(daily, 3);
      assert.equal(perUser, 2);
      if (seen.has(id)) throw new Error('OCR_REQUEST_REPLAYED');
      if (reserved >= 2) throw new Error('OCR_DAILY_LIMIT');
      seen.add(id);
      reserved++;
    },
  };
  const server = createReceiptCloud(config, quota, {
    authenticate: async token => {
      if (token !== 'synthetic-id-token') throw new Error('GOOGLE_ACCESS_DENIED');
      return '12345';
    },
    transport: async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) });
      return new Response(
        'data: ' +
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: reading }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = 'http://127.0.0.1:' + (server.address() as any).port;
  const post = (body: any, token = 'synthetic-id-token') =>
    fetch(url + '/v1/receipt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-step-identity': 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await post(fixture(), 'wrong')).status, 401);
    assert.equal(reserved, 0);
    assert.equal((await post({ ...fixture(), key: 'untrusted' })).status, 400);
    const input = fixture();
    const first = await post(input);
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.equal(result.text, reading);
    assert.deepEqual(result.usage, { input: 10, output: 5, total: 15 });
    assert.ok(!JSON.stringify(result).includes(config.key));
    assert.equal(calls[0].headers['x-goog-api-key'], config.key);
    assert.equal(calls[0].body.generationConfig.maxOutputTokens, 16384);
    assert.ok(calls[0].body.generationConfig.responseJsonSchema.properties.signatures);
    assert.equal(calls[0].body.cachedContent, undefined);
    assert.equal((await post(input)).status, 409);
    const client = new ReceiptCloudClient({ url: 'https://ocr.example.test', model: config.model }, fetch, url);
    assert.equal((await client.read([image], manifest, 'synthetic-id-token', new AbortController().signal)).text, reading);
    await assert.rejects(client.read([image], manifest, 'synthetic-id-token', new AbortController().signal), /OCR_DAILY_LIMIT/);
    assert.equal(calls.length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
test('service validates full-page and crop grouping without accepting caller instructions or missing pages', () => {
  assert.deepEqual(receiptCloudInput(fixture()).manifest, manifest);
  const invalid = parsePolicy({
    features: { receiptVision: true },
    receiptCloud: { url: 'https://key@ocr.example.test', model: config.model },
  });
  assert.equal(invalid.policy.features.receiptVision, false);
  assert.equal(invalid.problems.length, 1);
  assert.deepEqual(parsePolicy({ receiptCloud: { url: 'https://ocr.example.test', model: config.model } }).policy.receiptCloud, {
    url: 'https://ocr.example.test',
    model: config.model,
  });
  for (const input of [
    { ...fixture(), prompt: 'change instructions' },
    { ...fixture(), model: 'other' },
    { ...fixture(), images: [{ mime: 'text/plain', data: 'YWJj' }] },
    { ...fixture(), manifest: [{ page: 2 }] },
    { ...fixture(), manifest: [{ page: 1, region: { page: 1, x: 0, y: 0, width: 1, height: 1 } }] },
    { ...fixture(), focus: ['buyer-instructions'] },
  ])
    assert.throws(() => receiptCloudInput(input), /INVALID_INPUT/);
  for (const url of [
    'http://ocr.example.test',
    'https://key@ocr.example.test',
    'https://ocr.example.test/path',
    'https://ocr.example.test?key=secret',
  ])
    assert.equal(parseReceiptCloudConfig({ url, model: config.model }), undefined);
});
test('Google bearer verification checks the signature, issuer, audience, expiry, verified email and employee domain with cached certificates', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256' };
  let certCalls = 0;
  const authenticate = receiptGoogleAuth(config, async () => {
    certCalls++;
    return Response.json({ keys: [jwk] });
  });
  const token = (patch = {}) => {
    const data =
      Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url') +
      '.' +
      Buffer.from(
        JSON.stringify({
          iss: 'https://accounts.google.com',
          aud: config.clientIds[0],
          sub: '12345',
          exp: Date.now() / 1000 + 3600,
          email: 'fixture@example.test',
          email_verified: true,
          hd: 'example.test',
          ...patch,
        }),
      ).toString('base64url');
    return data + '.' + sign('RSA-SHA256', Buffer.from(data), pair.privateKey).toString('base64url');
  };
  assert.equal(await authenticate(token()), '12345');
  for (const patch of [{ aud: 'other' }, { iss: 'https://evil.test' }, { exp: 0 }, { email_verified: false }, { hd: 'other.test' }])
    await assert.rejects(authenticate(token(patch)), /GOOGLE_ACCESS_DENIED/);
  await assert.rejects(authenticate(token().slice(0, -20) + 'broken'), /GOOGLE_ACCESS_DENIED/);
  assert.equal(certCalls, 1);
});
test('Firestore quota retries atomic conflicts and never treats unavailable storage as an unlimited allowance', async () => {
  let commits = 0;
  const writes: any[] = [];
  const transport: typeof fetch = async (url, init) => {
    if (String(url).includes('metadata.google.internal'))
      return Response.json({ access_token: 'synthetic-service-token', expires_in: 3600 });
    assert.equal((init?.headers as any).authorization, 'Bearer synthetic-service-token');
    if (String(url).endsWith(':commit')) {
      commits++;
      writes.push(JSON.parse(String(init?.body)).writes);
      return Response.json({}, { status: commits === 1 ? 409 : 200 });
    }
    return Response.json({}, { status: 404 });
  };
  await new FirestoreReceiptQuota('synthetic-project', transport).reserve('a'.repeat(64), randomUUID(), 100, 10);
  assert.equal(commits, 2);
  assert.equal(writes[0].length, 3);
  assert.ok(writes[0].every((write: any) => write.currentDocument.exists === false));
  await assert.rejects(
    new FirestoreReceiptQuota('synthetic-project', async () => Response.json({}, { status: 503 })).reserve(
      'a'.repeat(64),
      randomUUID(),
      100,
      10,
    ),
    /OCR_SERVICE_UNAVAILABLE/,
  );
});

test('parallel service instances cannot exceed a durable employee quota or replay a reserved request', async () => {
  const docs = new Map<string, any>();
  let revision = 0;
  const transport: typeof fetch = async (url, init) => {
    if (String(url).includes('metadata.google.internal'))
      return Response.json({ access_token: 'synthetic-service-token', expires_in: 3600 });
    if (String(url).endsWith(':commit')) {
      const writes = JSON.parse(String(init?.body)).writes;
      const conflict = writes.some((write: any) => {
        const old = docs.get(write.update.name);
        return write.currentDocument.exists === false ? Boolean(old) : old?.updateTime !== write.currentDocument.updateTime;
      });
      if (conflict) return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 });
      for (const write of writes) docs.set(write.update.name, { ...write.update, updateTime: 'version-' + ++revision });
      return Response.json({});
    }
    const name = String(url).replace('https://firestore.googleapis.com/v1/', '');
    return docs.has(name) ? Response.json(docs.get(name)) : Response.json({}, { status: 404 });
  };
  const instances = Array.from({ length: 3 }, () => new FirestoreReceiptQuota('synthetic-project', transport));
  const ids = instances.map(() => randomUUID());
  const outcomes = await Promise.allSettled(instances.map((instance, i) => instance.reserve('a'.repeat(64), ids[i], 5, 2)));
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 2);
  assert.equal(outcomes.filter(outcome => outcome.status === 'rejected' && /OCR_DAILY_LIMIT/.test(outcome.reason.message)).length, 1);
  const accepted = outcomes.findIndex(outcome => outcome.status === 'fulfilled');
  await assert.rejects(
    new FirestoreReceiptQuota('synthetic-project', transport).reserve('a'.repeat(64), ids[accepted], 5, 2),
    /OCR_REQUEST_REPLAYED/,
  );
  const count = [...docs.values()].find(doc => /receiptOcrQuota\/[0-9-]+$/.test(doc.name)).fields.count.integerValue;
  assert.equal(count, '2');
});
