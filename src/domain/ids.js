import { randomBytes, randomUUID } from 'node:crypto';
import { DomainError } from './errors.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newId() {
  return randomUUID();
}

export function newReference(length = 8) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 64) {
    throw new DomainError('VALIDATION', 'Reference length must be a whole number between 1 and 64');
  }

  const bytes = randomBytes(length);
  let reference = '';
  for (const byte of bytes) {
    reference += ALPHABET[byte % ALPHABET.length];
  }
  return reference;
}

export const referenceCode = newReference;
