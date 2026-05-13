<script lang="ts">
	import { WordCloud, WordCloudFlat } from '@shamokit/svelte-wordcloud';
	import { words, FONT_URL } from './demoWords.js';
</script>

<div class="demo-wrap not-content">
	<WordCloud data={words}>
		<WordCloudFlat fontUrl={FONT_URL} />
	</WordCloud>
</div>

<style>
	.demo-wrap {
		width: 100%;
		height: 380px;
		border-radius: 8px;
		overflow: hidden;
	}
</style>
