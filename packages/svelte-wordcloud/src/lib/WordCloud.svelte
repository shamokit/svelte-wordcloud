<script module lang="ts">
	import { createContext } from 'svelte';
	import type { WordItem } from './types.js';

	export type WCContext = {
		readonly canvasLabelId: string;
		readonly depthLabelId: string;
		readonly zoomLabelId: string;
		/** Word data owned by WordCloud, readable by child components (e.g. WordCloudTable). */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		readonly data: WordItem<any>[];
		/** Scrollbar orientation for depth (WordCloud3D) and zoom (WordCloudFlat) scrollbars. */
		readonly scrollbarOrientation: 'vertical' | 'horizontal';
		/** Written by the display component (e.g. WordCloud3D). */
		numLayers: number;
		currentLayer: number;
		scrollProgress: number;
		/** Scroll to a specific progress value (0 = front, 1 = back). */
		scrollTo(progress: number): void;
		/** Step deeper (+1) or shallower (−1) by one natural unit. */
		scrollStep(dir: 1 | -1): void;
		/**
		 * Zoom-related state. Written by WordCloudFlat; defaults to 1/1/2/0.
		 */
		zoom: number;
		minZoom: number;
		maxZoom: number;
		/** (zoom − minZoom) / (maxZoom − minZoom), clamped to [0, 1]. */
		zoomProgress: number;
		/** Zoom to a specific progress value (0 = minZoom, 1 = maxZoom). */
		zoomTo(progress: number): void;
		/** Step zoom in (+1) or out (−1) by one natural unit. */
		zoomStep(dir: 1 | -1): void;
	};

	const [getWCContext, setWCContext] = createContext<WCContext>();
	export { getWCContext };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		data?: WordItem<any>[];
		/** Orientation of the built-in scrollbars. Default: 'vertical'. */
		scrollbarOrientation?: 'vertical' | 'horizontal';
		children: Snippet;
	};

	const {
		data = [],
		scrollbarOrientation = 'vertical',
		children,
	}: Props = $props();

	const uniqueId = $props.id();

	class WCContextImpl {
		readonly canvasLabelId = `wc-canvas-${uniqueId}`;
		readonly depthLabelId = `wc-depth-${uniqueId}`;
		readonly zoomLabelId = `wc-zoom-${uniqueId}`;
		get data() {
			return data;
		}
		get scrollbarOrientation() {
			return scrollbarOrientation;
		}
		numLayers = $state(1);
		currentLayer = $state(1);
		scrollProgress = $state(0);
		scrollTo = (_: number): void => {};
		scrollStep = (_: 1 | -1): void => {};
		zoom = $state(1);
		minZoom = $state(1);
		maxZoom = $state(2);
		zoomProgress = $state(0);
		zoomTo = (_: number): void => {};
		zoomStep = (_: 1 | -1): void => {};
	}

	const ctx = new WCContextImpl();
	setWCContext(ctx);
</script>

<!--
  display:contents keeps this element out of the layout while allowing CSS custom
  properties set on <WordCloud> (e.g. --wc-color) to cascade to all descendants.
-->
<div style="display: contents">
	{@render children()}
</div>
