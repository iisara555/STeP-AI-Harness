import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../modules/role-resolver.js';
import { colors } from '../utils/colors.js';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runSync } from './commands/sync.js';
import { runDoctor } from './commands/doctor.js';
import { runRollback } from './commands/rollback.js';

function parseArgs(rawArgs) {
  const args = { _: [] };
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key.includes('=')) {
        const [k, v] = key.split('=', 2);
        args[k] = v;
      } else {
        const next = rawArgs[i + 1];
        if (next && !next.startsWith('-')) {
          args[key] = next;
          i++;
        } else {
          args[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const next = rawArgs[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function showHelp(version) {
  console.log(`
${colors.cyan(colors.bold('@step-cmu/ai-harness'))} ${colors.dim(`v${version}`)}
ระบบแจกจ่าย Approved Skills และ Rules สำหรับ Codex และ AI Agents ในองค์กร

${colors.bold('การใช้งาน:')}
  step-ai <คำสั่ง> [ตัวเลือก]

${colors.bold('คำสั่งหลัก:')}
  ${colors.cyan('init')}       ติดตั้ง Approved Skills เข้า Workspace ตาม Role และเครื่องมือ
  ${colors.cyan('status')}     ตรวจรุ่นที่ติดตั้งและไฟล์ที่มีการแก้ไขในเครื่อง
  ${colors.cyan('sync')}       อัปเดต Skills และ Rules เป็นเวอร์ชันล่าสุด (ไม่เขียนทับงานเดิม)
  ${colors.cyan('doctor')}     ตรวจสิทธิ์การเข้าถึง Private Registry และสภาพแวดล้อม
  ${colors.cyan('rollback')}   ย้อนกลับรุ่นก่อนหน้าจาก Backup Snapshot

${colors.bold('ตัวเลือกทั่วไป:')}
  -r, --role <id>       ระบุ Role (all, staff, creative, pm, developer, ai-admin) [default: all]
  -t, --tool <name>     ระบุเครื่องมือ (claude, cursor, codex, all) [default: codex]
  -d, --dest <path>     ระบุโฟลเดอร์ปลายทาง [default: .]
      --dry-run         แสดงตัวอย่างไฟล์ที่จะดำเนินการโดยไม่เขียนลงเครื่อง
  -s, --snapshot <id>   ระบุ Snapshot ID สำหรับ rollback
  -l, --list            แสดงรายการ snapshot ที่มีอยู่
  -h, --help            แสดงคู่มือช่วยเหลือนี้
  -v, --version         แสดงเวอร์ชันของแพ็กเกจ

${colors.bold('ตัวอย่างการใช้งาน:')}
  step-ai init                      # ติดตั้งทุก Skill สำหรับ Codex (Universal Access)
  step-ai init --tool claude        # ติดตั้งทุก Skill สำหรับ Claude Code
  step-ai init --tool cursor        # ติดตั้งทุก Skill สำหรับ Cursor
  step-ai init --tool all           # ติดตั้งทุก Skill สำหรับทุก Agent ในโปรเจกต์
  step-ai status
  step-ai sync
  step-ai doctor
  step-ai rollback
`);
}

export async function main(argv = process.argv.slice(2)) {
  const pkgJson = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
  const args = parseArgs(argv);
  const command = args._[0];

  if (args.version || args.v || command === 'version') {
    console.log(pkgJson.version);
    return;
  }

  if (args.help || args.h || !command || command === 'help') {
    showHelp(pkgJson.version);
    return;
  }

  switch (command) {
    case 'init':
      await runInit(args);
      break;
    case 'status':
      await runStatus(args);
      break;
    case 'sync':
      await runSync(args);
      break;
    case 'doctor':
      await runDoctor(args);
      break;
    case 'rollback':
      await runRollback(args);
      break;
    default:
      console.error(`${colors.red('✖')} คำสั่งไม่ถูกต้อง: '${command}'`);
      console.log(`พิมพ์ ${colors.cyan('step-ai --help')} เพื่อดูคำสั่งทั้งหมด\n`);
      process.exit(1);
  }
}
