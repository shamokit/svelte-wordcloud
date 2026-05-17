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
	import { createFontMetrics } from './fontMetrics.svelte.js';
	import { computeLayout3D, type Layout3DParams, type Layout3DResult } from './layoutEngine.js';

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
	const MIN_ZOOM = 0.3;
	const MAX_ZOOM = 3.0;

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

	// ── Layout (async generator) ──────────────────────────────────────────────
	let wordLayout = $state<Layout3DResult>({ words: [], numLayers: 1 });
	let isLoading = $state(false);

	$effect(() => {
		const params: Layout3DParams = {
			data: ctx.data,
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
		};

		wordLayout = { words: [], numLayers: 1 };
		isLoading = true;
		let cancelled = false;

		(async () => {
			for await (const partial of computeLayout3D(params)) {
				if (cancelled) return;
				wordLayout = partial;
			}
			if (!cancelled) isLoading = false;
		})();

		return () => {
			cancelled = true;
		};
	});

	// ── Camera spring ─────────────────────────────────────────────────────────
	const prefersReducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let targetZ = $state(initViewingDist);
	const camSpring = new Spring(initViewingDist, {
		stiffness: prefersReducedMotion ? 1 : 0.04,
		damping: prefersReducedMotion ? 1 : 0.78,
	});

	let zoom3D = $state(1.0);
	const zoom3DSpring = new Spring(1.0, {
		stiffness: prefersReducedMotion ? 1 : 0.1,
		damping: prefersReducedMotion ? 1 : 0.8,
	});

	// camera Z adjusted for zoom: dividing viewing distance by zoom moves camera closer (zoom in)
	const effectiveCameraZ = $derived(
		camSpring.current - initViewingDist * (1 - 1 / zoom3DSpring.current),
	);

	function applyZoom3D(newZoom: number) {
		zoom3D = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
		zoom3DSpring.set(zoom3D);
		ctx.zoom = zoom3D;
		ctx.zoomProgress = (zoom3D - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
	}

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

	ctx.minZoom = MIN_ZOOM;
	ctx.maxZoom = MAX_ZOOM;
	ctx.zoom = 1.0;
	ctx.zoomProgress = (1 - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
	ctx.zoomTo = (progress: number) => {
		applyZoom3D(MIN_ZOOM + progress * (MAX_ZOOM - MIN_ZOOM));
	};
	ctx.zoomStep = (dir: 1 | -1) => {
		const step = (MAX_ZOOM - MIN_ZOOM) * 0.1;
		applyZoom3D(zoom3D + dir * step);
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

	// ── Inline zoom scrollbar state ──────────────────────────────────────────
	const zoomLabel     = $derived(a11y.zoomLabel     ?? 'Zoom');
	const zoomValueText = $derived(a11y.zoomValueText ?? ((z: number) => `${z.toFixed(1)}x`));

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
			if (isLoading) return;
			const factor = e.deltaY > 0 ? 1 / 1.06 : 1.06;
			applyZoom3D(zoom3D * factor);
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
			if (isLoading) return;
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
			if (e.button !== 0 || isLoading) return;
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
					cameraZ={effectiveCameraZ}
					{layerSpacing}
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
		<div data-wc-zoom-col data-wc-orientation={ctx.scrollbarOrientation}>
			<span data-wc-zoom-label id={ctx.zoomLabelId}>{zoomLabel}</span>
			<div data-wc-zoom-indicator aria-hidden="true">
				×{ctx.zoom.toFixed(1)}
			</div>
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
		z-index: 1;
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
