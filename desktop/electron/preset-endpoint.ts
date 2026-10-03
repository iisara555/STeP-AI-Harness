// Which address a "compatible" connection may send to: a well-known preset at its fixed official endpoint (policy
// feature providerPresets), or else a free-form endpoint an administrator approved (compatibleProviders + profile).
import { approvedProfile, providerEndpoint } from '../../src/modules/providers/compatible.js';
import { presetFor } from '../src/provider-presets';
import type { Policy } from './policy';

type Target = { preset?: string; baseUrl?: string; protocol?: 'openai' | 'anthropic'; model?: string };

/** The preset's endpoint; development tests may point every preset at one local fake service. */
export const presetBaseUrl = (id: string, testBaseUrl?: string) => {
  const preset = presetFor(id);
  if (!preset) throw new Error('INVALID_CONNECTION');
  return testBaseUrl || preset.baseUrl;
};

export function compatibleEndpoint(target: Target, policy: Policy, testBaseUrl?: string): URL {
  if (!target.preset)
    return approvedProfile({ baseUrl: target.baseUrl || '', protocol: target.protocol, model: target.model || '' }, policy);
  const preset = presetFor(target.preset);
  if (!preset) throw new Error('INVALID_CONNECTION');
  if (!policy.features.providerPresets) throw new Error('FEATURE_DISABLED');
  if (policy.network?.proxyUrl) throw new Error('PROVIDER_PROXY_UNAVAILABLE');
  const baseUrl = presetBaseUrl(preset.id, testBaseUrl);
  if ((target.baseUrl || baseUrl) !== baseUrl || (target.protocol || preset.protocol) !== preset.protocol)
    throw new Error('PROVIDER_DESTINATION_DENIED');
  return providerEndpoint(baseUrl, preset.protocol);
}
