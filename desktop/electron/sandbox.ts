import { mkdtemp, mkdir, writeFile, rm, lstat, chmod } from 'node:fs/promises';
import { join, dirname, relative, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Policy } from './policy';
import { Workbench } from './workbench';
import { processResult } from './bounded-process';
export function sandboxArgs(image: string, folder: string, name: string, command: string) {
  if (!/^[a-z0-9][a-z0-9._/:\-]*@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('SANDBOX_IMAGE_REQUIRED');
  return [
    'run',
    '--rm',
    '--pull=never',
    '--name',
    name,
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user=1000:1000',
    '--cpus=1',
    '--memory=512m',
    '--pids-limit=128',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=64m',
    '--mount',
    `type=bind,source=${folder},target=/workspace,readonly`,
    '--workdir=/workspace',
    image,
    '/bin/sh',
    '-lc',
    command,
  ];
}
/** Mount only explicitly selected, privacy-checked text snapshots. Container output never writes host files. */
export class Sandbox {
  private active = new Set<AbortController>();
  async close() {
    for (const c of this.active) c.abort();
    while (this.active.size) await new Promise(r => setTimeout(r, 10));
  }
  constructor(
    private workbench: Workbench,
    private policy: () => Policy,
    private privacy: (text: string) => any,
    private consent: (text: string, signal?: AbortSignal) => Promise<boolean>,
    private runner = processResult,
  ) {}
  async run(command: string, files: string[], signal?: AbortSignal) {
    const controller = new AbortController(),
      abort = () => controller.abort();
    if (signal?.aborted) throw new Error('CANCELLED');
    this.active.add(controller);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      return await this.execute(command, files, controller.signal);
    } finally {
      signal?.removeEventListener('abort', abort);
      this.active.delete(controller);
    }
  }
  private async execute(command: string, files: string[], signal?: AbortSignal) {
    const policy = this.policy(),
      root = await this.workbench.root();
    if (!policy.features.sandbox) throw new Error('SANDBOX_DISABLED');
    if (!policy.sandbox?.image) throw new Error('SANDBOX_IMAGE_REQUIRED');
    if (
      !command.trim() ||
      command.length > 2000 ||
      command.includes('\0') ||
      !Array.isArray(files) ||
      files.length > 20 ||
      files.some(f => typeof f !== 'string')
    )
      throw new Error('INVALID_INPUT');
    const entries: { path: string; bytes: Buffer }[] = [];
    let total = 0;
    for (const file of [...new Set(files)]) {
      const full = await this.workbench.path(file),
        stat = await lstat(full);
      if (!stat.isFile() || stat.nlink > 1) throw new Error('INVALID_PATH');
      const bytes = await this.workbench.bytes(file, 200_000);
      total += bytes.length;
      if (total > 2_000_000 || bytes.includes(0)) throw new Error('FILE_LIMIT');
      const text = bytes.toString('utf8'),
        scan = this.privacy(text);
      if (scan.action !== 'pass' || scan.containsPersonalData || scan.redactedText !== text) throw new Error('PRIVACY_REVIEW_REQUIRED');
      entries.push({ path: relative(root, full), bytes });
    }
    const scan = this.privacy(command);
    if (scan.action !== 'pass' || scan.redactedText !== command) throw new Error('PRIVACY_REVIEW_REQUIRED');
    if (
      !(await this.consent(
        `Docker image: ${policy.sandbox.image}\nไม่มีเครือข่าย\nคำสั่ง: ${command}\nไฟล์ที่แนบแบบอ่านอย่างเดียว: ${entries.map(e => e.path).join(', ') || 'ไม่มี'}`,
        signal,
      ))
    )
      throw new Error('CANCELLED');
    const check = async () => {
      if (signal?.aborted) throw new Error('CANCELLED');
      if (policy !== this.policy() || root !== (await this.workbench.root())) throw new Error('POLICY_CHANGED');
    };
    await check();
    const available = await this.runner('docker', ['info', '--format', '{{.ServerVersion}}'], { signal, timeout: 5000 });
    if (available.code !== 0) throw new Error('DOCKER_UNAVAILABLE');
    const folder = await mkdtemp(join(tmpdir(), 'step-sandbox-')),
      name = 'step-' + randomUUID();
    await chmod(folder, 0o755);
    const controller = new AbortController(),
      cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const watcher = setInterval(() => {
      void check().catch(cancel);
    }, 250);
    try {
      for (const entry of entries) {
        const path = resolve(folder, entry.path),
          rel = relative(folder, path);
        if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('INVALID_PATH');
        await mkdir(dirname(path), { recursive: true, mode: 0o755 });
        await writeFile(path, entry.bytes, { mode: 0o444, flag: 'wx' });
      }
      await check();
      const result = await this.runner('docker', sandboxArgs(policy.sandbox.image, folder, name, command), {
        signal: controller.signal,
        timeout: 120_000,
        limit: 200_000,
      });
      await check();
      return result;
    } finally {
      clearInterval(watcher);
      signal?.removeEventListener('abort', cancel);
      await this.runner('docker', ['rm', '-f', name], { timeout: 5000 }).catch(() => {});
      if (!(await lstat(folder)).isSymbolicLink() && dirname(folder) === resolve(tmpdir()))
        await rm(folder, { recursive: true, force: true });
    }
  }
}
