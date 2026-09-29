import { useMemo, useState } from 'react';
import { ArrowRight, Blocks, ReceiptText, Search } from 'lucide-react';
import type { SkillEntry } from './types';

// Where each capability stands: governed in the registry, reachable through the router, or a standalone tool.
export const statusTag: Record<string, { label: string; tone: string; hint: string }> = {
  routed: { label: 'เชื่อม Routing แล้ว', tone: 'routed', hint: 'อยู่ใน Manifest และ Router เลือกให้อัตโนมัติ หรือเรียกตรงด้วย /ชื่อ' },
  registered: { label: 'Manifest · ยังไม่ Routing', tone: 'registered', hint: 'ลงทะเบียนแล้วแต่ Router ยังไม่เลือกให้ จึงเรียกจากแชทไม่ได้' },
  unregistered: { label: 'ยังไม่ลงทะเบียน', tone: 'unregistered', hint: 'มีไฟล์ SKILL.md แต่ยังไม่อยู่ใน Manifest' },
  'missing-file': { label: 'ไม่พบไฟล์', tone: 'unregistered', hint: 'Manifest อ้างถึง Skill ที่ไม่มีไฟล์' },
  tool: { label: 'Mini App · ยังไม่ Routing', tone: 'tool', hint: 'เครื่องมือเฉพาะงาน เปิดจากเมนูเครื่องมือ ยังไม่ผ่าน Router' },
};
const tools = [{ id: 'receipt', title: 'ตรวจใบเสร็จก่อนส่ง AFP', description: 'อ่านใบเสร็จด้วย OCR ในเครื่อง ให้คนตรวจทีละช่อง แล้วส่งข้อมูลที่ตรวจแล้วให้ receipt-audit pre-check ต่อ', owner: 'afp', stage: 'ทดลอง' }];
const filters = [['all', 'ทั้งหมด'], ['routed', 'Routing แล้ว'], ['registered', 'Manifest เท่านั้น'], ['unregistered', 'ยังไม่ลงทะเบียน'], ['tool', 'Mini App']] as const;
const fold = (value: string) => value.toLowerCase().replace(/[-_\s]+/g, ' ');

export function SkillsHub({ skills, onUse, onOpenTool }: { skills: SkillEntry[] | null; onUse: (name: string) => void; onOpenTool: (id: string) => void }) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<(typeof filters)[number][0]>('all');
  const count = (id: string) => id === 'all' ? (skills?.length || 0) + tools.length : id === 'tool' ? tools.length : (skills || []).filter(s => id === 'unregistered' ? s.status === 'unregistered' || s.status === 'missing-file' : s.status === id).length;
  const visible = useMemo(() => {
    const q = fold(query.trim());
    return (skills || []).filter(s => (filter === 'all' || (filter === 'unregistered' ? ['unregistered', 'missing-file'].includes(s.status) : s.status === filter))
      && (!q || fold([s.name, s.title, s.description, s.owner, s.cluster, ...s.triggers].join(' ')).includes(q)));
  }, [skills, query, filter]);
  const visibleTools = tools.filter(t => (filter === 'all' || filter === 'tool') && (!query.trim() || fold(t.title + ' ' + t.description).includes(fold(query.trim()))));

  return <div className="skills-hub">
    <div className="skills-head">
      <label className="skills-search"><Search size={16}/><input placeholder="ค้นหา Skill, ทีม หรือคำที่ใช้เรียก" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <div className="skills-filters" role="tablist" aria-label="กรองตามสถานะ">{filters.map(([id, label]) => <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label} <small>{count(id)}</small></button>)}</div>
      <p className="small muted">เรียก Skill ที่เชื่อม Routing แล้วได้ตรง ๆ โดยพิมพ์ <code>/ชื่อ-skill</code> ในกล่องพิมพ์ ระบบยังตรวจสิทธิ์และขอบเขตของงานทุกครั้ง</p>
    </div>
    {!skills && <p className="muted">กำลังโหลดรายชื่อ Skill…</p>}
    <div className="skills-grid">
      {visibleTools.map(t => <article key={t.id} className="skill-card">
        <header><ReceiptText size={16}/><strong>{t.title}</strong></header>
        <p>{t.description}</p>
        <div className="skill-tags"><span className="tag tool" title={statusTag.tool.hint}>{statusTag.tool.label}</span><span className="tag">{t.stage}</span><span className="tag">{t.owner.toUpperCase()}</span></div>
        <button className="quiet" onClick={() => onOpenTool(t.id)}>เปิดเครื่องมือ<ArrowRight size={14}/></button>
      </article>)}
      {visible.map(s => { const tag = statusTag[s.status]; return <article key={s.name} className="skill-card">
        <header><Blocks size={16}/><strong>{s.title}</strong></header>
        <code className="skill-command">/{s.name}</code>
        <p>{s.description}</p>
        <div className="skill-tags"><span className={`tag ${tag.tone}`} title={tag.hint}>{tag.label}</span>{s.stage && <span className="tag">{s.stage}</span>}{s.owner && <span className="tag">{s.owner.toUpperCase()}</span>}{s.category && <span className="tag">{s.category}</span>}</div>
        {s.status === 'routed' ? <button className="quiet" onClick={() => onUse(s.name)}>ใช้ Skill นี้<ArrowRight size={14}/></button> : <small className="muted">{tag.hint}</small>}
      </article>; })}
    </div>
    {skills && !visible.length && !visibleTools.length && <p className="muted">ไม่พบ Skill ที่ตรงกับคำค้นหรือตัวกรอง</p>}
  </div>;
}
