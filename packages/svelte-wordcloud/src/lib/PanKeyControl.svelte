<script lang="ts">
	import Move from '@lucide/svelte/icons/move';

	type Props = {
		hint: string;
		label: string;
		disabled?: boolean;
		onkeydown: (e: KeyboardEvent) => void;
		onkeyup: (e: KeyboardEvent) => void;
	};

	const { hint, label, disabled = false, onkeydown, onkeyup }: Props = $props();
</script>

<button type="button" data-wc-pan-control {disabled} {onkeydown} {onkeyup}>
	<span data-wc-pan-visual aria-hidden="true">
		<Move size={24} aria-hidden="true" />
		<span>{hint}</span>
	</span>
	<span data-wc-sr-only>{label}</span>
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

	/* Only visible on focus (skip-link pattern) */
	:where([data-wc-pan-control]) {
		position: absolute;
		bottom: 10px;
		left: 10px;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: center;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		width: 1px;
		height: 1px;
		overflow: hidden;
		white-space: nowrap;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--wc-color, currentColor);
		cursor: default;
	}

	:where([data-wc-pan-control]):disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}

	:where([data-wc-pan-control]):focus-visible {
		clip: auto;
		clip-path: none;
		width: auto;
		height: auto;
		overflow: visible;
		white-space: normal;
		padding: 8px 12px;
		border: 1px solid
			color-mix(in srgb, var(--wc-color, currentColor) 40%, transparent);
		border-radius: 10px;
		background: color-mix(
			in srgb,
			var(--wc-color, currentColor) 12%,
			transparent
		);
		backdrop-filter: blur(6px);
		outline: 2px solid
			color-mix(in srgb, var(--wc-color, currentColor) 70%, transparent);
		outline-offset: 2px;
	}

	:where([data-wc-pan-visual]) {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		line-height: 1;
		opacity: 0.9;
		user-select: none;
	}
</style>
