<script lang="ts">
	import { WordCloud, WordCloud3D } from '@shamokit/svelte-wordcloud';
	import { words, FONT_URL } from './demoWords.js';
</script>

<div class="demo-wrap not-content">
	<WordCloud data={words} --wc-background="#0d0d1a" --wc-color="#7ec8e3">
		<WordCloud3D fontUrl={FONT_URL} layout={{ fontSizeContrast: 1 }} />
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
