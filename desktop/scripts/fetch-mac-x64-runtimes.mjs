// Intel macOS installers built on an Apple silicon runner need the x64 builds of the bundled
// AI runtimes, which `npm ci` skips on arm64. Fetch exactly the tarballs pinned in
// package-lock.json, verify their integrity, and unpack them where the packages expect them.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8')).packages;
const wanted = [
  'node_modules/@openai/codex-darwin-x64',
  'node_modules/@anthropic-ai/claude-agent-sdk-darwin-x64',
  'node_modules/@github/copilot-sdk-darwin-x64',
];

for (const path of wanted) {
  const entry = lock[path];
  if (!entry?.resolved || !entry.integrity?.startsWith('sha512-')) throw new Error(`No pinned tarball for ${path}`);
  const response = await fetch(entry.resolved);
  if (!response.ok) throw new Error(`Download failed for ${path}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  if (digest !== entry.integrity) throw new Error(`Integrity mismatch for ${path}`);
  const archive = join(tmpdir(), path.replace(/\W+/g, '_') + '.tgz'),
    target = new URL('../' + path + '/', import.meta.url);
  await writeFile(archive, bytes);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '-C', target.pathname, '--strip-components=1']);
  console.log(`${path} ${entry.version} verified and unpacked`);
}
