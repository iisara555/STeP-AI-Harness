// Launches the packaged app (not the dev build) and checks it opens, runs without page errors, and ships the
// organization documents, registry and Skills the assistant reads. Usage: node test/packaged-launch-smoke.mjs <executable>
import { mainWindow } from './main-window.mjs';
import { _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const executablePath = process.argv[2];
assert.ok(executablePath, 'pass the packaged app executable');
// A throwaway HOME keeps the runner's own profile out of the packaged app's data folder.
const home = await mkdtemp(join(tmpdir(), 'step-packaged-'));
const env = { ...process.env, HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
// An Intel build on Apple silicon is translated by Rosetta on its first launch, which takes minutes.
const timeout = Number(process.env.STEP_LAUNCH_TIMEOUT) || 90000;
const app = await electron.launch({ executablePath, env, timeout });
try {
  const page = await mainWindow(app, timeout);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ timeout });
  const shipped = await app.evaluate(async ({ app }) => {
    const { existsSync } = process.mainModule.require('node:fs');
    const { join } = process.mainModule.require('node:path');
    const harness = join(process.resourcesPath, 'harness');
    return {
      packaged: app.isPackaged,
      version: app.getVersion(),
      files: Object.fromEntries(
        [
          'manifest/documents.yaml',
          'manifest/services.yaml',
          'docs/knowledge/hr-personnel-welfare-index.md',
          'docs/knowledge/hr-service-channels.md',
          'docs/knowledge/step-executive-board.md',
          'docs/knowledge/teams.md',
          'docs/knowledge/step-public-profile.md',
          'docs/knowledge/project-code-scheme.md',
          'docs/knowledge/step-context.md',
          'docs/employee-guide.md',
          'skills/common/hr-policy-lookup/SKILL.md',
          'rules/human-approval.md',
        ].map(file => [file, existsSync(join(harness, file))]),
      ),
    };
  });
  assert.equal(shipped.packaged, true);
  for (const [file, present] of Object.entries(shipped.files)) assert.ok(present, `packaged harness is missing ${file}`);
  // The renderer talks to the main process: skipping setup saves settings and shows the workspace.
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.locator('.composer textarea').waitFor({ timeout: 30000 });
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  assert.ok(Array.isArray(snapshot.sessions));
  assert.deepEqual(errors, []);
  console.log(`Packaged app ${shipped.version} launched: setup, workspace and IPC work; organization documents and Skills are bundled.`);
} finally {
  await app.close().catch(() => {});
  await rm(home, { recursive: true, force: true }).catch(() => {});
}
