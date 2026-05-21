<script lang="ts">
	import { WordCloud, WordCloud3D } from '@shamokit/svelte-wordcloud';
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
	<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
		<div style="display:flex;flex-direction:column;gap:0.5rem;">
			<div style="font-size:0.8rem;font-weight:600;text-align:center;padding:0.25rem 0.5rem;border-radius:4px;background:#f3f4f6;color:#374151;">
				No cache (default)
			</div>
			<div style="height:280px;border-radius:8px;overflow:hidden;">
				<WordCloud data={heavyWords} --wc-background="#0d0d1a" --wc-color="#7ec8e3">
					<WordCloud3D fontUrl={FONT_URL} layout={{ fontSizeContrast: 1 }} />
				</WordCloud>
			</div>
		</div>
		<div style="display:flex;flex-direction:column;gap:0.5rem;">
			<div style="font-size:0.8rem;font-weight:600;text-align:center;padding:0.25rem 0.5rem;border-radius:4px;background:#d1fae5;color:#065f46;">
				<code>useCache={true}</code>
			</div>
			<div style="height:280px;border-radius:8px;overflow:hidden;">
				<WordCloud data={heavyWords} --wc-background="#0d0d1a" --wc-color="#7ec8e3">
					<WordCloud3D
						fontUrl={FONT_URL}
						layout={{ fontSizeContrast: 1 }}
						useCache={true}
						bind:this={cachedRef}
					/>
				</WordCloud>
			</div>
		</div>
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
		Wait for both clouds to finish rendering, then click <strong>Reload page</strong> — the right
		cloud appears instantly from localStorage while the left recomputes from scratch. Click
		<strong>Clear localStorage &amp; reload</strong> to reset the persisted entry so you can observe
		the difference again.
	</p>
</div>
