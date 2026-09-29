import { createRpc, initialize, googleLoginUrl, runtimeError, type ProviderAdapter, type ProviderContext } from './providers';
import { errorCode, explainRuntimeFailure } from './diagnostics';
import type { Connection } from '../src/types';

// Plain-language notes for connection failures; anything else shows its code.
export const connectNotes: Record<string, string> = {
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
export const connectFailureNote = (code: string) => `${connectNotes[code] || 'เชื่อมต่อไม่สำเร็จ ตรวจบัญชี โควตา และ runtime แล้วลองใหม่'} (${code})`;

const LOGIN_MS = 300_000, TEST_MS = 120_000;
const OPENAI_LOGIN_HOSTS = ['auth.openai.com', 'chatgpt.com', 'auth0.openai.com'];

export type ConnectDeps = {
  runtime: { adapter: ProviderAdapter; context: Omit<ProviderContext, 'signal' | 'emit'> };
  progress: (text: string) => void;
  openExternal: (url: string) => Promise<void>;
  /** Shows the in-app code box and resolves with what the person pasted, or null when they close it. */
  askForCode: () => Promise<string | null>;
  /** Closes a code box that is still open. */
  dropCode: () => void;
};

/**
 * Signs in (when the runtime needs it) and sends one short test request. Throws a code on
 * failure; aborting `signal` cancels at any stage.
 */
export async function signInAndTest(connection: Connection, deps: ConnectDeps, signal: AbortSignal) {
  const { runtime, progress } = deps;
  if (connection.mode === 'api' && !runtime.context.key) throw new Error('API_KEY_REQUIRED');
  if (connection.provider !== 'claude') {
    progress('กำลังเปิดตัวเชื่อม ' + (connection.provider === 'openai' ? 'OpenAI' : 'Gemini'));
    const rpc = createRpc(connection, runtime.context);
    const close = () => rpc.close('CANCELLED'); signal.addEventListener('abort', close, { once: true });
    try {
      await initialize(rpc, connection.provider);
      if (connection.provider === 'openai') await openAiSignIn(rpc, connection, deps, signal);
      else await geminiSignIn(rpc, connection, deps);
    } finally { signal.removeEventListener('abort', close); rpc.close(); }
  }
  // The test gets its own short budget so a stalled provider is reported instead of spinning for minutes.
  progress('ลงชื่อสำเร็จ · กำลังทดสอบส่งข้อความสั้น ๆ');
  let timedOut = false;
  const test = new AbortController(), timer = setTimeout(() => { timedOut = true; test.abort(); }, TEST_MS);
  const stop = () => test.abort(); signal.addEventListener('abort', stop, { once: true });
  try { await runtime.adapter.run('Reply with exactly OK. Do not use tools.', connection, { ...runtime.context, signal: test.signal, emit: () => {} }); }
  catch (error) {
    const detail = (error as any)?.detail || [];
    if (timedOut && errorCode(error) === 'CANCELLED') throw Object.assign(new Error(explainRuntimeFailure(detail) || 'CONNECT_TEST_TIMEOUT'), { detail });
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', stop); }
}

async function openAiSignIn(rpc: ReturnType<typeof createRpc>, connection: Connection, deps: ConnectDeps, signal: AbortSignal) {
  if (connection.mode === 'api') { await rpc.request('account/login/start', { type: 'apiKey', apiKey: deps.runtime.context.key }); return; }
  // Already signed in on this connection: test it without asking for the browser again.
  if ((await rpc.request('account/read', { refreshToken: false }).catch(() => null))?.account?.type === 'chatgpt') { deps.progress('ลงชื่อ ChatGPT ไว้แล้ว'); return; }
  const login = await rpc.request('account/login/start', { type: 'chatgpt' });
  const url = new URL(login.authUrl);
  if (url.protocol !== 'https:' || !OPENAI_LOGIN_HOSTS.includes(url.hostname)) throw new Error('INVALID_LOGIN_URL');
  deps.progress('รอให้ลงชื่อเข้าใช้ในเบราว์เซอร์…');
  await new Promise<void>((resolveLogin, reject) => {
    const timer = setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), LOGIN_MS);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('CANCELLED')); }, { once: true });
    rpc.onNotification = (method, params) => { if (method === 'account/login/completed') { clearTimeout(timer); params.success ? resolveLogin() : reject(new Error('LOGIN_FAILED')); } };
    deps.openExternal(url.href).catch(() => { clearTimeout(timer); reject(new Error('LOGIN_FAILED')); });
  });
}

async function geminiSignIn(rpc: ReturnType<typeof createRpc>, connection: Connection, deps: ConnectDeps) {
  if (connection.mode === 'subscription') {
    // Gemini prints a Google sign-in URL, then waits for the code Google shows after sign-in.
    let attempts = 0;
    rpc.onText = line => {
      const url = googleLoginUrl(line); if (!url) return;
      if (++attempts > 3) { rpc.close('LOGIN_FAILED'); return; }
      void deps.openExternal(url.href).catch(() => {});
      deps.progress('ลงชื่อในหน้าของ Google แล้ววาง code ที่ได้ในแอป');
      deps.dropCode();
      void deps.askForCode().then(code => { if (code) rpc.writeText(code); else rpc.close('LOGIN_FAILED'); });
    };
  }
  try { await rpc.request('authenticate', { methodId: connection.mode === 'api' ? 'gemini-api-key' : 'oauth-personal' }, LOGIN_MS); }
  catch (error) { throw errorCode(error) === 'PROVIDER_TIMEOUT' && connection.mode === 'subscription' ? new Error('LOGIN_TIMEOUT') : runtimeError(error, rpc); }
  finally { deps.dropCode(); }
}
