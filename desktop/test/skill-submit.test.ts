import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DEFAULT_SKILL_SUBMIT_URL, SKILL_SUBMIT_URL, feedbackSubmitUrl, parsePolicy, skillSubmitUrl } from '../electron/policy';
import { submitFeedback, submitSkill, type FeedbackSubmission, type SkillSubmission } from '../electron/skill-submit';

const url = 'https://script.google.com/macros/s/AKfycbSyntheticDeploymentId0123456789/exec';
const submission: SkillSubmission & { appVersion: string } = {
  schema: 1,
  pack: { id: 'staff-pack', version: '1.0.0', digest: 'a'.repeat(64), skills: ['meeting-room-booking'] },
  review: { status: 'pass', findings: [] },
  usage: { count: 2 },
  contributor: { name: 'พนักงานสังเคราะห์', team: 'ทีมทดสอบ', uploadedAt: '2026-10-16T00:00:00.000Z' },
  files: [{ path: 'SKILL.md', text: '# จองห้องประชุม' }],
  appVersion: '0.6.10',
};

test('the Skill intake address is an Apps Script web app set in policy, never anything else', () => {
  for (const submitUrl of [url, 'https://script.google.com/a/macros/cmu.ac.th/s/AKfycbSyntheticDeploymentId0123456789/exec']) {
    const parsed = parsePolicy({ skillPacks: { submitUrl } });
    assert.deepEqual(parsed.problems, []);
    assert.deepEqual(parsed.policy.skillPacks, { approvedDigests: [], submitUrl });
  }
  for (const submitUrl of [
    'http://script.google.com/macros/s/AKfycbSyntheticDeploymentId0123456789/exec',
    'https://script.google.com.evil.example/macros/s/AKfycbSyntheticDeploymentId0123456789/exec',
    'https://example.com/macros/s/AKfycbSyntheticDeploymentId0123456789/exec',
    'https://script.google.com/macros/s/AKfycbSyntheticDeploymentId0123456789/dev',
  ])
    assert.ok(parsePolicy({ skillPacks: { submitUrl } }).problems.length, submitUrl);
  assert.ok(parsePolicy({ skillPacks: {} }).problems.length);
  assert.deepEqual(parsePolicy({ skillPacks: { approvedDigests: ['b'.repeat(64)] } }).policy.skillPacks, {
    approvedDigests: ['b'.repeat(64)],
  });
});

test('a submission is posted as text and counts as accepted only with a reference from the intake', async () => {
  const sent: any[] = [];
  const answer =
    (body: unknown, status = 200) =>
    async (u: string, init: RequestInit) => {
      sent.push({ u, init });
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    };
  assert.deepEqual(await submitSkill(url, submission, answer({ ok: true, id: '20261016-abcdef12' })), {
    reference: '20261016-abcdef12',
  });
  assert.equal(sent[0].u, url);
  assert.equal(sent[0].init.method, 'POST');
  assert.equal(sent[0].init.redirect, 'follow');
  assert.match(String((sent[0].init.headers as any)['content-type']), /^text\/plain/);
  assert.equal(JSON.parse(sent[0].init.body).contributor.name, 'พนักงานสังเคราะห์');
  await assert.rejects(submitSkill(url, submission, answer({ ok: false, error: 'LIMIT' })), /SKILL_SUBMIT_REJECTED/);
  await assert.rejects(submitSkill(url, submission, answer('<html>sign in</html>')), /SKILL_SUBMIT_FAILED/);
  await assert.rejects(submitSkill(url, submission, answer({ ok: true, id: '<b>' })), /SKILL_SUBMIT_FAILED/);
  await assert.rejects(submitSkill(url, submission, answer({ ok: true, id: 'x' }, 500)), /SKILL_SUBMIT_FAILED/);
  await assert.rejects(
    submitSkill(url, submission, async () => {
      throw new Error('offline');
    }),
    /SKILL_SUBMIT_FAILED/,
  );
  await assert.rejects(submitSkill('https://example.com/exec', submission, answer({ ok: true, id: 'x' })), /SKILL_SUBMIT_UNAVAILABLE/);
  const big = { ...submission, files: [{ path: 'SKILL.md', text: 'x'.repeat(2_600_000) }] };
  await assert.rejects(submitSkill(url, big, answer({ ok: true, id: 'x' })), /SKILL_SUBMIT_TOO_LARGE/);
});

test('the organization intake is built in, a policy address replaces it, and turning staff Skills off removes it', () => {
  assert.match(DEFAULT_SKILL_SUBMIT_URL, SKILL_SUBMIT_URL);
  assert.equal(skillSubmitUrl(parsePolicy({}).policy), DEFAULT_SKILL_SUBMIT_URL);
  assert.equal(skillSubmitUrl(parsePolicy({ skillPacks: { approvedDigests: [] } }).policy), DEFAULT_SKILL_SUBMIT_URL);
  assert.equal(skillSubmitUrl(parsePolicy({ skillPacks: { submitUrl: url } }).policy), url);
  assert.equal(skillSubmitUrl(parsePolicy({ features: { staffSkills: false } }).policy), undefined);
});

test('feedback goes to the same intake, is on by default, and IT can turn it off on its own', () => {
  assert.equal(feedbackSubmitUrl(parsePolicy({}).policy), DEFAULT_SKILL_SUBMIT_URL);
  assert.equal(feedbackSubmitUrl(parsePolicy({ skillPacks: { submitUrl: url } }).policy), url);
  assert.equal(feedbackSubmitUrl(parsePolicy({ features: { staffSkills: false } }).policy), DEFAULT_SKILL_SUBMIT_URL);
  assert.equal(feedbackSubmitUrl(parsePolicy({ features: { feedback: false } }).policy), undefined);
  assert.equal(skillSubmitUrl(parsePolicy({ features: { feedback: false } }).policy), DEFAULT_SKILL_SUBMIT_URL);
});

test('feedback is posted as text with its own error codes and a small size limit', async () => {
  const feedback: FeedbackSubmission = {
    schema: 1,
    kind: 'feedback',
    category: 'problem',
    text: 'ปุ่มส่งออกไม่ทำงาน',
    contributor: { name: '', team: '' },
    os: 'win32 x64',
    appVersion: '0.6.14',
  };
  let body = '';
  const ok = async (_: string, init: RequestInit) => {
    body = String(init.body);
    return new Response(JSON.stringify({ ok: true, id: '20261018-abcdef12' }));
  };
  assert.deepEqual(await submitFeedback(url, feedback, ok), { reference: '20261018-abcdef12' });
  assert.equal(JSON.parse(body).kind, 'feedback');
  // The intake before the feedback update answers INVALID: the employee is told it is not ready, not that it failed.
  await assert.rejects(
    submitFeedback(url, feedback, async () => new Response(JSON.stringify({ ok: false, error: 'INVALID' }))),
    /FEEDBACK_SUBMIT_REJECTED/,
  );
  await assert.rejects(submitFeedback('https://example.com/exec', feedback, ok), /FEEDBACK_SUBMIT_UNAVAILABLE/);
  await assert.rejects(submitFeedback(url, { ...feedback, answer: 'x'.repeat(21_000) }, ok), /FEEDBACK_SUBMIT_TOO_LARGE/);
});

test('every main-process operation the window calls is allowed by the preload bridge', () => {
  // A missing name fails in the app with UNKNOWN_OPERATION, as "เสนอให้องค์กรใช้" did until 2026-10-18.
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const allowed = new Set([...read('../electron/preload.ts').matchAll(/^\s*'([A-Za-z]+)',$/gm)].map(m => m[1]));
  const handled = new Set([...read('../electron/main.ts').matchAll(/^\s*case '([A-Za-z]+)':/gm)].map(m => m[1]));
  // Not offered to the window yet: the Claude Console CLI install button waits on the owner's decision.
  const pending = new Set(['anthropicCliInstall']);
  const sources = readdirSync(new URL('../src/', import.meta.url)).filter(f => /\.tsx?$/.test(f));
  const called = new Set(sources.flatMap(f => [...read('../src/' + f).matchAll(/\b(?:call|act)\(\s*'([A-Za-z]+)'/g)].map(m => m[1])));
  const missing = [...called].filter(m => handled.has(m) && !allowed.has(m) && !pending.has(m));
  assert.deepEqual(missing, []);
  assert.ok(allowed.has('packPromote') && allowed.has('feedbackSend'));
});
