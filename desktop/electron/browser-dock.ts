import { WebContentsView, type BrowserWindow, type Rectangle, type WebContents } from 'electron';

export type DockTab = {
  id: string;
  title: string;
  url: string;
  kind: 'agent' | 'manual';
  loading: boolean;
  preview?: boolean;
  fit?: boolean;
};
export type DockState = { tabs: DockTab[]; active: string; focus?: boolean };
type Docked = { view: WebContentsView; kind: DockTab['kind']; preview: boolean; fit: boolean; fitVersion: number; fullscreen: boolean };

/**
 * The browser lives inside the main window, in the Web tab of the right panel, as in Claude and Codex: each page is a
 * WebContentsView laid over the space the window reserves for it. Pages keep their own sandboxed, per-tab session;
 * the window only tells the dock where to draw. While a dialog covers the panel the page is hidden and the window
 * shows a still picture of it instead, so a dialog is never drawn under the page.
 */
export class BrowserDock {
  private views = new Map<string, Docked>();
  private active = '';
  private bounds: Rectangle | null = null;
  constructor(
    private host: () => BrowserWindow | undefined,
    private emit: (state: DockState) => void,
  ) {}
  /** A new page in the dock, made active and announced so the window can show the Web tab. */
  create(id: string, kind: DockTab['kind'], partition: string, preview = false) {
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition },
    });
    view.setBackgroundColor('#ffffff');
    // Lay the page out at a real size before the window reports where to draw it: at 0x0 every block (a product card,
    // a tile) is zero wide, and the assistant would not see it as something to click.
    view.setBounds(this.bounds || { x: 0, y: 0, width: 1280, height: 900 });
    view.setVisible(false);
    const entry = { view, kind, preview, fit: true, fitVersion: 0, fullscreen: false };
    this.views.set(id, entry);
    const window = this.host();
    if (window && !window.isDestroyed()) window.contentView.addChildView(view);
    const contents = view.webContents;
    const update = () => {
      this.fitPreview(entry);
      this.publish();
    };
    contents.on('page-title-updated', update);
    contents.on('did-navigate', update);
    contents.on('did-navigate-in-page', update);
    contents.on('did-start-loading', update);
    contents.on('did-stop-loading', update);
    contents.on('enter-html-full-screen', () => {
      entry.fullscreen = true;
      entry.fitVersion++;
      if (preview) {
        contents.setZoomFactor(1);
        this.resetPreviewScale(contents);
      }
    });
    contents.on('leave-html-full-screen', () => {
      entry.fullscreen = false;
      this.fitPreview(entry);
    });
    contents.once('destroyed', () => this.forget(id));
    this.active = id;
    this.layout();
    this.publish(true);
    return contents;
  }
  contents(id: string): WebContents | undefined {
    const entry = this.views.get(id);
    return entry && !entry.view.webContents.isDestroyed() ? entry.view.webContents : undefined;
  }
  remove(id: string) {
    const entry = this.views.get(id);
    if (!entry) return;
    this.forget(id);
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
  }
  select(id: string) {
    if (!this.views.has(id)) throw new Error('BROWSER_CLOSED');
    this.active = id;
    this.layout();
    this.publish(true);
  }
  /** Where the window wants the page drawn, in window coordinates; null hides it (other tab, or a dialog on top). */
  setBounds(bounds: Rectangle | null) {
    // DOM geometry is in renderer CSS pixels; native views use device-independent window pixels.
    const zoom = this.host()?.webContents.getZoomFactor() || 1;
    this.bounds =
      bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0
        ? {
            x: Math.round(bounds.x * zoom),
            y: Math.round(bounds.y * zoom),
            width: Math.max(1, Math.round(bounds.width * zoom)),
            height: Math.max(1, Math.round(bounds.height * zoom)),
          }
        : null;
    this.layout();
  }
  setFit(id: string, fit: boolean) {
    const entry = this.views.get(id);
    if (!entry || entry.view.webContents.isDestroyed()) throw new Error('BROWSER_CLOSED');
    if (!entry.preview || !entry.view.webContents.getURL().startsWith('file:')) throw new Error('INVALID_INPUT');
    entry.fit = fit;
    this.fitPreview(entry);
    this.publish();
  }
  /** A still picture of the active page, shown while a dialog covers the panel. */
  async capture() {
    const contents = this.contents(this.active);
    if (!contents) return '';
    const image = await contents.capturePage().catch(() => undefined);
    return image && !image.isEmpty() ? image.toDataURL() : '';
  }
  navigate(id: string, action: 'back' | 'forward' | 'reload') {
    const contents = this.contents(id);
    if (!contents) throw new Error('BROWSER_CLOSED');
    const history = contents.navigationHistory;
    if (action === 'back' && history.canGoBack()) history.goBack();
    if (action === 'forward' && history.canGoForward()) history.goForward();
    if (action === 'reload') contents.reload();
  }
  state(focus = false): DockState {
    const tabs = [...this.views.entries()]
      .filter(([, e]) => !e.view.webContents.isDestroyed())
      .map(([id, e]) => ({
        id,
        kind: e.kind,
        title: e.view.webContents.getTitle().slice(0, 200),
        url: e.view.webContents.getURL(),
        loading: e.view.webContents.isLoading(),
        ...(e.preview && e.view.webContents.getURL().startsWith('file:') ? { preview: true, fit: e.fit } : {}),
      }));
    return { tabs, active: this.active, ...(focus ? { focus: true } : {}) };
  }
  close() {
    for (const id of [...this.views.keys()]) this.remove(id);
  }
  private forget(id: string) {
    const entry = this.views.get(id);
    if (!entry) return;
    this.views.delete(id);
    const window = this.host();
    if (window && !window.isDestroyed()) window.contentView.removeChildView(entry.view);
    if (this.active === id) this.active = [...this.views.keys()].at(-1) || '';
    this.layout();
    this.publish();
  }
  private layout() {
    for (const [id, entry] of this.views) {
      if (entry.view.webContents.isDestroyed()) continue;
      const shown = id === this.active && Boolean(this.bounds);
      if (shown) entry.view.setBounds(this.bounds!);
      entry.view.setVisible(shown);
      this.fitPreview(entry);
    }
  }
  private fitPreview(entry: Docked) {
    const version = ++entry.fitVersion;
    const contents = entry.view.webContents;
    if (!entry.preview || contents.isDestroyed() || entry.fullscreen) return;
    contents.setZoomFactor(1);
    this.resetPreviewScale(contents);
    if (!entry.fit || !entry.view.getVisible() || contents.isLoading() || !contents.getURL().startsWith('file:')) return;
    const bounds = entry.view.getBounds();
    // Responsive HTML lays itself out at the real panel width first. Only oversized content is reduced.
    // Top-level rectangles cover centered fixed slides whose left edge is clipped by overflow:hidden.
    // Long, scrollable reports fit width only; locked-height decks also fit height. The source is never rewritten.
    void contents
      .executeJavaScriptInIsolatedWorld(1042, [
        {
          code: `(() => {
      const root=document.documentElement,body=document.body;
      const boxes=Array.from(body?.children||[]).slice(0,500).map(el=>el.getBoundingClientRect());
      const locked=[root,body].filter(Boolean).some(el=>['hidden','clip'].includes(getComputedStyle(el).overflowY));
      return {
        width:Math.max(root.scrollWidth,body?.scrollWidth||0,...boxes.map(r=>r.width)),
        height:locked?Math.max(...boxes.map(r=>r.height),0):0
      };
    })()`,
        },
      ])
      .then(size => {
        if (entry.fitVersion !== version || contents.isDestroyed() || entry.fullscreen) return;
        if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height)) return;
        const width = size.width > bounds.width + 2 ? bounds.width / size.width : 1;
        const height = size.height > bounds.height + 2 ? bounds.height / size.height : 1;
        const scale = Math.max(0.05, Math.min(1, width, height));
        // Chromium clamps native page zoom to 25%; smaller panels need an additional local layout scale.
        contents.setZoomFactor(Math.max(0.25, scale));
        if (scale < 0.25)
          void contents
            .executeJavaScriptInIsolatedWorld(1042, [
              {
                code: `(() => {
          const root=document.documentElement;
          globalThis.stepPreviewScale={value:root.style.getPropertyValue('zoom'),priority:root.style.getPropertyPriority('zoom')};
          root.style.setProperty('zoom',String((Number.parseFloat(getComputedStyle(root).zoom)||1)*${scale / 0.25}),'important');
        })()`,
              },
            ])
            .catch(() => {});
      })
      .catch(() => {});
  }
  private resetPreviewScale(contents: WebContents) {
    void contents
      .executeJavaScriptInIsolatedWorld(1042, [
        {
          code: `(() => {
      const prior=globalThis.stepPreviewScale;
      if (!prior) return;
      document.documentElement.style.setProperty('zoom',prior.value,prior.priority);
      delete globalThis.stepPreviewScale;
    })()`,
        },
      ])
      .catch(() => {});
  }
  private publish(focus = false) {
    this.emit(this.state(focus));
  }
}
