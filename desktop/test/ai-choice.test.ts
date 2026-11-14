import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAiChoice, effortAfterModelChange, nextConnectionId } from '../src/ai-choice';
import { CLAUDE_CODE, connectionName } from '../src/messages';
import type { Connection, Session, Snapshot } from '../src/types';

const connection = (id: string, ready: boolean, extra: Partial<Connection> = {}) =>
  ({ id, provider: 'openai', mode: 'api', model: '', executable: '', ready, note: '', label: 'AI ' + id, ...extra }) as Connection;
const models = [
  { id: 'fast', label: 'Fast', efforts: [{ id: 'low' }, { id: 'high' }] },
  { id: 'deep', label: 'Deep', isDefault: true, efforts: [{ id: 'high' }] },
  { id: 'plain', label: 'Plain' },
];
const snapshot = (connections: Connection[], autoEffort = false) =>
  ({ connections, policy: { features: { autoEffort } }, usage: { accounts: [{ connectionId: 'b', used: 1 }] } }) as unknown as Snapshot;
const task = (extra: Partial<Session> = {}) => ({ id: 's1', connectionId: 'b', ...extra }) as Session;

test('a new task keeps a ready connection and moves off one that is not ready', () => {
  const list = [connection('a', false), connection('b', true), connection('c', true)];
  assert.equal(nextConnectionId(list, 'c'), 'c');
  assert.equal(nextConnectionId(list, 'a'), 'b');
  assert.equal(nextConnectionId(list, 'gone'), 'b');
  assert.equal(nextConnectionId([connection('a', false)], 'a'), 'a');
  assert.equal(nextConnectionId([connection('a', false)], ''), 'a');
  assert.equal(nextConnectionId([], 'a'), '');
  assert.equal(nextConnectionId(list, CLAUDE_CODE), CLAUDE_CODE);
});

test('a model change keeps the effort only when the new model offers it', () => {
  assert.equal(effortAfterModelChange(models[0], 'high'), 'high');
  assert.equal(effortAfterModelChange(models[1], 'low'), '');
  assert.equal(effortAfterModelChange(models[2], 'high'), '');
  assert.equal(effortAfterModelChange(undefined, 'high'), '');
  assert.equal(effortAfterModelChange(models[2], 'high', 'low'), 'low');
});

test('a task shows its own connection, model and effort; a new task shows the pending choice', () => {
  const data = snapshot([connection('a', true, { models }), connection('b', true, { models, model: 'fast' })]);
  const running = describeAiChoice(data, task({ model: 'deep', effort: 'high' }), 'a', 'fast', 'low');
  assert.equal(running.connection?.id, 'b');
  assert.equal(running.currentModel, 'deep');
  assert.equal(running.currentEffort, 'high');
  assert.equal(running.activeUsageAccount?.connectionId, 'b');
  const fresh = describeAiChoice(data, undefined, 'a', 'fast', 'low');
  assert.equal(fresh.connection?.id, 'a');
  assert.equal(fresh.currentModel, 'fast');
  assert.equal(fresh.currentEffort, 'low');
  assert.equal(fresh.activeUsageAccount, undefined);
  // No model chosen falls back to the connection's model, then to the provider's default.
  assert.equal(describeAiChoice(data, task(), 'a', undefined, '').currentModel, 'fast');
  assert.equal(describeAiChoice(data, undefined, 'a', undefined, '').activeModel?.id, 'deep');
});

test('labels name the model and effort, and say when the connection is not ready', () => {
  const ready = describeAiChoice(snapshot([connection('a', true, { models })]), undefined, 'a', 'fast', 'high');
  assert.equal(ready.modelName, 'Fast');
  const name = connectionName(connection('a', true));
  assert.ok(ready.aiLabel.startsWith('Fast · '));
  assert.ok(ready.aiSummary.startsWith(name + ' · Fast · '));
  const notReady = describeAiChoice(snapshot([connection('a', false, { models })]), undefined, 'a', 'plain', '');
  assert.equal(notReady.aiLabel, 'Plain');
  assert.equal(notReady.aiSummary, name + ' · Plain · ยังไม่พร้อม');
  const auto = describeAiChoice(snapshot([connection('a', true, { models })], true), undefined, 'a', 'fast', '');
  assert.equal(auto.aiSummary, name + ' · Fast · อัตโนมัติตามขนาดงาน');
  assert.equal(describeAiChoice(snapshot([]), undefined, '', undefined, '').aiLabel, 'เลือก AI');
  assert.equal(describeAiChoice(snapshot([]), undefined, CLAUDE_CODE, undefined, '').aiLabel, 'Claude · Pro/Max (เปิดใน Claude Code)');
  assert.equal(describeAiChoice(snapshot([connection('a', true)]), undefined, 'a', undefined, '').readyConnection?.id, 'a');
});
