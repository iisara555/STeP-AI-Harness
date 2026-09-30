import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { dirname, win32, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Organization policy for STeP Desktop. It lives where only an administrator can write:
 *   Windows: %ProgramData%\STeP\desktop-policy.json
 *   macOS:   /Library/Application Support/STeP/desktop-policy.json
 * Without the file every risky capability stays off. Employees can read the policy in Settings
 * but cannot change it; the app re-reads the file when it changes.
 */
export const FEATURES = [
  'toolLoop',
  'autoMode',
  'shellByAi',
  'autoMerge',
  'sandbox',
  'mcp',
  'lineGateway',
  'vision',
  'voice',
  'copilot',
  'compatibleProviders',
  'cron',
  'coordinator',
  'memoryTeam',
] as const;
export type Feature = (typeof FEATURES)[number];
export type PermissionMode = 'ask' | 'plan' | 'auto';
export const PERMISSION_MODES: PermissionMode[] = ['ask', 'plan', 'auto'];
export type PathRule = { pattern: string; allow: boolean };
export type HookEvent =
  'session_start' | 'session_end' | 'user_prompt_submit' | 'pre_tool_use' | 'post_tool_use' | 'pre_compact' | 'post_compact' | 'stop';
export const HOOK_EVENTS: HookEvent[] = [
  'session_start',
  'session_end',
  'user_prompt_submit',
  'pre_tool_use',
  'post_tool_use',
  'pre_compact',
  'post_compact',
  'stop',
];
export type HookDefinition =
  | {
      type: 'prompt';
      event: HookEvent;
      prompt: string;
      matcher?: string;
      timeoutSeconds: number;
      blockOnFailure: boolean;
      priority: number;
    }
  | {
      type: 'command';
      event: HookEvent;
      command: string;
      matcher?: string;
      timeoutSeconds: number;
      blockOnFailure: boolean;
      priority: number;
    }
  | {
      type: 'http';
      event: HookEvent;
      url: string;
      headers: Record<string, string>;
      matcher?: string;
      timeoutSeconds: number;
      blockOnFailure: boolean;
      priority: number;
    };
export type McpServer =
  | { name: string; transport: 'stdio'; command: string; args: string[] }
  | { name: string; transport: 'http'; url: string; headers: Record<string, string> };
export type Policy = {
  source: 'managed' | 'default';
  features: Record<Feature, boolean>;
  permission: { modes: PermissionMode[]; defaultMode: PermissionMode; pathRules: PathRule[]; deniedCommands: string[] };
  hooks: HookDefinition[];
  mcpServers: McpServer[];
  /** US dollars per million tokens, keyed by model id or `provider:*`. */
  prices: Record<string, { input: number; output: number }>;
  budgets: { dailyTokens?: number; monthlyCostUsd?: number };
  network?: { proxyUrl?: string };
  memory?: { teamDirectories: Record<string, string> };
};

// Off until an administrator turns them on: anything that runs code, merges, or sends data somewhere new.
const DEFAULT_FEATURES: Record<Feature, boolean> = {
  toolLoop: true,
  autoMode: false,
  shellByAi: false,
  autoMerge: false,
  sandbox: false,
  mcp: false,
  lineGateway: false,
  vision: false,
  voice: false,
  copilot: false,
  compatibleProviders: false,
  cron: false,
  coordinator: false,
  memoryTeam: false,
};
export const DEFAULT_DENIED_COMMANDS = [
  'rm -rf /*',
  'rm -rf ~*',
  'del /s *',
  'rd /s *',
  'format *',
  'mkfs*',
  'shutdown*',
  'reg delete*',
  'Remove-Item * -Recurse*',
  'git push --force*',
  'curl * | sh*',
  'iwr * | iex*',
];

export function defaultPolicy(): Policy {
  return {
    source: 'default',
    features: { ...DEFAULT_FEATURES },
    permission: { modes: ['ask', 'plan'], defaultMode: 'ask', pathRules: [], deniedCommands: [...DEFAULT_DENIED_COMMANDS] },
    hooks: [],
    mcpServers: [],
    prices: {},
    budgets: {},
  };
}

export function policyPath(platform = process.platform, env: NodeJS.ProcessEnv = process.env) {
  if (platform === 'win32') return win32.join(env.ProgramData || 'C:\\ProgramData', 'STeP', 'desktop-policy.json');
  if (platform === 'darwin') return '/Library/Application Support/STeP/desktop-policy.json';
  return '/etc/step/desktop-policy.json';
}

const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number) => (typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : '');
const seconds = (value: unknown, fallback: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.min(Math.round(value), max) : fallback;
const headers = (value: unknown) =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value)
          .filter(([k, v]) => /^[A-Za-z0-9-]{1,64}$/.test(k) && typeof v === 'string' && v.length <= 2000)
          .slice(0, 20),
      )
    : {};

/**
 * Reads a policy object. Missing fields retain defaults; invalid definitions reject the complete
 * document, so a typo cannot silently discard a blocking rule while enabling a risky feature.
 */
export function parsePolicy(raw: unknown): { policy: Policy; problems: string[] } {
  const policy = defaultPolicy();
  const problems: string[] = [];
  if (!isObject(raw)) return { policy, problems: ['policy is not a JSON object'] };
  policy.source = 'managed';
  if (raw.memory !== undefined) {
    if (!isObject(raw.memory) || Object.keys(raw.memory).some(k => k !== 'teamDirectories') || !isObject(raw.memory.teamDirectories))
      problems.push('invalid memory configuration');
    else {
      const directories: Record<string, string> = {};
      for (const [team, path] of Object.entries(raw.memory.teamDirectories)) {
        if (!/^[a-z][a-z0-9-]{0,40}$/.test(team) || typeof path !== 'string' || path.length > 2000 || !isAbsolute(path))
          problems.push('invalid team memory directory');
        else directories[team] = path;
      }
      policy.memory = { teamDirectories: directories };
    }
  }
  if (raw.network !== undefined) {
    if (!isObject(raw.network) || Object.keys(raw.network).some(k => k !== 'proxyUrl')) problems.push('invalid network configuration');
    else if (raw.network.proxyUrl !== undefined) {
      try {
        const url = new URL(raw.network.proxyUrl);
        if (
          typeof raw.network.proxyUrl !== 'string' ||
          raw.network.proxyUrl.length > 2000 ||
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== '/' ||
          url.search ||
          url.hash
        )
          throw new Error();
        policy.network = { proxyUrl: url.href };
      } catch {
        problems.push('invalid network proxyUrl');
      }
    }
  }
  if (raw.features !== undefined) {
    if (!isObject(raw.features)) problems.push('features must be an object');
    else
      for (const [name, value] of Object.entries(raw.features)) {
        if (!(FEATURES as readonly string[]).includes(name)) problems.push(`unknown feature ${name}`);
        else if (typeof value !== 'boolean') problems.push(`feature ${name} must be true or false`);
        else policy.features[name as Feature] = value;
      }
  }
  const permission = raw.permission;
  if (permission !== undefined) {
    if (!isObject(permission)) problems.push('permission must be an object');
    else {
      if (permission.modes !== undefined) {
        const modes = Array.isArray(permission.modes)
          ? permission.modes.filter((m: unknown) => PERMISSION_MODES.includes(m as PermissionMode))
          : [];
        if (!modes.length || modes.length !== permission.modes.length) problems.push('permission.modes must list ask, plan or auto');
        else policy.permission.modes = [...new Set(modes as PermissionMode[])];
      }
      if (permission.defaultMode !== undefined) {
        if (!PERMISSION_MODES.includes(permission.defaultMode)) problems.push('permission.defaultMode must be ask, plan or auto');
        else policy.permission.defaultMode = permission.defaultMode;
      }
      if (permission.pathRules !== undefined) {
        if (!Array.isArray(permission.pathRules)) problems.push('permission.pathRules must be a list');
        else if (permission.pathRules.length > 200) problems.push('pathRules exceeds 200 entries');
        if (Array.isArray(permission.pathRules))
          for (const rule of permission.pathRules.slice(0, 200)) {
            const pattern = text(rule?.pattern, 500);
            if (!pattern || typeof rule?.allow !== 'boolean') problems.push('each path rule needs pattern and allow');
            else policy.permission.pathRules.push({ pattern, allow: rule.allow });
          }
      }
      if (permission.deniedCommands !== undefined) {
        if (!Array.isArray(permission.deniedCommands)) problems.push('permission.deniedCommands must be a list');
        else {
          const extra = permission.deniedCommands.map((c: unknown) => text(c, 500)).filter(Boolean);
          if (extra.length > 200) problems.push('deniedCommands exceeds 200 entries');
          if (extra.length !== permission.deniedCommands.length) problems.push('deniedCommands contains invalid entries');
          policy.permission.deniedCommands = [...new Set([...DEFAULT_DENIED_COMMANDS, ...extra])];
        }
      }
    }
  }
  // "auto" exists only where the organization turned it on.
  if (!policy.features.autoMode) policy.permission.modes = policy.permission.modes.filter(m => m !== 'auto');
  if (!policy.permission.modes.length) policy.permission.modes = ['ask'];
  if (!policy.permission.modes.includes(policy.permission.defaultMode)) policy.permission.defaultMode = policy.permission.modes[0];

  if (raw.hooks !== undefined) {
    if (!Array.isArray(raw.hooks)) problems.push('hooks must be a list');
    else {
      if (raw.hooks.length > 50) problems.push('hooks exceeds 50 definitions');
      for (const hook of raw.hooks.slice(0, 50)) {
        const event = HOOK_EVENTS.includes(hook?.event) ? (hook.event as HookEvent) : undefined;
        const common = {
          event: event!,
          matcher: text(hook?.matcher, 200) || undefined,
          timeoutSeconds: seconds(hook?.timeoutSeconds, 30, 600),
          blockOnFailure: (hook?.blockOnFailure ?? hook?.block_on_failure) !== false,
          priority: typeof hook?.priority === 'number' && Number.isFinite(hook.priority) ? hook.priority : 0,
        };
        if (hook?.matcher !== undefined && !text(hook.matcher, 200)) problems.push('hook matcher must be a bounded glob');
        if (
          hook?.timeoutSeconds !== undefined &&
          (typeof hook.timeoutSeconds !== 'number' || !Number.isFinite(hook.timeoutSeconds) || hook.timeoutSeconds < 1)
        )
          problems.push('hook timeoutSeconds must be positive');
        if (hook?.blockOnFailure !== undefined && typeof hook.blockOnFailure !== 'boolean') problems.push('blockOnFailure must be boolean');
        if (hook?.block_on_failure !== undefined && typeof hook.block_on_failure !== 'boolean')
          problems.push('block_on_failure must be boolean');
        if (!event) problems.push('each hook needs a known event');
        else if (hook.type === 'prompt' && text(hook.prompt, 4000))
          policy.hooks.push({ type: 'prompt', prompt: text(hook.prompt, 4000), ...common });
        else if (hook.type === 'command' && text(hook.command, 4000))
          policy.hooks.push({ type: 'command', command: text(hook.command, 4000), ...common });
        else if (hook.type === 'http' && /^https?:\/\//i.test(text(hook.url, 2000)))
          policy.hooks.push({ type: 'http', url: text(hook.url, 2000), headers: headers(hook.headers), ...common });
        else problems.push(`hook for ${event} needs a valid command, http or prompt definition`);
      }
    }
  }
  if (raw.mcpServers !== undefined) {
    if (!Array.isArray(raw.mcpServers)) problems.push('mcpServers must be a list');
    else {
      if (raw.mcpServers.length > 20) problems.push('mcpServers exceeds 20 definitions');
      for (const server of raw.mcpServers.slice(0, 20)) {
        const name = text(server?.name, 60);
        if (!name || !/^[\w-]+$/.test(name)) problems.push('each MCP server needs a simple name');
        else if (server.transport === 'stdio' && text(server.command, 1000))
          policy.mcpServers.push({
            name,
            transport: 'stdio',
            command: text(server.command, 1000),
            args: Array.isArray(server.args) ? server.args.map((a: unknown) => String(a).slice(0, 1000)).slice(0, 50) : [],
          });
        else if (server.transport === 'http' && /^https?:\/\//i.test(text(server.url, 2000)))
          policy.mcpServers.push({ name, transport: 'http', url: text(server.url, 2000), headers: headers(server.headers) });
        else problems.push(`MCP server ${name} needs transport stdio (with command) or http (with url)`);
      }
    }
  }
  if (raw.prices !== undefined) {
    if (!isObject(raw.prices)) problems.push('prices must be an object');
    else
      for (const [model, price] of Object.entries(raw.prices).slice(0, 200)) {
        if (
          isObject(price) &&
          typeof price.input === 'number' &&
          typeof price.output === 'number' &&
          Number.isFinite(price.input) &&
          Number.isFinite(price.output) &&
          price.input >= 0 &&
          price.output >= 0
        )
          policy.prices[model.slice(0, 120)] = { input: price.input, output: price.output };
        else problems.push(`price for ${model} needs input and output per million tokens`);
      }
  }
  if (raw.budgets !== undefined) {
    if (!isObject(raw.budgets)) problems.push('budgets must be an object');
    else {
      if (typeof raw.budgets.dailyTokens === 'number' && Number.isFinite(raw.budgets.dailyTokens) && raw.budgets.dailyTokens > 0)
        policy.budgets.dailyTokens = raw.budgets.dailyTokens;
      else if (raw.budgets.dailyTokens !== undefined) problems.push('dailyTokens must be positive');
      if (typeof raw.budgets.monthlyCostUsd === 'number' && Number.isFinite(raw.budgets.monthlyCostUsd) && raw.budgets.monthlyCostUsd > 0)
        policy.budgets.monthlyCostUsd = raw.budgets.monthlyCostUsd;
      else if (raw.budgets.monthlyCostUsd !== undefined) problems.push('monthlyCostUsd must be positive');
    }
  }
  // Reject the entire document: ignoring a malformed blocking rule could grant unintended access.
  return { policy: problems.length ? defaultPolicy() : policy, problems };
}

/** Check the file and its directory; a writable directory can replace an otherwise protected file. */
export function trustedPolicyPath(path: string): boolean {
  try {
    if (lstatSync(path).isSymbolicLink() || lstatSync(dirname(path)).isSymbolicLink()) return false;
    if (process.platform !== 'win32')
      return [path, dirname(path)].every(p => {
        const s = lstatSync(p);
        return s.uid === 0 && (s.mode & 0o022) === 0;
      });
    const script = `
$ErrorActionPreference = 'Stop'
$trusted = @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
foreach ($p in @($env:STEP_POLICY_CHECK_PATH, [System.IO.Path]::GetDirectoryName($env:STEP_POLICY_CHECK_PATH))) {
  $acl = Get-Acl -LiteralPath $p
  $owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
  if ($owner -notin $trusted) { exit 1 }
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $trusted -and
        (([int]$rule.FileSystemRights -band 852310) -ne 0)) { exit 1 }
  }
}
Write-Output 'trusted'
exit 0`;
    const checked = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], {
      input: script,
      env: { ...process.env, STEP_POLICY_CHECK_PATH: path },
      windowsHide: true,
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return checked.toString('utf8').trim() === 'trusted';
  } catch {
    return false;
  }
}

/** Reads the managed policy file. A missing file is the normal default; an unreadable one keeps safe defaults. */
export function loadPolicy(path = policyPath(), trusted = trustedPolicyPath): { policy: Policy; problems: string[]; path: string } {
  if (!existsSync(path)) return { policy: defaultPolicy(), problems: [], path };
  try {
    if (!trusted(path))
      return { policy: defaultPolicy(), problems: ['policy file or directory is not administrator-managed; using safe defaults'], path };
    if (lstatSync(path).size > 256_000) throw new Error('POLICY_LIMIT');
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return { ...parsePolicy(raw), path };
  } catch {
    return { policy: defaultPolicy(), problems: ['policy file is not valid JSON; using safe defaults'], path };
  }
}
