import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Plug, Sparkles } from 'lucide-react';
import type { Connection, Settings, Snapshot } from './types';
import { ProviderFields, providerChoiceReady, initialChoice, type ProviderChoice } from './ui';
import { providerLabel } from './messages';
import launchArt from './assets/illustrations/launch.png';
import teamworkArt from './assets/illustrations/teamwork.png';
import { t, teamName } from './i18n';

type Call = (method: string, input?: unknown) => Promise<any>;
type Personality = NonNullable<Settings['personality']>;
// Same presets as USER.md (src/modules/user-memory.js), with a sample line so people can hear the difference.
const styles: { id: Personality; label: string; tone: string; sample: (user: string, ai: string) => string }[] = [
  {
    id: 'coworker',
    label: 'เพื่อนร่วมงาน',
    tone: 'เป็นกันเอง สุภาพ พูดธรรมชาติ',
    sample: (u, a) => t('สวัสดีครับ{0} {1} พร้อมช่วยแล้ว วันนี้มีงานอะไรให้ลุยด้วยกันครับ', u ? t('คุณ{0}', u) : '', a),
  },
  {
    id: 'professional',
    label: 'มืออาชีพ',
    tone: 'สุภาพ มีโครงสร้าง ชัดเจน',
    sample: (u, a) => t('เรียน{0} {1} พร้อมให้การสนับสนุน กรุณาระบุงานที่ต้องการดำเนินการครับ', u ? t('คุณ{0}', u) : t('ท่าน'), a),
  },
  {
    id: 'concise',
    label: 'กระชับ',
    tone: 'ตอบสั้น ตรงประเด็น',
    sample: (u, a) => (u ? t('{0} พร้อมครับ บอกงานมาได้เลย — {1}', u, a) : t('พร้อมครับ บอกงานมาได้เลย — {0}', a)),
  },
  {
    id: 'custom',
    label: 'กำหนดเอง',
    tone: 'เขียนสไตล์ที่ต้องการ',
    sample: (u, a) => (u ? t('{0} จะคุยกับคุณ{1}ตามสไตล์ที่กำหนดไว้ครับ', a, u) : t('{0} จะคุยกับคุณตามสไตล์ที่กำหนดไว้ครับ', a)),
  },
];
const steps = ['ต้อนรับ', 'เกี่ยวกับคุณ', 'ผู้ช่วย AI', 'เชื่อมต่อ AI', 'โฟลเดอร์และส่วนเสริม', 'เสร็จสิ้น'];
const assistantPresets = ['STeP Mate', 'น้องสเต็ป'];

export function SetupWizard({
  snapshot,
  call,
  refresh,
  onDone,
  onError,
}: {
  snapshot: Snapshot;
  call: Call;
  refresh: () => Promise<Snapshot | undefined>;
  onDone: (tour: boolean) => void;
  onError: (error: unknown) => void;
}) {
  const s = snapshot.settings;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [customize, setCustomize] = useState(false);
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState('');
  const [userName, setUserName] = useState(s.userName || ''),
    [team, setTeam] = useState(s.team || '');
  const [assistant, setAssistant] = useState(s.assistant || 'STeP Mate'),
    [personality, setPersonality] = useState<Personality>(s.personality || 'coworker'),
    [tone, setTone] = useState(s.assistantTone || '');
  const [choice, setChoice] = useState<ProviderChoice>(initialChoice),
    [tested, setTested] = useState<Connection | null>(null);
  const [connecting, setConnecting] = useState<{ id: string; text: string } | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e) {
      onError(e);
    } finally {
      setBusy('');
    }
  };
  useEffect(
    () =>
      window.step?.onEvent(event => {
        if (event.type === 'connect-progress' && event.connectionId) setConnecting({ id: event.connectionId, text: event.text || '' });
      }),
    [],
  );

  const save = (extra: object = {}) =>
    call('settings', { userName, team, assistant, personality, assistantTone: tone, theme: s.theme, ...extra });
  const pilot = Boolean(snapshot.policy?.pilot);
  const finish = (tour: boolean) =>
    run('finish', async () => {
      await save();
      if (pilot) await call('acknowledgeData');
      await refresh();
      onDone(tour);
    });
  const skip = () =>
    run('skip', async () => {
      await call('settings', { userName: s.userName || '', team: s.team || '', assistant: s.assistant || 'STeP Mate', theme: s.theme });
      await refresh();
      onDone(false);
    });
  const style = styles.find(x => x.id === personality)!;
  const ready = snapshot.connections.some(c => c.ready);
  useEffect(() => {
    const heading = dialogRef.current?.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  }, [step]);

  return (
    <div
      ref={dialogRef}
      className="wizard"
      role="dialog"
      aria-modal="true"
      aria-label={t('ตั้งค่าเริ่มต้น STeP Desktop')}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key !== 'Tab') return;
        const items = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          ) || [],
        ).filter(el => el.getClientRects().length > 0);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (index < 0 || (e.shiftKey ? index === 0 : index === items.length - 1)) {
          e.preventDefault();
          (e.shiftKey ? items.at(-1) : items[0])?.focus();
        }
      }}
    >
      <div className="wizard-card">
        <ol className="wizard-steps" aria-label={t('ขั้นตอน')}>
          {steps
            .map((label, i) => ({ label, i }))
            .filter(({ i }) => (customize ? [0, 1, 2, 3, 5] : [0, 3, 5]).includes(i))
            .map(({ label, i }, index) => (
              <li key={label} className={i === step ? 'current' : i < step && !(i === 3 && !ready) ? 'done' : ''}>
                <span>{i < step && !(i === 3 && !ready) ? <Check size={11} /> : index + 1}</span>
                {t(label)}
                {i === 3 && i < step && !ready ? t(' · ทำภายหลัง') : ''}
              </li>
            ))}
        </ol>

        {step === 0 && (
          <section className="wizard-body center">
            <div className="language-switch" role="radiogroup" aria-label="Language">
              {(
                [
                  ['th', 'ไทย'],
                  ['en', 'English'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={(s.language || 'th') === id}
                  className={(s.language || 'th') === id ? 'active' : ''}
                  onClick={() =>
                    void run('language', async () => {
                      await call('settings', {
                        userName: s.userName || '',
                        team: s.team || '',
                        assistant: s.assistant || 'STeP Mate',
                        theme: s.theme,
                        language: id,
                      });
                      await refresh();
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <img className="illustration wizard-art" src={launchArt} alt="" />
            <h1>{t('ยินดีต้อนรับสู่ STeP Desktop')}</h1>
            <p className="muted">{t('เชื่อมบัญชี AI แล้วเริ่มงานแรกได้เลย ชื่อผู้ช่วยและส่วนเสริมตั้งภายหลังได้')}</p>
            <ul className="wizard-points">
              <li>{t('ใช้บัญชี AI ของคุณเอง ร่างและบทสนทนาเก็บในเครื่องนี้')}</li>
              <li>{t('ระบบปิดบังข้อมูลส่วนบุคคลที่ตรวจพบและถามก่อนส่งข้อมูลให้ AI')}</li>
              <li>{t('AI จัดทำร่างเท่านั้น การส่ง อนุมัติ และเบิกจ่ายเป็นหน้าที่ของคน')}</li>
            </ul>
            <button
              className="text-link"
              onClick={() => {
                setCustomize(true);
                setStep(1);
              }}
            >
              {t('ตั้งชื่อและรูปแบบผู้ช่วยก่อน (ไม่บังคับ)')}
            </button>
          </section>
        )}

        {step === 1 && (
          <section className="wizard-body">
            <img className="illustration wizard-art small" src={teamworkArt} alt="" />
            <h1>{t('อยากให้เรียกคุณว่าอะไร')}</h1>
            <label>
              {t('ชื่อเรียก')}
              <input
                autoFocus
                value={userName}
                maxLength={60}
                placeholder={t('เช่น ต้น, พี่นุ่น')}
                onChange={e => setUserName(e.target.value)}
              />
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
            <p className="small muted">{t('ทีมช่วยให้ระบบเลือกวิธีทำงานที่ตรงกับคุณได้แม่นขึ้น')}</p>
          </section>
        )}

        {step === 2 && (
          <section className="wizard-body">
            <h1>{t('ตั้งค่าผู้ช่วย AI ของคุณ')}</h1>
            <label>{t('ชื่อผู้ช่วย')}</label>
            <div className="choice-row">
              {assistantPresets.map(name => (
                <button key={name} className={assistant === name ? 'choice active' : 'choice'} onClick={() => setAssistant(name)}>
                  {name}
                </button>
              ))}
              <input
                aria-label={t('ชื่อผู้ช่วยแบบกำหนดเอง')}
                placeholder={t('หรือพิมพ์ชื่อเอง')}
                maxLength={60}
                value={assistantPresets.includes(assistant) ? '' : assistant}
                onChange={e => setAssistant(e.target.value || 'STeP Mate')}
              />
            </div>
            <label>{t('วิธีพูดคุย')}</label>
            <div className="style-grid">
              {styles.map(x => (
                <button
                  key={x.id}
                  className={personality === x.id ? 'style-card active' : 'style-card'}
                  onClick={() => setPersonality(x.id)}
                >
                  <strong>{t(x.label)}</strong>
                  <small>{t(x.tone)}</small>
                </button>
              ))}
            </div>
            {personality === 'custom' && (
              <textarea
                aria-label={t('สไตล์ที่ต้องการ')}
                maxLength={300}
                placeholder={t('เช่น เรียกผมว่าพี่ ตอบเป็นข้อ ๆ และสรุปสิ่งที่ต้องทำท้ายคำตอบ')}
                value={tone}
                onChange={e => setTone(e.target.value)}
              />
            )}
            <div className="style-preview">
              <span className="avatar">
                <Sparkles size={14} />
              </span>
              <div>
                <small>{assistant}</small>
                <p>{style.sample(userName, assistant)}</p>
              </div>
            </div>
            <p className="small muted">{t('บันทึกความชอบไว้ในเครื่อง เปลี่ยนภายหลังได้ในการตั้งค่า')}</p>
          </section>
        )}

        {step === 3 && (
          <section className="wizard-body">
            <h1>{t('เชื่อมต่อ AI')}</h1>
            <p className="muted">{t('เลือกบริการที่คุณมีบัญชีอยู่แล้ว ระบบจะส่งคำขอสั้น ๆ หนึ่งครั้งเพื่อทดสอบ')}</p>
            {snapshot.connections.map(c => (
              <p key={c.id} className={c.ready ? 'connected small' : 'small muted'}>
                <Plug size={13} /> {providerLabel(c.provider)} · {t(c.note)}
              </p>
            ))}
            <ProviderFields
              value={choice}
              onChange={setChoice}
              call={call}
              claudeSubscription={Boolean(snapshot.features?.claudeSubscription)}
            />
            {choice.mode !== 'claude-code' && (
              <>
                <button
                  className="connect-primary"
                  disabled={Boolean(busy) || !providerChoiceReady(choice)}
                  onClick={() =>
                    void run('connect', async () => {
                      const c = await call('connection', {
                        provider: choice.provider,
                        mode: choice.mode,
                        apiKey: choice.key,
                        googleCloudProject: choice.googleCloudProject,
                        baseUrl: choice.baseUrl,
                        protocol: choice.protocol,
                        model: choice.model,
                      });
                      setChoice({ ...choice, key: '' });
                      setConnecting({ id: c.id, text: t('กำลังเริ่มเชื่อมต่อ') });
                      try {
                        setTested(await call('connect', { id: c.id }));
                      } finally {
                        setConnecting(null);
                      }
                      await refresh();
                    })
                  }
                >
                  {busy === 'connect' ? <LoaderCircle size={15} className="spin" /> : <Plug size={15} />}
                  {busy === 'connect'
                    ? t('กำลังเชื่อมต่อ… อาจมีหน้าลงชื่อเข้าใช้เปิดในเบราว์เซอร์')
                    : choice.provider === 'openai' && choice.mode === 'subscription'
                      ? t('เชื่อมต่อ ChatGPT')
                      : choice.provider === 'gemini' && choice.mode === 'subscription'
                        ? t('เชื่อมต่อ Google')
                        : choice.provider === 'gemini' && choice.mode === 'api'
                          ? t('เชื่อมต่อ Gemini')
                          : choice.provider === 'claude' && choice.mode === 'oauth'
                            ? t('เชื่อมต่อ Claude OAuth')
                            : choice.provider === 'claude' && choice.mode === 'subscription'
                              ? t('เชื่อมต่อ Claude')
                              : t('เชื่อมต่อและทดสอบ')}
                </button>
                {busy === 'connect' && connecting && (
                  <p className="connect-progress">
                    <LoaderCircle size={13} className="spin" />
                    {connecting.text}
                    <button className="text-link" onClick={() => void call('cancelConnect', { id: connecting.id })}>
                      {t('ยกเลิก')}
                    </button>
                  </p>
                )}
                {tested && <p className={tested.ready ? 'connected small' : 'small danger-text'}>{t(tested.note)}</p>}
              </>
            )}
          </section>
        )}

        {step === 5 && (
          <section className="wizard-body center">
            <img className="illustration wizard-art" src={teamworkArt} alt="" />
            <h1>{ready ? (userName ? t('พร้อมแล้ว คุณ{0}', userName) : t('พร้อมเริ่มงานแล้ว')) : t('บันทึกการตั้งค่าแล้ว')}</h1>
            <p className="muted">
              {ready ? t('{0} พร้อมช่วยงานแรกของคุณ', assistant) : t('ยังไม่ได้เชื่อมต่อ AI เชื่อมบัญชีก่อนเริ่มคุยกับผู้ช่วย')}
            </p>
            <p className="small muted">{t('เริ่มจากงานตัวอย่าง หรือปรับผู้ช่วยและส่วนเสริมภายหลังในการตั้งค่า')}</p>
            {pilot && (
              <p className="wizard-ack small">
                {t(
                  'ช่วงทดลองใช้: ข้อความและไฟล์ที่คุณส่งจะไปถึงผู้ให้บริการ AI ที่เชื่อมไว้ ระบบบล็อกรหัสผ่านและข้อมูลอ่อนไหวที่ระบุตัวบุคคล และปิดบังเลขบัตรประชาชนให้อัตโนมัติ ส่งเฉพาะข้อมูลที่คุณมีสิทธิ์ใช้ การกดปุ่มด้านล่างถือว่ารับทราบ',
                )}
              </p>
            )}
          </section>
        )}

        <footer className="wizard-actions">
          {step > 0 && step < 5 && (
            <button className="quiet" disabled={Boolean(busy)} onClick={() => setStep(step === 3 ? (customize ? 2 : 0) : step - 1)}>
              <ArrowLeft size={15} />
              {t('ย้อนกลับ')}
            </button>
          )}
          {step < 5 && (
            <button className="text-link" disabled={Boolean(busy)} onClick={skip}>
              {t('ข้าม ตั้งค่าทีหลัง')}
            </button>
          )}
          <span className="spacer" />
          {step < 5 ? (
            <button
              className={step === 3 && !ready ? 'quiet' : ''}
              disabled={Boolean(busy)}
              onClick={() => setStep(step === 0 ? 3 : step === 3 ? 5 : step + 1)}
            >
              {step === 0 ? t('เริ่มตั้งค่า') : step === 3 && !ready ? t('ทำภายหลัง') : t('ถัดไป')}
              <ArrowRight size={15} />
            </button>
          ) : (
            <>
              <button className="quiet" disabled={Boolean(busy)} onClick={() => finish(false)}>
                {ready ? t('เริ่มใช้งานเลย') : t('เข้าชมพื้นที่ทำงาน')}
              </button>
              <button disabled={Boolean(busy)} onClick={() => (ready ? finish(true) : setStep(3))}>
                {ready ? t('ดูทัวร์แนะนำ') : t('เชื่อมต่อ AI')}
                <ArrowRight size={15} />
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
