// Offline verification of the fixes for audit baseline 127218295efbeb8b4b4d9a85b471033011574bbb.
// Run: node --import ./desktop/node_modules/tsx/dist/loader.mjs scripts/audit-google-workspace.mts
// Uses synthetic accounts and an injected transport; never contacts Google.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../desktop/electron/store';
import { Vault } from '../desktop/electron/vault';
import { GoogleWorkspace } from '../desktop/electron/google-workspace';
import { googleScriptContentHash } from '../desktop/electron/google-validation';
import { DEFAULT_GOOGLE_SERVICES } from '../desktop/src/google-services';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const context = () => ({
  signal: new AbortController().signal,
  check: async () => {},
  approve: async () => true,
});
const script = {
  scriptId: 'demo_script',
  files: [
    { name: 'appsscript', type: 'JSON', source: '{}' },
    { name: 'Code', type: 'SERVER_JS', source: 'function main() {}' },
    { name: 'Other', type: 'SERVER_JS', source: 'function other() {}' },
  ],
};
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'step-workspace-audit-'));
  const store = new Store(join(dir, 'store.sqlite'));
  const vault = new Vault(join(dir, 'vault.sqlite'), {
    wrap: s => Buffer.from(s),
    unwrap: b => b.toString(),
  });
  const config = {
    clientId: 'audit.apps.googleusercontent.com',
    domains: ['example.test'],
    services: [...DEFAULT_GOOGLE_SERVICES],
  };
  const subject = 'audit-one';
  let handler: (url: string, init: RequestInit) => Promise<Response> = async () => json({ documentId: 'demo_doc' });
  const google = new GoogleWorkspace(
    store,
    vault,
    () => config,
    async () => {},
    async (url, init = {}) => handler(String(url), init),
    async (_config, scopes) => ({
      who: {
        sub: subject,
        email: subject + '@example.test',
        hd: 'example.test',
      },
      scopes,
      tokens: {
        access: 'audit-access',
        refresh: 'audit-refresh',
        expires: Date.now() + 3600000,
      },
    }),
  );
  return {
    google,
    store,
    vault,
    respond: (fn: typeof handler) => {
      handler = fn;
    },
    connect: async () => {
      await google.connect([...DEFAULT_GOOGLE_SERVICES], context());
      return google.state().accounts.at(-1)!.id;
    },
    clean: () => {
      vault.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const evidence: object[] = [];
const deadline = setTimeout(() => {
  throw new Error('AUDIT_DEADLINE_EXCEEDED');
}, 120000);
deadline.unref();

// Exercise Skill examples through the real OAuth/Vault/execute path, with family-shaped synthetic API responses.
{
  const f = fixture();
  try {
    const id = await f.connect();
    const contract = JSON.parse(
      readFileSync(new URL('../skills/common/google-workspace/references/tool-contract.json', import.meta.url), 'utf8'),
    );
    const families: Record<string, number> = {};
    for (const item of contract.operations) {
      const request = structuredClone(item.request);
      const op: string = request.operation;
      if (op === 'appscript.projects.updateContent') request.body.expectedContentHash = googleScriptContentHash(script);
      f.respond(async (url, init) => {
        if (op.startsWith('appscript.') && url.endsWith('/content')) return json(script);
        if (op === 'appscript.run') return json({ done: true, response: { result: 'synthetic' } });
        if (op === 'appscript.versions.create') return json({ scriptId: 'demo_script', versionNumber: 1 });
        if (op.startsWith('appscript.deployments.')) return json({ deploymentId: 'demo_deployment' });
        if (op.startsWith('appscript.')) return json({ scriptId: 'demo_script', processes: [], versions: [] });
        if (op.startsWith('docs.'))
          return json({
            documentId: 'demo_doc',
            revisionId: 'demo_revision',
            body: { content: [] },
          });
        if (op.startsWith('sheets.'))
          return json({
            spreadsheetId: 'demo_sheet',
            values: [['00123']],
            sheets: [],
          });
        if (op.startsWith('slides.'))
          return json({
            presentationId: 'demo_slides',
            revisionId: 'demo_revision',
            slides: [],
          });
        if (op.startsWith('forms.'))
          return json({
            formId: 'demo_form',
            revisionId: 'demo_revision',
            responses: [],
          });
        if (op === 'gmail.attachments.getText')
          return json({
            data: Buffer.from('synthetic text').toString('base64url'),
            size: 14,
          });
        if (op.startsWith('gmail.'))
          return json({
            id: 'demo_message',
            messages: [],
            payload: { mimeType: 'text/plain', body: { data: 'aGk' } },
          });
        if (op.startsWith('chat.'))
          return json({
            name: 'spaces/demo_space/messages/demo_message',
            spaces: [],
            messages: [],
          });
        if (op.startsWith('meet.')) return json({ name: 'spaces/demo_space' });
        if (op === 'drive.getText' || op === 'drive.exportText') return new Response('synthetic text');
        if (init.method === 'DELETE') return new Response(null, { status: 204 });
        return json({ id: 'demo_result', items: [], files: [] });
      });
      const result = await f.google.execute(id, request, context());
      assert.equal(result.status, 'completed', op);
      assert.equal(result.trust, 'untrusted-data', op);
      const family = op.split('.')[0];
      families[family] = (families[family] || 0) + 1;
    }
    evidence.push({
      check: 'native-synthetic-execution',
      operations: contract.operations.length,
      families,
      live: false,
    });
  } finally {
    f.clean();
  }
}

// Regression tests run real modules against synthetic transport; they never contact Google.
const root = fileURLToPath(new URL('../', import.meta.url));
const loader = new URL('../desktop/node_modules/tsx/dist/loader.mjs', import.meta.url).href;
const run = promisify(execFile);
for (const [check, file] of [
  ['native-regressions', 'desktop/test/google-workspace-reliability.test.ts'],
  ['optional-gws-regressions', 'test/google-workspace-connector.test.js'],
]) {
  const { stdout } = await run(process.execPath, ['--import', loader, '--test', '--test-reporter=tap', file], {
    cwd: root,
    timeout: 60000,
    maxBuffer: 1000000,
  });
  const count = (name: string) => {
    const value = new RegExp('^# ' + name + ' ([0-9]+)$', 'm').exec(stdout);
    assert.ok(value, check + ': missing test summary');
    return Number(value[1]);
  };
  const tests = count('tests'),
    passed = count('pass'),
    failed = count('fail'),
    skipped = count('skipped');
  assert.equal(failed, 0);
  assert.ok(passed > 0);
  evidence.push({ check, tests, passed, failed, skipped });
}
console.log(
  JSON.stringify(
    {
      baseline: '127218295efbeb8b4b4d9a85b471033011574bbb',
      mode: 'fix-verification',
      live: false,
      status: 'passed',
      findings: ['GWA-01', 'GWA-02', 'GWA-03', 'GWA-04', 'GWA-05', 'GWA-06', 'GWA-07'],
      evidence,
    },
    null,
    2,
  ),
);
clearTimeout(deadline);
