import { useEffect, useRef, useState } from 'react';
import { AccountQuotaMenuSummary, InlineQuotaChip } from './usage';
import {
  AlertTriangle,
  ArrowUp,
  Blocks,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Circle,
  Compass,
  Copy,
  Download,
  Eye,
  FileText,
  ImagePlus,
  LoaderCircle,
  Paperclip,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Split,
  Square,
  X,
} from './icons';
import { ArtifactsList, type OpenedArtifact } from './artifacts-list';
import { CLAUDE_CODE, connectionName, effortLabel, errorText, explainError } from './messages';
import { ChatMarkdown, visibleAnswer } from './chat-markdown';
import { ContextWindowGauge } from './context-window-gauge';
import { FeedbackButtons } from './feedback';
import { GoogleChangesList } from './google-changes-list';
import { MorningBriefCard } from './morning-brief';
import { QuestionCard } from './tool-question';
import { Readiness } from './readiness';
import { ConfirmDialog, RichText, formatElapsed } from './ui';
import { ThinkingScribble, waitingKind } from './thinking-scribble';
import { VoiceButton } from './voice';
import { COMPOSER_WORKFLOWS, WORKFLOW_LABELS, WorkPlanCard } from './work-plan';
import { WelcomeGreeting } from './welcome-greeting';
import { liveAnswer, liveThinking, offerWriteNow, useElapsed, useLiveRun, useSteadyLabel } from './live-run';
import { SavedThinking, ThinkingPanel } from './thinking-panel';
import { WorkAssistantActivity, WorkAssistantGuide, workActionsFromTrace } from './work-assistant';
import type { WorkMode, Workflow } from './types';
import { canGenerateImages } from './image-routing';
import { locale, t } from './i18n';
import { needsPublicWebSearch } from '../../src/modules/router/public-information.js';
import { publicSourceUrl } from './web';
import { revisionRequest } from './plan-comments';
import { starterTag, starterText, startersFor } from './starters';
import { toolRequests } from './tools';
import { vimEdit } from './commands';
import { CHAT_STARTERS, PERMISSION_SHORT, ScheduledTasks, SkillsHub, checkStillRunning } from './app-shared';
import type { AppView } from './use-workspace';

const caretAtEnd = (input: HTMLTextAreaElement) => input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

/** The chat: welcome, messages, plan and questions, and the composer; or the schedules and Skill pages. */
export function ConversationView({ v }: { v: AppView }) {
  const {
    action,
    activeModel,
    activeUsageAccount,
    activityAt,
    attachFiles,
    aiLabel,
    aiPicker,
    aiPickerRef,
    aiSummary,
    api,
    askAside,
    availableImages,
    chooseConnection,
    chooseModel,
    commands,
    composerRef,
    connection,
    connectionId,
    conversationEnd,
    coordinated,
    createTask,
    currentEffort,
    currentModel,
    defaultModel,
    failureCode,
    files,
    forTeam,
    forced,
    forcedSkill,
    imageCatalogError,
    imageModel,
    lastAnswer,
    lastRequest,
    myTeam,
    myTeamName,
    navigate,
    notify,
    openAiSettings,
    openLink,
    openPanel,
    ownPacks,
    ownSkillsAllowed,
    pasteImage,
    pastingImage,
    pendingSource,
    plan,
    progress,
    providerName,
    query,
    questionPending,
    questions,
    quotaRefreshing,
    readyConnection,
    refresh,
    refreshActiveQuota,
    removeFile,
    runFailed,
    running,
    save,
    selectSession,
    selected,
    send,
    session,
    setAiPicker,
    setCoordinated,
    setDismissedSkills,
    setFeedbackAsk,
    setForcedSkill,
    setImageModel,
    setInspecting,
    setPacksOpen,
    setPendingSource,
    setQuery,
    setSlashAtCaret,
    setSlashIndex,
    setSuggestedSkill,
    setToolRequest,
    setToolTab,
    setUsageOpen,
    setViewingArtifact,
    setVimNormal,
    setWorkMode,
    setWorkflow,
    settings,
    slashAtCaret,
    slashIndex,
    slash,
    slashMatches,
    snapshot,
    staffSkills,
    start,
    startedAt,
    startupPending,
    submitting,
    suggested,
    tour,
    useSkill,
    view,
    vimNormal,
    wantsImage,
    welcomeVisit,
    whatsNew,
    wizard,
    workActions,
    workMode,
    workflow,
    workflowRef,
  } = v;
  // Streamed text and the clock change many times a second, so only this view and the status bar follow them.
  const stream = useLiveRun(run => run.stream);
  const thought = useLiveRun(run => run.thought);
  const heartbeatAt = useLiveRun(run => run.heartbeatAt);
  const now = useLiveRun(run => run.now);
  // Read again whenever a stage or a thought arrives (`thought`) and each second for the running time.
  const thinking = running && thought >= 0 ? liveThinking(now) : undefined;
  const elapsed = useElapsed(running, startedAt);
  // A long read (a high reasoning level going through Skills and references) can be cut short by the person: the AI then
  // writes its answer from what it has read (the tool loop's final turn). Offered on the stop button after two minutes,
  // once per run.
  const [writeNowAt, setWriteNowAt] = useState(0);
  const [expandedScheduleHistory, setExpandedScheduleHistory] = useState<string[]>([]);
  const [generatedPreviews, setGeneratedPreviews] = useState<Record<string, string>>({});
  const [activeChangeIds, setActiveChangeIds] = useState<Set<string> | null>(null);
  const hasStagedWritten = Boolean(session?.messages.some(m => m.written?.some(file => file.status === 'staged')));
  useEffect(() => {
    let live = true;
    if (!hasStagedWritten) {
      setActiveChangeIds(null);
      return;
    }
    void api
      .call('toolChanges')
      .then((list: { id: string }[]) => {
        if (live) setActiveChangeIds(new Set((list || []).map(c => c.id)));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, hasStagedWritten, session?.id, session?.updatedAt, snapshot?.sessions]);
  useEffect(() => {
    let live = true;
    setGeneratedPreviews({});
    if (!session?.id || !session.images?.length) return;
    for (const image of session.images.slice(-20)) {
      void api
        .call('imageRead', { id: session.id, imageId: image.id })
        .then((res: { url: string }) => {
          if (live && res?.url) setGeneratedPreviews(prev => ({ ...prev, [image.id]: res.url }));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [api, session?.id, session?.images?.length]);
  // Running a plan needs write tools. In read-only mode the employee is asked before the permission changes; it is
  // never switched silently, and the new mode stays until they change it again in Settings.
  const [planWriteAsk, setPlanWriteAsk] = useState<(() => Promise<void>) | null>(null);
  const withWritableForPlan = (proceed: () => Promise<void>) => {
    if (snapshot.policy?.mode !== 'plan') return void action(proceed);
    if (!snapshot.policy.modes.includes('ask')) {
      notify(t('สิทธิ์เครื่องมือถูกล็อกเป็นอ่านอย่างเดียวโดยนโยบายองค์กร จึงยังลงมือทำตามแผนไม่ได้'), 'error');
      return;
    }
    setPlanWriteAsk(() => proceed);
  };
  const activeSlashOption = useRef<HTMLButtonElement>(null);
  const activeSlashSkill =
    !questionPending && slashAtCaret && !(snapshot.settings.vimMode && vimNormal) ? slashMatches[slashIndex] || slashMatches[0] : undefined;
  useEffect(() => {
    if (activeSlashSkill) activeSlashOption.current?.scrollIntoView({ block: 'nearest' });
  }, [activeSlashSkill]);
  // A refresh can land after main saved the answer but before it reports the run finished; the saved message
  // then already shows the streamed text, so the live copy is hidden instead of appearing twice.
  const { liveText, streamSaved } = liveAnswer(stream, session?.messages.at(-1));
  // The one working line under the answer; held steady so quick tool turns do not make it blink.
  const nextWorking = progress ? t(progress) : liveText ? t('กำลังเขียนคำตอบ') : t('กำลังคิด');
  const working = useSteadyLabel(nextWorking);
  // While the AI is still reading after two minutes, the stop button first asks it to write from what it has read;
  // a second press stops the task.
  const writeNow = Boolean(
    running &&
    selected &&
    startedAt &&
    writeNowAt !== startedAt &&
    offerWriteNow({ elapsedMs: now - startedAt, stream, liveText, progress }),
  );
  const messageCount = session?.messages.length;
  const canCoordinate = snapshot.policy?.features.coordinator && workMode === 'draft' && !session?.documentTool && !forcedSkill;
  useEffect(() => {
    // An empty task shows the welcome from its greeting; only a conversation follows its latest message.
    if (messageCount || stream || running) conversationEnd.current?.scrollIntoView({ block: 'end' });
  }, [messageCount, stream, running, conversationEnd]);
  return (
    <>
      {settings ? null : view === 'receipt' || view === 'documents' || view === 'media' ? null : view === 'schedules' ? (
        <ScheduledTasks
          api={api}
          connections={snapshot.connections}
          sessions={snapshot.sessions}
          defaultConnection={connectionId}
          workspace={snapshot.settings.workspace}
          onConnections={openAiSettings}
          expandedHistory={expandedScheduleHistory}
          onHistoryToggle={(id, open) =>
            setExpandedScheduleHistory(ids => {
              if (open === ids.includes(id)) return ids;
              return open ? [...ids, id] : ids.filter(item => item !== id);
            })
          }
          onOpen={id =>
            void action(async () => {
              await refresh();
              await selectSession(id);
            })
          }
        />
      ) : view === 'skills' ? (
        <SkillsHub
          skills={staffSkills}
          team={myTeam}
          onUse={useSkill}
          onOpenTool={id => navigate(id === 'documents' ? 'documents' : 'receipt')}
          ownPacks={ownPacks}
          onAddOwn={ownSkillsAllowed ? () => setPacksOpen(true) : undefined}
          onUsePack={(id, assetId) =>
            void action(async () => {
              const asset = await api.call('packAsset', { id, assetId, kind: 'skill' });
              setPendingSource(
                `<imported_asset label="${asset.label}" trust="untrusted">\n${asset.text.replace(/</g, '&lt;')}\n</imported_asset>`,
              );
              navigate('chat');
              notify(t('เพิ่มข้อมูลจาก Skill Pack แล้ว ตรวจบริการปลายทางก่อนส่ง'));
            })
          }
        />
      ) : (
        <div className={`chat-content${!session?.messages.length ? ' is-empty' : ''}`}>
          <div className="conversation" aria-live="polite">
            {session && (!!session.loadedContext?.length || session.compaction) && (
              <div className="context-bar">
                {!!session.loadedContext?.length && (
                  <details>
                    <summary>
                      {t('บริบทที่ใช้ (')}
                      {session.loadedContext.length})
                    </summary>
                    <ul>
                      {session.loadedContext.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {session.compaction && (
                  <span className="muted small">
                    {t(
                      'ย่อข้อมูลประกอบแล้ว จาก {0} เหลือ {1} tokens (ประมาณการ)',
                      session.compaction.before.toLocaleString(locale()),
                      session.compaction.after.toLocaleString(locale()),
                    )}
                  </span>
                )}
              </div>
            )}
            {session?.messages.map((message, index) => (
              <article
                key={`${session.id}:${index}`}
                // Like other AI chat apps: no name above each turn; the user's turn is a bubble, the answer is plain text.
                aria-label={message.role === 'user' ? t('คุณ') : message.role === 'status' ? t('สถานะงาน') : snapshot.settings.assistant}
                className={`message ${message.role}${message.role === 'status' && message.text === 'CANCELLED' ? ' neutral' : ''}${
                  index === lastAnswer && !running ? ' latest' : ''
                }`}
              >
                {message.role === 'status' && <div className="message-author">{t('สถานะงาน')}</div>}
                {message.role === 'assistant' && <SavedThinking value={message.thinking} />}
                {message.role === 'assistant' ? (
                  <RichText className="message-body" text={message.text} onLink={openLink} />
                ) : (
                  <div className="message-body">
                    {message.role === 'status' ? errorText[message.text] || t(message.text) : message.text}
                  </div>
                )}
                {!!message.files?.length && (
                  <div className="message-files" aria-label={t('ไฟล์ที่ส่งกับข้อความนี้')}>
                    {message.files.map((file, i) =>
                      file.preview?.startsWith('data:image/jpeg;base64,') ? (
                        <figure key={i} className="message-image">
                          <img src={file.preview} alt={t('ภาพที่ส่งให้ AI: {0}', file.name)} />
                          <figcaption>{file.name}</figcaption>
                        </figure>
                      ) : (
                        <span key={i}>
                          <Paperclip size={12} />
                          {file.name}
                        </span>
                      ),
                    )}
                  </div>
                )}
                {message.role === 'assistant' &&
                  (() => {
                    const matchedImages = (session.images || []).filter(
                      img => message.imageIds?.includes(img.id) || (!message.imageIds?.length && img.at === message.at),
                    );
                    if (!matchedImages.length) return null;
                    return (
                      <div className="message-files" aria-label={t('ภาพที่ AI สร้าง')}>
                        {matchedImages.map(img => (
                          <figure key={img.id} className="message-image">
                            {generatedPreviews[img.id] ? (
                              <img src={generatedPreviews[img.id]} alt={`${t('ภาพที่ AI สร้าง')}: ${img.name}`} />
                            ) : (
                              <div className="small muted">{img.name}</div>
                            )}
                            <figcaption>
                              <span>{img.model}</span>{' '}
                              <button
                                type="button"
                                className="quiet small"
                                onClick={() => void action(() => api.call('imageExport', { id: session.id, imageId: img.id }))}
                              >
                                <Download size={12} /> {t('ดาวน์โหลดรูป')}
                              </button>
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    );
                  })()}
                {!!message.docSources?.length && (
                  <p className="doc-sources small muted">
                    <BookOpen size={13} />
                    <span>
                      {t('อ้างอิงเอกสาร STeP')}: {message.docSources.join(' · ')}
                    </span>
                  </p>
                )}
                {!!message.written?.length && (
                  <ul className="written-files small">
                    {message.written.map(file => {
                      const stillStaged = file.status === 'staged' && (activeChangeIds === null || activeChangeIds.has(file.id));
                      return (
                        <li key={file.path}>
                          <FileText size={13} />
                          <span className="written-path">{file.path}</span>
                          <span className="muted">
                            {file.status === 'applied' ? t('บันทึกแล้ว') : stillStaged ? t('รอตรวจในรายการแก้ไข') : t('จัดการแล้ว')}
                          </span>
                          {/\.html?$/i.test(file.path) && (
                            <button
                              className="quiet small"
                              onClick={() =>
                                void action(() =>
                                  api.call('previewHtml', stillStaged ? { id: file.id, path: file.path } : { path: file.path }),
                                )
                              }
                            >
                              <Eye size={13} /> {t('ดูตัวอย่าง')}
                            </button>
                          )}
                          {stillStaged && (
                            <button
                              className="quiet small"
                              onClick={() => {
                                setToolTab('changes');
                                openPanel();
                              }}
                            >
                              {t('ไปตรวจ')}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!!message.google?.length && (
                  <GoogleChangesList
                    changes={message.google}
                    onOpen={change =>
                      void action(() =>
                        change.url
                          ? api.call('googleOpenChange', { url: change.url })
                          : api.call('googleOpen', { service: change.service }),
                      )
                    }
                  />
                )}
                {!!message.artifacts?.length && session && (
                  <ArtifactsList
                    artifacts={message.artifacts}
                    onOpen={artifact =>
                      void action(async () => {
                        // HTML opens in the Web tab's isolated preview; other kinds come back to show here.
                        const opened = (await api.call('artifactOpen', {
                          sessionId: session.id,
                          id: artifact.id,
                          version: artifact.version,
                        })) as OpenedArtifact | null;
                        if (opened) setViewingArtifact(opened);
                      })
                    }
                    onInlineHtml={async artifact => {
                      try {
                        return (await api.call('artifactOpen', {
                          sessionId: session.id,
                          id: artifact.id,
                          version: artifact.version,
                          inline: true,
                        })) as OpenedArtifact | null;
                      } catch (e) {
                        notify(explainError(e), 'error');
                        return null;
                      }
                    }}
                  />
                )}
                {!message.check && checkStillRunning(message.checkPending) && (
                  <p className="answer-check pending small muted" role="status">
                    <LoaderCircle size={13} className="spin" aria-hidden="true" />
                    {t('กำลังตรวจคำตอบกับเอกสาร STeP')}
                  </p>
                )}
                {message.check &&
                  (message.check.unsupported.length ? (
                    <div className="answer-check warn" role="note">
                      <p>
                        <AlertTriangle size={14} />
                        {t('ข้อความเหล่านี้ไม่พบในเอกสาร STeP โปรดตรวจก่อนใช้')}
                      </p>
                      <ul>
                        {message.check.unsupported.map((item, i) => (
                          <li key={i}>
                            “{item.claim}”{item.reason && <span className="muted"> · {item.reason}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="answer-check ok small muted">
                      <ShieldCheck size={13} />
                      {t('ตรวจกับเอกสาร STeP แล้ว ไม่พบข้อความที่ขัดกับเอกสาร')}
                    </p>
                  ))}
                {!!message.webSources?.length && (
                  <div className="web-sources" aria-label={t('แหล่งข้อมูลจากการค้นเว็บ')}>
                    <span>{t('แหล่งข้อมูลจาก Web Search')}</span>
                    {message.webSources
                      .filter(source => publicSourceUrl(source.url))
                      .map(source => (
                        <button
                          className="quiet"
                          key={source.url}
                          title={source.url}
                          onClick={() => void action(() => api.call('toolBrowser', { url: source.url }))}
                        >
                          {source.title} · {new URL(source.url).hostname}
                        </button>
                      ))}
                  </div>
                )}
                {message.role === 'assistant' && (
                  <div className="message-actions">
                    <button
                      className="icon"
                      aria-label={t('คัดลอก')}
                      title={t('คัดลอก')}
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(visibleAnswer(message.text))
                          .then(() => notify(t('คัดลอกแล้ว'), 'success'))
                          .catch(e => notify(explainError(e), 'error'))
                      }
                    >
                      <Copy size={15} />
                    </button>
                    {/* A drafting run's note, clarification prompt, or pure image reply is not a draftable document. */}
                    {!message.draftSummary &&
                      !message.clarification &&
                      !(message.imageIds?.length && /^(?:สร้างรูปแล้ว|Image created)\b/i.test(message.text.trim())) && (
                        <button
                          className="quiet message-open"
                          title={t('เปิดในผลงาน')}
                          onClick={() =>
                            void action(async () => {
                              await save();
                              // In a document task the answer becomes a proposal to compare, never a direct overwrite.
                              await api.call('stageMessage', { id: session.id, index });
                              await refresh();
                              setToolTab('output');
                              openPanel();
                              if (session.documentTool) notify(t('ส่งเป็นข้อเสนอแล้ว เทียบกับร่างแล้วกด “ใช้ร่างนี้”'), 'info');
                            })
                          }
                        >
                          <FileText size={15} />
                          {t('เปิดในผลงาน')}
                        </button>
                      )}
                    <FeedbackButtons
                      sessionId={session.id}
                      index={index}
                      message={message}
                      call={api.call}
                      onAsk={setFeedbackAsk}
                      onDone={text => text && notify(text)}
                    />
                    {toolRequests(message.text).map((request, i) => (
                      <button
                        className="tool-request quiet"
                        key={i}
                        onClick={() => {
                          setToolRequest({ ...request });
                          setToolTab(request.tool);
                          openPanel();
                        }}
                      >
                        {t('ตรวจ')} {request.tool}: {request.input.slice(0, 50)}
                      </button>
                    ))}
                    {message.ms !== undefined && (
                      <span className="answer-time" title={t('เวลาตั้งแต่ส่งคำถามจนได้คำตอบ')}>
                        {t('ใช้เวลา {0}', formatElapsed(message.ms))}
                      </span>
                    )}
                  </div>
                )}
              </article>
            ))}
            {snapshot?.usage?.warnings.length ? (
              <p className="small muted" role="status">
                {t('การใช้งาน AI ถึงอย่างน้อย 80% ของงบที่ตั้งไว้')}{' '}
                <button className="quiet" onClick={() => setUsageOpen(true)}>
                  {t('ดูการใช้งาน')}
                </button>
              </p>
            ) : null}
            {running && (
              <article className="message assistant">
                {plan.length > 1 && (
                  <ol className="plan-card" aria-label={t('ขั้นตอนของงาน')}>
                    {plan.map((step, i) => (
                      <li key={i} className={step.state}>
                        {step.state === 'running' ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : step.state === 'done' ? (
                          <Check size={14} />
                        ) : step.action ? (
                          <ShieldCheck size={14} />
                        ) : (
                          <Circle size={14} />
                        )}
                        <span>
                          {step.label}
                          {step.action && <small> {t('· ต้องทำโดยผู้มีอำนาจ')}</small>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {thinking && <ThinkingPanel thinking={thinking} running current={[working, nextWorking]} />}
                {liveText && !streamSaved && <RichText className="message-body streaming" text={liveText} onLink={openLink} />}
                {session && <WorkAssistantActivity actions={workActions[session.id] || []} running />}
                {/* One quiet line while working, as in Claude and Codex: each step replaces the last, nothing stacks up. */}
                <div className="activity" role="status" aria-live="polite">
                  <ThinkingScribble kind={waitingKind(working)} />
                  <span>{working}</span>
                  <span className="activity-detail">
                    {elapsed || t('0 วินาที')}
                    {now - heartbeatAt > 15000 && <> · {t('ยังไม่ได้รับสถานะจากแอป')}</>}
                  </span>
                </div>
                {now - activityAt > 45000 && !liveText && (
                  <p className="small muted">{t('ขั้นตอนนี้ยังไม่ส่งผลกลับมา คุณรอต่อหรือกดหยุดได้')}</p>
                )}
              </article>
            )}
            {!running && session && <WorkAssistantActivity actions={workActionsFromTrace(session.runs?.at(-1))} running={false} />}
            {!running && session?.runs?.some(run => run.steps.some(step => step.tools?.length)) && (
              <details className="tool-observability">
                <summary>{t('ประวัติเครื่องมือและรหัสตรวจสอบ')}</summary>
                <p className="small muted">{t('เก็บเฉพาะชื่อเครื่องมือ เวลา ผล และรหัสในเครื่อง ไม่บันทึกเนื้อหาที่ส่งให้เครื่องมือ')}</p>
                {session.runs.slice(-3).flatMap(run =>
                  run.steps.flatMap(step =>
                    (step.tools || []).map(tool => (
                      <p key={tool.id}>
                        <code>{tool.tool}</code> · {tool.ok ? t('สำเร็จ') : t('ไม่สำเร็จ')} · {tool.ms} ms{' '}
                        {tool.code && (
                          <span>
                            {t(errorText[tool.code] || 'เครื่องมือทำงานไม่สำเร็จ')} ({tool.code})
                          </span>
                        )}
                        <br />
                        <span className="small muted">
                          {t('รหัสตรวจสอบ')}: {run.id} / {tool.id}
                        </span>
                      </p>
                    )),
                  ),
                )}
              </details>
            )}
            {!running &&
              (session?.status === 'error' ||
                session?.status === 'interrupted' ||
                (session?.status === 'cancelled' && session.coordination && session.coordination.state !== 'done')) &&
              lastRequest && (
                <div className="retry-row">
                  {/* Use the reported failure code; only retry resumes the stopped task. */}
                  <button
                    onClick={() => {
                      if (failureCode === 'TOOL_DENIED') {
                        openAiSettings();
                        return;
                      }
                      if (failureCode === 'MODEL_NOT_AVAILABLE') {
                        setAiPicker(true);
                        composerRef.current?.scrollIntoView({ block: 'nearest' });
                        return;
                      }
                      void action(() =>
                        start(session.id, lastRequest, { skill: session.skill, mode: session.mode || workMode, imageModel, retry: true }),
                      );
                    }}
                  >
                    {t(
                      failureCode === 'TOOL_DENIED'
                        ? 'ตรวจสอบการเชื่อมต่อ AI'
                        : failureCode === 'MODEL_NOT_AVAILABLE'
                          ? 'เปลี่ยนโมเดล'
                          : 'ลองอีกครั้ง',
                    )}
                  </button>
                  <button
                    className="quiet"
                    onClick={() => {
                      setQuery(lastRequest);
                      setTimeout(() => composerRef.current?.focus(), 0);
                    }}
                  >
                    {t('แก้คำขอ')}
                  </button>
                  {/^(PROVIDER_|CONNECTION_|COPILOT_|AUTH_|OAUTH_)/.test(failureCode) && (
                    <button className="quiet" onClick={openAiSettings}>
                      {t('ตรวจสอบการเชื่อมต่อ AI')}
                    </button>
                  )}
                  {/^[A-Z_]+$/.test(failureCode) && (
                    <details className="small muted retry-code">
                      <summary>{t('ข้อมูลสำหรับแจ้งปัญหา')}</summary>
                      <p>{t('รหัสสำหรับแจ้งผู้ดูแล: {0}', failureCode)}</p>
                    </details>
                  )}
                </div>
              )}
            {!running && progress && <p className="muted small">{t(progress)}</p>}
            {/* Without tools the app searches ahead; with tools the AI decides, so nothing pops up while typing. */}
            {!running && workMode !== 'image' && !snapshot.policy?.features.toolLoop && needsPublicWebSearch(query) && (
              <p className="web-route small" role="status">
                {t('Web Search อัตโนมัติ · ค้นแหล่งข้อมูลล่าสุดก่อนตอบ')}
              </p>
            )}
            <div ref={conversationEnd} />
          </div>
          <div className="composer-area">
            {!session?.messages.length && (
              <WelcomeGreeting
                key={JSON.stringify([
                  snapshot.settings.workspace,
                  snapshot.settings.team,
                  snapshot.settings.language,
                  snapshot.settings.termsVersion,
                  welcomeVisit,
                  connection?.id,
                  connection?.ready,
                  currentModel,
                ])}
                call={api.call}
                name={snapshot.settings.userName || ''}
                connectionId={connection?.id || ''}
                model={currentModel}
                hasDraft={Boolean(query.trim())}
                enabled={
                  !startupPending &&
                  !wizard &&
                  !tour &&
                  !whatsNew &&
                  workMode === 'chat' &&
                  !running &&
                  !submitting &&
                  !session?.documentTool
                }
              />
            )}
            {(snapshot.transmissionGrants || [])
              .filter(g => g.sessionId === selected)
              .map(g => (
                <div className="transmission-scope" key={g.id} role="status">
                  <span>
                    {t(
                      'อนุญาตส่งผลการอ่าน: {0} → {1} · เหลือ {2} ผล / {3} ตัวอักษร · ถึง {4}',
                      g.source,
                      g.destination,
                      g.remainingResults,
                      g.remainingChars.toLocaleString(locale()),
                      new Date(g.expiresAt).toLocaleTimeString(locale()),
                    )}
                  </span>
                  <button
                    className="quiet"
                    onClick={() =>
                      void action(async () => {
                        await api.call('transmissionRevoke', { id: g.id });
                        await refresh();
                      })
                    }
                  >
                    {t('ถอนสิทธิ์และหยุดงาน')}
                  </button>
                </div>
              ))}
            {/* The assistant's questions and the task's plan sit right above the composer, under the newest message,
                  as in Claude and ChatGPT: what needs the employee is where they type. */}
            <div className="composer-dock">
              {workflow === 'assistant' && (
                <WorkAssistantGuide
                  privacyReady={snapshot.policy?.checks?.privacy === true}
                  toolsReady={snapshot.policy?.features.toolLoop === true}
                />
              )}
              {session?.workPlan?.tasks.length ? (
                <WorkPlanCard
                  plan={session.workPlan}
                  running={running || submitting}
                  continuation={session.longTask}
                  onExecute={continuous =>
                    withWritableForPlan(async () => {
                      setWorkflow('');
                      workflowRef.current = '';
                      setWorkMode('chat');
                      await start(session.id, t('ลงมือทำตามแผน'), {
                        mode: 'chat',
                        workflow: 'execute',
                        imageModel: '',
                        retry: false,
                        coordinator: false,
                        autoContinue: continuous,
                      });
                    })
                  }
                  onComment={async (number, comment) => {
                    try {
                      await api!.call('planComment', { id: session.id, number, comment });
                      await refresh();
                      return true;
                    } catch (e) {
                      notify(explainError(e), 'error');
                      return false;
                    }
                  }}
                  onRevise={() =>
                    void action(async () => {
                      // Revising by the comments runs the plan workflow again; the new plan needs approval as before.
                      setWorkflow('plan');
                      workflowRef.current = 'plan';
                      setWorkMode('chat');
                      await start(
                        session.id,
                        revisionRequest(session.workPlan!, t('ปรับแผนตามความเห็นของฉันในแต่ละข้อ'), number => t('ข้อ {0}', number)),
                        { mode: 'chat', imageModel: '', retry: false, coordinator: false },
                      );
                    })
                  }
                  onDismiss={() =>
                    void action(async () => {
                      await api!.call('planClear', { id: session.id });
                      await refresh();
                    })
                  }
                />
              ) : workflow === 'plan' && session && lastAnswer >= 0 && !running && !submitting ? (
                <div className="work-plan work-plan-proceed" role="group" aria-label={t('ลงมือทำตามแผน')}>
                  <span className="small muted">{t('พร้อมลงมือทำตามแผนที่คุยกันแล้วหรือยัง?')}</span>
                  <div className="work-plan-actions">
                    <button
                      type="button"
                      className="work-plan-run"
                      onClick={() =>
                        withWritableForPlan(async () => {
                          setWorkflow('');
                          workflowRef.current = '';
                          setWorkMode('chat');
                          await start(session.id, t('ลงมือทำตามแผนที่คุยกัน'), {
                            mode: 'chat',
                            imageModel: '',
                            retry: false,
                            coordinator: false,
                          });
                        })
                      }
                    >
                      <Play size={14} />
                      {t('ลงมือทำตามแผน')}
                    </button>
                  </div>
                </div>
              ) : null}
              {questions
                .filter(q => q.sessionId === selected)
                .map(q => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    onAnswer={async answer => {
                      await api!.call('questionRespond', { id: q.id, answer });
                    }}
                  />
                ))}
            </div>
            {!connection?.ready && !session && (
              <div className="connection-banner" role="status">
                <strong>{t('เชื่อมต่อ AI เพื่อเริ่มทำงาน')}</strong>
                <button data-tour="connect" onClick={openAiSettings}>
                  {t('ไปที่หน้าเชื่อมต่อ AI')}
                </button>
              </div>
            )}
            <div className="composer" data-tour="composer">
              {pendingSource && (
                <div className="composer-chips">
                  <button className="source-chip quiet" onClick={() => setPendingSource('')}>
                    {t('ข้อมูลต้นทางแนบแล้ว ×')}
                  </button>
                </div>
              )}
              {wantsImage && (
                <div className="image-route" role="status">
                  <Sparkles size={14} />
                  {canGenerateImages(connection) ? (
                    <>
                      <span>{t('สร้างรูปภาพ')}</span>
                      <select
                        aria-label={t('โมเดลสำหรับสร้างรูปภาพ')}
                        value={imageModel}
                        onChange={e => setImageModel(e.target.value)}
                        disabled={running}
                      >
                        <option value="">{availableImages[0] || t('กำลังดูโมเดลที่บัญชีนี้ใช้ได้…')}</option>
                        {availableImages.map(id => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                      {imageCatalogError && <small>{imageCatalogError}</small>}
                    </>
                  ) : (
                    <span>
                      {t('หากต้องการสร้างรูปภาพ เลือก OpenAI, Google, OpenRouter หรือ AI ขององค์กร การลงชื่อแบบนี้ยังสร้างรูปไม่ได้')}
                    </span>
                  )}
                </div>
              )}
              {files.length > 0 && (
                <div className="attachments">
                  {files.map(f => (
                    <span key={f.id} className={f.usable ? undefined : 'refused'}>
                      <button
                        className="attachment-preview"
                        onClick={() => setInspecting(f)}
                        title={f.usable ? f.status : errorText[f.reason || ''] || f.status}
                      >
                        {f.imagePreview ? <img src={f.imagePreview} alt={t('ตัวอย่างภาพแนบ')} /> : <Paperclip size={13} />}
                        <span className="attachment-label">
                          {f.name}
                          {f.imagePreview && f.usable && <small>{t(f.vision ? 'ส่งภาพให้ AI' : 'ส่งเฉพาะข้อความ OCR')}</small>}
                          {!f.usable && <small>{t('· ส่งไม่ได้')}</small>}
                        </span>
                      </button>
                      <button aria-label={t('นำไฟล์ออก')} title={t('นำไฟล์ออก')} onClick={() => removeFile(f.id)}>
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {pastingImage && (
                <p className="composer-image-status small muted" role="status">
                  {t('กำลังเตรียมภาพ…')}
                </p>
              )}
              {session && !running && !connection?.ready && (
                <div className="connection-warning" role="status">
                  <Sparkles size={14} />
                  <span>{connection ? t('{0} ของงานนี้ยังไม่พร้อม', providerName(connection)) : t('งานนี้ยังไม่ได้เลือก AI')}</span>
                  {readyConnection && readyConnection.id !== session.connectionId ? (
                    <button className="quiet" onClick={() => void action(() => chooseConnection(readyConnection.id))}>
                      {t('เปลี่ยนเป็น')} {providerName(readyConnection)}
                    </button>
                  ) : (
                    <button className="quiet" onClick={openAiSettings}>
                      {t('ไปที่หน้าเชื่อมต่อ AI')}
                    </button>
                  )}
                </div>
              )}
              {suggested && (
                <div className="skill-chip skill-suggestion" role="status">
                  <Blocks size={13} />
                  <span>{t('Skill ที่เหมาะกับงานนี้:')}</span>
                  <button
                    className="quiet"
                    title={suggested.description}
                    onClick={() => {
                      setForcedSkill(suggested.name);
                      setSuggestedSkill('');
                      composerRef.current?.focus();
                    }}
                  >
                    {t('ลองใช้ Skill: {0}', suggested.title)}
                  </button>
                  <button
                    className="icon"
                    aria-label={t('ไม่ใช้ Skill ที่แนะนำ')}
                    onClick={() => {
                      setDismissedSkills(list => [...list, suggested.name]);
                      setSuggestedSkill('');
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              {forced && (
                <div className="skill-chip">
                  <Blocks size={13} />
                  {t('ใช้ Skill:')} <strong>{forced.title}</strong>
                  <code>/{forced.name}</code>
                  <button className="icon" aria-label={t('เลิกใช้ Skill นี้')} onClick={() => setForcedSkill('')}>
                    <X size={13} />
                  </button>
                </div>
              )}
              {activeSlashSkill && (
                <div id="composer-skills" className="slash-menu" role="listbox" aria-label={t('เลือก Skill')}>
                  {slashMatches.map(s => {
                    const active = s.name === activeSlashSkill.name;
                    return (
                      <button
                        key={s.name}
                        id={`composer-skill-${s.name}`}
                        ref={active ? activeSlashOption : undefined}
                        type="button"
                        tabIndex={-1}
                        role="option"
                        aria-selected={active}
                        className={active ? 'active' : ''}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => useSkill(s.name, true)}
                      >
                        <span className="slash-title">
                          {s.title}
                          {forTeam(s) && <small className="team-mark">{t('ทีมคุณ')}</small>}
                        </span>
                        <small className="slash-desc">{s.description}</small>
                        <code>/{s.name}</code>
                      </button>
                    );
                  })}
                </div>
              )}
              {!!session?.sideQuestions?.length && (
                <div className="side-question-history" aria-label={t('ถามแทรก')}>
                  {session.sideQuestions.map(q => (
                    <details className="work-plan" key={q.id} open={q.status !== 'completed' || q === session.sideQuestions?.at(-1)}>
                      <summary>
                        {t('ถามแทรก')} · {q.question}
                      </summary>
                      <small className="muted">{t('อ้างอิงภาพสถานะเอกสารรุ่น {0}', q.revision)}</small>
                      {q.status === 'running' ? (
                        <div className="side-question-progress">
                          <p role="status">{t('กำลังตอบคำถามแทรก')}</p>
                          <button className="quiet" onClick={() => void action(() => api.call('cancelSideQuestion', { id: session.id }))}>
                            {t('หยุดคำถามแทรก')}
                          </button>
                        </div>
                      ) : q.code ? (
                        <p role="alert">{explainError(new Error(q.code))}</p>
                      ) : (
                        <>
                          <ChatMarkdown text={q.answer || ''} onLink={openLink} />
                          {!!q.docSources?.length && (
                            <p className="small muted">
                              {t('อ้างอิงเอกสาร STeP')}: {q.docSources.join(' · ')}
                            </p>
                          )}
                          {!!q.check?.unsupported.length && (
                            <div className="answer-check warn" role="note">
                              <p>{t('ข้อความเหล่านี้ไม่พบในเอกสาร STeP โปรดตรวจก่อนใช้')}</p>
                              <ul>
                                {q.check.unsupported.map((item, i) => (
                                  <li key={i}>
                                    “{item.claim}”{item.reason && <span className="muted"> · {item.reason}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </details>
                  ))}
                </div>
              )}
              {/* While the assistant waits for an answer, the question card is the one place to type. */}
              {questionPending && (
                <p className="composer-question-note small muted" role="status">
                  {t('ตอบคำถามของผู้ช่วยด้านบนก่อน แล้วพิมพ์คำขอต่อได้')}
                </p>
              )}
              <textarea
                ref={composerRef}
                hidden={questionPending}
                aria-label={t('พิมพ์คำขอ')}
                aria-controls={activeSlashSkill ? 'composer-skills' : undefined}
                aria-activedescendant={activeSlashSkill ? `composer-skill-${activeSlashSkill.name}` : undefined}
                placeholder={
                  forced
                    ? t('บอกงานสำหรับ {0}…', forced.title)
                    : session?.documentTool && workMode === 'draft'
                      ? t('พิมพ์สิ่งที่อยากแก้ในเอกสารนี้ เช่น ระยะเวลาดำเนินการ 90 วัน หรือถามเกี่ยวกับร่างได้')
                      : t('พิมพ์งานที่อยากให้ช่วย หรือพิมพ์ / เพื่อเลือก Skill')
                }
                value={query}
                onFocus={e => setSlashAtCaret(Boolean(slash) && caretAtEnd(e.currentTarget))}
                onSelect={e => setSlashAtCaret(caretAtEnd(e.currentTarget))}
                onBlur={() => setSlashAtCaret(false)}
                onChange={e => {
                  const atEnd = caretAtEnd(e.currentTarget);
                  setQuery(e.currentTarget.value);
                  setSlashAtCaret(atEnd);
                  setSlashIndex(0);
                }}
                onPaste={e => {
                  const item = Array.from(e.clipboardData.items).find(value => value.kind === 'file' && value.type.startsWith('image/'));
                  if (!item) return;
                  if (!e.clipboardData.getData('text/plain')) e.preventDefault();
                  const file = item.getAsFile();
                  if (file) void action(() => pasteImage(file));
                }}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                  if (snapshot.settings.vimMode && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    const next = vimEdit(e.key, query, e.currentTarget.selectionStart, vimNormal);
                    if (next) {
                      e.preventDefault();
                      setQuery(next.text);
                      setVimNormal(next.normal);
                      requestAnimationFrame(() => composerRef.current?.setSelectionRange(next.cursor, next.cursor));
                      return;
                    }
                  }
                  const atSlash = slash && caretAtEnd(e.currentTarget) && !e.altKey && !e.ctrlKey && !e.metaKey;
                  if (atSlash && e.key === 'Escape') {
                    e.preventDefault();
                    setQuery(query.slice(0, slash.start).trimEnd());
                    return;
                  }
                  if (atSlash && activeSlashSkill && !e.shiftKey && ['ArrowDown', 'ArrowUp', 'Tab', 'Enter'].includes(e.key)) {
                    e.preventDefault();
                    if (e.key === 'ArrowDown') setSlashIndex(i => Math.min(i + 1, slashMatches.length - 1));
                    else if (e.key === 'ArrowUp') setSlashIndex(i => Math.max(i - 1, 0));
                    else useSkill(activeSlashSkill.name, true);
                    return;
                  }
                  if (e.key === 'Backspace' && !query && forcedSkill) {
                    setForcedSkill('');
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void action(send);
                  }
                }}
              />
              {snapshot.settings.vimMode && <span className="small muted">Vim: {vimNormal ? 'Normal' : 'Insert'}</span>}
              {session && (
                <div className="composer-side-actions">
                  {session?.documentTool && (
                    <button
                      className="quiet"
                      disabled={Boolean(files.length || pendingSource || submitting)}
                      onClick={() =>
                        void action(async () => {
                          const text = query;
                          await save();
                          const fresh = await createTask();
                          if (fresh) {
                            await selectSession(fresh.id);
                            setWorkflow('');
                            workflowRef.current = '';
                            setForcedSkill('');
                            setQuery(text);
                          }
                        })
                      }
                    >
                      {t('เริ่มงานใหม่')}
                    </button>
                  )}
                </div>
              )}
              <Readiness api={api} query={query} connectionId={session?.connectionId || connectionId} model={currentModel} />
              <div className="composer-tools">
                <div className="composer-options">
                  <button
                    className="icon composer-add"
                    data-tour="attach"
                    aria-label={t('ตรวจและแนบเอกสาร')}
                    title={t('ตรวจและแนบเอกสาร')}
                    disabled={running || pastingImage || (!session && connectionId === CLAUDE_CODE)}
                    onClick={() => void action(() => attachFiles())}
                  >
                    <Plus size={18} />
                  </button>
                  {snapshot.policy?.features.voice && (
                    <VoiceButton
                      key={session?.id || 'composer'}
                      api={api}
                      disabled={running || pastingImage}
                      onText={text => setQuery(q => (q ? q + '\n' : '') + text)}
                    />
                  )}
                  {snapshot.policy?.features.vision && (
                    <button
                      className="icon"
                      aria-label={t('แนบภาพให้ AI')}
                      title={t('ตรวจและแนบภาพต้นฉบับให้ AI')}
                      disabled={running || pastingImage}
                      onClick={() => void action(() => attachFiles(true))}
                    >
                      <ImagePlus size={18} />
                    </button>
                  )}
                  <select
                    className="pill-select"
                    data-tour="mode"
                    aria-label={t('โหมดทำงาน')}
                    title={t('โหมดทำงาน')}
                    value={workflow === 'execute' ? 'chat' : workflow || workMode}
                    disabled={running || submitting}
                    onChange={e => {
                      const value = e.target.value;
                      if (value in WORKFLOW_LABELS) {
                        setWorkflow(value as Workflow);
                        setWorkMode('chat');
                      } else {
                        setWorkflow('');
                        setWorkMode(value as WorkMode);
                      }
                    }}
                  >
                    <option value="chat">{t('คุยกับผู้ช่วย')}</option>
                    {/* Native workflows of the harness, like Claude Code's plan mode: rules for how the assistant works. */}
                    <optgroup label={t('ขั้นตอนทำงาน')}>
                      {COMPOSER_WORKFLOWS.map(id => (
                        <option key={id} value={id}>
                          {t(WORKFLOW_LABELS[id])}
                        </option>
                      ))}
                    </optgroup>
                    {/* Chat writes documents too (open in Output, or file changes), like other AI apps; the separate
                        drafting mode stays only for tasks that already use it and for multi-worker drafting. */}
                    {(workMode === 'draft' || session?.documentTool || snapshot.policy?.features.coordinator) && (
                      <option value="draft">{session?.documentTool ? t('แก้เอกสารนี้') : t('สร้างเอกสาร')}</option>
                    )}
                    <option value="image">{t('สร้างรูป')}</option>
                  </select>
                  {/* Beside the mode it belongs to, so a new task can choose it before its first message. */}
                  {canCoordinate && (
                    <label className="pill-select split-pill" title={t('ให้ AI แบ่งงานย่อยให้ผู้ช่วยหลายตัว')}>
                      <input
                        aria-label={t('แบ่งงานย่อย')}
                        type="checkbox"
                        checked={coordinated}
                        disabled={running || submitting}
                        onChange={e => setCoordinated(e.target.checked)}
                      />
                      <Split size={15} aria-hidden="true" />
                      {coordinated && <span>{t('แบ่งงานย่อย')}</span>}
                    </label>
                  )}
                  {/* Permission as a small shield pill with a short word; ordinary office staff see only the two everyday
                        choices (Ask vs Read-only), while Dev Mode or an explicit advanced mode unlocks all four levels. */}
                  {snapshot.policy &&
                    (() => {
                      const showAdvancedPermissions = Boolean(
                        (snapshot.features?.developmentMode && snapshot.settings.developmentMode) ||
                        !['ask', 'plan'].includes(snapshot.policy.mode),
                      );
                      return (
                        <label className="pill-select permission-pill" title={t('สิทธิ์เครื่องมือ')}>
                          <ShieldCheck size={14} aria-hidden="true" />
                          <span>{t(PERMISSION_SHORT[snapshot.policy.mode] || 'ถามก่อน')}</span>
                          <ChevronDown size={13} aria-hidden="true" />
                          <select
                            aria-label={t('สิทธิ์เครื่องมือ')}
                            title={t('สิทธิ์เครื่องมือ')}
                            value={snapshot.policy.mode}
                            disabled={running || submitting}
                            onChange={e =>
                              void action(async () => {
                                await api.call('permissionMode', { mode: e.target.value });
                                await refresh();
                              })
                            }
                          >
                            <option value="ask" disabled={!snapshot.policy.modes.includes('ask')}>
                              {t('ถามก่อนแก้ไข')}
                            </option>
                            {showAdvancedPermissions && (
                              <option value="acceptEdits" disabled={!snapshot.policy.modes.includes('acceptEdits')}>
                                {t('แก้ไฟล์ได้เลย · ถามก่อนรันคำสั่ง')}
                                {!snapshot.policy.modes.includes('acceptEdits') ? t(' · ปิดโดยผู้ดูแล') : ''}
                              </option>
                            )}
                            {showAdvancedPermissions && (
                              <option value="auto" disabled={!snapshot.policy.modes.includes('auto')}>
                                {t('อัตโนมัติเต็มรูปแบบ')}
                                {!snapshot.policy.modes.includes('auto') ? t(' · ปิดโดยผู้ดูแล') : ''}
                              </option>
                            )}
                            <option value="plan" disabled={!snapshot.policy.modes.includes('plan')}>
                              {t('อ่านอย่างเดียว · ห้ามแก้ไขไฟล์')}
                            </option>
                          </select>
                        </label>
                      );
                    })()}
                </div>
                <div className="composer-submit">
                  <div className="ai-picker" ref={aiPickerRef}>
                    <button
                      type="button"
                      className="pill-select ai-picker-button"
                      data-tour="model"
                      aria-label={t('เลือกบริการ โมเดลและระดับการคิด')}
                      aria-expanded={aiPicker}
                      title={aiSummary}
                      disabled={running}
                      onClick={() => setAiPicker(open => !open)}
                    >
                      <span className={`status-dot ${connection?.ready ? (runFailed ? 'failed' : 'ok') : ''}`} aria-hidden="true" />
                      <span className="ai-picker-label">{aiLabel}</span>
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    {aiPicker && (
                      <div className="ai-picker-menu" role="group" aria-label={t('AI ของงานนี้')}>
                        <label>
                          {t('บัญชี AI')}
                          <select
                            aria-label={t('เลือกบัญชี AI')}
                            value={session ? session.connectionId : connectionId}
                            disabled={running}
                            onChange={e => void action(() => chooseConnection(e.target.value))}
                          >
                            <option value="">{t('เลือก AI')}</option>
                            {snapshot.connections.map(c => (
                              <option key={c.id} value={c.id}>
                                {connectionName(c)}
                                {c.ready ? '' : t(' · ยังไม่พร้อม')}
                              </option>
                            ))}
                            {!session && <option value={CLAUDE_CODE}>{t('Claude · Pro/Max (เปิดใน Claude Code)')}</option>}
                          </select>
                        </label>
                        {connection && (
                          <label>
                            {t('โมเดล')}
                            <select
                              aria-label={t('เลือกโมเดล')}
                              title={
                                connection.models?.find(m => m.id === currentModel)?.description ||
                                t('โมเดลสำหรับงานนี้ เปลี่ยนได้ทุกเมื่อ')
                              }
                              value={currentModel}
                              disabled={running}
                              onChange={e => void action(() => chooseModel(e.target.value))}
                            >
                              <option value="" title={t('ค่าเริ่มต้นของบริการ')}>
                                {defaultModel ? defaultModel.label : t('ค่าเริ่มต้นของบริการ')}
                              </option>
                              {(connection.models || [])
                                .filter(m => m.id !== defaultModel?.id || m.id === currentModel)
                                .map(m => (
                                  <option key={m.id} value={m.id} title={m.description}>
                                    {m.label}
                                  </option>
                                ))}
                              {currentModel && !connection.models?.some(m => m.id === currentModel) && (
                                <option value={currentModel}>{currentModel}</option>
                              )}
                            </select>
                          </label>
                        )}
                        {activeModel?.efforts?.length ? (
                          <label>
                            {t('ระดับการคิด')}
                            <select
                              aria-label={t('เลือกระดับการคิด')}
                              title={
                                activeModel.efforts.find(e => e.id === currentEffort)?.description ||
                                (!currentEffort && snapshot.policy?.features.autoEffort
                                  ? t(
                                      'อัตโนมัติ: คำถามสั้นในแชตใช้ Low งานใหญ่ (หลายขั้นตอน โหมดวางแผน คำขอยาว หรือหลายไฟล์) ใช้ High งานทั่วไปใช้ค่าเริ่มต้นของโมเดล',
                                    )
                                  : t('ระดับการคิด (reasoning) ยิ่งสูงยิ่งละเอียดแต่ช้าและใช้โควตามากขึ้น'))
                              }
                              value={currentEffort}
                              disabled={running}
                              onChange={e => void action(() => chooseModel(currentModel, e.target.value))}
                            >
                              <option value="">
                                {snapshot.policy?.features.autoEffort
                                  ? t('อัตโนมัติตามขนาดงาน')
                                  : activeModel.defaultEffort
                                    ? t('ค่าเริ่มต้น ({0})', effortLabel[activeModel.defaultEffort] || activeModel.defaultEffort)
                                    : t('ค่าเริ่มต้น')}
                              </option>
                              {activeModel.efforts.map(e => (
                                <option key={e.id} value={e.id} title={e.description}>
                                  {effortLabel[e.id] || e.id}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <AccountQuotaMenuSummary
                          account={activeUsageAccount}
                          activeModel={currentModel}
                          busy={quotaRefreshing}
                          onRefresh={() => void action(refreshActiveQuota)}
                          onOpenUsage={() => {
                            setAiPicker(false);
                            setUsageOpen(true);
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {running && query.trim() ? (
                    // Typed while the task runs: the send button asks a side question (the task keeps running). Enter still
                    // keeps the text for the next turn, so a follow-up is never answered as a side question by accident.
                    <button
                      className="send"
                      title={t('ถามแทรก')}
                      disabled={Boolean(files.length || pendingSource || session?.sideQuestions?.some(q => q.status === 'running'))}
                      onClick={() => void action(() => askAside())}
                    >
                      <ArrowUp size={18} aria-hidden="true" />
                      {t('ถามแทรก')}
                    </button>
                  ) : running ? (
                    <button
                      className="send stop"
                      title={writeNow ? t('เขียนคำตอบจากที่อ่านมา · กดอีกครั้งเพื่อหยุดงาน') : t('หยุดงาน')}
                      onClick={() => {
                        if (!writeNow) return void api.call('cancel', { id: selected });
                        setWriteNowAt(startedAt);
                        void api.call('writeNow', { id: selected });
                      }}
                    >
                      <Square size={15} aria-hidden="true" />
                      {writeNow ? t('เขียนคำตอบ') : t('หยุดงาน')}
                    </button>
                  ) : (
                    <button
                      className="send"
                      title={t('ส่งคำขอ (Enter) · ขึ้นบรรทัดใหม่ (Shift+Enter)')}
                      disabled={(!query.trim() && !files.some(file => file.imagePreview)) || submitting || pastingImage}
                      onClick={() => void action(send)}
                    >
                      {submitting ? (
                        <LoaderCircle size={18} className="spin" aria-hidden="true" />
                      ) : (
                        <ArrowUp size={18} aria-hidden="true" />
                      )}
                      {t('ส่งคำขอ')}
                    </button>
                  )}
                </div>
              </div>
              <div className="composer-usage">
                {workMode !== 'image' && (
                  <ContextWindowGauge session={session} connectionId={connection?.id} model={currentModel} onEvent={api.onEvent} />
                )}
                <InlineQuotaChip account={activeUsageAccount} activeModel={currentModel} onClick={() => setUsageOpen(true)} />
              </div>
            </div>
            {!session?.messages.length && (
              <div className="welcome-extras">
                <div className="welcome-quick-starts" aria-label={t('ลองเริ่มจาก')}>
                  {CHAT_STARTERS.map(({ label, request, Icon }) => (
                    <button
                      key={label}
                      className="quiet"
                      title={t(request)}
                      onClick={() => {
                        setQuery(t(request));
                        composerRef.current?.focus();
                      }}
                    >
                      <Icon size={15} aria-hidden="true" />
                      {t(label)}
                    </button>
                  ))}
                </div>
                <details className="welcome-tools">
                  <summary data-tour="starters">{t('ตัวช่วยเริ่มงาน')}</summary>
                  <MorningBriefCard call={api.call} onError={e => notify(explainError(e), 'error')} onAsk={setQuery} />
                  <p className="suggestions-label">
                    {myTeamName ? t('ลองงานแรกของทีม {0}', myTeamName) : t('ลองงานแรกที่คนส่วนใหญ่ใช้บ่อย')}
                  </p>
                  <div className="suggestions">
                    {startersFor(snapshot.settings.team).map(starter => {
                      const text = starterText(starter);
                      return (
                        <button
                          key={text}
                          onClick={() => {
                            setQuery(text);
                            composerRef.current?.focus();
                          }}
                        >
                          <Sparkles size={16} />
                          <span>
                            <small className="starter-tag">{starterTag(starter)}</small>
                            {text}
                          </span>
                          <ChevronLeft className="point-right" size={15} />
                        </button>
                      );
                    })}
                  </div>
                  {/* One quiet entry under the composer: the tour lives with the other first-day helpers. */}
                  {!snapshot.settings.tourDone && (
                    <button className="welcome-tour quiet" onClick={commands.tour}>
                      <Compass size={15} />
                      {t('ดูทัวร์แนะนำ')}
                    </button>
                  )}
                </details>
              </div>
            )}
          </div>
        </div>
      )}
      {planWriteAsk && (
        <ConfirmDialog
          title={t('เปลี่ยนสิทธิ์เป็น “ถามก่อนแก้ไข”?')}
          confirmLabel={t('เปลี่ยนแล้วลงมือทำ')}
          onCancel={() => setPlanWriteAsk(null)}
          onConfirm={async () => {
            const proceed = planWriteAsk;
            setPlanWriteAsk(null);
            await action(async () => {
              await api.call('permissionMode', { mode: 'ask' });
              await refresh();
              await proceed();
            });
          }}
        >
          <p>{t('ตอนนี้อ่านอย่างเดียว การทำตามแผนต้องแก้ไฟล์ได้ ระบบจะถามก่อนแก้ทุกครั้ง และสิทธิ์นี้คงอยู่จนกว่าคุณเปลี่ยนในตั้งค่า')}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
