/**
 * Scope Guard for STeP Skill Router
 * 
 * Formalizes 3 distinct governance outcomes:
 * 1. ALLOW: Task is within skill boundary, AI may proceed.
 * 2. ESCALATE: Task belongs to another domain skill, delegate to target skill.
 * 3. BLOCK (HUMAN_ONLY): Task requires human approval/authority (e.g. procurement signing, budget changes).
 */

/**
 * Check request text against skill scope guard
 * @param {object} skill Skill metadata
 * @param {string} requestText User prompt or task description
 * @returns {{
 *   status: 'ALLOW' | 'ESCALATE' | 'BLOCK',
 *   inScope: boolean,
 *   ruleKey?: string,
 *   targetSkill?: string,
 *   targetRole?: string,
 *   authority?: string,
 *   reason?: string
 * }}
 */
export function checkScope(skill, requestText = '') {
  if (!skill || !skill.scope) {
    return { status: 'ALLOW', inScope: true };
  }

  const { scope } = skill;
  const lower = requestText.toLowerCase();

  // Helper matcher for trigger words
  const matchTrigger = (key, desc) => {
    const keyParts = key.split('_');
    const descMatch = desc && lower.includes(desc.toLowerCase());
    const keyMatch = keyParts.some((kw) => kw.length > 3 && lower.includes(kw));

    let heuristic = descMatch || keyMatch;
    if (key.includes('legal') && (lower.includes('กฎหมาย') || lower.includes('ฟ้องร้อง') || lower.includes('ข้อพิพาท'))) heuristic = true;
    if (key.includes('budget') && (lower.includes('อนุมัติงบ') || lower.includes('เปลี่ยนวงเงิน') || lower.includes('ขอเงินเพิ่ม'))) heuristic = true;
    if (key.includes('vendor') && (lower.includes('เลือกบริษัท') || lower.includes('เจ้าไหนดี') || lower.includes('ให้คะแนนซอง') || lower.includes('ตัดสินผู้ชนะ'))) heuristic = true;
    if (key.includes('sign') && (lower.includes('ลงนาม') || lower.includes('เซ็นอนุมัติ') || lower.includes('ออกเลขหนังสือ'))) heuristic = true;
    if ((key.includes('submit') || key.includes('submission')) && (lower.includes('กดส่ง') || lower.includes('ส่งฟอร์ม') || lower.includes('ยืนยันส่ง') || lower.includes('ส่งให้เลย') || lower.includes('กดยืนยัน') || lower.includes('submit'))) heuristic = true;

    return heuristic;
  };

  // 1. Check HUMAN_ONLY / BLOCK constraints
  if (scope.human_only && typeof scope.human_only === 'object') {
    for (const [ruleKey, conf] of Object.entries(scope.human_only)) {
      const desc = typeof conf === 'string' ? conf : conf.description || '';
      if (matchTrigger(ruleKey, desc)) {
        const targetRole = typeof conf === 'object' ? conf.role : 'authorized-officer';
        const authority = typeof conf === 'object' ? conf.authority : 'human-approval';
        return {
          status: 'BLOCK',
          inScope: false,
          ruleKey,
          targetRole,
          authority,
          reason: `คำขอนี้ต้องการอำนาจตัดสินใจจากบุคคล (${targetRole}) ตามระเบียบ ${authority}: ${desc}`,
        };
      }
    }
  }

  // 2. Check ESCALATE constraints
  if (scope.escalate && typeof scope.escalate === 'object') {
    for (const [ruleKey, conf] of Object.entries(scope.escalate)) {
      const desc = typeof conf === 'string' ? conf : conf.description || '';
      if (matchTrigger(ruleKey, desc)) {
        const targetSkill = typeof conf === 'object' ? conf.skill : conf;
        const isSelf = targetSkill === skill.name || conf.confirmation;
        if (isSelf) {
          return {
            status: 'ESCALATE',
            inScope: false,
            ruleKey,
            targetSkill: skill.name,
            reason: `การส่งฟอร์มต้องได้รับการยืนยันจากผู้ใช้ก่อนดำเนินการ (Human Confirmation Gate): ${desc}`,
          };
        }
        return {
          status: 'ESCALATE',
          inScope: false,
          ruleKey,
          targetSkill,
          reason: `คำขอนี้อยู่นอกขอบเขตของ ${skill.name} แต่สามารถส่งต่อให้ทักษะ [${targetSkill}] ดำเนินการต่อได้ (${desc})`,
        };
      }
    }
  }

  // 3. Backward Compatibility with legacy `excludes` and `escalate_to`
  if (scope.excludes && typeof scope.excludes === 'object') {
    for (const [key, desc] of Object.entries(scope.excludes)) {
      if (matchTrigger(key, desc)) {
        const escalateTarget = scope.escalate_to?.[key] || 'human-task-owner';
        const isHumanRole = escalateTarget.includes('human') || escalateTarget.includes('committee') || escalateTarget.includes('director') || escalateTarget.includes('head');

        if (isHumanRole) {
          return {
            status: 'BLOCK',
            inScope: false,
            ruleKey: key,
            targetRole: escalateTarget,
            reason: `คำขอนี้อยู่นอกเหนือขอบเขตของทักษะ ${skill.name} (${desc}) และต้องได้รับการอนุมัติจาก ${escalateTarget}`,
          };
        }

        return {
          status: 'ESCALATE',
          inScope: false,
          ruleKey: key,
          targetSkill: escalateTarget,
          reason: `คำขอนี้อยู่นอกเหนือขอบเขตของทักษะ ${skill.name} (${desc}) กรุณาส่งต่อไปยัง ${escalateTarget}`,
        };
      }
    }
  }

  return { status: 'ALLOW', inScope: true };
}
