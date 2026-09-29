import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('secret scanner skips nested dependencies and checks first-party TSX', () => {
  const script = `
import importlib.util, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('validator', 'scripts/validate_repo.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as folder:
    m.ROOT = Path(folder)
    marker = '-----BEGIN ' + 'PRIVATE KEY-----'
    for name in ['desktop/node_modules/lib/example.js', 'desktop/dist/main.cjs', 'desktop/src/App.tsx']:
        p = m.ROOT / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(marker)
    errors = []
    m.scan_secrets(errors)
    assert len(errors) == 1, errors
    assert 'App.tsx' in errors[0], errors
`;
  const result = spawnSync('python', ['-B', '-c', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
