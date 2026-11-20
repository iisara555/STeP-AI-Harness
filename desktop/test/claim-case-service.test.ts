// A chat inside a disbursement case: the claims rule, AFP documents and no text-only shortcut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { CLAIM_CASE_RULE, WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

function fixture(autoRoute = true) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const captured: { prompt: string; system: string }[] = [];
  const harness: Harness = {
    root,
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute, authorityChecks: true, ...opts }),
    contextPolicy: boundary.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    skillMetadata: async id => {
      const metadata = await routing.loadSkillContextMetadata(id);
      return { ...metadata, mandatoryReferences: await routing.loadDocumentContextMetadata(metadata.mandatory) };
    },
    documentCatalog: async () => routing.loadDocumentCatalog(),
    catalog: async () => catalog.loadSkillCatalog(root),
    documentPrivacy: async () => null,
    nextOutput: async () => null,
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (prompt, _c, context) => {
          captured.push({ prompt, system: context.system || '' });
          context.emit('ตอบแล้ว');
          return 'ตอบแล้ว';
        },
      },
    }),
    () => {},
  );
  return { store, service, captured };
}

test('a case chat gets the claims rule and the case context, without a Skill menu question first', async () => {
  const f = fixture();
  try {
    const claim = f.store.create('c', 'cc', 'ผู้ช่วยเบิกจ่าย');
    claim.claimPacketId = '11111111-1111-4111-8111-111111111111';
    f.store.save(claim);
    const context = 'ข้อมูลเรื่องเบิกในแอป (ไม่ใช่การอนุมัติ)\nหมวด: หมวด B (B1–B12)';
    // With automatic routing on, this question would get "งานนี้ตรงกับข้อนี้ไหม" and a receipt Skill menu.
    await f.service.run(claim.id, 'ใบเสร็จไม่มีเลขผู้เสียภาษีใช้ได้ไหม', context, true, undefined, 'chat', undefined, [
      'ผลจากเครื่องมือในแอป',
    ]);
    assert.equal(f.captured.length, 1);
    const [inCase] = f.captured;
    assert.ok(inCase.system.includes(CLAIM_CASE_RULE));
    assert.ok(inCase.system.includes('claim-update'));
    assert.ok(inCase.prompt.includes('หมวด: หมวด B (B1–B12)'));
    assert.equal(f.store.session(claim.id).clarification, false);
  } finally {
    f.store.close();
  }
});

test('an ordinary chat does not get the claims rule', async () => {
  const f = fixture(false);
  try {
    const plain = f.store.create('c', 'cc');
    await f.service.run(plain.id, 'ใบเสร็จไม่มีเลขผู้เสียภาษีใช้ได้ไหม', '', true, undefined, 'chat');
    assert.equal(f.captured.length, 1);
    assert.ok(!f.captured[0].system.includes(CLAIM_CASE_RULE));
  } finally {
    f.store.close();
  }
});

test('a short language request in a case chat still answers as the claims assistant', async () => {
  const f = fixture();
  try {
    const claim = f.store.create('c', 'cc');
    claim.claimPacketId = '22222222-2222-4222-8222-222222222222';
    f.store.save(claim);
    await f.service.run(claim.id, 'แปลเป็นอังกฤษ: ใบสำคัญรับเงิน', '', true, undefined, 'chat');
    assert.ok(f.captured[0].system.includes(CLAIM_CASE_RULE));
  } finally {
    f.store.close();
  }
});
