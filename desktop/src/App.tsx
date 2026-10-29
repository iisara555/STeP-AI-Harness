import { ThinkingScribble } from './thinking-scribble';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { DocumentPresentationControls, readExportSettingsOpen, saveExportSettingsOpen } from './document-presentation-controls';
import { resolvePresentation } from './document-presentation';
import {
  DocumentTitle,
  DocumentCaption,
  DocumentQuote,
  DocumentPageBreak,
  DocumentImageNode,
  DocumentStarterKit,
  DocumentTableCell,
  DocumentTableHeader,
} from './document-elements';
import { DocumentToolbar } from './document-toolbar';
import { Table, TableRow } from '@tiptap/extension-table';
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
  Receipt,
  Megaphone,
  Blocks,
  Copy,
  ImagePlus,
  ChevronDown,
  ChevronUp,
  Compass,
  BookOpen,
  Eye,
  AlertTriangle,
  SlidersHorizontal,
  CalendarClock,
} from './icons';
import { lazyScreen } from './lazy-screen';
import type { DocumentAttachment, DocumentForm } from './document-tool-app';
import { documentRequest, documentTool, type DocumentToolId, type DocumentAttachmentRole } from './document-tools';
import { DOCUMENT_FONTS, resolveDocumentLayout } from './document-layout';
import { toolCount } from './skill-capabilities';
import { skillsForStaff } from './skill-display';
// Export formats by the app staff know them by; the value stays the file extension.
const EXPORT_FORMAT_LABELS: Record<string, string> = {
  docx: 'Word (.docx)',
  pdf: 'PDF (.pdf)',
  md: 'Markdown (.md)',
  xlsx: 'Excel (.xlsx)',
  pptx: 'PowerPoint (.pptx)',
};
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
import { SidebarRail, readSidebarChoice, saveSidebarChoice } from './sidebar-rail';
import { UpdateCard, VersionLine, useUpdate } from './update';
import type { Attachment, Connection, PlanStep, Session, OwnPack, SkillEntry, Snapshot } from './types';
import { CLAUDE_CODE, effortLabel, errorText, explainError, initial, connectionName, shortcut, statusText } from './messages';
import { SettingsPanel } from './settings';
import { ApprovalDialog } from './approval';
import { VaultPromptDialog, type VaultPrompt } from './vault-prompt';
import type { ApprovalRequest } from './types';
import { WorkbenchPanel } from './workbench';
import { toolRequests, visibleStream, type ToolTab, type ToolRequest } from './tools';
import { isImageRequest, imageModels } from './image-routing';
import type { WorkMode, Workflow } from './types';
import { WorkPlanCard, WORKFLOW_LABELS } from './work-plan';
import { WorkAssistantActivity, WorkAssistantGuide, updateWorkActions, workActionsFromTrace } from './work-assistant';
import { ChatMarkdown } from './chat-markdown';
import { needsPublicWebSearch } from '../../src/modules/router/public-information.js';
import { publicSourceUrl } from './web';
import { QuestionCard } from './tool-question';
import { UsageDialog } from './usage';
import { MemoryDialog } from './memory';
import { LearningDialog } from './learning';
import { FeedbackButtons, FeedbackDialog, ReportDialog, type FeedbackAsk, type ReportAsk } from './feedback';
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
import type { WorkAction } from './types';
import { locale, setLanguage, t, teamName } from './i18n';
import { startersFor, starterTag, starterText } from './starters';
import { MorningBriefCard } from './morning-brief';

const ReceiptApp = lazyScreen(async () => ({ default: (await import('./receipt')).ReceiptApp }));
const DocumentTools = lazyScreen(async () => ({ default: (await import('./document-tool-app')).DocumentTools }));
const InternalMedia = lazyScreen(async () => ({ default: (await import('./internal-media-app')).InternalMedia }));
const ScheduledTasks = lazyScreen(async () => ({ default: (await import('./schedules-app')).ScheduledTasks }));
const SkillsHub = lazyScreen(async () => ({ default: (await import('./skills')).SkillsHub }));

// Short words for the composer's permission pill; the list itself keeps the full descriptions.
const PERMISSION_SHORT: Record<string, string> = {
  ask: 'ถามก่อน',
  acceptEdits: 'แก้ไฟล์ได้',
  auto: 'อัตโนมัติ',
  plan: 'อ่านอย่างเดียว',
};

const TOOLS_KEY = 'step.sidebarTools';

export default function App() {
  const api = window.step;
  const [update] = useUpdate(api);
  const [toolApprovals, setToolApprovals] = useState<ApprovalRequest[]>([]);
  const [vaultPrompts, setVaultPrompts] = useState<VaultPrompt[]>([]);
  // Tools start as one row of icons so the task list keeps the height; the choice is remembered.
  const [toolsOpen, setToolsOpen] = useState(() => {
    try {
      return localStorage.getItem(TOOLS_KEY) === 'open';
    } catch {
      return false;
    }
  });
  const toggleTools = () =>
    setToolsOpen(open => {
      try {
        localStorage.setItem(TOOLS_KEY, open ? 'icons' : 'open');
      } catch {
        // The layout still switches for this session.
      }
      return !open;
    });
  const [questions, setQuestions] = useState<ToolQuestion[]>([]),
    [usageOpen, setUsageOpen] = useState(false),
    [memoryOpen, setMemoryOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false),
    [learningText, setLearningText] = useState('');
  const [packsOpen, setPacksOpen] = useState(false),
    [ownPacks, setOwnPacks] = useState<OwnPack[] | null>(null),
    [keyboardOpen, setKeyboardOpen] = useState(false),
    [vimNormal, setVimNormal] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false),
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
  const [stream, setStream] = useState(''),
    [progress, setProgress] = useState(''),
    [running, setRunning] = useState(false);
  const [heartbeatAt, setHeartbeatAt] = useState(0),
    [activityAt, setActivityAt] = useState(0);
  const [error, setError] = useState(''),
    [files, setFiles] = useState<Attachment[]>([]),
    [inspecting, setInspecting] = useState<Attachment | null>(null);
  // Three columns need room: on narrower windows the draft panel, then the task list, start hidden.
  // `left` is the full task list; when it is off the sidebar folds to an icon rail, as in Claude and Codex. The
  // employee's own choice is remembered on this computer; with no choice yet, narrow windows start folded.
  const sidebarChoice = useRef<boolean | null>(readSidebarChoice());
  const [left, setLeft] = useState(() => (sidebarChoice.current === null ? window.innerWidth >= 900 : sidebarChoice.current)),
    [right, setRight] = useState(() => window.innerWidth >= 1100),
    [history, setHistory] = useState(false);
  // Below about 1200px, chat, task list and draft panel do not fit together: while the panel is open the task list
  // folds to the icon rail on its own (the employee's choice stays as it was), unless they open it again by hand.
  const [roomy, setRoomy] = useState(() => window.innerWidth >= 1200),
    [leftPeek, setLeftPeek] = useState(false);
  useEffect(() => {
    let width = window.innerWidth;
    const onResize = () => {
      const now = window.innerWidth;
      if (now < 1100 && width >= 1100) setRight(false);
      if (sidebarChoice.current === null && now < 900 !== width < 900) setLeft(now >= 900);
      setRoomy(now >= 1200);
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
  const [presentation, setPresentation] = useState(() => resolvePresentation());
  const presentationRef = useRef(presentation);
  presentationRef.current = presentation;
  const [exportGaruda, setExportGaruda] = useState('auto');
  const [exporting, setExporting] = useState(false);
  const exportPending = useRef(false);
  const [exportSettings, setExportSettings] = useState(readExportSettingsOpen);
  const [exportInfo, setExportInfo] = useState<{
    documentTool?: string;
    font: string;
    fontStatus: string;
    fontEmbedding?: { status: string; families: string[]; missingFamilies?: string[] };
    fieldsNeedUpdate?: boolean;
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
  const [workActions, setWorkActions] = useState<Record<string, WorkAction[]>>({});
  const [view, setView] = useState<'chat' | 'receipt' | 'skills' | 'documents' | 'media' | 'schedules'>('chat');
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
  const editor = useEditor({
    extensions: [
      DocumentStarterKit.configure({
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
      DocumentTableHeader,
      DocumentTableCell,
      DocumentTitle,
      DocumentCaption,
      DocumentQuote,
      DocumentPageBreak,
      DocumentImageNode.configure({ load: assetId => api!.call('documentAsset', { id: sessionRef.current?.id, assetId }) }),
    ],
    content: toDoc(''),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': t('ร่างที่แก้ไขได้'),
        class: 'draft-editor',
        spellcheck: 'false',
        lang: 'th',
      },
    },
    onUpdate: () => {
      // A saved snapshot can finish rendering after an immediate editor command.
      // Protect that new edit before React commits the dirty state.
      dirtyRef.current = true;
      setDirty(true);
    },
  });
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
  useEffect(() => {
    // An empty task shows the welcome from its greeting; only a conversation follows its latest message.
    if (session?.messages.length || stream || running) conversationEnd.current?.scrollIntoView({ block: 'end' });
  }, [session?.messages.length, stream, running]);
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
    const timer = setInterval(() => setNow(Date.now()), 1000);
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
      setPresentation(resolvePresentation(session?.presentation, session?.documentTool || false));
    }
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
  const selectSessionRef = useRef<(id: string) => Promise<void>>(async () => {});
  async function selectSession(id: string) {
    if (guardSettingsExit(() => selectSession(id))) return;
    const version = ++navigationVersion.current;
    await save();
    if (version !== navigationVersion.current) return;
    if (!['running', 'queued'].includes(snapshot?.sessions.find(s => s.id === id)?.status || '')) await api!.call('sessionResume', { id });
    if (version !== navigationVersion.current) return;
    setView('chat');
    setSelected(id);
    const chosen = snapshot?.sessions.find(s => s.id === id);
    setWorkMode(chosen?.mode || (chosen?.draft ? 'draft' : 'chat'));
    setRunning(['running', 'queued'].includes(chosen?.status || ''));
    setPendingSource('');
    setFiles([]);
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
  async function reviseDocument(id: string, changes: string) {
    if (!snapshot?.sessions.find(s => s.id === id)?.documentTool) throw new Error('INVALID_DOCUMENT_TOOL');
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
    await start(id, t('แก้ร่างเดิมตามคำขอนี้: {0}', changes), [], undefined, undefined, undefined, '', 'draft');
  }
  async function create() {
    if (guardSettingsExit(create)) return;
    // A new task is only a blank page until the first request or attachment, so no empty tasks pile up.
    const version = ++navigationVersion.current;
    await save();
    if (version !== navigationVersion.current) return;
    setSelected('');
    setRunning(false);
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
  ) {
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
        attachmentRole,
        isolated,
        aside,
        autoContinue,
        ...result.consent,
      });
      return;
    }
    if (result.aside) {
      setQuery('');
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
  const staffSkills = skills && skillsForStaff(skills, developerMode);
  const routedSkills = (staffSkills || []).filter(s => s.status === 'routed');
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
  const providerName = (c?: Connection) => (c ? connectionName(c) : '');
  // A run that waits on the employee's answer or permission says so, instead of "working".
  const taskStatus = (s: { id: string; status: string }) =>
    questions.some(q => q.sessionId === s.id)
      ? t('รอคุณตอบ')
      : toolApprovals.some(a => a.sessionId === s.id)
        ? t('รอคุณอนุญาต')
        : statusText[s.status] || s.status;
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
    right: () => setRight(p => !p),
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
      const run = id && id in commandRef.current ? commandRef.current[id as keyof typeof commands] : undefined;
      if (run) {
        e.preventDefault();
        run();
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
      />
      <div className="app" style={{ '--artifact-width': `${width}px` } as React.CSSProperties}>
        {!fullSidebar && (
          <SidebarRail
            brand={brandSymbol}
            avatar={profileAvatar}
            profileName={[snapshot.settings.userName || snapshot.settings.assistant, snapshot.appVersion && `v${snapshot.appVersion}`]
              .filter(Boolean)
              .join(' · ')}
            view={view}
            settings={settings}
            receiptBusy={receiptBusy}
            onNew={() => void action(create)}
            onSearch={() => setPalette(true)}
            onTasks={() => commandRef.current.left?.()}
            onView={next => {
              setSettings(false);
              navigate(next);
            }}
            onSettings={() => openSettings()}
            onProfile={() => openSettings()}
          />
        )}
        {fullSidebar && (
          <aside className="sidebar" aria-label={t('แถบงาน')}>
            <div className="brand">
              <div>
                {brandSymbol}
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
                        <button className="session-open" title={t(s.title)} onClick={() => void action(() => selectSession(s.id))}>
                          <span>{t(s.title)}</span>
                          <small>
                            {s.project || s.team.toUpperCase() || t('ทุกทีม')} · {taskStatus(s)}
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
                <p className="muted small">
                  {search
                    ? t('ไม่พบงานที่ตรงกับคำค้น')
                    : filter === 'artifacts'
                      ? t('ยังไม่มีร่างที่บันทึก งานที่มีร่างจาก AI หรือร่างที่คุณบันทึกจะอยู่ที่นี่')
                      : t('เมื่อเริ่มงาน บทสนทนาจะอยู่ที่นี่')}
                </p>
              )}
            </div>
            <div className="session-group tools-group">
              <span>{t('เครื่องมือ')}</span>
              <button
                className="quiet tools-toggle"
                aria-expanded={toolsOpen}
                aria-label={toolsOpen ? t('ย่อเครื่องมือเป็นไอคอน') : t('แสดงชื่อเครื่องมือ')}
                title={toolsOpen ? t('ย่อเครื่องมือเป็นไอคอน') : t('แสดงชื่อเครื่องมือ')}
                onClick={toggleTools}
              >
                {toolsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            <nav className={toolsOpen ? 'tools-nav' : 'tools-nav icons'}>
              <button
                data-tour="documents"
                className={view === 'documents' && !settings ? 'nav-active' : ''}
                title={toolsOpen ? undefined : t('เครื่องมือร่างเอกสาร')}
                onClick={() => {
                  setSettings(false);
                  navigate('documents');
                }}
              >
                <FileText size={17} />
                <span className="nav-label">{t('เครื่องมือร่างเอกสาร')}</span>
              </button>
              <button
                data-tour="media"
                className={view === 'media' && !settings ? 'nav-active' : ''}
                title={toolsOpen ? undefined : t('สื่อภายใน')}
                onClick={() => {
                  setSettings(false);
                  navigate('media');
                }}
              >
                <Megaphone size={17} />
                <span className="nav-label">{t('สื่อภายใน')}</span>
              </button>
              <button
                data-tour="skills"
                className={view === 'skills' && !settings ? 'nav-active' : ''}
                title={toolsOpen ? undefined : t('ศูนย์รวม Skill')}
                onClick={() => {
                  setSettings(false);
                  navigate('skills');
                }}
              >
                <Blocks size={17} />
                <span className="nav-label">{t('ศูนย์รวม Skill')}</span>
                <span className="count">{staffSkills ? staffSkills.length + toolCount : ''}</span>
              </button>
              <button
                data-tour="schedules"
                className={view === 'schedules' && !settings ? 'nav-active' : ''}
                title={toolsOpen ? undefined : t('งานตั้งเวลา')}
                onClick={() => {
                  setSettings(false);
                  navigate('schedules');
                }}
              >
                <CalendarClock size={17} />
                <span className="nav-label">{t('งานตั้งเวลา')}</span>
              </button>
              <button
                data-tour="receipt"
                className={view === 'receipt' && !settings ? 'nav-active' : ''}
                title={toolsOpen ? undefined : t('ตรวจใบเสร็จ AFP')}
                onClick={() => {
                  setSettings(false);
                  navigate('receipt');
                }}
              >
                <Receipt size={17} />
                <span className="nav-label">{t('ตรวจใบเสร็จ AFP')}</span>
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
              <SlidersHorizontal size={18} />
              <span>{t('การตั้งค่า')}</span>
            </button>
            <UpdateCard api={api} update={update} />
            <div className="profile" data-tour="version">
              {profileAvatar}
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
          {settings ? null : view === 'receipt' || view === 'documents' || view === 'media' ? null : view === 'schedules' ? (
            <ScheduledTasks
              api={api}
              connections={snapshot.connections}
              defaultConnection={connectionId}
              workspace={snapshot.settings.workspace}
              onConnections={openAiSettings}
              onOpen={id =>
                void action(async () => {
                  await refresh();
                  navigate('chat');
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
                          'ย่อข้อมูลประกอบแล้ว จาก {0} เหลือ {1} tokens (ประมาณการ)',
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
                        {/* In the greeting, where a first-time user looks, not below the starters behind the composer. */}
                        {!snapshot.settings.tourDone && (
                          <button className="welcome-tour quiet" onClick={commands.tour}>
                            <Compass size={15} />
                            {t('ใช้ครั้งแรก? ดูทัวร์แนะนำการใช้งาน')}
                          </button>
                        )}
                      </div>
                      <SectionArt scene="chat" className="welcome-illustration" />
                    </div>
                    <MorningBriefCard call={api.call} onError={e => notify(explainError(e), 'error')} onAsk={setQuery} />
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
                        {message.written.map(file => (
                          <li key={file.path}>
                            <FileText size={13} />
                            <span className="written-path">{file.path}</span>
                            <span className="muted">{file.status === 'applied' ? t('บันทึกแล้ว') : t('รอตรวจในรายการแก้ไข')}</span>
                            {/\.html?$/i.test(file.path) && (
                              <button
                                className="quiet small"
                                onClick={() =>
                                  void action(() =>
                                    api.call('previewHtml', file.status === 'applied' ? { path: file.path } : { id: file.id }),
                                  )
                                }
                              >
                                <Eye size={13} /> {t('ดูตัวอย่าง')}
                              </button>
                            )}
                            {file.status === 'staged' && (
                              <button
                                className="quiet small"
                                onClick={() => {
                                  setToolTab('changes');
                                  setRight(true);
                                }}
                              >
                                {t('ไปตรวจ')}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
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
                              .writeText(message.text)
                              .then(() => notify(t('คัดลอกแล้ว'), 'success'))
                              .catch(e => notify(explainError(e), 'error'))
                          }
                        >
                          <Copy size={15} />
                        </button>
                        {/* A drafting run's note is not a document; the draft itself is already in Output. */}
                        {!message.draftSummary && (
                          <button
                            className="icon"
                            aria-label={t('เปิดใน Output')}
                            title={t('เปิดใน Output')}
                            onClick={() =>
                              void action(async () => {
                                await save();
                                // In a document task the answer becomes a proposal to compare, never a direct overwrite.
                                await api.call('stageMessage', { id: session.id, index });
                                await refresh();
                                setToolTab('output');
                                setRight(true);
                                if (session.documentTool) notify(t('ส่งเป็นข้อเสนอแล้ว เทียบกับร่างแล้วกด “ใช้ร่างนี้”'), 'info');
                              })
                            }
                          >
                            <FileText size={15} />
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
                              setRight(true);
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
                    {reasoning && (
                      <details className="thinking">
                        <summary>
                          <Brain size={14} />
                          {t('ความคิดของ AI')}
                        </summary>
                        <div>{reasoning}</div>
                      </details>
                    )}
                    {liveText && !streamSaved && <RichText className="message-body streaming" text={liveText} onLink={openLink} />}
                    {session && <WorkAssistantActivity actions={workActions[session.id] || []} running />}
                    {/* One quiet line while working, as in Claude and Codex: each step replaces the last, nothing stacks up. */}
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
                  </article>
                )}
                {!running && session && <WorkAssistantActivity actions={workActionsFromTrace(session.runs?.at(-1))} running={false} />}
                {!running && session?.runs?.some(run => run.steps.some(step => step.tools?.length)) && (
                  <details className="tool-observability">
                    <summary>{t('ประวัติเครื่องมือและรหัสตรวจสอบ')}</summary>
                    <p className="small muted">
                      {t('เก็บเฉพาะชื่อเครื่องมือ เวลา ผล และรหัสในเครื่อง ไม่บันทึกเนื้อหาที่ส่งให้เครื่องมือ')}
                    </p>
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
                {!running && (session?.status === 'error' || session?.status === 'interrupted') && lastRequest && (
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
                        void action(async () => {
                          setWorkflow('execute');
                          workflowRef.current = 'execute';
                          setWorkMode('chat');
                          await start(
                            session.id,
                            t('ลงมือทำตามแผน'),
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
                            false,
                            false,
                            continuous,
                          );
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
                      {imageModels(connection).length ? (
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
                          {t('หากต้องการสร้างรูปภาพ เลือก OpenAI หรือ Google ที่เชื่อมด้วย API key การลงชื่อแบบนี้ยังสร้างรูปไม่ได้')}
                        </span>
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
                              <button
                                className="quiet"
                                onClick={() => void action(() => api.call('cancelSideQuestion', { id: session.id }))}
                              >
                                {t('หยุดคำถามแทรก')}
                              </button>
                            </div>
                          ) : q.code ? (
                            <p role="alert">{explainError(new Error(q.code))}</p>
                          ) : (
                            <>
                              <ChatMarkdown text={q.answer || ''} />
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
                    placeholder={
                      forced
                        ? t('บอกงานสำหรับ {0}…', forced.title)
                        : session?.documentTool && workMode === 'draft'
                          ? t('พิมพ์สิ่งที่อยากแก้ในเอกสารนี้ เช่น ระยะเวลาดำเนินการ 90 วัน หรือถามเกี่ยวกับร่างได้')
                          : t('พิมพ์งานที่อยากให้ช่วย หรือพิมพ์ / เพื่อเลือก Skill')
                    }
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
                      {session && (
                        <button
                          className="quiet"
                          disabled={
                            !query.trim() ||
                            Boolean(files.length || pendingSource) ||
                            session.sideQuestions?.some(q => q.status === 'running')
                          }
                          onClick={() => void action(() => askAside())}
                        >
                          {t('ถามแทรก')}
                        </button>
                      )}
                    </div>
                  )}
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
                      {(workMode === 'draft' || session?.documentTool || snapshot.policy?.features.coordinator) && (
                        <option value="draft">{session?.documentTool ? t('แก้เอกสารนี้') : t('สร้างเอกสาร')}</option>
                      )}
                      <option value="image">{t('สร้างรูป')}</option>
                    </select>
                    {/* Permission as a small shield pill with a short word; the native list underneath keeps the full
                        wording, so opening it still explains each level. */}
                    {snapshot.policy && (
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
                          <option value="acceptEdits" disabled={!snapshot.policy.modes.includes('acceptEdits')}>
                            {t('แก้ไฟล์ได้เลย · ถามก่อนรันคำสั่ง')}
                            {!snapshot.policy.modes.includes('acceptEdits') ? t(' · ปิดโดยผู้ดูแล') : ''}
                          </option>
                          <option value="auto" disabled={!snapshot.policy.modes.includes('auto')}>
                            {t('อัตโนมัติเต็มรูปแบบ')}
                            {!snapshot.policy.modes.includes('auto') ? t(' · ปิดโดยผู้ดูแล') : ''}
                          </option>
                          <option value="plan" disabled={!snapshot.policy.modes.includes('plan')}>
                            {t('อ่านอย่างเดียว · ห้ามแก้ไขไฟล์')}
                          </option>
                        </select>
                      </label>
                    )}
                    <span className="spacer" />
                    {/* One pill for the AI account, model and reasoning level: the full choice opens above it, so the row
                        stays on one line and the account is not repeated in the status bar. */}
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
                        </div>
                      )}
                    </div>
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
              </div>
            </>
          )}
          <footer className="statusbar" aria-label={t('สถานะ')}>
            <span className={`status-dot ${connection?.ready ? (runFailed ? 'failed' : 'ok') : ''}`} aria-hidden="true" />
            <span>
              {/* The account and model are on the composer's AI pill; the status bar only says whether it can work. */}
              {connection
                ? !connection.ready
                  ? t('ยังไม่พร้อม')
                  : runFailed
                    ? t('งานล่าสุดไม่สำเร็จ')
                    : t('พร้อมทำงาน')
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
                  'ข้อความที่ส่ง {0} tokens · คำตอบ {1} tokens จาก {2} ครั้ง',
                  session.usage.input.toLocaleString(locale()),
                  session.usage.output.toLocaleString(locale()),
                  session.usage.runs,
                )}
              >
                {t('{0} tokens', formatTokens(session.usage.total))}
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
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      setWidth(Math.min(700, Math.max(300, window.innerWidth - e.clientX)));
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
                {/* The tabs scroll sideways in one row when the panel is narrow; the settings icon keeps its place. */}
                <div className="workbench-tab-list">
                  {(['output', 'browser', 'terminal', 'tasks', 'files', 'changes'] as ToolTab[])
                    .filter(tab => advancedTools || tab !== 'terminal')
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
                          disabled={exporting}
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
                    {exportSettings && ['docx', 'pdf'].includes(format) && (
                      <div className="export-settings" id="export-settings">
                        {format === 'docx' && (
                          <DocumentPresentationControls
                            value={presentation}
                            locked={Boolean(session?.documentTemplate)}
                            disabled={exporting}
                            onChange={value => {
                              setPresentation(value);
                              presentationRef.current = value;
                              setDirty(true);
                              dirtyRef.current = true;
                            }}
                          />
                        )}
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
                      {['docx', 'pdf'].includes(format) && (
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
                            {exportInfo.fontEmbedding?.status !== 'embedded' && exportInfo.fontStatus === 'missing' && (
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
                      </div>
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
                  ask.isolated,
                  ask.aside,
                  ask.autoContinue,
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
            features={snapshot.policy?.features}
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
