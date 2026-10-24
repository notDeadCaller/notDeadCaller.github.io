// Notes as a space voyage: shaded ASCII planets (the public notes) orbit a red "?" core at each
// system's centre — the ENCRYPTED note the public ones circle. Scrolling or dragging flies the
// camera. Hovering any body FREEZES the scene and draws a rotating ASCII Saturn ring over it (focus);
// a click opens it — a sticky for short notes, the full page for long ones, an unlock prompt for a
// core. Empty space does nothing. Built on the shared ASCII engine (off-screen pause, reduced
// motion). The git-graph list is the accessible fallback.
import { mount, RAMP } from './ascii';

export type NoteSize = 'moon' | 'planet' | 'giant';
export type VNote = {
	id: string;
	url: string;
	title: string;
	maturity: 'seedling' | 'budding' | 'evergreen';
	size: NoteSize;
	mode: 'sticky' | 'page' | 'encrypted';
	locked?: boolean;
};
export type Screen = { x: number; y: number; r: number };
export const SYSTEM_SIZE = 3;

const TONES = ['--muted', '--accent', '--accent-2', '--text-strong', '--hot'];
const hash = (a: number, b: number) => {
	const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return s - Math.floor(s);
};
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const SIZE = { moon: 3.5, planet: 6, giant: 9.5 } as const;
const MAT_TONE = { seedling: 1, budding: 2, evergreen: 3 } as const;
const SPIN = { moon: 0.5, planet: 0.32, giant: 0.2 } as const;

type Planet = {
	note: VNote;
	sys: number;
	orbitR: number;
	speed: number;
	phase: number;
	r: number;
	tone: number;
	spin: number;
	core?: boolean; // a system-centre encrypted note, drawn as a red "?" sphere
	unlocked?: boolean; // decrypted this session (changes the core's look)
};
type Live = { planet: Planet; sx: number; sy: number };

export function voyage(
	canvas: HTMLCanvasElement,
	notes: VNote[],
	opts: {
		container: HTMLElement;
		cores?: { sys: number; note: VNote }[]; // encrypted notes, one per system centre
		onHover?: (n: VNote | null, s: Screen | null) => void;
		onOpen?: (n: VNote, s: Screen) => void;
		onClose?: () => void;
		onLayout?: (m: { worldW: number; cols: number; planets: { wx: number; wy: number; note: VNote }[] }) => void;
	},
) {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
	const small = innerWidth < 640;
	const scale = small ? 0.72 : 1;
	const CORE_R = 4.4 * scale;
	const planets: Planet[] = notes.map((note, i) => {
		const slot = i % SYSTEM_SIZE;
		return {
			note,
			sys: Math.floor(i / SYSTEM_SIZE),
			orbitR: (13 + slot * 9) * scale,
			speed: (reduced ? 0 : 0.11 - slot * 0.02) * (i % 2 ? 1 : -1),
			phase: hash(i, 7) * 6.283,
			r: SIZE[note.size] * scale,
			tone: MAT_TONE[note.maturity],
			spin: SPIN[note.size],
		};
	});
	// the encrypted cores sit still at their system's centre (orbitR 0); they hover/click like planets
	for (const c of opts.cores ?? []) {
		planets.push({ note: c.note, sys: c.sys, orbitR: 0, speed: 0, phase: 0, r: CORE_R, tone: 4, spin: 0, core: true, unlocked: false });
	}
	const sysCount = Math.max(1, Math.ceil(notes.length / SYSTEM_SIZE), ...(opts.cores ?? []).map((c) => c.sys + 1));

	let hovered: Planet | null = null; // body under the pointer
	let held: Planet | null = null; // pinned focus while a sticky/unlock card is open
	let pendingHeld: Planet | null = null; // the body the current click is opening
	let orbitClock = 0; // advances only when nothing is focused (so focus freezes the scene)
	let ringClock = 0; // advances while a body is focused (so the reticle keeps turning)
	let lastT = -1;
	let frozenCam = 0;
	let lastLive: Live[] = [];
	let lastCols = 1;
	let lastRows = 1;
	let lastAspect = 2;
	let worldWcells = 0;
	// own pointer tracking (cell coords) so a touch tap registers; plus drag-to-pan
	let px = -99;
	let py = -99;
	let pactive = false;
	let pressed = false;
	let dragX = 0;
	let dragScroll = 0;
	let dragged = false;
	const toCell = (e: PointerEvent) => {
		const rect = canvas.getBoundingClientRect();
		px = ((e.clientX - rect.left) / Math.max(1, canvas.clientWidth)) * lastCols;
		py = ((e.clientY - rect.top) / Math.max(1, canvas.clientHeight)) * lastRows;
		pactive = true;
	};
	const screenOf = (L: Live, cols: number, rows: number): Screen => ({
		x: (L.sx / cols) * canvas.clientWidth,
		y: (L.sy / rows) * canvas.clientHeight,
		r: (L.planet.r / cols) * canvas.clientWidth,
	});

	const handle = mount(canvas, {
		cell: small ? 5.5 : 6.5,
		tones: TONES,
		fps: reduced ? 2 : 26,
		setup(f) {
			const gap = f.cols * 0.92;
			const sys = Array.from({ length: sysCount }, (_, i) => ({
				wx: f.cols * 0.5 + i * gap,
				wy: f.rows * (0.54 + (hash(i, 11) - 0.5) * 0.14),
			}));
			f.data.sys = sys;
			f.data.worldW = (sysCount - 1) * gap;
			f.data.live = [] as Live[];
			opts.onLayout?.({
				worldW: (sysCount - 1) * gap,
				cols: f.cols,
				planets: planets.map((p, i) => ({
					wx: p.core ? sys[p.sys].wx : sys[p.sys].wx + ((i % SYSTEM_SIZE) - 1) * gap * 0.14,
					wy: sys[p.sys].wy,
					note: p.note,
				})),
			});
		},
		frame(f) {
			const dt = lastT < 0 ? 0 : f.time - lastT;
			lastT = f.time;
			// focus = pinned body (card open) or the hovered one; while focused, the scene freezes
			const focus = held ?? hovered;
			if (!focus) orbitClock += dt;
			if (focus) ringClock += dt;
			f.data.clock = orbitClock;

			const sys = f.data.sys as { wx: number; wy: number }[];
			let camX: number;
			if (focus) {
				camX = frozenCam;
			} else {
				const rect = opts.container.getBoundingClientRect();
				const span = rect.height - innerHeight;
				const prog = span > 0 ? clamp(-rect.top / span) : 0;
				camX = prog * (f.data.worldW as number);
				frozenCam = camX;
			}
			f.data.camX = camX;

			worldWcells = f.data.worldW as number;
			const topSafe = f.rows * 0.16;
			const botSafe = f.rows * 0.9;
			const live: Live[] = [];
			let hov: Planet | null = null;
			let hovD = Infinity;
			for (const planet of planets) {
				const s = sys[planet.sys];
				const a = planet.phase + orbitClock * planet.speed;
				const vAmp = Math.max(2, Math.min(planet.orbitR / f.aspect, s.wy - topSafe - planet.r, botSafe - s.wy - planet.r));
				const sx = s.wx + Math.cos(a) * planet.orbitR - camX;
				const sy = s.wy + Math.sin(a) * vAmp;
				if (sx < -planet.r - 2 || sx > f.cols + planet.r + 2) continue;
				live.push({ planet, sx, sy });
				if (pactive && !held) {
					const dp = Math.hypot(sx - px, (sy - py) * f.aspect);
					if (dp < planet.r + 0.8 && dp < hovD) {
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

			// the ASCII Saturn ring sits on the focused body's (now frozen) position
			const fp = (held ?? hov) && live.find((l) => l.planet === (held ?? hov));
			if (fp && fp.planet.core) {
				// an encrypted core gets a pulsing corona (star-like aura) instead of the Saturn ring
				f.data.ring = null;
				f.data.corona = { sx: fp.sx, sy: fp.sy, R: fp.planet.r, t: ringClock };
			} else if (fp) {
				const Rx = fp.planet.r * 1.7 + 2.4;
				const Ry = Rx * 0.34;
				const ang = ringClock * 1.1;
				f.data.ring = {
					sx: fp.sx,
					sy: fp.sy,
					Rx,
					Ry,
					t: ringClock,
					nodeX: fp.sx + Math.cos(ang) * Rx,
					nodeY: fp.sy + (Math.sin(ang) * Ry) / f.aspect,
				};
				f.data.corona = null;
			} else {
				f.data.ring = null;
				f.data.corona = null;
			}

			if (hov !== hovered) {
				hovered = hov;
				const L = hov && live.find((l) => l.planet === hov);
				opts.onHover?.(hov?.note ?? null, L ? screenOf(L, f.cols, f.rows) : null);
			}
		},
		shader(x, y, f, out) {
			const clock = f.data.clock as number;
			const camX = f.data.camX as number;

			// parallax starfield — anchored to whole world cells so it scrolls, it doesn't shimmer
			for (const [depth, thr] of [
				[0.12, 0.986],
				[0.35, 0.99],
			] as const) {
				const off = Math.round(camX * depth);
				const h = hash((x + off) * 1.1, y * 1.9);
				if (h > thr) {
					// each star twinkles on its own phase + speed, biased by a slow spatial wave so
					// neighbours breathe together in drifting clusters — never one global in/out blink
					const ph = hash((x + off) * 3.7 + 2, y * 2.3 + 4) * 6.283;
					const spd = 0.7 + hash((x + off) * 0.7 + 1, y * 1.3 + 3) * 1.4;
					const cluster = Math.sin((x + off) * 0.11 + y * 0.085);
					const tw = 0.5 + 0.5 * Math.sin(clock * spd + ph + cluster * 1.4);
					out.ch = h > thr + 0.004 ? '+' : '.';
					out.a = 0.07 + 0.23 * tw;
					out.tone = 0;
				}
			}

			// pulsing corona behind a focused encrypted core: faint shockwave rings breathing outward.
			// drawn before the spheres so the orbiting notes occlude it — it glows behind them, not over them
			const C = f.data.corona as { sx: number; sy: number; R: number; t: number } | null;
			if (C) {
				const od = Math.hypot(x - C.sx, (y - C.sy) * f.aspect) - C.R;
				const reach = C.R * 3.8;
				if (od > 0 && od < reach) {
					const wave = 0.5 + 0.5 * Math.sin(od * 0.9 - C.t * 4);
					const s = wave * (1 - od / reach) * 1.1;
					if (s > 0.05) {
						out.ch = s > 0.6 ? 'o' : s > 0.33 ? ':' : '.';
						out.a = Math.min(1, s);
						out.tone = 4;
					}
				}
			}

			// encrypted cores: a red "?" sphere at each system centre. Locked = "?" meridians; once
			// unlocked this session, the surface calms and a cyan node lights the core.
			for (const L of f.data.live as Live[]) {
				if (!L.planet.core) continue;
				const dx = x - L.sx;
				const dy = (y - L.sy) * f.aspect;
				const d = Math.hypot(dx, dy);
				const R = L.planet.r;
				if (d > R) continue;
				const nx = dx / R;
				const ny = dy / R;
				const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
				const b = clamp(nx * -0.5 + ny * -0.55 + nz * 0.66);
				const pulse = 0.82 + 0.18 * Math.sin(clock * 2 + L.sx * 0.3);
				const shadeCh = RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(b * (RAMP.length - 1) * 0.85))];
				if (L.planet.unlocked) {
					out.ch = d < 1.2 ? '*' : shadeCh;
					out.a = Math.min(1, (0.3 + 0.6 * b) * pulse);
					out.tone = d < 1.2 ? 2 : 4;
				} else {
					const lon = Math.atan2(nx, nz) + clock * 0.15;
					const mark = d < 1.3 || 0.5 + 0.5 * Math.sin(lon * 4 + ny * 3) > 0.82;
					out.ch = mark ? '?' : shadeCh;
					out.a = Math.min(1, (0.28 + 0.6 * b) * pulse);
					out.tone = 4;
				}
			}

			// public planets: shaded, lightly banded spheres in the note's maturity tone
			let bestZ = Infinity;
			for (const L of f.data.live as Live[]) {
				const p = L.planet;
				if (p.core) continue;
				const dx = x - L.sx;
				const dy = (y - L.sy) * f.aspect;
				const d = Math.hypot(dx, dy);
				if (d >= p.r || d >= bestZ) continue;
				bestZ = d;
				const nx = dx / p.r;
				const ny = dy / p.r;
				const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
				const b = clamp(nx * -0.5 + ny * -0.55 + nz * 0.66);
				const lon = Math.atan2(nx, nz) + clock * p.spin;
				const band = 0.5 + 0.5 * Math.sin(lon * 5 + ny * 7);
				const shade = clamp(b * 0.82 + band * 0.18 * b);
				out.ch = RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(shade * (RAMP.length - 1)))];
				out.a = Math.min(1, 0.25 + 0.75 * shade);
				out.tone = shade > 0.78 ? 3 : p.tone;
			}

			// ASCII Saturn ring over the focused body: a tilted ellipse with a highlight sweeping round
			// it, and a bright node orbiting — rendered on top of everything
			const R = f.data.ring as { sx: number; sy: number; Rx: number; Ry: number; t: number; nodeX: number; nodeY: number } | null;
			if (R) {
				const vdx = x - R.sx;
				const vdy = (y - R.sy) * f.aspect;
				const e = (vdx / R.Rx) ** 2 + (vdy / R.Ry) ** 2;
				if (Math.abs(e - 1) < 0.32) {
					const sweep = 0.5 + 0.5 * Math.sin(Math.atan2(vdy / R.Ry, vdx / R.Rx) - R.t * 2);
					out.ch = sweep > 0.66 ? '*' : sweep > 0.33 ? '+' : 'o';
					out.a = 0.55 + 0.45 * sweep;
					out.tone = 1;
				}
				if (Math.hypot(x - R.nodeX, (y - R.nodeY) * f.aspect) < 1.1) {
					out.ch = 'O';
					out.a = 1;
					out.tone = 2;
				}
			}
		},
	});

	const open = () => {
		if (dragged) {
			dragged = false;
			return;
		}
		let L: Live | null = null;
		let bd = Infinity;
		for (const l of lastLive) {
			const dp = Math.hypot(l.sx - px, (l.sy - py) * lastAspect);
			if (dp < l.planet.r + 0.8 && dp < bd) {
				bd = dp;
				L = l;
			}
		}
		if (!L) {
			if (held) opts.onClose?.();
			return;
		}
		pendingHeld = L.planet;
		opts.onOpen?.(L.planet.note, screenOf(L, lastCols, lastRows));
	};
	const onDown = (e: PointerEvent) => {
		toCell(e);
		if (held) return;
		pressed = true;
		dragged = false;
		dragX = e.clientX;
		dragScroll = scrollY;
		canvas.setPointerCapture?.(e.pointerId);
	};
	const onMove = (e: PointerEvent) => {
		toCell(e);
		if (!pressed || worldWcells <= 0) return;
		const dx = e.clientX - dragX;
		if (Math.abs(dx) > 4) dragged = true;
		const cellW = canvas.clientWidth / Math.max(1, lastCols);
		const span = opts.container.offsetHeight - innerHeight;
		const worldPx = worldWcells * cellW;
		if (worldPx > 0) scrollTo({ top: dragScroll - dx * (span / worldPx), behavior: 'auto' });
	};
	canvas.addEventListener('click', open);
	canvas.addEventListener('pointerdown', onDown);
	canvas.addEventListener('pointermove', onMove);
	canvas.addEventListener('pointerup', () => {
		pressed = false;
	});
	canvas.addEventListener('pointerleave', () => {
		pactive = false;
		pressed = false;
	});

	return {
		...handle,
		// pin focus to the hovered body while its card is open (so the scene stays frozen)
		setHeld(v: boolean) {
			held = v ? pendingHeld : null;
		},
		// mark a core decrypted this session so its sphere lights up
		markUnlocked(id: string) {
			for (const p of planets) if (p.core && p.note.id === id) p.unlocked = true;
		},
		destroy() {
			canvas.removeEventListener('click', open);
			canvas.removeEventListener('pointerdown', onDown);
			canvas.removeEventListener('pointermove', onMove);
		},
	};
}
