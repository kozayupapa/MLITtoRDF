# geo:asWKT 標準構造への移行ガイド

## 変更概要

### 旧構造（非標準）
```turtle
?geometry geo:wktLiteral "POLYGON(...)"^^geo:wktLiteral .
```

### 新構造（RDF4J/GeoSPARQL標準）
```turtle
?geometry geo:asWKT "POLYGON(...)"^^geo:wktLiteral .
```

## 実装された変更

### 1. geo-transformer.ts
```typescript
// 修正前
`${RDF_PREFIXES.geo}wktLiteral`,

// 修正後
`${RDF_PREFIXES.geo}asWKT`,
```

### 2. 全SPARQLクエリファイル
```sparql
# 修正前
?geometry geo:wktLiteral ?wkt .

# 修正後  
?geometry geo:asWKT ?wkt .
```

## データ再投入手順

### 1. 既存データのクリア
```bash
# RDF4Jリポジトリをクリア（必要に応じて）
# RDF4J Workbenchで既存データを削除
```

### 2. 新しいデータの投入
```bash
# 修正されたgeo-transformerでデータを再投入
npm run build
npm run dev -- --filePaths ./data/your-data.geojson \
               --rdf4jEndpoint http://localhost:8080/rdf4j-server \
               --repositoryId test
```

### 3. データ構造の検証
```bash
# 新しい構造が正しく作成されているか確認
npm run sparql -- --file ./sample-sparql/test-geo-asWKT.sparql \
                   --endpoint http://localhost:8080/rdf4j-server \
                   --repository test
```

### 4. GeoSPARQL関数の動作確認
```bash
# 空間クエリが正常に動作するか確認
npm run sparql -- --file ./sample-sparql/test-geosparql-functions.sparql \
                   --endpoint http://localhost:8080/rdf4j-server \
                   --repository test
```

### 5. BBOX クエリの実行
```bash
# 石川県BBOXクエリの動作確認
npm run sparql -- --file ./sample-sparql/bbox-query-optimized.sparql \
                   --endpoint http://localhost:8080/rdf4j-server \
                   --repository test
```

## 期待される改善点

### 1. GeoSPARQL関数の正常動作
- `geof:sfIntersects` が正しく動作
- `geof:sfWithin` などの他の関数も利用可能
- 空のクエリ結果問題が解決

### 2. 標準準拠
- RDF4J GeoSPARQL仕様に完全準拠
- 他のGeoSPARQLツールとの互換性向上
- 将来的な拡張性確保

### 3. パフォーマンス向上
- RDF4Jの空間インデックスが正しく動作
- クエリ最適化が効果的に適用
- 大規模データでの安定した性能

## トラブルシューティング

### エラー1: "No results found"
**原因:** データが古い構造（geo:wktLiteral）のまま
**解決:** データを再投入

### エラー2: "Unknown property: geo:asWKT"
**原因:** RDF4JのGeoSPARQL機能が無効
**解決:** RDF4Jの設定確認、GeoSPARQL拡張の有効化

### エラー3: "Invalid WKT format"
**原因:** WKTデータの形式問題
**解決:** geo-transformerの座標変換ロジック確認

## 検証用クエリ

### データ構造確認
```sparql
SELECT ?geometry ?wkt (DATATYPE(?wkt) AS ?type)
WHERE {
  ?mesh geo:hasGeometry ?geometry .
  ?geometry geo:asWKT ?wkt .
}
LIMIT 5
```

### 空間関数動作確認
```sparql
SELECT ?mesh ?result
WHERE {
  ?mesh geo:hasGeometry ?geometry .
  ?geometry geo:asWKT ?wkt .
  BIND(geof:sfIntersects(?wkt, "POLYGON((136 36, 137 36, 137 37, 136 37, 136 36))"^^geo:wktLiteral) AS ?result)
}
LIMIT 5
```

## 利点

1. **標準準拠**: RDF4J/GeoSPARQL仕様に完全準拠
2. **互換性**: 他のGeoSPARQLツールとの互換性
3. **パフォーマンス**: 最適化されたクエリ実行
4. **拡張性**: 将来的な機能拡張が容易
5. **保守性**: 標準的な構造で保守が容易

この移行により、geo:wktLiteralプロパティでの空間クエリ問題が根本的に解決されます。