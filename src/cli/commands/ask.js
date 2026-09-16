import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import readline from 'node:readline';
import { header, success, info, warn, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { PACKAGE_ROOT } from '../../modules/role-resolver.js';
import { getUserTeam } from '../../utils/user-config.js';
import { loadUserMemory } from '../../modules/user-memory.js';
import {
  buildContext,
  rankSkillCandidates,
  checkScope,
  inspectCheapContext,
  rescoreWithCheapContext,
} from '../../modules/router/index.js';

/**
 * Load router index skills from manifest/router-index.yaml
 */
export async function loadRouterIndex() {
  const routerPath = join(PACKAGE_ROOT, 'manifest', 'router-index.yaml');
  const text = await readFile(routerPath, 'utf-8');

  // Parse skills from router-index.yaml
  const lines = text.split(/\r?\n/);
  const skills = [];
  let current = null;
  let inScope = false;
  let currentScopeKey = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const nameMatch = line.match(/^ {2}- name:\s*([a-z0-9_-]+)/);
    if (nameMatch) {
      current = {
        name: nameMatch[1],
        domain: '',
        processId: '',
        teams: { primary: [], consumers: [] },
        description: '',
        intent: [],
        triggers: [],
        paths: [],
        fileTypes: [],
        scope: { allow: [], escalate: {}, human_only: {} },
      };
      skills.push(current);
      inScope = false;
      continue;
    }

    if (!current) continue;

    const domainMatch = line.match(/^ {4}domain:\s*([a-z0-9_-]+)/);
    if (domainMatch) {
      current.domain = domainMatch[1];
      continue;
    }

    const procMatch = line.match(/^ {4}processId:\s*([a-z0-9_.-]+)/);
    if (procMatch) {
      current.processId = procMatch[1];
      continue;
    }

    const descMatch = line.match(/^ {4}description:\s*(.+)/);
    if (descMatch) {
      current.description = descMatch[1].trim();
      continue;
    }

    const intentMatch = line.match(/^ {4}intent:\s*\[(.*?)\]/);
    if (intentMatch) {
      current.intent = intentMatch[1].split(',').map((i) => i.trim()).filter(Boolean);
      continue;
    }

    const triggersMatch = line.match(/^ {4}triggers:\s*\[(.*?)\]/);
    if (triggersMatch) {
      current.triggers = triggersMatch[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    const pathsMatch = line.match(/^ {4}paths:\s*\[(.*?)\]/);
    if (pathsMatch) {
      current.paths = pathsMatch[1].split(',').map((p) => p.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    const fileTypesMatch = line.match(/^ {4}fileTypes:\s*\[(.*?)\]/);
    if (fileTypesMatch) {
      current.fileTypes = fileTypesMatch[1].split(',').map((f) => f.trim()).filter(Boolean);
      continue;
    }

    const primaryMatch = line.match(/^ {6}primary:\s*\[(.*?)\]/);
    if (primaryMatch) {
      current.teams.primary = primaryMatch[1].split(',').map((t) => t.trim()).filter(Boolean);
      continue;
    }

    const consumerMatch = line.match(/^ {6}consumers:\s*\[(.*?)\]/);
    if (consumerMatch) {
      current.teams.consumers = consumerMatch[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }

    if (line.match(/^ {4}scope:/)) {
      inScope = true;
      continue;
    }

    if (inScope) {
      if (line.match(/^ {6}allow:/)) {
        currentScopeKey = 'allow';
        continue;
      }
      if (line.match(/^ {6}escalate:/)) {
        currentScopeKey = 'escalate';
        continue;
      }
      if (line.match(/^ {6}human_only:/)) {
        currentScopeKey = 'human_only';
        continue;
      }

      const allowItemMatch = line.match(/^ {8}-\s*(.+)/);
      if (currentScopeKey === 'allow' && allowItemMatch) {
        current.scope.allow.push(allowItemMatch[1].trim());
        continue;
      }

      const mapKeyMatch = line.match(/^ {8}([a-z0-9_-]+):$/);
      if (mapKeyMatch) {
        current.scope[currentScopeKey][mapKeyMatch[1]] = {};
        continue;
      }
      const descLineMatch = line.match(/^ {10}description:\s*(.+)/);
      if (descLineMatch) {
        const lastKey = Object.keys(current.scope[currentScopeKey]).pop();
        if (lastKey) current.scope[currentScopeKey][lastKey].description = descLineMatch[1].trim();
        continue;
      }
      const roleLineMatch = line.match(/^ {10}role:\s*([a-z0-9_-]+)/);
      if (roleLineMatch) {
        const lastKey = Object.keys(current.scope[currentScopeKey]).pop();
        if (lastKey) current.scope[currentScopeKey][lastKey].role = roleLineMatch[1].trim();
        continue;
      }
      const authLineMatch = line.match(/^ {10}authority:\s*([a-z0-9_-]+)/);
      if (authLineMatch) {
        const lastKey = Object.keys(current.scope[currentScopeKey]).pop();
        if (lastKey) current.scope[currentScopeKey][lastKey].authority = authLineMatch[1].trim();
        continue;
      }
      const skillLineMatch = line.match(/^ {10}skill:\s*([a-z0-9_-]+)/);
      if (skillLineMatch) {
        const lastKey = Object.keys(current.scope[currentScopeKey]).pop();
        if (lastKey) current.scope[currentScopeKey][lastKey].skill = skillLineMatch[1].trim();
        continue;
      }
    }
  }

  return skills;
}

/**
 * Load human-readable names for teams from manifest/teams.yaml
 */
export async function loadTeamsDictionary() {
  const teamsPath = join(PACKAGE_ROOT, 'manifest', 'teams.yaml');
  const text = await readFile(teamsPath, 'utf-8');
  const dict = {};

  const lines = text.split(/\r?\n/);
  let curId = '';
  for (const line of lines) {
    const m = line.match(/^ {6}- id:\s*([a-z0-9_-]+)/);
    if (m) {
      curId = m[1];
      dict[curId] = { id: curId, name: curId, nameEn: '', clusterName: '' };
      continue;
    }
    if (!curId) continue;
    const nameM = line.match(/^ {8}name:\s*(.+)/);
    if (nameM) {
      dict[curId].name = nameM[1].trim();
      continue;
    }
    const nameEnM = line.match(/^ {8}nameEn:\s*(.+)/);
    if (nameEnM) {
      dict[curId].nameEn = nameEnM[1].trim();
      continue;
    }
  }

  return dict;
}

/**
 * Programmatic query function for testing and external consumers
 * @param {string} query 
 * @param {object} options 
 * @returns {Promise<{
 *   query: string,
 *   selectedSkill: object,
 *   ranked: Array<object>,
 *   scopeResult: object,
 *   teamInfo: object
 * }>}
 */
export async function queryStepRouter(query, options = {}) {
  const skills = await loadRouterIndex();
  const teams = await loadTeamsDictionary();

  let resolvedTeam = options.team || '';
  let userMemory = null;
  if (!resolvedTeam) {
    try {
      userMemory = await loadUserMemory(options.workspaceDir || process.cwd());
      if (userMemory?.profile?.team) {
        resolvedTeam = userMemory.profile.team;
      }
    } catch {
      // ignore memory read error
    }
  }

  const context = buildContext({
    promptText: query,
    path: options.path || '',
    filenames: options.filenames || [],
    team: resolvedTeam,
  });

  const ranked = rankSkillCandidates(skills, context);
  const bestMatch = ranked[0] || null;
  const runnerUp = ranked[1] || null;

  let selectedSkill = null;
  if (bestMatch) {
    selectedSkill = skills.find((s) => s.name === bestMatch.skill);
  }

  const scopeResult = selectedSkill ? checkScope(selectedSkill, query) : { status: 'ALLOW', inScope: true };

  const primaryTeamCode = selectedSkill?.teams?.primary?.[0] || 'common';
  const teamInfo = teams[primaryTeamCode] || { id: primaryTeamCode, name: primaryTeamCode };

  // Disambiguation & Clarification detection:
  // Is ambiguous when in FALLBACK tier (score < 0.50) OR (runnerUp close to bestMatch && score < 0.80)
  const isAmbiguous = Boolean(
    bestMatch && (
      bestMatch.tier === 'FALLBACK' ||
      (bestMatch.tier === 'AMBIGUOUS' && runnerUp && (bestMatch.score - runnerUp.score < 0.15) && runnerUp.score >= 0.35)
    )
  );

  const candidateSkills = ranked
    .slice(0, 3)
    .filter((r) => r.score >= 0.20)
    .map((r) => {
      const sObj = skills.find((s) => s.name === r.skill);
      const pTeam = sObj?.teams?.primary?.[0] || 'common';
      const tInfo = teams[pTeam] || { id: pTeam, name: pTeam };
      return {
        skill: sObj,
        score: r.score,
        tier: r.tier,
        teamInfo: tInfo,
      };
    });

  return {
    query,
    selectedSkill,
    ranked,
    bestMatch,
    scopeResult,
    teamInfo,
    isAmbiguous,
    candidateSkills,
    userMemory,
  };
}

/**
 * CLI command runner: `step-ai ask`
 */
export async function runAsk(args) {
  header('STeP AI Assistant — ผู้ช่วยค้นหาทักษะและมาตรฐานงานองค์กร');

  let query = args._ ? args._.slice(1).join(' ') : '';
  if (!query && args.q) query = args.q;

  // If no query provided, prompt interactively
  if (!query) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(colors.dim('พิมพ์คำถามหรือเนื้องานที่ต้องการให้ AI ช่วยเหลือ (ภาษาไทยทั่วไป):'));
    console.log(colors.dim('ตัวอย่าง: "ช่วยตรวจ TOR หน่อย", "ทำสไลด์ Pitching", "ร่างหนังสือเชิญประชุม"\n'));

    query = await new Promise((res) => {
      rl.question(colors.bold(colors.cyan('คำถามของคุณ: ')), (ans) => {
        rl.close();
        res(ans.trim());
      });
    });

    if (!query) {
      warn('ไม่มีคำถาม ระงับการค้นหา');
      return;
    }
  }

  info(`วิเคราะห์คำถาม: "${colors.bold(query)}" ...\n`);

  const userTeam = args.team || args.m || (await getUserTeam()) || '';
  const result = await queryStepRouter(query, { team: userTeam });
  const { selectedSkill, bestMatch, scopeResult, teamInfo, isAmbiguous, candidateSkills, userMemory } = result;

  const isMatched = selectedSkill && (bestMatch.score >= 0.20 || bestMatch.breakdown.keyword > 0);
  if (!isMatched) {
    warn('ไม่พบทักษะเฉพาะทางที่ตรงกับคำถามอย่างชัดเจน');
    console.log(colors.dim('คุณสามารถถามกับ AI ได้โดยตรงในฐานะผู้ช่วยทั่วไป หรือลองเพิ่มคำระบุงาน เช่น TOR, บรีฟ, สไลด์, หนังสือราชการ'));
    return;
  }

  // Active Clarification Protocol: If query is broad / ambiguous, show clarification card
  if (isAmbiguous && candidateSkills.length > 1) {
    console.log(colors.bold(colors.yellow('┌─────────────────────────────────────────────────────────────────────────────┐')));
    console.log(colors.bold(colors.yellow('│  🤔 คำถามค่อนข้างกว้างหรือมีหลายทักษะที่เข้าข่าย (Clarification Needed)     │')));
    console.log(colors.bold(colors.yellow('└─────────────────────────────────────────────────────────────────────────────┘')));
    console.log(`  คำถาม: "${colors.bold(query)}" อาจเข้าข่ายหลายกระบวนการ หรือต้องการข้อมูลเพิ่ม`);
    if (userMemory?.exists && userMemory.profile?.team) {
      console.log(colors.dim(`  (ตรวจพบบริบทจาก USER.md: ทีม ${userMemory.profile.team.toUpperCase()})`));
    }
    console.log(`\n  ${colors.bold('ทักษะของ STeP ที่เข้าข่าย (กรุณาระบุเพิ่มเติมหรือเลือกทักษะที่ตรงกับงาน):')}`);
    candidateSkills.forEach((c, idx) => {
      console.log(`  ${colors.cyan(`${idx + 1}.`)} [${colors.bold(c.skill.name)}] ${c.skill.description} (${colors.dim(`ทีม ${c.teamInfo.name}`)})`);
    });
    console.log();
    console.log(colors.bold('💡 คำแนะนำเพื่อให้ AI ช่วยเหลือได้แม่นยำยิ่งขึ้น:'));
    console.log(colors.dim('   - ระบุประเภทเอกสารหรือผลงานที่ต้องการ (เช่น "ตรวจ TOR", "ทำสไลด์ Pitching", "ตรวจแบบฟอร์ม SOP")'));
    console.log(colors.dim('   - หรือระบุทีม/โครงการที่เกี่ยวข้อง (เช่น "ของโครงการ PITI", "งานของฝ่ายบัญชีและการเงิน AFP")\n'));
    return;
  }

  // Display Friendly Result Card
  console.log(colors.bold(colors.green('┌─────────────────────────────────────────────────────────────────────────────┐')));
  console.log(colors.bold(colors.green('│  🎯 ทักษะที่แนะนำสำหรับงานนี้                                               │')));
  console.log(colors.bold(colors.green('└─────────────────────────────────────────────────────────────────────────────┘')));
  console.log(`  • ทักษะ (Skill):   ${colors.bold(colors.cyan(selectedSkill.name))} (${selectedSkill.description})`);
  console.log(`  • ความมั่นใจ:      ${colors.bold(Math.round(bestMatch.score * 100) + '%')} [${bestMatch.tier} Tier]`);
  console.log(`  • ทีมที่รับผิดชอบ:  ${colors.bold(teamInfo.name)} (${teamInfo.id.toUpperCase()})`);
  if (selectedSkill.processId) {
    console.log(`  • กระบวนการ (HOW): ${colors.yellow(selectedSkill.processId)}`);
  }
  console.log();

  // Scope & Governance Check
  if (scopeResult.status === 'BLOCK') {
    console.log(colors.bold(colors.red('⚠️  ข้อควรระวังตามระเบียบองค์กร (Human-in-the-loop Required):')));
    console.log(`  • สถานะ:             ${colors.red('งานนี้ต้องผ่านการพิจารณาหรืออนุมัติโดยมนุษย์')}`);
    console.log(`  • ผู้มีอำนาจตัดสินใจ: ${colors.bold(scopeResult.targetRole || 'Authorized Human')}`);
    if (scopeResult.authority) {
      console.log(`  • ระเบียบอ้างอิง:    ${colors.dim(scopeResult.authority)}`);
    }
    console.log(`  • คำแนะนำ:           ${colors.dim(scopeResult.reason)}`);
    console.log(colors.dim('  (AI สามารถช่วยร่างหรือเตรียมข้อมูลเปรียบเทียบได้ แต่ไม่สามารถตัดสินใจแทนได้ครับ)'));
  } else if (scopeResult.status === 'ESCALATE') {
    if (scopeResult.targetSkill === selectedSkill.name) {
      console.log(colors.bold(colors.yellow('✋  ประตูยืนยันความถูกต้อง (Human Confirmation Gate):')));
      console.log(`  • สถานะ:             ${colors.yellow('ต้องได้รับคำยืนยันจากผู้ใช้ก่อนกดส่งจริง')}`);
      console.log(`  • คำแนะนำ:           ${colors.dim(scopeResult.reason)}`);
    } else {
      console.log(colors.bold(colors.yellow('🔄  การส่งต่องาน (Cross-Skill Escalation):')));
      console.log(`  • ทักษะที่ควรรับช่วงต่อ: ${colors.bold(colors.cyan(scopeResult.targetSkill))}`);
      console.log(`  • คำแนะนำ:             ${colors.dim(scopeResult.reason)}`);
    }
  } else {
    success(`ขอบเขตงาน (Scope Guard): อนุญาตให้ AI ช่วยดำเนินการได้ตามระเบียบ STeP`);
    if (selectedSkill.scope?.allow && selectedSkill.scope.allow.length > 0) {
      console.log(colors.dim(`  สิ่งที่ AI ช่วยได้: ${selectedSkill.scope.allow.join(', ')}`));
    }
  }

  console.log();
  console.log(colors.bold('💡 ตัวอย่างคำสั่งที่คุณสั่ง AI ใน Claude / Cursor / Codex ได้ทันที:'));
  console.log(colors.cyan(`   "${query}"`));
  console.log(colors.dim('   (AI จะเปิดใช้ทักษะ ') + colors.bold(selectedSkill.name) + colors.dim(' และปฏิบัติตามมาตรฐานให้อัตโนมัติ)\n'));
}
