import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Calculate SHA-256 hash of a file
 * @param {string} filePath 
 * @returns {Promise<string>}
 */
export async function calculateFileSha256(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Calculate SHA-256 hash of a string or buffer
 * @param {string|Buffer} content 
 * @returns {string}
 */
export function calculateSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}
