import { homedir } from 'node:os';
import { resolve, sep, win32 } from 'node:path';
import type { PathRule, PermissionMode, Policy } from './policy';

/**
 * One permission check for every tool, whether a person or the model asked for it.
 * Order: built-in sensitive paths (never overridable), the organization's path rules and
 * denied commands, then the session's permission mode.
 */
export type ToolRequest = {
  tool: string;
  readOnly: boolean;
  /** Absolute or workspace-relative file path the tool touches. */
  path?: string;
  /** Shell command for terminal tools. */
  command?: string;
  /** Runs code or a command, as opposed to writing a reviewed file. */
  execute?: boolean;
};
export type PermissionDecision = { allowed: boolean; requiresConfirmation: boolean; reason: string };

// Credential and key material, denied in every mode and by any policy. OpenHarness keeps the same
// list outside user control so prompt injection cannot reach it.
export const SENSITIVE_PATH_PATTERNS = [
  '*/.step/memory',
  '*/.step/memory/*',
  '*/desktop-policy.json',
  '*/.ssh',
  '*/.aws',
  '*/.aws/*',
  '*/.config/gcloud',
  '*/.azure',
  '*/.gnupg',
  '*/.docker',
  '*/.docker/*',
  '*/.kube',
  '*/.kube/*',
  '*/.claude',
  '*/.claude/*',
  '*/.codex',
  '*/.codex/*',
  '*/.gemini',
  '*/.gemini/*',
  '*/.anthropic',
  '*/@step-cmu',
  '*/@step-cmu/*',
  '*/step desktop',
  '*/step desktop/*',
  '*/.git',
  '*/.ssh/*',
  '*/.aws/credentials',
  '*/.aws/config',
  '*/.config/gcloud/*',
  '*/.azure/*',
  '*/.gnupg/*',
  '*/.docker/config.json',
  '*/.kube/config',
  '*/.claude/.credentials.json',
  '*/.codex/auth.json',
  '*/.gemini/oauth_creds.json',
  '*/.anthropic/*',
  '*/@step-cmu/desktop/*',
  '*/.git/*',
  '*/.env',
  '*/.env.*',
  '*/.env/*',
  '*/.env.*/*',
  '*.pem',
  '*.p12',
  '*.pfx',
  '*.key',
  '*/credentials*',
  '*/id_rsa*',
  '*/id_ed25519*',
  // Credential stores of common tools: .netrc holds `password value` pairs that the text scanner cannot recognise.
  '*/.netrc',
  '*/_netrc',
  '*/.npmrc',
  '*/.pypirc',
  '*/.git-credentials',
  '*/.pgpass',
  '*.kdbx',
  '*/.vault-token',
  '*/.htpasswd',
  '*/.my.cnf',
  '*/.s3cfg',
  '*/.boto',
  '*/.yarnrc.yml',
  '*/pip.conf',
  '*/pip.ini',
];

const escape = (value: string) => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
/** fnmatch-style glob: `*` matches any run of characters (including `/`), `?` one character. */
export function globToRegExp(pattern: string) {
  const body = escape(pattern.replace(/\\/g, '/')).replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${body}$`, process.platform === 'win32' ? 'i' : '');
}
const matches = (value: string, pattern: string) => globToRegExp(pattern.toLowerCase()).test(value.toLowerCase());
const normalize = (path: string, root?: string) => {
  const expanded = path.startsWith('~') ? homedir() + path.slice(1) : path;
  const base = root || process.cwd();
  if (/^[a-z]:[\\/]/i.test(expanded) || /^[a-z]:[\\/]/i.test(base)) return win32.resolve(base, expanded).replace(/\\/g, '/');
  return resolve(base, expanded).split(sep).join('/');
};

// Windows opens `.netrc.`, `.netrc ` and `.netrc::$DATA` as `.netrc`: compare that name too.
const windowsName = (full: string) =>
  full
    .replace(/::\$data$/i, '')
    .split('/')
    .map(part => (/^\.+$/.test(part) ? part : part.replace(/[. ]+$/, '')))
    .join('/');
export function sensitivePath(path: string, root?: string) {
  const full = normalize(path, root),
    alias = windowsName(full);
  return SENSITIVE_PATH_PATTERNS.find(pattern => matches(full, pattern) || matches(alias, pattern));
}

export function deniedPath(path: string, rules: PathRule[], root?: string) {
  const full = normalize(path, root);
  return rules.find(
    rule => !rule.allow && matches(full, /^(?:[a-z]:|\/|\*)/i.test(rule.pattern) ? rule.pattern : normalize(rule.pattern, root)),
  );
}

export function deniedCommand(command: string, patterns: string[]) {
  const line = command.trim().replace(/\s+/g, ' ');
  // Check each shell segment too, so a harmless prefix cannot hide a denied command.
  const segments = [line, ...line.split(/(?:;|&&|\|\||\|)\s*/).map(s => s.trim())];
  return patterns.find(pattern => segments.some(segment => matches(segment, pattern)));
}

export function evaluatePermission(
  request: ToolRequest,
  mode: PermissionMode,
  policy: Policy,
  options: { root?: string } = {},
): PermissionDecision {
  if (request.path) {
    const full = normalize(request.path, options.root);
    const sensitive = sensitivePath(full);
    if (sensitive) return { allowed: false, requiresConfirmation: false, reason: `SENSITIVE_PATH:${sensitive}` };
    const rule = deniedPath(full, policy.permission.pathRules, options.root);
    if (rule) return { allowed: false, requiresConfirmation: false, reason: `PATH_RULE:${rule.pattern}` };
  }
  if (request.command) {
    const denied = deniedCommand(request.command, policy.permission.deniedCommands);
    if (denied) return { allowed: false, requiresConfirmation: false, reason: `DENIED_COMMAND:${denied}` };
    for (const token of request.command.split(/[\s;|&<>]+/).filter(Boolean)) {
      const path = token.replace(/^["']|["']$/g, '');
      if (sensitivePath(path, options.root)) return { allowed: false, requiresConfirmation: false, reason: 'SENSITIVE_PATH:command' };
    }
  }
  // A mode the organization did not allow falls back to asking.
  const effective = policy.permission.modes.includes(mode) ? mode : 'ask';
  if (request.readOnly) return { allowed: true, requiresConfirmation: false, reason: 'read-only' };
  if (effective === 'plan') return { allowed: false, requiresConfirmation: false, reason: 'PLAN_MODE' };
  // Accept edits: a write to one workspace file goes ahead (its diff is staged and a snapshot can undo it).
  // Commands, the sandbox and external tool calls still ask.
  if (effective === 'acceptEdits' && request.tool === 'write' && request.path && !request.execute)
    return { allowed: true, requiresConfirmation: false, reason: 'accept edits' };
  if (effective === 'auto' && policy.features.autoMode) {
    // Commands the model starts still need a person unless the organization also allowed that.
    if (request.execute && !policy.features.shellByAi) return { allowed: true, requiresConfirmation: true, reason: 'shell needs approval' };
    return { allowed: true, requiresConfirmation: false, reason: 'auto mode' };
  }
  return { allowed: true, requiresConfirmation: true, reason: 'ask mode' };
}
