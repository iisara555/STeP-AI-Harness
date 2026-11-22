import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { organizationDocumentModel } from '../electron/organization-ai-config';
import { queryStepRouter, loadSkillContextMetadata, loadDocumentContextMetadata } from '../../src/modules/router/service.js';
import { evaluatePrivacyGate } from '../../src/modules/privacy/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const models = [
  { id: 'step-chat', label: 'งานทั่วไป' },
  { id: 'step-long', label: 'เอกสารทางการ' },
];
const organization = { preset: 'organization', model: 'step-chat', models };

test('AI ขององค์กร picks the document model for official documents only, and only when the gateway offers it', () => {
  assert.equal(organizationDocumentModel(organization, { drafting: true }), 'step-long');
  assert.equal(organizationDocumentModel(organization, { drafting: false, skill: 'tor-government-writing' }), 'step-long');
  assert.equal(organizationDocumentModel(organization, { drafting: false, skill: 'thai-official-documents' }), 'step-long');
  assert.equal(organizationDocumentModel(organization, { drafting: false, skill: 'hr-policy-lookup' }), undefined);
  assert.equal(organizationDocumentModel(organization, { drafting: false }), undefined);
  assert.equal(
    organizationDocumentModel(organization, { drafting: true, chosenModel: 'step-chat' }),
    undefined,
    'a model the person chose for this task is kept',
  );
  assert.equal(organizationDocumentModel({ ...organization, models: [models[0]] }, { drafting: true }), undefined);
  assert.equal(organizationDocumentModel({ ...organization, preset: 'openrouter' }, { drafting: true }), undefined);
});

test('a letter drafted on AI ขององค์กร is written by the document model', async () => {
  const store = new Store(':memory:');
  store.put('connection', 'org', {
    id: 'org',
    preset: 'organization',
    provider: 'openai',
    protocol: 'openai',
    mode: 'api',
    model: 'step-chat',
    models,
    ready: true,
  });
  const session = store.create('org', 'pm');
  const harness: Harness = {
    root,
    route: (text, options) => queryStepRouter(text, { ...options, workspaceDir: root }),
    contextPolicy: () => ({ history: 'ignore', carryover: false }),
    privacy: evaluatePrivacyGate,
    skillMetadata: async id => {
      const meta = await loadSkillContextMetadata(id);
      return { ...meta, mandatoryReferences: await loadDocumentContextMetadata(meta?.mandatory || []) };
    },
    documentPrivacy: async () => null,
    nextOutput: async () => null,
  };
  const used: string[] = [];
  const service = new WorkService(
    store,
    harness,
    async () => ({
      context: { cwd: root, env: {} },
      adapter: {
        run: async (_prompt, connection) => {
          used.push(connection.model);
          return '<document_draft>เรื่อง ขอเชิญร่วมกิจกรรม\n\nเรียน ผู้รับสังเคราะห์</document_draft><document_review>ตรวจก่อนเสนอ</document_review>';
        },
      },
    }),
    () => {},
  );
  try {
    await service.run(session.id, 'ช่วยร่างหนังสือเชิญ', '', true, undefined, 'draft', undefined, [], {
      documentTool: 'letter',
      documentVariant: 'invitation',
    });
    assert.ok(used.length > 0);
    assert.deepEqual([...new Set(used)], ['step-long']);
  } finally {
    store.close();
  }
});
