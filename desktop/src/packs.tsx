import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ui';
import { explainError, shownDate } from './messages';
import type { DesktopAPI } from './types';
import type { PackReview as PackReviewResult, SkillImportNote } from '../../src/modules/packs/index.js';
import { t } from './i18n';
const REVIEW_STATUS = {
  pass: 'ผ่านการตรวจความปลอดภัย พร้อมใช้',
  warn: 'พร้อมใช้ มีคำแนะนำ {0} ข้อ',
  fail: 'ต้องแก้ {0} ข้อก่อนใช้',
};
/** What the import changed in the file, in words staff can act on. */
const noteText = (note: SkillImportNote) =>
  note.code === 'removed-authority'
    ? t('ตัดบรรทัด {0} ออกจากหัวไฟล์ เพราะ Skill ของพนักงานกำหนดสิทธิ์เครื่องมือเองไม่ได้', note.keys.join(', '))
    : note.code === 'named'
      ? t('ตั้งชื่อ Skill เป็น {0} ให้อัตโนมัติ', note.name)
      : note.code === 'renamed'
        ? t('มี Skill ชื่อเดียวกันอยู่แล้ว จึงตั้งชื่อเป็น {0}', note.name)
        : t('ใช้บรรทัดแรกของไฟล์เป็นคำอธิบาย Skill');
/** The automated Standard v2 and safety report. Advice for the uploader and admin; it approves nothing. */
function PackReview({ review, adminApproved }: { review: PackReviewResult; adminApproved?: boolean }) {
  const visible = adminApproved ? review.findings.filter(f => f.code !== 'safety.hooks') : review.findings;
  const status = adminApproved ? (visible.some(f => f.level === 'fail') ? 'fail' : visible.length ? 'warn' : 'pass') : review.status;
  const fails = visible.filter(f => f.level === 'fail').length;
  const label =
    status === 'pass' ? t(REVIEW_STATUS.pass) : status === 'warn' ? t(REVIEW_STATUS.warn, visible.length) : t(REVIEW_STATUS.fail, fails);
  return (
    <details className={`pack-review ${status}`} open={status === 'fail'}>
      <summary role="status">
        {status === 'pass' ? '✓ ' : status === 'warn' ? '! ' : '✕ '}
        {label}
      </summary>
      {visible.length > 0 && (
        <ul>
          {visible.map((f, i) => (
            <li key={i} className={f.level === 'fail' ? 'error' : 'muted'}>
              {f.area === 'safety' ? t('ความปลอดภัย') : t('มาตรฐาน')}
              {f.file ? ` · ${f.file}${f.line ? ':' + f.line : ''}` : ''} — {t(f.template, ...f.args)}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
type SkillDraft = { id: string; text: string; review: PackReviewResult };
/**
 * "สร้างจากวิธีทำงานของฉัน": three plain questions, a draft from the connected AI, then a preview the person can edit.
 * Nothing is saved until "ใช้ Skill นี้"; the saved Skill goes through the same checks as an imported file.
 */
function CreateSkill({
  api,
  connection,
  disabled,
  onCreated,
  onCancel,
}: {
  api: DesktopAPI;
  connection?: { id: string; name: string };
  disabled: boolean;
  onCreated: (result: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [task, setTask] = useState(''),
    [steps, setSteps] = useState(''),
    [example, setExample] = useState(''),
    [draft, setDraft] = useState<SkillDraft | null>(null),
    [text, setText] = useState(''),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const run = async (job: () => Promise<void>) => {
    setWorking(true);
    setError('');
    try {
      await job();
    } catch (e) {
      if (alive.current && (e as Error)?.message !== 'CANCELLED') setError(explainError(e));
    } finally {
      if (alive.current) setWorking(false);
    }
  };
  const busy = disabled || working;
  return (
    <section className="skill-create" aria-label={t('สร้าง Skill จากวิธีทำงานของฉัน')}>
      {!draft ? (
        <>
          <label className="field">
            <span>{t('1. งานนี้คืออะไร และใช้เมื่อไร')}</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={task}
              disabled={busy}
              placeholder={t('เช่น ร่างอีเมลขอจองห้องประชุม ใช้เมื่อมีคนขอให้จองห้องให้')}
              onChange={e => setTask(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('2. ทำทีละขั้นอย่างไร')}</span>
            <textarea
              rows={5}
              maxLength={6000}
              value={steps}
              disabled={busy}
              placeholder={t('เช่น 1. ถามวัน เวลา และจำนวนคน 2. เช็กห้องว่าง 3. ร่างอีเมลให้หัวหน้าตรวจก่อนส่ง')}
              onChange={e => setSteps(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('3. ตัวอย่างผลงานที่ดี (ถ้ามี)')}</span>
            <textarea
              rows={3}
              maxLength={6000}
              value={example}
              disabled={busy}
              placeholder={t('วางตัวอย่างอีเมลหรือเอกสารที่เคยทำได้ดี ลบชื่อ เบอร์โทร และข้อมูลส่วนตัวออกก่อน')}
              onChange={e => setExample(e.target.value)}
            />
          </label>
          <p className="small muted">
            {connection
              ? t('ข้อความนี้จะส่งให้ {0} ช่วยร่าง ระบบปิดบังข้อมูลส่วนบุคคลก่อนส่ง และยังไม่บันทึกจนกว่าคุณจะกดใช้', connection.name)
              : t('เชื่อมต่อ AI ก่อน จึงให้ AI ช่วยร่าง Skill ได้')}
          </p>
          <div className="dialog-actions">
            <button className="quiet" disabled={working} onClick={onCancel}>
              {t('ยกเลิก')}
            </button>
            <button
              disabled={busy || !connection || !task.trim() || !steps.trim()}
              onClick={() =>
                void run(async () => {
                  const result = await api.call('skillDraft', { connectionId: connection!.id, task, steps, example });
                  if (!alive.current) return;
                  setDraft(result);
                  setText(result.text);
                })
              }
            >
              {working ? t('AI กำลังร่าง…') : t('ให้ AI ร่าง Skill')}
            </button>
          </div>
        </>
      ) : (
        <>
          <PackReview review={draft.review} />
          <label className="field">
            <span>{t('ตัวอย่าง Skill ที่ AI ร่าง แก้ได้ก่อนใช้')}</span>
            <textarea
              className="skill-create-preview"
              rows={14}
              maxLength={200_000}
              value={text}
              disabled={busy}
              onChange={e => setText(e.target.value)}
            />
          </label>
          <div className="dialog-actions">
            <button className="quiet" disabled={busy} onClick={() => setDraft(null)}>
              {t('กลับไปแก้คำตอบ')}
            </button>
            <button
              disabled={busy || !text.trim()}
              onClick={() =>
                void run(async () => {
                  const result = await api.call('skillCreate', { text });
                  await onCreated(result);
                })
              }
            >
              {t('ใช้ Skill นี้')}
            </button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
type SkillFix = {
  pack: string;
  path: string;
  digest: string;
  before: string;
  text: string;
  review: PackReviewResult;
  coverage: { total: number; kept: number; missing: string[] };
};
/**
 * "ให้ AI แก้ตามมาตรฐาน": the connected AI restructures an imported Skill that fails the Standard check. The person
 * sees the new review, any original line the rewrite dropped, and can edit it; nothing changes until "ใช้ฉบับนี้".
 */
function FixSkill({
  api,
  id,
  connection,
  onSaved,
  onCancel,
}: {
  api: DesktopAPI;
  id: string;
  connection: { id: string; name: string };
  onSaved: (result: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [fix, setFix] = useState<SkillFix | null>(null),
    [text, setText] = useState(''),
    [working, setWorking] = useState(true),
    [error, setError] = useState('');
  const alive = useRef(true);
  const run = async (job: () => Promise<void>) => {
    setWorking(true);
    setError('');
    try {
      await job();
    } catch (e) {
      if (alive.current && (e as Error)?.message !== 'CANCELLED') setError(explainError(e));
    } finally {
      if (alive.current) setWorking(false);
    }
  };
  const ask = () =>
    run(async () => {
      const result: SkillFix = await api.call('skillFix', { connectionId: connection.id, id });
      if (!alive.current) return;
      setFix(result);
      setText(result.text);
    });
  const started = useRef(false);
  useEffect(() => {
    alive.current = true;
    // Clicking the button is the request: start once, also under React's development double mount.
    if (!started.current) {
      started.current = true;
      void ask();
    }
    return () => {
      alive.current = false;
    };
  }, []);
  const lost = fix?.coverage.missing.length || 0;
  return (
    <section className="skill-create skill-fix" aria-label={t('ให้ AI แก้ตามมาตรฐาน')} aria-busy={working}>
      {!fix ? (
        working && (
          <p className="small muted" role="status">
            {t('{0} กำลังแก้ให้ได้มาตรฐาน โดยคงเนื้อหาเดิมไว้…', connection.name)}
          </p>
        )
      ) : (
        <>
          <PackReview review={fix.review} />
          {lost ? (
            <details className="skill-fix-lost" open>
              <summary role="alert">{t('เนื้อหาเดิมหายไป {0} บรรทัด ตรวจก่อนใช้', fix.coverage.total - fix.coverage.kept)}</summary>
              <ul>
                {fix.coverage.missing.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          ) : (
            fix.coverage.total > 0 && <p className="small muted">{t('เนื้อหาเดิมอยู่ครบ {0} บรรทัด', fix.coverage.total)}</p>
          )}
          <label className="field">
            <span>{t('ฉบับที่ AI แก้ แก้ต่อได้ก่อนใช้')}</span>
            <textarea
              className="skill-create-preview"
              rows={14}
              maxLength={200_000}
              value={text}
              disabled={working}
              onChange={e => setText(e.target.value)}
            />
          </label>
          <details className="admin-fold">
            <summary>{t('ฉบับเดิม')}</summary>
            <pre className="skill-fix-before">{fix.before}</pre>
          </details>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="quiet" disabled={working && !!fix} onClick={onCancel}>
          {t('ยกเลิก')}
        </button>
        {fix ? (
          <button
            disabled={working || !text.trim()}
            onClick={() =>
              void run(async () => {
                const result = await api.call('skillFixSave', { id, path: fix.path, digest: fix.digest, text });
                await onSaved(result);
              })
            }
          >
            {t('ใช้ฉบับนี้')}
          </button>
        ) : (
          !working && <button onClick={() => void ask()}>{t('ลองอีกครั้ง')}</button>
        )}
      </div>
    </section>
  );
}
export function PacksDialog({
  api,
  features,
  connection,
  onClose,
  onSelect,
}: {
  api: DesktopAPI;
  features?: Record<string, boolean>;
  /** The AI chosen in the app, used to draft a Skill from a description of the work. */
  connection?: { id: string; name: string };
  onClose: () => void;
  onSelect: (text: string) => void;
}) {
  // Same rule as packImportAllowed in the main process: an import must be usable personally or after approval.
  const importAllowed = features?.skillPacks === true || features?.staffSkills !== false;
  const [packs, setPacks] = useState<any[]>([]),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [imported, setImported] = useState<{ id: string; notes: SkillImportNote[] } | null>(null),
    [hooks, setHooks] = useState(false),
    [agents, setAgents] = useState(false);
  const alive = useRef(true);
  const load = async () => {
    const data = await api.call('packList');
    if (alive.current) setPacks(data);
  };
  useEffect(() => {
    alive.current = true;
    void load().catch(e => {
      if (alive.current) setError(explainError(e));
    });
    return () => {
      alive.current = false;
    };
  }, [api]);
  const act = async (method: string, input?: any) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.call(method, input);
      await load();
    } catch (e) {
      if (alive.current && (e as Error)?.message !== 'CANCELLED') setError(explainError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  // Import, then offer use straight away: a text-only Skill that passed the checks needs one confirmation, not a
  // second trip through the list. Cancelling that confirmation leaves the Skill imported and unused.
  const afterInstall = async (result: any) => {
    await load();
    if (alive.current) setImported({ id: result.id, notes: result.notes || [] });
    await offerUse(result);
  };
  const offerUse = async (result: any) => {
    const usable = features?.staffSkills !== false && result.review?.status !== 'fail' && !result.hooks && !(result.agents || []).length;
    if (!usable) return;
    try {
      await api.call('packEnable', { id: result.id, personal: true });
      await load();
    } catch (e) {
      if (!String((e as Error)?.message || e).includes('CANCELLED')) throw e;
    }
  };
  const [creating, setCreating] = useState(false),
    [fixing, setFixing] = useState(''),
    [copied, setCopied] = useState('');
  const canCreate = importAllowed && features?.staffSkills !== false;
  const importSkill = async (kind: 'file' | 'folder') => {
    if (busy) return;
    setBusy(true);
    setError('');
    setImported(null);
    try {
      const result = await api.call('packInstall', { kind, name });
      if (result) await afterInstall(result);
    } catch (e) {
      if (alive.current && (e as Error)?.message !== 'CANCELLED') setError(explainError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  // Removal asks once in the main process; cancelling there changes nothing and says nothing.
  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.call('packRemove', { id });
      if (alive.current) setImported(current => (current?.id === id ? null : current));
      await load();
    } catch (e) {
      if (alive.current && !String((e as Error)?.message || e).includes('CANCELLED')) setError(explainError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const openAsset = async (p: any, a: any) => {
    try {
      const asset = await api.call('packAsset', { id: p.id, assetId: a.id, kind: a.kind });
      if (!alive.current) return;
      onSelect(`<imported_asset label="${asset.label}" trust="untrusted">\n${asset.text.replace(/</g, '&lt;')}\n</imported_asset>`);
      onClose();
    } catch (e) {
      if (alive.current) setError(explainError(e));
    }
  };
  return (
    <ConfirmDialog info title={t('เพิ่ม Skill ของฉัน')} confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      <p className="small muted">{t('เล่าวิธีทำงานให้ AI เขียนเป็น Skill หรือเลือกไฟล์ .md ที่มีอยู่ · ตรวจความปลอดภัยก่อนใช้')}</p>
      <div className="pack-form">
        {creating ? (
          <CreateSkill
            api={api}
            connection={connection}
            disabled={busy}
            onCancel={() => setCreating(false)}
            onCreated={async result => {
              setCreating(false);
              try {
                await afterInstall(result);
              } catch (e) {
                if (alive.current) setError(explainError(e));
              }
            }}
          />
        ) : (
          <div className="dialog-actions pack-import">
            {canCreate && (
              <button disabled={busy} onClick={() => setCreating(true)}>
                {t('สร้างจากวิธีทำงานของฉัน')}
              </button>
            )}
            <button className={canCreate ? 'quiet' : ''} disabled={busy || !importAllowed} onClick={() => void importSkill('file')}>
              {t('เลือกไฟล์ Skill (.md)')}
            </button>
            <button className="quiet" disabled={busy || !importAllowed} onClick={() => void importSkill('folder')}>
              {t('เลือกทั้งโฟลเดอร์')}
            </button>
          </div>
        )}
        {!importAllowed && <p className="small muted">{t('ผู้ดูแลปิดการนำเข้า Skill Pack บนเครื่องนี้')}</p>}
        {imported && (
          <div className="pack-imported" role="status">
            <p>{t('นำเข้า {0} แล้ว', imported.id)}</p>
            {imported.notes.length > 0 && (
              <ul className="small muted">
                {imported.notes.map((note, i) => (
                  <li key={i}>{noteText(note)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <details className="admin-fold">
          <summary>{t('สำหรับผู้ดูแล')}</summary>
          <p className="small muted">
            {t(
              'ชุดที่มีคำสั่งอัตโนมัติ ผู้ช่วยสำเร็จรูป หรือจะแชร์ให้ทั้งทีม ต้องให้ผู้ดูแลรับรองก่อน รับไฟล์ pack.json โฟลเดอร์ที่มี SKILL.md และ .claude/skills คำสั่งอัตโนมัติคือ Hooks ผู้ช่วยสำเร็จรูปคือ Agent templates ทั้งสองเปิดได้เฉพาะชุดที่มี digest อยู่ในรายการรับรองของ managed policy',
            )}
          </p>
          <label className="field">
            <span>{t('ชื่อชุด (เฉพาะโฟลเดอร์ที่มีหลาย Skill และไม่มี pack.json)')}</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="team-writing" />
          </label>
          <fieldset className="pack-options">
            <legend className="small muted">{t('เมื่อกด "ยืนยันเปิดใช้" ชุดที่ผู้ดูแลรับรองแล้ว')}</legend>
            <label className="check-row">
              <input type="checkbox" checked={hooks} onChange={e => setHooks(e.target.checked)} />
              <span>{t('เปิดคำสั่งอัตโนมัติที่ผู้ดูแลรับรองไว้ด้วย')}</span>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={agents} onChange={e => setAgents(e.target.checked)} />
              <span>{t('เปิดผู้ช่วยสำเร็จรูปที่มากับชุดด้วย')}</span>
            </label>
          </fieldset>
        </details>
      </div>
      {error && <p role="alert">{error}</p>}
      {!packs.length && <p className="muted pack-empty">{t('ยังไม่มี Skill ของคุณบนเครื่องนี้')}</p>}
      {packs.map(p => {
        const usable = [
          ...p.skills.map((a: any) => ({ ...a, kind: 'skill' })),
          ...(p.agentsEnabled ? p.agents.map((a: any) => ({ ...a, kind: 'agent' })) : []),
        ];
        return (
          <section key={p.id} className="pack-item">
            <strong>
              {p.id} · {p.enabled ? (p.personal ? t('ใช้เองบนเครื่องนี้') : t('เปิดใช้')) : t('ยังไม่ได้ใช้')}
              {p.adminApproved ? ' · ' + t('รับรองโดยผู้ดูแล') : ''}
              {p.invalid ? t(' · ตรวจไฟล์ไม่ผ่าน') : ''}
            </strong>
            {p.adminApproved && (p.hooks > 0 || (p.agents || []).length > 0) && (
              <p className="small muted">
                {p.hooks > 0 ? t('Hooks: {0} ({1})', p.hooksEnabled ? t('เปิดอยู่') : t('ปิดอยู่'), p.hooks) : ''}
                {p.hooks > 0 && (p.agents || []).length > 0 ? ' · ' : ''}
                {(p.agents || []).length > 0
                  ? t('Agent templates: {0} ({1})', p.agentsEnabled ? t('เปิดอยู่') : t('ปิดอยู่'), p.agents.length)
                  : ''}
              </p>
            )}
            {p.credit && (
              <p className="small">
                {t('นำเข้าโดย {0}', p.credit.name)}
                {p.credit.team ? ' · ' + p.credit.team : ''} · {shownDate(p.credit.uploadedAt)}
              </p>
            )}
            {p.review && fixing !== p.id && <PackReview review={p.review} adminApproved={Boolean(p.adminApproved)} />}
            {fixing === p.id && connection && (
              <FixSkill
                api={api}
                id={p.id}
                connection={connection}
                onCancel={() => setFixing('')}
                onSaved={async result => {
                  setFixing('');
                  setImported(null);
                  await load();
                  try {
                    await offerUse(result);
                  } catch (e) {
                    if (alive.current) setError(explainError(e));
                  }
                }}
              />
            )}
            {p.usage?.count > 0 && (
              <p className="small muted">
                {t('ใช้แล้ว {0} ครั้ง', p.usage.count)}
                {p.usage.lastUsedAt ? ' · ' + t('ล่าสุด {0}', shownDate(p.usage.lastUsedAt)) : ''}
              </p>
            )}
            {/* The main action first: use it when it is on, otherwise turn it on. */}
            {p.enabled &&
              usable.map((a: any) => (
                <button key={a.kind + a.id} disabled={busy} onClick={() => void openAsset(p, a)}>
                  {a.kind === 'agent' ? t('ใช้ผู้ช่วย: {0}', a.id) : p.skills.length === 1 ? t('ใช้ Skill นี้') : t('ใช้ Skill: {0}', a.id)}
                </button>
              ))}
            {p.enabled ? (
              <button className="quiet" disabled={busy} onClick={() => void act('packEnable', { id: p.id, disable: true })}>
                {p.personal ? t('เลิกใช้เอง') : t('ปิดใช้')}
              </button>
            ) : (
              <>
                {/* Staff use a Skill that passed the automated checks on their own computer; no hooks or agents. */}
                {!p.invalid && p.personalAllowed && (
                  <button disabled={busy} onClick={() => void act('packEnable', { id: p.id, personal: true })}>
                    {t('ใช้เองบนเครื่องนี้')}
                  </button>
                )}
                {p.adminApproved && (
                  <button disabled={busy || p.invalid} onClick={() => void act('packEnable', { id: p.id, hooks, agents })}>
                    {t('ยืนยันเปิดใช้')}
                  </button>
                )}
                {/* A Standard failure has one next step: the AI restructures the file and the person checks it. */}
                {!p.invalid &&
                  !p.personalAllowed &&
                  !p.adminApproved &&
                  p.fixable &&
                  fixing !== p.id &&
                  features?.staffSkills !== false && (
                    <>
                      <button disabled={busy || !!fixing || !connection} onClick={() => setFixing(p.id)}>
                        {t('ให้ AI แก้ตามมาตรฐาน')}
                      </button>
                      {!connection && <p className="small muted">{t('เชื่อมต่อ AI ก่อน จึงให้ AI แก้ให้ได้')}</p>}
                    </>
                  )}
                {!p.invalid && !p.personalAllowed && !p.adminApproved && !p.fixable && (
                  <p className="small muted">{t('ยังใช้ไม่ได้: แก้ตามผลตรวจ หรือขอให้ผู้ดูแลรับรองชุดนี้')}</p>
                )}
              </>
            )}
            {/* Sends the pack to the administrators' intake sheet; publishing for everyone still needs their approval. */}
            {!p.invalid && p.promotable && (
              <button className="quiet" disabled={busy || p.promotion?.current} onClick={() => void act('packPromote', { id: p.id })}>
                {t('เสนอให้องค์กรใช้')}
              </button>
            )}
            {p.promotion && (
              <p className="small muted" role="note">
                {p.promotion.current
                  ? t('เสนอให้องค์กรแล้วเมื่อ {0} รอผู้ดูแลพิจารณา', shownDate(p.promotion.submittedAt))
                  : t('ไฟล์เปลี่ยนหลังเสนอเมื่อ {0} เสนอรุ่นใหม่ได้', shownDate(p.promotion.submittedAt))}
                {p.promotion.reference ? ' · ' + t('เลขที่ {0}', p.promotion.reference) : ''}
              </p>
            )}
            <details className="admin-fold">
              <summary>{t('เพิ่มเติม')}</summary>
              <p className="small muted">
                digest {p.digest} · Hooks {p.hooks}
              </p>
              <div className="pack-file-actions">
                {p.digest && (
                  <button
                    className="quiet"
                    disabled={busy}
                    onClick={() => {
                      void navigator.clipboard?.writeText(p.digest);
                      setCopied(p.id);
                    }}
                  >
                    {copied === p.id ? t('คัดลอกแล้ว') : t('คัดลอก digest')}
                  </button>
                )}
                <button className="quiet" disabled={busy || p.invalid} onClick={() => void act('packExport', { id: p.id })}>
                  {t('ส่งออกเป็นโฟลเดอร์ Skill')}
                </button>
                <button className="quiet danger-text" disabled={busy || fixing === p.id} onClick={() => void remove(p.id)}>
                  {t('ลบ Skill')}
                </button>
              </div>
            </details>
          </section>
        );
      })}
    </ConfirmDialog>
  );
}
