// "AI ขององค์กร": the organization's AI gateway (STeP-AI-Webapp `npm run ai-gateway`), which holds the organization's
// OpenRouter key on its server. Desktop sends the employee's organization Google ID token instead of a key, so no AI
// key is ever on an employee's computer. Public routing only: no credential, query or redirect can enter here.
export type OrganizationAiConfig = { url: string };

/** The gateway's base address (HTTPS, optional path such as /ai), without a trailing slash; undefined if unsafe. */
export function parseOrganizationAiConfig(value: unknown): OrganizationAiConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => k !== 'url') || typeof v.url !== 'string' || v.url.length > 300) return undefined;
  // Dot segments and backslashes would be normalized away by URL; an address that needs normalizing is refused.
  if (/\.\.|\\|\/\.\//.test(v.url)) return undefined;
  try {
    const url = new URL(v.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(url.hostname) ||
      !/^(\/[a-z0-9_-]{1,40}){0,3}\/?$/i.test(url.pathname)
    )
      return undefined;
    return { url: (url.origin + url.pathname).replace(/\/$/, '') };
  } catch {
    return undefined;
  }
}

/** The OpenAI-compatible base URL Desktop's compatible transport appends /chat/completions and /models to. */
export const organizationAiBaseUrl = (config: OrganizationAiConfig) => config.url + '/v1';
