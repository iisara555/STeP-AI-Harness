import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ui';
import { COMMANDS, editableShortcut, parseShortcut, shortcutText, validateKeybindings, type Keybindings } from './commands';
import { explainError } from './messages';
import type { DesktopAPI, Settings } from './types';
import { t } from './i18n';
export function KeyboardDialog({
  api,
  settings,
  onClose,
  refresh,
}: {
  api: DesktopAPI;
  settings: Settings;
  onClose: () => void;
  refresh: () => Promise<unknown>;
}) {
  const [keys, setKeys] = useState<Keybindings>(settings.keybindings || {}),
    [vim, setVim] = useState(settings.vimMode || false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    // Rows the person added or edited while the dialog is open stay visible even when emptied.
    [shown, setShown] = useState<string[]>([]),
    [focusId, setFocusId] = useState('');
  const combo = (id: string, fallback: string) => keys[id as keyof Keybindings] ?? fallback;
  const rows = COMMANDS.filter(([id, , fallback]) => combo(id, fallback) || shown.includes(id));
  const unset = COMMANDS.filter(([id, , fallback]) => !combo(id, fallback) && !shown.includes(id));
  useEffect(() => {
    if (focusId) document.getElementById('keybinding-' + focusId)?.focus();
  }, [focusId]);
  return (
    <ConfirmDialog
      title={t('คีย์ลัดแป้นพิมพ์')}
      confirmLabel={t('บันทึก')}
      onCancel={onClose}
      onConfirm={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await api.call('keyboardSettings', { keybindings: validateKeybindings(keys), vimMode: vim });
          await refresh();
          onClose();
        } catch (e) {
          setError(explainError(e));
          throw e;
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="small muted">{t('พิมพ์คีย์ เช่น {0} · เว้นว่างเพื่อปิด', shortcutText('Mod+Shift+k'))}</p>
      {error && <p role="alert">{error}</p>}
      {/* Only commands that have a key are listed; the rest are one pick away, so the list is not a wall of empty boxes. */}
      <div className="keybinding-table" role="group" aria-label={t('คีย์ลัดของแต่ละคำสั่ง')}>
        {rows.map(([id, label, fallback]) => (
          <div className="keybinding-row" key={id}>
            <label htmlFor={'keybinding-' + id}>{t(label)}</label>
            <input
              id={'keybinding-' + id}
              aria-label={t('คีย์ลัด {0}', t(label))}
              placeholder={t('ไม่มีคีย์ลัด')}
              spellCheck={false}
              value={editableShortcut(combo(id, fallback))}
              onChange={e => {
                if (!shown.includes(id)) setShown([...shown, id]);
                setKeys({ ...keys, [id]: parseShortcut(e.target.value) });
              }}
            />
          </div>
        ))}
        {!rows.length && <p className="small muted">{t('ยังไม่ได้ตั้งคีย์ลัด')}</p>}
      </div>
      {unset.length > 0 && (
        <select
          className="keybinding-add"
          aria-label={t('เพิ่มคีย์ลัด…')}
          value=""
          onChange={e => {
            const id = e.target.value;
            if (!id) return;
            setShown([...shown, id]);
            setFocusId(id);
          }}
        >
          <option value="">{t('เพิ่มคีย์ลัด…')}</option>
          {unset.map(([id, label]) => (
            <option key={id} value={id}>
              {t(label)}
            </option>
          ))}
        </select>
      )}
      <label className="keybinding-vim">
        <input type="checkbox" checked={vim} onChange={e => setVim(e.target.checked)} />
        {t('เปิด Vim ในช่องพิมพ์คำขอ')}
      </label>
      <p className="small muted">
        {t('เริ่มใน Insert กด Escape เพื่อเข้า Normal ใช้ i/a, h/j/k/l, w/b, 0/$ และ x การพิมพ์ภาษาไทยผ่าน IME ยังคงทำงานตามปกติ')}
      </p>
      <button
        className="quiet"
        onClick={() => {
          setKeys({});
          setShown([]);
        }}
      >
        {t('คืนคีย์ลัดเริ่มต้น')}
      </button>
    </ConfirmDialog>
  );
}
