import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('local OCR quality regressions preserve numeric meaning, EXIF orientation, seams and bounded CPU use', t => {
  const python = process.env.STEP_OCR_TEST_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
  const prefix = process.platform === 'win32' && !process.env.STEP_OCR_TEST_PYTHON ? ['-3'] : [];
  const options = { cwd: new URL('../experiments/local-thai-ocr/', import.meta.url), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } };
  const probe = spawnSync(python, [...prefix, '-c', 'import PIL,numpy,pypdfium2'], options);
  if (probe.status !== 0) {
    if (!process.env.STEP_OCR_TEST_PYTHON) { t.skip('Install OCR core Python dependencies or set STEP_OCR_TEST_PYTHON to run engine checks'); return; }
    assert.fail(probe.stderr || String(probe.error));
  }
  for (const pattern of ['test_ocr_quality.py', 'test_crosscheck.py', 'test_tiled_ocr.py', 'test_pdf_selection.py']) {
    const run = spawnSync(python, [...prefix, '-m', 'unittest', 'discover', '-s', 'tests', '-p', pattern], options);
    assert.equal(run.status, 0, run.stderr || String(run.error));
  }
});
