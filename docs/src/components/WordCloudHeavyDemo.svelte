<script lang="ts">
	import { WordCloud, WordCloud3D } from '@shamokit/svelte-wordcloud';
	import { heavyWords, FONT_URL } from './demoWords.js';
</script>

<div class="demo-wrap not-content">
	<WordCloud data={heavyWords} --wc-background="#0a0a14" --wc-color="#a8d8ea">
		<WordCloud3D fontUrl={FONT_URL} layout={{ fontSizeContrast: 1.2 }} />
	</WordCloud>
</div>

<style>
	.demo-wrap {
		width: 100%;
		height: 480px;
		border-radius: 8px;
		overflow: hidden;
	}
</style>
