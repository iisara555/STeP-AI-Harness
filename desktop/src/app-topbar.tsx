import { Brain, CalendarClock, ChevronDown, Copy, Download, FileText } from './icons';
import { t } from './i18n';
import type { AppView } from './use-workspace';

/** Page title, task menu and the draft toggle above the main pane. */
export function AppTopbar({ v }: { v: AppView }) {
  const {
    action,
    api,
    chatMenu,
    navigate,
    notify,
    openPanel,
    pageTitle,
    refresh,
    running,
    save,
    selectSession,
    session,
    setChatMenu,
    setLearningOpen,
    setLearningText,
    setMemoryOpen,
    setRight,
    setSettings,
    settings,
    showPanel,
    taskMeta,
    view,
  } = v;
  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          <span className="topbar-heading">
            <strong>{pageTitle}</strong>
            {/* Like Claude Desktop, task commands live in a menu next to the title. */}
            {!settings && view === 'chat' && session && (
              <button
                className="icon"
                aria-label={t('ตัวเลือกงานนี้')}
                title={t('ตัวเลือกงานนี้')}
                aria-haspopup="menu"
                aria-expanded={chatMenu}
                onClick={() => setChatMenu(!chatMenu)}
              >
                <ChevronDown size={16} />
              </button>
            )}
          </span>
          {chatMenu && session && (
            <>
              <div className="menu-backdrop" onClick={() => setChatMenu(false)} />
              <div
                className="title-menu"
                role="menu"
                aria-label={t('ตัวเลือกงานนี้')}
                onKeyDown={e => {
                  if (e.key === 'Escape') setChatMenu(false);
                }}
              >
                <button
                  role="menuitem"
                  autoFocus
                  disabled={running}
                  onClick={() =>
                    void action(async () => {
                      setChatMenu(false);
                      await save();
                      const forked = await api.call('sessionFork', { id: session.id });
                      await refresh();
                      await selectSession(forked.id);
                    })
                  }
                >
                  <Copy size={15} />
                  {t('ทำสำเนาเป็นงานใหม่')}
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    void action(async () => {
                      setChatMenu(false);
                      await save();
                      const result = await api.call('sessionExport', { id: session.id, format: 'md' });
                      if (result) notify(t('บันทึกบทสนทนาแล้ว'));
                    })
                  }
                >
                  <Download size={15} />
                  {t('ส่งออก Markdown')}
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    void action(async () => {
                      setChatMenu(false);
                      await save();
                      const result = await api.call('sessionExport', { id: session.id, format: 'json' });
                      if (result) notify(t('บันทึกบทสนทนาแล้ว'));
                    })
                  }
                >
                  <Download size={15} />
                  {t('บันทึกบทสนทนาเป็นไฟล์')}
                </button>
                <hr />
                <button
                  role="menuitem"
                  onClick={() => {
                    setChatMenu(false);
                    setMemoryOpen(true);
                  }}
                >
                  <Brain size={15} />
                  {t('ความจำ')}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setChatMenu(false);
                    setLearningText('');
                    setLearningOpen(true);
                  }}
                >
                  <Brain size={15} />
                  {t('กล่องบทเรียน')}
                </button>
                <button
                  role="menuitem"
                  title={t('ตั้งให้ผู้ช่วยทำงานซ้ำตามเวลา เช่น ทุกเช้าวันทำงาน')}
                  onClick={() => {
                    setChatMenu(false);
                    setSettings(false);
                    navigate('schedules');
                  }}
                >
                  <CalendarClock size={15} />
                  {t('งานตั้งเวลา')}
                </button>
              </div>
            </>
          )}
          <small>
            {settings
              ? t('จัดการ AI บัญชีที่เชื่อมต่อ และผู้ช่วยของคุณ')
              : view === 'documents'
                ? t('ใส่ข้อมูลหรือแนบต้นเรื่อง ให้ AI ช่วยร่าง แล้วตรวจแก้ก่อนส่งออก')
                : view === 'media'
                  ? t('สร้าง Prompt ภาพสำหรับสื่อสารภายใน ตามสีองค์กรและห้ามสร้างโลโก้')
                  : view === 'receipt'
                    ? t('ทดลอง · อ่านใบเสร็จด้วย OCR ในเครื่อง แล้วให้คุณตรวจก่อนส่ง')
                    : view === 'skills'
                      ? t('ค้นหา Skill และดูว่ารายการใดพร้อมใช้')
                      : view === 'schedules'
                        ? t('ให้ผู้ช่วยทำงานซ้ำตามเวลา ผลเป็นร่างให้คุณตรวจ')
                        : session
                          ? taskMeta(session)
                          : ''}
          </small>
        </div>
        {!settings && view === 'chat' && (
          <button className="quiet" onClick={() => (showPanel ? setRight(false) : openPanel())}>
            <FileText size={16} />
            {showPanel ? t('ซ่อนร่าง') : t('เปิดร่าง')}
          </button>
        )}
      </header>
    </>
  );
}
