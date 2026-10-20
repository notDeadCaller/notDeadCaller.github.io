// Homepage portrait: a face drawn out of characters, profiler style. On wide screens it sits beside
// the intro; on narrow ones tapping the intro breaks its text into cells that fly into the face.
import { PORTRAIT } from '../data/portrait';
import { type Field, type Glyph, mount, NOISE, RAMP } from './ascii';

// 0 muted, 1 text, 2 scan, 3 pointer
const TONES = ['--muted', '--text-strong', '--accent-2', '--accent'];
const ASPECT = 0.8; // source photo width / height

const hash = (a: number, b: number) => {
	const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return s - Math.floor(s);
};
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const LEVELS = Float32Array.from(PORTRAIT.data, (c) => Number.parseInt(c, 16) / 15);

/** Mean brightness of the source samples under one cell (box filter, so shrinking doesn't alias). */
function area(u0: number, v0: number, u1: number, v1: number) {
	const { cols, rows } = PORTRAIT;
	let sum = 0;
	let n = 0;
	for (let v = Math.floor(v0); v < Math.max(Math.floor(v0) + 1, Math.ceil(v1)); v++) {
		for (let u = Math.floor(u0); u < Math.max(Math.floor(u0) + 1, Math.ceil(u1)); u++) {
			n++;
			if (u >= 0 && v >= 0 && u < cols && v < rows) sum += LEVELS[v * cols + u];
		}
	}
	return sum / n;
}

/** Brightness 0..1 per cell: the face fitted inside the canvas, centred, sitting on the bottom edge. */
function fit(f: Field) {
	const face = new Float32Array(f.cols * f.rows);
	const h = Math.min(f.rows, f.cols / (f.aspect * ASPECT));
	const w = h * f.aspect * ASPECT;
	const x0 = (f.cols - w) / 2;
	const y0 = f.rows - h;
	for (let y = 0; y < f.rows; y++) {
		for (let x = 0; x < f.cols; x++) {
			const u = ((x - x0) / w) * PORTRAIT.cols;
			const v = ((y - y0) / h) * PORTRAIT.rows;
			// shoulders fade out instead of ending on a hard line
			const fade = clamp((1 - (y + 0.5 - y0) / h) / 0.18);
			face[y * f.cols + x] = area(u, v, u + PORTRAIT.cols / w, v + PORTRAIT.rows / h) * fade;
		}
	}
	return face;
}

/** The settled face: brightness picks the glyph, a few cells flicker, a scan line sweeps down now and then. */
function faceGlyph(raw: number, x: number, y: number, f: Field, out: Glyph) {
	// darks go blank and the rest is stretched, so the face reads as light on black
	const b = clamp((raw - 0.28) / 0.6);
	if (b < 0.03) return;
	out.ch = RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(b * (RAMP.length - 1)))];
	out.a = 0.35 + 0.65 * b;
	out.tone = b > 0.22 ? 1 : 0;
	if (hash(x + Math.floor(f.time * 6) * 13.1, y) < 0.004) out.ch = NOISE[Math.floor(hash(x, y + f.time) * NOISE.length)];
	const d = y - (f.data.scan as number);
	if (d <= 0 && d > -7) {
		out.tone = 2;
		out.a = Math.min(1, out.a + (1 + d / 7) * 0.5);
		if (d > -1) out.ch = NOISE[Math.floor(hash(x, f.time) * NOISE.length)];
	}
}

/** Scan line row for this frame: one sweep every 8 seconds, -99 between sweeps. */
const scanRow = (f: Field) => {
	const t = (f.time % 8) / 1.8;
	return t < 1 ? t * (f.rows + 8) : -99;
};

export function portrait(canvas: HTMLCanvasElement) {
	let face = new Float32Array(0);
	mount(canvas, {
		cell: 3.4,
		tones: TONES,
		fps: 24,
		setup(f) {
			face = fit(f);
		},
		frame(f) {
			f.data.scan = scanRow(f);
		},
		shader(x, y, f, out) {
			faceGlyph(face[y * f.cols + x], x, y, f, out);
			// the cursor scrambles what it passes over
			if (out.a > 0 && f.pointer.active && Math.hypot(x - f.pointer.x, (y - f.pointer.y) * f.aspect) < 4) {
				out.ch = NOISE[Math.floor(hash(x, y + f.time) * NOISE.length)];
				out.tone = 3;
			}
		},
	});
}

/** Coverage 0..1 per cell of the element's text, rasterised where it actually sits on screen. */
function textCoverage(el: HTMLElement, canvas: HTMLCanvasElement, f: Field) {
	const cover = new Float32Array(f.cols * f.rows);
	const box = canvas.getBoundingClientRect();
	const off = document.createElement('canvas');
	off.width = Math.max(1, Math.ceil(box.width));
	off.height = Math.max(1, Math.ceil(box.height));
	const ctx = off.getContext('2d', { willReadFrequently: true });
	if (!ctx || !f.cols || !f.rows) return cover;
	const style = getComputedStyle(el);
	ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#fff';
	const range = document.createRange();
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.textContent ?? '';
		for (let i = 0; i < text.length; i++) {
			if (/\s/.test(text[i])) continue;
			range.setStart(node, i);
			range.setEnd(node, i + 1);
			const r = range.getClientRects()[0];
			if (r) ctx.fillText(text[i], r.left - box.left, r.top - box.top + r.height / 2);
		}
	}
	const pixels = ctx.getImageData(0, 0, off.width, off.height).data;
	const cw = box.width / f.cols;
	const ch = cw * f.aspect;
	for (let y = 0; y < f.rows; y++) {
		for (let x = 0; x < f.cols; x++) {
			let sum = 0;
			let n = 0;
			for (let py = Math.floor(y * ch); py < Math.min(off.height, (y + 1) * ch); py += 2) {
				for (let px = Math.floor(x * cw); px < Math.min(off.width, (x + 1) * cw); px += 2) {
					sum += pixels[(py * off.width + px) * 4 + 3];
					n++;
				}
			}
			cover[y * f.cols + x] = n ? sum / (255 * n) : 0;
		}
	}
	return cover;
}

const DURATION = 1.5; // seconds for the full morph either way

/**
 * Narrow screens: the intro's text breaks into cells that fly into the face, and back.
 * Returns a toggle; `onSettle` fires when the morph comes to rest on the text side.
 */
export function portraitMorph(canvas: HTMLCanvasElement, text: HTMLElement, onSettle: (state: 'text' | 'face') => void) {
	let face = new Float32Array(0);
	let cover = new Float32Array(0);
	let src = new Int32Array(0);
	let dst = new Int32Array(0);
	let delay = new Float32Array(0);
	let phase = new Float32Array(0);
	let grid = new Int32Array(0);
	let progress = 0;
	let target = 0;
	let last = -1;
	let settled: 'text' | 'face' = 'text';
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

	const handle = mount(canvas, {
		cell: 3.8,
		tones: TONES,
		fps: 30,
		target: canvas,
		setup(f) {
			face = fit(f);
			cover = textCoverage(text, canvas, f);
			const faceCells: number[] = [];
			const textCells: number[] = [];
			for (let i = 0; i < face.length; i++) {
				if (face[i] >= 0.3) faceCells.push(i);
				if (cover[i] > 0.3) textCells.push(i);
			}
			// every face cell is carried by a particle that starts on a text cell; both lists run in
			// reading order, so the first line of text becomes the top of the head
			const n = faceCells.length;
			src = new Int32Array(n);
			dst = new Int32Array(faceCells);
			delay = new Float32Array(n);
			phase = new Float32Array(n);
			grid = new Int32Array(face.length);
			for (let k = 0; k < n; k++) {
				src[k] = textCells.length ? textCells[Math.floor((k * textCells.length) / n)] : dst[k];
				// a short hold first, while the real text fades and its cells take over
				delay[k] = 0.12 + hash(k, 7) * 0.33;
			}
		},
		frame(f) {
			const dt = last < 0 ? 0 : Math.min(0.1, f.time - last);
			last = f.time;
			const step = reduced ? 1 : dt / DURATION;
			progress = target > progress ? Math.min(target, progress + step) : Math.max(target, progress - step);
			f.data.scan = progress === 1 ? scanRow(f) : -99;
			grid.fill(0);
			for (let k = 0; k < dst.length; k++) {
				const q = clamp((progress - delay[k]) / 0.55);
				phase[k] = q;
				const e = ease(q);
				const sx = src[k] % f.cols;
				const sy = Math.floor(src[k] / f.cols);
				const x = Math.round(sx + ((dst[k] % f.cols) - sx) * e);
				const y = Math.round(sy + (Math.floor(dst[k] / f.cols) - sy) * e);
				grid[y * f.cols + x] = k + 1;
			}
			const now: typeof settled | null = progress === 0 ? 'text' : progress === 1 ? 'face' : null;
			if (now && now !== settled) {
				settled = now;
				onSettle(now);
			}
		},
		shader(x, y, f, out) {
			const i = y * f.cols + x;
			const k = grid[i] - 1;
			if (k < 0) {
				// text cells nobody carries fade out early
				if (cover[i] > 0.3 && progress < 0.2) {
					out.ch = RAMP[5 + Math.min(4, Math.floor(cover[i] * 5))];
					out.a = 1 - progress * 5;
					out.tone = 1;
				}
				return;
			}
			const q = phase[k];
			if (q >= 1) return faceGlyph(face[i], x, y, f, out);
			if (q <= 0) {
				out.ch = RAMP[5 + Math.min(4, Math.floor(cover[src[k]] * 5))];
				out.a = 1;
				out.tone = 1;
				return;
			}
			// in flight: scrambled, tinted, settling into the face's brightness
			out.ch = NOISE[Math.floor(hash(k, Math.floor(f.time * 8)) * NOISE.length)];
			out.a = 0.45 + 0.35 * Math.sin(q * Math.PI);
			// most cells cross in grey; a few carry the cyan
			out.tone = hash(k, 3) < 0.25 ? 2 : 0;
		},
	});

	return (show: boolean) => {
		target = show ? 1 : 0;
		// reduced motion has no animation loop: jump and repaint once
		if (reduced) handle?.draw();
	};
}
