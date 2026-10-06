import { WebContentsView, type WebContents } from 'electron';
import type { BrowserDock } from './browser-dock';
import { createHash, randomUUID } from 'node:crypto';
import { browserUrl } from './workbench';
import { publicSite, type Resolve } from './web-fetch';
import type { LoopRequest } from '../src/tools';
import { tm } from './i18n';

// Runs in an isolated world. The page cannot replace these helpers or manufacture references.
const helpers = `
const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
const sensitive = el => /password|hidden|file/i.test(el.type || '') || /password|passwd|otp|one.time|verification|credit.card|cc-number|cc-csc|token|secret/i.test([el.name,el.id,el.autocomplete,el.getAttribute('aria-label')].join(' '));
const native = 'a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[role="option"],[role="checkbox"],[role="radio"],[role="switch"],[onclick],[tabindex]:not([tabindex="-1"])';
// A tile a page made clickable itself (a picture of a cup, a product card) often has no text of its own worth reading;
// its name is on an inner element (aria-label, an image's alt text), so that comes before the raw text.
const inner = el => el.matches(native) ? '' : (el.querySelector('[aria-label]')?.getAttribute('aria-label') || el.querySelector('img[alt]')?.alt || '');
const label = el => (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || inner(el) || el.innerText || el.getAttribute('placeholder') || el.name || el.tagName).trim().slice(0,160);
// The heading of the card or list item the target sits in ("Americano $7.00"), so the AI can tell similar tiles apart.
const near = el => { const box = el.closest('li,article,section,tr,[role="listitem"],[role="row"]'); const h = box?.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]'); const text = (h && !el.contains(h) ? h.innerText : '').replace(/\\s+/g,' ').trim().slice(0,120); return text && !label(el).includes(text) ? text : ''; };
// A final step: a form's submit button, or a control named for sending, paying, ordering, confirming or deleting. The
// employee approves these even in auto mode; adding to a cart, opening a menu or typing in a field is routine.
const FINAL = /\\b(submit|send|pay|payment|checkout|check out|place order|order now|buy|purchase|confirm|book now|reserve|register|sign up|subscribe|delete|transfer|donate|approve|sign(?! ?in)|publish|post)\\b|ส่ง|ยืนยัน|ชำระ|จ่าย|สั่งซื้อ|ซื้อ|จอง|ลงทะเบียน|สมัคร|ลบ|โอน|บริจาค|อนุมัติ|ลงนาม|เผยแพร่|โพสต์|บันทึก/i;
const final = el => ((el.tagName === 'BUTTON' || el.tagName === 'INPUT') && el.type === 'submit' && Boolean(el.form)) || el.type === 'image' || FINAL.test([label(el), el.value || '', el.getAttribute('title') || ''].join(' '));
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
  /** Auto mode: opening a site, clicking and filling go ahead, and only a final step (send, pay, confirm) asks. */
  routine?: () => boolean;
  review: (text: string) => void;
  activity?: (text: string) => void;
};

/** Task-owned, temporary browsers. No arbitrary JS, credential access or personal profile attachment. */
export class AgentBrowser {
  private tabs = new Map<string, Entry>();
  // The origin each page may navigate in, by web contents; one network listener serves all tabs of a task.
  private origins = new Map<number, string>();
  private configured = new WeakSet<Electron.Session>();
  // Requests each page still has open, and when its network was last busy, so a read waits for content still loading.
  private inflight = new Map<number, number>();
  private busyAt = new Map<number, number>();
  // With a dock the pages show in the main window's Web tab; without one (tests) they load unseen.
  constructor(
    private dock?: BrowserDock,
    // Intranet hosts the organization lets the assistant open (policy network.privateHosts).
    private privateHosts: () => string[] = () => [],
    private resolve?: Resolve,
  ) {}
  private track(contents: number, change: number) {
    if (!this.origins.has(contents)) return;
    this.inflight.set(contents, Math.max(0, (this.inflight.get(contents) || 0) + change));
    this.busyAt.set(contents, Date.now());
  }
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
  /**
   * Marks elements that have a click listener of their own. Sites built with Vue, Svelte or plain addEventListener make a
   * <div> clickable with no button, link, role or pointer cursor (a cup on a coffee menu turns a pointer only on hover),
   * so the page's markup alone does not show it. The DevTools protocol's DOM domain lists every listener in the page
   * without running any of the page's JavaScript or ours in it (listeners belong to the page's own world, which the
   * isolated snapshot cannot see), and adds a random, short-lived attribute that the snapshot reads and removes.
   * Without the protocol (DevTools already open on the page) the snapshot works as before.
   */
  private async markListeners(entry: Entry, signal: AbortSignal) {
    const tool = entry.contents.debugger;
    const marker = 'data-step-' + randomUUID().slice(0, 8);
    let attached = false;
    try {
      if (!tool.isAttached()) {
        tool.attach('1.3');
        attached = true;
      }
      const send = (method: string, params?: object) => tool.sendCommand(method, params);
      const work = (async () => {
        const { root } = await send('DOM.getDocument', { depth: 0 });
        const { object } = await send('DOM.resolveNode', { nodeId: root.nodeId });
        try {
          const { listeners } = await send('DOMDebugger.getEventListeners', { objectId: object.objectId, depth: -1, pierce: false });
          const ids = [
            ...new Set(
              (listeners as { type: string; backendNodeId?: number }[])
                .filter(l => l.backendNodeId && ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].includes(l.type))
                .map(l => l.backendNodeId!),
            ),
          ].slice(0, 500);
          if (!ids.length) return 0;
          const { nodeIds } = await send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: ids });
          let marked = 0;
          for (const nodeId of nodeIds as number[]) {
            if (signal.aborted) break;
            // The document and window have listeners too but no attributes; they are skipped.
            if (nodeId)
              marked += await send('DOM.setAttributeValue', { nodeId, name: marker, value: '' }).then(
                () => 1,
                () => 0,
              );
          }
          return marked;
        } finally {
          await send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {});
        }
      })();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const found = await Promise.race([
        work,
        new Promise<number>((_, reject) => {
          timer = setTimeout(() => reject(new Error('BROWSER_TIMEOUT')), 5000);
        }),
      ]).finally(() => clearTimeout(timer));
      if (signal.aborted) throw new Error('CANCELLED');
      return found ? marker : '';
    } catch {
      if (signal.aborted) throw new Error('CANCELLED');
      return '';
    } finally {
      if (attached && tool.isAttached()) tool.detach();
    }
  }
  /**
   * Waits for content still loading. Single-page apps such as a coffee menu fetch their content after the page itself
   * has loaded; read too early, the menu is not there yet. First the page's requests finish (none open for 500 ms),
   * then the page stops changing (no DOM change for 300 ms). Each wait is capped, so a page that never goes quiet
   * (polling, a live feed) is read after about 6 s.
   */
  private async settle(entry: Entry, signal: AbortSignal) {
    const id = entry.contents.id,
      start = Date.now();
    while (Date.now() - start < 4000) {
      if (signal.aborted) throw new Error('CANCELLED');
      if (!this.inflight.get(id) && Date.now() - (this.busyAt.get(id) || 0) >= 500) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await this.script(
      entry,
      `new Promise(resolve => {
        let quiet; const done = () => { observer.disconnect(); clearTimeout(quiet); clearTimeout(limit); resolve(true); };
        const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, 300); });
        observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true, characterData:true});
        quiet = setTimeout(done, 300); const limit = setTimeout(done, 2000);
      })`,
      signal,
    );
  }
  private async snapshot(id: string, entry: Entry, signal: AbortSignal) {
    const snapshot = randomUUID();
    await this.settle(entry, signal);
    const marker = await this.markListeners(entry, signal);
    const result = await this.script(
      entry,
      `(() => { ${helpers}
      // Native controls and ARIA roles, plus what a page made clickable itself: a card or tile with a pointer cursor, or
      // one with a click listener (found by the main process through the DevTools protocol and marked for this read).
      // For nested areas only the outermost counts, so a card is one target, not five; an element that only holds real
      // controls (a framework's root listening for every click) is not a target itself.
      // A pointer that shows only on hover (.cup:hover{cursor:pointer}) is read from the page's own style sheets.
      const hovered = new Set();
      let budget = 3000;
      const rules = list => { for (const rule of Array.from(list || [])) { if (--budget < 0) return; if (rule.cssRules) rules(rule.cssRules);
        if (rule.selectorText && rule.style?.cursor === 'pointer') for (const part of rule.selectorText.split(',')) {
          const plain = part.replace(/:(hover|focus|focus-visible|focus-within|active)\\b/g, '').trim();
          if (plain) try { for (const el of Array.from(document.querySelectorAll(plain)).slice(0, 200)) hovered.add(el); } catch {} } } };
      for (const sheet of Array.from(document.styleSheets)) { try { rules(sheet.cssRules); } catch {} }
      const pointer = el => hovered.has(el) || getComputedStyle(el).cursor === 'pointer';
      const found = new Set(document.querySelectorAll(native));
      const marked = ${JSON.stringify(marker)} ? Array.from(document.querySelectorAll('[' + ${JSON.stringify(marker)} + ']')) : [];
      for (const el of marked) el.removeAttribute(${JSON.stringify(marker)});
      const listening = new Set(marked.filter(el => el !== document.body && el !== document.documentElement && !el.querySelector(native) && !el.closest(native)));
      for (const el of listening) { let up = el.parentElement, outer = true; for (; up; up = up.parentElement) if (listening.has(up)) { outer = false; break; } if (outer) found.add(el); }
      for (const el of Array.from(document.body?.querySelectorAll('*') || []).slice(0, 4000))
        if (!found.has(el) && pointer(el) && !(el.parentElement && pointer(el.parentElement)) && !el.closest(native) && ![...found].some(f => f !== el && !f.matches(native) && f.contains(el))) found.add(el);
      const all = Array.from(found).filter(visible).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const login = all.some(el => sensitive(el) && el.type !== 'hidden' && el.type !== 'file');
      const controls = all.slice(0,150);
      const refs = new Map();
      const elements = login ? [] : controls.filter(el => !sensitive(el) && !el.disabled).map((el,i) => {
        const ref = 'e'+(i+1); refs.set(ref,{el, fingerprint:fingerprint(el)});
        const context = near(el);
        return {ref, role:el.getAttribute('role') || el.tagName.toLowerCase(), label:label(el), ...(context ? {context} : {}), editable:el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text','search','email','url','tel','number'].includes(el.type))};
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
      await publicSite(new URL(url), this.privateHosts(), this.resolve);
      const reused = await this.reuse(url, context);
      if (reused) return reused;
      if (this.tabs.size >= 4) throw new Error('TASK_LIMIT');
      if (
        !context.routine?.() &&
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
      // A page needs a size to lay out: at 0x0 every block (a product card, a tile) is zero wide and looks invisible.
      view?.setBounds({ x: 0, y: 0, width: 1280, height: 900 });
      const contents = view ? view.webContents : this.dock!.create(id, 'agent', partition);
      // Forget the tab at once: closing a page finishes later (on Windows noticeably), and a read in between must
      // report the tab closed instead of waiting on a page that is going away.
      const contentsId = contents.id;
      const dispose = () => {
        this.tabs.delete(id);
        this.origins.delete(contentsId);
        this.inflight.delete(contentsId);
        this.busyAt.delete(contentsId);
        if (this.dock) this.dock.remove(id);
        else if (!contents.isDestroyed()) contents.close();
      };
      const entry: Entry = { contents, view, dispose, owner: context.sessionId, origin: new URL(url).origin, opened: url, busy: true };
      this.tabs.set(id, entry);
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
        network.webRequest.onCompleted(details => details.webContentsId !== undefined && this.track(details.webContentsId, -1));
        network.webRequest.onErrorOccurred(details => details.webContentsId !== undefined && this.track(details.webContentsId, -1));
        network.webRequest.onBeforeRequest((details, cb) => {
          void (async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              const target = new URL(browserUrl(details.url));
              const origin = this.origins.get(details.webContentsId ?? -1);
              if (details.resourceType === 'mainFrame' && (!origin || target.origin !== origin)) return cb({ cancel: true });
              // Check DNS on subresources and redirects too, not just the first page. A public-looking name may resolve
              // to loopback or the intranet. Chromium still owns the connection; this is not DNS pinning.
              await Promise.race([
                publicSite(target, this.privateHosts(), this.resolve),
                new Promise<never>((_done, fail) => {
                  timer = setTimeout(() => fail(new Error('WEB_TIMEOUT')), 5000);
                }),
              ]);
              if (details.webContentsId !== undefined && !this.origins.has(details.webContentsId)) return cb({ cancel: true });
              if (details.webContentsId !== undefined) this.track(details.webContentsId, 1);
              cb({ cancel: false });
            } catch {
              cb({ cancel: true });
            } finally {
              clearTimeout(timer);
            }
          })();
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
        `(() => {${helpers}${selection} return {label:label(el),url:location.href,final:final(el)};})()`,
        context.signal,
      );
      if (info.error) throw new Error(info.error);
      context.review(info.url + '\n' + info.label);
      const final = action === 'click' && info.final === true;
      if (final) context.activity?.(tm('รออนุญาตขั้นสุดท้าย: {0}', info.label));
      if (
        (final || !context.routine?.()) &&
        !(await context.approve(
          final ? tm('ให้ Agent กดขั้นสุดท้ายนี้?') : action === 'fill' ? tm('ให้ Agent กรอกข้อมูลนี้?') : tm('ให้ Agent คลิกเป้าหมายนี้?'),
          info.url +
            '\n' +
            info.label +
            (action === 'fill' ? tm('\nข้อความ: ') + value : '') +
            (final
              ? tm('\nนี่คือการส่งหรือยืนยันรายการบนเว็บ ตรวจข้อมูลในแท็บเว็บให้ครบก่อนอนุมัติ')
              : tm('\nการกระทำนี้อาจส่งข้อมูลหรือยืนยันรายการบนเว็บ ตรวจหน้าเว็บในแท็บเว็บก่อนอนุมัติ')),
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
        return {performed:true,action:${JSON.stringify(action)},readAgain:true${final ? ',final:true' : ''}};
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
