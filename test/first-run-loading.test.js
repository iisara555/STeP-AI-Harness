import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAdapter } from '../src/modules/adapters/index.js';
import { buildRouterGuidelines } from '../src/modules/router/index.js';

const TOOL_IDS = [
  'chatgpt',
  'claude',
  'codex',
  'cursor',
  'opencode',
  'windsurf',
  'gemini',
  'antigravity',
  'spark',
  'hermes',
  'all',
  'multi',
  'generic',
];

test('Lightweight First Run — all AI adapters', async (t) => {
  const role = {
    id: 'cc',
    name: 'Creative & Communication',
    description: 'Pilot startup performance test',
    isTeam: true,
    clusterId: 'market-creative',
    starterPrompts: [
      'ช่วยทำ Designer Brief จากข้อมูลนี้ให้ครบก่อนส่งทีมออกแบบ',
      'ช่วยคิด Event Concept จาก TOR นี้',
      'ช่วยจัดโครง Presentation นี้ให้ message ชัด',
    ],
  };

  const files = [
    {
      relativePath: 'skills/common/__startup-sentinel-skill__/SKILL.md',
      type: 'skill',
    },
    {
      relativePath: 'rules/__startup-sentinel-rule__.md',
      type: 'rule',
    },
  ];

  await t.test('compact router bootstrap is substantially smaller than full guidance', () => {
    const compact = buildRouterGuidelines({ format: 'compact' });
    const full = buildRouterGuidelines();

    assert.ok(compact.includes('Compact Bootstrap'));
    assert.ok(compact.includes('ห้าม recursive scan'));
    assert.ok(compact.includes('START-PROMPT.txt'));
    assert.ok(compact.includes('manifest/router-index.yaml'));
    assert.ok(compact.length < full.length * 0.4, `compact=${compact.length}, full=${full.length}`);
  });

  for (const tool of TOOL_IDS) {
    await t.test(`${tool}: startup instructions are lazy-loaded and do not enumerate inventory`, () => {
      const adapter = getAdapter(tool);
      const instructions = adapter.getInstructionFiles(role, files);

      assert.ok(instructions.length > 0);
      for (const instruction of instructions) {
        assert.ok(instruction.content.includes('Compact Bootstrap'), `${tool}/${instruction.filename} missing compact bootstrap`);
        assert.ok(instruction.content.includes('Installed ≠ Loaded'), `${tool}/${instruction.filename} missing lazy-load contract`);
        assert.ok(instruction.content.includes('Attachments sent directly to an AI client bypass this scanner'), `${tool}/${instruction.filename} missing pre-attachment boundary`);
        assert.ok(instruction.content.includes('First Work — Employee Handoff Contract'), `${tool}/${instruction.filename} missing first-work contract`);
        assert.ok(instruction.content.includes('USER.md'), `${tool}/${instruction.filename} missing USER.md routing identity`);
        assert.ok(instruction.content.includes('current user choice'), `${tool}/${instruction.filename} missing USER.md override rule`);
        assert.ok(instruction.content.includes('Installation-time team hint: **CC**'), `${tool}/${instruction.filename} missing installation team hint`);
        assert.ok(!instruction.content.includes('ช่วยทำ Designer Brief จากข้อมูลนี้ให้ครบก่อนส่งทีมออกแบบ'), `${tool}/${instruction.filename} should not duplicate mutable team starter prompts`);
        assert.ok(!instruction.content.includes('__startup-sentinel-skill__'), `${tool}/${instruction.filename} leaked Skill inventory`);
        assert.ok(!instruction.content.includes('__startup-sentinel-rule__'), `${tool}/${instruction.filename} leaked Rule inventory`);
        assert.ok(!instruction.content.includes('## Available Skills'), `${tool}/${instruction.filename} enumerates Skills`);
        assert.ok(!instruction.content.includes('## Approved Organization Skills'), `${tool}/${instruction.filename} enumerates Skills`);
        assert.ok(!instruction.content.includes('## Active Organization Rules'), `${tool}/${instruction.filename} enumerates Rules`);
      }
    });
  }

  await t.test('Universal onboarding defers team selection until after useful first-task help', () => {
    const adapter = getAdapter('all');
    const instructions = adapter.getInstructionFiles(
      {
        id: 'all',
        name: 'Universal Access',
        description: 'Deferred team selection',
        selectedCluster: 'market-creative',
      },
      files
    );

    for (const instruction of instructions) {
      assert.ok(instruction.content.includes('help with that task first'));
      assert.ok(instruction.content.includes('Ask for confirmation before saving'));
      assert.ok(instruction.content.includes('step-ai config --team <team-id>'));
      assert.ok(instruction.content.includes('market-creative'));
    }
  });

  await t.test('START-PROMPT explicitly forbids workspace-wide scan during onboarding', async () => {
    const prompt = await readFile('START-PROMPT.txt', 'utf-8');

    assert.ok(prompt.includes('ห้ามค้นหาแบบ recursive'));
    assert.ok(prompt.includes('ห้าม search *.md'));
    assert.ok(prompt.includes('skills/'));
    assert.ok(prompt.includes('rules/'));
    assert.ok(prompt.includes('manifest/'));
    assert.ok(prompt.includes('ถ้าผมมีงานจริงอยู่แล้ว ให้ช่วยงานนั้นก่อน'));
    assert.ok(prompt.includes('ขอคำยืนยันก่อนบันทึกทีม'));
  });
});
