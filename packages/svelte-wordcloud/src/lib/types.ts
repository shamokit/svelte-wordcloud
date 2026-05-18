export type WordItem<T extends Record<string, unknown> = {}> = {
	word: string;
	counts: number;
	/**
	 * Word text color (CSS color string).
	 * Falls back to the `color` prop of the parent `WordCloud` component.
	 */
	color?: string;
} & T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProcessedWord = WordItem<any> & {
	fontSize: number;
	layerIndex: number;
	x: number;
	y: number;
	z: number;
	color: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WordCloudProps = {
	data?: WordItem<any>[];
	/** Orientation of the built-in scrollbars. Default: 'vertical'. */
	scrollbarOrientation?: 'vertical' | 'horizontal';
};

// ── WordCloudFlat ─────────────────────────────────────────────────────────────

export type WordCloudFlatLayout = {
	/**
	 * Controls how much the font size varies between the most and least frequent
	 * words. Higher values make the top words much larger than the rest
	 * (more dramatic hierarchy); lower values produce more evenly sized words.
	 * Default: 2.0.
	 */
	fontSizeContrast?: number;
	/**
	 * How large the most frequent word appears relative to the canvas.
	 * Expressed as a target fraction of the total canvas area (0.0–1.0).
	 * At the default of 0.22, the largest word's bounding box covers roughly
	 * 22% of the canvas area — about half the canvas width for a typical word.
	 * Raise to make the dominant word larger; lower to keep all words smaller.
	 * Default: 0.22.
	 */
	topWordArea?: number;
	/**
	 * How randomly words are scattered around their ideal touch position.
	 * `0` produces a tight, grid-like layout; `1` scatters words as far as
	 * possible while still keeping them packed together. Default: 0.5.
	 */
	randomness?: number;
};

export type WordCloudFlatA11y = {
	/**
	 * Returns the `aria-valuetext` for the built-in zoom slider.
	 * Use for localisation. Default: `(z) => \`${z.toFixed(1)}x\``.
	 */
	zoomValueText?: (zoom: number) => string;
	/**
	 * Accessible label text for the zoom slider. Default: 'Zoom'.
	 */
	zoomLabel?: string;
	/**
	 * Short visible hint shown inside the keyboard pan control when focused.
	 * Default: 'Arrow keys to pan'.
	 */
	panHint?: string;
	/**
	 * Screen-reader description for the keyboard pan control button.
	 * Default: 'Pan view. Use arrow keys to move.'
	 */
	panLabel?: string;
	/**
	 * Screen-reader label for the reset pan button.
	 * Default: 'Reset pan (double-click)'
	 */
	resetPanLabel?: string;
};

export type WordCloudFlatProps = {
	/**
	 * URL of the font file (TTF/OTF/WOFF) to use for rendering.
	 */
	fontUrl: string;
	/**
	 * Maximum zoom level (minimum is always 1). Default: 2.0.
	 */
	maxZoom?: number;
	/**
	 * Layout and sizing options.
	 */
	layout?: WordCloudFlatLayout;
	/**
	 * Accessibility labels and ARIA text. Override these for localisation.
	 */
	a11y?: WordCloudFlatA11y;
	/**
	 * Called when a word is clicked.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	onWordClick?: (word: WordItem<any>) => void;
};

// ── WordCloud3D ───────────────────────────────────────────────────────────────

export type WordCloud3DLayout = {
	/**
	 * Distance between adjacent depth layers. Larger values push layers further
	 * apart, giving a more dramatic 3D parallax effect; smaller values flatten
	 * the depth. Measured in Three.js world units. Default: 12.
	 */
	layerSpacing?: number;
	/**
	 * Controls how much the font size varies between the most and least frequent
	 * words. Higher values make the top words much larger than the rest
	 * (more dramatic hierarchy); lower values produce more evenly sized words.
	 * Default: 2.0.
	 */
	fontSizeContrast?: number;
	/**
	 * How large the most frequent word appears relative to the canvas.
	 * Expressed as a target fraction of the total canvas area (0.0–1.0).
	 * At the default of 0.22, the largest word's bounding box covers roughly
	 * 22% of the canvas area — about half the canvas width for a typical word.
	 * Raise to make the dominant word larger; lower to keep all words smaller.
	 * Default: 0.22.
	 */
	topWordArea?: number;
	/**
	 * How randomly words are scattered around their ideal touch position.
	 * `0` produces a tight, grid-like layout; `1` scatters words as far as
	 * possible while still keeping them packed together. Default: 0.32.
	 */
	randomness?: number;
};

export type WordCloud3DA11y = {
	/**
	 * Returns the `aria-valuetext` for the built-in depth slider.
	 * Use for localisation. Default: `(c, t) => \`Layer ${c} / ${t}\``.
	 */
	depthValueText?: (current: number, total: number) => string;
	/**
	 * Accessible label text for the depth slider. Default: 'Depth'.
	 */
	depthLabel?: string;
	/**
	 * Short visible hint shown inside the keyboard pan control when focused.
	 * Default: 'Arrow keys to pan'.
	 */
	panHint?: string;
	/**
	 * Screen-reader description for the keyboard pan control button.
	 * Default: 'Pan camera. Use arrow keys to move the view.'
	 */
	panLabel?: string;
	/**
	 * Screen-reader label for the reset pan button.
	 * Default: 'Reset pan (double-click)'
	 */
	resetPanLabel?: string;
};

export type WordCloud3DProps = {
	/**
	 * URL of the font file (TTF/OTF/WOFF/WOFF2) to use for rendering.
	 * Inter (Latin) is a clean, widely-available choice:
	 * https://cdn.jsdelivr.net/fontsource/fonts/inter@5/latin-400-normal.ttf
	 */
	fontUrl: string;
	/**
	 * Scroll speed multiplier for Ctrl+Wheel and pinch gestures. Default: 1.
	 */
	wheelScrollSpeed?: number;
	/**
	 * Layout and sizing options.
	 */
	layout?: WordCloud3DLayout;
	/**
	 * Accessibility labels and ARIA text. Override these for localisation.
	 */
	a11y?: WordCloud3DA11y;
	/**
	 * Called when a word is clicked.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	onWordClick?: (word: WordItem<any>) => void;
};
