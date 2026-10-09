// Real renderer/IPC with controlled, out-of-order replies and synthetic receipts. No provider requests.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-async-lifecycle-'));
const receipt = join(home, 'synthetic.png');
await writeFile(
  receipt,
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1AAAAAASUVORK5CYII=', 'base64'),
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45_000 });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10_000);
  page.on('dialog', dialog => {
    void dialog.dismiss().catch(() => {});
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  const ids = await page.evaluate(async () => {
    const connection = await window.step.call('connection', { provider: 'gemini', mode: 'api', model: 'gemini-2.5-flash' });
    const a = await window.step.call('create', { connectionId: connection.id });
    const b = await window.step.call('create', { connectionId: connection.id });
    await window.step.call('edit', { id: a.id, text: 'Synthetic body A', revision: 0 });
    await window.step.call('edit', { id: b.id, text: 'Synthetic body B', revision: 0 });
    await window.step.call('rename', { id: a.id, title: 'Synthetic task A' });
    await window.step.call('rename', { id: b.id, title: 'Synthetic task B' });
    return { connection: connection.id, a: a.id, b: b.id };
  });
  // The temporary connection is ready only for this fake-provider test. Its adapter is never called.
  await app.evaluate(
    (_, { home, id }) => {
      const db = new (process.getBuiltinModule('node:sqlite').DatabaseSync)(home + '/workspace.sqlite');
      const row = db.prepare("SELECT value FROM records WHERE kind='connection' AND id=?").get(id);
      const connection = { ...JSON.parse(row.value), ready: true };
      db.prepare("UPDATE records SET value=? WHERE kind='connection' AND id=?").run(JSON.stringify(connection), id);
      db.close();
    },
    { home, id: ids.connection },
  );
  await app.evaluate(
    ({ ipcMain, dialog, nativeImage }, { receipt, home }) => {
      const original = ipcMain._invokeHandlers.get('step:call');
      const state = (globalThis.stepAsyncFixture = {
        pending: {},
        release: {},
        slowSession: '',
        holdSnapshot: false,
        fakeVision: false,
        holdDialog: false,
        holdConsent: false,
        stopRendering: false,
        imageCalls: 0,
        editCalls: 0,
        holdEdit: false,
        fakeRuns: false,
      });
      const wait = name =>
        new Promise(resolve => {
          state.pending[name] = true;
          state.release[name] = resolve;
        });
      ipcMain.removeHandler('step:call');
      ipcMain.handle('step:call', async (event, method, input) => {
        if (method === 'models') return (await original(event, 'snapshot', {})).connections.find(connection => connection.id === input.id);
        if (method === 'send' && state.fakeRuns) {
          const db = new (process.getBuiltinModule('node:sqlite').DatabaseSync)(home + '/workspace.sqlite');
          const row = db.prepare("SELECT value FROM records WHERE kind='session' AND id=?").get(input.id);
          const session = { ...JSON.parse(row.value), status: 'running' };
          session.messages.push({ role: 'user', text: 'Synthetic background request', at: new Date().toISOString() });
          db.prepare("UPDATE records SET value=? WHERE kind='session' AND id=?").run(JSON.stringify(session), input.id);
          db.close();
          return { started: true };
        }
        if (method === 'send' || method === 'run' || method === 'connect') throw new Error('LIVE_PROVIDER_NOT_ALLOWED_IN_FIXTURE');
        if (method === 'edit') {
          state.editCalls++;
          if (state.holdEdit) {
            state.holdEdit = false;
            const result = await original(event, method, input);
            await wait('edit');
            return result;
          }
        }
        if (method === 'snapshot' && state.holdSnapshot) {
          state.holdSnapshot = false;
          const result = await original(event, method, input);
          await wait('snapshot');
          return result;
        }
        if (method === 'sessionResume' && input.id === state.slowSession) {
          state.slowSession = '';
          const result = await original(event, method, input);
          await wait('resume');
          return result;
        }
        if (method === 'receiptVision' && state.fakeVision) {
          await wait('vision');
          return {
            fields: {
              merchant: { value: 'ร้านจาก AI' },
              date: { value: '01/01/2569' },
              receiptNumber: { value: 'AI-001' },
              total: { value: '107.00' },
            },
            expenseDescription: 'รายการจาก AI',
            merchantAddress: 'ที่อยู่จาก AI',
            amountInWords: 'หนึ่งร้อยเจ็ดบาทถ้วน',
            signatures: { receiver: { status: 'absent', evidence: 'ช่องว่างจาก AI', confidence: 0.9, region: null } },
            features: { itemsListed: false },
            documentType: 'cash_bill',
            model: 'synthetic',
          };
        }
        return original(event, method, input);
      });
      dialog.showOpenDialog = async () => {
        if (state.holdDialog) await wait('dialog');
        return { canceled: false, filePaths: [receipt] };
      };
      dialog.showMessageBox = async () => {
        if (state.holdConsent) await wait('consent');
        return { response: 1, checkboxChecked: false };
      };
      const fromBuffer = nativeImage.createFromBuffer;
      nativeImage.createFromBuffer = (...args) => {
        state.imageCalls++;
        if (state.stopRendering) throw new Error('SYNTHETIC_RENDER_STOP');
        return fromBuffer(...args);
      };
    },
    { receipt, home },
  );
  const configure = patch => app.evaluate((_, patch) => Object.assign(globalThis.stepAsyncFixture, patch), patch);
  const pending = name => expect.poll(() => app.evaluate((_, name) => Boolean(globalThis.stepAsyncFixture.pending[name]), name)).toBe(true);
  const release = name =>
    app.evaluate((_, name) => {
      const state = globalThis.stepAsyncFixture;
      state.pending[name] = false;
      state.release[name]();
    }, name);
  await page.reload();
  await page.locator('.sessions').waitFor();

  await configure({ slowSession: ids.a });
  await page
    .locator('.sessions')
    .getByRole('button', { name: /^Synthetic task A/ })
    .click();
  await pending('resume');
  await page
    .locator('.sessions')
    .getByRole('button', { name: /^Synthetic task B/ })
    .click();
  await expect(page.locator('.session.selected')).toContainText('Synthetic task B');
  await release('resume');
  await page.waitForTimeout(150);
  await expect(page.locator('.session.selected')).toContainText('Synthetic task B');

  await configure({ slowSession: ids.a });
  await page
    .locator('.sessions')
    .getByRole('button', { name: /^Synthetic task A/ })
    .click();
  await pending('resume');
  await page.getByRole('button', { name: /ศูนย์รวม Skill/ }).click();
  await release('resume');
  await page.waitForTimeout(150);
  await expect(page.locator('[data-tour="skills"].nav-active')).toBeVisible();
  await page
    .locator('.sessions')
    .getByRole('button', { name: /^Synthetic task B/ })
    .click();
  await expect(page.locator('.session.selected')).toContainText('Synthetic task B');

  await configure({ holdSnapshot: true });
  await page.evaluate(() => window.dispatchEvent(new Event('step-workspace')));
  await pending('snapshot');
  await page.evaluate(async () => {
    const snapshot = await window.step.call('snapshot');
    await window.step.call('settings', { ...snapshot.settings, assistant: 'Synthetic latest assistant' });
    window.dispatchEvent(new Event('step-workspace'));
  });
  await expect(page.locator('.profile')).toContainText('Synthetic latest assistant');

  await configure({ holdEdit: true });
  await page.locator('.draft-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' first edit');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await pending('edit');
  await page.locator('.draft-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' second edit');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await release('edit');
  await expect
    .poll(async () => {
      const snapshot = await page.evaluate(() => window.step.call('snapshot'));
      return snapshot.sessions.find(session => session.id === ids.b)?.draft;
    })
    .toContain('first edit second edit');
  await expect.poll(() => app.evaluate(() => globalThis.stepAsyncFixture.editCalls)).toBe(2);
  await release('snapshot');
  await page.waitForTimeout(150);
  await expect(page.locator('.profile')).toContainText('Synthetic latest assistant');

  await configure({ fakeVision: true });
  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByRole('button', { name: 'เลือกใบเสร็จ', exact: true }).click();
  await pending('vision');
  const corrections = {
    'ผู้ออกใบเสร็จ / ร้านค้า': 'ร้านที่คนตรวจแก้',
    เลขที่ใบเสร็จ: 'PERSON-002',
    วันที่: '02/01/2569',
    รายการค่าใช้จ่าย: 'รายการที่คนตรวจแก้',
    'ที่อยู่ผู้รับเงิน / ร้าน': 'ที่อยู่สังเคราะห์ที่คนตรวจแก้',
    จำนวนเงินตัวอักษร: 'หนึ่งร้อยเจ็ดบาทถ้วน',
  };
  for (const [name, value] of Object.entries(corrections)) await page.getByRole('textbox', { name, exact: false }).fill(value);
  await page.getByLabel('ลายเซ็นผู้รับเงิน', { exact: true }).selectOption('present');
  await release('vision');
  await expect(page.getByRole('textbox', { name: 'ยอดรวมที่ชำระ', exact: false })).toHaveValue('107.00');
  for (const [name, value] of Object.entries(corrections))
    await expect(page.getByRole('textbox', { name, exact: false })).toHaveValue(value);
  await expect(page.getByLabel('ลายเซ็นผู้รับเงิน', { exact: true })).toHaveValue('present');
  await expect(page.getByRole('region', { name: 'องค์ประกอบพื้นฐานใบเสร็จ' })).toContainText('พบองค์ประกอบพื้นฐานครบ');

  // Main-process receipt ownership starts before a file picker or consent dialog yields.
  await configure({ fakeVision: false, holdDialog: true });
  await page.evaluate(id => {
    window.stepAsyncRead = window.step.call('ocrRead', { connectionId: id });
  }, ids.connection);
  await pending('dialog');
  for (const method of ['ocrRead', 'receiptVision', 'ocrResolve'])
    await assert.rejects(
      page.evaluate(({ id, method }) => window.step.call(method, { connectionId: id }), { id: ids.connection, method }),
      /RUN_LIMIT/,
    );
  await release('dialog');
  await page.evaluate(() => window.stepAsyncRead);

  const resetReceiptConsent = () =>
    app.evaluate(
      (_, { home, id }) => {
        const db = new (process.getBuiltinModule('node:sqlite').DatabaseSync)(home + '/workspace.sqlite');
        const get = kind =>
          JSON.parse(db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, kind === 'settings' ? 'main' : id).value);
        const settings = get('settings');
        delete settings.receiptVisionConsentedAt;
        db.prepare("UPDATE records SET value=? WHERE kind='settings' AND id='main'").run(JSON.stringify(settings));
        const connection = { ...get('connection'), ready: true };
        db.prepare("UPDATE records SET value=? WHERE kind='connection' AND id=?").run(JSON.stringify(connection), id);
        db.close();
      },
      { home, id: ids.connection },
    );
  await resetReceiptConsent();
  await configure({ holdDialog: false, holdConsent: true, stopRendering: true });
  const vision = () =>
    page.evaluate(id => {
      window.stepAsyncVision = window.step.call('receiptVision', { connectionId: id }).then(
        () => 'UNEXPECTED_SUCCESS',
        e => String(e),
      );
    }, ids.connection);
  await vision();
  await pending('consent').catch(async error => {
    console.error(
      'Synthetic receipt consent failure:',
      await page.evaluate(() =>
        Promise.race([window.stepAsyncVision, new Promise(resolve => setTimeout(() => resolve('STILL_PENDING'), 250))]),
      ),
    );
    throw error;
  });
  await page.evaluate(async () => {
    const snapshot = await window.step.call('snapshot');
    await window.step.call('settings', { ...snapshot.settings, assistant: 'Synthetic changed during consent' });
  });
  await release('consent');
  assert.match(await page.evaluate(() => window.stepAsyncVision), /SYNTHETIC_RENDER_STOP/);
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).settings.assistant, 'Synthetic changed during consent');

  await resetReceiptConsent();
  await vision();
  await pending('consent');
  const imageCalls = await app.evaluate(() => globalThis.stepAsyncFixture.imageCalls);
  await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ checks: { privacy: true } }));
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).policy.checks.privacy, { timeout: 20_000 })
    .toBe(true);
  await release('consent');
  assert.match(await page.evaluate(() => window.stepAsyncVision), /POLICY_CHANGED|CANCELLED/);
  assert.equal(await app.evaluate(() => globalThis.stepAsyncFixture.imageCalls), imageCalls);

  await page.evaluate(async () => {
    const snapshot = await window.step.call('snapshot');
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        window.step.call('settings', {
          ...snapshot.settings,
          assistant: `Synthetic parallel profile ${index}`,
        }),
      ),
    );
  });
  const finalSettings = (await page.evaluate(() => window.step.call('snapshot'))).settings;
  assert.ok((await readFile(join(home, 'USER.md'), 'utf8')).includes(`**ชื่อผู้ช่วย (Assistant Name)**: ${finalSettings.assistant}`));
  assert.equal(JSON.parse(await readFile(join(home, 'shared-profile.json'), 'utf8')).assistant, finalSettings.assistant);

  // A change for another task must not discard the pending completion notification.
  await configure({ fakeRuns: true });
  await page
    .locator('.sessions')
    .getByRole('button', { name: /^Synthetic task A/ })
    .click();
  await page.locator('.composer textarea').fill('Synthetic background request');
  await page.locator('.composer textarea').press('Enter');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(session => session.id === ids.a)?.status)
    .toBe('running');
  await app.evaluate(
    ({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0].webContents.send('step:event', { sessionId: id, type: 'changed' }),
    ids.b,
  );
  await page
    .locator('.sessions')
    .getByRole('button', { name: /^Synthetic task B/ })
    .click();
  await expect(page.locator('.session.selected')).toContainText('Synthetic task B');
  await app.evaluate(
    ({ BrowserWindow }, { home, id }) => {
      const db = new (process.getBuiltinModule('node:sqlite').DatabaseSync)(home + '/workspace.sqlite');
      const row = db.prepare("SELECT value FROM records WHERE kind='session' AND id=?").get(id);
      const session = { ...JSON.parse(row.value), status: 'review' };
      db.prepare("UPDATE records SET value=? WHERE kind='session' AND id=?").run(JSON.stringify(session), id);
      db.close();
      BrowserWindow.getAllWindows()[0].webContents.send('step:event', { sessionId: id, type: 'changed' });
    },
    { home, id: ids.a },
  );
  await expect(page.locator('.toast').filter({ hasText: 'Synthetic task A' })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    'Async lifecycle smoke passed: latest navigation/snapshot, serialized draft/profile saves, preserved manual receipt edits, exclusive receipt dialogs, policy recheck and background completion.',
  );
} finally {
  if (app) await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
