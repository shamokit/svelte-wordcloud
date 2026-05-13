<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getWCAudioContext } from './WordCloudAudio.svelte';

	type Props = {
		/**
		 * Required snippet. Receives `props` (spread onto the label element for the
		 * correct `id`) and `isPlaying` (current playback state).
		 *
		 * @example
		 * <WordCloudAudioLabel>
		 *   {#snippet children({ props, isPlaying })}
		 *     <span {...props} style="position:absolute;width:1px;height:1px;overflow:hidden">
		 *       {isPlaying ? 'Pause' : 'Play'}
		 *     </span>
		 *   {/snippet}
		 * </WordCloudAudioLabel>
		 */
		children: Snippet<[{ props: { id: string }; isPlaying: boolean }]>;
	};

	const { children }: Props = $props();
	const ctx = getWCAudioContext();
</script>

{@render children({ props: { id: ctx.labelId }, isPlaying: ctx.isPlaying })}
