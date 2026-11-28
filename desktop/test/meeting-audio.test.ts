import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { evaluatePrivacyGate } from '../../src/modules/privacy/index.js';
import { defaultPolicy } from '../electron/policy';
import {
  formatMeetingTranscript,
  isAudioExtension,
  MAX_AUDIO_FILE_BYTES,
  resolveAudioTranscriptionTarget,
  transcribeMeetingAudio,
  validateAudioBuffer,
} from '../electron/meeting-audio';
import type { Connection } from '../src/types';

function makeConnection(overrides: Partial<Connection>): Connection {
  return {
    id: 'conn-1',
    provider: 'gemini',
    mode: 'api',
    model: 'gemini-2.5-flash',
    executable: '',
    ready: true,
    note: '',
    ...overrides,
  };
}

function fakeWavBuffer(): Buffer {
  const buf = Buffer.alloc(64);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(56, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  return buf;
}

function fakeMp3Buffer(): Buffer {
  return Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.alloc(32, 0)]);
}

function fakeM4aBuffer(): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(24, 0);
  buf.write('ftypM4A ', 4, 'ascii');
  return buf;
}

test('[P1-1] validateAudioBuffer verifies container magic bytes and enforces size caps', () => {
  assert.equal(isAudioExtension('m4a'), true);
  assert.equal(isAudioExtension('MP3'), true);
  assert.equal(isAudioExtension('exe'), false);

  assert.equal(validateAudioBuffer('wav', fakeWavBuffer()).mime, 'audio/wav');
  assert.equal(validateAudioBuffer('mp3', fakeMp3Buffer()).mime, 'audio/mpeg');
  assert.equal(validateAudioBuffer('m4a', fakeM4aBuffer()).mime, 'audio/mp4');
  assert.equal(validateAudioBuffer('ogg', Buffer.concat([Buffer.from('OggS'), Buffer.alloc(16)])).mime, 'audio/ogg');
  assert.equal(validateAudioBuffer('webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])).mime, 'audio/webm');
  assert.equal(validateAudioBuffer('flac', Buffer.concat([Buffer.from('fLaC'), Buffer.alloc(16)])).mime, 'audio/flac');

  // Spoofed HTML/executable renamed to .mp3 must be rejected
  assert.throws(() => validateAudioBuffer('mp3', Buffer.from('<html>not audio</html>')), /AUDIO_FORMAT_INVALID/);
  assert.throws(() => validateAudioBuffer('wav', Buffer.from('MZ\x90\x00not a wav file')), /AUDIO_FORMAT_INVALID/);
  assert.throws(() => validateAudioBuffer('mp3', Buffer.alloc(4)), /AUDIO_FORMAT_INVALID/);

  // Oversized recording (>20 MB) must fail cleanly
  const oversized = Buffer.alloc(MAX_AUDIO_FILE_BYTES + 16);
  oversized.write('ID3', 0, 'ascii');
  assert.throws(() => validateAudioBuffer('mp3', oversized), /AUDIO_TOO_LARGE/);
});

test('[P1-1] resolveAudioTranscriptionTarget picks Gemini/OpenAI/Compatible and rejects unsupported runtimes', () => {
  const policy = defaultPolicy();
  const geminiTarget = resolveAudioTranscriptionTarget(makeConnection({ provider: 'gemini', mode: 'api' }), policy);
  assert.equal(geminiTarget?.kind, 'gemini');

  const openaiTarget = resolveAudioTranscriptionTarget(makeConnection({ provider: 'openai', mode: 'api' }), policy);
  assert.equal(openaiTarget?.kind, 'openai');

  // Claude / Antigravity / Copilot cannot transcribe directly
  assert.equal(resolveAudioTranscriptionTarget(makeConnection({ provider: 'claude', mode: 'api' }), policy), null);
  assert.equal(resolveAudioTranscriptionTarget(makeConnection({ provider: 'copilot', mode: 'oauth' }), policy), null);
  assert.equal(resolveAudioTranscriptionTarget(makeConnection({ provider: 'gemini', mode: 'subscription' }), policy), null);
});

test('[P1-1] Gemini API audio transcription sends inlineData and returned transcript passes privacy masking', async () => {
  let receivedBody: any;
  let receivedApiKey = '';
  const server = createServer(async (req, res) => {
    receivedApiKey = String(req.headers['x-goog-api-key'] || '');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '[ผู้พูด 1]: มติที่ประชุมเห็นชอบจัดงานเดือนมีนาคม ติดต่อคุณสมชายโทร 081-234-5678\n[ผู้พูด 2]: รับทราบครับ เดี๋ยวทีม CC ส่งแบบร่างวันศุกร์',
                },
              ],
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const target = resolveAudioTranscriptionTarget(
      makeConnection({ provider: 'gemini', mode: 'api', model: 'gemini-2.5-flash' }),
      defaultPolicy(),
      {
        geminiBaseUrl: `http://127.0.0.1:${port}`,
      },
    );
    assert.ok(target);
    const audio = fakeM4aBuffer();
    const result = await transcribeMeetingAudio({
      fileName: 'ประชุมทีม-CC.m4a',
      extension: 'm4a',
      bytes: audio,
      target,
      apiKey: 'test-gemini-key',
    });
    assert.equal(receivedApiKey, 'test-gemini-key');
    assert.equal(receivedBody.contents[0].parts[1].inlineData.mimeType, 'audio/mp4');
    assert.equal(receivedBody.contents[0].parts[1].inlineData.data, audio.toString('base64'));
    assert.match(result.transcript, /มติที่ประชุมเห็นชอบ/);

    const formatted = formatMeetingTranscript({
      fileName: 'ประชุมทีม-CC.m4a',
      bytes: audio.length,
      backendLabel: result.backendLabel,
      transcript: result.transcript,
    });
    assert.match(formatted, /บทถอดความจากไฟล์เสียงประชุม: ประชุมทีม-CC\.m4a/);
    // Spoken phone number must be masked by STeP privacy gate before entering chat context
    const scanned = evaluatePrivacyGate(formatted);
    assert.equal(scanned.redactedText.includes('081-234-5678'), false);
    assert.match(scanned.redactedText, /มติที่ประชุมเห็นชอบ/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('[P1-1] OpenAI audio transcription sends Thai multipart upload and falls back from gpt-4o-mini-transcribe to whisper-1', async () => {
  const modelsSeen: string[] = [];
  let sawThaiLang = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const raw = Buffer.concat(chunks).toString('utf8');
    const match = /name="model"\r\n\r\n([^\r\n]+)/.exec(raw);
    if (match) modelsSeen.push(match[1]);
    if (/name="language"\r\n\r\nth\b/.test(raw)) sawThaiLang = true;
    if (modelsSeen.length === 1) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: 'The model gpt-4o-mini-transcribe was not found' } }));
      return;
    }
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('[ผู้พูด 1]: อนุมัติแผนประชาสัมพันธ์ไตรมาส 2 และนัดตรวจร่างวันพุธ');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const target = resolveAudioTranscriptionTarget(makeConnection({ provider: 'openai', mode: 'api' }), defaultPolicy(), {
      openaiBaseUrl: `http://127.0.0.1:${port}`,
    });
    assert.ok(target);
    const result = await transcribeMeetingAudio({
      fileName: 'meeting.mp3',
      extension: 'mp3',
      bytes: fakeMp3Buffer(),
      target,
      apiKey: 'test-openai-key',
    });
    assert.deepEqual(modelsSeen, ['gpt-4o-mini-transcribe', 'whisper-1']);
    assert.equal(sawThaiLang, true);
    assert.match(result.transcript, /อนุมัติแผนประชาสัมพันธ์ไตรมาส 2/);
    assert.match(result.backendLabel, /whisper-1/);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
