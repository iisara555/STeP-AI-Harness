import { useEffect, useRef, useState } from 'react';
import { Play, RefreshCw } from './icons';
import { t } from './i18n';
import { explainError } from './messages';
import type { CodingCheck, CodingPackage, CodingProject } from './coding-project';
import type { DesktopAPI } from './types';
import type { ToolTab } from './tools';

const KIND_LABEL = { frontend: 'Frontend', backend: 'Backend', fullstack: 'Frontend และ Backend', shared: 'ส่วนกลาง' } as const;

export function CodingWorkbench({
  api,
  workspace,
  workflow,
  canChooseWorkflow,
  onWorkflow,
  onTab,
}: {
  api: DesktopAPI;
  workspace: string;
  workflow: string;
  canChooseWorkflow: boolean;
  onWorkflow: (workflow: 'plan' | 'coding') => void;
  onTab: (tab: ToolTab) => void;
}) {
  const [project, setProject] = useState<CodingProject>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [runningCheck, setRunningCheck] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!workspace) return;
    let live = true;
    void api.call('codingProject').then(
      data => {
        if (!live) return;
        setProject(data);
        setLoading(false);
      },
      reason => {
        if (!live) return;
        setError(explainError(reason));
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [api, workspace, revision]);

  async function runCheck(target: CodingPackage, check: CodingCheck) {
    if (!project || runningCheck) return;
    setError('');
    setStatus('');
    setRunningCheck(true);
    try {
      const task = await api.call('codingRunCheck', { root: project.root, directory: target.directory, check });
      if (!mounted.current) return;
      if (task) onTab('tasks');
      else setStatus(t('ยกเลิกการรันสคริปต์แล้ว'));
    } catch (reason) {
      if (mounted.current) setError(explainError(reason));
    } finally {
      if (mounted.current) setRunningCheck(false);
    }
  }

  return (
    <section className="tool-section coding-workbench" aria-label={t('พื้นที่เขียนโค้ด')}>
      <div className="tool-actions coding-modes">
        <button aria-pressed={workflow === 'plan'} disabled={!workspace || !canChooseWorkflow} onClick={() => onWorkflow('plan')}>
          {t('วางแผนก่อนลงมือ')}
        </button>
        <button aria-pressed={workflow === 'coding'} disabled={!workspace || !canChooseWorkflow} onClick={() => onWorkflow('coding')}>
          {t('เขียนและตรวจโค้ด')}
        </button>
      </div>
      {workspace && (
        <>
          <div className="coding-project-heading">
            <h2>{t('สคริปต์ตรวจโปรเจกต์')}</h2>
            <button className="quiet" onClick={() => onTab('tasks')}>
              {t('งานเบื้องหลัง')}
            </button>
            <button
              className="icon"
              aria-label={t('โหลดแพ็กเกจใหม่')}
              title={t('โหลดแพ็กเกจใหม่')}
              disabled={loading || runningCheck}
              onClick={() => {
                setLoading(true);
                setProject(undefined);
                setError('');
                setStatus('');
                setRevision(value => value + 1);
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          {error && (
            <p className="tool-error" role="alert">
              {error}
            </p>
          )}
          <div className="small muted" role="status">
            {loading ? t('กำลังอ่าน package.json…') : runningCheck ? t('กำลังขออนุญาตรันสคริปต์…') : status}
          </div>
          {project?.incomplete && <p className="small muted">{t('อ่านแพ็กเกจได้บางส่วน ลองเลือกโฟลเดอร์แพ็กเกจโดยตรง')}</p>}
          {project?.packages.length === 0 && (
            <p className="tool-empty">{t('ไม่พบ package.json ในตำแหน่งที่ตรวจ เปิดไฟล์งานหรือใช้ขั้นตอนเขียนโค้ดต่อได้')}</p>
          )}
          {project?.packages.map(pkg => (
            <section className="coding-package" key={pkg.directory}>
              <h3>{pkg.directory === '.' ? t('โฟลเดอร์หลัก') : pkg.directory}</h3>
              <p className="small muted">
                {t(KIND_LABEL[pkg.kind])} · {pkg.manager}
              </p>
              {pkg.checks.length ? (
                <div className="tool-actions" role="group" aria-label={t('สคริปต์ของ {0}', pkg.directory)}>
                  {pkg.checks.map(check => (
                    <button key={check} className="quiet" disabled={runningCheck} onClick={() => void runCheck(pkg, check)}>
                      <Play size={13} /> {check}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small muted">{t('ไม่พบสคริปต์ตรวจใน package.json')}</p>
              )}
            </section>
          ))}
        </>
      )}
    </section>
  );
}
