import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ui';
import { explainError, providerLabel } from './messages';
import type { Connection, DesktopAPI } from './types';
import type { Automation, AutomationRun } from '../electron/cron';

const schedules = [
  { label: 'ทุกชั่วโมง', value: '0 * * * *' },
  { label: 'ทุกวัน เวลา 09:00 น. (ประเทศไทย)', value: '0 2 * * *' },
  { label: 'วันทำงาน เวลา 09:00 น. (ประเทศไทย)', value: '0 2 * * 1-5' },
];
const empty = () => ({ name: '', query: '', schedule: schedules[0].value, connectionId: '', enabled: false, id: '' });
export function AutomationDialog({
  api,
  connections,
  features,
  onClose,
  onOpen,
}: {
  api: DesktopAPI;
  connections: Connection[];
  features: Record<string, boolean>;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [data, setData] = useState<{ jobs: Automation[]; history: AutomationRun[]; enabled: boolean }>(),
    [edit, setEdit] = useState(empty()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [remove, setRemove] = useState('');
  const [servers, setServers] = useState<{ name: string; transport: string }[]>([]),
    [server, setServer] = useState(''),
    [search, setSearch] = useState(''),
    [tool, setTool] = useState(''),
    [args, setArgs] = useState('{}'),
    [command, setCommand] = useState(''),
    [files, setFiles] = useState(''),
    [result, setResult] = useState('');
  const load = async () => {
    setData(await api.call('automationList'));
    setServers(await api.call('mcpServers'));
  };
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
    <ConfirmDialog title="งานตามรอบและเครื่องมือเพิ่มเติม" confirmLabel="ปิด" onConfirm={onClose} onCancel={onClose}>
      {error && <p role="alert">{error}</p>}
      <p className="small muted">งานตามรอบทำเมื่อเปิดแอปและใช้บัญชีที่คุณเลือก ผลเป็นร่างให้คุณตรวจ ก่อนส่งออกหรือนำไปใช้</p>
      {!data?.enabled && <p>ผู้ดูแลยังไม่เปิดใช้งานตามรอบ</p>}
      {data?.enabled && (
        <form
          className="memory-editor"
          onSubmit={e => {
            e.preventDefault();
            void act(async () => {
              await api.call('automationSave', { ...edit, id: edit.id || undefined });
              setEdit(empty());
            });
          }}
        >
          <label>
            ชื่องาน
            <input
              aria-label="ชื่องานตามรอบ"
              required
              maxLength={120}
              value={edit.name}
              disabled={busy}
              onChange={e => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          <label>
            คำขอ
            <textarea
              aria-label="คำขอตามรอบ"
              required
              rows={3}
              maxLength={4000}
              value={edit.query}
              disabled={busy}
              onChange={e => setEdit({ ...edit, query: e.target.value })}
            />
          </label>
          <label>
            รอบการทำงาน
            <select
              aria-label="รอบการทำงาน"
              value={edit.schedule}
              disabled={busy}
              onChange={e => setEdit({ ...edit, schedule: e.target.value })}
            >
              {!schedules.some(s => s.value === edit.schedule) && <option value={edit.schedule}>ตารางที่บันทึกไว้</option>}
              {schedules.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            บัญชี AI
            <select
              aria-label="บัญชีงานตามรอบ"
              required
              value={edit.connectionId}
              disabled={busy}
              onChange={e => setEdit({ ...edit, connectionId: e.target.value })}
            >
              <option value="">เลือกบัญชี</option>
              {connections
                .filter(c => c.ready)
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {providerLabel(c.provider)} {c.model}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={edit.enabled} disabled={busy} onChange={e => setEdit({ ...edit, enabled: e.target.checked })} />
            เปิดรอบอัตโนมัติ
          </label>
          <button disabled={busy} type="submit">
            บันทึกงานตามรอบ
          </button>
          {edit.id && (
            <button type="button" disabled={busy} onClick={() => setEdit(empty())}>
              ยกเลิกการแก้ไข
            </button>
          )}
        </form>
      )}
      {data?.jobs.map(job => (
        <article key={job.id} className="memory-item">
          <strong>{job.name}</strong>
          <p>
            {job.enabled ? 'เปิดรอบอัตโนมัติ' : 'พักรอบอัตโนมัติ'} · รอบถัดไป {new Date(job.nextAt).toLocaleString('th-TH')}
          </p>
          <button disabled={busy || !!job.running} onClick={() => setEdit({ ...job })}>
            แก้ไขงาน
          </button>
          <button
            disabled={busy || !!job.running || !data.enabled}
            onClick={() => void act(() => api.call('automationRun', { id: job.id }))}
          >
            เริ่มตอนนี้
          </button>
          <button disabled={busy} onClick={() => void act(() => api.call('automationCancel', { id: job.id }))}>
            หยุดงาน
          </button>
          <button disabled={busy} onClick={() => setRemove(job.id)}>
            ลบงาน
          </button>
          {remove === job.id && (
            <p>
              ลบงานนี้และหยุดรอบที่รออยู่?
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await api.call('automationRemove', { id: job.id });
                    setRemove('');
                  })
                }
              >
                ยืนยันลบงาน
              </button>
              <button onClick={() => setRemove('')}>ยกเลิก</button>
            </p>
          )}
        </article>
      ))}
      <details>
        <summary>ประวัติงาน ({data?.history.length || 0})</summary>
        {data?.history.map(run => (
          <p key={run.id}>
            {new Date(run.at).toLocaleString('th-TH')} ·{' '}
            {
              {
                queued: 'รอคิว',
                running: 'กำลังทำ',
                review: 'ร่างรอตรวจ',
                error: 'เกิดข้อผิดพลาด',
                cancelled: 'ยกเลิก',
                interrupted: 'หยุดระหว่างทำ',
              }[run.status]
            }{' '}
            {run.code && `(${run.code})`}
            {run.sessionId && <button onClick={() => onOpen(run.sessionId!)}>เปิดผล</button>}
          </p>
        ))}
      </details>
      <details>
        <summary>เครื่องมือ MCP {features.mcp ? '' : '(ยังไม่เปิดใช้)'}</summary>
        <p className="small muted">ตรวจปลายทาง ข้อมูล และผลทุกครั้ง เครื่องมืออาจแก้ข้อมูลในบริการที่เชื่อมต่อ</p>
        <label>
          Server
          <select aria-label="MCP server" value={server} onChange={e => setServer(e.target.value)}>
            <option value="">เลือก server ที่ผู้ดูแลกำหนด</option>
            {servers.map(s => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <input aria-label="ค้นหาเครื่องมือ MCP" placeholder="ค้นหาเครื่องมือ" value={search} onChange={e => setSearch(e.target.value)} />
        <button
          disabled={busy || !features.mcp || !server}
          onClick={() => void act(async () => setResult(JSON.stringify(await api.call('mcpSearch', { server, query: search }), null, 2)))}
        >
          ค้นหาเครื่องมือ
        </button>
        <input aria-label="ชื่อเครื่องมือ MCP" placeholder="ชื่อเครื่องมือ" value={tool} onChange={e => setTool(e.target.value)} />
        <textarea aria-label="ข้อมูลเครื่องมือ MCP" value={args} onChange={e => setArgs(e.target.value)} maxLength={30000} />
        <button
          disabled={busy || !features.mcp || !server || !tool}
          onClick={() =>
            void act(async () =>
              setResult(JSON.stringify(await api.call('mcpCall', { server, name: tool, arguments: JSON.parse(args) }), null, 2)),
            )
          }
        >
          ตรวจและเรียกเครื่องมือ
        </button>
      </details>
      <details>
        <summary>Docker sandbox {features.sandbox ? '' : '(ยังไม่เปิดใช้)'}</summary>
        <p className="small muted">รันใน container ที่ผู้ดูแลกำหนด ปิดเครือข่าย และอ่านเฉพาะสำเนาไฟล์ที่คุณแนบ</p>
        <input
          aria-label="คำสั่ง sandbox"
          placeholder="คำสั่ง"
          value={command}
          onChange={e => setCommand(e.target.value)}
          maxLength={2000}
        />
        <input
          aria-label="ไฟล์ sandbox"
          placeholder="path ไฟล์ในพื้นที่งาน คั่นด้วย comma"
          value={files}
          onChange={e => setFiles(e.target.value)}
        />
        <button
          disabled={busy || !features.sandbox || !command.trim()}
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
          ตรวจและรันใน sandbox
        </button>
      </details>
      {result && <pre className="tool-output">{result}</pre>}
    </ConfirmDialog>
  );
}
