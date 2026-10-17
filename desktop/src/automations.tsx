import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ui';
import { explainError } from './messages';
import type { DesktopAPI } from './types';
import { t } from './i18n';

// MCP and Docker tools for administrators' setups; scheduled tasks have their own page (schedules-app.tsx).
export function AutomationDialog({
  api,
  features,
  onClose,
  onSchedules,
}: {
  api: DesktopAPI;
  features: Record<string, boolean>;
  onClose: () => void;
  onSchedules: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [servers, setServers] = useState<{ name: string; transport: string; profile?: 'google-workspace' }[]>([]),
    [server, setServer] = useState(''),
    [search, setSearch] = useState(''),
    [tool, setTool] = useState(''),
    [args, setArgs] = useState('{}'),
    [command, setCommand] = useState(''),
    [files, setFiles] = useState(''),
    [result, setResult] = useState('');
  const load = async () => setServers(await api.call('mcpServers'));
  useEffect(() => {
    void load().catch(e => setError(explainError(e)));
    return api.onEvent(e => {
      if (e.type === 'changed') void load().catch(() => {});
    });
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
  return (
    <ConfirmDialog info title={t('เครื่องมือเพิ่มเติม (MCP และ Docker)')} confirmLabel={t('ปิด')} onConfirm={onClose} onCancel={onClose}>
      {error && <p role="alert">{error}</p>}
      <p className="small muted">
        {t('งานที่ให้ผู้ช่วยทำซ้ำตามเวลาอยู่ที่หน้างานตั้งเวลา')}{' '}
        <button className="text-link" onClick={onSchedules}>
          {t('ไปที่งานตั้งเวลา')}
        </button>
      </p>
      <details className="dialog-fold">
        <summary>
          {t('เครื่องมือ MCP')} {features.mcp ? '' : t('(ยังไม่เปิดใช้)')}
        </summary>
        {!features.mcp ? (
          <p className="small muted">{t('ผู้ดูแลยังไม่เปิดเครื่องมือ MCP บนเครื่องนี้ ถ้าต้องใช้ ติดต่อผู้ดูแลระบบ')}</p>
        ) : (
          <div className="dialog-form">
            <p className="small muted">{t('ตรวจปลายทาง ข้อมูล และผลทุกครั้ง เครื่องมืออาจแก้ข้อมูลในบริการที่เชื่อมต่อ')}</p>
            <section aria-label="Google Workspace MCP" className="dialog-form">
              <h3>Google Workspace</h3>
              <p className="small">
                {t(
                  'ใช้บริการที่องค์กรตั้งไว้ การเข้าสู่ระบบและสิทธิ์ Google จัดการโดยองค์กร การค้นหาและการเรียกใช้เครื่องมือจะถามคุณก่อนทุกครั้ง',
                )}
              </p>
              {!servers.some(s => s.profile === 'google-workspace') && (
                <>
                  <p className="small">{t('ยังไม่ได้ตั้งค่า Google Workspace ติดต่อผู้ดูแลระบบ')}</p>
                  <details className="admin-fold">
                    <summary>{t('สำหรับผู้ดูแล')}</summary>
                    <p className="small muted">
                      {t('เพิ่ม MCP server ที่มี profile google-workspace ใน managed policy แล้วเปิด features.mcp')}
                    </p>
                  </details>
                </>
              )}
              {servers
                .filter(s => s.profile === 'google-workspace')
                .map(s => (
                  <div className="dialog-actions" key={s.name}>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          setServer(s.name);
                          setResult(JSON.stringify(await api.call('mcpSearch', { server: s.name, query: '' }), null, 2));
                        })
                      }
                    >
                      {t('ทดสอบ Google Workspace')} · {s.name}
                    </button>
                  </div>
                ))}
              <p className="small muted">{t('การทดสอบอ่านรายการเครื่องมือเท่านั้น ยังไม่ยืนยันสิทธิ์อ่านหรือเขียนเอกสารจริง')}</p>
            </section>
            <label className="field">
              <span>{t('บริการ')}</span>
              <select aria-label="MCP server" value={server} onChange={e => setServer(e.target.value)}>
                <option value="">{t('เลือกบริการที่ผู้ดูแลกำหนด')}</option>
                {servers.map(s => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('ค้นหาเครื่องมือ')}</span>
              <input
                aria-label={t('ค้นหาเครื่องมือ MCP')}
                placeholder={t('เช่น ปฏิทิน หรือ เอกสาร')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                disabled={busy || !server}
                onClick={() =>
                  void act(async () => setResult(JSON.stringify(await api.call('mcpSearch', { server, query: search }), null, 2)))
                }
              >
                {t('ค้นหาเครื่องมือ')}
              </button>
            </div>
            <label className="field">
              <span>{t('ชื่อเครื่องมือ')}</span>
              <input
                aria-label={t('ชื่อเครื่องมือ MCP')}
                placeholder={t('คัดลอกชื่อจากผลค้นหา')}
                value={tool}
                onChange={e => setTool(e.target.value)}
              />
            </label>
            <label className="field">
              <span>{t('ข้อมูลที่ส่งให้เครื่องมือ')}</span>
              <textarea
                aria-label={t('ข้อมูลเครื่องมือ MCP')}
                aria-describedby="mcp-args-hint"
                rows={4}
                spellCheck={false}
                className="code-field"
                value={args}
                onChange={e => setArgs(e.target.value)}
                maxLength={30000}
              />
              <small id="mcp-args-hint" className="muted">
                {t('เขียนในรูปแบบ JSON ตามที่ผลค้นหาบอก เช่น {"query": "รายงานประจำเดือน"} ถ้าเครื่องมือไม่ต้องใช้ข้อมูล ปล่อยเป็น {}')}
              </small>
            </label>
            <div className="dialog-actions">
              <button
                disabled={busy || !server || !tool}
                onClick={() =>
                  void act(async () =>
                    setResult(JSON.stringify(await api.call('mcpCall', { server, name: tool, arguments: JSON.parse(args) }), null, 2)),
                  )
                }
              >
                {t('ตรวจและเรียกเครื่องมือ')}
              </button>
            </div>
          </div>
        )}
      </details>
      <details className="dialog-fold">
        <summary>
          {t('พื้นที่ทดลองคำสั่ง (Docker)')} {features.sandbox ? '' : t('(ยังไม่เปิดใช้)')}
        </summary>
        {!features.sandbox ? (
          <p className="small muted">{t('ผู้ดูแลยังไม่เปิดพื้นที่ทดลองคำสั่งบนเครื่องนี้ ถ้าต้องใช้ ติดต่อผู้ดูแลระบบ')}</p>
        ) : (
          <div className="dialog-form">
            <p className="small muted">
              {t('คำสั่งทำงานในพื้นที่แยกที่ผู้ดูแลกำหนด ไม่ต่ออินเทอร์เน็ต และอ่านได้เฉพาะสำเนาไฟล์ที่คุณระบุ')}
            </p>
            <label className="field">
              <span>{t('คำสั่ง')}</span>
              <input aria-label={t('คำสั่ง sandbox')} value={command} onChange={e => setCommand(e.target.value)} maxLength={2000} />
            </label>
            <label className="field">
              <span>{t('ไฟล์ที่ใช้ (ไม่บังคับ)')}</span>
              <input
                aria-label={t('ไฟล์ sandbox')}
                aria-describedby="sandbox-files-hint"
                placeholder={t('เช่น รายงาน/ข้อมูล.csv')}
                value={files}
                onChange={e => setFiles(e.target.value)}
              />
              <small id="sandbox-files-hint" className="muted">
                {t('ตำแหน่งไฟล์ในพื้นที่งาน ถ้ามีหลายไฟล์ คั่นด้วยเครื่องหมายจุลภาค (,)')}
              </small>
            </label>
            <div className="dialog-actions">
              <button
                disabled={busy || !command.trim()}
                onClick={() =>
                  void act(async () =>
                    setResult(
                      JSON.stringify(
                        await api.call('sandboxRun', {
                          command,
                          files: files
                            .split(',')
                            .map(f => f.trim())
                            .filter(Boolean),
                        }),
                        null,
                        2,
                      ),
                    ),
                  )
                }
              >
                {t('ตรวจและทำงานในพื้นที่ทดลอง')}
              </button>
            </div>
          </div>
        )}
      </details>
      {result && <pre className="tool-output">{result}</pre>}
    </ConfirmDialog>
  );
}
