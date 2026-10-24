import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { decryptCredentials, encryptCredentials } from '../src/v3/crypto.js';

describe('credenciais cifradas (§17)', () => {
  const key = randomBytes(32);

  it('cifra e decifra sem expor texto claro', () => {
    const payload = encryptCredentials({ accessToken: 'ya29.segredo', refreshToken: '1//r' }, key);
    assert.doesNotMatch(payload, /segredo/);
    assert.deepEqual(decryptCredentials(payload, key), { accessToken: 'ya29.segredo', refreshToken: '1//r' });
  });

  it('rejeita payload adulterado ou chave errada', () => {
    const payload = encryptCredentials({ a: 1 }, key);
    const parts = payload.split('.');
    parts[3] = Buffer.from('xx').toString('base64');
    assert.throws(() => decryptCredentials(parts.join('.'), key));
    assert.throws(() => decryptCredentials(payload, randomBytes(32)));
  });
});
