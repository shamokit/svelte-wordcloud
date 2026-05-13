<script lang="ts">
	import {
		WordCloud,
		WordCloud3D,
		WordCloudFlat,
	} from '@shamokit/svelte-wordcloud';
	import { words, FONT_URL } from './demoWords.js';

	let mode: '3d' | 'flat' = $state('3d');
</script>

<div class="tabs not-content" role="tablist">
	<button
		role="tab"
		aria-selected={mode === '3d'}
		onclick={() => (mode = '3d')}
	>WordCloud3D + Scrollbar</button>
	<button
		role="tab"
		aria-selected={mode === 'flat'}
		onclick={() => (mode = 'flat')}
	>WordCloudFlat + ZoomScrollbar</button>
</div>

<div class="demo-wrap not-content">
	{#if mode === '3d'}
		<WordCloud data={words} --wc-background="#0d0d1a" --wc-color="#7ec8e3">
			<WordCloud3D fontUrl={FONT_URL} depthValueText={(c, t) => `Layer ${c} / ${t}`} />
		</WordCloud>
	{:else}
		<WordCloud data={words} --wc-background="#0d1a0d" --wc-color="#a8e6a3">
			<WordCloudFlat fontUrl={FONT_URL} zoomValueText={(z) => `${z.toFixed(1)}×`} />
		</WordCloud>
	{/if}
</div>

<style>
	/* ── Tab bar ──────────────────────────────────────────────────────────────── */
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--sl-color-hairline);
		margin-bottom: 1rem;
	}

	button {
		padding: 0.5rem 1rem;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		background: transparent;
		color: var(--sl-color-text-accent);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}

	button:hover {
		color: var(--sl-color-text);
	}

	button[aria-selected='true'] {
		color: var(--sl-color-text);
		border-bottom-color: var(--sl-color-accent);
	}

	/* ── Demo ─────────────────────────────────────────────────────────────────── */
	.demo-wrap {
		width: 100%;
		height: 380px;
		border-radius: 8px;
		overflow: hidden;
	}
</style>
