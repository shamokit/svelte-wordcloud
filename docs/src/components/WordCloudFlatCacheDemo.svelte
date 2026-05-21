<script lang="ts">
	import { WordCloud, WordCloudFlat } from '@shamokit/svelte-wordcloud';
	import { heavyWords, FONT_URL } from './demoWords.js';

	let show = $state(true);
	let cachedRef = $state<{ clearCache(): void } | null>(null);

	async function remount() {
		show = false;
		await new Promise<void>((r) => setTimeout(r, 150));
		show = true;
	}

	function clearAndRemount() {
		cachedRef?.clearCache();
		remount();
	}
</script>

<div class="cache-demo not-content">
	{#if show}
		<div class="grid">
			<div class="pane">
				<div class="pane-label">No cache (default)</div>
				<div class="cloud">
					<WordCloud data={heavyWords}>
						<WordCloudFlat fontUrl={FONT_URL} />
					</WordCloud>
				</div>
			</div>
			<div class="pane">
				<div class="pane-label pane-label--cached"><code>useCache={true}</code></div>
				<div class="cloud">
					<WordCloud data={heavyWords}>
						<WordCloudFlat fontUrl={FONT_URL} useCache={true} bind:this={cachedRef} />
					</WordCloud>
				</div>
			</div>
		</div>
	{/if}

	<div class="actions">
		<button onclick={remount}>Remount both</button>
		<button onclick={clearAndRemount}>Clear localStorage &amp; remount</button>
	</div>

	<p class="note">
		<strong>Reload the page</strong> — the right cloud appears instantly from localStorage; the left
		recomputes from scratch. Within the same tab both benefit from the automatic in-memory cache, so
		"Remount both" is instant for both. Use "Clear localStorage &amp; remount" to reset the
		persisted entry and see the layout being computed again.
	</p>
</div>

<style>
	.cache-demo {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	@media (max-width: 600px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}

	.pane {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.pane-label {
		font-size: 0.8rem;
		font-weight: 600;
		text-align: center;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		background: #f3f4f6;
		color: #374151;
	}

	:global([data-theme='dark']) .pane-label {
		background: #1f2937;
		color: #d1d5db;
	}

	.pane-label--cached {
		background: #d1fae5;
		color: #065f46;
	}

	:global([data-theme='dark']) .pane-label--cached {
		background: #064e3b;
		color: #6ee7b7;
	}

	.cloud {
		height: 280px;
		border-radius: 8px;
		overflow: hidden;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	button {
		padding: 0.4rem 1rem;
		border-radius: 6px;
		border: 1px solid #d1d5db;
		background: #ffffff;
		color: #111827;
		font-size: 0.85rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	button:hover {
		background: #f9fafb;
	}

	:global([data-theme='dark']) button {
		background: #1f2937;
		border-color: #374151;
		color: #f9fafb;
	}

	:global([data-theme='dark']) button:hover {
		background: #374151;
	}

	.note {
		font-size: 0.85rem;
		color: #6b7280;
		margin: 0;
		line-height: 1.5;
	}

	:global([data-theme='dark']) .note {
		color: #9ca3af;
	}
</style>
