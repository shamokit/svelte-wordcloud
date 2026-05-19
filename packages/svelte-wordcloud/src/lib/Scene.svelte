<script lang="ts">
	import { T } from '@threlte/core';
	import { Text, interactivity } from '@threlte/extras';
	import type { ProcessedWord, WordItem } from './types.js';

	type Props = {
		words: ProcessedWord[];
		cameraX: number;
		cameraY: number;
		cameraZ: number;
		layerSpacing: number;
		fontUrl: string;
		onWordClick?: (word: WordItem) => void;
		setCursor?: (cursor: string) => void;
	};

	const {
		words,
		cameraX,
		cameraY,
		cameraZ,
		layerSpacing,
		fontUrl,
		onWordClick,
		setCursor,
	}: Props = $props();

	interactivity();

	/**
	 * Opacity based on distance from camera.
	 *
	 *   dist = cameraZ − wordZ  (positive → word is ahead of camera)
	 *
	 * Design goal: only ONE layer is fully visible at a time.
	 * When the camera has moved one full layerSpacing forward,
	 * the previous layer is gone and the new layer is at full brightness.
	 *
	 *  ┌──────────────────────────────────────────────────────────────┐
	 *  │ behind  │ fade-out │  full opacity  │   fade-in   │ invisible│
	 *  │  < −0.4 │ −0.4→ 0 │  0 → 0.75 × s │ 0.75→1.4 ×s │ > 1.4 ×s│
	 *  └──────────────────────────────────────────────────────────────┘
	 *
	 * At camera position −s (one spacing forward from start):
	 *   • previous layer: dist = −s  < −0.4s → opacity 0  ✓ (gone)
	 *   • current  layer: dist = 0   → opacity 1            ✓ (bright)
	 */
	function getOpacity(word: ProcessedWord): number {
		const dist = cameraZ - word.z;
		const s = layerSpacing;

		const fadeOutBack = s * 0.4; // how far behind camera stays visible
		const fullOpaqFar = s * 0.75; // full opacity up to here
		const maxVisible = s * 1.4; // completely invisible beyond this

		if (dist < -fadeOutBack) return 0;
		if (dist > maxVisible) return 0;

		// Fading out: camera passed this word
		if (dist < 0) return Math.max(0, 1 + dist / fadeOutBack);

		// Full opacity zone
		if (dist <= fullOpaqFar) return 1.0;

		// Fading in: word approaching from the distance
		return Math.max(0, 1 - (dist - fullOpaqFar) / (maxVisible - fullOpaqFar));
	}
</script>

<T.PerspectiveCamera
	makeDefault
	position={[cameraX, cameraY, cameraZ]}
	fov={60}
/>
<T.AmbientLight intensity={1.2} />

{#each words as word (word.word)}
	{@const opacity = getOpacity(word)}
	<Text
		text={word.word}
		fontSize={word.fontSize}
		font={fontUrl}
		position={[word.x, word.y, word.z]}
		color={word.color}
		anchorX="center"
		anchorY="middle"
		outlineWidth="1%"
		outlineColor={word.color}
		visible={opacity > 0}
		outlineOpacity={opacity}
		fillOpacity={opacity}
		onclick={() => onWordClick?.(word)}
		onpointerenter={() => {
			if (onWordClick) setCursor?.('pointer');
		}}
		onpointerleave={() => {
			setCursor?.('');
		}}
	/>
{/each}
