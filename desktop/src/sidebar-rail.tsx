import type { ReactNode } from 'react';
import { Blocks, FileText, LoaderCircle, MessageSquare, Plus, ReceiptText, Search, Settings2 } from 'lucide-react';
import { t } from './i18n';

const SIDEBAR_KEY = 'step.sidebar';

/** The employee's last choice, full task list (true) or icons only (false); null when they have not chosen yet. */
export function readSidebarChoice(): boolean | null {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    return saved === 'full' ? true : saved === 'rail' ? false : null;
  } catch {
    return null;
  }
}

export function saveSidebarChoice(full: boolean) {
  try {
    localStorage.setItem(SIDEBAR_KEY, full ? 'full' : 'rail');
  } catch {
    // Only a convenience: without storage the sidebar simply opens in its default state next time.
  }
}

/**
 * The task list folded down to a column of icons, as in Claude and Codex: the same actions as the full sidebar, each
 * named in a tooltip and to screen readers. The task list itself opens the full sidebar again.
 */
export function SidebarRail({
  brand,
  avatar,
  profileName,
  view,
  settings,
  receiptBusy,
  onNew,
  onSearch,
  onTasks,
  onView,
  onSettings,
}: {
  brand: ReactNode;
  avatar: ReactNode;
  profileName: string;
  view: string;
  settings: boolean;
  receiptBusy: boolean;
  onNew: () => void;
  onSearch: () => void;
  onTasks: () => void;
  onView: (view: 'documents' | 'skills' | 'receipt') => void;
  onSettings: () => void;
}) {
  const tools = [
    ['documents', t('เครื่องมือร่างเอกสาร'), FileText],
    ['skills', t('ศูนย์รวม Skill'), Blocks],
    ['receipt', t('ตรวจใบเสร็จ AFP'), ReceiptText],
  ] as const;
  return (
    <aside className="sidebar rail" aria-label={t('แถบงาน')}>
      <div className="rail-brand">{brand}</div>
      <button
        className="rail-button rail-new"
        data-tour="new-work"
        aria-label={t('เริ่มงานใหม่')}
        data-tip={t('เริ่มงานใหม่')}
        onClick={onNew}
      >
        <Plus size={18} />
      </button>
      <button className="rail-button" aria-label={t('ค้นหางาน')} data-tip={t('ค้นหางาน')} onClick={onSearch}>
        <Search size={17} />
      </button>
      <button className="rail-button" aria-label={t('งานทั้งหมด')} data-tip={t('งานทั้งหมด')} onClick={onTasks}>
        <MessageSquare size={17} />
      </button>
      <span className="rail-divider" aria-hidden="true" />
      <nav aria-label={t('เครื่องมือ')}>
        {tools.map(([id, label, Icon]) => (
          <button
            key={id}
            data-tour={id}
            className={`rail-button ${view === id && !settings ? 'nav-active' : ''}`}
            aria-label={label}
            data-tip={label}
            onClick={() => onView(id)}
          >
            {id === 'receipt' && receiptBusy && view !== 'receipt' ? (
              <LoaderCircle size={17} className="spin" aria-label={t('กำลังตรวจใบเสร็จอยู่')} />
            ) : (
              <Icon size={17} />
            )}
          </button>
        ))}
      </nav>
      <span className="rail-spacer" />
      <button
        className={`rail-button ${settings ? 'nav-active' : ''}`}
        data-tour="settings"
        aria-label={t('ตั้งค่าพื้นที่ทำงาน')}
        data-tip={t('ตั้งค่าพื้นที่ทำงาน')}
        onClick={onSettings}
      >
        <Settings2 size={18} />
      </button>
      <div className="rail-profile" data-tour="version" data-tip={profileName}>
        {avatar}
      </div>
    </aside>
  );
}
