/**
 * Credenciais sociais cifradas em repouso (§17): AES-256-GCM com chave de
 * CREDENTIALS_ENCRYPTION_KEY (32 bytes em base64). Nunca registrar o texto
 * claro em logs; nunca enviar ao agente ou ao front-end.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error('CREDENTIALS_ENCRYPTION_KEY não configurada');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY deve ter 32 bytes (base64)');
  return buf;
}

export function encryptCredentials(value: Record<string, unknown>, keyOverride?: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOverride ?? key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptCredentials<T = Record<string, unknown>>(payload: string, keyOverride?: Buffer): T {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato de credencial desconhecido');
  const decipher = createDecipheriv('aes-256-gcm', keyOverride ?? key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as T;
}
