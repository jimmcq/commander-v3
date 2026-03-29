/**
 * Encryption utilities for sensitive data (LLM API keys, bot passwords).
 * AES-256-GCM with a server-side key from environment variable.
 */

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "spacemolt-dev-key-32chars-change!";

/** Ensure key is exactly 32 bytes for AES-256 */
function getKey(): Uint8Array {
  const key = new TextEncoder().encode(ENCRYPTION_KEY);
  if (key.length >= 32) return key.slice(0, 32);
  // Pad short keys (dev only — production must use 32+ char key)
  const padded = new Uint8Array(32);
  padded.set(key);
  return padded;
}

/** Encrypt a string. Returns base64 encoded "iv:ciphertext:tag" */
export async function encrypt(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", getKey(), "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a string from base64 "iv:ciphertext:tag" format */
export async function decrypt(ciphertext: string): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const key = await crypto.subtle.importKey("raw", getKey(), "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);

  return new TextDecoder().decode(decrypted);
}
