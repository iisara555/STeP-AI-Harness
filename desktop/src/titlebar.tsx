import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronDown, PanelLeft, PanelRight, RefreshCw, Search } from 'lucide-react';
import type { DesktopAPI, UpdateState } from './types';
import type { CommandId } from './commands';
import { t } from './i18n';

const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const mod = mac ? '⌘' : 'Ctrl+';
/** A key combination as people read it on this platform: ⌘K on a Mac, Ctrl+K elsewhere. */
export const shortcutText = (combo: string) =>
  combo
    ? combo
        .replace('Mod+', mod)
        .replace('Alt+', mac ? '⌥' : 'Alt+')
        .replace('Shift+', mac ? '⇧' : 'Shift+')
        .replace(/([a-z])$/, c => c.toUpperCase())
    : '';

type Item = { id: string; label: string; hint?: string; run: () => void; danger?: boolean };
type Group = { label: string; items: Item[] };

/**
 * The app's own title bar, as in Codex and Cursor: the STeP menu on the left, a command bar in the middle, and the
 * panel toggles on the right. The window buttons (Windows, Linux) or traffic lights (macOS) are drawn by the system
 * in the space this bar leaves for them; the bar itself drags the window.
 */
export function TitleBar({
  api,
  title,
  run,
  hint,
  left,
  right,
  showRight,
  theme,
}: {
  api: DesktopAPI;
  title: string;
  run: (id: CommandId) => void;
  hint: (id: CommandId) => string;
  left: boolean;
  right: boolean;
  showRight: boolean;
  theme: string;
}) {
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLElement>(null);
  // In-app updates: a downloaded version waits behind "restart to update", as in Cursor and Codex.
  const [update, setUpdate] = useState<UpdateState | null>(null),
    [checked, setChecked] = useState('');
  useEffect(() => {
    void api
      .call('updateState')
      .then(setUpdate)
      .catch(() => {});
    return api.onEvent(event => {
      if (event.type === 'update' && event.update) setUpdate(event.update);
    });
  }, [api]);
  const checkUpdates = async () => {
    setChecked(t('กำลังตรวจหาอัปเดต…'));
    const state: UpdateState | null = await api.call('updateCheck').catch(() => null);
    if (state) setUpdate(state);
    setChecked(
      !state || state.status === 'error'
        ? t('ตรวจหาอัปเดตไม่สำเร็จ ลองใหม่ภายหลัง')
        : state.status === 'disabled'
          ? state.reason === 'UPDATE_POLICY_OFF'
            ? t('องค์กรปิดการอัปเดตในแอป ติดต่อ IT เพื่อรับเวอร์ชันใหม่')
            : t('รุ่นทดสอบนี้ไม่อัปเดตตัวเอง')
          : state.status === 'none'
            ? t('เป็นเวอร์ชันล่าสุดแล้ว ({0})', state.current)
            : '',
    );
    setTimeout(() => setChecked(''), 6000);
  };
  // Keep the Windows window buttons in the app's colours, following the theme (light, dark or the system's).
  useEffect(() => {
    const paint = () => {
      const style = bar.current && getComputedStyle(bar.current);
      const hex = (value: string) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
        return m
          ? '#' +
              m
                .slice(1, 4)
                .map(n => Number(n).toString(16).padStart(2, '0'))
                .join('')
          : '';
      };
      if (!style) return;
      const color = hex(style.backgroundColor),
        symbolColor = hex(style.color);
      if (color && symbolColor) void api.call('windowControl', { action: 'titleBar', color, symbolColor }).catch(() => {});
    };
    paint();
    const watch = new MutationObserver(paint);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', paint);
    return () => {
      watch.disconnect();
      media.removeEventListener('change', paint);
    };
  }, [api]);
  const windowAction = (action: string) => () => void api.call('windowControl', { action }).catch(() => {});
  const command = (id: CommandId, label: string): Item => ({ id, label, hint: hint(id), run: () => run(id) });
  const groups: Group[] = [
    {
      label: t('งาน'),
      items: [
        command('new', t('เริ่มงานใหม่')),
        command('palette', t('ค้นหางานและคำสั่ง')),
        command('receipt', t('ตรวจใบเสร็จก่อนส่ง AFP')),
      ],
    },
    {
      label: t('มุมมอง'),
      items: [
        command('left', left ? t('ซ่อนแถบงาน') : t('แสดงแถบงาน')),
        command('right', right ? t('ซ่อนแผงขวา') : t('แสดงแผงขวา')),
        { id: 'zoom-in', label: t('ขยายตัวอักษร'), hint: shortcutText('Mod+='), run: windowAction('zoomIn') },
        { id: 'zoom-out', label: t('ย่อตัวอักษร'), hint: shortcutText('Mod+-'), run: windowAction('zoomOut') },
        { id: 'zoom-reset', label: t('ขนาดปกติ'), hint: shortcutText('Mod+0'), run: windowAction('zoomReset') },
      ],
    },
    {
      label: t('เครื่องมือ'),
      items: [
        command('skills', t('ศูนย์รวม Skill')),
        command('memory', t('ดูและแก้ไขความจำ')),
        command('usage', t('ดูการใช้งาน AI')),
        command('automations', t('งานตามรอบและเครื่องมือเพิ่มเติม')),
      ],
    },
    {
      label: t('ช่วยเหลือ'),
      items: [
        command('settings', t('ตั้งค่าพื้นที่ทำงาน')),
        command('keyboard', t('คีย์ลัดและ Vim')),
        command('tour', t('ดูทัวร์แนะนำอีกครั้ง')),
        {
          id: 'update',
          label: update?.current ? t('ตรวจหาอัปเดต · เวอร์ชัน {0}', update.current) : t('ตรวจหาอัปเดต'),
          hint: '',
          run: () => void checkUpdates(),
        },
        ...(mac ? [] : [{ id: 'quit', label: t('ออกจากแอป'), hint: '', run: windowAction('quit'), danger: true }]),
      ],
    },
  ];
  return (
    <header ref={bar} className={'titlebar' + (mac ? ' mac' : '')}>
      <div className="titlebar-start">
        <div className="titlebar-menu">
          <button
            className="titlebar-app"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t('เมนู STeP')}
            title={t('เมนู STeP')}
            onClick={() => setOpen(!open)}
          >
            <span className="titlebar-mark" aria-hidden="true">
              STeP
            </span>
            <ChevronDown size={13} />
          </button>
          {open && (
            <>
              <div className="menu-backdrop titlebar-backdrop" onClick={() => setOpen(false)} />
              <div
                className="titlebar-dropdown"
                role="menu"
                aria-label={t('เมนู STeP')}
                onKeyDown={e => {
                  if (e.key === 'Escape') setOpen(false);
                }}
              >
                {groups.map(group => (
                  <div className="titlebar-group" role="group" aria-label={group.label} key={group.label}>
                    <div className="titlebar-group-label">{group.label}</div>
                    {group.items.map((item, i) => (
                      <button
                        key={item.id}
                        role="menuitem"
                        className={'titlebar-item' + (item.danger ? ' titlebar-danger' : '')}
                        autoFocus={group === groups[0] && i === 0}
                        onClick={() => {
                          setOpen(false);
                          item.run();
                        }}
                      >
                        <span>{item.label}</span>
                        {item.hint && <kbd>{item.hint}</kbd>}
                      </button>
                    ))}
                    {group === groups[1] && (
                      <div className="titlebar-theme" role="group" aria-label={t('ธีม')}>
                        <span>{t('ธีม')}</span>
                        {(
                          [
                            ['theme-system', t('ตามระบบ')],
                            ['theme-light', t('สว่าง')],
                            ['theme-dark', t('มืด')],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            role="menuitemradio"
                            aria-checked={theme === id.slice(6)}
                            className="titlebar-chip"
                            onClick={() => {
                              setOpen(false);
                              run(id);
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          className="icon titlebar-icon"
          aria-label={left ? t('ซ่อนแถบงาน') : t('แสดงแถบงาน')}
          title={left ? t('ซ่อนแถบงาน') : t('แสดงแถบงาน')}
          aria-pressed={left}
          onClick={() => run('left')}
        >
          <PanelLeft size={16} />
        </button>
      </div>
      <button className="titlebar-command quiet" onClick={() => run('palette')} title={t('ค้นหางานและคำสั่ง')}>
        <Search size={13} />
        <span>{title || t('ค้นหางานและคำสั่ง')}</span>
        <kbd>{hint('palette')}</kbd>
      </button>
      <div className="titlebar-end">
        {checked && (
          <span className="titlebar-note" role="status">
            {checked}
          </span>
        )}
        {update?.status === 'ready' && (
          <button
            className="titlebar-update"
            title={t('ติดตั้งเวอร์ชัน {0} แล้วเปิดแอปใหม่ งานที่ค้างไว้ยังอยู่', update.version || '')}
            onClick={() => void api.call('updateInstall').catch(() => {})}
          >
            <RefreshCw size={13} />
            {t('รีสตาร์ทเพื่ออัปเดต')}
          </button>
        )}
        {update?.status === 'manual' && (
          <button
            className="titlebar-update"
            title={t('Mac รุ่นนี้ติดตั้งอัปเดตเองไม่ได้ ดาวน์โหลดเวอร์ชัน {0} แล้วลากไปที่ Applications', update.version || '')}
            onClick={() => void api.call('updateDownload').catch(() => {})}
          >
            <ArrowDownToLine size={13} />
            {t('ดาวน์โหลดเวอร์ชัน {0}', update.version || '')}
          </button>
        )}
        {showRight && (
          <button
            className="icon titlebar-icon"
            aria-label={right ? t('ซ่อนแผงขวา') : t('แสดงแผงขวา')}
            title={right ? t('ซ่อนแผงขวา') : t('แสดงแผงขวา')}
            aria-pressed={right}
            onClick={() => run('right')}
          >
            <PanelRight size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
