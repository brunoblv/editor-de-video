import { createHash } from 'node:crypto';
import { stableStringify } from '@editor-video/timeline/compile';

export { stableStringify };

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashObject(value: unknown): string {
  return sha256(stableStringify(value));
}

/** ID estável e curto derivado de uma origem — usado na migração idempotente. */
export function stableId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${sha256(parts.join('\u0000')).slice(0, 24)}`;
}
