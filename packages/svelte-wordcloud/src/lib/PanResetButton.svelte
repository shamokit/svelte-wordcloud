<script lang="ts">
	import Crosshair from '@lucide/svelte/icons/crosshair';

	type Props = {
		label: string;
		onreset: () => void;
	};

	const { label, onreset }: Props = $props();
</script>

<button type="button" data-wc-reset-pan onclick={onreset}>
	<span data-wc-sr-only>{label}</span>
	<Crosshair size={16} aria-hidden="true" />
</button>

<style>
	:where([data-wc-sr-only]) {
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

	:where([data-wc-reset-pan]) {
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 5px 12px;
		border: 1px solid
			color-mix(in srgb, var(--wc-color, currentColor) 35%, transparent);
		border-radius: 20px;
		background: color-mix(
			in srgb,
			var(--wc-color, currentColor) 10%,
			transparent
		);
		color: var(--wc-color, currentColor);
		cursor: pointer;
		opacity: 0.75;
		transition:
			opacity 0.15s,
			background 0.15s;
		z-index: 2;
		backdrop-filter: blur(4px);
	}

	:where([data-wc-reset-pan]):hover {
		opacity: 1;
		background: color-mix(
			in srgb,
			var(--wc-color, currentColor) 20%,
			transparent
		);
	}

	:where([data-wc-reset-pan]):active {
		opacity: 1;
	}

	:where([data-wc-reset-pan]):focus-visible {
		opacity: 1;
		outline: 2px solid
			color-mix(in srgb, var(--wc-color, currentColor) 70%, transparent);
		outline-offset: 2px;
	}
</style>
