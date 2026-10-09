import type { DraftNode } from './draft';
import type { DocumentToolId } from './document-tools';
export type Provider = 'openai' | 'claude' | 'gemini' | 'antigravity' | 'compatible' | 'copilot';
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
  baseUrl?: string;
  protocol?: 'openai' | 'anthropic';
  label?: string;
  /** A well-known service from provider-presets (OpenRouter, DeepSeek, ...), fixed to its official endpoint. */
  preset?: string;
  provider: Provider;
  mode: 'api' | 'subscription' | 'oauth';
  model: string;
  executable: string;
  customRuntime?: boolean;
  /** Applied by managed modelLimits at run time; absent means use adapter/model defaults. */
  contextWindow?: number;
  maxOutputTokens?: number;
  promptCaching?: 'off' | 'anthropic-ephemeral' | 'gemini-explicit';
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
/** Only provider-reported account meters. Unknown values stay absent, never zero. */
export type ProviderUsageData = {
  status: 'ok' | 'unavailable';
  source: 'codex' | 'claude' | 'copilot' | 'openrouter' | 'deepseek';
  experimental?: boolean;
  plan?: string;
  reason?: string;
  limits: {
    name: string;
    scope?: string;
    windowMinutes?: number;
    usedPercent?: number;
    used?: number;
    total?: number;
    unlimited?: boolean;
    resetsAt?: string;
  }[];
  credits: {
    name: 'balance' | 'key_limit' | 'extra_usage';
    scope?: string;
    unit: 'USD' | 'CNY' | 'credits' | 'minor-units';
    remaining?: number;
    used?: number;
    total?: number;
    unlimited?: boolean;
    available?: boolean;
    hasCredits?: boolean;
  }[];
  spend: { period: 'day' | 'week' | 'month' | 'all'; scope: 'key' | 'byok'; amount: number; unit: 'USD' }[];
};
export type ProviderUsageReport = Omit<ProviderUsageData, 'status' | 'source'> & {
  connectionId: string;
  provider: Provider;
  mode: Connection['mode'];
  label: string;
  status: ProviderUsageData['status'] | 'idle' | 'unsupported' | 'disconnected' | 'error';
  source?: ProviderUsageData['source'];
  checkedAt?: string;
  canRefresh: boolean;
  hasDashboard: boolean;
};
export type UsageReport = {
  day: string;
  month: string;
  dailyTokens: number;
  monthlyUsd: number;
  unpricedTokens: number;
  cachePriceMissingTokens?: number;
  budgets: { dailyTokens?: number; monthlyCostUsd?: number };
  warnings: string[];
  accounts?: ProviderUsageReport[];
  entries: {
    day: string;
    provider: string;
    model: string;
    connectionId?: string;
    mode?: Connection['mode'];
    total: number;
    usd: number;
    unpricedTokens: number;
    cachedInput?: number;
    cacheWriteInput?: number;
    cachePriceMissingTokens?: number;
  }[];
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
  contextScope?: 'text' | 'full';
  discovery?: { skills: 'top3' | 'full'; documents: 'top3' | 'full'; skillCount: number; documentCount: number };
  toolMs?: number;
  providerCalls?: ProviderCallTrace[];
};
/** Host text estimates and provider observations stay separate. No task text is persisted here. */
export type ProviderCallTrace = {
  kind: 'answer' | 'summary' | 'web-search';
  outcome: 'running' | 'completed' | 'error';
  code?: string;
  ms: number;
  ttftMs?: number;
  payloadBytes: number;
  inputEstimate: number;
  estimateMethod: 'script-aware-estimate-v2';
  components: Record<string, number>;
  prefixHash: string;
  transport?: {
    mode: 'full' | 'delta';
    sentChars: number;
    startupMs?: number;
    resetReason?: string;
    cacheStatus?: 'created' | 'reused' | 'bypassed';
  };
  usage?: { input: number; output: number; total: number; cachedInput?: number; cacheWriteInput?: number };
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
  /** Provider research before the first model step, when host-side search is enabled. */
  providerCalls?: ProviderCallTrace[];
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
  /** The person's rating of an answer; stays on this computer with the conversation. */
  feedback?: 'good' | 'fix';
  /** How long the answer took, from sending the request to the finished reply. */
  ms?: number;
};
/** A file sent in a chat: its checked, masked text stays with the conversation. */
export type ConversationFile = { name: string; text: string; at: string };
export type DraftVersion = { revision: number; text: string; document?: DraftNode; at: string };
export type Proposal = { id: string; text: string; review?: string; baseRevision: number; sources: string[]; at: string };
export type DocumentTemplateInfo = { key: string; sha256: string; name: string; font: string };
export type Session = {
  /** The selected form's Skill/template contract, retained for revisions and retry. */
  documentTool?: DocumentToolId;
  /** Reference to a private, host-owned DOCX snapshot; bytes never go to the renderer or AI. */
  documentTemplate?: DocumentTemplateInfo;
  /** Checks for an accepted AI draft, kept outside editable/exported document content. */
  documentReview?: { text: string; revision: number };
  parentId?: string;
  loadedContext?: string[];
  compaction?: { before: number; after: number; method: string; at: string };
  approvedPlan?: string;
  /** The plan approved in the native 'plan' workflow, ticked off by the 'execute' workflow. */
  workPlan?: WorkPlan;
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
  /** The employee turned on the background learning review (policy features.learningReview must allow it). */
  learningReview?: boolean;
  keybindings?: import('./commands').Keybindings;
  vimMode?: boolean;
  outputStyle?: string;
  permissionMode?: PermissionMode;
  team: string;
  assistant: string;
  workspace: string;
  theme: 'system' | 'light' | 'dark';
  /** Interface language; Thai when unset. */
  language?: 'th' | 'en';
  onboarding: boolean;
  ocrDir?: string;
  userName?: string;
  /** A bundled profile picture id (src/avatar-ids.ts); empty or missing shows the initial. */
  avatar?: string;
  personality?: 'coworker' | 'professional' | 'concise' | 'custom';
  assistantTone?: string;
  /** How answers flow (src/speaking-styles.ts); Standard when unset. */
  interactionStyle?: 'standard' | 'witty' | 'ob-oon';
  /** A wording layer that stacks on the interaction style; Standard when unset. */
  languageStyle?: 'standard' | 'northern-thai';
  tourDone?: boolean;
  /** The app version whose "What's new" the person has seen (src/whats-new.ts). */
  whatsNewSeen?: string;
  consentedAt?: string;
  /** Version of the usage terms this person accepted (src/terms-version.ts). */
  termsVersion?: string;
  ocrAiConsentedAt?: string;
  receiptVisionConsentedAt?: string;
};
/** `reason` says why a file cannot be sent (an ATTACH_* code), so the chip and the send button can tell the person. */
export type Attachment = {
  /** Native template capability is separate from permission to send its original extracted text. */
  templateReady?: boolean;
  sourceUsable?: boolean;
  id: string;
  name: string;
  status: string;
  preview: string;
  usable: boolean;
  reason?: string;
  vision?: boolean;
  imagePreview?: string;
};
export type VisionInput = { mime: 'image/png' | 'image/jpeg' | 'image/webp'; data: string };
export type MemoryEntry = {
  schema_version: 1;
  id: string;
  name: string;
  text: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  scope: 'private' | 'project' | 'team';
  importance: number;
  ttl_days: number;
  created_at: string;
  updated_at: string;
  source: 'user-confirmed';
  expired?: boolean;
};
export type MemoryProposal = Pick<MemoryEntry, 'id' | 'name' | 'text' | 'type' | 'scope' | 'importance' | 'ttl_days'> & {
  evidence: string;
  sessionId: string;
  context: string;
  at: string;
};
export type Snapshot = {
  usage?: UsageReport;
  policy?: PolicySnapshot;
  approvals?: ApprovalRule[];
  transmissionGrants?: TransmissionGrant[];
  consentMetrics?: ConsentSummary;
  features?: { claudeSubscription?: boolean; providerPresets?: boolean };
  settings: Settings;
  connections: Connection[];
  sessions: Session[];
  teams: { id: string; name: string; nameEn?: string }[];
  userFile: string;
  appVersion?: string;
};
export type PermissionMode = 'ask' | 'acceptEdits' | 'plan' | 'auto';
export type PolicySnapshot = {
  source: 'managed' | 'default';
  path: string;
  problems: string[];
  features: Record<string, boolean>;
  modes: PermissionMode[];
  defaultMode: PermissionMode;
  mode: PermissionMode;
  hooks: number;
  pilot?: boolean;
  checks?: { authority: boolean; privacy: boolean };
};
export type ConsentSummary = {
  prompts: number;
  confirmed: number;
  cancelled: number;
  tasks: number;
  tasksAsked: number;
  perTask: number;
};
export type ApprovalRule = { id: string; workspaceHash: string; tool: string; targetHash: string; at: string };
export type ApprovalAnswer = 'cancel' | 'once' | 'workspace' | 'run';
export type TransmissionGrant = {
  id: string;
  sessionId: string;
  destination: string;
  source: string;
  expiresAt: string;
  remainingChars: number;
  remainingResults: number;
};
export type ApprovalRequest = {
  id: string;
  tool: string;
  title: string;
  body: string;
  privacyClass: string;
  allowRemember: boolean;
  runScope?: string;
  /** Pilot mode pre-selects the run scope, so one answer covers the rest of the run. */
  runDefault?: boolean;
  sessionId?: string;
};
export type ToolQuestion = { id: string; sessionId: string; question: string; options: string[] };
export type PlanStep = { label: string; action?: boolean };
/** Native workflows of the harness (electron/workflows.ts), picked in the composer. */
export type Workflow = 'plan' | 'execute' | 'requirements' | 'diagnose';
export type WorkTask = { title: string; status: 'todo' | 'doing' | 'done' | 'blocked'; note?: string };
export type WorkPlan = { goal: string; tasks: WorkTask[]; approvedAt?: string };
/** Pages open in the Web tab (electron/browser-dock.ts): the assistant's and the employee's own. */
export type BrowserDockTab = { id: string; title: string; url: string; kind: 'agent' | 'manual'; loading: boolean };
export type BrowserDockState = { tabs: BrowserDockTab[]; active: string; focus?: boolean };
/** The in-app updater's state (electron/updater.ts). */
export type UpdateState = {
  status: 'disabled' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'manual' | 'error';
  current: string;
  version?: string;
  percent?: number;
  reason?: string;
  url?: string;
  checkedAt?: string;
};
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
    | 'trace'
    | 'browser'
    | 'update';
  browser?: BrowserDockState;
  update?: UpdateState;
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
