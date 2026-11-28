import { useEffect, useState, type ComponentProps } from 'react';
import { Check, Download, History, PanelRightClose, RotateCcw, Save, Settings2, SlidersHorizontal, Sparkles } from './icons';
import { computeDraftDiff } from './draft-diff';
import { DraftDiffView } from './draft-diff-view';
import { documentTool } from './document-tools';
import { DOCUMENT_FONTS, resolveDocumentLayout } from './document-layout';
import { DocumentPresentationControls, saveExportSettingsOpen } from './document-presentation-controls';
import { resolvePresentation } from './document-presentation';
import { lazyScreen } from './lazy-screen';
import type { DocumentToolbar as Toolbar } from './document-toolbar';
import type { Editor } from '@tiptap/react';
import { InvitationLinks, invalidInvitationLinks } from './invitation-links';
import { RichText } from './ui';
import { SectionArt } from './illustration';
import type { ToolTab } from './tools';
import type { DraftVersion, DraftVersionOrigin } from './types';
import { WorkbenchPanel } from './workbench';
import { locale, t } from './i18n';
import { EXPORT_FORMAT_LABELS } from './app-shared';
import type { AppView } from './use-workspace';

// The editor's view and toolbar come with the editor itself (draft-editor.ts), not with the first screen.
const DocumentToolbar = lazyScreen<ComponentProps<typeof Toolbar>>(
  () => import('./document-toolbar').then(m => ({ default: m.DocumentToolbar })),
  true,
);
const EditorContent = lazyScreen<{ editor: Editor }>(() => import('@tiptap/react').then(m => ({ default: m.EditorContent })), true);

/** The draft editor and the workbench tabs beside the chat. */
/** A required document part named by the export check, in the interface language (Thai names come from the check). */
const checkPart = (part: string) =>
  ({
    ส่วนราชการ: t('ส่วนราชการ'),
    ที่: t('ที่ (เลขที่หนังสือ)'),
    วันที่: t('วันที่'),
    เรื่อง: t('เรื่อง'),
    เรียน: t('เรียน'),
    ชื่อผู้ลงนาม: t('ชื่อผู้ลงนาม'),
    คำลงท้าย: t('คำลงท้าย'),
    ครั้งที่: t('ครั้งที่'),
    ผู้มาประชุม: t('ผู้มาประชุม'),
    เลิกประชุม: t('เลิกประชุม'),
    ผู้จดรายงาน: t('ผู้จดรายงาน'),
  })[part] || part;

const originLabel = (origin?: DraftVersionOrigin) => {
  if (origin === 'ai') return t('AI ร่าง');
  if (origin === 'manual') return t('แก้เอง');
  if (origin === 'restore') return t('คืนค่า');
  if (origin === 'shelved') return t('เก็บไว้');
  return '';
};

const docTypeLabel = (toolId?: DraftVersion['documentTool'], variant?: string) => {
  const tool = documentTool(toolId);
  if (!tool) return t('ร่างทั่วไป');
  const variantLabel = variant ? tool.variants.find(item => item.id === variant)?.label : undefined;
  return variantLabel || tool.title;
};

export function SidePanel({ v }: { v: AppView }) {
  const [proposalMode, setProposalMode] = useState<'diff' | 'full'>('diff');
  const [compareRevision, setCompareRevision] = useState<number | null>(null);
  const {
    action,
    advancedTools,
    api,
    composerRef,
    currentId,
    dirty,
    dirtyRef,
    draftAcceptPending,
    editor,
    exportFont,
    exportGaruda,
    exportInfo,
    exportPath,
    exportPending,
    exportSettings,
    exporting,
    format,
    history,
    notify,
    openLink,
    panelOpened,
    presentation,
    presentationRef,
    refresh,
    running,
    save,
    selected,
    session,
    setAdvancedTools,
    setDirty,
    setExportFont,
    setExportGaruda,
    setExportInfo,
    setExportPath,
    setExportSettings,
    setExporting,
    setFormat,
    setHistory,
    setPendingSource,
    setPresentation,
    setQuery,
    setRight,
    setToolTab,
    setWidth,
    setWorkflow,
    setWorkMode,
    showPanel,
    snapshot,
    toolRequest,
    toolTab,
    submitting,
    useProposal,
    width,
    workflow,
    workflowRef,
  } = v;
  useEffect(() => {
    setProposalMode('diff');
    setCompareRevision(null);
  }, [selected]);
  const nonEmptyVersions = session
    ? session.versions
        .filter(item => item.text.trim())
        .slice()
        .reverse()
    : [];
  const isSameDoc = (item: DraftVersion) =>
    Boolean(session) &&
    (item.documentTool || undefined) === (session!.documentTool || undefined) &&
    (item.documentVariant || undefined) === (session!.documentVariant || undefined);
  const sameDocVersions = nonEmptyVersions.filter(isSameDoc);
  const otherDocVersions = nonEmptyVersions.filter(item => !isSameDoc(item));
  const undoCandidate = session ? sameDocVersions.find(item => item.text !== session.draft) : undefined;
  const renderVersionItem = (item: DraftVersion, otherDoc = false) => {
    const diff = session ? computeDraftDiff(item.text, session.draft) : { added: 0, removed: 0, changed: false, hunks: [] };
    const badge = otherDoc ? docTypeLabel(item.documentTool, item.documentVariant) : originLabel(item.origin);
    const comparing = compareRevision === item.revision;
    return (
      <div className="version-item" key={item.revision}>
        <div className="version-item-head">
          <div className="version-item-meta">
            <span className="version-rev">#{item.revision}</span>
            {badge && <span className={'version-badge' + (item.origin ? ' origin-' + item.origin : '')}>{badge}</span>}
            {diff.changed ? (
              <span className="diff-badge">
                <span className="diff-plus">+{diff.added}</span> <span className="diff-minus">-{diff.removed}</span>
              </span>
            ) : (
              <span className="small muted">{t('ตรงกับฉบับปัจจุบัน')}</span>
            )}
          </div>
          <div className="version-actions">
            <button
              type="button"
              className="quiet"
              aria-pressed={comparing}
              onClick={() => setCompareRevision(comparing ? null : item.revision)}
            >
              {comparing ? t('ซ่อน') : t('เทียบ')}
            </button>
            <button
              type="button"
              className="quiet"
              aria-label={`${t('คืนค่าเวอร์ชัน')} ${item.revision}`}
              onClick={() =>
                void action(async () => {
                  if (dirtyRef.current) await save();
                  await api.call('restore', { id: selected, revision: item.revision });
                  setCompareRevision(null);
                  await refresh();
                })
              }
            >
              {t('คืนค่า')}
            </button>
          </div>
        </div>
        {item.label && <p className="version-label">{item.label}</p>}
        <small>{new Date(item.at).toLocaleString(locale())}</small>
        {comparing && session && <DraftDiffView before={item.text} after={session.draft} />}
      </div>
    );
  };
  return (
    <>
      {(showPanel || panelOpened) && (
        <>
          {showPanel && (
            <aside className="resize-region" aria-label={t('แถบปรับความกว้างร่าง')}>
              <div
                className="resize-handle"
                role="separator"
                aria-label={t('ปรับความกว้างร่าง')}
                aria-orientation="vertical"
                aria-valuenow={width}
                aria-valuemin={300}
                aria-valuemax={700}
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'ArrowLeft') setWidth(w => Math.min(w + 20, 700));
                  if (e.key === 'ArrowRight') setWidth(w => Math.max(w - 20, 300));
                }}
                onPointerDown={e => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={e => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(Math.min(700, Math.max(300, window.innerWidth - e.clientX)));
                }}
              />
            </aside>
          )}
          <aside
            aria-label={t('ผลงานและเครื่องมือ')}
            className="artifact-pane"
            data-tour="artifact"
            style={showPanel ? undefined : { display: 'none' }}
          >
            <nav className="workbench-tabs" aria-label={t('เครื่องมือข้างร่าง')}>
              <div className="workbench-tab-list">
                {(['output', 'files', 'changes', 'coding', 'browser', 'tasks', 'terminal'] as ToolTab[])
                  .filter(tab => advancedTools || toolTab === tab || ['output', 'files', 'changes', 'coding'].includes(tab))
                  .map(tab => (
                    <button
                      key={tab}
                      className={toolTab === tab ? 'active' : ''}
                      aria-current={toolTab === tab ? 'page' : undefined}
                      onClick={e => {
                        setToolTab(tab);
                        e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                      }}
                    >
                      {
                        {
                          output: t('ผลงาน'),
                          browser: t('เว็บ'),
                          terminal: t('คำสั่งขั้นสูง'),
                          tasks: t('งานเบื้องหลัง'),
                          files: t('ไฟล์งาน'),
                          changes: t('รายการแก้ไข'),
                          coding: t('โค้ด'),
                        }[tab]
                      }
                    </button>
                  ))}
              </div>
              <button
                className="workbench-advanced"
                aria-expanded={advancedTools}
                aria-label={t('แท็บเพิ่มเติม')}
                title={advancedTools ? t('ซ่อนเว็บ งานเบื้องหลัง และคำสั่งขั้นสูง') : t('แสดงเว็บ งานเบื้องหลัง และคำสั่งขั้นสูง')}
                onClick={() => {
                  setAdvancedTools(!advancedTools);
                  if (advancedTools && ['browser', 'tasks', 'terminal'].includes(toolTab)) setToolTab('output');
                }}
              >
                <Settings2 size={15} />
              </button>
            </nav>
            <WorkbenchPanel
              api={api}
              tab={toolTab}
              session={session}
              workspace={snapshot.settings.workspace}
              request={toolRequest}
              panelVisible={showPanel}
              workflow={workflow}
              canChooseCodingWorkflow={!running && !submitting}
              onTab={setToolTab}
              onCodingWorkflow={next => {
                setWorkMode('chat');
                setWorkflow(next);
                workflowRef.current = next;
                composerRef.current?.focus();
              }}
              onBrowserTask={url => {
                setWorkMode('chat');
                setQuery(t('ให้ผู้ช่วยทำงานบนเว็บ {0} โดย [ระบุสิ่งที่ต้องการทำ]', url === 'https://' ? t('[ใส่ URL]') : url));
                composerRef.current?.focus();
              }}
              onSource={text => {
                setPendingSource(text.slice(0, 100000));
                setQuery(t('ช่วยวิเคราะห์ข้อมูลจากเครื่องมือที่แนบมา'));
                composerRef.current?.focus();
              }}
            />
            <div className="output-document" hidden={toolTab !== 'output'}>
              {!session ? (
                <div className="artifact-empty">
                  <SectionArt scene="workspace" className="empty-illustration" />
                  <h2>{t('พื้นที่สำหรับร่างของคุณ')}</h2>
                  <p>
                    {t('เมื่อ AI จัดทำร่างแล้ว')}
                    <br />
                    {t('คุณจะตรวจและแก้ไขได้ตรงนี้')}
                  </p>
                </div>
              ) : (
                <>
                  {/* The task's name is in the top bar and the sidebar; here only the draft's state and its actions. */}
                  <header className="draft-title">
                    <div>
                      <small>
                        {/* An empty draft has no version yet: say what goes here instead of "version 0, saved". */}
                        {!session.revision && !session.draft.trim() ? (
                          dirty ? (
                            t('มีการแก้ไขที่ยังไม่บันทึก')
                          ) : (
                            t('ยังไม่มีร่าง · AI จะใส่ร่างที่นี่ หรือพิมพ์เองได้')
                          )
                        ) : (
                          <>
                            {t('เวอร์ชัน')} {session.revision}
                            {session.draftMeta?.restoredFrom !== undefined
                              ? t(' · คืนค่าจากเวอร์ชัน {0}', session.draftMeta.restoredFrom)
                              : originLabel(session.draftMeta?.origin)
                                ? ` · ${originLabel(session.draftMeta?.origin)}`
                                : ''}
                            {dirty ? t(' · มีการแก้ไขที่ยังไม่บันทึก') : t(' · บันทึกแล้ว')}
                          </>
                        )}
                      </small>
                    </div>
                    {undoCandidate && (
                      <button
                        type="button"
                        className="icon"
                        title={t('ย้อนกลับฉบับก่อนหน้า')}
                        onClick={() =>
                          void action(async () => {
                            if (dirtyRef.current) await save();
                            await api.call('restore', { id: selected, revision: undoCandidate.revision });
                            setCompareRevision(null);
                            await refresh();
                          })
                        }
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                    <button className="icon" title={t('ประวัติเวอร์ชัน')} aria-pressed={history} onClick={() => setHistory(!history)}>
                      <History size={17} />
                    </button>
                    <button className="icon" title={t('ซ่อนร่าง')} onClick={() => setRight(false)}>
                      <PanelRightClose size={17} />
                    </button>
                  </header>
                  {history && (
                    <div className="version-list">
                      {sameDocVersions.length || otherDocVersions.length ? (
                        <>
                          {sameDocVersions.length > 0 && (
                            <>
                              <div className="version-group-title">{t('ประวัติเอกสารนี้')}</div>
                              {sameDocVersions.map(item => renderVersionItem(item, false))}
                            </>
                          )}
                          {otherDocVersions.length > 0 && (
                            <>
                              <div className="version-group-title">{t('เอกสารอื่นในงานนี้')}</div>
                              {otherDocVersions.map(item => renderVersionItem(item, true))}
                            </>
                          )}
                        </>
                      ) : (
                        <p>{t('ยังไม่มีเวอร์ชันก่อนหน้า')}</p>
                      )}
                    </div>
                  )}
                  {session.proposals.map(p => {
                    const hasDraft = Boolean(session.draft.trim());
                    const diff = hasDraft ? computeDraftDiff(session.draft, p.text) : undefined;
                    return (
                      <section className={'proposal' + (hasDraft ? '' : ' primary')} key={p.id}>
                        <div className="proposal-head">
                          <Sparkles size={16} />
                          <strong>{t('ข้อเสนอจาก AI')}</strong>
                          <div className="proposal-actions">
                            <button disabled={draftAcceptPending} onClick={() => void action(() => useProposal(p.id))}>
                              <Check size={15} />
                              {t('ใช้ร่างนี้')}
                            </button>
                            <button
                              className="quiet"
                              disabled={draftAcceptPending}
                              onClick={() =>
                                void action(async () => {
                                  await api.call('reject', { id: selected, proposalId: p.id });
                                  await refresh();
                                })
                              }
                            >
                              {t('ไม่ใช้')}
                            </button>
                          </div>
                        </div>
                        {p.prompt && <p className="small muted proposal-prompt">{t('ตามคำสั่ง: “{0}”', p.prompt)}</p>}
                        <p className="small muted">
                          {dirty
                            ? t('มีการแก้ไขที่ยังไม่บันทึก กดใช้ร่างนี้เพื่อบันทึกและตรวจร่างก่อนแทนที่')
                            : p.baseRevision === session.revision
                              ? t('ตรวจร่างนี้ก่อนแทนที่ร่างปัจจุบัน')
                              : t('ร่างปัจจุบันเปลี่ยนแล้ว กดใช้ร่างนี้เพื่อตรวจและยืนยันก่อนแทนที่')}
                        </p>
                        {hasDraft && diff ? (
                          <>
                            <div className="proposal-view-toggle">
                              <span className="diff-badge">
                                <span className="diff-plus">+{diff.added}</span> <span className="diff-minus">-{diff.removed}</span>
                              </span>
                              <div className="proposal-toggle-buttons">
                                <button
                                  type="button"
                                  className="quiet"
                                  aria-pressed={proposalMode === 'diff'}
                                  onClick={() => setProposalMode('diff')}
                                >
                                  {t('จุดที่เปลี่ยน')}
                                </button>
                                <button
                                  type="button"
                                  className="quiet"
                                  aria-pressed={proposalMode === 'full'}
                                  onClick={() => setProposalMode('full')}
                                >
                                  {t('ฉบับเต็ม')}
                                </button>
                              </div>
                            </div>
                            {proposalMode === 'diff' ? (
                              <DraftDiffView before={session.draft} after={p.text} />
                            ) : (
                              <RichText className="proposal-text" text={p.text} onLink={openLink} />
                            )}
                          </>
                        ) : (
                          <details open>
                            <summary>{t('อ่านร่างจาก AI')}</summary>
                            <RichText className="proposal-text" text={p.text} onLink={openLink} />
                          </details>
                        )}
                        {p.review && (
                          <details className="document-review">
                            <summary>{t('ผลตรวจและข้อมูลที่ต้องยืนยัน (ไม่ส่งออกในเอกสาร)')}</summary>
                            <RichText text={p.review} onLink={openLink} />
                          </details>
                        )}
                      </section>
                    );
                  })}
                  {session.documentReview && (
                    <details className="document-review">
                      <summary>{t('ผลตรวจและข้อมูลที่ต้องยืนยัน (ไม่ส่งออกในเอกสาร)')}</summary>
                      <p className="small muted">
                        {session.documentReview.revision === session.revision && !dirty
                          ? t('ผลตรวจของร่างจาก AI ต้องตรวจไฟล์ส่งออกและผู้มีอำนาจก่อนเสนอ')
                          : t('ร่างเปลี่ยนจากฉบับที่ AI ตรวจแล้ว กรุณาตรวจข้อมูลและรูปแบบอีกครั้ง')}
                      </p>
                      <RichText text={session.documentReview.text} onLink={openLink} />
                    </details>
                  )}
                  <div className="draft-tools">
                    {editor && (
                      <DocumentToolbar
                        editor={editor}
                        locked={Boolean(session.documentTemplate)}
                        disabled={exporting || draftAcceptPending}
                        onImage={() =>
                          void action(async () => {
                            const owner = selected;
                            await save();
                            const result = await api.call('documentImageAdd', { id: owner });
                            if (!result.canceled && currentId.current === owner)
                              editor
                                .chain()
                                .focus()
                                .insertContent([
                                  { type: 'image', attrs: result.attrs },
                                  { type: 'caption', content: [] },
                                ])
                                .run();
                          })
                        }
                      />
                    )}
                  </div>
                  <div className={'editor-scroll' + (!session.draft.trim() && session.proposals.length ? ' waiting' : '')}>
                    {editor && <EditorContent editor={editor} />}
                  </div>
                  <details className="sources">
                    <summary>
                      {t('แหล่งอ้างอิงที่ใช้ (')}
                      {session.sources.length})
                    </summary>
                    {session.sources.map(path => (
                      <p key={path}>{path}</p>
                    ))}
                  </details>
                  {exportSettings && (['docx', 'pdf'].includes(format) || Boolean(presentation.invitation)) && (
                    <div className="export-settings" id="export-settings">
                      {presentation.invitation && (
                        <InvitationLinks
                          value={presentation.invitation}
                          disabled={exporting || draftAcceptPending}
                          onChange={value => {
                            const next = { ...presentationRef.current, invitation: value };
                            setPresentation(next);
                            presentationRef.current = next;
                            setDirty(true);
                            dirtyRef.current = true;
                          }}
                        />
                      )}
                      {format === 'docx' && !presentation.invitation && (
                        <DocumentPresentationControls
                          value={presentation}
                          locked={Boolean(session?.documentTemplate)}
                          disabled={exporting || draftAcceptPending}
                          onChange={value => {
                            setPresentation(value);
                            presentationRef.current = value;
                            setDirty(true);
                            dirtyRef.current = true;
                          }}
                        />
                      )}
                      {['docx', 'pdf'].includes(format) && !presentation.invitation && (
                        <label className="document-export-font">
                          {t(format === 'docx' ? 'ฟอนต์ DOCX' : 'ฟอนต์ PDF')}
                          <select
                            aria-label={t(format === 'docx' ? 'ฟอนต์ DOCX' : 'ฟอนต์ PDF')}
                            value={exportFont}
                            onChange={e => {
                              setExportFont(e.target.value);
                              setExportInfo(null);
                            }}
                          >
                            <option value="auto">
                              {session.documentTemplate
                                ? t('ตามแม่แบบ DOCX ({0})', session.documentTemplate.font)
                                : t('ตามแม่แบบร่าง ({0})', resolveDocumentLayout(session.documentTool).font)}
                            </option>
                            {DOCUMENT_FONTS.map(font => (
                              <option key={font} value={font} disabled={Boolean(session.documentTemplate)}>
                                {font}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!session.documentTemplate &&
                        !presentation.invitation &&
                        ['docx', 'pdf'].includes(format) &&
                        ['memo', 'letter'].includes(session.documentTool || '') && (
                          <label className="document-export-font">
                            {t('ตราครุฑ')}
                            <select
                              aria-label={t('ตราครุฑ')}
                              value={exportGaruda}
                              onChange={e => {
                                setExportGaruda(e.target.value);
                                setExportInfo(null);
                              }}
                            >
                              <option value="auto">
                                {t('ตามประเภทเอกสาร (สูง {0} ซม.)', resolveDocumentLayout(session.documentTool).garudaHeightCm)}
                              </option>
                              <option value="none">{t('ไม่ใส่ตราครุฑ')}</option>
                            </select>
                          </label>
                        )}
                    </div>
                  )}
                  {format !== 'docx' &&
                    !presentation.invitation &&
                    (() => {
                      const defaults = resolvePresentation({}, session.documentTool || false);
                      const torPdf = format === 'pdf' && session.documentTool === 'tor';
                      const docxOnly = Boolean(
                        presentation.toc ||
                        (!torPdf &&
                          (presentation.headerText ||
                            presentation.footerText ||
                            (presentation.pageNumber !== 'none' &&
                              (presentation.pageNumber !== defaults.pageNumber ||
                                presentation.pageNumberPosition !== defaults.pageNumberPosition)))),
                      );
                      if (!docxOnly) return null;
                      return (
                        <div className="document-export-settings">
                          <p className="small muted">
                            {t('ตั้งค่าสารบัญ/หัวท้ายที่เลือกไว้ใช้ได้เฉพาะ Word (.docx) ล้างค่าก่อนส่งออกรูปแบบนี้')}
                          </p>
                          <button
                            type="button"
                            className="quiet"
                            disabled={exporting || draftAcceptPending}
                            onClick={() => {
                              const next = {
                                ...presentation,
                                toc: false,
                                headerText: '',
                                footerText: '',
                                pageNumber: defaults.pageNumber,
                                pageNumberPosition: defaults.pageNumberPosition,
                              };
                              setPresentation(next);
                              presentationRef.current = next;
                              setDirty(true);
                              dirtyRef.current = true;
                              setExportInfo(null);
                            }}
                          >
                            {t('ล้างตัวเลือกเฉพาะ Word')}
                          </button>
                        </div>
                      );
                    })()}
                  <footer className="artifact-footer">
                    <button className="quiet" disabled={!dirty} onClick={() => void action(save)}>
                      <Save size={16} />
                      {t('บันทึก')}
                    </button>
                    <select
                      aria-label={t('รูปแบบส่งออก')}
                      value={format}
                      onChange={e => {
                        setFormat(e.target.value);
                        setExportInfo(null);
                      }}
                    >
                      {['docx', 'pdf', 'md', 'xlsx', 'pptx'].map(f => (
                        <option key={f} value={f} disabled={f === 'pdf' && Boolean(session.documentTemplate)}>
                          {EXPORT_FORMAT_LABELS[f]}
                        </option>
                      ))}
                    </select>
                    {(['docx', 'pdf'].includes(format) || Boolean(presentation.invitation)) && (
                      <button
                        className="icon"
                        aria-label={t('ตั้งค่าส่งออก')}
                        title={t('ตั้งค่าส่งออก')}
                        aria-expanded={exportSettings}
                        aria-controls="export-settings"
                        onClick={() => {
                          setExportSettings(!exportSettings);
                          saveExportSettingsOpen(!exportSettings);
                        }}
                      >
                        <SlidersHorizontal size={16} />
                      </button>
                    )}
                    <button
                      disabled={
                        exporting ||
                        (!session.draft && !dirty) ||
                        Boolean(presentation.invitation && invalidInvitationLinks(presentation.invitation).length)
                      }
                      onClick={() =>
                        void action(async () => {
                          if (exportPending.current) return;
                          exportPending.current = true;
                          setExporting(true);
                          try {
                            await save();
                            const output = await api.call('export', {
                              id: selected,
                              format,
                              ...(['docx', 'pdf'].includes(format)
                                ? {
                                    ...(exportFont !== 'auto' ? { font: exportFont } : {}),
                                    garuda: exportGaruda,
                                  }
                                : {}),
                            });
                            if (output.canceled) return;
                            await refresh();
                            setExportPath(output.path);
                            setExportInfo(output.layout || null);
                            notify(t('บันทึก {0} แล้ว', output.filename), 'success', {
                              label: t('เปิดโฟลเดอร์'),
                              run: () => api.call('reveal', { path: output.path }),
                            });
                          } finally {
                            exportPending.current = false;
                            setExporting(false);
                          }
                        })
                      }
                    >
                      <Download size={16} />
                      {t('ส่งออก')}
                    </button>
                  </footer>
                  {(exportInfo || exportPath) && (
                    <div className="export-status">
                      {exportInfo && (
                        <div className="document-export-info" role="status">
                          {exportInfo.checks?.map(check => (
                            <p className="export-check" key={check.code}>
                              {check.code === 'missing'
                                ? t('ยังไม่มี {0}', check.parts.map(checkPart).join(' / '))
                                : check.code === 'placeholders'
                                  ? t('ยังมี [รอยืนยัน] {0} จุด', check.count)
                                  : check.status === 'outdated'
                                    ? t(
                                        'แบบฟอร์ม {0} ที่แนบเป็น {1} ทะเบียน MIS เป็น {2} (บังคับใช้ {3}) ใช้ฉบับล่าสุดจาก MIS',
                                        check.form,
                                        check.used,
                                        check.current,
                                        check.effective,
                                      )
                                    : check.status === 'cancelled'
                                      ? t('แบบฟอร์ม {0} ยกเลิกแล้วในทะเบียน MIS', check.form)
                                      : t('ไม่พบ {0} ในทะเบียน MIS ตรวจใน MIS ก่อนใช้', check.form)}
                            </p>
                          ))}
                          <p>{t('ไฟล์ใช้ฟอนต์ {0}', exportInfo.font)}</p>
                          {exportInfo.templateName ? (
                            <p>{t('รักษารูปแบบและตราจากแม่แบบ {0}', exportInfo.templateName)}</p>
                          ) : exportInfo.garudaHeightCm ? (
                            <p>{t('ตราครุฑสูง {0} ซม. (เฉพาะหน้าแรก)', exportInfo.garudaHeightCm)}</p>
                          ) : (
                            <p>{t('ไม่ใส่ตราครุฑ')}</p>
                          )}
                          {exportInfo.fontEmbedding?.status === 'embedded' && <p>{t('ฝังฟอนต์ครบแล้ว เปิดและแก้ไขต่อใน Word ได้')}</p>}
                          {exportInfo.fontEmbedding?.status === 'partial' && (
                            <p>
                              {t(
                                'ฝังฟอนต์ได้บางส่วน ฟอนต์ที่ต้องตรวจบนเครื่องปลายทาง: {0}',
                                exportInfo.fontEmbedding.missingFamilies?.join(', ') || '',
                              )}
                            </p>
                          )}
                          {exportInfo.fieldsNeedUpdate && (
                            <p>{t('หากสารบัญหรือเลขหน้ายังไม่ปรับ ให้เปิดใน Word แล้วเลือก Update Field (อัปเดตเขตข้อมูล)')}</p>
                          )}
                          {exportInfo.fontEmbedding?.status === 'unavailable' && (
                            <p>{t('แม่แบบใช้ฟอนต์ที่ไม่มีในชุดแอป ตรวจฟอนต์บนเครื่องปลายทางก่อนใช้งาน')}</p>
                          )}
                          {exportInfo.fontEmbedding?.status !== 'embedded' &&
                            exportInfo.fontStatus === 'missing' &&
                            !(presentation.invitation && format === 'pdf') && (
                              <p>{t('ตรวจไม่พบฟอนต์นี้บนเครื่อง ติดตั้งฟอนต์ให้ตรงแบบก่อนตรวจหน้าใน Word')}</p>
                            )}
                          {exportInfo.fontStatus === 'unknown' && !(presentation.invitation && format === 'pdf') && (
                            <p>{t('ตรวจฟอนต์บนเครื่องไม่ได้ โปรดตรวจฟอนต์และหน้าใน Word')}</p>
                          )}
                          {exportInfo.documentTool && (
                            <p>
                              {t(
                                exportInfo.templateName
                                  ? 'ใช้รูปแบบต้นฉบับ DOCX ตรวจทุกหน้าใน Word ก่อนเสนอ'
                                  : presentation.invitation
                                    ? 'หนังสือเชิญใช้มาตรฐาน STeP ทั้งภาษาและการจัดหน้า'
                                    : 'จัดหน้าตามแม่แบบร่าง ต้องเทียบแบบหน่วยงานก่อนเสนอ',
                              )}
                            </p>
                          )}
                        </div>
                      )}
                      {exportPath && (
                        <button className="text-link" onClick={() => void api.call('reveal', { path: exportPath })}>
                          {t('เปิดโฟลเดอร์ไฟล์ล่าสุด')}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
