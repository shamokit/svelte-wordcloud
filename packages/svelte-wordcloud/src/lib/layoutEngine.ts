import type { ProcessedWord, WordItem } from './types.js';

export const CHAR_W_FALLBACK = 0.6;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_SPIRAL_STEPS = 6000;

export function makeYielder(budgetMs = 16): () => Promise<void> {
	const perf = typeof performance !== 'undefined' ? performance : { now: () => Date.now() };
	let last = perf.now();
	return async () => {
		const now = perf.now();
		if (now - last > budgetMs) {
			last = now;
			await new Promise<void>((r) => setTimeout(r, 0));
		}
	};
}

export type BBox = { cx: number; cy: number; hw: number; hh: number };
export type BBoxFn = (word: string, fontSize: number) => { hw: number; hh: number };

export function makeBboxFn(
	wordWidths: Record<string, number>,
	wordHalfH: Record<string, number>,
	charH: number,
	padding: number,
	/** Extra gap as a fraction of the word's font size, added on top of the
	 *  fixed pixel-based `padding`. Ensures that large words get proportionally
	 *  larger gaps instead of being crammed together. Default 0 (off). */
	paddingFrac = 0,
): BBoxFn {
	return (word, fontSize) => {
		const w = wordWidths[word] ?? word.length * CHAR_W_FALLBACK;
		const hh = wordHalfH[word] ?? charH * 0.6;
		// Use whichever is larger: the fixed pixel floor or the proportional gap.
		// Small words keep the familiar fixed gap; large words get proportionally
		// more breathing room without affecting medium/small word layout.
		const pad = Math.max(padding, fontSize * paddingFrac);
		return {
			hw: (w * fontSize) / 2 + pad,
			hh: hh * fontSize + pad,
		};
	};
}

/**
 * Spatial hash grid for O(1) amortised AABB overlap queries.
 * Cell size should be roughly 2× the average bbox half-extent so that
 * any two overlapping boxes share at least one grid cell.
 *
 * Keys are packed integers instead of template-literal strings to eliminate
 * per-operation heap allocations. Assumes cell indices fit in ±30000 (grid
 * cells are word-sized, so this covers canvases up to ~2.4 million px wide
 * at the minimum font size — well beyond any real use).
 */
export class SpatialGrid {
	private cells = new Map<number, number[]>();
	private readonly cellW: number;
	private readonly cellH: number;

	constructor(cellW: number, cellH: number) {
		this.cellW = Math.max(1e-6, cellW);
		this.cellH = Math.max(1e-6, cellH);
	}

	/** Pack two cell indices into a single 32-bit integer key. */
	private key(x: number, y: number): number {
		// Offset by 0x4000 (16384) so negatives map to positives,
		// then pack into low/high 16 bits. Handles indices ±16383.
		return ((x + 0x4000) & 0xffff) | (((y + 0x4000) & 0xffff) << 16);
	}

	private range(bbox: BBox): [number, number, number, number] {
		return [
			Math.floor((bbox.cx - bbox.hw) / this.cellW),
			Math.floor((bbox.cx + bbox.hw) / this.cellW),
			Math.floor((bbox.cy - bbox.hh) / this.cellH),
			Math.floor((bbox.cy + bbox.hh) / this.cellH),
		];
	}

	insert(idx: number, bbox: BBox): void {
		const [x0, x1, y0, y1] = this.range(bbox);
		for (let x = x0; x <= x1; x++) {
			for (let y = y0; y <= y1; y++) {
				const k = this.key(x, y);
				const cell = this.cells.get(k);
				if (cell) cell.push(idx);
				else this.cells.set(k, [idx]);
			}
		}
	}

	remove(idx: number, bbox: BBox): void {
		const [x0, x1, y0, y1] = this.range(bbox);
		for (let x = x0; x <= x1; x++) {
			for (let y = y0; y <= y1; y++) {
				const list = this.cells.get(this.key(x, y));
				if (!list) continue;
				const i = list.indexOf(idx);
				if (i >= 0) list.splice(i, 1);
			}
		}
	}

	candidates(bbox: BBox): number[] {
		const [x0, x1, y0, y1] = this.range(bbox);
		const seen = new Set<number>();
		for (let x = x0; x <= x1; x++) {
			for (let y = y0; y <= y1; y++) {
				const list = this.cells.get(this.key(x, y));
				if (list) for (const idx of list) seen.add(idx);
			}
		}
		return [...seen];
	}
}

function gridCellSize(
	bboxFn: BBoxFn,
	sizes: ReadonlyArray<{ item: { word: string }; fontSize: number }>,
): { cellW: number; cellH: number } {
	let totalHW = 0,
		totalHH = 0;
	for (const { item, fontSize } of sizes) {
		const { hw, hh } = bboxFn(item.word, fontSize);
		totalHW += hw;
		totalHH += hh;
	}
	const n = Math.max(1, sizes.length);
	return { cellW: (totalHW / n) * 2, cellH: (totalHH / n) * 2 };
}

type LayerState = { occupied: BBox[]; grid: SpatialGrid };

function tryList(
	list: Array<{ x: number; y: number; d2: number }>,
	isValid: (x: number, y: number) => boolean,
	maxCandidates = 128,
): { x: number; y: number } | null {
	// Partial-sort: only sort the best `maxCandidates` entries when the list is large.
	// Most placements succeed within the first few candidates, so checking 128
	// sorted entries is effectively the same as checking all of them.
	const items = list.length > maxCandidates ? list.sort((a, b) => a.d2 - b.d2).slice(0, maxCandidates) : list.sort((a, b) => a.d2 - b.d2);
	for (const { x, y } of items) {
		if (isValid(x, y)) return { x, y };
	}
	return null;
}

async function placeSpiral(
	word: string,
	fontSize: number,
	rxBound: number,
	ryBound: number,
	occupied: BBox[],
	grid: SpatialGrid | null,
	bboxFn: BBoxFn,
	maybeYield: () => Promise<void>,
	maxSteps = MAX_SPIRAL_STEPS,
): Promise<{ x: number; y: number } | null> {
	const { hw, hh } = bboxFn(word, fontSize);
	const xMax = rxBound - hw;
	const yMax = ryBound - hh;
	if (xMax <= 0 || yMax <= 0) return null;

	const cornerDist = Math.sqrt(xMax * xMax + yMax * yMax);
	const spiralStep = Math.max(
		Math.min(hw, hh) * 0.15,
		// Use the actual step budget (not MAX_SPIRAL_STEPS) so the spiral always
		// reaches the far corners regardless of how many steps are allocated.
		// With SPIRAL_STEPS_3D=800 and MAX_SPIRAL_STEPS in the denominator the
		// spiral only covers ~37% of the corner distance, leaving corners empty.
		cornerDist / Math.sqrt(maxSteps),
	);

	const isValid = (x: number, y: number) => {
		if (Math.abs(x) > xMax || Math.abs(y) > yMax) return false;
		const q = { cx: x, cy: y, hw, hh };
		const idxs = grid ? grid.candidates(q) : occupied.map((_, i) => i);
		return idxs.every(
			(i) =>
				Math.abs(x - occupied[i].cx) >= hw + occupied[i].hw ||
				Math.abs(y - occupied[i].cy) >= hh + occupied[i].hh,
		);
	};

	for (let i = 0; i < maxSteps; i++) {
		if (i % 150 === 0) await maybeYield();
		const r = spiralStep * Math.sqrt(i);
		const angle = i * GOLDEN_ANGLE;
		const x = r * Math.cos(angle);
		const y = r * Math.sin(angle);
		if (Math.abs(x) > xMax || Math.abs(y) > yMax) continue;
		if (isValid(x, y)) return { x, y };
	}
	return null;
}

export async function placeAdjacent(
	word: string,
	fontSize: number,
	rxBound: number,
	ryBound: number,
	occupied: BBox[],
	grid: SpatialGrid | null,
	bboxFn: BBoxFn,
	randomness: number,
	maybeYield: () => Promise<void>,
	maxSpiralSteps = MAX_SPIRAL_STEPS,
): Promise<{ x: number; y: number } | null> {
	const { hw, hh } = bboxFn(word, fontSize);
	const xMax = rxBound - hw;
	const yMax = ryBound - hh;
	if (xMax <= 0 || yMax <= 0) return null;

	const isValid = (x: number, y: number) => {
		if (Math.abs(x) > xMax || Math.abs(y) > yMax) return false;
		const q = { cx: x, cy: y, hw, hh };
		const idxs = grid ? grid.candidates(q) : occupied.map((_, i) => i);
		return idxs.every(
			(i) =>
				Math.abs(x - occupied[i].cx) >= hw + occupied[i].hw ||
				Math.abs(y - occupied[i].cy) >= hh + occupied[i].hh,
		);
	};

	if (occupied.length === 0) return isValid(0, 0) ? { x: 0, y: 0 } : null;

	// Generate adjacency candidates only from the most-recently-placed words —
	// they form the growing frontier where new words attach. Keeps per-word cost
	// O(1) instead of O(N); interior gaps fall through to the spiral scan, which
	// covers the whole region from the centre outward. Overlap checks still run
	// against every placed word via the grid, so correctness is unaffected.
	const FRONTIER_K = 64;
	const anchors =
		occupied.length <= FRONTIER_K ? occupied : occupied.slice(-FRONTIER_K);

	const JITTER = randomness;
	const jit = (max: number) => (Math.random() - 0.5) * 2 * max;
	const jitCands: Array<{ x: number; y: number; d2: number }> = [];
	const exactCands: Array<{ x: number; y: number; d2: number }> = [];

	for (const p of anchors) {
		const rx_ = p.cx + p.hw + hw;
		const lx_ = p.cx - p.hw - hw;
		const ty_ = p.cy + p.hh + hh;
		const by_ = p.cy - p.hh - hh;
		for (const [x, y] of [
			[rx_, p.cy + jit(hh * JITTER)],
			[lx_, p.cy + jit(hh * JITTER)],
			[p.cx + jit(hw * JITTER), ty_],
			[p.cx + jit(hw * JITTER), by_],
			[rx_, ty_],
			[rx_, by_],
			[lx_, ty_],
			[lx_, by_],
		] as [number, number][]) {
			if (Math.abs(x) <= xMax && Math.abs(y) <= yMax)
				jitCands.push({ x, y, d2: x * x + y * y });
		}
		for (const [x, y] of [
			[rx_, p.cy],
			[lx_, p.cy],
			[p.cx, ty_],
			[p.cx, by_],
		] as [number, number][]) {
			if (Math.abs(x) <= xMax && Math.abs(y) <= yMax)
				exactCands.push({ x, y, d2: x * x + y * y });
		}
	}

	await maybeYield();

	const hit1 = tryList(jitCands, isValid) ?? tryList(exactCands, isValid);
	if (hit1) return hit1;

	const N_CROSS = Math.min(20, anchors.length);
	const nearest = anchors
		.map((p) => ({ p, d2: p.cx * p.cx + p.cy * p.cy }))
		.sort((a, b) => a.d2 - b.d2)
		.slice(0, N_CROSS)
		.map((o) => o.p);

	const crossCands: Array<{ x: number; y: number; d2: number }> = [];
	for (const p of nearest) {
		const rx1 = p.cx + p.hw + hw;
		const lx1 = p.cx - p.hw - hw;
		const ty1 = p.cy + p.hh + hh;
		const by1 = p.cy - p.hh - hh;
		for (const q of anchors) {
			if (q === p) continue;
			for (const x of [rx1, lx1]) {
				if (Math.abs(x) <= xMax && Math.abs(q.cy) <= yMax)
					crossCands.push({ x, y: q.cy, d2: x * x + q.cy * q.cy });
			}
			for (const y of [ty1, by1]) {
				if (Math.abs(q.cx) <= xMax && Math.abs(y) <= yMax)
					crossCands.push({ x: q.cx, y, d2: q.cx * q.cx + y * y });
			}
		}
	}

	await maybeYield();

	const hit2 = tryList(crossCands, isValid);
	if (hit2) return hit2;

	return placeSpiral(word, fontSize, rxBound, ryBound, occupied, grid, bboxFn, maybeYield, maxSpiralSteps);
}

export async function compactLayer(
	words: ProcessedWord[],
	iterations: number,
	rxBound: number,
	ryBound: number,
	bboxFn: BBoxFn,
	maybeYield: () => Promise<void>,
): Promise<void> {
	if (words.length === 0) return;

	const boxes = words.map((w) => {
		const { hw, hh } = bboxFn(w.word, w.fontSize);
		return { cx: w.x, cy: w.y, hw, hh };
	});

	let totalHW = 0,
		totalHH = 0;
	for (const b of boxes) {
		totalHW += b.hw;
		totalHH += b.hh;
	}
	const n = boxes.length;
	const grid = new SpatialGrid((totalHW / n) * 2, (totalHH / n) * 2);
	boxes.forEach((b, i) => grid.insert(i, b));

	const noOverlap = (i: number, tx: number, ty: number): boolean => {
		const b = boxes[i];
		if (Math.abs(tx) > rxBound - b.hw || Math.abs(ty) > ryBound - b.hh) return false;
		const q = { cx: tx, cy: ty, hw: b.hw, hh: b.hh };
		for (const j of grid.candidates(q)) {
			if (j === i) continue;
			const p = boxes[j];
			if (Math.abs(tx - p.cx) < b.hw + p.hw && Math.abs(ty - p.cy) < b.hh + p.hh)
				return false;
		}
		return true;
	};

	for (let iter = 0; iter < iterations; iter++) {
		await maybeYield();

		const order = boxes
			.map((b, i) => ({ d: b.cx * b.cx + b.cy * b.cy, i }))
			.sort((a, b) => a.d - b.d)
			.map((o) => o.i);

		for (const i of order) {
			const b = boxes[i];

			if (b.cx * b.cx + b.cy * b.cy > 1e-4) {
				let lo = 0,
					hi = 1;
				for (let bs = 0; bs < 14; bs++) {
					const mid = (lo + hi) / 2;
					if (noOverlap(i, b.cx * (1 - mid), b.cy * (1 - mid))) lo = mid;
					else hi = mid;
				}
				if (lo > 1e-4) {
					grid.remove(i, b);
					b.cx *= 1 - lo;
					b.cy *= 1 - lo;
					grid.insert(i, b);
				}
			}

			if (Math.abs(b.cx) > 1e-4) {
				const dir = -Math.sign(b.cx);
				let lo = 0,
					hi = Math.abs(b.cx);
				for (let bs = 0; bs < 14; bs++) {
					const mid = (lo + hi) / 2;
					if (noOverlap(i, b.cx + dir * mid, b.cy)) lo = mid;
					else hi = mid;
				}
				if (lo > 1e-4) {
					grid.remove(i, b);
					b.cx += dir * lo;
					grid.insert(i, b);
				}
			}

			if (Math.abs(b.cy) > 1e-4) {
				const dir = -Math.sign(b.cy);
				let lo = 0,
					hi = Math.abs(b.cy);
				for (let bs = 0; bs < 14; bs++) {
					const mid = (lo + hi) / 2;
					if (noOverlap(i, b.cx, b.cy + dir * mid)) lo = mid;
					else hi = mid;
				}
				if (lo > 1e-4) {
					grid.remove(i, b);
					b.cy += dir * lo;
					grid.insert(i, b);
				}
			}
		}

		for (let i = 0; i < words.length; i++) {
			words[i].x = boxes[i].cx;
			words[i].y = boxes[i].cy;
		}
	}
}

// ── 3D layout ────────────────────────────────────────────────────────────────

export type Layout3DParams = {
	data: WordItem[];
	wordWidths: Record<string, number>;
	wordHalfH: Record<string, number>;
	charH: number;
	rx: number;
	ry: number;
	padding: number;
	fontSizeContrast: number;
	topWordArea: number;
	randomness: number;
	layerSpacing: number;
	computedWordColor: string;
};

export type Layout3DResult = { words: ProcessedWord[]; numLayers: number };

export async function* computeLayout3D(
	params: Layout3DParams,
): AsyncGenerator<Layout3DResult> {
	const {
		data: rawData,
		wordWidths,
		wordHalfH,
		charH,
		rx,
		ry,
		padding,
		fontSizeContrast,
		topWordArea,
		randomness,
		layerSpacing,
		computedWordColor,
	} = params;

	const maybeYield = makeYielder(8);
	const bboxFn = makeBboxFn(wordWidths, wordHalfH, charH, padding);

	const data = rawData.filter(
		(d) =>
			typeof d.word === 'string' &&
			d.word.trim().length > 0 &&
			typeof d.counts === 'number' &&
			isFinite(d.counts) &&
			d.counts > 0,
	);

	if (!data.length) {
		yield { words: [], numLayers: 1 };
		return;
	}

	const sqrtCounts = data.map((d) => Math.sqrt(d.counts));
	const sqrtMin = Math.min(...sqrtCounts);
	const sqrtMax = Math.max(...sqrtCounts);
	const sorted = [...data].sort((a, b) => b.counts - a.counts);

	const viewArea = 4 * rx * ry;
	const topWord = sorted[0]?.word ?? '';
	const topWordW = Math.max(
		wordWidths[topWord] ?? topWord.length * CHAR_W_FALLBACK,
		4 * CHAR_W_FALLBACK,
	);
	const portraitScale = Math.min(1.5, Math.max(1, ry / rx));
	const rawMaxF = Math.sqrt((topWordArea * viewArea) / (topWordW * charH));
	const maxFByW = (portraitScale * rx) / topWordW;
	const maxFByH = ry / charH;
	const minF = Math.min(rx, ry) * 0.08;
	const initialMaxF = Math.min(rawMaxF, maxFByW, maxFByH);
	const computeSizes = (maxF: number) =>
		sorted.map((item) => {
			const sqrtVal = Math.sqrt(item.counts);
			let fontSize: number;
			if (sqrtMin === sqrtMax) {
				fontSize = (minF + maxF) / 2;
			} else {
				const t = (sqrtVal - sqrtMin) / (sqrtMax - sqrtMin);
				fontSize = minF + Math.pow(t, fontSizeContrast) * (maxF - minF);
			}
			const itemW = wordWidths[item.word] ?? item.word.length * CHAR_W_FALLBACK;
			fontSize = Math.min(fontSize, (portraitScale * rx) / itemW);
			return { item, fontSize, color: item.color ?? computedWordColor };
		});

	const sizes = computeSizes(initialMaxF);
	const result: ProcessedWord[] = [];

	// Fewer spiral steps for 3D: words that miss go to the next layer (still displayed).
	const SPIRAL_STEPS_3D = 800;
	// Yield at most once per this many newly-placed words to cap render overhead.
	const YIELD_BATCH = 15;

	// Process layer by layer: fill the current layer before creating the next.
	// Each layer's words are pre-scaled to a cap set by the previous layer, so
	// they are placed at their final size — every layer packs densely, and
	// deeper layers are progressively smaller (depth cue) without leaving gaps.
	const layers: LayerState[] = [];
	let unplaced = sizes;
	// Upper bound on font size for the current layer (Infinity → layer 0, full size).
	let layerCap = Infinity;
	while (unplaced.length > 0) {
		// Scale this layer's words down to the cap so placement uses final sizes.
		if (layerCap < Infinity) {
			let curMaxF = 0;
			for (const u of unplaced) if (u.fontSize > curMaxF) curMaxF = u.fontSize;
			if (curMaxF > layerCap) {
				const s = layerCap / curMaxF;
				unplaced = unplaced.map((u) => ({
					...u,
					fontSize: Math.max(minF, u.fontSize * s),
				}));
			}
		}

		// Size the spatial grid for THIS layer's (scaled) words so overlap
		// queries stay O(1): deeper layers have far smaller words than layer 0.
		const { cellW, cellH } = gridCellSize(bboxFn, unplaced);
		const occupied: BBox[] = [];
		const grid = new SpatialGrid(cellW, cellH);
		layers.push({ occupied, grid });
		const li = layers.length - 1;

		const overflow: typeof sizes = [];
		let anyPlaced = false;
		let placedSinceYield = 0;
		let layerMinF = Infinity;

		for (const { item, fontSize, color } of unplaced) {
			const { hw, hh } = bboxFn(item.word, fontSize);

			const pos = await placeAdjacent(
				item.word,
				fontSize,
				rx,
				ry,
				occupied,
				grid,
				bboxFn,
				randomness,
				maybeYield,
				SPIRAL_STEPS_3D,
			);

			if (pos) {
				const bbox = { cx: pos.x, cy: pos.y, hw, hh };
				grid.insert(occupied.length, bbox);
				occupied.push(bbox);
				result.push({
					...item,
					fontSize,
					layerIndex: li,
					x: pos.x,
					y: pos.y,
					z: -li * layerSpacing,
					color,
				});
				if (fontSize < layerMinF) layerMinF = fontSize;
				anyPlaced = true;
				if (++placedSinceYield >= YIELD_BATCH) {
					placedSinceYield = 0;
					yield { words: result, numLayers: layers.length };
				}
			} else {
				overflow.push({ item, fontSize, color });
			}
		}

		yield { words: result, numLayers: layers.length };
		unplaced = overflow;
		if (!anyPlaced) break;
		if (unplaced.length > 0) {
			// Next layer's largest word must not exceed this layer's smallest.
			layerCap = Math.max(layerMinF, minF);
		}
	}

	const { words: bestWords, numLayers } = { words: result, numLayers: layers.length };

	// ── Compaction per layer ──────────────────────────────────────────────────
	const byLayerCompact: ProcessedWord[][] = Array.from({ length: numLayers }, () => []);
	for (const w of bestWords) byLayerCompact[w.layerIndex].push(w);
	for (const layer of byLayerCompact) {
		await compactLayer(layer, 6, rx, ry, bboxFn, maybeYield);
		yield { words: bestWords, numLayers };
	}

	yield { words: bestWords, numLayers };
}

// ── Flat layout ───────────────────────────────────────────────────────────────

export type LayoutFlatParams = {
	data: WordItem[];
	wordWidths: Record<string, number>;
	wordHalfH: Record<string, number>;
	charH: number;
	rx: number;
	ry: number;
	padding: number;
	/** Extra gap proportional to each word's font size (see `makeBboxFn`). */
	paddingFrac: number;
	fontSizeContrast: number;
	topWordArea: number;
	randomness: number;
	computedWordColor: string;
};

export async function* computeLayoutFlat(
	params: LayoutFlatParams,
): AsyncGenerator<ProcessedWord[]> {
	const {
		data: rawData,
		wordWidths,
		wordHalfH,
		charH,
		rx,
		ry,
		padding,
		paddingFrac,
		fontSizeContrast,
		topWordArea,
		randomness,
		computedWordColor,
	} = params;

	const maybeYield = makeYielder(8);
	const bboxFn = makeBboxFn(wordWidths, wordHalfH, charH, padding, paddingFrac);

	const data = rawData.filter(
		(d) =>
			typeof d.word === 'string' &&
			d.word.trim().length > 0 &&
			typeof d.counts === 'number' &&
			isFinite(d.counts) &&
			d.counts > 0,
	);

	if (!data.length) {
		yield [];
		return;
	}

	const sqrtCounts = data.map((d) => Math.sqrt(d.counts));
	const sqrtMin = Math.min(...sqrtCounts);
	const sqrtMax = Math.max(...sqrtCounts);
	const sorted = [...data].sort((a, b) => b.counts - a.counts);

	const viewArea = 4 * rx * ry;
	const topWord = sorted[0]?.word ?? '';
	const topWordW = Math.max(
		wordWidths[topWord] ?? topWord.length * CHAR_W_FALLBACK,
		4 * CHAR_W_FALLBACK,
	);
	const portraitScale = Math.min(1.5, Math.max(1, ry / rx));
	const rawMaxF = Math.sqrt((topWordArea * viewArea) / (topWordW * charH));
	const maxFByW = (portraitScale * rx) / topWordW;
	const maxFByH = ry / charH;
	const minF = Math.min(rx, ry) * 0.04;
	const maxF = Math.min(rawMaxF, maxFByW, maxFByH);

	// Allow placement 3× beyond the visible viewport — words outside are accessed via zoom-out.
	const placementRx = rx * 3;
	const placementRy = ry * 3;

	const sizes = sorted.map((item) => {
		const sqrtVal = Math.sqrt(item.counts);
		let fontSize: number;
		if (sqrtMin === sqrtMax) {
			fontSize = (minF + maxF) / 2;
		} else {
			const t = (sqrtVal - sqrtMin) / (sqrtMax - sqrtMin);
			fontSize = minF + Math.pow(t, fontSizeContrast) * (maxF - minF);
		}
		const itemW = wordWidths[item.word] ?? item.word.length * CHAR_W_FALLBACK;
		fontSize = Math.min(fontSize, (portraitScale * rx) / itemW);
		return { item, fontSize, color: item.color ?? computedWordColor };
	});

	const { cellW, cellH } = gridCellSize(bboxFn, sizes);
	const grid = new SpatialGrid(cellW, cellH);
	const occupied: BBox[] = [];
	const result: ProcessedWord[] = [];

	for (const { item, fontSize, color } of sizes) {
		const { hw, hh } = bboxFn(item.word, fontSize);
		const pos = await placeAdjacent(
			item.word,
			fontSize,
			placementRx,
			placementRy,
			occupied,
			grid,
			bboxFn,
			randomness,
			maybeYield,
		);
		if (pos === null) continue;
		const bbox = { cx: pos.x, cy: pos.y, hw, hh };
		grid.insert(occupied.length, bbox);
		occupied.push(bbox);
		result.push({ ...item, fontSize, layerIndex: 0, x: pos.x, y: pos.y, z: 0, color });
		yield result;
	}

	await compactLayer(result, 20, placementRx, placementRy, bboxFn, maybeYield);
	yield result;
}
