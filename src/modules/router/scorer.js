/**
 * 5-Factor Deterministic Scoring Engine for STeP Skill Router
 * 
 * Default Score Formula:
 * - Intent Match:    30% (0.30)
 * - Keyword Match:   25% (0.25)
 * - Path Match:      20% (0.20)
 * - Team Context:    15% (0.15)
 * - File Type Match: 10% (0.10)
 * Total: 1.00 (100%)
 * 
 * All weights and thresholds are configurable via router-index.yaml
 */

export const DEFAULT_WEIGHTS = {
  INTENT: 0.30,
  KEYWORD: 0.25,
  PATH: 0.20,
  TEAM: 0.15,
  FILE_TYPE: 0.10,
};

export const DEFAULT_THRESHOLDS = {
  HIGH: 0.80,
  AMBIGUOUS: 0.50,
};

// Aliases for backward compatibility
export const WEIGHTS = DEFAULT_WEIGHTS;
export const THRESHOLDS = DEFAULT_THRESHOLDS;

/**
 * Normalize configurable weights object to standard uppercase keys
 * @param {object} customWeights
 * @returns {typeof DEFAULT_WEIGHTS}
 */
export function resolveWeights(customWeights = {}) {
  return {
    INTENT: customWeights.intent ?? customWeights.INTENT ?? DEFAULT_WEIGHTS.INTENT,
    KEYWORD: customWeights.keyword ?? customWeights.KEYWORD ?? DEFAULT_WEIGHTS.KEYWORD,
    PATH: customWeights.path ?? customWeights.PATH ?? DEFAULT_WEIGHTS.PATH,
    TEAM: customWeights.team ?? customWeights.TEAM ?? DEFAULT_WEIGHTS.TEAM,
    FILE_TYPE: customWeights.fileType ?? customWeights.FILE_TYPE ?? DEFAULT_WEIGHTS.FILE_TYPE,
  };
}

/**
 * Normalize configurable thresholds object
 * @param {object} customThresholds 
 * @returns {typeof DEFAULT_THRESHOLDS}
 */
export function resolveThresholds(customThresholds = {}) {
  return {
    HIGH: customThresholds.high ?? customThresholds.HIGH ?? DEFAULT_THRESHOLDS.HIGH,
    AMBIGUOUS: customThresholds.ambiguous ?? customThresholds.AMBIGUOUS ?? DEFAULT_THRESHOLDS.AMBIGUOUS,
  };
}

/**
 * Calculate the match score for a single skill candidate against observed context
 * @param {object} skill Skill metadata from router-index.yaml
 * @param {object} context Observed context { intent, text, path, team, fileTypes }
 * @param {object} options Optional configuration { weights, thresholds }
 * @returns {{
 *   skill: string,
 *   score: number,
 *   tier: 'HIGH' | 'AMBIGUOUS' | 'FALLBACK',
 *   breakdown: { intent: number, keyword: number, path: number, team: number, fileType: number }
 * }}
 */
export function scoreSkillCandidate(skill, context = {}, options = {}) {
  const weights = resolveWeights(options.weights);
  const thresholds = resolveThresholds(options.thresholds);

  const {
    intent = '',
    text = '',
    path = '',
    team = '',
    cluster = '',
    fileTypes = [],
  } = context;

  const breakdown = {
    intent: 0,
    keyword: 0,
    path: 0,
    team: 0,
    fileType: 0,
  };

  // 1. Intent Match
  if (intent && Array.isArray(skill.intent)) {
    const normalizedIntent = intent.toLowerCase().trim();
    if (skill.intent.map((i) => i.toLowerCase()).includes(normalizedIntent)) {
      breakdown.intent = weights.INTENT;
    }
  }

  // 2. Keyword / Trigger Match
  const matchedTriggers = [];
  if (text && Array.isArray(skill.triggers)) {
    const lowerText = text.toLowerCase();
    for (const tr of skill.triggers) {
      const lowerTr = tr.toLowerCase().trim();
      if (!lowerTr) continue;
      const isLatin = /^[a-z0-9_\s-]+$/i.test(lowerTr);
      let matched = false;
      if (isLatin) {
        const escaped = lowerTr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\  // 2. Keyword / Trigger Match
  if (text && Array.isArray(skill.triggers)) {
    const lowerText = text.toLowerCase();
    const matchedTrigger = skill.triggers.some((tr) => {
      const lowerTr = tr.toLowerCase().trim();
      if (!lowerTr) return false;
      const isLatin = /^[a-z0-9_\s-]+$/i.test(lowerTr);
      if (isLatin) {
        const escaped = lowerTr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        return regex.test(lowerText);
      }
      return lowerText.includes(lowerTr);
    });
    if (matchedTrigger) {
      breakdown.keyword = weights.KEYWORD;
    }
  }
');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        matched = regex.test(lowerText);
      } else {
        matched = lowerText.includes(lowerTr);
      }
      if (matched) matchedTriggers.push(tr);
    }
    if (matchedTriggers.length > 0) {
      breakdown.keyword = weights.KEYWORD;
    }
  }

  // 3. Path Match
  if (path && Array.isArray(skill.paths)) {
    const normPath = path.toLowerCase().replace(/\\/g, '/');
    const matchedPath = skill.paths.some((p) => {
      const cleaned = p.replace(/\*\*/g, '').replace(/\*/g, '').toLowerCase().replace(/^\/|\/$/g, '');
      return cleaned && normPath.includes(cleaned);
    });
    if (matchedPath) {
      breakdown.path = weights.PATH;
    }
  }

  // 4. Team Context
  if (team && skill.teams) {
    const normTeam = team.toLowerCase().trim();
    const primary = (skill.teams.primary || []).map((t) => t.toLowerCase());
    const consumers = (skill.teams.consumers || []).map((t) => t.toLowerCase());

    if (primary.includes(normTeam)) {
      breakdown.team = weights.TEAM; // Full weight for primary owner team
    } else if (consumers.includes(normTeam) || consumers.includes('*')) {
      breakdown.team = Math.round(weights.TEAM * 0.70 * 1000) / 1000; // 70% weight for consuming team
    }
  }

  // When a team is not known yet, a confirmed 5-cluster choice still narrows routing
  // without forcing the employee to understand the 22-team organization map.
  if (!team && cluster && skill.cluster) {
    const normCluster = cluster.toLowerCase().trim();
    if (String(skill.cluster).toLowerCase().trim() === normCluster) {
      breakdown.team = Math.max(
        breakdown.team,
        Math.round(weights.TEAM * 0.70 * 1000) / 1000
      );
    }
  }

  // 5. File Type Match
  if (fileTypes.length > 0 && Array.isArray(skill.fileTypes)) {
    const supportedTypes = skill.fileTypes.map((ft) => ft.toLowerCase().replace(/^\./, ''));
    const hasMatch = fileTypes.some((ext) => supportedTypes.includes(ext.toLowerCase().replace(/^\./, '')));
    if (hasMatch) {
      breakdown.fileType = weights.FILE_TYPE;
    }
  }

  const rawScore = breakdown.intent + breakdown.keyword + breakdown.path + breakdown.team + breakdown.fileType;
  const score = Math.round(rawScore * 100) / 100;

  let tier = 'FALLBACK';
  if (score >= thresholds.HIGH) {
    tier = 'HIGH';
  } else if (score >= thresholds.AMBIGUOUS) {
    tier = 'AMBIGUOUS';
  }

  return {
    skill: skill.name,
    score,
    tier,
    breakdown,
    matchedTriggers,
  };
}

/**
 * Convert deterministic match evidence into a routing-confidence label.
 * Raw score remains a match score; confidence also considers direct trigger
 * evidence and separation from the runner-up.
 */
export function deriveRoutingConfidence(bestMatch, runnerUp = null) {
  if (!bestMatch) {
    return {
      tier: 'FALLBACK',
      margin: 0,
      reason: 'no-candidate',
    };
  }

  const runnerScore = runnerUp?.score ?? 0;
  const margin = Math.round((bestMatch.score - runnerScore) * 100) / 100;
  const hasDirectTrigger = (bestMatch.matchedTriggers || []).length > 0 || bestMatch.breakdown?.keyword > 0;
  const hasIntent = bestMatch.breakdown?.intent > 0;

  if (bestMatch.tier === 'HIGH') {
    return {
      tier: 'HIGH',
      margin,
      reason: 'raw-score-high',
    };
  }

  if (hasDirectTrigger && hasIntent && margin >= 0.15) {
    return {
      tier: 'HIGH',
      margin,
      reason: 'direct-trigger-and-intent-with-clear-margin',
    };
  }

  if (bestMatch.score >= 0.50 || hasDirectTrigger) {
    return {
      tier: 'AMBIGUOUS',
      margin,
      reason: margin < 0.15 ? 'runner-up-too-close' : 'partial-match-evidence',
    };
  }

  return {
    tier: 'FALLBACK',
    margin,
    reason: 'weak-match-evidence',
  };
}

export function rankSkillCandidates(skills, context, options = {}) {
  const scored = skills.map((s) => scoreSkillCandidate(s, context, options));
  const lowerText = (context.text || '').toLowerCase();

  return scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;

    // Near-tie specificity rule:
    // a domain-specific keyword match should beat an intent-only candidate
    // when the total scores differ by no more than 0.10.
    if (Math.abs(scoreDiff) <= 0.10 && a.breakdown.keyword !== b.breakdown.keyword) {
      return b.breakdown.keyword - a.breakdown.keyword;
    }

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    // Tie-breaker: prefer candidate with more specific / longer keyword matches
    const skillA = skills.find((s) => s.name === a.skill);
    const skillB = skills.find((s) => s.name === b.skill);

    const evaluateTriggers = (skill) => {
      let maxLen = 0;
      let count = 0;
      for (const tr of skill?.triggers || []) {
        const lowerTr = tr.toLowerCase().trim();
        if (lowerTr.length < 2) continue;
        const isLatin = /^[a-z0-9_\s-]+$/i.test(lowerTr);
        let matches = false;
        if (isLatin) {
          const escaped = lowerTr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          matches = regex.test(lowerText);
        } else {
          matches = lowerText.includes(lowerTr);
        }
        if (matches) {
          count++;
          if (lowerTr.length > maxLen) maxLen = lowerTr.length;
        }
      }
      return { maxLen, count };
    };

    const trigA = evaluateTriggers(skillA);
    const trigB = evaluateTriggers(skillB);

    if (trigB.maxLen !== trigA.maxLen) {
      return trigB.maxLen - trigA.maxLen;
    }
    return trigB.count - trigA.count;
  });
}
