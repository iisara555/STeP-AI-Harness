import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;
const shQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };

// Run the actual updater scripts with network/extraction stubs. No release is
// downloaded or applied. The marker proves whether execution reached extraction.
for (const platform of ['windows', 'macos']) {
  test(`${platform} updater enforces checksum before extracting downloaded code`, async (t) => {
    const shell = platform === 'windows'
      ? (process.platform === 'win32' ? 'powershell.exe' : 'pwsh')
      : (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
    const probe = spawnSync(shell, platform === 'windows' ? ['-NoProfile', '-Command', 'exit 0'] : ['--version']);
    if (probe.error) return t.skip(`${shell} unavailable`);
    for (const scenario of ['missing', 'malformed', 'mismatch', 'valid']) {
      await t.test(scenario, async () => {
        const root = await mkdtemp(join(tmpdir(), 'step-checksum-test-'));
        try {
          await mkdir(join(root, 'install'));
          await writeFile(join(root, 'package.json'), JSON.stringify({version:'0.1.0'}));
          const payload = 'synthetic archive';
          const hash = scenario === 'valid' ? createHash('sha256').update(payload).digest('hex')
            : scenario === 'malformed' ? 'not-a-sha256' : '0'.repeat(64);
          const marker = join(root, 'extracted');
          let result;
          if (platform === 'windows') {
            const script = join(root, 'install/update-windows.ps1');
            await writeFile(script, '\ufeff' + (await readFile('install/update-windows.ps1', 'utf8')).replace(/^\uFEFF/, ''));
            await writeFile(join(root, 'install/windows-runtime.ps1'), `function Resolve-StepNode { return ${psQuote(process.execPath)} }`);
            const wrapper = join(root, 'test.ps1');
            await writeFile(wrapper, `
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility')
function Clear-Host {}
function Read-Host { return '' }
function Invoke-RestMethod {
  return @{ tag_name='v0.2.0'; assets=@(
    @{name='STeP-AI-Pilot-v0.2.0.zip';browser_download_url='archive'}
    ${scenario === 'missing' ? '' : ", @{name='STeP-AI-Pilot-v0.2.0.zip.sha256';browser_download_url='checksum'}"}
  ) }
}
function Invoke-WebRequest { param($Uri,$Headers,$OutFile,$TimeoutSec)
  if ($Uri -eq 'archive') { [IO.File]::WriteAllText($OutFile, ${psQuote(payload)}) }
  else { [IO.File]::WriteAllText($OutFile, ${psQuote(hash + '  STeP-AI-Pilot-v0.2.0.zip')}) }
}
function Expand-Archive { [IO.File]::WriteAllText(${psQuote(marker)}, 'extracted'); throw 'Stop test after extraction gate' }
& ${psQuote(script)}
exit $LASTEXITCODE
`, 'utf8');
            result = spawnSync(shell, ['-NoProfile','-ExecutionPolicy','Bypass','-File',wrapper], {encoding:'utf8',windowsHide:true});
          } else {
            const script = join(root, 'install/update-macos.sh');
            await writeFile(script, await readFile('install/update-macos.sh', 'utf8'));
            await writeFile(join(root, 'install/macos-runtime.sh'), `resolve_step_node() { STEP_NODE_BIN=${shQuote(process.execPath.replaceAll('\\','/'))}; }\n`);
            const wrapper = join(root, 'test.sh');
            await writeFile(wrapper, `#!/usr/bin/env bash
export PATH=/usr/bin:/bin:$PATH
clear() { :; }
read() { :; }
${process.platform === 'win32' ? 'shasum() { sha256sum "$3"; }' : ''}
curl() {
  local out='' previous='' arg
  for arg in "$@"; do
    if [ "$previous" = '-o' ]; then out="$arg"; fi
    previous="$arg"
  done
  case "$*" in
    *releases/latest*) printf '%s' '{"tag_name":"v0.2.0"}' > "$out" ;;
    *.sha256*) ${scenario === 'missing' ? 'return 22' : `printf '%s' ${shQuote(hash + '  STeP-AI-Pilot-v0.2.0.zip')} > "$out"`} ;;
    *) printf '%s' ${shQuote(payload)} > "$out" ;;
  esac
}
ditto() { printf 'extracted' > ${shQuote(marker.replaceAll('\\','/'))}; return 42; }
. ${shQuote(script.replaceAll('\\','/'))}
`);
            result = spawnSync(shell, [wrapper], {encoding:'utf8',windowsHide:true});
          }
          assert.equal(await exists(marker), scenario === 'valid', result.stdout + result.stderr);
          if (scenario !== 'valid') {
            assert.notEqual(result.status, 0, result.stdout + result.stderr);
            assert.match(result.stdout + result.stderr, /checksum/i);
          }
        } finally {
          await rm(root, {recursive:true,force:true});
        }
      });
    }
  });
}
