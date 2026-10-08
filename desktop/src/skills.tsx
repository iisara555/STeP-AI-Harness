import { useMemo, useState } from 'react';
import { ArrowRight, Blocks, ReceiptText, Search } from 'lucide-react';
import type { SkillEntry } from './types';
import { t } from './i18n';
import { SectionArt } from './illustration';

import { statusTag, tools, filters } from './skill-capabilities';
export { statusTag, toolCount } from './skill-capabilities';

const fold = (value: string) => value.toLowerCase().replace(/[-_\s]+/g, ' ');

export function SkillsHub({
  skills,
  team = '',
  onUse,
  onOpenTool,
}: {
  skills: SkillEntry[] | null;
  team?: string;
  onUse: (name: string) => void;
  onOpenTool: (id: string) => void;
}) {
  // Staff see their own team's Skills first; the rest follow in name order.
  const mine = (s: SkillEntry) => Boolean(team) && (s.owner === team || s.teams.includes(team));
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState<(typeof filters)[number][0]>('all');
  const count = (id: string) =>
    id === 'all'
      ? (skills?.length || 0) + tools.length
      : id === 'tool'
        ? tools.length
        : (skills || []).filter(s => (id === 'unregistered' ? s.status === 'unregistered' || s.status === 'missing-file' : s.status === id))
            .length;
  const visible = useMemo(() => {
    const q = fold(query.trim());
    return (skills || [])
      .filter(
        s =>
          (filter === 'all' || (filter === 'unregistered' ? ['unregistered', 'missing-file'].includes(s.status) : s.status === filter)) &&
          (!q || fold([s.name, s.title, s.description, s.owner, s.cluster, ...s.triggers].join(' ')).includes(q)),
      )
      .sort((a, b) => Number(!mine(a)) - Number(!mine(b)));
  }, [skills, query, filter, team]);
  const visibleTools = tools.filter(
    t => (filter === 'all' || filter === 'tool') && (!query.trim() || fold(t.title + ' ' + t.description).includes(fold(query.trim()))),
  );

  return (
    <div className="skills-hub">
      <h1 className="sr-only">{t('ศูนย์รวม Skill')}</h1>
      <div className="skills-head">
        <div className="skills-controls">
          <label className="skills-search">
            <Search size={16} />
            <input placeholder={t('ค้นหา Skill, ทีม หรือคำที่ใช้เรียก')} value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <div className="skills-filters" role="tablist" aria-label={t('กรองตามสถานะ')}>
            {filters.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={filter === id}
                className={filter === id ? 'active' : ''}
                onClick={() => setFilter(id)}
              >
                {t(label)} <small>{count(id)}</small>
              </button>
            ))}
          </div>
          <p className="small muted">
            {t('เรียก Skill ที่พร้อมใช้ได้ตรง ๆ โดยพิมพ์')} <code>{t('/ชื่อ-skill')}</code>{' '}
            {t('ในกล่องพิมพ์ ระบบยังตรวจสิทธิ์และขอบเขตของงานทุกครั้ง')}
          </p>
        </div>
        <SectionArt scene="skills" className="skills-illustration" />
      </div>
      {!skills && <p className="muted">{t('กำลังโหลดรายชื่อ Skill…')}</p>}
      <div className="skills-grid">
        {visibleTools.map(tool => (
          <article key={tool.id} className="skill-card">
            <header>
              <ReceiptText size={16} />
              <strong>{t(tool.title)}</strong>
            </header>
            <p>{t(tool.description)}</p>
            <div className="skill-tags">
              <span
                className="tag tool"
                title={t(tool.id === 'documents' ? 'ฟอร์มเรียก Skill ที่เกี่ยวข้องโดยตรง พร้อมกฎและแม่แบบ' : statusTag.tool.hint)}
              >
                {t(tool.id === 'documents' ? 'ฟอร์มร่างด้วย Skill' : statusTag.tool.label)}
              </span>
              <span className="tag">{t(tool.stage)}</span>
              <span className="tag">{tool.owner.toUpperCase()}</span>
            </div>
            <button className="quiet" onClick={() => onOpenTool(tool.id)}>
              {t('เปิดเครื่องมือ')}
              <ArrowRight size={14} />
            </button>
          </article>
        ))}
        {visible.map(s => {
          const tag = statusTag[s.status];
          return (
            <article key={s.name} className="skill-card">
              <header>
                <Blocks size={16} />
                <strong>{s.title}</strong>
              </header>
              <code className="skill-command">/{s.name}</code>
              <p>{s.description}</p>
              {/* Release stage and category are internal bookkeeping; they stay in the tooltip for maintainers. */}
              <div className="skill-tags" title={[s.stage, s.category].filter(Boolean).join(' · ')}>
                {mine(s) && <span className="tag team">{t('ทีมคุณ')}</span>}
                <span className={`tag ${tag.tone}`} title={t(tag.hint)}>
                  {t(tag.label)}
                </span>
                {s.owner && (
                  <span className="tag">
                    {t('ทีม')} {s.owner.toUpperCase()}
                  </span>
                )}
              </div>
              {s.status === 'routed' ? (
                <button className="quiet" onClick={() => onUse(s.name)}>
                  {t('ใช้ Skill นี้')}
                  <ArrowRight size={14} />
                </button>
              ) : (
                <small className="muted">{t(tag.hint)}</small>
              )}
            </article>
          );
        })}
      </div>
      {skills && !visible.length && !visibleTools.length && <p className="muted">{t('ไม่พบ Skill ที่ตรงกับคำค้นหรือตัวกรอง')}</p>}
    </div>
  );
}
