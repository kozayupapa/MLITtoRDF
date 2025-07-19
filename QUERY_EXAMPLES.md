# GeoSPARQL Query Tool - 使用例とサンプル

## 概要

TypeScriptで実装されたGeoSPARQLクエリツールを使用して、RDF4Jに保存された石川県の人口メッシュデータを分析できます。

## インストールと設定

```bash
# 依存関係のインストール
npm install

# TypeScriptのコンパイル
npm run build
```

## 基本的な使用方法

### 利用可能なクエリの確認

```bash
npm run query -- list
```

### 基本実行形式

```bash
npm run query -- run --queryName <クエリ名> [オプション]
```

## クエリサンプル

### 1. ダッシュボード統計

```bash
# 基本統計情報の取得
npm run query -- run --queryName dashboard

# 人口50人以上のメッシュのみ対象
npm run query -- run --queryName dashboard --minPopulation 50
```

**出力例:**
```
totalMeshes | totalPop2020       | totalPop2025       | avgElderlyRatio     | maxPopDensity | minPopDensity
------------+--------------------+--------------------+---------------------+---------------+--------------
2258        | 1132526.0009000022 | 1092256.9994000017 | 0.46541058458813134 | 8117.0436     | 0.9859
```

### 2. 人口密度ランキング

```bash
# 上位10位の人口密度エリア
npm run query -- run --queryName ranking --limit 10

# 2030年予測での変化率込み
npm run query -- run --queryName ranking --year 2030 --limit 5

# CSV形式で出力
npm run query -- run --queryName ranking --limit 20 --format csv > population_ranking.csv
```

**出力例:**
```
meshId   | population2020 | pop2025  | changeRate | coordinates
---------+----------------+----------+------------+--------------------------------------------------
54366592 | 8117.0436      | 7770.672 | -0.0427    | 136.65,36.575,,136.65,36.58333333333334,...
```

### 3. 高齢化分析

```bash
# 高齢化が進行しているエリアの特定
npm run query -- run --queryName aging --limit 10

# 人口1000人以上で高齢化率上昇5%以上
npm run query -- run --queryName aging --minPopulation 1000 --limit 5
```

**出力例:**
```
meshId   | population2020 | elderlyRatio2025 | elderlyRatio2030 | ratioIncrease | coordinates
---------+----------------+------------------+------------------+---------------+---------------
55360527 | 1434.058       | 0.2344           | 0.2991           | 0.0647        | 136.7125,36.683...
```

### 4. 地図表示用データ

```bash
# 地図描画用のGeoJSONデータ取得
npm run query -- run --queryName mapdata --limit 100 --format json > map_data.json

# 軽量化版（人口50人以上）
npm run query -- run --queryName mapdata --minPopulation 50 --limit 50
```

### 5. 時系列分析

```bash
# 人口推移データの取得
npm run query -- run --queryName timeseries --limit 100

# 高人口密度エリアの時系列（人口500人以上）
npm run query -- run --queryName timeseries --minPopulation 500 --limit 50 --format csv > timeseries.csv
```

## 出力形式

### テーブル形式（デフォルト）
見やすい整列されたテーブル表示

### CSV形式
```bash
--format csv
```
Excel等での分析用、ファイル出力に適用

### JSON形式
```bash
--format json
```
Web APIやアプリケーション連携用

## 高度な使用例

### 1. 人口密度マップ作成用データ

```bash
# GeoJSON形式でのマップデータ取得
npm run query -- run --queryName mapdata --minPopulation 10 --format json | \
  jq '.results.bindings[] | {
    meshId: .meshId.value,
    population: .population2020.value | tonumber,
    geometry: .cleanWkt.value
  }' > population_map.json
```

### 2. 高齢化ホットスポット分析

```bash
# 高齢化進行地域をCSVで出力
npm run query -- run --queryName aging --minPopulation 100 --limit 50 --format csv | \
  awk -F, 'NR>1 && $5>0.08 {print $1","$2","$5}' > aging_hotspots.csv
```

### 3. 人口変化率分析

```bash
# 人口減少率の高い地域
npm run query -- run --queryName ranking --year 2030 --minPopulation 100 --format csv | \
  awk -F, 'NR>1 && $4<-0.1 {print $0}' > declining_areas.csv
```

## プログラムからの利用

### TypeScript/JavaScriptでの直接利用

```typescript
import { QueryTool, QUERY_TEMPLATES } from './src/query-tool';

const tool = new QueryTool({
  rdf4jEndpoint: 'http://localhost:8080/rdf4j-server',
  repositoryId: 'test',
  queryName: 'dashboard',
  format: 'json',
  logLevel: 'info'
});

await tool.executeQuery();
```

### カスタムクエリの追加

`QUERY_TEMPLATES`オブジェクトに新しいクエリを追加できます：

```typescript
QUERY_TEMPLATES.custom = `
  PREFIX mlit: <http://example.org/mlit/ontology#>
  SELECT ?meshId ?customValue WHERE {
    ?mesh mlit:meshId ?meshId ;
          mlit:customProperty ?customValue .
    FILTER(?customValue > {{threshold}})
  }
  LIMIT {{limit}}
`;
```

## パフォーマンス最適化

### 大量データの処理

```bash
# バッチ処理用（少数ずつ取得）
for i in {0..20}; do
  npm run query -- run --queryName mapdata --limit 100 --format csv | \
    tail -n +$((i*100+2)) | head -n 100 >> batch_$i.csv
done
```

### メモリ効率的な処理

```bash
# ストリーミング処理風
npm run query -- run --queryName timeseries --minPopulation 50 --format csv | \
  while IFS=',' read -r meshId year population elderlyRatio coordinates; do
    echo "Processing mesh: $meshId"
    # 個別処理ロジック
  done
```

## トラブルシューティング

### よくあるエラー

1. **RDF4J接続エラー**
   ```
   SPARQL query failed: 404
   ```
   → エンドポイントURLとリポジトリIDを確認

2. **タイムアウト**
   ```
   fetch failed
   ```
   → `--limit`でデータ量を制限

3. **メモリ不足**
   → `--minPopulation`で対象データを絞り込み

### デバッグモード

```bash
npm run query -- run --queryName dashboard --logLevel debug
```

## API化の例

Express.jsでのWeb API化:

```typescript
import express from 'express';
import { QueryTool } from './query-tool';

const app = express();

app.get('/api/population/:queryName', async (req, res) => {
  const tool = new QueryTool({
    rdf4jEndpoint: 'http://localhost:8080/rdf4j-server',
    repositoryId: 'test',
    queryName: req.params.queryName,
    format: 'json',
    logLevel: 'warn',
    limit: parseInt(req.query.limit as string) || 50
  });
  
  const result = await tool.executeQuery();
  res.json(result);
});
```

## 参考情報

- **データソース**: 石川県1kmメッシュ人口データ（2258メッシュ）
- **座標系**: WGS84 (EPSG:4326)
- **時系列**: 2020年（実績）、2025-2070年（5年間隔の予測）
- **人口項目**: 総人口、年齢層別人口、年齢層別比率
- **地理範囲**: 経度136.3-136.8°、緯度36.2-37.8°