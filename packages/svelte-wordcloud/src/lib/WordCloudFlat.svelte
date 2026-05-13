<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { untrack } from 'svelte';
	import { Spring } from 'svelte/motion';
	import { DEV } from 'esm-env';
	import SceneFlat from './SceneFlat.svelte';
	import PanResetButton from './PanResetButton.svelte';
	import PanKeyControl from './PanKeyControl.svelte';
	import type { WordCloudFlatProps, ProcessedWord, WordItem } from './types.js';
	import { getWCContext } from './WordCloud.svelte';
	import { createFontMetrics, CHAR_W_FALLBACK } from './fontMetrics.svelte.js';

	const {
		fontUrl,
		maxZoom = 2.0,
		layout = {},
		a11y = {},
		onWordClick,
	}: WordCloudFlatProps = $props();

	const fontSizeContrast = $derived(layout.fontSizeContrast ?? 2.0);
	const topWordArea     = $derived(layout.topWordArea     ?? 0.22);
	const randomness      = $derived(layout.randomness      ?? 0.5);

	const zoomValueText = $derived(a11y.zoomValueText ?? ((z: number) => `${z.toFixed(1)}x`));
	const zoomLabel     = $derived(a11y.zoomLabel     ?? 'Zoom');
	const panHint       = $derived(a11y.panHint       ?? 'Arrow keys to pan');
	const panLabel      = $derived(a11y.panLabel      ?? 'Pan view. Use arrow keys to move.');
	const resetPanLabel = $derived(a11y.resetPanLabel ?? 'Reset pan (double-click)');

	const ctx = getWCContext();

	// ── Constants ─────────────────────────────────────────────────────────────
	const TAN30 = Math.tan(Math.PI / 6); // tan(30°) for FOV=60
	// Gap between words in CSS pixels. Converted to world units at runtime.
	const GAP_PX = 16;
	const MIN_ZOOM = 1;
	// Matches default WordCloud3D (layerSpacing=12 × 0.75)
	const VIEWING_DIST = 9;

	// ── Font metrics ──────────────────────────────────────────────────────────
	const metrics = createFontMetrics(
		() => [...new Set(ctx.data.map((d) => d.word))],
		() => fontUrl,
	);
	const charH      = $derived(metrics.charH);
	const wordWidths = $derived(metrics.wordWidths);
	const wordHalfH  = $derived(metrics.wordHalfH);

	// ── Container size (debounced for layout) ─────────────────────────────────
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

	// Half-extents of the visible area at zoom=1
	const rx = $derived(VIEWING_DIST * TAN30 * aspectRatio * 0.9);
	const ry = $derived(VIEWING_DIST * TAN30 * 0.9);
	// 1 world unit = layoutH / (2 * ry) px → padding (per-word half-gap) = GAP_PX * ry / layoutH
	const padding = $derived(layoutH > 0 ? (GAP_PX * ry) / layoutH : 0.06);

	// ── Bounding box helpers ──────────────────────────────────────────────────
	type BBox = { cx: number; cy: number; hw: number; hh: number };

	function bboxSize(word: string, fontSize: number) {
		const w  = wordWidths[word] ?? word.length * CHAR_W_FALLBACK;
		// fallback half-height: 60 % of capHeight is a good estimate covering most descenders
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
		const { hw, hh } = bboxSize(word, fontSize);
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
		const { hw, hh } = bboxSize(word, fontSize);
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
			const { hw, hh } = bboxSize(w.word, w.fontSize);
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

	// ── Single-layer layout ───────────────────────────────────────────────────
	// Iteratively reduces maxF until all words fit in one layer.
	// minF is kept smaller than in WordCloud3D so there is more room to shrink.
	function computeLayout(): ProcessedWord[] {
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
		if (!data.length) return [];

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
		// Smaller floor than WordCloud3D (0.04 vs 0.08) so more words can fit.
		const minF = Math.min(rx, ry) * 0.04;
		let currentMaxF = Math.min(rawMaxF, maxFByW, maxFByH);

		function packAttempt(maxF: number): ProcessedWord[] | null {
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

			const occupied: BBox[] = [];
			const result: ProcessedWord[] = [];

			for (const { item, fontSize, color } of withSizes) {
				const { hw, hh } = bboxSize(item.word, fontSize);
				const pos = placeAdjacent(item.word, fontSize, rx, ry, occupied);
				if (pos === null) return null; // word didn't fit → retry with smaller fonts
				occupied.push({ cx: pos.x, cy: pos.y, hw, hh });
				result.push({
					...item,
					fontSize,
					layerIndex: 0,
					x: pos.x,
					y: pos.y,
					z: 0,
					color,
				});
			}
			return result;
		}

		// Shrink maxF up to 25 times (≈ 0.85^25 ≈ 1.7% of original) until all fit.
		for (let i = 0; i < 25; i++) {
			const result = packAttempt(currentMaxF);
			if (result !== null) {
				compactLayer(result);
				return result;
			}
			currentMaxF *= 0.85;
		}

		// Fallback: force-place with the current tiny fonts (may have a few overlaps)
		const fallback = packAttempt(currentMaxF) ?? [];
		compactLayer(fallback);
		return fallback;
	}

	const wordLayout = $derived(computeLayout());

	// Flat always has exactly 1 layer — assign directly at init (no $effect needed)
	ctx.numLayers = 1;
	ctx.currentLayer = 1;
	ctx.scrollProgress = 0;
	// Zoom range does not change during the component's lifetime.
	// untrack signals that only the initial value is needed, no reactivity.
	ctx.minZoom = MIN_ZOOM;
	ctx.maxZoom = untrack(() => maxZoom);
	// zoomTo/zoomStep: closures read the latest values at call time, so direct assignment is fine
	ctx.zoomTo = (progress: number) => {
		applyZoom(MIN_ZOOM + progress * (maxZoom - MIN_ZOOM));
	};
	ctx.zoomStep = (dir: 1 | -1) => {
		// +1 = zoom in, −1 = zoom out; step = 10 % of total range
		const step = (maxZoom - MIN_ZOOM) * 0.1;
		applyZoom(zoom + dir * step);
	};

	// ── Zoom & Pan ────────────────────────────────────────────────────────────
	const prefersReducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const springOpts = {
		stiffness: prefersReducedMotion ? 1 : 0.1,
		damping: prefersReducedMotion ? 1 : 0.8,
	};

	let zoom = $state(1.0);
	let panX = $state(0.0);
	let panY = $state(0.0);

	const zoomSpring = new Spring(1.0, springOpts);
	const panSpring = new Spring({ x: 0, y: 0 }, springOpts);

	// Derived camera values read by SceneFlat each frame
	const cameraZ = $derived(VIEWING_DIST / zoomSpring.current);
	const cameraX = $derived(panSpring.current.x);
	const cameraY = $derived(panSpring.current.y);

	/**
	 * Pan is constrained to keep the word cloud content within the viewport.
	 * At zoom level z the visible half-width is rx/z, so the camera can travel
	 * at most rx*(1 − 1/z) from center before the content exits the viewport.
	 */
	function clampPan(px: number, py: number) {
		return {
			px: Math.max(-rx, Math.min(rx, px)),
			py: Math.max(-ry, Math.min(ry, py)),
		};
	}

	function applyZoom(newZoom: number) {
		zoom = Math.max(MIN_ZOOM, Math.min(maxZoom, newZoom));
		zoomSpring.set(zoom);
		// Zoom is event-driven; update context directly
		ctx.zoom = zoom;
		ctx.zoomProgress = (zoom - MIN_ZOOM) / (maxZoom - MIN_ZOOM);
		// Update cursor directly (no $effect needed)
		if (canvasWrapEl && !isDragging) {
			canvasWrapEl.style.cursor = 'grab';
		}
		// Re-clamp pan whenever zoom changes
		const { px, py } = clampPan(panX, panY);
		panX = px;
		panY = py;
		panSpring.set({ x: px, y: py });
	}

	function applyPan(newPanX: number, newPanY: number) {
		const { px, py } = clampPan(newPanX, newPanY);
		panX = px;
		panY = py;
		panSpring.set({ x: px, y: py });
	}

	function resetPan() {
		panX = 0;
		panY = 0;
		panSpring.set({ x: 0, y: 0 });
	}

	const isPanCentered = $derived(panX === 0 && panY === 0);

	// ── Single / double click discrimination ──────────────────────────────────
	const SINGLE_CLICK_DELAY = 250;
	let pendingWordClick: ReturnType<typeof setTimeout> | null = null;

	function cancelPendingWordClick() {
		if (pendingWordClick !== null) {
			clearTimeout(pendingWordClick);
			pendingWordClick = null;
		}
	}

	function handleWordClick(word: WordItem) {
		if (pendingWordClick !== null) {
			cancelPendingWordClick();
			return;
		}
		pendingWordClick = setTimeout(() => {
			pendingWordClick = null;
			onWordClick?.(word);
		}, SINGLE_CLICK_DELAY);
	}

	const sceneWordClick = $derived(onWordClick ? handleWordClick : undefined);

	// ── Keyboard pan (PanKeyControl button) ───────────────────────────────────
	const PAN_KEY_STEP = 0.15;

	function handlePanKeydown(e: KeyboardEvent) {
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
			e.preventDefault();
		}
	}

	function handlePanKeyup(e: KeyboardEvent) {
		const stepX = (rx / zoom) * PAN_KEY_STEP;
		const stepY = (ry / zoom) * PAN_KEY_STEP;
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

	// ── Canvas element & cursor ───────────────────────────────────────────────
	let canvasWrapEl = $state<HTMLDivElement | null>(null);
	// Tracks active drag so word-hover can't override the grabbing cursor
	let isDragging = false;

	function setCursor(cursor: string) {
		if (isDragging || !canvasWrapEl) return;
		canvasWrapEl.style.cursor = cursor || 'grab';
	}

	// ── Wheel → zoom (Ctrl + Wheel only, matching WordCloud3D behaviour) ────────
	function handleWheel(e: WheelEvent) {
		if (!e.ctrlKey) return;
		e.preventDefault();
		// Smooth zoom: scroll-down = zoom out, scroll-up = zoom in
		const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
		applyZoom(zoom * factor);
	}

	// ── Mouse drag → pan ──────────────────────────────────────────────────────
	$effect(() => {
		const wrap = canvasWrapEl;
		if (!wrap) return;

		let prevPos: { x: number; y: number } | null = null;

		function onMouseDown(e: MouseEvent) {
			if (e.button !== 0) return;
			isDragging = true;
			prevPos = { x: e.clientX, y: e.clientY };
			wrap!.style.cursor = 'grabbing';
		}

		function onMouseMove(e: MouseEvent) {
			if (!prevPos) return;
			// Convert pixel delta to world units at current zoom level.
			// Screen +X = world +X; screen +Y = world −Y (Y is inverted).
			const wpx = (2 * rx) / zoom / containerW;
			const wpy = (2 * ry) / zoom / containerH;
			const dx = (e.clientX - prevPos.x) * wpx;
			const dy = (e.clientY - prevPos.y) * wpy;
			prevPos = { x: e.clientX, y: e.clientY };
			// Moving right → camera shifts right → panX decreases (content follows cursor)
			// Moving down  → camera shifts up   → panY increases
			applyPan(panX - dx, panY + dy);
		}

		function onMouseUp() {
			if (!isDragging) return;
			isDragging = false;
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

	// ── Touch: pinch → zoom, single-finger → pan ─────────────────────────────
	$effect(() => {
		const wrap = canvasWrapEl;
		if (!wrap) return;

		let lastPinchDist = 0;
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
				lastPinchDist = pinchDist(e);
				prevTouchPos = null;
				lastTapTime = 0;
			} else if (e.touches.length === 1) {
				const now = Date.now();
				if (now - lastTapTime < 300) {
					// Double-tap → reset pan
					e.preventDefault();
					cancelPendingWordClick();
					resetPan();
					prevTouchPos = null;
					lastTapTime = 0;
				} else {
					lastTapTime = now;
					prevTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
					lastPinchDist = 0;
				}
			}
		}

		function onTouchMove(e: TouchEvent) {
			if (e.touches.length === 2 && lastPinchDist > 0) {
				e.preventDefault();
				const d = pinchDist(e);
				const factor = d / lastPinchDist;
				lastPinchDist = d;
				applyZoom(zoom * factor);
			} else if (e.touches.length === 1 && prevTouchPos) {
				e.preventDefault();
				const touch = e.touches[0];
				const wpx = (2 * rx) / zoom / containerW;
				const wpy = (2 * ry) / zoom / containerH;
				const dx = (touch.clientX - prevTouchPos.x) * wpx;
				const dy = (touch.clientY - prevTouchPos.y) * wpy;
				prevTouchPos = { x: touch.clientX, y: touch.clientY };
				applyPan(panX - dx, panY + dy);
			}
		}

		function onTouchEnd(e: TouchEvent) {
			if (e.touches.length < 2) lastPinchDist = 0;
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

	// ── Root element ref + computed word color for Three.js ──────────────────
	let rootEl = $state<HTMLDivElement | null>(null);
	let computedWordColor = $state('#ffffff');

	$effect(() => {
		if (rootEl) {
			computedWordColor = getComputedStyle(rootEl).color;
		}
	});

	// ── Inline zoom scrollbar state ───────────────────────────────────────────
	let zoomTrackEl = $state<HTMLDivElement | null>(null);
	let isZoomDragging = false;
	let zoomDragStartPos = 0;
	let zoomDragStartProgress = 0;

	function handleZoomThumbKeydown(e: KeyboardEvent) {
		const isHorizontal = ctx.scrollbarOrientation === 'horizontal';
		if (e.key === (isHorizontal ? 'ArrowLeft' : 'ArrowDown')) {
			e.preventDefault();
			ctx.zoomStep(-1);
		} else if (e.key === (isHorizontal ? 'ArrowRight' : 'ArrowUp')) {
			e.preventDefault();
			ctx.zoomStep(1);
		}
	}

	function handleZoomThumbPointerDown(e: PointerEvent) {
		isZoomDragging = true;
		zoomDragStartPos =
			ctx.scrollbarOrientation === 'horizontal' ? e.clientX : e.clientY;
		zoomDragStartProgress = ctx.zoomProgress;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function handleZoomThumbPointerMove(e: PointerEvent) {
		if (!isZoomDragging || !zoomTrackEl) return;
		const isHorizontal = ctx.scrollbarOrientation === 'horizontal';
		const trackSize = isHorizontal
			? zoomTrackEl.clientWidth
			: zoomTrackEl.clientHeight;
		if (trackSize <= 0) return;
		const raw = isHorizontal
			? e.clientX - zoomDragStartPos
			: e.clientY - zoomDragStartPos;
		const delta = isHorizontal ? raw : -raw;
		ctx.zoomTo(
			Math.max(0, Math.min(1, zoomDragStartProgress + delta / trackSize)),
		);
	}

	function handleZoomThumbPointerUp() {
		isZoomDragging = false;
	}

	function handleZoomTrackClick(e: MouseEvent) {
		if ((e.target as Element).closest('[data-wc-zoom-thumb]')) return;
		if (!zoomTrackEl) return;
		const isHorizontal = ctx.scrollbarOrientation === 'horizontal';
		const rect = zoomTrackEl.getBoundingClientRect();
		const fraction = isHorizontal
			? (e.clientX - rect.left) / rect.width
			: 1 - (e.clientY - rect.top) / rect.height;
		ctx.zoomTo(Math.max(0, Math.min(1, fraction)));
	}

	// ── Canvas ARIA ───────────────────────────────────────────────────────────
	// Threlte's <Canvas> does not forward attributes, so use MutationObserver to apply them.
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

<!--
  tabindex="0" allows the container to receive keyboard focus for arrow-key pan.
  touch-action: none prevents browser from intercepting touch events.
-->
{#if ctx.data.length > 0}
	<div
		data-wc-flat-root
		data-wc-scrollbar-orientation={ctx.scrollbarOrientation}
		style="color: var(--wc-color, currentColor)"
		bind:this={rootEl}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			data-wc-canvas
			data-wc-flat
			onwheel={handleWheel}
			bind:this={canvasWrapEl}
			bind:clientWidth={containerW}
			bind:clientHeight={containerH}
		>
			<Canvas>
				<SceneFlat
					words={wordLayout}
					{cameraX}
					{cameraY}
					{cameraZ}
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
		<div data-wc-zoom-col data-wc-orientation={ctx.scrollbarOrientation}>
			<span data-wc-zoom-label id={ctx.zoomLabelId}>{zoomLabel}</span>
			<div data-wc-zoom-indicator aria-hidden="true">
				×{ctx.zoom.toFixed(1)}
			</div>
			<!-- Track click-to-jump is a supplementary UX feature; keyboard interaction is on the <button> thumb inside -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				role="presentation"
				data-wc-zoom-track
				data-wc-orientation={ctx.scrollbarOrientation}
				style:--wc-progress={ctx.zoomProgress}
				bind:this={zoomTrackEl}
				onclick={handleZoomTrackClick}
			>
				<button
					type="button"
					data-wc-zoom-thumb
					role="slider"
					aria-orientation={ctx.scrollbarOrientation}
					aria-labelledby={ctx.zoomLabelId}
					aria-valuemin={ctx.minZoom}
					aria-valuemax={ctx.maxZoom}
					aria-valuenow={ctx.zoom}
					aria-valuetext={zoomValueText(ctx.zoom)}
					onkeydown={handleZoomThumbKeydown}
					onpointerdown={handleZoomThumbPointerDown}
					onpointermove={handleZoomThumbPointerMove}
					onpointerup={handleZoomThumbPointerUp}
					onpointercancel={handleZoomThumbPointerUp}
				></button>
			</div>
		</div>
	</div>
{/if}

<style>
	:where([data-wc-flat-root]) {
		display: flex;
		width: 100%;
		height: 100%;
		gap: var(--wc-canvas-gap, 0px);
		background: var(--wc-background, transparent);
		position: relative;
	}
	:where([data-wc-flat-root][data-wc-scrollbar-orientation='horizontal']) {
		flex-direction: column;
	}
	:where([data-wc-flat-root][data-wc-scrollbar-orientation='horizontal'])
		:where([data-wc-flat]) {
		height: auto;
		min-height: 0;
	}
	:where([data-wc-zoom-col]) {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		padding-block: var(--wc-scrollbar-padding, 8px);
		gap: var(--wc-scrollbar-gap, 4px);
	}
	:where([data-wc-zoom-col][data-wc-orientation='horizontal']) {
		flex-direction: row;
		width: 100%;
		padding-block: calc(var(--wc-scrollbar-padding, 8px) / 2);
		padding-inline: var(--wc-scrollbar-padding, 8px);
	}
	:where([data-wc-zoom-col]) :where([data-wc-zoom-track]) {
		flex: 1;
	}
	:where([data-wc-zoom-label]) {
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

	:where([data-wc-zoom-indicator]) {
		font-family: monospace;
		font-size: var(--wc-indicator-font-size, 10px);
		color: color-mix(in srgb, var(--wc-color, currentColor) 80%, transparent);
		line-height: 1;
		white-space: nowrap;
		user-select: none;
		font-variant-numeric: tabular-nums;
	}

	:where([data-wc-flat]) {
		flex: 1;
		min-width: 0;
		height: 100%;
		max-height: 100%;
		overflow: hidden;
		/* Let JS handle all touch gestures */
		touch-action: none;
		/* Set --wc-aspect-ratio to lock the canvas aspect ratio, e.g. style="--wc-aspect-ratio: 16 / 9" */
		aspect-ratio: var(--wc-aspect-ratio, auto);
	}

	/* ── Shared ─────────────────────────────────────────────────────────────── */
	:where([data-wc-zoom-track]) {
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

	:where([data-wc-zoom-track])::before {
		content: '';
		position: absolute;
		background: var(--wc-dot-color);
		border-radius: calc(var(--wc-dot-size) / 2);
		opacity: var(--wc-track-opacity, 0.3);
		transition: opacity 0.15s;
		pointer-events: none;
	}

	:where([data-wc-zoom-track]):hover::before {
		opacity: 1;
	}

	:where([data-wc-zoom-thumb]) {
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
	}

	:where([data-wc-zoom-thumb]):active {
		cursor: grabbing;
	}

	:where([data-wc-zoom-thumb])::after {
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

	:where([data-wc-zoom-track]):hover :where([data-wc-zoom-thumb])::after,
	:where([data-wc-zoom-thumb]):focus-visible::after {
		transform: scale(1.6);
		background: var(--wc-thumb-color-hover);
		box-shadow: 0 0 0 1.5px var(--wc-thumb-ring-color-hover);
	}

	:where([data-wc-zoom-thumb]):focus-visible {
		outline: none;
	}

	/* ── vertical (default) ─────────────────────────────────────────────────── */
	:where([data-wc-zoom-track][data-wc-orientation='vertical']) {
		width: var(--wc-thumb-size);
		border-radius: calc(var(--wc-thumb-size) / 2);
	}

	:where([data-wc-zoom-track][data-wc-orientation='vertical'])::before {
		inset-block: 0;
		left: calc((var(--wc-thumb-size) - var(--wc-dot-size)) / 2);
		width: var(--wc-dot-size);
	}

	:where([data-wc-zoom-track][data-wc-orientation='vertical'])
		:where([data-wc-zoom-thumb]) {
		inset-inline: 0;
		top: calc((var(--wc-dot-size) - var(--wc-thumb-size)) / 2);
		transform: translateY(
			calc((1 - var(--wc-progress, 0)) * (100cqh - var(--wc-dot-size)))
		);
	}

	/* ── horizontal ──────────────────────────────────────────────────────── */
	:where([data-wc-zoom-track][data-wc-orientation='horizontal']) {
		height: var(--wc-thumb-size);
		border-radius: calc(var(--wc-thumb-size) / 2);
	}

	:where([data-wc-zoom-track][data-wc-orientation='horizontal'])::before {
		inset-inline: 0;
		top: calc((var(--wc-thumb-size) - var(--wc-dot-size)) / 2);
		height: var(--wc-dot-size);
	}

	:where([data-wc-zoom-track][data-wc-orientation='horizontal'])
		:where([data-wc-zoom-thumb]) {
		inset-block: 0;
		left: calc((var(--wc-dot-size) - var(--wc-thumb-size)) / 2);
		transform: translateX(
			calc(var(--wc-progress, 0) * (100cqi - var(--wc-dot-size)))
		);
	}
</style>
