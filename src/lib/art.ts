import { type Field, type Glyph, mount, NOISE, RAMP, randomGlyph, seeded, type Shader, textMask, wave } from './ascii';

// tone indices shared by every piece: 0 muted, 1-5 accent -> accent-2 gradient, 6 hot, 7 text
const TONES = [
	'--muted',
	'--accent',
	'mix:--accent:--accent-2:0.25',
	'mix:--accent:--accent-2:0.5',
	'mix:--accent:--accent-2:0.75',
	'--accent-2',
	'--hot',
	'--text-strong',
];
const gradient = (t: number) => 1 + Math.max(0, Math.min(4, Math.floor(t * 5)));
const hash = (a: number, b: number) => {
	const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return s - Math.floor(s);
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const cssFont = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'monospace';
const HEX = '0123456789ABCDEF';
const COVER_RAMP = '.:-=+*';

/** Cell -> centred coordinates where the canvas height spans -1..1 and circles stay round. */
function norm(x: number, y: number, f: Field) {
	const half = (f.rows * f.aspect) / 2;
	return { u: (x + 0.5 - f.cols / 2) / half, v: ((y + 0.5) * f.aspect - half) / half, cu: 1 / half, cv: f.aspect / half };
}

/** A word drawn out of characters: flowing fill, scanner lens under the cursor, click shockwave, row tears. */
export function wordmark(canvas: HTMLCanvasElement, text: string, { cell = 9, glitch = 0.05, dissolve = false } = {}) {
	const font = cssFont('--font-display');
	const fill = text.replace(/\s/g, '');
	document.fonts.load(`800 64px ${font}`, text).finally(() =>
		mount(canvas, {
			cell,
			tones: TONES,
			dissolve,
			setup(field) {
				// two lines whenever the box is tall enough, letters read better big
				const wide = field.cols / (field.rows * field.aspect) > 4.5;
				const lines = !wide && text.length > 8 ? splitWord(text) : text;
				field.data.mask = textMask(lines, field.cols, field.rows, field.aspect, font);
			},
			shader(x, y, field, out) {
				const { cols, rows, time: t, aspect, pointer: p } = field;
				const mask = field.data.mask as Float32Array;

				// horizontal tears, more of them while the page is scrolling fast
				const tick = Math.floor(t * 7);
				const tearChance = glitch + Math.min(0.5, field.scroll.speed / 4000);
				const tear = hash(tick, 1) < tearChance && hash(y, tick) < 0.3 ? Math.round((hash(y, tick + 9) - 0.5) * 10) : 0;

				// scanner lens magnifies whatever is under the pointer
				const dx = x - p.x;
				const dy = (y - p.y) * aspect;
				const d = Math.hypot(dx, dy);
				const radius = Math.min(24, cols / 5);
				const lens = p.active && d < radius;
				let sx = x - tear;
				let sy = y;
				if (lens) {
					const k = 0.55 + 0.45 * (d / radius) ** 2;
					sx = p.x + dx * k;
					sy = p.y + (y - p.y) * k;
				}
				const ix = Math.round(sx);
				const iy = Math.round(sy);
				const cov = ix >= 0 && ix < cols && iy >= 0 && iy < rows ? mask[iy * cols + ix] : 0;

				// shockwave ring after a click, idle sweep when nobody is pointing
				const ring = Math.abs(d - (t - p.pressedAt) * 140) < 2.5 && t - p.pressedAt < 1.5;
				const sweepX = ((t % 7) / 7) * cols * 1.6 - cols * 0.3;
				const sweep = !p.active && Math.abs(x - sweepX) < 1.5;

				if (ring) {
					out.ch = cov > 0.18 ? randomGlyph() : randomGlyph('.:+*');
					out.a = cov > 0.18 ? 1 : 0.7;
					out.tone = 6;
					return;
				}

				if (cov > 0.18) {
					out.a = 0.5 + 0.5 * cov;
					out.tone = gradient(x / cols);
					if (lens) {
						out.ch = HEX[Math.floor(hash(x + Math.floor(t * 12), y) * 16)];
						out.tone = 7;
						out.a = 1;
					} else if (sweep || hash(x * 7 + y, Math.floor(t * 10)) < 0.015) {
						out.ch = randomGlyph();
						out.tone = 6;
						out.a = 1;
					} else if (cov < 0.5) {
						out.ch = RAMP[2 + Math.floor(cov * 5)];
					} else {
						out.ch = fill[(x + y * 5 + Math.floor(t * 3)) % fill.length];
					}
					return;
				}

				// background: sparse drifting dust, a faint hex readout inside the lens
				if (lens) {
					if (hash(x, y) < 0.35) {
						out.ch = HEX[Math.floor(hash(y, x + Math.floor(t * 4)) * 16)];
						out.a = 0.35 * (1 - d / radius);
						out.tone = 5;
					}
					return;
				}
				const n = wave(x, y, t * 0.5);
				if (n > 0.62 && hash(x, y) < 0.5) {
					out.ch = n > 0.8 ? ':' : '.';
					out.a = (n - 0.55) * 0.9;
					out.tone = 0;
				}
			},
		}),
	);
}

function splitWord(text: string) {
	// "notDeadCaller" -> "notDead\nCaller": break before the capital nearest the middle
	const caps = [...text.matchAll(/[A-Z]/g)].map((m) => m.index);
	const mid = caps.sort((a, b) => Math.abs(a - text.length / 2) - Math.abs(b - text.length / 2))[0];
	return mid ? `${text.slice(0, mid)}\n${text.slice(mid)}` : text;
}

// ── covers ────────────────────────────────────────────────────────────────

type Piece = { shader: Shader; setup?: (f: Field) => void; frame?: (f: Field) => void };

/** Chakshu: an eye that blinks, wanders, and follows the cursor. */
function eye(rand: () => number): Piece {
	const phase = rand() * 10;
	return {
		shader(x, y, f, out) {
			const { u, v, cv } = norm(x, y, f);
			const t = f.time + phase;
			const W = Math.min((f.cols / (f.rows * f.aspect)) * 0.85, 2.6);
			const cycle = t % 4.8;
			const open = cycle < 0.24 ? Math.abs(cycle - 0.12) / 0.12 : 1;
			const lid = 0.8 * open * (1 - (u / W) ** 2);
			let gx = Math.sin(t * 0.6) * W * 0.3;
			let gy = Math.sin(t * 0.9) * 0.12;
			if (f.pointer.active) {
				const target = norm(f.pointer.x, f.pointer.y, f);
				gx = clamp(target.u * 0.5, -W * 0.45, W * 0.45);
				gy = clamp(target.v * 0.3, -0.25, 0.25);
			}
			if (Math.abs(u) < W && Math.abs(Math.abs(v) - Math.max(lid, 0)) < cv * 0.6) {
				const side = u < -W * 0.3 ? -1 : u > W * 0.3 ? 1 : 0;
				out.ch = side === 0 ? '-' : (side < 0) === v < 0 ? '/' : '\\';
				out.a = 0.9;
				out.tone = gradient((u / W + 1) / 2);
				return;
			}
			if (Math.abs(u) < W && Math.abs(v) < lid) {
				const d = Math.hypot(u - gx, v - gy);
				const R = 0.52;
				if (d < R * 0.36) {
					if (Math.hypot(u - gx + 0.07, v - gy + 0.09) < cv * 0.8) {
						out.ch = 'o';
						out.a = 0.9;
						out.tone = 7;
					}
					return;
				}
				if (d < R) {
					const s = Math.sin(Math.atan2(v - gy, u - gx) * 14 + t * 0.4);
					out.ch = s > 0.3 ? '#' : s > -0.3 ? '*' : '+';
					out.a = 0.55 + 0.45 * (1 - d / R);
					out.tone = gradient(d / R);
					return;
				}
				if (hash(x, y) < 0.2) {
					out.ch = '.';
					out.a = 0.2;
				}
				return;
			}
			// lashes above the upper lid
			if (v < 0 && Math.abs(u) < W * 0.8 && -v - lid < 0.28 && -v - lid > cv && x % 3 === 0) {
				out.ch = u < -W * 0.25 ? '\\' : u > W * 0.25 ? '/' : '|';
				out.a = 0.35 * open;
				out.tone = 0;
			}
		},
	};
}

/** AnonComm: a skewed lattice (the structure behind lattice-based post-quantum crypto), packets riding its edges. */
function lattice(rand: () => number): Piece {
	const b1 = [0.42, 0.08 + rand() * 0.06];
	const b2 = [0.14 + rand() * 0.06, 0.44];
	const det = b1[0] * b2[1] - b2[0] * b1[1];
	const len1 = Math.hypot(b1[0], b1[1]);
	const len2 = Math.hypot(b2[0], b2[1]);
	return {
		shader(x, y, f, out) {
			const n = norm(x, y, f);
			const t = f.time;
			const u = n.u + t * 0.04;
			const { v, cu, cv } = n;
			const a = (u * b2[1] - v * b2[0]) / det;
			const b = (v * b1[0] - u * b1[1]) / det;
			const ra = Math.round(a);
			const rb = Math.round(b);
			const nodeU = Math.abs(u - (ra * b1[0] + rb * b2[0]));
			const nodeV = Math.abs(v - (ra * b1[1] + rb * b2[1]));
			const p = f.pointer;
			const near = p.active && Math.hypot(x - p.x, (y - p.y) * f.aspect) < 9;
			if (nodeU < cu * 0.6 && nodeV < cv * 0.6) {
				out.ch = near ? '#' : 'o';
				out.a = near ? 1 : 0.85;
				out.tone = near ? 7 : gradient(x / f.cols);
				return;
			}
			const along1 = (Math.abs(b - rb) * det) / len1 < cv * 0.45;
			const along2 = (Math.abs(a - ra) * det) / len2 < cu * 0.7;
			if (along1) {
				const packet = (((a - t * 0.9 - hash(rb, 1) * 7) % 3) + 3) % 3 < 0.14;
				out.ch = packet ? '>' : '-';
				out.a = packet ? 1 : 0.28;
				out.tone = packet ? 6 : 0;
				return;
			}
			if (along2) {
				out.ch = '\\';
				out.a = near ? 0.6 : 0.22;
				out.tone = near ? 5 : 0;
			}
		},
	};
}

/** pocketmedic: an ECG monitor, the trace redrawn by a sweeping write head. */
function pulse(rand: () => number): Piece {
	const offset = rand() * 2;
	const g = (p: number, c: number, w: number) => Math.exp(-(((p - c) / w) ** 2));
	const ecg = (p: number) =>
		0.1 * g(p, 0.35, 0.07) - 0.12 * g(p, 0.9, 0.025) + g(p, 1.0, 0.03) - 0.3 * g(p, 1.1, 0.03) + 0.22 * g(p, 1.55, 0.11);
	return {
		shader(x, y, f, out) {
			const { u, v, cu, cv } = norm(x, y, f);
			const ar = f.cols / (f.rows * f.aspect);
			const line = (uu: number) => 0.2 - ecg((((uu + ar) * 1.25 + offset) % 2.2 + 2.2) % 2.2) * 0.85;
			const v1 = line(u - cu / 2);
			const v2 = line(u + cu / 2);
			const span = 2 * ar + 0.6;
			const head = ((f.time * 0.9) % span) - ar;
			const behind = (((head - u) % span) + span) % span;
			if (v > Math.min(v1, v2) - cv * 0.5 && v < Math.max(v1, v2) + cv * 0.5 && behind > 0.04) {
				const slope = (v2 - v1) / cv;
				out.ch = Math.abs(slope) > 1.5 ? '|' : slope < -0.3 ? '/' : slope > 0.3 ? '\\' : '-';
				out.a = behind < 0.25 ? 1 : Math.max(0.12, 1 - behind / (span * 0.9));
				out.tone = behind < 0.25 ? 7 : gradient((u / ar + 1) / 2);
				return;
			}
			if (y % 4 === 0 && x % 2 === 0) {
				out.ch = x % 8 === 0 ? '+' : '.';
				out.a = 0.1;
			}
		},
	};
}

/** The OTP writeup: a six-digit code brute-forced upward until it hits, faint 401s behind it. */
function counter(rand: () => number): Piece {
	const font = cssFont('--font-mono');
	const fresh = () => Math.floor(rand() * 900000);
	const state = { n: fresh(), target: 0, last: 0, foundAt: -1, text: '' };
	state.target = state.n + 30 + Math.floor(rand() * 60);
	const remask = (f: Field) => {
		state.text = String(state.n % 1000000).padStart(6, '0');
		f.data.mask = textMask(state.text, f.cols, f.rows, f.aspect, font, 400);
	};
	return {
		setup: remask,
		frame(f) {
			const t = f.time;
			if (state.foundAt >= 0) {
				if (t - state.foundAt < 2.4) return;
				state.foundAt = -1;
				state.n = fresh();
				state.target = state.n + 30 + Math.floor(rand() * 60);
			} else if (t - state.last > 0.07) {
				state.last = t;
				state.n++;
				if (state.n >= state.target) state.foundAt = t;
			} else return;
			remask(f);
		},
		shader(x, y, f, out) {
			const mask = f.data.mask as Float32Array | undefined;
			const cov = mask ? mask[y * f.cols + x] : 0;
			const found = state.foundAt >= 0;
			if (cov > 0.25) {
				out.ch = state.text[(x + y) % 6];
				out.a = 0.55 + 0.45 * cov;
				out.tone = found ? 7 : gradient(x / f.cols);
				return;
			}
			if (y % 2 === 0) {
				const token = found ? '200 ' : '401 ';
				out.ch = token[(x + Math.floor(f.time * 6) + y * 3) % 4];
				out.a = found ? 0.22 : 0.08;
				out.tone = found ? 1 : 0;
			}
		},
	};
}

/** Any symbol, emoji or word, drawn out of characters with a shimmer passing through. */
function glyph(text: string): Piece {
	const font = cssFont('--font-display');
	return {
		setup(f) {
			f.data.mask = textMask(text, f.cols, f.rows, f.aspect, font, 700);
		},
		shader(x, y, f, out) {
			const cov = (f.data.mask as Float32Array)[y * f.cols + x];
			if (cov < 0.2) return;
			const shimmer = Math.sin(x * 0.25 - y * 0.4 - f.time * 2.5) > 0.94;
			out.ch = shimmer ? randomGlyph() : RAMP[Math.min(RAMP.length - 1, 3 + Math.floor(cov * 7))];
			out.a = 0.45 + 0.55 * cov;
			out.tone = shimmer ? 6 : gradient(x / f.cols);
		},
	};
}

/** Fallback when a post names no motif: one of a few interference families, seeded by the slug. */
function generative(rand: () => number): Piece {
	const family = Math.floor(rand() * 4);
	const cx = rand();
	const cy = rand();
	const freq = 0.25 + rand() * 0.5;
	const tilt = rand() * 2 - 1;
	const phase = rand() * 100;
	return {
		shader(x, y, f, out) {
			const { cols, rows, aspect } = f;
			const t = f.time + phase;
			const dx = x - cx * cols;
			const dy = (y - cy * rows) * aspect;
			let v: number;
			if (family === 0) v = Math.sin(Math.hypot(dx, dy) * freq - t * 2);
			else if (family === 1) v = Math.sin(dx * freq * 0.5 + Math.sin(dy * 0.15 + t) * 3);
			else if (family === 2) v = Math.sin((x + y * tilt * aspect) * freq) * wave(x, y, t * 0.6) * 2;
			else
				v =
					Math.sin(Math.hypot(dx, dy) * freq - t) +
					Math.sin(Math.hypot(x - cols * (1 - cx), (y - rows * (1 - cy)) * aspect) * freq + t);
			const level = (v + 1) / 2;
			if (level < 0.5) return;
			out.ch = COVER_RAMP[Math.min(COVER_RAMP.length - 1, Math.floor(((level - 0.5) / 0.5) * COVER_RAMP.length))];
			out.a = (level - 0.35) * 1.1;
			out.tone = gradient(x / cols);
		},
	};
}

const MOTIFS: Record<string, (rand: () => number) => Piece> = { eye, lattice, pulse, counter };

/** Cover art for a post or project. `motif` comes from frontmatter: a named motif or `glyph:<text>`. */
export function cover(canvas: HTMLCanvasElement, seed: string, motif = '', options: { target?: Element | null; dissolve?: boolean } = {}) {
	const rand = seeded(seed);
	const piece = motif.startsWith('glyph:') ? glyph(motif.slice(6)) : (MOTIFS[motif] ?? generative)(rand);
	const start = () =>
		mount(canvas, {
			cell: canvas.clientHeight < 140 ? 4.5 : 6,
			tones: TONES,
			fps: 24,
			target: options.target,
			dissolve: options.dissolve,
			setup: piece.setup,
			frame: piece.frame,
			shader(x, y, f, out: Glyph) {
				piece.shader(x, y, f, out);
				// the cursor scrambles whatever it touches
				if (out.a > 0 && f.pointer.active && Math.hypot(x - f.pointer.x, (y - f.pointer.y) * f.aspect) < 3) {
					out.ch = randomGlyph(NOISE);
					out.tone = 7;
				}
			},
		});
	if (motif.startsWith('glyph:')) document.fonts.load(`700 64px ${cssFont('--font-display')}`, motif.slice(6)).finally(start);
	else start();
}

// ── footer ────────────────────────────────────────────────────────────────

/** Kolkata at night: skyline, Howrah Bridge, the Hooghly reflecting it all. Windows light up as it scrolls into view. */
export function skyline(canvas: HTMLCanvasElement) {
	type City = { hy: number; heights: Int16Array; edges: Uint8Array; towers: Uint8Array; bx0: number; bx1: number; ta: number; tb: number; towerH: number };
	mount(canvas, {
		cell: innerWidth < 640 ? 4.5 : 5.5,
		tones: TONES,
		fps: 15,
		setup(f) {
			const rand = seeded('kolkata');
			const hy = Math.floor(f.rows * 0.64);
			const heights = new Int16Array(f.cols);
			const edges = new Uint8Array(f.cols);
			const towers = new Uint8Array(f.cols);
			for (let x = 0; x < f.cols; ) {
				const w = 2 + Math.floor(rand() * 6);
				const tall = rand() < 0.1;
				const h = Math.floor(hy * (tall ? 0.7 + rand() * 0.15 : 0.12 + rand() * 0.4));
				for (let i = 0; i < w && x + i < f.cols; i++) heights[x + i] = h;
				edges[x] = 1;
				if (x + w - 1 < f.cols) edges[x + w - 1] = 1;
				if (tall) towers[Math.min(f.cols - 1, x + (w >> 1))] = 1;
				x += w + (rand() < 0.3 ? 1 : 0);
			}
			const bx0 = Math.floor(f.cols * 0.55);
			const bx1 = Math.floor(f.cols * 0.86);
			const arm = Math.floor((bx1 - bx0) * 0.2);
			heights.fill(0, bx0, bx1 + 1);
			f.data.city = { hy, heights, edges, towers, bx0, bx1, ta: bx0 + arm, tb: bx1 - arm, towerH: Math.floor(hy * 0.9) } satisfies City;
		},
		shader(x, y, f, out) {
			const c = f.data.city as City;
			const t = f.time;
			const lit = 0.1 + f.scroll.seen * 0.55;

			const city = (cx: number, cy: number) => {
				const h = c.hy - cy;
				if (cx < 0 || cx >= f.cols || h < 1) return;
				// Howrah Bridge: cantilever towers, a top chord that dips toward the middle, a truss down to the deck
				if (cx >= c.bx0 && cx <= c.bx1) {
					const chord =
						cx < c.ta
							? 2 + ((c.towerH - 2) * (cx - c.bx0)) / (c.ta - c.bx0)
							: cx > c.tb
								? 2 + ((c.towerH - 2) * (c.bx1 - cx)) / (c.bx1 - c.tb)
								: c.towerH - c.towerH * 0.45 * Math.sin((Math.PI * (cx - c.ta)) / (c.tb - c.ta));
					out.tone = gradient((cx - c.bx0) / (c.bx1 - c.bx0));
					if ((cx === c.ta || cx === c.tb) && h <= c.towerH) {
						out.ch = '|';
						out.a = 0.8;
					} else if (Math.abs(h - chord) < 0.55) {
						const next = cx < c.ta ? 1 : cx > c.tb ? -1 : cx < (c.ta + c.tb) / 2 ? -1 : 1;
						out.ch = next > 0 ? '/' : '\\';
						out.a = 0.75;
					} else if (h === 2) {
						out.ch = '=';
						out.a = 0.7;
					} else if (h > 2 && h < chord) {
						out.ch = (cx + h) % 3 === 0 ? '/' : (cx - h) % 3 === 0 ? '\\' : ' ';
						out.a = 0.3;
					}
					return;
				}
				const top = c.heights[cx];
				if (h <= top) {
					if (h === top) {
						out.ch = '_';
						out.a = 0.35;
						out.tone = 0;
					} else if (c.edges[cx]) {
						out.ch = '|';
						out.a = 0.18;
						out.tone = 0;
					} else if (cx % 2 === 0 && h % 2 === 1) {
						const on = hash(cx, cy) < lit && hash(cx, cy + Math.floor(t * 0.3)) > 0.04;
						out.ch = '.';
						out.a = on ? 0.9 : 0.12;
						out.tone = on ? (hash(cy, cx) < 0.6 ? 1 : 5) : 0;
					}
					return;
				}
				if (c.towers[cx] && h <= top + 2) {
					const beacon = h === top + 2;
					out.ch = beacon ? '.' : '|';
					out.a = beacon ? (Math.sin(t * 3) > 0 ? 1 : 0.2) : 0.35;
					out.tone = beacon ? 6 : 0;
				}
			};

			if (y < c.hy) {
				city(x, y);
				if (out.a > 0) return;
				// a thin moon and a few stars
				const moon = Math.max(1.5, f.rows * 0.12);
				const mu = (x - f.cols * 0.12) / (moon * f.aspect);
				const mv = (y - f.rows * 0.22) / moon;
				if (Math.hypot(mu, mv) < 1 && Math.hypot(mu - 0.45, mv + 0.15) > 0.9) {
					out.ch = '#';
					out.a = 0.55;
					out.tone = 7;
				} else if (hash(x, y) < 0.012 && y < c.hy * 0.6) {
					out.ch = '.';
					out.a = 0.15 + 0.2 * Math.sin(t + x);
					out.tone = 7;
				}
				return;
			}
			if (y === c.hy) {
				out.ch = '-';
				out.a = 0.2;
				return;
			}
			// the river: the city mirrored, rippling
			const depth = y - c.hy;
			city(x + Math.round(Math.sin(depth * 1.3 + t * 1.6 + x * 0.07)), c.hy - depth);
			if (out.a > 0 && out.ch !== ' ') {
				out.ch = out.ch === '.' ? '-' : '~';
				out.a *= 0.4 * (1 - depth / (f.rows - c.hy + 1));
			} else out.a = 0;
		},
	});
}
