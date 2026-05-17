import type { ProcessedWord, WordItem } from './types.js';

export const CHAR_W_FALLBACK = 0.6;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_SPIRAL_STEPS = 6000;

export function makeYielder(budgetMs = 8): () => Promise<void> {
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
): BBoxFn {
	return (word, fontSize) => {
		const w = wordWidths[word] ?? word.length * CHAR_W_FALLBACK;
		const hh = wordHalfH[word] ?? charH * 0.6;
		return {
			hw: (w * fontSize) / 2 + padding,
			hh: hh * fontSize + padding,
		};
	};
}

/**
 * Spatial hash grid for O(1) amortised AABB overlap queries.
 * Cell size should be roughly 2× the average bbox half-extent so that
 * any two overlapping boxes share at least one grid cell.
 */
export class SpatialGrid {
	private cells = new Map<string, number[]>();
	private readonly cellW: number;
	private readonly cellH: number;

	constructor(cellW: number, cellH: number) {
		this.cellW = Math.max(1e-6, cellW);
		this.cellH = Math.max(1e-6, cellH);
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
				const k = `${x},${y}`;
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
				const list = this.cells.get(`${x},${y}`);
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
				const list = this.cells.get(`${x},${y}`);
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
): { x: number; y: number } | null {
	list.sort((a, b) => a.d2 - b.d2);
	for (const { x, y } of list) {
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
): Promise<{ x: number; y: number } | null> {
	const { hw, hh } = bboxFn(word, fontSize);
	const xMax = rxBound - hw;
	const yMax = ryBound - hh;
	if (xMax <= 0 || yMax <= 0) return null;

	const cornerDist = Math.sqrt(xMax * xMax + yMax * yMax);
	const spiralStep = Math.max(
		Math.min(hw, hh) * 0.15,
		cornerDist / Math.sqrt(MAX_SPIRAL_STEPS),
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

	for (let i = 0; i < MAX_SPIRAL_STEPS; i++) {
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

	const JITTER = randomness;
	const jit = (max: number) => (Math.random() - 0.5) * 2 * max;
	const jitCands: Array<{ x: number; y: number; d2: number }> = [];
	const exactCands: Array<{ x: number; y: number; d2: number }> = [];

	for (const p of occupied) {
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

	const N_CROSS = Math.min(20, occupied.length);
	const nearest = occupied
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
		for (const q of occupied) {
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

	return placeSpiral(word, fontSize, rxBound, ryBound, occupied, grid, bboxFn, maybeYield);
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
	const TARGET_COVERAGE = 0.5;
	const MAX_LAYOUT_ATTEMPTS = 5;

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

	let currentMaxF = initialMaxF;
	let best: Layout3DResult = { words: [], numLayers: 1 };

	for (let attempt = 0; attempt < MAX_LAYOUT_ATTEMPTS; attempt++) {
		if (attempt > 0) yield { words: [], numLayers: 1 };

		const sizes = computeSizes(currentMaxF);
		const { cellW, cellH } = gridCellSize(bboxFn, sizes);
		const newLayer = (): LayerState => ({
			occupied: [],
			grid: new SpatialGrid(cellW, cellH),
		});
		const layers: LayerState[] = [newLayer()];
		const result: ProcessedWord[] = [];

		for (const { item, fontSize, color } of sizes) {
			const { hw, hh } = bboxFn(item.word, fontSize);

			let placed = false;
			for (let li = 0; li < layers.length; li++) {
				const { occupied, grid } = layers[li];
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
					placed = true;
					break;
				}
			}

			if (!placed) {
				const li = layers.length;
				const layer = newLayer();
				layers.push(layer);
				const pos =
					(await placeAdjacent(
						item.word,
						fontSize,
						rx,
						ry,
						[],
						null,
						bboxFn,
						randomness,
						maybeYield,
					)) ?? { x: 0, y: 0 };
				const bbox = { cx: pos.x, cy: pos.y, hw, hh };
				layer.grid.insert(0, bbox);
				layer.occupied.push(bbox);
				result.push({
					...item,
					fontSize,
					layerIndex: li,
					x: pos.x,
					y: pos.y,
					z: -li * layerSpacing,
					color,
				});
			}

			yield { words: result, numLayers: layers.length };
		}

		best = { words: result, numLayers: layers.length };

		if (best.numLayers === 1) break;
		const totalBBoxArea = best.words.reduce((s, w) => {
			const { hw, hh } = bboxFn(w.word, w.fontSize);
			return s + 4 * hw * hh;
		}, 0);
		if (totalBBoxArea / (viewArea * best.numLayers) >= TARGET_COVERAGE) break;
		currentMaxF *= 0.82;
	}

	const { words: bestWords, numLayers } = best;

	// ── Layer font-size scaling ───────────────────────────────────────────────
	if (numLayers > 1) {
		const byLayer: ProcessedWord[][] = Array.from({ length: numLayers }, () => []);
		for (const w of bestWords) byLayer[w.layerIndex].push(w);
		for (let li = 1; li < numLayers; li++) {
			const prev = byLayer[li - 1];
			const cur = byLayer[li];
			if (!prev.length || !cur.length) continue;
			const prevMinF = Math.min(...prev.map((w) => w.fontSize));
			const curMaxF = Math.max(...cur.map((w) => w.fontSize));
			if (curMaxF > prevMinF) {
				const scale = prevMinF / curMaxF;
				for (const w of cur) w.fontSize *= scale;
			}
		}
	}
	for (const w of bestWords) {
		if (w.fontSize < minF) w.fontSize = minF;
	}

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
		fontSizeContrast,
		topWordArea,
		randomness,
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
