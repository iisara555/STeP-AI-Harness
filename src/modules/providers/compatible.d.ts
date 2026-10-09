export type CompatibleProfile = {
  baseUrl: string;
  protocol?: "openai" | "anthropic";
  model: string;
  maxOutputTokens?: number;
  promptCaching?: "off" | "anthropic-ephemeral";
};
export function providerEndpoint(baseUrl: string, protocol?: string): URL;
export function approvedProfile(profile: CompatibleProfile, policy: any): URL;
export function compatibleRun(
  prompt: string,
  profile: CompatibleProfile,
  context?: any,
  fetcher?: typeof fetch,
): Promise<string>;
