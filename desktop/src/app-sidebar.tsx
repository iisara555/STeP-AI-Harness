import {
  Blocks,
  CalendarClock,
  FileText,
  LoaderCircle,
  Megaphone,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Receipt,
  SlidersHorizontal,
  Trash2,
} from './icons';
import { SidebarRail } from './sidebar-rail';
import { TASK_ALERT_LABELS } from './task-alerts';
import { UpdateCard, VersionLine } from './update';
import { groupSessions } from './ui';
import { t } from './i18n';
import { toolCount } from './skill-capabilities';
import type { AppView } from './use-workspace';

/** The task list, folded to a rail of icons or open with search, filters and tools. */
export function AppSidebar({ v }: { v: AppView }) {
  const {
    action,
    alertOf,
    api,
    brandSymbol,
    commandRef,
    create,
    filter,
    filtered,
    fullSidebar,
    navigate,
    needsYou,
    openSettings,
    profileAvatar,
    receiptBusy,
    refresh,
    renameCancelled,
    renaming,
    running,
    saveRename,
    search,
    selectSession,
    selected,
    setFilter,
    setPalette,
    setRemoving,
    setRenaming,
    setSettings,
    settings,
    snapshot,
    staffSkills,
    taskMeta,
    update,
    view,
  } = v;
  return (
    <>
      {!fullSidebar && (
        <SidebarRail
          brand={brandSymbol}
          avatar={profileAvatar}
          profileName={[snapshot.settings.userName || snapshot.settings.assistant, snapshot.appVersion && `v${snapshot.appVersion}`]
            .filter(Boolean)
            .join(' · ')}
          view={view}
          settings={settings}
          receiptBusy={receiptBusy}
          needsYou={needsYou}
          onNew={() => void action(create)}
          onSearch={() => setPalette(true)}
          onTasks={() => commandRef.current.left?.()}
          onView={next => {
            setSettings(false);
            navigate(next);
          }}
          onSettings={() => openSettings()}
          onProfile={() => openSettings()}
        />
      )}
      {fullSidebar && (
        <aside className="sidebar" aria-label={t('แถบงาน')}>
          <div className="brand">
            <div>{brandSymbol}</div>
          </div>
          <button className="new-work" data-tour="new-work" onClick={() => void action(create)}>
            <Plus size={18} /> {t('เริ่มงานใหม่')}
          </button>
          <div className="session-filter" role="tablist" aria-label={t('กรองงาน')}>
            {(
              [
                ['all', t('งานทั้งหมด'), MessageSquare],
                ['artifacts', t('มีผลงาน'), FileText],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? 'active' : ''}
                onClick={() => {
                  setFilter(value);
                  setSettings(false);
                  navigate('chat');
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          {filter !== 'all' && <div className="recent-label">{t('ร่างที่บันทึกแล้ว')}</div>}
          <div className="sessions">
            {groupSessions(filtered).map(group => (
              <section key={group.label} aria-label={group.label}>
                <div className="session-group">{group.label}</div>
                {group.sessions.map(s =>
                  renaming?.id === s.id ? (
                    <input
                      key={s.id}
                      className="session-rename"
                      aria-label={t('ชื่องาน')}
                      autoFocus
                      onFocus={() => (renameCancelled.current = false)}
                      value={renaming.title}
                      onChange={e => setRenaming({ ...renaming, title: e.target.value })}
                      // Like other chat apps, clicking away keeps the new name; Escape is the way to cancel.
                      onBlur={() => void saveRename()}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          renameCancelled.current = true;
                          setRenaming(null);
                        }
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <div key={s.id} className={`session ${selected === s.id ? 'selected' : ''}`}>
                      <button className="session-open" title={t(s.title)} onClick={() => void action(() => selectSession(s.id))}>
                        <span>{t(s.title)}</span>
                        <small>{taskMeta(s)}</small>
                      </button>
                      {alertOf(s) && (
                        <span
                          className={'task-alert ' + alertOf(s)}
                          role="img"
                          aria-label={t(TASK_ALERT_LABELS[alertOf(s)!])}
                          title={t(TASK_ALERT_LABELS[alertOf(s)!])}
                        />
                      )}
                      <span className="session-actions">
                        <button
                          className="icon"
                          aria-label={s.pinned ? t('เลิกปักหมุด') : t('ปักหมุด')}
                          onClick={() =>
                            void action(async () => {
                              await api.call('pin', { id: s.id, pinned: !s.pinned });
                              await refresh();
                            })
                          }
                        >
                          {s.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        <button className="icon" aria-label={t('เปลี่ยนชื่อ')} onClick={() => setRenaming({ id: s.id, title: s.title })}>
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon"
                          aria-label={t('ลบงาน')}
                          disabled={running && selected === s.id}
                          onClick={() => setRemoving(s)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </div>
                  ),
                )}
              </section>
            ))}
            {!filtered.length && (
              <p className="muted small">
                {search
                  ? t('ไม่พบงานที่ตรงกับคำค้น')
                  : filter === 'artifacts'
                    ? t('ยังไม่มีร่างที่บันทึก งานที่มีร่างจาก AI หรือร่างที่คุณบันทึกจะอยู่ที่นี่')
                    : t('เมื่อเริ่มงาน บทสนทนาจะอยู่ที่นี่')}
              </p>
            )}
          </div>
          <div className="session-group tools-group">{t('เครื่องมือ')}</div>
          <nav className="tools-nav" aria-label={t('เครื่องมือ')}>
            <button
              data-tour="documents"
              className={view === 'documents' && !settings ? 'nav-active' : ''}
              onClick={() => {
                setSettings(false);
                navigate('documents');
              }}
            >
              <FileText size={17} />
              <span className="nav-label">{t('เครื่องมือร่างเอกสาร')}</span>
              <span className="nav-short" aria-hidden="true">
                {t('เอกสาร')}
              </span>
            </button>
            <button
              data-tour="media"
              className={view === 'media' && !settings ? 'nav-active' : ''}
              onClick={() => {
                setSettings(false);
                navigate('media');
              }}
            >
              <Megaphone size={17} />
              <span className="nav-label">{t('สื่อภายใน')}</span>
              <span className="nav-short" aria-hidden="true">
                {t('สื่อ')}
              </span>
            </button>
            <button
              data-tour="skills"
              className={view === 'skills' && !settings ? 'nav-active' : ''}
              onClick={() => {
                setSettings(false);
                navigate('skills');
              }}
            >
              <Blocks size={17} />
              <span className="nav-label">{t('ศูนย์รวม Skill')}</span>
              <span className="nav-short" aria-hidden="true">
                {t('Skill')}
              </span>
              <span className="count">{staffSkills ? staffSkills.length + toolCount : ''}</span>
            </button>
            <button
              data-tour="schedules"
              className={view === 'schedules' && !settings ? 'nav-active' : ''}
              onClick={() => {
                setSettings(false);
                navigate('schedules');
              }}
            >
              <CalendarClock size={17} />
              <span className="nav-label">{t('งานตั้งเวลา')}</span>
              <span className="nav-short" aria-hidden="true">
                {t('ตั้งเวลา')}
              </span>
            </button>
            <button
              data-tour="receipt"
              className={view === 'receipt' && !settings ? 'nav-active' : ''}
              onClick={() => {
                setSettings(false);
                navigate('receipt');
              }}
            >
              <Receipt size={17} />
              <span className="nav-label">{t('ตรวจใบเสร็จ AFP')}</span>
              <span className="nav-short" aria-hidden="true">
                {t('ใบเสร็จ')}
              </span>
              {receiptBusy && view !== 'receipt' ? (
                <LoaderCircle size={14} className="spin" aria-label={t('กำลังตรวจใบเสร็จอยู่')} />
              ) : (
                <span className="beta">{t('ทดลอง')}</span>
              )}
            </button>
          </nav>
          <UpdateCard api={api} update={update} />
          <div className="profile" data-tour="version">
            {profileAvatar}
            <div>
              {snapshot.settings.userName || snapshot.settings.assistant}
              <small>
                {snapshot.settings.userName ? t('ผู้ช่วย {0} · ', snapshot.settings.assistant) : ''}
                {snapshot.settings.team ? t('ทีม {0}', snapshot.settings.team.toUpperCase()) : t('ยังไม่เลือกทีม')}
              </small>
              <VersionLine api={api} update={update} version={snapshot.appVersion || ''} />
            </div>
            {/* Settings sits with the person it belongs to, as in Claude, Notion and Slack. */}
            <button
              className={`icon settings-button ${settings ? 'nav-active' : ''}`}
              data-tour="settings"
              aria-label={t('การตั้งค่า')}
              title={t('การตั้งค่า')}
              aria-pressed={settings}
              onClick={() => openSettings()}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
