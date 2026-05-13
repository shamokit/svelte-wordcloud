<script lang="ts">
	import {
		WordCloud,
		WordCloud3D,
		WordCloudFlat,
		WordCloudLabel,
		WordCloudData,
		WordCloudAudio,
	} from '@shamokit/svelte-wordcloud';

	// Noto Sans JP: CJK + Latin をカバー。自己ホストする場合はこの URL を差し替えてください。
	const FONT_URL =
		'https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf';
	// ── Dataset: standard（現行・70語） ───────────────────────────────────────
	const standard = [
		{ word: '子育て支援', link: '#', counts: 980 },
		{ word: '道路整備', link: '#', counts: 920 },
		{ word: '医療充実', link: '#', counts: 860 },
		{ word: '公園整備', link: '#', counts: 800 },
		{ word: '教育環境', link: '#', counts: 750 },
		{ word: '高齢者福祉', link: '#', counts: 710 },
		{ word: 'ごみ収集', link: '#', counts: 670 },
		{ word: '防災対策', link: '#', counts: 640 },
		{ word: '商店街活性化', link: '#', counts: 600 },
		{ word: '図書館充実', link: '#', counts: 560 },
		{ word: '自転車レーン', link: '#', counts: 520 },
		{ word: 'バス路線', link: '#', counts: 490 },
		{ word: '公共施設', link: '#', counts: 460 },
		{ word: '緑化推進', link: '#', counts: 430 },
		{ word: 'スポーツ施設', link: '#', counts: 400 },
		{ word: '空き家対策', link: '#', counts: 370 },
		{ word: '騒音問題', link: '#', counts: 340 },
		{ word: '水道老朽化', link: '#', counts: 310 },
		{ word: '街灯整備', link: '#', counts: 290 },
		{ word: 'コミュニティ', link: '#', counts: 270 },
		{ word: '多文化共生', link: '#', counts: 250 },
		{ word: 'IT活用', link: '#', counts: 230 },
		{ word: '観光促進', link: '#', counts: 210 },
		{ word: '農業振興', link: '#', counts: 190 },
		{ word: '移住支援', link: '#', counts: 175 },
		{ word: '環境教育', link: '#', counts: 160 },
		{ word: '鳥獣被害', link: '#', counts: 145 },
		{ word: '空港アクセス', link: '#', counts: 130 },
		{ word: 'スタートアップ', link: '#', counts: 115 },
		{ word: '文化財保護', link: '#', counts: 100 },
		{ word: 'リモートワーク', link: '#', counts: 85 },
		{ word: '若者支援', link: '#', counts: 72 },
		{ word: '海岸清掃', link: '#', counts: 60 },
		{ word: '地産地消', link: '#', counts: 50 },
		{ word: 'ゼロカーボン', link: '#', counts: 40 },
		{ word: '保育所増設', link: '#', counts: 930 },
		{ word: '通学路安全', link: '#', counts: 880 },
		{ word: '病院アクセス', link: '#', counts: 820 },
		{ word: '広場整備', link: '#', counts: 770 },
		{ word: '給食の質向上', link: '#', counts: 730 },
		{ word: '介護サービス', link: '#', counts: 690 },
		{ word: '不法投棄対策', link: '#', counts: 655 },
		{ word: '避難訓練', link: '#', counts: 625 },
		{ word: '空き店舗活用', link: '#', counts: 585 },
		{ word: '読み聞かせ', link: '#', counts: 545 },
		{ word: 'サイクリング', link: '#', counts: 510 },
		{ word: 'コミュニティバス', link: '#', counts: 480 },
		{ word: '多目的ホール', link: '#', counts: 450 },
		{ word: '花壇管理', link: '#', counts: 420 },
		{ word: 'プール施設', link: '#', counts: 390 },
		{ word: '老朽建物', link: '#', counts: 355 },
		{ word: '深夜騒音', link: '#', counts: 330 },
		{ word: '下水道整備', link: '#', counts: 300 },
		{ word: '防犯カメラ', link: '#', counts: 280 },
		{ word: '町内会支援', link: '#', counts: 260 },
		{ word: '外国人支援', link: '#', counts: 240 },
		{ word: 'デジタル化', link: '#', counts: 220 },
		{ word: '祭り支援', link: '#', counts: 200 },
		{ word: '六次産業化', link: '#', counts: 185 },
		{ word: 'Uターン促進', link: '#', counts: 170 },
		{ word: 'エコ教育', link: '#', counts: 155 },
		{ word: '猪対策', link: '#', counts: 140 },
		{ word: '鉄道利便性', link: '#', counts: 125 },
		{ word: '創業支援', link: '#', counts: 110 },
		{ word: '伝統工芸', link: '#', counts: 95 },
		{ word: 'テレワーク', link: '#', counts: 80 },
		{ word: '奨学金制度', link: '#', counts: 68 },
		{ word: 'ビーチ清掃', link: '#', counts: 55 },
		{ word: '直売所', link: '#', counts: 46 },
		{ word: 'カーボンオフセット', link: '#', counts: 35 },
		{ word: '歩道拡張', link: '#', counts: 28 },
	];

	// ── Dataset: sparse（少量・12語） ──────────────────────────────────────────
	const sparse = [
		{ word: '子育て支援', link: '#', counts: 980 },
		{ word: '道路整備', link: '#', counts: 760 },
		{ word: '医療充実', link: '#', counts: 580 },
		{ word: '防災対策', link: '#', counts: 420 },
		{ word: '公園整備', link: '#', counts: 310 },
		{ word: '高齢者福祉', link: '#', counts: 220 },
		{ word: 'IT活用', link: '#', counts: 150 },
		{ word: '移住支援', link: '#', counts: 95 },
		{ word: 'ゼロカーボン', link: '#', counts: 60 },
		{ word: '伝統工芸', link: '#', counts: 35 },
		{ word: '直売所', link: '#', counts: 18 },
		{ word: '歩道拡張', link: '#', counts: 8 },
	];

	// ── Dataset: dense（大量・120語） ─────────────────────────────────────────
	const dense = [
		...standard,
		{ word: '待機児童解消', link: '#', counts: 945 },
		{ word: '学童保育', link: '#', counts: 895 },
		{ word: '産後ケア', link: '#', counts: 840 },
		{ word: '子ども食堂', link: '#', counts: 790 },
		{ word: '学力向上', link: '#', counts: 745 },
		{ word: '特別支援教育', link: '#', counts: 700 },
		{ word: '高齢者見守り', link: '#', counts: 660 },
		{ word: 'バリアフリー', link: '#', counts: 620 },
		{ word: '認知症対策', link: '#', counts: 590 },
		{ word: '在宅医療', link: '#', counts: 550 },
		{ word: '健康診断', link: '#', counts: 515 },
		{ word: '公共交通', link: '#', counts: 482 },
		{ word: '自転車道整備', link: '#', counts: 448 },
		{ word: '歩行者空間', link: '#', counts: 415 },
		{ word: '除雪対策', link: '#', counts: 382 },
		{ word: '河川整備', link: '#', counts: 348 },
		{ word: '雨水対策', link: '#', counts: 315 },
		{ word: '公園遊具', link: '#', counts: 283 },
		{ word: 'ドッグラン', link: '#', counts: 258 },
		{ word: '野外ステージ', link: '#', counts: 232 },
		{ word: 'ナイトマルシェ', link: '#', counts: 208 },
		{ word: '移動販売', link: '#', counts: 187 },
		{ word: '有機農業', link: '#', counts: 165 },
		{ word: '里山保全', link: '#', counts: 148 },
		{ word: '森林整備', link: '#', counts: 132 },
		{ word: 'SDGs推進', link: '#', counts: 118 },
		{ word: '太陽光発電', link: '#', counts: 103 },
		{ word: '省エネ住宅', link: '#', counts: 89 },
		{ word: 'EV充電', link: '#', counts: 75 },
		{ word: 'シェアサイクル', link: '#', counts: 62 },
		{ word: 'カーシェア', link: '#', counts: 50 },
		{ word: 'スマートシティ', link: '#', counts: 42 },
		{ word: 'オープンデータ', link: '#', counts: 33 },
		{ word: 'AIサービス', link: '#', counts: 26 },
		{ word: 'SNS広報', link: '#', counts: 19 },
		{ word: 'ライブ配信', link: '#', counts: 13 },
		{ word: 'VR体験', link: '#', counts: 9 },
		{ word: 'パーク整備', link: '#', counts: 472 },
		{ word: '夜間照明', link: '#', counts: 362 },
		{ word: '屋根付き通路', link: '#', counts: 295 },
		{ word: '公衆トイレ', link: '#', counts: 265 },
		{ word: '多言語対応', link: '#', counts: 242 },
		{ word: '子育て広場', link: '#', counts: 222 },
		{ word: '学習支援', link: '#', counts: 199 },
		{ word: '地域ブランド', link: '#', counts: 178 },
		{ word: '空き地活用', link: '#', counts: 157 },
		{ word: '市民農園', link: '#', counts: 138 },
		{ word: '育児休暇', link: '#', counts: 122 },
		{ word: '健康増進', link: '#', counts: 108 },
		{ word: '夜間診療', link: '#', counts: 96 },
		{ word: '救急体制', link: '#', counts: 85 },
	];

	// ── Dataset: medium（中量・35語） ─────────────────────────────────────────
	const medium = standard.slice(0, 35);

	// ── Dataset: longTop（長文トップ語・トップが9文字） ──────────────────────
	const longTop = [
		{ word: '地域医療体制整備', link: '#', counts: 980 }, // 8文字
		{ word: '少子化対策推進事業', link: '#', counts: 940 }, // 9文字
		{ word: '子育て支援センター', link: '#', counts: 900 }, // 9文字
		{ word: '市街地活性化計画', link: '#', counts: 855 }, // 8文字
		{ word: '高齢者在宅福祉', link: '#', counts: 810 }, // 7文字
		{ word: '防災まちづくり', link: '#', counts: 765 }, // 7文字
		{ word: '道路バリアフリー', link: '#', counts: 720 }, // 8文字
		{ word: '環境共生住宅', link: '#', counts: 675 }, // 6文字
		{ word: '地域コミュニティ', link: '#', counts: 630 }, // 8文字
		{ word: '観光資源活用', link: '#', counts: 585 }, // 6文字
		{ word: '子育て支援', link: '#', counts: 540 },
		{ word: '道路整備', link: '#', counts: 495 },
		{ word: '医療充実', link: '#', counts: 450 },
		{ word: '防災対策', link: '#', counts: 410 },
		{ word: '公園整備', link: '#', counts: 370 },
		{ word: '高齢者福祉', link: '#', counts: 335 },
		{ word: '教育環境', link: '#', counts: 300 },
		{ word: 'IT活用', link: '#', counts: 265 },
		{ word: '移住支援', link: '#', counts: 235 },
		{ word: '農業振興', link: '#', counts: 205 },
		{ word: '緑化推進', link: '#', counts: 178 },
		{ word: '空き家対策', link: '#', counts: 152 },
		{ word: '多文化共生', link: '#', counts: 128 },
		{ word: '観光促進', link: '#', counts: 108 },
		{ word: '創業支援', link: '#', counts: 90 },
		{ word: '伝統工芸', link: '#', counts: 74 },
		{ word: 'テレワーク', link: '#', counts: 60 },
		{ word: '鳥獣被害', link: '#', counts: 48 },
		{ word: '直売所', link: '#', counts: 36 },
		{ word: '歩道拡張', link: '#', counts: 24 },
	];

	// ── Dataset: shortTop（短文トップ語・トップが2文字以下） ─────────────────
	const shortTop = [
		{ word: '道', link: '#', counts: 980 }, // 1文字
		{ word: '緑', link: '#', counts: 940 }, // 1文字
		{ word: '安全', link: '#', counts: 895 }, // 2文字
		{ word: '医療', link: '#', counts: 845 }, // 2文字
		{ word: '学び', link: '#', counts: 800 }, // 2文字
		{ word: '福祉', link: '#', counts: 755 }, // 2文字
		{ word: '環境', link: '#', counts: 710 }, // 2文字
		{ word: '防災', link: '#', counts: 665 }, // 2文字
		{ word: '交通', link: '#', counts: 620 }, // 2文字
		{ word: '観光', link: '#', counts: 575 },
		{ word: '子育て支援', link: '#', counts: 530 },
		{ word: '道路整備', link: '#', counts: 490 },
		{ word: '医療充実', link: '#', counts: 450 },
		{ word: '高齢者福祉', link: '#', counts: 415 },
		{ word: '防災対策', link: '#', counts: 380 },
		{ word: '公園整備', link: '#', counts: 345 },
		{ word: '教育環境', link: '#', counts: 310 },
		{ word: 'IT活用', link: '#', counts: 278 },
		{ word: '商店街活性化', link: '#', counts: 248 },
		{ word: '移住支援', link: '#', counts: 220 },
		{ word: '農業振興', link: '#', counts: 195 },
		{ word: '自転車レーン', link: '#', counts: 172 },
		{ word: 'コミュニティ', link: '#', counts: 150 },
		{ word: '空き家対策', link: '#', counts: 130 },
		{ word: '多文化共生', link: '#', counts: 112 },
		{ word: 'スタートアップ', link: '#', counts: 95 },
		{ word: '文化財保護', link: '#', counts: 80 },
		{ word: '創業支援', link: '#', counts: 65 },
		{ word: '鳥獣被害', link: '#', counts: 52 },
		{ word: '伝統工芸', link: '#', counts: 40 },
		{ word: '直売所', link: '#', counts: 30 },
		{ word: '歩道拡張', link: '#', counts: 20 },
	];

	// 各ワードに日本語 Wikipedia リンクを付与する
	const wiki = <T extends { word: string }>(items: T[]) =>
		items.map((d) => ({
			...d,
			link: `https://ja.wikipedia.org/wiki/${encodeURIComponent(d.word)}`,
		}));

	const datasets = [
		{ key: 'standard', label: 'standard（70語）', data: wiki(standard) },
		{ key: 'sparse', label: 'sparse（12語）', data: wiki(sparse) },
		{ key: 'dense', label: 'dense（120語）', data: wiki(dense) },
		{ key: 'medium', label: 'medium（35語）', data: wiki(medium) },
		{ key: 'longTop', label: 'longTop（9文字トップ）', data: wiki(longTop) },
		{ key: 'shortTop', label: 'shortTop（1文字トップ）', data: wiki(shortTop) },
	];
</script>

<div data-wc-grid>
	{#each datasets as ds (ds.key)}
		<div data-wc-panel>
			<p data-wc-label>{ds.label}</p>
			<div data-wc-cloud>
				<WordCloud data={ds.data} --wc-background="#0d0d1f">
					<WordCloudLabel>
						{#snippet label({ props })}
							<p {...props} data-wc-visually-hidden>{ds.label}</p>
						{/snippet}
					</WordCloudLabel>
					<WordCloudData>
						{#snippet children({ data })}
							<ul data-wc-visually-hidden>
								{#each data as item (item.word)}
									<li><a href={item.link}>{item.word}（{item.counts}件）</a></li>
								{/each}
							</ul>
						{/snippet}
					</WordCloudData>
					<WordCloud3D layerSpacing={12} fontUrl={FONT_URL} depthValueText={(c, t) => `レイヤー ${c} / ${t}`} />
					<div data-wc-audio-row>
						<WordCloudAudio lang="ja-JP" />
					</div>
				</WordCloud>
			</div>
		</div>
	{/each}

	<!-- Flat layout demo (single-layer, zoom + pan) -->
	<div data-wc-panel>
		<p data-wc-label>flat（全単語・1レイヤー）</p>
		<div data-wc-cloud>
			<WordCloud data={wiki(standard)} --wc-background="#0d0d1f">
				<WordCloudLabel>
					{#snippet label({ props })}
						<p {...props} data-wc-visually-hidden>flat ワードクラウド</p>
					{/snippet}
				</WordCloudLabel>
				<WordCloudData>
					{#snippet children({ data })}
						<ul data-wc-visually-hidden>
							{#each data as item (item.word)}
								<li><a href={item.link}>{item.word}（{item.counts}件）</a></li>
							{/each}
						</ul>
					{/snippet}
				</WordCloudData>
				<WordCloudFlat fontUrl={FONT_URL} zoomValueText={(z) => `ズーム ${z.toFixed(1)}x`} />
				<div data-wc-audio-row>
					<WordCloudAudio lang="ja-JP" />
				</div>
			</WordCloud>
		</div>
	</div>
</div>

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	:where([data-wc-grid]) {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: repeat(2, 1fr);
		width: 100vw;
		height: 100vh;
		gap: 2px;
		background: #111122;
	}

	:where([data-wc-panel]) {
		display: flex;
		flex-direction: column;
		background: #0d0d1f;
		overflow: hidden;
	}

	:where([data-wc-label]) {
		margin: 0;
		padding: 4px 10px;
		font-family: monospace;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
		background: rgba(255, 255, 255, 0.04);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		white-space: nowrap;
	}

	:where([data-wc-cloud]) {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	:where([data-wc-audio-row]) {
		padding: 4px 8px;
		color: rgba(255, 255, 255, 0.7);
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	:where([data-wc-visually-hidden]) {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
</style>
