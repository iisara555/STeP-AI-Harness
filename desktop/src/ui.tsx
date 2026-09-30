import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, Search, X } from 'lucide-react';
import type { Session } from './types';
import { markdownDocument, type DraftNode } from './draft';

// The one way the app asks "are you sure": focused, Enter confirms, Esc cancels, errors stay inline.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'ยกเลิก',
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => Promise<unknown> | unknown;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const confirm = async () => {
    if (pending) return;
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
          <button className="quiet" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button autoFocus className={tone === 'danger' ? 'danger' : ''} disabled={pending} onClick={() => void confirm()}>
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
      <section role="dialog" aria-modal="true" aria-label="คำสั่ง" className="palette">
        <label className="palette-search">
          <Search size={16} />
          <input
            autoFocus
            placeholder="พิมพ์เพื่อค้นหางานหรือคำสั่ง…"
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
          {!matches.length && <p className="muted small palette-empty">ไม่พบงานหรือคำสั่งที่ตรงกัน</p>}
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
    ['วันนี้', t => t >= today],
    ['เมื่อวาน', t => t >= today - DAY],
    ['7 วันที่ผ่านมา', t => t >= today - 7 * DAY],
    ['30 วันที่ผ่านมา', t => t >= today - 30 * DAY],
    ['เก่ากว่านั้น', () => true],
  ];
  const sorted = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const groups: { label: string; sessions: Session[] }[] = [];
  const pinned = sorted.filter(s => s.pinned);
  if (pinned.length) groups.push({ label: 'ปักหมุด', sessions: pinned });
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
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
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
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          {t.tone === 'error' ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
          <span>{t.text}</span>
          {t.action && (
            <button
              className="text-link"
              onClick={() => {
                dismiss(t.id);
                void t.action!.run();
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon" aria-label="ปิดข้อความ" onClick={() => dismiss(t.id)}>
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
          ? 'ลงชื่อบัญชี Claude ผ่านเบราว์เซอร์ แล้วรับคำตอบใน STeP ใช้ Claude Code รุ่น 2.1.268 ขึ้นไปที่ติดตั้งในเครื่อง บัญชีใน STeP แยกจาก Claude Code ส่วนตัว'
          : 'ส่งงานต่อให้ Claude Code ส่วนตัว: เลือก “Claude · Pro/Max (เปิดใน Claude Code)” ในกล่องพิมพ์ แอปจะคัดลอกคำขอและเปิด Claude Code ในโฟลเดอร์งานให้'}
      </p>
      <p className={installed ? 'connected small' : 'small muted'}>
        {installed === null
          ? 'กำลังตรวจหา Claude Code…'
          : installed
            ? 'พบ Claude Code · จะตรวจรุ่นเมื่อเชื่อมต่อ'
            : 'ยังไม่พบ Claude Code ในเครื่องนี้'}
      </p>
      {installed === false && (
        <button className="quiet" onClick={() => void call('openHelp', { topic: 'claudeCode' })}>
          เปิดวิธีติดตั้ง Claude Code
        </button>
      )}
      <button className="quiet" onClick={check}>
        ตรวจอีกครั้ง
      </button>
    </div>
  );
}

export function AnthropicOAuthNote({ call }: { call: (method: string, input?: any) => Promise<any> }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const check = () => {
    setInstalled(null);
    void Promise.resolve()
      .then(() => call('anthropicCli'))
      .then((result: any) => setInstalled(result.installed))
      .catch(() => setInstalled(false));
  };
  useEffect(check, []);
  return (
    <div className="claude-code-note">
      <p className="small">
        OAuth นี้เป็นของ Claude Console และใช้ค่าใช้จ่าย/โควตา API ของ workspace ที่เลือก ไม่ใช่โควตา Claude Pro/Max STeP เก็บ profile
        แยกในเครื่องและให้ ant CLI จัดการ token กับการ refresh
      </p>
      <p className={installed ? 'connected small' : 'small muted'}>
        {installed === null
          ? 'กำลังตรวจหา ant CLI…'
          : installed
            ? 'พบ Anthropic ant CLI · พร้อมเปิด OAuth'
            : 'ยังไม่พบ Anthropic ant CLI ในเครื่องนี้'}
      </p>
      {installed === false && (
        <button className="quiet" onClick={() => void call('openHelp', { topic: 'anthropicCli' })}>
          เปิดวิธีติดตั้ง ant CLI
        </button>
      )}
      <button className="quiet" onClick={check}>
        ตรวจอีกครั้ง
      </button>
    </div>
  );
}

// Provider, sign-in method and API key: the same fields in the setup wizard and in Settings.
export type ProviderChoice = { provider: string; mode: string; key: string; googleCloudProject: string };
export const initialChoice: ProviderChoice = { provider: 'openai', mode: 'subscription', key: '', googleCloudProject: '' };
export function ProviderFields({
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
  const subscription = provider !== 'claude' || claudeSubscription;
  return (
    <>
      <div className="form-grid">
        <label>
          ผู้ให้บริการ
          <select
            value={provider}
            onChange={e =>
              onChange({
                provider: e.target.value,
                mode: e.target.value === 'claude' ? 'oauth' : 'subscription',
                key: '',
                googleCloudProject: '',
              })
            }
          >
            <option value="openai">OpenAI (ChatGPT)</option>
            <option value="gemini">Gemini (Google)</option>
            <option value="claude">Claude (Anthropic)</option>
          </select>
        </label>
        <label>
          วิธีเชื่อมต่อ
          <select value={mode} onChange={e => onChange({ ...value, mode: e.target.value })}>
            {provider === 'claude' && <option value="oauth">Claude Console OAuth (ไม่ต้องใช้ API key)</option>}
            {subscription && (
              <option value="subscription">
                {provider === 'claude'
                  ? 'บัญชี Claude Pro/Max (เฉพาะ deployment ที่ได้รับอนุมัติ)'
                  : provider === 'gemini'
                    ? 'Google OAuth'
                    : 'บัญชีส่วนตัว (ลงชื่อเข้าใช้)'}
              </option>
            )}
            {provider === 'claude' && <option value="claude-code">Claude Pro/Max (เปิดใน Claude Code ภายนอก)</option>}
            <option value="api">API key</option>
          </select>
        </label>
      </div>
      {provider === 'gemini' && mode === 'subscription' && (
        <label>
          Google Cloud Project ID <span className="muted small">(ถ้าเป็นบัญชี CMU/องค์กร)</span>
          <input
            value={googleCloudProject}
            onChange={e => onChange({ ...value, googleCloudProject: e.target.value.trim() })}
            placeholder="เช่น my-project-123456 · บัญชีส่วนตัวเว้นว่างได้"
            autoComplete="off"
          />
          <span className="small muted">
            Google Workspace/องค์กรบางบัญชีต้องมี Project ID; Google ส่วนตัวและ AI Pro/Ultra ปกติไม่ต้องกรอก
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
              placeholder="เก็บเข้ารหัสในเครื่องนี้"
            />
          </label>
        )
      )}
    </>
  );
}
