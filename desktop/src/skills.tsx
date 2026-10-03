import { useMemo, useState } from 'react';
import { ArrowRight, Blocks, ReceiptText, Search } from 'lucide-react';
import type { SkillEntry } from './types';
import { t } from './i18n';
import { SectionArt } from './illustration';

// Where each capability stands: governed in the registry, reachable through the router, or a standalone tool.
export const statusTag: Record<string, { label: string; tone: string; hint: string }> = {
  routed: {
    label: 'เชื่อม Routing แล้ว',
    tone: 'routed',
    hint: 'อยู่ใน Manifest และ Router เลือกให้อัตโนมัติ หรือเรียกตรงด้วย /ชื่อ',
  },
  registered: {
    label: 'Manifest · ยังไม่ Routing',
    tone: 'registered',
    hint: 'ลงทะเบียนแล้วแต่ Router ยังไม่เลือกให้ จึงเรียกจากแชทไม่ได้',
  },
  unregistered: { label: 'ยังไม่ลงทะเบียน', tone: 'unregistered', hint: 'มีไฟล์ SKILL.md แต่ยังไม่อยู่ใน Manifest' },
  'missing-file': { label: 'ไม่พบไฟล์', tone: 'unregistered', hint: 'Manifest อ้างถึง Skill ที่ไม่มีไฟล์' },
  tool: { label: 'Mini App · ยังไม่ Routing', tone: 'tool', hint: 'เครื่องมือเฉพาะงาน เปิดจากเมนูเครื่องมือ ยังไม่ผ่าน Router' },
};
const tools = [
  {
    id: 'receipt',
    title: 'ตรวจใบเสร็จก่อนส่ง AFP',
    description: 'อ่านใบเสร็จด้วย OCR ในเครื่อง ให้คนตรวจทีละช่อง แล้วส่งข้อมูลที่ตรวจแล้วให้ receipt-audit pre-check ต่อ',
    owner: 'afp',
    stage: 'ทดลอง',
  },
];
export const toolCount = tools.length;
const filters = [
  ['all', 'ทั้งหมด'],
  ['routed', 'Routing แล้ว'],
  ['registered', 'Manifest เท่านั้น'],
  ['unregistered', 'ยังไม่ลงทะเบียน'],
  ['tool', 'Mini App'],
] as const;
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
            {t('เรียก Skill ที่เชื่อม Routing แล้วได้ตรง ๆ โดยพิมพ์')} <code>{t('/ชื่อ-skill')}</code>{' '}
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
              <span className="tag tool" title={t(statusTag.tool.hint)}>
                {t(statusTag.tool.label)}
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
