import { useState } from 'react';
import { ConfirmDialog } from './ui';
import { COMMANDS, validateKeybindings, type Keybindings } from './commands';
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
      title={t('คีย์ลัดและ Vim')}
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
      <p>{t('Mod คือ Ctrl บน Windows/Linux และ Command บน macOS ใช้รูปแบบ Mod+Alt+Shift+k เว้นว่างเพื่อปิดคีย์ลัด')}</p>
      {error && <p role="alert">{error}</p>}
      {COMMANDS.map(([id, label, fallback]) => (
        <label key={id}>
          {t(label)}
          <input aria-label={t('คีย์ลัด ') + id} value={keys[id] ?? fallback} onChange={e => setKeys({ ...keys, [id]: e.target.value })} />
        </label>
      ))}
      <label>
        <input type="checkbox" checked={vim} onChange={e => setVim(e.target.checked)} />
        {t('เปิด Vim ในช่องพิมพ์คำขอ')}
      </label>
      <p>{t('เริ่มใน Insert กด Escape เพื่อเข้า Normal ใช้ i/a, h/j/k/l, w/b, 0/$ และ x การพิมพ์ภาษาไทยผ่าน IME ยังคงทำงานตามปกติ')}</p>
      <button className="quiet" onClick={() => setKeys({})}>
        {t('คืนคีย์ลัดเริ่มต้น')}
      </button>
    </ConfirmDialog>
  );
}
