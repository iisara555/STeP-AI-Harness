import type { CSSProperties } from 'react';
import { Plug } from './icons';

// Vite inlines these at build time; unit tests import this file under Node, where there is no glob, and get the plug icon.
let files: Record<string, string> = {};
try {
  files = import.meta.glob<string>('./assets/providers/*.svg', { eager: true, import: 'default' });
} catch {
  files = {};
}
const url = (name: string) => files[`./assets/providers/${name}.svg`];
// Colour marks are drawn as they are; one-colour marks follow the text colour, so they read in light and dark themes.
const MONO = new Set(['copilot', 'groq', 'kimi', 'lmstudio', 'ollama', 'openai', 'openrouter', 'organization', 'xai', 'zai']);

/** The logo key for a connection or a picker choice: a preset's own mark, else the provider's. */
export const providerLogoKey = (c: { provider?: string; preset?: string }) =>
  c.provider === 'compatible' ? c.preset || '' : c.provider || '';

/** A service's mark in a small rounded tile; decorative, because its name is always written beside it. */
export function ProviderLogo({ provider, preset, size = 'md' }: { provider?: string; preset?: string; size?: 'sm' | 'md' }) {
  const key = providerLogoKey({ provider, preset });
  const logo = url(key) ? { url: url(key), mono: MONO.has(key) } : undefined;
  return (
    <span className={`provider-logo ${size}`} aria-hidden="true" data-logo={logo ? key : 'generic'}>
      {!logo ? (
        <Plug size={size === 'sm' ? 14 : 16} />
      ) : logo.mono ? (
        <span className="provider-logo-mark" style={{ '--logo': `url("${logo.url}")` } as CSSProperties} />
      ) : (
        <img src={logo.url} alt="" draggable={false} />
      )}
    </span>
  );
}
