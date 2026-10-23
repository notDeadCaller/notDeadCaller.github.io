// Notes as a space voyage: shaded ASCII planets (the notes) orbit stars in a few systems, over a
// parallax starfield. Scrolling flies the camera sideways; the planet under the pointer, or nearest
// the centre, is "focused" (its title shows, a click opens it). Drawn on the shared ASCII engine, so
// it pauses off-screen and honours reduced motion. The git-graph list is the accessible fallback.
import { type Field, mount, RAMP } from './ascii';

export type VNote = { id: string; url: string; title: string; maturity: 'seedling' | 'budding' | 'evergreen'; locked?: boolean };
export const SYSTEM_SIZE = 3; // planets per star system; the page sizes the scroll track from this

// 0 muted, 1 accent, 2 accent-2, 3 text-strong, 4 hot
const TONES = ['--muted', '--accent', '--accent-2', '--text-strong', '--hot'];
const hash = (a: number, b: number) => {
	const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return s - Math.floor(s);
};
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const KIND = {
	seedling: { r: 4.5, tone: 1, spin: 0.5 },
	budding: { r: 6, tone: 2, spin: 0.35 },
	evergreen: { r: 8.5, tone: 3, spin: 0.22 },
} as const;

type Planet = { note: VNote; sys: number; orbitR: number; speed: number; phase: number; r: number; tone: number; spin: number };
type Live = { planet: Planet; sx: number; sy: number };

export function voyage(
	canvas: HTMLCanvasElement,
	notes: VNote[],
	opts: { container: HTMLElement; onFocus?: (n: VNote | null) => void; onOpen?: (n: VNote) => void; getUnlocked?: () => boolean },
) {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const small = innerWidth < 640;
	const scale = small ? 0.72 : 1; // planets and orbits shrink on narrow screens so nothing clips
	const planets: Planet[] = notes.map((note, i) => {
		const k = KIND[note.maturity];
		const slot = i % SYSTEM_SIZE;
		return {
			note,
			sys: Math.floor(i / SYSTEM_SIZE),
			orbitR: (13 + slot * 9) * scale,
			speed: (reduced ? 0 : 0.12 - slot * 0.02) * (i % 2 ? 1 : -1),
			phase: hash(i, 7) * 6.283,
			r: k.r * scale,
			tone: note.locked ? 0 : k.tone,
			spin: k.spin,
		};
	});
	const sysCount = Math.max(1, Math.ceil(notes.length / SYSTEM_SIZE));
	let focused: VNote | null = null; // reported title (hovered, else centred)
	let hovered: Planet | null = null; // planet under the pointer
	let centred: VNote | null = null;

	const handle = mount(canvas, {
		cell: small ? 5.5 : 6.5,
		tones: TONES,
		fps: reduced ? 2 : 26,
		setup(f) {
			const gap = f.cols * 0.92;
			const sys = Array.from({ length: sysCount }, (_, i) => ({
				wx: f.cols * 0.5 + i * gap,
				wy: f.rows * (0.42 + (hash(i, 11) - 0.5) * 0.28),
			}));
			f.data.sys = sys;
			f.data.worldW = (sysCount - 1) * gap;
			f.data.live = [] as Live[];
			f.data.suns = [] as { sx: number; sy: number }[];
		},
		frame(f) {
			const sys = f.data.sys as { wx: number; wy: number }[];
			const rect = opts.container.getBoundingClientRect();
			const span = rect.height - innerHeight;
			const prog = span > 0 ? clamp(-rect.top / span) : 0;
			const camX = prog * (f.data.worldW as number);
			f.data.camX = camX;
			f.data.suns = sys.map((s) => ({ sx: s.wx - camX, sy: s.wy }));

			const live: Live[] = [];
			let best: VNote | null = null;
			let bestD = Infinity;
			let hov: Planet | null = null;
			let hovD = Infinity;
			const p = f.pointer;
			for (const planet of planets) {
				const s = sys[planet.sys];
				const a = planet.phase + f.time * planet.speed;
				const sx = s.wx + Math.cos(a) * planet.orbitR - camX;
				const sy = s.wy + (Math.sin(a) * planet.orbitR) / f.aspect;
				if (sx < -planet.r - 2 || sx > f.cols + planet.r + 2) continue;
				live.push({ planet, sx, sy });
				const dc = Math.abs(sx - f.cols / 2);
				if (dc < bestD) {
					bestD = dc;
					best = planet.note;
				}
				if (p.active) {
					const dp = Math.hypot(sx - p.x, (sy - p.y) * f.aspect);
					if (dp < planet.r + 1 && dp < hovD) {
						hovD = dp;
						hov = planet;
					}
				}
			}
			f.data.live = live;
			hovered = hov;
			centred = bestD < f.cols * 0.14 ? best : null;
			const show = hov?.note ?? centred;
			if (show !== focused) {
				focused = show;
				opts.onFocus?.(show);
			}
		},
		shader(x, y, f, out) {
			const t = f.time;
			const camX = f.data.camX as number;
			const unlocked = opts.getUnlocked?.() ?? false;

			// parallax starfield: two drifting layers
			for (const [depth, thr] of [
				[0.12, 0.986],
				[0.35, 0.99],
			] as const) {
				const h = hash((x + camX * depth) * 1.1, y * 1.9);
				if (h > thr) {
					out.ch = h > thr + 0.004 ? '+' : '.';
					out.a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.3 + h * 20));
					out.tone = 0;
				}
			}

			// suns
			for (const s of f.data.suns as { sx: number; sy: number }[]) {
				const d = Math.hypot(x - s.sx, (y - s.sy) * f.aspect);
				if (d < 2.4) {
					out.ch = d < 1.2 ? '@' : '*';
					out.a = 1;
					out.tone = 4;
				}
			}

			// planets (front-most wins)
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
					out.ch = hash(x * 3 + Math.floor(t * 4), y * 3) > 0.5 ? '#' : '.';
					out.a = 0.18 + 0.1 * nz;
					out.tone = 0;
					continue;
				}
				const lit = p === hovered ? 1.15 : 1;
				const b = clamp(nx * -0.5 + ny * -0.55 + nz * 0.66);
				const lon = Math.atan2(nx, nz) + t * p.spin;
				const band = 0.5 + 0.5 * Math.sin(lon * 5 + ny * 7);
				const shade = clamp((b * 0.82 + band * 0.18 * b) * lit);
				out.ch = RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(shade * (RAMP.length - 1)))];
				out.a = Math.min(1, 0.25 + 0.75 * shade);
				out.tone = shade > 0.78 || p === hovered ? 3 : p.tone;
			}
		},
	});

	// open on click: the hovered planet, else the one centred in the reticle
	const open = () => {
		const n = hovered?.note ?? centred;
		if (n && (!n.locked || (opts.getUnlocked?.() ?? false))) opts.onOpen?.(n);
	};
	canvas.addEventListener('click', open);

	return { ...handle, destroy: () => canvas.removeEventListener('click', open) };
}
