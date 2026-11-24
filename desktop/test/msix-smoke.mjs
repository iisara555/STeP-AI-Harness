import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { _electron as electron, chromium } from '@playwright/test';
import { mainWindow } from './main-window.mjs';

const settings = { team: '', assistant: 'MSIX migration fixture', theme: 'light' };
const taskTitle = 'Synthetic task from the EXE installation';

if (process.argv[2] === 'legacy') {
  const env = { ...process.env, STEP_DISABLE_UPDATES: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const legacy = await electron.launch({
    executablePath: resolve('release/msix-stage/win-unpacked/STeP Desktop.exe'),
    env,
    timeout: 90000,
  });
  try {
    assert.equal(await legacy.evaluate(() => process.windowsStore), false);
    const page = await mainWindow(legacy, 90000);
    await page.evaluate(
      async ({ settings, taskTitle }) => {
        await window.step.call('settings', settings);
        const connection = await window.step.call('connection', { provider: 'openai', mode: 'api', model: 'synthetic-model' });
        const task = await window.step.call('create', { connectionId: connection.id });
        await window.step.call('rename', { id: task.id, title: taskTitle });
      },
      { settings, taskTitle },
    );
    const snapshot = await page.evaluate(() => window.step.call('snapshot'));
    assert.ok(snapshot.sessions.some(session => session.title === taskTitle));
  } finally {
    await legacy.close();
  }
} else if (process.argv[2] === 'msix') {
  const origin = 'http://127.0.0.1:' + process.argv[3];
  const deadline = Date.now() + 90000;
  let browser;
  while (!browser && Date.now() < deadline) {
    browser = await chromium.connectOverCDP(origin, { timeout: 3000 }).catch(() => undefined);
    if (!browser) await setTimeout(500);
  }
  assert.ok(browser, 'The Windows package did not start its renderer debugger');
  try {
    const page = await mainWindow({ windows: () => browser.contexts().flatMap(context => context.pages()) });
    const snapshot = await page.evaluate(() => window.step.call('snapshot'));
    assert.equal(snapshot.settings.assistant, settings.assistant);
    assert.ok(
      snapshot.sessions.some(session => session.title === taskTitle),
      'Legacy task is missing',
    );
    const state = await page.evaluate(() => window.step.call('updateCheck'));
    assert.equal(state.status, 'disabled');
    assert.equal(state.reason, 'UPDATE_MICROSOFT_STORE');
    assert.equal((await page.evaluate(() => window.step.call('startupState'))).supported, false);
    console.log('The installed MSIX opened the workspace, read the legacy settings and task, and left updates to Microsoft Store.');
  } finally {
    await browser.close();
  }
} else {
  throw new Error('Usage: node test/msix-smoke.mjs legacy | msix <port>');
}
