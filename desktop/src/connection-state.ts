import type { Connection } from './types';

/**
 * One plain status per AI account and the one button that fixes it, so the person never has to
 * read a note to know what to press. Labels are Thai source strings; the caller translates them.
 */
export type ConnectionTone = 'ready' | 'attention' | 'error' | 'idle' | 'blocked';
export type ConnectionAction = 'retest' | 'sign-in-again' | 'test' | 'connect' | 'none';
export type ConnectionState = { tone: ConnectionTone; label: string; action: ConnectionAction };

const SIGN_IN_EXPIRED = ['LOGIN_REQUIRED', 'COPILOT_LOGIN_REQUIRED'];

export function connectionState(
  c: Pick<Connection, 'ready' | 'signedIn' | 'policyBlocked' | 'problem' | 'mode'> & { note?: string },
): ConnectionState {
  // Connections saved before `problem` existed keep the failure code at the end of their note.
  const problem = c.problem ?? /\(([A-Z_]+)\)$/.exec(c.note || '')?.[1];
  if (c.policyBlocked) return { tone: 'blocked', label: 'ปิดโดยองค์กร', action: 'none' };
  if (c.ready) return { tone: 'ready', label: 'ทดสอบข้อความผ่าน', action: 'retest' };
  if (problem && SIGN_IN_EXPIRED.includes(problem))
    return c.mode === 'api'
      ? { tone: 'attention', label: 'API key ใช้ไม่ได้', action: 'test' }
      : { tone: 'attention', label: 'ต้องลงชื่อใหม่', action: 'sign-in-again' };
  if (c.signedIn) return { tone: 'error', label: 'ลงชื่อแล้ว แต่ทดสอบไม่ผ่าน', action: 'test' };
  if (problem && problem !== 'CANCELLED')
    return { tone: 'error', label: 'เชื่อมต่อไม่สำเร็จ', action: c.mode === 'api' ? 'test' : 'connect' };
  return { tone: 'idle', label: 'ยังไม่ได้เชื่อมต่อ', action: c.mode === 'api' ? 'test' : 'connect' };
}
