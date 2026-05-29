import { DEV } from 'esm-env';

export const CHAR_W_FALLBACK = 0.6;

// Cached at module level so troika-three-text is imported only once across all instances.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let troikaPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTroika(): Promise<any> {
	if (!troikaPromise) {
		// @ts-ignore
		troikaPromise = import(/* @vite-ignore */ 'troika-three-text').catch((err) => {
			troikaPromise = null; // allow retry on next measurement
			throw err;
		});
	}
	return troikaPromise;
}

/**
 * Shared reactive font metrics for WordCloud3D and WordCloudFlat.
 * Call at component initialization; uses Svelte 5 runes internally.
 *
 * @param getWords - reactive getter returning the list of unique words to measure
 * @param getFontUrl - reactive getter returning the font URL
 */
export function createFontMetrics(
	getWords: () => string[],
	getFontUrl: () => string,
) {
	let charH = $state(0.65);
	let wordWidths = $state<Record<string, number>>({});
	let wordHalfH = $state<Record<string, number>>({});

	$effect(() => {
		const words = getWords();
		if (!words.length) return;
		const url = getFontUrl();
		let cancelled = false;
		let remaining = words.length;
		const measuredW: Record<string, number> = {};
		const measuredHH: Record<string, number> = {};
		// Collect the best capHeight/ascender seen across callbacks but do NOT
		// publish it as a separate state update. Updating charH mid-stream would
		// trigger a layout re-run before wordWidths is ready, causing the layout
		// to be cancelled and restarted a second time. Instead we publish all
		// three state variables atomically when remaining reaches 0.
		let pendingCharH: number | null = null;
		getTroika()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			.then((mod: any) => {
				if (cancelled) return;
				for (const word of words) {
					mod.getTextRenderInfo(
						{ text: word, font: url, fontSize: 1 },
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(info: any) => {
							if (cancelled) return;
							const vb = info.visibleBounds;
							if (Array.isArray(vb) && vb.length >= 4) {
								const visW = vb[2] - vb[0];
								const halfH = (vb[3] - vb[1]) / 2;
								if (visW > 0) measuredW[word] = visW;
								if (halfH > 0) measuredHH[word] = halfH;
							} else {
								// caretPositions uses stride 4: [startX, endX, bottomY, topY] per char.
								// The endX of the last character equals the total advance width.
								const w = info.caretPositions?.[(word.length - 1) * 4 + 1];
								if (typeof w === 'number' && w > 0) measuredW[word] = w;
							}
							// Collect the first valid cap height but defer state update.
							if (pendingCharH === null) {
								const cap = info.capHeight ?? info.ascender;
								if (typeof cap === 'number' && cap > 0 && cap < 1.5) {
									pendingCharH = cap;
								} else {
									// No capHeight / ascender — common for CJK fonts (e.g. NotoSansJP).
									// Derive an estimate from the visual half-height: fullHeight ≈ halfH * 2,
									// which approximates the em-square height of the glyphs.
									const hh = measuredHH[word];
									if (typeof hh === 'number' && hh > 0) pendingCharH = hh * 2;
								}
							}
							if (--remaining === 0) {
								// Publish all three state variables in one synchronous block so
								// Svelte batches them into a single reactive flush. This means the
								// layout effect re-runs exactly once when metrics arrive instead of
								// potentially twice (once for charH, once for wordWidths/wordHalfH).
								if (pendingCharH !== null) charH = pendingCharH;
								wordWidths = { ...measuredW };
								wordHalfH = { ...measuredHH };
							}
						},
					);
				}
			})
			.catch(() => {
				if (DEV) {
					console.warn(
						'[svelte-wordcloud] Failed to load troika-three-text. ' +
							'Font metrics will use fallback values. ' +
							'Check that troika-three-text is installed and included in optimizeDeps.',
					);
				}
			});
		return () => {
			cancelled = true;
		};
	});

	return {
		get charH() {
			return charH;
		},
		get wordWidths() {
			return wordWidths;
		},
		get wordHalfH() {
			return wordHalfH;
		},
	};
}
