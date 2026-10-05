import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, Search, X } from 'lucide-react';
import type { Session } from './types';
import { explainError } from './messages';
import { t } from './i18n';
import { presetFor } from './provider-presets';
import { ChatMarkdown } from './chat-markdown';

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

/** Chat answers: GitHub-flavoured Markdown as in other AI apps (see chat-markdown). */
export function RichText({ text, className = '', onLink }: { text: string; className?: string; onLink?: (url: string) => void }) {
  return <ChatMarkdown text={text} className={className} onLink={onLink} />;
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
          ? t('ลงชื่อบัญชี Claude ของคุณในหน้าของ Anthropic แล้วกลับมาคุยใน STeP ใช้โควตาแพ็กเกจของคุณเอง STeP ไม่เห็นรหัสผ่านหรือ token')
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
  /** A well-known service from provider-presets (OpenRouter, DeepSeek, ...). */
  preset?: string;
};
export const initialChoice: ProviderChoice = { provider: 'openai', mode: 'subscription', key: '', googleCloudProject: '' };
export function providerChoiceReady(c: ProviderChoice) {
  if (c.provider === 'antigravity') return c.mode === 'subscription' && /^gemini-[\w.-]+$/.test(c.model || '') && !c.key;
  if (c.provider === 'compatible' && c.preset) {
    const preset = presetFor(c.preset);
    // OpenRouter can issue the key itself through its sign-in page.
    return Boolean(preset && (preset.key === 'none' || preset.signIn || c.key.trim()));
  }
  if (c.provider === 'compatible') return Boolean(c.baseUrl?.trim() && c.model?.trim() && (c.protocol !== 'anthropic' || c.key.trim()));
  return c.mode !== 'api' || Boolean(c.key.trim());
}
export function providerDefaultMode(provider: string): ProviderChoice['mode'] {
  return ['claude', 'copilot'].includes(provider) ? 'oauth' : ['gemini', 'compatible'].includes(provider) ? 'api' : 'subscription';
}
/** What the 'connection' call stores for this choice. */
export const connectionInput = (c: ProviderChoice) => ({
  provider: c.provider,
  mode: c.mode,
  apiKey: c.key,
  googleCloudProject: c.googleCloudProject,
  model: c.model,
  ...(c.preset ? { preset: c.preset } : { baseUrl: c.baseUrl, protocol: c.protocol }),
});
/** The connect button's words: what happens when it is pressed. */
export function connectLabel(c: ProviderChoice, fallback = t('เพิ่มการเชื่อมต่อ')) {
  const preset = c.provider === 'compatible' ? presetFor(c.preset) : undefined;
  if (preset?.signIn && !c.key.trim()) return t('ลงชื่อด้วย {0}', preset.label);
  if (preset) return t('เชื่อมต่อ {0}', preset.label);
  if (c.mode === 'subscription' && c.provider === 'openai') return t('เชื่อมต่อ ChatGPT');
  if (c.mode === 'subscription' && c.provider === 'claude') return t('เชื่อมต่อ Claude');
  if (c.mode === 'subscription' && c.provider === 'gemini') return t('เชื่อมต่อ Google');
  if (c.provider === 'antigravity') return t('เชื่อมต่อ {0}', 'Antigravity');
  if (c.mode === 'oauth' && c.provider === 'claude') return t('เชื่อมต่อ Claude OAuth');
  if (c.mode === 'api' && ['gemini', 'claude', 'openai'].includes(c.provider)) return t('เชื่อมต่อ {0}', tileName(c));
  return fallback;
}
const tileName = (c: ProviderChoice) =>
  c.provider === 'gemini' ? 'Gemini' : c.provider === 'claude' ? 'Claude API' : c.provider === 'openai' ? 'OpenAI API' : c.provider;

const ANTIGRAVITY_MODEL = 'gemini-3.8-flash-medium';
type Tile = {
  id: string;
  label: string;
  description: string;
  kind: 'account' | 'key' | 'local';
  choice: ProviderChoice;
};
function providerTiles(claudeSubscription: boolean, presets: boolean): Tile[] {
  const key = (provider: string, label: string, description: string): Tile => ({
    id: provider + '-api',
    label,
    description,
    kind: 'key',
    choice: { ...initialChoice, provider, mode: 'api' },
  });
  const preset = (id: string): Tile => {
    const p = presetFor(id)!;
    return {
      id,
      label: p.label,
      description: t(p.description),
      kind: p.key === 'none' ? 'local' : p.signIn ? 'account' : 'key',
      choice: { ...initialChoice, provider: 'compatible', mode: 'api', preset: id },
    };
  };
  return [
    {
      id: 'chatgpt',
      label: 'ChatGPT',
      description: t('ใช้แพ็กเกจ ChatGPT Plus/Pro ที่คุณมี'),
      kind: 'account',
      choice: { ...initialChoice },
    },
    ...(claudeSubscription
      ? [
          {
            id: 'claude-sub',
            label: t('แพ็กเกจของคุณผ่าน Claude Code'),
            description: t('ใช้แพ็กเกจ Claude ของคุณ ลงชื่อในหน้าของ Anthropic'),
            kind: 'account' as const,
            choice: { ...initialChoice, provider: 'claude', mode: 'subscription' },
          },
        ]
      : []),
    ...(presets ? [preset('openrouter')] : []),
    key('gemini', 'Gemini', t('คีย์จาก Google AI Studio มีแบบใช้ฟรี')),
    {
      id: 'antigravity',
      label: 'Gemini via Antigravity',
      description: t('ใช้บัญชี Google ที่ลงชื่อในแอป Antigravity บนเครื่องนี้ (ทดลอง)'),
      kind: 'account',
      choice: { ...initialChoice, provider: 'antigravity', mode: 'subscription', model: ANTIGRAVITY_MODEL },
    },
    key('claude', 'Claude API', t('คีย์จาก Anthropic Console คิดตามการใช้')),
    key('openai', 'OpenAI API', t('คีย์จาก OpenAI Platform คิดตามการใช้')),
    ...(presets ? ['deepseek', 'qwen', 'minimax', 'groq', 'mistral', 'xai', 'ollama'].map(preset) : []),
  ];
}
const tileFor = (tiles: Tile[], c: ProviderChoice) =>
  tiles.find(tile =>
    c.preset ? tile.choice.preset === c.preset : !tile.choice.preset && tile.choice.provider === c.provider && tile.choice.mode === c.mode,
  );
const MAIN_TILES = ['chatgpt', 'claude-sub', 'openrouter', 'gemini-api'];
const KIND_LABEL: Record<Tile['kind'], string> = { account: 'ลงชื่อเข้าใช้', key: 'API key', local: 'ในเครื่องนี้' };

export function ProviderFields(props: {
  value: ProviderChoice;
  onChange: (next: ProviderChoice) => void;
  call: (method: string, input?: any) => Promise<any>;
  claudeSubscription?: boolean;
  presets?: boolean;
  /** The connect button (and its progress), shown with the chosen service. */
  action?: ReactNode;
  /** First-run setup: the main services first, the rest behind "more services". */
  compact?: boolean;
}) {
  const all = providerTiles(Boolean(props.claudeSubscription), props.presets !== false);
  const selected = tileFor(all, props.value);
  const [advanced, setAdvanced] = useState(false),
    [more, setMore] = useState(false);
  const main = all.filter(tile => MAIN_TILES.includes(tile.id));
  const tiles = props.compact && !more && (!selected || MAIN_TILES.includes(selected.id)) ? main : all;
  return (
    <>
      {!advanced ? (
        <div className="provider-picker">
          <div className="provider-tiles" role="radiogroup" aria-label={t('เลือกบริการ AI')}>
            {tiles.map(tile => (
              <button
                key={tile.id}
                type="button"
                role="radio"
                aria-checked={selected?.id === tile.id}
                className={selected?.id === tile.id ? 'provider-tile active' : 'provider-tile'}
                onClick={() => props.onChange({ ...tile.choice })}
              >
                <span className="provider-tile-head">
                  <strong>{tile.label}</strong>
                  <span className={'provider-kind ' + tile.kind}>{t(KIND_LABEL[tile.kind])}</span>
                </span>
                <span className="provider-tile-text">{tile.description}</span>
              </button>
            ))}
          </div>
          {tiles.length < all.length && (
            <button type="button" className="text-link" onClick={() => setMore(true)}>
              {t('ดูบริการอื่นอีก {0} รายการ', all.length - tiles.length)}
            </button>
          )}
          {selected && (
            <ProviderDetail tile={selected} value={props.value} onChange={props.onChange} call={props.call}>
              {props.action}
            </ProviderDetail>
          )}
        </div>
      ) : (
        <>
          <AdvancedProviderFields {...props} />
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
          {props.action}
        </>
      )}
      <p>
        <button
          type="button"
          className="text-link"
          aria-expanded={advanced}
          onClick={() => {
            setAdvanced(!advanced);
            // Switching views starts from a clean choice: no API key, Console billing route or preset carries over.
            props.onChange({ ...initialChoice });
          }}
        >
          {advanced ? t('กลับไปเลือกบริการ') : t('ตั้งค่าขั้นสูงสำหรับผู้ดูแล')}
        </button>
      </p>
    </>
  );
}

// The selected service: its key (and where to get one), an optional model, and who pays.
function ProviderDetail({
  tile,
  value,
  onChange,
  call,
  children,
}: {
  tile: Tile;
  value: ProviderChoice;
  onChange: (next: ProviderChoice) => void;
  call: (method: string, input?: any) => Promise<any>;
  children?: ReactNode;
}) {
  const preset = presetFor(value.preset);
  const help =
    value.provider === 'gemini'
      ? 'geminiKey'
      : value.provider === 'claude' && value.mode === 'api'
        ? 'anthropicKey'
        : value.provider === 'openai' && value.mode === 'api'
          ? 'openaiKey'
          : preset?.keyUrl
            ? 'preset:' + preset.id
            : '';
  const needsKey = value.mode === 'api' && preset?.key !== 'none';
  // Choosing a service brings its key field and connect button into view; the first render leaves the page where it is.
  const card = useRef<HTMLDivElement>(null),
    shown = useRef(false);
  useEffect(() => {
    if (shown.current) card.current?.scrollIntoView?.({ block: 'nearest' });
    shown.current = true;
  }, [tile.id]);
  return (
    <div className="provider-detail" ref={card}>
      {tile.kind === 'account' && !preset && value.provider !== 'antigravity' && (
        <p className="small">{t('กดปุ่มด้านล่างแล้วลงชื่อในเบราว์เซอร์ ไม่ต้องใช้ API key')}</p>
      )}
      {value.provider === 'claude' && value.mode === 'subscription' && <ClaudeCodeNote call={call} subscription />}
      {value.provider === 'antigravity' && (
        <>
          <p className="small">
            {t(
              'ติดตั้งและลงชื่อเข้าใช้ Antigravity ในเครื่องนี้ก่อน STeP ใช้บัญชีนั้นโดยไม่ต้องใช้ API key และเมื่อยกเลิกการเชื่อมต่อ บัญชีใน Antigravity ยังลงชื่ออยู่',
            )}
          </p>
          <label>
            {t('โมเดล')}
            <input value={value.model || ''} onChange={e => onChange({ ...value, model: e.target.value.trim() })} autoComplete="off" />
          </label>
          <button type="button" className="text-link" onClick={() => void call('openHelp', { topic: 'antigravity' })}>
            {t('วิธีติดตั้งและลงชื่อเข้าใช้ Antigravity')}
          </button>
        </>
      )}
      {preset?.signIn && (
        <p className="small">
          {t('กดลงชื่อแล้วอนุญาตในหน้า {0} ระบบจะได้คีย์ของแอปนี้มาเก็บเข้ารหัสเอง หรือวางคีย์ที่มีอยู่แล้วด้านล่าง', preset.label)}
        </p>
      )}
      {preset?.key === 'none' && (
        <p className="small">{t('ติดตั้งและเปิด {0} ในเครื่องนี้ก่อน แล้วดาวน์โหลดโมเดลอย่างน้อยหนึ่งตัว', preset.label)}</p>
      )}
      {needsKey && (
        <label>
          {preset?.signIn ? t('API key (ไม่บังคับ)') : `${tile.label} API key`}
          <input
            type="password"
            autoComplete="off"
            value={value.key}
            onChange={e => onChange({ ...value, key: e.target.value })}
            placeholder={t('เก็บเข้ารหัสในเครื่องนี้')}
          />
        </label>
      )}
      {preset && (
        <label>
          <span>
            {t('โมเดล')} <span className="muted small">{t('(ไม่บังคับ)')}</span>
          </span>
          <input
            value={value.model || ''}
            onChange={e => onChange({ ...value, model: e.target.value.trim() })}
            placeholder={preset.defaultModel || t('ใช้โมเดลแรกที่บริการมี')}
            autoComplete="off"
          />
        </label>
      )}
      {help && (
        <button type="button" className="text-link" onClick={() => void call('openHelp', { topic: help })}>
          {preset?.key === 'none' ? t('ดาวน์โหลด {0}', preset.label) : t('ขอ API key จาก {0}', preset?.label || tileName(value))}
        </button>
      )}
      {value.provider === 'gemini' && value.mode === 'api' && (
        <p className="small muted">{t('ถ้าใช้คีย์แบบฟรี ให้ตรวจเงื่อนไขของ Google เรื่องการนำข้อมูลไปใช้ก่อนส่งงานขององค์กร')}</p>
      )}
      {preset && preset.key !== 'none' && <p className="small muted">{t('ร่างข้อความได้อย่างเดียว ยังไม่รองรับรูปภาพและการค้นเว็บ')}</p>}
      <p className="connection-cost" role="status">
        {preset?.key === 'none'
          ? t('ไม่มีค่าใช้จ่าย · ข้อมูลอยู่ในเครื่องนี้')
          : tile.kind === 'account' && !preset
            ? t('ใช้แพ็กเกจบัญชีที่คุณลงชื่อ · ระบบไม่สลับไปใช้งบ API อัตโนมัติ')
            : t('ใช้งบ API · คิดตามการใช้กับบัญชีเจ้าของคีย์ ยืนยันผู้รับผิดชอบค่าใช้จ่ายก่อนเชื่อมต่อ')}
      </p>
      {children}
    </div>
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
                model: e.target.value === 'antigravity' ? ANTIGRAVITY_MODEL : '',
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
                    ? t('แพ็กเกจของคุณผ่าน Claude Code ในเครื่อง (ทดลอง)')
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
