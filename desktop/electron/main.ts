import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, nativeTheme, clipboard, session as electronSession } from 'electron';
import { mkdir, writeFile, stat, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Store } from './store';
import { WorkService, type Harness } from './service';
import { adapter, listModels } from './providers';
import { errorCode } from './diagnostics';
import { connectFailureNote, signInAndTest, signOutManagedProvider } from './connect';
import { checkRuntime, resolveRuntime } from './runtimes';
import { exportDocument, exportFormats } from './export';
import { draftExportAction } from './actions';
import { OcrService, OCR_EXTENSIONS, isOcrFolder, ocrPython } from './ocr';
import { installOcr, ocrComponentCurrent } from './components';
import { buildReceiptAiResolver, resolveReceiptAiResponse } from './receipt-ai';
import { findClaudeCode, handoffText, openClaudeCode } from './handoff';
import { resolveClaudeRuntime, claudeLogout } from './claude-auth';
import { findAnthropicCli, resolveAnthropicCli, anthropicLogout } from './anthropic-auth';
import { existsSync } from 'node:fs';
import type { Attachment, Connection, Provider, Session, Settings } from '../src/types';

let window: BrowserWindow, store: Store, service: WorkService;
const attachments = new Map<string, { view: Attachment; text: string; sessionId: string }>();
const exportPaths = new Set<string>();
const connecting = new Set<string>();
const authCodes = new Map<string, (code: string | null) => void>();
const consents = new Map<string, string>();
const connectControllers = new Map<string, AbortController>();
let busy = false;
let ocrResolving = false;
const validProviders = new Set(['openai', 'claude', 'gemini']);
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
      message: 'มีร่างที่ยังไม่บันทึก',
      detail: 'กลับไปบันทึกร่างก่อนปิด หรือเลือกปิดโดยไม่บันทึก',
      buttons: ['กลับไปบันทึก', 'ปิดโดยไม่บันทึก'],
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
  await mkdir(data, { recursive: true });
  await mkdir(join(data, 'logs'), { recursive: true });
  logFile = join(data, 'logs', 'diagnostics.jsonl');
  // The renderer only needs notifications; camera, microphone, location and the rest stay denied.
  electronSession.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'notifications'));
  electronSession.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === 'notifications');
  store = new Store(join(data, 'workspace.sqlite'));
  const [routing, routerPolicy, privacy, documents, outputs, skillCatalog] = await Promise.all([
    import(pathToFileURL(join(root, 'src/modules/router/service.js')).href),
    import(pathToFileURL(join(root, 'src/modules/router/index.js')).href),
    import(pathToFileURL(join(root, 'src/modules/privacy/index.js')).href),
    import(pathToFileURL(join(root, 'src/modules/privacy/document.js')).href),
    import(pathToFileURL(join(root, 'src/modules/output-manager.js')).href),
    import(pathToFileURL(join(root, 'src/modules/skills/catalog.js')).href),
  ]);
  const harness: Harness = {
    memoryDir: () => store.settings().workspace || app.getPath('userData'),
    root,
    route: routing.queryStepRouter,
    contextPolicy: routerPolicy.classifyContextPolicy,
    privacy: privacy.evaluatePrivacyGate,
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
  async function runtime(connection: Connection, signOut = false) {
    if (connection.provider === 'claude' && connection.mode === 'subscription' && !claudeSubscription && !signOut)
      throw new Error('FEATURE_DISABLED');
    connection.executable = resolveRuntime(connection);
    const home = join(data, 'runtimes', connection.id),
      cwd = join(home, 'workspace');
    await mkdir(cwd, { recursive: true });
    await mkdir(join(home, '.gemini'), { recursive: true });
    // Isolate runtime configuration from personal MCP servers, plugins, and files.
    const geminiAuthType = connection.provider === 'gemini' ? (connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal') : undefined;
    await writeFile(
      join(home, '.gemini', 'settings.json'),
      JSON.stringify({
        tools: { core: [] },
        mcpServers: {},
        telemetry: { enabled: false },
        context: { fileName: '__STEP_NO_CONTEXT__' },
        ...(geminiAuthType ? { security: { auth: { selectedType: geminiAuthType, enforcedType: geminiAuthType } } } : {}),
      }),
    );
    await writeFile(
      join(home, 'config.toml'),
      'web_search = "disabled"\ncli_auth_credentials_store = "file"\n[features]\nshell_tool = false\nplugins = false\nremote_plugin = false\nplugin_sharing = false\napps = false\ngoals = false\n',
    );
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      HOME: home,
      USERPROFILE: home,
      APPDATA: home,
      LOCALAPPDATA: home,
      CODEX_HOME: home,
      GEMINI_CLI_HOME: home,
      GOOGLE_CLOUD_PROJECT: connection.provider === 'gemini' ? connection.googleCloudProject : undefined,
      GOOGLE_CLOUD_PROJECT_ID: connection.provider === 'gemini' ? connection.googleCloudProject : undefined,
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
      ANTHROPIC_CONFIG_DIR: connection.provider === 'claude' && connection.mode === 'oauth' ? join(home, '.anthropic') : undefined,
    };
    let authExecutable: string | undefined;
    if (connection.provider === 'claude' && connection.mode === 'subscription') {
      await mkdir(env.CLAUDE_CONFIG_DIR!, { recursive: true });
      connection.executable = await resolveClaudeRuntime({ cwd, env });
    }
    if (connection.provider === 'claude' && connection.mode === 'oauth') {
      await mkdir(env.ANTHROPIC_CONFIG_DIR!, { recursive: true });
      authExecutable = await resolveAnthropicCli({ cwd, env });
    }
    return { adapter: adapter(connection.provider), context: { cwd, env, key: await key(connection) }, authExecutable };
  }
  service = new WorkService(store, harness, runtime, event => {
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
    emit(event);
  });
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
    features: { claudeSubscription },
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
      case 'snapshot':
        return snapshot();
      case 'workspace': {
        const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] });
        if (!result.canceled) {
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
        };
        store.put('settings', 'main', s);
        nativeTheme.themeSource = theme;
        await writeUserMemory().catch(error => diagnose('user-memory-failed', { code: errorCode(error) }));
        return s;
      }
      case 'connection': {
        if (
          !validProviders.has(input.provider) ||
          !['api', 'subscription', 'oauth'].includes(input.mode) ||
          (input.mode === 'oauth' && input.provider !== 'claude') ||
          (input.provider === 'claude' && input.mode === 'subscription' && !claudeSubscription)
        )
          throw new Error('INVALID_CONNECTION');
        const id = input.id ? inputText(input.id, 60) : randomUUID();
        if (input.id && !store.get('connection', id)) throw new Error('CONNECTION_NOT_FOUND');
        // Only a runtime the user picked is stored; the bundled one is resolved each time it is used.
        const previous = store.get<Connection>('connection', id);
        if (connecting.has(id)) throw new Error('CONNECTION_BUSY');
        const googleCloudProject =
          input.googleCloudProject === undefined ? previous?.googleCloudProject || '' : inputText(input.googleCloudProject, 60).trim();
        if (googleCloudProject && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(googleCloudProject))
          throw new Error('GOOGLE_CLOUD_PROJECT_INVALID');
        if (previous?.claudeAuthStarted && (previous.provider !== input.provider || previous.mode !== input.mode))
          throw new Error('DISCONNECT_REQUIRED');
        const connection: Connection = {
          id,
          provider: input.provider as Provider,
          mode: input.mode,
          model: inputText(input.model || '', 100),
          executable: previous?.customRuntime ? previous.executable : '',
          ...(previous?.customRuntime ? { customRuntime: true } : {}),
          ...(previous?.claudeAuthStarted ? { claudeAuthStarted: true } : {}),
          ...(input.provider === 'gemini' && input.mode === 'subscription' && googleCloudProject ? { googleCloudProject } : {}),
          ready: false,
          note: 'ยังไม่ได้ทดสอบการเชื่อมต่อ',
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
          connection.note = 'ใช้ตัวเชื่อมที่มากับแอป · ยังไม่ได้ทดสอบการเชื่อมต่อ';
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
          connection.note = 'ใช้ตัวเชื่อมที่เลือกเอง · ยังไม่ได้ทดสอบการเชื่อมต่อ';
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
          emit({ sessionId: '', type: 'connect-progress', connectionId: connection.id, text: 'กำลังโหลดรายชื่อโมเดล' });
          connection.ready = true;
          connection.note = 'ผ่านการเชื่อมต่อและรับคำตอบบนเครื่องนี้แล้ว';
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
        return { installed: Boolean(await findAnthropicCli()) };
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
          claudeCode: 'https://code.claude.com/docs/en/setup',
          anthropicCli: 'https://platform.claude.com/docs/en/cli-sdks-libraries/cli/quickstart',
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
        const picked = await dialog.showOpenDialog(window, { title: 'เลือกโฟลเดอร์ local-thai-ocr', properties: ['openDirectory'] });
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
          title: 'เลือกใบเสร็จ',
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
        if (ocrResolving) throw new Error('RUN_ALREADY_ACTIVE');
        const connection = store.get<Connection>('connection', inputText(input.connectionId, 80));
        if (!connection?.ready) throw new Error('CONNECTION_NOT_READY');
        const rawMapping = input.mapping;
        if (!rawMapping || typeof rawMapping !== 'object' || Array.isArray(rawMapping)) throw new Error('INVALID_INPUT');
        const serialized = JSON.stringify(rawMapping);
        if (serialized.length > 120_000) throw new Error('INPUT_LIMIT');

        const settings = store.settings();
        if (!settings.ocrAiConsentedAt) {
          const answer = await dialog.showMessageBox(window, {
            type: 'question',
            title: 'ให้ AI ช่วยกรองผล OCR',
            message: 'ส่งเฉพาะข้อความ OCR ที่ปิดบังข้อมูลอ่อนไหวแล้วให้ AI ช่วยเลือก candidate หรือระบุว่าไม่แน่ใจ',
            detail: 'จะไม่ส่งภาพใบเสร็จ และ AI ไม่มีสิทธิสร้างยอดเงิน เลขภาษี หรือเลขเอกสารใหม่ ระบบยอมรับได้เฉพาะ candidate token ที่ OCR สร้างไว้เท่านั้น',
            buttons: ['ยกเลิก', 'ใช้ AI กรอง'],
            defaultId: 1,
            cancelId: 0,
          });
          if (answer.response !== 1) return { cancelled: true };
          store.put('settings', 'main', { ...settings, ocrAiConsentedAt: new Date().toISOString() });
        }

        const sanitize = (value: string) => harness.privacy(value).redactedText;
        const resolver = buildReceiptAiResolver(rawMapping, sanitize);
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
          title: 'บันทึกร่างการตรวจใบเสร็จ',
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
        c.note = 'ออกจากระบบแล้ว กดเชื่อมต่อและทดสอบเพื่อลงชื่อใหม่';
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
        if (busy) throw new Error('RUN_ALREADY_ACTIVE');
        const id = inputText(input.id, 60),
          text = inputText(input.text);
        store.session(id);
        // A directly invoked Skill must be one the router can reach.
        const skill = input.skill ? inputText(input.skill, 80) : '';
        if (skill && !(await skillCatalog.loadSkillCatalog(root)).some((s: any) => s.name === skill && s.inRouter))
          throw new Error('SKILL_NOT_ROUTED');
        if (Array.isArray(input.attachments) && input.attachments.length > 1) throw new Error('ONE_SOURCE_PER_RUN');
        const selected = (Array.isArray(input.attachments) ? input.attachments : []).map((aid: string) => {
          const a = attachments.get(aid);
          if (!a || !a.view.usable || a.sessionId !== id) throw new Error('ATTACHMENT_NOT_APPROVED');
          return a;
        });
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
        if (first || selected.length || sourceText || flagged) {
          // The in-app dialog answers with a one-time token bound to this exact request, so a later edit needs a new answer.
          const sourceDigest = sourceText ? createHash('sha256').update(sourceText).digest('hex') : '';
          const fingerprint = createHash('sha256')
            .update([id, text, skill, sourceDigest, ...selected.map((a: any) => a.view.id)].join('\0'))
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
        if (busy) throw new Error('RUN_ALREADY_ACTIVE');
        busy = true;
        void service
          .run(id, text, combinedSource, true, skill || undefined)
          .catch(error => {
            diagnose('run-rejected', { code: errorCode(error) });
            emit({ sessionId: id, type: 'status', text: /^[A-Z_]+$/.test(error.message) ? error.message : 'RUN_FAILED' });
            emit({ sessionId: id, type: 'changed' });
          })
          .finally(() => {
            busy = false;
          });
        for (const a of selected) attachments.delete(a.view.id);
        // Without a dialog, the person still learns what was masked before sending.
        return { started: true, masked: review.labels };
      }
      case 'cancel':
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
        if (service.isActive(id)) throw new Error('RUN_ALREADY_ACTIVE');
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
        const result = await dialog.showOpenDialog(window, {
          properties: ['openFile'],
          filters: [{ name: 'Documents', extensions: ['txt', 'md', 'csv', 'tsv', 'pdf', 'docx'] }],
        });
        if (result.canceled) return null;
        const path = result.filePaths[0],
          report = await harness.documentPrivacy(path, { includeRedacted: true });
        const usable =
          typeof report.redactedText === 'string' && report.action !== 'block-external' && report.redactedText.length <= 100000;
        const view: Attachment = {
          id: randomUUID(),
          name: basename(path),
          status: usable ? 'ตรวจข้อความแล้ว · ต้องทบทวนก่อนส่ง' : 'ตรวจไม่ครบหรือมีข้อมูลที่ต้องจัดการก่อน ยังส่งไม่ได้',
          preview: usable ? report.redactedText : '',
          usable,
        };
        attachments.set(view.id, { view, text: report.redactedText || '', sessionId });
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
  app.on('second-instance', () => {
    window.show();
    window.focus();
  });
  app.on('before-quit', () => service.cancelAll());
  app.on('will-quit', () => store.close());
}
app.on('window-all-closed', () => app.quit());
main().catch(error => {
  diagnose('startup-failed', { code: errorCode(error), message: String(error instanceof Error ? error.message : error).slice(0, 300) });
  dialog.showErrorBox('STeP Desktop', 'เปิดแอปไม่สำเร็จ กรุณาตรวจชุดติดตั้ง');
  app.quit();
});
