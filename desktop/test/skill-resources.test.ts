import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { discoverSkillResources, selectSkillBundle, tokenizeSearchText } from '../electron/skill-resources';

const root = resolve('..');

test('discoverSkillResources indexes templates, examples and references for real STeP Skills', async () => {
  const tor = await discoverSkillResources(root, 'skills/pm/tor-government-writing/SKILL.md');
  assert.ok(tor.templates.length >= 1, 'tor-government-writing has templates');
  assert.ok(tor.examples.length >= 1, 'tor-government-writing has examples');
  assert.ok(tor.references.length >= 1, 'tor-government-writing has references');
  assert.ok(tor.templates.every(t => t.path.startsWith('templates/')));
  assert.ok(tor.examples.every(e => e.path.startsWith('examples/')));
  assert.ok(tor.references.every(r => r.path.startsWith('references/')));

  const premortem = await discoverSkillResources(root, 'skills/pm/project-pre-mortem/SKILL.md');
  assert.ok(premortem.templates.some(t => t.path === 'templates/pre-mortem-matrix-template.md'));
});

test('selectSkillBundle preloads best-matching template and example within budget and marks [PRELOADED] in manifest', async () => {
  const bundle = await selectSkillBundle(root, 'skills/pm/tor-government-writing/SKILL.md', 'ช่วยร่าง TOR จัดซื้อครุภัณฑ์คอมพิวเตอร์', {
    skillName: 'tor-government-writing',
    mode: 'draft',
  });
  assert.match(bundle.manifestText, /<skill_resource_manifest skill="tor-government-writing">/);
  assert.match(bundle.manifestText, /templates\/tor-16-sections-template\.md[\s\S]*\[PRELOADED\]/);
  assert.match(bundle.preloadedText, /<skill_template path="templates\/tor-16-sections-template\.md"/);
  assert.match(bundle.preloadedText, /<skill_example path="examples\//);
  assert.ok(bundle.preloadedPaths.includes('templates/tor-16-sections-template.md'));
});

test('discoverSkillResources refuses paths outside the skills directory', async () => {
  const outside = await discoverSkillResources(root, '../outside/SKILL.md');
  assert.equal(outside.all.length, 0);
});

test('tokenizeSearchText segments Thai and English words for resource and lesson matching', () => {
  const tokens = tokenizeSearchText('ช่วยร่าง TOR จัดซื้อครุภัณฑ์คอมพิวเตอร์');
  assert.ok(tokens.includes('tor'));
  assert.ok(tokens.some(t => t.includes('ครุภัณฑ์') || t.includes('คอมพิวเตอร์')));
});
