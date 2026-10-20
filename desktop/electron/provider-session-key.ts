import { createHash } from 'node:crypto';
import type { Connection } from '../src/types';
import type { ProviderContext } from './providers';

/** Bound to one account, model, runtime, work directory and instructions; never persisted or logged. */
export function providerSessionKey(connection: Connection, context: ProviderContext) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        connection.provider,
        connection.id,
        connection.mode,
        connection.model,
        connection.executable,
        connection.googleCloudProject,
        context.cwd,
        context.key,
        context.effort,
        context.system,
      ]),
    )
    .digest('hex');
}
