# RDF4J GeoSPARQL トラブルシューティングガイド

## 問題: geo:wktLiteral プロパティでの空間クエリが空の結果を返す

### 原因
- **データ格納**: `geo:wktLiteral` プロパティで格納
- **標準仕様**: `geo:asWKT` プロパティに `geo:wktLiteral` データタイプ
- **互換性問題**: RDF4Jの空間関数が期待する形式と不一致

### 解決手順

#### 1. データ構造を確認
```bash
npm run sparql -- --file ./sample-sparql/debug-wkt-data.sparql --endpoint http://localhost:8080/rdf4j-server --repository test
```

**確認項目:**
- WKTの実際の内容
- データタイプ
- CRS情報の有無
- 座標の順序（経度,緯度 or 緯度,経度）

#### 2. 修正版クエリを試行
```bash
npm run sparql -- --file ./sample-sparql/bbox-query-corrected.sparql --endpoint http://localhost:8080/rdf4j-server --repository test
```

**修正点:**
- CRS指定を削除
- シンプルなWKTリテラル使用
- データ構造に適合

#### 3. 代替手法を順次試行
```bash
npm run sparql -- --file ./sample-sparql/bbox-query-alternatives.sparql --endpoint http://localhost:8080/rdf4j-server --repository test
```

**試行順序:**
1. CRS指定なしの標準WKT
2. 文字列ベースの座標範囲チェック
3. geometryオブジェクト直接使用
4. sfWithin（完全包含）での試行

## 各手法の特徴

### 手法1: CRS指定なし
```sparql
FILTER(geof:sfIntersects(?wkt, "POLYGON((136.0 36.1, 137.4 36.1, 137.4 37.6, 136.0 37.6, 136.0 36.1))"^^geo:wktLiteral))
```
- **利点**: シンプル、標準的
- **制限**: CRS情報が必要な場合は使用不可

### 手法2: 文字列ベース範囲チェック
```sparql
FILTER(REGEX(STR(?wkt), "POLYGON\\(\\([^)]*136\\.[0-9][^)]*36\\.[0-9]"))
```
- **利点**: 確実に動作
- **制限**: 近似的、精度が低い

### 手法3: Geometry オブジェクト使用
```sparql
FILTER(geof:sfIntersects(?geometry, "POLYGON(...)"^^geo:wktLiteral))
```
- **利点**: 仕様に準拠
- **制限**: RDF4J実装依存

### 手法4: sfWithin 使用
```sparql
FILTER(geof:sfWithin(?wkt, "POLYGON(...)"^^geo:wktLiteral))
```
- **利点**: 完全包含で確実
- **制限**: 境界上のデータを除外

## データ修正（根本解決）

将来的には、データ格納時に標準仕様に準拠することを推奨：

### 現在の格納方式
```turtle
?geometry geo:wktLiteral "POLYGON(...)"^^geo:wktLiteral .
```

### 推奨される格納方式
```turtle
?geometry geo:asWKT "POLYGON(...)"^^geo:wktLiteral .
```

### geo-transformer.ts の修正例
```typescript
// 修正前
triples.push(
  this.createTriple(
    geometryIRI,
    `${RDF_PREFIXES.geo}wktLiteral`,
    this.createWKTLiteral(wktGeometry)
  )
);

// 修正後
triples.push(
  this.createTriple(
    geometryIRI,
    `${RDF_PREFIXES.geo}asWKT`,
    this.createWKTLiteral(wktGeometry)
  )
);
```

## パフォーマンス最適化

### 推奨クエリ順序
1. **修正版クエリ** - 現在のデータ構造に最適化
2. **代替手法1** - CRS指定なし
3. **代替手法4** - sfWithin使用
4. **代替手法2** - 文字列ベース（最終手段）

### インデックス活用
RDF4Jで空間インデックスが有効な場合：
- 空間関数を最初のFILTERに配置
- 他の条件は後続のFILTERに配置
- LIMITを適切に設定

## 検証方法

### 結果確認
```sparql
SELECT (COUNT(*) AS ?count) WHERE {
  # 対象クエリの WHERE句をここに貼り付け
}
```

### 座標範囲確認
```sparql
SELECT ?meshId (MIN(?lon) AS ?minLon) (MAX(?lon) AS ?maxLon) 
       (MIN(?lat) AS ?minLat) (MAX(?lat) AS ?maxLat)
WHERE {
  # WKTから座標を抽出（実装依存）
}
```

これらの手法を順次試行することで、geo:wktLiteral プロパティでの空間クエリ問題を解決できます。