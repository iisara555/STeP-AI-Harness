import { resolve } from 'node:path';
import { getUserTeam } from '../../utils/user-config.js';
import { getNextOutputPath, inferOutputType } from '../../modules/output-manager.js';
import { header, info, error } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';

export async function runOutput(args) {
  const title = args.title || args.name || args._.slice(1).join(' ').trim();
  if (!title) {
    error('กรุณาระบุชื่องาน เช่น step-ai output --title "STeP Booth CMU" --ext pptx');
    return;
  }

  const extension = args.ext || args.extension || 'md';
  const team = args.team || args.m || await getUserTeam() || 'shared';
  const type = args.type || args.kind || inferOutputType(extension);
  const workspaceDir = resolve(process.cwd(), args.dest || args.d || '.');
  const date = args.date || new Date();
  const dryRun = Boolean(args['dry-run']);

  const result = await getNextOutputPath({
    workspaceDir,
    team,
    type,
    title,
    extension,
    date,
    createDir: !dryRun,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  header('STeP AI Output Path');
  info(`ทีม:       ${colors.bold(result.team)}`);
  info(`ประเภท:    ${colors.bold(result.type)}`);
  info(`เวอร์ชัน:  ${colors.bold('v' + String(result.version).padStart(2, '0'))}`);
  console.log(`\n${colors.green(result.relativePath)}\n`);

  if (dryRun) {
    info(colors.yellow('Dry-run: ยังไม่ได้สร้างโฟลเดอร์'));
  } else {
    info('สร้างโฟลเดอร์ปลายทางแล้ว ให้นำไฟล์ output ไปบันทึกตาม path ด้านบน');
  }
}
