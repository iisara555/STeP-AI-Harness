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
import { runSkills } from './commands/skills.js';
import { runAsk } from './commands/ask.js';
import { runConfig } from './commands/config.js';
import { runUpdate } from './commands/update.js';
import { runFeedback } from './commands/feedback.js';
import { runOutput } from './commands/output.js';
import { runUpgradeApply } from './commands/upgrade-apply.js';
import { runPrivacy } from './commands/privacy.js';
import { runBenchmark } from './commands/benchmark.js';
import { runHook } from './commands/hook.js';
import { runRun } from './commands/run.js';
import { runPlugin } from './commands/plugin.js';
import { runAutopilot } from './commands/autopilot.js';

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

${colors.bold('สำหรับพนักงาน:')}
  ${colors.cyan('ask')}        ถามงานเป็นภาษาไทย ระบบหา Skill, SOP และระเบียบที่เกี่ยวข้องให้
  ${colors.cyan('privacy')}    ตรวจข้อความ/PDF/DOCX ในเครื่องก่อนแนบให้ AI
  ${colors.cyan('output')}     ตั้งชื่อและที่เก็บไฟล์งานตามมาตรฐาน ไม่เขียนทับไฟล์เดิม
  ${colors.cyan('config')}     ดูหรือเปลี่ยนทีมหลักและโปรแกรม AI ที่ใช้
  ${colors.cyan('update')}     อัปเดต Skills และ Router จากรุ่นที่ติดตั้งอยู่
  ${colors.cyan('doctor')}     ตรวจว่าเครื่องพร้อมใช้งาน (ใส่ --employee เพื่อดูแบบอ่านง่าย)
  ${colors.cyan('feedback')}   แจ้งปัญหา ส่งข้อเสนอแนะ หรือเสนอ Skill ใหม่

${colors.bold('ตัวอย่าง:')}
  step-ai ask "ช่วยตรวจ TOR ฉบับนี้หน่อย"
  step-ai privacy --file sample.txt --redact
  step-ai output --team cc --type presentation --title "STeP Booth CMU" --ext pptx
  step-ai config --team qs
  step-ai doctor --employee

${colors.bold('ตัวเลือก:')}
  -m, --team <id>       รหัสทีมใน 22 ทีม (เช่น qs, afp, mi, piti, linc, cc)
      --employee        แสดงผลแบบอ่านง่าย ไม่แสดงรายละเอียดทางเทคนิค
  -h, --help            แสดงคู่มือนี้
  -v, --version         แสดงรุ่นของแพ็กเกจ

${colors.bold('สำหรับผู้ดูแลระบบ:')}
  ${colors.cyan('init')}       ติดตั้ง Approved Skills เข้า Workspace ตามทีมหรือ Role
  ${colors.cyan('teams')}      แสดงรายชื่อ 22 ทีมของ STeP
  ${colors.cyan('skills')}     ศูนย์รวม Skill พร้อมสถานะ Manifest/Routing (--status routed|registered|unregistered, --json)
  ${colors.cyan('status')}     ตรวจรุ่นที่ติดตั้งและไฟล์ที่แก้ไขในเครื่อง
  ${colors.cyan('sync')}       ซิงก์ไฟล์ Skills และ Rules
  ${colors.cyan('rollback')}   ย้อนกลับรุ่นก่อนหน้าจาก Backup Snapshot (--snapshot <id>, --list)
  ${colors.cyan('benchmark')}  รัน Pilot benchmark 30 งานสำหรับ Router / Context / Authority (--json)
  ${colors.cyan('run')}        ร่างงานผ่านผู้ให้บริการที่อนุมัติ (--base-url URL --model ID --api-key-env NAME --approve-provider --approve-destination --output-format text|json|stream-json)
  ${colors.cyan('autopilot')}  ตรวจ issue/PR ที่อนุมัติบน GitHub แล้วเสนอโค้ดให้คนตรวจ (--repo owner/repo --dry-run)

${colors.bold('ตัวเลือกสำหรับผู้ดูแลระบบ:')}
  -r, --role <id>       Role (all, staff, pm, developer, creative, ai-admin) [ค่าเริ่มต้น: all]
  -t, --tool <name>     โปรแกรม AI (claude, cursor, codex, all) [ค่าเริ่มต้น: codex]
  -d, --dest <path>     โฟลเดอร์ปลายทาง [ค่าเริ่มต้น: .]
      --json            สำหรับ ask: คืน routing contract + context budget เป็น JSON
      --answer <text>   สำหรับ ask: เพิ่มคำตอบเพื่อระบุขอบเขตร่วมกับคำถามเดิม
      --dry-run         แสดงตัวอย่างไฟล์ที่จะเปลี่ยนโดยไม่เขียนลงเครื่อง
  -s, --snapshot <id>   Snapshot ID สำหรับ rollback
  -l, --list            แสดงรายการ snapshot

${colors.bold('ตัวอย่างสำหรับผู้ดูแลระบบ:')}
  step-ai init --team qs --tool codex
  step-ai init --role all --tool claude
  step-ai ask "ช่วยตรวจ TOR ฉบับนี้หน่อย" --json
  step-ai benchmark --json
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
    case 'plugin':
      return runPlugin(args);
    case 'run':
      await runRun(args);
      break;
    case 'autopilot':
      await runAutopilot(args);
      break;
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
    case 'skills':
      await runSkills(args);
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
    case 'hook':
      await runHook(args);
      break;
    default:
      console.error(`${colors.red('✖')} คำสั่งไม่ถูกต้อง: '${command}'`);
      console.log(`พิมพ์ ${colors.cyan('step-ai --help')} เพื่อดูคำสั่งทั้งหมด\n`);
      process.exit(1);
  }
}
