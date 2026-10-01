import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { browserUrl } from './workbench';
import type { LoopRequest } from '../src/tools';

// Runs in an isolated world. The page cannot replace these helpers or manufacture references.
const helpers = `
const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const sensitive = el => /password|hidden|file/i.test(el.type || '') || /password|passwd|otp|one.time|verification|credit.card|cc-number|cc-csc|token|secret/i.test([el.name,el.id,el.autocomplete,el.getAttribute('aria-label')].join(' '));
const label = el => (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.innerText || el.getAttribute('placeholder') || el.name || el.tagName).trim().slice(0,160);
const fingerprint = el => JSON.stringify([el.outerHTML,el.getBoundingClientRect().x,el.getBoundingClientRect().y,el.getBoundingClientRect().width,el.getBoundingClientRect().height]);
`;
const WORLD = 1005;
type Entry = { window: BrowserWindow; owner: string; origin: string; busy: boolean };
type Context = {
  sessionId: string;
  signal: AbortSignal;
  check: () => Promise<void>;
  approve: (title: string, body: string) => Promise<boolean>;
  review: (text: string) => void;
  activity?: (text: string) => void;
};

/** Task-owned, temporary browsers. No arbitrary JS, credential access or personal profile attachment. */
export class AgentBrowser {
  private tabs = new Map<string, Entry>();
  constructor(private visible = true) {}
  private get(id: string, owner: string) {
    const entry = this.tabs.get(id);
    if (!entry || entry.owner !== owner || entry.window.isDestroyed()) throw new Error('BROWSER_CLOSED');
    return entry;
  }
  private async script(entry: Entry, code: string, signal: AbortSignal): Promise<any> {
    if (signal.aborted) throw new Error('CANCELLED');
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => {
      if (!entry.window.isDestroyed()) entry.window.destroy();
    };
    signal.addEventListener('abort', stop, { once: true });
    try {
      return await Promise.race([
        entry.window.webContents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            stop();
            reject(new Error('BROWSER_TIMEOUT'));
          }, 10000);
        }),
      ]);
    } catch (error) {
      if (signal.aborted) throw new Error('CANCELLED');
      if (error instanceof Error && error.message === 'BROWSER_TIMEOUT') throw error;
      throw new Error('BROWSER_PAGE_CHANGED');
    } finally {
      clearTimeout(timer!);
      signal.removeEventListener('abort', stop);
    }
  }
  private async snapshot(id: string, entry: Entry, signal: AbortSignal) {
    const snapshot = randomUUID();
    const result = await this.script(
      entry,
      `(() => { ${helpers}
      const all = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role="button"]')).filter(visible);
      const login = all.some(el => sensitive(el) && el.type !== 'hidden' && el.type !== 'file');
      const controls = all.slice(0,150);
      const refs = new Map();
      const elements = login ? [] : controls.filter(el => !sensitive(el) && !el.disabled).map((el,i) => {
        const ref = 'e'+(i+1); refs.set(ref,{el, fingerprint:fingerprint(el)});
        return {ref, role:el.tagName.toLowerCase(), label:label(el), editable:el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text','search','email','url','tel','number'].includes(el.type))};
      });
      globalThis.__stepBrowser?.observer.disconnect();
      globalThis.__stepBrowser?.controller.abort();
      const state = {snapshot:${JSON.stringify(snapshot)},url:location.href,refs,dirty:false,controller:new AbortController()};
      state.observer = new MutationObserver(() => {state.dirty=true;});
      state.observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
      document.addEventListener('input',()=>{state.dirty=true;},{capture:true,signal:state.controller.signal});
      document.addEventListener('change',()=>{state.dirty=true;},{capture:true,signal:state.controller.signal});
      globalThis.__stepBrowser = state;
      return {snapshot:${JSON.stringify(snapshot)},url:location.href,title:document.title.slice(0,200),text:login ? '' : (document.body?.innerText || '').slice(0,20000),elements,requiresManualLogin:login};
    })()`,
      signal,
    );
    return { tab: id, ...result };
  }
  async run(request: LoopRequest, context: Context) {
    const action = request.args?.action;
    if (!['open', 'read', 'click', 'fill', 'close'].includes(String(action))) throw new Error('INVALID_BROWSER_ACTION');
    await context.check();
    if (action === 'open') {
      const url = browserUrl(request.input);
      context.review(decodeURIComponent(url));
      context.activity?.(`รออนุญาตเปิดเว็บ ${new URL(url).host}`);
      if (this.tabs.size >= 4) throw new Error('TASK_LIMIT');
      if (!(await context.approve('เปิดเว็บให้ Agent ทำงาน?', url + '\nเปิดในเบราว์เซอร์แยกของ STeP เว็บไซต์อาจได้รับข้อมูลการเชื่อมต่อ')))
        throw new Error('BROWSER_ACTION_DECLINED');
      await context.check();
      if (this.tabs.size >= 4) throw new Error('TASK_LIMIT');
      const id = randomUUID();
      const window = new BrowserWindow({
        width: 1100,
        height: 800,
        show: this.visible,
        title: 'STeP Agent Browser',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'step-agent-' + id },
      });
      const entry = { window, owner: context.sessionId, origin: new URL(url).origin, busy: true };
      this.tabs.set(id, entry);
      window.on('closed', () => this.tabs.delete(id));
      const network = window.webContents.session;
      network.setPermissionRequestHandler((_w, _p, cb) => cb(false));
      network.setPermissionCheckHandler(() => false);
      network.on('will-download', event => event.preventDefault());
      network.webRequest.onBeforeRequest((details, cb) => {
        try {
          browserUrl(details.url);
          cb({ cancel: details.resourceType === 'mainFrame' && new URL(details.url).origin !== entry.origin });
        } catch {
          cb({ cancel: true });
        }
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const prevent = (event: Electron.Event, target: string) => {
        try {
          if (new URL(browserUrl(target)).origin !== entry.origin) event.preventDefault();
        } catch {
          event.preventDefault();
        }
      };
      window.webContents.on('will-navigate', prevent);
      window.webContents.on('will-redirect', prevent);
      const stop = () => {
        if (!window.isDestroyed()) window.destroy();
      };
      context.signal.addEventListener('abort', stop, { once: true });
      const timeout = setTimeout(stop, 30000);
      try {
        if (context.signal.aborted) throw new Error('CANCELLED');
        await window.loadURL(url);
        return await this.snapshot(id, entry, context.signal);
      } catch {
        stop();
        throw new Error(context.signal.aborted ? 'CANCELLED' : 'BROWSER_LOAD_FAILED');
      } finally {
        clearTimeout(timeout);
        context.signal.removeEventListener('abort', stop);
        entry.busy = false;
      }
    }
    const entry = this.get(request.input, context.sessionId);
    context.activity?.(`${action === 'read' ? 'กำลังอ่านผลจากเว็บ' : action === 'close' ? 'กำลังปิดเว็บ' : action === 'fill' ? 'ตรวจเป้าหมายก่อนขอกรอกข้อมูล' : 'ตรวจเป้าหมายก่อนขอคลิก'} ${new URL(entry.origin).host}`);
    if (entry.busy) throw new Error('BROWSER_BUSY');
    entry.busy = true;
    try {
      if (action === 'close') {
        entry.window.destroy();
        return { closed: true };
      }
      if (action === 'read') return await this.snapshot(request.input, entry, context.signal);
      const { snapshot, ref } = request.args || {};
      if (typeof snapshot !== 'string' || typeof ref !== 'string' || !/^e\d{1,3}$/.test(ref)) throw new Error('INVALID_BROWSER_TARGET');
      const value = action === 'fill' ? request.content : '';
      if (typeof value !== 'string' || value.length > 4000) throw new Error('INVALID_INPUT');
      context.review(value);
      const selection = `const state=globalThis.__stepBrowser;
        if(!state || state.dirty || state.snapshot!==${JSON.stringify(snapshot)} || state.url!==location.href) return {error:'BROWSER_STALE_TARGET'};
        const target=state.refs.get(${JSON.stringify(ref)}); const el=target?.el;
        if(!el || !el.isConnected || !visible(el) || sensitive(el) || el.disabled || fingerprint(el)!==target.fingerprint) return {error:'BROWSER_STALE_TARGET'};`;
      const info = await this.script(
        entry,
        `(() => {${helpers}${selection} return {label:label(el),url:location.href};})()`,
        context.signal,
      );
      if (info.error) throw new Error(info.error);
      context.review(info.url + '\n' + info.label);
      if (
        !(await context.approve(
          action === 'fill' ? 'ให้ Agent กรอกข้อมูลนี้?' : 'ให้ Agent คลิกเป้าหมายนี้?',
          info.url +
            '\n' +
            info.label +
            (action === 'fill' ? '\nข้อความ: ' + value : '') +
            '\nการกระทำนี้อาจส่งข้อมูลหรือยืนยันรายการบนเว็บ ตรวจหน้าต่างเบราว์เซอร์ก่อนอนุมัติ',
        ))
      )
        throw new Error('BROWSER_ACTION_DECLINED');
      await context.check();
      const result = await this.script(
        entry,
        `(() => {${helpers}${selection}
        state.observer.disconnect(); state.controller.abort(); globalThis.__stepBrowser=null;
        if(${JSON.stringify(action)}==='fill') {
          if(!(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ['text','search','email','url','tel','number'].includes(el.type))) || el.readOnly) return {error:'BROWSER_NOT_EDITABLE'};
          const proto=el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
          el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
        } else el.click();
        return {performed:true,action:${JSON.stringify(action)},readAgain:true};
      })()`,
        context.signal,
      );
      if (result.error) throw new Error(result.error);
      return result;
    } finally {
      entry.busy = false;
    }
  }
  closeOwner(owner: string) {
    for (const entry of this.tabs.values()) if (entry.owner === owner && !entry.window.isDestroyed()) entry.window.destroy();
  }
  close() {
    for (const entry of this.tabs.values()) if (!entry.window.isDestroyed()) entry.window.destroy();
  }
}
