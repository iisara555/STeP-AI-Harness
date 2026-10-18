// Shared by the background scheduler and the renderer's read-only preview. No host APIs.
function field(raw: string, min: number, max: number) {
  const values = new Set<number>();
  for (const part of raw.split(',')) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!match) throw new Error('CRON_INVALID');
    const step = Number(match[2] || 1),
      range = match[1] === '*' ? [min, max] : match[1].split('-').map(Number);
    const start = range[0],
      end = range[1] ?? (match[2] ? max : start);
    if (start < min || end > max || start > end || step < 1 || step > max + 1) throw new Error('CRON_INVALID');
    for (let n = start; n <= end; n += step) values.add(n);
  }
  return values;
}

export function nextCron(schedule: string, now: number) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5 || schedule.length > 120) throw new Error('CRON_INVALID');
  const ranges = [
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 6],
    ],
    sets = parts.map((p, i) => field(p, ...(ranges[i] as [number, number])));
  for (let at = Math.floor(now / 60_000) * 60_000 + 60_000, end = at + 370 * 86400_000; at < end; at += 60_000) {
    const d = new Date(at),
      dom = sets[2].has(d.getUTCDate()),
      dow = sets[4].has(d.getUTCDay());
    const day = sets[2].size === 31 ? dow : sets[4].size === 7 ? dom : dom || dow;
    if (sets[0].has(d.getUTCMinutes()) && sets[1].has(d.getUTCHours()) && sets[3].has(d.getUTCMonth() + 1) && day) return at;
  }
  throw new Error('CRON_INVALID');
}
