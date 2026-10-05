// A confirmed lesson that is about how an organization Skill should work becomes a proposal for that Skill's
// maintainers: a Markdown file with the lesson, its evidence, a patch to SKILL.md and a regression case for the
// Skill's evaluation file. STeP Desktop never edits an organization Skill; the maintainer reviews the file and applies
// it with scripts/apply-skill-proposal.mjs, then the usual Git review, validator and CI decide.
import type { LessonContent } from '../src/learning-types';

export const LESSONS_HEADING = '## บทเรียนจากการใช้งาน';
export type SkillInfo = { name: string; title: string; path: string; owner: string; version?: string };
export type ProposalInput = {
  skill: SkillInfo;
  skillText: string;
  lesson: LessonContent;
  lessonId: string;
  revision: number;
  evidence: string;
  team: string;
  at: string;
};

/** The block appended to SKILL.md: one dated, attributed rule under a single lessons section. */
export function lessonBlock(lesson: LessonContent, at: string) {
  const when = lesson.kind === 'procedure' ? ` (ใช้เมื่อคำขอเกี่ยวกับ: ${lesson.trigger})` : '';
  return [
    `### ${lesson.name}${when}`,
    '',
    ...lesson.text.trim().replace(/\r\n/g, '\n').split('\n'),
    '',
    `_เสนอจากบทเรียนที่ผู้ใช้ยืนยัน ${at.slice(0, 10)} รอผู้ดูแล Skill ตรวจ_`,
  ];
}

/**
 * A unified diff that appends the lesson to SKILL.md, under the lessons section (added once). It carries the last three
 * lines as context, so `git apply` refuses it if the Skill changed at the end since the proposal was made.
 */
export function skillPatch(path: string, original: string, lesson: LessonContent, at: string) {
  const text = original.replace(/\r\n/g, '\n');
  const newline = text.endsWith('\n');
  const lines = (newline ? text.slice(0, -1) : text).split('\n');
  // The lessons section is added once; a later lesson goes below the earlier ones, after a blank line.
  const added = [...(text.includes('\n' + LESSONS_HEADING + '\n') ? [''] : ['', LESSONS_HEADING, '']), ...lessonBlock(lesson, at)];
  const context = lines.slice(-3);
  const start = lines.length - context.length + 1;
  // Without a final newline the old last line changes too (it gains one), so it is removed and added back.
  const body = newline
    ? context.map(line => ' ' + line)
    : [...context.slice(0, -1).map(line => ' ' + line), '-' + context.at(-1), '\\ No newline at end of file', '+' + context.at(-1)];
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${start},${context.length} +${start},${context.length + added.length} @@`,
    ...body,
    ...added.map(line => '+' + line),
    '',
  ].join('\n');
}

/** A regression case for the Skill's evals file; the prompt must be rewritten as synthetic data by the maintainer. */
export function evalCase(skill: SkillInfo, lesson: LessonContent, team: string, lessonId: string) {
  return {
    id: 'lesson-' + lessonId.slice(0, 8),
    dimension: 'regression',
    team: team || skill.owner,
    prompt: 'TODO: เขียนโจทย์จำลองที่ไม่มีข้อมูลจริง ซึ่งต้องใช้บทเรียนนี้',
    expect: { mode: 'SKILL', skill: skill.name },
    outputAssertions: lesson.text
      .split('\n')
      .map(line => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 5),
    why: 'บทเรียน: ' + lesson.name,
  };
}

const fence = (lang: string, body: string) => {
  const ticks = body.includes('```') ? '````' : '```';
  return `${ticks}${lang}\n${body.replace(/\n$/, '')}\n${ticks}`;
};

export function proposalMarkdown(input: ProposalInput) {
  const { skill, lesson } = input;
  return [
    `# ข้อเสนอแก้ Skill: ${skill.title || skill.name}`,
    '',
    `- Skill: \`${skill.name}\` (${skill.path})${skill.version ? ' รุ่น ' + skill.version : ''}`,
    `- ทีมเจ้าของ Skill: ${skill.owner || '-'}`,
    `- ทีมผู้เสนอ: ${input.team || '-'}`,
    `- บทเรียน: ${lesson.name} (รุ่น ${input.revision} ยืนยันโดยผู้ใช้แล้ว, lesson ${input.lessonId})`,
    `- วันที่: ${input.at.slice(0, 10)}`,
    '',
    '## บทเรียน',
    '',
    lesson.kind === 'procedure' ? `ใช้เมื่อคำขอเกี่ยวกับ: ${lesson.trigger}` : 'ความชอบในการทำงาน',
    '',
    lesson.text.trim(),
    '',
    '## ที่มาและหลักฐาน',
    '',
    input.evidence.trim() || '-',
    '',
    '## สิ่งที่ผู้ดูแล Skill ต้องทำ',
    '',
    '1. ตรวจว่าบทเรียนถูกต้องและใช้ได้กับทุกทีมที่ใช้ Skill นี้ ไม่ใช่กรณีเฉพาะของผู้เสนอ ย้ายไปไว้ในหัวข้อที่เหมาะกว่าได้',
    '2. เขียน `prompt` ในกรณีทดสอบให้เป็นโจทย์จำลอง ห้ามใช้ข้อมูลจริง',
    '3. รัน `node scripts/apply-skill-proposal.mjs <ไฟล์นี้>` จาก repository แล้วเปิด Pull Request ตามขั้นตอนปกติ',
    '4. รันกรณีทดสอบเทียบ Skill เดิมกับฉบับใหม่ก่อน merge ไม่ใช่แค่ดูว่าบทเรียนเขียนดี',
    '',
    '## Patch สำหรับ SKILL.md',
    '',
    fence('diff', skillPatch(skill.path, input.skillText, lesson, input.at)),
    '',
    `## กรณีทดสอบสำหรับ evals/skills/${skill.name}.json`,
    '',
    fence('json', JSON.stringify(evalCase(skill, lesson, input.team, input.lessonId), null, 2)),
    '',
  ].join('\n');
}
