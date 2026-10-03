// Well-known AI services reached through the OpenAI-compatible (or Anthropic Messages) API, each fixed to its official
// endpoint. An employee picks one and adds their own key, like any other connection; a free-form endpoint stays an
// administrator-approved choice (policy providers.compatible). Policy feature providerPresets turns these off.

export type ProviderPreset = {
  id: string;
  label: string;
  /** One line on what the service is, shown on its tile. */
  description: string;
  baseUrl: string;
  protocol: 'openai' | 'anthropic';
  /** 'none' for a service on this computer (Ollama), which needs no key. */
  key: 'required' | 'none';
  /** The service can issue a key through its own sign-in page (OAuth PKCE), so the employee need not copy one. */
  signIn?: 'openrouter';
  /** Used when it is in the service's model list and the employee chose no model. */
  defaultModel: string;
  /** Where the employee creates a key. */
  keyUrl?: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'โมเดลหลายร้อยตัวจากหลายบริษัทในบัญชีเดียว',
    baseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'openai',
    key: 'required',
    signIn: 'openrouter',
    defaultModel: 'openrouter/auto',
    keyUrl: 'https://openrouter.ai/settings/keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'โมเดลคุยและให้เหตุผลราคาประหยัด',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai',
    key: 'required',
    defaultModel: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'โมเดลเปิด ตอบเร็วมาก',
    baseUrl: 'https://api.groq.com/openai/v1',
    protocol: 'openai',
    key: 'required',
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    description: 'โมเดลจากยุโรป',
    baseUrl: 'https://api.mistral.ai/v1',
    protocol: 'openai',
    key: 'required',
    defaultModel: 'mistral-large-latest',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    description: 'โมเดล Grok ของ xAI',
    baseUrl: 'https://api.x.ai/v1',
    protocol: 'openai',
    key: 'required',
    defaultModel: '',
    keyUrl: 'https://console.x.ai',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'โมเดลที่รันในเครื่องนี้ ข้อมูลไม่ออกนอกเครื่อง',
    baseUrl: 'http://127.0.0.1:11434/v1',
    protocol: 'openai',
    key: 'none',
    defaultModel: '',
    keyUrl: 'https://ollama.com/download',
  },
];

export const presetFor = (id: unknown) => (typeof id === 'string' ? PROVIDER_PRESETS.find(p => p.id === id) : undefined);

/** The model to use: the employee's choice, else the preset's default when the service lists it, else its first model. */
export function pickModel(chosen: string, preset: ProviderPreset, available: string[]) {
  if (chosen.trim()) return chosen.trim();
  if (preset.defaultModel && (!available.length || available.includes(preset.defaultModel))) return preset.defaultModel;
  return available[0] || '';
}
