import { getAvailableTeams } from '../../modules/role-resolver.js';
import { header, info, table } from '../../utils/display.js';
import { colors } from '../../utils/colors.js';

export async function runTeams(args) {
  header('22 Teams of STeP & Domain Routing Clusters');

  const teams = await getAvailableTeams();

  console.log(`อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP / RSP North)`);
  console.log(`แบ่งออกเป็น ${colors.bold('22 ทีม')} ภายใต้ ${colors.bold('5 กลุ่มงาน (Domain Clusters)')}:\n`);

  // Group by cluster
  const clusters = {};
  for (const t of teams) {
    if (!clusters[t.clusterId]) {
      clusters[t.clusterId] = {
        name: t.clusterName,
        router: t.clusterRouter,
        teams: [],
      };
    }
    clusters[t.clusterId].teams.push(t);
  }

  for (const [clusterId, cluster] of Object.entries(clusters)) {
    console.log(colors.cyan(`\n● กลุ่มงาน: ${colors.bold(cluster.name)}`));
    console.log(colors.dim(`  Router: ${cluster.router || clusterId} | จำนวน ${cluster.teams.length} ทีม`));

    const rows = cluster.teams.map((t) => [
      colors.bold(t.id),
      t.name,
      t.nameEn,
      t.skills.join(', '),
    ]);

    table(['Team ID', 'ชื่อทีม (ไทย)', 'Name (English)', 'Skills'], rows);
  }

  console.log(`\n${colors.bold('ตัวอย่างคำสั่งติดตั้งสำหรับทีมของคุณ:')}`);
  console.log(`  ${colors.green('step-ai init --team qs --tool claude')}     # สำหรับทีมระบบคุณภาพ (QS)`);
  console.log(`  ${colors.green('step-ai init --team afp --tool cursor')}    # สำหรับทีมบัญชี การเงิน และจัดซื้อ (AFP)`);
  console.log(`  ${colors.green('step-ai init --team mi --tool codex')}      # สำหรับทีมนวัตกรรมตลาด (MI)`);
  console.log(`  ${colors.green('step-ai init --team cc --tool all')}        # สำหรับทีมงานสร้างสรรค์ (CC)\n`);
}
