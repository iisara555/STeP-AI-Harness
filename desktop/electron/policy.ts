import { providerEndpoint } from '../../src/modules/providers/compatible.js';
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { managedPolicyPath, trustedManagedPolicyPath } from '../../src/utils/managed-policy.js';

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
  'autopilot',
  'sandbox',
  'mcp',
  'lineGateway',
  'vision',
  'voice',
  'copilot',
  'compatibleProviders',
  'headless',
  'skillPacks',
  'cron',
  'coordinator',
  'memoryTeam',
  'autoRouting',
] as const;
export type Feature = (typeof FEATURES)[number];
/** ask: ask before every edit or command. acceptEdits: reviewed file writes go ahead, commands ask. auto: full auto. */
export type PermissionMode = 'ask' | 'acceptEdits' | 'plan' | 'auto';
export const PERMISSION_MODES: PermissionMode[] = ['ask', 'acceptEdits', 'plan', 'auto'];
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
  permission: {
    modes: PermissionMode[];
    defaultMode: PermissionMode;
    pathRules: PathRule[];
    deniedCommands: string[];
    /** Lets people remember a reviewed file write for the same file in the same workspace. Commands never are. */
    rememberApprovals: boolean;
  };
  hooks: HookDefinition[];
  mcpServers: McpServer[];
  /** US dollars per million tokens, keyed by model id or `provider:*`. */
  prices: Record<string, { input: number; output: number }>;
  budgets: { dailyTokens?: number; monthlyCostUsd?: number };
  network?: { proxyUrl?: string };
  memory?: { teamDirectories: Record<string, string> };
  sandbox?: { image: string };
  providers?: { compatible: { name: string; baseUrl: string; protocol: 'openai' | 'anthropic' }[]; copilot?: { clientId: string } };
  voice?: { components: Record<string, { runtime: { url: string; sha256: string }; model: { url: string; sha256: string } }> };
  skillPacks?: { approvedDigests: string[] };
  transmissionConsent?: { allowRunScope: boolean };
  /**
   * Standard consent (on by default, the behavior first trialled as "pilot mode"): fewer confirmation dialogs. Every
   * side-effect tool still asks each time. `false` restores the strict dialogs. With `checks.privacy` on, credentials
   * and sensitive data tied to a person are blocked and national ID numbers masked in both modes.
   */
  pilot: boolean;
  /**
   * Organization checks, off by default. authority: the router's approve/sign/submit BLOCK and ESCALATE (the AI cannot
   * perform those acts anyway). privacy: the personal-data and credential scan on text, files, memories and tool
   * results; off, nothing is masked, blocked or asked about on privacy grounds.
   */
  checks: { authority: boolean; privacy: boolean };
};

// Off until an administrator turns them on: anything that runs code, merges, or sends data somewhere new.
const DEFAULT_FEATURES: Record<Feature, boolean> = {
  toolLoop: true,
  autoMode: false,
  shellByAi: false,
  autoMerge: false,
  autopilot: false,
  sandbox: false,
  mcp: false,
  lineGateway: false,
  // Images go to vision models like in other AI apps; with checks.privacy on they still pass the OCR scan first.
  vision: true,
  voice: false,
  copilot: false,
  compatibleProviders: false,
  headless: false,
  skillPacks: false,
  cron: false,
  coordinator: false,
  memoryTeam: false,
  // The local Router picks Skills and Playbooks and asks clarifying questions only when an administrator turns it on.
  // Off, every request goes to the AI as general help.
  autoRouting: false,
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
    permission: {
      modes: ['ask', 'acceptEdits', 'plan'],
      defaultMode: 'ask',
      pathRules: [],
      deniedCommands: [...DEFAULT_DENIED_COMMANDS],
      rememberApprovals: true,
    },
    hooks: [],
    mcpServers: [],
    prices: {},
    budgets: {},
    pilot: true,
    checks: { authority: false, privacy: false },
  };
}

export const policyPath = managedPolicyPath;

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
  if (raw.pilot !== undefined) {
    if (typeof raw.pilot !== 'boolean') problems.push('pilot must be true or false');
    else policy.pilot = raw.pilot;
  }
  if (raw.checks !== undefined) {
    if (
      !isObject(raw.checks) ||
      Object.keys(raw.checks).some(k => !['authority', 'privacy'].includes(k)) ||
      Object.values(raw.checks).some(v => typeof v !== 'boolean')
    )
      problems.push('checks must be an object with boolean authority and privacy');
    else policy.checks = { ...policy.checks, ...raw.checks };
  }
  if (raw.transmissionConsent !== undefined) {
    if (
      !isObject(raw.transmissionConsent) ||
      Object.keys(raw.transmissionConsent).some(k => k !== 'allowRunScope') ||
      typeof raw.transmissionConsent.allowRunScope !== 'boolean'
    )
      problems.push('invalid transmission consent policy');
    else policy.transmissionConsent = { allowRunScope: raw.transmissionConsent.allowRunScope };
  }
  if (raw.skillPacks !== undefined) {
    if (
      !isObject(raw.skillPacks) ||
      Object.keys(raw.skillPacks).some(k => k !== 'approvedDigests') ||
      !Array.isArray(raw.skillPacks.approvedDigests) ||
      raw.skillPacks.approvedDigests.length > 100 ||
      raw.skillPacks.approvedDigests.some((d: unknown) => typeof d !== 'string' || !/^[a-f0-9]{64}$/.test(d))
    )
      problems.push('invalid Skill Pack approvals');
    else policy.skillPacks = { approvedDigests: [...new Set<string>(raw.skillPacks.approvedDigests)] };
  }
  if (raw.providers !== undefined) {
    if (!isObject(raw.providers) || Object.keys(raw.providers).some(k => !['compatible', 'copilot'].includes(k)))
      problems.push('invalid providers');
    else {
      const compatible: NonNullable<Policy['providers']>['compatible'] = [];
      if (raw.providers.compatible !== undefined && (!Array.isArray(raw.providers.compatible) || raw.providers.compatible.length > 30))
        problems.push('invalid compatible profiles');
      else
        for (const p of raw.providers.compatible || []) {
          try {
            if (
              !isObject(p) ||
              Object.keys(p).some(k => !['name', 'baseUrl', 'protocol'].includes(k)) ||
              !text(p.name, 120) ||
              !text(p.baseUrl, 2000) ||
              !['openai', 'anthropic'].includes(p.protocol)
            )
              throw new Error('invalid');
            providerEndpoint(p.baseUrl, p.protocol);
            compatible.push({ name: p.name, baseUrl: p.baseUrl, protocol: p.protocol });
          } catch {
            problems.push('invalid compatible profile');
          }
        }
      let copilot: { clientId: string } | undefined;
      if (raw.providers.copilot !== undefined) {
        const p = raw.providers.copilot;
        if (!isObject(p) || Object.keys(p).some(k => k !== 'clientId') || !/^[a-zA-Z0-9_-]{8,80}$/.test(p.clientId))
          problems.push('invalid Copilot client id');
        else copilot = { clientId: p.clientId };
      }
      policy.providers = { compatible, ...(copilot ? { copilot } : {}) };
    }
  }
  if (raw.voice !== undefined) {
    if (!isObject(raw.voice) || Object.keys(raw.voice).some(k => k !== 'components') || !isObject(raw.voice.components))
      problems.push('invalid voice components');
    else {
      const components: NonNullable<Policy['voice']>['components'] = {};
      for (const [platform, spec] of Object.entries(raw.voice.components)) {
        try {
          if (
            !/^(win32|darwin|linux)-(x64|arm64)$/.test(platform) ||
            !isObject(spec) ||
            Object.keys(spec).some(k => !['runtime', 'model'].includes(k))
          )
            throw new Error('invalid');
          for (const a of [spec.runtime, spec.model]) {
            if (!isObject(a) || Object.keys(a).some(k => !['url', 'sha256'].includes(k)) || !/^[a-f0-9]{64}$/.test(a.sha256))
              throw new Error('invalid');
            const url = new URL(a.url);
            if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error('invalid');
          }
          components[platform] = spec as any;
        } catch {
          problems.push('invalid voice artifact');
        }
      }
      policy.voice = { components };
    }
  }

  if (raw.sandbox !== undefined) {
    if (
      !isObject(raw.sandbox) ||
      Object.keys(raw.sandbox).some(k => k !== 'image') ||
      typeof raw.sandbox.image !== 'string' ||
      !/^[a-z0-9][a-z0-9._/:\-]*@sha256:[a-f0-9]{64}$/.test(raw.sandbox.image)
    )
      problems.push('sandbox requires a digest-pinned image');
    else policy.sandbox = { image: raw.sandbox.image };
  }
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
        if (!modes.length || modes.length !== permission.modes.length)
          problems.push('permission.modes must list ask, acceptEdits, plan or auto');
        else policy.permission.modes = [...new Set(modes as PermissionMode[])];
      }
      if (permission.defaultMode !== undefined) {
        if (!PERMISSION_MODES.includes(permission.defaultMode))
          problems.push('permission.defaultMode must be ask, acceptEdits, plan or auto');
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
      if (permission.rememberApprovals !== undefined) {
        if (typeof permission.rememberApprovals !== 'boolean') problems.push('permission.rememberApprovals must be true or false');
        else policy.permission.rememberApprovals = permission.rememberApprovals;
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
        else if (policy.mcpServers.some(s => s.name === name)) problems.push('duplicate MCP server name');
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
export const trustedPolicyPath = trustedManagedPolicyPath;

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
