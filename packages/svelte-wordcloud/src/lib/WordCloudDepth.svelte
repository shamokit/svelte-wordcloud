<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getWCContext } from './WordCloud.svelte';

	type DepthArgs = {
		props: { id: string };
		label: (formatter: (current: number, total: number) => string) => string;
	};

	type Props = {
		depth: Snippet<[DepthArgs]>;
	};

	const { depth }: Props = $props();
	const ctx = getWCContext();
</script>

{@render depth({
	props: { id: ctx.depthLabelId },
	label: (formatter) => formatter(ctx.currentLayer, ctx.numLayers),
})}
