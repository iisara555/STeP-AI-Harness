import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Bot, Send } from 'lucide-react';
import type { BrowserDockState, DesktopAPI } from './types';
import { t } from './i18n';
import { SectionArt } from './illustration';

// Anything drawn over the page area (a dialog, a notification, a menu, the tour) would sit under the native page, so the
// page is hidden while one overlaps it. A dialog beside the panel leaves the page live, to check before approving.
const FLOATING = '[aria-modal="true"], .toast, .tour-dim, .tour-card, [role="menu"], [role="listbox"]';
const covered = (box: DOMRect) =>
  Array.from(document.querySelectorAll(FLOATING)).some(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
  });
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * The Web tab's browser: pages the assistant opens and pages the employee opens show here, inside the main window,
 * as in Claude and Codex. The page itself is drawn by the main process over the `.browser-host` box; this component
 * tells it where that box is, and shows a still picture of the page while a dialog covers the panel.
 */
export function BrowserDockView({
  api,
  run,
  intro,
  onSource,
  onBrowserTask,
  suggested,
}: {
  api: DesktopAPI;
  suggested?: string;
  run: (fn: () => Promise<void>) => void;
  intro: ReactNode;
  onSource: (text: string) => void;
  onBrowserTask: (url: string) => void;
}) {
  const [state, setState] = useState<BrowserDockState>({ tabs: [], active: '' });
  const [still, setStill] = useState('');
  const [url, setUrl] = useState('https://');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (suggested) setUrl(suggested);
  }, [suggested]);
  useEffect(() => {
    void api
      .call('browserDock', { action: 'state' })
      .then(setState)
      .catch(() => {});
    return api.onEvent(event => {
      if (event.type === 'browser' && event.browser) setState(event.browser);
    });
  }, [api]);
  const active = state.tabs.find(tab => tab.id === state.active);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !active) return;
    let frame = 0,
      last = '',
      hidden = false,
      live = true;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(async () => {
        if (!live) return;
        const r = el.getBoundingClientRect();
        if (covered(r)) {
          if (hidden) return;
          hidden = true;
          last = '';
          // Take the picture while the page is still shown, then hide it so the dialog is never drawn under it.
          const picture = await api.call('browserDock', { action: 'capture' }).catch(() => '');
          if (live && hidden) setStill(picture || '');
          void api.call('browserDock', { action: 'bounds', bounds: null });
          return;
        }
        hidden = false;
        setStill('');
        const bounds = { x: r.left, y: r.top, width: r.width, height: r.height };
        const key = JSON.stringify(bounds);
        if (key === last) return;
        last = key;
        void api.call('browserDock', { action: 'bounds', bounds });
      });
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(el);
    const dialogs = new MutationObserver(place);
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'class', 'style'] });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      dialogs.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      void api.call('browserDock', { action: 'bounds', bounds: null }).catch(() => {});
    };
  }, [api, active?.id]);
  const open = (
    <form
      className="browser-open"
      onSubmit={e => {
        e.preventDefault();
        run(async () => {
          await api.call('toolBrowser', { url });
        });
      }}
    >
      <input aria-label="Browser URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" />
      <button>{t('เปิดเว็บ')}</button>
    </form>
  );
  if (!active)
    return (
      <div className="tool-section">
        <div className="browser-empty-intro">
          <div>{intro}</div>
          <SectionArt scene="browser" className="browser-illustration" />
        </div>
        {open}
        <p className="muted small">{t('เปิดในแท็บนี้ แยกจากบัญชี AI อ่านหน้าเว็บกลับมาเพื่อตรวจ แล้วส่งเข้าช่องคุยได้')}</p>
      </div>
    );
  const call = (action: string, id = active.id) =>
    run(async () => {
      await api.call('browserDock', { action, id });
    });
  return (
    <div className="browser-dock">
      <div className="browser-tabs" role="tablist" aria-label={t('หน้าเว็บที่เปิด')}>
        {state.tabs.map(tab => (
          <div key={tab.id} className={'browser-tab' + (tab.id === active.id ? ' active' : '')}>
            <button role="tab" aria-selected={tab.id === active.id} title={tab.url} onClick={() => call('select', tab.id)}>
              {tab.kind === 'agent' && <Bot size={13} aria-label={t('ผู้ช่วย')} />}
              <span>{tab.title || host(tab.url) || t('กำลังโหลด…')}</span>
            </button>
            <button className="icon" aria-label={t('ปิดเว็บนี้')} title={t('ปิดเว็บนี้')} onClick={() => call('close', tab.id)}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="browser-bar">
        <button className="icon" aria-label={t('ย้อนกลับ')} title={t('ย้อนกลับ')} onClick={() => call('back')}>
          <ArrowLeft size={14} />
        </button>
        <button className="icon" aria-label={t('ไปข้างหน้า')} title={t('ไปข้างหน้า')} onClick={() => call('forward')}>
          <ArrowRight size={14} />
        </button>
        <button className="icon" aria-label={t('โหลดใหม่')} title={t('โหลดใหม่')} onClick={() => call('reload')}>
          <RotateCw size={14} className={active.loading ? 'spin' : undefined} />
        </button>
        <span className="browser-url" title={active.url}>
          {active.url}
        </span>
        {active.kind === 'manual' && (
          <>
            <button
              className="icon"
              aria-label={t('ส่งเข้าช่องคุย')}
              title={t('ส่งเข้าช่องคุย')}
              onClick={() =>
                run(async () => {
                  const page = await api.call('toolBrowserRead', { id: active.id });
                  onSource(`Web source: ${page.url}\n\n${page.text}`);
                })
              }
            >
              <Send size={14} />
            </button>
            <button
              className="icon"
              aria-label={t('ให้ผู้ช่วยทำงานบนเว็บ')}
              title={t('ให้ผู้ช่วยทำงานบนเว็บ')}
              onClick={() => onBrowserTask(active.url)}
            >
              <Bot size={14} />
            </button>
          </>
        )}
      </div>
      <div className="browser-host" ref={box}>
        {still && <img src={still} alt="" />}
      </div>
      <div className="browser-footer">{open}</div>
    </div>
  );
}
