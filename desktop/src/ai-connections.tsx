import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, LoaderCircle, Plug, Plus, RefreshCw, Trash2 } from './icons';
import {
  ConfirmDialog,
  ProviderFields,
  providerChoiceReady,
  recommendedChoice,
  connectionInput,
  connectLabel,
  type ProviderChoice,
} from './ui';
import { explainError, connectionBrand, connectionKind, connectionLabel, shownDate } from './messages';
import type { Connection, Snapshot } from './types';
import { t } from './i18n';
import { connectionCapabilities, organizationCapabilities, type Capability } from './connection-capabilities';
import { connectionState } from './connection-state';

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
    [removingConnection, setRemovingConnection] = useState<Connection | null>(null),
    // null: closed; a string: the passcode dialog for turning Dev mode on is open.
    [devPasscode, setDevPasscode] = useState<string | null>(null);
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
  const connections = snapshot.connections;
  const readyCount = connections.filter(c => c.ready).length;
  const picker = (
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
          )
        }
      />
    </fieldset>
  );
  return (
    <div className="ai-connect-flow">
      <p className="muted ai-connect-lead">{t('เลือก AI ที่มีบัญชี เชื่อมต่อ แล้วทดสอบใช้งาน')}</p>
      {/* The person's own accounts come first: their status and the one button that fixes them. */}
      {connections.length > 0 && (
        <div className="ai-connect-step ai-readiness" ref={readiness} tabIndex={-1} role="region" aria-labelledby="ai-accounts-heading">
          <StepHeading id="ai-accounts-heading">{t('บัญชี AI ของคุณ')}</StepHeading>
          <p className="muted small">
            {t('พร้อมใช้งาน {0} จาก {1} บัญชี', readyCount, connections.length)} ·{' '}
            {t('ตอนเชื่อมต่อ ระบบทดสอบข้อความสั้น ๆ 1 ครั้งด้วยโควตาของบัญชีนั้น')}
          </p>
          <ul className="connection-list">
            {connections.map(c => (
              <ConnectionCard
                key={c.id}
                connection={c}
                snapshot={snapshot}
                busy={busy}
                progress={progress[c.id]}
                call={call}
                run={run}
                onRemove={() => setRemovingConnection(c)}
              />
            ))}
          </ul>
        </div>
      )}
      {/* One stable element for the picker, so a choice in progress survives the first account appearing above it. */}
      <div className={connections.length ? 'ai-connect-step ai-add-account' : 'ai-connect-step'}>
        {!connections.length && <StepHeading>{t('เลือก AI และเชื่อมต่อ')}</StepHeading>}
        {!connections.length && <p className="muted small">{t('Antigravity และ ChatGPT ลงชื่อด้วยบัญชีได้ ไม่ต้องกรอก API key')}</p>}
        <details
          className="ai-provider-disclosure"
          data-first={!connections.length}
          open={pickerOpen}
          onToggle={e => setPickerOpen(e.currentTarget.open)}
        >
          <summary>
            <Plus size={16} aria-hidden="true" />
            {t('เพิ่ม AI อีกบัญชี')}
          </summary>
          {picker}
        </details>
      </div>
      <details className="ai-capabilities ai-organization-capabilities">
        <summary>{t('ฟังก์ชันที่องค์กรเปิดให้ใช้')}</summary>
        <CapabilityList items={organizationCapabilities(snapshot.policy)} />
      </details>
      {/* For developers only: kept visible so it can be found, but out of the way of everyone else. */}
      <div className="development-mode">
        <small id="dev-mode-help" className="muted">
          {snapshot.features?.developmentMode ? t('Claude Pro/Max สำหรับทดสอบ') : t('สำหรับนักพัฒนา · ต้องให้ IT อนุญาต')}
        </small>
        <button
          type="button"
          className="quiet"
          aria-pressed={Boolean(snapshot.features?.developmentMode && snapshot.settings.developmentMode)}
          title={
            snapshot.features?.developmentMode
              ? t(
                  'สำหรับทดสอบและ demo ด้วยบัญชี Claude Pro/Max ของคุณ การใช้งานต้องเป็นไปตามเงื่อนไขของ Anthropic เปิดแล้วเลือก Claude แบบแพ็กเกจในรายการด้านล่างได้ กดกลับโหมดปกติเพื่อปิด',
                )
              : t('ผู้ดูแลยังไม่อนุญาต Dev mode ติดต่อ IT หากต้องใช้ทดสอบ')
          }
          aria-describedby="dev-mode-help"
          disabled={Boolean(busy) || !snapshot.features?.developmentMode}
          onClick={() =>
            snapshot.settings.developmentMode !== true && snapshot.features?.developmentPasscode
              ? setDevPasscode('')
              : void run('development-mode', () => call('developmentMode', { enabled: snapshot.settings.developmentMode !== true }))
          }
        >
          {busy === 'development-mode' && <LoaderCircle size={14} className="spin" />}
          {snapshot.features?.developmentMode && snapshot.settings.developmentMode ? t('กลับโหมดปกติ') : t('เปิด Dev mode')}
        </button>
      </div>
      {devPasscode !== null && (
        <ConfirmDialog
          title={t('เปิด Dev mode')}
          confirmLabel={t('เปิด Dev mode')}
          confirmDisabled={!devPasscode.trim()}
          onCancel={() => setDevPasscode(null)}
          onConfirm={async () => {
            try {
              await call('developmentMode', { enabled: true, passcode: devPasscode });
            } catch (e) {
              throw new Error(explainError(e));
            }
            setDevPasscode(null);
            await refresh();
          }}
        >
          <p className="small">{t('ใส่รหัส Dev mode ที่ได้จาก IT')}</p>
          <label>
            {t('รหัส Dev mode')}
            <input type="password" autoComplete="off" value={devPasscode} onChange={e => setDevPasscode(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
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
                removingConnection.mode === 'api'
                  ? t('API key')
                  : removingConnection.mode === 'oauth'
                    ? 'Claude Console OAuth'
                    : t('บัญชี'),
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

function ConnectionCard({
  connection: c,
  snapshot,
  busy,
  progress,
  call,
  run,
  onRemove,
}: {
  connection: Connection;
  snapshot: Snapshot;
  busy: string;
  progress?: string;
  call: (method: string, input?: any) => Promise<any>;
  run: (id: string, fn: () => Promise<unknown>) => Promise<void>;
  onRemove: () => void;
}) {
  const working = busy === c.id;
  const state = connectionState(c);
  const tone = working ? 'busy' : state.tone;
  const actionLabel =
    state.action === 'retest'
      ? t('ทดสอบอีกครั้ง')
      : state.action === 'sign-in-again'
        ? t('ลงชื่อใหม่')
        : state.action === 'test' || (state.action === 'none' && (c.signedIn || c.mode === 'api'))
          ? t('ทดสอบใช้งาน')
          : c.provider === 'openai' && c.mode === 'subscription'
            ? t('เชื่อมต่อ ChatGPT')
            : c.provider === 'gemini' && c.mode === 'subscription'
              ? t('เชื่อมต่อ Google')
              : c.provider === 'claude' && c.mode === 'oauth'
                ? t('เชื่อมต่อ OAuth')
                : c.provider === 'claude' && c.mode === 'subscription'
                  ? t('เชื่อมต่อ Claude')
                  : c.provider === 'antigravity'
                    ? t('เชื่อมต่อ {0}', 'Antigravity')
                    : t('เชื่อมต่อและทดสอบ');
  // An expired sign-in starts from a clean sign-in, so a stale saved token cannot pass the check again.
  const fix = () =>
    void run(c.id, async () => {
      if (state.action === 'sign-in-again') await call('disconnect', { id: c.id });
      await call('connect', { id: c.id });
    });
  return (
    <li className={`connection-row connection-card ${tone}`} data-state={tone}>
      <div className="connection-head">
        <strong className="connection-name">
          {/* The same name as everywhere else (connectionName), split so the kind reads as a subtitle. */}
          {connectionBrand(c)} <small>{connectionKind(c)}</small>
        </strong>
        <span className={`ai-connection-status connection-state ${tone}`} role="status">
          {working ? (
            <LoaderCircle size={14} className="spin" aria-hidden="true" />
          ) : state.tone === 'ready' ? (
            <Check size={14} aria-hidden="true" />
          ) : state.tone === 'idle' || state.tone === 'blocked' ? (
            <span className="connection-dot" aria-hidden="true" />
          ) : (
            <AlertTriangle size={14} aria-hidden="true" />
          )}
          {working ? t('กำลังเชื่อมต่อและทดสอบ…') : t(state.label)}
        </span>
      </div>
      {working && progress ? (
        <p className="connect-progress">
          <LoaderCircle size={13} className="spin" />
          {progress}
        </p>
      ) : (
        <p className={c.ready ? 'connection-note connected' : 'connection-note muted'}>
          {c.policyBlocked ? t('ผู้ดูแลปิดบริการนี้ ผลทดสอบเดิมใช้ไม่ได้จนกว่าจะเปิดอีกครั้ง · ลงชื่อออกหรือลบบัญชีได้') : t(c.note)}
        </p>
      )}
      {c.provider === 'gemini' && c.googleCloudProject && <p className="small muted">Google Cloud Project: {c.googleCloudProject}</p>}
      <div className="connection-actions ai-primary-actions">
        <button className={state.action === 'retest' ? 'quiet' : undefined} disabled={Boolean(busy) || c.policyBlocked} onClick={fix}>
          {working ? (
            <LoaderCircle size={15} className="spin" />
          ) : state.action === 'sign-in-again' ? (
            <RefreshCw size={15} />
          ) : (
            <Check size={15} />
          )}
          {working ? t('กำลังเชื่อมต่อและทดสอบ…') : actionLabel}
        </button>
        {working && (
          <button className="quiet" onClick={() => void call('cancelConnect', { id: c.id })}>
            {t('ยกเลิก')}
          </button>
        )}
      </div>
      <div className="connection-more">
        <details className="ai-capabilities">
          <summary>{t('บัญชีนี้ทำอะไรได้บ้าง')}</summary>
          <CapabilityList items={connectionCapabilities(c, snapshot.policy)} />
        </details>
        <details className="ai-account-management">
          <summary>{t('โมเดลและการจัดการบัญชี')}</summary>
          <div>
            {Boolean(c.models?.length || c.model) && (
              <label className="connection-model">
                {t('โมเดลสำหรับงานใหม่')}
                <select
                  value={c.model}
                  disabled={Boolean(busy) || c.policyBlocked}
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
                {t('โมเดล')} {c.models?.length || 0} {t('รายการ · อัปเดต')} {shownDate(c.modelsAt, true)}
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
                {t('ดูโมเดลที่ใช้ได้')}
              </button>
            )}
            {/* Only the CLI-based connections have a runtime to choose; API endpoints and Copilot do not. */}
            {!['claude', 'compatible', 'copilot'].includes(c.provider) && !c.customRuntime && (
              <button
                className="quiet"
                disabled={Boolean(busy)}
                title={t('สำหรับผู้ดูแลระบบ: ใช้ Codex หรือ Gemini CLI ที่ติดตั้งเอง')}
                onClick={() => void run(c.id, () => call('runtime', { id: c.id }))}
              >
                {t('เลือกโปรแกรมเชื่อมต่อเอง')}
              </button>
            )}
          </div>
          {!['claude', 'compatible', 'copilot'].includes(c.provider) && c.customRuntime && (
            <div className="connection-runtime">
              <p className="small muted">
                {c.provider === 'antigravity'
                  ? t('ตอนนี้ใช้ Antigravity ที่เลือกเอง ไม่ใช่ตัวที่ STeP ติดตั้งให้')
                  : t('ตอนนี้ใช้โปรแกรมเชื่อมต่อที่เลือกเอง ถ้าเชื่อมต่อมีปัญหา ให้กลับไปใช้ตัวที่ติดตั้งมากับแอป')}
              </p>
              <button
                className="quiet"
                disabled={Boolean(busy)}
                title={t('เลิกใช้ runtime ที่เลือกเอง')}
                onClick={() => void run(c.id, () => call('runtime', { id: c.id, reset: true }))}
              >
                {c.provider === 'antigravity' ? t('ใช้ Antigravity ที่ STeP ติดตั้ง') : t('กลับไปใช้ตัวเชื่อมที่มากับแอป')}
              </button>
            </div>
          )}
          {/* Signing out keeps the account; removing it is destructive, so it sits apart in the danger style. */}
          <div className="connection-actions connection-account-actions">
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
            <button className="quiet danger-text connection-remove" disabled={Boolean(busy)} onClick={onRemove}>
              <Trash2 size={14} aria-hidden="true" />
              {t('ลบบัญชีนี้')}
            </button>
          </div>
        </details>
      </div>
    </li>
  );
}

function CapabilityList({ items }: { items: Capability[] }) {
  const statuses = { available: 'ใช้ได้', conditional: 'ต้องตรวจเงื่อนไข', blocked: 'ยังใช้ไม่ได้', unknown: 'ยังไม่ทราบ' };
  return (
    <ul className="ai-capability-list">
      {items.map(item => (
        <li key={item.id} data-capability={item.id}>
          <div>
            <strong>{t(item.title)}</strong>
            <span className={`ai-capability-state ${item.state}`}>{t(statuses[item.state])}</span>
          </div>
          <p className="small muted">{t(item.detail)}</p>
        </li>
      ))}
    </ul>
  );
}
