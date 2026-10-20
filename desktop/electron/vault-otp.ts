import { createHmac } from 'node:crypto';

/** RFC 6238. Secrets stay in the host; a code is never a chat/question response. */
export function totp(input: string, now = Date.now()): string {
  let seed = input.trim(),
    digits = 6,
    period = 30,
    algorithm = 'SHA1';
  if (seed.startsWith('otpauth:')) {
    const url = new URL(seed);
    if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') throw new Error('VAULT_OTP_INVALID');
    seed = url.searchParams.get('secret') || '';
    digits = Number(url.searchParams.get('digits') || 6);
    period = Number(url.searchParams.get('period') || 30);
    algorithm = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase();
  } else if (seed.includes('|')) {
    const parts = seed.split('|');
    seed = parts[0];
    digits = Number(parts[1]);
    period = Number(parts[2]);
    algorithm = parts[3]?.toUpperCase();
  }
  seed = seed.replace(/[\s=-]/g, '').toUpperCase();
  if (
    !/^[A-Z2-7]{16,1024}$/.test(seed) ||
    ![6, 7, 8].includes(digits) ||
    !Number.isInteger(period) ||
    period < 1 ||
    period > 86400 ||
    !['SHA1', 'SHA256', 'SHA512'].includes(algorithm)
  )
    throw new Error('VAULT_OTP_INVALID');
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of seed) {
    value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const key = Buffer.from(bytes),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / period)));
  try {
    const digest = createHmac(algorithm.toLowerCase(), key).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    return String((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
  } finally {
    key.fill(0);
  }
}
