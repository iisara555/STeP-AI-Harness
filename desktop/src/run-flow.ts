import type { Attachment, WorkMode, Workflow } from './types';
import type { DocumentAttachmentRole, DocumentToolId } from './document-tools';
import type { InvitationPresentation } from './invitation';
import { errorText } from './messages';
import { t } from './i18n';

/** How one request runs; anything left out uses the composer's current choice. */
export type RunOptions = {
  attachments?: string[];
  /** The token from the consent dialog when the same request is sent again after the person agreed. */
  consent?: string;
  skill?: string;
  allowIds?: string[];
  sourceText?: string;
  mode?: WorkMode;
  imageModel?: string;
  retry?: boolean;
  coordinator?: boolean;
  documentTool?: DocumentToolId;
  attachmentRole?: DocumentAttachmentRole;
  /** A run that must not pick up the composer's workflow or create images on its own. */
  isolated?: boolean;
  /** A side question answered beside the task without changing it. */
  aside?: boolean;
  autoContinue?: boolean;
  documentVariant?: string;
  invitation?: InvitationPresentation;
};

type Resolved = RunOptions & {
  attachments: string[];
  mode: WorkMode;
  imageModel: string;
  coordinator: boolean;
  isolated: boolean;
  aside: boolean;
  autoContinue: boolean;
};

/** What the consent dialog keeps to send the same request again once the person agrees. */
export type ConsentAsk = Omit<Resolved, 'consent'> & {
  sessionId: string;
  text: string;
  token: string;
  first: boolean;
  flagged: boolean;
  labels: string[];
  attachment: boolean;
  vision?: boolean;
};

/** Fills what a run left out from the composer: its mode and image model, and the coordinator for plain drafts. */
export function resolveRun(options: RunOptions, composer: { mode: WorkMode; imageModel: string; coordinated: boolean }): Resolved {
  const mode = options.mode ?? composer.mode;
  return {
    ...options,
    attachments: options.attachments ?? [],
    mode,
    imageModel: options.imageModel ?? composer.imageModel,
    coordinator: options.coordinator ?? (composer.coordinated && mode === 'draft' && !options.skill && !options.retry),
    isolated: options.isolated ?? false,
    aside: options.aside ?? false,
    autoContinue: options.autoContinue ?? false,
  };
}

/** The request the host receives. Only a plain chat run carries the composer's workflow; an isolated run makes no images. */
export function runPayload(
  id: string,
  text: string,
  run: Resolved,
  workflow: Workflow | '',
): Record<string, unknown> & { workflow?: Workflow; autoImage?: boolean; allowIdentifiers?: string[]; sourceText?: string } {
  return {
    id,
    text,
    attachments: run.attachments,
    consent: run.consent,
    skill: run.skill,
    allowIdentifiers: run.allowIds,
    sourceText: run.sourceText,
    mode: run.mode,
    imageModel: run.imageModel,
    retry: run.retry,
    coordinator: run.coordinator,
    documentTool: run.documentTool,
    documentVariant: run.documentVariant,
    invitation: run.invitation,
    attachmentRole: run.attachmentRole,
    autoContinue: run.autoContinue,
    ...(run.isolated ? { autoImage: false } : run.mode === 'chat' && workflow ? { workflow } : {}),
  };
}

/** Why the composer cannot send yet, said to the person; null when it can. The typed text always stays in the box. */
export function sendBlocker(state: { preparingImage: boolean; busy: boolean; files: Attachment[] }) {
  if (state.preparingImage) return { text: t('กำลังเตรียมภาพ กรุณารอสักครู่ก่อนส่ง'), kind: 'info' as const };
  if (state.busy) return { text: t('รอคำตอบปัจจุบันก่อนส่ง ข้อความยังอยู่ในช่องพิมพ์'), kind: 'info' as const };
  // A file that cannot go to the AI is never dropped quietly: the message waits until the person removes or replaces it.
  const refused = state.files.find(f => !f.usable);
  if (refused)
    return {
      text: t(
        'ส่งไฟล์ “{0}” ให้ AI ไม่ได้: {1} · นำไฟล์ออกหรือแนบไฟล์อื่นก่อนส่ง',
        refused.name,
        errorText[refused.reason || ''] || refused.status,
      ),
      kind: 'error' as const,
    };
  return null;
}

/** The request sent for what is in the composer: the typed text, or a stock request when only a picture is attached. */
export function composerRequest(query: string, files: Attachment[]) {
  return query.trim() ? query : files.some(file => file.imagePreview) ? t('ช่วยดูไฟล์ที่แนบ') : '';
}

/** The notice for a task that finished in the background; empty when its end needs no notice. */
export function finishedNotice(status: string, title: string) {
  if (status === 'review') return t('“{0}” มีร่างให้ตรวจแล้ว', title);
  if (status === 'waiting') return t('“{0}” รอข้อมูลเพิ่มจากคุณ', title);
  if (status === 'error') return t('“{0}” ต้องตรวจสอบ', title);
  return '';
}

/** Streamed text keeps only its most recent part so a very long answer cannot slow the window. */
export const STREAM_LIMIT = 60000,
  REASONING_LIMIT = 20000;
export const appendStream = (text: string, chunk: string, limit: number) => (text + chunk).slice(-limit);
/** The host takes back the last characters it streamed (for example a tool call that was not text after all). */
export const discardStream = (text: string, count: number) => text.slice(0, Math.max(0, text.length - count));
/** In chat each turn's text stays on screen; a new turn starts after a blank line. */
export const turnBreak = (text: string) => (text.trim() && !text.endsWith('\n\n') ? text + '\n\n' : text);

/** Adds an item or replaces the one with the same id (approvals, questions and vault prompts arrive more than once). */
export const upsertById = <T extends { id: string }>(list: T[], item: T) => [...list.filter(x => x.id !== item.id), item];
export const withoutId = <T extends { id: string }>(list: T[], id: string | undefined) => list.filter(x => x.id !== id);
