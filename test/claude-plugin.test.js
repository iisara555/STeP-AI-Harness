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
  // Gemini CLI no longer serves personal Google accounts (June 2026), so the plugin is not a Gemini extension any more.
  assert.equal(existsSync(join(PLUGIN, 'gemini-extension.json')), false);
  assert.equal(existsSync(join(PLUGIN, 'GEMINI.md')), false);
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

test('Antigravity install: Skills in .agents/skills, short rules always on, full files under .agents/step, links intact, re-runnable', async () => {
  const { installAntigravity } = await import('../scripts/install-agent-skills.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const work = mkdtempSync(join(tmpdir(), 'step-antigravity-'));
  try {
    mkdirSync(join(work, '.agents', 'skills', 'my-own'), { recursive: true });
    writeFileSync(join(work, '.agents', 'skills', 'my-own', 'SKILL.md'), 'mine');
    installAntigravity(work);
    installAntigravity(work);
    const agents = join(work, '.agents');
    const skills = readdirSync(join(agents, 'skills'));
    assert.equal(skills.length, readdirSync(join(PLUGIN, 'skills')).length + 1, 'every STeP Skill once, and the employee’s own Skill kept');
    assert.equal(readFileSync(join(agents, 'skills', 'my-own', 'SKILL.md'), 'utf8'), 'mine');
    assert.deepEqual(readdirSync(join(agents, 'rules')), ['step.md'], 'only the short brief is an always-on rule');
    assert.match(readFileSync(join(agents, 'rules', 'step.md'), 'utf8'), /\.agents\/step\/rules\/human-approval\.md/);
    const broken = [];
    for (const file of walk(agents).filter((f) => f.endsWith('.md')))
      for (const [, path] of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s#:]+)(?:#[^)\s]*)?\)/g))
        if (/\.(md|ya?ml|json)$/.test(path) && !existsSync(resolve(dirname(file), path))) broken.push(`${relative(agents, file)} → ${path}`);
    assert.deepEqual(broken, []);
    assert.ok(existsSync(join(agents, 'step', 'manifest', 'documents.yaml')));
    assert.match(readFileSync(join(agents, 'skills', 'receipt-audit', 'SKILL.md'), 'utf8'), /`\.\.\/\.\.\/step\/manifest\/documents\.yaml`/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('Codex rules: one managed STeP block in AGENTS.md, replaced on re-run, the employee’s own text kept', async () => {
  const { installCodexRules } = await import('../scripts/install-agent-skills.mjs');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const home = mkdtempSync(join(tmpdir(), 'step-codex-'));
  try {
    writeFileSync(join(home, 'AGENTS.md'), '# My rules\n\nkeep me\n');
    installCodexRules(home);
    installCodexRules(home);
    const text = readFileSync(join(home, 'AGENTS.md'), 'utf8');
    assert.ok(text.startsWith('# My rules\n\nkeep me\n'));
    assert.equal(text.split('STeP AI Skills: begin').length - 1, 1);
    assert.match(text, /มนุษย์อนุมัติ/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Antigravity global install: Skills in ~/.gemini/config/skills, brief in GEMINI.md once, the user’s own text and Skills kept', async () => {
  const { installAntigravityGlobal } = await import('../scripts/install-agent-skills.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const gemini = mkdtempSync(join(tmpdir(), 'step-gemini-home-'));
  try {
    writeFileSync(join(gemini, 'GEMINI.md'), '# Mine\n\nตอบภาษาไทย\n');
    mkdirSync(join(gemini, 'config', 'skills', 'my-own'), { recursive: true });
    writeFileSync(join(gemini, 'config', 'skills', 'my-own', 'SKILL.md'), 'mine');
    installAntigravityGlobal(gemini);
    installAntigravityGlobal(gemini);
    const config = join(gemini, 'config');
    assert.equal(readdirSync(join(config, 'skills')).length, readdirSync(join(PLUGIN, 'skills')).length + 1);
    assert.equal(readFileSync(join(config, 'skills', 'my-own', 'SKILL.md'), 'utf8'), 'mine');
    const rules = readFileSync(join(gemini, 'GEMINI.md'), 'utf8');
    assert.ok(rules.startsWith('# Mine\n\nตอบภาษาไทย\n'));
    assert.equal(rules.split('STeP AI Skills: begin').length - 1, 1);
    const linked = [...rules.matchAll(/([^\s(),`]+\/step\/rules\/[\w-]+\.md)/g)].map((m) => m[1]);
    assert.ok(linked.length > 0);
    for (const path of linked) assert.ok(existsSync(path), `GEMINI.md links to ${path}`);
    assert.match(readFileSync(join(config, 'skills', 'receipt-audit', 'SKILL.md'), 'utf8'), /`\.\.\/\.\.\/step\/manifest\/documents\.yaml`/);
  } finally {
    rmSync(gemini, { recursive: true, force: true });
  }
});
