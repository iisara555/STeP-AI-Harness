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
} from 'lucide-react';
import { language } from './i18n';
import { GOOGLE_PAGES, type GoogleService } from './google-services';
import type { VaultMetadata } from '../electron/vault';
const words = {
  title: ['รหัสผ่านและการเชื่อมต่อ', 'Passwords and connections'],
  intro: [
    'เก็บข้อมูลบัญชีบนเครื่องนี้ เลือกปลายทางและตรวจทุกครั้งก่อนใช้งาน',
    'Store account credentials on this device. Review the destination before use.',
  ],
  disabled: ['ผู้ดูแลยังไม่ได้เปิดใช้ Vault สำหรับเครื่องนี้', 'The administrator has not enabled Vault on this device.'],
  conflict: [
    'เมื่อมีข้อมูลใน Vault แอปจะปิดการรันคำสั่ง โค้ด และเครื่องมือในเครื่องที่อาจเข้าถึงรหัสผ่าน การพัก Vault ไม่เปิดสิทธิ์เหล่านี้กลับ',
    'Stored Vault credentials block host commands, custom runtimes and local executable tools. Pausing Vault keeps that protection.',
  ],
  add: ['เพิ่มบัญชีเว็บไซต์', 'Add website account'],
  label: ['ชื่อเรียกบัญชี', 'Account label'],
  search: ['ค้นหาบัญชีเว็บไซต์ที่บันทึกไว้', 'Search saved website accounts'],
  editHeading: ['แก้ไขบัญชีเว็บไซต์', 'Edit website account'],
  emptyHint: ['กด “เพิ่มบัญชีเว็บไซต์” เพื่อเก็บบัญชีแรก', 'Press “Add website account” to save the first one'],
  origin: ['เว็บไซต์ที่ใช้ได้', 'Allowed website'],
  username: ['Username / อีเมล', 'Username / email'],
  password: ['Password', 'Password'],
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
    'พิมพ์ username ใหม่เพื่อแก้ไข ค่าที่บันทึกแล้วไม่ถูกอ่านกลับเข้าหน้าจอ',
    'Enter the username to edit. Saved values are not read back into this screen.',
  ],
  keys: ['API keys จัดการผ่านหน้าการเชื่อมต่อ AI', 'Manage API keys in AI connections'],
  googleIntro: [
    'ให้ AI ช่วยค้นเมล ดูนัด และหาไฟล์ในบัญชี Google ของงานคุณ',
    'Let the AI search your mail, check your calendar and find files in your work Google account.',
  ],
  googleSeparate: ['แยกจากการลงชื่อ Gemini ในหน้าการเชื่อมต่อ AI', 'Separate from the Gemini sign-in under AI connections.'],
  step1: ['เลือกบริการ', 'Choose services'],
  step2: ['ลงชื่อด้วยบัญชีงานในเบราว์เซอร์', 'Sign in with your work account in the browser'],
  step3: ['ถามในแชตได้เลย', 'Ask in chat'],
  promise: [
    'AI ขออนุญาตคุณทุกครั้งก่อนอ่านหรือเปลี่ยนข้อมูล และไม่เห็นรหัสผ่านหรือ token ของคุณ',
    'The AI asks you every time before it reads or changes anything, and never sees your password or token.',
  ],
  readOnly: ['อ่านอย่างเดียว', 'Read only'],
  canChange: ['แก้ไขได้ · ถามก่อนทุกครั้ง', 'Can change · asks first'],
  adminMore: [
    'Gmail และการค้นไฟล์ Drive ทั้งหมดยังปิดอยู่ ต้องให้ผู้ดูแลระบบเปิดก่อน',
    'Gmail and searching all Drive files are off until an administrator turns them on.',
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
  hideFiles: ['ซ่อนรายการไฟล์', 'Hide files'],
  noFiles: ['ยังไม่มีไฟล์ที่แอปนี้เปิดได้', 'No files this app can open yet'],
  files: ['เลือกไฟล์ที่บัญชีนี้เข้าถึงได้', 'Select files this account can access'],
  fileScope: [
    'รายการนี้จำกัดตามสิทธิ์จริง drive.file ไม่เปิดไฟล์ทั้งหมดจากการวางลิงก์',
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
};
const lang = () => (language() === 'en' ? 1 : 0);
const serviceName = (s: string) => SERVICES[s as GoogleService]?.name[lang()] || s;
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
    entries: VaultMetadata[];
    browsers: { id: string; sessionId: string; origin: string }[];
  }>();
  const [google, setGoogle] = useState<{
    enabled: boolean;
    configured: boolean;
    connecting: boolean;
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
  }>();
  const [services, setServices] = useState<GoogleService[]>(['documents']);
  const [busy, setBusy] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string }[]>();
  const [query, setQuery] = useState('');
  const reload = async () => {
    const [v, g] = await Promise.all([call('vaultState'), call('googleState')]);
    setVault(v);
    setGoogle(g);
  };
  useEffect(() => {
    let alive = true;
    void Promise.all([call('vaultState'), call('googleState')])
      .then(([v, g]) => {
        if (alive) {
          setVault(v);
          setGoogle(g);
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
    try {
      await action();
      await reload();
    } catch (error) {
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
        {vault?.protected && <p className="credential-note">{w('conflict')}</p>}
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
            {Boolean(google.accounts.length) && <h3 className="google-subhead">{w('yourAccounts')}</h3>}
            {google.accounts.map(account => {
              const state = account.reauth ? 'attention' : account.paused ? 'paused' : 'ready';
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
                      {account.reauth ? w('reconnect') : account.paused ? w('paused') : w('connected')}
                    </span>
                  </div>
                  {account.reauth && <p className="muted small">{w('reauthHint')}</p>}
                  <ul className="google-chips" aria-label={w('selectServices')}>
                    {account.services.map(s => {
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
                    {account.reauth && (
                      <button
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void run('google-connect', () =>
                            call('googleConnect', {
                              services: account.services.filter(s => google.services.includes(s as GoogleService)),
                            }),
                          )
                        }
                      >
                        <RefreshCw size={14} />
                        {w('reconnect')}
                      </button>
                    )}
                    {account.services.some(s => s === 'documents' || s === 'drive-read') && (
                      <button
                        className="quiet"
                        disabled={Boolean(busy) || account.paused || account.reauth}
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
            <fieldset className="google-services">
              <legend>{google.accounts.length ? w('addAccount') : w('selectServices')}</legend>
              {google.services.map(s => {
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
            {!google.services.includes('gmail-read') && <p className="muted small google-admin">{w('adminMore')}</p>}
            <div className="google-connect-row">
              <button
                disabled={Boolean(busy) || !services.length}
                onClick={() =>
                  void run('google-connect', () => call('googleConnect', { services: services.filter(s => google.services.includes(s)) }))
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
