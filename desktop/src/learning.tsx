import { useEffect, useState } from 'react';
import type { DesktopAPI, MemoryProposal } from './types';
import type { LessonContent, LearningSnapshot } from './learning-types';
import { ConfirmDialog } from './ui';
import { explainError } from './messages';
import { t } from './i18n';

type Data = LearningSnapshot & { feedback: MemoryProposal[] };
type Edit = { content: LessonContent; evidence: string; lessonId?: string; baseRevision?: number; candidateId?: string };
const fresh = (text = ''): Edit => ({ content: { name: '', kind: 'preference', trigger: '', text }, evidence: text });
export function LearningDialog({
  api,
  initialText,
  sessionId,
  onClose,
}: {
  api: DesktopAPI;
  initialText: string;
  /** The open task, which the AI can draft lessons from. */
  sessionId?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Data>(),
    [edit, setEdit] = useState<Edit | undefined>(initialText ? fresh(initialText) : undefined);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [focus, setFocus] = useState(''),
    [drafted, setDrafted] = useState(''),
    [skills, setSkills] = useState<{ name: string; title: string; owner: string }[]>([]),
    [skillFor, setSkillFor] = useState<Record<string, string>>({}),
    [proposed, setProposed] = useState<Record<string, string>>({});
  const load = async () => setData(await api.call('learningList'));
  useEffect(() => {
    void load().catch(e => setError(explainError(e)));
    void api
      .call('skills')
      .then(list => setSkills(list.filter((skill: any) => skill.path)))
      .catch(() => {});
  }, []);
  const act = async (run: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await run();
      await load();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  };
  const update = (value: Partial<LessonContent>) => edit && setEdit({ ...edit, content: { ...edit.content, ...value } });
  return (
    <ConfirmDialog title={t('กล่องบทเรียน')} confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      <p className="small muted">
        {t('บทเรียนใช้เฉพาะพื้นที่งานและทีมปัจจุบันบนเครื่องนี้ หลังคุณยืนยันจึงเลือกใช้กับงานถัดไป และอาจส่งให้ AI พร้อมบริบทงาน')}
      </p>
      <p className="small muted">
        {t('ตรวจรูปแบบและข้อมูลส่วนบุคคลก่อนบันทึก ยังไม่ได้ทดสอบว่าคำตอบดีขึ้น บทเรียนไม่เปลี่ยนสิทธิ์เครื่องมือหรือนโยบายองค์กร')}
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">{t('กำลังโหลด')}</p>}
      <button className="quiet" disabled={busy || !data} onClick={() => setEdit(fresh())}>
        {t('เสนอบทเรียน')}
      </button>
      {sessionId && (
        <div className="learning-draft">
          <input
            aria-label={t('ให้ AI เน้นเรื่อง (ไม่บังคับ)')}
            placeholder={t('ให้ AI เน้นเรื่อง (ไม่บังคับ)')}
            maxLength={500}
            value={focus}
            onChange={e => setFocus(e.target.value)}
          />
          <button
            className="quiet"
            disabled={busy || !data}
            onClick={() =>
              void act(async () => {
                setDrafted(t('AI กำลังอ่านงานนี้และร่างบทเรียน…'));
                try {
                  const result = await api.call('learningDraft', { context: data?.context, sessionId, focus });
                  setDrafted(
                    result.drafted
                      ? t('AI ร่างบทเรียน {0} รายการ ตรวจด้านล่างก่อนยืนยัน', result.drafted)
                      : t('AI ไม่พบบทเรียนที่ควรเก็บจากงานนี้'),
                  );
                } catch (e) {
                  setDrafted('');
                  throw e;
                }
              })
            }
          >
            {t('ให้ AI ร่างบทเรียนจากงานนี้')}
          </button>
          {drafted && (
            <p className="small muted" role="status">
              {drafted}
            </p>
          )}
        </div>
      )}
      {edit && (
        <form
          className="memory-editor"
          onSubmit={e => {
            e.preventDefault();
            void act(async () => {
              await api.call(edit.candidateId ? 'learningRevise' : 'learningPropose', {
                ...edit,
                id: edit.candidateId,
                context: data?.context,
              });
              setEdit(undefined);
            });
          }}
        >
          <label>
            {t('ชื่อบทเรียน')}
            <input required maxLength={120} value={edit.content.name} onChange={e => update({ name: e.target.value })} />
          </label>
          <label>
            {t('ประเภทบทเรียน')}
            <select
              aria-label={t('ประเภทบทเรียน')}
              value={edit.content.kind}
              onChange={e => update({ kind: e.target.value as LessonContent['kind'] })}
            >
              <option value="preference">{t('ความชอบในการทำงาน')}</option>
              <option value="procedure">{t('วิธีทำงานเฉพาะเรื่อง')}</option>
            </select>
          </label>
          {edit.content.kind === 'procedure' && (
            <label>
              {t('ใช้เมื่อคำขอมีคำเหล่านี้ (คั่นด้วยจุลภาค)')}
              <input required maxLength={160} value={edit.content.trigger} onChange={e => update({ trigger: e.target.value })} />
            </label>
          )}
          <label>
            {t('บทเรียนที่จะนำไปใช้')}
            <textarea required rows={5} maxLength={4000} value={edit.content.text} onChange={e => update({ text: e.target.value })} />
          </label>
          <label>
            {t('เหตุผลหรือคำแก้ไขที่เป็นที่มา')}
            <textarea
              required
              rows={3}
              maxLength={2000}
              disabled={Boolean(edit.candidateId)}
              value={edit.evidence}
              onChange={e => setEdit({ ...edit, evidence: e.target.value })}
            />
          </label>
          <button type="submit" disabled={busy || !data}>
            {t('บันทึกข้อเสนอ')}
          </button>
          <button type="button" className="quiet" disabled={busy} onClick={() => setEdit(undefined)}>
            {t('ยกเลิกการแก้ไข')}
          </button>
        </form>
      )}
      {Boolean(data?.feedback.length) && <h3>{t('ข้อเสนอจากความจำและ feedback')}</h3>}
      {data?.feedback.map(p => (
        <article className="memory-item" key={p.id}>
          <p>{p.text}</p>
          <p className="small muted">
            {t('ที่มา:')} {p.evidence}
          </p>
          <button
            disabled={busy}
            className="quiet"
            onClick={() => void act(() => api.call('learningImport', { context: data.context, id: p.id }))}
          >
            {t('นำมาตรวจเป็นบทเรียน')}
          </button>
        </article>
      ))}
      <h3>{t('บทเรียนที่รอตรวจ')}</h3>
      {data && !data.candidates.some(c => c.status === 'pending') && <p className="muted">{t('ยังไม่มีบทเรียนที่รอตรวจ')}</p>}
      {data?.candidates
        .filter(c => c.status === 'pending')
        .map(c => {
          const before = data.lessons.find(l => l.id === c.lessonId)?.revisions.at(-1)?.content;
          return (
            <article className="memory-item learning-item" key={c.id}>
              <strong>{c.content.name}</strong>
              <p className="small muted">
                {c.source === 'feedback'
                  ? t('ที่มา: ข้อเสนอความจำจากบทสนทนา')
                  : c.source === 'ai'
                    ? t('ที่มา: AI ร่างจากงาน ตรวจให้แน่ใจก่อนยืนยัน')
                    : t('ที่มา: คุณเสนอเอง')}
              </p>
              <blockquote>{c.evidence}</blockquote>
              {before && (
                <>
                  <p className="small muted">{t('ก่อนเปลี่ยน')}</p>
                  <strong>{before.name}</strong>
                  <p className="small">
                    {before.kind === 'procedure' ? t('ใช้เมื่อคำขอตรงกับ: {0}', before.trigger) : t('ใช้เป็นความชอบกับงานถัดไป')}
                  </p>
                  <pre>{before.text}</pre>
                </>
              )}
              <p className="small muted">{t('หลังยืนยัน')}</p>
              <pre>{c.content.text}</pre>
              <p className="small">
                {c.content.kind === 'procedure' ? t('ใช้เมื่อคำขอตรงกับ: {0}', c.content.trigger) : t('ใช้เป็นความชอบกับงานถัดไป')}
              </p>
              <button
                disabled={busy}
                onClick={() => void act(() => api.call('learningDecide', { context: data.context, id: c.id, approve: true }))}
              >
                {t('ยืนยันใช้บทเรียน')}
              </button>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => setEdit({ content: c.content, evidence: c.evidence, candidateId: c.id })}
              >
                {t('แก้ไขข้อเสนอ')}
              </button>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => void act(() => api.call('learningDecide', { context: data.context, id: c.id, approve: false }))}
              >
                {t('ปฏิเสธบทเรียน')}
              </button>
            </article>
          );
        })}
      <h3>{t('บทเรียนและประวัติรุ่น')}</h3>
      {data?.lessons.map(l => {
        const head = l.revisions[l.revisions.length - 1];
        return (
          <article className="memory-item learning-item" key={l.id}>
            <strong>{head.content?.name || l.revisions.find(r => r.content)?.content?.name}</strong>
            <p className="small muted">
              {t('รุ่น {0}', head.revision)} · {head.content ? t('เปิดใช้แล้ว') : t('หยุดใช้แล้ว')}
            </p>
            {head.content && (
              <>
                <pre>{head.content.text}</pre>
                <p className="small">
                  {head.content.kind === 'procedure' ? t('ใช้เมื่อคำขอตรงกับ: {0}', head.content.trigger) : t('ใช้เป็นความชอบกับงานถัดไป')}
                </p>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => setEdit({ content: head.content!, evidence: '', lessonId: l.id, baseRevision: head.revision })}
                >
                  {t('เสนอแก้บทเรียน')}
                </button>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      api.call('learningRestore', { context: data.context, id: l.id, expectedRevision: head.revision, targetRevision: 0 }),
                    )
                  }
                >
                  {t('หยุดใช้บทเรียน')}
                </button>
                <details className="skill-proposal">
                  <summary>{t('เสนอให้ผู้ดูแล Skill')}</summary>
                  <p className="small muted">
                    {t(
                      'ถ้าบทเรียนนี้ควรใช้กับทุกคนที่ใช้ Skill นั้น ให้ส่งเป็นข้อเสนอ แอปไม่แก้ Skill ขององค์กรเอง ไฟล์ที่ได้มีบทเรียน หลักฐาน patch และกรณีทดสอบ ส่งให้ผู้ดูแล Skill ตรวจผ่าน Git',
                    )}
                  </p>
                  <select
                    aria-label={t('Skill ที่บทเรียนนี้ปรับปรุง')}
                    value={skillFor[l.id] || ''}
                    onChange={e => setSkillFor({ ...skillFor, [l.id]: e.target.value })}
                  >
                    <option value="">{t('เลือก Skill')}</option>
                    {skills.map(skill => (
                      <option key={skill.name} value={skill.name}>
                        {skill.title || skill.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="quiet"
                    disabled={busy || !skillFor[l.id]}
                    onClick={() =>
                      void act(async () => {
                        const result = await api.call('skillProposal', { context: data.context, lessonId: l.id, skill: skillFor[l.id] });
                        if (result)
                          setProposed({
                            ...proposed,
                            [l.id]: t('บันทึกข้อเสนอที่ {0} ส่งไฟล์นี้ให้ผู้ดูแล Skill ทีม {1}', result.path, result.owner || '-'),
                          });
                      })
                    }
                  >
                    {t('สร้างไฟล์ข้อเสนอ')}
                  </button>
                  {proposed[l.id] && (
                    <p className="small" role="status">
                      {proposed[l.id]}
                    </p>
                  )}
                </details>
              </>
            )}
            <details>
              <summary>{t('ดูรุ่นก่อนหน้าและย้อนกลับ')}</summary>
              {l.revisions
                .slice(0, -1)
                .reverse()
                .map(r => (
                  <div className="memory-item" key={r.revision}>
                    <p>
                      {t('รุ่น {0}', r.revision)} · {new Date(r.at).toLocaleString()}
                    </p>
                    {r.content && <strong>{r.content.name}</strong>}
                    <pre>{r.content?.text || t('หยุดใช้แล้ว')}</pre>
                    {r.content && (
                      <p className="small">
                        {r.content.kind === 'procedure' ? t('ใช้เมื่อคำขอตรงกับ: {0}', r.content.trigger) : t('ใช้เป็นความชอบกับงานถัดไป')}
                      </p>
                    )}
                    {r.candidateId && (
                      <p className="small muted">
                        {t('ที่มา:')} {data.candidates.find(c => c.id === r.candidateId)?.evidence}
                      </p>
                    )}
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          api.call('learningRestore', {
                            context: data.context,
                            id: l.id,
                            expectedRevision: head.revision,
                            targetRevision: r.revision,
                          }),
                        )
                      }
                    >
                      {t('คืนค่ารุ่น {0}', r.revision)}
                    </button>
                  </div>
                ))}
            </details>
          </article>
        );
      })}
    </ConfirmDialog>
  );
}
