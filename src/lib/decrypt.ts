// Client-side decryption for the encrypted "red core" notes. The site only ever ships ciphertext;
// the passphrase is shared out of band and lives only in memory after the reader types it (never
// localStorage, never the repo). AES-256-GCM with a PBKDF2-SHA-256 derived key — the exact scheme
// scripts/encrypt-notes.mjs writes. GCM's auth tag means a wrong passphrase, or tampered ciphertext,
// makes decrypt() throw, so a failed attempt reveals nothing about the plaintext.
export type Vault = {
	id: string;
	label?: string; // public, safe-by-choice; shown on the locked sphere
	sys?: number;
	v: number;
	iter: number;
	salt: string; // base64
	iv: string; // base64
	ct: string; // base64
};
export type Plain = { title: string; body: string };

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iter: number) {
	const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['decrypt'],
	);
}

/** Decrypt one vault entry. Throws on a wrong passphrase, tampered data, or no secure context. */
export async function decryptNote(entry: Vault, passphrase: string): Promise<Plain> {
	if (!globalThis.crypto?.subtle) throw new Error('insecure-context');
	const key = await deriveKey(passphrase, b64ToBytes(entry.salt), entry.iter);
	const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(entry.iv) }, key, b64ToBytes(entry.ct));
	const obj = JSON.parse(new TextDecoder().decode(pt)) as Partial<Plain>;
	return { title: String(obj.title ?? ''), body: String(obj.body ?? '') };
}
