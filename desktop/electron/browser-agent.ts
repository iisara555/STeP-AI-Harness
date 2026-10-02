import { WebContentsView, type WebContents } from 'electron';
import type { BrowserDock } from './browser-dock';
import { createHash, randomUUID } from 'node:crypto';
import { browserUrl } from './workbench';
import type { LoopRequest } from '../src/tools';
import { tm } from './i18n';

// Runs in an isolated world. The page cannot replace these helpers or manufacture references.
const helpers = `
const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const sensitive = el => /password|hidden|file/i.test(el.type || '') || /password|passwd|otp|one.time|verification|credit.card|cc-number|cc-csc|token|secret/i.test([el.name,el.id,el.autocomplete,el.getAttribute('aria-label')].join(' '));
const label = el => (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.innerText || el.getAttribute('placeholder') || el.name || el.tagName).trim().slice(0,160);
const fingerprint = el => JSON.stringify([el.outerHTML,el.getBoundingClientRect().x,el.getBoundingClientRect().y,el.getBoundingClientRect().width,el.getBoundingClientRect().height]);
`;
const WORLD = 1005;
type Entry = {
  contents: WebContents;
  view?: WebContentsView;
  dispose: () => void;
  owner: string;
  origin: string;
  opened: string;
  busy: boolean;
};
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
  // The origin each page may navigate in, by web contents; one network listener serves all tabs of a task.
  private origins = new Map<number, string>();
  private configured = new WeakSet<Electron.Session>();
  // With a dock the pages show in the main window's Web tab; without one (tests) they load unseen.
  constructor(private dock?: BrowserDock) {}
  private get(id: string, owner: string) {
    const entry = this.tabs.get(id);
    if (!entry || entry.owner !== owner || entry.contents.isDestroyed()) throw new Error('BROWSER_CLOSED');
    return entry;
  }
  private async script(entry: Entry, code: string, signal: AbortSignal): Promise<any> {
    if (signal.aborted) throw new Error('CANCELLED');
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => entry.dispose();
    signal.addEventListener('abort', stop, { once: true });
    try {
      return await Promise.race([
        entry.contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]),
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
  /**
   * A task that opens a site it already has open gets that tab back, already approved and with the employee's sign-in,
   * instead of a fresh page at the login screen. The AI does not keep tab IDs between messages, so "open" again is how it
   * continues after "เข้าสู่ระบบแล้ว".
   */
  private async reuse(url: string, context: Context) {
    const origin = new URL(url).origin;
    const found = [...this.tabs.entries()].find(
      ([, e]) => e.owner === context.sessionId && e.origin === origin && !e.contents.isDestroyed(),
    );
    if (!found) return undefined;
    const [id, entry] = found;
    if (entry.busy) throw new Error('BROWSER_BUSY');
    entry.busy = true;
    try {
      this.dock?.select(id);
      // The site's front page or the page first opened means "continue here": read the page as the employee left it.
      const target = new URL(url);
      if (url !== entry.opened && target.pathname !== '/' && url !== entry.contents.getURL()) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          entry.contents.loadURL(url),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('BROWSER_LOAD_FAILED')), 30000);
          }),
        ])
          .catch(() => {
            throw new Error(context.signal.aborted ? 'CANCELLED' : 'BROWSER_LOAD_FAILED');
          })
          .finally(() => clearTimeout(timer));
      }
      return { ...(await this.snapshot(id, entry, context.signal)), reused: true };
    } finally {
      entry.busy = false;
    }
  }
  async run(request: LoopRequest, context: Context) {
    const action = request.args?.action;
    if (!['open', 'read', 'click', 'fill', 'close'].includes(String(action))) throw new Error('INVALID_BROWSER_ACTION');
    await context.check();
    if (action === 'open') {
      const url = browserUrl(request.input);
      context.review(decodeURIComponent(url));
      context.activity?.(tm('รออนุญาตเปิดเว็บ {0}', new URL(url).host));
      const reused = await this.reuse(url, context);
      if (reused) return reused;
      if (this.tabs.size >= 4) throw new Error('TASK_LIMIT');
      if (
        !(await context.approve(
          tm('เปิดเว็บให้ Agent ทำงาน?'),
          url + tm('\nเปิดในแท็บเว็บของ STeP แยกจากบัญชีส่วนตัว เว็บไซต์อาจได้รับข้อมูลการเชื่อมต่อ'),
        ))
      )
        throw new Error('BROWSER_ACTION_DECLINED');
      await context.check();
      if (this.tabs.size >= 4) throw new Error('TASK_LIMIT');
      const id = randomUUID(),
        // One session per task: a later tab on a site keeps the sign-in the employee did in an earlier one.
        partition = 'step-agent-' + createHash('sha256').update(context.sessionId).digest('hex').slice(0, 24);
      // Without a dock the view is held by the entry, or garbage collection would close the page.
      const view = this.dock
        ? undefined
        : new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition } });
      const contents = view ? view.webContents : this.dock!.create(id, 'agent', partition);
      const dispose = () => {
        if (this.dock) this.dock.remove(id);
        else if (!contents.isDestroyed()) contents.close();
      };
      const entry: Entry = { contents, view, dispose, owner: context.sessionId, origin: new URL(url).origin, opened: url, busy: true };
      this.tabs.set(id, entry);
      const contentsId = contents.id;
      this.origins.set(contentsId, entry.origin);
      contents.once('destroyed', () => {
        this.tabs.delete(id);
        this.origins.delete(contentsId);
      });
      const network = contents.session;
      if (!this.configured.has(network)) {
        this.configured.add(network);
        network.setPermissionRequestHandler((_w, _p, cb) => cb(false));
        network.setPermissionCheckHandler(() => false);
        network.on('will-download', event => event.preventDefault());
        network.webRequest.onBeforeRequest((details, cb) => {
          try {
            browserUrl(details.url);
            const origin = this.origins.get(details.webContentsId ?? -1);
            cb({ cancel: details.resourceType === 'mainFrame' && (!origin || new URL(details.url).origin !== origin) });
          } catch {
            cb({ cancel: true });
          }
        });
      }
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const prevent = (event: Electron.Event, target: string) => {
        try {
          if (new URL(browserUrl(target)).origin !== entry.origin) event.preventDefault();
        } catch {
          event.preventDefault();
        }
      };
      contents.on('will-navigate', prevent);
      contents.on('will-redirect', prevent);
      const stop = dispose;
      context.signal.addEventListener('abort', stop, { once: true });
      const timeout = setTimeout(stop, 30000);
      try {
        if (context.signal.aborted) throw new Error('CANCELLED');
        await contents.loadURL(url);
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
    context.activity?.(
      `${action === 'read' ? tm('กำลังอ่านผลจากเว็บ') : action === 'close' ? tm('กำลังปิดเว็บ') : action === 'fill' ? tm('ตรวจเป้าหมายก่อนขอกรอกข้อมูล') : tm('ตรวจเป้าหมายก่อนขอคลิก')} ${new URL(entry.origin).host}`,
    );
    if (entry.busy) throw new Error('BROWSER_BUSY');
    entry.busy = true;
    try {
      if (action === 'close') {
        entry.dispose();
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
          action === 'fill' ? tm('ให้ Agent กรอกข้อมูลนี้?') : tm('ให้ Agent คลิกเป้าหมายนี้?'),
          info.url +
            '\n' +
            info.label +
            (action === 'fill' ? tm('\nข้อความ: ') + value : '') +
            tm('\nการกระทำนี้อาจส่งข้อมูลหรือยืนยันรายการบนเว็บ ตรวจหน้าเว็บในแท็บเว็บก่อนอนุมัติ'),
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
    for (const entry of [...this.tabs.values()]) if (entry.owner === owner) entry.dispose();
  }
  close() {
    for (const entry of [...this.tabs.values()]) entry.dispose();
  }
}
