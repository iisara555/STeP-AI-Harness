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
  /** Time of the last successful text response test; older connections may not have one. */
  testedAt?: string;
  /** Snapshot-only: current policy prevents use; the stored test result remains intact. */
  policyBlocked?: boolean;
  note: string;
  /** Error code of the last failed connect, or LOGIN_REQUIRED after a chat found the sign-in expired; cleared by a passing test. */
  problem?: string;
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
  /** Staff credited for an organization Skill (manifest contributors, written only with their consent). */
  contributors?: { name: string; team?: string; date?: string }[];
};
/** A Skill Pack imported on this computer, as packList returns it; credit stays beside the pack, never in its files. */
export type OwnPack = {
  id: string;
  enabled: boolean;
  personal?: boolean;
  invalid?: boolean;
  skills: { id: string }[];
  credit?: { name: string; team?: string; uploadedAt: string };
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
export type ToolTrace = { id: string; tool: string; ok: boolean; code?: string; ms: number };
/** A host-confirmed tool event, with no paths, arguments or source content. */
export type WorkAction = { id: string; tool: string; state: 'running' | 'done' | 'failed'; code?: string };
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
  tools?: ToolTrace[];
  providerCalls?: ProviderCallTrace[];
};
/** Host text estimates and provider observations stay separate. No task text is persisted here. */
export type ProviderCallTrace = {
  kind: 'answer' | 'summary' | 'web-search' | 'check' | 'vision' | 'selection' | 'document-selection' | 'subagent';
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
  workflow?: Workflow;
  route: string;
  outcome: string;
  code?: string;
  ms: number;
  steps: StepTrace[];
  skillSelection?: { method: 'router' | 'model' | 'previous' | 'fallback'; skill?: string };
  /** Documents an AI picked from the STeP knowledge registry before the answer, when keyword search was not strong. */
  documentSelection?: { documents: string[] };
  /** Reasoning level sent for this run: the employee's choice, or picked by task size (auto). No level means the model default. */
  effort?: { size: 'small' | 'medium' | 'large'; auto: boolean; level?: string };
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
  /** Titles of the STeP documents the answer drew on: strong matches given to the AI and documents it opened. */
  docSources?: string[];
  /** Policy answerCheck: statements about STeP that the document excerpts did not support (empty: all supported). */
  check?: { unsupported: { claim: string; reason: string }[] };
  /** When the background answer check of this answer started; removed when its result (or failure) is saved. */
  checkPending?: string;
  /** Files the AI wrote in this answer: applied to the workspace, or staged for review in the changes tab (id). */
  written?: { path: string; id: string; status: 'applied' | 'staged' }[];
  /** The note a drafting run leaves in chat; the document itself is the proposal, so this is never opened as one. */
  draftSummary?: boolean;
  /** What this answer created or changed in Google Workspace (completed writes only), listed under it. */
  google?: import('./google-changes').GoogleChange[];
  /** Artifacts the AI saved in this answer's run, opened from the answer (IPC artifactOpen). */
  artifacts?: ArtifactRef[];
};
/** A file sent in a chat: its checked, masked text stays with the conversation. */
export type ConversationFile = { name: string; text: string; at: string };
export type DraftVersion = {
  revision: number;
  text: string;
  document?: DraftNode;
  presentation?: import('./document-presentation').DocumentPresentation;
  at: string;
};
export type Proposal = {
  id: string;
  text: string;
  review?: string;
  document?: DraftNode;
  baseRevision: number;
  sources: string[];
  at: string;
};
export type DocumentTemplateInfo = { key: string; sha256: string; name: string; font: string };
export type SummaryCheckpoint = { covered: number; prefixHash: string; text: string };
export type Session = {
  /** Read-only answers from a frozen task snapshot; never become document edits or main-task history. */
  sideQuestions?: {
    id: string;
    question: string;
    answer?: string;
    docSources?: string[];
    check?: Message['check'];
    code?: string;
    revision: number;
    at: string;
    status: 'running' | 'completed' | 'error';
  }[];
  /** The selected form's Skill/template contract, retained for revisions and retry. */
  documentTool?: DocumentToolId;
  /** Reference to a private, host-owned DOCX snapshot; bytes never go to the renderer or AI. */
  documentTemplate?: DocumentTemplateInfo;
  /** Checks for an accepted AI draft, kept outside editable/exported document content. */
  documentReview?: { text: string; revision: number };
  parentId?: string;
  loadedContext?: string[];
  compaction?: { before: number; after: number; method: string; at: string };
  contextCheckpoint?: SummaryCheckpoint;
  longTask?: {
    status: 'running' | 'completed' | 'blocked' | 'budget' | 'paused' | 'interrupted';
    rounds: number;
    maxRounds: number;
    maxTokens: number;
    maxMs: number;
    startedAt: string;
    reason?: string;
  };
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
  presentation?: import('./document-presentation').DocumentPresentation;
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
  /** A document's own request, set aside while chat turns answer beside it; the next document edit resumes it. */
  documentTask?: { originalQuery: string; answers: string[]; followUps: string[]; skill?: string; contextStart?: number };
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
  vaultSources?: { onepassword?: boolean; bitwarden?: boolean };
  /** Development mode (Settings → AI): Claude Pro/Max for developers testing; policy features.developmentMode allows it. */
  developmentMode?: boolean;
  /** Background review follows the release default when unset; explicit false preserves the employee's opt-out. IT may deny it. */
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
  /** Preferred chat reply language; independent of UI language. Explicit requests can override it. */
  chatLanguage?: 'auto' | 'th' | 'en';
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
  /** How it was proposed: typed by the employee, picked up from a chat, or a "needs fixing" note. Absent on older files. */
  origin?: 'manual' | 'chat' | 'feedback';
  /** The task it came from, for a confirmed proposal. */
  origin_session?: string;
  /** The employee's own words it rests on, privacy-checked, at most 300 characters. */
  origin_evidence?: string;
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
  features?: { claudeSubscription?: boolean; providerPresets?: boolean; developmentMode?: boolean; developmentPasscode?: boolean };
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
  /** Configured managed servers only; no credentials or external-access guarantee. */
  mcpServers?: number;
  pilot?: boolean;
  checks?: { authority: boolean; privacy: boolean };
};
export type DiagnosticLevel = 'error' | 'warning' | 'info';
/** A sanitized diagnostic event; request, draft, credential and file contents never belong here. */
export type DiagnosticEntry = {
  at: string;
  event: string;
  level: DiagnosticLevel;
  code?: string;
  provider?: string;
  model?: string;
  outcome?: string;
  detail?: string;
  ms?: number;
};
export type DiagnosticsSnapshot = {
  generatedAt: string;
  path: string;
  sizeBytes: number;
  entries: DiagnosticEntry[];
  counts: { error: number; warning: number; info: number };
  system: { appVersion: string; platform: string; arch: string; node: string; electron: string; packaged: boolean };
  policy: { source: PolicySnapshot['source']; path: string; problems: string[]; enabledFeatures: string[] };
  connections: {
    provider: Provider;
    label: string;
    model: string;
    baseUrl?: string;
    ready: boolean;
    policyBlocked?: boolean;
    problem?: string;
    testedAt?: string;
  }[];
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
  /** Short facts for staff (length, masking), shown as a list instead of raw data. */
  facts?: { label: string; value: string }[];
  /** The masked text to check before agreeing, in readable form. */
  preview?: string;
  /** The exact masked payload, folded away for administrators. */
  technical?: string;
};
export type ToolQuestion = { id: string; sessionId: string; question: string; options: string[] };
export type PlanStep = { label: string; action?: boolean };
/** Native workflows of the harness (electron/workflows.ts), picked in the composer. */
export type Workflow = 'assistant' | 'plan' | 'execute' | 'requirements' | 'diagnose' | 'coding';
export type WorkTask = {
  title: string;
  status: 'todo' | 'doing' | 'done' | 'blocked';
  note?: string;
  /** The employee's comment on this task (src/work-plan.tsx), followed when the plan is revised or carried out. */
  comment?: string;
};
export type WorkPlan = { goal: string; tasks: WorkTask[]; approvedAt?: string };
/** Pages open in the Web tab (electron/browser-dock.ts): the assistant's and the employee's own. */
export type BrowserDockTab = {
  id: string;
  title: string;
  url: string;
  kind: 'agent' | 'manual';
  loading: boolean;
  preview?: boolean;
  fit?: boolean;
};
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
    | 'discard'
    | 'reasoning'
    | 'status'
    | 'activity'
    | 'work-action'
    | 'heartbeat'
    | 'changed'
    | 'side-question'
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
    | 'update'
    | 'vault-open'
    | 'vault-prompt'
    | 'vault-prompt-close';
  vaultPrompt?: import('./vault-prompt').VaultPrompt;
  browser?: BrowserDockState;
  update?: UpdateState;
  question?: ToolQuestion;
  questionId?: string;
  approval?: ApprovalRequest;
  approvalId?: string;
  text?: string;
  /** For discard: how many characters of the streamed answer to take back. */
  count?: number;
  trace?: RunTrace;
  workAction?: WorkAction;
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
/** Maintenance board (electron/maintenance.ts): local checks of memories, lessons and Skill Packs, no model call. */
export type MaintenanceKind =
  | 'memory-expired'
  | 'memory-stale'
  | 'memory-ephemeral'
  | 'memory-duplicate'
  | 'lesson-repeated'
  | 'lesson-fix'
  | 'lesson-unused'
  | 'lesson-ephemeral'
  | 'lesson-duplicate'
  | 'pack-invalid'
  | 'pack-review';
export type MaintenanceFinding = {
  id: string;
  kind: MaintenanceKind;
  area: 'memory' | 'lesson' | 'skill';
  /** What the item is about (`memory:scope:id`, `lesson:id`, `pack:id`); two for a duplicate pair. */
  targets: string[];
  name: string;
  count?: number;
};
export type MaintenanceStatus = 'todo' | 'doing' | 'done' | 'dismissed';
export type MaintenanceItem = MaintenanceFinding & {
  status: MaintenanceStatus;
  foundAt: string;
  updatedAt: string;
  resolvedAt?: string;
  /** check: a later check no longer found it; person: moved to done and the check agreed. */
  resolvedBy?: 'check' | 'person';
  /** Marked done earlier, but the check still finds the problem. */
  reopened?: boolean;
};
export type MaintenanceBoard = { checkedAt: string; items: MaintenanceItem[] };

/** An artifact the AI saved for a task; the content stays in the artifact store and opens on request. */
export type ArtifactRef = { id: string; title: string; kind: 'markdown' | 'html' | 'mermaid' | 'table' | 'code' | 'json'; version: number };
