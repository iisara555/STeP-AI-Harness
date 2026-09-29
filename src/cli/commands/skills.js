import { loadSkillCatalog } from '../../modules/skills/catalog.js';
import { header, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';

const LABELS = {
  routed: 'Routing แล้ว',
  registered: 'Manifest · ยังไม่ Routing',
  unregistered: 'ยังไม่ลงทะเบียน',
  'missing-file': 'ไม่พบไฟล์',
};

// Lists every Skill with where it stands: file, registry, router.
export async function runSkills(args) {
  const catalog = await loadSkillCatalog();
  const wanted = typeof args.status === 'string' ? args.status : '';
  const list = wanted ? catalog.filter((skill) => skill.status === wanted) : catalog;
  if (args.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  header('ศูนย์รวม Skill ของ STeP AI Harness');
  const counts = Object.entries(LABELS).map(([status, label]) => `${label} ${catalog.filter((s) => s.status === status).length}`);
  console.log(colors.dim(counts.join(' · ')) + '\n');
  table(['Skill', 'สถานะ', 'ทีม', 'Stage'], list.map((skill) => [
    colors.bold(skill.name), LABELS[skill.status], skill.owner || '-', skill.stage || '-',
  ]));
  console.log(`\nเรียก Skill ตรง ๆ: ${colors.cyan('step-ai ask "<งาน>" --skill <ชื่อ skill>')} (ยังผ่านการตรวจ authority และ scope ตามปกติ)`);
}
