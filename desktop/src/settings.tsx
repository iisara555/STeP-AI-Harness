import { useEffect, useState } from 'react';
import { Building2, Check, FolderOpen, Monitor, Moon, Settings2, ShieldCheck, Sparkles, Sun } from 'lucide-react';
import { AIConnections } from './ai-connections';
import { shortcut } from './messages';
import teamworkArt from './assets/illustrations/teamwork.png';
import { SectionArt } from './illustration';
import { AVATARS, Avatar } from './avatars';
import { initial } from './messages';
import type { Snapshot } from './types';
import { language, localized, t, teamName } from './i18n';
import { INTERACTION_STYLES, LANGUAGE_STYLES, interactionStyleId, languageStyleId } from './speaking-styles';

/** Plain names for the policy switches; the technical key stays beside each for administrators. */
const featureNames: Record<string, string> = localized({
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
  skillPacks: 'ติดตั้ง Skill Packs',
  cron: 'งานตามรอบ',
  coordinator: 'ให้ AI แบ่งงานย่อยให้ผู้ช่วยหลายตัว',
  memoryTeam: 'ความจำที่ใช้ร่วมกันในทีม',
  autoRouting: 'ให้ระบบเลือก Skill และถามเพิ่มให้เอง',
  receiptVision: 'ให้ AI อ่านภาพใบเสร็จ',
  autoUpdate: 'อัปเดตแอปอัตโนมัติ',
  claudeSubscription: 'ใช้แพ็กเกจ Claude Pro/Max',
  learningReview: 'ทบทวนหาบทเรียนอัตโนมัติ',
  ocrTrial: 'เครื่องมือทดลอง OCR',
  answerCheck: 'ตรวจคำตอบเรื่อง STeP กับเอกสาร',
});

export function SettingsPanel({
  initialPage,
  snapshot,
  call,
  refresh,
  close,
  onError,
  openWizard,
  openTour,
  onBusy,
}: {
  initialPage: 'general' | 'ai';
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
  const [outputStyle, setOutputStyle] = useState(snapshot.settings.outputStyle || '');
  const [outputStyles, setOutputStyles] = useState<string[] | null>(null);
  const [busy, setBusy] = useState('');
  // New users land on AI connections when none exist; otherwise on general settings.
  const [page, setPage] = useState<'general' | 'ai' | 'appearance' | 'privacy' | 'policy'>(
    initialPage === 'ai' || (snapshot.settings.onboarding && !snapshot.connections.length) ? 'ai' : 'general',
  );
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
  const pages = [
    ['general', t('ทั่วไป'), Settings2],
    ['ai', t('การเชื่อมต่อ AI'), Sparkles],
    ['appearance', t('รูปลักษณ์และภาษา'), Sun],
    ['privacy', t('ความเป็นส่วนตัว'), ShieldCheck],
    ['policy', t('นโยบายองค์กร'), Building2],
  ] as const;
  return (
    <div className="settings-content">
      <div className={page === 'ai' ? 'settings-hero settings-hero-ai' : 'settings-hero'}>
        <div>
          <h1>{page === 'ai' ? t('เชื่อมต่อ AI') : pages.find(entry => entry[0] === page)?.[1]}</h1>
          {page === 'general' && <p className="muted">{t('ตั้งค่าเพียงครั้งแรก แล้วเริ่มงานได้จากบทสนทนา')}</p>}
        </div>
        {page === 'ai' ? (
          <SectionArt scene="connections" className="settings-illustration" />
        ) : (
          <img className="illustration settings-art" src={teamworkArt} alt="" />
        )}
      </div>
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
      {page === 'general' && (
        <section className="avatar-section">
          <h2>{t('รูปโปรไฟล์')}</h2>
          <p className="muted small">{t('เลือกภาพวาดที่ชอบ ภาพเป็นลายเส้นประกอบ ไม่ใช่รูปถ่ายของใคร และเก็บไว้ในเครื่องนี้เท่านั้น')}</p>
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
              <Avatar fallback={initial(userName) || 'ST'} />
            </button>
            {AVATARS.map((a, i) => (
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
        </section>
      )}
      {page === 'general' && (
        <section>
          <h2>{t('ผู้ช่วยและทีม')}</h2>
          <div className="form-grid">
            <label>
              {t('ชื่อเรียกของคุณ')}
              <input value={userName} maxLength={60} placeholder={t('เช่น ต้น')} onChange={e => setUserName(e.target.value)} />
            </label>
            <label>
              {t('ชื่อผู้ช่วย')}
              <input value={assistant} onChange={e => setAssistant(e.target.value)} />
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
          <label>{t('โฟลเดอร์เก็บผลงาน')}</label>
          <div className="folder-row">
            <span>{snapshot.settings.workspace || t('ยังไม่เลือกโฟลเดอร์')}</span>
            <button className="quiet" onClick={() => void run('workspace', () => call('workspace'))}>
              <FolderOpen size={16} />
              {t('เลือกโฟลเดอร์')}
            </button>
          </div>
          <p className="small muted">
            {t(
              'ไฟล์ที่ส่งออกจะตั้งชื่อตามทีมและวันที่ในโฟลเดอร์นี้ ส่วน USER.md (ชื่อ ผู้ช่วย และวิธีพูดคุย) เก็บในโฟลเดอร์นี้เพื่อใช้ร่วมกับ STeP AI บน CLI',
            )}
          </p>
          <div className="folder-row">
            <span>{snapshot.userFile || t('USER.md จะถูกสร้างเมื่อบันทึกการตั้งค่า')}</span>
            {snapshot.userFile && (
              <button className="quiet" onClick={() => void run('user', () => call('reveal', { path: snapshot.userFile }))}>
                {t('เปิดตำแหน่งไฟล์')}
              </button>
            )}
          </div>
          <div className="choice-row" style={{ marginTop: 14 }}>
            <button className="quiet" onClick={openWizard}>
              {t('เปิดตัวช่วยตั้งค่าเริ่มต้น')}
            </button>
            <button className="quiet" onClick={openTour}>
              {t('ดูทัวร์แนะนำอีกครั้ง')}
            </button>
          </div>
        </section>
      )}
      {page === 'general' && (
        <section>
          <h2>{t('สไตล์การพูดของผู้ช่วย')}</h2>
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
                ...Object.values(INTERACTION_STYLES).map(style => [style.id, style.displayName, t(style.summary)]),
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
      {page === 'appearance' && (
        <section>
          <h2>{language() === 'en' ? 'Language · ภาษา' : 'ภาษา · Language'}</h2>
          <p className="muted small">{t('เปลี่ยนภาษาของเมนูและปุ่มทั้งหมด ผู้ช่วยยังตอบตามภาษาที่คุณพิมพ์')}</p>
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
          <p>
            {snapshot.policy.source === 'managed' ? t('ใช้นโยบายองค์กร') : t('ใช้ค่าเริ่มต้นที่ปิดความสามารถเสี่ยงไว้')} · Hooks:{' '}
            {snapshot.policy.hooks}
          </p>
          <p className="small muted">{snapshot.policy.path}</p>
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
          <div className="policy-features">
            {Object.entries(snapshot.policy.features).map(([name, enabled]) => (
              <p key={name}>
                <span>
                  {featureNames[name] || name} <code className="small muted">{name}</code>
                </span>
                <span>{enabled ? t('เปิดในนโยบาย') : t('ปิดโดยผู้ดูแล')}</span>
              </p>
            ))}
          </div>
          <p className="small muted">{t('สถานะนี้แสดงสิทธิ์ตามนโยบาย ความสามารถที่อยู่ระหว่างพัฒนาจะพร้อมใช้เมื่อส่งมอบแล้ว')}</p>
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
          <p>{t('เฉพาะคำขอ ร่างของงานนั้น บทสนทนาล่าสุด และข้อความที่ตรวจแล้วจากไฟล์แนบ ไม่ส่งไฟล์ต้นฉบับ')}</p>
          <h3>{t('ก่อนส่ง ระบบตรวจอะไร')}</h3>
          <p>
            {t(
              'ปิดบังเลขบัตรประชาชน เบอร์โทร อีเมล และเลขบัญชีที่ตรวจพบ ถ้าพบรหัสผ่านหรือ API key หรือข้อมูลอ่อนไหวคู่กับตัวบุคคล ระบบจะไม่ส่งเลย ถ้าพบสัญญาณข้อมูลบุคคล เช่น รายชื่อ จะถามยืนยันก่อน',
            )}
          </p>
          <h3>{t('เมื่อไรจะถามยืนยัน')}</h3>
          <p>
            {t(
              'ครั้งแรกที่ใช้บนเครื่องนี้ เมื่อแนบไฟล์ และเมื่อพบข้อมูลที่ควรตรวจ ส่วนข้อมูลที่ปิดบังให้อัตโนมัติจะแจ้งทุกครั้ง ผลสแกนเป็นตัวช่วย ไม่ใช่การอนุญาตจากองค์กร',
            )}
          </p>
          <h3>{t('เก็บข้อมูลที่ไหน')}</h3>
          <p>{t('บทสนทนาและร่างอยู่ในเครื่องนี้เท่านั้น API key เข้ารหัสด้วยระบบของ Windows/macOS การลบงานจะลบออกจากเครื่องถาวร')}</p>
          <h3>{t('สิ่งที่ AI ทำไม่ได้')}</h3>
          <p>
            {t(
              'AI ในแอปนี้จัดทำร่างเท่านั้น ไม่มีสิทธิ์รันคำสั่ง เปิดไฟล์ในเครื่อง หรือส่ง อนุมัติ และเบิกจ่ายแทนคุณ ขั้นตอนดำเนินการจริงต้องทำโดยผู้มีอำนาจ',
            )}
          </p>
        </section>
      )}
      {page === 'ai' && (
        <section>
          {/* The page title above already says this; keep the heading for screen readers and in-page links. */}
          <h2 className="sr-only">{t('การเชื่อมต่อ AI')}</h2>
          <AIConnections snapshot={snapshot} call={call} refresh={refresh} onError={onError} onBusy={setBusy} />
        </section>
      )}
      <div className="settings-save">
        {page === 'ai' || page === 'privacy' ? (
          <button
            className={page === 'ai' && snapshot.connections.some(c => c.ready) ? undefined : 'quiet'}
            disabled={Boolean(busy)}
            onClick={close}
          >
            {page === 'ai' && snapshot.connections.some(c => c.ready) ? t('เริ่มใช้งาน') : t('กลับไปที่งาน')}
          </button>
        ) : (
          <button
            disabled={Boolean(busy)}
            onClick={() =>
              void run('settings', async () => {
                await call('settings', {
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
                });
                close();
              })
            }
          >
            <Check size={17} />
            {t('บันทึกและไปที่งาน')}
          </button>
        )}
      </div>
    </div>
  );
}
