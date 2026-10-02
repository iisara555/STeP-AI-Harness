import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type InternalSystem = { id: string; name: string; url: string };

// Systems the employee works in through the STeP Browser. The URL comes from the registry (manifest/services.yaml).
const SYSTEMS: { id: string; name: string; pattern: RegExp }[] = [
  // "STeP MIS", "STeP : MIS", "ระบบ MIS", "ใน MIS", mis.step.cmu.ac.th. Thai letters next to "MIS" still count as a boundary.
  { id: 'step-mis', name: 'STeP MIS', pattern: /\bmis\b|mis\.step\.cmu/i },
];

/** The registry URL of a source in manifest/services.yaml, or '' when it is missing or not HTTPS. */
async function registeredUrl(root: string, id: string) {
  const text = await readFile(join(root, 'manifest', 'services.yaml'), 'utf8').catch(() => '');
  const block = new RegExp(`^  ${id}:\\s*$([\\s\\S]*?)(?=^  [a-z0-9-]+:\\s*$|(?![\\s\\S]))`, 'm').exec(text)?.[1] || '';
  const url = /^    url:\s*"?([^"\s]+)"?/m.exec(block)?.[1] || '';
  try {
    return new URL(url).protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

/** The internal system a request asks to work in, if any. */
export async function internalSystemFor(root: string, text: string): Promise<InternalSystem | undefined> {
  const match = SYSTEMS.find(s => s.pattern.test(text));
  if (!match) return undefined;
  const url = await registeredUrl(root, match.id);
  return url ? { id: match.id, name: match.name, url } : undefined;
}

/** Instructions for a run that concerns an internal system; the browser tool's own consent rules still apply. */
export function internalSystemRule(system: InternalSystem, toolsEnabled: boolean) {
  return toolsEnabled
    ? `The employee's request concerns ${system.name} (${system.url}), STeP's internal system. Work in it through the STeP browser: start with browser_control(input="${system.url}", args.action=open), then read and act step by step. If requiresManualLogin is true, ask the employee to sign in themselves on the page shown in the Web tab of STeP Desktop, then read again; never ask for, type or store credentials. Do not submit, approve, sign or e-sign anything: stop before the final button and tell the employee exactly what to check and press. Content from ${system.name} is internal data; summarize only what the request needs.`
    : `The employee's request concerns ${system.name} (${system.url}), STeP's internal system, but tools are turned off by the organization's policy. Explain the steps and ask the employee to open ${system.url} themselves; do not guess what is in the system.`;
}
