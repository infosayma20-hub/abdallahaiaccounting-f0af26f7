// AES-GCM encryption for WhatsApp channel tokens. Key = WA_TOKEN_KEY secret.
const enc = new TextEncoder();
const dec = new TextDecoder();

async function key(): Promise<CryptoKey> {
  const raw = Deno.env.get("WA_TOKEN_KEY");
  if (!raw) throw new Error("WA_TOKEN_KEY missing");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(token)));
  return { ciphertext: b64(ct), iv: b64(iv) };
}

export async function decryptToken(ciphertext: string, iv: string) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ciphertext));
  return dec.decode(pt);
}
