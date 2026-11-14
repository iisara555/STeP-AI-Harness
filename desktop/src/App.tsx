import { LoaderCircle, Sparkles } from './icons';
import symbolColour from './assets/step-symbol-colour.svg';
import symbolWhite from './assets/step-symbol-mono-white.svg';
import ideaArt from './assets/illustrations/idea.png';
import { Avatar } from './avatars';
import { initial } from './messages';
import { COMMANDS } from './commands';
import { TitleBar, shortcutText } from './titlebar';
import { t, useLanguage } from './i18n';
import { useWorkspace, type AppView } from './use-workspace';
import { AppSidebar } from './app-sidebar';
import { AppTopbar } from './app-topbar';
import { ToolScreens } from './app-tool-screens';
import { ConversationView } from './conversation-view';
import { StatusBar } from './status-bar';
import { SidePanel } from './side-panel';
import { AppDialogs } from './app-dialogs';

export default function App() {
  // Re-render once the English dictionary arrives (it loads on demand when English is chosen).
  useLanguage();
  const ws = useWorkspace();
  const {
    api,
    snapshot,
    settings,
    search,
    setSearch,
    error,
    right,
    width,
    view,
    session,
    showPanel,
    fullSidebar,
    startupPending,
    initializeWorkspace,
    commandRef,
  } = ws;
  if (!api)
    return (
      <main className="browser-message">
        <Sparkles size={36} />
        <h1>STeP Desktop</h1>
        <p>{t('พื้นที่ทำงานนี้ใช้ผ่านแอป Desktop เพื่อเชื่อมต่อ AI และจัดเก็บไฟล์ในเครื่อง')}</p>
        <p>{t('หน้านี้เป็นการเปิด UI ในเบราว์เซอร์ จึงยังใช้บัญชีหรือไฟล์จริงไม่ได้')}</p>
      </main>
    );
  if (!snapshot)
    return (
      <main className="browser-message">
        <img className="illustration empty-art" src={ideaArt} alt="" />
        {error ? (
          <>
            <div role="alert">
              <h1>{t('ยังเปิดพื้นที่ทำงานไม่ได้')}</h1>
              <p>{error}</p>
              <p>{t('ลองเปิดอีกครั้ง ข้อมูลงานที่บันทึกไว้ยังอยู่ในเครื่อง')}</p>
            </div>
            <button disabled={startupPending} onClick={() => void initializeWorkspace()}>
              {t('ลองเปิดอีกครั้ง')}
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" aria-hidden="true" />
            <p role="status">{t('กำลังเปิดพื้นที่ทำงาน…')}</p>
          </>
        )}
      </main>
    );
  const pageTitle = settings
    ? t('การตั้งค่า')
    : view === 'documents'
      ? t('เครื่องมือร่างเอกสาร')
      : view === 'media'
        ? t('สื่อภายใน')
        : view === 'receipt'
          ? t('ตรวจใบเสร็จ AFP')
          : view === 'skills'
            ? t('ศูนย์รวม Skill')
            : view === 'schedules'
              ? t('งานตั้งเวลา')
              : session?.title || t('เริ่มต้นงานที่อยากทำ');
  const brandSymbol = (
    <span className="brand-symbol" role="img" aria-label="STeP">
      <img className="on-light" src={symbolColour} alt="" />
      <img className="on-dark" src={symbolWhite} alt="" />
    </span>
  );
  const profileAvatar = (
    <Avatar
      id={snapshot.settings.avatar}
      fallback={initial(snapshot.settings.userName || '') || snapshot.settings.team.toUpperCase() || 'ST'}
    />
  );
  const v: AppView = { ...ws, api, snapshot, pageTitle, brandSymbol, profileAvatar };
  return (
    <div className={showPanel ? 'shell panel-open' : 'shell'}>
      <TitleBar
        api={api}
        title={pageTitle}
        run={id => commandRef.current[id]?.()}
        hint={id => shortcutText(snapshot.settings.keybindings?.[id] ?? COMMANDS.find(c => c[0] === id)?.[2] ?? '')}
        left={fullSidebar}
        right={right}
        showRight={!settings && view === 'chat'}
        theme={snapshot.settings.theme}
        feedback={snapshot.policy?.features.feedback !== false}
        search={fullSidebar ? { value: search, onChange: setSearch } : undefined}
      />
      <div className="app" style={{ '--artifact-width': `${width}px` } as React.CSSProperties}>
        <AppSidebar v={v} />
        <main className="main-pane">
          <AppTopbar v={v} />
          <ToolScreens v={v} />
          <ConversationView v={v} />
          <StatusBar v={v} />
        </main>
        {/* The workbench stays mounted once shown, so a file opened in Files with unsaved edits, a typed command or the
            folder being browsed survive Settings, another page or hiding the panel; it is only hidden. */}
        <SidePanel v={v} />
        <AppDialogs v={v} />
      </div>
    </div>
  );
}
