import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionCapabilities, organizationCapabilities } from '../src/connection-capabilities';
import type { Connection, PolicySnapshot } from '../src/types';
import { takesImages } from '../src/vision-transport';
const connection = {
  id: 'synthetic',
  provider: 'antigravity',
  mode: 'subscription',
  ready: true,
  model: '',
  executable: '',
  note: '',
} as Connection;
const policy = {
  source: 'default',
  features: { toolLoop: true, vision: true, autoRouting: false, mcp: false, coordinator: false, cron: false },
  mode: 'ask',
  checks: { authority: false, privacy: false },
  mcpServers: 0,
} as unknown as PolicySnapshot;
const state = (c: Connection, p: PolicySnapshot | undefined, id: string) => connectionCapabilities(c, p).find(x => x.id === id)!;
test('Antigravity can search via host and take attached images, but has no image-generation entitlement', () => {
  assert.equal(state(connection, policy, 'web').state, 'available');
  assert.equal(state(connection, policy, 'vision').state, 'conditional');
  assert.equal(state(connection, policy, 'image').state, 'blocked');
});
test('images go where the transport carries them; Copilot points to OCR text instead', () => {
  const compatible = { ...connection, provider: 'compatible', mode: 'api' } as Connection;
  assert.equal(state(compatible, policy, 'vision').state, 'conditional');
  assert.equal(state({ ...connection, provider: 'copilot' } as Connection, policy, 'vision').reason, 'transport');
  assert.match(state({ ...connection, provider: 'copilot' } as Connection, policy, 'vision').detail, /OCR/);
  for (const provider of ['openai', 'claude', 'gemini', 'compatible', 'antigravity']) assert.equal(takesImages(provider), true, provider);
  for (const provider of ['copilot', undefined]) assert.equal(takesImages(provider), false, String(provider));
});
test('policy revocation and missing policy never project stale or guessed readiness', () => {
  assert.equal(state({ ...connection, policyBlocked: true, ready: false }, policy, 'web').state, 'blocked');
  assert.equal(state(connection, { ...policy, features: { ...policy.features, toolLoop: false } }, 'web').state, 'blocked');
  assert.equal(state(connection, undefined, 'web').state, 'unknown');
  assert.equal(state({ ...connection, ready: false }, policy, 'chat').state, 'blocked');
});
test('vision and image routes expose their policy blockers and model-dependent status', () => {
  const api = { ...connection, provider: 'openai', mode: 'api' } as Connection;
  assert.equal(state(api, policy, 'vision').state, 'conditional');
  assert.equal(state(api, { ...policy, checks: {} } as PolicySnapshot, 'vision').state, 'unknown');
  assert.equal(state(api, { ...policy, checks: { authority: false, privacy: true } }, 'vision').reason, 'privacy');
  assert.equal(state(api, { ...policy, features: { ...policy.features, vision: false } }, 'vision').reason, 'policy');
  assert.equal(state(api, policy, 'image').state, 'conditional');
  assert.equal(state({ ...api, mode: 'subscription' }, policy, 'image').reason, 'api-required');
  assert.equal(state(api, { ...policy, mode: 'plan' }, 'image').reason, 'plan');
});
test('organization capabilities distinguish disabled, missing server and enabled-but-unverified access', () => {
  const get = (p: PolicySnapshot, id: string) => organizationCapabilities(p).find(x => x.id === id)!;
  assert.equal(get(policy, 'routing').state, 'available');
  assert.equal(get({ ...policy, features: { ...policy.features, mcp: true } }, 'mcp').reason, 'server-missing');
  assert.equal(
    get({ ...policy, features: { ...policy.features, mcp: true }, mcpServers: 1 } as PolicySnapshot, 'mcp').state,
    'conditional',
  );
  assert.equal(get(policy, 'privacy').state, 'blocked');
  assert.equal(get({ ...policy, checks: { authority: true, privacy: true } }, 'privacy').state, 'available');
  assert.equal(get({ ...policy, features: { ...policy.features, cron: true } }, 'cron').state, 'conditional');
});

test('Skill selection includes model tool discovery even when pre-routing is off', () => {
  const routing = (features: Record<string, boolean>) => organizationCapabilities({ ...policy, features }).find(x => x.id === 'routing')!;
  assert.equal(routing({ autoRouting: false, toolLoop: true }).state, 'available');
  assert.match(routing({ autoRouting: false, toolLoop: true }).detail, /AI.*เลือก Skill/);
  assert.equal(routing({ autoRouting: true, toolLoop: false }).state, 'available');
  assert.equal(routing({ autoRouting: false, toolLoop: false }).state, 'blocked');
  assert.equal(routing({ autoRouting: false }).state, 'unknown');
  assert.equal(organizationCapabilities().find(x => x.id === 'routing')!.state, 'unknown');
});
