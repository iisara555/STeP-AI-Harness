import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, nativeTheme, clipboard, session as electronSession } from 'electron';
import { mkdir, readFile, writeFile, stat, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { Store } from './store';
import { WorkService, type Harness } from './service';
import { adapter, createRpc, initialize, listModels, googleLoginUrl, runtimeError } from './providers';
import { explainRuntimeFailure } from './diagnostics';
import { exportDocument, exportFormats } from './export';
import { draftExportAction } from './actions';
import { OcrService, OCR_EXTENSIONS, isOcrFolder, ocrPython } from './ocr';
import { findPython, installOcr } from './components';
import { findClaudeCode, handoffText, openClaudeCode } from './handoff';
import { existsSync } from 'node:fs';
import type { Attachment, Connection, Provider, Session, Settings } from '../src/types';

let window: BrowserWindow, store: Store, service: WorkService;
const attachments = new Map<string, { view: Attachment; text: string; sessionId: string }>();
const exportPaths = new Set<string>();
const connecting = new Set<string>();
const authCodes = new Map<string, (code: string | null) => void>();
const consents = new Map<string, string>();
const connectControllers = new Map<string, AbortController>();
// Plain-language notes for connection failures; anything else shows its code.
const connectNotes: Record<string, string> = {
  PROVIDER_QUOTA: 'โควตาของบัญชีเต็มหรือถูกจำกัดชั่วคราว ลองใหม่ภายหลังหรือเลือกโมเดลที่เบากว่า',
  GOOGLE_CLOUD_PROJECT_REQUIRED: 'บัญชี Google ขององค์กรหรือสถานศึกษาต้องตั้ง Google Cloud Project ก่อนใช้ Gemini ใช้ Gemini API key หรือบัญชี Google ส่วนตัวแทน',
  PROVIDER_PERMISSION_DENIED: 'บัญชีนี้ยังไม่มีสิทธิ์ใช้บริการ ตรวจแพ็กเกจหรือสิทธิ์ของบัญชี',
  PROVIDER_NETWORK: 'เชื่อมต่อบริการไม่ได้ ตรวจอินเทอร์เน็ต proxy หรือ firewall',
  CONNECT_TEST_TIMEOUT: 'ลงชื่อสำเร็จ แต่ AI ไม่ตอบภายใน 2 นาที มักเกิดจากโควตาเต็มหรือบัญชียังไม่เปิดสิทธิ์ใช้งาน',
  LOGIN_TIMEOUT: 'ไม่ได้ลงชื่อ (หรือวาง code ของ Google) ภายใน 5 นาที กดเชื่อมต่อใหม่เมื่อพร้อม',
  LOGIN_FAILED: 'ลงชื่อเข้าใช้ไม่สำเร็จ ลองใหม่อีกครั้ง',
  CANCELLED: 'ยกเลิกการเชื่อมต่อแล้ว',
  API_KEY_REQUIRED: 'กรุณาเพิ่ม API key',
  MODEL_NOT_AVAILABLE: 'บัญชีนี้ใช้โมเดลที่ตั้งไว้ไม่ได้ เลือกโมเดลอื่นหรือใช้ค่าเริ่มต้นของบริการ',
  LOGIN_REQUIRED: 'การลงชื่อเข้าใช้หมดอายุหรือยังไม่สมบูรณ์ กดออกจากระบบแล้วเชื่อมต่อใหม่',
  RUNTIME_EXITED: 'ตัวเชื่อม AI ปิดตัวกลางคัน กดเชื่อมต่อใหม่ ถ้ายังเกิดซ้ำให้ส่ง log วินิจฉัยให้ผู้ดูแล',
  RUNTIME_UNAVAILABLE: 'ไม่พบตัวเชื่อม AI ในชุดติดตั้ง กรุณาติดตั้งแอปใหม่',
};
let busy = false;
const requireModule = createRequire(__filename);
// The Codex or Gemini CLI that ships with the app, or the one the user picked while it still exists.
function resolveRuntime(connection: Connection) {
  if (connection.provider === 'claude') return '';
  if (connection.customRuntime && connection.executable && existsSync(connection.executable)) return connection.executable;
  try { return requireModule.resolve(connection.provider === 'openai' ? '@openai/codex/bin/codex.js' : '@google/gemini-cli/bundle/gemini.js'); }
  catch { throw new Error('RUNTIME_UNAVAILABLE'); }
}
// A picked runtime must look like the provider's CLI by name and report a version, so an unrelated
// program (for example an installer in Downloads) is never started as the AI runtime.
async function checkRuntime(provider: string, file: string) {
  const name = basename(file).toLowerCase();
  const expected = provider === 'openai' ? /^codex(\.exe|\.js|\.mjs)?$/ : /^gemini(\.exe|\.js|\.mjs)?$/;
  if (!expected.test(name) && !(provider === 'gemini' && /[\\/]@google[\\/]gemini-cli[\\/]/i.test(file))) throw new Error('RUNTIME_INVALID');
  const script = /\.[cm]?js$/i.test(file);
  const output = await new Promise<string>(resolveOutput => {
    execFile(script ? process.execPath : file, script ? [file, '--version'] : ['--version'], { timeout: 10_000, windowsHide: true, env: { ...process.env, ...(script ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } }, (error, stdout) => resolveOutput(error ? '' : String(stdout)));
  });
  if (!(provider === 'openai' ? /codex/i.test(output) : /^\s*\d+\.\d+\.\d+/.test(output))) throw new Error('RUNTIME_INVALID');
}
const validProviders = new Set(['openai', 'claude', 'gemini']);
// Pilot diagnostics: error codes and provider names only, never request, draft, or document content.
let logFile = '';
const errorCode = (error: unknown) => error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'UNEXPECTED';
function diagnose(event: string, detail: Record<string, string> = {}) {
  if (!logFile) return;
  void appendFile(logFile, JSON.stringify({ at: new Date().toISOString(), event, ...detail }) + '\n').catch(() => {});
}
const inputText = (value: unknown, limit = 30000) => { if (typeof value !== 'string' || value.length > limit) throw new Error('INVALID_INPUT'); return value; };

async function makeWindow() {
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 800, minHeight: 600, title: 'STeP Desktop', backgroundColor: '#fafaf8', show: false, ...(app.isPackaged ? {} : { icon: resolve(__dirname, '../build/icon.ico') }), webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', async event => {
    // Keep the window open by default when the editor has unsaved content.
    const result = await dialog.showMessageBox(window, { type: 'warning', message: 'มีร่างที่ยังไม่บันทึก', detail: 'กลับไปบันทึกร่างก่อนปิด หรือเลือกปิดโดยไม่บันทึก', buttons: ['กลับไปบันทึก', 'ปิดโดยไม่บันทึก'], defaultId: 0, cancelId: 0 });
    if (result.response === 1) window.destroy();
  });
  window.once('ready-to-show', () => window.show());
  await window.loadFile(join(__dirname, 'renderer/index.html'));
}

async function main() {
  if (!app.isPackaged && process.env.STEP_DESKTOP_TEST_HOME) app.setPath('userData', process.env.STEP_DESKTOP_TEST_HOME);
  await app.whenReady();
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  const root = app.isPackaged ? join(process.resourcesPath, 'harness') : resolve(__dirname, '../..');
  const data = app.getPath('userData'); await mkdir(data, { recursive: true });
  await mkdir(join(data, 'logs'), { recursive: true }); logFile = join(data, 'logs', 'diagnostics.jsonl');
  // The renderer only needs notifications; camera, microphone, location and the rest stay denied.
  electronSession.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'notifications'));
  electronSession.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === 'notifications');
  store = new Store(join(data, 'workspace.sqlite'));
  const [routing, privacy, documents, outputs, skillCatalog] = await Promise.all([
    import(pathToFileURL(join(root, 'src/modules/router/service.js')).href),
    import(pathToFileURL(join(root, 'src/modules/privacy/index.js')).href),
    import(pathToFileURL(join(root, 'src/modules/privacy/document.js')).href),
    import(pathToFileURL(join(root, 'src/modules/output-manager.js')).href),
    import(pathToFileURL(join(root, 'src/modules/skills/catalog.js')).href),
  ]);
  const harness: Harness = { memoryDir: () => store.settings().workspace || app.getPath('userData'), root, route: routing.queryStepRouter, privacy: privacy.evaluatePrivacyGate, skillMetadata: async id => { const m = await routing.loadSkillContextMetadata(id); return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m?.mandatory || []) }; }, documentPrivacy: documents.evaluateDocumentPrivacy, nextOutput: outputs.getNextOutputPath };
  const actions = await import(pathToFileURL(join(root, 'src/modules/actions/index.js')).href);
  const userMemory = await import(pathToFileURL(join(root, 'src/modules/user-memory.js')).href);
  // USER.md sits in the chosen work folder so CLI and desktop share it; before one is chosen it stays in app data.
  const memoryDir = () => store.settings().workspace || data;
  const userFile = () => join(memoryDir(), 'USER.md');
  async function writeUserMemory() {
    const s = store.settings();
    await userMemory.savePersonalization(memoryDir(), { name: s.userName || '', assistantName: s.assistant, personality: s.personality || 'coworker', assistantTone: s.assistantTone || '', team: s.team });
    exportPaths.add(userFile());
  }
  const emit = (event: any) => { if (window && !window.isDestroyed()) window.webContents.send('step:event', event); };
  async function key(connection: Connection) {
    const encrypted = store.get<string>('secret', connection.id);
    if (!encrypted) return undefined;
    if (!safeStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  // Each connection keeps its runtime's sign-in and state in its own folder under app data.
  async function removeRuntimeHome(id: string) {
    const base = join(data, 'runtimes'), home = resolve(base, id);
    if (!/^[\w-]{1,60}$/.test(id) || dirname(home) !== resolve(base)) throw new Error('INVALID_INPUT');
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  async function runtime(connection: Connection) {
    connection.executable = resolveRuntime(connection);
    const home = join(data, 'runtimes', connection.id), cwd = join(home, 'workspace');
    await mkdir(cwd, { recursive: true }); await mkdir(join(home, '.gemini'), { recursive: true });
    // Isolate runtime configuration from personal MCP servers, plugins, and files.
    await writeFile(join(home, '.gemini', 'settings.json'), JSON.stringify({ tools: { core: [] }, mcpServers: {}, telemetry: { enabled: false }, context: { fileName: '__STEP_NO_CONTEXT__' } }));
    await writeFile(join(home, 'config.toml'), 'web_search = "disabled"\n[features]\nshell_tool = false\nplugins = false\nremote_plugin = false\nplugin_sharing = false\napps = false\ngoals = false\n');
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, CODEX_HOME: home, GEMINI_CLI_HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude') };
    return { adapter: adapter(connection.provider), context: { cwd, env, key: await key(connection) } };
  }
  service = new WorkService(store, harness, runtime, event => {
    if (event.type === 'failed') { const s = store.get<Session>('session', event.sessionId), c = s && store.get<Connection>('connection', s.connectionId); diagnose('run-failed', { code: String(event.text || '').slice(0, 40), provider: c?.provider || '', mode: c?.mode || '', detail: (event.detail || []).join(' | ').slice(0, 1200) }); return; }
    emit(event);
  });
  // The OCR trial ships beside the harness in development; installed apps point at the folder the user chose.
  // OCR code ships with the app (resources/ocr); its Python packages live per user in app data.
  const ocrFolder = () => store.settings().ocrDir || (app.isPackaged ? join(process.resourcesPath, 'ocr') : join(root, 'experiments', 'local-thai-ocr'));
  const ocrHome = join(data, 'components', 'ocr');
  // Installers carry a ready OCR runtime (scripts/bundle-ocr.mjs): Python with PaddleOCR plus its two models.
  const ocrRuntime = app.isPackaged ? join(process.resourcesPath, 'ocr-runtime') : join(__dirname, '..', 'ocr-runtime');
  const bundledPython = join(ocrRuntime, 'python', process.platform === 'win32' ? 'python.exe' : join('bin', 'python3'));
  // A venv the user installed (for example with the second OCR engine) wins; otherwise the bundled runtime.
  const ocr = new OcrService(ocrFolder, undefined, () => existsSync(ocrPython(ocrHome)) ? ocrPython(ocrHome) : existsSync(bundledPython) ? bundledPython : ocrPython(ocrFolder()),
    () => ({ ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1', PADDLE_PDX_CACHE_HOME: join(ocrHome, 'paddlex'), PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True', ...(existsSync(join(ocrRuntime, 'models')) ? { STEP_OCR_MODEL_DIR: join(ocrRuntime, 'models') } : {}) }));
  let installing = false;
  app.on('before-quit', () => ocr.stop());
  const previewTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };
  async function refreshModels(connection: Connection) {
    const current = await runtime(connection);
    connection.models = await listModels(connection, current.context); connection.modelsAt = new Date().toISOString();
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
    const option = connection.models?.find(m => m.id === (model || connection.model)) || (!model && !connection.model ? connection.models?.find(m => m.isDefault) : undefined);
    if (effort && !option?.efforts?.some(e => e.id === effort)) throw new Error('INVALID_MODEL');
    return effort;
  };
  // USER.md can be revealed once it exists; an unwritten path is reported as empty.
  const knownUserFile = () => { const file = userFile(); if (!existsSync(file)) return ''; exportPaths.add(file); return file; };
  const snapshot = async () => ({ userFile: knownUserFile(), settings: store.settings(), connections: store.connections(), sessions: store.list<any>('session').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), teams: Object.values(await routing.loadTeamsDictionary()) });

  ipcMain.handle('step:call', async (event, method: string, raw: any = {}) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('UNTRUSTED_SENDER');
    const input = raw ?? {};
    switch (method) {
      case 'snapshot': return snapshot();
      case 'workspace': {
        const result = await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] });
        if (!result.canceled) { const s = store.settings(); s.workspace = result.filePaths[0]; store.put('settings', 'main', s); await writeUserMemory().catch(() => {}); }
        return store.settings();
      }
      case 'settings': {
        const teams = await routing.loadTeamsDictionary();
        const team = inputText(input.team, 40), theme = input.theme;
        if ((team && !teams[team]) || !['system', 'light', 'dark'].includes(theme)) throw new Error('INVALID_SETTINGS');
        const personality = ['coworker', 'professional', 'concise', 'custom'].includes(input.personality) ? input.personality : (store.settings().personality || 'coworker');
        const s: Settings = { ...store.settings(), team, assistant: inputText(input.assistant, 60).trim() || 'STeP Mate', theme, onboarding: true,
          userName: input.userName === undefined ? store.settings().userName : inputText(input.userName, 60).trim(), personality,
          assistantTone: input.assistantTone === undefined ? store.settings().assistantTone : inputText(input.assistantTone, 300).trim() };
        store.put('settings', 'main', s); nativeTheme.themeSource = theme;
        await writeUserMemory().catch(error => diagnose('user-memory-failed', { code: errorCode(error) })); return s;
      }
      case 'connection': {
        if (!validProviders.has(input.provider) || !['api', 'subscription'].includes(input.mode) || (input.provider === 'claude' && input.mode !== 'api')) throw new Error('INVALID_CONNECTION');
        const id = input.id ? inputText(input.id, 60) : randomUUID();
        if (input.id && !store.get('connection', id)) throw new Error('CONNECTION_NOT_FOUND');
        // Only a runtime the user picked is stored; the bundled one is resolved each time it is used.
        const previous = store.get<Connection>('connection', id);
        const connection: Connection = { id, provider: input.provider as Provider, mode: input.mode, model: inputText(input.model || '', 100), executable: previous?.customRuntime ? previous.executable : '', ...(previous?.customRuntime ? { customRuntime: true } : {}), ready: false, note: 'ยังไม่ได้ทดสอบการเชื่อมต่อ' };
        if (input.apiKey) {
          if (!safeStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
          store.put('secret', id, safeStorage.encryptString(inputText(input.apiKey, 1000)).toString('base64'));
        }
        if (input.mode === 'subscription') store.put('secret', id, null);
        store.put('connection', id, connection); return connection;
      }
      case 'runtime': {
        const connection = store.get<Connection>('connection', input.id); if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        if (input.reset) { connection.executable = ''; delete connection.customRuntime; connection.ready = false; connection.note = 'ใช้ตัวเชื่อมที่มากับแอป · ยังไม่ได้ทดสอบการเชื่อมต่อ'; store.put('connection', connection.id, connection); return connection; }
        const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Runtime', extensions: process.platform === 'win32' ? ['exe', 'js', 'mjs'] : ['*'] }] });
        if (!result.canceled) {
          await checkRuntime(connection.provider, result.filePaths[0]);
          connection.executable = result.filePaths[0]; connection.customRuntime = true; connection.ready = false; connection.note = 'ใช้ตัวเชื่อมที่เลือกเอง · ยังไม่ได้ทดสอบการเชื่อมต่อ'; store.put('connection', connection.id, connection);
        }
        return connection;
      }
      case 'connect': {
        const connection = store.get<Connection>('connection', input.id); if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        if (connecting.has(connection.id)) throw new Error('CONNECTION_BUSY');
        connecting.add(connection.id);
        let rpc: ReturnType<typeof createRpc> | undefined;
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 480_000);
        connectControllers.set(connection.id, controller);
        const progress = (text: string) => emit({ sessionId: '', type: 'connect-progress', connectionId: connection.id, text });
        controller.signal.addEventListener('abort', () => rpc?.close('CANCELLED'), { once: true });
        let testTimedOut = false;
        try {
          const current = await runtime(connection);
          if (connection.mode === 'api' && !current.context.key) throw new Error('API_KEY_REQUIRED');
          if (connection.provider !== 'claude') {
            progress('กำลังเปิดตัวเชื่อม ' + (connection.provider === 'openai' ? 'OpenAI' : 'Gemini'));
            rpc = createRpc(connection, current.context); await initialize(rpc, connection.provider);
            if (connection.provider === 'openai') {
              if (connection.mode === 'api') await rpc.request('account/login/start', { type: 'apiKey', apiKey: current.context.key });
              else if ((await rpc.request('account/read', { refreshToken: false }).catch(() => null))?.account?.type === 'chatgpt') {
                // Already signed in on this connection: test it without asking for the browser again.
                progress('ลงชื่อ ChatGPT ไว้แล้ว');
              } else {
                const login = await rpc.request('account/login/start', { type: 'chatgpt' });
                const url = new URL(login.authUrl);
                if (url.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com', 'auth0.openai.com'].includes(url.hostname)) throw new Error('INVALID_LOGIN_URL');
                progress('รอให้ลงชื่อเข้าใช้ในเบราว์เซอร์…');
                await new Promise<void>((resolveLogin, reject) => {
                  const t = setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), 300_000);
                  controller.signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('CANCELLED')); }, { once: true });
                  rpc!.onNotification = (method, params) => { if (method === 'account/login/completed') { clearTimeout(t); params.success ? resolveLogin() : reject(new Error('LOGIN_FAILED')); } };
                  void shell.openExternal(url.href).catch(() => { clearTimeout(t); reject(new Error('LOGIN_FAILED')); });
                });
              }
            } else {
              if (connection.mode === 'subscription') {
                // Gemini prints a Google sign-in URL, then waits for the code Google shows after sign-in.
                const session = rpc; let attempts = 0;
                session.onText = line => {
                  const url = googleLoginUrl(line); if (!url) return;
                  if (++attempts > 3) { session.close('LOGIN_FAILED'); return; }
                  void shell.openExternal(url.href).catch(() => {});
                  progress('ลงชื่อในหน้าของ Google แล้ววาง code ที่ได้ในแอป');
                  authCodes.get(connection.id)?.(null);
                  new Promise<string | null>(resolveCode => { authCodes.set(connection.id, resolveCode); emit({ sessionId: '', type: 'auth-code', connectionId: connection.id }); })
                    .then(code => { if (code) session.writeText(code); else session.close('LOGIN_FAILED'); });
                };
              }
              try { await rpc.request('authenticate', { methodId: connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal' }, 300_000); }
              catch (error) { throw errorCode(error) === 'PROVIDER_TIMEOUT' && connection.mode === 'subscription' ? new Error('LOGIN_TIMEOUT') : runtimeError(error, rpc); }
              finally { authCodes.get(connection.id)?.(null); authCodes.delete(connection.id); }
            }
            rpc.close(); rpc = undefined;
          }
          // The test gets its own short budget so a stalled provider is reported instead of spinning for minutes.
          progress('ลงชื่อสำเร็จ · กำลังทดสอบส่งข้อความสั้น ๆ');
          const test = new AbortController(), testTimer = setTimeout(() => { testTimedOut = true; test.abort(); }, 120_000);
          controller.signal.addEventListener('abort', () => test.abort(), { once: true });
          try { await current.adapter.run('Reply with exactly OK. Do not use tools.', connection, { ...current.context, signal: test.signal, emit: () => {} }); }
          catch (error) {
            const detail = (error as any)?.detail || [];
            if (testTimedOut && errorCode(error) === 'CANCELLED') throw Object.assign(new Error(explainRuntimeFailure(detail) || 'CONNECT_TEST_TIMEOUT'), { detail });
            throw error;
          }
          finally { clearTimeout(testTimer); }
          progress('กำลังโหลดรายชื่อโมเดล');
          connection.ready = true; connection.note = 'ผ่านการเชื่อมต่อและรับคำตอบบนเครื่องนี้แล้ว';
          try { await refreshModels(connection); } catch { /* The connection works; the model list can be reloaded later. */ }
        } catch (error) {
          const code = errorCode(error), detail = ((error as any)?.detail || []) as string[];
          diagnose('connect-failed', { provider: connection.provider, mode: connection.mode, code, detail: detail.join(' | ').slice(0, 1200) });
          connection.ready = false; connection.note = `${connectNotes[code] || 'เชื่อมต่อไม่สำเร็จ ตรวจบัญชี โควตา และ runtime แล้วลองใหม่'} (${code})`;
        }
        finally { clearTimeout(timer); rpc?.close(); connecting.delete(connection.id); connectControllers.delete(connection.id); }
        store.put('connection', connection.id, connection); return connection;
      }
      case 'cancelConnect': { connectControllers.get(inputText(input.id, 60))?.abort(); return true; }
      case 'authCode': {
        const id = inputText(input.id, 60), resolveCode = authCodes.get(id); if (!resolveCode) throw new Error('LOGIN_FAILED');
        const code = typeof input.code === 'string' ? input.code.trim() : '';
        if (code && (code.length > 500 || !/^[\w\-/.~%]+$/.test(code))) throw new Error('INVALID_INPUT');
        authCodes.delete(id); resolveCode(code || null); return true;
      }
      case 'skills': return skillCatalog.loadSkillCatalog(root);
      case 'tour': { const s = { ...store.settings(), tourDone: input.done === true }; store.put('settings', 'main', s); return s; }
      // Only fixed help pages open in the browser; nothing from the renderer becomes a URL.
      case 'claudeCode': return { installed: Boolean(await findClaudeCode()) };
      case 'handoff': {
        // Hands a request to the employee's own Claude Code (see handoff.ts). The privacy gate still applies.
        const text = inputText(input.text), claude = await findClaudeCode();
        if (!text.trim()) throw new Error('INVALID_INPUT');
        if (!claude) throw new Error('CLAUDE_CODE_NOT_FOUND');
        if (service.review(text, '').action === 'block-external') throw new Error('PRIVACY_REVIEW_REQUIRED');
        const name = input.skill ? inputText(input.skill, 80) : '';
        const skill = name ? (await skillCatalog.loadSkillCatalog(root)).find((s: any) => s.name === name && s.path) : undefined;
        if (name && !skill) throw new Error('SKILL_NOT_FOUND');
        clipboard.writeText(handoffText(harness.privacy(text).redactedText, skill && { name: skill.name, file: join(root, skill.path) }));
        const workspace = store.settings().workspace, cwd = workspace && existsSync(workspace) ? workspace : root;
        await openClaudeCode(claude, cwd); diagnose('handoff', { skill: skill ? 'yes' : 'no' });
        return { cwd };
      }
      case 'openHelp': { const pages: Record<string, string> = { python: 'https://www.python.org/downloads/', claudeCode: 'https://code.claude.com/docs/en/setup' }; const url = pages[input.topic]; if (!url) throw new Error('INVALID_INPUT'); await shell.openExternal(url); return true; }
      case 'ocrInstall': {
        if (installing) throw new Error('INSTALL_BUSY');
        installing = true;
        try {
          await installOcr(ocrFolder(), join(ocrHome, '.venv'), line => emit({ sessionId: '', type: 'install', text: line }), input.crosscheck === true, bundledPython);
        } catch (error) { diagnose('ocr-install-failed', { code: errorCode(error) }); throw error; } finally { installing = false; }
        return ocr.status();
      }
      case 'ocrStatus': { const status = await ocr.status(); return status.installed ? status : { ...status, python: Boolean(await findPython()) }; }
      case 'ocrFolder': {
        const picked = await dialog.showOpenDialog(window, { title: 'เลือกโฟลเดอร์ local-thai-ocr', properties: ['openDirectory'] });
        if (picked.canceled) return ocr.status();
        if (!isOcrFolder(picked.filePaths[0])) throw new Error('OCR_FOLDER_INVALID');
        store.put('settings', 'main', { ...store.settings(), ocrDir: picked.filePaths[0] }); return ocr.status();
      }
      case 'ocrStart': return ocr.start();
      case 'ocrRead': {
        const health = await ocr.health(); if (!health.running) throw new Error('OCR_UNAVAILABLE');
        const picked = await dialog.showOpenDialog(window, { title: 'เลือกใบเสร็จ', properties: ['openFile'], filters: [{ name: 'Receipts', extensions: OCR_EXTENSIONS }] });
        if (picked.canceled) return null;
        const path = picked.filePaths[0], read = await ocr.recognize(path, health.crosscheck);
        // Show the receipt beside its fields; formats Chromium cannot draw (PDF, TIFF) fall back to text only.
        const type = previewTypes[read.extension];
        const preview = type && read.bytes.length <= 8 * 1024 * 1024 ? `data:${type};base64,${read.bytes.toString('base64')}` : '';
        return { name: basename(path), preview, result: read.result };
      }
      case 'ocrSave': {
        const text = JSON.stringify(input.draft ?? null, null, 2);
        if (!input.draft || typeof input.draft !== 'object' || text.length > 2_000_000) throw new Error('INVALID_INPUT');
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const saved = await dialog.showSaveDialog(window, { title: 'บันทึกร่างการตรวจใบเสร็จ', defaultPath: join(store.settings().workspace || app.getPath('documents') || tmpdir(), `receipt-review-${date}.json`), filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (saved.canceled || !saved.filePath) return null;
        await writeFile(saved.filePath, text, 'utf8'); exportPaths.add(saved.filePath); return { path: saved.filePath };
      }
      case 'disconnect': {
        const c = store.get<Connection>('connection', input.id); if (!c) throw new Error('CONNECTION_NOT_FOUND');
        if (connecting.has(c.id)) throw new Error('RUN_ALREADY_ACTIVE');
        for (const session of store.list<any>('session')) if (session.connectionId === c.id) service.cancel(session.id);
        // Signing out removes this connection's sign-in data (Google or ChatGPT tokens in its runtime home).
        await removeRuntimeHome(c.id);
        c.ready = false; c.note = 'ออกจากระบบแล้ว กดเชื่อมต่อและทดสอบเพื่อลงชื่อใหม่'; delete c.models; delete c.modelsAt; store.put('connection', c.id, c); store.put('secret', c.id, null); return c;
      }
      case 'removeConnection': {
        const c = store.get<Connection>('connection', inputText(input.id, 60)); if (!c) throw new Error('CONNECTION_NOT_FOUND');
        if (connecting.has(c.id)) throw new Error('CONNECTION_BUSY');
        const sessions = store.list<Session>('session').filter(session => session.connectionId === c.id);
        if (sessions.some(session => service.isActive(session.id))) throw new Error('RUN_ALREADY_ACTIVE');
        await removeRuntimeHome(c.id);
        store.remove('connection', c.id); store.remove('secret', c.id);
        // Work stays; it asks for another AI the next time it is used.
        for (const session of sessions) { session.connectionId = ''; store.put('session', session.id, session); }
        diagnose('connection-removed', { provider: c.provider, mode: c.mode });
        return true;
      }
      case 'sessionConnection': {
        const session = store.session(inputText(input.id, 60));
        if (service.isActive(session.id)) throw new Error('RUN_ALREADY_ACTIVE');
        const c = store.get<Connection>('connection', inputText(input.connectionId, 60)); if (!c) throw new Error('CONNECTION_NOT_FOUND');
        if (session.connectionId !== c.id) { session.connectionId = c.id; delete session.model; delete session.effort; store.put('session', session.id, session); }
        return session;
      }
      case 'create': {
        const connection = store.get<Connection>('connection', input.connectionId); if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        const session = store.create(connection.id, store.settings().team, inputText(input.project || '', 80));
        if (input.model !== undefined || input.effort) { session.model = modelChoice(connection, input.model); session.effort = effortChoice(connection, session.model ?? connection.model, input.effort); store.save(session); }
        return session;
      }
      case 'models': {
        const connection = store.get<Connection>('connection', input.id); if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        if (connecting.has(connection.id)) throw new Error('CONNECTION_BUSY');
        connecting.add(connection.id);
        try { await refreshModels(connection); } catch { throw new Error('MODEL_LIST_FAILED'); } finally { connecting.delete(connection.id); }
        store.put('connection', connection.id, connection); return connection;
      }
      case 'model': {
        const session = store.session(inputText(input.id, 60)), connection = store.get<Connection>('connection', session.connectionId);
        if (!connection) throw new Error('CONNECTION_NOT_FOUND');
        session.model = modelChoice(connection, input.model); session.effort = effortChoice(connection, session.model, input.effort); store.save(session); return session;
      }
      case 'send': {
        if (busy) throw new Error('RUN_ALREADY_ACTIVE');
        const id = inputText(input.id, 60), text = inputText(input.text); store.session(id);
        // A directly invoked Skill must be one the router can reach.
        const skill = input.skill ? inputText(input.skill, 80) : '';
        if (skill && !(await skillCatalog.loadSkillCatalog(root)).some((s: any) => s.name === skill && s.inRouter)) throw new Error('SKILL_NOT_ROUTED');
        if (Array.isArray(input.attachments) && input.attachments.length > 1) throw new Error('ONE_SOURCE_PER_RUN');
        const selected = (Array.isArray(input.attachments) ? input.attachments : []).map((aid: string) => {
          const a = attachments.get(aid); if (!a || !a.view.usable || a.sessionId !== id) throw new Error('ATTACHMENT_NOT_APPROVED'); return a;
        });
        const attachmentText = selected.map((a: any) => a.text).join('\n\n');
        const review = service.review(text, attachmentText);
        if (review.action === 'block-external') throw new Error('PRIVACY_REVIEW_REQUIRED');
        // Ask only when it adds information: first send in a session, a new attachment, or a privacy review signal.
        const flagged = review.action === 'human-confirm';
        const first = !store.session(id).consentedAt;
        if (first || selected.length || flagged) {
          // The in-app dialog answers with a one-time token bound to this exact request, so a later edit needs a new answer.
          const fingerprint = createHash('sha256').update([id, text, skill, ...selected.map((a: any) => a.view.id)].join('\0')).digest('hex');
          const token = typeof input.consent === 'string' ? input.consent : '';
          if (!token || consents.get(token) !== fingerprint) {
            const issued = randomUUID(); consents.set(issued, fingerprint);
            if (consents.size > 20) consents.delete(consents.keys().next().value!);
            return { consent: { token: issued, first, flagged, labels: review.labels, attachment: selected.length > 0 } };
          }
          consents.delete(token);
          const s = store.session(id); if (!s.consentedAt) { s.consentedAt = new Date().toISOString(); store.save(s); }
        }
        if (busy) throw new Error('RUN_ALREADY_ACTIVE');
        busy = true;
        void service.run(id, text, attachmentText, true, skill || undefined).catch(error => { diagnose('run-rejected', { code: errorCode(error) }); emit({ sessionId: id, type: 'status', text: /^[A-Z_]+$/.test(error.message) ? error.message : 'RUN_FAILED' }); emit({ sessionId: id, type: 'changed' }); }).finally(() => { busy = false; });
        for (const a of selected) attachments.delete(a.view.id); return { started: true };
      }
      case 'cancel': service.cancel(input.id); return true;
      // Pin and rename are view metadata: keep updatedAt so the list order does not jump.
      case 'pin': { const s = store.session(inputText(input.id, 60)); s.pinned = input.pinned === true; store.put('session', s.id, s); return s; }
      case 'rename': {
        const s = store.session(inputText(input.id, 60)), title = inputText(input.title, 120).trim();
        if (!title) throw new Error('INVALID_INPUT');
        s.title = title; store.put('session', s.id, s); return s;
      }
      case 'remove': {
        const id = inputText(input.id, 60); store.session(id);
        if (service.isActive(id)) throw new Error('RUN_ALREADY_ACTIVE');
        store.remove('session', id); for (const [aid, a] of attachments) if (a.sessionId === id) attachments.delete(aid); return true;
      }
      case 'edit': return store.edit(inputText(input.id, 60), inputText(input.text, 150000), input.revision, input.document);
      case 'accept': return store.accept(input.id, input.proposalId);
      case 'reject': { const s = store.session(input.id); s.proposals = s.proposals.filter(p => p.id !== input.proposalId); store.save(s); return s; }
      case 'restore': { const s = store.session(input.id), version = s.versions.find(v => v.revision === input.revision); if (!version) throw new Error('VERSION_NOT_FOUND'); return store.edit(s.id, version.text, s.revision, version.document); }
      case 'attach': {
        const sessionId = inputText(input.id, 60); store.session(sessionId);
        const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Documents', extensions: ['txt', 'md', 'csv', 'tsv', 'pdf', 'docx'] }] });
        if (result.canceled) return null;
        const path = result.filePaths[0], report = await harness.documentPrivacy(path, { includeRedacted: true });
        const usable = typeof report.redactedText === 'string' && report.action !== 'block-external' && report.redactedText.length <= 100000;
        const view: Attachment = { id: randomUUID(), name: basename(path), status: usable ? 'ตรวจข้อความแล้ว · ต้องทบทวนก่อนส่ง' : 'ตรวจไม่ครบหรือมีข้อมูลที่ต้องจัดการก่อน ยังส่งไม่ได้', preview: usable ? report.redactedText : '', usable };
        attachments.set(view.id, { view, text: report.redactedText || '', sessionId }); return view;
      }
      case 'export': {
        const s = store.session(input.id), format = input.format;
        if (!exportFormats.includes(format) || !s.draft.trim()) throw new Error('INVALID_EXPORT');
        if (actions.evaluateActionGate(draftExportAction).status !== 'allowed') throw new Error('ACTION_BLOCKED');
        const workspace = store.settings().workspace; if (!workspace || !(await stat(workspace)).isDirectory()) throw new Error('WORKSPACE_REQUIRED');
        const result = await harness.nextOutput({ workspaceDir: workspace, team: s.team, title: s.title, extension: format });
        await exportDocument(result.path, format, s.draft, async html => {
          const print = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
          try { await print.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); return await print.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } }); } finally { print.destroy(); }
        }, s.document);
        exportPaths.add(result.path); return result;
      }
      case 'reveal': { if (!exportPaths.has(input.path)) throw new Error('INVALID_PATH'); shell.showItemInFolder(input.path); return true; }
      default: throw new Error('UNKNOWN_OPERATION');
    }
  });
  // Set the theme before the first paint so a dark-theme user never sees a light flash.
  nativeTheme.themeSource = store.settings().theme; await makeWindow();
  app.on('second-instance', () => { window.show(); window.focus(); });
  app.on('before-quit', () => service.cancelAll());
  app.on('will-quit', () => store.close());
}
app.on('window-all-closed', () => app.quit());
main().catch(error => { diagnose('startup-failed', { code: errorCode(error), message: String(error instanceof Error ? error.message : error).slice(0, 300) }); dialog.showErrorBox('STeP Desktop', 'เปิดแอปไม่สำเร็จ กรุณาตรวจชุดติดตั้ง'); app.quit(); });
