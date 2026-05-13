<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getWCContext } from './WordCloud.svelte';

	type Props = {
		label: Snippet<[{ props: { id: string } }]>;
	};

	const { label }: Props = $props();
	const ctx = getWCContext();
</script>

{@render label({ props: { id: ctx.canvasLabelId } })}
