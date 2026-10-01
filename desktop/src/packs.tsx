import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ui';
import { explainError } from './messages';
import type { DesktopAPI } from './types';
import { t } from './i18n';
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
    <ConfirmDialog title="Skill Packs" confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      <p>
        {t(
          'นำเข้า pack.json หรือโฟลเดอร์ SKILL.md รวมถึง .claude/skills ผู้ดูแลต้องรับรอง digest ก่อนเปิดใช้ เนื้อหาเป็นข้อมูลประกอบสำหรับร่าง',
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
            {p.id} · {p.enabled ? t('เปิดใช้') : t('ปิดใช้')}
            {p.invalid ? t(' · ตรวจไฟล์ไม่ผ่าน') : ''}
          </strong>
          <p className="small muted">
            {p.digest} · Hooks {p.hooks}
          </p>
          <button disabled={busy || p.invalid} onClick={() => void act('packEnable', { id: p.id, disable: p.enabled, hooks, agents })}>
            {p.enabled ? t('ปิดใช้') : t('ยืนยันเปิดใช้')}
          </button>
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
