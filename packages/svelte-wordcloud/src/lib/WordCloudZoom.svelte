<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getWCContext } from './WordCloud.svelte';

	type ZoomArgs = {
		props: { id: string };
		label: (formatter: (zoom: number) => string) => string;
	};

	type Props = {
		zoom: Snippet<[ZoomArgs]>;
	};

	const { zoom }: Props = $props();
	const ctx = getWCContext();
</script>

{@render zoom({
	props: { id: ctx.zoomLabelId },
	label: (formatter) => formatter(ctx.zoom),
})}
