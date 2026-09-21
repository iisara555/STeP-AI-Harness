import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scanPrivacyText,
  redactPrivacyText,
  evaluatePrivacyGate,
  clearPrivacyScanCache,
  getPrivacyScanCacheSize,
} from '../src/modules/privacy/index.js';
import { loadPlaybooks, buildRunState, recordRunFeedback } from '../src/modules/playbooks/index.js';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';

test('Lightweight Privacy Gate', async (t) => {
  await t.test('normal TOR text passes without redaction', () => {
    const result = evaluatePrivacyGate('TOR งานจ้างออกแบบบูธ งบประมาณ 500000 บาท');
    assert.equal(result.classification, 'public');
    assert.equal(result.action, 'pass');
    assert.equal(result.containsPersonalData, false);
    assert.equal(result.redactionApplied, false);
  });

  await t.test('phone, email, ID and bank account are masked locally', () => {
    const input = [
      'ชื่อ: นายตัวอย่าง',
      'โทร 081-234-5678',
      'email demo.person@example.com',
      'เลขประจำตัว 1-2345-67890-12-3',
      'เลขบัญชี: 123-4-56789-0',
    ].join('\n');

    const result = evaluatePrivacyGate(input);

    assert.equal(result.classification, 'restricted');
    assert.equal(result.action, 'auto-mask');
    assert.equal(result.canSendToExternalAI, false);
    assert.equal(result.requiresHumanConfirmation, true);
    assert.ok(!result.redactedText.includes('081-234-5678'));
    assert.ok(!result.redactedText.includes('demo.person@example.com'));
    assert.ok(!result.redactedText.includes('1-2345-67890-12-3'));
    assert.ok(!result.redactedText.includes('123-4-56789-0'));
  });

  await t.test('known public organization identifier can be allowlisted', () => {
    const orgId = '0994000164973';
    const masked = redactPrivacyText('เลขผู้เสียภาษี 0994000164973').redactedText;
    assert.ok(!masked.includes(orgId));

    const allowed = redactPrivacyText('เลขผู้เสียภาษี 0994000164973', {
      allowedIdentifiers: [orgId],
    }).redactedText;
    assert.ok(allowed.includes(orgId));
  });

  await t.test('possible sensitive data plus direct identifier blocks external AI', () => {
    const result = evaluatePrivacyGate('ผู้รับบริการ โทร 0812345678 มีข้อมูลสุขภาพเกี่ยวกับผลตรวจสุขภาพ');
    assert.equal(result.classification, 'sensitive');
    assert.equal(result.action, 'block-external');
    assert.equal(result.canSendToExternalAI, false);
    assert.equal(result.requiresHumanConfirmation, true);
  });

  await t.test('sensitive keyword without direct identifier asks for human confirmation instead of auto-blocking everything', () => {
    const result = evaluatePrivacyGate('แนวทางทั่วไปสำหรับการจัดเก็บข้อมูลสุขภาพขององค์กร');
    assert.equal(result.classification, 'restricted');
    assert.equal(result.action, 'human-confirm');
    assert.equal(result.requiresHumanConfirmation, true);
  });

  await t.test('scan cache reuses the same text/options result', () => {
    clearPrivacyScanCache();
    const first = scanPrivacyText('โทร 081-234-5678');
    const second = scanPrivacyText('โทร 081-234-5678');
    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(getPrivacyScanCacheSize(), 1);
  });

  await t.test('playbook run stores redacted query and metadata, not raw PII', async () => {
    const playbooks = await loadPlaybooks(PACKAGE_ROOT);
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    const state = buildRunState({
      playbook,
      query: 'ช่วยตรวจ TOR ติดต่อ 081-234-5678 email demo.person@example.com',
      team: 'afp',
      matchedSignals: ['source', 'planning', 'schedule'],
    });

    assert.ok(!state.query.includes('081-234-5678'));
    assert.ok(!state.query.includes('demo.person@example.com'));
    assert.equal(state.context.privacy.containsPersonalData, true);
    assert.equal(state.context.privacy.privacyClass, 'restricted');
    assert.ok(state.context.privacy.sourceHash);
  });

  await t.test('feedback note is redacted before it is persisted', async () => {
    const playbooks = await loadPlaybooks(PACKAGE_ROOT);
    const playbook = playbooks.find((p) => p.id === 'tor-to-project-plan');
    let state = buildRunState({
      playbook,
      query: 'TOR action plan gantt',
      matchedSignals: ['source', 'planning', 'schedule'],
    });
    state = recordRunFeedback(state, {
      rating: 'needs-fix',
      note: 'ติดต่อผู้แจ้งที่ 081-234-5678 หรือ demo.person@example.com',
    });

    assert.ok(!state.feedback[0].note.includes('081-234-5678'));
    assert.ok(!state.feedback[0].note.includes('demo.person@example.com'));
  });
});
