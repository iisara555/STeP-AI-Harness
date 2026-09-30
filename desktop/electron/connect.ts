import { createRpc, initialize, googleLoginUrl, runtimeError, type ProviderAdapter, type ProviderContext } from './providers';
import { errorCode, explainRuntimeFailure } from './diagnostics';
import type { Connection } from '../src/types';
import { claudeLogin } from './claude-auth';
import { anthropicLogin } from './anthropic-auth';

// Plain-language notes for connection failures; anything else shows its code.
export const connectNotes: Record<string, string> = {
  CLAUDE_CODE_NOT_FOUND: 'ยังไม่พบ Claude Code เปิดวิธีติดตั้งแล้วกดตรวจอีกครั้ง',
  CLAUDE_CODE_UPDATE_REQUIRED: 'กรุณาอัปเดต Claude Code เป็นรุ่น 2.1.268 ขึ้นไป แล้วเชื่อมต่อใหม่',
  CLAUDE_PROFILE_MISMATCH: 'Claude Code ใช้โฟลเดอร์บัญชีไม่ตรงกับ STeP จึงหยุดการเชื่อมต่อ',
  CLAUDE_AUTH_STATUS_INVALID: 'ตรวจสถานะ Claude ไม่สำเร็จ กรุณาอัปเดต Claude Code แล้วลองใหม่',
  CLAUDE_SUBSCRIPTION_REQUIRED: 'กรุณาใช้บัญชี Claude Pro/Max แทนบัญชี Console ในการเชื่อมต่อนี้',
  CLAUDE_LOGOUT_FAILED: 'ออกจากบัญชี Claude ไม่สำเร็จ ข้อมูลบัญชียังเก็บไว้เพื่อให้ลองใหม่',
  ANTHROPIC_CLI_NOT_FOUND: 'ยังไม่พบ ant CLI ของ Anthropic กด “ติดตั้ง ant CLI” แล้วเชื่อมต่อใหม่',
  ANTHROPIC_CLI_DOWNLOAD_FAILED: 'ดาวน์โหลด ant CLI ไม่สำเร็จ ตรวจอินเทอร์เน็ตหรือการเข้าถึง github.com แล้วลองใหม่',
  ANTHROPIC_CLI_CHECKSUM_FAILED: 'ไฟล์ ant CLI ที่ดาวน์โหลดไม่ตรงกับ checksum ทางการ จึงยกเลิกการติดตั้ง',
  ANTHROPIC_CLI_INSTALL_FAILED: 'ติดตั้ง ant CLI ไม่สำเร็จ ลองใหม่อีกครั้ง หรือติดตั้งเองตามคู่มือ Claude Platform',
  ANTHROPIC_CLI_UNSUPPORTED: 'เครื่องรุ่นนี้ยังไม่รองรับการติดตั้ง ant CLI อัตโนมัติ ติดตั้งเองตามคู่มือ Claude Platform',
  INSTALL_BUSY: 'กำลังติดตั้งส่วนเสริมอยู่ รอให้เสร็จแล้วลองใหม่',
  GEMINI_PERSONAL_DISCONTINUED:
    'Google หยุดให้บริการ Gemini CLI กับบัญชี Google ส่วนตัว และ Google AI Pro/Ultra ตั้งแต่ 18 มิ.ย. 2569 ใช้ Gemini API key หรือบัญชีองค์กรที่มี Gemini Code Assist Standard/Enterprise (ใส่ Google Cloud Project ID) แทน',
  PROVIDER_BUSY: 'บริการ AI ไม่ว่างชั่วคราว รอสักครู่แล้วกดเชื่อมต่อใหม่',
  ANTHROPIC_CLI_UPDATE_REQUIRED: 'กรุณาอัปเดต ant CLI ของ Anthropic เป็นรุ่น 1.5.0 ขึ้นไป',
  ANTHROPIC_PROFILE_REQUIRED: 'ยังไม่พบพื้นที่เก็บ OAuth profile ของ Claude ใน STeP',
  ANTHROPIC_LOGOUT_FAILED: 'ออกจาก Claude Console OAuth ไม่สำเร็จ กรุณาลองใหม่',
  ANTHROPIC_AUTH_TIMEOUT: 'Claude Console OAuth ไม่ตอบสนอง กรุณาลองใหม่',
  FEATURE_DISABLED: 'การเชื่อมต่อบัญชี Claude ในแอปยังปิดอยู่ ใช้ Claude API key หรือเปิดใน Claude Code ภายนอกแทน',
  AUTH_METHOD_UNAVAILABLE: 'runtime รุ่นนี้ไม่รองรับวิธีลงชื่อเข้าใช้ที่เลือก กรุณาอัปเดตตัวเชื่อม AI',
  INVALID_LOGIN_RESPONSE: 'ตัวเชื่อม AI ส่งข้อมูลเริ่ม OAuth ไม่ครบ กรุณาอัปเดต runtime แล้วลองใหม่',
  CLAUDE_AUTH_TIMEOUT: 'Claude Code ไม่ตอบสนอง กรุณาลองใหม่',
  PROVIDER_QUOTA: 'โควตาของบัญชีเต็มหรือถูกจำกัดชั่วคราว ลองใหม่ภายหลังหรือเลือกโมเดลที่เบากว่า',
  GOOGLE_CLOUD_PROJECT_REQUIRED:
    'บัญชี Google ขององค์กรหรือสถานศึกษาต้องตั้ง Google Cloud Project ก่อนใช้ Gemini ใช้ Gemini API key หรือบัญชี Google ส่วนตัวแทน',
  PROVIDER_PERMISSION_DENIED: 'บัญชีนี้ยังไม่มีสิทธิ์ใช้บริการ ตรวจแพ็กเกจหรือสิทธิ์ของบัญชี',
  PROVIDER_NETWORK: 'เชื่อมต่อบริการไม่ได้ ตรวจอินเทอร์เน็ต proxy หรือ firewall',
  CONNECT_TEST_TIMEOUT: 'ลงชื่อสำเร็จ แต่ AI ไม่ตอบภายใน 2 นาที มักเกิดจากโควตาเต็มหรือบัญชียังไม่เปิดสิทธิ์ใช้งาน',
  LOGIN_TIMEOUT: 'ไม่ได้ลงชื่อหรือวาง code ภายใน 5 นาที กดเชื่อมต่อใหม่เมื่อพร้อม',
  LOGIN_FAILED: 'ลงชื่อเข้าใช้ไม่สำเร็จ ลองใหม่อีกครั้ง',
  LOGIN_CODE_REJECTED: 'Google ไม่รับ code ที่วาง 3 ครั้ง กดปุ่ม Copy ในหน้า Google แล้ววางใหม่ภายในไม่กี่นาที',
  CANCELLED: 'ยกเลิกการเชื่อมต่อแล้ว',
  API_KEY_REQUIRED: 'กรุณาเพิ่ม API key',
  MODEL_NOT_AVAILABLE: 'บัญชีนี้ใช้โมเดลที่ตั้งไว้ไม่ได้ เลือกโมเดลอื่นหรือใช้ค่าเริ่มต้นของบริการ',
  LOGIN_REQUIRED: 'การลงชื่อเข้าใช้หมดอายุหรือยังไม่สมบูรณ์ กดออกจากระบบแล้วเชื่อมต่อใหม่',
  RUNTIME_EXITED: 'ตัวเชื่อม AI ปิดตัวกลางคัน กดเชื่อมต่อใหม่ ถ้ายังเกิดซ้ำให้ส่ง log วินิจฉัยให้ผู้ดูแล',
  RUNTIME_UNAVAILABLE: 'ไม่พบตัวเชื่อม AI ในชุดติดตั้ง กรุณาติดตั้งแอปใหม่',
};
export const connectFailureNote = (code: string) =>
  `${connectNotes[code] || 'เชื่อมต่อไม่สำเร็จ ตรวจบัญชี โควตา และ runtime แล้วลองใหม่'} (${code})`;

const LOGIN_MS = 300_000,
  TEST_MS = 120_000;
const OPENAI_LOGIN_HOSTS = ['auth.openai.com', 'chatgpt.com', 'auth0.openai.com'];

export type ConnectDeps = {
  runtime: { adapter: ProviderAdapter; context: Omit<ProviderContext, 'signal' | 'emit'>; authExecutable?: string };
  progress: (text: string) => void;
  openExternal: (url: string) => Promise<void>;
  /** Shows the in-app code box and resolves with what the person pasted, or null when they close it. */
  askForCode: () => Promise<string | null>;
  /** Closes a code box that is still open. */
  dropCode: () => void;
  /** Called once the account is signed in, before the test request. */
  signedIn?: () => void;
};

/**
 * Signs in (when the runtime needs it) and sends one short test request. Throws a code on
 * failure; aborting `signal` cancels at any stage.
 */
export async function signInAndTest(connection: Connection, deps: ConnectDeps, signal: AbortSignal) {
  const { runtime, progress } = deps;
  if (connection.mode === 'api' && !runtime.context.key) throw new Error('API_KEY_REQUIRED');
  if (connection.provider === 'claude' && connection.mode === 'oauth') {
    if (!runtime.authExecutable) throw new Error('ANTHROPIC_CLI_NOT_FOUND');
    await anthropicLogin(runtime.authExecutable, runtime.context, deps, signal);
    deps.signedIn?.();
  }
  if (connection.provider === 'claude' && connection.mode === 'subscription') {
    await claudeLogin(connection.executable, runtime.context, deps, signal);
    deps.signedIn?.();
  }
  if (connection.provider !== 'claude') {
    progress('กำลังเปิดตัวเชื่อม ' + (connection.provider === 'openai' ? 'OpenAI' : 'Gemini'));
    const rpc = createRpc(connection, runtime.context);
    const close = () => rpc.close('CANCELLED');
    signal.addEventListener('abort', close, { once: true });
    let failed = false;
    try {
      const initialized = await initialize(rpc, connection.provider);
      if (connection.provider === 'openai') await openAiSignIn(rpc, connection, deps, signal);
      else await geminiSignIn(rpc, connection, deps, initialized);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      signal.removeEventListener('abort', close);
      try {
        await rpc.closeAndWait();
      } catch (error) {
        if (!failed) throw error;
      }
    }
  }
  // The test gets its own short budget so a stalled provider is reported instead of spinning for minutes.
  progress(
    connection.provider === 'claude' && connection.mode === 'oauth'
      ? 'ยืนยัน Claude Console OAuth แล้ว · กำลังทดสอบส่งข้อความสั้น ๆ'
      : 'ลงชื่อสำเร็จ · กำลังทดสอบส่งข้อความสั้น ๆ',
  );
  if (signal.aborted) throw new Error('CANCELLED');
  let timedOut = false;
  const test = new AbortController(),
    timer = setTimeout(() => {
      timedOut = true;
      test.abort();
    }, TEST_MS);
  const stop = () => test.abort();
  signal.addEventListener('abort', stop, { once: true });
  try {
    await runtime.adapter.run('Reply with exactly OK. Do not use tools.', connection, {
      ...runtime.context,
      signal: test.signal,
      emit: () => {},
    });
  } catch (error) {
    const detail = (error as any)?.detail || [];
    if (timedOut && errorCode(error) === 'CANCELLED')
      throw Object.assign(new Error(explainRuntimeFailure(detail) || 'CONNECT_TEST_TIMEOUT'), { detail });
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

export async function signOutManagedProvider(connection: Connection, runtime: { context: Omit<ProviderContext, 'signal' | 'emit'> }) {
  if (connection.provider !== 'openai') return;
  const rpc = createRpc(connection, runtime.context);
  let failed = false;
  try {
    await initialize(rpc, 'openai');
    await rpc.request('account/logout', null, 20_000);
  } catch (error) {
    failed = true;
    // Local profile removal still happens in the host. Surface only a typed
    // provider error here; never include OAuth material from the runtime.
    throw runtimeError(error, rpc);
  } finally {
    try {
      await rpc.closeAndWait();
    } catch (error) {
      if (!failed) throw error;
    }
  }
}

async function openAiSignIn(rpc: ReturnType<typeof createRpc>, connection: Connection, deps: ConnectDeps, signal: AbortSignal) {
  if (connection.mode === 'api') {
    await rpc.request('account/login/start', { type: 'apiKey', apiKey: deps.runtime.context.key });
    return;
  }

  // Force a refresh before reusing a saved account. A stale auth.json may still
  // say "chatgpt" even when its access token can no longer be refreshed.
  const saved = await rpc.request('account/read', { refreshToken: true }).catch(() => null);
  if (saved?.account?.type === 'chatgpt') {
    deps.progress('ใช้บัญชี ChatGPT ที่ลงชื่อไว้แล้ว');
    deps.signedIn?.();
    return;
  }

  const login = await rpc.request('account/login/start', {
    type: 'chatgpt',
    appBrand: 'chatgpt',
    codexStreamlinedLogin: true,
    useHostedLoginSuccessPage: true,
  });
  if (login?.type !== 'chatgpt' || typeof login.authUrl !== 'string' || typeof login.loginId !== 'string')
    throw new Error('INVALID_LOGIN_RESPONSE');

  const url = new URL(login.authUrl);
  if (url.protocol !== 'https:' || !OPENAI_LOGIN_HOSTS.includes(url.hostname)) throw new Error('INVALID_LOGIN_URL');
  const loginId = login.loginId;
  deps.progress('รอให้ลงชื่อ ChatGPT ในเบราว์เซอร์…');

  const cancel = async () => {
    await rpc.request('account/login/cancel', { loginId }, 10_000).catch(() => {});
  };
  await new Promise<void>((resolveLogin, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolveLogin();
    };
    const abort = () => {
      void cancel();
      finish(new Error('CANCELLED'));
    };
    const timer = setTimeout(() => {
      void cancel();
      finish(new Error('LOGIN_TIMEOUT'));
    }, LOGIN_MS);

    signal.addEventListener('abort', abort, { once: true });
    rpc.onNotification = (method, params) => {
      if (method !== 'account/login/completed') return;
      // New Codex versions identify the login attempt. Older versions may omit loginId.
      if (params?.loginId && params.loginId !== loginId) return;
      params?.success ? finish() : finish(new Error('LOGIN_FAILED'));
    };
    deps.openExternal(url.href).catch(() => {
      void cancel();
      finish(new Error('LOGIN_FAILED'));
    });
  });

  // Do not trust the callback alone; verify that Codex can refresh the account it
  // just persisted in this isolated CODEX_HOME.
  const account = await rpc.request('account/read', { refreshToken: true }).catch(() => null);
  if (account?.account?.type !== 'chatgpt') throw new Error('LOGIN_REQUIRED');
  deps.signedIn?.();
}

async function geminiSignIn(rpc: ReturnType<typeof createRpc>, connection: Connection, deps: ConnectDeps, initialized: any) {
  const methodId = connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal';
  const methods = Array.isArray(initialized?.authMethods) ? initialized.authMethods.map((method: any) => method?.id) : [];
  if (methods.length && !methods.includes(methodId)) throw new Error('AUTH_METHOD_UNAVAILABLE');

  if (connection.mode === 'subscription') {
    // ACP mode is non-interactive. Let Gemini CLI own the supported browser +
    // loopback callback flow; forcing NO_BROWSER makes current Gemini CLI reject
    // OAuth because manual code entry requires an interactive terminal.
    let sawLoginUrl = false;
    rpc.onText = line => {
      if (!googleLoginUrl(line)) return;
      if (!sawLoginUrl) deps.progress('เปิดหน้าลงชื่อ Google แล้ว · รอการยืนยันจากเบราว์เซอร์');
      sawLoginUrl = true;
    };
  }

  try {
    await rpc.request('authenticate', { methodId }, LOGIN_MS);
    if (connection.mode === 'subscription') deps.signedIn?.();
  } catch (error) {
    throw errorCode(error) === 'PROVIDER_TIMEOUT' && connection.mode === 'subscription'
      ? new Error('LOGIN_TIMEOUT')
      : runtimeError(error, rpc);
  } finally {
    deps.dropCode();
  }
}
