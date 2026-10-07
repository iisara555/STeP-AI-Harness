import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';

test('OCR packaging includes runtime files and excludes developer benchmarks and private documents', () => {
  const require = createRequire(import.meta.url);
  const { FileMatcher } = require('app-builder-lib/out/fileMatcher');
  const pkg = require('../package.json');
  const spec = pkg.build.extraResources.find((resource: any) => resource.to === 'ocr');
  const base = resolve('../experiments/local-thai-ocr');
  const filter = new FileMatcher(base, '/tmp/step-ocr-package-test', (value: string) => value, spec.filter).createFilter();
  for (const path of ['app.py', 'ocr_engine.py', 'crosscheck.py', 'requirements-core.txt', 'web/receipt-review.js']) {
    assert.equal(filter(join(base, path), { isDirectory: () => false }), true, path);
  }
  for (const path of [
    'benchmark/run.py',
    'benchmark/output/result.json',
    'private-receipt.png',
    'output/real.json',
    'tests/test_ocr_quality.py',
    '.venv/secret.pem',
  ]) {
    assert.equal(filter(join(base, path), { isDirectory: () => false }), false, path);
  }
});
