import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SKILL_SUBMIT_URL, SKILL_SUBMIT_URL, parsePolicy, skillSubmitUrl } from '../electron/policy';
import { submitSkill, type SkillSubmission } from '../electron/skill-submit';

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
