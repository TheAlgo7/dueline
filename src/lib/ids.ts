const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 16 random base-36 characters. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += ALPHABET[b % 36];
  return s;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
