```
⏺ RDF4J Workbenchでtestリポジトリを作成するか、既存のリポジトリ
  を使用してください。

  RDF4J Workbenchにアクセスして確認しましょう：

⏺ Bash(curl -s
      "http://localhost:8080/rdf4j-workbench/repositories")
  ⎿ shell-init: error retrieving current directory: getcwd: can
    not access parent directories: Operation not permitted


⏺ まず、利用可能なリポジトリをリストアップしてみましょう：

⏺ Bash(curl -X GET
      "http://localhost:8080/rdf4j-server/repositories" -H
      "Accept: application/sparql-results+json")
  ⎿  {
       "head" : {
         "vars" : [
     … +18 lines (ctrl+r to expand)

⏺ リポジトリが存在していません。新しいリポジトリを作成しましょ
  う：

⏺ Bash(curl -X PUT
      "http://localhost:8080/rdf4j-server/repositories/test" -H
       "Content-Type: text/turtle" -d "@PREFIX rdfs:
      <http://www.w3.org/2000/01/rdf-schema#> .
      @P…)
  ⎿ MALFORMED DATA: Supplied repository configuration is invali
    d: could not read repository config from supplied data
    shell-init: error retrieving current directory: getcwd: can
    … +35 lines (ctrl+r to expand)



⏺ 設定ファイルを作成してリポジトリを作成しましょう：

⏺ Write(test-repo-config.ttl)
  ⎿  Wrote 17 lines to test-repo-config.ttl
     @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
     @prefix rep: <http://www.openrdf.org/config/repository#> .
     @prefix sr:
     <http://www.openrdf.org/config/repository/sail#> .
     @prefix sail: <http://www.openrdf.org/config/sail#> .
     @prefix ms: <http://www.openrdf.org/config/sail/memory#> .
     [] a rep:Repository ;
        rep:repositoryID "test" ;
        rdfs:label "Test Repository" ;
        rep:repositoryImpl [
     … +7 lines (ctrl+r to expand)

⏺ Bash(curl -X PUT
      "http://localhost:8080/rdf4j-server/repositories/test" -H
       "Content-Type: text/turtle" --data-binary
      @test-repo-config.ttl)
  ⎿ shell-init: error retrieving current directory: getcwd: can
    not access parent directories: Operation not permitted
      % Total    % Received % Xferd  Average Speed   Time    Ti
    … +6 lines (ctrl+r to expand)



⏺ Bash(curl -X GET
      "http://localhost:8080/rdf4j-server/repositories" -H
      "Accept: application/sparql-results+json")
  ⎿  {
       "head" : {
         "vars" : [
     … +46 lines (ctrl+r to expand)

⏺ 素晴らしい！リポジトリが正常に作成されました。再度テストして
  みましょう：

⏺ Bash(node dist/main.js --filePaths
      data/1km_mesh_2024_17_GML/1km_mesh_2024_17.geojson
      --rdf4jEndpoint http://localhost:8080/rdf4j-server
      --repositoryId test --testCo…)
  ⎿  info: Starting MLIT GeoJSON to RDF4J conversion {
     "timestamp":"2025-07-17T23:14:53.333Z"}
     info: Configuration: {"timestamp":"2025-07-17T23:
     … +78 lines (ctrl+r to expand)

⏺ 完璧です！接続テストが成功し、5つのフィーチャから1,760のトリ
  プルが生成されました。これは1フィーチャあたり約352のトリプル
  で、複数年の人口データが正しく処理されていることを示していま
  す。

  実際にRDF4Jに小さなサンプルデータをロードしてみましょう：

⏺ Bash(node dist/main.js --filePaths
      data/1km_mesh_2024_17_GML/1km_mesh_2024_17.geojson
      --rdf4jEndpoint http://localhost:8080/rdf4j-server
      --repositoryId test --testCo…)
  ⎿  info: Starting MLIT GeoJSON to RDF4J conversion {
     "timestamp":"2025-07-17T23:15:01.554Z"}
     info: Configuration: {"timestamp":"2025-07-17T2
```
