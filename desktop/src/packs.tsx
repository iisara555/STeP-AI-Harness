import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ui';
import { explainError, shownDate } from './messages';
import type { DesktopAPI } from './types';
import type { PackReview as PackReviewResult } from '../../src/modules/packs/index.js';
import { t } from './i18n';
const REVIEW_STATUS = {
  pass: 'ผ่านการตรวจมาตรฐาน Skill v2 และความปลอดภัย',
  warn: 'ผ่านการตรวจ มีข้อแนะนำ {0} ข้อ',
  fail: 'ไม่ผ่านการตรวจ {0} ข้อ',
};
/** The automated Standard v2 and safety report. Advice for the uploader and admin; it approves nothing. */
function PackReview({ review }: { review: PackReviewResult }) {
  const fails = review.findings.filter(f => f.level === 'fail').length;
  const label =
    review.status === 'pass'
      ? t(REVIEW_STATUS.pass)
      : review.status === 'warn'
        ? t(REVIEW_STATUS.warn, review.findings.length)
        : t(REVIEW_STATUS.fail, fails);
  return (
    <details className={`pack-review ${review.status}`} open={review.status === 'fail'}>
      <summary role="status">
        {review.status === 'pass' ? '✓ ' : review.status === 'warn' ? '! ' : '✕ '}
        {label}
      </summary>
      <ul>
        {review.findings.map((f, i) => (
          <li key={i} className={f.level === 'fail' ? 'error' : 'muted'}>
            {f.area === 'safety' ? t('ความปลอดภัย') : t('มาตรฐาน')}
            {f.file ? ` · ${f.file}${f.line ? ':' + f.line : ''}` : ''} — {t(f.template, ...f.args)}
          </li>
        ))}
      </ul>
    </details>
  );
}
export function PacksDialog({
  api,
  features,
  onClose,
  onSelect,
}: {
  api: DesktopAPI;
  features?: Record<string, boolean>;
  onClose: () => void;
  onSelect: (text: string) => void;
}) {
  // Same rule as packImportAllowed in the main process: an import must be usable personally or after approval.
  const importAllowed = features?.skillPacks === true || features?.staffSkills !== false;
  const [packs, setPacks] = useState<any[]>([]),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
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
      if (alive.current) setError(explainError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <ConfirmDialog info title="Skill Packs" confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      <p>
        {t(
          'นำเข้าชุด Skill (คู่มือที่บอก AI ว่าทำงานเรื่องหนึ่งอย่างไร) จากโฟลเดอร์บนเครื่อง ชุดที่เป็นข้อความล้วนและผ่านการตรวจอัตโนมัติ ใช้เองบนเครื่องนี้ได้ทันที ส่วนชุดที่มีคำสั่งอัตโนมัติ ผู้ช่วยสำเร็จรูป หรือจะแชร์ให้ทั้งทีม ต้องให้ผู้ดูแลรับรองก่อน เนื้อหาในชุดเป็นข้อมูลประกอบการร่างเท่านั้น',
        )}
      </p>
      <div className="pack-form">
        <label className="field">
          <span>{t('ตั้งชื่อชุด (ใช้เมื่อนำเข้าโฟลเดอร์ Skill เดี่ยว)')}</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="public-writing" />
        </label>
        <div className="dialog-actions">
          <button disabled={busy || !importAllowed} onClick={() => void act('packInstall', { name })}>
            {t('เลือกโฟลเดอร์และนำเข้า')}
          </button>
        </div>
        {!importAllowed && <p className="small muted">{t('ผู้ดูแลปิดการนำเข้า Skill Pack บนเครื่องนี้')}</p>}
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
        <details className="admin-fold">
          <summary>{t('สำหรับผู้ดูแล')}</summary>
          <p className="small muted">
            {t(
              'รับไฟล์ pack.json โฟลเดอร์ที่มี SKILL.md และ .claude/skills คำสั่งอัตโนมัติคือ Hooks ผู้ช่วยสำเร็จรูปคือ Agent templates ทั้งสองเปิดได้เฉพาะชุดที่มี digest อยู่ในรายการรับรองของ managed policy',
            )}
          </p>
        </details>
      </div>
      {error && <p role="alert">{error}</p>}
      {!packs.length && <p className="muted pack-empty">{t('ยังไม่มี Skill Pack')}</p>}
      {packs.map(p => (
        <section key={p.id} className="pack-item">
          <strong>
            {p.id} · {p.enabled ? (p.personal ? t('ใช้เองบนเครื่องนี้') : t('เปิดใช้')) : t('ปิดใช้')}
            {p.invalid ? t(' · ตรวจไฟล์ไม่ผ่าน') : ''}
          </strong>
          <details className="admin-fold">
            <summary>{t('สำหรับผู้ดูแล')}</summary>
            <p className="small muted">
              digest {p.digest} · Hooks {p.hooks}
            </p>
          </details>
          {p.credit && (
            <p className="small">
              {t('นำเข้าโดย {0}', p.credit.name)}
              {p.credit.team ? ' · ' + p.credit.team : ''} · {shownDate(p.credit.uploadedAt)}
            </p>
          )}
          {p.review && <PackReview review={p.review} />}
          {p.usage?.count > 0 && (
            <p className="small muted">
              {t('ใช้แล้ว {0} ครั้ง', p.usage.count)}
              {p.usage.lastUsedAt ? ' · ' + t('ล่าสุด {0}', shownDate(p.usage.lastUsedAt)) : ''}
            </p>
          )}
          {p.enabled ? (
            <button disabled={busy} onClick={() => void act('packEnable', { id: p.id, disable: true })}>
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
              {!p.invalid && !p.personalAllowed && !p.adminApproved && (
                <p className="small muted">{t('ยังใช้ไม่ได้: แก้ตามผลตรวจ หรือขอให้ผู้ดูแลรับรองชุดนี้')}</p>
              )}
            </>
          )}
          <button disabled={busy || p.invalid} onClick={() => void act('packExport', { id: p.id })}>
            {t('ส่งออกเป็นโฟลเดอร์ Skill')}
          </button>
          {/* Sends the pack to the administrators' intake sheet; publishing for everyone still needs their approval. */}
          {!p.invalid && p.promotable && (
            <button disabled={busy || p.promotion?.current} onClick={() => void act('packPromote', { id: p.id })}>
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
          {[
            ...p.skills.map((a: any) => ({ ...a, kind: 'skill' })),
            ...(p.agentsEnabled ? p.agents.map((a: any) => ({ ...a, kind: 'agent' })) : []),
          ].map((a: any) => (
            <button
              key={a.kind + a.id}
              disabled={busy || !p.enabled}
              onClick={() =>
                void (async () => {
                  try {
                    const asset = await api.call('packAsset', { id: p.id, assetId: a.id, kind: a.kind });
                    if (!alive.current) return;
                    onSelect(
                      `<imported_asset label="${asset.label}" trust="untrusted">\n${asset.text.replace(/</g, '&lt;')}\n</imported_asset>`,
                    );
                    onClose();
                  } catch (e) {
                    if (alive.current) setError(explainError(e));
                  }
                })()
              }
            >
              {t('ใช้')} {a.kind}: {a.id}
            </button>
          ))}
        </section>
      ))}
    </ConfirmDialog>
  );
}
