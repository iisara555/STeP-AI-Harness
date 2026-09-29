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
  mode: 'api' | 'subscription';
  model: string;
  executable: string;
  customRuntime?: boolean;
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
export type Message = { role: 'user' | 'assistant' | 'status'; text: string; at: string };
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
  model?: string;
  effort?: string;
  pinned?: boolean;
  usage?: Usage;
  skill?: string;
  allowedIdentifiers?: string[];
};
export type Settings = {
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
};
export type Attachment = { id: string; name: string; status: string; preview: string; usable: boolean };
export type Snapshot = {
  settings: Settings;
  connections: Connection[];
  sessions: Session[];
  teams: { id: string; name: string }[];
  userFile: string;
};
export type PlanStep = { label: string; action?: boolean };
export type RunEvent = {
  sessionId: string;
  type: 'delta' | 'reasoning' | 'status' | 'changed' | 'auth-code' | 'plan' | 'step' | 'install' | 'connect-progress' | 'failed';
  text?: string;
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
