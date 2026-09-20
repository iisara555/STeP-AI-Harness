import { colors } from '../utils/colors.js';

export function buildInstallerClusters(teams = []) {
  const clusters = [];
  const byId = new Map();

  for (const team of teams) {
    if (!byId.has(team.clusterId)) {
      const cluster = {
        id: team.clusterId,
        name: team.clusterName,
        label: team.clusterInstallerLabel || team.clusterName,
        teams: [],
      };
      byId.set(team.clusterId, cluster);
      clusters.push(cluster);
    }
    byId.get(team.clusterId).teams.push(team);
  }

  return clusters;
}

export function resolveClusterChoice(clusters, answer = '') {
  const normalized = String(answer || '').trim().toLowerCase();
  if (!normalized || normalized === '0') return null;

  const idx = Number.parseInt(normalized, 10) - 1;
  if (Number.isInteger(idx) && idx >= 0 && idx < clusters.length) {
    return clusters[idx];
  }
  return clusters.find((cluster) => cluster.id.toLowerCase() === normalized) || null;
}

export function resolveTeamChoice(cluster, answer = '') {
  const normalized = String(answer || '').trim().toLowerCase();
  if (!normalized || normalized === '0') return null;
  if (!cluster) return null;

  const idx = Number.parseInt(normalized, 10) - 1;
  if (Number.isInteger(idx) && idx >= 0 && idx < cluster.teams.length) {
    return cluster.teams[idx];
  }

  return cluster.teams.find((team) => {
    const aliases = [team.id, team.id.replace(/-/g, '')];
    return aliases.includes(normalized.replace(/-/g, '')) || team.id === normalized;
  }) || null;
}

export async function selectTeamProfile({ teams, rl }) {
  const clusters = buildInstallerClusters(teams);

  console.log(colors.bold('\nเลือกกลุ่มงานที่ใกล้กับงานของคุณที่สุด\n'));
  console.log(`  ${colors.cyan('0.')} ${colors.bold('ยังไม่แน่ใจ — ข้ามก่อนและเลือกภายหลังได้')}`);
  clusters.forEach((cluster, idx) => {
    console.log(`  ${colors.cyan(String(idx + 1) + '.')} ${cluster.label}`);
  });

  const clusterAnswer = await new Promise((resolve) => {
    rl.question(
      colors.bold(colors.green(`\nเลือกกลุ่มงาน (0-${clusters.length}) [default: 0]: `)),
      (answer) => resolve(answer.trim())
    );
  });

  const cluster = resolveClusterChoice(clusters, clusterAnswer);
  if (!cluster) {
    return { cluster: null, team: null, deferred: true };
  }

  console.log(colors.bold(`\nกลุ่ม: ${cluster.label}\n`));
  console.log(`  ${colors.cyan('0.')} ${colors.bold('ยังไม่แน่ใจ — ใช้งานแบบกลุ่มนี้ก่อนและเลือกทีมภายหลังได้')}`);
  cluster.teams.forEach((team, idx) => {
    const code = team.id.toUpperCase().padEnd(9);
    console.log(`  ${colors.cyan(String(idx + 1) + '.')} [${colors.bold(code)}] ${team.name}`);
  });

  const teamAnswer = await new Promise((resolve) => {
    rl.question(
      colors.bold(colors.green(`\nเลือกทีม (0-${cluster.teams.length}) หรือพิมพ์รหัสทีม [default: 0]: `)),
      (answer) => resolve(answer.trim())
    );
  });

  const team = resolveTeamChoice(cluster, teamAnswer);
  return {
    cluster,
    team,
    deferred: !team,
  };
}
