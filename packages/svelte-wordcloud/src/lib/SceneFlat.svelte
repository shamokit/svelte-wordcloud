<script lang="ts">
	import { T } from '@threlte/core';
	import { Text, interactivity } from '@threlte/extras';
	import type { ProcessedWord, WordItem } from './types.js';

	type Props = {
		words: ProcessedWord[];
		cameraX: number;
		cameraY: number;
		cameraZ: number;
		fontUrl: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		onWordClick?: (word: WordItem<any>) => void;
		setCursor?: (cursor: string) => void;
	};

	const {
		words,
		cameraX,
		cameraY,
		cameraZ,
		fontUrl,
		onWordClick,
		setCursor,
	}: Props = $props();

	interactivity();
</script>

<!--
  Perspective camera looking along –Z.
  Panning is achieved by translating the camera in X/Y; all words sit at z=0.
-->
<T.PerspectiveCamera
	makeDefault
	position={[cameraX, cameraY, cameraZ]}
	fov={60}
/>
<T.AmbientLight intensity={1.2} />

{#each words as word (word.word)}
	<Text
		text={word.word}
		fontSize={word.fontSize}
		font={fontUrl}
		position={[word.x, word.y, 0]}
		color={word.color}
		anchorX="center"
		anchorY="middle"
		outlineWidth="1%"
		outlineColor={word.color}
		onclick={() => onWordClick?.(word)}
		onpointerenter={() => {
			if (onWordClick) setCursor?.('pointer');
		}}
		onpointerleave={() => {
			setCursor?.('');
		}}
	/>
{/each}
