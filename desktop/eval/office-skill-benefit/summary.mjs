export function safeSummary(report) {
  const safeModel = value => (typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value) ? value : 'unknown');
  const safeCode = value => (typeof value === 'string' && /^[A-Z_]{1,100}$/.test(value) ? value : undefined);
  const number = value => (Number.isFinite(value) && value >= 0 ? value : 0);
  return {
    kind: 'small-paired-live-office-eval',
    synthetic: true,
    modelBenefitEstablished: false,
    source: {
      head: /^[a-f0-9]{40,64}$/.test(report.source?.head || '') ? report.source.head : 'unknown',
      trackedChanges: report.source?.trackedChanges ?? null,
    },
    liveEvaluationComplete: report.liveEvaluationComplete === true,
    newModelCalls: number(report.totalModelCalls),
    cumulativeAdmittedCalls: Object.fromEntries(
      Object.entries(report.cumulativeAdmittedCalls || {}).map(([m, n]) => [safeModel(m), number(n)]),
    ),
    pairs: pairedEvidence(report.trials || []),
    trials: (report.trials || []).map(t => ({
      model: safeModel(t.model),
      task: ['xlsx', 'pptx', 'memo'].includes(t.task) ? t.task : 'unknown',
      arm: ['with-skill', 'without-skill'].includes(t.arm) ? t.arm : 'unknown',
      status: ['review', 'failed', 'cancelled', 'interrupted', 'idle'].includes(t.status) ? t.status : 'unknown',
      code: safeCode(t.code),
      modelCalls: number(t.modelCalls),
      resumed: t.resumed === true,
      artifactVerified: typeof t.verified?.artifactVerified === 'boolean' ? t.verified.artifactVerified : null,
      memoChecks:
        t.task === 'memo'
          ? {
              pendingFacts: t.verified?.checks?.pendingFacts === true,
              comparesChoices: t.verified?.checks?.comparesChoices === true,
              readerEvidence: t.verified?.checks?.readerEvidence === true,
            }
          : undefined,
      durationMs: Number.isFinite(t.durationMs) ? number(t.durationMs) : undefined,
    })),
    limitations: [
      'One paired task sample per model; no statistical quality guarantee.',
      'Memo semantic review, Excel recalculation and PowerPoint visual review are not automated acceptance.',
      'Earlier token usage is not measured; explicit prior-call reservations remain in the budget.',
    ],
  };
}

// Comparisons require the same prompt, sources, tool host, model/configuration and runner fingerprint.
// A failed arm or an old ledger without that fingerprint remains visible but cannot establish a paired outcome.
function pairedEvidence(trials) {
  const groups = new Map();
  for (const trial of trials) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(trial.model || '') || !['xlsx', 'pptx', 'memo'].includes(trial.task)) continue;
    const key = JSON.stringify([trial.model, trial.task]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trial);
  }
  const armSummary = t =>
    t
      ? {
          status: ['review', 'failed', 'cancelled', 'interrupted', 'idle'].includes(t.status) ? t.status : 'unknown',
          code: /^[A-Z_]{1,100}$/.test(t.code || '') ? t.code : undefined,
          artifactVerified: typeof t.verified?.artifactVerified === 'boolean' ? t.verified.artifactVerified : null,
          modelCalls: Number.isSafeInteger(t.modelCalls) && t.modelCalls >= 0 ? t.modelCalls : null,
          durationMs: Number.isFinite(t.durationMs) && t.durationMs >= 0 ? t.durationMs : null,
          resumed: t.resumed === true,
        }
      : null;
  return [...groups.values()].map(rows => {
    const withRows = rows.filter(t => t.arm === 'with-skill'),
      withoutRows = rows.filter(t => t.arm === 'without-skill');
    const a = withRows[0],
      b = withoutRows[0];
    const contextMatches =
      withRows.length === 1 &&
      withoutRows.length === 1 &&
      /^[a-f0-9]{64}$/.test(a.comparisonKey || '') &&
      a.comparisonKey === b.comparisonKey &&
      a.contextCurrent !== false &&
      b.contextCurrent !== false;
    const completed = contextMatches && a.status === 'review' && b.status === 'review' && !a.code && !b.code;
    let outcome = 'incomplete';
    if (completed && rows[0].task === 'memo') outcome = 'requires-human-review';
    else if (completed && typeof a.verified?.artifactVerified === 'boolean' && typeof b.verified?.artifactVerified === 'boolean') {
      outcome = a.verified.artifactVerified
        ? b.verified.artifactVerified
          ? 'both'
          : 'with-only'
        : b.verified.artifactVerified
          ? 'without-only'
          : 'neither';
    }
    return { model: rows[0].model, task: rows[0].task, outcome, contextMatches, withSkill: armSummary(a), withoutSkill: armSummary(b) };
  });
}

export function summaryMarkdown(report) {
  const summary = safeSummary(report);
  const outcomes = {
    'with-only': 'มี Skill: ไฟล์ผ่าน / ไม่มี Skill: ไฟล์ไม่ผ่าน',
    'without-only': 'ไม่มี Skill: ไฟล์ผ่าน / มี Skill: ไฟล์ไม่ผ่าน',
    both: 'ไฟล์ผ่านทั้งสองแบบ',
    neither: 'ไฟล์ไม่ผ่านทั้งสองแบบ',
    incomplete: 'เปรียบเทียบไม่ได้: ผลไม่ครบ ล้มเหลว หรือบริบทต่างกัน',
    'requires-human-review': 'รอคนตรวจคุณภาพเนื้อหาทั้งสองแบบ',
  };
  const tasks = { xlsx: 'Excel', pptx: 'PowerPoint', memo: 'บันทึกเสนอทางเลือก' };
  const rows = summary.pairs.map(p => `| ${p.model} | ${tasks[p.task]} | ${outcomes[p.outcome]} |`);
  return [
    '# ผลเปรียบเทียบแบบมี / ไม่มี Skill',
    '',
    'ใช้โจทย์สังเคราะห์เดียวกัน เครื่องมือและโมเดลเดียวกัน เปลี่ยนเฉพาะ Skill และเอกสารอ้างอิงที่ Skill ต้องใช้',
    '',
    '| โมเดล | งาน | ผลที่ตรวจได้ |',
    '|---|---|---|',
    ...rows,
    ...(rows.length ? [] : ['| — | — | ยังไม่มีผลคู่ที่นำมาเปรียบเทียบได้ |']),
    '',
    'ผลไฟล์ผ่านหมายถึงผ่านรายการตรวจของโจทย์นี้ ไม่ยืนยันหน้าตาใน Word/PowerPoint หรือการคำนวณสูตรใน Excel',
    'บันทึกเสนอทางเลือกต้องให้คนตรวจความหมาย ไม่ใช้การพบคำหรือจำนวนเป็นหลักฐานว่าคำตอบถูกต้อง',
    'หนึ่งคู่ต่อโจทย์และโมเดลยังไม่พิสูจน์ว่า Skill ช่วยโดยทั่วไป และไม่รับรองเอกสารจริง',
    'ดู summary.json สำหรับสถานะและรหัสข้อผิดพลาด; รายงานนี้ไม่แสดงคำตอบ เอกสาร ชื่อบัญชี หรือ credentials',
    'ผลจาก ledger รุ่นเก่าหรือบริบทไม่ตรงกันจะไม่ถูกนับเป็นผลเปรียบเทียบ',
    '',
  ].join('\n');
}
