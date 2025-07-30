# 洪水ハザードデータRDF変換・保存機能

## 概要

このツールが拡張され、災害洪水浸水想定区域データ（河川単位）のGeoJSONファイルをRDFとして保存・クエリできるようになりました。

## サポートされるデータ形式

### 災害洪水浸水想定区域データの種類

1. **10_計画規模**: 計画規模の浸水深データ
2. **20_想定最大規模**: 想定最大規模の浸水深データ
3. **30_浸水継続時間**: 浸水継続時間データ
4. **41_家屋倒壊等氾濫想定区域_氾濫流**: 氾濫流による危険区域
5. **42_家屋倒壊等氾濫想定区域_河岸侵食**: 河岸侵食による危険区域

### GeoJSONプロパティ構造

各GeoJSONフィーチャには以下のプロパティが含まれます：

```json
{
  "properties": {
    "A31a_101": "1700010001",    // 河川ID
    "A31a_102": "大聖寺川",        // 河川名
    "A31a_103": "17",            // 都道府県コード
    "A31a_104": "石川県",         // 都道府県名
    "A31a_105": 1                // ランクコード（1-6 or 1-7 or 1-3）
  }
}
```

## ランクコード定義

### 浸水深ランクコード (1-6)

| コード | 内容 |
|--------|------|
| 1 | 0m以上0.5m未満 |
| 2 | 0.5m以上3.0m未満 |
| 3 | 3.0m以上5.0m未満 |
| 4 | 5.0m以上10.0m未満 |
| 5 | 10.0m以上20.0m未満 |
| 6 | 20.0m以上 |

### 浸水継続時間ランクコード (1-7)

| コード | 内容 |
|--------|------|
| 1 | 12時間未満 |
| 2 | 12時間以上24時間未満（1日間） |
| 3 | 24時間以上72時間未満（3日間） |
| 4 | 72時間以上168時間未満（1週間） |
| 5 | 168時間以上336時間未満（2週間） |
| 6 | 336時間以上672時間未満（4週間） |
| 7 | 672時間以上（4週間以上） |

### 危険区域区分コード (1-3)

| コード | 内容 |
|--------|------|
| 1 | 氾濫流 |
| 2 | 河岸浸食 |
| 3 | どちらも該当 |

## 使用方法

### 1. データの変換・保存

```bash
# 洪水ハザードデータを処理する例
npm run cli -- \
  --filePaths "data/A31a-24_17_10_GEOJSON/10_計画規模/*.geojson" \
  --rdf4jEndpoint "http://localhost:8080/rdf4j-server" \
  --repositoryId "flood-hazard" \
  --dataType "auto" \
  --baseUri "http://example.org/flood-hazard/"
```

### 2. 自動データ型判定

ツールは以下のディレクトリ名/ファイルパスを基に自動的にハザードタイプを判定します：

- `10_計画規模` → `planned_scale_depth`
- `20_想定最大規模` → `maximum_assumed_depth`
- `30_浸水継続時間` → `flood_duration`
- `41_家屋倒壊等氾濫想定区域_氾濫流` → `overflow_collapse_zone`
- `42_家屋倒壊等氾濫想定区域_河岸侵食` → `erosion_collapse_zone`

## RDFオントロジー

### 新しいクラス

- `mlit:FloodHazardZone` - 洪水ハザードゾーン
- `mlit:FloodDepthRank` - 浸水深ランク
- `mlit:FloodDurationRank` - 浸水継続時間ランク
- `mlit:HazardZoneType` - 危険区域タイプ

### 新しいプロパティ

- `mlit:hasFloodHazardData` - 洪水ハザードデータの有無
- `mlit:floodDepthRank` - 浸水深ランク
- `mlit:floodDurationRank` - 浸水継続時間ランク
- `mlit:hazardZoneType` - 危険区域タイプ
- `mlit:riverId` - 河川ID
- `mlit:riverName` - 河川名
- `mlit:prefectureName` - 都道府県名

## SPARQLクエリ例

詳細なクエリ例は `sample-sparql/flood-hazard-queries.sparql` を参照してください。

### 基本的な検索

```sparql
# 浸水深が深い（ランク4以上）エリアの検索
SELECT ?hazardZone ?riverName ?depthRank ?geometry
WHERE {
    ?hazardZone rdf:type mlit:FloodHazardZone ;
                mlit:floodDepthRank ?depthRank ;
                mlit:riverName ?riverName ;
                geo:hasGeometry ?geom .
    ?geom geo:asWKT ?geometry .
    
    FILTER(?depthRank >= 4)
}
```

### 複合条件検索

```sparql
# 石川県の氾濫流危険区域
SELECT ?hazardZone ?riverName ?geometry
WHERE {
    ?hazardZone rdf:type mlit:FloodHazardZone ;
                mlit:prefectureName "石川県" ;
                mlit:hazardZoneType "overflow" ;
                mlit:riverName ?riverName ;
                geo:hasGeometry ?geom .
    ?geom geo:asWKT ?geometry .
}
```

## 生成されるRDFの例

```turtle
@prefix mlit: <http://example.org/mlit/ontology#> .
@prefix geo: <http://www.opengis.net/ont/geosparql#> .

<http://example.org/flood-hazard/floodhazard/1700010001_planned_scale_depth> 
    a geo:Feature, mlit:FloodHazardZone ;
    mlit:riverId "1700010001" ;
    mlit:riverName "大聖寺川" ;
    mlit:prefectureName "石川県" ;
    mlit:floodDepthRank 1 ;
    mlit:floodDepthRank_description "0m以上0.5m未満" ;
    mlit:floodDepthRank_min 0.0 ;
    mlit:floodDepthRank_max 0.5 ;
    geo:hasGeometry <...geometry_uri> .
```

## 注意事項

1. **大量データ処理**: 洪水ハザードデータは非常に大きなファイルサイズになる可能性があります。バッチサイズを適切に設定してください。

2. **座標系変換**: データはJGD2011からWGS84に自動変換されます。

3. **メモリ使用量**: 大きなポリゴンデータを処理する際は、`--maxFeatures` オプションでテスト処理を行うことを推奨します。

4. **ファイルパス**: ハザードタイプの自動判定はファイルパスに依存するため、ディレクトリ構造を維持してください。

## トラブルシューティング

### よくある問題

1. **メモリ不足**: `--batchSize` を小さくしてください（例：500-1000）
2. **変換エラー**: サンプルファイルで `--dryRun` オプションを使ってテストしてください
3. **ハザードタイプが正しく判定されない**: ファイルパスにディレクトリ名が含まれているか確認してください