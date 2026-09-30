import { useEffect, useState } from 'react';
import { Folder, FileText, RefreshCw, Play, Square, Globe, ArrowLeft, Download, X } from 'lucide-react';
import type { DesktopAPI, Session } from './types';
import type { ToolTab, BackgroundTask, FileChange, ToolRequest } from './tools';
import { explainError } from './messages';
type Props = {
  api: DesktopAPI;
  tab: ToolTab;
  session?: Session;
  workspace: string;
  request?: ToolRequest;
  onTab: (tab: ToolTab) => void;
  onSource: (text: string) => void;
};
export function WorkbenchPanel({ api, tab, session, workspace, request, onTab, onSource }: Props) {
  const [path, setPath] = useState(''),
    [entries, setEntries] = useState<{ name: string; path: string; directory: boolean }[]>([]);
  const [file, setFile] = useState<{ path: string; text: string } | null>(null),
    [content, setContent] = useState('');
  const [command, setCommand] = useState(''),
    [tasks, setTasks] = useState<BackgroundTask[]>([]),
    [changes, setChanges] = useState<FileChange[]>([]);
  const [url, setUrl] = useState('https://'),
    [browser, setBrowser] = useState<{ id: string; url: string; title: string; text?: string } | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [git, setGit] = useState<{ status: string; diff: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => setPreviews({}), [session?.id]);
  async function action(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }
  async function list(folder = '') {
    setFile(null);
    const data = await api.call('toolFiles', { path: folder });
    setPath(data.path);
    setEntries(data.entries);
  }
  const loadTasks = () => api.call('toolTasks').then(setTasks);
  const loadChanges = () => api.call('toolChanges').then(setChanges);
  useEffect(() => {
    setFile(null);
    setPath('');
    setEntries([]);
    setGit(null);
  }, [workspace]);
  useEffect(() => {
    if (tab === 'files' && workspace)
      void action(async () => {
        await list(path);
        if (request?.tool === 'files') {
          const data = await api.call('toolRead', { path: request.input });
          setFile(data);
          setContent(data.text);
        }
      });
    if (tab === 'tasks' || tab === 'terminal') {
      void loadTasks().catch(e => setError(explainError(e)));
      const timer = setInterval(() => void loadTasks().catch(() => {}), 1000);
      return () => clearInterval(timer);
    }
    if (tab === 'changes') void loadChanges().catch(e => setError(explainError(e)));
  }, [tab, workspace]);
  useEffect(() => {
    if (!request) return;
    if (request.tool === 'terminal') setCommand(request.input);
    if (request.tool === 'browser') setUrl(request.input);
    if (request.tool === 'files' || request.tool === 'changes') {
      setFile({ path: request.input, text: '' });
      setContent(request.content || '');
    }
  }, [request]);
  useEffect(() => {
    let live = true;
    if (tab === 'output' && session)
      for (const image of (session.images || []).slice(-10))
        void api
          .call('imageRead', { id: session.id, imageId: image.id })
          .then(v => {
            if (live) setPreviews(p => ({ ...p, [image.id]: v.url }));
          })
          .catch(e => {
            if (live) setError(explainError(e));
          });
    return () => {
      live = false;
    };
  }, [tab, session?.id, session?.images?.length]);
  return (
    <div className={'workbench-content ' + (tab === 'output' ? 'image-output' : '')}>
      {error && (
        <div className="tool-error" role="alert">
          {error}
          <button className="icon" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {tab === 'output' ? (
        <div className="image-gallery">
          {session?.images?.slice(-10).map(image => (
            <figure key={image.id}>
              {previews[image.id] ? <img src={previews[image.id]} alt={image.model} /> : <p>กำลังอ่านรูป…</p>}
              <figcaption>
                <span>{image.model}</span>
                <button
                  className="quiet"
                  onClick={() =>
                    void action(async () => {
                      await api.call('imageExport', { id: session.id, imageId: image.id });
                    })
                  }
                >
                  <Download size={14} />
                  บันทึกรูป
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <>
          <div className="tool-context">
            <Folder size={14} />
            <span title={workspace}>{workspace || 'เลือกโฟลเดอร์ทำงานเพื่อใช้ Files และ Terminal'}</span>
            <button
              className="quiet"
              onClick={() =>
                void action(async () => {
                  await api.call('workspace');
                  window.dispatchEvent(new Event('step-workspace'));
                })
              }
            >
              เลือกโฟลเดอร์
            </button>
          </div>
          {tab === 'browser' && (
            <div className="tool-section">
              <h2>
                <Globe size={20} />
                Browser
              </h2>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void action(async () => {
                    setBrowser(await api.call('toolBrowser', { url }));
                  });
                }}
              >
                <input aria-label="Browser URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" />
                <button disabled={busy}>เปิดเว็บ</button>
              </form>
              <p className="muted small">เปิดในหน้าต่าง Browser แยกจากบัญชี AI อ่านหน้าเว็บกลับมาเพื่อตรวจและส่งเข้า Chat ได้</p>
              {browser && (
                <section className="browser-preview">
                  <h3>{browser.title || browser.url}</h3>
                  <small>{browser.url}</small>
                  <div className="tool-actions">
                    <button
                      className="quiet"
                      onClick={() =>
                        void action(async () => {
                          const data = await api.call('toolBrowserRead', { id: browser.id });
                          setBrowser({ ...browser, ...data });
                        })
                      }
                    >
                      อ่านหน้าเว็บปัจจุบัน
                    </button>
                    {browser.text && <button onClick={() => onSource(`Web source: ${browser.url}\n\n${browser.text}`)}>ใช้ใน Chat</button>}
                  </div>
                  {browser.text && <pre>{browser.text}</pre>}
                </section>
              )}
            </div>
          )}
          {(tab === 'terminal' || tab === 'tasks') && (
            <div className="tool-section">
              <h2>{tab === 'terminal' ? 'Terminal' : 'Background Tasks'}</h2>
              {tab === 'terminal' && (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    void action(async () => {
                      const task = await api.call('toolRun', { command });
                      if (task) {
                        setCommand('');
                        await loadTasks();
                      }
                    });
                  }}
                >
                  <textarea
                    aria-label="Terminal command"
                    value={command}
                    onChange={e => setCommand(e.target.value)}
                    placeholder={navigator.platform.startsWith('Win') ? 'Get-ChildItem' : 'ls -la'}
                  />
                  <button disabled={!workspace || !command.trim() || busy}>
                    <Play size={14} />
                    ตรวจและรัน
                  </button>
                </form>
              )}
              <p className="muted small">งานทำต่อได้ระหว่างคุยใน Chat · ไม่รันซ้ำหลังเปิดแอปใหม่</p>
              {tasks.length === 0 && <div className="tool-empty">ยังไม่มีงานที่รัน</div>}
              {tasks.map(task => (
                <section className="task-card" key={task.id}>
                  <header>
                    <code>{task.command}</code>
                    <span className={'task-state ' + task.status}>{task.status}</span>
                  </header>
                  <small>{task.cwd}</small>
                  <pre>{task.output || 'กำลังรอ output…'}</pre>
                  <div className="tool-actions">
                    {task.status === 'running' && (
                      <button
                        className="quiet"
                        onClick={() =>
                          void action(async () => {
                            await api.call('toolCancel', { id: task.id });
                            await loadTasks();
                          })
                        }
                      >
                        <Square size={13} />
                        หยุดงาน
                      </button>
                    )}
                    {task.output && (
                      <button
                        className="quiet"
                        onClick={() => onSource(`Command: ${task.command}\nStatus: ${task.status}\n\n${task.output}`)}
                      >
                        ใช้ผลใน Chat
                      </button>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
          {tab === 'files' && (
            <div className="tool-section">
              <div className="tool-actions">
                <button className="quiet" onClick={() => void action(() => list(path.split(/[/\\]/).slice(0, -1).join('/')))}>
                  <ArrowLeft size={14} />
                </button>
                <code>{path || '/'}</code>
                <button className="icon" aria-label="Refresh files" onClick={() => void action(() => list(path))}>
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="file-list">
                {entries.map(entry => (
                  <button
                    key={entry.path}
                    className="quiet"
                    onClick={() =>
                      void action(async () => {
                        if (entry.directory) await list(entry.path);
                        else {
                          const data = await api.call('toolRead', { path: entry.path });
                          setFile(data);
                          setContent(data.text);
                        }
                      })
                    }
                  >
                    {entry.directory ? <Folder size={15} /> : <FileText size={15} />}
                    <span>{entry.name}</span>
                  </button>
                ))}
              </div>
              <button
                className="quiet"
                onClick={() => {
                  setFile({ path: '', text: '' });
                  setContent('');
                }}
              >
                สร้างไฟล์ใหม่
              </button>
              {file && (
                <section className="file-editor">
                  <input aria-label="File path" value={file.path} onChange={e => setFile({ ...file, path: e.target.value })} />
                  <textarea aria-label="File content" value={content} onChange={e => setContent(e.target.value)} />
                  <div className="tool-actions">
                    <button
                      disabled={!file.path || busy}
                      onClick={() =>
                        void action(async () => {
                          await api.call('toolStage', { path: file.path, content });
                          onTab('changes');
                        })
                      }
                    >
                      ตรวจใน Changes
                    </button>
                    <button className="quiet" onClick={() => onSource(`File: ${file.path}\n\n${content}`)}>
                      ใช้ใน Chat
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}
          {tab === 'changes' && (
            <div className="tool-section">
              <h2>Changes</h2>
              <div className="tool-actions">
                <button
                  className="quiet"
                  onClick={() =>
                    void action(async () => {
                      await loadChanges();
                    })
                  }
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
                <button
                  className="quiet"
                  onClick={() =>
                    void action(async () => {
                      setGit(await api.call('toolDiff'));
                    })
                  }
                >
                  Git diff
                </button>
              </div>
              {request?.tool === 'changes' && (
                <section className="change-card">
                  <h3>ข้อเสนอจาก AI: {request.input}</h3>
                  <pre>{request.content || ''}</pre>
                  <button
                    onClick={() =>
                      void action(async () => {
                        await api.call('toolStage', { path: request.input, content: request.content || '' });
                        await loadChanges();
                      })
                    }
                  >
                    เตรียม diff
                  </button>
                </section>
              )}
              {!changes.length && !git && <div className="tool-empty">การแก้ไฟล์จาก Files หรือข้อเสนอจาก AI จะรอตรวจที่นี่</div>}
              {changes.map(change => (
                <section className="change-card" key={change.id}>
                  <h3>{change.path}</h3>
                  <small>{change.root}</small>
                  <div className="change-diff">
                    <div>
                      <h4>Before</h4>
                      <pre className="removed">{change.before || '(new file)'}</pre>
                    </div>
                    <div>
                      <h4>After</h4>
                      <pre className="added">{change.after}</pre>
                    </div>
                  </div>
                  <div className="tool-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api.call('toolApply', { id: change.id });
                          await loadChanges();
                        })
                      }
                    >
                      บันทึกที่ตรวจแล้ว
                    </button>
                    <button
                      className="quiet"
                      onClick={() =>
                        void action(async () => {
                          await api.call('toolReject', { id: change.id });
                          await loadChanges();
                        })
                      }
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                </section>
              ))}
              {git && (
                <section className="change-card">
                  <h3>Git working tree</h3>
                  <pre>{git.status || 'No changes'}</pre>
                  <pre>{git.diff}</pre>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
