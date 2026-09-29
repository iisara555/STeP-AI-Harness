import { useEffect, useState } from 'react';
import { Check, FolderOpen, LoaderCircle, Monitor, Moon, Plus, Settings2, ShieldCheck, Sparkles, Sun } from 'lucide-react';
import { ConfirmDialog, ProviderFields, initialChoice, type ProviderChoice } from './ui';
import { explainError, providerLabel, shortcut } from './messages';
import teamworkArt from './assets/illustrations/teamwork.png';
import type { Connection, Snapshot } from './types';

export function SettingsPanel({
  initialPage,
  snapshot,
  call,
  refresh,
  close,
  onError,
  openWizard,
  openTour,
}: {
  initialPage: 'general' | 'ai';
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
    [assistantTone, setAssistantTone] = useState(snapshot.settings.assistantTone || '');
  const [choice, setChoice] = useState<ProviderChoice>(initialChoice);
  const [busy, setBusy] = useState(''),
    [progress, setProgress] = useState<Record<string, string>>({}),
    [removingConnection, setRemovingConnection] = useState<Connection | null>(null);
  useEffect(
    () =>
      window.step?.onEvent(event => {
        if (event.type === 'connect-progress' && event.connectionId) setProgress(p => ({ ...p, [event.connectionId!]: event.text || '' }));
      }),
    [],
  );
  // New users land on AI connections when none exist; otherwise on general settings.
  const [page, setPage] = useState<'general' | 'ai' | 'appearance' | 'privacy'>(
    initialPage === 'ai' || (snapshot.settings.onboarding && !snapshot.connections.length) ? 'ai' : 'general',
  );
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
    ['general', 'ทั่วไป', Settings2],
    ['ai', 'การเชื่อมต่อ AI', Sparkles],
    ['appearance', 'รูปลักษณ์', Sun],
    ['privacy', 'ความเป็นส่วนตัว', ShieldCheck],
  ] as const;
  return (
    <div className="settings-content">
      <div className="settings-hero">
        <div>
          <h1>พร้อมทำงาน ในแบบของคุณ</h1>
          <p className="muted">ตั้งค่าเพียงครั้งแรก แล้วเริ่มงานได้จากบทสนทนา</p>
        </div>
        <img className="illustration settings-art" src={teamworkArt} alt="" />
      </div>
      <div className="settings-tabs" role="tablist" aria-label="หมวดการตั้งค่า">
        {pages.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={page === id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
            <Icon size={15} />
            {label}
            {id === 'ai' && !snapshot.connections.some(c => c.ready) && <span className="tab-dot" aria-label="ยังไม่พร้อม" />}
          </button>
        ))}
      </div>
      {page === 'general' && (
        <section>
          <h2>ผู้ช่วยและทีม</h2>
          <div className="form-grid">
            <label>
              ชื่อเรียกของคุณ
              <input value={userName} maxLength={60} placeholder="เช่น ต้น" onChange={e => setUserName(e.target.value)} />
            </label>
            <label>
              ชื่อผู้ช่วย
              <input value={assistant} onChange={e => setAssistant(e.target.value)} />
            </label>
            <label>
              วิธีพูดคุย
              <select value={personality} onChange={e => setPersonality(e.target.value as any)}>
                <option value="coworker">เพื่อนร่วมงาน · เป็นกันเอง สุภาพ</option>
                <option value="professional">มืออาชีพ · มีโครงสร้าง ชัดเจน</option>
                <option value="concise">กระชับ · สั้น ตรงประเด็น</option>
                <option value="custom">กำหนดเอง</option>
              </select>
            </label>
            {personality === 'custom' ? (
              <label>
                สไตล์ที่ต้องการ
                <input
                  value={assistantTone}
                  maxLength={300}
                  placeholder="เช่น ตอบเป็นข้อ ๆ และสรุปสิ่งที่ต้องทำท้ายคำตอบ"
                  onChange={e => setAssistantTone(e.target.value)}
                />
              </label>
            ) : (
              <span />
            )}
            <label>
              ทีมหลัก
              <select value={team} onChange={e => setTeam(e.target.value)}>
                <option value="">ยังไม่แน่ใจ · เลือกภายหลัง</option>
                {snapshot.teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.id.toUpperCase()} · {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>โฟลเดอร์เก็บผลงาน</label>
          <div className="folder-row">
            <span>{snapshot.settings.workspace || 'ยังไม่เลือกโฟลเดอร์'}</span>
            <button className="quiet" onClick={() => void run('workspace', () => call('workspace'))}>
              <FolderOpen size={16} />
              เลือกโฟลเดอร์
            </button>
          </div>
          <p className="small muted">
            ไฟล์ที่ส่งออกจะตั้งชื่อตามทีมและวันที่ในโฟลเดอร์นี้ ส่วน USER.md (ชื่อ ผู้ช่วย และวิธีพูดคุย) เก็บในโฟลเดอร์นี้เพื่อใช้ร่วมกับ
            STeP AI บน CLI
          </p>
          <div className="folder-row">
            <span>{snapshot.userFile || 'USER.md จะถูกสร้างเมื่อบันทึกการตั้งค่า'}</span>
            {snapshot.userFile && (
              <button className="quiet" onClick={() => void run('user', () => call('reveal', { path: snapshot.userFile }))}>
                เปิดตำแหน่งไฟล์
              </button>
            )}
          </div>
          <div className="choice-row" style={{ marginTop: 14 }}>
            <button className="quiet" onClick={openWizard}>
              เปิดตัวช่วยตั้งค่าเริ่มต้น
            </button>
            <button className="quiet" onClick={openTour}>
              ดูทัวร์แนะนำอีกครั้ง
            </button>
          </div>
        </section>
      )}
      {page === 'appearance' && (
        <section>
          <h2>ธีม</h2>
          <p className="muted small">เลือกให้ตามระบบปฏิบัติการ หรือกำหนดเอง</p>
          <div className="theme-options">
            {(
              [
                ['system', 'ตามระบบ', Monitor],
                ['light', 'สว่าง', Sun],
                ['dark', 'มืด', Moon],
              ] as const
            ).map(([id, label, Icon]) => (
              <button key={id} className={theme === id ? 'active' : 'quiet'} onClick={() => setTheme(id)}>
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <p className="small muted">ทางลัด: กด {shortcut} แล้วพิมพ์ “ธีม” เพื่อสลับได้จากทุกหน้า</p>
        </section>
      )}
      {page === 'privacy' && (
        <section className="privacy-info">
          <h2>ข้อมูลของคุณ</h2>
          <h3>อะไรถูกส่งให้ AI</h3>
          <p>เฉพาะคำขอ ร่างของงานนั้น บทสนทนาล่าสุด และข้อความที่ตรวจแล้วจากไฟล์แนบ ไม่ส่งไฟล์ต้นฉบับ</p>
          <h3>ก่อนส่ง ระบบตรวจอะไร</h3>
          <p>
            ปิดบังเลขบัตรประชาชน เบอร์โทร อีเมล และเลขบัญชีที่ตรวจพบ ถ้าพบรหัสผ่านหรือ API key หรือข้อมูลอ่อนไหวคู่กับตัวบุคคล
            ระบบจะไม่ส่งเลย ถ้าพบสัญญาณข้อมูลบุคคล เช่น รายชื่อ จะถามยืนยันก่อน
          </p>
          <h3>เมื่อไรจะถามยืนยัน</h3>
          <p>
            ครั้งแรกที่ใช้บนเครื่องนี้ เมื่อแนบไฟล์ และเมื่อพบข้อมูลที่ควรตรวจ ส่วนข้อมูลที่ปิดบังให้อัตโนมัติจะแจ้งทุกครั้ง
            ผลสแกนเป็นตัวช่วย ไม่ใช่การอนุญาตจากองค์กร
          </p>
          <h3>เก็บข้อมูลที่ไหน</h3>
          <p>บทสนทนาและร่างอยู่ในเครื่องนี้เท่านั้น API key เข้ารหัสด้วยระบบของ Windows/macOS การลบงานจะลบออกจากเครื่องถาวร</p>
          <h3>สิ่งที่ AI ทำไม่ได้</h3>
          <p>
            AI ในแอปนี้จัดทำร่างเท่านั้น ไม่มีสิทธิ์รันคำสั่ง เปิดไฟล์ในเครื่อง หรือส่ง อนุมัติ และเบิกจ่ายแทนคุณ
            ขั้นตอนดำเนินการจริงต้องทำโดยผู้มีอำนาจ
          </p>
        </section>
      )}
      {page === 'ai' && (
        <section>
          <h2>การเชื่อมต่อ AI</h2>
          <p className="muted small">
            เชื่อมด้วยบัญชีส่วนตัว (ลงชื่อเข้าใช้ ใช้โควตาของแพ็กเกจที่คุณสมัคร) หรือ API key (คิดค่าใช้จ่ายตามการใช้งาน)
            การทดสอบจะส่งคำขอสั้น ๆ หนึ่งครั้ง
          </p>
          {snapshot.connections.map(c => (
            <div className="connection-row" key={c.id}>
              <div>
                <strong>
                  {providerLabel(c.provider)} <small>{c.mode === 'api' ? 'API key' : 'บัญชีส่วนตัว'}</small>
                </strong>
                {busy === c.id && progress[c.id] ? (
                  <p className="connect-progress">
                    <LoaderCircle size={13} className="spin" />
                    {progress[c.id]}
                  </p>
                ) : (
                  <p className={c.ready ? 'connected' : 'muted'}>{c.note}</p>
                )}
                {c.provider === 'claude' && c.mode === 'subscription' && busy !== c.id && (
                  <p className={c.signedIn ? 'small connected' : 'small muted'}>
                    {c.signedIn ? 'ลงชื่อบัญชี Claude แล้ว' : 'ยังไม่ได้ลงชื่อบัญชี Claude'}
                  </p>
                )}
                {c.modelsAt && (
                  <p className="small muted">
                    โมเดล {c.models?.length || 0} รายการ · อัปเดต {new Date(c.modelsAt).toLocaleString('th-TH')}
                  </p>
                )}
              </div>
              <div className="connection-actions">
                <button disabled={Boolean(busy)} onClick={() => void run(c.id, () => call('connect', { id: c.id }))}>
                  {busy === c.id ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                  {c.provider === 'claude' && c.mode === 'subscription' ? 'เชื่อมต่อ Claude' : 'เชื่อมต่อและทดสอบ'}
                </button>
                {busy === c.id && (
                  <button className="quiet" onClick={() => void call('cancelConnect', { id: c.id })}>
                    ยกเลิก
                  </button>
                )}
                {c.ready && (
                  <button
                    className="quiet"
                    disabled={Boolean(busy)}
                    onClick={() => void run(c.id + ':models', () => call('models', { id: c.id }))}
                  >
                    {busy === c.id + ':models' ? <LoaderCircle size={15} className="spin" /> : null}โหลดรายชื่อโมเดล
                  </button>
                )}
                {c.provider !== 'claude' &&
                  (c.customRuntime ? (
                    <button
                      className="quiet"
                      disabled={Boolean(busy)}
                      title="เลิกใช้ runtime ที่เลือกเอง"
                      onClick={() => void run(c.id, () => call('runtime', { id: c.id, reset: true }))}
                    >
                      ใช้ตัวเชื่อมที่มากับแอป
                    </button>
                  ) : (
                    <button
                      className="quiet"
                      disabled={Boolean(busy)}
                      title="สำหรับผู้ดูแลระบบ: ใช้ Codex หรือ Gemini CLI ที่ติดตั้งเอง"
                      onClick={() => void run(c.id, () => call('runtime', { id: c.id }))}
                    >
                      เลือก runtime
                    </button>
                  ))}
                {(c.ready || c.mode === 'subscription') && (
                  <button
                    className="quiet"
                    disabled={Boolean(busy)}
                    title="ลบข้อมูลลงชื่อของการเชื่อมต่อนี้ออกจากเครื่อง"
                    onClick={() => void run(c.id, () => call('disconnect', { id: c.id }))}
                  >
                    ออกจากระบบ
                  </button>
                )}
                <button className="quiet danger-text" disabled={Boolean(busy)} onClick={() => setRemovingConnection(c)}>
                  ลบ
                </button>
              </div>
            </div>
          ))}
          {removingConnection && (
            <ConfirmDialog
              title="ลบการเชื่อมต่อนี้?"
              tone="danger"
              confirmLabel="ลบการเชื่อมต่อ"
              onCancel={() => setRemovingConnection(null)}
              onConfirm={async () => {
                try {
                  await call('removeConnection', { id: removingConnection.id });
                } catch (e) {
                  throw new Error(explainError(e));
                }
                setRemovingConnection(null);
                await refresh();
              }}
            >
              <p>
                {providerLabel(removingConnection.provider)} ({removingConnection.mode === 'api' ? 'API key' : 'บัญชี'})
                จะถูกลบพร้อมข้อมูลลงชื่อหรือ API key ที่เก็บในเครื่องนี้ บัญชีของคุณที่ผู้ให้บริการไม่ได้รับผลกระทบ
              </p>
              <p className="small muted">งานที่ใช้การเชื่อมต่อนี้ยังอยู่ครบ เลือก AI ใหม่ได้ในกล่องพิมพ์ของงานนั้น</p>
            </ConfirmDialog>
          )}
          <div className="connection-form">
            <ProviderFields
              value={choice}
              onChange={setChoice}
              call={call}
              claudeSubscription={Boolean(snapshot.features?.claudeSubscription)}
            />
            {choice.mode !== 'claude-code' && (
              <>
                <p className="small muted">รายชื่อโมเดลจะโหลดจากบริการอัตโนมัติหลังเชื่อมต่อสำเร็จ แล้วเลือกได้จากกล่องพิมพ์</p>
                <button
                  disabled={Boolean(busy) || (choice.mode === 'api' && !choice.key.trim())}
                  onClick={() =>
                    void run('new', async () => {
                      await call('connection', { provider: choice.provider, mode: choice.mode, apiKey: choice.key });
                      setChoice({ ...choice, key: '' });
                    })
                  }
                >
                  <Plus size={16} />
                  เพิ่มการเชื่อมต่อ
                </button>
              </>
            )}
          </div>
        </section>
      )}
      <div className="settings-save">
        {page === 'ai' || page === 'privacy' ? (
          <button className="quiet" onClick={close}>
            กลับไปที่งาน
          </button>
        ) : (
          <button
            disabled={Boolean(busy)}
            onClick={() =>
              void run('settings', async () => {
                await call('settings', { assistant, team, theme, userName, personality, assistantTone });
                close();
              })
            }
          >
            <Check size={17} />
            บันทึกและไปที่งาน
          </button>
        )}
      </div>
    </div>
  );
}
