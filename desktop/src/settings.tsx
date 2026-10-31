import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Building2,
  Check,
  FileSearch,
  FolderOpen,
  KeyRound,
  Minus,
  Monitor,
  Moon,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
} from './icons';
import { AIConnections } from './ai-connections';
import { CredentialSettings } from './credential-settings';
import { DeveloperDiagnostics } from './developer-diagnostics';
import { shortcut, explainError } from './messages';
import { SectionArt } from './illustration';
import { Avatar, pickableAvatars } from './avatars';
import { initial } from './messages';
import type { Snapshot } from './types';
import { language, localized, t, teamName } from './i18n';
import { INTERACTION_STYLES, LANGUAGE_STYLES, interactionStyleId, languageStyleId } from './speaking-styles';

/** Plain names for the policy switches; the technical keys are listed under the administrators' fold. */
const featureNames: Record<string, string> = localized({
  vault: 'บันทึกและใช้ข้อมูลบัญชี',
  googleWorkspace: 'เชื่อมบัญชี Google Workspace ของพนักงาน',
  morningBrief: 'การ์ดสรุปเช้านี้ (นัดและงานวันนี้)',
  toolLoop: 'ให้ AI ใช้เครื่องมือหลายขั้นตอน',
  autoMode: 'โหมดอัตโนมัติเต็มรูปแบบ',
  shellByAi: 'ให้ AI รันคำสั่งในเครื่อง',
  autoMerge: 'รวมงานโค้ดอัตโนมัติ',
  autopilot: 'ให้ AI ทำงานต่อเองหลายขั้น',
  sandbox: 'รันคำสั่งในกล่องแยก (Docker)',
  mcp: 'เครื่องมือเสริม MCP',
  lineGateway: 'เชื่อมต่อ LINE',
  vision: 'ให้ AI อ่านรูปภาพ',
  voice: 'สั่งงานด้วยเสียง',
  copilot: 'เชื่อมต่อ GitHub Copilot',
  compatibleProviders: 'บริการ AI ที่ผู้ดูแลกำหนดเอง',
  providerPresets: 'บริการ AI อื่นที่รู้จัก (OpenRouter, Groq ฯลฯ)',
  headless: 'สั่งงานแบบไม่เปิดหน้าต่าง',
  skillPacks: 'เปิด Skill Pack ที่ผู้ดูแลรับรอง พร้อม Hooks และ Agent',
  staffSkills: 'ใช้ Skill ที่ทำเองได้เมื่อตรวจผ่าน',
  feedback: 'ให้พนักงานแจ้งปัญหาและข้อเสนอแนะถึงผู้ดูแล',
  cron: 'งานตั้งเวลา',
  coordinator: 'ให้ AI แบ่งงานย่อยให้ผู้ช่วยหลายตัว',
  memoryTeam: 'ความจำที่ใช้ร่วมกันในทีม',
  autoRouting: 'เลือก Skill และถามข้อมูลที่ขาดให้อัตโนมัติ',
  hybridSkillSelection: 'เลือก Skill ที่เหมาะกับงานก่อนตอบ',
  skillSuggestions: 'แนะนำ Skill เหนือช่องพิมพ์',
  receiptVision: 'ให้ AI อ่านภาพใบเสร็จ',
  autoUpdate: 'อัปเดตแอปอัตโนมัติ',
  claudeSubscription: 'ใช้แพ็กเกจ Claude Pro/Max',
  developmentMode: 'ให้พนักงานเปิดโหมดนักพัฒนา',
  learningReview: 'ทบทวนหาบทเรียนอัตโนมัติ',
  ocrTrial: 'บันทึกผลทดลอง OCR สำหรับทีมนำร่อง',
  answerCheck: 'ตรวจคำตอบเรื่อง STeP กับเอกสาร',
  autoEffort: 'ปรับระดับการคิดตามขนาดงาน',
  maintenance: 'ตรวจข้อมูลที่จำ บทเรียน และ Skill ทุกวัน',
});

/** The policy switches in a few plain groups, so staff can scan them; switches not listed fall into the last group. */
const POLICY_GROUPS: [string, string[]][] = [
  [
    'การทำงานของ AI',
    [
      'toolLoop',
      'autoMode',
      'autopilot',
      'coordinator',
      'autoRouting',
      'hybridSkillSelection',
      'skillSuggestions',
      'autoEffort',
      'answerCheck',
      'vision',
      'receiptVision',
      'voice',
      'cron',
    ],
  ],
  ['ข้อมูลและความเป็นส่วนตัว', ['vault', 'memoryTeam', 'learningReview', 'maintenance']],
  [
    'ส่วนเสริมและการเชื่อมต่อ',
    [
      'googleWorkspace',
      'morningBrief',
      'mcp',
      'lineGateway',
      'copilot',
      'compatibleProviders',
      'providerPresets',
      'skillPacks',
      'staffSkills',
      'feedback',
      'ocrTrial',
    ],
  ],
  ['การอัปเดตและนักพัฒนา', ['autoUpdate', 'developmentMode', 'claudeSubscription', 'shellByAi', 'autoMerge', 'sandbox', 'headless']],
];
function policyGroups(features: Record<string, boolean>) {
  const names = Object.keys(features),
    listed = new Set(POLICY_GROUPS.flatMap(([, keys]) => keys));
  return POLICY_GROUPS.map(([title, keys], i) => ({
    title,
    names: [...keys.filter(key => names.includes(key)), ...(i === POLICY_GROUPS.length - 1 ? names.filter(key => !listed.has(key)) : [])],
  })).filter(group => group.names.length);
}

export function SettingsPanel({
  initialPage,
  vaultOrigin,
  snapshot,
  call,
  refresh,
  close,
  onError,
  openWizard,
  openTour,
  onBusy,
  onDirtyChange,
  selectedConnectionId,
  selectionScope,
  onSelectConnection,
  selectionDisabled,
}: {
  initialPage: 'general' | 'ai' | 'credentials';
  onDirtyChange?: (dirty: boolean) => void;
  selectedConnectionId?: string;
  selectionScope?: 'task' | 'new';
  onSelectConnection?: (id: string) => Promise<void>;
  selectionDisabled?: boolean;
  vaultOrigin?: string;
  /** Whether an operation (connecting an account, testing a key) is running, so the app keeps the panel while it does. */
  onBusy?: (busy: boolean) => void;
  openWizard: () => void;
  openTour: () => void;
  snapshot: Snapshot;
  call: (method: string, input?: any) => Promise<any>;
  refresh: () => Promise<Snapshot | undefined>;
  close: () => void;
  onError: (error: unknown) => void;
}) {
  const [assistant, setAssistant] = useState(snapshot.settings.assistant),
    [team, setTeam] = useState(snapshot.settings.team),
    [theme, setTheme] = useState(snapshot.settings.theme);
  const [userName, setUserName] = useState(snapshot.settings.userName || ''),
    [personality, setPersonality] = useState(snapshot.settings.personality || 'coworker'),
    [assistantTone, setAssistantTone] = useState(snapshot.settings.assistantTone || ''),
    [avatar, setAvatar] = useState(snapshot.settings.avatar || '');
  const [interactionStyle, setInteractionStyle] = useState(interactionStyleId(snapshot.settings.interactionStyle)),
    [languageStyle, setLanguageStyle] = useState(languageStyleId(snapshot.settings.languageStyle));
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [chatLanguage, setChatLanguage] = useState(snapshot.settings.chatLanguage || 'auto');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<unknown>();
  const [outputStyle, setOutputStyle] = useState(snapshot.settings.outputStyle || '');
  const [outputStyles, setOutputStyles] = useState<string[] | null>(null);
  const [busy, setBusy] = useState('');
  const panelRef = useRef<HTMLDivElement>(null),
    footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = panelRef.current,
      footer = footerRef.current;
    if (!panel || !footer) return;
    const resize = () => panel.style.setProperty('--settings-footer-height', `${Math.max(80, footer.offsetHeight) + 16}px`);
    const observer = new ResizeObserver(resize);
    observer.observe(footer);
    resize();
    return () => observer.disconnect();
  }, []);
  const credentialBusy = useCallback((active: boolean) => setBusy(active ? 'credentials' : ''), []);
  const developerAccess = Boolean(snapshot.features?.developmentMode && snapshot.settings.developmentMode);
  // New users land on AI connections when none exist; otherwise on general settings.
  const [page, setPage] = useState<'general' | 'ai' | 'credentials' | 'appearance' | 'privacy' | 'policy' | 'developer'>(
    initialPage === 'credentials'
      ? 'credentials'
      : initialPage === 'ai' || (snapshot.settings.onboarding && !snapshot.connections.length)
        ? 'ai'
        : 'general',
  );
  const initialPageRef = useRef(initialPage);
  useEffect(() => {
    if (initialPageRef.current !== initialPage || initialPage === 'credentials') setPage(initialPage);
    initialPageRef.current = initialPage;
  }, [initialPage, vaultOrigin]);
  useEffect(() => {
    if (!developerAccess && page === 'developer') setPage('ai');
  }, [developerAccess, page]);
  useEffect(() => {
    if (page !== 'general') return;
    let active = true;
    setOutputStyles(null);
    void call('contextStyles')
      .then(styles => {
        if (active) setOutputStyles(styles);
      })
      .catch(error => {
        if (active) onError(error);
      });
    return () => {
      active = false;
    };
  }, [page, snapshot.settings.workspace]);
  useEffect(() => onBusy?.(Boolean(busy)), [busy, onBusy]);
  useEffect(() => () => onBusy?.(false), [onBusy]);
  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await refresh();
    } catch (e) {
      onError(e);
    } finally {
      setBusy('');
    }
  };
  const values = {
    assistant,
    team,
    theme,
    userName,
    personality,
    assistantTone,
    avatar,
    interactionStyle,
    languageStyle,
    outputStyle,
    chatLanguage,
  };
  const [savedValues, setSavedValues] = useState(() => JSON.stringify(values));
  const dirty = JSON.stringify(values) !== savedValues;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const saveSettings = async () => {
    setSaved(false);
    setSaveError(undefined);
    setBusy('settings');
    let persisted = false;
    try {
      await call('settings', values);
      setSavedValues(JSON.stringify(values));
      setSaved(true);
      persisted = true;
    } catch (error) {
      setSaveError(error);
    } finally {
      // A failed refresh cannot turn an acknowledged settings write into a failed save.
      if (persisted) await refresh().catch(onError);
      setBusy('');
    }
  };
  const pages = [
    ['general', t('ทั่วไป'), Settings2],
    ['ai', t('เชื่อมต่อ AI'), Sparkles],
    ['credentials', t('บัญชีและบริการ'), KeyRound],
    ['appearance', t('การแสดงผลและภาษา'), Sun],
    ['privacy', t('ความเป็นส่วนตัว'), ShieldCheck],
    ['policy', t('นโยบายองค์กร'), Building2],
    ...(developerAccess ? ([['developer', t('นักพัฒนา / แอดมิน'), FileSearch]] as const) : []),
  ] as const;
  const keywords = {
    general: 'ชื่อ ทีม ผู้ช่วย รูป โปรไฟล์ สไตล์ โฟลเดอร์ chat language profile team style folder',
    ai: 'AI บัญชี โมเดล ทดสอบ account model test',
    credentials: 'Google ปฏิทิน Gmail รหัสผ่าน ที่อยู่ พัก บัญชี password address pause calendar',
    appearance: 'ภาษา ธีม language theme display',
    privacy: 'ข้อมูล privacy data',
    policy: 'สิทธิ์ policy permissions',
    developer: 'นักพัฒนา แอดมิน diagnostics error log ระบบ debug admin',
  };
  const matchingPages = pages.filter(([id, label]) =>
    (label + ' ' + keywords[id]).toLowerCase().includes(settingsSearch.trim().toLowerCase()),
  );
  return (
    <div className="settings-content" ref={panelRef}>
      {/* Tabs first: the page title above already says Settings, so the section name lives in the tab and a hidden
          heading for screen readers. Only the AI page keeps its small picture. */}
      <div className="settings-tabs" role="tablist" aria-label={t('หมวดการตั้งค่า')}>
        {pages.map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            disabled={Boolean(busy) && page !== id}
            aria-selected={page === id}
            className={page === id ? 'active' : ''}
            onClick={() => setPage(id)}
          >
            <Icon size={15} />
            {label}
            {id === 'ai' && !snapshot.connections.some(c => c.ready) && <span className="tab-dot" aria-label={t('ยังไม่พร้อม')} />}
          </button>
        ))}
      </div>
      <div className={page === 'ai' ? 'settings-hero settings-hero-ai' : 'settings-hero'}>
        <h1 className="sr-only">{page === 'ai' ? t('เชื่อมต่อ AI') : pages.find(entry => entry[0] === page)?.[1]}</h1>
        {page === 'developer' && <p className="muted">{t('เครื่องมือดูแลระบบสำหรับนักพัฒนาและผู้ดูแล')}</p>}
        <label className="settings-search">
          <span className="sr-only">{t('ค้นหาการตั้งค่า')}</span>
          <input
            type="search"
            value={settingsSearch}
            placeholder={t('ค้นหาการตั้งค่า เช่น ภาษา บัญชี Google')}
            onChange={e => setSettingsSearch(e.target.value)}
          />
        </label>
        {settingsSearch.trim() && (
          <div className="settings-search-results" role="region" aria-label={t('ผลค้นหาการตั้งค่า')}>
            {matchingPages.length ? (
              matchingPages.map(([id, label]) => (
                <button
                  className="quiet"
                  key={id}
                  onClick={() => {
                    setPage(id);
                    setSettingsSearch('');
                  }}
                >
                  {label}
                </button>
              ))
            ) : (
              <p className="small">{t('ไม่พบหมวดที่ตรงกับคำค้น')}</p>
            )}
          </div>
        )}
        {page === 'ai' && <SectionArt scene="connections" className="settings-illustration" />}
      </div>
      {page === 'credentials' && <CredentialSettings call={call} onError={onError} onBusy={credentialBusy} requestedOrigin={vaultOrigin} />}
      {page === 'developer' && developerAccess && <DeveloperDiagnostics call={call} onError={onError} />}
      {page === 'general' && (
        <section className="settings-profile">
          <h2>{t('โปรไฟล์และทีม')}</h2>
          <div className="settings-profile-summary">
            <Avatar id={avatar} fallback={initial(userName) || <UserRound size={20} />} />
            <button className="quiet" aria-expanded={avatarOpen} onClick={() => setAvatarOpen(!avatarOpen)}>
              {t('เปลี่ยนรูป')}
            </button>
          </div>
          {avatarOpen && (
            <div className="avatar-section">
              <p className="muted small">
                {t('เลือกภาพวาดที่ชอบ ภาพเป็นลายเส้นประกอบ ไม่ใช่รูปถ่ายของใคร และเก็บไว้ในเครื่องนี้เท่านั้น')}
              </p>
              <div className="avatar-picker" role="radiogroup" aria-label={t('รูปโปรไฟล์')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!avatar}
                  aria-label={t('ใช้ตัวอักษรแรกของชื่อ')}
                  title={t('ใช้ตัวอักษรแรกของชื่อ')}
                  className="avatar-option"
                  onClick={() => setAvatar('')}
                >
                  <Avatar fallback={initial(userName) || <UserRound size={20} />} />
                </button>
                {pickableAvatars(avatar).map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={avatar === a.id}
                    aria-label={t('ภาพที่ {0}', i + 1)}
                    title={t('ภาพที่ {0}', i + 1)}
                    className="avatar-option"
                    onClick={() => setAvatar(a.id)}
                  >
                    <Avatar id={a.id} fallback="" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="form-grid">
            <label>
              {t('ชื่อเรียกของคุณ')}
              <input value={userName} maxLength={60} placeholder={t('เช่น ต้น')} onChange={e => setUserName(e.target.value)} />
            </label>
            <label>
              {t('ทีมหลัก')}
              <select value={team} onChange={e => setTeam(e.target.value)}>
                <option value="">{t('ยังไม่แน่ใจ · เลือกภายหลัง')}</option>
                {snapshot.teams.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.id.toUpperCase()} · {teamName(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}
      {page === 'general' && (
        <section>
          <h2>{t('ผู้ช่วยของคุณ')}</h2>
          <div className="form-grid">
            <label>
              {t('ชื่อผู้ช่วย')}
              <input maxLength={60} value={assistant} onChange={e => setAssistant(e.target.value)} />
            </label>
            <label>
              {t('ภาษาในแชต')}
              <select
                aria-label={t('ภาษาในแชต')}
                value={chatLanguage}
                onChange={e => setChatLanguage(e.target.value as typeof chatLanguage)}
              >
                <option value="auto">{t('ตามภาษาที่พิมพ์')}</option>
                <option value="th">ไทย</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          <p className="small muted">{t('ภาษาในแชตแยกจากภาษาของแอป และคุณระบุภาษาอื่นในแต่ละคำขอได้')}</p>
          <h3>{t('สไตล์การพูดของผู้ช่วย')}</h3>
          <p className="muted small">
            {t('เปลี่ยนเฉพาะวิธีพูดในแชท ข้อเท็จจริง แหล่งอ้างอิง สิทธิ์ และมาตรฐานเอกสารยังเหมือนเดิม และไม่ได้สวมบทเป็นบุคคลจริง')}
          </p>
          {/* One picker for every way of talking: the four First Run presets and the documented styles. A preset sets
              the conversation style in Personal preferences; a documented style is layered over it. */}
          <div className="style-grid speaking-styles" role="radiogroup" aria-label={t('สไตล์การพูดของผู้ช่วย')}>
            {(
              [
                ['coworker', t('เพื่อนร่วมงาน'), t('เป็นกันเอง สุภาพ พูดธรรมชาติ')],
                ['professional', t('มืออาชีพ'), t('สุภาพ มีโครงสร้าง ชัดเจน')],
                ['concise', t('กระชับ'), t('ตอบสั้น ตรงประเด็น')],
                ['custom', t('กำหนดเอง'), t('เขียนสไตล์ที่ต้องการ')],
                ...Object.values(INTERACTION_STYLES).map(style => [
                  style.id,
                  // A Thai name first, the persona name in brackets; English shows the persona name alone.
                  style.thaiName && language() !== 'en' ? `${style.thaiName} (${style.displayName})` : style.displayName,
                  t(style.summary),
                ]),
              ] as [string, string, string][]
            ).map(([id, label, summary]) => {
              const documented = id in INTERACTION_STYLES;
              const active = documented ? interactionStyle === id : interactionStyle === 'standard' && personality === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? 'style-card active' : 'style-card'}
                  onClick={() => {
                    if (documented) setInteractionStyle(interactionStyleId(id));
                    else {
                      setPersonality(id as typeof personality);
                      setInteractionStyle('standard');
                    }
                  }}
                >
                  <strong>{label}</strong>
                  <small>{summary}</small>
                </button>
              );
            })}
          </div>
          <div className="settings-style-example" aria-live="polite">
            <strong>{t('ตัวอย่างจากโจทย์เดียวกัน: ช่วยเตือนให้ตรวจเอกสารก่อนส่ง')}</strong>
            <p>
              {t(
                interactionStyle === 'witty'
                  ? 'ก่อนส่ง ตรวจให้ครบสามจุด: เนื้อหา ผู้รับ และไฟล์แนบ แล้วค่อยกดส่ง'
                  : interactionStyle === 'ob-oon'
                    ? 'ถ้าผู้รับเปิดอ่านตอนนี้ เขาจะมีข้อมูลครบไหม? ลองตรวจเนื้อหา ผู้รับ และไฟล์แนบอีกครั้งก่อนส่ง'
                    : personality === 'professional'
                      ? 'กรุณาตรวจสอบความถูกต้องของเนื้อหา รายชื่อผู้รับ และไฟล์แนบให้ครบถ้วนก่อนส่งเอกสาร'
                      : personality === 'concise'
                        ? 'ตรวจเนื้อหา ผู้รับ และไฟล์แนบก่อนส่ง'
                        : personality === 'custom'
                          ? 'ตัวอย่างสไตล์กำหนดเองขึ้นอยู่กับคำอธิบายที่คุณใส่'
                          : 'ก่อนส่ง ลองเช็กเนื้อหา ผู้รับ และไฟล์แนบอีกครั้งให้ครบครับ',
              )}
            </p>
            <small>{t('ตัวอย่างที่เตรียมไว้ ไม่มีการเรียก AI')}</small>
          </div>
          {interactionStyle === 'standard' && personality === 'custom' && (
            <label className="speaking-style-custom">
              {t('สไตล์ที่ต้องการ')}
              <input
                value={assistantTone}
                maxLength={300}
                placeholder={t('เช่น ตอบเป็นข้อ ๆ และสรุปสิ่งที่ต้องทำท้ายคำตอบ')}
                onChange={e => setAssistantTone(e.target.value)}
              />
            </label>
          )}
          <h3>{t('สำเนียงภาษา')}</h3>
          <p className="muted small">{t('ใช้ร่วมกับสไตล์ด้านบนได้')}</p>
          <div className="style-grid speaking-styles" role="radiogroup" aria-label={t('สำเนียงภาษา')}>
            {(
              [
                ['standard', t('ภาษาไทยมาตรฐาน'), t('ไม่เพิ่มสำเนียงท้องถิ่น')],
                ...Object.values(LANGUAGE_STYLES).map(style => [style.id, t(style.displayName), t(style.summary)]),
              ] as [typeof languageStyle, string, string][]
            ).map(([id, label, summary]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={languageStyle === id}
                className={languageStyle === id ? 'style-card active' : 'style-card'}
                onClick={() => setLanguageStyle(id)}
              >
                <strong>{label}</strong>
                <small>{summary}</small>
              </button>
            ))}
          </div>
          <label>
            {t('รูปแบบคำตอบ')}
            <small className="muted">{t('กำหนดโครงสร้างคำตอบจากรูปแบบที่ติดตั้งไว้ แยกจากน้ำเสียงด้านบน ไม่ใช่ตัวปรับความยาว')}</small>
            <select
              aria-label={t('รูปแบบคำตอบ')}
              value={outputStyle}
              disabled={outputStyles === null || Boolean(busy)}
              onChange={e => setOutputStyle(e.target.value)}
            >
              <option value="">{t('ใช้รูปแบบมาตรฐาน')}</option>
              {outputStyle && outputStyles && !outputStyles.includes(outputStyle) && <option value={outputStyle}>{outputStyle}</option>}
              {(outputStyles || []).map(style => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}
      {page === 'general' && (
        <section>
          <h2>{t('ไฟล์และโฟลเดอร์')}</h2>
          <label>{t('โฟลเดอร์เก็บผลงาน')}</label>
          <div className="folder-row">
            <span>{snapshot.settings.workspace || t('ยังไม่เลือกโฟลเดอร์')}</span>
            <button className="quiet" disabled={Boolean(busy)} onClick={() => void run('workspace', () => call('workspace'))}>
              <FolderOpen size={16} />
              {t('เลือกโฟลเดอร์')}
            </button>
          </div>
          <p className="small muted">{t('การเปลี่ยนโฟลเดอร์มีผลทันที ส่วนค่าที่คุณแก้ในหน้านี้ต้องกดบันทึกการเปลี่ยนแปลง')}</p>
          <details className="settings-admin">
            <summary>{t('ตัวเลือกเพิ่มเติม')}</summary>
            <p className="small muted">{t('การตั้งค่าเก็บเป็นไฟล์ USER.md เพื่อใช้ร่วมกับ STeP AI บน CLI')}</p>
            <div className="folder-row">
              <span>{snapshot.userFile || t('USER.md จะถูกสร้างเมื่อบันทึกการตั้งค่า')}</span>
              {snapshot.userFile && (
                <button className="quiet" onClick={() => void run('user', () => call('reveal', { path: snapshot.userFile }))}>
                  {t('เปิดตำแหน่งไฟล์')}
                </button>
              )}
            </div>
            <div className="choice-row">
              <button className="quiet" onClick={openWizard}>
                {t('เปิดตัวช่วยตั้งค่าเริ่มต้น')}
              </button>
              <button className="quiet" onClick={openTour}>
                {t('ดูทัวร์แนะนำอีกครั้ง')}
              </button>
            </div>
          </details>
        </section>
      )}
      {page === 'appearance' && (
        <section>
          <h2>{t('ภาษาของแอป')}</h2>
          <p className="muted small">{t('เปลี่ยนเฉพาะเมนูและปุ่ม มีผลทันที ภาษาในแชตตั้งแยกได้ในทั่วไป')}</p>
          <div className="theme-options" role="radiogroup" aria-label="Language">
            {(
              [
                ['th', 'ไทย'],
                ['en', 'English'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="radio"
                aria-checked={(snapshot.settings.language || 'th') === id}
                className={(snapshot.settings.language || 'th') === id ? 'active' : 'quiet'}
                disabled={busy === 'language'}
                onClick={() =>
                  void run('language', () => {
                    const s = snapshot.settings;
                    return call('settings', { assistant: s.assistant, team: s.team, theme: s.theme, language: id });
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <h2>{t('ธีม')}</h2>
          <p className="muted small">{t('เลือกให้ตามระบบปฏิบัติการ หรือกำหนดเอง')}</p>
          <div className="theme-options">
            {(
              [
                ['system', t('ตามระบบ'), Monitor],
                ['light', t('สว่าง'), Sun],
                ['dark', t('มืด'), Moon],
              ] as const
            ).map(([id, label, Icon]) => (
              <button key={id} className={theme === id ? 'active' : 'quiet'} onClick={() => setTheme(id)}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <p className="small muted">{t('ทางลัด: กด {0} แล้วพิมพ์ “ธีม” เพื่อสลับได้จากทุกหน้า', shortcut)}</p>
        </section>
      )}
      {page === 'policy' && snapshot.policy && (
        <section>
          <h2>{t('นโยบายที่ผู้ดูแลกำหนด')}</h2>
          <p>{snapshot.policy.source === 'managed' ? t('ใช้นโยบายองค์กร') : t('ใช้ค่าเริ่มต้นที่ปิดความสามารถเสี่ยงไว้')}</p>
          <p className="pilot-note">
            {snapshot.policy.pilot === false
              ? t('โหมดเข้มงวด: ผู้ดูแลตั้งให้ถามยืนยันก่อนส่งไฟล์แนบ ส่งครั้งแรก และส่งผลเครื่องมือแต่ละแหล่ง')
              : t(
                  'ถามยืนยันเฉพาะเมื่อจำเป็น: ยังบล็อกรหัสผ่านและข้อมูลอ่อนไหวที่ระบุตัวบุคคล ปิดบังเลขบัตรประชาชน และถามทุกครั้งก่อนเครื่องมือที่มีผลจริง',
                )}
          </p>
          {snapshot.policy.problems.length > 0 && (
            <div role="alert">
              <p>{t('อ่านนโยบายไม่สำเร็จครบถ้วน จึงใช้ค่าเริ่มต้น กรุณาแจ้งผู้ดูแล')}</p>
              {/* The exact reasons, so an administrator can fix the file without guessing. */}
              <ul className="small policy-problems">
                {snapshot.policy.problems.map(problem => (
                  <li key={problem}>
                    <code>{problem}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {policyGroups(snapshot.policy.features).map(group => (
            <div className="policy-group" key={group.title}>
              <h3>{t(group.title)}</h3>
              <ul className="policy-features">
                {group.names.map(name => {
                  const enabled = snapshot.policy!.features[name];
                  return (
                    <li key={name}>
                      <span>{featureNames[name] || name}</span>
                      <span className={enabled ? 'policy-badge on' : 'policy-badge off'}>
                        {enabled ? <Check size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}
                        {enabled ? t('เปิดในนโยบาย') : t('ปิดโดยผู้ดูแล')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="small muted">{t('สถานะนี้แสดงสิทธิ์ตามนโยบาย ความสามารถที่อยู่ระหว่างพัฒนาจะพร้อมใช้เมื่อส่งมอบแล้ว')}</p>
          {/* Keys, the file path and hook counts are for whoever edits the policy file, not for staff. */}
          <details className="settings-admin">
            <summary>{t('สำหรับผู้ดูแล')}</summary>
            <p className="small">
              {t('ไฟล์นโยบาย')}: <code>{snapshot.policy.path}</code>
            </p>
            <p className="small">
              {t('ที่มา')}: <code>{snapshot.policy.source}</code> · Hooks: {snapshot.policy.hooks}
            </p>
            <ul className="policy-keys small">
              {Object.entries(snapshot.policy.features).map(([name, enabled]) => (
                <li key={name}>
                  <code>{name}</code>
                  <span>{enabled ? 'true' : 'false'}</span>
                </li>
              ))}
            </ul>
          </details>
          {snapshot.consentMetrics && (
            <>
              <h3>{t('สถิติการถามยืนยันในเครื่องนี้')}</h3>
              <p className="small">
                {t(
                  'ถาม {0} ครั้ง · ยืนยัน {1} · ยกเลิก {2} · เฉลี่ย {3} ครั้งต่องาน ({4} งาน)',
                  snapshot.consentMetrics.prompts,
                  snapshot.consentMetrics.confirmed,
                  snapshot.consentMetrics.cancelled,
                  snapshot.consentMetrics.perTask,
                  snapshot.consentMetrics.tasks,
                )}
              </p>
              <p className="small muted">{t('นับเฉพาะจำนวนครั้งและชื่อเครื่องมือ ไม่เก็บเนื้อหาที่ถาม และไม่ส่งออกจากเครื่อง')}</p>
            </>
          )}
          <h3>{t('สิทธิ์ที่คุณอนุญาตไว้')}</h3>
          {!snapshot.approvals?.length && <p className="muted">{t('ยังไม่มีสิทธิ์ที่บันทึกไว้')}</p>}
          {snapshot.approvals?.map(rule => (
            <div className="folder-row" key={rule.id}>
              <span>
                {rule.tool} · {rule.targetHash.slice(0, 12)}
              </span>
              <button className="quiet" onClick={() => void run(rule.id, () => call('approvalRemove', { id: rule.id }))}>
                {t('ถอนสิทธิ์')}
              </button>
            </div>
          ))}
          <p className="small muted">{t('สิทธิ์ผูกกับเครื่องมือ เป้าหมาย และโฟลเดอร์ที่ยืนยันเท่านั้น นโยบายองค์กรยังตรวจทุกครั้ง')}</p>
        </section>
      )}
      {page === 'privacy' && (
        <section className="privacy-info">
          <h2>{t('ข้อมูลของคุณ')}</h2>
          <h3>{t('อะไรถูกส่งให้ AI')}</h3>
          <p>
            {t(
              'คำขอ บทสนทนา ร่าง และข้อมูลจากไฟล์หรือเครื่องมือที่ใช้ตอบ อาจถูกส่งไปยังบริการ AI ที่เลือก การอ่านภาพขึ้นอยู่กับบัญชี นโยบาย และการยินยอม',
            )}
          </p>
          <h3 className="privacy-heading">
            {t('ก่อนส่ง ระบบตรวจอะไร')}
            <span className={snapshot.policy?.checks?.privacy ? 'policy-badge on' : 'policy-badge off'}>
              {snapshot.policy?.checks?.privacy ? t('ตรวจข้อมูลเพิ่มเติม: เปิด') : t('ตรวจข้อมูลเพิ่มเติม: ปิด')}
            </span>
          </h3>
          <p>
            {snapshot.policy?.checks?.privacy
              ? t(
                  'เปิดการตรวจข้อมูลเพิ่มเติม: ระบบตรวจและปิดบังข้อมูลที่พบ และบล็อกข้อมูลที่ส่งไม่ได้ ผลตรวจเป็นตัวช่วย คุณยังต้องตรวจสิทธิ์และข้อมูลก่อนส่ง',
                )
              : t(
                  'ปิดการตรวจข้อมูลส่วนบุคคลเพิ่มเติม: ข้อมูลส่วนบุคคลอาจถูกส่งตามต้นฉบับ แต่ยังกรองรหัสผ่านและข้อมูลรับรองที่ตรวจพบ ตรวจข้อมูลก่อนส่งทุกครั้ง',
                )}
          </p>
          <h3 className="privacy-heading">
            {t('เมื่อไรจะถามยืนยัน')}
            {snapshot.policy && (
              <span className="policy-badge on">{snapshot.policy.pilot === false ? t('ถามทุกครั้ง') : t('ถามเมื่อจำเป็น')}</span>
            )}
          </h3>
          <p>
            {t(
              'งานอ่าน Google ขออนุมัติครั้งเดียวต่อคำขอ งานส่ง แก้ไข หรือลบยืนยันแต่ละรายการ งานประจำวันใช้สิทธิ์ที่ตั้งไว้ ส่วนเครื่องมืออื่นทำตามนโยบายและโหมดที่เลือก ผู้ดูแลอาจกำหนดให้ถามทุกครั้ง',
            )}
          </p>
          <h3>{t('เก็บข้อมูลที่ไหน')}</h3>
          <p>
            {t('บทสนทนาและร่างเก็บในเครื่องนี้ แต่ข้อมูลที่ใช้กับ AI ถูกส่งไปบริการที่เลือก ข้อมูลรับรองเก็บแยกตามระบบป้องกันของเครื่อง')}
          </p>
          <h3>{t('ขอบเขตการทำงาน')}</h3>
          <p>
            {t(
              'ผู้ช่วยใช้เครื่องมือ อ่านไฟล์ และทำงานกับบริการที่เชื่อมได้ตามสิทธิ์และโหมดปัจจุบัน การลงนาม อนุมัติเงิน และรับรองข้อมูลยังเป็นหน้าที่ของผู้มีอำนาจ',
            )}
          </p>
        </section>
      )}
      {page === 'ai' && (
        <section>
          <AIConnections
            headingLevel={2}
            snapshot={snapshot}
            call={call}
            refresh={refresh}
            onError={onError}
            onBusy={setBusy}
            selectedConnectionId={selectedConnectionId}
            selectionScope={selectionScope}
            onSelectConnection={onSelectConnection}
            selectionDisabled={selectionDisabled}
          />
        </section>
      )}
      <div className={dirty ? 'settings-save sticky dirty' : 'settings-save sticky'} ref={footerRef}>
        {/* Quiet until there is something to save: accounts, AI and policy apply at once and have nothing waiting here. */}
        <p className="small" role="status">
          {(dirty || saved) && (
            <>
              <span className="muted">{t('ทั่วไปและการแสดงผล')} · </span>
              <span>{dirty ? t('มีการเปลี่ยนแปลงที่ยังไม่บันทึก') : t('บันทึกการเปลี่ยนแปลงแล้ว')}</span>
            </>
          )}
        </p>
        {saveError !== undefined && (
          <p className="settings-save-error" role="alert">
            {explainError(saveError)}
          </p>
        )}
        <div className="choice-row">
          <button disabled={!dirty || Boolean(busy)} onClick={() => void saveSettings()}>
            <Check size={17} />
            {t('บันทึกการเปลี่ยนแปลง')}
          </button>
          <button className="quiet" disabled={Boolean(busy)} onClick={close}>
            {t('กลับไปทำงาน')}
          </button>
        </div>
      </div>
    </div>
  );
}
