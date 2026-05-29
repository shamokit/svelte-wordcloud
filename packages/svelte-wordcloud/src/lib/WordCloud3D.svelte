<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { Spring } from 'svelte/motion';
	import { untrack, tick } from 'svelte';
	import { DEV } from 'esm-env';
	import Scene from './Scene.svelte';
	import PanResetButton from './PanResetButton.svelte';
	import PanKeyControl from './PanKeyControl.svelte';
	import type { WordCloud3DProps, ProcessedWord, WordItem } from './types.js';
	import { getWCContext } from './WordCloud.svelte';
	import { createFontMetrics } from './fontMetrics.svelte.js';
	import {
		computeLayout3D,
		buildCacheKey3D,
		hashStr,
		removeLayoutCacheEntry,
		getCache3DEntry,
		setCache3DEntry,
		type Layout3DParams,
		type Layout3DResult,
	} from './layoutEngine.js';

	const {
		fontUrl,
		wheelScrollSpeed = 1,
		layout = {},
		a11y = {},
		onWordClick,
		useCache,
	}: WordCloud3DProps = $props();

	const layerSpacing    = $derived(layout.layerSpacing    ?? 12);
	const fontSizeContrast = $derived(layout.fontSizeContrast ?? 2.0);
	const topWordArea     = $derived(layout.topWordArea     ?? 0.22);
	const randomness      = $derived(layout.randomness      ?? 0.32);

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
	// Extra scroll range beyond the first/last layer (in layer units).
	const EXTEND_LAYERS = 0.5;

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
	// Split into two separate state variables so Scene.svelte can receive a
	// stable $state array whose elements are mutated in-place. Svelte 5's
	// fine-grained reactivity then only re-renders the props that actually
	// changed, instead of re-evaluating every word on every generator yield.
	let numLayers = $state(1);
	// Reactive array passed directly to Scene. Elements are plain objects
	// wrapped by Svelte 5's $state proxy; mutating a property (e.g. d.x = v)
	// fires only the signals for that property, not the entire word list.
	let displayWords = $state<ProcessedWord[]>([]);
	// Plain (non-reactive) index map so applyWords can find each element in
	// O(1) without iterating displayWords.
	const _wordIndexMap = new Map<string, number>();

	/**
	 * Merge `words` from a generator yield into `displayWords` with minimal
	 * Svelte signal firings:
	 *  - New words → push (creates new Text component once)
	 *  - Existing words whose position/size/color changed → mutate the proxied
	 *    element in-place so only the affected props re-render
	 *  - Existing words unchanged → proxy setter equality check exits early,
	 *    zero subscriber notifications
	 */
	function applyWords(words: ProcessedWord[]) {
		for (const w of words) {
			const idx = _wordIndexMap.get(w.word);
			if (idx !== undefined) {
				const d = displayWords[idx];
				if (d.x !== w.x) d.x = w.x;
				if (d.y !== w.y) d.y = w.y;
				if (d.z !== w.z) d.z = w.z;
				if (d.fontSize !== w.fontSize) d.fontSize = w.fontSize;
				if (d.color !== w.color) d.color = w.color;
				if (d.layerIndex !== w.layerIndex) d.layerIndex = w.layerIndex;
			} else {
				_wordIndexMap.set(w.word, displayWords.length);
				displayWords.push({ ...w });
			}
		}
	}

	// Svelte 5 production バグ回避: $effect の sync ボディで書いた $state に
	// 同じ effect の async IIFE から書いても subscriber に通知が届かない。
	let _loadingVersion = $state(0);  // データ変更ランが始まるたびに sync でインクリメント
	let _finishedVersion = $state(0); // ランが完了するたびに async で _loadingVersion の値をセット
	const isLoading = $derived(_loadingVersion > _finishedVersion);

	// ── localStorage cache helpers ────────────────────────────────────────────
	// Tracks the cache key and storage key for the current layout run so that
	// clearCache() can remove the right entries without re-computing the key.
	let _currentCacheKey3D = '';
	let _currentStorageKey3D = '';

	const _LS_PREFIX_3D = 'svelte-wc-3d-';

	function _lsKey3D(id: string | symbol | true, cacheKey: string): string {
		if (id === true) return _LS_PREFIX_3D + hashStr(cacheKey).toString(16);
		if (typeof id === 'symbol') return _LS_PREFIX_3D + (id.description ?? id.toString());
		return _LS_PREFIX_3D + id;
	}

	function _lsRestore3D(storageKey: string, cacheKey: string): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return;
			const { validator, data } = JSON.parse(raw) as { validator: string; data: { words: ProcessedWord[]; numLayers: number } };
			if (validator !== cacheKey) { localStorage.removeItem(storageKey); return; }
			setCache3DEntry(cacheKey, data);
		} catch { /* parse error or SecurityError → ignore */ }
	}

	function _lsSave3D(storageKey: string, cacheKey: string): void {
		if (typeof localStorage === 'undefined') return;
		try {
			// Skip write if a valid entry already exists for this key.
			const existing = localStorage.getItem(storageKey);
			if (existing) {
				const { validator } = JSON.parse(existing) as { validator: string };
				if (validator === cacheKey) return;
			}
			const entry = getCache3DEntry(cacheKey);
			if (!entry) return;
			localStorage.setItem(storageKey, JSON.stringify({ validator: cacheKey, data: entry }));
		} catch { /* localStorage full or SecurityError → ignore */ }
	}

	// Track the data reference to know when to clear the display vs. quiet-recompute.
	// Plain variable (not $state) so reading/writing it doesn't re-trigger the effect.
	let lastData: typeof ctx.data | null = null;

	$effect(() => {
		// Wait until the container has been measured (150 ms debounce) so the
		// first layout uses the real aspect ratio, not the 16:9 fallback.
		if (layoutH === 0 || layoutW === 0) return;

		// Wait for font metrics before running layout.
		// Large CJK fonts (e.g. NotoSansJP at 9 MB) can take several seconds to
		// load in the troika worker on a first visit. If we run the layout before
		// metrics arrive we fall back to CHAR_W_FALLBACK (0.6 em) for every word.
		// Japanese characters are ~0.97 em wide, so the bounding boxes come out
		// 38 % too narrow and the rendered words visually overlap each other.
		if (ctx.data.some((d) => typeof d.word === 'string' && d.word.trim().length > 0)
			&& Object.keys(wordWidths).length === 0) {
			// Activate the spinner so the user sees loading feedback rather than a
			// blank canvas while the font loads in the troika worker.
			if (_loadingVersion === _finishedVersion) _loadingVersion++;
			return;
		}

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
			// Read color without subscribing: color changes should not retrigger layout.
			computedWordColor: untrack(() => computedWordColor),
		};

		// Compute cache key once (used for both in-memory cache and localStorage).
		const _cacheKey = buildCacheKey3D(params);
		_currentCacheKey3D = _cacheKey;

		// Restore from localStorage into in-memory cache (if useCache and not yet cached).
		if (useCache) {
			const sk = _lsKey3D(useCache, _cacheKey);
			_currentStorageKey3D = sk;
			if (!getCache3DEntry(_cacheKey)) _lsRestore3D(sk, _cacheKey);
		}

		// Only clear the display and show the spinner when word data itself changes.
		// For cosmetic re-runs (container resize, font metrics, color), keep
		// showing the previous layout silently while the new computation runs.
		// NOTE: isDataChange must be computed BEFORE updating lastData.
		const isDataChange = ctx.data !== lastData;
		if (isDataChange) {
			lastData = ctx.data;
			displayWords = [];
			_wordIndexMap.clear();
			numLayers = 1;
			_loadingVersion++;
		}
		// For data changes: yield progressively so words appear as they are placed.
		// For cosmetic re-runs (resize, font-metrics, color): hold the existing
		// layout until the new one is fully computed, then swap atomically.
		// This prevents the word count from visibly regressing N→1→N during a
		// background recompute.
		let cancelled = false;

		(async () => {
			try {
				let buffer: Layout3DResult | null = null;
				let lastWordCount = 0;
				for await (const partial of computeLayout3D(params)) {
					if (cancelled) return;
					if (partial.numLayers !== numLayers) numLayers = partial.numLayers;
					// During placement words are appended; during compaction the count
					// stabilises while positions shift. Apply placement yields eagerly
					// (fine-grained: only the new words trigger Text node creation).
					// Buffer compaction yields and cosmetic re-runs; apply atomically
					// once so the scene transitions cleanly.
					const isPlacement = partial.words.length > lastWordCount;
					lastWordCount = partial.words.length;
					if (isDataChange && isPlacement) {
						applyWords(partial.words);
					} else {
						buffer = partial;
					}
				}
				if (!cancelled && buffer !== null) {
					numLayers = buffer.numLayers;
					applyWords(buffer.words);
				}
				if (!cancelled && useCache) {
					_lsSave3D(_currentStorageKey3D, _cacheKey);
				}
			} finally {
				if (!cancelled) {
					await tick();
					if (!cancelled) {
						_finishedVersion = _loadingVersion;
					}
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	// ── Color-only update (runs when CSS color or displayWords changes) ─────
	$effect(() => {
		const color = computedWordColor;
		const len = displayWords.length; // subscribe so progressive words get colored
		untrack(() => {
			const explicitColors = new Map(
				ctx.data.filter((d) => d.color != null).map((d) => [d.word, d.color!]),
			);
			for (let i = 0; i < len; i++) {
				const w = displayWords[i];
				if (!explicitColors.has(w.word)) w.color = color;
			}
		});
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

	// Layer 1 camera position (also the initial targetZ)
	const maxZ = initViewingDist;
	// Last-layer camera position
	const minZ = $derived(
		-(numLayers - 1) * layerSpacing + initViewingDist,
	);
	// Extend scroll range past the last layer only; layer 1 is the minimum (all words fit at that depth)
	const scrollMaxZ = maxZ;
	const scrollMinZ = $derived(minZ - EXTEND_LAYERS * initLayerSpacing);

	// scrollProgress covers the full extended range [0 = scrollMaxZ, 1 = scrollMinZ]
	const scrollProgress = $derived(
		scrollMaxZ === scrollMinZ ? 0 : (targetZ - scrollMaxZ) / (scrollMinZ - scrollMaxZ),
	);

	// currentLayer is clamped to [1, N] so extended zones show the boundary layer
	function computeCurrentLayer(numLayers: number) {
		if (maxZ === minZ) return 1;
		const p = Math.max(0, Math.min(1, (targetZ - maxZ) / (minZ - maxZ)));
		return Math.round(p * (numLayers - 1)) + 1;
	}

	// ── Write scroll state back to context ──────────────────────────────────
	$effect(() => {
		ctx.numLayers = numLayers;
		ctx.currentLayer = computeCurrentLayer(numLayers);
		ctx.scrollProgress = scrollProgress;
	});

	// ── Clamp targetZ when scroll bounds change ───────────────────────────────
	// A cosmetic re-run (e.g. font metrics arriving) may yield a different
	// numLayers, which shifts scrollMinZ. If targetZ is now outside the valid
	// range, animate it smoothly to the nearest boundary so the view doesn't
	// get stuck at a depth that can no longer be reached by scroll events.
	$effect(() => {
		const min = scrollMinZ; // reactive — re-runs whenever numLayers changes
		untrack(() => {
			if (targetZ < min) {
				targetZ = min;
				camSpring.set(min);
				syncScrollCtx();
			}
		});
	});

	function syncScrollCtx() {
		ctx.scrollProgress = scrollProgress;
		ctx.currentLayer = computeCurrentLayer(numLayers);
	}

	ctx.scrollTo = (progress: number) => {
		targetZ = scrollMaxZ + progress * (scrollMinZ - scrollMaxZ);
		camSpring.set(targetZ);
		syncScrollCtx();
	};
	ctx.scrollStep = (dir: 1 | -1) => {
		const step = layerSpacing * 0.3;
		targetZ = Math.max(scrollMinZ, Math.min(scrollMaxZ, targetZ - dir * step));
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
		if (isLoading) return;
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
		if (isLoading) return;
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
		if (isLoading) return;
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
		if (isLoading) return;
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
			const delta = e.deltaY * 0.007 * wheelScrollSpeed * layerSpacing;
			targetZ = Math.max(scrollMinZ, Math.min(scrollMaxZ, targetZ + delta));
			camSpring.set(targetZ);
			syncScrollCtx();
		}

		wrap.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			wrap.removeEventListener('wheel', onWheel);
		};
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
				// Pinch out (d grows) → go deeper; pinch in → go shallower
				const delta = (d - lastDist) * 0.05 * wheelScrollSpeed;
				lastDist = d;
				targetZ = Math.max(scrollMinZ, Math.min(scrollMaxZ, targetZ - delta));
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

	/** Clears the cached layout for the current data from both the in-memory
	 *  cache and localStorage (if `useCache` is set). Call this to force a
	 *  re-computation on the next render. */
	export function clearCache(): void {
		removeLayoutCacheEntry(_currentCacheKey3D);
		if (_currentStorageKey3D && typeof localStorage !== 'undefined') {
			try { localStorage.removeItem(_currentStorageKey3D); } catch { /* SecurityError → ignore */ }
		}
	}
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
			aria-busy={isLoading}
			bind:this={canvasWrapEl}
			bind:clientWidth={containerW}
			bind:clientHeight={containerH}
		>
			<Canvas>
				<Scene
					words={displayWords}
					{cameraX}
					{cameraY}
					cameraZ={camSpring.current}
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
			disabled={isLoading}
			onkeydown={handlePanKeydown}
			onkeyup={handlePanKeyup}
		/>
		{#if !isPanCentered}
			<PanResetButton label={resetPanLabel} disabled={isLoading} onreset={resetPan} />
		{/if}
		<div
			data-wc-depth-col
			data-wc-orientation={ctx.scrollbarOrientation}
			data-wc-hidden={ctx.numLayers <= 1 || undefined}
			data-wc-loading={isLoading || undefined}
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
					disabled={isLoading}
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
		/* Fixed width so the layer-count text never reflows the canvas. */
		width: var(--wc-scrollbar-size, 40px);
		padding-block: var(--wc-scrollbar-padding, 8px);
		gap: var(--wc-scrollbar-gap, 4px);
	}
	:where([data-wc-depth-col][data-wc-orientation='horizontal']) {
		flex-direction: row;
		width: 100%;
		padding-block: calc(var(--wc-scrollbar-padding, 8px) / 2);
		padding-inline: var(--wc-scrollbar-padding, 8px);
	}
	/*
	 * Reserve the scrollbar gutter even when hidden. Using `display: none` would
	 * resize the canvas, which feeds back into rx/ry and re-triggers the layout
	 * effect — an infinite recompute loop.
	 */
	:where([data-wc-depth-col][data-wc-hidden]) {
		visibility: hidden;
		pointer-events: none;
	}

	:where([data-wc-depth-col][data-wc-loading]) {
		pointer-events: none;
		cursor: not-allowed;
		opacity: 0.4;
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
