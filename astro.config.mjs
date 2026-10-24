// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

/**
 * @param {string} name @param {string} cssVariable @param {string[]} fallbacks
 * @param {(number | string)[]} weights @param {boolean} italic
 */
const fontsource = (name, cssVariable, fallbacks, weights, italic = false) => ({
	provider: fontProviders.fontsource(),
	name,
	cssVariable,
	weights: /** @type {[number | string]} */ (weights),
	styles: /** @type {['normal'] | ['normal', 'italic']} */ (italic ? ['normal', 'italic'] : ['normal']),
	fallbacks,
});

const el = (tagName, className, children = [], properties = {}) => ({
	type: 'element',
	tagName,
	properties: { className: [className], ...properties },
	children,
});

// Wraps every highlighted block in a terminal-style frame: dots, language label, copy button.
/** @type {import('shiki').ShikiTransformer} */
const codeFrame = {
	name: 'code-frame',
	root(root) {
		const lang = this.options.lang === 'plaintext' ? 'text' : this.options.lang;
		const bar = el('div', 'code-bar', [
			el('span', 'code-lang', [{ type: 'text', value: lang }]),
			el('button', 'code-copy', [{ type: 'text', value: 'Copy' }], { type: 'button' }),
		]);
		return { type: 'root', children: [el('div', 'code-frame', [bar, ...root.children])] };
	},
};

export default defineConfig({
	site: 'https://notdeadcaller.github.io',
	integrations: [mdx(), sitemap()],
	// never inline scripts or assets: the CSP only allows files served from the site itself
	vite: { build: { assetsInlineLimit: 0 } },
	redirects: {
		'/blog': '/writeups/',
		'/blog/brute-forcing-otp-no-rate-limit': '/writeups/brute-forcing-otp-no-rate-limit/',
	},
	markdown: {
		shikiConfig: { theme: 'poimandres', transformers: [codeFrame] },
	},
	fonts: [
		fontsource('Big Shoulders', '--font-shoulders', ['sans-serif'], ['500 900']),
		fontsource('Source Serif 4', '--font-serif', ['serif'], ['400 700'], true),
		fontsource('Fragment Mono', '--font-fragment', ['monospace'], [400]),
		// note-card titles only (Fallout 4's Pip-Boy face)
		fontsource('Roboto Condensed', '--font-condensed', ['sans-serif'], [500]),
	],
});
