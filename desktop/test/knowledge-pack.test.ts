import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrganizationKnowledge } from '../electron/knowledge';
import { buildKnowledgePackManifest, KnowledgePackManager, validateKnowledgePackManifest } from '../electron/knowledge-pack';
import { defaultPolicy, parsePolicy } from '../electron/policy';

async function createSampleRepo(dir: string, docTitle: string, docBody: string) {
  await mkdir(join(dir, 'manifest'), { recursive: true });
  await mkdir(join(dir, 'docs', 'knowledge'), { recursive: true });
  await writeFile(
    join(dir, 'manifest', 'documents.yaml'),
    [
      'version: 1',
      'documents:',
      '  step-travel-allowance-2027:',
      `    title: "${docTitle}"`,
      '    path: docs/knowledge/step-travel-allowance-2027.md',
      '    status: current',
      '    owner: afp',
      '    keywords: [เบี้ยเลี้ยง, 2570, อัตราใหม่, เดินทาง]',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(join(dir, 'docs', 'knowledge', 'step-travel-allowance-2027.md'), docBody, 'utf8');
}

test('[P1-3] KnowledgePackManager verifies SHA-256, activates overlay live in OrganizationKnowledge, and resets cleanly', async () => {
  const work = await mkdtemp(join(tmpdir(), 'step-kpack-'));
  const bundledRoot = join(work, 'bundled');
  const remoteRoot = join(work, 'remote');
  const dataDir = join(work, 'user-data');

  await createSampleRepo(
    bundledRoot,
    'แนวปฏิบัติเบี้ยเลี้ยงชุดเดิม',
    '# แนวปฏิบัติเบี้ยเลี้ยงชุดเดิม\n\nอัตราเบี้ยเลี้ยงเดิม 240 บาทต่อวันสำหรับปฏิบัติงานต่างจังหวัด\n',
  );
  await createSampleRepo(
    remoteRoot,
    'ประกาศอัตราเบี้ยเลี้ยงปี 2570 (ฉบับอัปเดตกลางปี)',
    '# ประกาศอัตราเบี้ยเลี้ยงปี 2570\n\nอัตราเบี้ยเลี้ยงใหม่ปี 2570 ปรับเป็น 320 บาทต่อวันตามมติคณะกรรมการ STeP\n',
  );

  let server: ReturnType<typeof createServer> | undefined;
  try {
    let manifestJson = '';
    const filesMap = new Map<string, Buffer>();
    server = createServer((req, res) => {
      const path = (req.url || '/').replace(/^\//, '');
      if (path === 'knowledge-pack-manifest.json') {
        res.setHeader('content-type', 'application/json');
        res.end(manifestJson);
        return;
      }
      const hit = filesMap.get(path);
      if (!hit) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.end(hit);
    });
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}/`;

    const manifest = await buildKnowledgePackManifest(remoteRoot, { packVersion: '2026.11.28-1', baseUrl });
    manifestJson = JSON.stringify(manifest);
    const { readFile } = await import('node:fs/promises');
    filesMap.set('manifest/documents.yaml', await readFile(join(remoteRoot, 'manifest', 'documents.yaml')));
    filesMap.set(
      'docs/knowledge/step-travel-allowance-2027.md',
      await readFile(join(remoteRoot, 'docs', 'knowledge', 'step-travel-allowance-2027.md')),
    );

    const policy = defaultPolicy();
    const manager = new KnowledgePackManager(dataDir, bundledRoot, () => policy, { allowLocalHttp: true });
    const knowledge = new OrganizationKnowledge(
      () => manager.activeRoot(),
      async () =>
        (await manager.overlayDocumentCatalog()) || [
          {
            id: 'step-travel-allowance-2027',
            title: 'แนวปฏิบัติเบี้ยเลี้ยงชุดเดิม',
            path: 'docs/knowledge/step-travel-allowance-2027.md',
            status: 'current',
            keywords: ['เบี้ยเลี้ยง', '2570', 'อัตราใหม่', 'เดินทาง'],
          },
        ],
    );

    // Before refresh: bundled doc answers 240
    const before = await knowledge.search('อัตราเบี้ยเลี้ยงใหม่ปี 2570 เท่าไหร่');
    assert.ok(before.length > 0);
    assert.match(before[0].text, /240 บาท/);

    // Refresh pulls verified pack & hot-reloads OrganizationKnowledge with zero restart
    const status = await manager.refresh({ manifestUrl: baseUrl + 'knowledge-pack-manifest.json' });
    assert.equal(status.source, 'pack');
    assert.equal(status.packVersion, '2026.11.28-1');
    assert.equal(status.documentCount, 1);

    const after = await knowledge.search('อัตราเบี้ยเลี้ยงใหม่ปี 2570 เท่าไหร่');
    assert.ok(after.length > 0);
    assert.match(after[0].text, /320 บาท/);

    // Tampered file fails closed without breaking the already-installed pack!
    filesMap.set('docs/knowledge/step-travel-allowance-2027.md', Buffer.from('# tampered 99999 baht\n', 'utf8'));
    await assert.rejects(
      () => manager.refresh({ manifestUrl: baseUrl + 'knowledge-pack-manifest.json' }),
      /KNOWLEDGE_PACK_CHECKSUM_FAILED/,
    );
    const stillValid = await knowledge.search('อัตราเบี้ยเลี้ยงใหม่ปี 2570 เท่าไหร่');
    assert.match(stillValid[0].text, /320 บาท/);

    // Reset reverts immediately back to bundled documents
    const resetStatus = await manager.reset();
    assert.equal(resetStatus.source, 'bundled');
    const reverted = await knowledge.search('อัตราเบี้ยเลี้ยงใหม่ปี 2570 เท่าไหร่');
    assert.match(reverted[0].text, /240 บาท/);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('[P1-3] KnowledgePackManifest & policy reject path traversal, non-md files, and non-HTTPS URLs', () => {
  const goodHash = 'a'.repeat(64);
  assert.throws(
    () =>
      validateKnowledgePackManifest({
        schemaVersion: 1,
        packVersion: '2026.11.28-1',
        publishedAt: '2026-11-28',
        documentsYaml: { path: 'manifest/documents.yaml', sha256: goodHash, bytes: 100 },
        files: [{ path: 'docs/knowledge/../../rules/secret.md', sha256: goodHash, bytes: 100 }],
      }),
    /KNOWLEDGE_PACK_INVALID/,
  );
  assert.throws(
    () =>
      validateKnowledgePackManifest({
        schemaVersion: 1,
        packVersion: '2026.11.28-1',
        publishedAt: '2026-11-28',
        documentsYaml: { path: 'manifest/documents.yaml', sha256: goodHash, bytes: 100 },
        files: [{ path: 'docs/knowledge/payload.js', sha256: goodHash, bytes: 100 }],
      }),
    /KNOWLEDGE_PACK_INVALID/,
  );

  // Managed policy accepts valid HTTPS knowledgePack and rejects HTTP
  const ok = parsePolicy({
    knowledgePack: { manifestUrl: 'https://example.org/knowledge-pack-manifest.json', sha256: goodHash },
  });
  assert.equal(ok.problems.length, 0);
  assert.equal(ok.policy.knowledgePack?.sha256, goodHash);

  const bad = parsePolicy({ knowledgePack: { manifestUrl: 'http://insecure.example.org/manifest.json' } });
  assert.ok(bad.problems.length > 0);
});
