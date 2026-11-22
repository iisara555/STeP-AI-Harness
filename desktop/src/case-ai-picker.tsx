import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from './icons';
import { t } from './i18n';
import { connectionName, effortLabel, explainError } from './messages';
import { describeAiChoice, effortAfterModelChange } from './ai-choice';
import type { Connection, Session, Snapshot } from './types';

/** What a disbursement case's chat needs to know about the AI accounts; supplied by the workspace. */
export type CaseAiSource = {
  connections?: Connection[];
  /** The account chosen in the main composer, used until the case has a chat of its own. */
  connectionId?: string;
  /** Policy: an automatic reasoning level by task size when none is chosen. */
  autoEffort?: boolean;
};

/** The AI a case's chat answers with: its own chat's account once it has one, else the main composer's. */
export function caseAi(source: CaseAiSource, session: Session | undefined) {
  const snapshot = {
    connections: source.connections || [],
    policy: { features: { autoEffort: source.autoEffort } },
  } as unknown as Snapshot;
  const choice = describeAiChoice(snapshot, session, source.connectionId || '', undefined, '');
  const ready = Boolean(choice.connection?.ready);
  const label = !choice.connection
    ? t('ยังไม่ได้เลือก AI · ตอบจากกฎในเครื่อง')
    : ready
      ? choice.aiLabel
      : t('{0} · ยังไม่พร้อม', choice.aiLabel);
  return { ...choice, ready, label };
}

type Props = {
  source: CaseAiSource;
  session: Session | undefined;
  disabled: boolean;
  call: (method: string, input?: unknown) => Promise<any>;
  /** Makes this case's chat on the given account (or the composer's) and returns its id; null when no AI is ready. */
  open: (connectionId?: string) => Promise<string | null>;
  refresh?: () => Promise<unknown>;
  notify: (text: string, tone?: 'info' | 'success' | 'error') => void;
};

/** The case chat's AI pill, like the main composer's: account, model and reasoning level for this case only. */
export function CaseAiPicker({ source, session, disabled, call, open, refresh, notify }: Props) {
  const [expanded, setExpanded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const requested = useRef(new Set<string>());
  const ai = caseAi(source, session);
  const { connection, currentModel, defaultModel, activeModel, currentEffort, modelInfo } = ai;
  useEffect(() => {
    if (!expanded) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [expanded]);
  useEffect(() => {
    if (disabled) setExpanded(false);
  }, [disabled]);
  // The model list is read once per ready account that has never fetched it, as in the main composer.
  useEffect(() => {
    if (!connection?.ready || connection.modelsAt || requested.current.has(connection.id)) return;
    requested.current.add(connection.id);
    void call('models', { id: connection.id })
      .then(() => refresh?.())
      .catch(() => {});
  }, [connection?.id, connection?.ready, connection?.modelsAt]);
  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await refresh?.();
    } catch (error) {
      notify(explainError(error), 'error');
    }
  };
  const chooseConnection = (id: string) =>
    act(async () => {
      if (!id || id === connection?.id) return;
      if (session) await call('sessionConnection', { id: session.id, connectionId: id });
      else if (!(await open(id))) notify(t('บัญชีนี้ยังไม่พร้อม กดเชื่อมต่อและทดสอบในหน้าตั้งค่าก่อน'), 'info');
    });
  const chooseModel = (model: string, effort?: string) =>
    act(async () => {
      const id = session?.id || (await open());
      if (!id) return notify(t('ยังไม่ได้เลือก AI เลือกในกล่องพิมพ์ หรือเพิ่มบัญชี AI ก่อน'), 'info');
      await call('model', { id, model, effort: effortAfterModelChange(modelInfo(model), currentEffort, effort) });
    });
  return (
    <div className="ai-picker case-ai-picker" ref={box}>
      <button
        type="button"
        className="pill-select ai-picker-button"
        aria-label={t('เลือกบริการ โมเดลและระดับการคิด')}
        aria-expanded={expanded}
        title={ai.aiSummary}
        disabled={disabled}
        onClick={() => setExpanded(value => !value)}
      >
        <span className={`status-dot ${ai.ready ? 'ok' : ''}`} aria-hidden="true" />
        <span className="ai-picker-label case-composer-ai">{ai.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="ai-picker-menu" role="group" aria-label={t('AI ของเรื่องนี้')}>
          <label>
            {t('บัญชี AI')}
            <select aria-label={t('เลือกบัญชี AI')} value={connection?.id || ''} onChange={e => void chooseConnection(e.target.value)}>
              {!connection && <option value="">{t('เลือก AI')}</option>}
              {(source.connections || []).map(c => (
                <option key={c.id} value={c.id} disabled={!c.ready && c.id !== connection?.id}>
                  {connectionName(c)}
                  {c.ready ? '' : t(' · ยังไม่พร้อม')}
                </option>
              ))}
            </select>
          </label>
          {connection && (
            <label>
              {t('โมเดล')}
              <select
                aria-label={t('เลือกโมเดล')}
                title={connection.models?.find(m => m.id === currentModel)?.description || t('โมเดลสำหรับเรื่องนี้ เปลี่ยนได้ทุกเมื่อ')}
                value={currentModel}
                disabled={!connection.ready}
                onChange={e => void chooseModel(e.target.value)}
              >
                <option value="">{defaultModel ? defaultModel.label : t('ค่าเริ่มต้นของบริการ')}</option>
                {(connection.models || [])
                  .filter(m => m.id !== defaultModel?.id || m.id === currentModel)
                  .map(m => (
                    <option key={m.id} value={m.id} title={m.description}>
                      {m.label}
                    </option>
                  ))}
                {currentModel && !connection.models?.some(m => m.id === currentModel) && (
                  <option value={currentModel}>{currentModel}</option>
                )}
              </select>
            </label>
          )}
          {activeModel?.efforts?.length ? (
            <label>
              {t('ระดับการคิด')}
              <select
                aria-label={t('เลือกระดับการคิด')}
                value={currentEffort}
                disabled={!connection?.ready}
                onChange={e => void chooseModel(currentModel, e.target.value)}
              >
                <option value="">
                  {source.autoEffort
                    ? t('อัตโนมัติตามขนาดงาน')
                    : activeModel.defaultEffort
                      ? t('ค่าเริ่มต้น ({0})', effortLabel[activeModel.defaultEffort] || activeModel.defaultEffort)
                      : t('ค่าเริ่มต้น')}
                </option>
                {activeModel.efforts.map(e => (
                  <option key={e.id} value={e.id} title={e.description}>
                    {effortLabel[e.id] || e.id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      )}
    </div>
  );
}
