import { existsSync, realpathSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve, relative, isAbsolute, basename, dirname } from 'node:path';
import { homedir } from 'node:os';

export function outsideRepo(output, repo) {
  const result = resolve(output),
    source = resolve(repo),
    rel = relative(source, result);
  if (!rel || (!rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && rel !== '..' && !isAbsolute(rel)))
    throw new Error('OUTPUT_MUST_BE_OUTSIDE_REPO');
  return result;
}
export function containsPath(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')));
}
export function resolvedDestination(output) {
  let ancestor = resolve(output);
  const segments = [];
  while (!existsSync(ancestor)) {
    segments.unshift(basename(ancestor));
    const next = dirname(ancestor);
    if (next === ancestor) throw new Error('OUTPUT_PATH_INVALID');
    ancestor = next;
  }
  return resolve(realpathSync(ancestor), ...segments);
}
export function listProfiles(dataDir) {
  const db = new DatabaseSync(join(dataDir, 'workspace.sqlite'), { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT id,json_extract(value,'$.provider') AS provider,json_extract(value,'$.mode') AS mode FROM records WHERE kind='connection' ORDER BY id",
      )
      .all()
      .flatMap(row => {
        if (row.provider !== 'openai' || row.mode !== 'subscription') return [];
        const id = String(row.id);
        if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('INVALID_CONNECTION_ID');
        const profile = join(dataDir, 'runtimes', id);
        return existsSync(profile) && statSync(profile).isDirectory() ? [{ id, profile }] : [];
      })
      .map((c, i) => ({ number: i + 1, ...c }));
  } finally {
    db.close();
  }
}
export function selectProfile(rows, number) {
  if (number === undefined && rows.length === 1) return rows[0].profile;
  const chosen = rows.find(c => String(c.number) === String(number));
  if (!chosen) throw new Error(number === undefined ? 'CHOOSE_CONNECTION_WITH_LIST' : 'CONNECTION_NOT_FOUND');
  return chosen.profile;
}
export function runtimeEnv(profile, source = process.env) {
  const keep = [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'TEMP',
    'TMP',
    'TMPDIR',
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'https_proxy',
    'http_proxy',
    'all_proxy',
    'no_proxy',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS',
  ];
  const env = Object.fromEntries(keep.filter(k => source[k] !== undefined).map(k => [k, source[k]]));
  return { ...env, HOME: profile, USERPROFILE: profile, APPDATA: profile, LOCALAPPDATA: profile, CODEX_HOME: profile };
}
export function parseArgs(args) {
  const options = {};
  const flags = new Set(['--list', '--probe', '--self-test', '--live', '--help']);
  const values = new Set(['--repo', '--data-dir', '--profile', '--connection', '--output', '--prior-calls']);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (flags.has(key)) options[key] = true;
    else if (values.has(key) && args[i + 1] && !args[i + 1].startsWith('--')) options[key] = args[++i];
    else throw new Error('INVALID_ARGUMENT');
  }
  if ([...flags].filter(k => options[k] && k !== '--help').length > 1) throw new Error('CHOOSE_ONE_MODE');
  return options;
}
export function parsePriorCalls(text = '') {
  const result = {};
  if (!text) return result;
  for (const pair of text.split(',')) {
    const match = pair.match(/^([A-Za-z0-9_.-]{1,100})=(\d+)$/);
    if (!match || Object.hasOwn(result, match[1]) || Number(match[2]) > 18) throw new Error('INVALID_PRIOR_CALLS');
    Object.defineProperty(result, match[1], { value: Number(match[2]), enumerable: true, writable: true, configurable: true });
  }
  return result;
}
export function desktopData(options) {
  if (options['--data-dir']) return realpathSync(resolve(options['--data-dir']));
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : join(homedir(), '.config');
  if (!base) throw new Error('DESKTOP_DATA_DIR_REQUIRED');
  const choices = [join(base, 'STeP Desktop'), join(base, '@step-cmu', 'desktop')].filter(p => existsSync(join(p, 'workspace.sqlite')));
  if (choices.length !== 1) throw new Error(choices.length ? 'MULTIPLE_DESKTOP_DATA_DIRS' : 'DESKTOP_DATA_DIR_NOT_FOUND');
  return realpathSync(choices[0]);
}
