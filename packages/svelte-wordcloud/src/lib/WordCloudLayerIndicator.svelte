<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getWCContext } from './WordCloud.svelte';

	type IndicatorArgs = {
		currentLayer: number;
		numLayers: number;
	};

	type Props = {
		indicator?: Snippet<[IndicatorArgs]>;
		format?: (current: number, total: number) => string;
	};

	const { indicator, format = (c, t) => `${c} / ${t}` }: Props = $props();

	const ctx = getWCContext();
</script>

{#if indicator}
	{@render indicator({
		currentLayer: ctx.currentLayer,
		numLayers: ctx.numLayers,
	})}
{:else}
	<div
		data-wc-layer-indicator
		data-wc-hidden={ctx.numLayers <= 1 || undefined}
		aria-hidden="true"
	>
		{format(ctx.currentLayer, ctx.numLayers)}
	</div>
{/if}

<style>
	:where([data-wc-layer-indicator]) {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		user-select: none;
	}

	:where([data-wc-layer-indicator][data-wc-hidden]) {
		visibility: hidden;
	}
</style>
