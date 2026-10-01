export function managedPolicyPath(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
export function trustedManagedPolicyPath(path: string): boolean;
export function readManagedPolicy(path?: string): Record<string, any>;
