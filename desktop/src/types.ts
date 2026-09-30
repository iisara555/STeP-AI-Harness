import type { DraftNode } from './draft';
export type Provider = 'openai' | 'claude' | 'gemini';
export type EffortOption = { id: string; description?: string };
export type ModelOption = {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
  efforts?: EffortOption[];
  defaultEffort?: string;
};
export type Connection = {
  id: string;
  provider: Provider;
  mode: 'api' | 'subscription' | 'oauth';
  model: string;
  executable: string;
  customRuntime?: boolean;
  /** Optional Google Cloud project for Workspace / organization Google OAuth accounts. */
  googleCloudProject?: string;
  /** A login may have written runtime-owned credentials, including OS keychain entries. */
  claudeAuthStarted?: boolean;
  /** The account signed in at the last connect, kept apart from the test result in `ready`. */
  signedIn?: boolean;
  ready: boolean;
  note: string;
  models?: ModelOption[];
  modelsAt?: string;
};
export type SkillEntry = {
  name: string;
  title: string;
  description: string;
  category: string;
  path: string;
  status: 'routed' | 'registered' | 'unregistered' | 'missing-file';
  inRegistry: boolean;
  inRouter: boolean;
  owner: string;
  version: string;
  stage: string;
  cluster: string;
  teams: string[];
  triggers: string[];
};
export type Usage = { input: number; output: number; total: number; runs: number };
export type UsageReport = {
  day: string;
  month: string;
  dailyTokens: number;
  monthlyUsd: number;
  unpricedTokens: number;
  budgets: { dailyTokens?: number; monthlyCostUsd?: number };
  warnings: string[];
  entries: { day: string; provider: string; model: string; total: number; usd: number; unpricedTokens: number }[];
};
export type WorkMode = 'chat' | 'draft' | 'image';
export type ImageArtifact = { id: string; name: string; model: string; provider: Provider; mime: string; at: string };
/** One model step of a run: sizes, references and timing only, never request, source or draft text. */
export type StepTrace = {
  label: string;
  systemChars: number;
  promptChars: number;
  references: string[];
  attempts: number;
  ms: number;
  usage?: { input: number; output: number; total: number };
};
export type RunTrace = {
  id: string;
  at: string;
  mode: string;
  route: string;
  outcome: string;
  code?: string;
  ms: number;
  steps: StepTrace[];
};
/** Finished Playbook steps of a run that stopped, so the same task can continue after them. */
export type Checkpoint = { key: string; done: number; total: number; handoff: string; sources: string[]; skillTitle: string; at: string };
export type Message = {
  role: 'user' | 'assistant' | 'status';
  text: string;
  at: string;
  webSources?: { title: string; url: string }[];
  /** Files sent with this message, shown on it in the transcript. */
  files?: { name: string }[];
};
/** A file sent in a chat: its checked, masked text stays with the conversation. */
export type ConversationFile = { name: string; text: string; at: string };
export type DraftVersion = { revision: number; text: string; document?: DraftNode; at: string };
export type Proposal = { id: string; text: string; baseRevision: number; sources: string[]; at: string };
export type Session = {
  id: string;
  title: string;
  project: string;
  team: string;
  connectionId: string;
  messages: Message[];
  draft: string;
  document?: DraftNode;
  revision: number;
  versions: DraftVersion[];
  proposals: Proposal[];
  originalQuery: string;
  answers: string[];
  clarification: boolean;
  status: string;
  updatedAt: string;
  sources: string[];
  sourceText?: string;
  consentedAt?: string;
  followUps?: string[];
  /** Index of the first message in the current task boundary inside this Workspace session. */
  contextStart?: number;
  model?: string;
  effort?: string;
  pinned?: boolean;
  usage?: Usage;
  skill?: string;
  allowedIdentifiers?: string[];
  mode?: WorkMode;
  imageModel?: string;
  images?: ImageArtifact[];
  /** Chat only: every file sent in the conversation. */
  files?: ConversationFile[];
  /** Route of the last finished run, to tell a follow-up for the same work from a new task. */
  routeKey?: string;
  checkpoint?: Checkpoint;
  /** How the run in progress (or the one that stopped) treated earlier context, so a retry repeats it exactly. */
  lastRun?: { revising: boolean; carries: boolean; continuing?: boolean; latest?: string };
  runs?: RunTrace[];
};
export type Settings = {
  permissionMode?: PermissionMode;
  team: string;
  assistant: string;
  workspace: string;
  theme: 'system' | 'light' | 'dark';
  onboarding: boolean;
  ocrDir?: string;
  userName?: string;
  personality?: 'coworker' | 'professional' | 'concise' | 'custom';
  assistantTone?: string;
  tourDone?: boolean;
  consentedAt?: string;
  ocrAiConsentedAt?: string;
};
/** `reason` says why a file cannot be sent (an ATTACH_* code), so the chip and the send button can tell the person. */
export type Attachment = { id: string; name: string; status: string; preview: string; usable: boolean; reason?: string };
export type Snapshot = {
  usage?: UsageReport;
  policy?: PolicySnapshot;
  approvals?: ApprovalRule[];
  features?: { claudeSubscription?: boolean };
  settings: Settings;
  connections: Connection[];
  sessions: Session[];
  teams: { id: string; name: string }[];
  userFile: string;
};
export type PermissionMode = 'ask' | 'plan' | 'auto';
export type PolicySnapshot = {
  source: 'managed' | 'default';
  path: string;
  problems: string[];
  features: Record<string, boolean>;
  modes: PermissionMode[];
  defaultMode: PermissionMode;
  mode: PermissionMode;
  hooks: number;
};
export type ApprovalRule = { id: string; workspaceHash: string; tool: string; targetHash: string; at: string };
export type ApprovalRequest = { id: string; tool: string; title: string; body: string; privacyClass: string; allowRemember: boolean };
export type ToolQuestion = { id: string; sessionId: string; question: string; options: string[] };
export type PlanStep = { label: string; action?: boolean };
export type RunEvent = {
  sessionId: string;
  type:
    | 'delta'
    | 'reasoning'
    | 'status'
    | 'activity'
    | 'heartbeat'
    | 'changed'
    | 'auth-code'
    | 'auth-code-close'
    | 'plan'
    | 'step'
    | 'install'
    | 'connect-progress'
    | 'failed'
    | 'approval'
    | 'approval-close'
    | 'question'
    | 'question-close'
    | 'trace';
  question?: ToolQuestion;
  questionId?: string;
  approval?: ApprovalRequest;
  approvalId?: string;
  text?: string;
  trace?: RunTrace;
  detail?: string[];
  connectionId?: string;
  plan?: PlanStep[];
  index?: number;
  state?: 'running' | 'done' | 'skipped';
};
export interface DesktopAPI {
  call(method: string, input?: unknown): Promise<any>;
  onEvent(callback: (event: RunEvent) => void): () => void;
}
declare global {
  interface Window {
    step?: DesktopAPI;
  }
}
