import { approvedProfile } from '../../src/modules/providers/compatible.js';
import { copilotDeviceLogin } from './copilot-auth';
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
  nativeTheme,
  clipboard,
  Notification,
  session as electronSession,
} from 'electron';
import { mkdir, writeFile, stat, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, dirname, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Store } from './store';
import { Workbench, browserUrl } from './workbench';
import { AgentBrowser } from './browser-agent';
import { Images } from './images';
import { isImageRequest } from '../src/image-routing';
import { WorkService, MAX_PARALLEL_RUNS, type Harness } from './service';
import { Coordinator } from './coordinator';
import { Automations, connectionBinding } from './cron';
import { Mcp } from './mcp';
import { Sandbox } from './sandbox';
import { adapter, listModels } from './providers';
import { errorCode } from './diagnostics';
import { connectFailureNote, signInAndTest, signOutManagedProvider } from './connect';
import { checkRuntime, resolveRuntime } from './runtimes';
import { isolatedRuntimeHome } from './runtime-home';
import { exportDocument, exportFormats } from './export';
import { draftExportAction } from './actions';
import { OcrService, OCR_EXTENSIONS, isOcrFolder, ocrPython } from './ocr';
import { installOcr, ocrComponentCurrent } from './components';
import { validateKeybindings } from '../src/commands';
import { Voice } from './voice';
import { installPack, listPacks, enablePack, exportPack, packAsset, enabledPackHooks } from '../../src/modules/packs/index.js';
import { buildReceiptAiResolver, resolveReceiptAiResponse } from './receipt-ai';
import { findClaudeCode, handoffText, openClaudeCode } from './handoff';
import { resolveClaudeRuntime, claudeLogout } from './claude-auth';
import {
  findAnthropicCli,
  resolveAnthropicCli,
  anthropicLogout,
  installAnthropicCli,
  antComponentPath,
  antComponentSpec,
} from './anthropic-auth';
import { existsSync, watchFile, unwatchFile } from 'node:fs';
import { loadPolicy, type PermissionMode } from './policy';
import { Approvals } from './approvals';
import { ToolGate } from './tool-gate';
import { HookEngine, type HookPayload } from './hooks';
import { attachmentReason } from './attachments';
import { DesktopTools } from './tools';
import { Questions } from './questions';
import { CostLedger } from './cost';
import { Memories, safeMemory } from './memory';
import { WorkspaceContext } from './workspace-context';
import { section } from './prompt';
import { ocrAttachmentReport } from './ocr-attachment';
import type { Attachment, Connection, Provider, Session, Settings, VisionInput } from '../src/types';
import { tm, useLanguage } from './i18n';

let window: BrowserWindow, store: Store, service: WorkService;
const attachments = new Map<string, { view: Attachment; text: string; sessionId: string; image?: VisionInput }>();
const exportPaths = new Set<string>();
const connecting = new Set<string>();
const authCodes = new Map<string, (code: string | null) => void>();
const consents = new Map<string, string>();
const connectControllers = new Map<string, AbortController>();
// Tasks in different Workspaces may run side by side; each session still runs one task at a time.
let installingAnt = false;
let ocrResolving = false;
const validProviders = new Set(['openai', 'claude', 'gemini', 'antigravity', 'compatible', 'copilot']);
// Pilot diagnostics: error codes and provider names only, never request, draft, or document content.
let logFile = '';
function diagnose(event: string, detail: Record<string, string> = {}) {
  if (!logFile) return;
  void appendFile(logFile, JSON.stringify({ at: new Date().toISOString(), event, ...detail }) + '\n').catch(() => {});
}
const inputText = (value: unknown, limit = 30000) => {
  if (typeof value !== 'string' || value.length > limit) throw new Error('INVALID_INPUT');
  return value;
};

async function makeWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 800,
    minHeight: 600,
    title: 'STeP Desktop',
    backgroundColor: '#fafaf8',
    show: false,
    ...(app.isPackaged ? {} : { icon: resolve(__dirname, '../build/icon.ico') }),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', async () => {
    // Keep the window open by default when the editor has unsaved content.
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      message: tm('มีร่างที่ยังไม่บันทึก'),
      detail: tm('กลับไปบันทึกร่างก่อนปิด หรือเลือกปิดโดยไม่บันทึก'),
      buttons: [tm('กลับไปบันทึก'), tm('ปิดโดยไม่บันทึก')],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 1) window.destroy();
  });
  window.once('ready-to-show', () => window.show());
  await window.loadFile(join(__dirname, 'renderer/index.html'));
}

async function main() {
  if (!app.isPackaged && process.env.STEP_DESKTOP_TEST_HOME) app.setPath('userData', process.env.STEP_DESKTOP_TEST_HOME);
  await app.whenReady();
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const root = app.isPackaged ? join(process.resourcesPath, 'harness') : resolve(__dirname, '../..');
  const data = app.getPath('userData');
  const { prepareDraft } = await import(pathToFileURL(join(root, 'src/modules/runner/index.js')).href);
  await mkdir(data, { recursive: true });
  await mkdir(join(data, 'logs'), { recursive: true });
  logFile = join(data, 'logs', 'diagnostics.jsonl');
  let voicePermissionUntil = 0,
    voiceTicketUntil = 0;
  electronSession.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(
      permission === 'notifications' ||
        (permission === 'media' &&
          contents.id === window?.webContents.id &&
          Date.now() < voicePermissionUntil &&
          'mediaTypes' in details &&
          details.mediaTypes?.length === 1 &&
          details.mediaTypes[0] === 'audio'),
    ),
  );
  electronSession.defaultSession.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      permission === 'notifications' ||
      (permission === 'media' &&
        contents?.id === window?.webContents.id &&
        Date.now() < voicePermissionUntil &&
        details.mediaType === 'audio'),
  );
  store = new Store(join(data, 'workspace.sqlite'));
  useLanguage(() => store?.settings().language);
  const [routing, routerPolicy, privacy, documents, outputs, skillCatalog] = await Promise.all([
    import(pathToFileURL(join(root, 'src/modules/router/service.js')).href),
    import(pathToFileURL(join(root, 'src/modules/router/index.js')).href),
    import(pathToFileURL(join(root, 'src/modules/privacy/index.js')).href),
    import(pathToFileURL(join(root, 'src/modules/privacy/document.js')).href),
    import(pathToFileURL(join(root, 'src/modules/output-manager.js')).href),
    import(pathToFileURL(join(root, 'src/modules/skills/catalog.js')).href),
  ]);
  const harness: Harness = {
    permissionMode: () => permissionMode(),
    memoryDir: () => store.settings().workspace || app.getPath('userData'),
    root,
    route: routing.queryStepRouter,
    contextPolicy: routerPolicy.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
    catalog: () => skillCatalog.loadSkillCatalog(root),
    documentMetadata: routing.loadDocumentContextMetadata,
    toolLoop: () => policyState.policy.features.toolLoop,
    visionEnabled: () => policyState.policy.features.vision,
    skillMetadata: async id => {
      const m = await routing.loadSkillContextMetadata(id);
      return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m?.mandatory || []) };
    },
    documentPrivacy: documents.evaluateDocumentPrivacy,
    nextOutput: outputs.getNextOutputPath,
  };
  const actions = await import(pathToFileURL(join(root, 'src/modules/actions/index.js')).href);
  const userMemory = await import(pathToFileURL(join(root, 'src/modules/user-memory.js')).href);
  // USER.md sits in the chosen work folder so CLI and desktop share it; before one is chosen it stays in app data.
  const memoryDir = () => store.settings().workspace || data;
  const userFile = () => join(memoryDir(), 'USER.md');
  async function writeUserMemory() {
    const s = store.settings();
    await userMemory.savePersonalization(memoryDir(), {
      name: s.userName || '',
      assistantName: s.assistant,
      personality: s.personality || 'coworker',
      assistantTone: s.assistantTone || '',
      team: s.team,
    });
    exportPaths.add(userFile());
    const assistantPath = join(memoryDir(), 'ASSISTANT.md');
    const assistantText = userMemory.generateAssistantPreferences({
      assistantName: s.assistant,
      personality: s.personality,
      assistantTone: s.assistantTone,
    });
    safeMemory(assistantText, harness.privacy);
    // Preserve an employee-authored persona; create the derived default only once.
    const assistantTarget = s.workspace ? await workbench.path('ASSISTANT.md', true) : assistantPath;
    await writeFile(assistantTarget, assistantText, { flag: 'wx', mode: 0o600 }).catch(e => {
      if (e.code !== 'EEXIST') throw e;
    });
  }
  const emit = (event: any) => {
    if (window && !window.isDestroyed()) window.webContents.send('step:event', event);
  };
  async function key(connection: Connection) {
    const encrypted = store.get<string>('secret', connection.id);
    if (!encrypted) return undefined;
    if (!safeStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  // Each connection keeps its runtime's sign-in and state in its own folder under app data.
  async function removeRuntimeHome(id: string) {
    const base = join(data, 'runtimes'),
      home = resolve(base, id);
    if (!/^[\w-]{1,60}$/.test(id) || dirname(home) !== resolve(base)) throw new Error('INVALID_INPUT');
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  // In-app Claude subscription login stays off until Anthropic approves offering claude.ai login.
  // Sign-out and removal keep working with the flag off so an earlier login can always be cleared.
  const claudeSubscription = process.env.STEP_CLAUDE_SUBSCRIPTION === '1';
  // The official ant CLI that STeP installs for Claude Console OAuth when the employee has none.
  const antHome = join(data, 'components', 'ant');
  const findAnt = () => findAnthropicCli([antComponentPath(antHome)]);
  async function installAnt(log: (line: string) => void, signal?: AbortSignal) {
    if (installingAnt) throw new Error('INSTALL_BUSY');
    installingAnt = true;
    try {
      await installAnthropicCli(antHome, log, {}, signal);
      diagnose('ant-installed');
    } catch (error) {
      diagnose('ant-install-failed', { code: errorCode(error) });
      throw error;
    } finally {
      installingAnt = false;
    }
  }
  async function runtime(connection: Connection, signOut = false, webSearch = false) {
    if (connection.provider === 'claude' && connection.mode === 'subscription' && !claudeSubscription && !signOut)
      throw new Error('FEATURE_DISABLED');
    if (connection.provider === 'compatible')
      approvedProfile({ baseUrl: connection.baseUrl || '', protocol: connection.protocol, model: connection.model }, policyState.policy);
    if (connection.provider === 'copilot' && !signOut && !policyState.policy.features.copilot) throw new Error('FEATURE_DISABLED');
    if (!['compatible', 'copilot'].includes(connection.provider)) connection.executable = resolveRuntime(connection);
    // Isolate runtime configuration from personal MCP servers, plugins, and files.
    const { cwd, env } = await isolatedRuntimeHome(join(data, 'runtimes', connection.id), connection, webSearch);
    let authExecutable: string | undefined;
    if (connection.provider === 'claude' && connection.mode === 'subscription') {
      await mkdir(env.CLAUDE_CONFIG_DIR!, { recursive: true });
      connection.executable = await resolveClaudeRuntime({ cwd, env });
    }
    if (connection.provider === 'claude' && connection.mode === 'oauth') {
      await mkdir(env.ANTHROPIC_CONFIG_DIR!, { recursive: true });
      authExecutable = await resolveAnthropicCli({ cwd, env }, findAnt);
    }
    return { adapter: adapter(connection.provider), context: { cwd, env, key: await key(connection) }, authExecutable };
  }
  const images = new Images(join(data, 'images'), key);
  // The organization's policy (admin-only file). Re-read when it changes; a bad file keeps safe defaults.
  const testPolicy = !app.isPackaged && process.env.STEP_DESKTOP_TEST_HOME ? join(data, 'desktop-policy.json') : undefined;
  const readPolicy = () => (testPolicy ? loadPolicy(testPolicy, () => true) : loadPolicy());
  let policyState = readPolicy();
  const voice = new Voice(join(data, 'components', 'voice'), () => policyState.policy);
  const workbench = new Workbench(
    store,
    text => privacy.evaluatePrivacyGate(text).redactedText,
    () => policyState.policy,
  );
  if (policyState.problems.length) diagnose('policy-problems', { count: String(policyState.problems.length) });
  watchFile(policyState.path, { interval: 5000 }, () => {
    policyState = readPolicy();
    voice.cancel();
    voicePermissionUntil = 0;
    voiceTicketUntil = 0;
    approvals.close();
    questions.close();
    diagnose('policy-reloaded', { source: policyState.policy.source, problems: String(policyState.problems.length) });
    emit({ sessionId: '', type: 'changed' });
  });
  const hooks = new HookEngine(
    () => ({
      ...policyState.policy,
      hooks: [...policyState.policy.hooks, ...enabledPackHooks(store.settings().workspace || data, policyState.policy)],
    }),
    async (prompt, payload, signal) => {
      if (privacy.evaluatePrivacyGate(prompt).action !== 'pass') throw new Error('PRIVACY_REVIEW_REQUIRED');
      const session = payload.sessionId ? store.session(String(payload.sessionId)) : undefined;
      const connection = session ? store.get<Connection>('connection', session.connectionId) : store.connections().find(c => c.ready);
      if (!connection?.ready) throw new Error('CONNECTION_NOT_READY');
      const r = await runtime(connection);
      if (signal.aborted) throw new Error('CANCELLED');
      const result = await r.adapter.run(prompt + '\nEvent metadata: ' + JSON.stringify(payload), connection, {
        ...r.context,
        signal,
        emit: () => {},
        system:
          'Evaluate the organization hook using only the event metadata. Return only JSON {"decision":"allow"|"block"}. Do not execute tools or external actions.',
      });
      return result;
    },
  );
  const permissionMode = (): PermissionMode => {
    const chosen = store.settings().permissionMode;
    return chosen && policyState.policy.permission.modes.includes(chosen) ? chosen : policyState.policy.permission.defaultMode;
  };
  // Hook results go to diagnostics; payloads carry masked text and metadata only.
  const fireHook = async (payload: HookPayload) => {
    const outcome = await hooks.run(payload);
    if (outcome.results.length)
      diagnose('hook', {
        event: payload.event,
        blocked: String(outcome.blocked),
        results: outcome.results
          .map(r => `${r.hook} ${r.ok ? 'ok' : 'failed'} ${r.ms}ms`)
          .join(' | ')
          .slice(0, 800),
      });
    return outcome;
  };
  const approvals = new Approvals(store, (approval, approvalId) =>
    emit({ sessionId: '', type: approval ? 'approval' : 'approval-close', approval, approvalId }),
  );
  const gate = new ToolGate(
    () => policyState.policy,
    permissionMode,
    () =>
      workbench.root().catch(error => {
        if (error.message === 'WORKSPACE_REQUIRED') return '';
        throw error;
      }),
    approvals,
    fireHook,
  );
  const browsers = new Map<string, BrowserWindow>();
  const agentBrowser = new AgentBrowser();
  const questions = new Questions(emit);
  const ledger = new CostLedger(store, () => policyState.policy);
  const tools = new DesktopTools(
    workbench,
    harness,
    gate,
    approvals,
    questions,
    () => policyState.policy,
    permissionMode,
    join(__dirname, 'sheet-worker.cjs'),
    () => emit({ sessionId: '', type: 'changed' }),
    id => {
      const s = store.session(id);
      const c = store.get<Connection>('connection', s.connectionId);
      return JSON.stringify([
        store.settings().team,
        s.team,
        s.connectionId,
        s.model,
        c?.provider,
        c?.mode,
        c?.baseUrl,
        c?.protocol,
        c?.executable,
        c?.ready,
        c?.signedIn,
      ]);
    },
  );
  harness.tools = scope => tools.host(scope);
  const phase4Identity = () => JSON.stringify([store.settings().workspace, store.settings().team, permissionMode()]);
  const phase4Consent = (title: string, body: string, signal?: AbortSignal) =>
    approvals.request(
      approvals.rule(store.settings().workspace || data, 'phase4', body),
      { title, body, privacyClass: 'internal', allowRemember: false },
      signal,
    );
  const mcp = new Mcp(() => policyState.policy, phase4Identity, join(data, 'mcp'), harness.privacy, phase4Consent);
  const sandbox = new Sandbox(
    workbench,
    () => policyState.policy,
    harness.privacy,
    (body, signal) => phase4Consent(tm('รันคำสั่งใน Docker sandbox?'), body, signal),
  );
  tools.closeBrowser = id => agentBrowser.closeOwner(id);
  tools.external = (request, scope, check) => {
    if (request.tool === 'browser_control')
      return agentBrowser.run(request, {
        sessionId: scope.sessionId,
        activity: scope.activity,
        signal: scope.signal,
        check,
        review: text => {
          if (harness.privacy(text).action !== 'pass') throw new Error('PRIVACY_REVIEW_REQUIRED');
        },
        approve: (title, body) =>
          approvals.request(
            approvals.rule(store.settings().workspace || data, 'browser_control', randomUUID()),
            { title, body, privacyClass: 'internal', allowRemember: false },
            scope.signal,
          ),
      });
    if (request.tool === 'mcp_search')
      return request.input
        ? mcp.search(request.input, String(request.args?.query || ''), scope.signal)
        : Promise.resolve({ servers: mcp.servers() });
    if (request.tool === 'mcp_call')
      return mcp.call(request.input, String(request.args?.name || ''), request.args?.arguments as Record<string, unknown>, scope.signal);
    return sandbox.run(request.input, (request.args?.files || []) as string[], scope.signal);
  };
  harness.recordUsage = (connection, count) => ledger.record(connection, count);
  const memories = new Memories(store, data, () => policyState.policy, harness.privacy);
  const workspaceContext = new WorkspaceContext(workbench, data, () => store.settings(), harness.privacy);
  harness.compactHook = async (event, id, before, after) => {
    const result = await fireHook({ event, sessionId: id, beforeTokens: before, afterTokens: after });
    if (result.blocked) throw new Error('HOOK_BLOCKED');
  };
  harness.completed = async session => {
    await memories.dream(session);
    emit({ sessionId: session.id, type: 'changed' });
  };
  harness.extraContext = async (id, query, connection, signal) => {
    const settings = store.settings(),
      policy = policyState.policy,
      mode = permissionMode();
    const identity = JSON.stringify([settings.workspace, settings.team, settings.outputStyle]);
    const preferences = await workspaceContext.load(),
      selected = await memories.relevant(query);
    const text = [
      preferences.length ? section('workspace_preferences', JSON.stringify(preferences)) : '',
      selected.length
        ? section(
            'memory_context',
            JSON.stringify(selected.map(m => ({ id: m.id, scope: m.scope, type: m.type, name: m.name, text: m.text }))),
          )
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (text) {
      const approved = await approvals.request(
        approvals.rule(
          settings.workspace || data,
          'context-data',
          createHash('sha256')
            .update(id + '\0' + text)
            .digest('hex'),
        ),
        {
          title: tm('ใช้บริบทที่บันทึกไว้กับงานนี้?'),
          body: tm('จะส่งคำแนะนำพื้นที่งานและความจำที่เลือกให้ {0}\n{1}', connection.provider, text.slice(0, 2000)),
          privacyClass: 'internal',
          allowRemember: false,
        },
        signal,
      );
      if (!approved) throw new Error('CANCELLED');
    }
    const current = store.settings();
    if (signal.aborted) throw new Error('CANCELLED');
    if (
      identity !== JSON.stringify([current.workspace, current.team, current.outputStyle]) ||
      policy !== policyState.policy ||
      mode !== permissionMode()
    )
      throw new Error('WORKSPACE_CHANGED');
    return { text, loaded: [...preferences.map(p => p.path), ...selected.map(m => `memory:${m.scope}:${m.name}`)] };
  };
  service = new WorkService(
    store,
    harness,
    (connection, webSearch) => runtime(connection, false, webSearch),
    event => {
      if (event.type === 'failed') {
        const s = store.get<Session>('session', event.sessionId),
          c = s && store.get<Connection>('connection', s.connectionId);
        diagnose('run-failed', {
          code: String(event.text || '').slice(0, 40),
          provider: c?.provider || '',
          mode: c?.mode || '',
          detail: (event.detail || []).join(' | ').slice(0, 1200),
        });
        return;
      }
      // Run traces hold sizes, references and timing only; they go to diagnostics, not the window.
      if (event.type === 'trace' && event.trace) {
        const t = event.trace;
        void fireHook({ event: 'stop', sessionId: event.sessionId, outcome: t.outcome, route: t.route });
        diagnose('run-trace', {
          outcome: t.outcome,
          code: t.code || '',
          mode: t.mode,
          route: t.route.slice(0, 80),
          ms: String(t.ms),
          steps: t.steps
            .map(
              s =>
                `${s.attempts}x ${s.ms}ms sys=${s.systemChars} msg=${s.promptChars} refs=${s.references.length} tok=${s.usage?.total ?? '?'}`,
            )
            .join(' | ')
            .slice(0, 1200),
        });
        return;
      }
      emit(event);
    },
    undefined,
    (connection, prompt, model, signal) => images.generate(connection, prompt, model, signal),
  );
  const coordinator = new Coordinator(
    store,
    service,
    () => policyState.policy,
    id => {
      const parent = store.session(id),
        connection = store.get<Connection>('connection', parent.connectionId);
      return JSON.stringify([
        phase4Identity(),
        parent.connectionId,
        parent.model,
        parent.effort,
        parent.team,
        parent.project,
        connection?.ready,
        connection?.model,
        connection ? connectionBinding(connection) : null,
      ]);
    },
    (id, tasks, signal) =>
      phase4Consent(
        tm('ตรวจแผนงานย่อยก่อนเริ่ม?'),
        tm('งาน {0}\n{1}\nแต่ละงานใช้บัญชี AI เดิม ผลรวมเป็นร่างรอตรวจ', id, JSON.stringify(tasks, null, 2)),
        signal,
      ),
    (query, team) => harness.route(query, { team, workspace: store.settings().workspace }),
    (id, text) => emit({ sessionId: id, type: 'activity', text }),
  );
  const automations = new Automations(
    store,
    () => policyState.policy,
    harness.privacy,
    async (job, signal, created) => {
      const identity = phase4Identity(),
        policy = policyState.policy;
      if (permissionMode() === 'plan') throw new Error('PLAN_MODE_BLOCKED');
      const session = store.create(job.connectionId, job.team, 'Scheduled drafts');
      session.model = job.model;
      session.title = job.name;
      store.save(session);
      created(session.id);
      const cancel = () => service.cancel(session.id);
      const check = () => {
        if (signal.aborted) throw new Error('CANCELLED');
        const connection = store.get<Connection>('connection', job.connectionId);
        if (!connection?.ready || connection.model !== job.model || connectionBinding(connection) !== job.connectionBinding)
          throw new Error('AUTOMATION_CONTEXT_CHANGED');
        if (identity !== phase4Identity() || policy !== policyState.policy || !policy.features.cron)
          throw new Error('AUTOMATION_CONTEXT_CHANGED');
      };
      signal.addEventListener('abort', cancel, { once: true });
      const watcher = setInterval(() => {
        try {
          check();
        } catch {
          cancel();
        }
      }, 250);
      try {
        while (service.activeCount() >= MAX_PARALLEL_RUNS) {
          check();
          await new Promise(r => setTimeout(r, 50));
        }
        check();
        const submitted = await fireHook({
          event: 'user_prompt_submit',
          sessionId: session.id,
          promptChars: job.query.length,
          mode: 'draft',
          files: 0,
        });
        if (submitted.blocked) throw new Error('HOOK_BLOCKED');
        check();
        await service.run(session.id, job.query, '', true, undefined, 'draft', undefined, [], { draftOnly: true });
        check();
        if (store.session(session.id).status !== 'review') throw new Error('AUTOMATION_NEEDS_REVIEW');
        return session.id;
      } finally {
        clearInterval(watcher);
        signal.removeEventListener('abort', cancel);
      }
    },
    run => {
      emit({ sessionId: run.sessionId || '', type: 'changed' });
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: 'STeP Desktop',
          body: run.status === 'review' ? tm('งานตามรอบมีร่างรอตรวจแล้ว') : tm('งานตามรอบต้องการให้ตรวจสถานะ'),
        });
        notification.on('click', () => {
          window.show();
          window.focus();
        });
        notification.show();
      }
    },
  );
  automations.start();
  // The main app ships only the small OCR application code. Python, Paddle and models are an
  // optional per-user component installed from the Receipt page after STeP Desktop is installed.
  const defaultOcrFolder = app.isPackaged ? join(process.resourcesPath, 'ocr') : join(root, 'experiments', 'local-thai-ocr');
  const ocrFolder = () => store.settings().ocrDir || defaultOcrFolder;
  const ocrHome = join(data, 'components', 'ocr');
  const ocr = new OcrService(
    ocrFolder,
    undefined,
    () => (existsSync(ocrPython(ocrHome)) ? ocrPython(ocrHome) : ocrPython(ocrFolder())),
    () => ({
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONDONTWRITEBYTECODE: '1',
      PADDLE_PDX_CACHE_HOME: join(ocrHome, 'paddlex'),
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
    }),
  );
  let installing = false;
  app.on('before-quit', () => ocr.stop());
  const previewTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
  };
  async function refreshModels(connection: Connection) {
    const current = await runtime(connection);
    connection.models = await listModels(connection, current.context);
    connection.modelsAt = new Date().toISOString();
  }
  // Empty means the provider default; anything else must come from the provider's own catalog.
  const modelChoice = (connection: Connection, value: unknown) => {
    const model = inputText(value ?? '', 100);
    if (model && model !== connection.model && !connection.models?.some(m => m.id === model)) throw new Error('INVALID_MODEL');
    return model;
  };
  // Effort must be one the chosen model (or the provider default model) advertises; empty means the model default.
  const effortChoice = (connection: Connection, model: string, value: unknown) => {
    const effort = inputText(value ?? '', 20);
    const option =
      connection.models?.find(m => m.id === (model || connection.model)) ||
      (!model && !connection.model ? connection.models?.find(m => m.isDefault) : undefined);
    if (effort && !option?.efforts?.some(e => e.id === effort)) throw new Error('INVALID_MODEL');
    return effort;
  };
  // USER.md can be revealed once it exists; an unwritten path is reported as empty.
  const knownUserFile = () => {
    const file = userFile();
    if (!existsSync(file)) return '';
    exportPaths.add(file);
    return file;
  };
  const snapshot = async () => ({
    usage: ledger.report(),
    features: { claudeSubscription },
    policy: {
      source: policyState.policy.source,
      path: policyState.path,
      problems: policyState.problems,
      features: policyState.policy.features,
      modes: policyState.policy.permission.modes,
      defaultMode: policyState.policy.permission.defaultMode,
      mode: permissionMode(),
      hooks: policyState.policy.hooks.length,
    },
    approvals: approvals.list(),
    transmissionGrants: tools.transmissionGrants(),
    userFile: knownUserFile(),
    settings: store.settings(),
    connections: store.connections(),
    sessions: store.list<any>('session').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    teams: Object.values(await routing.loadTeamsDictionary()),
  });

  ipcMain.handle('step:call', async (event, method: string, raw: any = {}) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('UNTRUSTED_SENDER');
    const input = raw ?? {};
    switch (method) {
      case 'memoryList':
        return {
          entries: await memories.list(),
          proposals: memories.proposals(),
          teamEnabled: Boolean(policyState.policy.features.memoryTeam && policyState.policy.memory?.teamDirectories[store.settings().team]),
        };
      case 'memorySave':
      case 'memoryConfirm': {
        if (permissionMode() === 'plan') throw new Error('PLAN_READ_ONLY');
        return method === 'memorySave' ? memories.save(input) : memories.confirm(inputText(input.id, 60), input);
      }
      case 'memoryDelete':
        if (permissionMode() === 'plan') throw new Error('PLAN_READ_ONLY');
        await memories.remove(inputText(input.id, 60));
        return true;
      case 'memoryDismiss':
        memories.dismiss(inputText(input.id, 60));
        return true;
      case 'contextStyles':
        return workspaceContext.styles();
      case 'contextStyle': {
        const style = inputText(input.style || '', 64);
        if (style && !(await workspaceContext.styles()).includes(style)) throw new Error('INVALID_OUTPUT_STYLE');
        approvals.close();
        questions.close();
        store.put('settings', 'main', { ...store.settings(), outputStyle: style });
        return true;
      }
      case 'sessionSearch':
        return store.search(inputText(input.query || '', 200));
      case 'sessionResume':
        return store.resume(inputText(input.id, 60));
      case 'sessionFork': {
        const source = inputText(input.id, 60);
        if (service.isActive(source)) throw new Error('RUN_ALREADY_ACTIVE');
        const forked = store.fork(source);
        const started = await fireHook({ event: 'session_start', sessionId: forked.id });
        if (started.blocked) {
          store.remove('session', forked.id);
          throw new Error('HOOK_BLOCKED');
        }
        return forked;
      }
      case 'sessionExport': {
        const id = inputText(input.id, 60),
          format = input.format;
        const text = store.exportSession(id, format);
        const reviewed = harness.privacy(text);
        if (reviewed.action === 'block-external' || typeof reviewed.redactedText !== 'string') throw new Error('PRIVACY_REVIEW_REQUIRED');
        if (format === 'json') {
          try {
            JSON.parse(reviewed.redactedText);
          } catch {
            throw new Error('PRIVACY_REVIEW_REQUIRED');
          }
        }
        const result = await dialog.showSaveDialog(window, {
          title: tm('บันทึกบทสนทนา'),
          defaultPath: `conversation.${format}`,
          filters: [{ name: format === 'json' ? 'JSON' : 'Markdown', extensions: [format] }],
        });
        if (result.canceled || !result.filePath) return null;
        await writeFile(result.filePath, reviewed.redactedText, { mode: 0o600 });
        exportPaths.add(result.filePath);
        return { path: result.filePath };
      }
      case 'imageModels': {
        const connection = store.get<Connection>('connection', inputText(input.id, 60));
        if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        return images.models(connection);
      }
      case 'imageRead':
      case 'imageExport': {
        const artifact = store.session(inputText(input.id, 60)).images?.find(i => i.id === input.imageId);
        if (!artifact) throw new Error('INVALID_PATH');
        if (method === 'imageRead') return images.read(artifact);
        const result = await dialog.showSaveDialog(window, {
          defaultPath: artifact.name,
          filters: [{ name: 'Image', extensions: [artifact.name.split('.').at(-1)!] }],
        });
        if (result.canceled || !result.filePath) return null;
        const { copyFile } = await import('node:fs/promises');
        await copyFile(images.path(artifact), result.filePath);
        exportPaths.add(result.filePath);
        return { path: result.filePath };
      }
      case 'usage':
        return ledger.report();
      case 'questionRespond':
        questions.respond(inputText(input.id, 60), input.answer);
        return true;
      case 'toolSnapshots':
        return gate.run({ tool: 'snapshot', readOnly: true }, { title: '', body: '', key: 'list' }, () => workbench.snapshots());
      case 'toolSnapshotRestore':
        return gate.run({ tool: 'snapshot', readOnly: true }, { title: '', body: '', key: inputText(input.id, 60) }, () =>
          workbench.restoreSnapshot(input.id),
        );
      case 'toolSnapshotForget':
        return gate.run({ tool: 'snapshot-forget', readOnly: true }, { title: '', body: '', key: inputText(input.id, 60) }, () =>
          workbench.forgetSnapshot(input.id),
        );
      case 'toolFiles': {
        const target = inputText(input.path || '', 2000);
        return gate.run({ tool: 'files', readOnly: true, path: target || '.' }, { title: '', body: '', key: target }, () =>
          workbench.files(target),
        );
      }
      case 'toolRead': {
        const target = inputText(input.path, 2000);
        return gate.run({ tool: 'read', readOnly: true, path: target }, { title: '', body: '', key: target }, () =>
          workbench.readChunk(target, Number(input.offset || 0), 200_000),
        );
      }
      case 'toolStage': {
        const target = inputText(input.path, 2000);
        // Previewing a diff does not write the workspace; apply has its own approval and mode check.
        return gate.run({ tool: 'stage', readOnly: true, path: target }, { title: '', body: '', key: target }, () =>
          workbench.stage(target, inputText(input.content, 200000)),
        );
      }
      case 'toolChanges':
        return gate.run({ tool: 'changes', readOnly: true }, { title: '', body: '', key: 'changes' }, () => workbench.changes());
      case 'toolReject':
        return gate.run({ tool: 'reject', readOnly: true }, { title: '', body: '', key: inputText(input.id, 60) }, () => {
          workbench.reject(input.id);
          return true;
        });
      case 'toolApply': {
        const change = workbench.change(inputText(input.id, 60));
        const review = privacy.evaluatePrivacyGate(change.before + '\n' + change.after);
        return gate.run(
          { tool: 'write', readOnly: false, path: change.path },
          {
            title: tm('เขียนไฟล์ที่ตรวจแล้ว?'),
            body: change.path + tm('\nตรวจ Before / After ใน Changes ก่อนบันทึก'),
            key: change.path,
            privacyClass: review.classification === 'public' ? 'internal' : review.classification,
          },
          () => workbench.apply(change.id),
        );
      }
      case 'toolDiff':
        return gate.run({ tool: 'diff', readOnly: true }, { title: '', body: '', key: 'diff' }, () => workbench.diff());
      case 'toolTasks':
        return gate.run({ tool: 'tasks', readOnly: true }, { title: '', body: '', key: 'tasks' }, () => workbench.tasks());
      case 'toolCancel':
        return gate.run({ tool: 'cancel', readOnly: true }, { title: '', body: '', key: inputText(input.id, 60) }, async () => {
          await workbench.cancel(input.id);
          return true;
        });
      case 'toolRun': {
        const command = inputText(input.command, 2000),
          cwd = await workbench.root();
        const review = privacy.evaluatePrivacyGate(command);
        if (review.action === 'block-external') throw new Error('PRIVACY_REVIEW_REQUIRED');
        return gate.run(
          { tool: 'terminal', readOnly: false, execute: true, command },
          {
            title: tm('รันคำสั่งนี้บนเครื่อง?'),
            body: command + '\n\nWorking directory: ' + cwd + tm('\nคำสั่งทำงานด้วยสิทธิ์ของคุณ และอาจแก้ไฟล์หรือเชื่อมต่อเครือข่าย'),
            key: command,
            privacyClass: review.classification === 'public' ? 'internal' : review.classification,
          },
          () => workbench.start(command),
        );
      }
      case 'toolBrowser': {
        const url = browserUrl(inputText(input.url, 2000));
        return gate.run({ tool: 'browser', readOnly: true }, { title: '', body: '', key: url }, async () => {
          if (browsers.size >= 4) throw new Error('TASK_LIMIT');
          const id = randomUUID();
          const browser = new BrowserWindow({
            width: 1100,
            height: 800,
            title: 'STeP Browser',
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'step-browser-' + id },
          });
          browsers.set(id, browser);
          browser.on('closed', () => browsers.delete(id));
          const network = browser.webContents.session;
          network.setPermissionRequestHandler((_c, _p, callback) => callback(false));
          network.setPermissionCheckHandler(() => false);
          network.on('will-download', e => e.preventDefault());
          browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
          browser.webContents.on('will-navigate', (e, target) => {
            try {
              browserUrl(target);
            } catch {
              e.preventDefault();
            }
          });
          browser.webContents.on('will-redirect', (e, target) => {
            try {
              browserUrl(target);
            } catch {
              e.preventDefault();
            }
          });
          try {
            await browser.loadURL(url);
          } catch {
            browser.destroy();
            throw new Error('BROWSER_LOAD_FAILED');
          }
          return { id, url, title: browser.webContents.getTitle() };
        });
      }
      case 'toolBrowserRead': {
        const browser = browsers.get(inputText(input.id, 60));
        if (!browser || browser.isDestroyed()) throw new Error('BROWSER_CLOSED');
        return gate.run({ tool: 'browser_read', readOnly: true }, { title: '', body: '', key: browser.webContents.getURL() }, async () => ({
          url: browser.webContents.getURL(),
          title: browser.webContents.getTitle(),
          text: await browser.webContents.executeJavaScript('document.body.innerText.slice(0,50000)'),
        }));
      }
      case 'dryRun': {
        const query = inputText(input.query, 30_000),
          connection = store.get<Connection>('connection', inputText(input.connectionId, 60));
        try {
          const plan = await prepareDraft(
            {
              query,
              team: store.settings().team,
              workspace: store.settings().workspace,
              policy: policyState.policy,
              provider: connection?.provider,
              profile: { model: inputText(input.model || connection?.model || '', 160) },
            },
            { harness },
          );
          if (connection?.provider === 'compatible')
            approvedProfile(
              { baseUrl: connection.baseUrl || '', protocol: connection.protocol || 'openai', model: connection.model },
              policyState.policy,
            );
          if (connection?.provider === 'copilot' && !policyState.policy.features.copilot) throw new Error('FEATURE_DISABLED');
          if (!connection?.ready) return { ...plan.readiness, status: 'blocked', blockers: ['CONNECTION_NOT_READY'] };
          return plan.readiness;
        } catch (error) {
          return { status: 'blocked', blockers: [errorCode(error)], warnings: [], nextActions: ['REVIEW_REQUEST'] };
        }
      }
      case 'snapshot':
        return snapshot();
      case 'automationList':
        return { jobs: automations.list(), history: automations.history(), enabled: policyState.policy.features.cron };
      case 'automationSave': {
        const query = inputText(input.query, 4000),
          identity = phase4Identity(),
          policy = policyState.policy;
        const preview = automations.preview(input);
        const routed = await harness.route(query, { team: store.settings().team, workspace: store.settings().workspace });
        const contract = routed.routingContract;
        if (contract?.authority?.status !== 'ALLOW' || ['BLOCK', 'ESCALATE', 'CLARIFY', 'UNAVAILABLE'].includes(contract?.mode))
          throw new Error('AUTHORITY_REVIEW_REQUIRED');
        if (
          input.enabled &&
          !(await phase4Consent(
            tm('อนุมัติงานตามรอบ?'),
            tm(
              '{0}\nตาราง UTC: {1}\nใช้บัญชี {2} และพื้นที่งานปัจจุบัน เฉพาะเมื่อแอปเปิด ผลเป็นร่างรอตรวจ',
              query,
              input.schedule,
              input.connectionId,
            ),
          ))
        )
          throw new Error('CANCELLED');
        if (identity !== phase4Identity() || policy !== policyState.policy) throw new Error('POLICY_CHANGED');
        const current = automations.preview(input);
        if (preview.model !== current.model || preview.connectionBinding !== current.connectionBinding)
          throw new Error('AUTOMATION_CONTEXT_CHANGED');
        return automations.save(input);
      }
      case 'automationRemove':
        automations.remove(inputText(input.id, 60));
        return true;
      case 'automationCancel':
        automations.cancel(inputText(input.id, 60));
        return true;
      case 'automationRun': {
        const id = inputText(input.id, 60),
          job = automations.list().find(j => j.id === id);
        if (!job) throw new Error('AUTOMATION_NOT_FOUND');
        if (!(await phase4Consent(tm('เริ่มงานตามรอบ?'), job.query))) throw new Error('CANCELLED');
        if (JSON.stringify(job) !== JSON.stringify(automations.list().find(j => j.id === id)))
          throw new Error('AUTOMATION_CONTEXT_CHANGED');
        return automations.enqueue(id);
      }
      case 'mcpServers':
        return mcp.servers();
      case 'mcpSearch':
        return gate.run({ tool: 'mcp_search', readOnly: false }, { title: tm('ค้นหา MCP?'), body: input.server, key: input.server }, () =>
          mcp.search(inputText(input.server, 60), input.query || ''),
        );
      case 'mcpCall':
        return gate.run(
          { tool: 'mcp_call', readOnly: false },
          { title: tm('เรียก MCP?'), body: input.name, key: JSON.stringify(input) },
          () => mcp.call(inputText(input.server, 60), inputText(input.name, 120), input.arguments),
        );
      case 'sandboxRun':
        return gate.run(
          { tool: 'sandbox', readOnly: false, command: inputText(input.command, 2000), execute: true },
          { title: tm('รันใน Docker?'), body: input.command, key: JSON.stringify(input) },
          () => sandbox.run(input.command, input.files || []),
        );
      case 'permissionMode': {
        const mode = input.mode as PermissionMode;
        if (!policyState.policy.permission.modes.includes(mode)) throw new Error('MODE_NOT_ALLOWED');
        approvals.close();
        questions.close();
        store.put('settings', 'main', { ...store.settings(), permissionMode: mode });
        return snapshot();
      }
      case 'approvalRemove':
        approvals.remove(inputText(input.id, 80));
        return snapshot();
      case 'approvalRespond':
        approvals.respond(inputText(input.id, 60), input.answer);
        return true;
      case 'transmissionRevoke':
        tools.revokeTransmission(inputText(input.id, 60));
        return snapshot();
      case 'workspace': {
        const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] });
        if (!result.canceled) {
          approvals.close();
          questions.close();
          const s = store.settings();
          s.workspace = result.filePaths[0];
          store.put('settings', 'main', s);
          await writeUserMemory().catch(() => {});
        }
        return store.settings();
      }
      case 'settings': {
        const teams = await routing.loadTeamsDictionary();
        const team = inputText(input.team, 40),
          theme = input.theme;
        if ((team && !teams[team]) || !['system', 'light', 'dark'].includes(theme)) throw new Error('INVALID_SETTINGS');
        const personality = ['coworker', 'professional', 'concise', 'custom'].includes(input.personality)
          ? input.personality
          : store.settings().personality || 'coworker';
        const s: Settings = {
          ...store.settings(),
          team,
          assistant: inputText(input.assistant, 60).trim() || 'STeP Mate',
          theme,
          onboarding: true,
          userName: input.userName === undefined ? store.settings().userName : inputText(input.userName, 60).trim(),
          personality,
          assistantTone: input.assistantTone === undefined ? store.settings().assistantTone : inputText(input.assistantTone, 300).trim(),
          language: input.language === 'en' || input.language === 'th' ? input.language : store.settings().language,
        };
        store.put('settings', 'main', s);
        nativeTheme.themeSource = theme;
        await writeUserMemory().catch(error => diagnose('user-memory-failed', { code: errorCode(error) }));
        return s;
      }
      case 'voiceStatus':
        return voice.status();
      case 'packList':
        return listPacks(store.settings().workspace || data, policyState.policy);
      case 'packInstall': {
        const selected = await dialog.showOpenDialog(window!, {
          title: tm('นำเข้า Skill Pack จากโฟลเดอร์'),
          properties: ['openDirectory'],
        });
        if (selected.canceled || !selected.filePaths[0]) return null;
        return installPack(store.settings().workspace || data, selected.filePaths[0], { name: inputText(input.name || '', 64) });
      }
      case 'packEnable': {
        const identity = phase4Identity(),
          workspace = store.settings().workspace || data,
          id = inputText(input.id, 64);
        const consent = await dialog.showMessageBox(window!, {
          type: 'question',
          buttons: [tm('ยกเลิก'), tm('ยืนยัน')],
          defaultId: 0,
          cancelId: 0,
          message: input.disable ? tm('ปิด Skill Pack นี้') : tm('เปิด Skill Pack ที่ผู้ดูแลรับรอง'),
          detail: tm(
            '{0}\nHooks: {1}\nAgent templates: {2}\nPack ไม่สามารถให้สิทธิ์หรือแก้ขั้นตอนองค์กรได้',
            id,
            input.hooks === true ? tm('เปิด command/HTTP hooks ที่รับรอง') : tm('ปิด'),
            input.agents === true ? tm('เปิด') : tm('ปิด'),
          ),
        });
        if (consent.response !== 1) throw new Error('CANCELLED');
        if (identity !== phase4Identity()) throw new Error('POLICY_CHANGED');
        return enablePack(workspace, id, policyState.policy, {
          approve: true,
          hooks: input.hooks === true,
          agents: input.agents === true,
          disable: input.disable === true,
        });
      }
      case 'packAsset':
        return packAsset(
          store.settings().workspace || data,
          inputText(input.id, 64),
          inputText(input.assetId, 64),
          input.kind,
          policyState.policy,
        );
      case 'packExport': {
        const selected = await dialog.showSaveDialog(window!, {
          title: tm('ส่งออก Skill ไปยังโฟลเดอร์ใหม่'),
          defaultPath: 'exported-skills',
        });
        if (selected.canceled || !selected.filePath) return null;
        return exportPack(store.settings().workspace || data, inputText(input.id, 64), selected.filePath, { approve: true });
      }
      case 'voiceCancel':
        voice.cancel();
        voicePermissionUntil = 0;
        voiceTicketUntil = 0;
        return true;
      case 'voiceInstall': {
        if (!policyState.policy.features.voice) throw new Error('VOICE_DISABLED');
        const consent = await dialog.showMessageBox(window!, {
          type: 'question',
          buttons: [tm('ยกเลิก'), tm('ดาวน์โหลดส่วนเสริมเสียง')],
          defaultId: 0,
          cancelId: 0,
          message: tm('ดาวน์โหลดโมเดลและตัวถอดเสียงที่ผู้ดูแลรับรอง'),
          detail: tm('ระบบตรวจ SHA-256 ก่อนติดตั้ง เสียงถอดข้อความในเครื่อง และคุณตรวจข้อความก่อนส่งให้ AI'),
        });
        if (consent.response !== 1) throw new Error('CANCELLED');
        return voice.install();
      }
      case 'voicePermission': {
        const status = await voice.status();
        if (!status.installed) throw new Error('VOICE_DISABLED');
        const consent = await dialog.showMessageBox(window!, {
          type: 'question',
          buttons: [tm('ยกเลิก'), tm('บันทึกเสียงครั้งนี้')],
          defaultId: 0,
          cancelId: 0,
          message: tm('อนุญาตไมโครโฟนสำหรับคำขอนี้'),
          detail: tm('บันทึกได้ไม่เกิน 60 วินาที คุณตรวจและแก้ข้อความก่อนส่ง'),
        });
        if (consent.response !== 1) throw new Error('CANCELLED');
        voicePermissionUntil = Date.now() + 65_000;
        voiceTicketUntil = Date.now() + 240_000;
        return true;
      }
      case 'voiceTranscribe': {
        if (Date.now() >= voiceTicketUntil || !(input.wav instanceof Uint8Array)) throw new Error('VOICE_APPROVAL_REQUIRED');
        voiceTicketUntil = 0;
        voicePermissionUntil = 0;
        return voice.transcribe(input.wav);
      }
      case 'keyboardSettings': {
        if (typeof input.vimMode !== 'boolean') throw new Error('INVALID_SETTINGS');
        const s = { ...store.settings(), keybindings: validateKeybindings(input.keybindings), vimMode: input.vimMode };
        store.put('settings', 'main', s);
        return s;
      }
      case 'connection': {
        if (
          !validProviders.has(input.provider) ||
          !['api', 'subscription', 'oauth'].includes(input.mode) ||
          (input.provider === 'antigravity' &&
            (input.mode !== 'subscription' ||
              input.apiKey ||
              typeof input.model !== 'string' ||
              !/^gemini-[\w.-]{1,93}$/.test(input.model))) ||
          (input.mode === 'oauth' && !['claude', 'copilot'].includes(input.provider)) ||
          (input.provider === 'claude' && input.mode === 'subscription' && !claudeSubscription)
        )
          throw new Error('INVALID_CONNECTION');
        if (input.provider === 'compatible') {
          if (input.mode !== 'api') throw new Error('INVALID_CONNECTION');
          approvedProfile({ baseUrl: input.baseUrl, protocol: input.protocol, model: input.model }, policyState.policy);
        }
        if (
          input.provider === 'copilot' &&
          (input.mode !== 'oauth' || !policyState.policy.features.copilot || !policyState.policy.providers?.copilot)
        )
          throw new Error('FEATURE_DISABLED');
        const id = input.id ? inputText(input.id, 60) : randomUUID();
        if (input.id && !store.get('connection', id)) throw new Error('CONNECTION_NOT_FOUND');
        // Only a runtime the user picked is stored; the bundled one is resolved each time it is used.
        const previous = store.get<Connection>('connection', id);
        if (connecting.has(id)) throw new Error('CONNECTION_BUSY');
        const googleCloudProject =
          input.googleCloudProject === undefined ? previous?.googleCloudProject || '' : inputText(input.googleCloudProject, 60).trim();
        if (googleCloudProject && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(googleCloudProject))
          throw new Error('GOOGLE_CLOUD_PROJECT_INVALID');
        // Since 18 June 2026 Google serves Gemini sign-in only to Code Assist Standard/Enterprise, which needs a project.
        if (input.provider === 'gemini' && input.mode === 'subscription' && !googleCloudProject)
          throw new Error('GEMINI_PERSONAL_DISCONTINUED');
        if (previous?.claudeAuthStarted && (previous.provider !== input.provider || previous.mode !== input.mode))
          throw new Error('DISCONNECT_REQUIRED');
        const connection: Connection = {
          id,
          provider: input.provider as Provider,
          mode: input.mode,
          model: inputText(input.model || '', 100),
          executable: previous?.customRuntime && previous.provider === input.provider ? previous.executable : '',
          ...(previous?.customRuntime && previous.provider === input.provider ? { customRuntime: true } : {}),
          ...(previous?.claudeAuthStarted ? { claudeAuthStarted: true } : {}),
          ...(input.provider === 'gemini' && input.mode === 'subscription' && googleCloudProject ? { googleCloudProject } : {}),
          ...(input.provider === 'compatible'
            ? { baseUrl: inputText(input.baseUrl, 2000), protocol: input.protocol, label: inputText(input.label || 'Compatible', 120) }
            : {}),
          ready: false,
          note: tm('ยังไม่ได้ทดสอบการเชื่อมต่อ'),
        };
        if (input.apiKey) {
          if (!safeStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
          store.put('secret', id, safeStorage.encryptString(inputText(input.apiKey, 1000)).toString('base64'));
        }
        if (input.mode === 'subscription' || input.mode === 'oauth') store.put('secret', id, null);
        store.put('connection', id, connection);
        return connection;
      }
      case 'runtime': {
        const connection = store.get<Connection>('connection', input.id);
        if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        if (input.reset) {
          connection.executable = '';
          delete connection.customRuntime;
          connection.ready = false;
          connection.note =
            connection.provider === 'antigravity'
              ? 'Use installed Antigravity; connection needs a new test.'
              : tm('ใช้ตัวเชื่อมที่มากับแอป · ยังไม่ได้ทดสอบการเชื่อมต่อ');
          store.put('connection', connection.id, connection);
          return connection;
        }
        const result = await dialog.showOpenDialog(window, {
          properties: ['openFile'],
          filters: [{ name: 'Runtime', extensions: process.platform === 'win32' ? ['exe', 'js', 'mjs'] : ['*'] }],
        });
        if (!result.canceled) {
          await checkRuntime(connection.provider, result.filePaths[0]);
          connection.executable = result.filePaths[0];
          connection.customRuntime = true;
          connection.ready = false;
          connection.note = tm('ใช้ตัวเชื่อมที่เลือกเอง · ยังไม่ได้ทดสอบการเชื่อมต่อ');
          store.put('connection', connection.id, connection);
        }
        return connection;
      }
      case 'connect': {
        const connection = store.get<Connection>('connection', input.id);
        if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        if (connection.provider === 'claude' && connection.mode === 'subscription' && !claudeSubscription)
          throw new Error('FEATURE_DISABLED');
        if (connecting.has(connection.id)) throw new Error('CONNECTION_BUSY');
        connecting.add(connection.id);
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 480_000);
        connectControllers.set(connection.id, controller);
        const dropCode = () => {
          authCodes.get(connection.id)?.(null);
          authCodes.delete(connection.id);
          emit({ sessionId: '', type: 'auth-code-close', connectionId: connection.id });
        };
        delete connection.signedIn;
        try {
          if (connection.provider === 'gemini' && connection.mode === 'subscription' && !connection.googleCloudProject)
            throw new Error('GEMINI_PERSONAL_DISCONTINUED');
          // Claude Console OAuth needs Anthropic's ant CLI; install the pinned official release when it is missing.
          if (connection.provider === 'claude' && connection.mode === 'oauth' && !(await findAnt()))
            await installAnt(
              text => emit({ sessionId: '', type: 'connect-progress', connectionId: connection.id, text }),
              controller.signal,
            );
          if (connection.provider === 'copilot') {
            if (!policyState.policy.features.copilot || !policyState.policy.providers?.copilot) throw new Error('FEATURE_DISABLED');
            if (!safeStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
            const currentPolicy = policyState.policy;
            const token = await copilotDeviceLogin(currentPolicy.providers!.copilot!.clientId, controller.signal, async (code, url) => {
              emit({
                sessionId: '',
                type: 'connect-progress',
                connectionId: connection.id,
                text: tm('GitHub: ใส่รหัส {0} ในหน้าที่เปิด', code),
              });
              await shell.openExternal(url);
            });
            if (controller.signal.aborted || currentPolicy !== policyState.policy) throw new Error('CANCELLED');
            store.put('secret', connection.id, safeStorage.encryptString(token).toString('base64'));
            connection.signedIn = true;
          }
          const connectionRuntime = await runtime(connection);
          if (connection.provider === 'claude' && connection.mode === 'subscription') {
            connection.claudeAuthStarted = true;
            store.put('connection', connection.id, connection);
          }
          await signInAndTest(
            connection,
            {
              runtime: connectionRuntime,
              progress: text => emit({ sessionId: '', type: 'connect-progress', connectionId: connection.id, text }),
              openExternal: url => shell.openExternal(url),
              askForCode: () =>
                new Promise(resolveCode => {
                  authCodes.set(connection.id, resolveCode);
                  emit({ sessionId: '', type: 'auth-code', connectionId: connection.id });
                }),
              dropCode,
              signedIn: () => {
                connection.signedIn = true;
              },
            },
            controller.signal,
          );
          emit({ sessionId: '', type: 'connect-progress', connectionId: connection.id, text: tm('กำลังโหลดรายชื่อโมเดล') });
          connection.ready = true;
          connection.note = tm('ผ่านการเชื่อมต่อและรับคำตอบบนเครื่องนี้แล้ว');
          try {
            await refreshModels(connection);
          } catch {
            /* The connection works; the model list can be reloaded later. */
          }
        } catch (error) {
          const code = errorCode(error),
            detail = ((error as any)?.detail || []) as string[];
          diagnose('connect-failed', {
            provider: connection.provider,
            mode: connection.mode,
            code,
            detail: detail.join(' | ').slice(0, 1200),
          });
          connection.ready = false;
          connection.note = connectFailureNote(code);
        } finally {
          clearTimeout(timer);
          dropCode();
          connecting.delete(connection.id);
          connectControllers.delete(connection.id);
        }
        store.put('connection', connection.id, connection);
        return connection;
      }
      case 'cancelConnect': {
        connectControllers.get(inputText(input.id, 60))?.abort();
        return true;
      }
      case 'authCode': {
        const id = inputText(input.id, 60),
          resolveCode = authCodes.get(id);
        if (!resolveCode) throw new Error('LOGIN_FAILED');
        const code = typeof input.code === 'string' ? input.code.trim() : '';
        if (code && (code.length > 4096 || !/^[\w\-/.~%#]+$/.test(code))) throw new Error('INVALID_INPUT');
        authCodes.delete(id);
        resolveCode(code || null);
        return true;
      }
      case 'skills':
        return skillCatalog.loadSkillCatalog(root);
      case 'tour': {
        const s = { ...store.settings(), tourDone: input.done === true };
        store.put('settings', 'main', s);
        return s;
      }
      // Only fixed help pages open in the browser; nothing from the renderer becomes a URL.
      case 'claudeCode':
        return { installed: Boolean(await findClaudeCode()) };
      case 'anthropicCli':
        return { installed: Boolean(await findAnt()), installable: Boolean(antComponentSpec()), installing: installingAnt };
      case 'anthropicCliInstall':
        await installAnt(text => emit({ sessionId: '', type: 'install', text }));
        return { installed: Boolean(await findAnt()) };
      case 'handoff': {
        // Hands a request to the employee's own Claude Code (see handoff.ts). The privacy gate still applies.
        const text = inputText(input.text),
          claude = await findClaudeCode();
        if (!text.trim()) throw new Error('INVALID_INPUT');
        if (!claude) throw new Error('CLAUDE_CODE_NOT_FOUND');
        if (service.review(text, '').action === 'block-external') throw new Error('PRIVACY_REVIEW_REQUIRED');
        const name = input.skill ? inputText(input.skill, 80) : '';
        const skill = name ? (await skillCatalog.loadSkillCatalog(root)).find((s: any) => s.name === name && s.path) : undefined;
        if (name && !skill) throw new Error('SKILL_NOT_FOUND');
        clipboard.writeText(handoffText(harness.privacy(text).redactedText, skill && { name: skill.name, file: join(root, skill.path) }));
        const workspace = store.settings().workspace,
          cwd = workspace && existsSync(workspace) ? workspace : root;
        await openClaudeCode(claude, cwd);
        diagnose('handoff', { skill: skill ? 'yes' : 'no' });
        return { cwd };
      }
      case 'openHelp': {
        const pages: Record<string, string> = {
          python: 'https://www.python.org/downloads/',
          antigravity: 'https://antigravity.google/docs/cli/install/',
          claudeCode: 'https://code.claude.com/docs/en/setup',
          anthropicCli: 'https://platform.claude.com/docs/en/cli-sdks-libraries/cli/quickstart',
          tesseract: 'https://tesseract-ocr.github.io/tessdoc/Installation.html',
        };
        const url = pages[input.topic];
        if (!url) throw new Error('INVALID_INPUT');
        await shell.openExternal(url);
        return true;
      }
      case 'ocrInstall': {
        if (installing) throw new Error('INSTALL_BUSY');
        installing = true;
        try {
          ocr.stop();
          await installOcr(
            defaultOcrFolder,
            ocrHome,
            line => emit({ sessionId: '', type: 'install', text: line }),
            input.crosscheck === true,
            input.handwriting === true,
          );
        } catch (error) {
          diagnose('ocr-install-failed', { code: errorCode(error) });
          throw error;
        } finally {
          installing = false;
        }
        return ocr.status();
      }
      case 'ocrStatus': {
        const status = await ocr.status();
        const managed = existsSync(ocrPython(ocrHome));
        const current = !managed || (await ocrComponentCurrent(defaultOcrFolder, ocrHome));
        return {
          ...status,
          running: status.running && current,
          installed: status.installed && current,
          updateAvailable: managed && status.installed && !current,
          installing,
        };
      }
      case 'ocrFolder': {
        const picked = await dialog.showOpenDialog(window, { title: tm('เลือกโฟลเดอร์ local-thai-ocr'), properties: ['openDirectory'] });
        if (picked.canceled) return ocr.status();
        if (!isOcrFolder(picked.filePaths[0])) throw new Error('OCR_FOLDER_INVALID');
        store.put('settings', 'main', { ...store.settings(), ocrDir: picked.filePaths[0] });
        return ocr.status();
      }
      case 'ocrStart':
        return ocr.start();
      case 'ocrRead': {
        const health = await ocr.health();
        if (!health.running) throw new Error('OCR_UNAVAILABLE');
        const picked = await dialog.showOpenDialog(window, {
          title: tm('เลือกใบเสร็จ'),
          properties: ['openFile'],
          filters: [{ name: 'Receipts', extensions: OCR_EXTENSIONS }],
        });
        if (picked.canceled) return null;
        const path = picked.filePaths[0],
          read = await ocr.recognize(path, health.crosscheck, health.tesseract, health.handwriting);
        // Show the receipt beside its fields; formats Chromium cannot draw (PDF, TIFF) fall back to text only.
        const type = previewTypes[read.extension];
        const preview = type && read.bytes.length <= 8 * 1024 * 1024 ? `data:${type};base64,${read.bytes.toString('base64')}` : '';
        return { name: basename(path), preview, result: read.result };
      }
      case 'ocrResolve': {
        if (service.activeCount() >= MAX_PARALLEL_RUNS || ocrResolving) throw new Error('RUN_LIMIT');
        const connection = store.get<Connection>('connection', inputText(input.connectionId, 80));
        if (!connection?.ready) throw new Error('CONNECTION_NOT_READY');
        if (connecting.has(connection.id)) throw new Error('CONNECTION_BUSY');
        const rawMapping = input.mapping;
        if (!rawMapping || typeof rawMapping !== 'object' || Array.isArray(rawMapping)) throw new Error('INVALID_INPUT');
        const serialized = JSON.stringify(rawMapping);
        if (serialized.length > 120_000) throw new Error('INPUT_LIMIT');

        const settings = store.settings();
        if (!settings.ocrAiConsentedAt) {
          const answer = await dialog.showMessageBox(window, {
            type: 'question',
            title: tm('ให้ AI ช่วยกรองผล OCR'),
            message: tm('ส่งเฉพาะข้อความ OCR ที่ปิดบังข้อมูลอ่อนไหวแล้วให้ AI ช่วยเลือก candidate หรือระบุว่าไม่แน่ใจ'),
            detail: tm(
              'จะไม่ส่งภาพใบเสร็จ และ AI ไม่มีสิทธิสร้างยอดเงิน เลขภาษี หรือเลขเอกสารใหม่ ระบบยอมรับได้เฉพาะ candidate token ที่ OCR สร้างไว้เท่านั้น',
            ),
            buttons: [tm('ยกเลิก'), tm('ใช้ AI กรอง')],
            defaultId: 1,
            cancelId: 0,
          });
          if (answer.response !== 1) return { cancelled: true };
          store.put('settings', 'main', { ...settings, ocrAiConsentedAt: new Date().toISOString() });
        }

        let blockedByPrivacy = false;
        const sanitize = (value: string) => {
          const scan = harness.privacy(value);
          if (scan.action === 'block-external') blockedByPrivacy = true;
          return scan.redactedText;
        };
        const resolver = buildReceiptAiResolver(rawMapping, sanitize);
        if (blockedByPrivacy) throw new Error('PRIVACY_REVIEW_REQUIRED');
        if (!resolver.fields.length) throw new Error('INVALID_INPUT');

        ocrResolving = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        try {
          const current = await runtime(connection);
          const response = await current.adapter.run(resolver.prompt, connection, {
            ...current.context,
            signal: controller.signal,
            emit: () => {},
          });
          const decisions = resolveReceiptAiResponse(response, resolver.tokens, resolver.fields);
          diagnose('ocr-ai-filter', { provider: connection.provider, decisions: String(decisions.length) });
          return { decisions };
        } catch (error) {
          diagnose('ocr-ai-filter-failed', { provider: connection.provider, code: errorCode(error) });
          if (controller.signal.aborted) throw new Error('RUN_TIMEOUT');
          throw error;
        } finally {
          clearTimeout(timeout);
          ocrResolving = false;
        }
      }
      case 'ocrSave': {
        const text = JSON.stringify(input.draft ?? null, null, 2);
        if (!input.draft || typeof input.draft !== 'object' || text.length > 2_000_000) throw new Error('INVALID_INPUT');
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const saved = await dialog.showSaveDialog(window, {
          title: tm('บันทึกร่างการตรวจใบเสร็จ'),
          defaultPath: join(store.settings().workspace || app.getPath('documents') || tmpdir(), `receipt-review-${date}.json`),
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (saved.canceled || !saved.filePath) return null;
        await writeFile(saved.filePath, text, 'utf8');
        exportPaths.add(saved.filePath);
        return { path: saved.filePath };
      }
      case 'disconnect': {
        const c = store.get<Connection>('connection', input.id);
        if (!c) throw new Error('CONNECTION_NOT_FOUND');
        if (connecting.has(c.id)) throw new Error('RUN_ALREADY_ACTIVE');
        for (const session of store.list<any>('session')) if (session.connectionId === c.id) service.cancel(session.id);
        if (c.provider === 'claude' && c.mode === 'subscription' && c.claudeAuthStarted) {
          const r = await runtime(c, true);
          await claudeLogout(c.executable, r.context);
          delete c.claudeAuthStarted;
        }
        if (c.provider === 'claude' && c.mode === 'oauth') {
          const r = await runtime(c, true);
          if (!r.authExecutable) throw new Error('ANTHROPIC_CLI_NOT_FOUND');
          await anthropicLogout(r.authExecutable, r.context);
        }
        if (c.provider === 'openai') {
          const r = await runtime(c, true);
          await signOutManagedProvider(c, r).catch(error =>
            diagnose('provider-logout-failed', { provider: c.provider, code: errorCode(error) }),
          );
        }
        delete c.signedIn;
        // Signing out removes this connection's sign-in data (Google or ChatGPT tokens in its runtime home).
        await removeRuntimeHome(c.id);
        c.ready = false;
        c.note =
          c.provider === 'antigravity'
            ? 'Disconnected from STeP. The native Google account remains signed in to Antigravity.'
            : tm('ออกจากระบบแล้ว กดเชื่อมต่อและทดสอบเพื่อลงชื่อใหม่');
        delete c.models;
        delete c.modelsAt;
        store.put('connection', c.id, c);
        store.put('secret', c.id, null);
        return c;
      }
      case 'removeConnection': {
        const c = store.get<Connection>('connection', inputText(input.id, 60));
        if (!c) throw new Error('CONNECTION_NOT_FOUND');
        if (connecting.has(c.id)) throw new Error('CONNECTION_BUSY');
        const sessions = store.list<Session>('session').filter(session => session.connectionId === c.id);
        if (sessions.some(session => service.isActive(session.id))) throw new Error('RUN_ALREADY_ACTIVE');
        if (c.provider === 'claude' && c.mode === 'subscription' && c.claudeAuthStarted) {
          const r = await runtime(c, true);
          await claudeLogout(c.executable, r.context);
        }
        if (c.provider === 'claude' && c.mode === 'oauth') {
          const r = await runtime(c, true);
          if (!r.authExecutable) throw new Error('ANTHROPIC_CLI_NOT_FOUND');
          await anthropicLogout(r.authExecutable, r.context);
        }
        if (c.provider === 'openai') {
          const r = await runtime(c, true);
          await signOutManagedProvider(c, r).catch(error =>
            diagnose('provider-logout-failed', { provider: c.provider, code: errorCode(error) }),
          );
        }
        await removeRuntimeHome(c.id);
        store.remove('connection', c.id);
        store.remove('secret', c.id);
        // Work stays; it asks for another AI the next time it is used.
        for (const session of sessions) {
          session.connectionId = '';
          store.put('session', session.id, session);
        }
        diagnose('connection-removed', { provider: c.provider, mode: c.mode });
        return true;
      }
      case 'sessionConnection': {
        const session = store.session(inputText(input.id, 60));
        if (service.isActive(session.id)) throw new Error('RUN_ALREADY_ACTIVE');
        const c = store.get<Connection>('connection', inputText(input.connectionId, 60));
        if (!c) throw new Error('CONNECTION_NOT_FOUND');
        if (session.connectionId !== c.id) {
          session.connectionId = c.id;
          delete session.model;
          delete session.effort;
          store.put('session', session.id, session);
        }
        return session;
      }
      case 'create': {
        const connection = store.get<Connection>('connection', input.connectionId);
        if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        const session = store.create(connection.id, store.settings().team, inputText(input.project || '', 80));
        const started = await fireHook({ event: 'session_start', sessionId: session.id });
        if (started.blocked) {
          store.remove('session', session.id);
          throw new Error('HOOK_BLOCKED');
        }
        if (input.model !== undefined || input.effort) {
          session.model = modelChoice(connection, input.model);
          session.effort = effortChoice(connection, session.model ?? connection.model, input.effort);
          store.save(session);
        }
        return session;
      }
      case 'models': {
        const connection = store.get<Connection>('connection', input.id);
        if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        if (connecting.has(connection.id)) throw new Error('CONNECTION_BUSY');
        connecting.add(connection.id);
        try {
          await refreshModels(connection);
        } catch {
          throw new Error('MODEL_LIST_FAILED');
        } finally {
          connecting.delete(connection.id);
        }
        store.put('connection', connection.id, connection);
        return connection;
      }
      case 'model': {
        const session = store.session(inputText(input.id, 60)),
          connection = store.get<Connection>('connection', session.connectionId);
        if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        session.model = modelChoice(connection, input.model);
        session.effort = effortChoice(connection, session.model, input.effort);
        store.save(session);
        return session;
      }
      case 'send': {
        const id = inputText(input.id, 60),
          text = inputText(input.text);
        const sending = store.session(id);
        if (service.isActive(id) || coordinator.has(id)) throw new Error('RUN_ALREADY_ACTIVE');
        if (service.activeCount() >= MAX_PARALLEL_RUNS) throw new Error('RUN_LIMIT');
        const sendingConnection = store.get<Connection>('connection', sending.connectionId);
        if (!sendingConnection?.ready) throw new Error('CONNECTION_NOT_READY');
        const mode = input.mode === 'image' || input.mode === 'chat' || input.mode === 'draft' ? input.mode : 'draft';
        const workMode = mode === 'chat' && input.autoImage !== false && isImageRequest(text) ? 'image' : mode;
        const coordinated = input.coordinator === true;
        if (coordinated && (!policyState.policy.features.coordinator || workMode !== 'draft' || input.skill || input.retry))
          throw new Error('COORDINATOR_DISABLED');
        if (workMode === 'image' && (sendingConnection.mode !== 'api' || sendingConnection.provider === 'claude'))
          throw new Error('IMAGE_API_REQUIRED');
        const selectedImageModel = input.imageModel ? inputText(input.imageModel, 120) : undefined;
        // A directly invoked Skill must be one the router can reach.
        const skill = input.skill ? inputText(input.skill, 80) : '';
        if (skill && !(await skillCatalog.loadSkillCatalog(root)).some((s: any) => s.name === skill && s.inRouter))
          throw new Error('SKILL_NOT_ROUTED');
        if (Array.isArray(input.attachments) && input.attachments.length > 1) throw new Error('ONE_SOURCE_PER_RUN');
        const selected: { view: Attachment; text: string; sessionId: string; image?: VisionInput }[] = (
          Array.isArray(input.attachments) ? input.attachments : []
        ).map((aid: string) => {
          const a = attachments.get(aid);
          if (!a || !a.view.usable || a.sessionId !== id) throw new Error('ATTACHMENT_NOT_APPROVED');
          return a;
        });
        if (selected.some(a => a.image) && !policyState.policy.features.vision) throw new Error('VISION_DISABLED');
        if (selected.some(a => a.image) && workMode === 'image') throw new Error('VISION_UNAVAILABLE');
        if (coordinated && selected.some(a => a.image)) throw new Error('VISION_UNAVAILABLE');
        const attachmentText = selected.map((a: any) => a.text).join('\n\n');
        const sourceText = typeof input.sourceText === 'string' ? inputText(input.sourceText, 100_000) : '';
        const combinedSource = [sourceText, attachmentText].filter(Boolean).join('\n\n---\n\n');
        if (combinedSource.length > 100_000) throw new Error('INPUT_LIMIT');
        // Only juristic-person numbers (13 digits starting with 0) that the person checked may stay unmasked.
        const allowIds = (Array.isArray(input.allowIdentifiers) ? input.allowIdentifiers : [])
          .map((v: unknown) => String(v).replace(/\D/g, ''))
          .filter((v: string) => /^0\d{12}$/.test(v))
          .slice(0, 3);
        if (allowIds.length) {
          const s = store.session(id);
          s.allowedIdentifiers = [...new Set([...(s.allowedIdentifiers || []), ...allowIds])].slice(-5);
          store.put('session', s.id, s);
        }
        const review = service.review(text, combinedSource, store.session(id).allowedIdentifiers || []);
        if (review.action === 'block-external') throw new Error('PRIVACY_REVIEW_REQUIRED');
        // Ask only when it adds information: the first send on this computer, a new attachment, or a privacy review signal.
        const flagged = review.action === 'human-confirm';
        const first = !store.settings().consentedAt;
        if (first || selected.length || sourceText || flagged || coordinated) {
          // The in-app dialog answers with a one-time token bound to this exact request, so a later edit needs a new answer.
          const sourceDigest = sourceText ? createHash('sha256').update(sourceText).digest('hex') : '';
          const fingerprint = createHash('sha256')
            .update(
              [
                id,
                text,
                skill,
                workMode,
                input.imageModel || '',
                String(coordinated),
                sourceDigest,
                ...selected.map((a: any) => a.view.id),
              ].join('\0'),
            )
            .digest('hex');
          const token = typeof input.consent === 'string' ? input.consent : '';
          if (!token || consents.get(token) !== fingerprint) {
            const issued = randomUUID();
            consents.set(issued, fingerprint);
            if (consents.size > 20) consents.delete(consents.keys().next().value!);
            return {
              consent: {
                token: issued,
                first,
                flagged,
                labels: review.labels,
                attachment: selected.length > 0,
                vision: selected.some(a => Boolean(a.image)),
                source: Boolean(sourceText),
              },
            };
          }
          consents.delete(token);
          const s = store.session(id);
          if (!s.consentedAt) {
            s.consentedAt = new Date().toISOString();
            store.save(s);
          }
          if (!store.settings().consentedAt) store.put('settings', 'main', { ...store.settings(), consentedAt: new Date().toISOString() });
        }
        if (service.isActive(id) || coordinator.has(id)) throw new Error('RUN_ALREADY_ACTIVE');
        if (service.activeCount() >= MAX_PARALLEL_RUNS) throw new Error('RUN_LIMIT');
        // Organization hooks see the masked request only, never attachments or credentials.
        const submitted = await fireHook({
          event: 'user_prompt_submit',
          sessionId: id,
          promptChars: text.length,
          mode: workMode,
          files: selected.length,
        });
        if (submitted.blocked) {
          diagnose('prompt-blocked', { code: 'HOOK_BLOCKED' });
          throw new Error('HOOK_BLOCKED');
        }
        const queued = store.session(id);
        queued.status = 'queued';
        store.save(queued);
        void (
          coordinated
            ? coordinator.run(id, text, combinedSource)
            : service.run(
                id,
                text,
                combinedSource,
                true,
                skill || undefined,
                workMode,
                selectedImageModel,
                [
                  ...selected.map((a: any) => a.view.name),
                  // Reviewed text handed over by an in-app tool (Terminal, Browser, Files) or the receipt page.
                  ...(sourceText ? ['ผลจากเครื่องมือในแอป'] : []),
                ],
                { retry: input.retry === true, images: selected.flatMap(a => (a.image ? [a.image] : [])) },
              )
        ).catch(error => {
          diagnose('run-rejected', { code: errorCode(error) });
          const failed = store.session(id);
          failed.status = error.message === 'CANCELLED' ? 'interrupted' : 'error';
          if (failed.messages.at(-1)?.text !== errorCode(error))
            failed.messages.push({ role: 'status', text: errorCode(error), at: new Date().toISOString() });
          store.save(failed);
          emit({ sessionId: id, type: 'status', text: /^[A-Z_]+$/.test(error.message) ? error.message : 'RUN_FAILED' });
          emit({ sessionId: id, type: 'changed' });
        });
        for (const a of selected) attachments.delete(a.view.id);
        // Without a dialog, the person still learns what was masked before sending.
        return { started: true, mode: workMode, masked: review.labels };
      }
      case 'cancel':
        coordinator.cancel(input.id);
        service.cancel(input.id);
        return true;
      // Pin and rename are view metadata: keep updatedAt so the list order does not jump.
      case 'pin': {
        const s = store.session(inputText(input.id, 60));
        s.pinned = input.pinned === true;
        store.put('session', s.id, s);
        return s;
      }
      case 'rename': {
        const s = store.session(inputText(input.id, 60)),
          title = inputText(input.title, 120).trim();
        if (!title) throw new Error('INVALID_INPUT');
        s.title = title;
        store.put('session', s.id, s);
        return s;
      }
      case 'remove': {
        const id = inputText(input.id, 60);
        store.session(id);
        if (service.isActive(id) || coordinator.has(id)) throw new Error('RUN_ALREADY_ACTIVE');
        const ended = await fireHook({ event: 'session_end', sessionId: id });
        if (ended.blocked) throw new Error('HOOK_BLOCKED');
        store.remove('session', id);
        for (const [aid, a] of attachments) if (a.sessionId === id) attachments.delete(aid);
        return true;
      }
      case 'edit':
        return store.edit(inputText(input.id, 60), inputText(input.text, 150000), input.revision, input.document);
      case 'accept':
        return store.accept(input.id, input.proposalId);
      case 'reject': {
        const s = store.session(input.id);
        s.proposals = s.proposals.filter(p => p.id !== input.proposalId);
        store.save(s);
        return s;
      }
      case 'restore': {
        const s = store.session(input.id),
          version = s.versions.find(v => v.revision === input.revision);
        if (!version) throw new Error('VERSION_NOT_FOUND');
        return store.edit(s.id, version.text, s.revision, version.document);
      }
      case 'attach': {
        const sessionId = inputText(input.id, 60);
        store.session(sessionId);
        const vision = input.vision === true;
        if (vision && !policyState.policy.features.vision) throw new Error('VISION_DISABLED');
        const result = await dialog.showOpenDialog(window, {
          properties: ['openFile'],
          filters: [
            {
              name: 'Documents and images',
              extensions: vision ? ['png', 'jpg', 'jpeg', 'webp'] : ['txt', 'md', 'csv', 'tsv', 'pdf', 'docx', ...OCR_EXTENSIONS],
            },
          ],
        });
        if (result.canceled) return null;
        const path = result.filePaths[0],
          extension = extname(path).slice(1).toLowerCase();
        let report: any = await harness.documentPrivacy(path, { includeRedacted: true }),
          image: VisionInput | undefined;
        const scanNeeded =
          OCR_EXTENSIONS.includes(extension) &&
          (vision || extension !== 'pdf' || ['ATTACH_NO_TEXT', 'ATTACH_PAGES_WITHOUT_TEXT'].includes(attachmentReason(report) || ''));
        if (scanNeeded && report.action !== 'block-external') {
          const health = await ocr.health();
          if (!health.running && (vision || extension !== 'pdf')) throw new Error('OCR_UNAVAILABLE');
          if (health.running) {
            const read = await ocr.recognize(path, health.crosscheck, health.tesseract, health.handwriting);
            report = ocrAttachmentReport(read.result, harness.privacy);
            // Text redaction cannot mask pixels. Flagged OCR forbids sending the original image.
            if (vision && (report.action !== 'pass' || report.containsPersonalData)) report.action = 'block-external';
            if (vision && !attachmentReason(report)) {
              if (read.bytes.length > 4_000_000) throw new Error('ATTACH_TOO_LARGE');
              const mime = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
              const valid =
                mime === 'image/png'
                  ? read.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                  : mime === 'image/jpeg'
                    ? read.bytes[0] === 255 && read.bytes[1] === 216
                    : read.bytes.subarray(0, 4).toString() === 'RIFF' && read.bytes.subarray(8, 12).toString() === 'WEBP';
              if (!valid) throw new Error('ATTACH_UNSUPPORTED');
              image = { mime, data: read.bytes.toString('base64') };
            }
          }
        }
        // The reason travels with the chip; the window refuses to send while any chip cannot be sent.
        const reason = attachmentReason(report);
        const usable = !reason;
        const view: Attachment = {
          id: randomUUID(),
          name: basename(path),
          status: usable
            ? image
              ? tm('ส่งภาพต้นฉบับพร้อมข้อความ OCR · ตรวจภาพก่อนยืนยัน')
              : report.ocr
                ? tm('อ่านข้อความด้วย OCR · ตรวจความถูกต้องก่อนส่ง')
                : tm('ตรวจข้อความแล้ว · ต้องทบทวนก่อนส่ง')
            : tm('ส่งไฟล์นี้ให้ AI ไม่ได้'),
          preview: usable ? report.redactedText : '',
          usable,
          ...(image ? { vision: true, imagePreview: `data:${image.mime};base64,${image.data}` } : {}),
          ...(reason ? { reason } : {}),
        };
        if (reason) diagnose('attach-refused', { reason, extension: extname(path).toLowerCase().slice(0, 8) });
        attachments.set(view.id, { view, text: usable ? report.redactedText : '', sessionId, image });
        return view;
      }
      case 'export': {
        const s = store.session(input.id),
          format = input.format;
        if (!exportFormats.includes(format) || !s.draft.trim()) throw new Error('INVALID_EXPORT');
        if (actions.evaluateActionGate(draftExportAction).status !== 'allowed') throw new Error('ACTION_BLOCKED');
        const workspace = store.settings().workspace;
        if (!workspace || !(await stat(workspace)).isDirectory()) throw new Error('WORKSPACE_REQUIRED');
        const result = await harness.nextOutput({ workspaceDir: workspace, team: s.team, title: s.title, extension: format });
        await exportDocument(
          result.path,
          format,
          s.draft,
          async html => {
            const print = new BrowserWindow({
              show: false,
              webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
            });
            try {
              await print.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
              return await print.webContents.printToPDF({
                printBackground: true,
                pageSize: 'A4',
                margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
              });
            } finally {
              print.destroy();
            }
          },
          s.document,
        );
        exportPaths.add(result.path);
        return result;
      }
      case 'reveal': {
        if (!exportPaths.has(input.path)) throw new Error('INVALID_PATH');
        shell.showItemInFolder(input.path);
        return true;
      }
      default:
        throw new Error('UNKNOWN_OPERATION');
    }
  });
  // Set the theme before the first paint so a dark-theme user never sees a light flash.
  nativeTheme.themeSource = store.settings().theme;
  await makeWindow();
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => {
    if (mainFrame) {
      approvals.close();
      questions.close();
    }
  });
  window.webContents.on('render-process-gone', () => {
    approvals.close();
    questions.close();
  });
  app.on('second-instance', () => {
    window.show();
    window.focus();
  });
  let closing = false;
  app.on('before-quit', event => {
    approvals.close();
    questions.close();
    voice.cancel();
    voicePermissionUntil = 0;
    voiceTicketUntil = 0;
    unwatchFile(policyState.path);
    service.cancelAll();
    coordinator.cancelAll();
    automations.stop();
    if (closing) return;
    event.preventDefault();
    closing = true;
    for (const browser of browsers.values()) browser.destroy();
    agentBrowser.close();
    void Promise.allSettled([
      voice.close(),
      workbench.close(),
      service.closeAndWait(),
      coordinator.closeAndWait(),
      automations.closeAndWait(),
      mcp.close(),
      sandbox.close(),
    ]).finally(() => app.quit());
  });
  app.on('will-quit', () => store.close());
}
app.on('window-all-closed', () => app.quit());
main().catch(error => {
  diagnose('startup-failed', { code: errorCode(error), message: String(error instanceof Error ? error.message : error).slice(0, 300) });
  dialog.showErrorBox('STeP Desktop', tm('เปิดแอปไม่สำเร็จ กรุณาตรวจชุดติดตั้ง'));
  app.quit();
});
