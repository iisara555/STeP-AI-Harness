import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { copilotDeviceLogin } from '../electron/copilot-auth';
import { CopilotAdapter } from '../electron/copilot';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { Voice, downloadVerified, validateWav } from '../electron/voice';
import { commandForKey, validateKeybindings, vimEdit, commandPalette } from '../src/commands';

test('Phase 5 risky capabilities stay off and invalid destinations, approvals and artifacts reject the complete policy', () => {
  const p = defaultPolicy();
  for (const flag of ['compatibleProviders', 'copilot', 'headless', 'voice', 'skillPacks', 'lineGateway'] as const)
    assert.equal(p.features[flag], false);
  for (const raw of [
    { providers: { compatible: [{ name: 'Unsafe', baseUrl: 'http://remote.example/v1', protocol: 'openai' }] } },
    { providers: { copilot: { clientId: 'bad' } } },
    { skillPacks: { approvedDigests: ['tampered'] } },
    { voice: { components: { 'win32-x64': { runtime: { url: 'https://example.com/a', sha256: 'bad' } } } } },
  ]) {
    const parsed = parsePolicy({ ...raw, features: { headless: true, voice: true } });
    assert.ok(parsed.problems.length);
    assert.equal(parsed.policy.features.headless, false);
  }
  assert.deepEqual(
    parsePolicy({
      features: { compatibleProviders: true },
      providers: { compatible: [{ name: 'Local fixture', baseUrl: 'http://127.0.0.1:1234/v1', protocol: 'openai' }] },
    }).problems,
    [],
  );
});
test('Copilot uses the managed client id, fixed GitHub URLs, device polling intervals and cancellation without exposing tokens', async () => {
  const posts: any[] = [],
    waits: number[] = [],
    shown: any[] = [];
  let polls = 0;
  const signal = new AbortController().signal;
  const fetcher = async (url: any, options: any) => {
    posts.push({ url, options });
    return new Response(
      JSON.stringify(
        url.endsWith('device/code')
          ? {
              device_code: 'device',
              user_code: 'ABCD-EFGH',
              verification_uri: 'https://github.com/login/device',
              expires_in: 600,
              interval: 5,
            }
          : ++polls === 1
            ? { error: 'slow_down' }
            : polls === 2
              ? { error: 'authorization_pending' }
              : { access_token: 'gho_fixture12345', token_type: 'bearer' },
      ),
    );
  };
  const token = await copilotDeviceLogin(
    'managed-client-123',
    signal,
    async (...args) => {
      shown.push(args);
    },
    fetcher as any,
    async ms => {
      waits.push(ms);
    },
  );
  assert.equal(token, 'gho_fixture12345');
  assert.deepEqual(waits, [5000, 10000, 10000]);
  assert.deepEqual(shown, [['ABCD-EFGH', 'https://github.com/login/device']]);
  assert.ok(posts.every(p => p.options.redirect === 'error'));
  assert.equal(posts[0].options.body.get('client_id'), 'managed-client-123');
  await assert.rejects(
    copilotDeviceLogin(
      'managed-client-123',
      signal,
      async () => {},
      async () =>
        new Response(
          JSON.stringify({ device_code: 'device', user_code: 'ABCD', verification_uri: 'https://evil.example', expires_in: 600 }),
        ) as any,
    ),
    /LOGIN_FAILED/,
  );
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(
    copilotDeviceLogin('managed-client-123', ctl.signal, async () => {}, fetcher as any),
    /CANCELLED/,
  );
});
test('Copilot SDK sessions disable native tools, account discovery, remote sessions, hooks and ambient configuration', async () => {
  let clientOptions: any,
    sessionOptions: any,
    stopped = 0,
    deleted = 0;
  const emitted: string[] = [];
  const fake = {
    start: async () => {},
    createSession: async (options: any) => {
      sessionOptions = options;
      return {
        sessionId: 'synthetic',
        sendAndWait: async () => {
          options.onEvent({ type: 'assistant.message_delta', data: { deltaContent: 'Synthetic Copilot draft' } });
          return { data: { content: 'Synthetic Copilot draft' } };
        },
      };
    },
    deleteSession: async () => {
      deleted++;
    },
    forceStop: async () => {
      stopped++;
    },
  };
  const adapter = new CopilotAdapter((options: any) => {
    clientOptions = options;
    return fake as any;
  });
  assert.equal(
    await adapter.run(
      'Public request',
      { id: 'copilot', provider: 'copilot', mode: 'oauth', model: 'fixture', ready: true, note: '', executable: '' },
      { cwd: tmpdir(), env: {}, key: 'synthetic', signal: new AbortController().signal, emit: t => emitted.push(t) },
    ),
    'Synthetic Copilot draft',
  );
  assert.equal(clientOptions.mode, 'empty');
  assert.equal(clientOptions.useLoggedInUser, false);
  assert.deepEqual(sessionOptions.availableTools, []);
  assert.deepEqual(sessionOptions.mcpServers, {});
  assert.equal(sessionOptions.enableConfigDiscovery, false);
  assert.equal(sessionOptions.enableSkills, false);
  assert.equal(sessionOptions.enableFileHooks, false);
  assert.equal(sessionOptions.enableHostGitOperations, false);
  assert.equal(sessionOptions.remoteSession, 'off');
  assert.equal((await sessionOptions.onPermissionRequest()).kind, 'denied-interactively-by-user');
  assert.equal((await sessionOptions.hooks.onPreToolUse()).permissionDecision, 'deny');
  assert.equal(emitted.join(''), 'Synthetic Copilot draft');
  assert.equal(deleted, 1);
  assert.equal(stopped, 1);
});
test('command registry validates collisions and platform modifiers; Vim edits only the composer subset', () => {
  assert.throws(() => validateKeybindings({ new: 'rm -rf' }), /INVALID/);
  assert.throws(() => validateKeybindings({ new: 'Mod+k' }), /DUPLICATE/);
  assert.throws(() => validateKeybindings({ shell: 'Mod+r' }), /INVALID/);
  const event = { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, isComposing: false };
  assert.equal(commandForKey(event), 'palette');
  assert.equal(commandForKey({ ...event, isComposing: true }), undefined);
  assert.equal(commandForKey({ ...event, ctrlKey: false, metaKey: true }, {}, true), 'palette');
  assert.equal(commandForKey({ ...event, key: 'q' }, { palette: 'Mod+q' }), 'palette');
  assert.equal(commandPalette({ new: () => {} }, { new: 'Mod+q' }, [])[0].hint, 'Mod+q');
  assert.equal(vimEdit('Escape', 'abc', 1, false)?.normal, true);
  assert.equal(vimEdit('i', 'abc', 1, true)?.normal, false);
  assert.equal(vimEdit('x', 'a😀b', 1, true)?.text, 'ab');
  assert.equal(vimEdit('j', 'abc\ndef', 1, true)?.cursor, 5);
  assert.equal(vimEdit('ก', 'abc', 1, false), undefined);
});
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
function wav() {
  const b = Buffer.alloc(364);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  return b;
}
test('voice installs verified components on demand, denies tampering and malformed audio, removes private recordings and scans transcripts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-voice-')),
    p = defaultPolicy(),
    runtime = Buffer.from('synthetic-binary'),
    model = Buffer.from('synthetic-model');
  p.features.voice = true;
  p.voice = {
    components: {
      [`${process.platform}-${process.arch}`]: {
        runtime: { url: 'https://fixture.example/runtime', sha256: sha(runtime) },
        model: { url: 'https://fixture.example/model', sha256: sha(model) },
      },
    },
  };
  const voice = new Voice(root, () => p);
  const fetcher = async (url: any) => new Response(String(url).endsWith('/runtime') ? runtime : model);
  try {
    assert.equal((await voice.status()).installed, false);
    await voice.install(fetcher as any);
    assert.equal((await voice.status()).installed, true);
    assert.throws(() => validateWav(Buffer.from('not audio')), /AUDIO_INVALID/);
    assert.equal(validateWav(wav()).length, 364);
    const result = await voice.transcribe(wav(), (async (_command: any, args: any) => {
      await writeFile(args[args.indexOf('-of') + 1] + '.txt', 'Public voice draft');
      return { code: 0 };
    }) as any);
    assert.equal(result.text, 'Public voice draft');
    const folders = await (await import('node:fs/promises')).readdir(root);
    assert.equal(folders.filter(f => f.startsWith('audio-')).length, 0);
    await assert.rejects(
      voice.transcribe(wav(), (async (_c: any, args: any) => {
        await writeFile(args[args.indexOf('-of') + 1] + '.txt', 'Contact name: Synthetic Person');
        return { code: 0 };
      }) as any),
      /PRIVACY_REVIEW_REQUIRED/,
    );
    const folder = folders.find(f => /^[a-f0-9]{64}$/.test(f))!;
    await writeFile(join(root, folder, 'model.bin'), 'tampered');
    await assert.rejects(voice.transcribe(wav()), /CHECKSUM_FAILED/);
    await assert.rejects(
      downloadVerified(
        { url: 'https://fixture.example/model', sha256: sha(model) },
        join(root, 'bad'),
        100,
        new AbortController().signal,
        async () => new Response('wrong') as any,
      ),
      /CHECKSUM_FAILED/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
