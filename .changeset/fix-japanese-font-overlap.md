---
"@shamokit/svelte-wordcloud": patch
---

fix: prevent word overlap when using large CJK fonts like NotoSansJP

When a custom font is passed (e.g. `fontUrl="/font/NotoSansJP.ttf"`), the troika
worker must download and parse the font file before it can measure character widths.
For large CJK fonts such as NotoSansJP (9 MB), this can take several seconds on a
first visit — longer than the 150 ms layout debounce.

Previously the layout ran immediately with empty `wordWidths`, falling back to
`CHAR_W_FALLBACK = 0.6 em` per character. Japanese characters are ~0.97 em wide, so
every bounding box was ~38 % too narrow. The layout algorithm still placed words
without collision, but the rendered glyphs were wider than the boxes, causing visible
overlap until the re-layout with correct metrics completed.

**Fix**: `WordCloud3D` and `WordCloudFlat` now wait for font metrics before starting
the layout pass. While waiting, the loading spinner is shown instead of a blank or
overlapping canvas. Once metrics arrive the layout runs once with correct widths and
produces a clean result.

Additional improvements in font metrics measurement:
- **CJK `charH` estimation**: when a font does not report `capHeight` or `ascender`
  (common for CJK fonts), `charH` is now derived from `visibleBounds` as
  `halfH × 2 ≈ 0.905` instead of staying at the 0.65 default. This improves font-size
  scaling for Japanese/Chinese/Korean wordclouds.
- **`caretPositions` stride fix**: troika uses stride 4 (`[startX, endX, bottomY, topY]`
  per character), not 3. The fallback width index has been corrected accordingly.
