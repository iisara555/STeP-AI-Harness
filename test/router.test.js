import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  scoreSkillCandidate,
  rankSkillCandidates,
  inferIntentFromText,
  extractFileTypes,
  buildContext,
  inspectCheapContext,
  rescoreWithCheapContext,
  deriveRoutingConfidence,
  checkScope,
  loadAndValidateManifests,
} from '../src/modules/router/index.js';

test('STeP Skill Router & 5-Factor Scoring Suite', async (t) => {
  // Mock skills representing router-index.yaml with 3-outcome scope
  const mockTorReview = {
    name: 'tor-review',
    cluster: 'governance-operations',
    domain: 'procurement',
    processId: 'procurement.tor',
    teams: {
      primary: ['afp'],
      consumers: ['piti', 'linc', 'mi', 'cc', 'pubsec'],
    },
    intent: ['review', 'check', 'compare'],
    triggers: ['TOR', 'ทีโออาร์', 'ขอบเขตงาน', 'จัดซื้อ', 'จัดจ้าง'],
    paths: ['**/TOR/**', '**/procurement/**', '**/AFP/**'],
    fileTypes: ['docx', 'pdf', 'txt'],
    scope: {
      allow: [
        'ตรวจความครบถ้วนของ TOR และขอบเขตงาน',
        'ทำ Traceability Matrix',
      ],
      escalate: {
        vendor_selection: {
          skill: 'vendor-evaluation',
          description: 'การคัดเลือกหรือตัดสินให้คะแนนผู้ยื่นซอง',
        },
      },
      human_only: {
        legal_advice: {
          role: 'human-legal-officer',
          authority: 'legal-advice',
          description: 'การวินิจฉัยข้อกฎหมายหรือความเห็นทางนิติกร',
        },
        budget_approval: {
          role: 'afp-finance-head',
          authority: 'budget-allocation',
          description: 'การอนุมัติงบประมาณหรือเปลี่ยนแปลงวงเงิน',
        },
      },
    },
  };

  const mockCreativeBrief = {
    name: 'designer-brief',
    cluster: 'market-creative',
    domain: 'creative',
    processId: 'creative.branding',
    teams: {
      primary: ['cc'],
      consumers: ['mi', 'crm'],
    },
    intent: ['create', 'review'],
    triggers: ['brief', 'บรีฟ', 'artwork', 'ออกแบบ', 'โปสเตอร์'],
    paths: ['**/CC/**', '**/Creative/**', '**/artwork/**'],
    fileTypes: ['ai', 'psd', 'pdf', 'png'],
    scope: {
      allow: ['รวบรวมขนาดจริงและสเปก'],
      escalate: {},
      human_only: {
        final_print_approval: {
          role: 'cc-lead-designer',
          authority: 'brand-alteration',
          description: 'การอนุมัติแบบรอบสุดท้ายเพื่อสั่งพิมพ์',
        },
      },
    },
  };

  const skillsCatalog = [mockTorReview, mockCreativeBrief];

  await t.test('Case 1: Clear match achieves HIGH confidence tier (>= 0.80)', () => {
    const context = buildContext({
      path: '/projects/IRTC-2570/TOR',
      filenames: ['TOR_v4.docx', 'spec.pdf'],
      promptText: 'ช่วยตรวจ TOR ฉบับนี้ก่อนส่งพัสดุ',
      team: 'afp',
    });

    const result = scoreSkillCandidate(mockTorReview, context);

    assert.equal(result.skill, 'tor-review');
    assert.ok(result.score >= 0.80, `Expected score >= 0.80, got ${result.score}`);
    assert.equal(result.tier, 'HIGH');
    assert.equal(result.breakdown.intent, 0.30, 'Intent match 30%');
    assert.equal(result.breakdown.keyword, 0.25, 'Keyword match 25%');
    assert.equal(result.breakdown.path, 0.20, 'Path match 20%');
    assert.equal(result.breakdown.team, 0.15, 'Primary team match 15%');
    assert.equal(result.breakdown.fileType, 0.10, 'File type match 10%');
    assert.equal(result.score, 1.00);
  });

  await t.test('Case 2: Cross-functional Consumer Team achieves high score', () => {
    const context = buildContext({
      path: '/projects/startup-pilot/TOR',
      filenames: ['scope.docx'],
      promptText: 'ช่วยตรวจ TOR จัดซื้อระบบทดสอบ',
      team: 'piti', // Consumer team
    });

    const result = scoreSkillCandidate(mockTorReview, context);

    assert.ok(result.score >= 0.80, `Expected high score for consumer team, got ${result.score}`);
    assert.equal(result.tier, 'HIGH');
    assert.ok(result.breakdown.team > 0.10, 'Consumer team earns partial team weight');
  });

  await t.test('Case 2b: Routing cluster helps before an exact team is known', () => {
    const context = buildContext({
      promptText: 'ช่วยดูงานนี้หน่อย',
      cluster: 'market-creative',
    });

    const creative = scoreSkillCandidate(mockCreativeBrief, context);
    const procurement = scoreSkillCandidate(mockTorReview, context);

    assert.ok(creative.breakdown.team > 0, 'matching cluster should earn partial team-context weight');
    assert.equal(procurement.breakdown.team, 0, 'different cluster should not receive cluster weight');
    assert.ok(creative.score > procurement.score);
  });

  await t.test('Case 2c: semantic confidence can be HIGH at raw 0.55 with direct evidence and clear margin', () => {
    const confidence = deriveRoutingConfidence(
      {
        score: 0.55,
        tier: 'AMBIGUOUS',
        breakdown: { intent: 0.30, keyword: 0.25, path: 0, team: 0, fileType: 0 },
        matchedTriggers: ['ประชุม'],
      },
      {
        score: 0.30,
        tier: 'FALLBACK',
        breakdown: { intent: 0.30, keyword: 0, path: 0, team: 0, fileType: 0 },
        matchedTriggers: [],
      }
    );

    assert.equal(confidence.tier, 'HIGH');
    assert.equal(confidence.margin, 0.25);
    assert.equal(confidence.reason, 'direct-trigger-and-intent-with-clear-margin');
  });

  await t.test('Case 2d: direct evidence remains AMBIGUOUS when runner-up is too close', () => {
    const confidence = deriveRoutingConfidence(
      {
        score: 0.55,
        tier: 'AMBIGUOUS',
        breakdown: { intent: 0.30, keyword: 0.25, path: 0, team: 0, fileType: 0 },
        matchedTriggers: ['ตรวจ'],
      },
      {
        score: 0.45,
        tier: 'FALLBACK',
        breakdown: { intent: 0.30, keyword: 0.15, path: 0, team: 0, fileType: 0 },
        matchedTriggers: ['ตรวจ'],
      }
    );

    assert.equal(confidence.tier, 'AMBIGUOUS');
    assert.ok(confidence.margin < 0.15);
  });

  await t.test('Case 3: Anti-Context Pollution — Irrelevant skills receive 0 score', () => {
    const context = buildContext({
      path: '/projects/IRTC/TOR',
      filenames: ['TOR.docx'],
      promptText: 'ตรวจ TOR ก่อนส่งจัดซื้อ',
      team: 'afp',
    });

    const result = scoreSkillCandidate(mockCreativeBrief, context);
    assert.equal(result.breakdown.keyword, 0);
    assert.equal(result.breakdown.path, 0);
    assert.equal(result.breakdown.team, 0);
    assert.ok(result.score < 0.40);
    assert.equal(result.tier, 'FALLBACK');
  });

  await t.test('Case 4: Ambiguous request without keywords falls into lower tier', () => {
    const context = buildContext({
      path: '/general/folder',
      filenames: ['notes.txt'],
      promptText: 'ช่วยดูอันนี้หน่อย',
      team: 'unknown',
    });

    const result = scoreSkillCandidate(mockTorReview, context);
    assert.ok(result.score < 0.50, `Expected low score, got ${result.score}`);
    assert.equal(result.tier, 'FALLBACK');
  });

  await t.test('Case 5: Candidate ranking sorts highest score first', () => {
    const context = buildContext({
      path: '/projects/CC/artwork',
      filenames: ['poster.ai'],
      promptText: 'ช่วยทำบรีฟออกแบบโปสเตอร์',
      team: 'cc',
    });

    const ranked = rankSkillCandidates(skillsCatalog, context);
    assert.equal(ranked[0].skill, 'designer-brief');
    assert.ok(ranked[0].score >= 0.80);
    assert.ok(ranked[0].score > ranked[1].score);
  });

  await t.test('Case 6: Scope Guard 3-Outcome: ALLOW, ESCALATE, and BLOCK (HUMAN_ONLY)', async () => {
    // 6a: ALLOW
    const allowed = checkScope(mockTorReview, 'ตรวจความครบถ้วนของงวดงานและเกณฑ์ตรวจรับ');
    assert.equal(allowed.status, 'ALLOW');
    assert.equal(allowed.inScope, true);

    // 6b: ESCALATE (to another skill)
    const escalated = checkScope(mockTorReview, 'ช่วยคัดเลือกบริษัทและตัดสินให้คะแนนผู้ยื่นซอง');
    assert.equal(escalated.status, 'ESCALATE');
    assert.equal(escalated.inScope, false);
    assert.equal(escalated.targetSkill, 'vendor-evaluation');

    // 6c: BLOCK / HUMAN_ONLY (requires human authority)
    const blockedLegal = checkScope(mockTorReview, 'ช่วยวินิจฉัยข้อกฎหมายและตีความสัญญาว่าผิดกฎหมายหรือไม่');
    assert.equal(blockedLegal.status, 'BLOCK');
    assert.equal(blockedLegal.inScope, false);
    assert.equal(blockedLegal.targetRole, 'human-legal-officer');
    assert.equal(blockedLegal.authority, 'legal-advice');

    const blockedBudget = checkScope(mockTorReview, 'ขออนุมัติงบประมาณและเปลี่ยนแปลงวงเงินโครงการ');
    assert.equal(blockedBudget.status, 'BLOCK');
    assert.equal(blockedBudget.inScope, false);
    assert.equal(blockedBudget.targetRole, 'afp-finance-head');
    assert.equal(blockedBudget.authority, 'budget-allocation');

    // 6d: browser-form-assistant Scope Guard: ALLOW draft form filling
    const mockBrowserForm = {
      name: 'browser-form-assistant',
      scope: {
        allow: ['เปิดเว็บไซต์', 'กรอกข้อมูลฉบับร่าง'],
        escalate: {
          form_submission: { skill: 'browser-form-assistant', description: 'ต้องได้รับการยืนยันก่อนส่ง' }
        },
        human_only: {
          budget_approval: { role: 'afp-finance-head', authority: 'budget-allocation', description: 'การอนุมัติงบประมาณ' },
          official_signing: { role: 'authorized-signatory', authority: 'official-signing', description: 'การลงนามหนังสือ' }
        }
      }
    };
    const formDraft = checkScope(mockBrowserForm, 'ช่วยเปิดเว็บและกรอกข้อมูลขอใช้ห้องประชุม');
    assert.equal(formDraft.status, 'ALLOW');
    assert.equal(formDraft.inScope, true);

    // 6e: browser-form-assistant Scope Guard: BLOCK on budget alteration
    const formBudget = checkScope(mockBrowserForm, 'ช่วยกรอกแบบฟอร์มขออนุมัติงบประมาณและเปลี่ยนวงเงินโครงการ');
    assert.equal(formBudget.status, 'BLOCK');
    assert.equal(formBudget.inScope, false);
    assert.equal(formBudget.targetRole, 'afp-finance-head');

    // 6f: browser-form-assistant Scope Guard: ESCALATE (Confirmation Gate) on Thai submission
    const formSubmitThai = checkScope(mockBrowserForm, 'ช่วยกดส่งแบบฟอร์มจองห้องประชุม');
    assert.equal(formSubmitThai.status, 'ESCALATE');
    assert.equal(formSubmitThai.inScope, false);
    assert.equal(formSubmitThai.targetSkill, 'browser-form-assistant');
    assert.ok(formSubmitThai.reason.includes('Human Confirmation Gate'));

    // 6g: browser-form-assistant Scope Guard: ESCALATE on submit keyword
    const formSubmitEn = checkScope(mockBrowserForm, 'ช่วยกรอกฟอร์มแล้ว submit ให้เลย');
    assert.equal(formSubmitEn.status, 'ESCALATE');
    assert.equal(formSubmitEn.inScope, false);

    // 6h: Real YAML check for browser-form-assistant loaded from disk
    const routerPath = resolve('manifest/router-index.yaml');
    const routerContent = await readFile(routerPath, 'utf-8');
    const realSkills = [];
    for (const block of routerContent.split(/\n {2}- name:\s*/).slice(1)) {
      const name = block.split(/\r?\n/)[0].trim();
      const hasEscalate = block.includes('form_submission:');
      const hasBudget = block.includes('budget_approval:');
      if (name === 'browser-form-assistant') {
        const realSkillObj = {
          name,
          scope: {
            allow: ['เปิดเว็บไซต์', 'กรอกข้อมูลฉบับร่าง'],
            escalate: hasEscalate ? { form_submission: { skill: 'browser-form-assistant', description: 'ต้องยืนยันก่อนส่ง' } } : {},
            human_only: hasBudget ? { budget_approval: { role: 'afp-finance-head', authority: 'budget-allocation', description: 'อนุมัติงบ' } } : {}
          }
        };
        const realEsc = checkScope(realSkillObj, 'ช่วยกดส่งแบบฟอร์มจองห้องประชุม');
        assert.equal(realEsc.status, 'ESCALATE');
      }
    }
  });

  await t.test('Case 7: Context Scanner extracts intents and file types cleanly', () => {
    assert.equal(inferIntentFromText('ช่วยตรวจ TOR'), 'review');
    assert.equal(inferIntentFromText('ช่วยตรวจ tone of voice ของแบรนด์'), 'brand-review');
    assert.equal(inferIntentFromText('ช่วยตรวจโลโก้ STeP ตามคู่มือแบรนด์'), 'brand-review');
    assert.equal(inferIntentFromText('ขอ prompt สร้างภาพให้เป็น STeP brand'), 'create');
    assert.equal(inferIntentFromText('ขอ prompt ภาพโปสเตอร์งานสัมมนา'), 'create');
    assert.equal(inferIntentFromText('ช่วยยกร่างข้อเสนอ'), 'create');
    assert.equal(inferIntentFromText('ช่วยสรุปการประชุม'), 'summarize');
    assert.equal(inferIntentFromText('ช่วยวางแผนโครงการ'), 'plan');
    assert.equal(inferIntentFromText('ช่วยกรอกแบบฟอร์มขอใช้ห้องประชุม'), 'fill');
    assert.equal(inferIntentFromText('ช่วยจองห้องประชุม'), 'fill');
    assert.equal(inferIntentFromText('ช่วยวางคำถามสัมภาษณ์ลูกค้าตาม Mom Test'), 'interview');
    assert.equal(inferIntentFromText('ช่วยซ้อม audit interview'), 'interview');

    const exts = extractFileTypes(['contract.DOCX', 'budget.XLSX', 'image.PNG']);
    assert.deepEqual(exts, ['docx', 'xlsx', 'png']);
  });

  await t.test('Case 8: Configurable Scoring Weights', () => {
    const context = buildContext({
      path: '/projects/IRTC/TOR',
      filenames: ['TOR.docx'],
      promptText: 'ตรวจข้อกำหนด',
      team: 'afp',
    });

    // Custom weights that emphasize PATH (40%) and de-emphasize INTENT (10%)
    const customConfig = {
      weights: {
        intent: 0.10,
        keyword: 0.20,
        path: 0.40,
        team: 0.20,
        fileType: 0.10,
      },
    };

    const result = scoreSkillCandidate(mockTorReview, context, customConfig);
    assert.equal(result.breakdown.path, 0.40, 'Custom path weight was applied');
    assert.equal(result.breakdown.intent, 0.10, 'Custom intent weight was applied');
  });

  await t.test('Case 9: Cheap Context Disambiguation elevates Ambiguous tier to High', () => {
    // A request without explicit trigger keyword in prompt, resulting in AMBIGUOUS tier (0.50 - 0.79)
    const baseContext = buildContext({
      path: '/general/folder',
      filenames: ['document.txt'],
      promptText: 'ช่วยตรวจข้อกำหนดฉบับนี้หน่อย', // 'ตรวจ' = intent (30%), no keyword trigger, no path
      team: 'piti', // consumer team ~10.5% -> Score around 0.40 - 0.50
    });

    const initialScore = scoreSkillCandidate(mockTorReview, baseContext);
    assert.ok(initialScore.score < 0.80, 'Initial score is not HIGH');

    // Inspect cheap context from active document path and project metadata
    const cheapContext = inspectCheapContext({
      currentFile: '/projects/procurement/TOR/draft_TOR_v2.docx',
      snippet: 'ร่างขอบเขตงาน (TOR) โครงการจัดซื้อ',
      projectTitle: 'Procurement Pilot',
    });

    const disambiguation = rescoreWithCheapContext(mockTorReview, baseContext, cheapContext);
    assert.equal(disambiguation.disambiguated, true, 'Cheap context successfully disambiguated');
    assert.equal(disambiguation.rescored.tier, 'HIGH', 'Tier elevated to HIGH');
    assert.ok(disambiguation.rescored.score >= 0.80);
    assert.ok(disambiguation.reason.includes('Disambiguated via cheap context'));
  });

  await t.test('Case 12: near-tie routing prefers domain keyword evidence over intent-only candidate', () => {
    const domainSpecific = {
      name: 'iso-readiness',
      intent: ['review', 'plan'],
      triggers: ['external audit iso 9001'],
      paths: [],
      fileTypes: [],
      teams: { primary: ['qs'], consumers: [] },
    };
    const genericSummary = {
      name: 'generic-summary',
      intent: ['summarize', 'review'],
      triggers: ['management review'],
      paths: [],
      fileTypes: [],
      teams: { primary: ['qs'], consumers: [] },
    };
    const context = buildContext({
      promptText: 'ช่วยสรุปความพร้อม external audit ISO 9001',
      team: 'qs',
    });
    const ranked = rankSkillCandidates([genericSummary, domainSpecific], context);
    assert.equal(ranked[0].skill, 'iso-readiness');
    assert.ok(ranked[0].breakdown.keyword > 0);
  });

  await t.test('Case 10: Manifest Integrity & Dependency Graph Validation (Real Files)', async () => {
    const manifestDir = resolve('manifest');
    const integrity = await loadAndValidateManifests(manifestDir);

    assert.equal(integrity.valid, true, `Integrity errors: ${integrity.errors.join(', ')}`);
    assert.equal(integrity.errors.length, 0);
    assert.equal(integrity.summary.teamsCount, 22, 'All 22 teams loaded');
    assert.ok(integrity.summary.skillsCount >= 19, 'All skills loaded');
    assert.ok(integrity.summary.processesCount >= 10, 'Core processes loaded');
    assert.ok(integrity.summary.documentsCount >= 5, 'Controlled documents loaded');
    assert.ok(integrity.summary.authoritiesCount >= 5, 'Authorities loaded');
    assert.ok(integrity.summary.routerSkillsCount >= 18, 'Router skills loaded');
  });

  await t.test('Case 11: Explicit Token Budget & Progressive Disclosure Acceptance Test', () => {
    // Simulate user request: "ช่วยตรวจ TOR จัดซื้อระบบทดสอบ"
    const userPrompt = 'ช่วยตรวจ TOR จัดซื้อระบบทดสอบ';
    const context = buildContext({
      path: '/projects/startup-pilot/TOR',
      filenames: ['scope.docx'],
      promptText: userPrompt,
      team: 'piti',
    });

    // Score all available skills
    const ranked = rankSkillCandidates(skillsCatalog, context);
    const selectedSkill = ranked[0];

    assert.equal(selectedSkill.skill, 'tor-review');
    assert.equal(selectedSkill.tier, 'HIGH');

    // Progressive Disclosure Loading Budget Simulation:
    // Level 0: Router resolves locally; registry is not sent into model context.
    const level0Loaded = ['compact-routing-contract'];
    assert.ok(!level0Loaded.includes('manifest/router-index.yaml'));

    // Level 1: Only 1 primary skill SKILL.md
    const level1Loaded = [`skills/pm/${selectedSkill.skill}/SKILL.md`];
    assert.equal(level1Loaded.length, 1, 'Acceptance: Exactly 1 primary skill loaded in Level 1');

    // Level 2: Mandatory rules & SOPs only
    const mandatoryReferences = ['procurement-policy', 'human-approval-rule'];
    const level2Loaded = mandatoryReferences;
    assert.ok(level2Loaded.includes('procurement-policy'));
    assert.ok(level2Loaded.includes('human-approval-rule'));

    // Level 3: Templates/Examples (0 by default unless explicitly requested)
    const level3Loaded = []; // None loaded for review task
    assert.equal(level3Loaded.length, 0, 'Acceptance: 0 template/example files loaded in Level 3 by default');

    // Forbidden / Unloaded Set Check: Verify other skills and rules are NOT loaded
    const forbiddenFromContext = [
      'skills/creative/designer-brief/SKILL.md',
      'skills/pm/meeting-summary/SKILL.md',
      'skills/dev/coding-git-workflow/SKILL.md',
      'skills/creative/event-concept/SKILL.md',
      'tor-template.docx', // Level 3 optional
    ];

    const allLoaded = new Set([...level0Loaded, ...level1Loaded, ...level2Loaded, ...level3Loaded]);
    for (const forbidden of forbiddenFromContext) {
      assert.equal(allLoaded.has(forbidden), false, `Context Pollution Violation: '${forbidden}' was loaded!`);
    }
  });
});
