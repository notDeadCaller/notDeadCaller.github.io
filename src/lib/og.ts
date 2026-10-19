// Build-time link-preview images (1200x630 PNG): title, section, description, and a band of the
// page's own ASCII art. Satori lays the card out as SVG with text as paths; sharp rasterises it.
import { readFile } from 'node:fs/promises';
import satori from 'satori';
import sharp from 'sharp';
import { asciiFrame } from './art';

export type OgCard = { title: string; kicker: string; description: string; seed: string; motif?: string };

// night city palette, matching the site's tone indices: 0 muted, 1-5 accent -> accent-2, 6 hot, 7 text
const BG = '#0a0b0e';
const ACCENT = '#fcee0a';
const ACCENT_2 = '#00e6f6';
const MUTED = '#9ba1ab';
const TEXT = '#f4f4ef';
const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => rgb(a).map((c, i) => Math.round(c + (rgb(b)[i] - c) * t));
const TONES = [rgb(MUTED), rgb(ACCENT), mix(ACCENT, ACCENT_2, 0.25), mix(ACCENT, ACCENT_2, 0.5), mix(ACCENT, ACCENT_2, 0.75), rgb(ACCENT_2), rgb('#ff003c'), rgb(TEXT)];

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 800; style: 'normal' }[]> | undefined;
const loadFonts = () =>
	(fonts ??= Promise.all([
		readFile('node_modules/@fontsource/big-shoulders/files/big-shoulders-latin-800-normal.woff').then((data) => ({
			name: 'Big Shoulders',
			data,
			weight: 800 as const,
			style: 'normal' as const,
		})),
		readFile('node_modules/@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff').then((data) => ({
			name: 'Fragment Mono',
			data,
			weight: 400 as const,
			style: 'normal' as const,
		})),
	]));

const el = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } });

/** ASCII rows as spans: consecutive cells of the same colour and brightness share one span. */
function asciiBand(seed: string, motif?: string) {
	const frame = asciiFrame(seed, motif ?? '', 110, 12, 1.9);
	return frame.map((row) => {
		const spans: unknown[] = [];
		let run = '';
		let key = '';
		let color = '';
		const flush = () => {
			if (run) spans.push(el('span', { color }, run));
			run = '';
		};
		for (const cell of row) {
			const level = Math.round(cell.a * 4) / 4;
			const k = cell.ch === ' ' ? 'space' : `${cell.tone}:${level}`;
			if (k !== key) {
				flush();
				key = k;
				color = cell.ch === ' ' ? 'transparent' : `rgba(${TONES[cell.tone].join(',')},${level})`;
			}
			run += cell.ch;
		}
		flush();
		return el('div', { display: 'flex', whiteSpace: 'pre', height: 19, lineHeight: '19px', flexShrink: 0 }, spans);
	});
}

export async function ogImage({ title, kicker, description, seed, motif }: OgCard) {
	// long descriptions are cut at a word boundary
	const blurb = description.length > 150 ? `${description.slice(0, 147).replace(/\s+\S*$/, '')}...` : description;
	// satori sizes boxes content-box, so the card itself has no padding or border: every part is
	// positioned inside a plain 1200x630 box
	const card = el('div', { width: 1200, height: 630, display: 'flex', position: 'relative', background: BG, fontFamily: 'Fragment Mono' }, [
		el(
			'div',
			{ position: 'absolute', left: 0, right: 0, bottom: 4, height: 252, display: 'flex', flexDirection: 'column', fontSize: 18, paddingLeft: 16 },
			asciiBand(seed, motif),
		),
		// soften the band's top edge into the background
		el('div', { position: 'absolute', left: 0, right: 0, bottom: 216, height: 44, backgroundImage: `linear-gradient(${BG}, rgba(10,11,14,0))` }),
		el('div', { position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: ACCENT }),
		el('div', { position: 'absolute', top: 58, right: 72, fontSize: 20, color: MUTED }, 'notdeadcaller.github.io'),
		el('div', { position: 'absolute', top: 56, left: 72, width: 1040, display: 'flex', flexDirection: 'column' }, [
			el('div', { fontSize: 22, color: ACCENT }, kicker),
			el(
				'div',
				{ marginTop: 26, fontFamily: 'Big Shoulders', fontWeight: 800, fontSize: title.length > 42 ? 68 : 92, lineHeight: 0.95, color: TEXT },
				title,
			),
			el('div', { marginTop: 22, fontSize: 24, lineHeight: 1.4, color: MUTED, maxWidth: 980 }, blurb),
		]),
	]);
	// biome-ignore lint: satori accepts plain element objects, not only React nodes
	const svg = await satori(card as any, { width: 1200, height: 630, fonts: await loadFonts() });
	return sharp(Buffer.from(svg)).png().toBuffer();
}
