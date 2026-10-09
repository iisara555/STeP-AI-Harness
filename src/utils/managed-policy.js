import { lstatSync, readFileSync } from "node:fs";
import { dirname, win32 } from "node:path";
import { execFileSync } from "node:child_process";
export function managedPolicyPath(
  platform = process.platform,
  env = process.env,
) {
  return platform === "win32"
    ? win32.join(
        env.ProgramData || "C:\\ProgramData",
        "STeP",
        "desktop-policy.json",
      )
    : platform === "darwin"
      ? "/Library/Application Support/STeP/desktop-policy.json"
      : "/etc/step/desktop-policy.json";
}
export function trustedManagedPolicyPath(path) {
  try {
    if ([path, dirname(path)].some((p) => lstatSync(p).isSymbolicLink()))
      return false;
    if (process.platform !== "win32")
      return [path, dirname(path)].every((p) => {
        const s = lstatSync(p);
        return s.uid === 0 && (s.mode & 0o022) === 0;
      });
    const script = `$ErrorActionPreference = 'Stop'
$trusted = @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
foreach ($p in @($env:STEP_POLICY_CHECK_PATH, [System.IO.Path]::GetDirectoryName($env:STEP_POLICY_CHECK_PATH))) {
  $acl = Get-Acl -LiteralPath $p
  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -notin $trusted) { exit 1 }
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $trusted -and (([int]$rule.FileSystemRights -band 852310) -ne 0)) { exit 1 }
  }
}
Write-Output 'trusted'`;
    return (
      execFileSync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"],
        {
          input: script,
          env: { ...process.env, STEP_POLICY_CHECK_PATH: path },
          windowsHide: true,
          // PowerShell can take several seconds to start on a busy or slow PC; a timeout reads as an untrusted file.
          timeout: 15000,
          stdio: ["pipe", "pipe", "pipe"],
        },
      )
        .toString()
        .trim() === "trusted"
    );
  } catch {
    return false;
  }
}
export function readManagedPolicy(path = managedPolicyPath()) {
  try {
    if (!trustedManagedPolicyPath(path) || lstatSync(path).size > 256_000)
      return {};
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
