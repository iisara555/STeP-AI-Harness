// The profile shared with Setup-STeP-Skills (~/.step-ai/profile.json; electron/shared-profile.ts): a first run starts
// the setup wizard from it, saving the profile in the app writes it back for Claude, Codex and Antigravity, and an app
// set up before the file existed shares its profile at the next start without overwriting a newer file.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-shared-profile-'));
const shared = join(home, 'shared-profile.json');
await writeFile(shared, JSON.stringify({ version: 1, name: 'ต้น', team: 'qs', assistant: 'น้องสเต็ป', style: 'concise', tone: '' }));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
delete env.STEP_SHARED_PROFILE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The wizard opens with the answers already given in Setup-STeP-Skills.
  await page.getByRole('button', { name: 'ตั้งชื่อและรูปแบบผู้ช่วยก่อน (ไม่บังคับ)' }).click();
  await expect(page.getByLabel('ชื่อเรียก')).toHaveValue('ต้น');
  await expect(page.getByLabel('ทีมหลัก')).toHaveValue('qs');
  const settings = (await page.evaluate(() => window.step.call('snapshot'))).settings;
  assert.equal(settings.onboarding, false, 'prefilling does not skip the wizard');
  assert.equal(settings.assistant, 'น้องสเต็ป');
  assert.equal(settings.personality, 'concise');

  // Saving the profile in the app writes it back.
  await page.evaluate(() =>
    window.step.call('settings', {
      userName: 'พี่ต้น',
      team: 'cc',
      assistant: 'STeP Mate',
      personality: 'custom',
      assistantTone: 'ตอบเป็นข้อ ๆ',
      theme: 'system',
    }),
  );
  const written = JSON.parse(await readFile(shared, 'utf8'));
  assert.deepEqual(
    { ...written, updatedAt: undefined },
    { version: 1, name: 'พี่ต้น', team: 'cc', assistant: 'STeP Mate', style: 'custom', tone: 'ตอบเป็นข้อ ๆ', updatedAt: undefined },
  );
  assert.deepEqual(errors, []);
  console.log('Shared profile smoke passed: wizard prefilled from Setup-STeP-Skills, saved profile written back.');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true });
}

// Updated from an earlier version: set up, but no shared profile yet. Starting the app writes it once.
const older = await mkdtemp(join(tmpdir(), 'step-shared-profile-old-'));
const db = new DatabaseSync(join(older, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
db.prepare('INSERT INTO records VALUES(?,?,?)').run(
  'settings',
  'main',
  JSON.stringify({
    team: 'afp',
    assistant: 'ผู้ช่วยเอ',
    userName: 'เอ',
    personality: 'professional',
    workspace: older,
    theme: 'light',
    onboarding: true,
    tourDone: true,
    consentedAt: new Date().toISOString(),
    termsVersion: '2026-10-02',
  }),
);
db.close();
const olderFile = join(older, 'shared-profile.json');
const launch = async () => {
  const run = await electron.launch({ args: ['.'], env: { ...env, STEP_DESKTOP_TEST_HOME: older }, timeout: 45000 });
  try {
    const page = await run.firstWindow();
    // Closing the app while it is still starting can hang, so wait for the message box first.
    await page.locator('.composer textarea').waitFor({ timeout: 30000 });
    await expect.poll(async () => (await readFile(olderFile, 'utf8').catch(() => '')).length > 0, { timeout: 20000 }).toBe(true);
  } finally {
    await run.close();
  }
};
try {
  await launch();
  const shared = JSON.parse(await readFile(olderFile, 'utf8'));
  assert.deepEqual([shared.name, shared.team, shared.assistant, shared.style], ['เอ', 'afp', 'ผู้ช่วยเอ', 'professional']);
  // A file that already exists (perhaps newer, from Setup-STeP-Skills) is not overwritten at start.
  await writeFile(olderFile, JSON.stringify({ version: 1, name: 'จาก Setup', team: 'cc', assistant: '', style: 'concise', tone: '' }));
  await launch();
  assert.equal(JSON.parse(await readFile(olderFile, 'utf8')).name, 'จาก Setup');
  console.log('Shared profile smoke passed: an app set up earlier shares its profile at start, without overwriting.');
} finally {
  await rm(older, { recursive: true, force: true });
}
