// The employee's profile shared with Setup-STeP-Skills (scripts/install-agent-skills.mjs in the harness), so a
// nickname, team, assistant name and conversation style set in one place appear in the other:
// ~/.step-ai/profile.json, { version: 1, name, team, assistant, style, tone, updatedAt }.
// Setup writes it after the profile questions; STeP Desktop fills its first-run wizard from it and writes it back
// whenever the profile is saved. It holds no personal data beyond what the person typed as their profile.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Settings } from '../src/types';

export type SharedProfile = {
  userName: string;
  team: string;
  assistant: string;
  personality: NonNullable<Settings['personality']>;
  assistantTone: string;
};

const STYLES = ['coworker', 'professional', 'concise', 'custom'] as const;
const LIMIT = 64_000;

export const sharedProfilePath = (env: NodeJS.ProcessEnv = process.env, home = homedir()) =>
  env.STEP_SHARED_PROFILE || join(home, '.step-ai', 'profile.json');

const text = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/[\r\n]/g, ' ')
        .trim()
        .slice(0, max)
    : '';

/** The profile, or undefined when there is none or it is not one this app wrote or understands. */
export async function readSharedProfile(file: string): Promise<SharedProfile | undefined> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
  if (raw.length > LIMIT) return undefined;
  let value: any;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || value.version !== 1) return undefined;
  const personality = STYLES.includes(value.style) ? value.style : 'coworker';
  return {
    userName: text(value.name, 60),
    team: text(value.team, 40).toLowerCase(),
    assistant: text(value.assistant, 60),
    personality,
    assistantTone: personality === 'custom' ? text(value.tone, 300) : '',
  };
}

const profileWrites = new Map<string, Promise<void>>();

/** Same-file writes finish in invocation order; readers see one complete, private profile. */
export async function writeSharedProfile(
  file: string,
  s: Pick<Settings, 'userName' | 'team' | 'assistant' | 'personality' | 'assistantTone'>,
) {
  const personality = s.personality || 'coworker';
  const body = {
    version: 1,
    name: text(s.userName, 60),
    team: text(s.team, 40),
    assistant: text(s.assistant, 60) || 'STeP Mate',
    style: personality,
    tone: personality === 'custom' ? text(s.assistantTone, 300) : '',
    updatedAt: new Date().toISOString(),
  };
  const path = resolve(file);
  const previous = profileWrites.get(path) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temp = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(body, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        await rename(temp, path);
      } finally {
        await rm(temp, { force: true });
      }
    });
  profileWrites.set(path, task);
  try {
    await task;
  } finally {
    if (profileWrites.get(path) === task) profileWrites.delete(path);
  }
}
