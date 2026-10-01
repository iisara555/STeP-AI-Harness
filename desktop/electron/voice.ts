import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rename, rm, lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { boundedCommand } from '../../src/utils/bounded-command.js';
import { evaluatePrivacyGate } from '../../src/modules/privacy/index.js';
import type { Policy } from './policy';

export type VoiceSpec = NonNullable<Policy['voice']>['components'][string];
const fingerprint = (s: VoiceSpec) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
export async function fileDigest(path: string, signal?: AbortSignal) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('COMPONENT_INVALID');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  return hash.digest('hex');
}
export async function downloadVerified(
  artifact: { url: string; sha256: string },
  path: string,
  limit: number,
  signal: AbortSignal,
  fetcher = fetch,
) {
  const url = new URL(artifact.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !/^[a-f0-9]{64}$/.test(artifact.sha256))
    throw new Error('COMPONENT_INVALID');
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(600_000)]) });
  if (!response.ok || !response.body) throw new Error('COMPONENT_DOWNLOAD_FAILED');
  const handle = await open(path, 'wx', 0o600),
    hash = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of response.body as any) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > limit) throw new Error('COMPONENT_LIMIT');
      hash.update(chunk);
      await handle.writeFile(chunk);
    }
    if (!bytes || hash.digest('hex') !== artifact.sha256) throw new Error('COMPONENT_CHECKSUM_FAILED');
  } finally {
    await handle.close();
    await response.body.cancel().catch(() => {});
  }
}
export function validateWav(value: Uint8Array) {
  const b = Buffer.from(value);
  if (
    b.length < 46 ||
    b.length > 1_920_044 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WAVE' ||
    b.toString('ascii', 12, 16) !== 'fmt ' ||
    b.readUInt32LE(16) !== 16 ||
    b.readUInt16LE(20) !== 1 ||
    b.readUInt16LE(22) !== 1 ||
    b.readUInt32LE(24) !== 16000 ||
    b.readUInt32LE(28) !== 32000 ||
    b.readUInt16LE(32) !== 2 ||
    b.readUInt16LE(34) !== 16 ||
    b.toString('ascii', 36, 40) !== 'data' ||
    b.readUInt32LE(40) !== b.length - 44 ||
    b.readUInt32LE(4) !== b.length - 8 ||
    b.length % 2
  )
    throw new Error('VOICE_AUDIO_INVALID');
  return b;
}
export class Voice {
  private active?: AbortController;
  constructor(
    private root: string,
    private policy: () => Policy,
  ) {}
  private spec() {
    const p = this.policy(),
      s = p.voice?.components[`${process.platform}-${process.arch}`];
    if (!p.features.voice || !s) throw new Error('VOICE_DISABLED');
    return s;
  }
  private paths(s: VoiceSpec) {
    const folder = join(this.root, fingerprint(s));
    return {
      folder,
      runtime: join(folder, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'),
      model: join(folder, 'model.bin'),
    };
  }
  async status() {
    try {
      const s = this.spec(),
        p = this.paths(s);
      const ok = await Promise.all([lstat(p.runtime), lstat(p.model)]);
      return { enabled: true, installed: ok.every(f => f.isFile() && !f.isSymbolicLink()) };
    } catch {
      return { enabled: this.policy().features.voice, installed: false };
    }
  }
  cancel() {
    this.active?.abort();
  }
  async close() {
    this.cancel();
    while (this.active) await new Promise(r => setTimeout(r, 20));
  }
  async install(fetcher = fetch) {
    if (this.active) throw new Error('COMPONENT_BUSY');
    const s = this.spec(),
      p = this.paths(s),
      ctl = new AbortController();
    this.active = ctl;
    let stage = '';
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      stage = await mkdtemp(join(this.root, 'install-'));
      await downloadVerified(
        s.runtime,
        join(stage, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'),
        100 * 1024 * 1024,
        ctl.signal,
        fetcher,
      );
      await downloadVerified(s.model, join(stage, 'model.bin'), 3500 * 1024 * 1024, ctl.signal, fetcher);
      if (fingerprint(this.spec()) !== fingerprint(s)) throw new Error('POLICY_CHANGED');
      ctl.signal.throwIfAborted();
      if (process.platform !== 'win32') await chmod(join(stage, 'whisper-cli'), 0o700);
      try {
        await rename(stage, p.folder);
      } catch {
        if ((await fileDigest(p.runtime)) !== s.runtime.sha256 || (await fileDigest(p.model)) !== s.model.sha256)
          throw new Error('COMPONENT_INVALID');
      }
      return this.status();
    } finally {
      if (stage) await rm(stage, { recursive: true, force: true });
      this.active = undefined;
    }
  }
  async transcribe(value: Uint8Array, runner = boundedCommand) {
    if (this.active) throw new Error('COMPONENT_BUSY');
    const b = validateWav(value),
      s = this.spec(),
      p = this.paths(s),
      ctl = new AbortController();
    this.active = ctl;
    let work = '';
    try {
      if ((await fileDigest(p.runtime, ctl.signal)) !== s.runtime.sha256 || (await fileDigest(p.model, ctl.signal)) !== s.model.sha256)
        throw new Error('COMPONENT_CHECKSUM_FAILED');
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      work = await mkdtemp(join(this.root, 'audio-'));
      const input = join(work, 'input.wav'),
        output = join(work, 'draft');
      const h = await open(input, 'wx', 0o600);
      try {
        await h.writeFile(b);
      } finally {
        await h.close();
      }
      const result = await runner(p.runtime, ['-m', p.model, '-f', input, '-l', 'auto', '-otxt', '-of', output], {
        cwd: work,
        signal: ctl.signal,
        timeout: 180_000,
        limit: 20_000,
        env: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(SystemRoot|WINDIR|TEMP|TMP|PATH|LANG)$/i.test(k))),
      });
      if (result.code !== 0) throw new Error('VOICE_TRANSCRIPTION_FAILED');
      if (fingerprint(this.spec()) !== fingerprint(s)) throw new Error('POLICY_CHANGED');
      ctl.signal.throwIfAborted();
      const out = await lstat(output + '.txt');
      if (!out.isFile() || out.isSymbolicLink() || out.size > 60_000) throw new Error('VOICE_TRANSCRIPTION_FAILED');
      const text = (await readFile(output + '.txt', 'utf8')).trim(),
        scan = evaluatePrivacyGate(text);
      if (!text) throw new Error('VOICE_TRANSCRIPTION_FAILED');
      if (scan.action !== 'pass' || scan.containsPersonalData || scan.redactedText !== text) throw new Error('PRIVACY_REVIEW_REQUIRED');
      return { text };
    } finally {
      if (work) await rm(work, { recursive: true, force: true });
      this.active = undefined;
    }
  }
}
