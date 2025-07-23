# RDF4J GeoSPARQL 汎用地理空間クエリガイド

## 汎用的なクエリファイル

### 1. 標準版（GeoSPARQL関数使用）
```bash
npm run sparql -- --file ./sample-sparql/bbox-query-fixed.sparql --endpoint http://localhost:8080/rdf4j-server --repository test
```

**修正点:**
- `geof:` プレフィックス追加
- `geo:sfIntersects` → `geof:sfIntersects`
- WKTリテラルにCRS指定追加: `<http://www.opengis.net/def/crs/OGC/1.3/CRS84>`

### 2. パフォーマンス最適化版
```bash
npm run sparql -- --file ./sample-sparql/bbox-query-optimized.sparql --endpoint http://localhost:8080/rdf4j-server --repository test
```

**特徴:**
- 2025年データのみ使用
- 直接土地利用プロパティ
- 空のメッシュを事前除外

### 3. 汎用版（複数のGeoSPARQL関数対応）
```bash
npm run sparql -- --file ./sample-sparql/bbox-query-fallback.sparql --endpoint http://localhost:8080/rdf4j-server --repository test
```

**特徴:**
- 標準的なRDF4J GeoSPARQL関数を使用
- 任意のBBOX座標に対応
- 複数の空間関数をサポート

### 4. 地理空間クエリテンプレート集
```bash
npm run sparql -- --file ./sample-sparql/geospatial-query-templates.sparql --endpoint http://localhost:8080/rdf4j-server --repository test
```

**用途:**
- 様々な空間フィルタパターン
- テンプレートとして再利用可能
- 距離ベース、境界判定など

## トラブルシューティング

### エラー1: "Unknown function: geo:sfIntersects"
**原因:** 古い構文を使用
**解決:** `geof:sfIntersects` を使用

### エラー2: "Invalid WKT Literal"
**原因:** CRS指定なし
**解決:** `<http://www.opengis.net/def/crs/OGC/1.3/CRS84>` を追加

### エラー3: "GeoSPARQL extension not available"
**原因:** RDF4JのGeoSPARQL機能が無効
**解決:** フォールバック版クエリを使用

## サポートされるGeoSPARQL関数

### Simple Feature関数
- `geof:sfIntersects` - 交差判定（推奨）
- `geof:sfWithin` - 包含判定
- `geof:sfOverlaps` - 重複判定
- `geof:sfTouches` - 境界接触判定
- `geof:sfContains` - 内包判定
- `geof:sfCrosses` - 交差判定

### 非位相的関数
- `geof:distance` - 距離計算
- `geof:buffer` - バッファ生成
- `geof:envelope` - 外接矩形取得

## パフォーマンス比較

| クエリ版 | 実行時間 | 汎用性 | RDF4J要件 |
|---------|----------|--------|-----------|
| 標準版 | 中程度 | 高 | GeoSPARQL必須 |
| 最適化版 | 高速 | 高 | GeoSPARQL必須 |
| 汎用版 | 高速 | 最高 | GeoSPARQL必須 |
| テンプレート集 | 可変 | 最高 | GeoSPARQL必須 |

## 推奨使用順序

1. **汎用版**を試す（最高の汎用性）
2. **最適化版**でパフォーマンス重視
3. **テンプレート集**で特定用途に特化
4. **標準版**で基本的な動作確認

## 石川県BBOX座標

```
経度: 136.0 - 137.4
緯度: 36.1 - 37.6

WKT形式:
POLYGON((136.0 36.1, 137.4 36.1, 137.4 37.6, 136.0 37.6, 136.0 36.1))
```