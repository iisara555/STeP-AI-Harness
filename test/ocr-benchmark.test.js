import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('OCR benchmark scoring, private paths and paired synthetic generation', () => {
  const run = spawnSync(process.platform === 'win32' ? 'py' : 'python3',
    [...(process.platform === 'win32' ? ['-3'] : []), '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_benchmark.py'],
    { cwd: new URL('../experiments/local-thai-ocr/', import.meta.url), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(run.status, 0, run.stderr || String(run.error));
});
