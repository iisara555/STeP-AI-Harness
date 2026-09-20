import { colors } from '../utils/colors.js';

export function resolveTeamChoice(teams = [], answer = '') {
  const normalized = String(answer || '').trim().toLowerCase();
  if (!normalized || normalized === '0') return null;

  const idx = Number.parseInt(normalized, 10) - 1;
  if (Number.isInteger(idx) && idx >= 0 && idx < teams.length) {
    return teams[idx];
  }

  const compact = normalized.replace(/-/g, '');
  return teams.find((team) => {
    const id = String(team.id || '').toLowerCase();
    return id === normalized || id.replace(/-/g, '') === compact;
  }) || null;
}

export async function selectTeamProfile({ teams, rl }) {
  console.log(colors.bold('\nเลือกทีมหลักของคุณ\n'));
  console.log(`  ${colors.cyan('0.')} ${colors.bold('ยังไม่แน่ใจ — ข้ามก่อนและเลือกภายหลังได้ [Default]')}`);

  teams.forEach((team, idx) => {
    const code = team.id.toUpperCase().padEnd(9);
    console.log(`  ${colors.cyan(String(idx + 1) + '.')} [${colors.bold(code)}] ${team.name}`);
  });

  const answer = await new Promise((resolve) => {
    rl.question(
      colors.bold(colors.green(`\nเลือกทีม (0-${teams.length}) หรือพิมพ์รหัสทีม [default: 0]: `)),
      (value) => resolve(value.trim())
    );
  });

  const team = resolveTeamChoice(teams, answer);
  return {
    team,
    cluster: team
      ? {
          id: team.clusterId,
          name: team.clusterName,
        }
      : null,
    deferred: !team,
  };
}
