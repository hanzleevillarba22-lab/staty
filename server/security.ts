import crypto from 'node:crypto';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;

  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derivedBuf.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, originalBuf);
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(token)
    .digest('hex');
}

export function generateCsrfToken(): string {
  const nonce = crypto.randomBytes(24).toString('hex');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(nonce)
    .digest('hex');
  return `${nonce}.${sig}`;
}

export function verifyCsrfToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [nonce, sig] = parts;
  if (!nonce || !sig) return false;
  const expected = crypto
    .createHmac('sha256', getSigningSecret())
    .update(nonce)
    .digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function sanitizeText(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(username);
}

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}
