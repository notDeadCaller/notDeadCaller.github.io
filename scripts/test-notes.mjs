// Guards the encrypted-notes crypto contract shared by scripts/encrypt-notes.mjs (writer) and
// src/lib/decrypt.ts (reader): PBKDF2-SHA-256 -> AES-256-GCM round-trips, and any wrong passphrase
// or tampered field is rejected (GCM auth) — never a silent wrong plaintext. Zero deps:
//   node scripts/test-notes.mjs
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const ITER = 600000;
const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));

async function key(pass, salt, usage) {
	const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
	return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
async function encrypt(pass, obj) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt, 'encrypt'), te.encode(JSON.stringify(obj))));
	return { v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function decrypt(pass, e) {
	const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, await key(pass, unb64(e.salt), 'decrypt'), unb64(e.ct));
	return JSON.parse(td.decode(pt));
}

let fails = 0;
const ok = (cond, name) => {
	console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
	if (!cond) fails++;
};
const rejects = async (p, name) => {
	try {
		await p;
		ok(false, name);
	} catch {
		ok(true, name);
	}
};
const flip = (s) => {
	const u = unb64(s);
	u[0] ^= 1;
	return b64(u);
};

const PASS = 'correct horse battery staple';
const payload = { title: 'T', body: 'hello **world** `code`' };
const e = await encrypt(PASS, payload);

ok(JSON.stringify(await decrypt(PASS, e)) === JSON.stringify(payload), 'round-trip with correct passphrase');
await rejects(decrypt('wrong passphrase', e), 'wrong passphrase rejected');
await rejects(decrypt(PASS, { ...e, ct: flip(e.ct) }), 'tampered ciphertext rejected');
await rejects(decrypt(PASS, { ...e, iv: flip(e.iv) }), 'tampered IV rejected');
await rejects(decrypt(PASS, { ...e, salt: flip(e.salt) }), 'tampered salt rejected');
await rejects(decrypt(PASS, { ...e, ct: e.ct.slice(0, -8) }), 'truncated ciphertext rejected');

// the committed vault must carry ciphertext only — no plaintext titles/bodies in clear
if (existsSync('src/data/encrypted-notes.json')) {
	const raw = readFileSync('src/data/encrypted-notes.json', 'utf8');
	const entries = JSON.parse(raw);
	ok(
		entries.every((x) => x.salt && x.iv && x.ct && !('title' in x) && !('body' in x)),
		'committed vault is ciphertext only (no title/body fields)',
	);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
