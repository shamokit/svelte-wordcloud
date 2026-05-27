<script lang="ts">
	import { WordCloud, WordCloudFlat } from '@shamokit/svelte-wordcloud';
	import { heavyWords, FONT_URL } from './demoWords.js';

	let cachedRef = $state<{ clearCache(): void } | null>(null);

	function reload() {
		window.location.reload();
	}

	function clearAndReload() {
		cachedRef?.clearCache();
		window.location.reload();
	}
</script>

<div class="not-content" style="display:flex;flex-direction:column;gap:1rem;">
	<div style="height:320px;border-radius:8px;overflow:hidden;">
		<WordCloud data={heavyWords}>
			<WordCloudFlat fontUrl={FONT_URL} useCache={true} bind:this={cachedRef} />
		</WordCloud>
	</div>

	<div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
		<button
			onclick={reload}
			style="padding:0.4rem 1rem;border-radius:6px;border:1px solid #d1d5db;background:#ffffff;color:#111827;font-size:0.85rem;cursor:pointer;"
		>
			Reload page
		</button>
		<button
			onclick={clearAndReload}
			style="padding:0.4rem 1rem;border-radius:6px;border:1px solid #d1d5db;background:#ffffff;color:#111827;font-size:0.85rem;cursor:pointer;"
		>
			Clear localStorage &amp; reload
		</button>
	</div>

	<p style="font-size:0.85rem;color:#6b7280;margin:0;line-height:1.5;">
		Wait for the cloud to finish rendering, then click <strong>Reload page</strong> — it appears
		instantly from localStorage. Click <strong>Clear localStorage &amp; reload</strong> to reset
		the persisted entry and observe the layout computation from scratch.
	</p>
</div>
