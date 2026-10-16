import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ui';
import { explainError } from './messages';
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
export function PacksDialog({ api, onClose, onSelect }: { api: DesktopAPI; onClose: () => void; onSelect: (text: string) => void }) {
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
          'นำเข้า pack.json หรือโฟลเดอร์ SKILL.md รวมถึง .claude/skills Skill ที่เป็นข้อความล้วนและผ่านการตรวจอัตโนมัติใช้เองบนเครื่องนี้ได้ทันที ส่วน Hooks, Agent และการแชร์ให้ทีมต้องให้ผู้ดูแลรับรอง digest ก่อน เนื้อหาเป็นข้อมูลประกอบสำหรับร่าง',
        )}
      </p>
      <label>
        {t('ชื่อชุดที่นำเข้าจาก SKILL.md')}
        <input value={name} onChange={e => setName(e.target.value)} placeholder="public-writing" />
      </label>
      <button disabled={busy} onClick={() => void act('packInstall', { name })}>
        {t('เลือกโฟลเดอร์และนำเข้า')}
      </button>
      <label>
        <input type="checkbox" checked={hooks} onChange={e => setHooks(e.target.checked)} />
        {t('เปิด Hooks ที่ผู้ดูแลรับรองเมื่อยืนยัน')}
      </label>
      <label>
        <input type="checkbox" checked={agents} onChange={e => setAgents(e.target.checked)} />
        {t('เปิด Agent templates เมื่อยืนยัน')}
      </label>
      {error && <p role="alert">{error}</p>}
      {!packs.length && <p>{t('ยังไม่มี Skill Pack')}</p>}
      {packs.map(p => (
        <section key={p.id}>
          <strong>
            {p.id} · {p.enabled ? (p.personal ? t('ใช้เองบนเครื่องนี้') : t('เปิดใช้')) : t('ปิดใช้')}
            {p.invalid ? t(' · ตรวจไฟล์ไม่ผ่าน') : ''}
          </strong>
          <p className="small muted">
            {p.digest} · Hooks {p.hooks}
          </p>
          {p.credit && (
            <p className="small">
              {t('นำเข้าโดย {0}', p.credit.name)}
              {p.credit.team ? ' · ' + p.credit.team : ''} · {new Date(p.credit.uploadedAt).toLocaleDateString()}
            </p>
          )}
          {p.review && <PackReview review={p.review} />}
          {p.usage?.count > 0 && (
            <p className="small muted">
              {t('ใช้แล้ว {0} ครั้ง', p.usage.count)}
              {p.usage.lastUsedAt ? ' · ' + t('ล่าสุด {0}', new Date(p.usage.lastUsedAt).toLocaleDateString()) : ''}
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
                <p className="small muted">{t('ยังใช้ไม่ได้: แก้ตามผลตรวจ หรือให้ผู้ดูแลรับรอง digest ของชุดนี้')}</p>
              )}
            </>
          )}
          <button disabled={busy || p.invalid} onClick={() => void act('packExport', { id: p.id })}>
            {t('ส่งออก .claude/skills')}
          </button>
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
