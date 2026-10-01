import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { plainDocument as toDoc, documentText } from './draft';
import {
  ArrowUp,
  Check,
  ChevronLeft,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  PanelLeftClose,
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
} from 'lucide-react';
import { ReceiptApp } from './receipt';
import { SkillsHub, toolCount } from './skills';
import { SetupWizard } from './setup';
import { Tour } from './tour';
import {
  CommandPalette,
  ConfirmDialog,
  RichText,
  Toasts,
  type Toast,
  formatElapsed,
  formatTokens,
  groupSessions,
  type PaletteItem,
} from './ui';
import symbolColour from './assets/step-symbol-colour.svg';
import symbolWhite from './assets/step-symbol-mono-white.svg';
import launchArt from './assets/illustrations/launch.png';
import draftingArt from './assets/illustrations/drafting.png';
import ideaArt from './assets/illustrations/idea.png';
import type { Attachment, Connection, PlanStep, Session, SkillEntry, Snapshot } from './types';
import { CLAUDE_CODE, effortLabel, errorText, explainError, initial, providerLabel, shortcut, statusText } from './messages';
import { SettingsPanel } from './settings';
import { ApprovalDialog } from './approval';
import type { ApprovalRequest } from './types';
import { WorkbenchPanel } from './workbench';
import { toolRequests, type ToolTab, type ToolRequest } from './tools';
import { isImageRequest, imageModels } from './image-routing';
import type { WorkMode } from './types';
import { needsPublicWebSearch } from '../../src/modules/router/public-information.js';
import { publicSourceUrl } from './web';
import { QuestionCard } from './tool-question';
import { UsageDialog } from './usage';
import { MemoryDialog } from './memory';
import { AutomationDialog } from './automations';
import { commandPalette, commandForKey, vimEdit } from './commands';
import { KeyboardDialog } from './keyboard';
import { Readiness } from './readiness';
import { VoiceButton } from './voice';
import { PacksDialog } from './packs';
import type { ToolQuestion } from './types';

export default function App() {
  const api = window.step;
  const [toolApprovals, setToolApprovals] = useState<ApprovalRequest[]>([]);
  const [questions, setQuestions] = useState<ToolQuestion[]>([]),
    [usageOpen, setUsageOpen] = useState(false),
    [memoryOpen, setMemoryOpen] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false),
    [keyboardOpen, setKeyboardOpen] = useState(false),
    [vimNormal, setVimNormal] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false),
    [coordinated, setCoordinated] = useState(false);
  const [searchMatches, setSearchMatches] = useState<{ query: string; ids: string[] }>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState('');
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
  const [authCode, setAuthCode] = useState<{ id: string; code: string } | null>(null);
  const [plan, setPlan] = useState<(PlanStep & { state: string })[]>([]);
  const [view, setView] = useState<'chat' | 'receipt' | 'skills'>('chat');
  const [wizard, setWizard] = useState(false),
    [tour, setTour] = useState(false);
  const [skills, setSkills] = useState<SkillEntry[] | null>(null),
    [forcedSkill, setForcedSkill] = useState(''),
    [slashIndex, setSlashIndex] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]),
    toastId = useRef(0),
    runningId = useRef('');
  const dismiss = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
  const notify = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
    if (text) setToasts(list => [...list.filter(t => t.text !== text), { id: ++toastId.current, text, tone, action }].slice(-4));
  }, []);
  const [reasoning, setReasoning] = useState(''),
    [startedAt, setStartedAt] = useState(0),
    [now, setNow] = useState(Date.now());
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
  } | null>(null);
  // Claude Pro/Max works only inside Anthropic's own apps, so that choice hands the request to the employee's Claude Code.
  const [handoffAsk, setHandoffAsk] = useState<{ text: string; skill?: string } | null>(null),
    [claudeCode, setClaudeCode] = useState<boolean | null>(null);
  const [removing, setRemoving] = useState<Session | null>(null),
    [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null),
    [palette, setPalette] = useState(false);
  const [pendingModel, setPendingModel] = useState<string | undefined>(undefined),
    [pendingEffort, setPendingEffort] = useState(''),
    modelsRequested = useRef(new Set<string>());
  const [workMode, setWorkMode] = useState<WorkMode>('chat'),
    [imageModel, setImageModel] = useState('');
  const [availableImages, setAvailableImages] = useState<string[]>([]),
    [imageCatalogError, setImageCatalogError] = useState('');
  const [toolTab, setToolTab] = useState<ToolTab>('output'),
    [toolRequest, setToolRequest] = useState<ToolRequest>();
  const [pendingSource, setPendingSource] = useState(''),
    [submitting, setSubmitting] = useState(false);
  const sendInFlight = useRef(false),
    conversationEnd = useRef<HTMLDivElement>(null);
  const session = snapshot?.sessions.find(s => s.id === selected);
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
  const saveInFlight = useRef<Promise<void> | null>(null);
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
    ],
    content: toDoc(''),
    editorProps: { attributes: { 'aria-label': 'ร่างที่แก้ไขได้', class: 'draft-editor', spellcheck: 'false' } },
    onUpdate: () => setDirty(true),
  });
  const refresh = useCallback(async () => {
    if (api) {
      const data = await api.call('snapshot');
      setSnapshot(data);
      return data as Snapshot;
    }
  }, [api]);
  useEffect(() => {
    const update = () => void refresh();
    window.addEventListener('step-workspace', update);
    return () => window.removeEventListener('step-workspace', update);
  }, [refresh]);
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ block: 'end' });
  }, [session?.messages.length, stream, running]);
  useEffect(() => {
    void refresh()
      .then(s => {
        if (s) {
          setWizard(!s.settings.onboarding);
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
          // Each step rewrites the whole draft, so a new step replaces the streamed text instead of appending to it.
          if (event.type === 'status') {
            setProgress(errorText[event.text || ''] || event.text || '');
            setStream('');
            setReasoning('');
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
          setProgress(p => (p === 'ขั้นตอนดำเนินการจริงต้องทำโดยผู้มีอำนาจ' ? p : ''));
          const finished = event.sessionId === runningId.current ? event.sessionId : '';
          runningId.current = '';
          void refresh().then(data => {
            const done = finished && data?.sessions.find(s => s.id === finished);
            if (!done) return;
            const text =
              done.status === 'review'
                ? `“${done.title}” มีร่างให้ตรวจแล้ว`
                : done.status === 'waiting'
                  ? `“${done.title}” รอข้อมูลเพิ่มจากคุณ`
                  : done.status === 'error'
                    ? `“${done.title}” ต้องตรวจสอบ`
                    : '';
            if (!text) return;
            if (finished !== currentId.current)
              notify(text, done.status === 'error' ? 'error' : 'success', {
                label: 'เปิดงาน',
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
    if (saveInFlight.current) await saveInFlight.current;
    const current = sessionRef.current;
    if (current && editor && dirtyRef.current) {
      const document = editor.getJSON(),
        text = documentText(document as any);
      const serialized = JSON.stringify(document);
      const task = (async () => {
        const saved = await api!.call('edit', { id: current.id, text, document, revision: current.revision });
        sessionRef.current = saved;
        const changedAgain = JSON.stringify(editor.getJSON()) !== serialized;
        setDirty(changedAgain);
        dirtyRef.current = changedAgain;
        await refresh();
      })();
      saveInFlight.current = task;
      try {
        await task;
      } finally {
        saveInFlight.current = null;
      }
    }
  }
  const selectSessionRef = useRef<(id: string) => Promise<void>>(async () => {});
  async function selectSession(id: string) {
    await save();
    if (!['running', 'queued'].includes(snapshot?.sessions.find(s => s.id === id)?.status || '')) await api!.call('sessionResume', { id });
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
  const openAiSettings = () => {
    setSettingsPage('ai');
    setSettings(true);
  };
  // Without a usable AI the request stays in the box and the person is told why, instead of being moved elsewhere.
  const needAi = () =>
    notify('ยังไม่ได้เลือก AI เลือกในกล่องพิมพ์ หรือเพิ่มการเชื่อมต่อ AI ก่อน', 'info', {
      label: 'ไปที่การเชื่อมต่อ AI',
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
    const s = await api!.call('create', { connectionId, project: 'ตรวจใบเสร็จ AFP' });
    setView('chat');
    setSelected(s.id);
    await refresh();
    await start(s.id, text, [], undefined, undefined, allowIds, sourceText, 'draft');
  }
  async function create() {
    // A new task is only a blank page until the first request or attachment, so no empty tasks pile up.
    await save();
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
        `ส่งไฟล์ “${refused.name}” ให้ AI ไม่ได้: ${errorText[refused.reason || ''] || refused.status} · นำไฟล์ออกหรือแนบไฟล์อื่นก่อนส่ง`,
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
  ) {
    runningId.current = id;
    currentId.current = id;
    setRunning(true);
    setStream('');
    setReasoning('');
    setProgress('กำลังส่งข้อความ');
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
      });
    } catch (e) {
      setRunning(false);
      runningId.current = '';
      setProgress('');
      setStartedAt(0);
      throw e;
    }
    if (result.consent) {
      setRunning(false);
      runningId.current = '';
      setProgress('');
      setStartedAt(0);
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
        ...result.consent,
      });
      return;
    }
    if (result.started && result.masked?.length) notify(`ระบบปิดบังก่อนส่งให้ AI: ${result.masked.join(', ')}`);
    if (result.started) {
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
        (!search.trim() || (searchMatches?.query === search && searchMatches.ids.includes(s.id))) &&
        (filter !== 'artifacts' || s.draft),
    ) || [];
  const providerName = (c?: Connection) => (c ? providerLabel(c.provider) : '');
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
    automations: () => setAutomationOpen(true),
    settings: () => {
      setSettingsPage('general');
      setSettings(true);
    },
    keyboard: () => setKeyboardOpen(true),
    tour: () => {
      setSettings(false);
      setView('chat');
      setTour(true);
    },
    wizard: () => setWizard(true),
    left: () => setLeft(p => !p),
    right: () => setRight(p => !p),
    skills: () => {
      setSettings(false);
      setView('skills');
    },
    receipt: () => {
      setSettings(false);
      setView('receipt');
    },
    'theme-system': () => void setTheme('system'),
    'theme-light': () => void setTheme('light'),
    'theme-dark': () => void setTheme('dark'),
  };
  const commandRef = useRef(commands);
  commandRef.current = commands;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const id = commandForKey(e, snapshot?.settings.keybindings, /Mac/.test(navigator.platform));
      if (id && id in commandRef.current) {
        e.preventDefault();
        commandRef.current[id as keyof typeof commands]();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [snapshot?.settings.keybindings]);
  const paletteItems: PaletteItem[] = snapshot
    ? commandPalette(commands, snapshot.settings.keybindings || {}, [
        ...routedSkills.map(s => ({
          id: 'skill-' + s.name,
          group: 'Skill',
          label: 'ใช้ Skill: ' + s.title,
          hint: '/' + s.name,
          run: () => useSkill(s.name),
        })),
        ...(connection?.models || []).map(m => ({
          id: 'model-' + m.id,
          group: 'โมเดล',
          label: 'ใช้ ' + m.label,
          hint: m.id === currentModel ? 'ใช้อยู่' : providerName(connection),
          run: () => action(() => chooseModel(m.id)),
        })),
        ...[...snapshot.sessions]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 50)
          .map(s => ({
            id: 'session-' + s.id,
            group: 'งาน',
            label: s.title,
            hint: s.project || statusText[s.status],
            run: () => action(() => selectSession(s.id)),
          })),
      ])
    : [];
  const elapsed = running && startedAt ? formatElapsed(now - startedAt) : '';
  if (!api)
    return (
      <main className="browser-message">
        <Sparkles size={36} />
        <h1>STeP Desktop</h1>
        <p>พื้นที่ทำงานนี้ใช้ผ่านแอป Desktop เพื่อเชื่อมต่อ AI และจัดเก็บไฟล์ในเครื่อง</p>
        <p>หน้านี้เป็นการเปิด UI ในเบราว์เซอร์ จึงยังใช้บัญชีหรือไฟล์จริงไม่ได้</p>
      </main>
    );
  if (!snapshot)
    return (
      <main className="browser-message">
        <img className="illustration empty-art" src={ideaArt} alt="" />
        <LoaderCircle className="spin" />
        <p>{error || 'กำลังเปิดพื้นที่ทำงาน…'}</p>
      </main>
    );
  return (
    <div className="app" style={{ '--artifact-width': `${width}px` } as React.CSSProperties}>
      {left && (
        <aside className="sidebar">
          <div className="brand">
            <div>
              <span className="brand-symbol" role="img" aria-label="STeP">
                <img className="on-light" src={symbolColour} alt="" />
                <img className="on-dark" src={symbolWhite} alt="" />
              </span>
              <span className="brand-tagline">MAKE INNOVATION SIMPLE</span>
            </div>
            <button className="icon" title="ซ่อนแถบงาน" onClick={() => setLeft(false)}>
              <PanelLeftClose size={17} />
            </button>
          </div>
          <button className="new-work" data-tour="new-work" onClick={() => void action(create)}>
            <Plus size={18} /> เริ่มงานใหม่
          </button>
          <label className="search">
            <Search size={16} />
            <input placeholder="ค้นหางานหรือเนื้อหา" value={search} onChange={e => setSearch(e.target.value)} />
            <button className="icon palette-hint" aria-label="เปิดคำสั่ง" onClick={() => setPalette(true)}>
              {shortcut}
            </button>
          </label>
          <div className="session-filter" role="tablist" aria-label="กรองงาน">
            {(
              [
                ['all', 'งานทั้งหมด', MessageSquare],
                ['artifacts', 'มีผลงาน', FileText],
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
                  setView('chat');
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          {filter !== 'all' && <div className="recent-label">ร่างที่บันทึกแล้ว</div>}
          <div className="sessions">
            {groupSessions(filtered).map(group => (
              <section key={group.label} aria-label={group.label}>
                <div className="session-group">{group.label}</div>
                {group.sessions.map(s =>
                  renaming?.id === s.id ? (
                    <input
                      key={s.id}
                      className="session-rename"
                      aria-label="ชื่องาน"
                      autoFocus
                      value={renaming.title}
                      onChange={e => setRenaming({ ...renaming, title: e.target.value })}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') setRenaming(null);
                        if (e.key === 'Enter' && renaming.title.trim())
                          void action(async () => {
                            await api.call('rename', renaming);
                            setRenaming(null);
                            await refresh();
                          });
                      }}
                    />
                  ) : (
                    <div key={s.id} className={`session ${selected === s.id ? 'selected' : ''}`}>
                      <button className="session-open" onClick={() => void action(() => selectSession(s.id))}>
                        <span>{s.title}</span>
                        <small>
                          {s.project || s.team.toUpperCase() || 'ทุกทีม'} · {statusText[s.status] || s.status}
                        </small>
                      </button>
                      <span className="session-actions">
                        <button
                          className="icon"
                          aria-label={s.pinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                          onClick={() =>
                            void action(async () => {
                              await api.call('pin', { id: s.id, pinned: !s.pinned });
                              await refresh();
                            })
                          }
                        >
                          {s.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        <button className="icon" aria-label="เปลี่ยนชื่อ" onClick={() => setRenaming({ id: s.id, title: s.title })}>
                          <Pencil size={14} />
                        </button>
                        <button className="icon" aria-label="ลบงาน" disabled={running && selected === s.id} onClick={() => setRemoving(s)}>
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </div>
                  ),
                )}
              </section>
            ))}
            {!filtered.length && <p className="muted small">{search ? 'ไม่พบงานที่ตรงกับคำค้น' : 'เมื่อเริ่มงาน บทสนทนาจะอยู่ที่นี่'}</p>}
          </div>
          <div className="session-group tools-group">เครื่องมือ</div>
          <nav>
            <button
              data-tour="skills"
              className={view === 'skills' && !settings ? 'nav-active' : ''}
              onClick={() => {
                setSettings(false);
                setView('skills');
              }}
            >
              <Blocks size={17} />
              ศูนย์รวม Skill<span className="count">{skills ? skills.length + toolCount : ''}</span>
            </button>
            <button
              data-tour="tools"
              className={view === 'receipt' && !settings ? 'nav-active' : ''}
              onClick={() => {
                setSettings(false);
                setView('receipt');
              }}
            >
              <ReceiptText size={17} />
              ตรวจใบเสร็จ AFP<span className="beta">ทดลอง</span>
            </button>
          </nav>
          <button
            className={`settings-button ${settings ? 'nav-active' : ''}`}
            onClick={() => {
              setSettingsPage('general');
              setSettings(true);
            }}
          >
            <Settings2 size={18} />
            <span>ตั้งค่าพื้นที่ทำงาน</span>
          </button>
          <div className="profile">
            <span>{initial(snapshot.settings.userName || '') || snapshot.settings.team.toUpperCase() || 'ST'}</span>
            <div>
              {snapshot.settings.userName || snapshot.settings.assistant}
              <small>
                {snapshot.settings.userName ? `ผู้ช่วย ${snapshot.settings.assistant} · ` : ''}
                {snapshot.settings.team ? `ทีม ${snapshot.settings.team.toUpperCase()}` : 'ยังไม่เลือกทีม'}
              </small>
            </div>
          </div>
        </aside>
      )}
      <main className="main-pane">
        <header className="topbar">
          {!left && (
            <button className="icon" title="แสดงแถบงาน" onClick={() => setLeft(true)}>
              <PanelLeftClose size={18} />
            </button>
          )}
          <div>
            <strong>
              {settings
                ? 'ตั้งค่าพื้นที่ทำงาน'
                : view === 'receipt'
                  ? 'ตรวจใบเสร็จก่อนส่ง AFP'
                  : view === 'skills'
                    ? 'ศูนย์รวม Skill'
                    : session?.title || 'เริ่มต้นงานที่อยากทำ'}
            </strong>
            <small>
              {settings
                ? 'บัญชี AI และข้อมูลอยู่ในเครื่องนี้'
                : view === 'receipt'
                  ? 'ทดลอง · อ่านด้วย OCR ในเครื่อง ไม่ส่งเอกสารขึ้น cloud'
                  : view === 'skills'
                    ? 'Skill ในพื้นที่ทำงานนี้ พร้อมสถานะ Manifest และ Routing'
                    : session?.project || 'จากคำขอ สู่ผลงานที่ใช้ต่อได้'}
            </small>
          </div>
          {!settings && view === 'chat' && (
            <button className="quiet" onClick={() => setRight(!right)}>
              <FileText size={16} />
              {right ? 'ซ่อนร่าง' : 'เปิดร่าง'}
            </button>
          )}
        </header>
        {settings ? (
          <SettingsPanel
            key={settingsPage}
            initialPage={settingsPage}
            snapshot={snapshot}
            call={api.call}
            refresh={refresh}
            openWizard={() => setWizard(true)}
            openTour={() => {
              setSettings(false);
              setView('chat');
              setTour(true);
            }}
            close={() => setSettings(false)}
            onError={e => notify(explainError(e), 'error')}
          />
        ) : view === 'receipt' ? (
          <ReceiptApp
            call={api.call}
            onEvent={api.onEvent}
            notify={notify}
            onError={e => notify(explainError(e), 'error')}
            handoff={(text, sourceText, allowIds) => action(() => receiptHandoff(text, sourceText, allowIds))}
            connectionId={connectionId === CLAUDE_CODE ? '' : connectionId}
          />
        ) : view === 'skills' ? (
          <SkillsHub skills={skills} team={myTeam} onUse={useSkill} onOpenTool={() => setView('receipt')} />
        ) : (
          <>
            <div className="conversation" aria-live="polite">
              {session && (
                <div className="context-bar">
                  <button
                    className="quiet"
                    disabled={running}
                    onClick={() =>
                      void action(async () => {
                        await save();
                        const forked = await api.call('sessionFork', { id: session.id });
                        await refresh();
                        await selectSession(forked.id);
                      })
                    }
                  >
                    Fork บทสนทนา
                  </button>
                  <button
                    className="quiet"
                    onClick={() =>
                      void action(async () => {
                        await save();
                        const result = await api.call('sessionExport', { id: session.id, format: 'md' });
                        if (result) notify('บันทึกบทสนทนาแล้ว');
                      })
                    }
                  >
                    ส่งออก Markdown
                  </button>
                  <button
                    className="quiet"
                    onClick={() =>
                      void action(async () => {
                        await save();
                        const result = await api.call('sessionExport', { id: session.id, format: 'json' });
                        if (result) notify('บันทึกบทสนทนาแล้ว');
                      })
                    }
                  >
                    ส่งออก JSON
                  </button>
                  <button className="quiet" onClick={() => setMemoryOpen(true)}>
                    ความจำ
                  </button>
                  <button className="quiet" onClick={() => setAutomationOpen(true)}>
                    งานเบื้องหลัง
                  </button>
                  {snapshot.policy?.features.coordinator && (
                    <label>
                      <input
                        aria-label="แบ่งงานย่อย"
                        type="checkbox"
                        checked={coordinated}
                        disabled={running || workMode !== 'draft'}
                        onChange={e => setCoordinated(e.target.checked)}
                      />
                      แบ่งงานย่อย
                    </label>
                  )}
                  {!!session.loadedContext?.length && (
                    <details>
                      <summary>บริบทที่ใช้ ({session.loadedContext.length})</summary>
                      <ul>
                        {session.loadedContext.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {session.compaction && (
                    <span className="muted small">
                      ย่อบริบทแล้ว {session.compaction.before.toLocaleString('th-TH')} → {session.compaction.after.toLocaleString('th-TH')}{' '}
                      tokens (ประมาณการ)
                    </span>
                  )}
                </div>
              )}
              {!session?.messages.length && (
                <div className="welcome">
                  <img className="illustration welcome-art" src={launchArt} alt="" />
                  {snapshot.settings.userName && <p className="greet">สวัสดีครับ คุณ{snapshot.settings.userName}</p>}
                  <h1>
                    คุย วางแผน
                    <br />
                    และสร้างงานไปด้วยกัน
                  </h1>
                  <p>
                    ถามได้ตามปกติ หรือเลือกสร้างเอกสารและรูป
                    <br />
                    พร้อมเครื่องมือสำหรับทำงานในโฟลเดอร์ของคุณ
                  </p>
                  <div className="suggestions">
                    {['ช่วยจัดทำบรีฟงานประชาสัมพันธ์', 'ช่วยสรุปบันทึกประชุมเป็นรายการงาน', 'ช่วยวางโครงสไลด์นำเสนอโครงการ'].map(text => (
                      <button key={text} onClick={() => setQuery(text)}>
                        <FileText size={16} />
                        <span>{text}</span>
                        <ChevronLeft className="point-right" size={15} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {session?.messages.map((message, index) => (
                <article
                  key={index}
                  className={`message ${message.role}${message.role === 'status' && message.text === 'CANCELLED' ? ' neutral' : ''}`}
                >
                  <div className="message-author">
                    {message.role === 'user' ? 'คุณ' : message.role === 'status' ? 'สถานะงาน' : snapshot.settings.assistant}
                  </div>
                  {message.role === 'assistant' ? (
                    <RichText className="message-body" text={message.text} />
                  ) : (
                    <div className="message-body">{message.role === 'status' ? errorText[message.text] || message.text : message.text}</div>
                  )}
                  {!!message.files?.length && (
                    <div className="message-files" aria-label="ไฟล์ที่ส่งกับข้อความนี้">
                      {message.files.map((file, i) => (
                        <span key={i}>
                          <Paperclip size={12} />
                          {file.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {!!message.webSources?.length && (
                    <div className="web-sources" aria-label="แหล่งข้อมูลจากการค้นเว็บ">
                      <span>แหล่งข้อมูลจาก Web Search</span>
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
                        className="quiet"
                        onClick={() => void navigator.clipboard.writeText(message.text).catch(e => notify(explainError(e), 'error'))}
                      >
                        คัดลอก
                      </button>
                      <button
                        className="quiet"
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
                        เปิดใน Output
                      </button>
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
                          ตรวจ {request.tool}: {request.input.slice(0, 50)}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
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
              {snapshot?.usage?.warnings.length ? (
                <p className="small muted" role="status">
                  การใช้งาน AI ถึงอย่างน้อย 80% ของงบที่ตั้งไว้{' '}
                  <button className="quiet" onClick={() => setUsageOpen(true)}>
                    ดูการใช้งาน
                  </button>
                </p>
              ) : null}
              {running && (
                <article className="message assistant">
                  <div className="activity" role="status" aria-live="polite">
                    <LoaderCircle className="spin" size={15} />
                    {progress || 'กำลังทำงาน'}
                  </div>
                  <div className="activity-detail">
                    <span className="activity-pulse" aria-hidden="true" />
                    <span>
                      ใช้เวลา {elapsed || '0 วินาที'} · {now - heartbeatAt > 15000 ? 'ยังไม่ได้รับสถานะจากแอป' : 'แอปยังทำงานอยู่'}
                    </span>
                  </div>
                  {now - activityAt > 45000 && !stream && <p className="small muted">ขั้นตอนนี้ยังไม่ส่งผลกลับมา คุณรอต่อหรือกดหยุดได้</p>}
                  {activities.length > 1 && (
                    <details className="activity-history">
                      <summary>ดูขั้นตอนที่ทำแล้ว</summary>
                      <ol>
                        {activities.slice(0, -1).map((label, index) => (
                          <li key={index}>{label}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {plan.length > 1 && (
                    <ol className="plan-card" aria-label="ขั้นตอนของงาน">
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
                            {step.action && <small> · ต้องทำโดยผู้มีอำนาจ</small>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {reasoning && (
                    <details className="thinking">
                      <summary>
                        <Brain size={14} />
                        ความคิดของ AI
                      </summary>
                      <div>{reasoning}</div>
                    </details>
                  )}
                  {stream && <RichText className="message-body streaming" text={stream} />}
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
                    ลองอีกครั้ง
                  </button>
                  <button
                    className="quiet"
                    onClick={() => {
                      setQuery(lastRequest);
                      setTimeout(() => composerRef.current?.focus(), 0);
                    }}
                  >
                    แก้คำขอ
                  </button>
                  {(connection?.models?.length || 0) > 1 && <span className="small muted">หรือเลือกโมเดลอื่นในกล่องพิมพ์ก่อนลองใหม่</span>}
                </div>
              )}
              {!running && progress && <p className="muted small">{progress}</p>}
              {!running && workMode !== 'image' && needsPublicWebSearch(query) && (
                <p className="web-route small" role="status">
                  Web Search อัตโนมัติ · ค้นแหล่งข้อมูลล่าสุดก่อนตอบ
                </p>
              )}
              <div ref={conversationEnd} />
            </div>
            <div className="composer-area">
              <div className="composer" data-tour="composer">
                <div className="composer-mode" role="group" aria-label="โหมดทำงาน">
                  {(['chat', 'draft', 'image'] as WorkMode[]).map(mode => (
                    <button
                      key={mode}
                      className={workMode === mode ? 'active' : 'quiet'}
                      disabled={running || submitting}
                      onClick={() => setWorkMode(mode)}
                    >
                      {mode === 'chat' ? 'Chat' : mode === 'draft' ? 'Draft / Output' : 'Image'}
                    </button>
                  ))}
                  {snapshot.policy && (
                    <select
                      aria-label="สิทธิ์เครื่องมือ"
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
                        ถามก่อนทำ
                      </option>
                      <option value="plan" disabled={!snapshot.policy.modes.includes('plan')}>
                        วางแผน · อ่านอย่างเดียว
                      </option>
                      <option value="auto" disabled={!snapshot.policy.modes.includes('auto')}>
                        อัตโนมัติ{!snapshot.policy.modes.includes('auto') ? ' · ปิดโดยผู้ดูแล' : ''}
                      </option>
                    </select>
                  )}
                  {pendingSource && (
                    <button className="source-chip quiet" onClick={() => setPendingSource('')}>
                      ข้อมูลต้นทางแนบแล้ว ×
                    </button>
                  )}
                </div>
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
                          <option value="">{availableImages[0] || 'กำลังตรวจโมเดลของบัญชี…'}</option>
                          {availableImages.map(id => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                        {imageCatalogError && <small>{imageCatalogError}</small>}
                      </>
                    ) : (
                      <span>เลือก OpenAI หรือ Google ที่เชื่อมด้วย API key เพื่อสร้างรูป · OAuth นี้ยังไม่มี Image API</span>
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
                          {!f.usable && <small> · ส่งไม่ได้</small>}
                        </button>
                        <button title="นำไฟล์ออก" onClick={() => setFiles(files.filter(x => x.id !== f.id))}>
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {session && !running && !connection?.ready && (
                  <div className="connection-warning" role="status">
                    <Sparkles size={14} />
                    <span>{connection ? `${providerName(connection)} ของงานนี้ยังไม่พร้อม` : 'งานนี้ยังไม่ได้เลือก AI'}</span>
                    {readyConnection && readyConnection.id !== session.connectionId ? (
                      <button className="quiet" onClick={() => void action(() => chooseConnection(readyConnection.id))}>
                        เปลี่ยนเป็น {providerName(readyConnection)}
                      </button>
                    ) : (
                      <button className="quiet" onClick={openAiSettings}>
                        ไปที่การเชื่อมต่อ AI
                      </button>
                    )}
                  </div>
                )}
                {forced && (
                  <div className="skill-chip">
                    <Blocks size={13} />
                    ใช้ Skill: <strong>{forced.title}</strong>
                    <code>/{forced.name}</code>
                    <button className="icon" aria-label="เลิกใช้ Skill นี้" onClick={() => setForcedSkill('')}>
                      <X size={13} />
                    </button>
                  </div>
                )}
                {slashMatches.length > 0 && (
                  <div className="slash-menu" role="listbox" aria-label="เลือก Skill">
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
                          {forTeam(s) && <small className="team-mark">ทีมคุณ</small>}
                        </span>
                        <small className="slash-desc">{s.description}</small>
                        <code>/{s.name}</code>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={composerRef}
                  aria-label="พิมพ์คำขอ"
                  placeholder={forced ? `บอกงานสำหรับ ${forced.title}…` : 'พิมพ์สิ่งที่อยากให้ช่วย… หรือพิมพ์ / เพื่อเลือก Skill'}
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
                <div className="composer-tools">
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
                      className="quiet"
                      title="ตรวจและแนบภาพต้นฉบับให้ AI"
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
                      แนบภาพให้ AI
                    </button>
                  )}
                  <button
                    className="icon"
                    title="ตรวจและแนบเอกสาร"
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
                    <Paperclip size={18} />
                  </button>
                  <select
                    aria-label="เลือกการเชื่อมต่อ AI"
                    value={session ? session.connectionId : connectionId}
                    disabled={running}
                    onChange={e => void action(() => chooseConnection(e.target.value))}
                  >
                    <option value="">เลือก AI</option>
                    {snapshot.connections.map(c => (
                      <option key={c.id} value={c.id}>
                        {providerLabel(c.provider)} · {c.mode === 'api' ? 'API' : 'บัญชีส่วนตัว'}
                        {c.ready ? '' : ' · ยังไม่พร้อม'}
                      </option>
                    ))}
                    {!session && <option value={CLAUDE_CODE}>Claude · Pro/Max (เปิดใน Claude Code)</option>}
                  </select>
                  {connection && (
                    <select
                      aria-label="เลือกโมเดล"
                      data-tour="model"
                      className="model-select"
                      title={connection.models?.find(m => m.id === currentModel)?.description || 'โมเดลที่ใช้กับงานนี้ เปลี่ยนได้ทุกเมื่อ'}
                      value={currentModel}
                      disabled={running}
                      onChange={e => void action(() => chooseModel(e.target.value))}
                    >
                      <option value="">{defaultModel ? `ค่าเริ่มต้น (${defaultModel.label})` : 'ค่าเริ่มต้นของบริการ'}</option>
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
                      aria-label="เลือกระดับการคิด"
                      className="model-select"
                      title={
                        activeModel.efforts.find(e => e.id === currentEffort)?.description ||
                        'ระดับการคิด (reasoning) ยิ่งสูงยิ่งละเอียดแต่ช้าและใช้โควตามากขึ้น'
                      }
                      value={currentEffort}
                      disabled={running}
                      onChange={e => void action(() => chooseModel(currentModel, e.target.value))}
                    >
                      <option value="">
                        {activeModel.defaultEffort
                          ? `Reasoning: ค่าเริ่มต้น (${effortLabel[activeModel.defaultEffort] || activeModel.defaultEffort})`
                          : 'Reasoning: ค่าเริ่มต้น'}
                      </option>
                      {activeModel.efforts.map(e => (
                        <option key={e.id} value={e.id} title={e.description}>
                          Reasoning: {effortLabel[e.id] || e.id}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <span className="spacer" />
                  {running ? (
                    <button className="send stop" title="หยุดงาน" onClick={() => void api.call('cancel', { id: selected })}>
                      <Square size={17} />
                    </button>
                  ) : (
                    <button
                      className="send"
                      title="ส่งคำขอ (Enter) · ขึ้นบรรทัดใหม่ (Shift+Enter)"
                      disabled={!query.trim() || submitting}
                      onClick={() => void action(send)}
                    >
                      {submitting ? <LoaderCircle size={20} className="spin" /> : <ArrowUp size={20} />}
                    </button>
                  )}
                </div>
              </div>
              <div className="composer-note">ตรวจข้อมูลและร่างก่อนนำไปใช้ · ประวัติเก็บในเครื่อง</div>
              {!connection?.ready && (
                <button className="text-link" onClick={openAiSettings}>
                  เชื่อมต่อ AI เพื่อเริ่มทำงาน
                </button>
              )}
            </div>
          </>
        )}
        <footer className="statusbar" aria-label="สถานะ">
          <span className={`status-dot ${connection?.ready ? 'ok' : ''}`} aria-hidden="true" />
          <span>
            {connection ? `${providerName(connection)} · ${connection.ready ? 'พร้อมทำงาน' : 'ยังไม่พร้อม'}` : 'ยังไม่เชื่อมต่อ AI'}
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
              title={`ส่งเข้า ${session.usage.input.toLocaleString('th-TH')} · ตอบกลับ ${session.usage.output.toLocaleString('th-TH')} token จาก ${session.usage.runs} รอบ`}
            >
              {formatTokens(session.usage.total)} token
            </span>
          )}
          {connection && (
            <span className="status-item">
              {activeModel?.label || currentModel || 'โมเดลค่าเริ่มต้น'}
              {currentEffort ? ` · ${effortLabel[currentEffort] || currentEffort}` : ''}
            </span>
          )}
          <button className="status-item status-button" data-tour="palette" onClick={() => setPalette(true)}>
            <Command size={12} />
            คำสั่ง {shortcut}
          </button>
        </footer>
      </main>
      {right && !settings && view === 'chat' && (
        <>
          <div
            className="resize-handle"
            role="separator"
            aria-label="ปรับความกว้างร่าง"
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
          <aside className="artifact-pane" data-tour="artifact">
            <nav className="workbench-tabs" aria-label="Workspace tools">
              {(['output', 'browser', 'terminal', 'tasks', 'files', 'changes'] as ToolTab[]).map(tab => (
                <button key={tab} className={toolTab === tab ? 'active' : 'quiet'} onClick={() => setToolTab(tab)}>
                  {tab === 'tasks' ? 'Tasks' : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
            <WorkbenchPanel
              api={api}
              tab={toolTab}
              session={session}
              workspace={snapshot.settings.workspace}
              request={toolRequest}
              onTab={setToolTab}
              onSource={text => {
                setPendingSource(text.slice(0, 100000));
                setQuery('ช่วยวิเคราะห์ข้อมูลจากเครื่องมือที่แนบมา');
                composerRef.current?.focus();
              }}
            />
            <div className="output-document" hidden={toolTab !== 'output'}>
              <header className="artifact-header">
                <FileText size={18} />
                <strong>Output</strong>
                <span className="spacer" />
                <button className="icon" title="ประวัติเวอร์ชัน" onClick={() => setHistory(!history)}>
                  <History size={17} />
                </button>
                <button className="icon" title="ซ่อนร่าง" onClick={() => setRight(false)}>
                  <PanelRightClose size={17} />
                </button>
              </header>
              {!session ? (
                <div className="artifact-empty">
                  <img className="illustration empty-art" src={draftingArt} alt="" />
                  <h2>พื้นที่สำหรับร่างของคุณ</h2>
                  <p>
                    เมื่อ AI จัดทำร่างแล้ว
                    <br />
                    คุณจะตรวจและแก้ไขได้ตรงนี้
                  </p>
                </div>
              ) : (
                <>
                  <div className="draft-title">
                    <span>{session.title}</span>
                    <small>
                      เวอร์ชัน {session.revision}
                      {dirty ? ' · มีการแก้ไขที่ยังไม่บันทึก' : ' · บันทึกแล้ว'}
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
                              คืนค่าเวอร์ชัน {v.revision} <small>{new Date(v.at).toLocaleString('th-TH')}</small>
                            </button>
                          ))
                      ) : (
                        <p>ยังไม่มีเวอร์ชันก่อนหน้า</p>
                      )}
                    </div>
                  )}
                  {session.proposals.map(p => (
                    <section className="proposal" key={p.id}>
                      <div>
                        <Sparkles size={16} />
                        <strong>ข้อเสนอจาก AI</strong>
                      </div>
                      <p className="small muted">
                        {p.baseRevision === session.revision
                          ? 'ตรวจร่างนี้ก่อนแทนที่ร่างปัจจุบัน'
                          : 'ร่างปัจจุบันเปลี่ยนแล้ว ข้อเสนอนี้ถูกเก็บแยกไว้'}
                      </p>
                      <details open={!session.draft.trim()}>
                        <summary>{session.draft.trim() ? 'อ่านข้อเสนอและเทียบกับร่างด้านล่าง' : 'อ่านร่างจาก AI'}</summary>
                        <RichText className="proposal-text" text={p.text} />
                      </details>
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
                          ใช้ร่างนี้
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
                          ไม่ใช้
                        </button>
                      </div>
                    </section>
                  ))}
                  <div className="format-toolbar" role="toolbar" aria-label="จัดรูปแบบร่าง">
                    <button className="quiet" onClick={() => editor?.chain().focus().setParagraph().run()}>
                      ข้อความ
                    </button>
                    <button className="quiet" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                      หัวข้อ
                    </button>
                    <button className="quiet" onClick={() => editor?.chain().focus().toggleBold().run()}>
                      ตัวหนา
                    </button>
                    <button className="quiet" onClick={() => editor?.chain().focus().toggleItalic().run()}>
                      ตัวเอียง
                    </button>
                    <button className="quiet" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                      รายการ
                    </button>
                    <button className="quiet" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                      ลำดับ
                    </button>
                  </div>
                  <div className="editor-scroll">
                    <EditorContent editor={editor} />
                  </div>
                  <details className="sources">
                    <summary>แหล่งอ้างอิงที่ใช้ ({session.sources.length})</summary>
                    {session.sources.map(path => (
                      <p key={path}>{path}</p>
                    ))}
                  </details>
                  <footer className="artifact-footer">
                    <button className="quiet" disabled={!dirty} onClick={() => void action(save)}>
                      <Save size={16} />
                      บันทึก
                    </button>
                    <select aria-label="รูปแบบส่งออก" value={format} onChange={e => setFormat(e.target.value)}>
                      {['docx', 'pdf', 'md', 'xlsx', 'pptx'].map(f => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                    <button
                      disabled={!session.draft && !dirty}
                      onClick={() =>
                        void action(async () => {
                          await save();
                          const output = await api.call('export', { id: selected, format });
                          setExportPath(output.path);
                          notify(`บันทึก ${output.filename} แล้ว`, 'success', {
                            label: 'เปิดโฟลเดอร์',
                            run: () => api.call('reveal', { path: output.path }),
                          });
                        })
                      }
                    >
                      <Download size={16} />
                      ส่งออก
                    </button>
                  </footer>
                  {exportPath && (
                    <button className="text-link" onClick={() => void api.call('reveal', { path: exportPath })}>
                      เปิดโฟลเดอร์ไฟล์ล่าสุด
                    </button>
                  )}
                </>
              )}
            </div>
          </aside>
        </>
      )}
      {usageOpen && api && <UsageDialog api={api} onClose={() => setUsageOpen(false)} />}
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
      {consentAsk && (
        <ApprovalDialog
          request={{
            id: consentAsk.token,
            tool: 'external_ai',
            title: consentAsk.flagged ? 'ตรวจข้อความก่อนส่งให้ AI' : 'ยืนยันการส่งข้อมูลให้ AI',
            body: '',
            privacyClass: consentAsk.flagged ? 'restricted' : 'internal',
            allowRemember: false,
          }}
          confirmLabel="มีสิทธิ์ส่งข้อมูลนี้"
          onCancel={() => setConsentAsk(null)}
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
              ),
            );
          }}
        >
          {consentAsk.flagged ? (
            <p className="confirm-warning">
              <ShieldCheck size={16} />
              ระบบพบสิ่งที่ควรตรวจ: {consentAsk.labels.join(', ')}
            </p>
          ) : (
            consentAsk.labels.length > 0 && (
              <p className="confirm-warning">
                <ShieldCheck size={16} />
                ระบบจะปิดบังก่อนส่ง: {consentAsk.labels.join(', ')} ร่างที่ได้จะมีข้อความในวงเล็บแทน ให้ใส่ข้อมูลจริงเองหลังตรวจ
              </p>
            )
          )}
          <p>
            คำขอ{consentAsk.attachment || consentAsk.sourceText ? ' พร้อมข้อมูลต้นทางที่ตรวจแล้ว' : ''} ร่าง และบทสนทนาที่เกี่ยวข้องจะส่งให้{' '}
            {providerName(
              snapshot.connections.find(c => c.id === snapshot.sessions.find(x => x.id === consentAsk.sessionId)?.connectionId) ||
                connection,
            )}
          </p>
          <p className="small muted">
            คำถามข้อมูลสาธารณะที่เปลี่ยนตามเวลาอาจใช้ Web Search ของบัญชี AI นี้ โดยส่งเฉพาะคำถามสาธารณะไปค้น
            ไม่ส่งไฟล์แนบหรือบทสนทนาไปเป็นคำค้น
          </p>
          <p className="small muted">
            ยืนยันเฉพาะข้อมูลที่คุณมีสิทธิ์ส่งผ่านบริการนี้ ผลสแกนไม่ใช่การอนุญาตจากองค์กร ระบบปิดบังเลขบัตร เบอร์โทร และอีเมลที่ตรวจพบ
            {consentAsk.vision
              ? ' ภาพต้นฉบับจะถูกส่งด้วย ตรวจภาพว่าไม่มีข้อมูลส่วนบุคคลหรือความลับที่ OCR อาจอ่านไม่พบก่อนยืนยัน'
              : ' และไม่ส่งไฟล์ต้นฉบับ'}
            {consentAsk.first && !consentAsk.flagged && !consentAsk.attachment && !consentAsk.sourceText
              ? ' ครั้งต่อไปจะไม่ถามซ้ำ เว้นแต่มีไฟล์แนบหรือพบข้อมูลที่ควรตรวจ'
              : ''}
          </p>
        </ApprovalDialog>
      )}
      {handoffAsk &&
        (claudeCode === false ? (
          <ConfirmDialog
            title="ยังไม่พบ Claude Code"
            confirmLabel="เปิดวิธีติดตั้ง"
            cancelLabel="ปิด"
            onCancel={() => setHandoffAsk(null)}
            onConfirm={async () => {
              await api.call('openHelp', { topic: 'claudeCode' });
              setHandoffAsk(null);
            }}
          >
            <p>
              ใช้ Claude แบบ Pro/Max ได้ผ่าน Claude Code ของ Anthropic ที่ติดตั้งในเครื่องนี้ ติดตั้งแล้วเปิด Claude Code
              หนึ่งครั้งเพื่อลงชื่อเข้าใช้บัญชี Claude ของคุณ แล้วกลับมาส่งใหม่
            </p>
            <p className="small muted">
              STeP Desktop ลงชื่อเข้าใช้ Claude แทนคุณไม่ได้ เพราะเงื่อนไขของ Anthropic อนุญาตให้ใช้บัญชี Pro/Max ในแอปของ Anthropic
              เท่านั้น
            </p>
          </ConfirmDialog>
        ) : (
          <ConfirmDialog
            title="ส่งต่อไปทำใน Claude Code"
            confirmLabel="คัดลอกและเปิด Claude Code"
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
              notify('คัดลอกคำขอแล้ว วางในหน้าต่าง Claude Code (Ctrl+V หรือ ⌘V) แล้วกด Enter', 'success');
            }}
          >
            <p>
              แอปจะคัดลอกคำขอ{handoffAsk.skill ? ' พร้อมตำแหน่งไฟล์ Skill' : ''} แล้วเปิด Claude Code ในโฟลเดอร์งาน
              คุณวางคำขอและทำงานต่อในหน้าต่างนั้นด้วยบัญชี Claude ของคุณเอง
            </p>
            <p className="small muted">
              คำตอบจะอยู่ใน Claude Code ไม่กลับมาที่แอปนี้ ระบบปิดบังเลขบัตร เบอร์โทร และอีเมลที่ตรวจพบก่อนคัดลอก
              ส่งเฉพาะข้อมูลที่คุณมีสิทธิ์ใช้กับ Claude
            </p>
          </ConfirmDialog>
        ))}
      {removing && (
        <ConfirmDialog
          title="ลบงานนี้?"
          tone="danger"
          confirmLabel="ลบงาน"
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
            “{removing.title}” พร้อมบทสนทนา ร่าง และประวัติเวอร์ชันจะถูกลบออกจากเครื่องนี้ และกู้คืนไม่ได้
            ไฟล์ที่ส่งออกไว้แล้วในโฟลเดอร์ผลงานยังอยู่
          </p>
        </ConfirmDialog>
      )}
      {packsOpen && (
        <PacksDialog
          api={api}
          onClose={() => setPacksOpen(false)}
          onSelect={text => {
            setPendingSource(text);
            notify('เพิ่มข้อมูลจาก Skill Pack แล้ว ตรวจปลายทางก่อนส่ง');
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
            setView('chat');
            if (startTour) setTour(true);
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
          <section role="dialog" aria-modal="true" aria-label="ลงชื่อเข้าใช้ Google" className="attachment-dialog">
            <header>
              <h2>ลงชื่อเข้าใช้บริการ AI</h2>
            </header>
            <p>
              ลงชื่อและกดอนุญาตในเบราว์เซอร์ หากบริการแสดง authorization code ให้คัดลอกมาวางที่นี่ หากเชื่อมต่อกลับอัตโนมัติ
              หน้าต่างนี้จะปิดเอง
            </p>
            <label className="auth-code">
              Authorization code
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
                ยืนยัน
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
                ยกเลิก
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
          <section role="dialog" aria-modal="true" aria-label="ตรวจข้อความแนบ" className="attachment-dialog">
            <header>
              <h2>{inspecting.name}</h2>
              <button className="icon" autoFocus onClick={() => setInspecting(null)} title="ปิด">
                <X />
              </button>
            </header>
            <p className={inspecting.usable ? undefined : 'danger-text'}>
              {inspecting.usable ? inspecting.status : `${inspecting.status}: ${errorText[inspecting.reason || ''] || ''}`}
            </p>
            <p className="small muted">
              {inspecting.vision
                ? 'ส่งภาพต้นฉบับให้ AI พร้อมข้อความ OCR ตรวจภาพและสิทธิ์ส่งข้อมูลก่อนยืนยัน ระบบตรวจเฉพาะข้อความที่ OCR อ่านได้'
                : 'ตรวจเฉพาะข้อความที่อ่านได้ ไม่รับรองสิทธิ์ส่งข้อมูล ไฟล์ต้นฉบับไม่ถูกส่ง'}
            </p>
            {inspecting.imagePreview && <img className="attachment-image" src={inspecting.imagePreview} alt="ภาพต้นฉบับที่จะส่งให้ AI" />}
            <pre>{inspecting.preview || 'ไม่สามารถเตรียมข้อความที่ตรวจแล้วได้ กรุณาใช้สำเนาที่ปิดบังข้อมูลและตรวจทานก่อน'}</pre>
            <button onClick={() => setInspecting(null)}>กลับไปที่งาน</button>
          </section>
        </div>
      )}
    </div>
  );
}
