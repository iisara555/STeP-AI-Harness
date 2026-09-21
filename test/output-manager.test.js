import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PACKAGE_ROOT } from '../src/modules/role-resolver.js';
import {
  sanitizeOutputSegment,
  normalizeTeamCode,
  inferOutputType,
  buildOutputDirectory,
  buildOutputBaseName,
  getNextOutputPath,
  initOutputWorkspace,
} from '../src/modules/output-manager.js';
import { pathExists } from '../src/utils/file-ops.js';

const execFileAsync = promisify(execFile);
const STEP_AI_BIN = join(PACKAGE_ROOT, 'bin', 'step-ai.js');

test('Output File Management', async (t) => {
  await t.test('sanitizes unsafe characters while preserving searchable Thai text', () => {
    assert.equal(
      sanitizeOutputSegment('หนังสือ: ขอใช้สถานที่ / รอบ 1'),
      'หนังสือ-ขอใช้สถานที่-รอบ-1'
    );
    assert.equal(normalizeTeamCode('tech-spin'), 'TECH-SPIN');
    assert.equal(normalizeTeamCode('all'), 'SHARED');
  });

  await t.test('infers common output types from extension', () => {
    assert.equal(inferOutputType('pptx'), 'presentation');
    assert.equal(inferOutputType('.xlsx'), 'spreadsheet');
    assert.equal(inferOutputType('png'), 'image');
    assert.equal(inferOutputType('unknown'), 'other');
  });

  await t.test('builds deterministic searchable directory and filename', () => {
    const workspaceDir = '/workspace';
    const directory = buildOutputDirectory({
      workspaceDir,
      team: 'cc',
      type: 'presentation',
      extension: 'pptx',
      date: '2026-09-18',
    });
    assert.ok(directory.replace(/\\/g, '/').endsWith('/output/CC/2026/09/presentation'));

    const baseName = buildOutputBaseName({
      team: 'cc',
      type: 'presentation',
      title: 'STeP Booth CMU',
      extension: 'pptx',
      date: '2026-09-18',
    });
    assert.equal(baseName, '20260918_CC_presentation_STeP-Booth-CMU');
  });

  await t.test('creates folders and increments versions instead of overwriting', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'step-output-'));
    try {
      const first = await getNextOutputPath({
        workspaceDir: workspace,
        team: 'cc',
        type: 'presentation',
        title: 'STeP Booth CMU',
        extension: 'pptx',
        date: '2026-09-18',
      });

      assert.equal(first.version, 1);
      assert.equal(
        first.relativePath,
        'output/CC/2026/09/presentation/20260918_CC_presentation_STeP-Booth-CMU_v01.pptx'
      );
      assert.ok(await pathExists(first.directory));

      await writeFile(first.path, 'test', 'utf-8');

      const second = await getNextOutputPath({
        workspaceDir: workspace,
        team: 'cc',
        type: 'presentation',
        title: 'STeP Booth CMU',
        extension: 'pptx',
        date: '2026-09-18',
      });

      assert.equal(second.version, 2);
      assert.ok(second.filename.endsWith('_v02.pptx'));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  await t.test('CLI returns a machine-readable path and creates the target directory', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'step-output-cli-'));
    try {
      const { stdout } = await execFileAsync(process.execPath, [
        STEP_AI_BIN,
        'output',
        '--team', 'cc',
        '--type', 'presentation',
        '--title', 'STeP Booth CMU',
        '--ext', 'pptx',
        '--date', '2026-09-18',
        '--dest', workspace,
        '--json',
      ]);

      const result = JSON.parse(stdout);
      assert.equal(result.relativePath, 'output/CC/2026/09/presentation/20260918_CC_presentation_STeP-Booth-CMU_v01.pptx');
      assert.ok(await pathExists(result.directory));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  await t.test('initializes team output root for new or updated workspaces', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'step-output-init-'));
    try {
      const result = await initOutputWorkspace(workspace, 'mi');
      assert.equal(result.relativePath, 'output/MI');
      assert.ok(await pathExists(result.teamRoot));
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

test('concurrent output requests never hand out the same version', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'step-output-race-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const request = () => getNextOutputPath({
    workspaceDir: dir, team: 'afp', type: 'document', title: 'tor-review', extension: 'md',
  });

  // Reading the directory and returning a name is not a reservation. Ten runs
  // started together must receive ten distinct files, not ten copies of v01.
  const results = await Promise.all(Array.from({ length: 10 }, request));
  const versions = results.map((item) => item.version);
  assert.equal(new Set(versions).size, versions.length, `duplicate versions: ${versions.join(',')}`);
  assert.deepEqual([...versions].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  for (const item of results) {
    assert.equal(await readFile(item.path, 'utf-8'), '', 'reserved file should be empty');
  }
});
