import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { findPython } from '../scripts/validate-repo.js';

test('secret scanner skips dependencies and generated installer fixtures while checking first-party files', () => {
  const script = `
import importlib.util, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('validator', 'scripts/validate_repo.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as folder:
    m.ROOT = Path(folder)
    marker = '-----BEGIN ' + 'PRIVATE KEY-----'
    for name in ['desktop/node_modules/lib/example.js', 'desktop/dist/main.cjs', 'tmp/test-installer-workspace/fixture.json', 'desktop/src/App.tsx', 'docs/tmp/source.md']:
        p = m.ROOT / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(marker)
    errors = []
    m.scan_secrets(errors)
    assert len(errors) == 2, errors
    assert any('App.tsx' in error for error in errors), errors
    assert any('docs' in error and 'source.md' in error for error in errors), errors
`;
  const runtime = findPython();
  assert.ok(runtime, 'Python 3.10+ is required for the secret scanner regression');
  const result = spawnSync(runtime.command, [...runtime.prefix, '-B', '-c', script], {
    encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
});
