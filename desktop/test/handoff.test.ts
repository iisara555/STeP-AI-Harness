import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findClaudeCode, handoffText } from '../electron/handoff';

test('handoff text keeps the request and points at a chosen Skill file', () => {
  assert.equal(handoffText('ร่างหนังสือ'), 'ร่างหนังสือ');
  assert.match(handoffText('ร่างหนังสือ', { name: 'thai-doc', file: '/h/skills/thai-doc/SKILL.md' }), /^ร่างหนังสือ\n\n\[STeP\] .*"thai-doc".*\/h\/skills\/thai-doc\/SKILL\.md$/);
});

test('Claude Code lookup answers with an existing path or null', async () => {
  const found = await findClaudeCode();
  assert.ok(found === null || typeof found === 'string');
});
