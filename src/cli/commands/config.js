import { loadUserConfig, saveUserConfig, USER_CONFIG_PATH } from '../../utils/user-config.js';
import { getAvailableTeams } from '../../modules/role-resolver.js';
import { getSupportedTools, isToolSupported } from '../../modules/adapters/index.js';
import { header, success, info, warn, error } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import readline from 'node:readline';

export async function runConfig(args) {
  header('STeP AI User Settings & Profile');

  const config = await loadUserConfig();
  const teams = await getAvailableTeams();

  const newTeam = args.team || args.m;
  const newTool = args.tool || args.t;

  // 1. Update team if provided via flags
  if (newTeam) {
    const found = teams.find((t) => t.id.toLowerCase() === newTeam.toLowerCase());
    if (!found) {
      error(`ไม่พบรหัสทีม '${newTeam}' (พิมพ์ 'step-ai teams' เพื่อดูรายชื่อ 22 ทีม)`);
      process.exit(1);
    }
    await saveUserConfig({ team: found.id });
    success(`อัปเดตทีมหลักเป็น: ${colors.bold(found.name)} (${found.id.toUpperCase()})`);
    return;
  }

  // 2. Update tool if provided via flags
  if (newTool) {
    const toolLower = newTool.toLowerCase();
    if (!isToolSupported(toolLower) && toolLower !== 'all') {
      error(`เครื่องมือ '${newTool}' ไม่ถูกต้อง (เครื่องมือที่รองรับ: ${getSupportedTools().join(', ')}, all)`);
      process.exit(1);
    }
    await saveUserConfig({ tool: toolLower });
    success(`อัปเดตเครื่องมือ AI เป็น: ${colors.bold(toolLower)}`);
    return;
  }

  // 3. Display current settings
  const currentTeamId = config.team;
  const currentTeamObj = currentTeamId ? teams.find((t) => t.id.toLowerCase() === currentTeamId.toLowerCase()) : null;
  const currentTool = config.tool || (Array.isArray(config.tools) ? config.tools.join(', ') : 'ยังไม่ระบุ (default: codex)');

  console.log(`┌─────────────────────────────────────────────────────────────┐`);
  console.log(`│ ${colors.bold('⚙️  การตั้งค่าโปรไฟล์ผู้ใช้ (STeP AI User Profile)')}              │`);
  console.log(`└─────────────────────────────────────────────────────────────┘`);
  console.log(`  • ทีมหลักของคุณ:    ${currentTeamObj ? colors.green(colors.bold(`${currentTeamObj.name} (${currentTeamObj.id.toUpperCase()})`)) : colors.yellow('ยังไม่ได้ตั้งค่า')}`);
  if (currentTeamObj) {
    console.log(`    กลุ่มงาน:         ${colors.dim(currentTeamObj.clusterName)}`);
  }
  console.log(`  • เครื่องมือ AI:    ${colors.cyan(colors.bold(currentTool))}`);
  console.log(`  • ไฟล์คอนฟิก:       ${colors.dim(USER_CONFIG_PATH)}`);
  if (config.updatedAt) {
    console.log(`  • อัปเดตล่าสุด:     ${colors.dim(new Date(config.updatedAt).toLocaleString('th-TH'))}`);
  }
  console.log();

  // If running in interactive terminal without flags, offer interactive change menu
  if (process.stdin.isTTY && !process.env.CI && !args.json) {
    console.log(colors.bold('ตัวเลือกการเปลี่ยนการตั้งค่า:'));
    console.log('  1. เปลี่ยนทีมหลัก (Change Primary Team)');
    console.log('  2. เปลี่ยนเครื่องมือ AI (Change AI Tool)');
    console.log('  3. ออกจากการตั้งค่า (Exit)\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const choice = await new Promise((res) => {
      rl.question(colors.bold(colors.green('เลือกเมนู (1-3) [default: 3]: ')), (ans) => {
        res(ans.trim() || '3');
      });
    });

    if (choice === '1') {
      console.log(colors.bold('\nเลือกทีมของคุณจากรายชื่อ 22 ทีม:\n'));
      teams.forEach((t, idx) => {
        const num = String(idx + 1).padStart(2, ' ');
        console.log(`  ${colors.cyan(num + '.')} [${colors.bold(t.id.padEnd(9))}] ${t.name}`);
      });
      const teamAns = await new Promise((res) => {
        rl.question(colors.bold(colors.green('\nพิมพ์หมายเลขทีม (1-22): ')), (ans) => {
          rl.close();
          res(ans.trim());
        });
      });
      const idx = parseInt(teamAns, 10) - 1;
      if (idx >= 0 && idx < teams.length) {
        await saveUserConfig({ team: teams[idx].id });
        success(`บันทึกทีมหลัก: ${teams[idx].name} (${teams[idx].id.toUpperCase()}) สำเร็จ!`);
      } else {
        warn('หมายเลขไม่ถูกต้อง ไม่มีการเปลี่ยนแปลง');
      }
    } else if (choice === '2') {
      console.log('\nเลือกเครื่องมือ AI:');
      console.log('  1. ทั้งหมด (All - Cursor, VS Code, Claude, Hermes, Windsurf) [แนะนำ]');
      console.log('  2. Cursor IDE');
      console.log('  3. OpenAI Codex / VS Code');
      console.log('  4. Claude Desktop / Claude Code');
      console.log('  5. Hermes Agent (Nous Research / Local AI)');
      console.log('  6. Windsurf AI IDE');
      const toolAns = await new Promise((res) => {
        rl.question(colors.bold(colors.green('เลือกเครื่องมือ (1-6): ')), (ans) => {
          rl.close();
          res(ans.trim());
        });
      });
      const map = {
        '1': 'all',
        '2': 'cursor',
        '3': 'codex',
        '4': 'claude',
        '5': 'hermes',
        '6': 'windsurf',
      };
      if (map[toolAns]) {
        await saveUserConfig({ tool: map[toolAns] });
        success(`บันทึกเครื่องมือ AI: ${map[toolAns]} สำเร็จ!`);
      } else {
        warn('หมายเลขไม่ถูกต้อง ไม่มีการเปลี่ยนแปลง');
      }
    } else {
      rl.close();
    }
  } else {
    console.log(colors.dim('คำแนะนำ: เปลี่ยนทีมโดยรัน: step-ai config --team <team-id>'));
    console.log(colors.dim('        เปลี่ยนเครื่องมือโดยรัน: step-ai config --tool <tool-name>\n'));
  }
}
