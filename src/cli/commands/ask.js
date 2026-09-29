import readline from 'node:readline';
import { header, success, info, warn, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';
import { getUserTeam, getUserCluster } from '../../utils/user-config.js';
import { queryStepRouter } from '../../modules/router/service.js';
export { queryStepRouter, loadRouterIndex, loadTeamsDictionary, loadSkillContextMetadata, loadDocumentContextMetadata } from '../../modules/router/service.js';

/**
 * CLI command runner: `step-ai ask`
 */
export async function runAsk(args) {
  const machineMode = Boolean(args.json);
  if (!machineMode) header('STeP AI Assistant — ผู้ช่วยค้นหาทักษะและมาตรฐานงานองค์กร');

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

  const userTeam = args.team || args.m || (await getUserTeam()) || '';
  const userCluster = args.cluster || args.c || (await getUserCluster()) || '';
  const result = await queryStepRouter(query, {
    team: userTeam, cluster: userCluster, clarificationAnswer: args.answer,
    skill: typeof args.skill === 'string' ? args.skill : undefined,
  });
  if (machineMode) {
    console.log(JSON.stringify({
      routing: result.routingContract,
      contextPlan: result.contextPlan,
      privacy: result.privacy,
    }, null, 2));
    return;
  }

  // Echo the scanned request, not the raw one: terminal scrollback is a log too.
  info(`วิเคราะห์คำถาม: "${colors.bold(result.query)}" ...\n`);

  if (result.privacy.redactionApplied || result.privacy.privacyAction !== 'pass') {
    console.log(colors.bold(colors.yellow('🔒 ตรวจข้อมูลส่วนบุคคลในคำถาม:')));
    console.log(`  • ระดับข้อมูล: ${colors.bold(result.privacy.privacyClass)}`);
    if (result.privacy.redactionApplied) {
      console.log(`  • ${colors.dim('ปิดบังข้อมูลที่ตรวจพบก่อนจัดเส้นทางแล้ว')}`);
    }
    if (result.privacy.privacyAction !== 'pass' && result.privacy.privacyAction !== 'auto-mask') {
      console.log(colors.yellow(`  • ${'ให้ตรวจสอบก่อนส่งต่อ การสแกนรูปแบบข้อความไม่ใช่การรับรองว่าส่งได้'}`));
    }
    console.log();
  }
  const {
    selectedSkill,
    bestMatch,
    scopeResult,
    teamInfo,
    routingMode,
    selectedPlaybook,
    playbookPlan,
    routingConfidence,
    authorityPreflight,
    clarification,
  } = result;

  const authorityDecision = scopeResult.status === 'BLOCK' ? scopeResult : null;
  if (authorityDecision) {
    console.log(colors.bold(colors.red('┌─────────────────────────────────────────────────────────────────────────────┐')));
    console.log(colors.bold(colors.red('│  ⚠️  Human Authority Required — AI cannot make this decision                │')));
    console.log(colors.bold(colors.red('└─────────────────────────────────────────────────────────────────────────────┘')));
    console.log(`  • Authority:          ${colors.bold(authorityDecision.authority)}`);
    console.log(`  • ผู้มีอำนาจ:         ${colors.bold(authorityDecision.targetRole || 'Authorized Human')}`);
    if (authorityDecision.alternateRole) {
      console.log(`  • ผู้รับช่วงสำรอง:     ${colors.dim(authorityDecision.alternateRole)}`);
    }
    console.log(`  • เหตุผล:             ${colors.dim(authorityDecision.reason)}`);
    console.log(colors.dim('  AI ช่วยเตรียมข้อมูล ร่างเอกสาร หรือ checklist ก่อนส่งให้ผู้มีอำนาจได้ แต่ไม่อนุมัติ ตัดสิน หรือกดดำเนินการแทน'));
    return;
  }

  if (routingMode === 'ESCALATE' || routingMode === 'UNAVAILABLE') {
    console.log(routingMode === 'ESCALATE'
      ? `ต้องส่งต่อ/ยืนยันก่อนดำเนินงาน: ${scopeResult.targetSkill || 'ผู้รับผิดชอบ'}`
      : 'ยังเปิดใช้งานไม่ได้: อ่าน Skill ไม่ได้หรือไม่มี path');
    if (scopeResult.reason) console.log(scopeResult.reason);
    return;
  }
  if (result.routingContract.readiness.status === 'partial') {
    console.log('⚠️ เอกสารอ้างอิงบังคับยังไม่พร้อม — ช่วยร่าง/ตรวจความครบถ้วนเบื้องต้นได้ แต่ยังรับรองตามระเบียบไม่ได้');
    for (const issue of result.routingContract.readiness.issues) {
      console.log(`  • ${issue.id}: ${issue.availability || issue.type} / ${issue.status || 'unverified'}`);
    }
    console.log('  ให้เจ้าของกระบวนการยืนยันเอกสารฉบับปัจจุบันก่อนตัดสินผลตามระเบียบ\n');
  }

  if (routingMode === 'PLAYBOOK' && selectedPlaybook) {
    console.log(colors.bold(colors.green('┌─────────────────────────────────────────────────────────────────────────────┐')));
    console.log(colors.bold(colors.green('│  🧭 พบงานหลายขั้น — จัดเป็นแผนงานต่อเนื่องให้แล้ว                          │')));
    console.log(colors.bold(colors.green('└─────────────────────────────────────────────────────────────────────────────┘')));
    console.log(`  • แผนงาน:           ${colors.bold(colors.cyan(selectedPlaybook.name))}`);
    console.log(`  • ทีมเจ้าของ Flow:   ${colors.bold(teamInfo.name)} (${teamInfo.id.toUpperCase()})`);
    console.log('  • ขั้นตอน:');
    playbookPlan.forEach((step) => {
      const kind = step.type === 'skill' ? 'วิเคราะห์/เตรียมงาน' : 'ลงมือสร้างผลลัพธ์';
      console.log(`    ${step.order}. ${step.description || step.id} [${kind}]`);
    });
    console.log();
    console.log(colors.dim('  ระบบควรทำทีละขั้น และส่งเฉพาะผลลัพธ์ที่จำเป็นไปขั้นถัดไป ไม่โหลดทุกทักษะพร้อมกัน'));

    if (scopeResult.status === 'BLOCK') {
      console.log();
      console.log(colors.bold(colors.red('⚠️  มีขั้นตอนที่ต้องให้ผู้มีอำนาจตัดสินใจ:')));
      console.log(`  • ขั้นตอน:            ${scopeResult.playbookStep || '-'}`);
      console.log(`  • ผู้มีอำนาจ:         ${colors.bold(scopeResult.targetRole || 'Authorized Human')}`);
      if (scopeResult.authority) console.log(`  • Authority:          ${colors.dim(scopeResult.authority)}`);
      console.log(`  • คำแนะนำ:            ${colors.dim(scopeResult.reason)}`);
    }

    console.log();
    // Terminal output is a log too, so suggested prompts carry the scanned text, not the raw request.
  console.log(colors.cyan(`   "${result.query}"`));
    console.log(colors.dim('   CLI นี้แสดงแผนเท่านั้น ยังไม่ได้เรียก tool หรือสร้าง run state; host integration ต้องเรียก API และผ่าน action gate แยกต่างหาก\n'));
    return;
  }

  if (clarification) {
    console.log(colors.bold(clarification.question));
    for (const [index, option] of (clarification.options || []).entries()) {
      console.log(`  ${index + 1}. ${option.label}`);
    }
    console.log(colors.dim('ตอบเพิ่มได้ตามงานจริง แล้วผมจะช่วยต่อจากคำขอเดิมครับ'));
    return;
  }

  if (!selectedSkill && scopeResult.status === 'ESCALATE') {
    console.log(colors.bold('งานนี้มีขั้นตอนที่ต้องยืนยันหรือส่งต่อก่อนดำเนินการครับ'));
    console.log(colors.dim(scopeResult.reason));
    return;
  }

  const isMatched = selectedSkill && (bestMatch.score >= 0.20 || bestMatch.breakdown.keyword > 0);
  if (!isMatched) {
    warn('ไม่พบทักษะเฉพาะทางที่ตรงกับคำถามอย่างชัดเจน');
    console.log(colors.dim('ลองเพิ่มกริยางานหรือสิ่งที่ต้องการให้ทำ เช่น ตรวจ, เขียน, กรอก, สรุป, วางแผน พร้อมเอกสาร/บริบทที่เกี่ยวข้อง ระบบจะยังคงตรวจ Authority และ Guardrails ก่อนดำเนินการ'));
    return;
  }

  // Display Friendly Result Card
  console.log(colors.bold(colors.green('┌─────────────────────────────────────────────────────────────────────────────┐')));
  console.log(colors.bold(colors.green('│  🎯 ทักษะที่แนะนำสำหรับงานนี้                                               │')));
  console.log(colors.bold(colors.green('└─────────────────────────────────────────────────────────────────────────────┘')));
  console.log(`  • ทักษะ (Skill):   ${colors.bold(colors.cyan(selectedSkill.name))} (${selectedSkill.description})`);
  console.log(`  • ความมั่นใจ:      ${colors.bold(routingConfidence.tier)} · Match score ${Math.round(bestMatch.score * 100)}% (${routingConfidence.reason})`);
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
  // Terminal output is a log too, so suggested prompts carry the scanned text, not the raw request.
  console.log(colors.cyan(`   "${result.query}"`));
  console.log(colors.dim('   (ใช้ทักษะ ') + colors.bold(selectedSkill.name) + colors.dim(' เพื่อช่วยเตรียมงานตามแหล่งอ้างอิงที่ตรวจได้ ให้ผู้รับผิดชอบตรวจผลก่อนใช้จริง)\n'));
}
