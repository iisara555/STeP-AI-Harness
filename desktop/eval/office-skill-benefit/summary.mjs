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
