import { useState } from 'react';
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
    [busy, setBusy] = useState(false);
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
      <p>{t('พิมพ์คีย์ลัดในช่องทางขวาของแต่ละคำสั่ง เช่น {0} เว้นว่างเพื่อปิดคีย์ลัดของคำสั่งนั้น', shortcutText('Mod+Shift+k'))}</p>
      {error && <p role="alert">{error}</p>}
      {/* One command per row: its name on the left, its key on the right, tied together by label/for. */}
      <div className="keybinding-table" role="group" aria-label={t('คีย์ลัดของแต่ละคำสั่ง')}>
        {COMMANDS.map(([id, label, fallback]) => (
          <div className="keybinding-row" key={id}>
            <label htmlFor={'keybinding-' + id}>{t(label)}</label>
            <input
              id={'keybinding-' + id}
              aria-label={t('คีย์ลัด {0}', t(label))}
              placeholder={t('ไม่มีคีย์ลัด')}
              spellCheck={false}
              value={editableShortcut(keys[id] ?? fallback)}
              onChange={e => setKeys({ ...keys, [id]: parseShortcut(e.target.value) })}
            />
          </div>
        ))}
      </div>
      <label className="keybinding-vim">
        <input type="checkbox" checked={vim} onChange={e => setVim(e.target.checked)} />
        {t('เปิด Vim ในช่องพิมพ์คำขอ')}
      </label>
      <p className="small muted">
        {t('เริ่มใน Insert กด Escape เพื่อเข้า Normal ใช้ i/a, h/j/k/l, w/b, 0/$ และ x การพิมพ์ภาษาไทยผ่าน IME ยังคงทำงานตามปกติ')}
      </p>
      <button className="quiet" onClick={() => setKeys({})}>
        {t('คืนคีย์ลัดเริ่มต้น')}
      </button>
    </ConfirmDialog>
  );
}
