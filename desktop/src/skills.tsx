import { useMemo, useState } from 'react';
import { ArrowRight, Blocks, Plus, ReceiptText, Search } from './icons';
import type { OwnPack, SkillEntry } from './types';
import { t } from './i18n';
import { shownDate } from './messages';
import { SectionArt } from './illustration';

import { statusTag, tools, filters } from './skill-capabilities';
export { statusTag, toolCount } from './skill-capabilities';

// "common" means the Skill belongs to every team, so it reads as such instead of a team code.
const ownerLabel = (owner: string) => (owner === 'common' ? t('ใช้ได้ทุกทีม') : `${t('ทีม')} ${owner.toUpperCase()}`);
const fold = (value: string) => value.toLowerCase().replace(/[-_\s]+/g, ' ');
// "เพิ่มโดย ชื่อ · ทีม · วันที่": who brought a Skill in, kept outside its files.
const creditLine = (people: { name: string; team?: string; date?: string }[]) =>
  t('เพิ่มโดย {0}', people.map(p => [p.name, p.team, p.date && shownDate(p.date)].filter(Boolean).join(' · ')).join(', '));
const packState = (p: OwnPack) =>
  p.invalid ? 'ตรวจไฟล์ไม่ผ่าน' : p.enabled ? (p.personal ? 'ใช้เองบนเครื่องนี้' : 'เปิดใช้แล้ว') : 'ยังไม่เปิดใช้';

export function SkillsHub({
  skills,
  team = '',
  onUse,
  onOpenTool,
  ownPacks = null,
  onAddOwn,
  onUsePack,
}: {
  skills: SkillEntry[] | null;
  team?: string;
  onUse: (name: string) => void;
  onOpenTool: (id: string) => void;
  /** Skill Packs imported on this computer; shown only while staff may add their own (onAddOwn given). */
  ownPacks?: OwnPack[] | null;
  /** Opens the Skill Packs import; left out when the administrator turned staff Skills off. */
  onAddOwn?: () => void;
  onUsePack?: (pack: string, skill: string) => void;
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
  const visibleOwn =
    onAddOwn && filter === 'all'
      ? (ownPacks || []).filter(p => !query.trim() || fold([p.id, ...p.skills.map(s => s.id)].join(' ')).includes(fold(query.trim())))
      : [];
  const visibleTools = tools.filter(
    t => (filter === 'all' || filter === 'tool') && (!query.trim() || fold(t.title + ' ' + t.description).includes(fold(query.trim()))),
  );

  return (
    <div className="skills-hub">
      <h1 className="sr-only">{t('ศูนย์รวม Skill')}</h1>
      <div className="skills-head">
        <div className="skills-controls">
          <div className="skills-search-row">
            <label className="skills-search">
              <Search size={16} />
              <input placeholder={t('ค้นหา Skill ทีม หรือคำที่ใช้เรียก')} value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            {onAddOwn && (
              <button className="skills-add" onClick={onAddOwn} title={t('เลือกโฟลเดอร์ Skill ระบบตรวจรูปแบบและจุดเสี่ยงก่อนเปิดใช้')}>
                <Plus size={15} />
                {t('เพิ่ม Skill ของฉัน')}
              </button>
            )}
          </div>
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
          <p className="small muted">{t('Skill รวมวิธีทำงานแต่ละแบบ เลือกรายการที่พร้อมใช้ หรือพิมพ์งานตามปกติได้')}</p>
        </div>
        <SectionArt scene="skills" className="skills-illustration" />
      </div>
      {visibleOwn.length > 0 && (
        <section className="skills-own" aria-label={t('Skill ของฉัน')}>
          <h2>{t('Skill ของฉัน')}</h2>
          <div className="skills-grid">
            {visibleOwn.map(p => (
              <article key={p.id} className="skill-card">
                <header>
                  <Blocks size={16} />
                  <strong>{p.skills.length === 1 ? p.skills[0].id : p.id}</strong>
                </header>
                {p.skills.length > 1 && <p>{p.skills.map(s => s.id).join(', ')}</p>}
                <div className="skill-tags">
                  <span className={`tag ${p.enabled ? 'routed' : p.invalid ? 'unregistered' : 'registered'}`}>{t(packState(p))}</span>
                  <span className="tag">{t('Skill ที่พนักงานเพิ่ม')}</span>
                </div>
                {p.credit && <small className="skill-credit">{creditLine([{ ...p.credit, date: p.credit.uploadedAt }])}</small>}
                {p.enabled && p.skills.length === 1 && onUsePack ? (
                  <button className="quiet" onClick={() => onUsePack(p.id, p.skills[0].id)}>
                    {t('ใช้ Skill นี้')}
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <button className="quiet" onClick={onAddOwn}>
                    {t(p.enabled ? 'เลือก Skill ในชุด' : 'ดูผลตรวจและเปิดใช้')}
                    <ArrowRight size={14} />
                  </button>
                )}
              </article>
            ))}
          </div>
          <h2>{t('Skill ขององค์กร')}</h2>
        </section>
      )}
      {!skills && <p className="muted">{t('กำลังโหลด Skill…')}</p>}
      <div className="skills-grid">
        {visibleTools.map(tool => (
          <article key={tool.id} className="skill-card">
            <header>
              <ReceiptText size={16} />
              <strong>{t(tool.title)}</strong>
            </header>
            <p>{t(tool.description)}</p>
            <div className="skill-tags">
              <span className="tag tool" title={t(tool.id === 'documents' ? 'ใช้ Skill และแม่แบบที่ตรงกับเอกสารนี้' : statusTag.tool.hint)}>
                {t(tool.id === 'documents' ? 'แบบฟอร์มช่วยร่าง' : statusTag.tool.label)}
              </span>
              <span className="tag">{t(tool.stage)}</span>
              <span className="tag">{ownerLabel(tool.owner)}</span>
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
                {s.owner && <span className="tag">{ownerLabel(s.owner)}</span>}
              </div>
              {!!s.contributors?.length && <small className="skill-credit">{creditLine(s.contributors)}</small>}
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
      {skills && !visible.length && !visibleTools.length && <p className="muted">{t('ไม่พบ Skill ลองเปลี่ยนคำค้นหรือตัวกรอง')}</p>}
    </div>
  );
}
