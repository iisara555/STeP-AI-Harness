import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultPolicy } from '../electron/policy';
import { Mcp } from '../electron/mcp';

const { evaluatePrivacyGate }: any = await import('../../src/modules/privacy/index.js');
const { StepMcpServer }: any = await import(new URL('../../gateway/mcp/service.js', import.meta.url).href);
const { createStepCatalogTools }: any = await import(new URL('../../gateway/mcp/tools/step-catalog.js', import.meta.url).href);

const ROOT = resolve(import.meta.dirname, '..', '..');
const AUTH_TOKEN = 'synthetic-mcp-token-' + 'a'.repeat(16);

test('Desktop Mcp client discovers, calls, and enforces Privacy Gate against StepMcpServer over HTTP and Stdio', async () => {
  const home = await mkdtemp(join(tmpdir(), 'step-org-mcp-int-'));
  const audits: any[] = [];
  const server = new StepMcpServer({
    authToken: AUTH_TOKEN,
    tools: createStepCatalogTools({ rootDir: ROOT }),
    onAudit: (entry: any) => audits.push(entry),
  });
  const httpServer = server.createHttpServer();
  await new Promise<void>(resolveListen => httpServer.listen(0, '127.0.0.1', resolveListen));
  const { port } = httpServer.address() as { port: number };

  const policy = defaultPolicy();
  policy.features.mcp = true;
  policy.mcpServers = [
    {
      name: 'step-org',
      transport: 'http',
      url: `http://127.0.0.1:${port}/mcp`,
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    },
    {
      name: 'step-org-stdio',
      transport: 'stdio',
      command: process.execPath,
      args: [resolve(ROOT, 'gateway/mcp/run.js'), '--stdio', '--root', ROOT],
    },
  ];

  const mcp = new Mcp(
    () => policy,
    () => 'stable',
    join(home, 'isolated'),
    evaluatePrivacyGate,
    async () => true,
  );

  try {
    // 1. Real loopback HTTP with Bearer auth
    const found = await mcp.search('step-org');
    assert.equal(found.total, 3);
    assert.deepEqual(found.tools.map(t => t.name).sort(), ['step_afp_check_category', 'step_doc_catalog', 'step_mis_lookup']);

    const misRes: any = await mcp.call('step-org', 'step_mis_lookup', { code: 'FM-AF-014' });
    const misData = JSON.parse(misRes.content[0].text);
    assert.equal(misData.entries[0].code, 'FM-AF-014');
    assert.equal(misData.entries[0].rev, 'V.02');

    const afpRes: any = await mcp.call('step-org', 'step_afp_check_category', { category: 'BV', amountThb: 12000 });
    const afpData = JSON.parse(afpRes.content[0].text);
    assert.equal(afpData.overCap, true);
    assert.equal(afpData.bvTravelReasonParts.length, 5);

    const callsBeforePrivacyBlock = audits.filter(a => a.method === 'tools/call').length;
    await assert.rejects(mcp.call('step-org', 'step_mis_lookup', { query: 'person@example.test' }), /PRIVACY_REVIEW_REQUIRED/);
    assert.equal(audits.filter(a => a.method === 'tools/call').length, callsBeforePrivacyBlock);

    // 2. Real Stdio transport
    const stdioFound = await mcp.search('step-org-stdio');
    assert.equal(stdioFound.total, 3);
    const catalogRes: any = await mcp.call('step-org-stdio', 'step_doc_catalog', { owner: 'afp' });
    const catalogData = JSON.parse(catalogRes.content[0].text);
    assert.ok(catalogData.totalMatches > 0);
    assert.ok(catalogData.documents.every((d: any) => d.owner === 'afp'));
  } finally {
    await mcp.close();
    httpServer.closeAllConnections();
    await new Promise<void>(resolveClose => httpServer.close(() => resolveClose()));
    await rm(home, { recursive: true, force: true });
  }
});
