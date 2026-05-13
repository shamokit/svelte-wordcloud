<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { Spring } from 'svelte/motion';
	import { untrack } from 'svelte';
	import { DEV } from 'esm-env';
	import Scene from './Scene.svelte';
	import PanResetButton from './PanResetButton.svelte';
	import PanKeyControl from './PanKeyControl.svelte';
	import type { WordCloud3DProps, ProcessedWord, WordItem } from './types.js';
	import { getWCContext } from './WordCloud.svelte';
	import { createFontMetrics, CHAR_W_FALLBACK } from './fontMetrics.svelte.js';

	const {
		fontUrl,
		wheelScrollSpeed = 1,
		layout = {},
		a11y = {},
		onWordClick,
	}: WordCloud3DProps = $props();

	const layerSpacing    = $derived(layout.layerSpacing    ?? 12);
	const fontSizeContrast = $derived(layout.fontSizeContrast ?? 2.0);
	const topWordArea     = $derived(layout.topWordArea     ?? 0.22);
	const randomness      = $derived(layout.randomness      ?? 0.5);

	const depthValueText = $derived(a11y.depthValueText ?? ((c: number, t: number) => `Layer ${c} / ${t}`));
	const depthLabel     = $derived(a11y.depthLabel     ?? 'Depth');
	const panHint        = $derived(a11y.panHint        ?? 'Arrow keys to pan');
	const panLabel       = $derived(a11y.panLabel       ?? 'Pan camera. Use arrow keys to move the view.');
	const resetPanLabel  = $derived(a11y.resetPanLabel  ?? 'Reset pan (double-click)');

	// Read shared data and scroll controls from context
	const ctx = getWCContext();

	const TAN30 = Math.tan(Math.PI / 6); // tan(30°) = tan(FOV/2) for FOV=60
	// Gap between words in CSS pixels. Converted to world units at runtime.
	const GAP_PX = 16;
	const TARGET_COVERAGE = 0.5;
	const MAX_LAYOUT_ATTEMPTS = 5;

	// ── Font metrics ──────────────────────────────────────────────────────────
	const metrics = createFontMetrics(
		() => [...new Set(ctx.data.map((d) => d.word))],
		() => fontUrl,
	);
	const charH       = $derived(metrics.charH);
	const wordWidths  = $derived(metrics.wordWidths);
	const wordHalfH   = $derived(metrics.wordHalfH);

	const initLayerSpacing = untrack(() => layerSpacing);
	const initViewingDist = initLayerSpacing * 0.75;

	// ── Container size ────────────────────────────────────────────────────────
	let containerW = $state(0);
	let containerH = $state(0);
	let layoutW = $state(0);
	let layoutH = $state(0);

	$effect(() => {
		const w = containerW;
		const h = containerH;
		const t = setTimeout(() => {
			layoutW = w;
			layoutH = h;
		}, 150);
		return () => clearTimeout(t);
	});

	const aspectRatio = $derived(
		layoutW > 0 && layoutH > 0 ? layoutW / layoutH : 16 / 9,
	);
	const rx = $derived(initViewingDist * TAN30 * aspectRatio * 0.9);
	const ry = $derived(initViewingDist * TAN30 * 0.9);
	// 1 world unit = layoutH / (2 * ry) px → padding (per-word half-gap) = GAP_PX * ry / layoutH
	const padding = $derived(layoutH > 0 ? (GAP_PX * ry) / layoutH : 0.06);

	// ── Bounding box ──────────────────────────────────────────────────────────
	type BBox = { cx: number; cy: number; hw: number; hh: number };

	function bbox(word: string, fontSize: number): { hw: number; hh: number } {
		const w  = wordWidths[word] ?? word.length * CHAR_W_FALLBACK;
		const hh = wordHalfH[word]  ?? charH * 0.6;
		return {
			// visibleWidth / 2  (anchorX="center" → text extends ±hw from cx)
			hw: (w * fontSize) / 2 + padding,
			// half of glyph span (anchorY="middle" → text extends ±hh from cy)
			hh: hh * fontSize + padding,
		};
	}

	// ── Placement ─────────────────────────────────────────────────────────────
	// Archimedean spiral from the origin. r = spiralStep * √i gives uniform
	// area density; golden angle breaks rotational symmetry so words don't
	// align into visible grid lines.
	const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
	const MAX_SPIRAL_STEPS = 6000;

	function placeSpiral(
		word: string,
		fontSize: number,
		rxBound: number,
		ryBound: number,
		occupied: BBox[],
	): { x: number; y: number } | null {
		const { hw, hh } = bbox(word, fontSize);
		const xMax = rxBound - hw;
		const yMax = ryBound - hh;
		if (xMax <= 0 || yMax <= 0) return null;

		// spiralStep must be large enough so that MAX_SPIRAL_STEPS iterations
		// reach the farthest corner of the valid placement area.
		// Without this, tiny words have a very fine step that never reaches the edges,
		// causing false "no placement found" results when space exists in outer regions.
		const cornerDist = Math.sqrt(xMax * xMax + yMax * yMax);
		const spiralStep = Math.max(
			Math.min(hw, hh) * 0.15,
			cornerDist / Math.sqrt(MAX_SPIRAL_STEPS),
		);

		for (let i = 0; i < MAX_SPIRAL_STEPS; i++) {
			const r = spiralStep * Math.sqrt(i);
			const angle = i * GOLDEN_ANGLE;
			const x = r * Math.cos(angle);
			const y = r * Math.sin(angle);
			if (Math.abs(x) > xMax || Math.abs(y) > yMax) continue;
			const ok = occupied.every(
				(p) =>
					Math.abs(x - p.cx) >= hw + p.hw ||
					Math.abs(y - p.cy) >= hh + p.hh,
			);
			if (ok) return { x, y };
		}
		return null;
	}

	// ── Adjacency-first placement ─────────────────────────────────────────────
	// Collects x-edge and y-edge positions from every placed word and tries all
	// combinations in increasing distance-to-origin order. This guarantees that
	// every word ends up directly touching at least one neighbour, which produces
	// much tighter packing and eliminates the "armpit" gaps that appear beside
	// vertical stacks when using a pure spiral.
	// Falls back to placeSpiral when no adjacent position fits.
	function placeAdjacent(
		word: string,
		fontSize: number,
		rxBound: number,
		ryBound: number,
		occupied: BBox[],
	): { x: number; y: number } | null {
		const { hw, hh } = bbox(word, fontSize);
		const xMax = rxBound - hw;
		const yMax = ryBound - hh;
		if (xMax <= 0 || yMax <= 0) return null;

		function isValid(x: number, y: number): boolean {
			if (Math.abs(x) > xMax || Math.abs(y) > yMax) return false;
			return occupied.every(
				(p) =>
					Math.abs(x - p.cx) >= hw + p.hw ||
					Math.abs(y - p.cy) >= hh + p.hh,
			);
		}

		function tryList(
			list: Array<{ x: number; y: number; d2: number }>,
		): { x: number; y: number } | null {
			list.sort((a, b) => a.d2 - b.d2);
			for (const { x, y } of list) {
				if (isValid(x, y)) return { x, y };
			}
			return null;
		}

		// First word always goes to the origin.
		if (occupied.length === 0) {
			return isValid(0, 0) ? { x: 0, y: 0 } : null;
		}

		// ── Phase 1: direct-touching positions ──────────────────────────────────
		// Phase 1a (jittered + diagonal) is tried first to break grid alignment.
		// Phase 1b (exact axis-aligned) is the reliable fallback so no valid
		// spot is ever missed due to jitter landing in an occupied cell.
		// Sorting by d2 is done within each sub-phase so jitter is always
		// preferred over exact positions (previously they were mixed in one list,
		// letting exact candidates with smaller d2 win near the origin).
		{
			const JITTER = randomness;
			const jit = (max: number) => (Math.random() - 0.5) * 2 * max;
			const jitCands: Array<{ x: number; y: number; d2: number }> = [];
			const exactCands: Array<{ x: number; y: number; d2: number }> = [];
			for (const p of occupied) {
				const rx_ = p.cx + p.hw + hw;
				const lx_ = p.cx - p.hw - hw;
				const ty_ = p.cy + p.hh + hh;
				const by_ = p.cy - p.hh - hh;
				// 1a — jittered axis-aligned + diagonal corner-touch
				for (const [x, y] of [
					[rx_, p.cy + jit(hh * JITTER)],
					[lx_, p.cy + jit(hh * JITTER)],
					[p.cx + jit(hw * JITTER), ty_],
					[p.cx + jit(hw * JITTER), by_],
					[rx_, ty_], [rx_, by_],
					[lx_, ty_], [lx_, by_],
				] as [number, number][]) {
					if (Math.abs(x) <= xMax && Math.abs(y) <= yMax)
						jitCands.push({ x, y, d2: x * x + y * y });
				}
				// 1b — exact axis-aligned fallback
				for (const [x, y] of [
					[rx_, p.cy], [lx_, p.cy],
					[p.cx, ty_], [p.cx, by_],
				] as [number, number][]) {
					if (Math.abs(x) <= xMax && Math.abs(y) <= yMax)
						exactCands.push({ x, y, d2: x * x + y * y });
				}
			}
			const hit = tryList(jitCands) ?? tryList(exactCands);
			if (hit) return hit;
		}

		// ── Phase 2: cross-aligned positions ─────────────────────────────────
		// Touch word p on one axis while aligning the other axis with word q's
		// centre. This fills "armpit" gaps beside vertical/horizontal stacks
		// that Phase 1 misses (e.g. beside a column of same-width words).
		// Limit to the N_CROSS nearest words for p to keep time bounded.
		{
			const N_CROSS = Math.min(20, occupied.length);
			const nearest = occupied
				.map((p) => ({ p, d2: p.cx * p.cx + p.cy * p.cy }))
				.sort((a, b) => a.d2 - b.d2)
				.slice(0, N_CROSS)
				.map((o) => o.p);

			const cands: Array<{ x: number; y: number; d2: number }> = [];
			for (const p of nearest) {
				const rx1 = p.cx + p.hw + hw;
				const lx1 = p.cx - p.hw - hw;
				const ty1 = p.cy + p.hh + hh;
				const by1 = p.cy - p.hh - hh;
				for (const q of occupied) {
					if (q === p) continue;
					// Touch p on right/left, y-align with q centre
					for (const x of [rx1, lx1]) {
						if (Math.abs(x) <= xMax && Math.abs(q.cy) <= yMax)
							cands.push({ x, y: q.cy, d2: x * x + q.cy * q.cy });
					}
					// Touch p on top/bottom, x-align with q centre
					for (const y of [ty1, by1]) {
						if (Math.abs(q.cx) <= xMax && Math.abs(y) <= yMax)
							cands.push({ x: q.cx, y, d2: q.cx * q.cx + y * y });
					}
				}
			}
			const hit = tryList(cands);
			if (hit) return hit;
		}

		// Fallback: Archimedean spiral
		return placeSpiral(word, fontSize, rxBound, ryBound, occupied);
	}

	// ── Compaction ────────────────────────────────────────────────────────────
	// After the initial adjacency placement, pull each word further toward the
	// origin until it would overlap a neighbour. Iterating inner-to-outer lets
	// each word slide into gaps freed by the words just inside it.
	function compactLayer(words: ProcessedWord[], iterations = 20): void {
		type B = { cx: number; cy: number; hw: number; hh: number };
		const boxes: B[] = words.map((w) => {
			const { hw, hh } = bbox(w.word, w.fontSize);
			return { cx: w.x, cy: w.y, hw, hh };
		});

		function noOverlap(i: number, tx: number, ty: number): boolean {
			const b = boxes[i];
			return (
				Math.abs(tx) <= rx - b.hw &&
				Math.abs(ty) <= ry - b.hh &&
				boxes.every(
					(p, j) =>
						j === i ||
						Math.abs(tx - p.cx) >= b.hw + p.hw ||
						Math.abs(ty - p.cy) >= b.hh + p.hh,
				)
			);
		}

		for (let iter = 0; iter < iterations; iter++) {
			const order = boxes
				.map((b, i) => ({ d: b.cx * b.cx + b.cy * b.cy, i }))
				.sort((a, b) => a.d - b.d)
				.map((o) => o.i);

			for (const i of order) {
				const b = boxes[i];

				// ── Radial: slide toward (0, 0) ───────────────────────────────
				if (b.cx * b.cx + b.cy * b.cy > 1e-4) {
					let lo = 0, hi = 1;
					for (let bs = 0; bs < 14; bs++) {
						const mid = (lo + hi) / 2;
						if (noOverlap(i, b.cx * (1 - mid), b.cy * (1 - mid))) lo = mid;
						else hi = mid;
					}
					if (lo > 1e-4) { b.cx *= 1 - lo; b.cy *= 1 - lo; }
				}

				// ── Horizontal: slide cx toward 0, cy fixed ───────────────────
				if (Math.abs(b.cx) > 1e-4) {
					const dir = -Math.sign(b.cx);
					let lo = 0, hi = Math.abs(b.cx);
					for (let bs = 0; bs < 14; bs++) {
						const mid = (lo + hi) / 2;
						if (noOverlap(i, b.cx + dir * mid, b.cy)) lo = mid;
						else hi = mid;
					}
					if (lo > 1e-4) b.cx += dir * lo;
				}

				// ── Vertical: slide cy toward 0, cx fixed ─────────────────────
				if (Math.abs(b.cy) > 1e-4) {
					const dir = -Math.sign(b.cy);
					let lo = 0, hi = Math.abs(b.cy);
					for (let bs = 0; bs < 14; bs++) {
						const mid = (lo + hi) / 2;
						if (noOverlap(i, b.cx, b.cy + dir * mid)) lo = mid;
						else hi = mid;
					}
					if (lo > 1e-4) b.cy += dir * lo;
				}

				words[i].x = b.cx;
				words[i].y = b.cy;
			}
		}
	}

	// ── Layout ────────────────────────────────────────────────────────────────
	function computeLayout(): { words: ProcessedWord[]; numLayers: number } {
		const raw = ctx.data;
		const data = raw.filter((d) => {
			const valid =
				typeof d.word === 'string' &&
				d.word.trim().length > 0 &&
				typeof d.counts === 'number' &&
				isFinite(d.counts) &&
				d.counts > 0;
			if (DEV && !valid) {
				console.warn('[svelte-wordcloud] Skipping invalid word item:', d);
			}
			return valid;
		});
		if (!data.length) return { words: [], numLayers: 1 };

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

		const rawMaxF = Math.sqrt(
			(topWordArea * viewArea) / (topWordW * charH),
		);
		const maxFByW = (portraitScale * rx) / topWordW;
		const maxFByH = ry / charH;
		const minF = Math.min(rx, ry) * 0.08;
		const initialMaxF = Math.min(rawMaxF, maxFByW, maxFByH);

		function packWithMaxF(maxF: number): {
			words: ProcessedWord[];
			numLayers: number;
		} {
			const withSizes = sorted.map((item) => {
				const sqrtVal = Math.sqrt(item.counts);
				let fontSize: number;
				if (sqrtMin === sqrtMax) {
					fontSize = (minF + maxF) / 2;
				} else {
					const t = (sqrtVal - sqrtMin) / (sqrtMax - sqrtMin);
					fontSize = minF + Math.pow(t, fontSizeContrast) * (maxF - minF);
				}
				const itemW = wordWidths[item.word] ?? item.word.length * CHAR_W_FALLBACK;
				const maxFByLen = (portraitScale * rx) / itemW;
				fontSize = Math.min(fontSize, maxFByLen);
				return { item, fontSize, color: item.color ?? computedWordColor };
			});

			const layerOccupied: BBox[][] = [[]];
			const result: ProcessedWord[] = [];

			withSizes.forEach(({ item, fontSize, color }) => {
				const { hw, hh } = bbox(item.word, fontSize);

				// Try to fit in an existing layer
				for (let li = 0; li < layerOccupied.length; li++) {
					const pos = placeAdjacent(item.word, fontSize, rx, ry, layerOccupied[li]);
					if (pos) {
						layerOccupied[li].push({ cx: pos.x, cy: pos.y, hw, hh });
						result.push({
							...item,
							fontSize,
							layerIndex: li,
							x: pos.x,
							y: pos.y,
							z: -li * layerSpacing,
							color,
						});
						return;
					}
				}

				// No existing layer could fit this word — open a new one
				const li = layerOccupied.length;
				layerOccupied.push([]);
				const pos = placeAdjacent(item.word, fontSize, rx, ry, []) ?? {
					x: 0,
					y: 0,
				};
				layerOccupied[li].push({ cx: pos.x, cy: pos.y, hw, hh });
				result.push({
					...item,
					fontSize,
					layerIndex: li,
					x: pos.x,
					y: pos.y,
					z: -li * layerSpacing,
					color,
				});
			});

			return { words: result, numLayers: layerOccupied.length };
		}

		let currentMaxF = initialMaxF;
		let best = packWithMaxF(currentMaxF);

		for (let attempt = 1; attempt < MAX_LAYOUT_ATTEMPTS; attempt++) {
			if (best.numLayers === 1) break;
			const totalBBoxArea = best.words.reduce((s, w) => {
				const { hw, hh } = bbox(w.word, w.fontSize);
				return s + 4 * hw * hh;
			}, 0);
			const coverage = totalBBoxArea / (viewArea * best.numLayers);
			if (coverage >= TARGET_COVERAGE) break;
			currentMaxF *= 0.82;
			best = packWithMaxF(currentMaxF);
		}

		if (best.numLayers > 1) {
			const byLayer: ProcessedWord[][] = Array.from(
				{ length: best.numLayers },
				() => [],
			);
			for (const w of best.words) byLayer[w.layerIndex].push(w);
			for (let li = 1; li < best.numLayers; li++) {
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

		for (const w of best.words) {
			if (w.fontSize < minF) w.fontSize = minF;
		}

		// Compact each layer toward its center
		const byLayerCompact: ProcessedWord[][] = Array.from(
			{ length: best.numLayers },
			() => [],
		);
		for (const w of best.words) byLayerCompact[w.layerIndex].push(w);
		for (const layer of byLayerCompact) compactLayer(layer);

		// ── Rebalance: move later-layer words into earlier layers ─────────────
		// Compaction frees up space in earlier layers that wasn't available during
		// the initial packing pass. Try to move words from layer N down to layer
		// N-1 (and so on) using the now-tighter occupied positions.
		// Process smallest words first — they're most likely to fit in gaps.
		if (best.numLayers > 1) {
			// Rebuild occupied lists from compacted positions
			const rebalOccupied: BBox[][] = Array.from(
				{ length: best.numLayers },
				() => [],
			);
			for (const w of best.words) {
				const b = bbox(w.word, w.fontSize);
				rebalOccupied[w.layerIndex].push({ cx: w.x, cy: w.y, hw: b.hw, hh: b.hh });
			}

			const laterWords = best.words
				.filter((w) => w.layerIndex > 0)
				.sort((a, b) => a.fontSize - b.fontSize); // smallest first

			for (const w of laterWords) {
				for (let targetLi = 0; targetLi < w.layerIndex; targetLi++) {
					const pos = placeAdjacent(w.word, w.fontSize, rx, ry, rebalOccupied[targetLi]);
					if (pos) {
						const b = bbox(w.word, w.fontSize);
						// Remove from source layer
						const src = rebalOccupied[w.layerIndex];
						const idx = src.findIndex((b) => b.cx === w.x && b.cy === w.y);
						if (idx >= 0) src.splice(idx, 1);
						// Add to target layer
						rebalOccupied[targetLi].push({ cx: pos.x, cy: pos.y, hw: b.hw, hh: b.hh });
						w.layerIndex = targetLi;
						w.x = pos.x;
						w.y = pos.y;
						w.z = -targetLi * layerSpacing;
						break;
					}
				}
			}

			// Drop now-empty layers and renumber
			const usedLayers = [...new Set(best.words.map((w) => w.layerIndex))].sort((a, b) => a - b);
			if (usedLayers.length < best.numLayers) {
				const remap = new Map(usedLayers.map((li, i) => [li, i]));
				for (const w of best.words) {
					w.layerIndex = remap.get(w.layerIndex)!;
					w.z = -w.layerIndex * layerSpacing;
				}
				best = { ...best, numLayers: usedLayers.length };
			}

			// Compact the rebalanced layers
			const byLayerRebal: ProcessedWord[][] = Array.from(
				{ length: best.numLayers },
				() => [],
			);
			for (const w of best.words) byLayerRebal[w.layerIndex].push(w);
			for (const layer of byLayerRebal) compactLayer(layer);
		}

		return best;
	}

	const wordLayout = $derived(computeLayout());

	// ── Camera spring ─────────────────────────────────────────────────────────
	const prefersReducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let targetZ = $state(initViewingDist);
	const camSpring = new Spring(initViewingDist, {
		stiffness: prefersReducedMotion ? 1 : 0.04,
		damping: prefersReducedMotion ? 1 : 0.78,
	});

	const maxZ = initViewingDist;
	const minZ = $derived(
		-(wordLayout.numLayers - 1) * layerSpacing + initViewingDist,
	);
	const scrollProgress = $derived(
		maxZ === minZ ? 0 : (targetZ - maxZ) / (minZ - maxZ),
	);

	// ── Write scroll state back to context ──────────────────────────────────
	$effect(() => {
		ctx.numLayers = wordLayout.numLayers;
		ctx.currentLayer = Math.round(scrollProgress * (wordLayout.numLayers - 1)) + 1;
	});

	function syncScrollCtx() {
		ctx.scrollProgress = scrollProgress;
		ctx.currentLayer = Math.round(scrollProgress * (wordLayout.numLayers - 1)) + 1;
	}

	ctx.scrollTo = (progress: number) => {
		targetZ = maxZ + progress * (minZ - maxZ);
		camSpring.set(targetZ);
		syncScrollCtx();
	};
	ctx.scrollStep = (dir: 1 | -1) => {
		const step = layerSpacing * 0.3;
		targetZ = Math.max(minZ, Math.min(maxZ, targetZ - dir * step));
		camSpring.set(targetZ);
		syncScrollCtx();
	};

	// ── Pan ───────────────────────────────────────────────────────────────────
	// Mouse drag / single-finger touch → pan camera (X/Y)
	const panSpringOpts = {
		stiffness: prefersReducedMotion ? 1 : 0.1,
		damping: prefersReducedMotion ? 1 : 0.8,
	};

	let panX = $state(0.0);
	let panY = $state(0.0);
	let isPanDragging = false;

	const panSpring = new Spring({ x: 0, y: 0 }, panSpringOpts);
	const cameraX = $derived(panSpring.current.x);
	const cameraY = $derived(panSpring.current.y);

	function applyPan(newPX: number, newPY: number) {
		panX = Math.max(-rx, Math.min(rx, newPX));
		panY = Math.max(-ry, Math.min(ry, newPY));
		panSpring.set({ x: panX, y: panY });
	}

	function resetPan() {
		panX = 0;
		panY = 0;
		panSpring.set({ x: 0, y: 0 });
	}

	const isPanCentered = $derived(panX === 0 && panY === 0);

	// ── Single / double click discrimination ──────────────────────────────────
	// Timer-based discrimination: fire onWordClick only on single-click,
	// not on double-click / double-tap (which resets pan).
	const SINGLE_CLICK_DELAY = 250; // ms
	let pendingWordClick: ReturnType<typeof setTimeout> | null = null;

	function cancelPendingWordClick() {
		if (pendingWordClick !== null) {
			clearTimeout(pendingWordClick);
			pendingWordClick = null;
		}
	}

	function handleWordClick(word: WordItem) {
		if (pendingWordClick !== null) {
			// Second click within delay = double-click → cancel both
			cancelPendingWordClick();
			return;
		}
		pendingWordClick = setTimeout(() => {
			pendingWordClick = null;
			onWordClick?.(word);
		}, SINGLE_CLICK_DELAY);
	}

	// Pass undefined when onWordClick is not set so the scene skips cursor:pointer
	const sceneWordClick = $derived(onWordClick ? handleWordClick : undefined);

	// ── Keyboard pan ──────────────────────────────────────────────────────────
	// Prevent page scroll on keydown; apply pan movement on keyup
	const PAN_KEY_STEP = 0.15; // Fraction of view width/height per key step

	function handlePanKeydown(e: KeyboardEvent) {
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
			e.preventDefault();
		}
	}

	function handlePanKeyup(e: KeyboardEvent) {
		const stepX = rx * PAN_KEY_STEP;
		const stepY = ry * PAN_KEY_STEP;
		switch (e.key) {
			case 'ArrowLeft':
				applyPan(panX + stepX, panY);
				break;
			case 'ArrowRight':
				applyPan(panX - stepX, panY);
				break;
			case 'ArrowUp':
				applyPan(panX, panY - stepY);
				break;
			case 'ArrowDown':
				applyPan(panX, panY + stepY);
				break;
		}
	}

	// ── Root element ref + computed word color ────────────────────────────────
	let rootEl = $state<HTMLDivElement | null>(null);
	let computedWordColor = $state('#ffffff');

	$effect(() => {
		if (rootEl) {
			computedWordColor = getComputedStyle(rootEl).color;
		}
	});

	// ── Inline depth scrollbar state ─────────────────────────────────────────
	let depthTrackEl = $state<HTMLDivElement | null>(null);
	let isDepthDragging = false;
	let depthDragStartPos = 0;
	let depthDragStartProgress = 0;

	function handleDepthThumbKeydown(e: KeyboardEvent) {
		const isHorizontal = ctx.scrollbarOrientation === 'horizontal';
		if (e.key === (isHorizontal ? 'ArrowLeft' : 'ArrowDown')) {
			e.preventDefault();
			ctx.scrollStep(-1);
		} else if (e.key === (isHorizontal ? 'ArrowRight' : 'ArrowUp')) {
			e.preventDefault();
			ctx.scrollStep(1);
		}
	}

	function handleDepthThumbPointerDown(e: PointerEvent) {
		isDepthDragging = true;
		depthDragStartPos =
			ctx.scrollbarOrientation === 'horizontal' ? e.clientX : e.clientY;
		depthDragStartProgress = ctx.scrollProgress;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function handleDepthThumbPointerMove(e: PointerEvent) {
		if (!isDepthDragging || !depthTrackEl) return;
		const isHorizontal = ctx.scrollbarOrientation === 'horizontal';
		const trackSize = isHorizontal
			? depthTrackEl.clientWidth
			: depthTrackEl.clientHeight;
		if (trackSize <= 0) return;
		const raw = isHorizontal
			? e.clientX - depthDragStartPos
			: e.clientY - depthDragStartPos;
		const delta = isHorizontal ? raw : -raw;
		ctx.scrollTo(
			Math.max(0, Math.min(1, depthDragStartProgress + delta / trackSize)),
		);
	}

	function handleDepthThumbPointerUp() {
		isDepthDragging = false;
	}

	function handleDepthTrackClick(e: MouseEvent) {
		// Exclude clicks on the thumb itself (conflicts with drag)
		if ((e.target as Element).closest('[data-wc-depth-thumb]')) return;
		if (!depthTrackEl) return;
		const isHorizontal = ctx.scrollbarOrientation === 'horizontal';
		const rect = depthTrackEl.getBoundingClientRect();
		const fraction = isHorizontal
			? (e.clientX - rect.left) / rect.width
			: 1 - (e.clientY - rect.top) / rect.height;
		ctx.scrollTo(Math.max(0, Math.min(1, fraction)));
	}

	let canvasWrapEl = $state<HTMLDivElement | null>(null);

	// ── Cursor ────────────────────────────────────────────────────────────────
	function setCursor(cursor: string) {
		if (isPanDragging || !canvasWrapEl) return;
		canvasWrapEl.style.cursor = cursor || 'grab';
	}

	// ── Wheel: Ctrl+Wheel → depth navigation (smooth) ──────────────────────
	// Native listener required: passive:false is needed to call e.preventDefault().
	$effect(() => {
		const wrap = canvasWrapEl;
		if (!wrap) return;

		function onWheel(e: WheelEvent) {
			if (!e.ctrlKey) return;
			e.preventDefault();
			const delta = e.deltaY * 0.015 * wheelScrollSpeed * layerSpacing;
			targetZ = Math.max(minZ, Math.min(maxZ, targetZ + delta));
			camSpring.set(targetZ);
			syncScrollCtx();
		}

		wrap.addEventListener('wheel', onWheel, { passive: false });
		return () => wrap.removeEventListener('wheel', onWheel);
	});

	// ── Touch: two-finger pinch → depth navigation; single-finger → pan ────
	$effect(() => {
		const wrap = canvasWrapEl;
		if (!wrap) return;

		let lastDist = 0;
		let prevTouchPos: { x: number; y: number } | null = null;
		let lastTapTime = 0;

		function pinchDist(e: TouchEvent): number {
			const [a, b] = [e.touches[0], e.touches[1]];
			const dx = a.clientX - b.clientX;
			const dy = a.clientY - b.clientY;
			return Math.sqrt(dx * dx + dy * dy);
		}

		function onTouchStart(e: TouchEvent) {
			if (e.touches.length === 2) {
				lastDist = pinchDist(e);
				prevTouchPos = null;
				lastTapTime = 0;
			} else if (e.touches.length === 1) {
				const now = Date.now();
				if (now - lastTapTime < 300) {
					// Double-tap → reset pan (also suppresses browser double-tap zoom)
					e.preventDefault();
					cancelPendingWordClick();
					resetPan();
					prevTouchPos = null;
					lastTapTime = 0;
				} else {
					lastTapTime = now;
					prevTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
				}
				lastDist = 0;
			}
		}

		function onTouchMove(e: TouchEvent) {
			if (e.touches.length === 2 && lastDist > 0) {
				e.preventDefault();
				const d = pinchDist(e);
				// Pinch in (d shrinks) → go deeper; pinch out → go shallower
				const delta = (lastDist - d) * 0.05 * wheelScrollSpeed;
				lastDist = d;
				targetZ = Math.max(minZ, Math.min(maxZ, targetZ - delta));
				camSpring.set(targetZ);
				syncScrollCtx();
			} else if (e.touches.length === 1 && prevTouchPos) {
				e.preventDefault();
				const touch = e.touches[0];
				const wpx = (2 * rx) / containerW;
				const wpy = (2 * ry) / containerH;
				const dx = (touch.clientX - prevTouchPos.x) * wpx;
				const dy = (touch.clientY - prevTouchPos.y) * wpy;
				prevTouchPos = { x: touch.clientX, y: touch.clientY };
				applyPan(panX - dx, panY + dy);
			}
		}

		function onTouchEnd(e: TouchEvent) {
			if (e.touches.length < 2) lastDist = 0;
			if (e.touches.length === 0) prevTouchPos = null;
		}

		wrap.addEventListener('touchstart', onTouchStart, { passive: false });
		wrap.addEventListener('touchmove', onTouchMove, { passive: false });
		wrap.addEventListener('touchend', onTouchEnd, { passive: true });
		return () => {
			wrap.removeEventListener('touchstart', onTouchStart);
			wrap.removeEventListener('touchmove', onTouchMove);
			wrap.removeEventListener('touchend', onTouchEnd);
		};
	});

	// ── Mouse drag → pan ──────────────────────────────────────────────────────
	$effect(() => {
		const wrap = canvasWrapEl;
		if (!wrap) return;

		let prevPos: { x: number; y: number } | null = null;

		function onMouseDown(e: MouseEvent) {
			if (e.button !== 0) return;
			isPanDragging = true;
			prevPos = { x: e.clientX, y: e.clientY };
			wrap!.style.cursor = 'grabbing';
		}

		function onMouseMove(e: MouseEvent) {
			if (!prevPos) return;
			const wpx = (2 * rx) / containerW;
			const wpy = (2 * ry) / containerH;
			const dx = (e.clientX - prevPos.x) * wpx;
			const dy = (e.clientY - prevPos.y) * wpy;
			prevPos = { x: e.clientX, y: e.clientY };
			applyPan(panX - dx, panY + dy);
		}

		function onMouseUp() {
			if (!isPanDragging) return;
			isPanDragging = false;
			prevPos = null;
			wrap!.style.cursor = 'grab';
		}

		function onDblClick() {
			cancelPendingWordClick();
			resetPan();
		}

		wrap.addEventListener('mousedown', onMouseDown);
		wrap.addEventListener('dblclick', onDblClick);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		return () => {
			wrap.removeEventListener('mousedown', onMouseDown);
			wrap.removeEventListener('dblclick', onDblClick);
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		};
	});

	// ── Canvas ARIA ───────────────────────────────────────────────────────────
	$effect(() => {
		if (!canvasWrapEl) return;
		const labelId = ctx.canvasLabelId;

		function applyAttrs(): boolean {
			const canvas = canvasWrapEl!.querySelector('canvas');
			if (!canvas) return false;
			canvas.setAttribute('role', 'img');
			canvas.setAttribute('aria-labelledby', labelId);
			if (DEV) {
				setTimeout(() => {
					if (!document.getElementById(labelId)) {
						console.warn(
							'[svelte-wordcloud] <WordCloudLabel> not found. ' +
								'Add <WordCloudLabel> as a child of <WordCloud> to give the canvas an accessible name.',
						);
					}
				}, 0);
			}
			return true;
		}

		if (applyAttrs()) return;

		const obs = new MutationObserver(() => {
			if (applyAttrs()) obs.disconnect();
		});
		obs.observe(canvasWrapEl!, { childList: true, subtree: true });
		return () => obs.disconnect();
	});
</script>

{#if ctx.data.length > 0}
	<div
		data-wc-3d-root
		data-wc-scrollbar-orientation={ctx.scrollbarOrientation}
		style="color: var(--wc-color, currentColor)"
		bind:this={rootEl}
	>
		<div
			data-wc-canvas
			bind:this={canvasWrapEl}
			bind:clientWidth={containerW}
			bind:clientHeight={containerH}
		>
			<Canvas>
				<Scene
					words={wordLayout.words}
					{cameraX}
					{cameraY}
					cameraZ={camSpring.current}
					{layerSpacing}
					{fontUrl}
					onWordClick={sceneWordClick}
					{setCursor}
				/>
			</Canvas>
		</div>
		<PanKeyControl
			hint={panHint}
			label={panLabel}
			onkeydown={handlePanKeydown}
			onkeyup={handlePanKeyup}
		/>
		{#if !isPanCentered}
			<PanResetButton label={resetPanLabel} onreset={resetPan} />
		{/if}
		<div
			data-wc-depth-col
			data-wc-orientation={ctx.scrollbarOrientation}
			data-wc-hidden={ctx.numLayers <= 1 || undefined}
		>
			<span data-wc-depth-label id={ctx.depthLabelId}>{depthLabel}</span>
			<div data-wc-layer-indicator aria-hidden="true">
				{ctx.currentLayer} / {ctx.numLayers}
			</div>
			<!-- Track click-to-jump is a supplementary UX feature; keyboard interaction is on the <button> thumb inside -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				role="presentation"
				data-wc-depth-track
				data-wc-orientation={ctx.scrollbarOrientation}
				style:--wc-progress={ctx.scrollProgress}
				bind:this={depthTrackEl}
				onclick={handleDepthTrackClick}
			>
				<button
					type="button"
					data-wc-depth-thumb
					role="slider"
					aria-orientation={ctx.scrollbarOrientation}
					aria-labelledby={ctx.depthLabelId}
					aria-valuemin="1"
					aria-valuemax={ctx.numLayers}
					aria-valuenow={ctx.currentLayer}
					aria-valuetext={depthValueText(ctx.currentLayer, ctx.numLayers)}
					onkeydown={handleDepthThumbKeydown}
					onpointerdown={handleDepthThumbPointerDown}
					onpointermove={handleDepthThumbPointerMove}
					onpointerup={handleDepthThumbPointerUp}
					onpointercancel={handleDepthThumbPointerUp}
				></button>
			</div>
		</div>
	</div>
{/if}

<style>
	:where([data-wc-3d-root]) {
		display: flex;
		width: 100%;
		height: 100%;
		gap: var(--wc-canvas-gap, 0px);
		background: var(--wc-background, transparent);
		position: relative;
	}
	:where([data-wc-3d-root][data-wc-scrollbar-orientation='horizontal']) {
		flex-direction: column;
	}
	:where([data-wc-3d-root][data-wc-scrollbar-orientation='horizontal'])
		:where([data-wc-canvas]) {
		height: auto;
		min-height: 0;
	}
	:where([data-wc-depth-col]) {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		padding-block: var(--wc-scrollbar-padding, 8px);
		gap: var(--wc-scrollbar-gap, 4px);
	}
	:where([data-wc-depth-col][data-wc-orientation='horizontal']) {
		flex-direction: row;
		width: 100%;
		padding-block: calc(var(--wc-scrollbar-padding, 8px) / 2);
		padding-inline: var(--wc-scrollbar-padding, 8px);
	}
	:where([data-wc-depth-col][data-wc-hidden]) {
		display: none;
	}
	:where([data-wc-depth-col]) :where([data-wc-depth-track]) {
		flex: 1;
	}
	:where([data-wc-depth-label]) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	:where([data-wc-layer-indicator]) {
		font-family: monospace;
		font-size: var(--wc-indicator-font-size, 10px);
		color: color-mix(in srgb, var(--wc-color, currentColor) 80%, transparent);
		line-height: 1;
		white-space: nowrap;
		user-select: none;
		font-variant-numeric: tabular-nums;
	}

	:where([data-wc-canvas]) {
		flex: 1;
		min-width: 0;
		height: 100%;
		max-height: 100%;
		overflow: hidden;
		cursor: grab;
		aspect-ratio: var(--wc-aspect-ratio, auto);
		position: relative;
	}

	:where([data-wc-canvas]):active {
		cursor: grabbing;
	}

	/* ── Shared ─────────────────────────────────────────────────────────────── */
	:where([data-wc-depth-track]) {
		--wc-thumb-size: 32px;
		--wc-dot-size: 7px;
		--wc-dot-color: color-mix(
			in srgb,
			var(--wc-color, currentColor) 70%,
			transparent
		);
		--wc-thumb-color: var(--wc-dot-color);
		--wc-thumb-color-hover: color-mix(
			in srgb,
			var(--wc-color, currentColor) 15%,
			#000
		);
		--wc-thumb-ring-color-hover: var(--wc-color, currentColor);

		background: transparent;
		position: relative;
		container-type: size;
		cursor: pointer;
	}

	:where([data-wc-depth-track])::before {
		content: '';
		position: absolute;
		background: var(--wc-dot-color);
		border-radius: calc(var(--wc-dot-size) / 2);
		opacity: var(--wc-track-opacity, 0.3);
		transition: opacity 0.15s;
		pointer-events: none;
	}

	:where([data-wc-depth-track]):hover::before {
		opacity: 1;
	}

	:where([data-wc-depth-thumb]) {
		position: absolute;
		min-width: var(--wc-thumb-size);
		min-height: var(--wc-thumb-size);
		width: var(--wc-thumb-size);
		height: var(--wc-thumb-size);
		border-radius: 50%;
		background: transparent;
		border: none;
		padding: 0;
		cursor: grab;
		touch-action: none;
		transition: transform 0.08s ease;
		z-index: 1;
	}

	:where([data-wc-depth-thumb]):active {
		cursor: grabbing;
	}

	:where([data-wc-depth-thumb])::after {
		content: '';
		position: absolute;
		inset: 0;
		margin: auto;
		width: var(--wc-dot-size);
		height: var(--wc-dot-size);
		border-radius: 50%;
		background: var(--wc-thumb-color);
		transition:
			transform 0.15s,
			background 0.15s,
			box-shadow 0.15s;
	}

	:where([data-wc-depth-track]):hover :where([data-wc-depth-thumb])::after,
	:where([data-wc-depth-thumb]):focus-visible::after {
		transform: scale(1.6);
		background: var(--wc-thumb-color-hover);
		box-shadow: 0 0 0 1.5px var(--wc-thumb-ring-color-hover);
	}

	:where([data-wc-depth-thumb]):focus-visible {
		outline: none;
	}

	/* ── vertical (default) ─────────────────────────────────────────────── */
	:where([data-wc-depth-track][data-wc-orientation='vertical']) {
		width: var(--wc-thumb-size);
		border-radius: calc(var(--wc-thumb-size) / 2);
	}

	:where([data-wc-depth-track][data-wc-orientation='vertical'])::before {
		inset-block: 0;
		left: calc((var(--wc-thumb-size) - var(--wc-dot-size)) / 2);
		width: var(--wc-dot-size);
	}

	:where([data-wc-depth-track][data-wc-orientation='vertical'])
		:where([data-wc-depth-thumb]) {
		inset-inline: 0;
		top: calc((var(--wc-dot-size) - var(--wc-thumb-size)) / 2);
		transform: translateY(
			calc((1 - var(--wc-progress, 0)) * (100cqh - var(--wc-dot-size)))
		);
	}

	/* ── horizontal ──────────────────────────────────────────────────────── */
	:where([data-wc-depth-track][data-wc-orientation='horizontal']) {
		height: var(--wc-thumb-size);
		border-radius: calc(var(--wc-thumb-size) / 2);
	}

	:where([data-wc-depth-track][data-wc-orientation='horizontal'])::before {
		inset-inline: 0;
		top: calc((var(--wc-thumb-size) - var(--wc-dot-size)) / 2);
		height: var(--wc-dot-size);
	}

	:where([data-wc-depth-track][data-wc-orientation='horizontal'])
		:where([data-wc-depth-thumb]) {
		inset-block: 0;
		left: calc((var(--wc-dot-size) - var(--wc-thumb-size)) / 2);
		transform: translateX(
			calc(var(--wc-progress, 0) * (100cqi - var(--wc-dot-size)))
		);
	}
</style>
