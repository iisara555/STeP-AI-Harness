// Which address a "compatible" connection may send to: a well-known preset at its fixed official endpoint (policy
// feature providerPresets), or else a free-form endpoint an administrator approved (compatibleProviders + profile).
import { approvedProfile, providerEndpoint } from '../../src/modules/providers/compatible.js';
import { ORGANIZATION_PRESET, presetFor } from '../src/provider-presets';
import { organizationAiBaseUrl } from './organization-ai-config';
import type { Policy } from './policy';

type Target = { preset?: string; baseUrl?: string; protocol?: 'openai' | 'anthropic'; model?: string };

/**
 * The preset's endpoint; development tests may point every preset at one local fake service. The organization's
 * gateway comes from policy and is refused where policy sets none or Google sign-in is turned off.
 */
export const presetBaseUrl = (id: string, testBaseUrl?: string, policy?: Policy) => {
  const preset = presetFor(id);
  if (!preset) throw new Error('INVALID_CONNECTION');
  if (preset.id === ORGANIZATION_PRESET.id) {
    if (!policy?.organizationAi || !policy.features.googleWorkspace || !policy.googleWorkspace) throw new Error('FEATURE_DISABLED');
    return testBaseUrl || organizationAiBaseUrl(policy.organizationAi);
  }
  return testBaseUrl || preset.baseUrl;
};

export function compatibleEndpoint(target: Target, policy: Policy, testBaseUrl?: string): URL {
  if (!target.preset)
    return approvedProfile({ baseUrl: target.baseUrl || '', protocol: target.protocol, model: target.model || '' }, policy);
  const preset = presetFor(target.preset);
  if (!preset) throw new Error('INVALID_CONNECTION');
  // The organization's own gateway is not one of the outside services that providerPresets turns off.
  if (!policy.features.providerPresets && preset.id !== ORGANIZATION_PRESET.id) throw new Error('FEATURE_DISABLED');
  if (policy.network?.proxyUrl) throw new Error('PROVIDER_PROXY_UNAVAILABLE');
  const baseUrl = presetBaseUrl(preset.id, testBaseUrl, policy);
  if ((target.baseUrl || baseUrl) !== baseUrl || (target.protocol || preset.protocol) !== preset.protocol)
    throw new Error('PROVIDER_DESTINATION_DENIED');
  return providerEndpoint(baseUrl, preset.protocol);
}
