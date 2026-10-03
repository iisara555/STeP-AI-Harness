import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = join(ROOT, 'plugins', 'step');
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

test('the Claude plugin is rebuilt from skills/, rules/, docs/ and manifest/ (no hand edits, nothing stale)', () => {
  // Fails with the files that differ when someone edits a Skill without running scripts/build-claude-plugin.mjs.
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-claude-plugin.mjs'), '--check'], { stdio: 'pipe' });
});

test('the marketplace lists the plugin and the plugin carries every Skill once, in the layout Claude Code scans', () => {
  const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(market.name, 'step-ai');
  const entry = market.plugins.find((p) => p.name === 'step');
  assert.ok(entry && existsSync(join(ROOT, entry.source)), 'marketplace source exists');
  const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, entry.name, 'entry name and manifest name match, or installs by name fail');
  assert.equal(manifest.version, JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
  const source = walk(join(ROOT, 'skills')).filter((f) => f.endsWith('SKILL.md'));
  const plugin = readdirSync(join(PLUGIN, 'skills')).filter((d) => existsSync(join(PLUGIN, 'skills', d, 'SKILL.md')));
  assert.equal(plugin.length, source.length);
  assert.deepEqual(plugin.sort(), source.map((f) => dirname(f).split(/[\\/]/).pop()).sort());
  // No bin/: claude.ai and Cowork refuse a plugin with one, and the plugin should not put commands on PATH.
  assert.equal(existsSync(join(PLUGIN, 'bin')), false);
  const hooks = JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
  assert.match(hooks.hooks.SessionStart[0].hooks[0].command, /session-brief\.md/);
  assert.ok(existsSync(join(PLUGIN, 'session-brief.md')));
});

test('every relative Markdown link in the plugin resolves inside the plugin', () => {
  const broken = [];
  for (const file of walk(PLUGIN).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(file, 'utf8');
    for (const [, path] of text.matchAll(/\]\(([^)\s#:]+)(?:#[^)\s]*)?\)/g)) {
      if (!/\.(md|ya?ml|json|txt|csv)$/.test(path)) continue;
      const target = resolve(dirname(file), path);
      const inside = !relative(PLUGIN, target).startsWith('..');
      if (!inside || !existsSync(target) || !statSync(target).isFile()) broken.push(`${relative(PLUGIN, file)} → ${path}`);
    }
  }
  assert.deepEqual(broken, []);
});
