import { useEffect, useState } from 'react';
import {
  LockKeyhole,
  Globe,
  ExternalLink,
  Plus,
  Pause,
  Play,
  Trash2,
  Pencil,
  Mail,
  CalendarDays,
  FolderOpen,
  FileText,
  ListChecks,
  MessageSquare,
  Video,
  PenLine,
  Send,
  ShieldCheck,
  Check,
  RefreshCw,
  Search,
  type LucideIcon,
} from './icons';
import { language, t } from './i18n';
import { explainError } from './messages';
import { DEFAULT_GOOGLE_SERVICES, GOOGLE_PAGES, type GoogleService } from './google-services';
import type { VaultMetadata } from '../electron/vault';
import { MorningBriefSettings } from './morning-brief';
import { VaultItems } from './vault-items';
const words = {
  title: ['รหัสผ่านและการเชื่อมต่อ', 'Passwords and connections'],
  intro: [
    'บัญชีและที่อยู่ที่จำไว้กรอกอัตโนมัติเฉพาะเว็บไซต์ที่กำหนด รหัสผ่านไม่เข้าแชต',
    'Saved logins and addresses fill automatically on their exact sites. Passwords never enter chat.',
  ],
  disabled: ['เครื่องนี้ยังไม่เปิดใช้การบันทึกข้อมูลบัญชี', 'The administrator has not enabled Vault on this device.'],
  conflict: [
    'เมื่อบันทึกข้อมูลบัญชี แอปจะปิดคำสั่งขั้นสูง โปรแกรมเชื่อมต่อที่เลือกเอง และเครื่องมือในเครื่องที่อาจเข้าถึงรหัสผ่าน แม้พักการใช้บัญชี สิทธิ์เหล่านี้ก็ยังปิดอยู่',
    'Stored Vault credentials block host commands, custom runtimes and local executable tools. Pausing Vault keeps that protection.',
  ],
  add: ['เพิ่มบัญชีเว็บไซต์', 'Add website account'],
  label: ['ชื่อเรียกบัญชี', 'Account label'],
  search: ['ค้นหาบัญชีเว็บไซต์ที่บันทึกไว้', 'Search saved website accounts'],
  editHeading: ['แก้ไขบัญชีเว็บไซต์', 'Edit website account'],
  emptyHint: ['กด “เพิ่มบัญชีเว็บไซต์” เพื่อเก็บบัญชีแรก', 'Press “Add website account” to save the first one'],
  origin: ['เว็บไซต์ที่ใช้ได้', 'Allowed website'],
  username: ['ชื่อผู้ใช้หรืออีเมล', 'Username / email'],
  password: ['รหัสผ่านของเว็บไซต์นี้', 'Password for this website'],
  remember: ['จำบัญชีนี้บนเครื่องส่วนตัวของฉัน', 'Remember this account on my personal device'],
  save: ['บันทึก', 'Save'],
  cancel: ['ยกเลิก', 'Cancel'],
  edit: ['แก้ไข', 'Edit'],
  remove: ['ลบจากเครื่อง', 'Delete locally'],
  empty: ['ยังไม่มีบัญชีเว็บไซต์', 'No website accounts saved'],
  pause: ['พักการใช้งาน', 'Pause'],
  resume: ['กลับมาใช้งาน', 'Resume'],
  replace: ['เว้นว่างเพื่อใช้รหัสผ่านเดิม', 'Leave blank to keep the existing password'],
  usernameEdit: [
    'กรอกชื่อผู้ใช้ใหม่หากต้องการแก้ไข แอปไม่แสดงข้อมูลเดิมที่บันทึกไว้',
    'Enter the username to edit. Saved values are not read back into this screen.',
  ],
  keys: ['จัดการรหัสเชื่อมต่อ (API key) ที่หน้า “การเชื่อมต่อ AI”', 'Manage API keys in AI connections'],
  googleIntro: [
    'ให้ AI ช่วยค้นเมล ดูนัด และหาไฟล์ในบัญชี Google ของงานคุณ',
    'Let the AI search your mail, check your calendar and find files in your work Google account.',
  ],
  googleSeparate: ['แยกจากการลงชื่อ Gemini ในหน้าการเชื่อมต่อ AI', 'Separate from the Gemini sign-in under AI connections.'],
  step1: ['เลือกบริการ', 'Choose services'],
  step2: ['ลงชื่อด้วยบัญชีงานในเบราว์เซอร์', 'Sign in with your work account in the browser'],
  step3: ['ถามในแชตได้เลย', 'Ask in chat'],
  promise: [
    'AI ขออนุญาตคุณทุกครั้งก่อนอ่านหรือเปลี่ยนข้อมูล และไม่เห็นรหัสผ่านหรือรหัสเชื่อมต่อบัญชีของคุณ',
    'The AI asks you every time before it reads or changes anything, and never sees your password or token.',
  ],
  readOnly: ['อ่านอย่างเดียว', 'Read only'],
  calendar: ['ปฏิทิน', 'Calendar'],
  calendarAccess: ['สิทธิ์ปฏิทิน', 'Calendar access'],
  calendarRead: ['ดูอย่างเดียว', 'View only'],
  calendarWrite: ['ดูและสร้างนัด', 'View and create events'],
  canChange: ['แก้ไขได้ · ถามก่อนทุกครั้ง', 'Can change · asks first'],
  fullAccess: ['เลือกสิทธิ์เต็มทุกบริการ', 'Select full access to all services'],
  selfService: [
    'เลือกใช้บริการทั้งหมดที่แอปรองรับได้เอง ไม่ต้องให้ IT เปิดสิทธิ์รายบริการ Google จะให้คุณตรวจและอนุญาตก่อนเชื่อมบัญชี',
    'Choose any supported service yourself, without per-service IT setup. Google asks you to review and authorize access before connecting.',
  ],
  reauthorize: [
    'อัปเดตแอปแล้วสิทธิ์บัญชีเดิมจะไม่เพิ่มเอง กด “ปรับบริการที่อนุญาต” ที่บัญชีเดิม เลือกบริการ แล้วให้สิทธิ์ใน Google',
    'Updating the app does not add account permissions. Choose “Change allowed services” on the existing account, select services, then consent in Google.',
  ],
  waiting: [
    'กำลังรอให้คุณลงชื่อในเบราว์เซอร์ เสร็จแล้วกลับมาที่แอปนี้',
    'Waiting for you to sign in in the browser. Come back to this app when you are done.',
  ],
  yourAccounts: ['บัญชีที่เชื่อมแล้ว', 'Connected accounts'],
  addAccount: ['เชื่อมบัญชีอื่น', 'Connect another account'],
  moreActions: ['ตัวเลือกเพิ่มเติม', 'More options'],
  revokeHint: [
    'เลิกเชื่อมในเครื่อง ลบการเชื่อมต่อจากเครื่องนี้ ส่วนเพิกถอนสิทธิ์ที่ Google ยกเลิกสิทธิ์ของแอปในบัญชี Google ด้วย',
    'Disconnect locally removes it from this device. Revoke also removes the app from your Google account.',
  ],
  reauthHint: ['สิทธิ์หมดอายุหรือมีการเปลี่ยนแปลง กดลงชื่อเข้าใช้ใหม่', 'Access expired or changed. Sign in again.'],
  notConfigured: [
    'รอผู้ดูแลตั้งค่า Google OAuth client ID และโดเมนที่อนุญาต จึงจะเชื่อมบัญชีงานได้',
    'An administrator must configure the Google OAuth client ID and allowed domains before work-account connection.',
  ],
  googleDisabled: ['ผู้ดูแลยังไม่ได้เปิดการเชื่อม Google Workspace', 'Google Workspace connections are not enabled by the administrator.'],
  connect: ['เชื่อมบัญชีงาน', 'Connect work account'],
  clientSetup: ['ตั้งค่าการเชื่อม Google ขององค์กร', 'Organization Google connection setup'],
  importClient: ['นำเข้าไฟล์ OAuth client', 'Import OAuth client file'],
  clientHelp: [
    'เลือกไฟล์ JSON แบบ Desktop app ที่ดาวน์โหลดจาก Google Cloud ขององค์กร แอปจะเก็บ client secret ใน Vault บนเครื่องนี้ และใช้กับ Client ID ที่องค์กรตั้งไว้เท่านั้น',
    'Choose the organization’s Desktop app JSON downloaded from Google Cloud. The app stores its client secret in this device’s Vault and uses only the configured client ID.',
  ],
  clientReady: [
    'ตั้งค่า OAuth client บนเครื่องนี้แล้ว กดเชื่อมบัญชีงานเพื่อลองอีกครั้ง',
    'OAuth client configured on this device. Connect your work account to retry.',
  ],
  reconnect: ['ลงชื่อเข้าใช้ใหม่', 'Sign in again'],
  connected: ['เชื่อมแล้ว', 'Connected'],
  paused: ['พักอยู่', 'Paused'],
  revoke: ['เพิกถอนสิทธิ์ที่ Google', 'Revoke Google access'],
  disconnect: ['เลิกเชื่อมในเครื่อง', 'Disconnect locally'],
  open: ['เปิดบริการของ Google ในเบราว์เซอร์', 'Open Google services in the browser'],
  verifyBrowser: [
    'ตรวจบัญชีที่มุมขวาของ Google อีกครั้ง บัญชีในเบราว์เซอร์อาจต่างจากบัญชีที่เชื่อมในแอป',
    'Verify the account in Google. Your browser account can differ from the account connected here.',
  ],
  selectServices: ['เลือกบริการที่ต้องใช้', 'Select the services you need'],
  drive: ['Google Drive', 'Google Drive'],
  driveAccess: ['สิทธิ์ไฟล์', 'File access'],
  driveRead: ['ค้นและอ่าน', 'Search and read'],
  driveWrite: ['อ่าน สร้าง และจัดการไฟล์', 'Read, create and manage files'],
  editServices: ['ปรับบริการที่อนุญาต', 'Change allowed services'],
  updatingServices: ['กำลังปรับสิทธิ์ของ', 'Changing services for'],
  newAccount: ['เชื่อมบัญชีอื่น', 'Connect another account'],
  hideFiles: ['ซ่อนรายการไฟล์', 'Hide files'],
  noFiles: ['ยังไม่มีไฟล์ที่แอปนี้เปิดได้', 'No files this app can open yet'],
  files: ['เลือกไฟล์ที่บัญชีนี้เข้าถึงได้', 'Select files this account can access'],
  fileScope: [
    'แสดงเฉพาะไฟล์ที่อนุญาตให้แอปเข้าถึง การวางลิงก์ไม่เพิ่มสิทธิ์เปิดไฟล์อื่น',
    'This list follows actual grants. drive.file does not grant every file from a pasted link.',
  ],
  resumeBrowser: ['ตรวจแล้ว ให้ AI อ่านเว็บไซต์ต่อ', 'Reviewed: resume AI website reading'],
} as const;
const w = (key: keyof typeof words) => words[key][language() === 'en' ? 1 : 0];
type ServiceInfo = { icon: LucideIcon; name: [string, string]; detail: [string, string]; changes?: boolean };
const SERVICES: Record<GoogleService, ServiceInfo> = {
  documents: {
    icon: FileText,
    name: ['เอกสาร ชีต และสไลด์', 'Docs, Sheets and Slides'],
    detail: ['สร้างและแก้เอกสารที่แอปนี้เปิดหรือสร้างเอง', 'Create and edit documents this app opens or creates'],
    changes: true,
  },
  'drive-read': {
    icon: FolderOpen,
    name: ['ค้นไฟล์ใน Drive', 'Search Drive'],
    detail: ['หาและอ่านไฟล์ทุกไฟล์ที่บัญชีคุณเปิดได้', 'Find and read any file your account can open'],
  },
  'gmail-read': {
    icon: Mail,
    name: ['อ่าน Gmail', 'Read Gmail'],
    detail: ['ค้นและสรุปอีเมลในกล่องจดหมาย', 'Search and summarise your mail'],
  },
  'gmail-draft': {
    icon: PenLine,
    name: ['ร่างอีเมล', 'Draft emails'],
    detail: ['เตรียมฉบับร่างไว้ใน Gmail ให้คุณตรวจก่อนส่ง', 'Save drafts in Gmail for you to review'],
    changes: true,
  },
  'gmail-send': {
    icon: Send,
    name: ['ส่งอีเมล', 'Send emails'],
    detail: ['ส่งอีเมลหลังคุณตรวจผู้รับและข้อความแล้ว', 'Send mail after you review recipients and text'],
    changes: true,
  },
  'calendar-read': {
    icon: CalendarDays,
    name: ['ดูปฏิทิน', 'View Calendar'],
    detail: ['ดูนัดและหาช่วงที่ว่าง', 'See your events and free time'],
  },
  calendar: {
    icon: CalendarDays,
    name: ['ปฏิทิน (ดูและสร้างนัด)', 'Calendar (view and create)'],
    detail: ['ดูนัด และสร้างนัดหรือส่งคำเชิญหลังคุณตรวจแล้ว', 'See events and create invitations after you review them'],
    changes: true,
  },
  tasks: {
    icon: ListChecks,
    name: ['Google Tasks', 'Google Tasks'],
    detail: ['ดู เพิ่ม และติ๊กงานที่ต้องทำ', 'View, add and complete to-dos'],
    changes: true,
  },
  chat: {
    icon: MessageSquare,
    name: ['Google Chat', 'Google Chat'],
    detail: ['อ่านและส่งข้อความในห้องที่คุณอยู่', 'Read and send messages in your spaces'],
    changes: true,
  },
  meet: {
    icon: Video,
    name: ['Google Meet', 'Google Meet'],
    detail: ['ดูข้อมูลห้องประชุม', 'View meeting space details'],
  },
  'gmail-manage': {
    icon: Mail,
    name: ['จัดป้ายกำกับและย้ายอีเมล', 'Manage Gmail labels and messages'],
    detail: ['ติดป้ายกำกับ ทำเครื่องหมายอ่าน และย้ายเข้า/ออกถังขยะ', 'Apply labels, mark read, and move mail to or from Trash'],
    changes: true,
  },
  drive: {
    icon: FolderOpen,
    name: ['จัดการไฟล์ Drive', 'Manage Drive files'],
    detail: ['สร้างโฟลเดอร์ คัดลอก ย้ายไฟล์ และจัดสิทธิ์แชร์', 'Create folders, copy and move files, and manage sharing'],
    changes: true,
  },
  docs: {
    icon: FileText,
    name: ['Google Docs', 'Google Docs'],
    detail: ['อ่าน สร้าง แก้ข้อความ จัดรูปแบบ และสร้างตาราง', 'Read, create, edit, format and add tables'],
    changes: true,
  },
  sheets: {
    icon: ListChecks,
    name: ['Google Sheets', 'Google Sheets'],
    detail: ['อ่าน เขียนสูตร เพิ่มแถว จัดรูปแบบ และสร้างกราฟ', 'Read, write formulas, append rows, format and create charts'],
    changes: true,
  },
  slides: {
    icon: Video,
    name: ['Google Slides', 'Google Slides'],
    detail: ['อ่าน สร้าง และจัดหน้า ข้อความ รูปภาพ หรือตาราง', 'Read, create and edit slides, text, images and tables'],
    changes: true,
  },
  forms: {
    icon: ListChecks,
    name: ['Google Forms', 'Google Forms'],
    detail: ['สร้าง แก้คำถาม เปิดรับคำตอบ และอ่านผลตอบกลับ', 'Create forms, edit questions, publish and read responses'],
    changes: true,
  },
  appscript: {
    icon: PenLine,
    name: ['Google Apps Script', 'Google Apps Script'],
    detail: [
      'แก้โค้ด จัดเวอร์ชันและ Deployment หรือเรียกฟังก์ชันที่ตั้งค่าไว้',
      'Edit code, manage versions/deployments and run configured functions',
    ],
    changes: true,
  },
};
const lang = () => (language() === 'en' ? 1 : 0);
const serviceName = (s: string) => SERVICES[s as GoogleService]?.name[lang()] || s;
const visibleGoogleServices = (allowed: GoogleService[]) =>
  allowed.filter(s => s !== 'documents' || !(['docs', 'sheets', 'slides'] as GoogleService[]).every(v => allowed.includes(v)));
const selectedGoogleServices = (selected: GoogleService[], allowed: GoogleService[]) => {
  const visible = visibleGoogleServices(allowed);
  return [
    ...new Set(
      selected.flatMap(s => (s === 'documents' && !visible.includes(s) ? (['docs', 'sheets', 'slides'] as GoogleService[]) : [s])),
    ),
  ].filter(s => visible.includes(s));
};
function WorkspaceAccessService({
  family,
  allowed,
  selected,
  busy,
  onChange,
}: {
  family: 'calendar' | 'drive';
  allowed: GoogleService[];
  selected: GoogleService[];
  busy: boolean;
  onChange: (services: GoogleService[]) => void;
}) {
  const kinds: GoogleService[] = family === 'calendar' ? ['calendar-read', 'calendar'] : ['drive-read', 'drive'];
  const options = kinds.filter(s => allowed.includes(s));
  const access = options.find(s => s === family && selected.includes(s)) || options.find(s => selected.includes(s));
  const info = SERVICES[access || options[0]];
  const Icon = info.icon;
  const choose = (next?: GoogleService) => onChange([...selected.filter(s => !kinds.includes(s)), ...(next ? [next] : [])]);
  return (
    <div className={'google-service google-access google-' + family + (access ? ' selected' : '')}>
      <label className="google-access-toggle">
        <input
          type="checkbox"
          aria-label={w(family)}
          checked={Boolean(access)}
          disabled={busy}
          onChange={e => choose(e.target.checked ? options[0] : undefined)}
        />
        <span className="google-service-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="google-service-text">
          <strong>{w(family)}</strong>
          <span className="muted small">{info.detail[lang()]}</span>
          <span className={`google-kind ${info.changes ? 'changes' : 'read'}`}>{info.changes ? w('canChange') : w('readOnly')}</span>
        </span>
        <span className="google-service-tick" aria-hidden="true">
          {access && <Check size={14} />}
        </span>
      </label>
      {access && options.length > 1 && (
        <fieldset className="google-access-options">
          <legend>{w(family === 'calendar' ? 'calendarAccess' : 'driveAccess')}</legend>
          {options.map(s => (
            <label key={s}>
              <input type="radio" name={'google-' + family + '-access'} checked={access === s} disabled={busy} onChange={() => choose(s)} />
              <span>
                {family === 'calendar'
                  ? s === 'calendar-read'
                    ? w('calendarRead')
                    : w('calendarWrite')
                  : s === 'drive-read'
                    ? w('driveRead')
                    : w('driveWrite')}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
const LAUNCH_NAMES: Record<string, string> = {
  gmail: 'Gmail',
  drive: 'Drive',
  docs: 'Docs',
  sheets: 'Sheets',
  slides: 'Slides',
  calendar: 'Calendar',
  tasks: 'Tasks',
  chat: 'Chat',
  meet: 'Meet',
  contacts: 'Contacts',
  forms: 'Forms',
  scripts: 'Apps Script',
};
type Props = {
  call: (method: string, input?: any) => Promise<any>;
  onError: (error: unknown) => void;
  onBusy?: (busy: boolean) => void;
  requestedOrigin?: string;
};
export function CredentialSettings({ call, onError, onBusy, requestedOrigin = '' }: Props) {
  const [vault, setVault] = useState<{
    enabled: boolean;
    suspended: boolean;
    protected: boolean;
    blockHostExecution?: boolean;
    sources?: { source: 'onepassword' | 'bitwarden'; enabled: boolean; installed: boolean; unlocked: boolean }[];
    entries: VaultMetadata[];
    browsers: { id: string; sessionId: string; origin: string }[];
  }>();
  const [google, setGoogle] = useState<{
    enabled: boolean;
    configured: boolean;
    connecting: boolean;
    vaultSuspended?: boolean;
    connectionError?: string;
    clientSecretConfigured?: boolean;
    clientPreconfigured?: boolean;
    services: GoogleService[];
    accounts: { id: string; label: string; domain: string; services: string[]; paused: boolean; reauth: boolean }[];
  }>();
  const [form, setForm] = useState<{
    id?: string;
    revision?: number;
    label: string;
    destination: string;
    username: string;
    password: string;
    remember: boolean;
    otpSecret?: string;
  }>();
  const [services, setServices] = useState<GoogleService[]>(['documents']);
  const [editingGoogle, setEditingGoogle] = useState<string>();
  const [busy, setBusy] = useState('');
  const [connectionError, setConnectionError] = useState<unknown>();
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string }[]>();
  const [query, setQuery] = useState('');
  const reload = async () => {
    const [v, g] = await Promise.all([call('vaultState'), call('googleState')]);
    setVault(v);
    setGoogle(g);
    setConnectionError(g.connectionError);
  };
  useEffect(() => {
    let alive = true;
    void Promise.all([call('vaultState'), call('googleState')])
      .then(([v, g]) => {
        if (alive) {
          setVault(v);
          setGoogle(g);
          setServices(old => selectedGoogleServices(old, g.services));
          setConnectionError(g.connectionError);
        }
      })
      .catch(onError);
    return () => {
      alive = false;
    };
  }, [call]);
  useEffect(() => {
    if (requestedOrigin) setForm({ label: '', destination: requestedOrigin, username: '', password: '', remember: false });
  }, [requestedOrigin]);
  useEffect(() => {
    onBusy?.(Boolean(busy));
    return () => onBusy?.(false);
  }, [busy, onBusy]);
  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    const connectionAction = id === 'google-connect' || id === 'google-client-import';
    if (connectionAction) setConnectionError(undefined);
    try {
      await action();
      await reload();
    } catch (error) {
      if (connectionAction) setConnectionError(error);
      onError(error);
    } finally {
      setBusy('');
    }
  };
  const websites =
    vault?.entries.filter(v => v.kind === 'website' && (v.label + ' ' + v.destination).toLowerCase().includes(query.toLowerCase())) || [];
  return (
    <div className="credential-settings">
      <section className="credential-section">
        <div className="credential-heading">
          <div>
            <h2>
              <LockKeyhole size={19} />
              {w('title')}
            </h2>
            <p className="muted">{w('intro')}</p>
          </div>
          <button
            disabled={!vault?.enabled || Boolean(busy)}
            onClick={() => setForm({ label: '', destination: '', username: '', password: '', remember: false })}
          >
            <Plus size={15} />
            {w('add')}
          </button>
        </div>
        {!vault?.enabled && <p role="status">{w('disabled')}</p>}
        {vault?.protected && vault.blockHostExecution && <p className="credential-note">{w('conflict')}</p>}
        {vault?.protected && !vault.blockHostExecution && (
          <p className="credential-note">
            {t('เครื่องมือเขียนโค้ดใช้สิทธิ์ตามปกติ คำสั่งในเครื่องอาจเข้าถึงข้อมูลของผู้ใช้ระบบปฏิบัติการนี้ได้')}
          </p>
        )}
        {vault?.protected && (
          <button
            className="quiet"
            disabled={Boolean(busy)}
            onClick={() => void run('pause', () => call('vaultSuspend', { enabled: !vault.suspended }))}
          >
            {vault.suspended ? <Play size={15} /> : <Pause size={15} />}
            {vault.suspended ? w('resume') : w('pause')}
          </button>
        )}
        {form && (
          <form
            className="credential-form"
            autoComplete="off"
            aria-labelledby="credential-form-heading"
            onSubmit={event => {
              event.preventDefault();
              const input = { ...form, kind: 'website' };
              setForm(undefined);
              void run('save', () => call('vaultSave', input));
            }}
          >
            <h3 id="credential-form-heading">{form.id ? w('editHeading') : w('add')}</h3>
            <label>
              {w('label')}
              <input required maxLength={100} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
            </label>
            <label>
              {w('origin')}
              <input
                required
                type="url"
                placeholder="https://accounts.example.org"
                value={form.destination}
                onChange={e => setForm({ ...form, destination: e.target.value })}
              />
            </label>
            <label>
              {w('username')}
              <input
                required
                autoComplete="off"
                maxLength={500}
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label>
              {w('password')}
              <input
                type="password"
                required={!form.id}
                autoComplete="new-password"
                maxLength={4000}
                placeholder={form.id ? w('replace') : ''}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
              />
            </label>
            {form.id && <p className="muted small">{w('usernameEdit')}</p>}
            <label>
              {t('Authenticator setup key หรือ otpauth:// (ไม่บังคับ)')}
              <input
                type="password"
                autoComplete="off"
                maxLength={4000}
                value={form.otpSecret || ''}
                onChange={event => setForm({ ...form, otpSecret: event.target.value || undefined })}
              />
            </label>
            {form.id && (
              <label>
                <input
                  type="checkbox"
                  checked={form.otpSecret === ''}
                  onChange={event => setForm({ ...form, otpSecret: event.target.checked ? '' : undefined })}
                />
                {t('ลบ Authenticator key ที่บันทึกไว้')}
              </label>
            )}
            <label className="credential-check">
              <input type="checkbox" checked={form.remember} onChange={e => setForm({ ...form, remember: e.target.checked })} />
              {w('remember')}
            </label>
            <div className="credential-actions">
              <button type="button" className="quiet" onClick={() => setForm(undefined)}>
                {w('cancel')}
              </button>
              <button type="submit" disabled={!form.remember || Boolean(busy)}>
                {w('save')}
              </button>
            </div>
          </form>
        )}
        {/* Search only once there is something to search, and say it is a search, so it is never taken for the add form. */}
        {Boolean(vault?.entries.some(v => v.kind === 'website')) && (
          <label className="credential-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label={w('search')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={w('search')}
            />
          </label>
        )}
        {!websites.length && (
          <p className="muted">
            {w('empty')}
            {!query && vault?.enabled && !form ? <span className="small"> · {w('emptyHint')}</span> : null}
          </p>
        )}
        {websites.map(entry => (
          <article className="credential-row" key={entry.id}>
            <div>
              <strong>{entry.label}</strong>
              <p className="muted small">{entry.destination}</p>
            </div>
            <div className="credential-actions">
              <button
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() =>
                  setForm({
                    id: entry.id,
                    revision: entry.revision,
                    label: entry.label,
                    destination: entry.destination,
                    username: '',
                    password: '',
                    remember: false,
                  })
                }
              >
                <Pencil size={14} />
                {w('edit')}
              </button>
              <button
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() => void run('delete', () => call('vaultRemove', { id: entry.id, revision: entry.revision }))}
              >
                <Trash2 size={14} />
                {w('remove')}
              </button>
            </div>
          </article>
        ))}
        <VaultItems
          entries={vault?.entries || []}
          sources={vault?.sources || []}
          disabled={!vault?.enabled || Boolean(busy)}
          run={run}
          call={call}
        />
        {vault?.entries.some(v => v.kind === 'api-key') && <p className="muted small">{w('keys')}</p>}
        {vault?.browsers.map(tab => (
          <button
            key={tab.id}
            className="quiet"
            disabled={Boolean(busy)}
            onClick={() => void run('resume-browser', () => call('vaultResumeBrowser', { tab: tab.id, sessionId: tab.sessionId }))}
          >
            {w('resumeBrowser')} · {tab.origin}
          </button>
        ))}
      </section>
      <section className="credential-section google-workspace">
        <div className="google-hero">
          <span className="google-hero-icon" aria-hidden="true">
            <Globe size={22} />
          </span>
          <div>
            <h2>Google Workspace</h2>
            <p>{w('googleIntro')}</p>
            <p className="muted small">{w('googleSeparate')}</p>
          </div>
        </div>
        {!google?.enabled ? (
          <p className="credential-note" role="status">
            {w('googleDisabled')}
          </p>
        ) : !google.configured ? (
          <p className="credential-note" role="status">
            {w('notConfigured')}
          </p>
        ) : (
          <>
            {!google.accounts.length && (
              <ol className="google-steps">
                <li>{w('step1')}</li>
                <li>{w('step2')}</li>
                <li>{w('step3')}</li>
              </ol>
            )}
            {google.vaultSuspended && (
              <div className="credential-note" role="status">
                <p>{t('พักการใช้ข้อมูลบัญชีอยู่ จึงยังใช้ Google Workspace ไม่ได้ เปิดใช้ข้อมูลบัญชีเพื่อใช้บัญชีที่เชื่อมไว้')}</p>
                <button disabled={Boolean(busy)} onClick={() => void run('pause', () => call('vaultSuspend', { enabled: false }))}>
                  <Play size={15} />
                  {t('กลับมาใช้ข้อมูลบัญชี')}
                </button>
              </div>
            )}
            {Boolean(google.accounts.length) && <h3 className="google-subhead">{w('yourAccounts')}</h3>}
            {google.accounts.map(account => {
              const state = account.reauth ? 'attention' : account.paused || google.vaultSuspended ? 'paused' : 'ready';
              return (
                <article className={`google-account ${state}`} key={account.id}>
                  <div className="google-account-head">
                    <span className="google-avatar" aria-hidden="true">
                      {(account.label.trim()[0] || 'G').toUpperCase()}
                    </span>
                    <div className="google-account-name">
                      <strong>{account.label}</strong>
                      <span className="muted small">{account.domain}</span>
                    </div>
                    <span className={`connection-state ${state === 'paused' ? '' : state}`}>
                      <span className="connection-dot" aria-hidden="true" />
                      {account.reauth ? w('reconnect') : account.paused || google.vaultSuspended ? w('paused') : w('connected')}
                    </span>
                  </div>
                  {account.reauth && <p className="muted small">{w('reauthHint')}</p>}
                  <ul className="google-chips" aria-label={w('selectServices')}>
                    {account.services
                      .filter(s => s !== 'calendar-read' || !account.services.includes('calendar'))
                      .filter(s => s !== 'drive-read' || !account.services.includes('drive'))
                      .map(s => {
                        const Icon = SERVICES[s as GoogleService]?.icon || Globe;
                        return (
                          <li key={s}>
                            <Icon size={13} aria-hidden="true" />
                            {serviceName(s)}
                          </li>
                        );
                      })}
                  </ul>
                  <div className="credential-actions">
                    <button
                      className="quiet"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setEditingGoogle(account.id);
                        setServices(selectedGoogleServices(account.services as GoogleService[], google.services));
                        document.querySelector('.google-services')?.scrollIntoView({ block: 'center', behavior: 'instant' });
                      }}
                    >
                      <ShieldCheck size={14} />
                      {w('editServices')}
                    </button>
                    {account.reauth && (
                      <button
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void run('google-connect', () =>
                            call('googleConnect', {
                              id: account.id,
                              services: account.services.filter(s => google.services.includes(s as GoogleService)),
                            }),
                          )
                        }
                      >
                        <RefreshCw size={14} />
                        {w('reconnect')}
                      </button>
                    )}
                    {account.services.some(s => s === 'documents' || s === 'drive-read' || s === 'drive') && (
                      <button
                        className="quiet"
                        disabled={Boolean(busy) || google.vaultSuspended || account.paused || account.reauth}
                        onClick={() =>
                          void run('files', async () => {
                            const result = await call('googleExecute', { id: account.id, request: { operation: 'drive.list' } });
                            setFiles(result.data?.files || []);
                          })
                        }
                      >
                        <FolderOpen size={14} />
                        {w('files')}
                      </button>
                    )}
                    <button
                      className="quiet"
                      disabled={Boolean(busy)}
                      onClick={() => void run('google-pause', () => call('googlePause', { id: account.id, paused: !account.paused }))}
                    >
                      {account.paused ? <Play size={14} /> : <Pause size={14} />}
                      {account.paused ? w('resume') : w('pause')}
                    </button>
                  </div>
                  <details className="google-more">
                    <summary>{w('moreActions')}</summary>
                    <p className="muted small">{w('revokeHint')}</p>
                    <div className="credential-actions">
                      <button
                        className="quiet"
                        disabled={Boolean(busy)}
                        onClick={() => void run('disconnect', () => call('googleDisconnect', { id: account.id, revoke: false }))}
                      >
                        {w('disconnect')}
                      </button>
                      <button
                        className="quiet danger-text"
                        disabled={Boolean(busy)}
                        onClick={() => void run('revoke', () => call('googleDisconnect', { id: account.id, revoke: true }))}
                      >
                        <Trash2 size={14} />
                        {w('revoke')}
                      </button>
                    </div>
                  </details>
                </article>
              );
            })}
            {Boolean(google.accounts.length) && <MorningBriefSettings call={call} onError={onError} />}
            {files && (
              <div className="credential-files">
                <div className="credential-heading">
                  <p className="muted small">{w('fileScope')}</p>
                  <button className="quiet" onClick={() => setFiles(undefined)}>
                    {w('hideFiles')}
                  </button>
                </div>
                {!files.length && <p className="muted">{w('noFiles')}</p>}
                {files.map(file => (
                  <p key={file.id}>
                    <FileText size={14} aria-hidden="true" /> <strong>{file.name}</strong>
                  </p>
                ))}
              </div>
            )}
            <div className="google-service-actions">
              <p className="small muted">{w('selfService')}</p>
              <button
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() =>
                  setServices(
                    DEFAULT_GOOGLE_SERVICES.filter(
                      s => google.services.includes(s) && !['documents', 'drive-read', 'calendar-read'].includes(s),
                    ),
                  )
                }
              >
                <Check size={15} />
                {w('fullAccess')}
              </button>
            </div>
            <fieldset className="google-services">
              <legend>{editingGoogle ? w('editServices') : google.accounts.length ? w('addAccount') : w('selectServices')}</legend>
              {visibleGoogleServices(google.services)
                .filter((s, index, all) =>
                  s !== 'calendar-read' && s !== 'calendar'
                    ? (s !== 'drive-read' && s !== 'drive') || index === all.findIndex(v => v === 'drive-read' || v === 'drive')
                    : index === all.findIndex(v => v === 'calendar-read' || v === 'calendar'),
                )
                .map(s => {
                  if (s === 'calendar-read' || s === 'calendar' || s === 'drive-read' || s === 'drive')
                    return (
                      <WorkspaceAccessService
                        key={s.startsWith('drive') ? 'drive' : 'calendar'}
                        family={s.startsWith('drive') ? 'drive' : 'calendar'}
                        allowed={google.services}
                        selected={services}
                        busy={Boolean(busy)}
                        onChange={setServices}
                      />
                    );
                  const info = SERVICES[s];
                  const Icon = info.icon;
                  const on = services.includes(s);
                  return (
                    <label className={`google-service${on ? ' selected' : ''}`} key={s}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={Boolean(busy)}
                        onChange={e => setServices(old => (e.target.checked ? [...old, s] : old.filter(v => v !== s)))}
                      />
                      <span className="google-service-icon" aria-hidden="true">
                        <Icon size={18} />
                      </span>
                      <span className="google-service-text">
                        <strong>{info.name[lang()]}</strong>
                        <span className="muted small">{info.detail[lang()]}</span>
                        <span className={`google-kind ${info.changes ? 'changes' : 'read'}`}>
                          {info.changes ? w('canChange') : w('readOnly')}
                        </span>
                      </span>
                      <span className="google-service-tick" aria-hidden="true">
                        {on && <Check size={14} />}
                      </span>
                    </label>
                  );
                })}
            </fieldset>
            {google.accounts.length > 0 && <p className="muted small">{w('reauthorize')}</p>}
            {connectionError !== undefined && (
              <p className="credential-note" role="alert">
                {explainError(connectionError)}
              </p>
            )}
            {!google.clientPreconfigured && (
              <details className="google-more" open={String(connectionError).includes('GOOGLE_CLIENT_SECRET_REQUIRED') || undefined}>
                <summary>{w('clientSetup')}</summary>
                <p className="muted small">{w('clientHelp')}</p>
                <button
                  className="quiet"
                  disabled={Boolean(busy)}
                  onClick={() => void run('google-client-import', () => call('googleImportClient'))}
                >
                  <FolderOpen size={14} /> {w('importClient')}
                </button>
              </details>
            )}
            {google.clientSecretConfigured && !google.clientPreconfigured && (
              <p className="credential-note" role="status">
                {w('clientReady')}
              </p>
            )}
            <div className="google-connect-row">
              {editingGoogle && (
                <>
                  <p className="muted small">
                    {w('updatingServices')} {google.accounts.find(a => a.id === editingGoogle)?.label}
                  </p>
                  <button className="quiet" disabled={Boolean(busy)} onClick={() => setEditingGoogle(undefined)}>
                    {w('newAccount')}
                  </button>
                </>
              )}
              <button
                disabled={Boolean(busy) || !services.some(s => google.services.includes(s))}
                onClick={() =>
                  void run('google-connect', async () => {
                    await call('googleConnect', {
                      services: services.filter(s => google.services.includes(s)),
                      ...(editingGoogle ? { id: editingGoogle } : {}),
                    });
                    setEditingGoogle(undefined);
                  })
                }
              >
                {w('connect')}
              </button>
              {busy === 'google-connect' && (
                <>
                  <span className="muted small" role="status">
                    {w('waiting')}
                  </span>
                  <button className="quiet" onClick={() => void call('googleCancel').catch(onError)}>
                    {w('cancel')}
                  </button>
                </>
              )}
            </div>
            <p className="google-promise">
              <ShieldCheck size={16} aria-hidden="true" />
              {w('promise')}
            </p>
          </>
        )}
        <details className="google-open">
          <summary>{w('open')}</summary>
          <p className="muted small">{w('verifyBrowser')}</p>
          <div className="google-launches">
            {Object.keys(GOOGLE_PAGES).map(service => (
              <button key={service} className="quiet" onClick={() => void call('googleOpen', { service }).catch(onError)}>
                <ExternalLink size={13} />
                {LAUNCH_NAMES[service] || service}
              </button>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
