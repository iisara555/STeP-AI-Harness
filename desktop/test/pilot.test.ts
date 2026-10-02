import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Store } from '../electron/store';
import { Approvals } from '../electron/approvals';
import { ToolGate } from '../electron/tool-gate';
import { ConsentMetrics } from '../electron/consent-metrics';
import { sendConsent, type SendSignals } from '../electron/consent-plan';
import { RunTransmission } from '../electron/transmission';
import { WorkService, type Harness } from '../electron/service';
import { parsePolicy } from '../electron/policy';
import type { ApprovalRequest } from '../src/types';

const privacy: any = await import('../../src/modules/privacy/index.js');
const harness = { root: resolve('..'), privacy: privacy.evaluatePrivacyGate } as unknown as Harness;
const reviewer = () =>
  new WorkService(
    new Store(':memory:'),
    harness,
    async () => ({}) as any,
    () => {},
  );
const plain: SendSignals = {
  action: 'pass',
  keywordOnly: false,
  first: false,
  attachment: false,
  source: false,
  vision: false,
  coordinated: false,
};

test('pilot is an administrator switch: off by default, true or false only', () => {
  assert.equal(parsePolicy({}).policy.pilot, undefined);
  assert.equal(parsePolicy({ pilot: true }).policy.pilot, true);
  assert.equal(parsePolicy({ pilot: false }).policy.pilot, false);
  const bad = parsePolicy({ pilot: 'yes' });
  assert.equal(bad.problems.length, 1, 'a malformed flag rejects the whole policy');
  assert.equal(bad.policy.pilot, undefined);
});

test('floor: credentials and sensitive data tied to a person are blocked in pilot mode', () => {
  const service = reviewer();
  for (const text of [
    'รหัสผ่านอีเมลคือ password: Hunter2xyz99',
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD',
    'นาย สมชาย ใจดี เลขบัตร 1101700203451 มีโรคประจำตัว',
  ]) {
    for (const [input, attachment] of [
      [text, ''],
      ['สรุปไฟล์นี้', text],
    ]) {
      const review = service.review(input, attachment);
      assert.equal(review.action, 'block-external', text);
      const decision = sendConsent({ ...plain, action: 'block-external', keywordOnly: review.keywordOnly }, true);
      assert.deepEqual(decision, { block: true, ask: false, warning: false }, text);
    }
  }
});

test('floor: national ID numbers are masked before sending, with a notice', () => {
  const review = reviewer().review('เลขบัตรประชาชน 1101700203451 ขอที่อยู่จัดส่ง', '');
  assert.equal(review.action, 'pass');
  assert.equal(review.masked, true);
  assert.ok(review.labels.length > 0, 'labels feed the "masked before sending" notice');
  const sent = privacy.evaluatePrivacyGate('เลขบัตรประชาชน 1101700203451 ขอที่อยู่จัดส่ง').redactedText;
  assert.doesNotMatch(sent, /1101700203451/);
});

test('pilot: a sensitive word alone warns instead of asking; a name table or person still asks', () => {
  const service = reviewer();
  const keyword = service.review('สรุปแนวปฏิบัติการเก็บประวัติการรักษาของพนักงาน', '');
  assert.equal(keyword.action, 'human-confirm');
  assert.equal(keyword.keywordOnly, true);
  assert.deepEqual(sendConsent({ ...plain, action: 'human-confirm', keywordOnly: true }, true), {
    block: false,
    ask: false,
    warning: true,
  });
  assert.equal(sendConsent({ ...plain, action: 'human-confirm', keywordOnly: true }, false).ask, true, 'unchanged outside pilot');

  const table = service.review('สรุปตารางนี้', 'ชื่อ-สกุล | แผนก\nสมชาย | QA');
  assert.equal(table.action, 'human-confirm');
  assert.equal(table.keywordOnly, false);
  assert.equal(sendConsent({ ...plain, action: 'human-confirm', keywordOnly: false }, true).ask, true);
  // A keyword in one part and a name table in another is not "keyword only".
  assert.equal(service.review('สรุปประวัติการรักษา', 'ชื่อ-สกุล | แผนก\nสมชาย | QA').keywordOnly, false);
});

test('pilot: plain attachments and the first send stop asking once the setup acknowledgment exists', () => {
  assert.equal(sendConsent({ ...plain, attachment: true }, true).ask, false);
  assert.equal(sendConsent({ ...plain, source: true }, true).ask, false);
  assert.equal(sendConsent({ ...plain, attachment: true }, false).ask, true, 'unchanged outside pilot');
  // Without the wizard acknowledgment the first send still asks once.
  assert.equal(sendConsent({ ...plain, first: true }, true).ask, true);
  // Images cannot be text-scanned, and several AI workers widen the destination: both still ask.
  assert.equal(sendConsent({ ...plain, attachment: true, vision: true }, true).ask, true);
  assert.equal(sendConsent({ ...plain, coordinated: true }, true).ask, true);
});

test('floor: side-effect tools still ask every time in pilot mode, and a cancel stops the action', async () => {
  const store = new Store(':memory:');
  const metrics = new ConsentMetrics(store);
  let approval: ApprovalRequest | undefined;
  const approvals = new Approvals(
    store,
    request => {
      if (request) approval = request;
    },
    metrics,
  );
  const policy = parsePolicy({ pilot: true }).policy;
  const gate = new ToolGate(
    () => policy,
    () => 'ask',
    async () => '/workspace',
    approvals,
    async () => ({ blocked: false, reason: '', results: [] }),
  );
  const pending = () => new Promise(r => setTimeout(r, 0));
  let writes = 0;
  for (const answer of ['cancel', 'once'] as const) {
    approval = undefined;
    const run = gate.run(
      { tool: 'write', readOnly: false, path: 'notes.md' },
      { title: 'Write file', body: 'notes.md', key: 'notes.md', sessionId: 'task-1' },
      () => ++writes,
    );
    await pending();
    const asked = approval as ApprovalRequest | undefined;
    assert.ok(asked, 'pilot mode does not skip the side-effect dialog');
    approvals.respond(asked.id, answer);
    await run;
  }
  assert.equal(writes, 1, 'only the confirmed write ran');
  const summary = metrics.summary(1);
  assert.deepEqual(
    { prompts: summary.prompts, confirmed: summary.confirmed, cancelled: summary.cancelled, perTask: summary.perTask },
    { prompts: 2, confirmed: 1, cancelled: 1, perTask: 2 },
  );
  assert.doesNotMatch(JSON.stringify(store.list('consent-metric')), /notes\.md|Write file|workspace/, 'counts only, no content');
  approvals.close();
  store.close();
});

test('pilot: one run-scope answer covers the rest of the run; results with findings still ask', async () => {
  let asks = 0;
  const run = new RunTransmission(
    's',
    'test',
    async () => {},
    () => {},
  );
  const pilotSource = { key: 'pilot-run', label: 'clean results' };
  const ask = async () => {
    asks++;
    return 'run' as const;
  };
  for (let i = 0; i < 5; i++) await run.authorize(100, pilotSource, ask);
  assert.equal(asks, 1);
  // A result with findings has no source, so it is asked about on its own and never joins the scope.
  await run.authorize(100, undefined, async scope => {
    assert.equal(scope, undefined);
    asks++;
    return 'once';
  });
  assert.equal(asks, 2);
});
