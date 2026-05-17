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
	import { createFontMetrics } from './fontMetrics.svelte.js';
	import { computeLayoutFlat, type LayoutFlatParams, CHAR_W_FALLBACK } from './layoutEngine.js';

	const {
		fontUrl,
		maxZoom = 2.0,
		layout = {},
		a11y = {},
		onWordClick,
	}: WordCloudFlatProps = $props();

	const fontSizeContrast = $derived(layout.fontSizeContrast ?? 2.0);
	const topWordArea     = $derived(layout.topWordArea     ?? 0.5);
	const randomness      = $derived(layout.randomness      ?? 0.5);

	const zoomValueText = $derived(a11y.zoomValueText ?? ((z: number) => `${z.toFixed(1)}x`));
	const zoomLabel     = $derived(a11y.zoomLabel     ?? 'Zoom');
	const panHint       = $derived(a11y.panHint       ?? 'Arrow keys to pan');
	const panLabel      = $derived(a11y.panLabel      ?? 'Pan view. Use arrow keys to move.');
	const resetPanLabel = $derived(a11y.resetPanLabel ?? 'Reset pan (double-click)');

	const ctx = getWCContext();

	// ── Constants ─────────────────────────────────────────────────────────────
	const TAN30 = Math.tan(Math.PI / 6); // tan(30°) for FOV=60
	// Minimum gap between words in CSS pixels. Converted to world units at runtime.
	const GAP_PX = 16;
	// Extra gap as a fraction of each word's font size.
	// Combined with GAP_PX via max(): small/medium words keep the familiar 16px
	// fixed gap unchanged; only words whose proportional gap (fontSize × 0.10)
	// exceeds 16px get extra breathing room. Crossover ≈ 80px font height.
	const PADDING_FRAC = 0.10;
	const MIN_ZOOM_FLOOR = 0.05;
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

	// ── Layout (async generator) ──────────────────────────────────────────────
	let wordLayout = $state<ProcessedWord[]>([]);
	let isLoading = $state(false);

	$effect(() => {
		const params: LayoutFlatParams = {
			data: ctx.data,
			wordWidths,
			wordHalfH,
			charH,
			rx,
			ry,
			padding,
			paddingFrac: PADDING_FRAC,
			fontSizeContrast,
			topWordArea,
			randomness,
			computedWordColor,
		};

		wordLayout = [];
		isLoading = true;
		let cancelled = false;

		(async () => {
			for await (const partial of computeLayoutFlat(params)) {
				if (cancelled) return;
				wordLayout = partial;
			}
			if (!cancelled) isLoading = false;
		})();

		return () => {
			cancelled = true;
		};
	});

	// Dynamic minZoom: zoom level where the outermost word is exactly at the viewport edge.
	// Recomputed whenever the layout changes; defaults to 1.0 until layout resolves.
	const dynMinZoom = $derived((() => {
		if (wordLayout.length === 0) return 1.0;
		let result = 1.0;
		for (const w of wordLayout) {
			const ww = wordWidths[w.word] ?? w.word.length * CHAR_W_FALLBACK;
			const wh = wordHalfH[w.word] ?? charH * 0.6;
			const hw = (ww * w.fontSize) / 2;
			const hh = wh * w.fontSize;
			const xEdge = Math.abs(w.x) + hw;
			const yEdge = Math.abs(w.y) + hh;
			if (xEdge > 0) result = Math.min(result, rx / xEdge);
			if (yEdge > 0) result = Math.min(result, ry / yEdge);
		}
		return Math.max(MIN_ZOOM_FLOOR, result);
	})());

	/**
	 * Actual bounding half-extents of all placed words.
	 * Used to set the pan limit: the camera must be able to reach the farthest word.
	 */
	const wordBounds = $derived((() => {
		let maxX = 0, maxY = 0;
		for (const w of wordLayout) {
			const ww = wordWidths[w.word] ?? w.word.length * CHAR_W_FALLBACK;
			const wh = wordHalfH[w.word] ?? charH * 0.6;
			maxX = Math.max(maxX, Math.abs(w.x) + (ww * w.fontSize) / 2);
			maxY = Math.max(maxY, Math.abs(w.y) + wh * w.fontSize);
		}
		return { maxX, maxY };
	})());

	// Flat always has exactly 1 layer — assign directly at init (no $effect needed)
	ctx.numLayers = 1;
	ctx.currentLayer = 1;
	ctx.scrollProgress = 0;
	ctx.maxZoom = untrack(() => maxZoom);
	ctx.zoom = 1.0;
	ctx.minZoom = 1.0; // updated reactively below once layout resolves
	ctx.zoomProgress = 0; // updated reactively below
	// zoomTo/zoomStep: closures read dynMinZoom at call time via applyZoom
	ctx.zoomTo = (progress: number) => {
		applyZoom(dynMinZoom + progress * (maxZoom - dynMinZoom));
	};
	ctx.zoomStep = (dir: 1 | -1) => {
		// +1 = zoom in, −1 = zoom out; step = 10 % of total range
		const step = (maxZoom - dynMinZoom) * 0.1;
		applyZoom(zoom + dir * step);
	};

	// Keep ctx.minZoom and ctx.zoomProgress in sync whenever dynMinZoom changes
	$effect(() => {
		ctx.minZoom = dynMinZoom;
		if (zoom < dynMinZoom) {
			applyZoom(dynMinZoom);
		} else {
			ctx.zoomProgress = (zoom - dynMinZoom) / (maxZoom - dynMinZoom);
		}
	});

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
	 * Pan is constrained so that the camera can reach every placed word but
	 * cannot scroll past the farthest content.
	 *
	 * At zoom level z the visible half-extent is rx/z.  The camera centre
	 * (panX) can travel at most (wordBounds.maxX − rx/z) before the far edge
	 * of the content leaves the viewport.  When everything fits inside the
	 * visible area (maxX ≤ rx/z) the limit is 0 — camera stays centred.
	 */
	function clampPan(px: number, py: number) {
		const limitX = Math.max(0, wordBounds.maxX - rx / zoom);
		const limitY = Math.max(0, wordBounds.maxY - ry / zoom);
		return {
			px: Math.max(-limitX, Math.min(limitX, px)),
			py: Math.max(-limitY, Math.min(limitY, py)),
		};
	}

	function applyZoom(newZoom: number) {
		zoom = Math.max(dynMinZoom, Math.min(maxZoom, newZoom));
		zoomSpring.set(zoom);
		// Zoom is event-driven; update context directly
		ctx.zoom = zoom;
		ctx.zoomProgress = (zoom - dynMinZoom) / (maxZoom - dynMinZoom);
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
		if (isLoading) return;
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
		if (isLoading) return;
		const factor = e.deltaY > 0 ? 1 / 1.06 : 1.06;
		applyZoom(zoom * factor);
	}

	// ── Mouse drag → pan ──────────────────────────────────────────────────────
	$effect(() => {
		const wrap = canvasWrapEl;
		if (!wrap) return;

		let prevPos: { x: number; y: number } | null = null;

		function onMouseDown(e: MouseEvent) {
			if (e.button !== 0 || isLoading) return;
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
			if (isLoading) return;
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
		if (isLoading) return;
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
		if (isLoading) return;
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
		if (isLoading) return;
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
			{#if isLoading}
				<div data-wc-loading-overlay aria-hidden="true">
					<div data-wc-spinner></div>
				</div>
			{/if}
		</div>
		<PanKeyControl
			hint={panHint}
			label={panLabel}
			disabled={isLoading}
			onkeydown={handlePanKeydown}
			onkeyup={handlePanKeyup}
		/>
		{#if !isPanCentered}
			<PanResetButton label={resetPanLabel} disabled={isLoading} onreset={resetPan} />
		{/if}
		<div data-wc-zoom-col data-wc-orientation={ctx.scrollbarOrientation} data-wc-loading={isLoading || undefined}>
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
					disabled={isLoading}
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

	:where([data-wc-loading-overlay]) {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 10;
	}

	:where([data-wc-spinner]) {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 3px solid color-mix(in srgb, var(--wc-color, white) 20%, transparent);
		border-top-color: color-mix(in srgb, var(--wc-color, white) 75%, transparent);
		animation: wc-spin 0.75s linear infinite;
	}

	@keyframes wc-spin {
		to {
			transform: rotate(360deg);
		}
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

	/* ── loading state ───────────────────────────────────────────────────────── */
	:where([data-wc-zoom-col][data-wc-loading]) {
		pointer-events: none;
		cursor: not-allowed;
		opacity: 0.4;
	}
</style>
