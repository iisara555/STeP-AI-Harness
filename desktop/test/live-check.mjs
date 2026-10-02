// Manual acceptance recorder. Does not sign in, send prompts, or approve dialogs for the operator.
// node test/live-check.mjs <packaged-executable|--dev> <report.json>
import { _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import assert from 'node:assert/strict';

const [executable, reportPath] = process.argv.slice(2);
assert.ok(executable && reportPath, 'Pass a packaged executable (or --dev) and a report JSON path');
const profile = await mkdtemp(join(tmpdir(), 'step-live-acceptance-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.STEP_DESKTOP_TEST_HOME;
const terminal = createInterface({ input: process.stdin, output: process.stdout });
const observations = [];
let app;
const launch = async () => {
  app = await electron.launch({
    ...(executable === '--dev'
      ? { args: ['.', '--user-data-dir=' + profile] }
      : { executablePath: resolve(executable), args: ['--user-data-dir=' + profile] }),
    env,
    timeout: 90000,
  });
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), profile);
  return app.firstWindow();
};
const record = async page => {
  const snapshot = await page.evaluate(() => window.step.call('snapshot'));
  observations.push({
    at: new Date().toISOString(),
    connections: snapshot.connections.map(c => ({ provider: c.provider, mode: c.mode, ready: c.ready, signedIn: c.signedIn })),
    runs: snapshot.sessions.flatMap(s =>
      (s.runs || []).map(r => ({
        id: r.id,
        at: r.at,
        outcome: r.outcome,
        code: r.code,
        firstProviderDeltaMs: r.firstResponseMs,
        totalMs: r.ms,
        providerSteps: r.steps.length,
        providerAttempts: r.steps.reduce((total, step) => total + step.attempts, 0),
      })),
    ),
  });
};
try {
  let page = await launch();
  console.log('Use the app manually: sign in, accept terms, chat, use tools, cancel, sign out. See docs/desktop-release-acceptance.md.');
  console.log('This is an isolated profile:', profile);
  for (;;) {
    const command = (await terminal.question('Enter r to record and restart, s to record, or q to record and finish: ')).trim();
    if (!['r', 's', 'q'].includes(command)) continue;
    await record(page);
    if (command === 'q') break;
    if (command === 'r') {
      await app.close();
      app = null;
      page = await launch();
    }
  }
  await writeFile(
    resolve(reportPath),
    JSON.stringify(
      {
        schemaVersion: 1,
        synthetic: false,
        operatorAcceptance: 'pending-review',
        platform: process.platform,
        hostArch: process.arch,
        packaged: executable !== '--dev',
        observations,
        exclusions: [
          'No prompt, answer, auth URL, code, token or account identifier recorded.',
          'Timings include user/tool waits; first delta may be tool protocol. Complete the manual matrix separately.',
        ],
      },
      null,
      2,
    ),
  );
  console.log('Metadata written to', resolve(reportPath));
} finally {
  terminal.close();
  await app?.close();
  console.log('The isolated profile is retained for inspection. Sign out in the app before deleting it:', profile);
}
