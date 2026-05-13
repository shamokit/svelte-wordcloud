<script module lang="ts">
	import { createContext } from 'svelte';

	type WCAudioContext = {
		readonly labelId: string;
		readonly isPlaying: boolean;
	};

	const [getWCAudioContext, setWCAudioContext] =
		createContext<WCAudioContext>();
	export { getWCAudioContext };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import { getWCContext } from './WordCloud.svelte';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	import type { WordItem } from './types.js';

	type Props = {
		/**
		 * BCP 47 language tag passed to SpeechSynthesisUtterance.
		 * Set this to match your word data (e.g. 'ja-JP', 'en-US').
		 * Defaults to the document language if omitted.
		 */
		lang?: string;
		/**
		 * Milliseconds of silence between words. Default: 60.
		 */
		gap?: number;
		/**
		 * Speech rate passed to SpeechSynthesisUtterance. Default: 2.0.
		 */
		rate?: number;
		/**
		 * Accessible label shown when the button is in the "play" (stopped) state.
		 * Used as the fallback label when no <WordCloudAudioLabel> child is provided.
		 * Default: 'Play'.
		 */
		playLabel?: string;
		/**
		 * Accessible label shown when the button is in the "pause" (playing) state.
		 * Used as the fallback label when no <WordCloudAudioLabel> child is provided.
		 * Default: 'Pause'.
		 */
		pauseLabel?: string;
		/**
		 * Optional. Place a <WordCloudAudioLabel> here to provide a localised
		 * accessible label for the play/pause button via aria-labelledby.
		 * If omitted, a visually-hidden fallback label using playLabel / pauseLabel is rendered automatically.
		 */
		children?: Snippet;
	};

	const {
		lang = '',
		gap = 60,
		rate = 2.0,
		playLabel = 'Play',
		pauseLabel = 'Pause',
		children,
	}: Props = $props();

	const ctx = getWCContext();

	// ── Audio context ─────────────────────────────────────────────────────────
	const uniqueId = $props.id();
	const labelId = `wc-audio-${uniqueId}`;

	class WCAudioContextImpl {
		readonly labelId = labelId;
		isPlaying = $state(false);
	}

	const audioCtx = new WCAudioContextImpl();
	setWCAudioContext(audioCtx);

	// ── Volume mapping ────────────────────────────────────────────────────────
	const VOL_MIN = 0.3;
	const VOL_MAX = 0.9;

	let sqrtMin = 0;
	let sqrtMax = 1;

	function computeVolume(word: WordItem<any>): number {
		if (sqrtMin === sqrtMax) return (VOL_MIN + VOL_MAX) / 2;
		const t = (Math.sqrt(word.counts) - sqrtMin) / (sqrtMax - sqrtMin);
		return VOL_MIN + t * (VOL_MAX - VOL_MIN);
	}

	// ── Shuffle ───────────────────────────────────────────────────────────────
	function shuffleArray<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	function buildPlaylist(): WordItem<any>[] {
		const shuffled = shuffleArray(ctx.data);
		const sqrts = shuffled.map((w) => Math.sqrt(w.counts));
		sqrtMin = Math.min(...sqrts);
		sqrtMax = Math.max(...sqrts);
		return shuffled;
	}

	// ── Playback state ────────────────────────────────────────────────────────
	let playlist = $state<WordItem<any>[]>([]);
	let currentIndex = $state(0);
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const hasSpeech =
		typeof window !== 'undefined' && 'speechSynthesis' in window;

	function speakAt(index: number) {
		if (index >= playlist.length) {
			audioCtx.isPlaying = false;
			currentIndex = 0;
			return;
		}

		currentIndex = index;
		const word = playlist[index];
		const utt = new SpeechSynthesisUtterance(word.word);
		if (lang) utt.lang = lang;
		utt.rate = rate;
		utt.volume = computeVolume(word);

		utt.onend = () => {
			if (!audioCtx.isPlaying) return;
			timeoutId = setTimeout(() => speakAt(index + 1), gap);
		};

		window.speechSynthesis.speak(utt);
	}

	function stopAll() {
		audioCtx.isPlaying = false;
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		if (hasSpeech) window.speechSynthesis.cancel();
	}

	function toggle() {
		if (audioCtx.isPlaying) {
			stopAll();
		} else {
			if (!hasSpeech) return;
			if (playlist.length === 0 || currentIndex >= playlist.length) {
				playlist = buildPlaylist();
				currentIndex = 0;
			}
			audioCtx.isPlaying = true;
			speakAt(currentIndex);
		}
	}

	// Reset when source data changes
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		ctx.data;
		stopAll();
		playlist = [];
		currentIndex = 0;
	});

	// Cleanup on unmount
	$effect(() => () => stopAll());
</script>

{#if hasSpeech}
	{#if !children}
		<span id={labelId} data-wc-audio-label-fallback>
			{audioCtx.isPlaying ? pauseLabel : playLabel}
		</span>
	{/if}
	<button
		type="button"
		data-wc-audio-toggle
		aria-labelledby={labelId}
		onclick={toggle}
	>
		{#if audioCtx.isPlaying}
			<Pause size={20} aria-hidden="true" />
		{:else}
			<Play size={20} aria-hidden="true" />
		{/if}
	</button>
	{@render children?.()}
{/if}

<style>
	:where([data-wc-audio-label-fallback]) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	:where([data-wc-audio-toggle]) {
		width: 32px;
		height: 32px;
		padding: 6px;
		border: none;
		border-radius: 50%;
		background: color-mix(
			in srgb,
			var(--wc-color, currentColor) 70%,
			transparent
		);
		color: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s;
	}

	:where([data-wc-audio-toggle]):hover {
		background: color-mix(
			in srgb,
			var(--wc-color, currentColor) 25%,
			transparent
		);
	}

	:where([data-wc-audio-toggle]):focus-visible {
		outline: 2px solid
			color-mix(in srgb, var(--wc-color, currentColor) 70%, transparent);
		outline-offset: 2px;
	}
</style>
