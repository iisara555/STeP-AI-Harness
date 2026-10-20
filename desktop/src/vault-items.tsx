import { useState } from 'react';
import { t } from './i18n';
import type { VaultMetadata } from '../electron/vault';
import { addressFields } from './vault-fields';

// Field names match the browser host contract; only encrypted trusted IPC accepts their values.
const labels: Record<string, string> = {
  address_line1: 'ที่อยู่บรรทัดแรก',
  address_line2: 'ที่อยู่บรรทัดที่สอง',
  city: 'เมือง / อำเภอ',
  state: 'จังหวัด / รัฐ',
  postal_code: 'รหัสไปรษณีย์',
  country: 'ประเทศ',
};
type Source = { source: 'onepassword' | 'bitwarden'; enabled: boolean; installed: boolean; unlocked: boolean };
export function VaultItems({
  entries,
  sources,
  disabled,
  run,
  call,
}: {
  entries: VaultMetadata[];
  sources: Source[];
  disabled: boolean;
  run: (id: string, action: () => Promise<unknown>) => Promise<void>;
  call: (method: string, input?: any) => Promise<any>;
}) {
  const [form, setForm] = useState<{
    kind: 'address';
    label: string;
    destination: string;
    fields: Record<string, string>;
    remember: boolean;
  }>();
  return (
    <div className="vault-items">
      <div className="credential-actions">
        <button disabled={disabled} onClick={() => setForm({ kind: 'address', label: '', destination: '', fields: {}, remember: false })}>
          {t('เพิ่มที่อยู่')}
        </button>
      </div>
      {form && (
        <form
          className="credential-form"
          autoComplete="off"
          onSubmit={event => {
            event.preventDefault();
            if (disabled) return;
            const value = form;
            void run('save-item', async () => {
              await call('vaultSave', value);
              setForm(undefined);
            });
          }}
        >
          <label>
            {t('ชื่อเรียกบัญชี')}
            <input
              required
              disabled={disabled}
              maxLength={100}
              value={form.label}
              onChange={event => setForm({ ...form, label: event.target.value })}
            />
          </label>
          <label>
            {t('เว็บไซต์ที่ใช้ได้')}
            <input
              required
              disabled={disabled}
              type="url"
              pattern="https://.+"
              placeholder="https://example.org"
              title={t('ใช้เว็บไซต์ที่ขึ้นต้นด้วย https://')}
              value={form.destination}
              onChange={event => setForm({ ...form, destination: event.target.value })}
            />
          </label>
          {addressFields.map(name => (
            <label key={name}>
              {t(labels[name])}
              <input
                type="text"
                autoComplete="off"
                maxLength={1000}
                disabled={disabled}
                required={['address_line1', 'city', 'postal_code', 'country'].includes(name)}
                value={form.fields[name] || ''}
                onChange={event => setForm({ ...form, fields: { ...form.fields, [name]: event.target.value } })}
              />
            </label>
          ))}
          <label className="credential-check">
            <input
              disabled={disabled}
              type="checkbox"
              checked={form.remember}
              onChange={event => setForm({ ...form, remember: event.target.checked })}
            />
            {t('จำข้อมูลนี้บนเครื่องส่วนตัวของฉัน')}
          </label>
          <div className="credential-actions">
            <button type="button" className="quiet" disabled={disabled} onClick={() => setForm(undefined)}>
              {t('ยกเลิก')}
            </button>
            <button type="submit" disabled={!form.remember || disabled}>
              {t('บันทึก')}
            </button>
          </div>
        </form>
      )}
      {entries
        .filter(entry => entry.kind === 'address')
        .map(entry => (
          <article className="credential-row" key={entry.id}>
            <div>
              <strong>{entry.label}</strong>
              <p className="muted small">
                {entry.destination} · {t('ที่อยู่')}
              </p>
            </div>
            <button
              disabled={disabled}
              onClick={() => void run('delete-item', () => call('vaultRemove', { id: entry.id, revision: entry.revision }))}
            >
              {t('ลบจากเครื่อง')}
            </button>
          </article>
        ))}
      <h3>{t('ตัวจัดการรหัสผ่าน')}</h3>
      {sources.map(source => (
        <div className="credential-row" key={source.source}>
          <label className="credential-source">
            <input
              type="checkbox"
              disabled={disabled}
              checked={source.enabled}
              onChange={event =>
                void run('source', () => call('vaultSource', { source: source.source, action: 'enable', enabled: event.target.checked }))
              }
            />
            {source.source === 'onepassword' ? '1Password' : 'Bitwarden'} ·{' '}
            {source.installed ? (source.unlocked ? t('ปลดล็อกแล้ว') : t('พร้อมเชื่อม')) : t('ติดตั้งและลงชื่อใน CLI ของบริการก่อน')}
          </label>
          {source.installed && source.enabled && (
            <button
              className="quiet"
              disabled={disabled}
              onClick={() =>
                void run('source', () => call('vaultSource', { source: source.source, action: source.unlocked ? 'lock' : 'unlock' }))
              }
            >
              {source.unlocked ? t('ล็อก') : t('ปลดล็อก')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
