// Local-only: turn plaintext notes in private/notes/*.md into committed ciphertext at
// src/data/encrypted-notes.json. NEVER run in CI. The passphrase comes from NOTES_PASSPHRASE and is
// never written anywhere; private/ is git-ignored, so the plaintext never leaves your machine.
//
//   NOTES_PASSPHRASE='your long passphrase' node scripts/encrypt-notes.mjs
//
// Scheme (must match src/lib/decrypt.ts): PBKDF2-SHA-256 (600k) -> AES-256-GCM, per-note random
// salt + IV. Title and body are both inside the ciphertext — nothing sensitive ships in clear.
import { webcrypto as crypto } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'private/notes';
const OUT = 'src/data/encrypted-notes.json';
const ITER = 600000;

const pass = process.env.NOTES_PASSPHRASE;
if (!pass || pass.length < 8) {
	console.error('Set NOTES_PASSPHRASE (>= 8 chars). The ciphertext is public, so use a strong passphrase.');
	process.exit(1);
}
if (!existsSync(SRC)) {
	console.error(`No ${SRC}/ — put plaintext notes there first.`);
	process.exit(1);
}

const bytesToB64 = (u8) => Buffer.from(u8).toString('base64');

// minimal frontmatter: --- key: value ... --- then body. Supports title, label (public), sys.
function parse(md) {
	const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) return { data: {}, body: md.trim() };
	const data = {};
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
	}
	return { data, body: m[2].trim() };
}

async function encryptPayload(title, body) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
	const key = await crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt'],
	);
	const pt = new TextEncoder().encode(JSON.stringify({ title, body }));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
	return { v: 1, iter: ITER, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
}

const files = readdirSync(SRC)
	.filter((f) => f.endsWith('.md'))
	.sort();
const out = [];
for (const f of files) {
	const { data, body } = parse(readFileSync(join(SRC, f), 'utf8'));
	const id = f.replace(/\.md$/, '');
	const entry = { id, ...(await encryptPayload(data.title ?? id, body)) };
	if (data.label) entry.label = data.label; // public, safe-by-choice
	if (data.sys != null && data.sys !== '') entry.sys = Number(data.sys);
	out.push(entry);
}
writeFileSync(OUT, JSON.stringify(out, null, '\t') + '\n');
console.log(`Encrypted ${out.length} note(s) -> ${OUT}`);
