import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionCapabilities, organizationCapabilities } from '../src/connection-capabilities';
import type { Connection, PolicySnapshot } from '../src/types';
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
test('Antigravity can search via host but does not inherit image or image-generation entitlement', () => {
  assert.equal(state(connection, policy, 'web').state, 'available');
  assert.equal(state(connection, policy, 'vision').state, 'blocked');
  assert.equal(state(connection, policy, 'image').state, 'blocked');
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
  assert.equal(get(policy, 'routing').state, 'blocked');
  assert.equal(get({ ...policy, features: { ...policy.features, mcp: true } }, 'mcp').reason, 'server-missing');
  assert.equal(
    get({ ...policy, features: { ...policy.features, mcp: true }, mcpServers: 1 } as PolicySnapshot, 'mcp').state,
    'conditional',
  );
  assert.equal(get(policy, 'privacy').state, 'blocked');
  assert.equal(get({ ...policy, checks: { authority: true, privacy: true } }, 'privacy').state, 'available');
  assert.equal(get({ ...policy, features: { ...policy.features, cron: true } }, 'cron').state, 'conditional');
});
