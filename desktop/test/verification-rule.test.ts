import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { WorkService, VERIFICATION_RULE, type Harness } from '../electron/service';
import { DRAFT_SYSTEM } from '../electron/learning-draft';
import { Store } from '../electron/store';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const catalog: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');

// rules/learning-and-verification.md: no "done" without evidence, and lessons keep stable facts only.
async function systemFor(toolLoop: boolean) {
  const store = new Store(':memory:');
  store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true } as Connection);
  store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
  const systems: string[] = [];
  const harness: Harness = {
    root,
    route: (query, opts) => routing.queryStepRouter(query, { autoRoute: false, authorityChecks: true, ...opts }),
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
    toolLoop: () => toolLoop,
    tools: async () => ({
      enabled: () => toolLoop,
      check: async () => {},
      readOnly: () => true,
      execute: async () => ({}),
      outgoing: async s => s,
    }),
  };
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: tmpdir(), env: {} },
      adapter: {
        run: async (_prompt, _c, context) => {
          systems.push(context.system || '');
          return 'สรุปให้แล้วครับ';
        },
      },
    }),
    () => {},
  );
  try {
    const session = store.create('c', 'cc');
    await service.run(session.id, 'ช่วยสรุปขั้นตอนการทำงานนี้ให้หน่อย', '', true, undefined, 'chat');
    return systems.at(-1) || '';
  } finally {
    store.close();
  }
}

test('a run with tools carries the rule to verify with real evidence before saying work is done', async () => {
  const system = await systemFor(true);
  assert.ok(system.includes(VERIFICATION_RULE));
  assert.match(VERIFICATION_RULE, /real tool result/);
  assert.match(VERIFICATION_RULE, /say what is unverified/);
});

test('a run without tools does not carry the tool-evidence rule', async () => {
  const system = await systemFor(false);
  assert.ok(system.length > 0);
  assert.ok(!system.includes(VERIFICATION_RULE));
});

test('the lesson reviewer keeps stable facts and drops short-lived ones', async () => {
  assert.match(DRAFT_SYSTEM, /Never keep short-lived facts/);
  assert.match(DRAFT_SYSTEM, /PR, ticket or run numbers/);
  assert.match(DRAFT_SYSTEM, /corrections the employee made/);
  const rule = await readFile(resolve(root, 'rules/learning-and-verification.md'), 'utf8');
  assert.match(rule, /VERIFICATION_RULE/);
  assert.match(rule, /DRAFT_SYSTEM/);
});
