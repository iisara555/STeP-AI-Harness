import { useEffect, useState } from 'react';
import { LockKeyhole, Globe, ExternalLink, Plus, Pause, Play, Trash2, Pencil } from 'lucide-react';
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
    'เชื่อมบัญชีงานของคุณและเลือกบริการที่จะใช้ การเชื่อม AI ด้วย Google เป็นสิทธิ์คนละชุด',
    'Connect your work account and select services. Google AI sign-in grants separate access.',
  ],
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
  noAccounts: ['ยังไม่มีบัญชี Google Workspace', 'No Google Workspace accounts connected'],
  open: ['เปิดบริการต้นฉบับ', 'Open original service'],
  verifyBrowser: [
    'ตรวจบัญชีที่มุมขวาของ Google อีกครั้ง บัญชีใน browser อาจต่างจากบัญชีที่เชื่อมในแอป',
    'Verify the account in Google. Your browser account can differ from the account connected here.',
  ],
  selectServices: ['เลือกบริการที่ต้องใช้', 'Select the services you need'],
  files: ['เลือกไฟล์ที่บัญชีนี้เข้าถึงได้', 'Select files this account can access'],
  fileScope: [
    'รายการนี้จำกัดตามสิทธิ์จริง drive.file ไม่เปิดไฟล์ทั้งหมดจากการวางลิงก์',
    'This list follows actual grants. drive.file does not grant every file from a pasted link.',
  ],
  resumeBrowser: ['ตรวจแล้ว ให้ AI อ่านเว็บไซต์ต่อ', 'Reviewed: resume AI website reading'],
} as const;
const w = (key: keyof typeof words) => words[key][language() === 'en' ? 1 : 0];
const serviceNames: Record<GoogleService, string> = {
  documents: 'Drive / Docs / Sheets / Slides',
  'drive-read': 'Drive (read existing files)',
  'gmail-read': 'Gmail (read)',
  'gmail-draft': 'Gmail (drafts)',
  'gmail-send': 'Gmail (send)',
  calendar: 'Calendar',
  tasks: 'Tasks',
  chat: 'Chat',
  meet: 'Meet',
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
            onSubmit={event => {
              event.preventDefault();
              const input = { ...form, kind: 'website' };
              setForm(undefined);
              void run('save', () => call('vaultSave', input));
            }}
          >
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
        <input
          className="credential-search"
          aria-label={w('label')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={w('label')}
        />
        {!websites.length && <p className="muted">{w('empty')}</p>}
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
      <section className="credential-section">
        <h2>
          <Globe size={19} />
          Google Workspace
        </h2>
        <p className="muted">{w('googleIntro')}</p>
        {!google?.enabled ? (
          <p role="status">{w('googleDisabled')}</p>
        ) : !google.configured ? (
          <p role="status">{w('notConfigured')}</p>
        ) : (
          <>
            <fieldset className="google-services">
              <legend>{w('selectServices')}</legend>
              {google.services.map(s => (
                <label className="credential-check" key={s}>
                  <input
                    type="checkbox"
                    checked={services.includes(s)}
                    disabled={Boolean(busy)}
                    onChange={e => setServices(old => (e.target.checked ? [...old, s] : old.filter(v => v !== s)))}
                  />
                  {serviceNames[s]}
                </label>
              ))}
            </fieldset>
            <button
              disabled={Boolean(busy) || !services.length}
              onClick={() =>
                void run('google-connect', () => call('googleConnect', { services: services.filter(s => google.services.includes(s)) }))
              }
            >
              {w('connect')}
            </button>
          </>
        )}
        {busy === 'google-connect' && (
          <button className="quiet" onClick={() => void call('googleCancel').catch(onError)}>
            {w('cancel')}
          </button>
        )}
        {!google?.accounts.length && <p className="muted">{w('noAccounts')}</p>}
        {google?.accounts.map(account => (
          <article className="credential-account" key={account.id}>
            <div className="credential-heading">
              <div>
                <strong>{account.label}</strong>
                <p className="muted small">
                  {account.domain} · {account.reauth ? w('reconnect') : account.paused ? w('paused') : w('connected')}
                </p>
              </div>
              <button
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() => void run('google-pause', () => call('googlePause', { id: account.id, paused: !account.paused }))}
              >
                {account.paused ? w('resume') : w('pause')}
              </button>
            </div>
            <p className="muted small">{account.services.map(s => serviceNames[s as GoogleService] || s).join(' · ')}</p>
            <div className="credential-actions">
              {account.services.some(s => s === 'documents' || s === 'drive-read') && (
                <button
                  disabled={Boolean(busy) || account.paused || account.reauth}
                  onClick={() =>
                    void run('files', async () => {
                      const result = await call('googleExecute', { id: account.id, request: { operation: 'drive.list' } });
                      setFiles(result.data?.files || []);
                    })
                  }
                >
                  {w('files')}
                </button>
              )}
              <button
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() => void run('disconnect', () => call('googleDisconnect', { id: account.id, revoke: false }))}
              >
                {w('disconnect')}
              </button>
              <button
                className="quiet"
                disabled={Boolean(busy)}
                onClick={() => void run('revoke', () => call('googleDisconnect', { id: account.id, revoke: true }))}
              >
                {w('revoke')}
              </button>
            </div>
          </article>
        ))}
        {files && (
          <div className="credential-files">
            <p className="muted small">{w('fileScope')}</p>
            {files.map(file => (
              <p key={file.id}>
                <strong>{file.name}</strong> <span className="muted small">{file.id}</span>
              </p>
            ))}
          </div>
        )}
        <h3>{w('open')}</h3>
        <p className="muted small">{w('verifyBrowser')}</p>
        <div className="google-launches">
          {Object.keys(GOOGLE_PAGES).map(service => (
            <button key={service} className="quiet" onClick={() => void call('googleOpen', { service }).catch(onError)}>
              <ExternalLink size={13} />
              {service}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
