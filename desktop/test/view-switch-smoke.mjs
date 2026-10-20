// Work in progress survives a switch to another page and back: the draft's unsaved edits, text typed in the composer,
// and a file opened in the Files tab with unsaved edits (also when the panel is hidden and shown). Synthetic data only.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const home = await mkdtemp(join(tmpdir(), 'step-probe-'));
const folder = join(home, 'work');
await mkdir(folder, { recursive: true });
await writeFile(join(folder, 'a.txt'), 'original file');
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
const results = {};
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, folder);
  await page.evaluate(async () => {
    await window.step.call('workspace');
    const connection = await window.step.call('connection', { provider: 'openai', mode: 'subscription', model: '' });
    const session = await window.step.call('create', { connectionId: connection.id, project: 'Probe' });
    await window.step.call('edit', { id: session.id, text: 'ร่างเดิม', revision: 0 });
  });
  await page.reload();
  await page.locator('.draft-editor').waitFor();
  const away = async where => {
    if (where === 'skills') await page.getByRole('button', { name: /ศูนย์รวม Skill/ }).click();
    if (where === 'receipt') await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
    if (where === 'settings') await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: '/tmp/claude-0/-home-user-STeP-AI-Harness/5387f810-88dd-5491-a436-451cdb55f4d2/scratchpad/probe/' + where + '.png',
    });
    await page
      .getByText(/Probe ·/)
      .first()
      .click();
    await page.waitForTimeout(400);
  };
  // 1. Draft editor, unsaved text.
  await page.locator('.draft-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' แก้ยังไม่บันทึก');
  for (const where of ['skills', 'settings', 'receipt']) {
    await away(where);
    results['draft after ' + where] = /แก้ยังไม่บันทึก/.test(
      await page
        .locator('.draft-editor')
        .innerText()
        .catch(() => ''),
    );
  }
  // 2. Composer text.
  await page.locator('.composer textarea').fill('ข้อความที่พิมพ์ค้าง');
  for (const where of ['skills', 'settings']) {
    await away(where);
    results['composer after ' + where] = (await page.locator('.composer textarea').inputValue()) === 'ข้อความที่พิมพ์ค้าง';
  }
  // 3. Files tab: an open file with unsaved edits.
  await page.getByRole('button', { name: 'ไฟล์งาน', exact: true }).click();
  await page.getByRole('button', { name: 'a.txt' }).click();
  await page.getByRole('textbox', { name: 'File content' }).fill('edited but not saved');
  for (const where of ['skills', 'settings']) {
    await away(where);
    const box = page.getByRole('textbox', { name: 'File content' });
    results['file edit after ' + where] = (await box.count()) ? (await box.inputValue()) === 'edited but not saved' : false;
    results['files tab still selected after ' + where] =
      (await page.getByRole('button', { name: 'ไฟล์งาน', exact: true }).getAttribute('aria-current')) === 'page';
  }
  // 4. Hide and show the right panel.
  await page.getByRole('button', { name: 'ไฟล์งาน', exact: true }).click();
  const box = page.getByRole('textbox', { name: 'File content' });
  if (!(await box.count())) {
    await page.getByRole('button', { name: 'a.txt' }).click();
  }
  await box.fill('edited again');
  await page.getByRole('button', { name: 'ซ่อนร่าง' }).click();
  await page.getByRole('button', { name: 'เปิดร่าง' }).click();
  await page.waitForTimeout(300);
  results['file edit after hiding the panel'] = (await box.count()) ? (await box.inputValue()) === 'edited again' : false;
  for (const [check, kept] of Object.entries(results)) assert.equal(kept, true, check);
  console.log('View switch smoke passed: draft edits, composer text and an unsaved file in Files survive other pages and a hidden panel.');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
