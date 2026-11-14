import { CLAUDE_CODE, explainError } from './messages';
import { ConfirmDialog } from './ui';
import { lazyScreen } from './lazy-screen';
import { t } from './i18n';
import { DocumentTools, InternalMedia, ReceiptApp } from './app-shared';
import type { AppView } from './use-workspace';

const SettingsPanel = lazyScreen(async () => ({ default: (await import('./settings')).SettingsPanel }));

/** The mini apps and Settings, kept mounted once opened so work in progress survives switching away. */
export function ToolScreens({ v }: { v: AppView }) {
  const {
    api,
    attachDocument,
    chooseConnection,
    connectionId,
    consumedDocumentTask,
    documentsOpened,
    draftDocument,
    mediaOpened,
    notify,
    openAiSettings,
    receiptHandoff,
    receiptOpened,
    refresh,
    reviseDocument,
    running,
    session,
    setConnectionId,
    setReceiptBusy,
    setSettings,
    setSettingsBusy,
    setSettingsExit,
    setSettingsState,
    settings,
    settingsBusy,
    settingsChanged,
    settingsDirty,
    settingsExit,
    settingsNext,
    settingsPage,
    showTour,
    showWizard,
    snapshot,
    vaultOrigin,
    view,
  } = v;
  return (
    <>
      {/* The AFP checker stays mounted once opened, so a read in progress and the fields being checked survive a
              switch to chat or Settings; it is only hidden. */}
      {receiptOpened && (
        <div style={{ display: view === 'receipt' && !settings ? 'contents' : 'none' }}>
          <ReceiptApp
            onBusy={setReceiptBusy}
            call={api.call}
            onEvent={api.onEvent}
            notify={notify}
            onError={e => notify(explainError(e), 'error')}
            handoff={receiptHandoff}
            connectionId={connectionId === CLAUDE_CODE ? '' : connectionId}
            connections={snapshot.connections}
            chooseConnection={setConnectionId}
            openAiSettings={openAiSettings}
          />
        </div>
      )}
      {documentsOpened && (
        <div style={{ display: view === 'documents' && !settings ? 'contents' : 'none' }}>
          <DocumentTools
            connections={snapshot.connections}
            connectionId={connectionId}
            chooseConnection={setConnectionId}
            attach={attachDocument}
            draft={draftDocument}
            existingDraft={
              session?.documentTool && (session.draft.trim() || session.proposals.length)
                ? { id: session.id, tool: session.documentTool, title: session.title }
                : undefined
            }
            revise={reviseDocument}
            consumedTask={consumedDocumentTask}
            busy={running}
            onError={e => notify(explainError(e), 'error')}
            openAiSettings={openAiSettings}
          />
        </div>
      )}
      {mediaOpened && (
        <div style={{ display: view === 'media' && !settings ? 'contents' : 'none' }}>
          <InternalMedia notify={notify} copyText={text => api.call('copyText', { text })} />
        </div>
      )}
      {/* A connection being set up keeps going when Settings is closed: the panel stays mounted, hidden, until it
              finishes, so reopening shows its progress instead of offering to start it again. */}
      {(settings || settingsBusy) && (
        <div style={{ display: settings ? 'contents' : 'none' }}>
          <SettingsPanel
            onBusy={setSettingsBusy}
            initialPage={settingsPage}
            onDirtyChange={settingsChanged}
            selectedConnectionId={session?.connectionId || connectionId}
            selectionScope={session ? 'task' : 'new'}
            onSelectConnection={chooseConnection}
            selectionDisabled={running}
            vaultOrigin={vaultOrigin}
            snapshot={snapshot}
            call={api.call}
            refresh={refresh}
            openWizard={showWizard}
            openTour={showTour}
            close={() => setSettings(false)}
            onError={e => notify(explainError(e), 'error')}
          />
        </div>
      )}
      {settingsExit && (
        <ConfirmDialog
          title={t('ออกโดยไม่บันทึกการเปลี่ยนแปลง?')}
          confirmLabel={t('ไม่บันทึกและออก')}
          onCancel={() => {
            settingsNext.current = null;
            setSettingsExit(false);
          }}
          onConfirm={() => {
            settingsDirty.current = false;
            const next = settingsNext.current;
            settingsNext.current = null;
            setSettingsExit(false);
            setSettingsState(false);
            if (next)
              void Promise.resolve()
                .then(next)
                .catch(e => notify(explainError(e), 'error'));
          }}
        >
          <p>
            {t(
              'มีการเปลี่ยนแปลงที่ยังไม่บันทึก กลับไปแก้ไขหรือบันทึกก่อนออกได้ การเชื่อมต่อบัญชีและสิทธิ์ที่ยืนยันไปแล้วมีผลทันทีและจะไม่ถูกย้อนกลับ',
            )}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
