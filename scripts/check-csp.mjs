// Post-build guard for the meta-tag CSP in Base.astro. Fails the build if any page in dist/ ships
// something the policy would block (so a feature silently breaks) or the policy itself is weakened.
// Runs a mutation self-test first, so a checker that stops catching things fails too.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ORIGIN = 'https://notdeadcaller.github.io';
const CSP_META = /<meta\s+http-equiv="content-security-policy"\s+content="([^"]*)"\s*\/?>/gi;

export function policyProblems(policy) {
	const problems = [];
	const directives = new Map();
	for (const part of policy.split(';').map((p) => p.trim()).filter(Boolean)) {
		const [name, ...sources] = part.split(/\s+/);
		if (directives.has(name)) problems.push(`duplicate directive ${name} (browsers ignore the second)`);
		directives.set(name, sources);
	}
	const exactly = (name, expected) => {
		const got = directives.get(name)?.join(' ');
		if (got !== expected) problems.push(`${name} must be ${expected}, got ${got ?? 'nothing'}`);
	};
	exactly('default-src', "'self'");
	exactly('script-src', "'self'");
	exactly('object-src', "'none'");
	exactly('base-uri', "'none'");
	for (const [name, sources] of directives) {
		for (const source of sources) {
			if (/^(\*|https?:|data:|blob:|'unsafe-eval'|'unsafe-hashes'|'wasm-unsafe-eval')$/i.test(source) || source.includes('*'))
				problems.push(`${name} allows ${source}`);
		}
	}
	return problems;
}

export function pageProblems(html) {
	const problems = [];
	const tags = html.match(/<[a-z][^>]*>/gi) ?? [];
	const redirect = /<meta\s+http-equiv="refresh"/i.test(html);
	const metas = [...html.matchAll(CSP_META)];
	if (redirect) {
		if (/<script/i.test(html)) problems.push('redirect stub contains a script');
	} else if (metas.length !== 1) {
		problems.push(`expected one CSP meta, found ${metas.length}`);
	} else {
		// a policy only covers what comes after it in the document
		const first = html.search(/<(script|link|style|img|audio|video|iframe)\b/i);
		if (first !== -1 && first < metas[0].index) problems.push('CSP meta comes after a script, style or resource');
		problems.push(...policyProblems(metas[0][1].replaceAll('&#39;', "'").replaceAll('&quot;', '"')));
	}
	for (const tag of tags) {
		const name = tag.match(/^<([a-z0-9-]+)/i)[1].toLowerCase();
		const attr = (a) => tag.match(new RegExp(`\\s${a}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((v) => v !== undefined);
		const external = (url) => url !== undefined && /^(https?:)?\/\//i.test(url.trim()) && !url.trim().startsWith(`${ORIGIN}/`);
		if (/\son[a-z]+\s*=/i.test(tag)) problems.push(`inline event handler: ${tag.slice(0, 80)}`);
		for (const a of ['href', 'src', 'action', 'formaction', 'xlink:href']) {
			// browsers strip whitespace and control characters before reading the scheme
			if (/^javascript:/i.test((attr(a) ?? '').replace(/[\s\x00-\x1f]|&#(x0*9|x0*a|x0*d|0*9|0*10|0*13);/gi, '')))
				problems.push(`javascript: URL: ${tag.slice(0, 80)}`);
		}
		if (name === 'script') {
			const type = (attr('type') ?? '').toLowerCase();
			const src = attr('src');
			if (src === undefined && type !== 'application/ld+json') problems.push('inline script');
			if (external(src)) problems.push(`external script: ${src}`);
		}
		if (['iframe', 'object', 'embed', 'frame'].includes(name)) problems.push(`<${name}> is not allowed`);
		if (['img', 'audio', 'video', 'source', 'track', 'input'].includes(name) && external(attr('src')))
			problems.push(`external ${name}: ${attr('src')}`);
		if (name === 'link' && /stylesheet|preload|modulepreload|icon|manifest/i.test(attr('rel') ?? '') && external(attr('href')))
			problems.push(`external ${attr('rel')}: ${attr('href')}`);
	}
	return problems;
}

function selfTest() {
	const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'";
	const page = (head = '', body = '', policy = csp) =>
		`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="content-security-policy" content="${policy}">${head}</head><body>${body}</body></html>`;
	const good = page('<script type="module" src="/_astro/a.js"></script><link rel="stylesheet" href="/_astro/a.css">', '<a href="https://github.com/x">x</a><script type="application/ld+json">{}</script>');
	const fails = (html) => pageProblems(html).length > 0;
	if (fails(good)) throw new Error(`self-test: clean page flagged: ${pageProblems(good)}`);
	if (fails('<meta http-equiv="refresh" content="0;url=/x/">')) throw new Error('self-test: redirect stub flagged');
	const mutants = {
		'no CSP': good.replace(/<meta http-equiv="content-security-policy"[^>]*>/, ''),
		'two CSPs': page(`<meta http-equiv="content-security-policy" content="${csp}">`),
		'CSP after script': good.replace(/(<meta http-equiv="content-security-policy"[^>]*>)(.*?<\/script>)/, '$2$1'),
		'inline script': page('<script>alert(1)</script>'),
		'inline module': page('<script type="module">alert(1)</script>'),
		'handler': page('', '<button onclick="print()">p</button>'),
		'handler unquoted': page('', '<img src=/a.png onerror=alert(1)>'),
		'handler uppercase': page('', '<body ONLOAD="x()">'),
		'javascript href': page('', '<a href="javascript:alert(1)">x</a>'),
		'javascript obfuscated': page('', '<a href=" jav&#x09;ascript:alert(1)">x</a>'),
		'external script': page('<script src="https://cdn.example/x.js"></script>'),
		'protocol-relative script': page('<script src="//cdn.example/x.js"></script>'),
		'look-alike origin': page(`<script src="${ORIGIN}.evil.com/x.js"></script>`),
		'external stylesheet': page('<link rel="stylesheet" href="https://fonts.example/x.css">'),
		'external image': page('', '<img src="https://track.example/p.gif">'),
		'iframe': page('', '<iframe src="/x"></iframe>'),
		'script in redirect': '<meta http-equiv="refresh" content="0;url=/x/"><script>x()</script>',
		'unsafe-inline script': page('', '', csp.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")),
		'unsafe-eval': page('', '', csp.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")),
		'wildcard host': page('', '', `${csp}; img-src *.example.com`),
		'https: scheme': page('', '', `${csp}; connect-src https:`),
		'data: images': page('', '', `${csp}; img-src 'self' data:`),
		'no object-src': page('', '', csp.replace("; object-src 'none'", '')),
		'no base-uri': page('', '', csp.replace("; base-uri 'none'", '')),
		'duplicate directive': page('', '', `${csp}; script-src *`),
	};
	const survivors = Object.entries(mutants).filter(([, html]) => !fails(html)).map(([name]) => name);
	if (survivors.length) throw new Error(`self-test: checker missed ${survivors.join(', ')}`);
	return Object.keys(mutants).length;
}

async function* htmlFiles(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* htmlFiles(path);
		else if (entry.name.endsWith('.html')) yield path;
	}
}

const mutants = selfTest();
const failures = [];
const policies = new Set();
let pages = 0;
for await (const file of htmlFiles('dist')) {
	const html = await readFile(file, 'utf8');
	pages++;
	for (const problem of pageProblems(html)) failures.push(`${file}: ${problem}`);
	for (const [, policy] of html.matchAll(CSP_META)) policies.add(policy);
}
// the client router keeps the first page's policy for the whole visit, so every page must agree
if (policies.size > 1) failures.push(`pages ship ${policies.size} different policies`);
for (const file of (await readdir('dist/_astro')).filter((f) => f.endsWith('.css'))) {
	const css = await readFile(join('dist/_astro', file), 'utf8');
	if (/@import|url\(\s*["']?(https?:|\/\/|data:)/i.test(css)) failures.push(`dist/_astro/${file}: external or data: URL in CSS`);
}
if (pages === 0) failures.push('no HTML found in dist/');
if (failures.length) {
	console.error(`CSP check failed:\n  ${failures.join('\n  ')}`);
	process.exit(1);
}
console.log(`CSP check: ${pages} pages clean, ${mutants} mutants caught`);
