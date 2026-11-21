// Client-side Web Crypto AES-GCM encrypted device cache & personal preferences vault.
// Note: Auth session tokens are NEVER stored here (kept strictly in React memory).

const VAULT_KEY_NAME = 'bh_pk_device_key_v1';
const CACHE_PREFIX = 'bh_pk_enc_';

async function getOrCreateDeviceKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const existing = window.localStorage.getItem(VAULT_KEY_NAME);
    if (existing) {
      const raw = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
      return await window.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    const key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const exported = new Uint8Array(await window.crypto.subtle.exportKey('raw', key));
    let bin = '';
    for (let i = 0; i < exported.length; i++) bin += String.fromCharCode(exported[i]);
    window.localStorage.setItem(VAULT_KEY_NAME, btoa(bin));
    return key;
  } catch {
    return null;
  }
}

export async function saveEncryptedDeviceData<T>(keyName: string, data: T): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const key = await getOrCreateDeviceKey();
    if (!key) return;
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify({ data, savedAt: new Date().toISOString() }));
    const cipherBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const cipherArr = new Uint8Array(cipherBuf);
    let ivBin = '';
    for (let i = 0; i < iv.length; i++) ivBin += String.fromCharCode(iv[i]);
    let cBin = '';
    for (let i = 0; i < cipherArr.length; i++) cBin += String.fromCharCode(cipherArr[i]);
    window.localStorage.setItem(
      `${CACHE_PREFIX}${keyName}`,
      JSON.stringify({ alg: 'AES-GCM-256', iv: btoa(ivBin), ct: btoa(cBin) }),
    );
  } catch {
    // Graceful degradation if storage quota exceeded
  }
}

export async function loadEncryptedDeviceData<T>(keyName: string): Promise<{ data: T; savedAt: string } | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${keyName}`);
    if (!raw) return null;
    const key = await getOrCreateDeviceKey();
    if (!key) return null;
    const parsed = JSON.parse(raw) as { iv: string; ct: string };
    const iv = Uint8Array.from(atob(parsed.iv), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(parsed.ct), (c) => c.charCodeAt(0));
    const plainBuf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plainBuf)) as { data: T; savedAt: string };
  } catch {
    return null;
  }
}

export function clearEncryptedDeviceCache(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
  }
  keysToRemove.forEach((k) => window.localStorage.removeItem(k));
}
