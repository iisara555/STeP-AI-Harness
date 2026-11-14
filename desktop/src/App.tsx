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
import { useMemo, useRef } from 'react';
import { WorkspaceViewProvider, createWorkspaceViewStore, region, useNotifyRegions, type WorkspaceViewStore } from './workspace-view';

// Each region follows only the workspace values it reads (see workspace-view.tsx).
const Sidebar = region(AppSidebar, 'Sidebar');
const Topbar = region(AppTopbar, 'Topbar');
const Tools = region(ToolScreens, 'ToolScreens');
const Conversation = region(ConversationView, 'Conversation');
const Status = region(StatusBar, 'StatusBar');
const Panel = region(SidePanel, 'SidePanel');
const Dialogs = region(AppDialogs, 'Dialogs');

const brandSymbol = (
  <span className="brand-symbol" role="img" aria-label="STeP">
    <img className="on-light" src={symbolColour} alt="" />
    <img className="on-dark" src={symbolWhite} alt="" />
  </span>
);

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
  const store = useRef<WorkspaceViewStore | null>(null);
  useNotifyRegions(store);
  const avatarId = snapshot?.settings.avatar;
  const avatarFallback = initial(snapshot?.settings.userName || '') || snapshot?.settings.team.toUpperCase() || 'ST';
  const profileAvatar = useMemo(() => <Avatar id={avatarId} fallback={avatarFallback} />, [avatarId, avatarFallback]);
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
  const v: AppView = { ...ws, api, snapshot, pageTitle, brandSymbol, profileAvatar };
  // Published during render so a region mounting in this pass reads it; regions already mounted compare after commit.
  if (store.current) store.current.current = v;
  else store.current = createWorkspaceViewStore(v);
  return (
    <WorkspaceViewProvider value={store.current}>
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
          <Sidebar />
          <main className="main-pane">
            <Topbar />
            <Tools />
            <Conversation />
            <Status />
          </main>
          {/* The workbench stays mounted once shown, so a file opened in Files with unsaved edits, a typed command or the
            folder being browsed survive Settings, another page or hiding the panel; it is only hidden. */}
          <Panel />
          <Dialogs />
        </div>
      </div>
    </WorkspaceViewProvider>
  );
}
