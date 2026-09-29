import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { plainDocument as toDoc, documentText } from './draft';
import { ArrowUp, Check, ChevronLeft, FileText, FolderOpen, History, LoaderCircle, MessageSquare, PanelLeftClose, PanelRightClose, Paperclip, Plus, Search, Settings2, Square, X, Download, Save, Sparkles, Sun, Moon, Monitor, Pin, PinOff, Pencil, Trash2, Brain, Command, Timer, ShieldCheck, Circle, ReceiptText, Blocks } from 'lucide-react';
import { ReceiptApp } from './receipt';
import { SkillsHub } from './skills';
import { SetupWizard } from './setup';
import { Tour } from './tour';
import { ClaudeCodeNote, CommandPalette, ConfirmDialog, RichText, Toasts, type Toast, formatElapsed, formatTokens, groupSessions, matchesSession, type PaletteItem } from './ui';
import symbolColour from './assets/step-symbol-colour.svg';
import symbolWhite from './assets/step-symbol-mono-white.svg';
import launchArt from './assets/illustrations/launch.png';
import draftingArt from './assets/illustrations/drafting.png';
import teamworkArt from './assets/illustrations/teamwork.png';
import ideaArt from './assets/illustrations/idea.png';
import type { Attachment, Connection, PlanStep, Session, SkillEntry, Snapshot } from './types';

const CLAUDE_CODE = 'claude-code';
const errorText: Record<string, string> = { CONNECTION_NOT_READY: 'กรุณาเชื่อมต่อและทดสอบ AI ในการตั้งค่าก่อน', API_KEY_REQUIRED: 'กรุณาเพิ่ม API key', DRAFT_CONFLICT: 'ร่างมีการแก้ไขหลังจาก AI เริ่มทำงาน ข้อเสนอจึงยังไม่แทนที่ร่าง คุณคัดลอกส่วนที่ต้องการมาแก้เองได้', PRIVACY_REVIEW_REQUIRED: 'พบข้อมูลที่ต้องตรวจเพิ่มเติม กรุณาปิดบังข้อมูลส่วนบุคคลหรือข้อมูลลับก่อนส่ง', LOGIN_REQUIRED: 'การลงชื่อเข้าใช้หมดอายุ กดเชื่อมต่อและทดสอบในหน้าตั้งค่าอีกครั้ง', LOGIN_FAILED: 'ลงชื่อเข้าใช้ไม่สำเร็จ กรุณาลองใหม่', OCR_UNAVAILABLE: 'บริการ OCR ในเครื่องยังไม่เปิด กด “เปิดบริการ OCR” ก่อน', OCR_NOT_INSTALLED: 'ยังไม่ได้ติดตั้ง OCR ในเครื่องนี้ กด “ติดตั้ง OCR” ในหน้าตรวจใบเสร็จ', OCR_START_FAILED: 'เปิดบริการ OCR ไม่สำเร็จ ลองเปิด Start-OCR.bat เพื่อดูข้อผิดพลาด', OCR_FAILED: 'อ่านใบเสร็จไม่สำเร็จ ลองใช้ภาพที่ชัดขึ้นหรือไฟล์อื่น', OCR_FILE_TOO_LARGE: 'ไฟล์ใหญ่เกิน 25 MB', OCR_UNSUPPORTED_FILE: 'รองรับเฉพาะ PDF และไฟล์ภาพ', OCR_FOLDER_INVALID: 'โฟลเดอร์นี้ไม่ใช่ local-thai-ocr ของ STeP', SKILL_NOT_ROUTED: 'Skill นี้ยังไม่เชื่อม Routing จึงเรียกจากแชทไม่ได้', RUNTIME_INVALID: 'ไฟล์ที่เลือกไม่ใช่ Codex หรือ Gemini CLI ของผู้ให้บริการนี้ ใช้ตัวเชื่อมที่มากับแอปแทนได้', RUNTIME_UNAVAILABLE: 'ไม่พบตัวเชื่อม AI ในชุดติดตั้ง กรุณาติดตั้งแอปใหม่', MODEL_NOT_AVAILABLE: 'โมเดลนี้ใช้กับบัญชีหรือแพ็กเกจของคุณไม่ได้ เลือกโมเดลอื่นในกล่องพิมพ์', PROVIDER_QUOTA: 'โควตาของบัญชีเต็มหรือถูกจำกัดชั่วคราว ลองใหม่ภายหลังหรือเลือกโมเดลที่เบากว่า', CONNECTION_BUSY: 'การเชื่อมต่อนี้กำลังทำงานอยู่ รอให้เสร็จหรือกดยกเลิกก่อน', CONNECTION_NOT_FOUND: 'ไม่พบการเชื่อมต่อนี้แล้ว เลือก AI ใหม่', RUNTIME_EXITED: 'ตัวเชื่อม AI หยุดทำงานกลางคัน ลองใหม่อีกครั้ง', CLAUDE_CODE_NOT_FOUND: 'ไม่พบ Claude Code ในเครื่องนี้ ติดตั้งและลงชื่อเข้าใช้ Claude Code ก่อน', SKILL_NOT_FOUND: 'ไม่พบไฟล์ Skill นี้', RUN_TIMEOUT: 'AI ใช้เวลานานเกินกำหนดในขั้นตอนนี้ ลองใหม่หรือลดระดับ Reasoning', PROVIDER_TIMEOUT: 'บริการ AI ตอบช้าเกินกำหนด ลองใหม่อีกครั้ง', PYTHON_REQUIRED: 'ต้องติดตั้ง Python 3.10–3.12 (64-bit) ก่อน', OCR_INSTALL_FAILED: 'ติดตั้ง OCR ไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่', INSTALL_BUSY: 'กำลังติดตั้งอยู่ รอให้เสร็จก่อน', INVALID_MODEL: 'โมเดลนี้ไม่อยู่ในรายชื่อของบริการ กรุณาโหลดรายชื่อโมเดลใหม่', MODEL_LIST_FAILED: 'โหลดรายชื่อโมเดลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่', AUTHORITY_REVIEW_REQUIRED: 'งานนี้ต้องให้ผู้รับผิดชอบหรือผู้มีอำนาจตรวจสอบก่อน', WORKSPACE_REQUIRED: 'เลือกโฟลเดอร์เก็บงานในการตั้งค่าก่อนส่งออก', CANCELLED: 'หยุดงานแล้ว ร่างเดิมยังอยู่', PROVIDER_REQUEST_FAILED: 'AI ทำงานไม่สำเร็จ ตรวจการเชื่อมต่อและโควตาแล้วลองใหม่', RUN_ALREADY_ACTIVE: 'มีงานกำลังทำอยู่ รอให้เสร็จหรือหยุดงานก่อน', CONTEXT_UNAVAILABLE: 'แหล่งอ้างอิงที่จำเป็นยังไม่พร้อม', EMPTY_RESULT: 'AI ยังไม่ได้ส่งร่างกลับมา กรุณาลองใหม่', INPUT_LIMIT: 'เนื้อหายาวเกินขอบเขต กรุณาแบ่งงานเป็นส่วนเล็กลง' };
const effortLabel: Record<string, string> = { none: 'None', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max', ultra: 'Ultra' };
const explainError = (value: unknown) => { const text = String(value); return Object.entries(errorText).find(([key]) => text.includes(key))?.[1] || 'ดำเนินการไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่'; };
// First visible character: Thai marks stay attached to their base letter (ต้น → ต้, not ต + ้).
const initial = (name: string) => [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(name.trim())][0]?.segment.replace(/[ัิ-ฺ็-๎]/g, '') || '';
const shortcut = /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
const statusText: Record<string, string> = { idle: 'พร้อมเริ่ม', running: 'กำลังทำงาน', review: 'รอตรวจร่าง', waiting: 'รอข้อมูล', error: 'ต้องตรวจสอบ', cancelled: 'หยุดแล้ว', interrupted: 'งานหยุดเมื่อปิดแอป' };

export default function App() {
  const api = window.step;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [selected, setSelected] = useState('');
  const [settings, setSettings] = useState(false), [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'projects' | 'artifacts'>('all'), [project, setProject] = useState('');
  const [stream, setStream] = useState(''), [progress, setProgress] = useState(''), [running, setRunning] = useState(false);
  const [error, setError] = useState(''), [files, setFiles] = useState<Attachment[]>([]), [inspecting, setInspecting] = useState<Attachment | null>(null);
  const [left, setLeft] = useState(true), [right, setRight] = useState(true), [history, setHistory] = useState(false);
  const [width, setWidth] = useState(440), [connectionId, setConnectionId] = useState(''), [dirty, setDirty] = useState(false);
  const [format, setFormat] = useState('docx'), [exportPath, setExportPath] = useState('');
  const [authCode, setAuthCode] = useState<{ id: string; code: string } | null>(null);
  const [plan, setPlan] = useState<(PlanStep & { state: string })[]>([]);
  const [view, setView] = useState<'chat' | 'receipt' | 'skills'>('chat');
  const [wizard, setWizard] = useState(false), [tour, setTour] = useState(false);
  const [skills, setSkills] = useState<SkillEntry[] | null>(null), [forcedSkill, setForcedSkill] = useState(''), [slashIndex, setSlashIndex] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]), toastId = useRef(0), runningId = useRef('');
  const dismiss = useCallback((id: number) => setToasts(list => list.filter(t => t.id !== id)), []);
  const notify = useCallback((text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => { if (text) setToasts(list => [...list.filter(t => t.text !== text), { id: ++toastId.current, text, tone, action }].slice(-4)); }, []);
  const [reasoning, setReasoning] = useState(''), [startedAt, setStartedAt] = useState(0), [now, setNow] = useState(Date.now());
  const [consentAsk, setConsentAsk] = useState<{ sessionId: string; text: string; attachments: string[]; skill?: string; token: string; first: boolean; flagged: boolean; labels: string[]; attachment: boolean } | null>(null);
  // Claude Pro/Max works only inside Anthropic's own apps, so that choice hands the request to the employee's Claude Code.
  const [handoffAsk, setHandoffAsk] = useState<{ text: string; skill?: string } | null>(null), [claudeCode, setClaudeCode] = useState<boolean | null>(null);
  const [removing, setRemoving] = useState<Session | null>(null), [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null), [palette, setPalette] = useState(false);
  const [pendingModel, setPendingModel] = useState<string | undefined>(undefined), [pendingEffort, setPendingEffort] = useState(''), modelsRequested = useRef(new Set<string>());
  const session = snapshot?.sessions.find(s => s.id === selected);
  const sessionRef = useRef<Session | undefined>(session); sessionRef.current = session;
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const currentId = useRef(selected); currentId.current = selected;
  const saveInFlight = useRef<Promise<void> | null>(null);
  const editor = useEditor({ extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false, strike: false, code: false, codeBlock: false, blockquote: false, horizontalRule: false })], content: toDoc(''), editorProps: { attributes: { 'aria-label': 'ร่างที่แก้ไขได้', class: 'draft-editor', spellcheck: 'false' } }, onUpdate: () => setDirty(true) });
  const refresh = useCallback(async () => { if (api) { const data = await api.call('snapshot'); setSnapshot(data); return data as Snapshot; } }, [api]);
  useEffect(() => { void refresh().then(s => { if (s) { setWizard(!s.settings.onboarding); setSelected(s.sessions[0]?.id || ''); setConnectionId(s.connections[0]?.id || ''); } }).catch(e => setError(explainError(e))); }, [refresh]);
  useEffect(() => { if (handoffAsk && claudeCode !== true) void api?.call('claudeCode').then((r: any) => setClaudeCode(r.installed)).catch(() => setClaudeCode(false)); }, [handoffAsk]);
  useEffect(() => api?.onEvent(event => {
    if (event.sessionId === currentId.current) {
      if (event.type === 'delta') setStream(s => (s + (event.text || '')).slice(-60000));
      if (event.type === 'reasoning') setReasoning(s => (s + (event.text || '')).slice(-20000));
      if (event.type === 'plan') setPlan((event.plan || []).map(step => ({ ...step, state: 'pending' })));
      if (event.type === 'step' && event.index !== undefined) setPlan(steps => steps.map((step, i) => i === event.index ? { ...step, state: event.state || step.state } : step));
      // Each step rewrites the whole draft, so a new step replaces the streamed text instead of appending to it.
      if (event.type === 'status') { setProgress(errorText[event.text || ''] || event.text || ''); setStream(''); setReasoning(''); }
    }
    if (event.type === 'changed') {
      setRunning(false); setStream(''); setReasoning(''); setPlan([]); setStartedAt(0);
      const finished = event.sessionId === runningId.current ? event.sessionId : ''; runningId.current = '';
      void refresh().then(data => {
        const done = finished && data?.sessions.find(s => s.id === finished); if (!done) return;
        const text = done.status === 'review' ? `“${done.title}” มีร่างให้ตรวจแล้ว` : done.status === 'waiting' ? `“${done.title}” รอข้อมูลเพิ่มจากคุณ` : done.status === 'error' ? `“${done.title}” ต้องตรวจสอบ` : '';
        if (!text) return;
        if (finished !== currentId.current) notify(text, done.status === 'error' ? 'error' : 'success', { label: 'เปิดงาน', run: () => selectSessionRef.current(finished) });
        if (!document.hasFocus() && typeof Notification !== 'undefined' && Notification.permission !== 'denied') try { new Notification('STeP Desktop', { body: text, silent: true }); } catch { /* Notifications are optional. */ }
      });
    }
    if (event.type === 'auth-code' && event.connectionId) setAuthCode({ id: event.connectionId, code: '' });
  }), [api, refresh]);
  useEffect(() => { if (!running) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [running]);
  useEffect(() => { const open = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); } }; window.addEventListener('keydown', open); return () => window.removeEventListener('keydown', open); }, []);
  useEffect(() => { void api?.call('skills').then(setSkills).catch(() => setSkills([])); }, [api]);
  useEffect(() => { document.documentElement.dataset.theme = snapshot?.settings.theme || 'system'; }, [snapshot?.settings.theme]);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, []);
  useEffect(() => { if (editor && !dirtyRef.current) editor.commands.setContent(session?.document || toDoc(session?.draft || ''), { emitUpdate: false }); }, [editor, selected, session?.revision]);
  const action = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { notify(explainError(e), 'error'); } };
  async function save() {
    if (saveInFlight.current) await saveInFlight.current;
    const current = sessionRef.current;
    if (current && editor && dirtyRef.current) {
      const document = editor.getJSON(), text = documentText(document as any);
      const serialized = JSON.stringify(document);
      const task = (async () => {
        const saved = await api!.call('edit', { id: current.id, text, document, revision: current.revision });
        sessionRef.current = saved;
        const changedAgain = JSON.stringify(editor.getJSON()) !== serialized;
        setDirty(changedAgain); dirtyRef.current = changedAgain; await refresh();
      })();
      saveInFlight.current = task; try { await task; } finally { saveInFlight.current = null; }
    }
  }
  const selectSessionRef = useRef<(id: string) => Promise<void>>(async () => {});
  async function selectSession(id: string) { await save(); setView('chat'); setSelected(id); setFiles([]); setStream(''); setProgress(''); setDirty(false); dirtyRef.current = false; setSettings(false); }
  selectSessionRef.current = selectSession;
  async function receiptHandoff(text: string) {
    if (connectionId === CLAUDE_CODE) { setView('chat'); setHandoffAsk({ text }); return; }
    if (!connectionId) { setSettings(true); notify('เพิ่มการเชื่อมต่อ AI เพื่อให้ AI pre-check ต่อ'); return; }
    await save(); const s = await api!.call('create', { connectionId, project: 'ตรวจใบเสร็จ AFP' });
    setView('chat'); setSelected(s.id); await refresh(); await start(s.id, text, []);
  }
  async function create() {
    if (connectionId === CLAUDE_CODE) { setSelected(''); setView('chat'); setSettings(false); return; }
    if (!connectionId) { setSettings(true); notify('เพิ่มการเชื่อมต่อ AI เพื่อเริ่มงาน'); return; }
    await save(); const s = await api!.call('create', { connectionId, project, model: pendingModel, effort: pendingEffort }); setPendingModel(undefined); setPendingEffort(''); await refresh(); await selectSession(s.id);
  }
  async function send() {
    if (!query.trim() || running) return;
    if (!selected && connectionId === CLAUDE_CODE) {
      const typed = /^\/([a-z0-9-]+)\s+([\s\S]+)$/.exec(query.trim()), typedSkill = typed && (skills || []).some(s => s.name === typed[1]) ? typed[1] : '';
      setHandoffAsk({ text: typedSkill ? typed![2] : query, skill: forcedSkill || typedSkill || undefined }); return;
    }
    await save(); let id = selected;
    if (!id) { if (!connectionId) { setSettings(true); return; } const s = await api!.call('create', { connectionId, project, model: pendingModel, effort: pendingEffort }); id = s.id; setPendingModel(undefined); setPendingEffort(''); setSelected(id); await refresh(); }
    const typed = /^\/([a-z0-9-]+)\s+([\s\S]+)$/.exec(query.trim());
    const typedSkill = typed && routedSkills.some(s => s.name === typed[1]) ? typed[1] : '';
    await start(id, typedSkill ? typed![2] : query, files.filter(f => f.usable).map(f => f.id), undefined, forcedSkill || typedSkill || undefined);
  }
  // The host answers with a consent request when this send needs one; the dialog replays the same payload with its token.
  async function start(id: string, text: string, attachments: string[], consent?: string, skill?: string) {
    const result = await api!.call('send', { id, text, attachments, consent, skill });
    if (result.consent) { setConsentAsk({ sessionId: id, text, attachments, skill, ...result.consent }); return; }
    if (result.started) { runningId.current = id; setForcedSkill(''); setRunning(true); setQuery(''); setFiles([]); setStream(''); setReasoning(''); setStartedAt(Date.now()); setNow(Date.now()); setProgress('กำลังเริ่มงาน'); await refresh(); }
  }
  const connection = snapshot?.connections.find(c => c.id === (session?.connectionId || connectionId));
  const currentModel = session ? session.model ?? connection?.model ?? '' : pendingModel ?? connection?.model ?? '';
  const defaultModel = connection?.models?.find(m => m.isDefault);
  const modelInfo = (id: string) => connection?.models?.find(m => m.id === id) || (!id ? defaultModel : undefined);
  const activeModel = modelInfo(currentModel), currentEffort = session ? session.effort || '' : pendingEffort;
  // Load the provider's model list once for ready connections that have never fetched it.
  useEffect(() => {
    if (!api || !connection?.ready || connection.modelsAt || modelsRequested.current.has(connection.id)) return;
    modelsRequested.current.add(connection.id);
    void api.call('models', { id: connection.id }).then(() => refresh()).catch(() => {});
  }, [api, connection?.id, connection?.ready, connection?.modelsAt, refresh]);
  // A task can move to another AI between runs, for example when its connection was removed or stopped working.
  async function chooseConnection(id: string) {
    if (!session) { setConnectionId(id); return; }
    if (!id || id === CLAUDE_CODE) return;
    await api!.call('sessionConnection', { id: session.id, connectionId: id }); await refresh();
  }
  const readyConnection = snapshot?.connections.find(c => c.ready);
  async function chooseModel(model: string, effort?: string) {
    // Keep the chosen effort only if the new model supports it.
    const next = effort ?? (modelInfo(model)?.efforts?.some(e => e.id === currentEffort) ? currentEffort : '');
    if (!session) { setPendingModel(model); setPendingEffort(next); return; }
    await api!.call('model', { id: session.id, model, effort: next }); await refresh();
  }
  const routedSkills = (skills || []).filter(s => s.status === 'routed');
  const slash = /^\/([a-z0-9-]*)$/.exec(query);
  const slashMatches = slash ? routedSkills.filter(s => s.name.includes(slash[1]) || s.title.toLowerCase().includes(slash[1])).sort((a, b) => Number(!a.name.startsWith(slash[1])) - Number(!b.name.startsWith(slash[1]))).slice(0, 8) : [];
  const useSkill = (name: string) => { setForcedSkill(name); setQuery(''); setSlashIndex(0); setSettings(false); setView('chat'); setTimeout(() => composerRef.current?.focus(), 0); };
  const forced = routedSkills.find(s => s.name === forcedSkill);
  const filtered = snapshot?.sessions.filter(s => matchesSession(s, search) && (filter !== 'projects' || s.project) && (filter !== 'artifacts' || s.draft)) || [];
  const providerName = (c?: Connection) => c ? (c.provider === 'openai' ? 'OpenAI' : c.provider === 'claude' ? 'Claude' : 'Gemini') : '';
  const setTheme = (theme: string) => action(async () => { await api!.call('settings', { assistant: snapshot!.settings.assistant, team: snapshot!.settings.team, theme }); await refresh(); });
  const paletteItems: PaletteItem[] = snapshot ? [
    { id: 'new', group: 'คำสั่ง', label: 'เริ่มงานใหม่', run: () => action(create) },
    { id: 'settings', group: 'คำสั่ง', label: 'ตั้งค่าพื้นที่ทำงาน', run: () => setSettings(true) },
    { id: 'tour', group: 'คำสั่ง', label: 'ดูทัวร์แนะนำอีกครั้ง', run: () => { setSettings(false); setView('chat'); setTour(true); } },
    { id: 'wizard', group: 'คำสั่ง', label: 'เปิดตัวช่วยตั้งค่าเริ่มต้น', run: () => setWizard(true) },
    { id: 'left', group: 'คำสั่ง', label: left ? 'ซ่อนแถบงาน' : 'แสดงแถบงาน', run: () => setLeft(!left) },
    { id: 'right', group: 'คำสั่ง', label: right ? 'ซ่อนร่าง' : 'เปิดร่าง', run: () => setRight(!right) },
    ...(['system', 'light', 'dark'] as const).map(theme => ({ id: 'theme-' + theme, group: 'ธีม', label: theme === 'system' ? 'ธีมตามระบบ' : theme === 'light' ? 'ธีมสว่าง' : 'ธีมมืด', run: () => setTheme(theme) })),
    { id: 'skills', group: 'เครื่องมือ', label: 'ศูนย์รวม Skill', run: () => { setSettings(false); setView('skills'); } },
    { id: 'receipt', group: 'เครื่องมือ', label: 'ตรวจใบเสร็จก่อนส่ง AFP', hint: 'ทดลอง', run: () => { setSettings(false); setView('receipt'); } },
    ...routedSkills.map(s => ({ id: 'skill-' + s.name, group: 'Skill', label: 'ใช้ Skill: ' + s.title, hint: '/' + s.name, run: () => useSkill(s.name) })),
    ...(connection?.models || []).map(m => ({ id: 'model-' + m.id, group: 'โมเดล', label: 'ใช้ ' + m.label, hint: m.id === currentModel ? 'ใช้อยู่' : providerName(connection), run: () => action(() => chooseModel(m.id)) })),
    ...[...snapshot.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50).map(s => ({ id: 'session-' + s.id, group: 'งาน', label: s.title, hint: s.project || statusText[s.status], run: () => action(() => selectSession(s.id)) })),
  ] : [];
  const elapsed = running && startedAt ? formatElapsed(now - startedAt) : '';
  if (!api) return <main className="browser-message"><Sparkles size={36}/><h1>STeP Desktop</h1><p>พื้นที่ทำงานนี้ใช้ผ่านแอป Desktop เพื่อเชื่อมต่อ AI และจัดเก็บไฟล์ในเครื่อง</p><p>หน้านี้เป็นการเปิด UI ในเบราว์เซอร์ จึงยังใช้บัญชีหรือไฟล์จริงไม่ได้</p></main>;
  if (!snapshot) return <main className="browser-message"><img className="illustration empty-art" src={ideaArt} alt=""/><LoaderCircle className="spin"/><p>{error || 'กำลังเปิดพื้นที่ทำงาน…'}</p></main>;
  return <div className="app" style={{ '--artifact-width': `${width}px` } as React.CSSProperties}>
    {left && <aside className="sidebar">
      <div className="brand"><div><span className="brand-symbol" role="img" aria-label="STeP"><img className="on-light" src={symbolColour} alt=""/><img className="on-dark" src={symbolWhite} alt=""/></span><span className="brand-tagline">MAKE INNOVATION SIMPLE</span></div><button className="icon" title="ซ่อนแถบงาน" onClick={() => setLeft(false)}><PanelLeftClose size={17}/></button></div>
      <button className="new-work" data-tour="new-work" onClick={() => void action(create)}><Plus size={18}/> เริ่มงานใหม่</button>
      <label className="search"><Search size={16}/><input placeholder="ค้นหางานหรือเนื้อหา" value={search} onChange={e => setSearch(e.target.value)}/><button className="icon palette-hint" aria-label="เปิดคำสั่ง" onClick={() => setPalette(true)}>{shortcut}</button></label>
      <nav>{([['all', 'งานล่าสุด', MessageSquare], ['projects', 'โครงการ', FolderOpen], ['artifacts', 'ผลงาน', FileText]] as const).map(([value, label, Icon]) => <button key={value} className={filter === value && view === 'chat' && !settings ? 'nav-active' : ''} onClick={() => { setFilter(value); setSettings(false); setView('chat'); }}><Icon size={17}/>{label}</button>)}</nav>
      {filter !== 'all' && <div className="recent-label">{filter === 'projects' ? 'งานที่จัดในโครงการ' : 'ร่างที่บันทึกแล้ว'}</div>}
      <div className="sessions">{groupSessions(filtered).map(group => <section key={group.label} aria-label={group.label}><div className="session-group">{group.label}</div>{group.sessions.map(s => renaming?.id === s.id
        ? <input key={s.id} className="session-rename" aria-label="ชื่องาน" autoFocus value={renaming.title} onChange={e => setRenaming({ ...renaming, title: e.target.value })} onBlur={() => setRenaming(null)} onKeyDown={e => { if (e.key === 'Escape') setRenaming(null); if (e.key === 'Enter' && renaming.title.trim()) void action(async () => { await api.call('rename', renaming); setRenaming(null); await refresh(); }); }}/>
        : <div key={s.id} className={`session ${selected === s.id ? 'selected' : ''}`}><button className="session-open" onClick={() => void action(() => selectSession(s.id))}><span>{s.title}</span><small>{s.project || s.team.toUpperCase() || 'ทุกทีม'} · {statusText[s.status] || s.status}</small></button>
          <span className="session-actions"><button className="icon" aria-label={s.pinned ? 'เลิกปักหมุด' : 'ปักหมุด'} onClick={() => void action(async () => { await api.call('pin', { id: s.id, pinned: !s.pinned }); await refresh(); })}>{s.pinned ? <PinOff size={14}/> : <Pin size={14}/>}</button><button className="icon" aria-label="เปลี่ยนชื่อ" onClick={() => setRenaming({ id: s.id, title: s.title })}><Pencil size={14}/></button><button className="icon" aria-label="ลบงาน" disabled={running && selected === s.id} onClick={() => setRemoving(s)}><Trash2 size={14}/></button></span></div>)}</section>)}
        {!filtered.length && <p className="muted small">{search ? 'ไม่พบงานที่ตรงกับคำค้น' : 'เมื่อเริ่มงาน บทสนทนาจะอยู่ที่นี่'}</p>}</div>
      <div className="session-group tools-group">เครื่องมือ</div>
      <nav><button data-tour="skills" className={view === 'skills' && !settings ? 'nav-active' : ''} onClick={() => { setSettings(false); setView('skills'); }}><Blocks size={17}/>ศูนย์รวม Skill<span className="count">{skills ? skills.length : ''}</span></button><button data-tour="tools" className={view === 'receipt' && !settings ? 'nav-active' : ''} onClick={() => { setSettings(false); setView('receipt'); }}><ReceiptText size={17}/>ตรวจใบเสร็จ AFP<span className="beta">ทดลอง</span></button></nav>
      <button className={`settings-button ${settings ? 'nav-active' : ''}`} onClick={() => setSettings(true)}><Settings2 size={18}/><span>ตั้งค่าพื้นที่ทำงาน</span></button>
      <div className="profile"><span>{initial(snapshot.settings.userName || '') || snapshot.settings.team.toUpperCase() || 'ST'}</span><div>{snapshot.settings.userName || snapshot.settings.assistant}<small>{snapshot.settings.userName ? `ผู้ช่วย ${snapshot.settings.assistant} · ` : ''}{snapshot.settings.team ? `ทีม ${snapshot.settings.team.toUpperCase()}` : 'ยังไม่เลือกทีม'}</small></div></div>
    </aside>}
    <main className="main-pane">
      <header className="topbar">{!left && <button className="icon" title="แสดงแถบงาน" onClick={() => setLeft(true)}><PanelLeftClose size={18}/></button>}<div><strong>{settings ? 'ตั้งค่าพื้นที่ทำงาน' : view === 'receipt' ? 'ตรวจใบเสร็จก่อนส่ง AFP' : view === 'skills' ? 'ศูนย์รวม Skill' : session?.title || 'เริ่มต้นงานที่อยากทำ'}</strong><small>{settings ? 'บัญชี AI และข้อมูลอยู่ในเครื่องนี้' : view === 'receipt' ? 'ทดลอง · อ่านด้วย OCR ในเครื่อง ไม่ส่งเอกสารขึ้น cloud' : view === 'skills' ? 'Skill ในพื้นที่ทำงานนี้ พร้อมสถานะ Manifest และ Routing' : session?.project || 'จากคำขอ สู่ผลงานที่ใช้ต่อได้'}</small></div>{!settings && view === 'chat' && <button className="quiet" onClick={() => setRight(!right)}><FileText size={16}/>{right ? 'ซ่อนร่าง' : 'เปิดร่าง'}</button>}</header>
      {settings ? <SettingsPanel snapshot={snapshot} call={api.call} refresh={refresh} openWizard={() => setWizard(true)} openTour={() => { setSettings(false); setView('chat'); setTour(true); }} close={() => setSettings(false)} onError={e => notify(explainError(e), 'error')}/> : view === 'receipt' ? <ReceiptApp call={api.call} notify={notify} onError={e => notify(explainError(e), 'error')} handoff={text => action(() => receiptHandoff(text))}/> : view === 'skills' ? <SkillsHub skills={skills} onUse={useSkill} onOpenTool={() => setView('receipt')}/> : <>
        <div className="conversation" aria-live="polite">
          {!session?.messages.length && <div className="welcome"><img className="illustration welcome-art" src={launchArt} alt=""/>{snapshot.settings.userName && <p className="greet">สวัสดีครับ คุณ{snapshot.settings.userName}</p>}<h1>วันนี้อยากให้ช่วย<br/>เรื่องอะไรครับ</h1><p>เริ่มจากสิ่งที่ต้องทำ ผมจะช่วยจัดข้อมูล<br/>และเตรียมร่างให้คุณตรวจแก้ไปด้วยกัน</p><div className="suggestions">{['ช่วยจัดทำบรีฟงานประชาสัมพันธ์', 'ช่วยสรุปบันทึกประชุมเป็นรายการงาน', 'ช่วยวางโครงสไลด์นำเสนอโครงการ'].map(text => <button key={text} onClick={() => setQuery(text)}><FileText size={16}/><span>{text}</span><ChevronLeft className="point-right" size={15}/></button>)}</div></div>}
          {session?.messages.map((message, index) => <article key={index} className={`message ${message.role}`}><div className="message-author">{message.role === 'user' ? 'คุณ' : message.role === 'status' ? 'สถานะงาน' : snapshot.settings.assistant}</div>{message.role === 'assistant' ? <RichText className="message-body" text={message.text}/> : <div className="message-body">{message.role === 'status' ? errorText[message.text] || message.text : message.text}</div>}</article>)}
          {running && <article className="message assistant"><div className="activity"><LoaderCircle className="spin" size={15}/>{progress || 'กำลังทำงาน'}</div>{plan.length > 1 && <ol className="plan-card" aria-label="ขั้นตอนของงาน">{plan.map((step, i) => <li key={i} className={step.state}>{step.state === 'running' ? <LoaderCircle size={14} className="spin"/> : step.state === 'done' ? <Check size={14}/> : step.action ? <ShieldCheck size={14}/> : <Circle size={14}/>}<span>{step.label}{step.action && <small> · ต้องทำโดยผู้มีอำนาจ</small>}</span></li>)}</ol>}{reasoning && <details className="thinking"><summary><Brain size={14}/>ความคิดของ AI</summary><div>{reasoning}</div></details>}{stream && <RichText className="message-body streaming" text={stream}/>}</article>}
          {!running && progress && <p className="muted small">{progress}</p>}
        </div>
        <div className="composer-area"><div className="composer" data-tour="composer">
          {files.length > 0 && <div className="attachments">{files.map(f => <span key={f.id}><button onClick={() => setInspecting(f)}><Paperclip size={13}/>{f.name}</button><button title="นำไฟล์ออก" onClick={() => setFiles(files.filter(x => x.id !== f.id))}><X size={13}/></button></span>)}</div>}
          {session && !running && !connection?.ready && <div className="connection-warning" role="status"><Sparkles size={14}/><span>{connection ? `${providerName(connection)} ของงานนี้ยังไม่พร้อม` : 'งานนี้ยังไม่ได้เลือก AI'}</span>{readyConnection && readyConnection.id !== session.connectionId ? <button className="quiet" onClick={() => void action(() => chooseConnection(readyConnection.id))}>เปลี่ยนเป็น {providerName(readyConnection)}</button> : <button className="quiet" onClick={() => setSettings(true)}>ไปที่การเชื่อมต่อ AI</button>}</div>}
          {forced && <div className="skill-chip"><Blocks size={13}/>ใช้ Skill: <strong>{forced.title}</strong><code>/{forced.name}</code><button className="icon" aria-label="เลิกใช้ Skill นี้" onClick={() => setForcedSkill('')}><X size={13}/></button></div>}
          {slashMatches.length > 0 && <div className="slash-menu" role="listbox" aria-label="เลือก Skill">{slashMatches.map((s, i) => <button key={s.name} role="option" aria-selected={i === slashIndex} className={i === slashIndex ? 'active' : ''} onMouseDown={e => { e.preventDefault(); useSkill(s.name); }}><code>/{s.name}</code><span>{s.title}</span></button>)}</div>}
          <textarea ref={composerRef} aria-label="พิมพ์คำขอ" placeholder={forced ? `บอกงานสำหรับ ${forced.title}…` : 'พิมพ์สิ่งที่อยากให้ช่วย… หรือพิมพ์ / เพื่อเลือก Skill'} value={query} onChange={e => { setQuery(e.target.value); setSlashIndex(0); }} onKeyDown={e => {
            if (slashMatches.length && ['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
              e.preventDefault();
              if (e.key === 'ArrowDown') setSlashIndex(i => Math.min(i + 1, slashMatches.length - 1));
              else if (e.key === 'ArrowUp') setSlashIndex(i => Math.max(i - 1, 0));
              else if (e.key === 'Escape') setQuery('');
              else useSkill(slashMatches[slashIndex]?.name || slashMatches[0].name);
              return;
            }
            if (e.key === 'Backspace' && !query && forcedSkill) { setForcedSkill(''); return; }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void action(send); }
          }}/>
          <div className="composer-tools"><button className="icon" title="ตรวจและแนบเอกสาร" disabled={!session || running} onClick={() => void action(async () => { const f = await api.call('attach', { id: selected }); if (f) { setFiles([f]); setInspecting(f); } })}><Paperclip size={18}/></button><select aria-label="เลือกการเชื่อมต่อ AI" value={session ? session.connectionId : connectionId} disabled={running} onChange={e => void action(() => chooseConnection(e.target.value))}><option value="">เลือก AI</option>{snapshot.connections.map(c => <option key={c.id} value={c.id}>{c.provider === 'openai' ? 'OpenAI' : c.provider === 'claude' ? 'Claude' : 'Gemini'} · {c.mode === 'api' ? 'API' : 'บัญชีส่วนตัว'}{c.ready ? '' : ' · ยังไม่พร้อม'}</option>)}{!session && <option value={CLAUDE_CODE}>Claude · Pro/Max (เปิดใน Claude Code)</option>}</select>{connection && <select aria-label="เลือกโมเดล" data-tour="model" className="model-select" title={connection.models?.find(m => m.id === currentModel)?.description || 'โมเดลที่ใช้กับงานนี้ เปลี่ยนได้ทุกเมื่อ'} value={currentModel} disabled={running} onChange={e => void action(() => chooseModel(e.target.value))}><option value="">{defaultModel ? `ค่าเริ่มต้น (${defaultModel.label})` : 'ค่าเริ่มต้นของบริการ'}</option>{(connection.models || []).map(m => <option key={m.id} value={m.id} title={m.description}>{m.label}</option>)}{currentModel && !connection.models?.some(m => m.id === currentModel) && <option value={currentModel}>{currentModel}</option>}</select>}{activeModel?.efforts?.length ? <select aria-label="เลือกระดับการคิด" className="model-select" title={activeModel.efforts.find(e => e.id === currentEffort)?.description || 'ระดับการคิด (reasoning) ยิ่งสูงยิ่งละเอียดแต่ช้าและใช้โควตามากขึ้น'} value={currentEffort} disabled={running} onChange={e => void action(() => chooseModel(currentModel, e.target.value))}><option value="">{activeModel.defaultEffort ? `Reasoning: ค่าเริ่มต้น (${effortLabel[activeModel.defaultEffort] || activeModel.defaultEffort})` : 'Reasoning: ค่าเริ่มต้น'}</option>{activeModel.efforts.map(e => <option key={e.id} value={e.id} title={e.description}>Reasoning: {effortLabel[e.id] || e.id}</option>)}</select> : null}<span className="spacer"/>{running ? <button className="send stop" title="หยุดงาน" onClick={() => void api.call('cancel', { id: selected })}><Square size={17}/></button> : <button className="send" title="ส่งคำขอ (Enter) · ขึ้นบรรทัดใหม่ (Shift+Enter)" disabled={!query.trim() || !(connection?.ready || (!session && connectionId === CLAUDE_CODE))} onClick={() => void action(send)}><ArrowUp size={20}/></button>}</div>
        </div><div className="composer-note">ตรวจข้อมูลและร่างก่อนนำไปใช้ · ประวัติเก็บในเครื่อง</div>{!connection?.ready && <button className="text-link" onClick={() => setSettings(true)}>เชื่อมต่อ AI เพื่อเริ่มทำงาน</button>}</div>
      </>}
      <footer className="statusbar" aria-label="สถานะ">
        <span className={`status-dot ${connection?.ready ? 'ok' : ''}`} aria-hidden="true"/>
        <span>{connection ? `${providerName(connection)} · ${connection.ready ? 'พร้อมทำงาน' : 'ยังไม่พร้อม'}` : 'ยังไม่เชื่อมต่อ AI'}</span>
        {elapsed && <span className="status-item"><Timer size={12}/>{elapsed}</span>}
        <span className="spacer"/>
        {session?.usage && <span className="status-item" title={`ส่งเข้า ${session.usage.input.toLocaleString('th-TH')} · ตอบกลับ ${session.usage.output.toLocaleString('th-TH')} token จาก ${session.usage.runs} รอบ`}>{formatTokens(session.usage.total)} token</span>}
        {connection && <span className="status-item">{activeModel?.label || currentModel || 'โมเดลค่าเริ่มต้น'}{currentEffort ? ` · ${effortLabel[currentEffort] || currentEffort}` : ''}</span>}
        <button className="status-item status-button" data-tour="palette" onClick={() => setPalette(true)}><Command size={12}/>คำสั่ง {shortcut}</button>
      </footer>
    </main>
    {right && !settings && view === 'chat' && <><div className="resize-handle" role="separator" aria-label="ปรับความกว้างร่าง" tabIndex={0} onKeyDown={e => { if (e.key === 'ArrowLeft') setWidth(w => Math.min(w + 20, 700)); if (e.key === 'ArrowRight') setWidth(w => Math.max(w - 20, 300)); }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(Math.min(700, Math.max(300, window.innerWidth - e.clientX))); }}/><aside className="artifact-pane" data-tour="artifact">
      <header className="artifact-header"><FileText size={18}/><strong>ผลงาน</strong><span className="spacer"/><button className="icon" title="ประวัติเวอร์ชัน" onClick={() => setHistory(!history)}><History size={17}/></button><button className="icon" title="ซ่อนร่าง" onClick={() => setRight(false)}><PanelRightClose size={17}/></button></header>
      {!session ? <div className="artifact-empty"><img className="illustration empty-art" src={draftingArt} alt=""/><h2>พื้นที่สำหรับร่างของคุณ</h2><p>เมื่อ AI จัดทำร่างแล้ว<br/>คุณจะตรวจและแก้ไขได้ตรงนี้</p></div> : <>
        <div className="draft-title"><span>{session.title}</span><small>เวอร์ชัน {session.revision}{dirty ? ' · มีการแก้ไขที่ยังไม่บันทึก' : ' · บันทึกแล้ว'}</small></div>
        {history && <div className="version-list">{session.versions.length ? session.versions.slice().reverse().map(v => <button key={v.revision} disabled={dirty} onClick={() => void action(async () => { await api.call('restore', { id: selected, revision: v.revision }); await refresh(); })}>คืนค่าเวอร์ชัน {v.revision} <small>{new Date(v.at).toLocaleString('th-TH')}</small></button>) : <p>ยังไม่มีเวอร์ชันก่อนหน้า</p>}</div>}
        {session.proposals.map(p => <section className="proposal" key={p.id}><div><Sparkles size={16}/><strong>ข้อเสนอจาก AI</strong></div><p className="small muted">{p.baseRevision === session.revision ? 'ตรวจร่างนี้ก่อนแทนที่ร่างปัจจุบัน' : 'ร่างปัจจุบันเปลี่ยนแล้ว ข้อเสนอนี้ถูกเก็บแยกไว้'}</p><details><summary>อ่านข้อเสนอและเทียบกับร่างด้านล่าง</summary><RichText className="proposal-text" text={p.text}/></details><div className="proposal-actions"><button disabled={dirty || p.baseRevision !== session.revision} onClick={() => void action(async () => { await api.call('accept', { id: selected, proposalId: p.id }); await refresh(); })}><Check size={15}/>ใช้ร่างนี้</button><button className="quiet" onClick={() => void action(async () => { await api.call('reject', { id: selected, proposalId: p.id }); await refresh(); })}>ไม่ใช้</button></div></section>)}
        <div className="format-toolbar" role="toolbar" aria-label="จัดรูปแบบร่าง">
          <button className="quiet" onClick={() => editor?.chain().focus().setParagraph().run()}>ข้อความ</button>
          <button className="quiet" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>หัวข้อ</button>
          <button className="quiet" onClick={() => editor?.chain().focus().toggleBold().run()}>ตัวหนา</button>
          <button className="quiet" onClick={() => editor?.chain().focus().toggleItalic().run()}>ตัวเอียง</button>
          <button className="quiet" onClick={() => editor?.chain().focus().toggleBulletList().run()}>รายการ</button>
          <button className="quiet" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>ลำดับ</button>
        </div><div className="editor-scroll"><EditorContent editor={editor}/></div>
        <details className="sources"><summary>แหล่งอ้างอิงที่ใช้ ({session.sources.length})</summary>{session.sources.map(path => <p key={path}>{path}</p>)}</details>
        <footer className="artifact-footer"><button className="quiet" disabled={!dirty} onClick={() => void action(save)}><Save size={16}/>บันทึก</button><select aria-label="รูปแบบส่งออก" value={format} onChange={e => setFormat(e.target.value)}>{['docx', 'pdf', 'md', 'xlsx', 'pptx'].map(f => <option key={f}>{f}</option>)}</select><button disabled={!session.draft && !dirty} onClick={() => void action(async () => { await save(); const output = await api.call('export', { id: selected, format }); setExportPath(output.path); notify(`บันทึก ${output.filename} แล้ว`, 'success', { label: 'เปิดโฟลเดอร์', run: () => api.call('reveal', { path: output.path }) }); })}><Download size={16}/>ส่งออก</button></footer>
        {exportPath && <button className="text-link" onClick={() => void api.call('reveal', { path: exportPath })}>เปิดโฟลเดอร์ไฟล์ล่าสุด</button>}
      </>}
    </aside></>}
    {consentAsk && <ConfirmDialog title={consentAsk.flagged ? 'ตรวจข้อความก่อนส่งให้ AI' : 'ยืนยันการส่งข้อมูลให้ AI'} confirmLabel="มีสิทธิ์ส่งข้อมูลนี้" onCancel={() => setConsentAsk(null)} onConfirm={async () => { const ask = consentAsk; setConsentAsk(null); await action(() => start(ask.sessionId, ask.text, ask.attachments, ask.token, ask.skill)); }}>
      {consentAsk.flagged && <p className="confirm-warning"><ShieldCheck size={16}/>ระบบพบสิ่งที่ควรตรวจ: {consentAsk.labels.join(', ')}</p>}
      <p>คำขอ{consentAsk.attachment ? ' ข้อความที่ตรวจแล้วจากไฟล์แนบ' : ''} ร่าง และบทสนทนาที่เกี่ยวข้องจะส่งให้ {providerName(snapshot.connections.find(c => c.id === snapshot.sessions.find(x => x.id === consentAsk.sessionId)?.connectionId) || connection)}</p>
      <p className="small muted">ยืนยันเฉพาะข้อมูลที่คุณมีสิทธิ์ส่งผ่านบริการนี้ ผลสแกนไม่ใช่การอนุญาตจากองค์กร ระบบปิดบังเลขบัตร เบอร์โทร และอีเมลที่ตรวจพบ และไม่ส่งไฟล์ต้นฉบับ{consentAsk.first && !consentAsk.flagged && !consentAsk.attachment ? ' งานนี้จะไม่ถามซ้ำ เว้นแต่มีไฟล์แนบหรือพบข้อมูลที่ควรตรวจ' : ''}</p>
    </ConfirmDialog>}
    {handoffAsk && (claudeCode === false
      ? <ConfirmDialog title="ยังไม่พบ Claude Code" confirmLabel="เปิดวิธีติดตั้ง" cancelLabel="ปิด" onCancel={() => setHandoffAsk(null)} onConfirm={async () => { await api.call('openHelp', { topic: 'claudeCode' }); setHandoffAsk(null); }}>
        <p>ใช้ Claude แบบ Pro/Max ได้ผ่าน Claude Code ของ Anthropic ที่ติดตั้งในเครื่องนี้ ติดตั้งแล้วเปิด Claude Code หนึ่งครั้งเพื่อลงชื่อเข้าใช้บัญชี Claude ของคุณ แล้วกลับมาส่งใหม่</p>
        <p className="small muted">STeP Desktop ลงชื่อเข้าใช้ Claude แทนคุณไม่ได้ เพราะเงื่อนไขของ Anthropic อนุญาตให้ใช้บัญชี Pro/Max ในแอปของ Anthropic เท่านั้น</p>
      </ConfirmDialog>
      : <ConfirmDialog title="ส่งต่อไปทำใน Claude Code" confirmLabel="คัดลอกและเปิด Claude Code" onCancel={() => setHandoffAsk(null)} onConfirm={async () => {
          try { await api.call('handoff', handoffAsk); } catch (e) { throw new Error(explainError(e)); }
          setHandoffAsk(null); setQuery(''); setForcedSkill('');
          notify('คัดลอกคำขอแล้ว วางในหน้าต่าง Claude Code (Ctrl+V หรือ ⌘V) แล้วกด Enter', 'success');
        }}>
        <p>แอปจะคัดลอกคำขอ{handoffAsk.skill ? ' พร้อมตำแหน่งไฟล์ Skill' : ''} แล้วเปิด Claude Code ในโฟลเดอร์งาน คุณวางคำขอและทำงานต่อในหน้าต่างนั้นด้วยบัญชี Claude ของคุณเอง</p>
        <p className="small muted">คำตอบจะอยู่ใน Claude Code ไม่กลับมาที่แอปนี้ ระบบปิดบังเลขบัตร เบอร์โทร และอีเมลที่ตรวจพบก่อนคัดลอก ส่งเฉพาะข้อมูลที่คุณมีสิทธิ์ใช้กับ Claude</p>
      </ConfirmDialog>)}
    {removing && <ConfirmDialog title="ลบงานนี้?" tone="danger" confirmLabel="ลบงาน" onCancel={() => setRemoving(null)} onConfirm={async () => { await api.call('remove', { id: removing.id }); if (selected === removing.id) { setSelected(''); setDirty(false); dirtyRef.current = false; } setRemoving(null); await refresh(); }}>
      <p>“{removing.title}” พร้อมบทสนทนา ร่าง และประวัติเวอร์ชันจะถูกลบออกจากเครื่องนี้ และกู้คืนไม่ได้ ไฟล์ที่ส่งออกไว้แล้วในโฟลเดอร์ผลงานยังอยู่</p>
    </ConfirmDialog>}
    {palette && <CommandPalette items={paletteItems} onClose={() => setPalette(false)}/>}
    {wizard && <SetupWizard snapshot={snapshot} call={api.call} refresh={refresh} onError={e => notify(explainError(e), 'error')} onDone={startTour => { setWizard(false); setSettings(false); setView('chat'); if (startTour) setTour(true); }}/>}
    {tour && <Tour onClose={() => { setTour(false); void api.call('tour', { done: true }).then(refresh); }}/>}
    <Toasts toasts={toasts} dismiss={dismiss}/>
    {authCode && <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="ลงชื่อเข้าใช้ Google" className="attachment-dialog"><header><h2>ลงชื่อเข้าใช้ Gemini ด้วยบัญชี Google</h2></header><p>แอปเปิดหน้าลงชื่อเข้าใช้ของ Google ในเบราว์เซอร์แล้ว เมื่อลงชื่อและกดอนุญาต Google จะแสดง authorization code ให้คัดลอกมาวางที่นี่</p><label className="auth-code">Authorization code<input autoFocus autoComplete="off" spellCheck={false} value={authCode.code} onChange={e => setAuthCode({ ...authCode, code: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && authCode.code.trim()) { e.preventDefault(); void action(async () => { await api.call('authCode', authCode); setAuthCode(null); }); } }}/></label><div className="proposal-actions"><button disabled={!authCode.code.trim()} onClick={() => void action(async () => { await api.call('authCode', authCode); setAuthCode(null); })}><Check size={15}/>ยืนยัน</button><button className="quiet" onClick={() => void action(async () => { const id = authCode.id; setAuthCode(null); await api.call('authCode', { id, code: '' }); })}>ยกเลิก</button></div></section></div>}
    {inspecting && <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="ตรวจข้อความแนบ" className="attachment-dialog"><header><h2>{inspecting.name}</h2><button className="icon" autoFocus onClick={() => setInspecting(null)} title="ปิด"><X/></button></header><p>{inspecting.status}</p><p className="small muted">ตรวจเฉพาะข้อความที่อ่านได้ ไม่ตรวจรูปภาพหรือรับรองสิทธิ์ส่งข้อมูล ไฟล์ต้นฉบับไม่ถูกส่ง</p><pre>{inspecting.preview || 'ไม่สามารถเตรียมข้อความที่ตรวจแล้วได้ กรุณาใช้สำเนาที่ปิดบังข้อมูลและตรวจทานก่อน'}</pre><button onClick={() => setInspecting(null)}>กลับไปที่งาน</button></section></div>}
  </div>;
}

function SettingsPanel({ snapshot, call, refresh, close, onError, openWizard, openTour }: { openWizard: () => void; openTour: () => void; snapshot: Snapshot; call: (method: string, input?: any) => Promise<any>; refresh: () => Promise<Snapshot | undefined>; close: () => void; onError: (error: unknown) => void }) {
  const [assistant, setAssistant] = useState(snapshot.settings.assistant), [team, setTeam] = useState(snapshot.settings.team), [theme, setTheme] = useState(snapshot.settings.theme);
  const [userName, setUserName] = useState(snapshot.settings.userName || ''), [personality, setPersonality] = useState(snapshot.settings.personality || 'coworker'), [assistantTone, setAssistantTone] = useState(snapshot.settings.assistantTone || '');
  const [provider, setProvider] = useState('openai'), [mode, setMode] = useState('subscription'), [key, setKey] = useState('');
  const [busy, setBusy] = useState(''), [progress, setProgress] = useState<Record<string, string>>({}), [removingConnection, setRemovingConnection] = useState<Connection | null>(null);
  useEffect(() => window.step?.onEvent(event => { if (event.type === 'connect-progress' && event.connectionId) setProgress(p => ({ ...p, [event.connectionId!]: event.text || '' })); }), []);
  // New users land on AI connections when none exist; otherwise on general settings.
  const [page, setPage] = useState<'general' | 'ai' | 'appearance' | 'privacy'>(snapshot.settings.onboarding && !snapshot.connections.length ? 'ai' : 'general');
  const run = async (id: string, fn: () => Promise<unknown>) => { setBusy(id); try { await fn(); await refresh(); } catch (e) { onError(e); } finally { setBusy(''); } };
  const pages = [['general', 'ทั่วไป', Settings2], ['ai', 'การเชื่อมต่อ AI', Sparkles], ['appearance', 'รูปลักษณ์', Sun], ['privacy', 'ความเป็นส่วนตัว', ShieldCheck]] as const;
  return <div className="settings-content"><div className="settings-hero"><div><h1>พร้อมทำงาน ในแบบของคุณ</h1><p className="muted">ตั้งค่าเพียงครั้งแรก แล้วเริ่มงานได้จากบทสนทนา</p></div><img className="illustration settings-art" src={teamworkArt} alt=""/></div>
    <div className="settings-tabs" role="tablist" aria-label="หมวดการตั้งค่า">{pages.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={page === id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={15}/>{label}{id === 'ai' && !snapshot.connections.some(c => c.ready) && <span className="tab-dot" aria-label="ยังไม่พร้อม"/>}</button>)}</div>
    {page === 'general' && <section><h2>ผู้ช่วยและทีม</h2><div className="form-grid"><label>ชื่อเรียกของคุณ<input value={userName} maxLength={60} placeholder="เช่น ต้น" onChange={e => setUserName(e.target.value)}/></label><label>ชื่อผู้ช่วย<input value={assistant} onChange={e => setAssistant(e.target.value)}/></label><label>วิธีพูดคุย<select value={personality} onChange={e => setPersonality(e.target.value as any)}><option value="coworker">เพื่อนร่วมงาน · เป็นกันเอง สุภาพ</option><option value="professional">มืออาชีพ · มีโครงสร้าง ชัดเจน</option><option value="concise">กระชับ · สั้น ตรงประเด็น</option><option value="custom">กำหนดเอง</option></select></label>{personality === 'custom' ? <label>สไตล์ที่ต้องการ<input value={assistantTone} maxLength={300} placeholder="เช่น ตอบเป็นข้อ ๆ และสรุปสิ่งที่ต้องทำท้ายคำตอบ" onChange={e => setAssistantTone(e.target.value)}/></label> : <span/>}<label>ทีมหลัก<select value={team} onChange={e => setTeam(e.target.value)}><option value="">ยังไม่แน่ใจ · เลือกภายหลัง</option>{snapshot.teams.map(t => <option key={t.id} value={t.id}>{t.id.toUpperCase()} · {t.name}</option>)}</select></label></div><label>โฟลเดอร์เก็บผลงาน</label><div className="folder-row"><span>{snapshot.settings.workspace || 'ยังไม่เลือกโฟลเดอร์'}</span><button className="quiet" onClick={() => void run('workspace', () => call('workspace'))}><FolderOpen size={16}/>เลือกโฟลเดอร์</button></div><p className="small muted">ไฟล์ที่ส่งออกจะตั้งชื่อตามทีมและวันที่ในโฟลเดอร์นี้ ส่วน USER.md (ชื่อ ผู้ช่วย และวิธีพูดคุย) เก็บในโฟลเดอร์นี้เพื่อใช้ร่วมกับ STeP AI บน CLI</p><div className="folder-row"><span>{snapshot.userFile || 'USER.md จะถูกสร้างเมื่อบันทึกการตั้งค่า'}</span>{snapshot.userFile && <button className="quiet" onClick={() => void run('user', () => call('reveal', { path: snapshot.userFile }))}>เปิดตำแหน่งไฟล์</button>}</div><div className="choice-row" style={{ marginTop: 14 }}><button className="quiet" onClick={openWizard}>เปิดตัวช่วยตั้งค่าเริ่มต้น</button><button className="quiet" onClick={openTour}>ดูทัวร์แนะนำอีกครั้ง</button></div></section>}
    {page === 'appearance' && <section><h2>ธีม</h2><p className="muted small">เลือกให้ตามระบบปฏิบัติการ หรือกำหนดเอง</p><div className="theme-options">{([['system', 'ตามระบบ', Monitor], ['light', 'สว่าง', Sun], ['dark', 'มืด', Moon]] as const).map(([id, label, Icon]) => <button key={id} className={theme === id ? 'active' : 'quiet'} onClick={() => setTheme(id)}><Icon size={16}/>{label}</button>)}</div><p className="small muted">ทางลัด: กด {shortcut} แล้วพิมพ์ “ธีม” เพื่อสลับได้จากทุกหน้า</p></section>}
    {page === 'privacy' && <section className="privacy-info"><h2>ข้อมูลของคุณ</h2>
      <h3>อะไรถูกส่งให้ AI</h3><p>เฉพาะคำขอ ร่างของงานนั้น บทสนทนาล่าสุด และข้อความที่ตรวจแล้วจากไฟล์แนบ ไม่ส่งไฟล์ต้นฉบับ</p>
      <h3>ก่อนส่ง ระบบตรวจอะไร</h3><p>ปิดบังเลขบัตรประชาชน เบอร์โทร อีเมล และเลขบัญชีที่ตรวจพบ ถ้าพบรหัสผ่านหรือ API key หรือข้อมูลอ่อนไหวคู่กับตัวบุคคล ระบบจะไม่ส่งเลย ถ้าพบสัญญาณข้อมูลบุคคล เช่น รายชื่อ จะถามยืนยันก่อน</p>
      <h3>เมื่อไรจะถามยืนยัน</h3><p>ครั้งแรกของแต่ละงาน เมื่อแนบไฟล์ และเมื่อพบข้อมูลที่ควรตรวจ ผลสแกนเป็นตัวช่วย ไม่ใช่การอนุญาตจากองค์กร</p>
      <h3>เก็บข้อมูลที่ไหน</h3><p>บทสนทนาและร่างอยู่ในเครื่องนี้เท่านั้น API key เข้ารหัสด้วยระบบของ Windows/macOS การลบงานจะลบออกจากเครื่องถาวร</p>
      <h3>สิ่งที่ AI ทำไม่ได้</h3><p>AI ในแอปนี้จัดทำร่างเท่านั้น ไม่มีสิทธิ์รันคำสั่ง เปิดไฟล์ในเครื่อง หรือส่ง อนุมัติ และเบิกจ่ายแทนคุณ ขั้นตอนดำเนินการจริงต้องทำโดยผู้มีอำนาจ</p>
    </section>}
    {page === 'ai' && <section><h2>การเชื่อมต่อ AI</h2><p className="muted small">ใช้บัญชีของคุณเอง API คิดค่าใช้จ่ายตามบริการที่เลือก การทดสอบจะส่งคำขอสั้น ๆ หนึ่งครั้ง</p>
      {snapshot.connections.map(c => <div className="connection-row" key={c.id}><div><strong>{c.provider === 'openai' ? 'OpenAI' : c.provider === 'claude' ? 'Claude' : 'Gemini'} <small>{c.mode === 'api' ? 'API key' : 'Subscription'}</small></strong>{busy === c.id && progress[c.id] ? <p className="connect-progress"><LoaderCircle size={13} className="spin"/>{progress[c.id]}</p> : <p className={c.ready ? 'connected' : 'muted'}>{c.note}</p>}{c.modelsAt && <p className="small muted">โมเดล {c.models?.length || 0} รายการ · อัปเดต {new Date(c.modelsAt).toLocaleString('th-TH')}</p>}</div><div className="connection-actions"><button disabled={Boolean(busy)} onClick={() => void run(c.id, () => call('connect', { id: c.id }))}>{busy === c.id ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>}เชื่อมต่อและทดสอบ</button>{busy === c.id && <button className="quiet" onClick={() => void call('cancelConnect', { id: c.id })}>ยกเลิก</button>}{c.ready && <button className="quiet" disabled={Boolean(busy)} onClick={() => void run(c.id + ':models', () => call('models', { id: c.id }))}>{busy === c.id + ':models' ? <LoaderCircle size={15} className="spin"/> : null}โหลดรายชื่อโมเดล</button>}{c.provider !== 'claude' && (c.customRuntime ? <button className="quiet" disabled={Boolean(busy)} title="เลิกใช้ runtime ที่เลือกเอง" onClick={() => void run(c.id, () => call('runtime', { id: c.id, reset: true }))}>ใช้ตัวเชื่อมที่มากับแอป</button> : <button className="quiet" disabled={Boolean(busy)} title="สำหรับผู้ดูแลระบบ: ใช้ Codex หรือ Gemini CLI ที่ติดตั้งเอง" onClick={() => void run(c.id, () => call('runtime', { id: c.id }))}>เลือก runtime</button>)}{(c.ready || c.mode === 'subscription') && <button className="quiet" disabled={Boolean(busy)} title="ลบข้อมูลลงชื่อของการเชื่อมต่อนี้ออกจากเครื่อง" onClick={() => void run(c.id, () => call('disconnect', { id: c.id }))}>ออกจากระบบ</button>}<button className="quiet danger-text" disabled={Boolean(busy)} onClick={() => setRemovingConnection(c)}>ลบ</button></div></div>)}
      {removingConnection && <ConfirmDialog title="ลบการเชื่อมต่อนี้?" tone="danger" confirmLabel="ลบการเชื่อมต่อ" onCancel={() => setRemovingConnection(null)} onConfirm={async () => { try { await call('removeConnection', { id: removingConnection.id }); } catch (e) { throw new Error(explainError(e)); } setRemovingConnection(null); await refresh(); }}>
        <p>{removingConnection.provider === 'openai' ? 'OpenAI' : removingConnection.provider === 'claude' ? 'Claude' : 'Gemini'} ({removingConnection.mode === 'api' ? 'API key' : 'บัญชี'}) จะถูกลบพร้อมข้อมูลลงชื่อหรือ API key ที่เก็บในเครื่องนี้ บัญชีของคุณที่ผู้ให้บริการไม่ได้รับผลกระทบ</p>
        <p className="small muted">งานที่ใช้การเชื่อมต่อนี้ยังอยู่ครบ เลือก AI ใหม่ได้ในกล่องพิมพ์ของงานนั้น</p>
      </ConfirmDialog>}
      <div className="connection-form"><div className="form-grid"><label>ผู้ให้บริการ<select value={provider} onChange={e => { setProvider(e.target.value); setMode(e.target.value === 'claude' ? 'claude-code' : 'subscription'); }}><option value="openai">OpenAI</option><option value="claude">Claude</option><option value="gemini">Gemini</option></select></label><label>วิธีเชื่อมต่อ<select value={mode} onChange={e => setMode(e.target.value)}><option value="api">API key</option>{provider !== 'claude' ? <option value="subscription">ลงชื่อเข้าใช้บัญชี</option> : <option value="claude-code">บัญชี Pro/Max (ผ่าน Claude Code)</option>}</select></label></div>{mode === 'claude-code' ? <ClaudeCodeNote call={call}/> : <>{mode === 'api' && <label>API key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="เก็บเข้ารหัสในเครื่องนี้"/></label>}<p className="small muted">รายชื่อโมเดลจะโหลดจากบริการอัตโนมัติหลังเชื่อมต่อสำเร็จ แล้วเลือกได้จากกล่องพิมพ์</p><button disabled={Boolean(busy) || (mode === 'api' && !key.trim())} onClick={() => void run('new', async () => { await call('connection', { provider, mode, apiKey: key }); setKey(''); })}><Plus size={16}/>เพิ่มการเชื่อมต่อ</button></>}</div>
    </section>}<div className="settings-save"><button disabled={Boolean(busy)} onClick={() => void run('settings', async () => { await call('settings', { assistant, team, theme, userName, personality, assistantTone }); close(); })}><Check size={17}/>บันทึกและไปที่งาน</button></div>
  </div>;
}

