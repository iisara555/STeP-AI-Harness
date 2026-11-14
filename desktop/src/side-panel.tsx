import { Check, Download, History, PanelRightClose, Save, Settings2, SlidersHorizontal, Sparkles } from './icons';
import { DOCUMENT_FONTS, resolveDocumentLayout } from './document-layout';
import { DocumentPresentationControls, saveExportSettingsOpen } from './document-presentation-controls';
import { DocumentToolbar } from './document-toolbar';
import { EditorContent } from '@tiptap/react';
import { InvitationLinks, invalidInvitationLinks } from './invitation-links';
import { RichText } from './ui';
import { SectionArt } from './illustration';
import type { ToolTab } from './tools';
import { WorkbenchPanel } from './workbench';
import { locale, t } from './i18n';
import { EXPORT_FORMAT_LABELS } from './app-shared';
import type { AppView } from './use-workspace';

/** The draft editor and the workbench tabs beside the chat. */
export function SidePanel({ v }: { v: AppView }) {
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
    panelOpened,
    presentation,
    presentationRef,
    refresh,
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
    setWorkMode,
    showPanel,
    snapshot,
    toolRequest,
    toolTab,
    useProposal,
    width,
  } = v;
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
              {/* Three tabs most work needs; web, background jobs and commands sit behind the icon (or show while open). */}
              <div className="workbench-tab-list">
                {(['output', 'files', 'changes', 'browser', 'tasks', 'terminal'] as ToolTab[])
                  .filter(tab => advancedTools || toolTab === tab || ['output', 'files', 'changes'].includes(tab))
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
              onTab={setToolTab}
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
                  {/* The tab above already says ผลงาน: the draft's own title leads, with its two actions beside it. */}
                  <header className="draft-title">
                    <div>
                      <span title={t(session.title)}>{t(session.title)}</span>
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
                            {dirty ? t(' · มีการแก้ไขที่ยังไม่บันทึก') : t(' · บันทึกแล้ว')}
                          </>
                        )}
                      </small>
                    </div>
                    <button className="icon" title={t('ประวัติเวอร์ชัน')} aria-pressed={history} onClick={() => setHistory(!history)}>
                      <History size={17} />
                    </button>
                    <button className="icon" title={t('ซ่อนร่าง')} onClick={() => setRight(false)}>
                      <PanelRightClose size={17} />
                    </button>
                  </header>
                  {history && (
                    <div className="version-list">
                      {session.versions.some(v => v.text.trim()) ? (
                        session.versions
                          .filter(v => v.text.trim())
                          .slice()
                          .reverse()
                          .map(v => (
                            <button
                              key={v.revision}
                              disabled={dirty}
                              onClick={() =>
                                void action(async () => {
                                  await api.call('restore', { id: selected, revision: v.revision });
                                  await refresh();
                                })
                              }
                            >
                              {t('คืนค่าเวอร์ชัน')} {v.revision} <small>{new Date(v.at).toLocaleString(locale())}</small>
                            </button>
                          ))
                      ) : (
                        <p>{t('ยังไม่มีเวอร์ชันก่อนหน้า')}</p>
                      )}
                    </div>
                  )}
                  {session.proposals.map(p => (
                    <section className={'proposal' + (session.draft.trim() ? '' : ' primary')} key={p.id}>
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
                      <p className="small muted">
                        {dirty
                          ? t('มีการแก้ไขที่ยังไม่บันทึก กดใช้ร่างนี้เพื่อบันทึกและตรวจร่างก่อนแทนที่')
                          : p.baseRevision === session.revision
                            ? t('ตรวจร่างนี้ก่อนแทนที่ร่างปัจจุบัน')
                            : t('ร่างปัจจุบันเปลี่ยนแล้ว กดใช้ร่างนี้เพื่อตรวจและยืนยันก่อนแทนที่')}
                      </p>
                      <details open={!session.draft.trim()}>
                        <summary>{session.draft.trim() ? t('อ่านข้อเสนอและเทียบกับร่างด้านล่าง') : t('อ่านร่างจาก AI')}</summary>
                        <RichText className="proposal-text" text={p.text} />
                      </details>
                      {p.review && (
                        <details className="document-review">
                          <summary>{t('ผลตรวจและข้อมูลที่ต้องยืนยัน (ไม่ส่งออกในเอกสาร)')}</summary>
                          <RichText text={p.review} />
                        </details>
                      )}
                    </section>
                  ))}
                  {session.documentReview && (
                    <details className="document-review">
                      <summary>{t('ผลตรวจและข้อมูลที่ต้องยืนยัน (ไม่ส่งออกในเอกสาร)')}</summary>
                      <p className="small muted">
                        {session.documentReview.revision === session.revision && !dirty
                          ? t('ผลตรวจของร่างจาก AI ต้องตรวจไฟล์ส่งออกและผู้มีอำนาจก่อนเสนอ')
                          : t('ร่างเปลี่ยนจากฉบับที่ AI ตรวจแล้ว กรุณาตรวจข้อมูลและรูปแบบอีกครั้ง')}
                      </p>
                      <RichText text={session.documentReview.text} />
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
                    <EditorContent editor={editor} />
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
