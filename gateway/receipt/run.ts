import { readFile } from 'node:fs/promises';
import { createReceiptCloud } from './service';
import { FirestoreReceiptQuota } from './firestore-quota';
const secret = async (name: string) =>
  process.env[name + '_FILE'] ? (await readFile(process.env[name + '_FILE']!, 'utf8')).trim() : process.env[name] || '';
const config = {
  key: await secret('GEMINI_API_KEY'),
  quotaSalt: await secret('QUOTA_HMAC_KEY'),
  model: process.env.GEMINI_MODEL || '',
  clientIds: (process.env.GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  domains: (process.env.GOOGLE_DOMAINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  daily: Number(process.env.MAX_DAILY_REQUESTS || 200),
  perUser: Number(process.env.MAX_USER_DAILY_REQUESTS || 20),
  concurrency: 4,
};
const server = createReceiptCloud(config, new FirestoreReceiptQuota(process.env.GOOGLE_CLOUD_PROJECT || ''));
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => {
  server.close();
  setTimeout(() => process.exit(0), 10_000).unref();
});
