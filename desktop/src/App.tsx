import { ThinkingScribble } from './thinking-scribble';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { plainDocument as toDoc, documentText } from './draft';
import {
  ArrowUp,
  Check,
  ChevronLeft,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  PanelRightClose,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Square,
  X,
  Download,
  Save,
  Sparkles,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Brain,
  Command,
  Timer,
  ShieldCheck,
  Circle,
  ReceiptText,
  Blocks,
  Copy,
  ImagePlus,
  ChevronDown,
  Compass,
} from 'lucide-react';
import { ReceiptApp } from './receipt';
import { DocumentTools, type DocumentAttachment, type DocumentForm } from './document-tool-app';
import { documentRequest, documentTool, type DocumentToolId, type DocumentAttachmentRole } from './document-tools';
import { DOCUMENT_FONTS, resolveDocumentLayout } from './document-layout';
import { SkillsHub, toolCount } from './skills';
import { SetupWizard } from './setup';
import { Tour } from './tour';
import {
  CommandPalette,
  ConfirmDialog,
  RichText,
  matchesSession,
  Toasts,
  type Toast,
  formatElapsed,
  formatTokens,
  groupSessions,
  type PaletteItem,
} from './ui';
import symbolColour from './assets/step-symbol-colour.svg';
import symbolWhite from './assets/step-symbol-mono-white.svg';
import ideaArt from './assets/illustrations/idea.png';
import { SectionArt } from './illustration';
import { Avatar } from './avatars';
import { UpdateCard, VersionLine, useUpdate } from './update';
import type { Attachment, Connection, PlanStep, Session, SkillEntry, Snapshot } from './types';
import { CLAUDE_CODE, effortLabel, errorText, explainError, initial, connectionLabel, shortcut, statusText } from './messages';
import { SettingsPanel } from './settings';
import { ApprovalDialog } from './approval';
import type { ApprovalRequest } from './types';
import { WorkbenchPanel } from './workbench';
import { toolRequests, visibleStream, type ToolTab, type ToolRequest } from './tools';
import { isImageRequest, imageModels } from './image-routing';
import type { WorkMode, Workflow } from './types';
import { WorkPlanCard, WORKFLOW_LABELS } from './work-plan';
import { needsPublicWebSearch } from '../../src/modules/router/public-information.js';
import { publicSourceUrl } from './web';
import { QuestionCard } from './tool-question';
import { UsageDialog } from './usage';
import { MemoryDialog } from './memory';
import { LearningDialog } from './learning';
import { FeedbackButtons, FeedbackDialog, type FeedbackAsk } from './feedback';
import { AutomationDialog } from './automations';
import { commandPalette, commandForKey, vimEdit, COMMANDS } from './commands';
import { TitleBar, shortcutText } from './titlebar';
import { KeyboardDialog } from './keyboard';
import { Readiness } from './readiness';
import { Terms } from './terms';
import { VoiceButton } from './voice';
import { PacksDialog } from './packs';
import { RELEASE_NOTES, compareVersions, unseenNotes, type ReleaseNote } from './whats-new';
import { WhatsNewDialog } from './whats-new-dialog';
import type { ToolQuestion } from './types';
import { locale, setLanguage, t, teamName } from './i18n';
import { startersFor, starterTag, starterText } from './starters';

export default function App() {
  const api = window.step;
  const [update] = useUpdate(api);
  const [toolApprovals, setToolApprovals] = useState<ApprovalRequest[]>([]);
  const [questions, setQuestions] = useState<ToolQuestion[]>([]),
    [usageOpen, setUsageOpen] = useState(false),
    [memoryOpen, setMemoryOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false),
    [learningText, setLearningText] = useState('');
  const [packsOpen, setPacksOpen] = useState(false),
    [keyboardOpen, setKeyboardOpen] = useState(false),
    [vimNormal, setVimNormal] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false),
    [coordinated, setCoordinated] = useState(false);
  const [searchMatches, setSearchMatches] = useState<{ query: string; ids: string[] }>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState('');
  const snapshotVersion = useRef(0),
    navigationVersion = useRef(0);
  const [settings, setSettings] = useState(false),
    [settingsPage, setSettingsPage] = useState<'general' | 'ai'>('general'),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'artifacts'>('all');
  const [stream, setStream] = useState(''),
    [progress, setProgress] = useState(''),
    [running, setRunning] = useState(false);
  const [heartbeatAt, setHeartbeatAt] = useState(0),
    [activityAt, setActivityAt] = useState(0),
    [activities, setActivities] = useState<string[]>([]);
  const [error, setError] = useState(''),
    [files, setFiles] = useState<Attachment[]>([]),
    [inspecting, setInspecting] = useState<Attachment | null>(null);
  // Three columns need room: on narrower windows the draft panel, then the task list, start hidden.
  const [left, setLeft] = useState(() => window.innerWidth >= 900),
    [right, setRight] = useState(() => window.innerWidth >= 1100),
    [history, setHistory] = useState(false);
  useEffect(() => {
    let width = window.innerWidth;
    const onResize = () => {
      const now = window.innerWidth;
      if (now < 1100 && width >= 1100) setRight(false);
      if (now < 900 && width >= 900) setLeft(false);
      width = now;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [width, setWidth] = useState(440),
    [connectionId, setConnectionId] = useState(''),
    [dirty, setDirty] = useState(false);
  const [format, setFormat] = useState('docx'),
    [exportPath, setExportPath] = useState('');
  const [exportFont, setExportFont] = useState('auto');
  const [exportGaruda, setExportGaruda] = useState('auto');
  const [exporting, setExporting] = useState(false);
  const exportPending = useRef(false);
  const [exportInfo, setExportInfo] = useState<{
    documentTool?: string;
    font: string;
    fontStatus: string;
    garudaHeightCm?: number;
    templateName?: string;
  } | null>(null);
  useEffect(() => {
    setExportFont('auto');
    setExportGaruda('auto');
    setExportInfo(null);
  }, [selected]);
  const [authCode, setAuthCode] = useState<{ id: string; code: string } | null>(null);
  const [plan, setPlan] = useState<(PlanStep & { state: string })[]>([]);
  const [view, setView] = useState<'chat' | 'receipt' | 'skills' | 'documents'>('chat');
  const navigate = (next: typeof view) => {
    navigationVersion.current++;
    setView(next);
  };
  const [documentsOpened, setDocumentsOpened] = useState(false);
  const [consumedDocumentTask, setConsumedDocumentTask] = useState('');
  useEffect(() => {
    if (view === 'documents') setDocumentsOpened(true);
  }, [view]);
  const [wizard, setWizard] = useState(false),
    [tour, setTour] = useState(false);
  const [whatsNew, setWhatsNew] = useState<ReleaseNote[] | null>(null);
  const [skills, setSkills] = useState<SkillEntry[] | null>(null),
    [forcedSkill, setForcedSkill] = useState(''),
    [slashIndex, setSlashIndex] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]),
    toastId = useRef(0),
    runningIds = useRef(new Map<string, object>());
  const dismiss = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
  const notify = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    if (text) setToasts(list => [...list.filter(t => t.text !== text), { id: ++toastId.current, text, tone, action }].slice(-4));
  }, []);
  const [reasoning, setReasoning] = useState(''),
    [startedAt, setStartedAt] = useState(0),
    [now, setNow] = useState(Date.now());
  const [feedbackAsk, setFeedbackAsk] = useState<FeedbackAsk | null>(null);
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
    attachmentRole?: DocumentAttachmentRole;
  } | null>(null);
  // The first send (or the first after the terms change) needs the usage terms ticked; a new ask starts unticked.
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Claude Pro/Max works only inside Anthropic's own apps, so that choice hands the request to the employee's Claude Code.
  const [handoffAsk, setHandoffAsk] = useState<{ text: string; skill?: string } | null>(null),
    [claudeCode, setClaudeCode] = useState<boolean | null>(null);
  const [removing, setRemoving] = useState<Session | null>(null),
    [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null),
    [palette, setPalette] = useState(false);
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
    [submitting, setSubmitting] = useState(false);
  const sendInFlight = useRef(false),
    conversationEnd = useRef<HTMLDivElement>(null);
  const session = snapshot?.sessions.find(s => s.id === selected);
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
  const showPanel = right && !settings && view === 'chat';
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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: toDoc(''),
    editorProps: { attributes: { 'aria-label': t('ร่างที่แก้ไขได้'), class: 'draft-editor', spellcheck: 'false' } },
    onUpdate: () => setDirty(true),
  });
  const refresh = useCallback(async () => {
    if (api) {
      const version = ++snapshotVersion.current;
      const data = await api.call('snapshot');
      if (version === snapshotVersion.current) setSnapshot(data);
      return data as Snapshot;
    }
  }, [api]);
  useEffect(() => {
    const update = () => void refresh();
    window.addEventListener('step-workspace', update);
    return () => window.removeEventListener('step-workspace', update);
  }, [refresh]);
  useEffect(() => {
    // An empty task shows the welcome from its greeting; only a conversation follows its latest message.
    if (session?.messages.length || stream || running) conversationEnd.current?.scrollIntoView({ block: 'end' });
  }, [session?.messages.length, stream, running]);
  useEffect(() => {
    void refresh()
      .then(s => {
        if (s) {
          setWizard(!s.settings.onboarding);
          // After an update, once: what changed since the version the person last saw.
          const notes = s.settings.onboarding ? unseenNotes(s.settings.whatsNewSeen, s.appVersion || '') : [];
          if (notes.length) setWhatsNew(notes);
          setSelected(s.sessions[0]?.id || '');
          setWorkMode(s.sessions[0]?.mode || (s.sessions[0]?.draft ? 'draft' : 'chat'));
          setConnectionId(s.connections[0]?.id || '');
        }
      })
      .catch(e => setError(explainError(e)));
  }, [refresh]);
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
        if (event.type === 'approval' && event.approval)
          setToolApprovals(list => [...list.filter(a => a.id !== event.approval!.id), event.approval!]);
        if (event.type === 'approval-close') setToolApprovals(list => list.filter(a => a.id !== event.approvalId));
        if (event.type === 'question' && event.question)
          setQuestions(list => [...list.filter(q => q.id !== event.question!.id), event.question!]);
        if (event.type === 'question-close') setQuestions(list => list.filter(q => q.id !== event.questionId));
        // A page the assistant (or the employee) opens shows in the Web tab, so bring that tab forward.
        if (event.type === 'browser' && event.browser?.focus) {
          setRight(true);
          setToolTab('browser');
        }
        if (event.sessionId === currentId.current) {
          if (['heartbeat', 'status', 'activity', 'delta', 'reasoning'].includes(event.type)) setHeartbeatAt(Date.now());
          if (event.type === 'activity') {
            const label = event.text || '';
            setProgress(label);
            setActivityAt(Date.now());
            setActivities(list => (list.at(-1) === label ? list : [...list, label].slice(-5)));
          }
          if (event.type === 'delta') setStream(s => (s + (event.text || '')).slice(-60000));
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
          setRunning(false);
          setStream('');
          setReasoning('');
          setPlan([]);
          setStartedAt(0);
          // The authority notice stays visible after the run; main sends it in the chosen language.
          setProgress(p =>
            p === 'ขั้นตอนดำเนินการจริงต้องทำโดยผู้มีอำนาจ' || p === t('ขั้นตอนดำเนินการจริงต้องทำโดยผู้มีอำนาจ') ? p : '',
          );
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
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    void api
      ?.call('skills')
      .then(setSkills)
      .catch(() => setSkills([]));
  }, [api]);
  // Set during render so every child of this pass reads the chosen language.
  setLanguage(snapshot?.settings.language);
  useEffect(() => {
    document.documentElement.dataset.theme = snapshot?.settings.theme || 'system';
  }, [snapshot?.settings.theme]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  useEffect(() => {
    if (editor && !dirtyRef.current) editor.commands.setContent(session?.document || toDoc(session?.draft || ''), { emitUpdate: false });
  }, [editor, selected, session?.revision]);
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
          const serialized = JSON.stringify(document);
          const saved = await api!.call('edit', { id: current.id, text, document, revision: current.revision });
          sessionRef.current = saved;
          const changedAgain = JSON.stringify(editor.getJSON()) !== serialized;
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
  const selectSessionRef = useRef<(id: string) => Promise<void>>(async () => {});
  async function selectSession(id: string) {
    const version = ++navigationVersion.current;
    await save();
    if (version !== navigationVersion.current) return;
    if (!['running', 'queued'].includes(snapshot?.sessions.find(s => s.id === id)?.status || '')) await api!.call('sessionResume', { id });
    if (version !== navigationVersion.current) return;
    setView('chat');
    setSelected(id);
    const chosen = snapshot?.sessions.find(s => s.id === id);
    setWorkMode(chosen?.mode || (chosen?.draft ? 'draft' : 'chat'));
    setPendingSource('');
    setFiles([]);
    setStream('');
    setProgress('');
    setDirty(false);
    dirtyRef.current = false;
    setSettings(false);
  }
  selectSessionRef.current = selectSession;
  const openSettings = (page: 'general' | 'ai' = 'general') => {
    navigationVersion.current++;
    setSettingsPage(page);
    setSettings(true);
  };
  const openAiSettings = () => openSettings('ai');
  // Without a usable AI the request stays in the box and the person is told why, instead of being moved elsewhere.
  const needAi = () =>
    notify(t('ยังไม่ได้เลือก AI เลือกในกล่องพิมพ์ หรือเพิ่มการเชื่อมต่อ AI ก่อน'), 'info', {
      label: t('ไปที่การเชื่อมต่อ AI'),
      run: openAiSettings,
    });
  async function receiptHandoff(text: string, sourceText: string, allowIds: string[] = []) {
    if (connectionId === CLAUDE_CODE) {
      setView('chat');
      setHandoffAsk({ text: [text, sourceText].filter(Boolean).join('\n\n') });
      return;
    }
    if (!connectionId) {
      needAi();
      return;
    }
    await save();
    const s = await api!.call('create', { connectionId, project: t('ตรวจใบเสร็จ AFP') });
    setView('chat');
    setSelected(s.id);
    await refresh();
    await start(s.id, text, [], undefined, undefined, allowIds, sourceText, 'draft');
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
    const request = documentRequest(tool, form.values, form.variant, form.source ? form.sourceRole : 'source');
    const id = form.source?.sessionId || (await createDocumentTask(tool))?.id;
    if (!id) return;
    await save();
    await api!.call('sessionConnection', { id, connectionId });
    setWorkMode('draft');
    setView('chat');
    setSettings(false);
    setSelected(id);
    setQuery('');
    setFiles([]);
    setPendingSource('');
    setRight(true);
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
    );
  }
  async function create() {
    // A new task is only a blank page until the first request or attachment, so no empty tasks pile up.
    const version = ++navigationVersion.current;
    await save();
    if (version !== navigationVersion.current) return;
    setSelected('');
    setWorkMode('chat');
    setPendingSource('');
    setView('chat');
    setSettings(false);
    setFiles([]);
    setStream('');
    setProgress('');
    setDirty(false);
    dirtyRef.current = false;
    setTimeout(() => composerRef.current?.focus(), 0);
  }
  async function createTask() {
    if (!connectionId || connectionId === CLAUDE_CODE) {
      needAi();
      return null;
    }
    const s = await api!.call('create', { connectionId, model: pendingModel, effort: pendingEffort });
    setPendingModel(undefined);
    setPendingEffort('');
    setSelected(s.id);
    await refresh();
    return s;
  }
  async function send() {
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
    if (!query.trim() || running || sendInFlight.current) return;
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
        const typed = /^\/([a-z0-9-]+)\s+([\s\S]+)$/.exec(query.trim()),
          typedSkill = typed && (skills || []).some(s => s.name === typed[1]) ? typed[1] : '';
        setHandoffAsk({ text: typedSkill ? typed![2] : query, skill: forcedSkill || typedSkill || undefined });
        return;
      }
      await save();
      let id = selected;
      if (!id) {
        const s = await createTask();
        if (!s) return;
        id = s.id;
      }
      const typed = /^\/([a-z0-9-]+)\s+([\s\S]+)$/.exec(query.trim());
      const typedSkill = typed && routedSkills.some(s => s.name === typed[1]) ? typed[1] : '';
      await start(
        id,
        typedSkill ? typed![2] : query,
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
  ) {
    const attempt = {},
      previousAttempt = runningIds.current.get(id);
    runningIds.current.set(id, attempt);
    currentId.current = id;
    setRunning(true);
    setStream('');
    setReasoning('');
    setProgress(t('กำลังส่งข้อความ'));
    setStartedAt(Date.now());
    setHeartbeatAt(Date.now());
    setActivityAt(Date.now());
    setActivities([]);
    let result;
    try {
      result = await api!.call('send', {
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
        attachmentRole,
        ...(mode === 'chat' && workflowRef.current ? { workflow: workflowRef.current } : {}),
      });
    } catch (e) {
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
      setRunning(false);
      if (runningIds.current.get(id) === attempt) runningIds.current.delete(id);
      setProgress('');
      setStartedAt(0);
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
        attachmentRole,
        ...result.consent,
      });
      return;
    }
    if (result.started && result.warning) notify(t('ส่งแล้ว ข้อความนี้มีคำที่อาจเป็นข้อมูลอ่อนไหว อย่าใส่ชื่อหรือรหัสของบุคคลในงานนี้'));
    else if (result.started && result.masked?.length) notify(t('ระบบปิดบังก่อนส่งให้ AI: {0}', result.masked.join(', ')));
    if (result.started) {
      if (documentTool) setConsumedDocumentTask(id);
      setForcedSkill('');
      setQuery('');
      setPendingSource('');
      setFiles([]);
      setNow(Date.now());
      const updated = await refresh();
      const state = updated?.sessions.find(s => s.id === id)?.status;
      if (state && !['queued', 'running'].includes(state)) {
        setRunning(false);
        setProgress('');
        setStartedAt(0);
        setStream('');
      }
      if (result.mode === 'image' || result.mode === 'draft') {
        setToolTab('output');
        setRight(true);
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
  const routedSkills = (skills || []).filter(s => s.status === 'routed');
  // "/" lists the person's team first and also matches Thai descriptions and trigger words.
  const slash = /^\/(\S*)$/.exec(query);
  const myTeam = snapshot?.settings.team || '';
  const myTeamInfo = snapshot?.teams.find(team => team.id === myTeam);
  const myTeamName = myTeamInfo ? teamName(myTeamInfo) : '';
  const forTeam = (s: SkillEntry) => Boolean(myTeam) && (s.owner === myTeam || s.teams.includes(myTeam));
  const slashMatches = slash
    ? routedSkills
        .filter(s => {
          const q = slash[1].toLowerCase();
          return !q || [s.name, s.title, s.description, ...s.triggers].some(v => v.toLowerCase().includes(q));
        })
        .sort(
          (a, b) =>
            Number(!a.name.startsWith(slash[1])) - Number(!b.name.startsWith(slash[1])) || Number(!forTeam(a)) - Number(!forTeam(b)),
        )
        .slice(0, 8)
    : [];
  const useSkill = (name: string) => {
    setForcedSkill(name);
    setQuery('');
    setSlashIndex(0);
    setSettings(false);
    setView('chat');
    setTimeout(() => composerRef.current?.focus(), 0);
  };
  const forced = routedSkills.find(s => s.name === forcedSkill);
  // Tasks that were opened but never used (older versions created them eagerly) stay out of the list.
  const filtered =
    snapshot?.sessions.filter(
      s =>
        (s.messages.length > 0 || Boolean(s.draft) || s.id === selected) &&
        // Until the full-text search answers, match titles and loaded text here, so the list never flashes "no results".
        (!search.trim() || (searchMatches?.query === search ? searchMatches.ids.includes(s.id) : matchesSession(s, search))) &&
        (filter !== 'artifacts' || s.draft),
    ) || [];
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
  const providerName = (c?: Connection) => (c ? connectionLabel(c) : '');
  const setTheme = (theme: string) =>
    action(async () => {
      await api!.call('settings', { assistant: snapshot!.settings.assistant, team: snapshot!.settings.team, theme });
      await refresh();
    });
  const commands = {
    packs: () => setPacksOpen(true),
    palette: () => setPalette(p => !p),
    new: () => void action(create),
    usage: () => setUsageOpen(true),
    memory: () => setMemoryOpen(true),
    learning: () => {
      setLearningText('');
      setLearningOpen(true);
    },
    automations: () => setAutomationOpen(true),
    settings: () => openSettings(),
    keyboard: () => setKeyboardOpen(true),
    tour: () => {
      setSettings(false);
      navigate('chat');
      setTour(true);
    },
    wizard: () => setWizard(true),
    'whats-new': () => setWhatsNew(RELEASE_NOTES.filter(n => compareVersions(n.version, snapshot?.appVersion || '0') <= 0)),
    left: () => setLeft(p => !p),
    right: () => setRight(p => !p),
    skills: () => {
      setSettings(false);
      navigate('skills');
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
  // A refresh can land after main saved the answer but before it reports the run finished; the saved message
  // then already shows the streamed text, so the live copy is hidden instead of appearing twice.
  const lastMessage = session?.messages.at(-1);
  const liveText = visibleStream(stream);
  const streamSaved =
    Boolean(liveText) &&
    lastMessage?.role === 'assistant' &&
    Boolean(lastMessage.text.trim()) &&
    liveText.endsWith(lastMessage.text.trim());
  const commandRef = useRef(commands);
  commandRef.current = commands;
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
      if (id && id in commandRef.current) {
        e.preventDefault();
        commandRef.current[id as keyof typeof commands]();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const paletteItems: PaletteItem[] = snapshot
    ? commandPalette(commands, snapshot.settings.keybindings || {}, [
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
        ...[...snapshot.sessions]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 50)
          .map(s => ({
            id: 'session-' + s.id,
            group: t('งาน'),
            label: s.title,
            hint: s.project || statusText[s.status],
            run: () => action(() => selectSession(s.id)),
          })),
      ])
    : [];
  const elapsed = running && startedAt ? formatElapsed(now - startedAt) : '';
  // The newest answer keeps its copy and feedback buttons in view; older ones show them on hover, as in other AI apps.
  const lastAnswer = session ? session.messages.map(m => m.role).lastIndexOf('assistant') : -1;
  // Links in answers open in the browser panel beside the chat, never in this window.
  const openLink = (url: string) => void action(() => api!.call('toolBrowser', { url }));
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
        <LoaderCircle className="spin" />
        <p>{error || t('กำลังเปิดพื้นที่ทำงาน…')}</p>
      </main>
    );
  return (
    <div className="shell">
      <TitleBar
        api={api}
        title={settings ? t('ตั้งค่าพื้นที่ทำงาน') : session?.title || ''}
        run={id => commandRef.current[id]?.()}
        hint={id => shortcutText(snapshot.settings.keybindings?.[id] ?? COMMANDS.find(c => c[0] === id)?.[2] ?? '')}
        left={left}
        right={right}
        showRight={!settings && view === 'chat'}
        theme={snapshot.settings.theme}
      />
      <div className="app" style={{ '--artifact-width': `${width}px` } as React.CSSProperties}>
        {left && (
          <aside className="sidebar" aria-label={t('แถบงาน')}>
            <div className="brand">
              <div>
                <span className="brand-symbol" role="img" aria-label="STeP">
                  <img className="on-light" src={symbolColour} alt="" />
                  <img className="on-dark" src={symbolWhite} alt="" />
                </span>
                <span className="brand-tagline">MAKE INNOVATION SIMPLE</span>
              </div>
            </div>
            <button className="new-work" data-tour="new-work" onClick={() => void action(create)}>
              <Plus size={18} /> {t('เริ่มงานใหม่')}
            </button>
            <label className="search">
              <Search size={16} />
              <input placeholder={t('ค้นหางานหรือเนื้อหา')} value={search} onChange={e => setSearch(e.target.value)} />
              <button className="icon palette-hint" aria-label={t('เปิดคำสั่ง')} onClick={() => setPalette(true)}>
                {shortcut}
              </button>
            </label>
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
                        <button className="session-open" onClick={() => void action(() => selectSession(s.id))}>
                          <span>{t(s.title)}</span>
                          <small>
                            {s.project || s.team.toUpperCase() || t('ทุกทีม')} · {statusText[s.status] || s.status}
                          </small>
                        </button>
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
                <p className="muted small">{search ? t('ไม่พบงานที่ตรงกับคำค้น') : t('เมื่อเริ่มงาน บทสนทนาจะอยู่ที่นี่')}</p>
              )}
            </div>
            <div className="session-group tools-group">{t('เครื่องมือ')}</div>
            <nav>
              <button
                data-tour="documents"
                className={view === 'documents' && !settings ? 'nav-active' : ''}
                onClick={() => {
                  setSettings(false);
                  navigate('documents');
                }}
              >
                <FileText size={17} />
                {t('เครื่องมือร่างเอกสาร')}
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
                {t('ศูนย์รวม Skill')}
                <span className="count">{skills ? skills.length + toolCount : ''}</span>
              </button>
              <button
                data-tour="receipt"
                className={view === 'receipt' && !settings ? 'nav-active' : ''}
                onClick={() => {
                  setSettings(false);
                  navigate('receipt');
                }}
              >
                <ReceiptText size={17} />
                {t('ตรวจใบเสร็จ AFP')}
                {receiptBusy && view !== 'receipt' ? (
                  <LoaderCircle size={14} className="spin" aria-label={t('กำลังตรวจใบเสร็จอยู่')} />
                ) : (
                  <span className="beta">{t('ทดลอง')}</span>
                )}
              </button>
            </nav>
            <button
              className={`settings-button ${settings ? 'nav-active' : ''}`}
              data-tour="settings"
              onClick={() => {
                openSettings();
              }}
            >
              <Settings2 size={18} />
              <span>{t('ตั้งค่าพื้นที่ทำงาน')}</span>
            </button>
            <UpdateCard api={api} update={update} />
            <div className="profile" data-tour="version">
              <Avatar
                id={snapshot.settings.avatar}
                fallback={initial(snapshot.settings.userName || '') || snapshot.settings.team.toUpperCase() || 'ST'}
              />
              <div>
                {snapshot.settings.userName || snapshot.settings.assistant}
                <small>
                  {snapshot.settings.userName ? t('ผู้ช่วย {0} · ', snapshot.settings.assistant) : ''}
                  {snapshot.settings.team ? t('ทีม {0}', snapshot.settings.team.toUpperCase()) : t('ยังไม่เลือกทีม')}
                </small>
                <VersionLine api={api} update={update} version={snapshot.appVersion || ''} />
              </div>
            </div>
          </aside>
        )}
        <main className="main-pane">
          <header className="topbar">
            <div className="topbar-title">
              <span className="topbar-heading">
                <h1 className="topbar-name">
                  <strong>
                    {settings
                      ? t('ตั้งค่าพื้นที่ทำงาน')
                      : view === 'documents'
                        ? t('เครื่องมือร่างเอกสาร')
                        : view === 'receipt'
                          ? t('ตรวจใบเสร็จก่อนส่ง AFP')
                          : view === 'skills'
                            ? t('ศูนย์รวม Skill')
                            : session?.title || t('เริ่มต้นงานที่อยากทำ')}
                  </strong>
                </h1>
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
                      {t('ส่งออก JSON')}
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
                        setAutomationOpen(true);
                      }}
                    >
                      <Timer size={15} />
                      {t('งานตามรอบ')}
                    </button>
                  </div>
                </>
              )}
              <small>
                {settings
                  ? t('บัญชี AI และข้อมูลอยู่ในเครื่องนี้')
                  : view === 'documents'
                    ? t('กรอกข้อมูลหรือต้นเรื่อง ให้ AI ร่างด้วย Skill แล้วแก้ไขและส่งออก')
                    : view === 'receipt'
                      ? t('ทดลอง · อ่านด้วย OCR ในเครื่อง และให้ AI อ่านภาพเทียบเมื่อองค์กรอนุญาต')
                      : view === 'skills'
                        ? t('Skill ในพื้นที่ทำงานนี้ พร้อมสถานะ Manifest และ Routing')
                        : session?.project || t('จากคำขอ สู่ผลงานที่ใช้ต่อได้')}
              </small>
            </div>
            {!settings && view === 'chat' && (
              <button className="quiet" onClick={() => setRight(!right)}>
                <FileText size={16} />
                {right ? t('ซ่อนร่าง') : t('เปิดร่าง')}
              </button>
            )}
          </header>
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
                handoff={(text, sourceText, allowIds) => action(() => receiptHandoff(text, sourceText, allowIds))}
                connectionId={connectionId === CLAUDE_CODE ? '' : connectionId}
                trialTools={Boolean(snapshot.policy?.features.ocrTrial)}
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
                consumedTask={consumedDocumentTask}
                busy={running}
                onError={e => notify(explainError(e), 'error')}
                openAiSettings={openAiSettings}
              />
            </div>
          )}
          {/* A connection being set up keeps going when Settings is closed: the panel stays mounted, hidden, until it
              finishes, so reopening shows its progress instead of offering to start it again. */}
          {(settings || settingsBusy) && (
            <div style={{ display: settings ? 'contents' : 'none' }}>
              <SettingsPanel
                onBusy={setSettingsBusy}
                key={settingsPage}
                initialPage={settingsPage}
                snapshot={snapshot}
                call={api.call}
                refresh={refresh}
                openWizard={() => setWizard(true)}
                openTour={() => {
                  setSettings(false);
                  navigate('chat');
                  setTour(true);
                }}
                close={() => setSettings(false)}
                onError={e => notify(explainError(e), 'error')}
              />
            </div>
          )}
          {settings ? null : view === 'receipt' || view === 'documents' ? null : view === 'skills' ? (
            <SkillsHub
              skills={skills}
              team={myTeam}
              onUse={useSkill}
              onOpenTool={id => navigate(id === 'documents' ? 'documents' : 'receipt')}
            />
          ) : (
            <>
              <div className="conversation" aria-live="polite">
                {session && (snapshot.policy?.features.coordinator || !!session.loadedContext?.length || session.compaction) && (
                  <div className="context-bar">
                    {snapshot.policy?.features.coordinator && (
                      <label>
                        <input
                          aria-label={t('แบ่งงานย่อย')}
                          type="checkbox"
                          checked={coordinated}
                          disabled={running || workMode !== 'draft'}
                          onChange={e => setCoordinated(e.target.checked)}
                        />
                        {t('แบ่งงานย่อย')}
                      </label>
                    )}
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
                          'ย่อบริบทแล้ว {0} → {1} tokens (ประมาณการ)',
                          session.compaction.before.toLocaleString(locale()),
                          session.compaction.after.toLocaleString(locale()),
                        )}
                      </span>
                    )}
                  </div>
                )}
                {!session?.messages.length && (
                  <div className="welcome">
                    <div className="welcome-intro">
                      <div className="welcome-heading">
                        <p className="greet">
                          {snapshot.settings.userName ? t('สวัสดีครับ คุณ{0}', snapshot.settings.userName) : t('สวัสดีครับ')}
                          {myTeamName ? ` · ${myTeamName}` : ''}
                        </p>
                        <h1>
                          {t('ให้ AI ร่างงานหนัก')}
                          <br />
                          <em>{t('ส่วนคุณตัดสินเรื่องสำคัญ')}</em>
                        </h1>
                      </div>
                      <SectionArt scene="chat" className="welcome-illustration" />
                    </div>
                    <p className="suggestions-label">
                      {myTeamName ? t('ลองงานแรกของทีม {0}', myTeamName) : t('ลองงานแรกที่คนส่วนใหญ่ใช้บ่อย')}
                    </p>
                    <div className="suggestions" data-tour="starters">
                      {startersFor(snapshot.settings.team).map(starter => {
                        const text = starterText(starter);
                        return (
                          <button key={text} onClick={() => setQuery(text)}>
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
                    <p className="welcome-lede">
                      {t(
                        'ผู้ช่วยที่รู้จักงานของ STeP สรุปเอกสารยาว ร่างหนังสือ วางแผนโครงการ และตรวจความพร้อมก่อนส่ง ทุกร่างผ่านตาคุณก่อนใช้จริง',
                      )}
                    </p>
                    <ul className="welcome-trust">
                      <li>
                        <ShieldCheck size={14} />
                        {t('ข้อมูลอยู่ในเครื่อง ปิดบังข้อมูลส่วนบุคคลก่อนส่ง')}
                      </li>
                      <li>
                        <Check size={14} />
                        {t('AI ร่าง คนตรวจและอนุมัติ')}
                      </li>
                      <li>
                        <Blocks size={14} />
                        {t('รู้จักทีมและ Skill ของ STeP')}
                      </li>
                    </ul>
                    {!snapshot.settings.tourDone && (
                      <button className="welcome-tour quiet" onClick={commands.tour}>
                        <Compass size={15} />
                        {t('ใช้ครั้งแรก? ดูทัวร์แนะนำการใช้งาน')}
                      </button>
                    )}
                  </div>
                )}
                {session?.messages.map((message, index) => (
                  <article
                    key={index}
                    // Like other AI chat apps: no name above each turn; the user's turn is a bubble, the answer is plain text.
                    aria-label={
                      message.role === 'user' ? t('คุณ') : message.role === 'status' ? t('สถานะงาน') : snapshot.settings.assistant
                    }
                    className={`message ${message.role}${message.role === 'status' && message.text === 'CANCELLED' ? ' neutral' : ''}${
                      index === lastAnswer && !running ? ' latest' : ''
                    }`}
                  >
                    {message.role === 'status' && <div className="message-author">{t('สถานะงาน')}</div>}
                    {message.role === 'assistant' ? (
                      <RichText className="message-body" text={message.text} onLink={openLink} />
                    ) : (
                      <div className="message-body">
                        {message.role === 'status' ? errorText[message.text] || t(message.text) : message.text}
                      </div>
                    )}
                    {!!message.files?.length && (
                      <div className="message-files" aria-label={t('ไฟล์ที่ส่งกับข้อความนี้')}>
                        {message.files.map((file, i) => (
                          <span key={i}>
                            <Paperclip size={12} />
                            {file.name}
                          </span>
                        ))}
                      </div>
                    )}
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
                              .writeText(message.text)
                              .then(() => notify(t('คัดลอกแล้ว'), 'success'))
                              .catch(e => notify(explainError(e), 'error'))
                          }
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          className="icon"
                          aria-label={t('เปิดใน Output')}
                          title={t('เปิดใน Output')}
                          onClick={() =>
                            void action(async () => {
                              await save();
                              await api.call('edit', { id: session.id, text: message.text, revision: session.revision });
                              await refresh();
                              setToolTab('output');
                              setRight(true);
                            })
                          }
                        >
                          <FileText size={15} />
                        </button>
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
                              setRight(true);
                            }}
                          >
                            {t('ตรวจ')} {request.tool}: {request.input.slice(0, 50)}
                          </button>
                        ))}
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
                    {reasoning && (
                      <details className="thinking" open={!liveText}>
                        <summary>
                          <Brain size={14} />
                          {t('ความคิดของ AI')}
                        </summary>
                        <div>{reasoning}</div>
                      </details>
                    )}
                    {liveText && !streamSaved && <RichText className="message-body streaming" text={liveText} onLink={openLink} />}
                    {/* One quiet line while working, as in Claude and Codex: what is happening and for how long. */}
                    <div className="activity" role="status" aria-live="polite">
                      <ThinkingScribble />
                      <span>{progress ? t(progress) : liveText ? t('กำลังเขียนคำตอบ') : t('กำลังคิด')}</span>
                      <span className="activity-detail">
                        {elapsed || t('0 วินาที')}
                        {now - heartbeatAt > 15000 && <> · {t('ยังไม่ได้รับสถานะจากแอป')}</>}
                      </span>
                    </div>
                    {now - activityAt > 45000 && !liveText && (
                      <p className="small muted">{t('ขั้นตอนนี้ยังไม่ส่งผลกลับมา คุณรอต่อหรือกดหยุดได้')}</p>
                    )}
                    {activities.length > 1 && (
                      <details className="activity-history">
                        <summary>{t('ดูขั้นตอนที่ทำแล้ว')}</summary>
                        <ol>
                          {activities.slice(0, -1).map((label, index) => (
                            <li key={index}>{label}</li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </article>
                )}
                {!running && (session?.status === 'error' || session?.status === 'interrupted') && lastRequest && (
                  <div className="retry-row">
                    {/* Continues the stopped task, after any Playbook steps it already finished. */}
                    <button
                      onClick={() =>
                        void action(() =>
                          start(
                            session.id,
                            lastRequest,
                            [],
                            undefined,
                            session.skill,
                            undefined,
                            undefined,
                            session.mode || workMode,
                            imageModel,
                            true,
                          ),
                        )
                      }
                    >
                      {t('ลองอีกครั้ง')}
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
                    {(connection?.models?.length || 0) > 1 && (
                      <span className="small muted">{t('หรือเลือกโมเดลอื่นในกล่องพิมพ์ก่อนลองใหม่')}</span>
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
                  {session?.workPlan?.tasks.length ? (
                    <WorkPlanCard
                      plan={session.workPlan}
                      running={running || submitting}
                      onExecute={() =>
                        void action(async () => {
                          setWorkflow('execute');
                          workflowRef.current = 'execute';
                          setWorkMode('chat');
                          await start(session.id, t('ลงมือทำตามแผน'), [], undefined, undefined, undefined, undefined, 'chat');
                        })
                      }
                    />
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
                      {imageModels(connection).length ? (
                        <>
                          <span>Image API</span>
                          <select
                            aria-label="Image model"
                            value={imageModel}
                            onChange={e => setImageModel(e.target.value)}
                            disabled={running}
                          >
                            <option value="">{availableImages[0] || t('กำลังตรวจโมเดลของบัญชี…')}</option>
                            {availableImages.map(id => (
                              <option key={id} value={id}>
                                {id}
                              </option>
                            ))}
                          </select>
                          {imageCatalogError && <small>{imageCatalogError}</small>}
                        </>
                      ) : (
                        <span>{t('เลือก OpenAI หรือ Google ที่เชื่อมด้วย API key เพื่อสร้างรูป · OAuth นี้ยังไม่มี Image API')}</span>
                      )}
                    </div>
                  )}
                  {files.length > 0 && (
                    <div className="attachments">
                      {files.map(f => (
                        <span key={f.id} className={f.usable ? undefined : 'refused'}>
                          <button onClick={() => setInspecting(f)} title={f.usable ? f.status : errorText[f.reason || ''] || f.status}>
                            <Paperclip size={13} />
                            {f.name}
                            {!f.usable && <small> {t('· ส่งไม่ได้')}</small>}
                          </button>
                          <button title={t('นำไฟล์ออก')} onClick={() => setFiles(files.filter(x => x.id !== f.id))}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
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
                          {t('ไปที่การเชื่อมต่อ AI')}
                        </button>
                      )}
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
                  {slashMatches.length > 0 && (
                    <div className="slash-menu" role="listbox" aria-label={t('เลือก Skill')}>
                      {slashMatches.map((s, i) => (
                        <button
                          key={s.name}
                          role="option"
                          aria-selected={i === slashIndex}
                          className={i === slashIndex ? 'active' : ''}
                          onMouseDown={e => {
                            e.preventDefault();
                            useSkill(s.name);
                          }}
                        >
                          <span className="slash-title">
                            {s.title}
                            {forTeam(s) && <small className="team-mark">{t('ทีมคุณ')}</small>}
                          </span>
                          <small className="slash-desc">{s.description}</small>
                          <code>/{s.name}</code>
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={composerRef}
                    aria-label={t('พิมพ์คำขอ')}
                    placeholder={forced ? t('บอกงานสำหรับ {0}…', forced.title) : t('พิมพ์สิ่งที่อยากให้ช่วย… หรือพิมพ์ / เพื่อเลือก Skill')}
                    value={query}
                    onChange={e => {
                      setQuery(e.target.value);
                      setSlashIndex(0);
                    }}
                    onKeyDown={e => {
                      if (e.nativeEvent.isComposing) return;
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
                      if (slashMatches.length && ['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
                        e.preventDefault();
                        if (e.key === 'ArrowDown') setSlashIndex(i => Math.min(i + 1, slashMatches.length - 1));
                        else if (e.key === 'ArrowUp') setSlashIndex(i => Math.max(i - 1, 0));
                        else if (e.key === 'Escape') setQuery('');
                        else useSkill(slashMatches[slashIndex]?.name || slashMatches[0].name);
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
                  <Readiness api={api} query={query} connectionId={session?.connectionId || connectionId} model={currentModel} />
                  {/* Laid out like Claude Desktop: add and modes on the left, AI and send on the right. */}
                  <div className="composer-tools">
                    <button
                      className="icon composer-add"
                      data-tour="attach"
                      aria-label={t('ตรวจและแนบเอกสาร')}
                      title={t('ตรวจและแนบเอกสาร')}
                      disabled={running || (!session && connectionId === CLAUDE_CODE)}
                      onClick={() =>
                        void action(async () => {
                          const id = session?.id || (await createTask())?.id;
                          if (!id) return;
                          const f = await api.call('attach', { id });
                          if (f) {
                            setFiles([f]);
                            setInspecting(f);
                          }
                        })
                      }
                    >
                      <Plus size={18} />
                    </button>
                    {snapshot.policy?.features.voice && (
                      <VoiceButton
                        key={session?.id || 'composer'}
                        api={api}
                        disabled={running}
                        onText={text => setQuery(q => (q ? q + '\n' : '') + text)}
                      />
                    )}
                    {snapshot.policy?.features.vision && (
                      <button
                        className="icon"
                        aria-label={t('แนบภาพให้ AI')}
                        title={t('ตรวจและแนบภาพต้นฉบับให้ AI')}
                        disabled={running}
                        onClick={() =>
                          void action(async () => {
                            const id = session?.id || (await createTask())?.id;
                            if (!id) return;
                            const f = await api.call('attach', { id, vision: true });
                            if (f) {
                              setFiles([f]);
                              setInspecting(f);
                            }
                          })
                        }
                      >
                        <ImagePlus size={18} />
                      </button>
                    )}
                    <select
                      className="pill-select"
                      data-tour="mode"
                      aria-label={t('โหมดทำงาน')}
                      title={t('โหมดทำงาน')}
                      value={workflow || workMode}
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
                        {(Object.keys(WORKFLOW_LABELS) as Workflow[]).map(id => (
                          <option key={id} value={id} disabled={id === 'execute' && !session?.workPlan?.tasks.length}>
                            {t(WORKFLOW_LABELS[id])}
                          </option>
                        ))}
                      </optgroup>
                      {/* Chat writes documents too (open in Output, or file changes), like other AI apps; the separate
                        drafting mode stays only for tasks that already use it and for multi-worker drafting. */}
                      {(workMode === 'draft' || snapshot.policy?.features.coordinator) && <option value="draft">{t('สร้างเอกสาร')}</option>}
                      <option value="image">{t('สร้างรูป')}</option>
                    </select>
                    {snapshot.policy && (
                      <select
                        className="pill-select"
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
                        <option value="acceptEdits" disabled={!snapshot.policy.modes.includes('acceptEdits')}>
                          {t('แก้ไฟล์ได้เลย · ถามก่อนรันคำสั่ง')}
                          {!snapshot.policy.modes.includes('acceptEdits') ? t(' · ปิดโดยผู้ดูแล') : ''}
                        </option>
                        <option value="auto" disabled={!snapshot.policy.modes.includes('auto')}>
                          {t('อัตโนมัติเต็มรูปแบบ')}
                          {!snapshot.policy.modes.includes('auto') ? t(' · ปิดโดยผู้ดูแล') : ''}
                        </option>
                        <option value="plan" disabled={!snapshot.policy.modes.includes('plan')}>
                          {t('วางแผน · อ่านอย่างเดียว')}
                        </option>
                      </select>
                    )}
                    <span className="spacer" />
                    <select
                      className="pill-select"
                      aria-label={t('เลือกการเชื่อมต่อ AI')}
                      value={session ? session.connectionId : connectionId}
                      disabled={running}
                      onChange={e => void action(() => chooseConnection(e.target.value))}
                    >
                      <option value="">{t('เลือก AI')}</option>
                      {snapshot.connections.map(c => (
                        <option key={c.id} value={c.id}>
                          {connectionLabel(c)} · {c.mode === 'api' ? 'API' : t('บัญชีส่วนตัว')}
                          {c.ready ? '' : t(' · ยังไม่พร้อม')}
                        </option>
                      ))}
                      {!session && <option value={CLAUDE_CODE}>{t('Claude · Pro/Max (เปิดใน Claude Code)')}</option>}
                    </select>
                    {connection && (
                      <select
                        aria-label={t('เลือกโมเดล')}
                        data-tour="model"
                        className="pill-select model-select"
                        title={
                          connection.models?.find(m => m.id === currentModel)?.description || t('โมเดลที่ใช้กับงานนี้ เปลี่ยนได้ทุกเมื่อ')
                        }
                        value={currentModel}
                        disabled={running}
                        onChange={e => void action(() => chooseModel(e.target.value))}
                      >
                        <option value="">{defaultModel ? t('ค่าเริ่มต้น ({0})', defaultModel.label) : t('ค่าเริ่มต้นของบริการ')}</option>
                        {(connection.models || []).map(m => (
                          <option key={m.id} value={m.id} title={m.description}>
                            {m.label}
                          </option>
                        ))}
                        {currentModel && !connection.models?.some(m => m.id === currentModel) && (
                          <option value={currentModel}>{currentModel}</option>
                        )}
                      </select>
                    )}
                    {activeModel?.efforts?.length ? (
                      <select
                        aria-label={t('เลือกระดับการคิด')}
                        className="pill-select model-select"
                        title={
                          activeModel.efforts.find(e => e.id === currentEffort)?.description ||
                          t('ระดับการคิด (reasoning) ยิ่งสูงยิ่งละเอียดแต่ช้าและใช้โควตามากขึ้น')
                        }
                        value={currentEffort}
                        disabled={running}
                        onChange={e => void action(() => chooseModel(currentModel, e.target.value))}
                      >
                        <option value="">
                          {activeModel.defaultEffort
                            ? t('ระดับการคิด: ค่าเริ่มต้น ({0})', effortLabel[activeModel.defaultEffort] || activeModel.defaultEffort)
                            : t('ระดับการคิด: ค่าเริ่มต้น')}
                        </option>
                        {activeModel.efforts.map(e => (
                          <option key={e.id} value={e.id} title={e.description}>
                            {t('ระดับการคิด:')} {effortLabel[e.id] || e.id}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {running ? (
                      <button className="send stop" title={t('หยุดงาน')} onClick={() => void api.call('cancel', { id: selected })}>
                        <Square size={17} />
                      </button>
                    ) : (
                      <button
                        className="send"
                        title={t('ส่งคำขอ (Enter) · ขึ้นบรรทัดใหม่ (Shift+Enter)')}
                        disabled={!query.trim() || submitting}
                        onClick={() => void action(send)}
                      >
                        {submitting ? <LoaderCircle size={20} className="spin" /> : <ArrowUp size={20} />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="composer-note">{t('ตรวจข้อมูลและร่างก่อนนำไปใช้ · ประวัติเก็บในเครื่อง')}</div>
                {/* With a task open, the connection warning above the box already offers this action. */}
                {!connection?.ready && !session && (
                  <button className="text-link" data-tour="connect" onClick={openAiSettings}>
                    {t('เชื่อมต่อ AI เพื่อเริ่มทำงาน')}
                  </button>
                )}
              </div>
            </>
          )}
          <footer className="statusbar" aria-label={t('สถานะ')}>
            <span className={`status-dot ${connection?.ready ? 'ok' : ''}`} aria-hidden="true" />
            <span>
              {connection
                ? `${providerName(connection)} · ${connection.ready ? t('พร้อมทำงาน') : t('ยังไม่พร้อม')}`
                : t('ยังไม่เชื่อมต่อ AI')}
            </span>
            {elapsed && (
              <span className="status-item">
                <Timer size={12} />
                {elapsed}
              </span>
            )}
            <span className="spacer" />
            {session?.usage && (
              <span
                className="status-item"
                title={t(
                  'ส่งเข้า {0} · ตอบกลับ {1} token จาก {2} รอบ',
                  session.usage.input.toLocaleString(locale()),
                  session.usage.output.toLocaleString(locale()),
                  session.usage.runs,
                )}
              >
                {formatTokens(session.usage.total)} token
              </span>
            )}
            {connection && (
              <span className="status-item">
                {activeModel?.label || currentModel || t('โมเดลค่าเริ่มต้น')}
                {currentEffort ? ` · ${effortLabel[currentEffort] || currentEffort}` : ''}
              </span>
            )}
            <button className="status-item status-button" data-tour="palette" onClick={() => setPalette(true)}>
              <Command size={12} />
              {t('คำสั่ง')} {shortcut}
            </button>
          </footer>
        </main>
        {/* The workbench stays mounted once shown, so a file opened in Files with unsaved edits, a typed command or the
            folder being browsed survive Settings, another page or hiding the panel; it is only hidden. */}
        {(showPanel || panelOpened) && (
          <>
            {showPanel && (
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
            )}
            <aside className="artifact-pane" data-tour="artifact" style={showPanel ? undefined : { display: 'none' }}>
              <nav className="workbench-tabs" aria-label={t('เครื่องมือข้างร่าง')}>
                {(['output', 'browser', 'terminal', 'tasks', 'files', 'changes'] as ToolTab[])
                  .filter(tab => advancedTools || tab !== 'terminal')
                  .map(tab => (
                    <button
                      key={tab}
                      className={toolTab === tab ? 'active' : ''}
                      aria-current={toolTab === tab ? 'page' : undefined}
                      onClick={() => setToolTab(tab)}
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
                <button
                  className="workbench-advanced"
                  aria-expanded={advancedTools}
                  aria-label={t('เครื่องมือขั้นสูง')}
                  title={
                    advancedTools
                      ? t('ซ่อนแท็บคำสั่งขั้นสูง')
                      : t('เครื่องมือขั้นสูง: แสดงแท็บคำสั่งขั้นสูงสำหรับผู้ใช้ที่คุ้นเคยกับ Terminal')
                  }
                  onClick={() => {
                    setAdvancedTools(!advancedTools);
                    if (toolTab === 'terminal') setToolTab('output');
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
                <header className="artifact-header">
                  <FileText size={18} />
                  <strong>{t('ผลงาน')}</strong>
                  <span className="spacer" />
                  <button className="icon" title={t('ประวัติเวอร์ชัน')} onClick={() => setHistory(!history)}>
                    <History size={17} />
                  </button>
                  <button className="icon" title={t('ซ่อนร่าง')} onClick={() => setRight(false)}>
                    <PanelRightClose size={17} />
                  </button>
                </header>
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
                    <div className="draft-title">
                      <span>{t(session.title)}</span>
                      <small>
                        {t('เวอร์ชัน')} {session.revision}
                        {dirty ? t(' · มีการแก้ไขที่ยังไม่บันทึก') : t(' · บันทึกแล้ว')}
                      </small>
                    </div>
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
                      <section className="proposal" key={p.id}>
                        <div>
                          <Sparkles size={16} />
                          <strong>{t('ข้อเสนอจาก AI')}</strong>
                        </div>
                        <p className="small muted">
                          {p.baseRevision === session.revision
                            ? t('ตรวจร่างนี้ก่อนแทนที่ร่างปัจจุบัน')
                            : t('ร่างปัจจุบันเปลี่ยนแล้ว ข้อเสนอนี้ถูกเก็บแยกไว้')}
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
                        <div className="proposal-actions">
                          <button
                            disabled={dirty || p.baseRevision !== session.revision}
                            onClick={() =>
                              void action(async () => {
                                await api.call('accept', { id: selected, proposalId: p.id });
                                await refresh();
                              })
                            }
                          >
                            <Check size={15} />
                            {t('ใช้ร่างนี้')}
                          </button>
                          <button
                            className="quiet"
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
                    <div className="format-toolbar" role="toolbar" aria-label={t('จัดรูปแบบร่าง')}>
                      <button className="quiet" onClick={() => editor?.chain().focus().setParagraph().run()}>
                        {t('ข้อความ')}
                      </button>
                      <button className="quiet" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                        {t('หัวข้อ')}
                      </button>
                      <button className="quiet" onClick={() => editor?.chain().focus().toggleBold().run()}>
                        {t('ตัวหนา')}
                      </button>
                      <button className="quiet" onClick={() => editor?.chain().focus().toggleItalic().run()}>
                        {t('ตัวเอียง')}
                      </button>
                      <button className="quiet" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                        {t('รายการ')}
                      </button>
                      <button className="quiet" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                        {t('ลำดับ')}
                      </button>
                    </div>
                    <div className="editor-scroll">
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
                          <option key={f} disabled={f === 'pdf' && Boolean(session.documentTemplate)}>
                            {f}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={exporting || (!session.draft && !dirty)}
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
                    {['docx', 'pdf'].includes(format) && (
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
                        {exportInfo.fontStatus === 'missing' && (
                          <p>{t('ตรวจไม่พบฟอนต์นี้บนเครื่อง ติดตั้งฟอนต์ให้ตรงแบบก่อนตรวจหน้าใน Word')}</p>
                        )}
                        {exportInfo.fontStatus === 'unknown' && <p>{t('ตรวจฟอนต์บนเครื่องไม่ได้ โปรดตรวจฟอนต์และหน้าใน Word')}</p>}
                        {exportInfo.documentTool && (
                          <p>
                            {t(
                              exportInfo.templateName
                                ? 'ใช้รูปแบบต้นฉบับ DOCX ตรวจทุกหน้าใน Word ก่อนเสนอ'
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
                  </>
                )}
              </div>
            </aside>
          </>
        )}
        {usageOpen && api && <UsageDialog api={api} onClose={() => setUsageOpen(false)} />}
        {learningOpen && api && (
          <LearningDialog api={api} initialText={learningText} sessionId={session?.id} onClose={() => setLearningOpen(false)} />
        )}
        {memoryOpen && api && snapshot && (
          <MemoryDialog api={api} settings={snapshot.settings} refresh={refresh} onClose={() => setMemoryOpen(false)} />
        )}
        {automationOpen && (
          <AutomationDialog
            api={api}
            connections={snapshot.connections}
            features={snapshot.policy?.features || {}}
            onClose={() => setAutomationOpen(false)}
            onOpen={id => {
              setAutomationOpen(false);
              void action(async () => {
                await refresh();
                await selectSession(id);
              });
            }}
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
                start(
                  ask.sessionId,
                  ask.text,
                  ask.attachments,
                  ask.token,
                  ask.skill,
                  ask.allowIds,
                  ask.sourceText,
                  ask.mode,
                  ask.imageModel,
                  ask.retry,
                  ask.coordinator,
                  ask.documentTool,
                  ask.attachmentRole,
                ),
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
            onClose={() => setPacksOpen(false)}
            onSelect={text => {
              setPendingSource(text);
              notify(t('เพิ่มข้อมูลจาก Skill Pack แล้ว ตรวจปลายทางก่อนส่ง'));
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
      </div>
    </div>
  );
}
