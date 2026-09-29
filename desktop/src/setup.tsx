import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, FolderOpen, LoaderCircle, Plug, Sparkles } from 'lucide-react';
import type { Connection, Settings, Snapshot } from './types';
import { ProviderFields, initialChoice, type ProviderChoice } from './ui';
import { providerLabel } from './messages';
import launchArt from './assets/illustrations/launch.png';
import teamworkArt from './assets/illustrations/teamwork.png';
import draftingArt from './assets/illustrations/drafting.png';
import ideaArt from './assets/illustrations/idea.png';

type Call = (method: string, input?: unknown) => Promise<any>;
type Personality = NonNullable<Settings['personality']>;
// Same presets as USER.md (src/modules/user-memory.js), with a sample line so people can hear the difference.
const styles: { id: Personality; label: string; tone: string; sample: (user: string, ai: string) => string }[] = [
  { id: 'coworker', label: 'เพื่อนร่วมงาน', tone: 'เป็นกันเอง สุภาพ พูดธรรมชาติ', sample: (u, a) => `สวัสดีครับ${u ? 'คุณ' + u : ''} ${a} พร้อมช่วยแล้ว วันนี้มีงานอะไรให้ลุยด้วยกันครับ` },
  { id: 'professional', label: 'มืออาชีพ', tone: 'สุภาพ มีโครงสร้าง ชัดเจน', sample: (u, a) => `เรียน${u ? 'คุณ' + u : 'ท่าน'} ${a} พร้อมให้การสนับสนุน กรุณาระบุงานที่ต้องการดำเนินการครับ` },
  { id: 'concise', label: 'กระชับ', tone: 'ตอบสั้น ตรงประเด็น', sample: (u, a) => `${u ? u + ' ' : ''}พร้อมครับ บอกงานมาได้เลย — ${a}` },
  { id: 'custom', label: 'กำหนดเอง', tone: 'เขียนสไตล์ที่ต้องการ', sample: (u, a) => `${a} จะคุยกับ${u ? 'คุณ' + u : 'คุณ'}ตามสไตล์ที่กำหนดไว้ครับ` },
];
const steps = ['ต้อนรับ', 'เกี่ยวกับคุณ', 'ผู้ช่วย AI', 'เชื่อมต่อ AI', 'โฟลเดอร์และส่วนเสริม', 'เสร็จสิ้น'];
const assistantPresets = ['STeP Mate', 'น้องสเต็ป'];

export function SetupWizard({ snapshot, call, refresh, onDone, onError }: { snapshot: Snapshot; call: Call; refresh: () => Promise<Snapshot | undefined>; onDone: (tour: boolean) => void; onError: (error: unknown) => void }) {
  const s = snapshot.settings;
  const [step, setStep] = useState(0), [busy, setBusy] = useState('');
  const [userName, setUserName] = useState(s.userName || ''), [team, setTeam] = useState(s.team || '');
  const [assistant, setAssistant] = useState(s.assistant || 'STeP Mate'), [personality, setPersonality] = useState<Personality>(s.personality || 'coworker'), [tone, setTone] = useState(s.assistantTone || '');
  const [choice, setChoice] = useState<ProviderChoice>(initialChoice), [tested, setTested] = useState<Connection | null>(null);
  const [ocr, setOcr] = useState<any>(null), [log, setLog] = useState<string[]>([]), [connecting, setConnecting] = useState<{ id: string; text: string } | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>) => { setBusy(id); try { await fn(); } catch (e) { onError(e); } finally { setBusy(''); } };
  useEffect(() => window.step?.onEvent(event => {
    if (event.type === 'install' && event.text) setLog(lines => [...lines, event.text!].slice(-6));
    if (event.type === 'connect-progress' && event.connectionId) setConnecting({ id: event.connectionId, text: event.text || '' });
  }), []);
  useEffect(() => { if (step === 4 && !ocr) void call('ocrStatus').then(setOcr).catch(() => setOcr({})); }, [step]);

  const save = (extra: object = {}) => call('settings', { userName, team, assistant, personality, assistantTone: tone, theme: s.theme, ...extra });
  const finish = (tour: boolean) => run('finish', async () => { await save(); await refresh(); onDone(tour); });
  const skip = () => run('skip', async () => { await call('settings', { userName: s.userName || '', team: s.team || '', assistant: s.assistant || 'STeP Mate', theme: s.theme }); await refresh(); onDone(false); });
  const style = styles.find(x => x.id === personality)!;
  const ready = snapshot.connections.some(c => c.ready);

  return <div className="wizard" role="dialog" aria-modal="true" aria-label="ตั้งค่าเริ่มต้น STeP Desktop">
    <div className="wizard-card">
      <ol className="wizard-steps" aria-label="ขั้นตอน">{steps.map((label, i) => <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''}><span>{i < step ? <Check size={11}/> : i + 1}</span>{label}</li>)}</ol>

      {step === 0 && <section className="wizard-body center">
        <img className="illustration wizard-art" src={launchArt} alt=""/>
        <h1>ยินดีต้อนรับสู่ STeP Desktop</h1>
        <p className="muted">ผู้ช่วยจัดทำร่างเอกสารภาษาไทยสำหรับงานของ STeP ใช้เวลาตั้งค่าประมาณ 2 นาที</p>
        <ul className="wizard-points"><li>ใช้บัญชี AI ของคุณเอง ร่างและบทสนทนาเก็บในเครื่องนี้</li><li>ระบบปิดบังข้อมูลส่วนบุคคลที่ตรวจพบและถามก่อนส่งข้อมูลให้ AI</li><li>AI จัดทำร่างเท่านั้น การส่ง อนุมัติ และเบิกจ่ายเป็นหน้าที่ของคน</li></ul>
      </section>}

      {step === 1 && <section className="wizard-body">
        <img className="illustration wizard-art small" src={teamworkArt} alt=""/>
        <h1>อยากให้เรียกคุณว่าอะไร</h1>
        <label>ชื่อเรียก<input autoFocus value={userName} maxLength={60} placeholder="เช่น ต้น, พี่นุ่น" onChange={e => setUserName(e.target.value)}/></label>
        <label>ทีมหลัก<select value={team} onChange={e => setTeam(e.target.value)}><option value="">ยังไม่แน่ใจ · เลือกภายหลัง</option>{snapshot.teams.map(t => <option key={t.id} value={t.id}>{t.id.toUpperCase()} · {t.name}</option>)}</select></label>
        <p className="small muted">ทีมช่วยให้ระบบเลือก Skill ที่ตรงกับงานของคุณได้แม่นขึ้น</p>
      </section>}

      {step === 2 && <section className="wizard-body">
        <h1>ตั้งค่าผู้ช่วย AI ของคุณ</h1>
        <label>ชื่อผู้ช่วย</label>
        <div className="choice-row">{assistantPresets.map(name => <button key={name} className={assistant === name ? 'choice active' : 'choice'} onClick={() => setAssistant(name)}>{name}</button>)}<input aria-label="ชื่อผู้ช่วยแบบกำหนดเอง" placeholder="หรือพิมพ์ชื่อเอง" maxLength={60} value={assistantPresets.includes(assistant) ? '' : assistant} onChange={e => setAssistant(e.target.value || 'STeP Mate')}/></div>
        <label>วิธีพูดคุย</label>
        <div className="style-grid">{styles.map(x => <button key={x.id} className={personality === x.id ? 'style-card active' : 'style-card'} onClick={() => setPersonality(x.id)}><strong>{x.label}</strong><small>{x.tone}</small></button>)}</div>
        {personality === 'custom' && <textarea aria-label="สไตล์ที่ต้องการ" maxLength={300} placeholder="เช่น เรียกผมว่าพี่ ตอบเป็นข้อ ๆ และสรุปสิ่งที่ต้องทำท้ายคำตอบ" value={tone} onChange={e => setTone(e.target.value)}/>}
        <div className="style-preview"><span className="avatar"><Sparkles size={14}/></span><div><small>{assistant}</small><p>{style.sample(userName, assistant)}</p></div></div>
        <p className="small muted">บันทึกลง <code>USER.md</code> ในโฟลเดอร์ทำงานของคุณ ใช้ร่วมกับ STeP AI บน CLI ได้ เปลี่ยนภายหลังได้ในการตั้งค่า</p>
      </section>}

      {step === 3 && <section className="wizard-body">
        <h1>เชื่อมต่อ AI</h1>
        <p className="muted">เลือกบริการที่คุณมีบัญชีอยู่แล้ว ระบบจะส่งคำขอสั้น ๆ หนึ่งครั้งเพื่อทดสอบ</p>
        {snapshot.connections.map(c => <p key={c.id} className={c.ready ? 'connected small' : 'small muted'}><Plug size={13}/> {providerLabel(c.provider)} · {c.note}</p>)}
        <ProviderFields value={choice} onChange={setChoice} call={call}/>
        {choice.mode !== 'claude-code' && <>
        <button disabled={Boolean(busy) || (choice.mode === 'api' && !choice.key.trim())} onClick={() => void run('connect', async () => { const c = await call('connection', { provider: choice.provider, mode: choice.mode, apiKey: choice.key }); setChoice({ ...choice, key: '' }); setConnecting({ id: c.id, text: 'กำลังเริ่มเชื่อมต่อ' }); try { setTested(await call('connect', { id: c.id })); } finally { setConnecting(null); } await refresh(); })}>{busy === 'connect' ? <LoaderCircle size={15} className="spin"/> : <Plug size={15}/>}{busy === 'connect' ? 'กำลังเชื่อมต่อ… อาจมีหน้าลงชื่อเข้าใช้เปิดในเบราว์เซอร์' : 'เชื่อมต่อและทดสอบ'}</button>
        {busy === 'connect' && connecting && <p className="connect-progress"><LoaderCircle size={13} className="spin"/>{connecting.text}<button className="text-link" onClick={() => void call('cancelConnect', { id: connecting.id })}>ยกเลิก</button></p>}
        {tested && <p className={tested.ready ? 'connected small' : 'small danger-text'}>{tested.note}</p>}</>}
      </section>}

      {step === 4 && <section className="wizard-body">
        <img className="illustration wizard-art small" src={draftingArt} alt=""/>
        <h1>โฟลเดอร์ทำงานและส่วนเสริม</h1>
        <label>โฟลเดอร์เก็บผลงาน</label>
        <div className="folder-row"><span>{snapshot.settings.workspace || 'ยังไม่เลือก · USER.md จะเก็บในข้อมูลแอปก่อน'}</span><button className="quiet" disabled={Boolean(busy)} onClick={() => void run('folder', async () => { await save(); await call('workspace'); await refresh(); })}><FolderOpen size={15}/>เลือกโฟลเดอร์</button></div>
        <div className="addon"><img className="illustration" src={ideaArt} alt=""/><div>
          <strong>OCR ภาษาไทยสำหรับตรวจใบเสร็จ AFP <span className="beta">ทดลอง</span></strong>
          <p className="small muted">อ่านใบเสร็จบนเครื่องนี้ ไม่ส่งเอกสารขึ้นอินเทอร์เน็ต{ocr?.installed ? ' มาพร้อมแอปแล้ว ใช้ได้ทันที' : ' ติดตั้งครั้งเดียวประมาณ 1–2 GB (ต้องใช้อินเทอร์เน็ตตอนติดตั้ง)'}</p>
          {!ocr ? <p className="small muted">กำลังตรวจ…</p> : ocr.installed ? <p className="connected small"><Check size={13}/> ติดตั้งแล้ว</p>
            : ocr.python === false ? <><p className="small">ต้องมี Python 3.10–3.12 (64-bit) ก่อน</p><div className="choice-row"><button className="quiet" onClick={() => void run('py', () => call('openHelp', { topic: 'python' }))}>ดาวน์โหลด Python</button><button className="quiet" onClick={() => void run('check', async () => setOcr(await call('ocrStatus')))}>ตรวจอีกครั้ง</button></div></>
            : <button disabled={Boolean(busy)} onClick={() => void run('ocr', async () => { setLog([]); setOcr(await call('ocrInstall')); })}>{busy === 'ocr' ? <LoaderCircle size={15} className="spin"/> : <Download size={15}/>}{busy === 'ocr' ? 'กำลังติดตั้ง… ใช้เวลาหลายนาที' : 'ติดตั้งส่วนเสริม OCR'}</button>}
          {log.length > 0 && <pre className="install-log">{log.join('\n')}</pre>}
        </div></div>
      </section>}

      {step === 5 && <section className="wizard-body center">
        <img className="illustration wizard-art" src={teamworkArt} alt=""/>
        <h1>{userName ? `พร้อมแล้ว คุณ${userName}` : 'พร้อมเริ่มงานแล้ว'}</h1>
        <p className="muted">{assistant} จะคุยแบบ “{style.label}”{ready ? '' : ' · ยังไม่ได้เชื่อมต่อ AI เพิ่มได้ในการตั้งค่า'}</p>
        <p className="small muted">ดูทัวร์สั้น ๆ 7 จุด เพื่อรู้จักส่วนสำคัญของหน้าจอ</p>
      </section>}

      <footer className="wizard-actions">
        {step > 0 && step < 5 && <button className="quiet" onClick={() => setStep(step - 1)}><ArrowLeft size={15}/>ย้อนกลับ</button>}
        {step < 5 && <button className="text-link" disabled={Boolean(busy)} onClick={skip}>ข้าม ตั้งค่าทีหลัง</button>}
        <span className="spacer"/>
        {step < 5 ? <button className={step === 3 && !ready ? 'quiet' : ''} disabled={Boolean(busy)} onClick={() => setStep(step + 1)}>{step === 0 ? 'เริ่มตั้งค่า' : step === 3 && !ready ? 'ทำภายหลัง' : 'ถัดไป'}<ArrowRight size={15}/></button>
          : <><button className="quiet" disabled={Boolean(busy)} onClick={() => finish(false)}>เริ่มใช้งานเลย</button><button disabled={Boolean(busy)} onClick={() => finish(true)}>ดูทัวร์แนะนำ<ArrowRight size={15}/></button></>}
      </footer>
    </div>
  </div>;
}
