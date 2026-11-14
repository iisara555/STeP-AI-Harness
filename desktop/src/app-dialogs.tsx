import { ApprovalDialog } from './approval';
import { ArtifactDialog } from './artifacts-list';
import { Check, ShieldCheck, X } from './icons';
import { CommandPalette, ConfirmDialog, RichText, Toasts } from './ui';
import { FeedbackDialog, ReportDialog } from './feedback';
import { Terms } from './terms';
import { UsageDialog } from './usage';
import { VaultPromptDialog } from './vault-prompt';
import { connectionName, errorText, explainError } from './messages';
import { t } from './i18n';
import type { AppView } from './use-workspace';
import { lazyScreen } from './lazy-screen';

// Dialogs that open on request load their code when first opened, so the app starts faster.
const AutomationDialog = lazyScreen(async () => ({ default: (await import('./automations')).AutomationDialog }), true);
const KeyboardDialog = lazyScreen(async () => ({ default: (await import('./keyboard')).KeyboardDialog }), true);
const LearningDialog = lazyScreen(async () => ({ default: (await import('./learning')).LearningDialog }), true);
const MemoryDialog = lazyScreen(async () => ({ default: (await import('./memory')).MemoryDialog }), true);
const PacksDialog = lazyScreen(async () => ({ default: (await import('./packs')).PacksDialog }), true);
const SetupWizard = lazyScreen(async () => ({ default: (await import('./setup')).SetupWizard }), true);
const Tour = lazyScreen(async () => ({ default: (await import('./tour')).Tour }), true);
const WhatsNewDialog = lazyScreen(async () => ({ default: (await import('./whats-new-dialog')).WhatsNewDialog }), true);

/** Dialogs, prompts and toasts that sit over the whole window. */
export function AppDialogs({ v }: { v: AppView }) {
  const {
    action,
    api,
    authCode,
    automationOpen,
    claudeCode,
    connection,
    connectionId,
    consentAsk,
    dirtyRef,
    dismiss,
    feedbackAsk,
    handoffAsk,
    inspecting,
    keyboardOpen,
    learningOpen,
    learningText,
    memoryOpen,
    navigate,
    notify,
    packsOpen,
    palette,
    paletteItems,
    providerName,
    refresh,
    removing,
    replacingDraft,
    reportAsk,
    selected,
    session,
    setAuthCode,
    setAutomationOpen,
    setConsentAsk,
    setDirty,
    setDraftAcceptPending,
    setFeedbackAsk,
    setForcedSkill,
    setHandoffAsk,
    setInspecting,
    setKeyboardOpen,
    setLearningOpen,
    setMemoryOpen,
    setPacksOpen,
    setPalette,
    setPendingSource,
    setQuery,
    setRemoving,
    setReplacingDraft,
    setReportAsk,
    setSelected,
    setSettings,
    setTermsAccepted,
    setTour,
    setUsageOpen,
    setViewingArtifact,
    setWhatsNew,
    setWizard,
    snapshot,
    start,
    termsAccepted,
    toasts,
    toolApprovals,
    tour,
    usageOpen,
    vaultPrompts,
    viewingArtifact,
    whatsNew,
    wizard,
  } = v;
  return (
    <>
      {usageOpen && api && <UsageDialog api={api} onClose={() => setUsageOpen(false)} onUpdated={() => void refresh()} />}
      {learningOpen && api && (
        <LearningDialog api={api} initialText={learningText} sessionId={session?.id} onClose={() => setLearningOpen(false)} />
      )}
      {memoryOpen && api && snapshot && (
        <MemoryDialog api={api} settings={snapshot.settings} refresh={refresh} onClose={() => setMemoryOpen(false)} />
      )}
      {automationOpen && (
        <AutomationDialog
          api={api}
          features={snapshot.policy?.features || {}}
          onClose={() => setAutomationOpen(false)}
          onSchedules={() => {
            setAutomationOpen(false);
            setSettings(false);
            navigate('schedules');
          }}
        />
      )}
      {vaultPrompts[0] && (
        <VaultPromptDialog
          key={vaultPrompts[0].id}
          prompt={vaultPrompts[0]}
          respond={(id, value) => api.call('vaultPromptRespond', { id, value })}
        />
      )}
      {toolApprovals[0] && (
        <ApprovalDialog
          key={toolApprovals[0].id}
          request={toolApprovals[0]}
          onRun={async () => {
            await api.call('approvalRespond', { id: toolApprovals[0].id, answer: 'run' });
            await refresh();
          }}
          onCancel={() =>
            void action(async () => {
              await api.call('approvalRespond', { id: toolApprovals[0].id, answer: 'cancel' });
            })
          }
          onConfirm={async remember => {
            await api.call('approvalRespond', { id: toolApprovals[0].id, answer: remember ? 'workspace' : 'once' });
            await refresh();
          }}
        />
      )}
      {feedbackAsk && api && (
        <FeedbackDialog
          ask={feedbackAsk}
          call={api.call}
          hasWorkspace={Boolean(snapshot?.settings.workspace)}
          onClose={() => setFeedbackAsk(null)}
          onDone={text => notify(text, 'success')}
          onReport={
            snapshot?.policy?.features.feedback === false
              ? undefined
              : text => {
                  setReportAsk({ sessionId: feedbackAsk.sessionId, index: feedbackAsk.index, text });
                  setFeedbackAsk(null);
                }
          }
        />
      )}
      {reportAsk && api && (
        <ReportDialog
          ask={reportAsk}
          call={api.call}
          userName={snapshot?.settings.userName || ''}
          team={snapshot?.settings.team || ''}
          onClose={() => setReportAsk(null)}
          onDone={text => notify(text, 'success')}
        />
      )}
      {consentAsk && (
        <ApprovalDialog
          request={{
            id: consentAsk.token,
            tool: 'external_ai',
            title: consentAsk.flagged ? t('ตรวจข้อความก่อนส่งให้ AI') : t('ยืนยันการส่งข้อมูลให้ AI'),
            body: '',
            privacyClass: consentAsk.flagged ? 'restricted' : 'internal',
            allowRemember: false,
          }}
          confirmLabel={consentAsk.first ? t('รับทราบและส่ง') : t('มีสิทธิ์ส่งข้อมูลนี้')}
          confirmDisabled={consentAsk.first && !termsAccepted}
          onCancel={() => {
            void api.call('consentDeclined', { id: consentAsk.sessionId }).catch(() => {});
            setConsentAsk(null);
          }}
          onConfirm={async () => {
            const ask = consentAsk;
            setConsentAsk(null);
            await action(() =>
              start(ask.sessionId, ask.text, {
                attachments: ask.attachments,
                consent: ask.token,
                skill: ask.skill,
                allowIds: ask.allowIds,
                sourceText: ask.sourceText,
                mode: ask.mode,
                imageModel: ask.imageModel,
                retry: ask.retry,
                coordinator: ask.coordinator,
                documentTool: ask.documentTool,
                attachmentRole: ask.attachmentRole,
                isolated: ask.isolated,
                aside: ask.aside,
                autoContinue: ask.autoContinue,
                documentVariant: ask.documentVariant,
                invitation: ask.invitation,
              }),
            );
          }}
        >
          {consentAsk.flagged ? (
            <p className="confirm-warning">
              <ShieldCheck size={16} />
              {t('ระบบพบสิ่งที่ควรตรวจ:')} {consentAsk.labels.join(', ')}
            </p>
          ) : (
            consentAsk.labels.length > 0 && (
              <p className="confirm-warning">
                <ShieldCheck size={16} />
                {t('ระบบจะปิดบังก่อนส่ง: {0} ร่างที่ได้จะมีข้อความในวงเล็บแทน ให้ใส่ข้อมูลจริงเองหลังตรวจ', consentAsk.labels.join(', '))}
              </p>
            )
          )}
          <p>
            {t(
              consentAsk.attachment || consentAsk.sourceText
                ? 'คำขอ พร้อมข้อมูลต้นทางที่ตรวจแล้ว ร่าง และบทสนทนาที่เกี่ยวข้องจะส่งให้ {0}'
                : 'คำขอ ร่าง และบทสนทนาที่เกี่ยวข้องจะส่งให้ {0}',
              providerName(
                snapshot.connections.find(c => c.id === snapshot.sessions.find(x => x.id === consentAsk.sessionId)?.connectionId) ||
                  connection,
              ),
            )}
          </p>
          <p className="small muted">
            {t(
              'คำถามข้อมูลสาธารณะที่เปลี่ยนตามเวลาอาจใช้ Web Search ของบัญชี AI นี้ โดยส่งเฉพาะคำถามสาธารณะไปค้น ไม่ส่งไฟล์แนบหรือบทสนทนาไปเป็นคำค้น',
            )}
          </p>
          {consentAsk.first && (
            <Terms privacyChecks={Boolean(snapshot.policy?.checks?.privacy)} accepted={termsAccepted} onChange={setTermsAccepted} />
          )}
          <p className="small muted">
            {snapshot.policy?.checks?.privacy
              ? t(
                  'ยืนยันเฉพาะข้อมูลที่คุณมีสิทธิ์ส่งผ่านบริการนี้ ผลสแกนไม่ใช่การอนุญาตจากองค์กร ระบบปิดบังเลขบัตร เบอร์โทร และอีเมลที่ตรวจพบ',
                )
              : t('ยืนยันเฉพาะข้อมูลที่คุณมีสิทธิ์ส่งผ่านบริการนี้')}
            {consentAsk.vision
              ? t(' ภาพต้นฉบับจะถูกส่งด้วย ตรวจภาพว่าไม่มีข้อมูลส่วนบุคคลหรือความลับที่ OCR อาจอ่านไม่พบก่อนยืนยัน')
              : t(' และไม่ส่งไฟล์ต้นฉบับ')}
            {consentAsk.first && !consentAsk.flagged && !consentAsk.attachment && !consentAsk.sourceText
              ? t(' ครั้งต่อไปจะไม่ถามซ้ำ เว้นแต่มีไฟล์แนบหรือพบข้อมูลที่ควรตรวจ')
              : ''}
          </p>
        </ApprovalDialog>
      )}
      {handoffAsk &&
        (claudeCode === false ? (
          <ConfirmDialog
            title={t('ยังไม่พบ Claude Code')}
            confirmLabel={t('เปิดวิธีติดตั้ง')}
            cancelLabel={t('ปิด')}
            onCancel={() => setHandoffAsk(null)}
            onConfirm={async () => {
              await api.call('openHelp', { topic: 'claudeCode' });
              setHandoffAsk(null);
            }}
          >
            <p>
              {t(
                'ใช้ Claude แบบ Pro/Max ได้ผ่าน Claude Code ของ Anthropic ที่ติดตั้งในเครื่องนี้ ติดตั้งแล้วเปิด Claude Code หนึ่งครั้งเพื่อลงชื่อเข้าใช้บัญชี Claude ของคุณ แล้วกลับมาส่งใหม่',
              )}
            </p>
            <p className="small muted">
              {t(
                'STeP Desktop ลงชื่อเข้าใช้ Claude แทนคุณไม่ได้ เพราะเงื่อนไขของ Anthropic อนุญาตให้ใช้บัญชี Pro/Max ในแอปของ Anthropic เท่านั้น',
              )}
            </p>
          </ConfirmDialog>
        ) : (
          <ConfirmDialog
            title={t('ส่งต่อไปทำใน Claude Code')}
            confirmLabel={t('คัดลอกและเปิด Claude Code')}
            onCancel={() => setHandoffAsk(null)}
            onConfirm={async () => {
              try {
                await api.call('handoff', handoffAsk);
              } catch (e) {
                throw new Error(explainError(e));
              }
              setHandoffAsk(null);
              setQuery('');
              setForcedSkill('');
              notify(t('คัดลอกคำขอแล้ว วางในหน้าต่าง Claude Code (Ctrl+V หรือ ⌘V) แล้วกด Enter'), 'success');
            }}
          >
            <p>
              {handoffAsk.skill
                ? t(
                    'แอปจะคัดลอกคำขอ พร้อมตำแหน่งไฟล์ Skill แล้วเปิด Claude Code ในโฟลเดอร์งาน คุณวางคำขอและทำงานต่อในหน้าต่างนั้นด้วยบัญชี Claude ของคุณเอง',
                  )
                : t('แอปจะคัดลอกคำขอ แล้วเปิด Claude Code ในโฟลเดอร์งาน คุณวางคำขอและทำงานต่อในหน้าต่างนั้นด้วยบัญชี Claude ของคุณเอง')}
            </p>
            <p className="small muted">
              {t(
                'คำตอบจะอยู่ใน Claude Code ไม่กลับมาที่แอปนี้ ระบบปิดบังเลขบัตร เบอร์โทร และอีเมลที่ตรวจพบก่อนคัดลอก ส่งเฉพาะข้อมูลที่คุณมีสิทธิ์ใช้กับ Claude',
              )}
            </p>
          </ConfirmDialog>
        ))}
      {replacingDraft && (
        <ConfirmDialog
          title={t('ใช้ข้อเสนอ AI แทนร่างปัจจุบัน?')}
          confirmLabel={t('ยืนยันใช้ร่างนี้')}
          focusCancel
          onCancel={() => setReplacingDraft(null)}
          onConfirm={async () => {
            setDraftAcceptPending(true);
            try {
              await api.call('accept', {
                id: replacingDraft.id,
                proposalId: replacingDraft.proposalId,
                replaceRevision: replacingDraft.revision,
              });
              setReplacingDraft(null);
              await refresh();
            } finally {
              setDraftAcceptPending(false);
            }
          }}
        >
          <p>{t('ร่างปัจจุบันเปลี่ยนไปหลังจาก AI เริ่มร่าง ตรวจทั้งสองฉบับก่อนยืนยัน ฉบับปัจจุบันจะเก็บไว้ในประวัติเวอร์ชัน')}</p>
          <details>
            <summary>{t('อ่านร่างปัจจุบัน')}</summary>
            <RichText text={replacingDraft.draft || t('ยังไม่มีเนื้อหาในร่างปัจจุบัน')} />
          </details>
          <details>
            <summary>{t('อ่านข้อเสนอจาก AI')}</summary>
            <RichText text={replacingDraft.proposal} />
          </details>
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog
          title={t('ลบงานนี้?')}
          tone="danger"
          confirmLabel={t('ลบงาน')}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            await api.call('remove', { id: removing.id });
            if (selected === removing.id) {
              setSelected('');
              setDirty(false);
              dirtyRef.current = false;
            }
            setRemoving(null);
            await refresh();
          }}
        >
          <p>
            {t(
              '“{0}” พร้อมบทสนทนา ร่าง และประวัติเวอร์ชันจะถูกลบออกจากเครื่องนี้ และกู้คืนไม่ได้ ไฟล์ที่ส่งออกไว้แล้วในโฟลเดอร์ผลงานยังอยู่',
              removing.title,
            )}
          </p>
        </ConfirmDialog>
      )}
      {packsOpen && (
        <PacksDialog
          api={api}
          features={snapshot.policy?.features}
          connection={(() => {
            const c = snapshot.connections.find(c => c.id === connectionId && c.ready);
            return c ? { id: c.id, name: connectionName(c) } : undefined;
          })()}
          onClose={() => setPacksOpen(false)}
          onSelect={text => {
            setPendingSource(text);
            notify(t('เพิ่มข้อมูลจาก Skill Pack แล้ว ตรวจบริการปลายทางก่อนส่ง'));
          }}
        />
      )}
      {keyboardOpen && <KeyboardDialog api={api} settings={snapshot.settings} refresh={refresh} onClose={() => setKeyboardOpen(false)} />}
      {palette && <CommandPalette items={paletteItems} onClose={() => setPalette(false)} />}
      {wizard && (
        <SetupWizard
          snapshot={snapshot}
          call={api.call}
          refresh={refresh}
          onError={e => notify(explainError(e), 'error')}
          onDone={startTour => {
            setWizard(false);
            setSettings(false);
            navigate('chat');
            if (startTour) setTour(true);
          }}
        />
      )}
      {whatsNew && !wizard && !tour && (
        <WhatsNewDialog
          notes={whatsNew}
          onClose={() => {
            setWhatsNew(null);
            void api.call('whatsNewSeen').then(refresh);
          }}
        />
      )}
      {tour && (
        <Tour
          onClose={() => {
            setTour(false);
            void api.call('tour', { done: true }).then(refresh);
          }}
        />
      )}
      <Toasts toasts={toasts} dismiss={dismiss} />
      {authCode && (
        <div className="dialog-backdrop">
          <section role="dialog" aria-modal="true" aria-label={t('ลงชื่อเข้าใช้ Google')} className="attachment-dialog">
            <header>
              <h2>{t('ลงชื่อเข้าใช้บริการ AI')}</h2>
            </header>
            {snapshot?.connections.find(c => c.id === authCode.id)?.provider === 'antigravity' ? (
              <ol className="auth-code-steps">
                <li>{t('ในเบราว์เซอร์ เลือกบัญชี Google แล้วกด "อนุญาต" (Allow)')}</li>
                <li>{t('หน้าเว็บ Antigravity จะแสดงรหัส (authorization code) ให้กดคัดลอก')}</li>
                <li>{t('กลับมาวางรหัสในช่องนี้ แล้วกดยืนยัน ภายใน 1 นาที')}</li>
              </ol>
            ) : (
              <p>
                {t(
                  'ลงชื่อและกดอนุญาตในเบราว์เซอร์ หากบริการแสดง authorization code ให้คัดลอกมาวางที่นี่ หากเชื่อมต่อกลับอัตโนมัติ หน้าต่างนี้จะปิดเอง',
                )}
              </p>
            )}
            <label className="auth-code">
              {t('รหัสจากหน้าเว็บ')} (authorization code)
              <input
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={authCode.code}
                onChange={e => setAuthCode({ ...authCode, code: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter' && authCode.code.trim()) {
                    e.preventDefault();
                    void action(async () => {
                      await api.call('authCode', authCode);
                      setAuthCode(null);
                    });
                  }
                }}
              />
            </label>
            <div className="proposal-actions">
              <button
                disabled={!authCode.code.trim()}
                onClick={() =>
                  void action(async () => {
                    await api.call('authCode', authCode);
                    setAuthCode(null);
                  })
                }
              >
                <Check size={15} />
                {t('ยืนยัน')}
              </button>
              <button
                className="quiet"
                onClick={() =>
                  void action(async () => {
                    const id = authCode.id;
                    setAuthCode(null);
                    await api.call('authCode', { id, code: '' });
                  })
                }
              >
                {t('ยกเลิก')}
              </button>
            </div>
          </section>
        </div>
      )}
      {viewingArtifact && <ArtifactDialog artifact={viewingArtifact} onClose={() => setViewingArtifact(null)} />}
      {inspecting && (
        <div
          className="dialog-backdrop"
          onKeyDown={e => {
            if (e.key === 'Escape') setInspecting(null);
          }}
        >
          <section role="dialog" aria-modal="true" aria-label={t('ตรวจข้อความแนบ')} className="attachment-dialog">
            <header>
              <h2>{inspecting.name}</h2>
              <button className="icon" autoFocus onClick={() => setInspecting(null)} title={t('ปิด')}>
                <X />
              </button>
            </header>
            <p className={inspecting.usable ? undefined : 'danger-text'}>
              {inspecting.usable ? inspecting.status : `${inspecting.status}: ${errorText[inspecting.reason || ''] || ''}`}
            </p>
            <p className="small muted">
              {inspecting.vision
                ? snapshot.policy?.checks?.privacy
                  ? t('ส่งภาพต้นฉบับให้ AI พร้อมข้อความ OCR ตรวจภาพและสิทธิ์ส่งข้อมูลก่อนยืนยัน ระบบตรวจเฉพาะข้อความที่ OCR อ่านได้')
                  : t('ส่งภาพให้ AI อ่านโดยตรง ตรวจว่ามีสิทธิ์ส่งข้อมูลในภาพก่อนส่ง')
                : t('ตรวจเฉพาะข้อความที่อ่านได้ ไม่รับรองสิทธิ์ส่งข้อมูล ไฟล์ต้นฉบับไม่ถูกส่ง')}
            </p>
            {inspecting.imagePreview && (
              <img className="attachment-image" src={inspecting.imagePreview} alt={t('ภาพต้นฉบับที่จะส่งให้ AI')} />
            )}
            {/* A scanned PDF or a picture sent as it is has no text to show; the image above is what goes. */}
            {(inspecting.preview || !inspecting.vision) && (
              <pre>{inspecting.preview || t('ไม่สามารถเตรียมข้อความที่ตรวจแล้วได้ กรุณาใช้สำเนาที่ปิดบังข้อมูลและตรวจทานก่อน')}</pre>
            )}
            <button onClick={() => setInspecting(null)}>{t('กลับไปที่งาน')}</button>
          </section>
        </div>
      )}
    </>
  );
}
