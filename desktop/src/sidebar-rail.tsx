import { useRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes } from 'react';
import { MotionConfig } from 'motion/react';
import { useReducedMotion } from './reduced-motion';
import {
  Blocks,
  CalendarClock,
  FileText,
  LoaderCircle,
  Megaphone,
  MessageSquare,
  Plus,
  Receipt,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { t } from './i18n';
import { BlocksIcon } from './animated-icons/blocks';
import { CalendarClockIcon } from './animated-icons/calendar-clock';
import { FileTextIcon } from './animated-icons/file-text';
import { MegaphoneIcon } from './animated-icons/megaphone';
import { MessageSquareIcon } from './animated-icons/message-square';
import { PlusIcon } from './animated-icons/plus';
import { ReceiptIcon } from './animated-icons/receipt';
import { SearchIcon } from './animated-icons/search';
import { SlidersHorizontalIcon } from './animated-icons/sliders-horizontal';

type AnimatedIcon = ForwardRefExoticComponent<
  { size?: number; className?: string } & RefAttributes<{ startAnimation: () => void; stopAnimation: () => void }>
>;

/** A rail icon that plays its small animation while the button is hovered or has keyboard focus. */
function RailButton({
  icon: Icon,
  stillIcon: StillIcon,
  label,
  size = 17,
  className = '',
  tour,
  busy,
  onClick,
}: {
  icon: AnimatedIcon;
  stillIcon: LucideIcon;
  label: string;
  size?: number;
  className?: string;
  tour?: string;
  busy?: ReactNode;
  onClick: () => void;
}) {
  const reduced = useReducedMotion();
  const icon = useRef<{ startAnimation: () => void; stopAnimation: () => void }>(null);
  const start = () => !reduced && icon.current?.startAnimation();
  const stop = () => icon.current?.stopAnimation();
  return (
    <button
      className={`rail-button ${className}`}
      data-tour={tour}
      aria-label={label}
      data-tip={label}
      onClick={onClick}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
    >
      {busy || (reduced ? <StillIcon size={size} className="rail-icon" /> : <Icon ref={icon} size={size} className="rail-icon" />)}
    </button>
  );
}

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
  onProfile,
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
  onView: (view: 'documents' | 'media' | 'skills' | 'schedules' | 'receipt') => void;
  onSettings: () => void;
  onProfile: () => void;
}) {
  const tools = [
    ['documents', t('เครื่องมือร่างเอกสาร'), FileTextIcon, FileText],
    ['media', t('สื่อภายใน'), MegaphoneIcon, Megaphone],
    ['skills', t('ตัวช่วยงาน'), BlocksIcon, Blocks],
    ['schedules', t('งานตั้งเวลา'), CalendarClockIcon, CalendarClock],
    ['receipt', t('ตรวจใบเสร็จ AFP'), ReceiptIcon, Receipt],
  ] as const;
  return (
    // Animations follow the computer's "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <aside className="sidebar rail" aria-label={t('แถบงาน')}>
        <div className="rail-brand">{brand}</div>
        <RailButton
          icon={PlusIcon}
          stillIcon={Plus}
          size={18}
          className="rail-new"
          tour="new-work"
          label={t('เริ่มงานใหม่')}
          onClick={onNew}
        />
        <RailButton icon={SearchIcon} stillIcon={Search} label={t('ค้นหางาน')} onClick={onSearch} />
        <RailButton icon={MessageSquareIcon} stillIcon={MessageSquare} label={t('งานทั้งหมด')} onClick={onTasks} />
        <span className="rail-divider" aria-hidden="true" />
        <nav aria-label={t('เครื่องมือ')}>
          {tools.map(([id, label, Icon, StillIcon]) => (
            <RailButton
              key={id}
              icon={Icon}
              stillIcon={StillIcon}
              tour={id}
              className={view === id && !settings ? 'nav-active' : ''}
              label={label}
              busy={
                id === 'receipt' &&
                receiptBusy &&
                view !== 'receipt' && <LoaderCircle size={17} className="spin" aria-label={t('กำลังตรวจใบเสร็จอยู่')} />
              }
              onClick={() => onView(id)}
            />
          ))}
        </nav>
        <span className="rail-spacer" />
        <RailButton
          icon={SlidersHorizontalIcon}
          stillIcon={SlidersHorizontal}
          size={18}
          className={settings ? 'nav-active' : ''}
          tour="settings"
          label={t('ตั้งค่าพื้นที่ทำงาน')}
          onClick={onSettings}
        />
        <button
          className="rail-profile"
          data-tour="version"
          data-tip={profileName}
          aria-label={`${t('รูปโปรไฟล์')} · ${profileName}`}
          onClick={onProfile}
        >
          {avatar}
        </button>
      </aside>
    </MotionConfig>
  );
}
