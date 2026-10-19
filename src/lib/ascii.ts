// Tiny character-grid renderer. A shader decides, per cell and per frame, which glyph to draw,
// how bright, and which palette tone. Pauses offscreen, renders one still frame for reduced motion.

export type Glyph = { ch: string; a: number; tone: number };

export type Field = {
	cols: number;
	rows: number;
	time: number; // seconds
	aspect: number; // cell height / width
	pointer: { x: number; y: number; active: boolean; pressedAt: number };
	/** past: 0..1 how far the canvas has scrolled out the top; seen: 0..1 how much of it has entered; speed: px/s */
	scroll: { past: number; seen: number; speed: number };
	data: Record<string, unknown>;
};

export type Shader = (x: number, y: number, field: Field, out: Glyph) => void;

type Options = {
	shader: Shader;
	/** css px per cell width */
	cell?: number;
	/** palette tones, css colors or custom properties like `--accent` */
	tones: string[];
	/** called on mount and on every resize, after cols/rows are known */
	setup?: (field: Field) => void;
	/** called once per frame before the cells are shaded */
	frame?: (field: Field) => void;
	/** columns fall apart as the canvas scrolls out the top, and re-form on the way back */
	dissolve?: boolean;
	/** element that receives pointer events, defaults to the canvas parent */
	target?: Element | null;
	fps?: number;
};

// one shared scroll-speed tracker for every canvas
let scrollSpeed = 0;
let lastScrollY = typeof scrollY === 'number' ? scrollY : 0;
let lastScrollAt = 0;
if (typeof window !== 'undefined') {
	addEventListener(
		'scroll',
		() => {
			const now = performance.now();
			const instant = (Math.abs(scrollY - lastScrollY) / Math.max(16, now - lastScrollAt)) * 1000;
			scrollSpeed = Math.max(instant, scrollSpeed * 0.6);
			lastScrollY = scrollY;
			lastScrollAt = now;
		},
		{ passive: true },
	);
}
const currentScrollSpeed = () => scrollSpeed * Math.exp(-(performance.now() - lastScrollAt) / 250);
const columnHash = (x: number, salt: number) => {
	const s = Math.sin(x * 91.7 + salt * 47.3) * 43758.5453;
	return s - Math.floor(s);
};

export const RAMP = ' .:-=+*#%@';
export const NOISE = '!<>-_\\/[]{}=+*^?#0123456789ABCDEF';

export const randomGlyph = (set = NOISE) => set[Math.floor(Math.random() * set.length)];

/** Deterministic PRNG for seeded art (mulberry32). */
export function seeded(seed: string) {
	let h = 1779033703;
	for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
	return () => {
		h = (h + 0x6d2b79f5) | 0;
		let t = Math.imul(h ^ (h >>> 15), 1 | h);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Cheap smooth pseudo-noise in [-1, 1]; good enough for drifting fields. */
export const wave = (x: number, y: number, t: number) =>
	(Math.sin(x * 0.11 + t) * Math.cos(y * 0.23 - t * 0.7) + Math.sin((x + y) * 0.05 + t * 0.4)) / 2;

/**
 * Coverage (0..1) of `text` for every cell, sampled from an offscreen canvas.
 * Lets a shader draw a word or logo out of characters.
 */
export function textMask(text: string, cols: number, rows: number, aspect: number, font: string, weight = 800): Float32Array {
	const sx = 4;
	const sy = Math.round(4 * aspect);
	const canvas = document.createElement('canvas');
	canvas.width = cols * sx;
	canvas.height = rows * sy;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const mask = new Float32Array(cols * rows);
	if (!ctx) return mask;
	const lines = text.split('\n');
	let size = canvas.height / lines.length;
	ctx.font = `${weight} ${size}px ${font}`;
	const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
	size = Math.min(size * 0.9, (size * canvas.width * 0.94) / width);
	ctx.font = `${weight} ${size}px ${font}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#fff';
	const lineHeight = size * 0.92;
	for (const [i, line] of lines.entries()) {
		const offset = (i - (lines.length - 1) / 2) * lineHeight;
		ctx.fillText(line, canvas.width / 2, canvas.height / 2 + offset + size * 0.04);
	}
	const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			let sum = 0;
			for (let j = 0; j < sy; j += 2) {
				for (let i = 0; i < sx; i += 2) sum += pixels[((y * sy + j) * canvas.width + x * sx + i) * 4 + 3];
			}
			mask[y * cols + x] = sum / (255 * (sx / 2) * (sy / 2));
		}
	}
	return mask;
}

const hexToRgb = (hex: string) => {
	const n = Number.parseInt(hex.replace('#', ''), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** `--var` reads a custom property, `mix:--a:--b:0.3` blends two hex custom properties. */
function resolveTone(tone: string, style: CSSStyleDeclaration) {
	const read = (name: string) => style.getPropertyValue(name).trim();
	if (tone.startsWith('mix:')) {
		const [, a, b, amount] = tone.split(':');
		const from = hexToRgb(read(a));
		const to = hexToRgb(read(b));
		const t = Number(amount);
		return `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * t)).join(' ')})`;
	}
	return tone.startsWith('--') ? read(tone) : tone;
}

export function mount(canvas: HTMLCanvasElement, options: Options) {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const { shader, cell = 9, setup, frame, dissolve = false, fps = 30 } = options;
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const field: Field = {
		cols: 0,
		rows: 0,
		time: 0,
		aspect: 2,
		pointer: { x: -99, y: -99, active: false, pressedAt: -99 },
		scroll: { past: 0, seen: 0, speed: 0 },
		data: {},
	};
	const out: Glyph = { ch: ' ', a: 0, tone: 0 };
	let tones: string[] = [];
	let cellW = cell;
	let cellH = cell * 2;
	let visible = false;
	let raf = 0;
	let last = 0;
	const start = performance.now();

	const resize = () => {
		const style = getComputedStyle(canvas);
		const fontSize = cell / 0.6;
		ctx.font = `${fontSize}px ${style.fontFamily}`;
		cellW = ctx.measureText('M').width;
		cellH = fontSize * 1.15;
		const dpr = Math.min(devicePixelRatio || 1, 2);
		canvas.width = canvas.clientWidth * dpr;
		canvas.height = canvas.clientHeight * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.font = `${fontSize}px ${style.fontFamily}`;
		ctx.textBaseline = 'top';
		tones = options.tones.map((tone) => resolveTone(tone, style));
		field.cols = Math.ceil(canvas.clientWidth / cellW);
		field.rows = Math.ceil(canvas.clientHeight / cellH);
		field.aspect = cellH / cellW;
		setup?.(field);
		draw();
	};

	const draw = () => {
		const rect = canvas.getBoundingClientRect();
		const clamp = (n: number) => Math.min(1, Math.max(0, n));
		field.scroll.past = clamp(-rect.top / rect.height);
		field.scroll.seen = clamp((innerHeight - rect.top) / rect.height);
		field.scroll.speed = currentScrollSpeed();
		frame?.(field);

		const fall = dissolve && !reduced ? field.scroll.past : 0;
		ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
		let current = -1;
		for (let y = 0; y < field.rows; y++) {
			for (let x = 0; x < field.cols; x++) {
				let sx = x;
				let sy = y;
				if (fall > 0) {
					// each column drops at its own speed and drifts a little sideways
					sy = Math.round(y - fall * fall * field.rows * (0.35 + columnHash(x, 1) * 1.65));
					sx = x + Math.round((columnHash(x, 2) - 0.5) * fall * 8);
					if (sy < 0) continue;
				}
				out.ch = ' ';
				out.a = 0;
				out.tone = 0;
				shader(sx, sy, field, out);
				if (out.a < 0.02 || out.ch === ' ') continue;
				if (out.tone !== current) {
					current = out.tone;
					ctx.fillStyle = tones[current] ?? tones[0];
				}
				ctx.globalAlpha = Math.min(1, out.a * (1 - fall * 0.85));
				ctx.fillText(out.ch, x * cellW, y * cellH);
			}
		}
		ctx.globalAlpha = 1;
	};

	const loop = (now: number) => {
		raf = 0;
		if (!visible || reduced) return;
		raf = requestAnimationFrame(loop);
		if (now - last < 1000 / fps) return;
		last = now;
		field.time = (now - start) / 1000;
		draw();
	};
	const play = () => {
		if (!raf) raf = requestAnimationFrame(loop);
	};

	const toCell = (event: PointerEvent) => {
		const rect = canvas.getBoundingClientRect();
		field.pointer.x = (event.clientX - rect.left) / cellW;
		field.pointer.y = (event.clientY - rect.top) / cellH;
	};
	const target = (options.target ?? canvas.parentElement ?? canvas) as HTMLElement;
	target.addEventListener('pointermove', (event) => {
		toCell(event);
		field.pointer.active = true;
	});
	target.addEventListener('pointerdown', (event) => {
		toCell(event);
		field.pointer.pressedAt = field.time;
	});
	target.addEventListener('pointerleave', () => {
		field.pointer.active = false;
	});

	new IntersectionObserver(([entry]) => {
		visible = entry.isIntersecting;
		if (visible) play();
	}).observe(canvas);
	new ResizeObserver(resize).observe(canvas);
	// palette switches repaint with the new tones
	new MutationObserver(resize).observe(document.documentElement, { attributeFilter: ['data-palette'] });
	document.fonts.ready.then(resize);
}
