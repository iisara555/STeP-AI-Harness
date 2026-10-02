import { WebContentsView, type BrowserWindow, type Rectangle, type WebContents } from 'electron';

export type DockTab = { id: string; title: string; url: string; kind: 'agent' | 'manual'; loading: boolean };
export type DockState = { tabs: DockTab[]; active: string; focus?: boolean };
type Docked = { view: WebContentsView; kind: DockTab['kind'] };

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
  create(id: string, kind: DockTab['kind'], partition: string) {
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition },
    });
    view.setBackgroundColor('#ffffff');
    view.setVisible(false);
    this.views.set(id, { view, kind });
    const window = this.host();
    if (window && !window.isDestroyed()) window.contentView.addChildView(view);
    const contents = view.webContents;
    const update = () => this.publish();
    contents.on('page-title-updated', update);
    contents.on('did-navigate', update);
    contents.on('did-navigate-in-page', update);
    contents.on('did-start-loading', update);
    contents.on('did-stop-loading', update);
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
    this.bounds =
      bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && bounds.width > 0 && bounds.height > 0
        ? {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
          }
        : null;
    this.layout();
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
    }
  }
  private publish(focus = false) {
    this.emit(this.state(focus));
  }
}
