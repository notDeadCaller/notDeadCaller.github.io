// Notes as a space voyage: shaded ASCII planets (the notes) orbit stars in a few systems, over a
// parallax starfield. Scrolling flies the camera sideways; hovering a planet focuses it (ring + title)
// and a click opens it — a sticky note for short ones, the full page for long ones. Clicking empty
// space does nothing. Opening pauses all motion. Built on the shared ASCII engine (off-screen pause,
// reduced motion). The git-graph list is the accessible fallback.
import { mount, RAMP } from './ascii';

export type NoteSize = 'moon' | 'planet' | 'giant';
export type VNote = {
	id: string;
	url: string;
	title: string;
	maturity: 'seedling' | 'budding' | 'evergreen';
	size: NoteSize;
	mode: 'sticky' | 'page';
	locked?: boolean;
};
export type Screen = { x: number; y: number; r: number }; // viewport px
export const SYSTEM_SIZE = 3;

// 0 muted, 1 accent, 2 accent-2, 3 text-strong, 4 hot
const TONES = ['--muted', '--accent', '--accent-2', '--text-strong', '--hot'];
const hash = (a: number, b: number) => {
	const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return s - Math.floor(s);
};
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
// base radius (cells) and spin per size; colour comes from maturity
const SIZE = { moon: 3.5, planet: 6, giant: 9.5 } as const;
const MAT_TONE = { seedling: 1, budding: 2, evergreen: 3 } as const;
const SPIN = { moon: 0.5, planet: 0.32, giant: 0.2 } as const;

type Planet = { note: VNote; sys: number; orbitR: number; speed: number; phase: number; r: number; tone: number; spin: number };
type Live = { planet: Planet; sx: number; sy: number };

export function voyage(
	canvas: HTMLCanvasElement,
	notes: VNote[],
	opts: {
		container: HTMLElement;
		onHover?: (n: VNote | null, s: Screen | null) => void;
		onOpen?: (n: VNote, s: Screen) => void;
		getUnlocked?: () => boolean;
	},
) {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const small = innerWidth < 640;
	const scale = small ? 0.72 : 1;
	const planets: Planet[] = notes.map((note, i) => {
		const slot = i % SYSTEM_SIZE;
		return {
			note,
			sys: Math.floor(i / SYSTEM_SIZE),
			orbitR: (13 + slot * 9) * scale,
			speed: (reduced ? 0 : 0.11 - slot * 0.02) * (i % 2 ? 1 : -1),
			phase: hash(i, 7) * 6.283,
			r: SIZE[note.size] * scale,
			tone: note.locked ? 0 : MAT_TONE[note.maturity],
			spin: SPIN[note.size],
		};
	});
	const sysCount = Math.max(1, Math.ceil(notes.length / SYSTEM_SIZE));
	let hovered: Planet | null = null;
	let paused = false;
	let orbitClock = 0;
	let lastT = -1;
	let frozenCam = 0;
	let lastLive: Live[] = [];
	let lastCols = 1;
	let lastRows = 1;
	let lastAspect = 2;
	// own pointer tracking in cell coords: the shared engine only flags "active" on move, so a touch
	// tap would never register a hover. pointerdown here also counts, which makes tap-to-open work.
	let px = -99;
	let py = -99;
	let pactive = false;
	const toCell = (e: PointerEvent) => {
		const rect = canvas.getBoundingClientRect();
		px = ((e.clientX - rect.left) / Math.max(1, canvas.clientWidth)) * lastCols;
		py = ((e.clientY - rect.top) / Math.max(1, canvas.clientHeight)) * lastRows;
		pactive = true;
	};

	const screenOf = (L: Live, f: { cols: number; rows: number }): Screen => ({
		x: (L.sx / f.cols) * canvas.clientWidth,
		y: (L.sy / f.rows) * canvas.clientHeight,
		r: (L.planet.r / f.cols) * canvas.clientWidth,
	});

	const handle = mount(canvas, {
		cell: small ? 5.5 : 6.5,
		tones: TONES,
		fps: reduced ? 2 : 26,
		setup(f) {
			const gap = f.cols * 0.92;
			f.data.sys = Array.from({ length: sysCount }, (_, i) => ({
				wx: f.cols * 0.5 + i * gap,
				wy: f.rows * (0.42 + (hash(i, 11) - 0.5) * 0.28),
			}));
			f.data.worldW = (sysCount - 1) * gap;
			f.data.live = [] as Live[];
			f.data.suns = [] as { sx: number; sy: number }[];
		},
		frame(f) {
			const dt = lastT < 0 ? 0 : f.time - lastT;
			lastT = f.time;
			if (!paused) orbitClock += dt;
			f.data.clock = orbitClock;

			const sys = f.data.sys as { wx: number; wy: number }[];
			let camX: number;
			if (paused) {
				camX = frozenCam;
			} else {
				const rect = opts.container.getBoundingClientRect();
				const span = rect.height - innerHeight;
				const prog = span > 0 ? clamp(-rect.top / span) : 0;
				camX = prog * (f.data.worldW as number);
				frozenCam = camX;
			}
			f.data.camX = camX;
			f.data.suns = sys.map((s) => ({ sx: s.wx - camX, sy: s.wy }));

			const live: Live[] = [];
			let hov: Planet | null = null;
			let hovD = Infinity;
			for (const planet of planets) {
				const s = sys[planet.sys];
				const a = planet.phase + orbitClock * planet.speed;
				const sx = s.wx + Math.cos(a) * planet.orbitR - camX;
				const sy = s.wy + (Math.sin(a) * planet.orbitR) / f.aspect;
				if (sx < -planet.r - 2 || sx > f.cols + planet.r + 2) continue;
				live.push({ planet, sx, sy });
				if (pactive) {
					const dp = Math.hypot(sx - px, (sy - py) * f.aspect);
					if (dp < planet.r + 0.6 && dp < hovD) {
						hovD = dp;
						hov = planet;
					}
				}
			}
			f.data.live = live;
			lastLive = live;
			lastCols = f.cols;
			lastRows = f.rows;
			lastAspect = f.aspect;
			if (hov !== hovered) {
				hovered = hov;
				const L = hov && live.find((l) => l.planet === hov);
				opts.onHover?.(hov?.note ?? null, L ? screenOf(L, f) : null);
			}
		},
		shader(x, y, f, out) {
			const clock = f.data.clock as number;
			const camX = f.data.camX as number;
			const unlocked = opts.getUnlocked?.() ?? false;

			for (const [depth, thr] of [
				[0.12, 0.986],
				[0.35, 0.99],
			] as const) {
				const h = hash((x + camX * depth) * 1.1, y * 1.9);
				if (h > thr) {
					out.ch = h > thr + 0.004 ? '+' : '.';
					out.a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(clock * 1.3 + h * 20));
					out.tone = 0;
				}
			}

			for (const s of f.data.suns as { sx: number; sy: number }[]) {
				const d = Math.hypot(x - s.sx, (y - s.sy) * f.aspect);
				if (d < 2.4) {
					out.ch = d < 1.2 ? '@' : '*';
					out.a = 1;
					out.tone = 4;
				}
			}

			let bestZ = Infinity;
			for (const L of f.data.live as Live[]) {
				const dx = x - L.sx;
				const dy = (y - L.sy) * f.aspect;
				const d = Math.hypot(dx, dy);
				const p = L.planet;
				if (d > p.r + 1.5) continue;
				if (p.note.locked && !unlocked && d > p.r && d < p.r + 1.4) {
					if (out.a < 0.3) {
						out.ch = ':';
						out.a = 0.3;
						out.tone = 2;
					}
					continue;
				}
				if (d >= p.r || d >= bestZ) continue;
				bestZ = d;
				const nx = dx / p.r;
				const ny = dy / p.r;
				const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
				if (p.note.locked && !unlocked) {
					out.ch = hash(x * 3 + Math.floor(clock * 4), y * 3) > 0.5 ? '#' : '.';
					out.a = 0.18 + 0.1 * nz;
					out.tone = 0;
					continue;
				}
				const lit = p === hovered ? 1.18 : 1;
				const b = clamp(nx * -0.5 + ny * -0.55 + nz * 0.66);
				const lon = Math.atan2(nx, nz) + clock * p.spin;
				const band = 0.5 + 0.5 * Math.sin(lon * 5 + ny * 7);
				const shade = clamp((b * 0.82 + band * 0.18 * b) * lit);
				out.ch = RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(shade * (RAMP.length - 1)))];
				out.a = Math.min(1, 0.25 + 0.75 * shade);
				out.tone = shade > 0.78 || p === hovered ? 3 : p.tone;
			}
		},
	});

	// open the planet under the pointer at click time (computed fresh, so a touch tap has no race);
	// empty space hits nothing and does nothing
	const open = () => {
		let L: Live | null = null;
		let bd = Infinity;
		for (const l of lastLive) {
			const dp = Math.hypot(l.sx - px, (l.sy - py) * lastAspect);
			if (dp < l.planet.r + 0.6 && dp < bd) {
				bd = dp;
				L = l;
			}
		}
		if (!L) return;
		if (L.planet.note.locked && !(opts.getUnlocked?.() ?? false)) return;
		opts.onOpen?.(L.planet.note, screenOf(L, { cols: lastCols, rows: lastRows }));
	};
	canvas.addEventListener('click', open);
	canvas.addEventListener('pointermove', toCell);
	canvas.addEventListener('pointerdown', toCell);
	canvas.addEventListener('pointerleave', () => {
		pactive = false;
	});

	return {
		...handle,
		setPaused(v: boolean) {
			paused = v;
		},
		destroy() {
			canvas.removeEventListener('click', open);
			canvas.removeEventListener('pointermove', toCell);
			canvas.removeEventListener('pointerdown', toCell);
		},
	};
}
