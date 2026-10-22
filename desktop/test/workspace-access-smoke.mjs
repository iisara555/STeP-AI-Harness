// Fresh and upgraded profiles open the workspace without employee OAuth, including retired managed login settings.
import { _electron as electron, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { mainWindow } from './main-window.mjs';

for (const legacy of [false, true]) {
  const home = await mkdtemp(join(tmpdir(), 'step-workspace-access-'));
  const previousSession = Buffer.from('synthetic-unreadable-retired-employee-session');
  if (legacy) {
    await writeFile(join(home, 'employee-session.bin'), previousSession);
    const db = new DatabaseSync(join(home, 'workspace.sqlite'));
    db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
    const insert = db.prepare('INSERT INTO records VALUES(?,?,?)');
    insert.run(
      'settings',
      'main',
      JSON.stringify({
        onboarding: true,
        whatsNewSeen: '999.0.0',
        tourDone: true,
        team: 'cc',
        assistant: 'STeP Mate',
        theme: 'light',
        termsVersion: '2026-10-02',
        consentedAt: new Date().toISOString(),
      }),
    );
    insert.run(
      'session',
      'fixture-retained',
      JSON.stringify({
        id: 'fixture-retained',
        title: 'Synthetic retained work',
        team: 'cc',
        connectionId: '',
        messages: [],
        draft: 'Synthetic saved draft',
        revision: 0,
        versions: [],
        proposals: [],
        originalQuery: '',
        answers: [],
        clarification: false,
        status: 'idle',
        updatedAt: new Date().toISOString(),
        sources: [],
      }),
    );
    db.close();
  }
  await writeFile(
    join(home, 'desktop-policy.json'),
    JSON.stringify({ appLogin: { required: true, clientId: 'retired-client.apps.googleusercontent.com', sessionHours: 1 } }),
  );
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    STEP_DESKTOP_TEST_HOME: home,
    STEP_DESKTOP_TEST_LOGIN: '1',
    STEP_DISABLE_UPDATES: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let application;
  try {
    application = await electron.launch({ args: ['dist/main.cjs'], env, timeout: 60000 });
    const page = await mainWindow(application);
    assert.notEqual(new URL(page.url()).hash, '#employee-login', 'employee login must not block workspace entry');
    const snapshot = await page.evaluate(() => window.step.call('snapshot'));
    assert.equal(Object.hasOwn(snapshot, 'employeeLogin'), false);
    if (!legacy) {
      await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
    } else {
      assert.ok(snapshot.sessions.some(session => session.id === 'fixture-retained'));
      assert.deepEqual(await readFile(join(home, 'employee-session.bin')), previousSession);
    }
    await expect(page.locator('.composer textarea')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ลงชื่อเข้าใช้ด้วย Google', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'การตั้งค่า', exact: true }).click();
    await page.getByRole('tab', { name: 'ทั่วไป', exact: true }).click();
    await expect(page.getByRole('button', { name: 'ออกจากบัญชีพนักงาน' })).toHaveCount(0);
    assert.equal((await page.evaluate(() => window.step.call('googleState'))).accounts.length, 0);
    console.log(
      `${legacy ? 'Upgraded' : 'Fresh'} profile: workspace opens without login; optional Google connections and retained data verified.`,
    );
  } finally {
    await application?.close();
    assert.ok(home.startsWith(join(tmpdir(), 'step-workspace-access-')));
    await rm(home, { recursive: true, force: true });
  }
}
