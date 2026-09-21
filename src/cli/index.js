import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../modules/role-resolver.js';
import { colors } from '../utils/colors.js';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runSync } from './commands/sync.js';
import { runDoctor } from './commands/doctor.js';
import { runRollback } from './commands/rollback.js';

import { runTeams } from './commands/teams.js';
import { runAsk } from './commands/ask.js';
import { runConfig } from './commands/config.js';
import { runUpdate } from './commands/update.js';
import { runFeedback } from './commands/feedback.js';
import { runOutput } from './commands/output.js';
import { runUpgradeApply } from './commands/upgrade-apply.js';
import { runPrivacy } from './commands/privacy.js';
import { runBenchmark } from './commands/benchmark.js';

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
ระบบแจกจ่าย Approved Skills และ Rules สำหรับ 22 ทีม STeP / RSP North

${colors.bold('การใช้งาน:')}
  step-ai <คำสั่ง> [ตัวเลือก]

${colors.bold('คำสั่งหลักสำหรับพนักงาน:')}
  ${colors.cyan('ask')}        ถามคำถามงานภาษาไทยธรรมดา เพื่อให้ AI วิเคราะห์ Skill, SOP และระเบียบที่เกี่ยวข้อง
  ${colors.cyan('config')}     ดูหรือเปลี่ยนทีมหลักและเครื่องมือ AI ประจำตัว (${colors.dim('~/.step-ai/config.json')})
  ${colors.cyan('update')}     ซิงก์ Skills และ Router จากเวอร์ชัน STeP AI ที่ติดตั้งอยู่
  ${colors.cyan('feedback')}   แนะนำวิธีส่งข้อเสนอแนะ รายงานผลลัพธ์ หรือเสนอ Skill ใหม่
  ${colors.cyan('output')}     สร้าง path และชื่อไฟล์มาตรฐานสำหรับเก็บ output โดยไม่เขียนทับไฟล์เดิม
  ${colors.cyan('privacy')}    ตรวจข้อความ/PDF/DOCX บนเครื่องก่อนแนบไฟล์ ให้คนตรวจผลก่อนส่ง
  ${colors.cyan('benchmark')}  รัน Pilot benchmark 30 งานสำหรับ Router / Context / Authority
  ${colors.cyan('init')}       ติดตั้ง Approved Skills เข้า Workspace ตาม Team หรือ Role
  ${colors.cyan('teams')}      แสดงรายชื่อ 22 ทีมของ STeP
  ${colors.cyan('doctor')}     ตรวจความพร้อมของระบบและเครื่องมือ AI ที่ติดตั้งในเครื่อง
  ${colors.cyan('status')}     ตรวจรุ่นที่ติดตั้งและไฟล์ที่มีการแก้ไขในเครื่อง
  ${colors.cyan('sync')}       ซิงก์ไฟล์ Skills และ Rules
  ${colors.cyan('rollback')}   ย้อนกลับรุ่นก่อนหน้าจาก Backup Snapshot

${colors.bold('ตัวเลือกทั่วไป:')}
  -m, --team <id>       ระบุรหัสทีมใน 22 ทีม (เช่น qs, afp, mi, piti, linc, cc)
  -r, --role <id>       ระบุ Role (all, staff, pm, developer, creative, ai-admin) [default: all]
  -t, --tool <name>     ระบุเครื่องมือ (claude, cursor, codex, all) [default: codex]
  -d, --dest <path>     ระบุโฟลเดอร์ปลายทาง [default: .]
      --employee        แสดงผลลัพธ์ในโหมดพนักงานทั่วไป (เข้าใจง่าย ไม่แสดง technical warning)
      --json            สำหรับ ask: คืน compact routing contract + context budget เป็น JSON
      --answer <text>   สำหรับ ask: เพิ่มคำตอบเพื่อระบุขอบเขตร่วมกับคำถามเดิม
      --dry-run         แสดงตัวอย่างไฟล์ที่จะดำเนินการโดยไม่เขียนลงเครื่อง
  -s, --snapshot <id>   ระบุ Snapshot ID สำหรับ rollback
  -l, --list            แสดงรายการ snapshot ที่มีอยู่
  -h, --help            แสดงคู่มือช่วยเหลือนี้
  -v, --version         แสดงเวอร์ชันของแพ็กเกจ

${colors.bold('ตัวอย่างการใช้งาน:')}
  step-ai ask "ช่วยตรวจ TOR ฉบับนี้หน่อย"
  step-ai ask "ช่วยตรวจ TOR ฉบับนี้หน่อย" --json
  step-ai ask "ทำสไลด์ Pitching ให้ผู้ประกอบการ"
  step-ai config
  step-ai config --team qs
  step-ai update
  step-ai output --team cc --type presentation --title "STeP Booth CMU" --ext pptx
  step-ai privacy --file sample.txt --redact
  step-ai benchmark
  step-ai benchmark --json
  step-ai init --team qs --tool codex
  step-ai init --role all --tool claude
  step-ai doctor --employee
`);
}

export async function main(argv = process.argv.slice(2)) {
  const pkgJson = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
  const args = parseArgs(argv);
  const command = args._[0];

  // upgrade-apply owns --version; do not turn an upgrade into a version print.
  if ((!command && (args.version || args.v)) || command === 'version') {
    console.log(pkgJson.version);
    return;
  }

  if (args.help || args.h || !command || command === 'help') {
    showHelp(pkgJson.version);
    return;
  }

  switch (command) {
    case 'ask':
      await runAsk(args);
      break;
    case 'config':
      await runConfig(args);
      break;
    case 'update':
      await runUpdate(args);
      break;
    case 'upgrade-apply':
      await runUpgradeApply(args);
      break;
    case 'feedback':
      await runFeedback(args);
      break;
    case 'output':
      await runOutput(args);
      break;
    case 'privacy':
      await runPrivacy(args);
      break;
    case 'benchmark':
      await runBenchmark(args);
      break;
    case 'teams':
      await runTeams(args);
      break;
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
