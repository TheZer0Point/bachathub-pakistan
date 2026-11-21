import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MASTER_KEY_PATH = path.resolve(process.cwd(), 'data', '.vault.master.key');

function loadOrCreateMasterKey(): { raw: string; source: 'env' | 'auto_generated' } {
  if (process.env.DATA_ENCRYPTION_KEY && process.env.DATA_ENCRYPTION_KEY.trim().length >= 32) {
    return { raw: process.env.DATA_ENCRYPTION_KEY.trim(), source: 'env' };
  }
  try {
    const dir = path.dirname(MASTER_KEY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(MASTER_KEY_PATH)) {
      const existing = fs.readFileSync(MASTER_KEY_PATH, 'utf8').trim();
      if (existing.length >= 32) {
        return { raw: existing, source: 'auto_generated' };
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(MASTER_KEY_PATH, generated, { encoding: 'utf8', mode: 0o600 });
    return { raw: generated, source: 'auto_generated' };
  } catch {
    const fallback = crypto
      .createHash('sha256')
      .update(process.env.APP_URL || 'bachathub-pk-local-vault-key')
      .digest('hex');
    return { raw: fallback, source: 'auto_generated' };
  }
}

const KEY_INFO = loadOrCreateMasterKey();
const AES_KEY = crypto.createHash('sha256').update(KEY_INFO.raw).digest();
const KEY_FINGERPRINT = crypto.createHash('sha256').update(AES_KEY).digest('hex').slice(0, 14);
const TOKEN_SIGNING_KEY = crypto.createHash('sha256').update(`session:${KEY_INFO.raw}`).digest();

export function getVaultKeyMeta() {
  return {
    source: KEY_INFO.source,
    fingerprint: KEY_FINGERPRINT,
    algorithm: 'AES-256-GCM' as const,
    bits: 256,
  };
}

export interface EncryptedEnvelope {
  v: 1;
  alg: 'AES-256-GCM';
  iv: string;
  tag: string;
  ciphertext: string;
  sha256: string;
  updatedAt: string;
}

export function encryptPayload<T>(data: T): EncryptedEnvelope {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = encrypted.toString('base64');
  const sha256 = crypto.createHash('sha256').update(ciphertext).digest('hex');

  return {
    v: 1,
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext,
    sha256,
    updatedAt: new Date().toISOString(),
  };
}

export function decryptPayload<T>(envelope: EncryptedEnvelope): T {
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export interface SessionPayload {
  userId: string;
  role: 'user' | 'brand_partner' | 'admin';
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlMs = 1000 * 60 * 60 * 24 * 7): string {
  const full: SessionPayload = { ...payload, exp: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SIGNING_KEY).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', TOKEN_SIGNING_KEY).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export function hashIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex').slice(0, 16);
}

// Regex filters for Pakistani phone numbers, CNICs, URLs, and abusive terms
export const PAK_PHONE_REGEX = /(?:\+?92[\s-]?|0)3\d{2}[\s-]?\d{7}|\b\d{10,13}\b/i;
export const URL_LINK_REGEX = /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|pk|net|org|io|co|xyz|shop|store|me|ly))\S*/i;
export const CNIC_REGEX = /\b\d{5}-\d{7}-\d\b/;
