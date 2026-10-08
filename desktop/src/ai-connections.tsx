import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Plug } from 'lucide-react';
import {
  ConfirmDialog,
  ProviderFields,
  providerChoiceReady,
  recommendedChoice,
  connectionInput,
  connectLabel,
  type ProviderChoice,
} from './ui';
import { explainError, connectionLabel } from './messages';
import type { Connection, Snapshot } from './types';
import { locale, t } from './i18n';

/** Shared by first-run setup and Settings: choose/connect, then show actual test readiness. */
export function AIConnections({
  snapshot,
  call,
  refresh,
  onError,
  onBusy,
  headingLevel = 3,
}: {
  snapshot: Snapshot;
  call: (method: string, input?: any) => Promise<any>;
  refresh: () => Promise<Snapshot | undefined>;
  onError: (error: unknown) => void;
  onBusy: (id: string) => void;
  headingLevel?: 2 | 3;
}) {
  const StepHeading = headingLevel === 2 ? 'h2' : 'h3';
  const [choice, setChoice] = useState<ProviderChoice>(recommendedChoice);
  const [pickerOpen, setPickerOpen] = useState(!snapshot.connections.length);
  const [newConnectionId, setNewConnectionId] = useState('');
  const readiness = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(''),
    [progress, setProgress] = useState<Record<string, string>>({}),
    [removingConnection, setRemovingConnection] = useState<Connection | null>(null);
  const connectNow =
    (choice.mode === 'subscription' && ['openai', 'claude', 'antigravity'].includes(choice.provider)) || choice.mode === 'api';
  useEffect(() => {
    if (newConnectionId) readiness.current?.focus();
  }, [newConnectionId]);
  useEffect(
    () =>
      window.step?.onEvent(event => {
        if (event.type === 'connect-progress' && event.connectionId) setProgress(p => ({ ...p, [event.connectionId!]: event.text || '' }));
      }),
    [],
  );
  useEffect(() => onBusy(busy), [busy, onBusy]);
  useEffect(() => () => onBusy(''), [onBusy]);
  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setProgress(p => ({ ...p, [id]: '' }));
    try {
      await fn();
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="ai-connect-flow">
      <p className="muted">{t('เลือกบริการที่คุณมีบัญชีอยู่แล้ว เชื่อมต่อครั้งเดียว แล้วเริ่มงานได้เมื่อทดสอบผ่าน')}</p>
      <div className="ai-connect-step">
        <StepHeading>
          <span className="ai-step-number" aria-hidden="true">
            1
          </span>
          {t('เลือก AI และเชื่อมต่อ')}
        </StepHeading>
        <p className="muted small">{t('Antigravity และ ChatGPT ลงชื่อด้วยบัญชีได้ ไม่ต้องขอ API key')}</p>
        <details
          className="ai-provider-disclosure"
          data-first={!snapshot.connections.length}
          open={pickerOpen}
          onToggle={e => setPickerOpen(e.currentTarget.open)}
        >
          <summary>{snapshot.connections.length ? t('เพิ่ม AI อีกบัญชี') : t('เลือกบริการ AI')}</summary>
          <fieldset className="connection-form" disabled={Boolean(busy)}>
            <ProviderFields
              compact
              value={choice}
              onChange={setChoice}
              call={call}
              claudeSubscription={Boolean(snapshot.features?.claudeSubscription)}
              presets={snapshot.features?.providerPresets !== false}
              action={
                choice.mode !== 'claude-code' && (
                  <>
                    <button
                      className="connect-primary"
                      disabled={Boolean(busy) || !providerChoiceReady(choice)}
                      onClick={() =>
                        void run('new', async () => {
                          const connection = await call('connection', connectionInput(choice));
                          setChoice({ ...choice, key: '' });
                          setPickerOpen(false);
                          await refresh();
                          setNewConnectionId(connection.id);
                          if (connectNow) {
                            setBusy(connection.id);
                            await call('connect', { id: connection.id });
                          }
                        })
                      }
                    >
                      <Plug size={16} />
                      {busy ? t('กำลังเชื่อมต่อ…') : connectNow ? connectLabel(choice) : t('เพิ่มการเชื่อมต่อ')}
                    </button>
                  </>
                )
              }
            />
          </fieldset>
        </details>
      </div>
      <div className="ai-connect-step ai-readiness" ref={readiness} tabIndex={-1}>
        <StepHeading>
          <span className="ai-step-number" aria-hidden="true">
            2
          </span>
          {t('ตรวจว่าพร้อมใช้งาน')}
        </StepHeading>
        <p className="muted small">{t('หลังลงชื่อ ระบบทดสอบข้อความสั้น ๆ 1 ครั้ง โดยใช้โควตาของบัญชีนี้ ผ่านแล้วไม่ต้องทดสอบซ้ำ')}</p>
        {!snapshot.connections.length && <p className="ai-connect-empty">{t('เชื่อมต่อก่อน แล้วระบบจะทดสอบให้โดยอัตโนมัติ')}</p>}

        {snapshot.connections.map(c => (
          <div className="connection-row" key={c.id}>
            <div>
              <strong>
                {connectionLabel(c)}{' '}
                <small>
                  {c.mode === 'api'
                    ? c.signedIn
                      ? t('ลงชื่อเข้าใช้')
                      : 'API key'
                    : c.mode === 'oauth'
                      ? c.provider === 'copilot'
                        ? 'GitHub OAuth'
                        : 'Claude Console OAuth'
                      : t('บัญชีส่วนตัว')}
                </small>
              </strong>
              <p className={c.ready && busy !== c.id ? 'ai-connection-status ready' : 'ai-connection-status'} role="status">
                {busy === c.id ? <LoaderCircle size={14} className="spin" /> : c.ready ? <Check size={14} /> : null}
                {busy === c.id
                  ? t('กำลังเชื่อมต่อและทดสอบ…')
                  : c.ready
                    ? t('ทดสอบผ่าน · พร้อมใช้งาน')
                    : c.signedIn
                      ? t('ลงชื่อแล้ว แต่ยังไม่พร้อมใช้งาน')
                      : t('ยังไม่พร้อมใช้งาน')}
              </p>
              {busy === c.id && progress[c.id] ? (
                <p className="connect-progress">
                  <LoaderCircle size={13} className="spin" />
                  {progress[c.id]}
                </p>
              ) : (
                <p className={c.ready ? 'connected' : 'muted'}>{t(c.note)}</p>
              )}
              {c.provider === 'gemini' && c.googleCloudProject && (
                <p className="small muted">Google Cloud Project: {c.googleCloudProject}</p>
              )}
            </div>
            <div className="connection-actions ai-primary-actions">
              <button
                className={c.ready ? 'quiet' : undefined}
                disabled={Boolean(busy)}
                onClick={() => void run(c.id, () => call('connect', { id: c.id }))}
              >
                {busy === c.id ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}
                {busy === c.id
                  ? t('กำลังเชื่อมต่อและทดสอบ…')
                  : c.ready
                    ? t('ทดสอบอีกครั้ง')
                    : c.signedIn || c.mode === 'api'
                      ? t('ทดสอบใช้งาน')
                      : c.provider === 'openai' && c.mode === 'subscription'
                        ? t('เชื่อมต่อ ChatGPT')
                        : c.provider === 'gemini' && c.mode === 'subscription'
                          ? t('เชื่อมต่อ Google')
                          : c.provider === 'claude' && c.mode === 'oauth'
                            ? t('เชื่อมต่อ OAuth')
                            : c.provider === 'claude' && c.mode === 'subscription'
                              ? t('เชื่อมต่อ Claude')
                              : t('เชื่อมต่อและทดสอบ')}
              </button>
              {busy === c.id && (
                <button className="quiet" onClick={() => void call('cancelConnect', { id: c.id })}>
                  {t('ยกเลิก')}
                </button>
              )}
            </div>
            <details className="ai-account-management">
              <summary>{t('โมเดลและการจัดการบัญชี')}</summary>
              <div>
                {Boolean(c.models?.length || c.model) && (
                  <label className="connection-model">
                    {t('โมเดลเริ่มต้นสำหรับงานใหม่')}
                    <select
                      value={c.model}
                      disabled={Boolean(busy)}
                      onChange={e => void run(c.id + ':model', () => call('connectionModel', { id: c.id, model: e.target.value }))}
                    >
                      {c.provider !== 'antigravity' && (
                        <option value="">
                          {(() => {
                            const fallback = c.models?.find(m => m.isDefault);
                            return fallback ? t('ค่าเริ่มต้น ({0})', fallback.label) : t('ค่าเริ่มต้นของบริการ');
                          })()}
                        </option>
                      )}
                      {(c.models || []).map(m => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                      {c.model && !c.models?.some(m => m.id === c.model) && <option value={c.model}>{c.model}</option>}
                    </select>
                  </label>
                )}
                {c.modelsAt && (
                  <p className="small muted">
                    {t('โมเดล')} {c.models?.length || 0} {t('รายการ · อัปเดต')} {new Date(c.modelsAt).toLocaleString(locale())}
                  </p>
                )}
              </div>
              <div className="connection-actions">
                {c.ready && (
                  <button
                    className="quiet"
                    disabled={Boolean(busy)}
                    onClick={() => void run(c.id + ':models', () => call('models', { id: c.id }))}
                  >
                    {busy === c.id + ':models' ? <LoaderCircle size={15} className="spin" /> : null}
                    {t('โหลดรายชื่อโมเดล')}
                  </button>
                )}
                {/* Only the CLI-based connections have a runtime to choose; API endpoints and Copilot do not. */}
                {!['claude', 'compatible', 'copilot'].includes(c.provider) &&
                  (c.customRuntime ? (
                    <button
                      className="quiet"
                      disabled={Boolean(busy)}
                      title={t('เลิกใช้ runtime ที่เลือกเอง')}
                      onClick={() => void run(c.id, () => call('runtime', { id: c.id, reset: true }))}
                    >
                      {c.provider === 'antigravity' ? t('ใช้ Antigravity ที่ STeP ติดตั้ง') : t('ใช้ตัวเชื่อมที่มากับแอป')}
                    </button>
                  ) : (
                    <button
                      className="quiet"
                      disabled={Boolean(busy)}
                      title={t('สำหรับผู้ดูแลระบบ: ใช้ Codex หรือ Gemini CLI ที่ติดตั้งเอง')}
                      onClick={() => void run(c.id, () => call('runtime', { id: c.id }))}
                    >
                      {t('เลือก runtime')}
                    </button>
                  ))}
                {/* Signing out of an API-key connection would only delete the key; removing it says that plainly. */}
                {(c.mode === 'subscription' || c.mode === 'oauth' || c.signedIn || (c.ready && c.mode !== 'api')) && (
                  <button
                    className="quiet"
                    disabled={Boolean(busy)}
                    title={
                      c.provider === 'antigravity'
                        ? t('เลิกเชื่อมต่อกับ STeP บัญชี Google ใน Antigravity ยังลงชื่ออยู่')
                        : t('ลบข้อมูลลงชื่อของการเชื่อมต่อนี้ออกจากเครื่อง')
                    }
                    onClick={() => void run(c.id, () => call('disconnect', { id: c.id }))}
                  >
                    {c.provider === 'antigravity' ? t('เลิกเชื่อมต่อ') : t('ออกจากระบบ')}
                  </button>
                )}
                <button className="quiet danger-text" disabled={Boolean(busy)} onClick={() => setRemovingConnection(c)}>
                  {t('ลบ')}
                </button>
              </div>
            </details>
          </div>
        ))}
      </div>
      {removingConnection && (
        <ConfirmDialog
          title={t('ลบการเชื่อมต่อนี้?')}
          tone="danger"
          confirmLabel={t('ลบการเชื่อมต่อ')}
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
          {removingConnection.provider !== 'antigravity' && (
            <p>
              {t(
                '{0} ({1}) จะถูกลบพร้อมข้อมูลลงชื่อหรือ API key ที่เก็บในเครื่องนี้ บัญชีของคุณที่ผู้ให้บริการไม่ได้รับผลกระทบ',
                connectionLabel(removingConnection),
                removingConnection.mode === 'api' ? 'API key' : removingConnection.mode === 'oauth' ? 'Claude Console OAuth' : t('บัญชี'),
              )}
            </p>
          )}
          {removingConnection.provider === 'antigravity' && (
            <p className="small muted">{t('บัญชี Google ใน Antigravity ยังลงชื่ออยู่บนเครื่องนี้ STeP ไม่ลบข้อมูลลงชื่อของบัญชีนั้น')}</p>
          )}
          <p className="small muted">{t('งานที่ใช้การเชื่อมต่อนี้ยังอยู่ครบ เลือก AI ใหม่ได้ในกล่องพิมพ์ของงานนั้น')}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
