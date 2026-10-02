import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, Search, X } from 'lucide-react';
import type { Session } from './types';
import { markdownDocument, type DraftNode } from './draft';
import { explainError } from './messages';
import { t } from './i18n';

// The one way the app asks "are you sure": focused, Enter confirms, Esc cancels, errors stay inline.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = t('ยกเลิก'),
  tone = 'default',
  onConfirm,
  onCancel,
  focusCancel = false,
  confirmDisabled = false,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => Promise<unknown> | unknown;
  onCancel: () => void;
  focusCancel?: boolean;
  /** Keeps the confirm button off until the dialog's own condition (such as an accepted checkbox) is met. */
  confirmDisabled?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const confirm = async () => {
    if (pending || confirmDisabled) return;
    setPending(true);
    setError('');
    try {
      await onConfirm();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setPending(false);
    }
  };
  return (
    <div
      className="dialog-backdrop"
      onKeyDown={e => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <section role="alertdialog" aria-modal="true" aria-label={title} className="confirm-dialog">
        <h2>{title}</h2>
        <div className="confirm-body">{children}</div>
        {error && (
          <p className="confirm-error" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button autoFocus={focusCancel} className="quiet" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            autoFocus={!focusCancel}
            className={tone === 'danger' ? 'danger' : ''}
            disabled={pending || confirmDisabled}
            onClick={() => void confirm()}
          >
            {pending && <LoaderCircle size={15} className="spin" />}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export type PaletteItem = { id: string; group: string; label: string; hint?: string; run: () => unknown };
// Thai has no case, but Latin model names should match regardless of case, hyphens, or dots.
const fold = (value: string) =>
  value
    .toLowerCase()
    .replace(/[-_.\s]+/g, ' ')
    .trim();

export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState(''),
    [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const q = fold(query);
    return q ? items.filter(i => fold(i.label + ' ' + (i.hint || '') + ' ' + i.group).includes(q)) : items;
  }, [items, query]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const run = (item?: PaletteItem) => {
    if (!item) return;
    onClose();
    void item.run();
  };
  let group = '';
  return (
    <div
      className="dialog-backdrop palette-backdrop"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-label={t('คำสั่ง')} className="palette">
        <label className="palette-search">
          <Search size={16} />
          <input
            autoFocus
            placeholder={t('พิมพ์เพื่อค้นหางานหรือคำสั่ง…')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(a => Math.min(a + 1, matches.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(a => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                run(matches[active]);
              }
              if (e.key === 'Escape') onClose();
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
        </label>
        <div className="palette-list" id="palette-list" role="listbox" ref={list}>
          {matches.map((item, index) => {
            const heading = item.group !== group ? (group = item.group) : '';
            return (
              <div key={item.id}>
                {heading && <div className="palette-group">{heading}</div>}
                <button
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? 'active' : ''}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(item)}
                >
                  <span>{item.label}</span>
                  {item.hint && <small>{item.hint}</small>}
                </button>
              </div>
            );
          })}
          {!matches.length && <p className="muted small palette-empty">{t('ไม่พบงานหรือคำสั่งที่ตรงกัน')}</p>}
        </div>
      </section>
    </div>
  );
}

const DAY = 86_400_000;
// Pinned first, then recency buckets, each newest first.
export function groupSessions(sessions: Session[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets: [string, (t: number) => boolean][] = [
    [t('วันนี้'), t => t >= today],
    [t('เมื่อวาน'), t => t >= today - DAY],
    [t('7 วันที่ผ่านมา'), t => t >= today - 7 * DAY],
    [t('30 วันที่ผ่านมา'), t => t >= today - 30 * DAY],
    [t('เก่ากว่านั้น'), () => true],
  ];
  const sorted = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const groups: { label: string; sessions: Session[] }[] = [];
  const pinned = sorted.filter(s => s.pinned);
  if (pinned.length) groups.push({ label: t('ปักหมุด'), sessions: pinned });
  for (const s of sorted.filter(s => !s.pinned)) {
    const label = buckets.find(([, test]) => test(new Date(s.updatedAt).getTime()))![0];
    const group = groups.find(g => g.label === label);
    if (group) group.sessions.push(s);
    else groups.push({ label, sessions: [s] });
  }
  return groups;
}

// Search what the user remembers: title, project, conversation, or draft text.
export function matchesSession(session: Session, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [session.title, session.project, session.draft, ...session.messages.map(m => m.text)].some(text =>
    text?.toLowerCase().includes(q),
  );
}

export const formatTokens = (value: number) =>
  value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + 'M' : value >= 1000 ? (value / 1000).toFixed(1) + 'k' : String(value);
export const formatElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Renders model Markdown through the bounded draft schema: no HTML, links, or images reach the DOM.
function node(n: DraftNode, key: number): ReactNode {
  const children = (n.content || []).map(node);
  switch (n.type) {
    case 'text': {
      let out: ReactNode = n.text;
      for (const m of n.marks || []) out = m.type === 'bold' ? <strong>{out}</strong> : <em>{out}</em>;
      return <span key={key}>{out}</span>;
    }
    case 'hardBreak':
      return <br key={key} />;
    case 'heading':
      return n.attrs?.level === 1 ? <h3 key={key}>{children}</h3> : <h4 key={key}>{children}</h4>;
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={n.attrs?.start}>
          {children}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{children}</li>;
    default:
      return <p key={key}>{children}</p>;
  }
}
export type ChatBlock = { kind: 'text' | 'code' | 'table'; text: string; language?: string; rows?: string[][] };
export function chatBlocks(text: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  const lines = text.replace(/\r\n/g, '\n').slice(0, 150000).split('\n');
  let pending: string[] = [];
  const flush = () => {
    if (pending.length) blocks.push({ kind: 'text', text: pending.join('\n') });
    pending = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s{0,3}(`{3,}|~{3,})([\w+-]*)\s*$/.exec(lines[i]);
    if (fence) {
      flush();
      const content: string[] = [];
      i++;
      for (; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) content.push(lines[i]);
      if (fence[2] !== 'step-tool') blocks.push({ kind: 'code', text: content.join('\n'), language: fence[2] });
      continue;
    }
    if (lines[i].includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1] || '')) {
      flush();
      const row = (line: string) =>
        line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .slice(0, 20)
          .map(c => c.trim());
      const rows = [row(lines[i])];
      i += 2;
      for (; i < lines.length && lines[i].trim() && lines[i].includes('|') && rows.length < 100; i++) rows.push(row(lines[i]));
      i--;
      blocks.push({ kind: 'table', text: '', rows });
      continue;
    }
    pending.push(lines[i]);
  }
  flush();
  return blocks;
}
function CodeBlock({ block }: { block: ChatBlock }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="chat-code">
      <header>
        <span>{block.language || 'text'}</span>
        <button
          className="quiet"
          onClick={() =>
            void navigator.clipboard
              .writeText(block.text)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => setCopied(false))
          }
        >
          {copied ? t('คัดลอกแล้ว') : t('คัดลอกโค้ด')}
        </button>
      </header>
      <pre>
        <code>{block.text}</code>
      </pre>
    </figure>
  );
}
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = useMemo(() => chatBlocks(text), [text]);
  return (
    <div className={'rich-text ' + className}>
      {blocks.map((block, i) =>
        block.kind === 'code' ? (
          <CodeBlock key={i} block={block} />
        ) : block.kind === 'table' ? (
          <div className="chat-table" key={i}>
            <table>
              <thead>
                <tr>
                  {block.rows?.[0].map((cell, j) => (
                    <th key={j}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows?.slice(1).map((row, j) => (
                  <tr key={j}>
                    {row.map((cell, k) => (
                      <td key={k}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div key={i}>{(markdownDocument(block.text).content || []).map(node)}</div>
        ),
      )}
    </div>
  );
}

export type Toast = { id: number; text: string; tone: 'info' | 'success' | 'error'; action?: { label: string; run: () => unknown } };
// Toasts replace banners: they stack bottom-right, dismiss themselves, and never steal focus.
export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  useEffect(() => {
    const timers = toasts.map(t => setTimeout(() => dismiss(t.id), t.tone === 'error' ? 9000 : t.action ? 8000 : 4500));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'error' ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="text-link"
              onClick={() => {
                dismiss(toast.id);
                void toast.action!.run();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className="icon" aria-label={t('ปิดข้อความ')} onClick={() => dismiss(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Shared installation guidance for in-app subscription chat and external handoff.
export function ClaudeCodeNote({
  call,
  subscription = false,
}: {
  call: (method: string, input?: any) => Promise<any>;
  subscription?: boolean;
}) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const check = () => {
    setInstalled(null);
    void Promise.resolve()
      .then(() => call('claudeCode'))
      .then((r: any) => setInstalled(r.installed))
      .catch(() => setInstalled(false));
  };
  useEffect(check, []);
  return (
    <div className="claude-code-note">
      <p className="small">
        {subscription
          ? t('ลงชื่อบัญชี Claude ผ่านเบราว์เซอร์ แล้วกลับมารับคำตอบใน STeP')
          : t(
              'ส่งงานต่อให้ Claude Code ส่วนตัว: เลือก “Claude · Pro/Max (เปิดใน Claude Code)” ในกล่องพิมพ์ แอปจะคัดลอกคำขอและเปิด Claude Code ในโฟลเดอร์งานให้',
            )}
      </p>
      <p className={installed ? 'connected small' : 'small muted'}>
        {installed === null
          ? t('กำลังตรวจความพร้อม…')
          : installed
            ? t('พบตัวเชื่อมต่อ · จะตรวจความพร้อมอีกครั้งเมื่อเชื่อมต่อ')
            : t('เครื่องนี้ยังขาดส่วนเสริมสำหรับ Claude ให้ผู้ดูแลช่วยติดตั้งครั้งแรก')}
      </p>
      {installed === false && (
        <button className="quiet" onClick={() => void call('openHelp', { topic: 'claudeCode' })}>
          {t('เปิดวิธีติดตั้ง Claude Code')}
        </button>
      )}
      <button className="quiet" onClick={check}>
        {t('ตรวจอีกครั้ง')}
      </button>
    </div>
  );
}

export function AnthropicOAuthNote({ call }: { call: (method: string, input?: any) => Promise<any> }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [failure, setFailure] = useState('');
  const check = () => {
    setInstalled(null);
    void Promise.resolve()
      .then(() => call('anthropicCli'))
      .then((result: any) => {
        setInstalled(result.installed);
        setInstallable(result.installable === true);
        setInstalling(result.installing === true);
      })
      .catch(() => setInstalled(false));
  };
  useEffect(check, []);
  const install = () => {
    setInstalling(true);
    setFailure('');
    void call('anthropicCliInstall')
      .then((result: any) => setInstalled(result.installed))
      .catch(error => setFailure(explainError(error)))
      .finally(() => setInstalling(false));
  };
  return (
    <div className="claude-code-note">
      <p className="small">
        {t(
          'OAuth นี้เป็นของ Claude Console และใช้ค่าใช้จ่าย/โควตา API ของ workspace ที่เลือก ไม่ใช่โควตา Claude Pro/Max STeP เก็บ profile แยกในเครื่องและให้ ant CLI จัดการ token กับการ refresh',
        )}
      </p>
      <p className={installed ? 'connected small' : 'small muted'}>
        {installed === null
          ? t('กำลังตรวจหา ant CLI…')
          : installed
            ? t('พบ Anthropic ant CLI · พร้อมเปิด OAuth')
            : installing
              ? t('กำลังติดตั้ง ant CLI ทางการของ Anthropic…')
              : installable
                ? t(
                    'ยังไม่มี ant CLI · STeP ติดตั้งรุ่นทางการ (ตรวจ checksum แล้ว ~10 MB) ให้ได้ หรือจะติดตั้งให้อัตโนมัติเมื่อกดเชื่อมต่อ',
                  )
                : t('ยังไม่พบ Anthropic ant CLI ในเครื่องนี้')}
      </p>
      {failure && <p className="small danger-text">{failure}</p>}
      {installed === false && installable && (
        <button disabled={installing} onClick={install}>
          {installing ? t('กำลังติดตั้ง…') : t('ติดตั้ง ant CLI')}
        </button>
      )}
      {installed === false && (
        <button className="quiet" onClick={() => void call('openHelp', { topic: 'anthropicCli' })}>
          {t('เปิดวิธีติดตั้งเอง')}
        </button>
      )}
      <button className="quiet" onClick={check}>
        {t('ตรวจอีกครั้ง')}
      </button>
    </div>
  );
}

// Provider, sign-in method and API key: the same fields in the setup wizard and in Settings.
export type ProviderChoice = {
  provider: string;
  mode: string;
  key: string;
  googleCloudProject: string;
  baseUrl?: string;
  protocol?: 'openai' | 'anthropic';
  model?: string;
};
export const initialChoice: ProviderChoice = { provider: 'openai', mode: 'subscription', key: '', googleCloudProject: '' };
export function providerChoiceReady(c: ProviderChoice) {
  if (c.provider === 'antigravity') return c.mode === 'subscription' && /^gemini-[\w.-]+$/.test(c.model || '') && !c.key;
  if (c.provider === 'gemini' && c.mode === 'subscription') return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(c.googleCloudProject);
  if (c.provider === 'compatible') return Boolean(c.baseUrl?.trim() && c.model?.trim() && (c.protocol !== 'anthropic' || c.key.trim()));
  return c.mode !== 'api' || Boolean(c.key.trim());
}
export function providerDefaultMode(provider: string): ProviderChoice['mode'] {
  return ['claude', 'copilot'].includes(provider) ? 'oauth' : ['gemini', 'compatible'].includes(provider) ? 'api' : 'subscription';
}
export function ProviderFields(props: {
  value: ProviderChoice;
  onChange: (next: ProviderChoice) => void;
  call: (method: string, input?: any) => Promise<any>;
  claudeSubscription?: boolean;
}) {
  const [advanced, setAdvanced] = useState(false);
  return (
    <>
      {!advanced ? (
        <div>
          <p>{t('บัญชีที่ใช้งานใน STeP ได้: เลือกแล้วกดเชื่อมต่อ ChatGPT จะเปิดหน้าลงชื่อในเบราว์เซอร์ ส่วน Gemini ใช้ API key')}</p>
          <div className="choice-row" role="group" aria-label={t('เลือกบัญชี AI')}>
            <button
              type="button"
              className={props.value.provider === 'openai' ? 'choice active' : 'choice'}
              aria-pressed={props.value.provider === 'openai'}
              onClick={() => props.onChange({ ...initialChoice })}
            >
              ChatGPT
            </button>
            {props.claudeSubscription && (
              <button
                type="button"
                className={props.value.provider === 'claude' ? 'choice active' : 'choice'}
                aria-pressed={props.value.provider === 'claude'}
                onClick={() => props.onChange({ ...initialChoice, provider: 'claude', mode: 'subscription' })}
              >
                Claude Pro / Max
              </button>
            )}
            <button
              type="button"
              className={props.value.provider === 'gemini' && props.value.mode === 'api' ? 'choice active' : 'choice'}
              aria-pressed={props.value.provider === 'gemini' && props.value.mode === 'api'}
              onClick={() => props.onChange({ ...initialChoice, provider: 'gemini', mode: 'api' })}
            >
              Gemini · API key
            </button>
          </div>
          {props.value.provider === 'gemini' && props.value.mode === 'api' && (
            <div className="gemini-key">
              <label>
                Gemini API key
                <input
                  type="password"
                  autoComplete="off"
                  value={props.value.key}
                  onChange={e => props.onChange({ ...props.value, key: e.target.value })}
                  placeholder={t('วางคีย์จาก Google AI Studio · เก็บเข้ารหัสในเครื่องนี้')}
                />
              </label>
              <button type="button" className="quiet" onClick={() => void props.call('openHelp', { topic: 'geminiKey' })}>
                {t('ขอ API key จาก Google AI Studio')}
              </button>
              <p className="small muted">{t('ถ้าใช้คีย์แบบฟรี ให้ตรวจเงื่อนไขของ Google เรื่องการนำข้อมูลไปใช้ก่อนส่งงานขององค์กร')}</p>
            </div>
          )}
          <details>
            <summary>{t('มีบัญชี Claude หรือ Gemini อยู่แล้ว?')}</summary>
            {!props.claudeSubscription && (
              <p className="small muted">
                {t('Claude Pro/Max: ใช้ผ่าน Claude Code ภายนอกได้จากตัวเลือก AI ในหน้างาน การคุยใน STeP ยังไม่เปิดสำหรับบัญชีนี้')}
              </p>
            )}
            <p className="small muted">
              {t(
                'Gemini: ใช้ API key จาก Google AI Studio ได้จากปุ่ม “Gemini · API key” ด้านบน ส่วนการลงชื่อด้วยบัญชี Google ส่วนตัวใช้ไม่ได้แล้ว เพราะ Google หยุดให้บริการ Gemini CLI กับบัญชีส่วนตัว',
              )}
            </p>
          </details>
          <p className="small muted">
            {props.value.mode === 'api'
              ? t('ระบบจะทดสอบด้วยข้อความสั้นหนึ่งครั้งโดยใช้คีย์นี้')
              : t('ไม่ต้องกรอก API key ระบบจะทดสอบด้วยข้อความสั้นหนึ่งครั้ง โดยใช้สิทธิ์ของบัญชีคุณ')}
          </p>
          {props.value.provider === 'claude' && props.claudeSubscription && <ClaudeCodeNote call={props.call} subscription />}
        </div>
      ) : (
        <AdvancedProviderFields {...props} />
      )}
      <p className="connection-cost" role="status">
        {props.value.mode === 'claude-code'
          ? t('เปิดแอปอื่น · ใช้บัญชี Claude Code ของคุณ ผลงานจะไม่กลับเข้า STeP อัตโนมัติ')
          : props.value.mode === 'api' || (props.value.provider === 'claude' && props.value.mode === 'oauth')
            ? t(
                'ใช้งบ API · คิดตามการใช้กับบัญชีหรือโครงการของเจ้าของคีย์/สิทธิ์ที่เลือก โปรดยืนยันผู้รับผิดชอบค่าใช้จ่ายก่อนเชื่อมต่อ ไม่ใช้แพ็กเกจแชตส่วนตัว',
              )
            : props.value.provider === 'gemini' || props.value.provider === 'copilot'
              ? t('ใช้สิทธิ์บัญชีองค์กรที่ลงชื่อ · ให้ผู้ดูแลยืนยันสิทธิ์และโควตาก่อนใช้งาน')
              : t('ใช้แพ็กเกจบัญชีที่คุณลงชื่อ · ระบบไม่สลับไปใช้งบ API อัตโนมัติ')}
      </p>
      <button
        type="button"
        className="text-link"
        aria-expanded={advanced}
        onClick={() => {
          setAdvanced(!advanced);
          // Returning to account sign-in must never retain an API key or a Console billing route.
          if (advanced) props.onChange({ ...initialChoice });
        }}
      >
        {advanced ? t('กลับไปเชื่อมต่อบัญชีส่วนตัว') : t('ตั้งค่าขั้นสูงสำหรับผู้ดูแล')}
      </button>
    </>
  );
}

function AdvancedProviderFields({
  value,
  onChange,
  call,
  claudeSubscription = false,
}: {
  value: ProviderChoice;
  onChange: (next: ProviderChoice) => void;
  call: (method: string, input?: any) => Promise<any>;
  claudeSubscription?: boolean;
}) {
  const { provider, mode, key, googleCloudProject } = value;
  const subscription = ['openai', 'gemini', 'antigravity'].includes(provider) || (provider === 'claude' && claudeSubscription);
  return (
    <>
      <div className="form-grid">
        <label>
          {t('ผู้ให้บริการ')}
          <select
            value={provider}
            onChange={e =>
              onChange({
                provider: e.target.value,
                // Gemini sign-in now serves only organization licenses, so an API key is the usual choice.
                mode: providerDefaultMode(e.target.value),
                baseUrl: 'https://api.openai.com/v1',
                protocol: 'openai',
                model: e.target.value === 'antigravity' ? 'gemini-3.8-flash-medium' : '',
                key: '',
                googleCloudProject: '',
              })
            }
          >
            <option value="openai">OpenAI (ChatGPT)</option>
            <option value="gemini">Gemini (Google)</option>
            <option value="antigravity">Gemini via Antigravity (experimental)</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="compatible">Compatible endpoint / Ollama</option>
            <option value="copilot">GitHub Copilot</option>
          </select>
        </label>
        <label>
          {t('วิธีเชื่อมต่อ')}
          <select value={mode} onChange={e => onChange({ ...value, mode: e.target.value })}>
            {provider === 'copilot' && <option value="oauth">{t('GitHub OAuth (บัญชี Copilot)')}</option>}
            {provider === 'claude' && <option value="oauth">{t('Claude Console OAuth (ไม่ต้องใช้ API key)')}</option>}
            {subscription && (
              <option value="subscription">
                {provider === 'antigravity'
                  ? 'Personal Google account (native Antigravity sign-in)'
                  : provider === 'claude'
                    ? t('บัญชี Claude Pro/Max (เฉพาะ deployment ที่ได้รับอนุมัติ)')
                    : provider === 'gemini'
                      ? t('บัญชีองค์กร Google (Gemini Code Assist Standard/Enterprise)')
                      : t('บัญชีส่วนตัว (ลงชื่อเข้าใช้)')}
              </option>
            )}
            {provider === 'claude' && <option value="claude-code">{t('Claude Pro/Max (เปิดใน Claude Code ภายนอก)')}</option>}
            {!['copilot', 'antigravity'].includes(provider) && <option value="api">API key</option>}
          </select>
        </label>
      </div>
      {provider === 'compatible' && (
        <div className="form-grid">
          <label>
            API protocol
            <select
              value={value.protocol || 'openai'}
              onChange={e => onChange({ ...value, protocol: e.target.value as 'openai' | 'anthropic' })}
            >
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic Messages</option>
            </select>
          </label>
          <label>
            {t('ชื่อ model')}
            <input value={value.model || ''} onChange={e => onChange({ ...value, model: e.target.value })} autoComplete="off" />
          </label>
          <label>
            Base URL
            <input value={value.baseUrl || ''} onChange={e => onChange({ ...value, baseUrl: e.target.value })} autoComplete="off" />
          </label>
          <button
            className="quiet"
            onClick={() => onChange({ ...value, baseUrl: 'http://127.0.0.1:11434/v1', protocol: 'openai', key: '' })}
          >
            {t('ใช้ Ollama ในเครื่อง')}
          </button>
          <p className="small muted">{t('ใช้ได้เฉพาะปลายทางที่ผู้ดูแลอนุญาต ต้องตรวจข้อมูลและอนุมัติส่งเช่นเดียวกับบัญชีอื่น')}</p>
        </div>
      )}
      {provider === 'copilot' && (
        <p className="small muted">{t('ลงชื่อผ่าน GitHub OAuth App ที่องค์กรกำหนด ใช้สิทธิ์และโควตาของบัญชี Copilot ที่ลงชื่อ')}</p>
      )}
      {provider === 'antigravity' && (
        <div>
          <label>
            Gemini model
            <input value={value.model || ''} onChange={e => onChange({ ...value, model: e.target.value.trim() })} autoComplete="off" />
          </label>
          <p className="small muted">
            Experimental: uses the Google account signed in to Antigravity on this device. Disconnecting STeP keeps that native account
            signed in. Current CLI 1.2.14 cannot confirm that all native tools are disabled, so STeP stops before sending a request.
          </p>
          <button className="quiet" onClick={() => void call('openHelp', { topic: 'antigravity' })}>
            Antigravity installation and sign-in guide
          </button>
        </div>
      )}
      {provider === 'gemini' && mode === 'subscription' && (
        <label>
          Google Cloud Project ID <span className="muted small">{t('(จำเป็น)')}</span>
          <input
            value={googleCloudProject}
            onChange={e => onChange({ ...value, googleCloudProject: e.target.value.trim() })}
            placeholder={t('เช่น my-project-123456')}
            autoComplete="off"
          />
          <span className="small muted">
            {t(
              'Google หยุดให้บริการ Gemini CLI กับบัญชี Google ส่วนตัวและ Google AI Pro/Ultra ตั้งแต่ 18 มิ.ย. 2569 วิธีนี้ใช้ได้เฉพาะบัญชีองค์กรที่มี Gemini Code Assist Standard/Enterprise ผูกกับ Project นี้ บัญชีส่วนตัวให้เลือก “API key” แล้วใช้ Gemini API key แทน',
            )}
          </span>
        </label>
      )}
      {provider === 'claude' && mode === 'oauth' && <AnthropicOAuthNote call={call} />}
      {provider === 'claude' && mode === 'subscription' && claudeSubscription && <ClaudeCodeNote call={call} subscription />}
      {mode === 'claude-code' ? (
        <ClaudeCodeNote call={call} />
      ) : (
        mode === 'api' && (
          <label>
            API key
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={e => onChange({ ...value, key: e.target.value })}
              placeholder={t('เก็บเข้ารหัสในเครื่องนี้')}
            />
          </label>
        )
      )}
    </>
  );
}
