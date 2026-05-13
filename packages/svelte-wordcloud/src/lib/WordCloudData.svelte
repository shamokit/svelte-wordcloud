<script
	generics="T extends Record<string, unknown> = Record<string, unknown>"
	lang="ts"
>
	import type { Snippet } from 'svelte';
	import { getWCContext } from './WordCloud.svelte';
	import type { WordItem } from './types.js';

	type Props = {
		/**
		 * Required snippet. Receives `data` sorted by count descending.
		 * The consumer is fully responsible for the rendered markup.
		 *
		 * Specify the type parameter for typed access to custom fields:
		 * @example
		 * <WordCloudData<{ link?: string }>>
		 *   {#snippet children({ data })}
		 *     <ul>
		 *       {#each data as item (item.word)}
		 *         <li><a href={item.link}>{item.word} ({item.counts})</a></li>
		 *       {/each}
		 *     </ul>
		 *   {/snippet}
		 * </WordCloudData>
		 */
		children: Snippet<[{ data: WordItem<T>[] }]>;
	};

	const { children }: Props = $props();

	const ctx = getWCContext();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sorted = $derived(
		[...ctx.data].sort((a, b) => b.counts - a.counts) as WordItem<T>[],
	);
</script>

{@render children({ data: sorted })}
