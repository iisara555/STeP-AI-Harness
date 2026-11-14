import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composerCommand, typedSkill } from '../src/composer-command';

test('composer slash commands open their screen instead of going to the AI', () => {
  assert.deepEqual(composerCommand('  /btw   อะไรคือ TOR '), { kind: 'aside', text: 'อะไรคือ TOR' });
  assert.deepEqual(composerCommand('/BTW ถามแทรก'), { kind: 'aside', text: 'ถามแทรก' });
  assert.deepEqual(composerCommand('/vault'), { kind: 'credentials' });
  assert.deepEqual(composerCommand('/google '), { kind: 'credentials' });
  assert.deepEqual(composerCommand('/learn ใช้คำว่า "ผู้รับบริการ"'), { kind: 'learning', text: 'ใช้คำว่า "ผู้รับบริการ"' });
  // "/learning" is matched whole; it once left "ing" in front of the note.
  assert.deepEqual(composerCommand('/learning'), { kind: 'learning', text: '' });
  assert.deepEqual(composerCommand('/learning ตอบสั้น'), { kind: 'learning', text: 'ตอบสั้น' });
  assert.deepEqual(composerCommand('/memory'), { kind: 'memory' });
  assert.deepEqual(composerCommand('/usage'), { kind: 'usage' });
});

test('ordinary text and look-alike commands are sent as typed', () => {
  for (const text of ['สรุปเอกสารนี้', '/btw', '/learner ข้อความ', '/memory ของฉัน', '/usage now', '/vaults', 'ถาม /usage'])
    assert.equal(composerCommand(text), null, text);
});

test('"/skill request" picks a known Skill and keeps the rest as the request', () => {
  const known = (name: string) => name === 'tor-writer';
  assert.deepEqual(typedSkill('/tor-writer ร่าง TOR จ้างที่ปรึกษา', known), { skill: 'tor-writer', text: 'ร่าง TOR จ้างที่ปรึกษา' });
  assert.deepEqual(typedSkill('/tor-writer บรรทัดแรก\nบรรทัดสอง', known), { skill: 'tor-writer', text: 'บรรทัดแรก\nบรรทัดสอง' });
  assert.deepEqual(typedSkill('/unknown ร่างจดหมาย', known), { skill: '', text: '/unknown ร่างจดหมาย' });
  assert.deepEqual(typedSkill('/tor-writer', known), { skill: '', text: '/tor-writer' });
  assert.deepEqual(typedSkill(' ร่างจดหมาย ', known), { skill: '', text: ' ร่างจดหมาย ' });
});
