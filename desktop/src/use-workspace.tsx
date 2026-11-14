import type {
  ApprovalRequest,
  Attachment,
  Connection,
  PlanStep,
  Session,
  SkillEntry,
  Snapshot,
  ToolQuestion,
  WorkAction,
  WorkMode,
  Workflow,
} from './types';
import { CLAUDE_CODE, connectionName, effortLabel, errorText, explainError, statusText } from './messages';
import type { DocumentAttachment, DocumentForm } from './document-tool-app';
import { type DocumentAttachmentRole, type DocumentToolId, documentRequest, documentTool } from './document-tools';
import type { FeedbackAsk, ReportAsk } from './feedback';
import type { InvitationPresentation } from './invitation';
import type { OpenedArtifact } from './artifacts-list';
import { type PaletteItem, matchesSession } from './ui';
import { RELEASE_NOTES, type ReleaseNote, compareVersions, unseenNotes } from './whats-new';
import { TASK_SEEN_KEY, initialSeen, needsYouCount, taskAlert } from './task-alerts';
import { type ToolRequest, type ToolTab } from './tools';
import { setHeartbeatAt, setReasoning, setStream, tickLiveClock } from './live-run';
import type { VaultPrompt } from './vault-prompt';
import { commandForKey, commandPalette } from './commands';
import { documentText, plainDocument as toDoc } from './draft';
import { imageModels, isImageRequest } from './image-routing';
import { saveSidebarChoice } from './sidebar-rail';
import { resolvePresentation } from './document-presentation';
import { useExportOptions, useInfoDialogs, useToasts, useWindowLayout } from './workspace-parts';
import { setLanguage, t, teamName } from './i18n';
import { skillsForStaff } from './skill-display';
import { updateWorkActions } from './work-assistant';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { createDraftEditor } from './draft-editor';
import { useUpdate } from './update';
import type { ReactElement } from 'react';

/** Everything the main window keeps: state, effects, derived values and the actions the screens call. */
const NO_PALETTE_ITEMS: PaletteItem[] = [];
const NO_SKILLS: SkillEntry[] = [];
export function useWorkspace() {
  const api = window.step;
  const [update] = useUpdate(api);
  const [toolApprovals, setToolApprovals] = useState<ApprovalRequest[]>([]);
  const [vaultPrompts, setVaultPrompts] = useState<VaultPrompt[]>([]);
  const [questions, setQuestions] = useState<ToolQuestion[]>([]);
  const {
    usageOpen,
    setUsageOpen,
    memoryOpen,
    setMemoryOpen,
    learningOpen,
    setLearningOpen,
    learningText,
    setLearningText,
    packsOpen,
    setPacksOpen,
    ownPacks,
    setOwnPacks,
    keyboardOpen,
    setKeyboardOpen,
    automationOpen,
    setAutomationOpen,
  } = useInfoDialogs();
  const [vimNormal, setVimNormal] = useState(false),
    [coordinated, setCoordinated] = useState(false);
  const [searchMatches, setSearchMatches] = useState<{ query: string; ids: string[] }>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState('');
  const snapshotVersion = useRef(0),
    navigationVersion = useRef(0);
  const [settings, setSettingsState] = useState(false),
    [settingsPage, setSettingsPage] = useState<'general' | 'ai' | 'credentials'>('general'),
    [vaultOrigin, setVaultOrigin] = useState(''),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState('');
  const [settingsExit, setSettingsExit] = useState(false);
  const settingsDirty = useRef(false);
  const settingsNext = useRef<(() => void | Promise<void>) | null>(null);
  const guardSettingsExit = (next: () => void | Promise<void>) => {
    if (!settingsDirty.current) return false;
    settingsNext.current = next;
    setSettingsExit(true);
    return true;
  };
  const settingsChanged = useCallback((dirty: boolean) => {
    settingsDirty.current = dirty;
  }, []);
  const setSettings = (visible: boolean) => {
    if (!visible && guardSettingsExit(() => setSettingsState(false))) return;
    setSettingsState(visible);
  };
  const [filter, setFilter] = useState<'all' | 'artifacts'>('all');
  const [progress, setProgress] = useState(''),
    [running, setRunning] = useState(false);
  const [activityAt, setActivityAt] = useState(0);
  const [error, setError] = useState(''),
    [files, setFiles] = useState<Attachment[]>([]),
    [inspecting, setInspecting] = useState<Attachment | null>(null),
    [viewingArtifact, setViewingArtifact] = useState<OpenedArtifact | null>(null);
  const { sidebarChoice, left, setLeft, right, setRight, history, setHistory, roomy, setRoomy, leftPeek, setLeftPeek, width, setWidth } =
    useWindowLayout();
  const [connectionId, setConnectionId] = useState(''),
    [dirty, setDirty] = useState(false);
  const {
    format,
    setFormat,
    exportPath,
    setExportPath,
    exportFont,
    setExportFont,
    presentation,
    setPresentation,
    presentationRef,
    exportGaruda,
    setExportGaruda,
    exporting,
    setExporting,
    exportPending,
    exportSettings,
    setExportSettings,
    exportInfo,
    setExportInfo,
  } = useExportOptions(selected);
  const [authCode, setAuthCode] = useState<{ id: string; code: string } | null>(null);
  const [plan, setPlan] = useState<(PlanStep & { state: string })[]>([]);
  const [workActions, setWorkActions] = useState<Record<string, WorkAction[]>>({});
  const [view, setView] = useState<'chat' | 'receipt' | 'skills' | 'documents' | 'media' | 'schedules'>('chat');
  const [welcomeVisit, setWelcomeVisit] = useState(0);
  const navigate = (next: typeof view) => {
    if (
      guardSettingsExit(() => {
        setSettingsState(false);
        navigate(next);
      })
    )
      return;
    navigationVersion.current++;
    setView(next);
  };
  const [documentsOpened, setDocumentsOpened] = useState(false);
  const [consumedDocumentTask, setConsumedDocumentTask] = useState('');
  const [mediaOpened, setMediaOpened] = useState(false);
  useEffect(() => {
    if (view === 'documents') setDocumentsOpened(true);
    if (view === 'media') setMediaOpened(true);
  }, [view]);
  const [wizard, setWizard] = useState(false),
    [tour, setTour] = useState(false);
  const [whatsNew, setWhatsNew] = useState<ReleaseNote[] | null>(null);
  const [skills, setSkills] = useState<SkillEntry[] | null>(null),
    [forcedSkill, setForcedSkill] = useState(''),
    // "ลองใช้ Skill": the Skill the Router finds clearly fits what is being typed, and the ones the person waved away.
    [suggestedSkill, setSuggestedSkill] = useState(''),
    [dismissedSkills, setDismissedSkills] = useState<string[]>([]),
    [slashIndex, setSlashIndex] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { toasts, setToasts, toastId, dismiss, notify } = useToasts();
  const runningIds = useRef(new Map<string, object>());
  const [startedAt, setStartedAt] = useState(0);
  const [feedbackAsk, setFeedbackAsk] = useState<FeedbackAsk | null>(null);
  const [reportAsk, setReportAsk] = useState<ReportAsk | null>(null);
  const [chatMenu, setChatMenu] = useState(false);
  const [consentAsk, setConsentAsk] = useState<{
    sessionId: string;
    text: string;
    attachments: string[];
    skill?: string;
    allowIds?: string[];
    sourceText?: string;
    token: string;
    first: boolean;
    flagged: boolean;
    labels: string[];
    attachment: boolean;
    vision?: boolean;
    mode: WorkMode;
    imageModel: string;
    retry?: boolean;
    coordinator?: boolean;
    documentTool?: DocumentToolId;
    documentVariant?: string;
    invitation?: InvitationPresentation;
    attachmentRole?: DocumentAttachmentRole;
    isolated?: boolean;
    aside?: boolean;
    autoContinue?: boolean;
  } | null>(null);
  // The first send (or the first after the terms change) needs the usage terms ticked; a new ask starts unticked.
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Claude Pro/Max works only inside Anthropic's own apps, so that choice hands the request to the employee's Claude Code.
  const [handoffAsk, setHandoffAsk] = useState<{ text: string; skill?: string } | null>(null),
    [claudeCode, setClaudeCode] = useState<boolean | null>(null);
  const [removing, setRemoving] = useState<Session | null>(null),
    [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null),
    [palette, setPalette] = useState(false);
  const [draftAcceptPending, setDraftAcceptPending] = useState(false);
  const draftAcceptInFlight = useRef(false);
  const [replacingDraft, setReplacingDraft] = useState<{
    id: string;
    proposalId: string;
    revision: number;
    draft: string;
    proposal: string;
  } | null>(null);
  const [pendingModel, setPendingModel] = useState<string | undefined>(undefined),
    [pendingEffort, setPendingEffort] = useState(''),
    modelsRequested = useRef(new Set<string>());
  // A native workflow (plan, execute, requirements, diagnose) chosen in the composer; '' is plain chat.
  const [workflow, setWorkflow] = useState<Workflow | ''>('');
  const workflowRef = useRef<Workflow | ''>('');
  workflowRef.current = workflow;
  const [workMode, setWorkMode] = useState<WorkMode>('chat'),
    [imageModel, setImageModel] = useState('');
  const [availableImages, setAvailableImages] = useState<string[]>([]),
    [imageCatalogError, setImageCatalogError] = useState('');
  const [advancedTools, setAdvancedTools] = useState(false);
  const [toolTab, setToolTab] = useState<ToolTab>('output'),
    [toolRequest, setToolRequest] = useState<ToolRequest>();
  const [pendingSource, setPendingSource] = useState(''),
    [submitting, setSubmitting] = useState(false),
    [pastingImage, setPastingImage] = useState(false);
  const sendInFlight = useRef(false),
    pasteInFlight = useRef(false),
    conversationEnd = useRef<HTMLDivElement>(null);
  const session = snapshot?.sessions.find(s => s.id === selected);
  // Per task, the updatedAt the employee last saw with the task open: finished and stopped tasks show a dot until then.
  const [seen, setSeen] = useState<Record<string, string>>();
  useEffect(() => {
    if (!snapshot) return;
    let next = seen;
    if (!next) {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(TASK_SEEN_KEY);
      } catch {
        // Without storage the marks last for this session.
      }
      next = initialSeen(stored, snapshot.sessions);
    }
    if (session && view === 'chat' && !settings && next[session.id] !== session.updatedAt)
      next = { ...next, [session.id]: session.updatedAt };
    if (next === seen) return;
    setSeen(next);
    try {
      localStorage.setItem(TASK_SEEN_KEY, JSON.stringify(next));
    } catch {
      // The dots still clear for this session.
    }
  }, [snapshot, session, view, settings, seen]);
  useEffect(() => {
    if (session?.documentTemplate) {
      setFormat('docx');
      setExportFont('auto');
      setExportGaruda('auto');
      setExportInfo(null);
    }
  }, [session?.documentTemplate?.key]);
  useEffect(() => {
    let disposed = false;
    if (api && search.trim())
      void api
        .call('sessionSearch', { query: search })
        .then(ids => {
          if (!disposed) setSearchMatches({ query: search, ids });
        })
        .catch(() => {
          if (!disposed) setSearchMatches({ query: search, ids: [] });
        });
    return () => {
      disposed = true;
    };
  }, [api, search, snapshot?.sessions]);
  const sessionRef = useRef<Session | undefined>(session);
  sessionRef.current = session;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const currentId = useRef(selected);
  currentId.current = selected;
  // Whether the running task drafts (each step replaces the live text) or chats (the live text grows turn by turn).
  const sessionMode = useRef<string | undefined>(undefined);
  sessionMode.current = session?.mode === 'draft' || workMode === 'draft' ? 'draft' : 'chat';
  useEffect(() => setChatMenu(false), [selected, view]);
  const saveInFlight = useRef<Promise<void> | null>(null);
  // The output panel waits for something to show: a task with no draft yet gives the chat the whole width. Opening the
  // panel by hand (or opening a file, a proposal or a tool in it) keeps it open for this task even while it is empty.
  const [panelPinned, setPanelPinned] = useState(false);
  useEffect(() => setPanelPinned(false), [selected]);
  const openPanel = () => {
    setRight(true);
    setPanelPinned(true);
  };
  const hasOutput = Boolean(
    session?.draft?.trim() || session?.proposals?.length || session?.documentTool || dirty || (running && session?.mode === 'draft'),
  );
  const showPanel = right && !settings && view === 'chat' && (hasOutput || panelPinned);
  const fullSidebar = left && (roomy || !showPanel || leftPeek);
  const questionPending = questions.some(q => q.sessionId === selected);
  const runFailed = !running && session?.status === 'error';
  // The code of the last failure in this task, to explain it next to "try again".
  const failureCode = runFailed ? [...(session?.messages || [])].reverse().find(m => m.role === 'status')?.text || '' : '';
  useEffect(() => {
    if (showPanel) setLeftPeek(false);
  }, [showPanel]);
  const [panelOpened, setPanelOpened] = useState(false);
  useEffect(() => {
    if (showPanel) setPanelOpened(true);
  }, [showPanel]);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [receiptOpened, setReceiptOpened] = useState(false);
  useEffect(() => {
    if (view === 'receipt' && !settings) setReceiptOpened(true);
  }, [view, settings]);
  // Created on first need (see draft-editor.ts) instead of at start-up.
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorWanted, setEditorWanted] = useState(false);
  useEffect(() => {
    if (showPanel) setEditorWanted(true);
    else {
      const idle = window.setTimeout(() => setEditorWanted(true), 1500);
      return () => window.clearTimeout(idle);
    }
  }, [showPanel]);
  useEffect(() => {
    if (!editorWanted || !api) return;
    let live = true,
      created: Editor | null = null;
    void createDraftEditor({
      ariaLabel: t('ร่างที่แก้ไขได้'),
      loadImage: assetId => api.call('documentAsset', { id: sessionRef.current?.id, assetId }),
      onUpdate: () => {
        // A saved snapshot can finish rendering after an immediate editor command.
        // Protect that new edit before React commits the dirty state.
        dirtyRef.current = true;
        setDirty(true);
      },
    }).then(made => {
      if (live) setEditor((created = made));
      else made.destroy();
    });
    return () => {
      live = false;
      created?.destroy();
      setEditor(null);
    };
  }, [editorWanted, api]);
  const refresh = useCallback(async () => {
    if (api) {
      const version = ++snapshotVersion.current;
      const data = await api.call('snapshot');
      if (version === snapshotVersion.current) setSnapshot(data);
      return data as Snapshot;
    }
  }, [api]);
  const [startupPending, setStartupPending] = useState(true);
  const announcedReady = useRef(false);
  useEffect(() => {
    // The app opens behind a loading window; tell it once the first real screen (or a startup error) is painted.
    if (!api || announcedReady.current || !(snapshot || error)) return;
    announcedReady.current = true;
    requestAnimationFrame(() => void api.call('appReady').catch(() => undefined));
  }, [api, snapshot, error]);
  useEffect(() => {
    const update = () => void refresh();
    window.addEventListener('step-workspace', update);
    return () => window.removeEventListener('step-workspace', update);
  }, [refresh]);
  const initializeWorkspace = useCallback(async () => {
    setStartupPending(true);
    setError('');
    try {
      const s = await refresh();
      if (s) {
        setWizard(!s.settings.onboarding);
        const notes = s.settings.onboarding ? unseenNotes(s.settings.whatsNewSeen, s.appVersion || '') : [];
        if (notes.length) setWhatsNew(notes);
        setSelected(s.sessions[0]?.id || '');
        setWorkMode(s.sessions[0]?.mode || (s.sessions[0]?.draft ? 'draft' : 'chat'));
        setConnectionId(s.connections[0]?.id || '');
      }
    } catch (e) {
      setError(explainError(e));
    } finally {
      setStartupPending(false);
    }
  }, [refresh]);
  useEffect(() => {
    void initializeWorkspace();
  }, [initializeWorkspace]);
  useEffect(() => {
    if (handoffAsk && claudeCode !== true)
      void api
        ?.call('claudeCode')
        .then((r: any) => setClaudeCode(r.installed))
        .catch(() => setClaudeCode(false));
  }, [handoffAsk]);
  useEffect(
    () =>
      api?.onEvent(event => {
        if (event.type === 'work-action' && event.workAction && event.sessionId) {
          const action = event.workAction;
          setWorkActions(previous => ({
            ...previous,
            [event.sessionId]: updateWorkActions(previous[event.sessionId] || [], action),
          }));
        }
        if (event.type === 'side-question') {
          void refresh();
          return;
        }
        if (event.type === 'vault-prompt' && event.vaultPrompt)
          setVaultPrompts(items => [...items.filter(item => item.id !== event.vaultPrompt!.id), event.vaultPrompt!]);
        if (event.type === 'vault-prompt-close' && event.vaultPrompt)
          setVaultPrompts(items => items.filter(item => item.id !== event.vaultPrompt!.id));
        if (event.type === 'vault-open') {
          setVaultOrigin(event.text || '');
          setSettingsPage('credentials');
          setSettings(true);
        }
        if ((event.type === 'approval' && event.approval) || (event.type === 'question' && event.question))
          // Another window has focus: the task waiting on the employee says so outside the app, like a finished task.
          if (!document.hasFocus() && typeof Notification !== 'undefined' && Notification.permission !== 'denied')
            try {
              new Notification('STeP Desktop', { body: t(event.approval ? 'มีงานรอคุณอนุญาต' : 'มีงานรอคุณตอบ'), silent: true });
            } catch {
              /* Notifications are optional. */
            }
        if (event.type === 'approval' && event.approval)
          setToolApprovals(list => [...list.filter(a => a.id !== event.approval!.id), event.approval!]);
        if (event.type === 'approval-close') setToolApprovals(list => list.filter(a => a.id !== event.approvalId));
        if (event.type === 'question' && event.question)
          setQuestions(list => [...list.filter(q => q.id !== event.question!.id), event.question!]);
        if (event.type === 'question-close') setQuestions(list => list.filter(q => q.id !== event.questionId));
        // A page the assistant (or the employee) opens shows in the Web tab, so bring that tab forward.
        if (event.type === 'browser' && event.browser?.focus) {
          openPanel();
          setToolTab('browser');
        }
        if (event.sessionId === currentId.current) {
          if (['heartbeat', 'status', 'activity', 'delta', 'reasoning'].includes(event.type)) setHeartbeatAt(Date.now());
          if (event.type === 'activity') {
            const label = event.text || '';
            setProgress(label);
            setActivityAt(Date.now());
          }
          if (event.type === 'delta') setStream(s => (s + (event.text || '')).slice(-60000));
          if (event.type === 'discard' && event.count) setStream(s => s.slice(0, Math.max(0, s.length - event.count!)));
          if (event.type === 'reasoning') setReasoning(s => (s + (event.text || '')).slice(-20000));
          if (event.type === 'plan') setPlan((event.plan || []).map(step => ({ ...step, state: 'pending' })));
          if (event.type === 'step' && event.index !== undefined)
            setPlan(steps => steps.map((step, i) => (i === event.index ? { ...step, state: event.state || step.state } : step)));
          // Each draft step rewrites the whole draft, so a new step replaces the streamed text. In chat the text of every
          // turn stays on screen while the assistant works (as in Claude, ChatGPT and Cursor), each turn after the last.
          if (event.type === 'status') {
            setProgress(errorText[event.text || ''] || event.text || '');
            if (sessionMode.current === 'draft') {
              setStream('');
              setReasoning('');
            } else {
              setStream(s => (s.trim() && !s.endsWith('\n\n') ? s + '\n\n' : s));
              setReasoning(s => (s.trim() && !s.endsWith('\n\n') ? s + '\n\n' : s));
            }
          }
        }
        if (event.type === 'changed') {
          if (!event.sessionId) {
            void refresh();
            return;
          }
          if (event.sessionId === currentId.current) {
            setRunning(false);
            setStream('');
            setReasoning('');
            setPlan([]);
            setStartedAt(0);
            // The authority notice stays visible after the run; main sends it in the chosen language.
            setProgress(p =>
              p === 'ขั้นตอนดำเนินการจริงต้องทำโดยผู้มีอำนาจ' || p === t('ขั้นตอนดำเนินการจริงต้องทำโดยผู้มีอำนาจ') ? p : '',
            );
          }
          const attempt = runningIds.current.get(event.sessionId);
          const finished = attempt ? event.sessionId : '';
          void refresh().then(data => {
            const done = finished && data?.sessions.find(s => s.id === finished);
            if (!done || runningIds.current.get(done.id) !== attempt) return;
            if (['running', 'queued'].includes(done.status)) return;
            runningIds.current.delete(done.id);
            const text =
              done.status === 'review'
                ? t('“{0}” มีร่างให้ตรวจแล้ว', done.title)
                : done.status === 'waiting'
                  ? t('“{0}” รอข้อมูลเพิ่มจากคุณ', done.title)
                  : done.status === 'error'
                    ? t('“{0}” ต้องตรวจสอบ', done.title)
                    : '';
            if (!text) return;
            if (finished !== currentId.current)
              notify(text, done.status === 'error' ? 'error' : 'success', {
                label: t('เปิดงาน'),
                run: () => selectSessionRef.current(finished),
              });
            if (!document.hasFocus() && typeof Notification !== 'undefined' && Notification.permission !== 'denied')
              try {
                new Notification('STeP Desktop', { body: text, silent: true });
              } catch {
                /* Notifications are optional. */
              }
          });
        }
        if (event.type === 'auth-code' && event.connectionId) setAuthCode({ id: event.connectionId, code: '' });
        if (event.type === 'auth-code-close') setAuthCode(current => (current?.id === event.connectionId ? null : current));
      }),
    [api, refresh],
  );
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tickLiveClock(), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    void api
      ?.call('skills')
      .then(setSkills)
      .catch(() => setSkills([]));
  }, [api]);
  // The Skills hub lists what this computer imported; reread after the Skill Packs window closes.
  const ownSkillsAllowed = snapshot?.policy?.features.staffSkills !== false;
  useEffect(() => {
    if (!api || view !== 'skills' || packsOpen || !ownSkillsAllowed) return;
    let live = true;
    void api
      .call('packList')
      .then(list => live && setOwnPacks(list))
      .catch(() => live && setOwnPacks([]));
    return () => {
      live = false;
    };
  }, [api, view, packsOpen, ownSkillsAllowed]);
  // Set during render so every child of this pass reads the chosen language.
  setLanguage(snapshot?.settings.language);
  useEffect(() => {
    document.documentElement.dataset.theme = snapshot?.settings.theme || 'system';
  }, [snapshot?.settings.theme]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || settingsDirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    // Query dirty state without triggering Chromium's native beforeunload dialog.
    const checkDirty = (event: Event) => {
      if (dirtyRef.current || settingsDirty.current) event.preventDefault();
    };
    window.addEventListener('step:check-unsaved', checkDirty);
    return () => {
      window.removeEventListener('beforeunload', guard);
      window.removeEventListener('step:check-unsaved', checkDirty);
    };
  }, []);
  useEffect(() => {
    if (editor && !dirtyRef.current) {
      editor.commands.setContent(session?.document || toDoc(session?.draft || ''), { emitUpdate: false });
    }
  }, [editor, selected, session?.revision]);
  useEffect(() => {
    const saved = session?.presentation;
    // The host sets the invitation layout before the first proposal, without changing the draft revision.
    // Adopt a layout change without resetting unsaved editor text or QR edits within the same layout.
    if (dirtyRef.current && Boolean(saved?.invitation) === Boolean(presentationRef.current.invitation)) return;
    const next = resolvePresentation(saved, session?.documentTool || false);
    presentationRef.current = next;
    setPresentation(next);
  }, [selected, session?.revision, session?.documentTool, session?.presentation]);
  useEffect(() => {
    editor?.setEditable(!draftAcceptPending, false);
  }, [editor, draftAcceptPending]);
  const action = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      notify(explainError(e), 'error');
    }
  };
  async function save() {
    const previous = saveInFlight.current || Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        const current = sessionRef.current;
        if (current && editor && dirtyRef.current) {
          const document = editor.getJSON(),
            text = documentText(document as any);
          const appearance = presentationRef.current;
          const serialized = JSON.stringify({ document, appearance });
          const saved = await api!.call('edit', { id: current.id, text, document, presentation: appearance, revision: current.revision });
          sessionRef.current = saved;
          const changedAgain = JSON.stringify({ document: editor.getJSON(), appearance: presentationRef.current }) !== serialized;
          setDirty(changedAgain);
          dirtyRef.current = changedAgain;
          await refresh();
        }
      });
    saveInFlight.current = task;
    try {
      await task;
    } finally {
      if (saveInFlight.current === task) saveInFlight.current = null;
    }
  }
  async function useProposal(proposalId: string) {
    if (draftAcceptInFlight.current) return;
    draftAcceptInFlight.current = true;
    setDraftAcceptPending(true);
    const owner = currentId.current;
    try {
      await save();
      const latest = (await refresh())?.sessions.find(s => s.id === owner);
      if (currentId.current !== owner) return;
      if (dirtyRef.current) throw new Error('DRAFT_CONFLICT');
      const proposal = latest?.proposals.find(p => p.id === proposalId);
      if (!latest || !proposal) throw new Error('PROPOSAL_NOT_FOUND');
      if (proposal.baseRevision !== latest.revision) {
        setReplacingDraft({ id: owner, proposalId, revision: latest.revision, draft: latest.draft, proposal: proposal.text });
      } else {
        await api!.call('accept', { id: owner, proposalId });
        await refresh();
      }
    } finally {
      draftAcceptInFlight.current = false;
      setDraftAcceptPending(false);
    }
  }
  const selectSessionRef = useRef<(id: string) => Promise<void>>(async () => {});
  async function selectSession(id: string) {
    if (guardSettingsExit(() => selectSession(id))) return;
    const version = ++navigationVersion.current;
    await save();
    if (version !== navigationVersion.current) return;
    if (!['running', 'queued'].includes(snapshot?.sessions.find(s => s.id === id)?.status || '')) await api!.call('sessionResume', { id });
    if (version !== navigationVersion.current) return;
    setView('chat');
    setWelcomeVisit(value => value + 1);
    setSelected(id);
    const chosen = snapshot?.sessions.find(s => s.id === id);
    setWorkMode(chosen?.mode || (chosen?.draft ? 'draft' : 'chat'));
    setRunning(['running', 'queued'].includes(chosen?.status || ''));
    setPendingSource('');
    discardFiles();
    setStream('');
    setProgress('');
    setDirty(false);
    dirtyRef.current = false;
    setSettings(false);
  }
  selectSessionRef.current = selectSession;
  const openSettings = (page: 'general' | 'ai' | 'credentials' = 'general') => {
    navigationVersion.current++;
    setSettingsPage(page);
    setSettings(true);
  };
  const openAiSettings = () => openSettings('ai');
  // Without a usable AI the request stays in the box and the person is told why, instead of being moved elsewhere.
  const needAi = () =>
    notify(t('ยังไม่ได้เลือก AI เลือกในกล่องพิมพ์ หรือเพิ่มบัญชี AI ก่อน'), 'info', {
      label: t('ไปที่หน้าเชื่อมต่อ AI'),
      run: openAiSettings,
    });
  async function receiptHandoff(text: string, sourceText: string, allowIds: string[] = []) {
    if (connectionId === CLAUDE_CODE) {
      setView('chat');
      setHandoffAsk({ text: [text, sourceText].filter(Boolean).join('\n\n') });
      return;
    }
    if (!snapshot?.connections.some(c => c.id === connectionId && c.ready)) {
      needAi();
      throw new Error('CONNECTION_NOT_READY');
    }
    await save();
    const s = await api!.call('create', { connectionId, project: t('ตรวจใบเสร็จ AFP') });
    await start(
      s.id,
      text,
      [],
      undefined,
      undefined,
      allowIds,
      sourceText,
      'chat',
      imageModel,
      undefined,
      false,
      undefined,
      undefined,
      true,
    );
    setView('chat');
    setWorkMode('chat');
    setSelected(s.id);
  }
  async function createDocumentTask(tool: DocumentToolId) {
    if (!snapshot?.connections.some(c => c.id === connectionId && c.ready)) {
      needAi();
      return null;
    }
    return api!.call('create', { connectionId, project: documentTool(tool)!.title });
  }
  async function attachDocument(tool: DocumentToolId): Promise<DocumentAttachment | null> {
    const task = await createDocumentTask(tool);
    if (!task) return null;
    const file = await api!.call('attach', { id: task.id, documentTool: tool });
    return file ? { sessionId: task.id, file } : null;
  }
  async function draftDocument(tool: DocumentToolId, form: DocumentForm) {
    if (form.source && !form.source.file.usable) throw new Error('ATTACHMENT_NOT_APPROVED');
    if (form.source && form.sourceRole !== 'template' && form.source.file.sourceUsable === false)
      throw new Error('ATTACHMENT_NOT_APPROVED');
    const request = documentRequest(tool, form.values, form.variant, form.source ? form.sourceRole : 'source', form.recipients);
    const id = form.source?.sessionId || (await createDocumentTask(tool))?.id;
    if (!id) return;
    await save();
    await api!.call('sessionConnection', { id, connectionId });
    setWorkMode('draft');
    setView('chat');
    setSettings(false);
    setSelected(id);
    setQuery('');
    discardFiles();
    setPendingSource('');
    openPanel();
    setToolTab('output');
    await refresh();
    await start(
      id,
      request.text,
      form.source ? [form.source.file.id] : [],
      undefined,
      undefined,
      undefined,
      request.sourceText,
      'draft',
      undefined,
      undefined,
      false,
      tool,
      form.source ? form.sourceRole : 'source',
      false,
      false,
      false,
      form.variant,
      tool === 'letter' && form.variant === 'invitation'
        ? {
            rsvpUrl: form.values.rsvpUrl || '',
            venueUrl: form.values.venueUrl || '',
            ...(form.recipients?.length ? { recipients: form.recipients } : {}),
          }
        : undefined,
    );
  }
  async function reviseDocument(id: string, changes: string) {
    if (!snapshot?.sessions.find(s => s.id === id)?.documentTool) throw new Error('INVALID_DOCUMENT_TOOL');
    await save();
    await api!.call('sessionConnection', { id, connectionId });
    setWorkMode('draft');
    setView('chat');
    setSettings(false);
    setSelected(id);
    setQuery('');
    discardFiles();
    setPendingSource('');
    openPanel();
    setToolTab('output');
    await refresh();
    await start(id, t('แก้ร่างเดิมตามคำขอนี้: {0}', changes), [], undefined, undefined, undefined, '', 'draft');
  }
  async function create() {
    if (guardSettingsExit(create)) return;
    // A new task is only a blank page until the first request or attachment, so no empty tasks pile up.
    const version = ++navigationVersion.current;
    await save();
    if (version !== navigationVersion.current) return;
    setWelcomeVisit(value => value + 1);
    setSelected('');
    setRunning(false);
    setWorkMode('chat');
    setPendingSource('');
    setView('chat');
    setSettings(false);
    discardFiles();
    setStream('');
    setProgress('');
    setDirty(false);
    dirtyRef.current = false;
    setTimeout(() => composerRef.current?.focus(), 0);
  }
  async function createTask(expectedNavigation?: number) {
    if (!connectionId || connectionId === CLAUDE_CODE) {
      needAi();
      return null;
    }
    const s = await api!.call('create', { connectionId, model: pendingModel, effort: pendingEffort });
    if (expectedNavigation !== undefined && expectedNavigation !== navigationVersion.current) {
      await api!.call('remove', { id: s.id }).catch(() => undefined);
      return null;
    }
    setPendingModel(undefined);
    setPendingEffort('');
    setSelected(s.id);
    await refresh();
    return s;
  }
  function discardFiles() {
    if (selected) for (const file of files) void api!.call('detach', { id: selected, attachmentId: file.id }).catch(() => undefined);
    setFiles([]);
  }
  async function pasteImage(file: File) {
    if (running || sendInFlight.current || pasteInFlight.current) {
      notify(t('รอให้งานปัจจุบันเสร็จก่อนวางภาพ'), 'info');
      return;
    }
    if (files.length) {
      notify(t('แนบได้ครั้งละ 1 ไฟล์ กรุณานำไฟล์เดิมออกก่อนวางภาพ'), 'info');
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      notify(t('วางภาพ PNG หรือ JPEG ได้'), 'error');
      return;
    }
    if (!file.size || file.size > 4_000_000) {
      notify(t('ภาพจากคลิปบอร์ดต้องมีขนาดไม่เกิน 4 MB'), 'error');
      return;
    }
    const version = navigationVersion.current;
    pasteInFlight.current = true;
    setPastingImage(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (version !== navigationVersion.current) return;
      const id = selected || (await createTask(version))?.id;
      if (!id || version !== navigationVersion.current) return;
      const attachment: Attachment = await api!.call('attachClipboard', { id, mime: file.type, bytes });
      if (version !== navigationVersion.current) {
        await api!.call('detach', { id, attachmentId: attachment.id });
        return;
      }
      setFiles([attachment]);
    } finally {
      pasteInFlight.current = false;
      setPastingImage(false);
    }
  }
  async function send() {
    if (/^\/btw\s+/i.test(query.trim())) {
      await askAside(query.trim().replace(/^\/btw\s+/i, ''));
      return;
    }
    if (query.trim() === '/vault' || query.trim() === '/google') {
      setQuery('');
      openSettings('credentials');
      return;
    }
    if (/^\/(learn|learning)(?:\s|$)/.test(query.trim())) {
      setLearningText(query.trim().replace(/^\/(learn|learning)\s*/, ''));
      setLearningOpen(true);
      setQuery('');
      return;
    }
    if (query.trim() === '/memory') {
      setQuery('');
      setMemoryOpen(true);
      return;
    }
    if (query.trim() === '/usage') {
      setQuery('');
      setUsageOpen(true);
      return;
    }
    const request = query.trim() ? query : files.some(file => file.imagePreview) ? t('ช่วยดูไฟล์ที่แนบ') : '';
    if (!request) return;
    if (pastingImage || pasteInFlight.current) {
      notify(t('กำลังเตรียมภาพ กรุณารอสักครู่ก่อนส่ง'), 'info');
      return;
    }
    if (running || sendInFlight.current) {
      notify(t('รอคำตอบปัจจุบันก่อนส่ง ข้อความยังอยู่ในช่องพิมพ์'), 'info');
      return;
    }
    // A file that cannot go to the AI is never dropped quietly: the message waits until the person removes or replaces it.
    const refused = files.find(f => !f.usable);
    if (refused) {
      notify(
        t(
          'ส่งไฟล์ “{0}” ให้ AI ไม่ได้: {1} · นำไฟล์ออกหรือแนบไฟล์อื่นก่อนส่ง',
          refused.name,
          errorText[refused.reason || ''] || refused.status,
        ),
        'error',
      );
      return;
    }
    sendInFlight.current = true;
    setSubmitting(true);
    try {
      if (!selected && connectionId === CLAUDE_CODE) {
        const typed = /^\/([a-z0-9-]+)\s+([\s\S]+)$/.exec(request.trim()),
          typedSkill = typed && (skills || []).some(s => s.name === typed[1]) ? typed[1] : '';
        setHandoffAsk({ text: typedSkill ? typed![2] : request, skill: forcedSkill || typedSkill || undefined });
        return;
      }
      await save();
      let id = selected;
      if (!id) {
        const s = await createTask();
        if (!s) return;
        id = s.id;
      }
      const typed = /^\/([a-z0-9-]+)\s+([\s\S]+)$/.exec(request.trim());
      const typedSkill = typed && routedSkills.some(s => s.name === typed[1]) ? typed[1] : '';
      await start(
        id,
        typedSkill ? typed![2] : request,
        files.map(f => f.id),
        undefined,
        forcedSkill || typedSkill || undefined,
        undefined,
        pendingSource || undefined,
      );
    } finally {
      sendInFlight.current = false;
      setSubmitting(false);
    }
  }
  async function askAside(text = query) {
    if (files.length || pendingSource) throw new Error('SIDE_QUESTION_SOURCE_NOT_ALLOWED');
    if (!session || !text.trim() || session.sideQuestions?.some(q => q.status === 'running')) return;
    await start(
      session.id,
      text,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      'chat',
      '',
      false,
      false,
      undefined,
      undefined,
      true,
      true,
    );
  }
  // The host answers with a consent request when this send needs one; the dialog replays the same payload with its token.
  async function start(
    id: string,
    text: string,
    attachments: string[],
    consent?: string,
    skill?: string,
    allowIds?: string[],
    sourceText?: string,
    mode: WorkMode = workMode,
    selectedImageModel: string = imageModel,
    retry?: boolean,
    coordinator: boolean = coordinated && mode === 'draft' && !skill && !retry,
    documentTool?: DocumentToolId,
    attachmentRole?: DocumentAttachmentRole,
    isolated: boolean = false,
    aside: boolean = false,
    autoContinue: boolean = false,
    documentVariant?: string,
    invitation?: InvitationPresentation,
  ) {
    const submittedQuery = query;
    const attempt = {},
      previousAttempt = runningIds.current.get(id);
    if (!aside) {
      // A new run must never show the prior assistant's actions as its own. A rejected concurrent start keeps the active run.
      if (!previousAttempt) setWorkActions(previous => (previous[id] ? { ...previous, [id]: [] } : previous));
      runningIds.current.set(id, attempt);
      currentId.current = id;
      setRunning(true);
      setStream('');
      setReasoning('');
      setProgress(t('กำลังส่งข้อความ'));
      setStartedAt(Date.now());
      setHeartbeatAt(Date.now());
      setActivityAt(Date.now());
    }
    let result;
    try {
      result = await api!.call(aside ? 'sideQuestion' : 'send', {
        id,
        text,
        attachments,
        consent,
        skill,
        allowIdentifiers: allowIds,
        sourceText,
        mode,
        imageModel: selectedImageModel,
        retry,
        coordinator,
        documentTool,
        documentVariant,
        invitation,
        attachmentRole,
        autoContinue,
        ...(isolated ? { autoImage: false } : mode === 'chat' && workflowRef.current ? { workflow: workflowRef.current } : {}),
      });
    } catch (e) {
      if (aside) throw e;
      setRunning(false);
      if (runningIds.current.get(id) === attempt) {
        if (previousAttempt && String(e).includes('RUN_ALREADY_ACTIVE')) runningIds.current.set(id, previousAttempt);
        else runningIds.current.delete(id);
      }
      setProgress('');
      setStartedAt(0);
      throw e;
    }
    if (result.consent) {
      if (!aside) {
        setRunning(false);
        if (runningIds.current.get(id) === attempt) runningIds.current.delete(id);
        setProgress('');
        setStartedAt(0);
      }
      setTermsAccepted(false);
      setConsentAsk({
        sessionId: id,
        text,
        attachments,
        skill,
        allowIds,
        sourceText,
        mode,
        imageModel: selectedImageModel,
        retry,
        coordinator,
        documentTool,
        documentVariant,
        invitation,
        attachmentRole,
        isolated,
        aside,
        autoContinue,
        ...result.consent,
      });
      return;
    }
    if (result.aside) {
      setQuery(current => (current === submittedQuery ? '' : current));
      const updated = await refresh();
      if (!aside) {
        setRunning(['running', 'queued'].includes(updated?.sessions.find(s => s.id === id)?.status || ''));
        runningIds.current.delete(id);
        setProgress('');
        setStartedAt(0);
      }
      return;
    }
    if (result.started && result.warning) notify(t('ส่งแล้ว ข้อความนี้มีคำที่อาจเป็นข้อมูลอ่อนไหว อย่าใส่ชื่อหรือรหัสของบุคคลในงานนี้'));
    else if (result.started && result.masked?.length) notify(t('ระบบปิดบังก่อนส่งให้ AI: {0}', result.masked.join(', ')));
    if (result.started) {
      const runId = typeof result.sessionId === 'string' ? result.sessionId : id;
      const focused = currentId.current === id;
      if (runId !== id) {
        if (runningIds.current.get(id) === attempt) runningIds.current.delete(id);
        runningIds.current.set(runId, attempt);
        if (focused) {
          currentId.current = runId;
          setSelected(runId);
          notify(t('เริ่มเอกสารใหม่โดยเก็บบทสนทนาและร่างเดิมไว้'), 'info');
        }
      }
      if (documentTool) setConsumedDocumentTask(runId);
      setForcedSkill('');
      setQuery(current => (current === submittedQuery ? '' : current));
      setPendingSource(current => (current === sourceText ? '' : current));
      setFiles(current => current.filter(file => !attachments.includes(file.id)));
      tickLiveClock();
      const updated = await refresh();
      const state = updated?.sessions.find(s => s.id === runId)?.status;
      if (state && !['queued', 'running'].includes(state)) {
        setRunning(false);
        setProgress('');
        setStartedAt(0);
        setStream('');
      }
      if (focused && (result.mode === 'image' || result.mode === 'draft')) {
        if (result.mode === 'draft' && mode === 'chat') {
          setWorkflow('');
          setWorkMode('draft');
        }
        setToolTab('output');
        openPanel();
      }
    }
  }
  const connection = snapshot?.connections.find(c => c.id === (session?.connectionId || connectionId));
  const wantsImage = workMode === 'image' || (workMode === 'chat' && isImageRequest(query));
  useEffect(() => {
    let live = true;
    setImageCatalogError('');
    setAvailableImages([]);
    setImageModel('');
    if (api && wantsImage && connection?.ready && imageModels(connection).length)
      void api
        .call('imageModels', { id: connection.id })
        .then(ids => {
          if (live) setAvailableImages(ids);
        })
        .catch(e => {
          if (live) setImageCatalogError(explainError(e));
        });
    return () => {
      live = false;
    };
  }, [api, wantsImage, connection?.id, connection?.ready]);
  const currentModel = session ? (session.model ?? connection?.model ?? '') : (pendingModel ?? connection?.model ?? '');
  const defaultModel = connection?.models?.find(m => m.isDefault);
  const modelInfo = (id: string) => connection?.models?.find(m => m.id === id) || (!id ? defaultModel : undefined);
  const activeModel = modelInfo(currentModel),
    currentEffort = session ? session.effort || '' : pendingEffort;
  const modelName = activeModel?.label || currentModel,
    effortName = currentEffort ? effortLabel[currentEffort] || currentEffort : '';
  const aiLabel = connection
    ? [modelName || connectionName(connection), effortName].filter(Boolean).join(' · ')
    : !session && connectionId === CLAUDE_CODE
      ? t('Claude · Pro/Max (เปิดใน Claude Code)')
      : t('เลือก AI');
  const aiSummary = connection
    ? [
        connectionName(connection),
        modelName || t('ค่าเริ่มต้นของบริการ'),
        effortName ||
          (activeModel?.efforts?.length ? (snapshot?.policy?.features.autoEffort ? t('อัตโนมัติตามขนาดงาน') : t('ค่าเริ่มต้น')) : ''),
        connection.ready ? '' : t('ยังไม่พร้อม'),
      ]
        .filter(Boolean)
        .join(' · ')
    : aiLabel;
  const [aiPicker, setAiPicker] = useState(false);
  const [quotaRefreshing, setQuotaRefreshing] = useState(false);
  const activeUsageAccount = connection ? snapshot?.usage?.accounts?.find(a => a.connectionId === connection.id) : undefined;
  async function refreshActiveQuota() {
    if (!api || !connection || quotaRefreshing) return;
    setQuotaRefreshing(true);
    try {
      await api.call('providerUsage', { id: connection.id });
      await refresh();
    } finally {
      setQuotaRefreshing(false);
    }
  }
  const aiPickerRef = useRef<HTMLDivElement>(null);
  // The AI picker closes on a click outside it or Escape, like a menu.
  useEffect(() => {
    if (!aiPicker) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !aiPickerRef.current?.contains(event.target as Node))
        setAiPicker(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [aiPicker]);
  useEffect(() => {
    if (running) setAiPicker(false);
  }, [running]);
  // Load the provider's model list once for ready connections that have never fetched it.
  useEffect(() => {
    if (!api || !connection?.ready || connection.modelsAt || modelsRequested.current.has(connection.id)) return;
    modelsRequested.current.add(connection.id);
    void api
      .call('models', { id: connection.id })
      .then(() => refresh())
      .catch(() => {});
  }, [api, connection?.id, connection?.ready, connection?.modelsAt, refresh]);
  // A task can move to another AI between runs, for example when its connection was removed or stopped working.
  async function chooseConnection(id: string) {
    if (!session) {
      setConnectionId(id);
      return;
    }
    if (!id || id === CLAUDE_CODE) return;
    await api!.call('sessionConnection', { id: session.id, connectionId: id });
    await refresh();
  }
  const readyConnection = snapshot?.connections.find(c => c.ready);
  const lastRequest = [...(session?.messages || [])].reverse().find(m => m.role === 'user')?.text || '';
  // When connections change (added, tested, removed), a new task uses a ready one without being asked.
  useEffect(() => {
    if (!snapshot || connectionId === CLAUDE_CODE) return;
    const current = snapshot.connections.find(c => c.id === connectionId);
    const next = current?.ready ? current : readyConnection || current || snapshot.connections[0];
    if ((next?.id || '') !== connectionId) setConnectionId(next?.id || '');
  }, [snapshot?.connections, connectionId]);
  async function chooseModel(model: string, effort?: string) {
    // Keep the chosen effort only if the new model supports it.
    const next = effort ?? (modelInfo(model)?.efforts?.some(e => e.id === currentEffort) ? currentEffort : '');
    if (!session) {
      setPendingModel(model);
      setPendingEffort(next);
      return;
    }
    await api!.call('model', { id: session.id, model, effort: next });
    await refresh();
  }
  // Staff see Thai Skill names, and developer Skills only in Dev mode (skill-display.ts).
  const developerMode = Boolean(snapshot?.features?.developmentMode && snapshot?.settings.developmentMode);
  const staffSkills = useMemo(() => skills && skillsForStaff(skills, developerMode), [skills, developerMode]);
  const routedSkills = useMemo(() => (staffSkills || []).filter(s => s.status === 'routed'), [staffSkills]);
  // "/" lists the person's team first and also matches Thai descriptions and trigger words.
  const slash = /^\/(\S*)$/.exec(query);
  const myTeam = snapshot?.settings.team || '';
  const myTeamInfo = snapshot?.teams.find(team => team.id === myTeam);
  const myTeamName = myTeamInfo ? teamName(myTeamInfo) : '';
  const forTeam = useCallback((s: SkillEntry) => Boolean(myTeam) && (s.owner === myTeam || s.teams.includes(myTeam)), [myTeam]);
  const slashQuery = slash?.[1];
  const slashMatches = useMemo(() => {
    if (slashQuery === undefined) return NO_SKILLS;
    const q = slashQuery.toLowerCase();
    return routedSkills
      .filter(s => !q || [s.name, s.title, s.description, ...s.triggers].some(v => v.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          Number(!a.name.startsWith(slashQuery)) - Number(!b.name.startsWith(slashQuery)) || Number(!forTeam(a)) - Number(!forTeam(b)),
      )
      .slice(0, 8);
  }, [slashQuery, routedSkills, forTeam]);
  const useSkill = (name: string) => {
    if (guardSettingsExit(() => useSkill(name))) return;
    setForcedSkill(name);
    setQuery('');
    setSlashIndex(0);
    setSettings(false);
    setView('chat');
    setTimeout(() => composerRef.current?.focus(), 0);
  };
  const forced = routedSkills.find(s => s.name === forcedSkill);
  const canSuggest =
    snapshot?.policy?.features.skillSuggestions !== false &&
    !snapshot?.policy?.features.autoRouting &&
    view === 'chat' &&
    !settings &&
    !running &&
    !forcedSkill &&
    !session?.skill &&
    !session?.documentTool &&
    !query.startsWith('/');
  useEffect(() => {
    setSuggestedSkill('');
    if (!api || !canSuggest || query.trim().length < 8) return;
    let alive = true;
    // Only once typing pauses, so the Router is not asked on every key.
    const timer = setTimeout(() => {
      void api
        .call('skillSuggest', { text: query })
        .then((found: { skill: string } | null) => {
          if (alive && found && !dismissedSkills.includes(found.skill)) setSuggestedSkill(found.skill);
        })
        .catch(() => {});
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [api, query, canSuggest, dismissedSkills]);
  const suggested = canSuggest ? routedSkills.find(s => s.name === suggestedSkill) : undefined;
  // Tasks that were opened but never used (older versions created them eagerly) stay out of the list.
  // Values and helpers the regions read keep their identity until their inputs change, so a region re-renders only
  // when what it shows changed (workspace-view.tsx).
  const sessions = snapshot?.sessions;
  const filtered = useMemo(
    () =>
      sessions?.filter(
        s =>
          (s.messages.length > 0 || Boolean(s.draft) || s.id === selected) &&
          // Until the full-text search answers, match titles and loaded text here, so the list never flashes "no results".
          (!search.trim() || (searchMatches?.query === search ? searchMatches.ids.includes(s.id) : matchesSession(s, search))) &&
          (filter !== 'artifacts' || s.draft),
      ) || [],
    [sessions, selected, search, searchMatches, filter],
  );
  // Escape cancels; the blur that follows the input closing must not save the name it was holding.
  const renameCancelled = useRef(false);
  async function saveRename() {
    const current = renaming;
    if (renameCancelled.current || !current) {
      renameCancelled.current = false;
      return;
    }
    setRenaming(null);
    const before = snapshot?.sessions.find(s => s.id === current.id)?.title;
    if (!current.title.trim() || current.title.trim() === before) return;
    await action(async () => {
      await api!.call('rename', { id: current.id, title: current.title.trim() });
      await refresh();
    });
  }
  const providerName = useCallback((c?: Connection) => (c ? connectionName(c) : ''), []);
  // A run that waits on the employee's answer or permission says so, instead of "working".
  const taskStatus = useCallback(
    (s: { id: string; status: string }) =>
      questions.some(q => q.sessionId === s.id)
        ? t('รอคุณตอบ')
        : toolApprovals.some(a => a.sessionId === s.id)
          ? t('รอคุณอนุญาต')
          : statusText[s.status] || s.status,
    [questions, toolApprovals],
  );
  // Team, then status only when it says something: "ready to start" is every new task's state, so it stays unsaid.
  const taskMeta = useCallback(
    (s: Session) => {
      const team = s.project || s.team.toUpperCase() || t('ทุกทีม');
      const status = taskStatus(s);
      return s.status === 'idle' && status === statusText.idle ? team : `${team} · ${status}`;
    },
    [taskStatus],
  );
  // The notification dot of each task in the list (src/task-alerts.ts); the open task needs none.
  const alertOf = useCallback(
    (s: Session) => {
      const alert = taskAlert(s, questions, toolApprovals, seen ? seen[s.id] : s.updatedAt);
      return selected === s.id && view === 'chat' && alert !== 'needs-you' && alert !== 'running' ? undefined : alert;
    },
    [questions, toolApprovals, seen, selected, view],
  );
  const needsYou = snapshot ? needsYouCount(snapshot.sessions, questions, toolApprovals) : 0;
  const setTheme = (theme: string) =>
    action(async () => {
      await api!.call('settings', { assistant: snapshot!.settings.assistant, team: snapshot!.settings.team, theme });
      await refresh();
    });
  const showTour = () => {
    if (guardSettingsExit(showTour)) return;
    setSettings(false);
    navigate('chat');
    setTour(true);
  };
  const showWizard = () => {
    if (guardSettingsExit(showWizard)) return;
    setWizard(true);
  };
  const commands = {
    packs: () => setPacksOpen(true),
    palette: () => setPalette(p => !p),
    new: () => void action(create),
    usage: () => setUsageOpen(true),
    memory: () => setMemoryOpen(true),
    vault: () => openSettings('credentials'),
    learning: () => {
      setLearningText('');
      setLearningOpen(true);
    },
    automations: () => setAutomationOpen(true),
    settings: () => openSettings(),
    keyboard: () => setKeyboardOpen(true),
    // Absent when IT turned "แจ้งปัญหา / เสนอแนะ" off, so the palette and menu do not offer it.
    feedback:
      snapshot?.policy?.features.feedback === false
        ? undefined
        : () => {
            // The task's latest error code (never its text) helps the administrators see what went wrong.
            const code = [...(session?.messages || [])].reverse().find(m => m.role === 'status')?.text;
            setReportAsk({ errorCode: code && /^[A-Z][A-Z0-9_]{1,63}$/.test(code) && code !== 'CANCELLED' ? code : undefined });
          },
    tour: showTour,
    wizard: showWizard,
    'whats-new': () => setWhatsNew(RELEASE_NOTES.filter(n => compareVersions(n.version, snapshot?.appVersion || '0') <= 0)),
    left: () => {
      // Folded only because the draft panel needs the room: open the list this time without changing the saved choice.
      if (left && !fullSidebar) return setLeftPeek(true);
      setLeftPeek(false);
      setLeft(p => {
        const next = !p;
        sidebarChoice.current = next;
        saveSidebarChoice(next);
        return next;
      });
    },
    right: () => (showPanel ? setRight(false) : openPanel()),
    skills: () => {
      setSettings(false);
      navigate('skills');
    },
    schedules: () => {
      setSettings(false);
      navigate('schedules');
    },
    receipt: () => {
      setSettings(false);
      navigate('receipt');
    },
    documents: () => {
      setSettings(false);
      navigate('documents');
    },
    'theme-system': () => void setTheme('system'),
    'theme-light': () => void setTheme('light'),
    'theme-dark': () => void setTheme('dark'),
  };
  const lastMessage = session?.messages.at(-1);
  const commandRef = useRef(commands);
  commandRef.current = commands;
  // One object for the life of the window whose entries run the latest command, for regions that call them.
  const stableCommands = useRef<typeof commands | null>(null);
  stableCommands.current ??= Object.fromEntries(
    Object.keys(commands).map(id => [id, () => commandRef.current[id as keyof typeof commands]?.()]),
  ) as typeof commands;
  // Read the bindings during the key press rather than re-registering the listener: a shortcut pressed right
  // after saving new bindings would otherwise land between the render and the effect and be dropped.
  const keybindingsRef = useRef(snapshot?.settings.keybindings);
  keybindingsRef.current = snapshot?.settings.keybindings;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      // Zoom, which the menu bar used to give: Ctrl/⌘ with = (or +), - and 0.
      const macKeys = /Mac/.test(navigator.platform);
      if ((macKeys ? e.metaKey : e.ctrlKey) && !e.altKey && ['=', '+', '-', '0'].includes(e.key)) {
        e.preventDefault();
        const action = e.key === '0' ? 'zoomReset' : e.key === '-' ? 'zoomOut' : 'zoomIn';
        void window.step?.call('windowControl', { action }).catch(() => {});
        return;
      }
      const id = commandForKey(e, keybindingsRef.current, macKeys);
      const run = id && id in commandRef.current ? commandRef.current[id as keyof typeof commands] : undefined;
      if (run) {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const recentSessions = snapshot ? [...snapshot.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  // Built only while the palette is open; closed, it is one empty list that never changes.
  const paletteItems: PaletteItem[] =
    snapshot && palette
      ? commandPalette(
          commands,
          snapshot.settings.keybindings || {},
          [
            ...routedSkills.map(s => ({
              id: 'skill-' + s.name,
              group: 'Skill',
              label: t('ใช้ Skill: ') + s.title,
              hint: '/' + s.name,
              run: () => useSkill(s.name),
            })),
            ...(connection?.models || []).map(m => ({
              id: 'model-' + m.id,
              group: t('โมเดล'),
              label: t('ใช้ ') + m.label,
              hint: m.id === currentModel ? t('ใช้อยู่') : providerName(connection),
              run: () => action(() => chooseModel(m.id)),
            })),
            ...recentSessions.slice(5, 50).map(s => ({
              id: 'session-' + s.id,
              group: t('งาน'),
              label: s.title,
              hint: s.project || statusText[s.status],
              run: () => action(() => selectSession(s.id)),
            })),
          ],
          // The palette says it finds tasks too, so the latest five come first, above the commands.
          recentSessions.slice(0, 5).map(s => ({
            id: 'session-' + s.id,
            group: t('งานล่าสุด'),
            label: s.title,
            hint: s.project || statusText[s.status],
            run: () => action(() => selectSession(s.id)),
          })),
        )
      : NO_PALETTE_ITEMS;
  // The newest answer keeps its copy and feedback buttons in view; older ones show them on hover, as in other AI apps.
  const lastAnswer = session ? session.messages.map(m => m.role).lastIndexOf('assistant') : -1;
  // Links in answers open in the browser panel beside the chat, never in this window.
  const openLink = (url: string) => void action(() => api!.call('toolBrowser', { url }));
  return {
    api,
    update,
    toolApprovals,
    setToolApprovals,
    vaultPrompts,
    setVaultPrompts,
    questions,
    setQuestions,
    usageOpen,
    setUsageOpen,
    memoryOpen,
    setMemoryOpen,
    learningOpen,
    setLearningOpen,
    learningText,
    setLearningText,
    packsOpen,
    setPacksOpen,
    ownPacks,
    setOwnPacks,
    keyboardOpen,
    setKeyboardOpen,
    vimNormal,
    setVimNormal,
    automationOpen,
    setAutomationOpen,
    coordinated,
    setCoordinated,
    searchMatches,
    setSearchMatches,
    snapshot,
    setSnapshot,
    selected,
    setSelected,
    snapshotVersion,
    navigationVersion,
    settings,
    setSettingsState,
    settingsPage,
    setSettingsPage,
    vaultOrigin,
    setVaultOrigin,
    query,
    setQuery,
    search,
    setSearch,
    settingsExit,
    setSettingsExit,
    settingsDirty,
    settingsNext,
    guardSettingsExit,
    settingsChanged,
    setSettings,
    filter,
    setFilter,
    progress,
    setProgress,
    running,
    setRunning,
    activityAt,
    setActivityAt,
    error,
    setError,
    files,
    setFiles,
    inspecting,
    setInspecting,
    viewingArtifact,
    setViewingArtifact,
    sidebarChoice,
    left,
    setLeft,
    right,
    setRight,
    history,
    setHistory,
    roomy,
    setRoomy,
    leftPeek,
    setLeftPeek,
    width,
    setWidth,
    connectionId,
    setConnectionId,
    dirty,
    setDirty,
    format,
    setFormat,
    exportPath,
    setExportPath,
    exportFont,
    setExportFont,
    presentation,
    setPresentation,
    presentationRef,
    exportGaruda,
    setExportGaruda,
    exporting,
    setExporting,
    exportPending,
    exportSettings,
    setExportSettings,
    exportInfo,
    setExportInfo,
    authCode,
    setAuthCode,
    plan,
    setPlan,
    workActions,
    setWorkActions,
    view,
    setView,
    welcomeVisit,
    setWelcomeVisit,
    navigate,
    documentsOpened,
    setDocumentsOpened,
    consumedDocumentTask,
    setConsumedDocumentTask,
    mediaOpened,
    setMediaOpened,
    wizard,
    setWizard,
    tour,
    setTour,
    whatsNew,
    setWhatsNew,
    skills,
    setSkills,
    forcedSkill,
    setForcedSkill,
    suggestedSkill,
    setSuggestedSkill,
    dismissedSkills,
    setDismissedSkills,
    slashIndex,
    setSlashIndex,
    composerRef,
    toasts,
    setToasts,
    toastId,
    runningIds,
    dismiss,
    notify,
    startedAt,
    setStartedAt,
    feedbackAsk,
    setFeedbackAsk,
    reportAsk,
    setReportAsk,
    chatMenu,
    setChatMenu,
    consentAsk,
    setConsentAsk,
    termsAccepted,
    setTermsAccepted,
    handoffAsk,
    setHandoffAsk,
    claudeCode,
    setClaudeCode,
    removing,
    setRemoving,
    renaming,
    setRenaming,
    palette,
    setPalette,
    draftAcceptPending,
    setDraftAcceptPending,
    draftAcceptInFlight,
    replacingDraft,
    setReplacingDraft,
    pendingModel,
    setPendingModel,
    pendingEffort,
    setPendingEffort,
    modelsRequested,
    workflow,
    setWorkflow,
    workflowRef,
    workMode,
    setWorkMode,
    imageModel,
    setImageModel,
    availableImages,
    setAvailableImages,
    imageCatalogError,
    setImageCatalogError,
    advancedTools,
    setAdvancedTools,
    toolTab,
    setToolTab,
    toolRequest,
    setToolRequest,
    pendingSource,
    setPendingSource,
    submitting,
    setSubmitting,
    pastingImage,
    setPastingImage,
    sendInFlight,
    pasteInFlight,
    conversationEnd,
    session,
    seen,
    setSeen,
    sessionRef,
    dirtyRef,
    currentId,
    sessionMode,
    saveInFlight,
    panelPinned,
    setPanelPinned,
    openPanel,
    hasOutput,
    showPanel,
    fullSidebar,
    questionPending,
    runFailed,
    failureCode,
    panelOpened,
    setPanelOpened,
    receiptBusy,
    setReceiptBusy,
    settingsBusy,
    setSettingsBusy,
    receiptOpened,
    setReceiptOpened,
    editor,
    refresh,
    startupPending,
    setStartupPending,
    announcedReady,
    initializeWorkspace,
    ownSkillsAllowed,
    action,
    save,
    useProposal,
    selectSessionRef,
    selectSession,
    openSettings,
    openAiSettings,
    needAi,
    receiptHandoff,
    createDocumentTask,
    attachDocument,
    draftDocument,
    reviseDocument,
    create,
    createTask,
    discardFiles,
    pasteImage,
    send,
    askAside,
    start,
    connection,
    wantsImage,
    currentModel,
    defaultModel,
    modelInfo,
    activeModel,
    currentEffort,
    modelName,
    effortName,
    aiLabel,
    aiSummary,
    aiPicker,
    setAiPicker,
    quotaRefreshing,
    setQuotaRefreshing,
    activeUsageAccount,
    refreshActiveQuota,
    aiPickerRef,
    chooseConnection,
    readyConnection,
    lastRequest,
    chooseModel,
    developerMode,
    staffSkills,
    routedSkills,
    slash,
    myTeam,
    myTeamInfo,
    myTeamName,
    forTeam,
    slashMatches,
    useSkill,
    forced,
    canSuggest,
    suggested,
    filtered,
    renameCancelled,
    saveRename,
    providerName,
    taskStatus,
    taskMeta,
    alertOf,
    needsYou,
    setTheme,
    showTour,
    showWizard,
    commands: stableCommands.current,
    lastMessage,
    commandRef,
    keybindingsRef,
    recentSessions,
    paletteItems,
    lastAnswer,
    openLink,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
/** The workspace once the app is connected to the main process and the first snapshot has loaded. */
export type AppView = Workspace & {
  api: NonNullable<Workspace['api']>;
  snapshot: NonNullable<Workspace['snapshot']>;
  pageTitle: string;
  brandSymbol: ReactElement;
  profileAvatar: ReactElement;
};
