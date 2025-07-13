import { Feature, FeatureCollection, Point, Polygon } from "geojson";
import * as oxigraph from "oxigraph/web";
// @ts-expect-error - wellknown module lacks type definitions
import wellknown from "wellknown";

// GeoSPARQLプレフィックス
const GEOSPARQL_PREFIXES = `
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX ex: <http://example.org/disaster#>
`;

// 各データタイプの共通プロパティを定義
const DATA_PROPERTIES = {
  population: {
    type: "ex:PopulationFeature",
    properties: {
      population: "ex:population",
      meshId: "ex:meshId",
      color: "ex:color",
    },
  },
  landuse: {
    type: "ex:LandUseFeature",
    properties: {
      landUseCode: "ex:landUseCode",
      meshId: "ex:meshId",
      color: "ex:color",
    },
  },
  school: {
    type: "ex:SchoolFeature",
    properties: {
      P29_001: "ex:P29_001",
      P29_002: "ex:P29_002",
      P29_003: "ex:P29_003",
      P29_004: "ex:P29_004",
      P29_005: "ex:P29_005",
      P29_006: "ex:P29_006",
      P29_007: "ex:P29_007",
    },
  },
  medical: {
    type: "ex:MedicalFeature",
    properties: {
      P04_001: "ex:P04_001",
      P04_002: "ex:P04_002",
      P04_003: "ex:P04_003",
      P04_004: "ex:P04_004",
      P04_007: "ex:P04_007",
      P04_008: "ex:P04_008",
      P04_009: "ex:P04_009",
      P04_010: "ex:P04_010",
    },
  },
  disaster: {
    type: "ex:DisasterArea",
    properties: {
      type: "ex:disasterType",
      severity: "ex:severity",
      timestamp: "ex:timestamp",
    },
  },
};

// GeoJSONをOxigraph Triple オブジェクトに変換
export function convertGeoJSONToTriples(feature: Feature, type: keyof typeof DATA_PROPERTIES): oxigraph.Quad[] {
  const { geometry, properties = {} } = feature;
  const id = properties?.id ?? crypto.randomUUID();
  const typeConfig = DATA_PROPERTIES[type];

  if (!typeConfig) {
    throw new Error(`Unsupported feature type: ${type}`);
  }

  if (geometry.type !== "Point" && geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  const triples: oxigraph.Quad[] = [];

  // URIを作成
  const featureNode = oxigraph.namedNode(`http://example.org/disaster#${type}_${id}`);
  const rdfType = oxigraph.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
  const rdfsLabel = oxigraph.namedNode("http://www.w3.org/2000/01/rdf-schema#label");
  const geoHasGeometry = oxigraph.namedNode("http://www.opengis.net/ont/geosparql#hasGeometry");
  const geoGeometry = oxigraph.namedNode("http://www.opengis.net/ont/geosparql#Geometry");
  const geoAsGeoJSON = oxigraph.namedNode("http://www.opengis.net/ont/geosparql#asGeoJSON");
  const geoAsWKT = oxigraph.namedNode("http://www.opengis.net/ont/geosparql#asWKT");
  const geoWktLiteral = oxigraph.namedNode("http://www.opengis.net/ont/geosparql#wktLiteral");

  // 基本トリプルを追加
  triples.push(
    oxigraph.triple(featureNode, rdfType, oxigraph.namedNode(`http://example.org/disaster#${typeConfig.type.replace("ex:", "")}`)),
    oxigraph.triple(featureNode, rdfsLabel, oxigraph.literal(`${type} feature ${id}`)),
  );

  // ジオメトリ用のブランクノード
  const geometryNode = oxigraph.blankNode(`geometry_${id}`);

  // GeoJSON形式で保存
  triples.push(
    oxigraph.triple(featureNode, geoHasGeometry, geometryNode),
    oxigraph.triple(geometryNode, rdfType, geoGeometry),
    oxigraph.triple(geometryNode, geoAsGeoJSON, oxigraph.literal(JSON.stringify(geometry))),
  );

  // WKT形式でも保存（wellknownライブラリを使用）
  try {
    const wktString = wellknown.stringify(geometry);
    if (wktString) {
      triples.push(oxigraph.triple(geometryNode, geoAsWKT, oxigraph.literal(wktString, geoWktLiteral)));
    } else {
      console.warn("⚠️ wellknown.stringify returned null or empty string");
    }
  } catch (error) {
    console.error(`❌ Failed to convert geometry to WKT for feature ${id}:`, error);
    console.error("Geometry that failed:", JSON.stringify(geometry, null, 2));
  }

  // プロパティの追加
  if (properties) {
    Object.entries(properties).forEach(([key, value]) => {
      if (key === "id") return; // IDは既に使用済み

      const propertyUri = typeConfig.properties[key as keyof typeof typeConfig.properties] || `ex:${key}`;
      const propertyUriString = String(propertyUri);
      const propertyNode = oxigraph.namedNode(
        propertyUriString.startsWith("ex:") ? `http://example.org/disaster#${propertyUriString.replace("ex:", "")}` : propertyUriString,
      );

      if (typeof value === "string") {
        triples.push(oxigraph.triple(featureNode, propertyNode, oxigraph.literal(value)));
      } else if (typeof value === "number") {
        triples.push(
          oxigraph.triple(featureNode, propertyNode, oxigraph.literal(value.toString(), oxigraph.namedNode("http://www.w3.org/2001/XMLSchema#decimal"))),
        );
      } else if (typeof value === "boolean") {
        triples.push(
          oxigraph.triple(featureNode, propertyNode, oxigraph.literal(value.toString(), oxigraph.namedNode("http://www.w3.org/2001/XMLSchema#boolean"))),
        );
      } else if (Array.isArray(value)) {
        triples.push(oxigraph.triple(featureNode, propertyNode, oxigraph.literal(JSON.stringify(value))));
      } else if (value !== null && value !== undefined) {
        console.warn(`Unsupported property type for ${key}: ${typeof value}`);
      } else {
        // null または undefined の場合は何もしない
      }
    });
  }

  return triples;
}

// GeoSPARQLクエリの実行（デバッグログ付き）
export function executeGeoSPARQLQuery(store: oxigraph.Store, query: string): any {
  console.log("🔍 Executing GeoSPARQL query...");
  console.log("📝 Query:", query);

  try {
    const result = store.query(query);
    console.log("✅ Query executed successfully");
    console.log("📊 Raw result:", result);
    console.dir(result, { depth: null });

    if (Array.isArray(result)) {
      console.log(`📈 Result count: ${result.length}`);
      if (result.length > 0) {
        console.log("🔍 First result:", result[0]);
      }
    }

    return result;
  } catch (error) {
    console.error("❌ Query execution failed:", error);
    throw error;
  }
}

// 特定の地域内の人口データを取得（最適化版）
export async function getPopulationInArea(
  store: oxigraph.Store,
  [[minLng, minLat], [maxLng, maxLat]]: [[number, number], [number, number]],
): Promise<FeatureCollection> {
  const boundingBoxWKT = `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;

  const query = `
    ${GEOSPARQL_PREFIXES}
    SELECT ?feature ?geometry ?population ?meshId ?color
    WHERE {
      ?feature rdf:type ex:PopulationFeature ;
        geo:hasGeometry ?geom ;
        ex:population ?population .
      OPTIONAL { ?feature ex:meshId ?meshId }
      OPTIONAL { ?feature ex:color ?color }
      ?geom geo:asGeoJSON ?geometry .
      FILTER(
        geof:sfIntersects(
          "${boundingBoxWKT}"^^geo:wktLiteral,
          ?geometry
        )
      )
    }
    ORDER BY DESC(?population)
  `;

  try {
    const results = await executeGeoSPARQLQuery(store, query);

    return {
      type: "FeatureCollection",
      features: results.map((result: any) => ({
        type: "Feature",
        geometry: JSON.parse(result.geometry.value),
        properties: {
          population: parseFloat(result.population.value),
          meshId: result.meshId?.value || null,
          color: result.color?.value || null,
        },
      })),
    };
  } catch (error) {
    console.error("Error executing population query:", error);
    return { type: "FeatureCollection", features: [] };
  }
}

// WKT形式を使用した空間フィルタリングの例
export async function getPopulationInAreaWithWKT(
  store: oxigraph.Store,
  [[minLng, minLat], [maxLng, maxLat]]: [[number, number], [number, number]],
): Promise<FeatureCollection> {
  const boundingBoxWKT = `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;

  const query = `
    ${GEOSPARQL_PREFIXES}
    SELECT ?feature ?geometry ?population ?meshId ?color
    WHERE {
      ?feature rdf:type ex:PopulationFeature ;
        geo:hasGeometry ?geom ;
        ex:population ?population .
      OPTIONAL { ?feature ex:meshId ?meshId }
      OPTIONAL { ?feature ex:color ?color }
      ?geom geo:asGeoJSON ?geometry .
      ?geom geo:asWKT ?wkt .
      FILTER(
        geof:sfIntersects(
          ?wkt,
          "${boundingBoxWKT}"^^geo:wktLiteral
        )
      )
    }
    ORDER BY DESC(?population)
  `;

  try {
    const results = await executeGeoSPARQLQuery(store, query);

    return {
      type: "FeatureCollection",
      features: results.map((result: any) => ({
        type: "Feature",
        geometry: JSON.parse(result.geometry.value),
        properties: {
          population: parseFloat(result.population.value),
          meshId: result.meshId?.value || null,
          color: result.color?.value || null,
        },
      })),
    };
  } catch (error) {
    console.error("Error executing population query with WKT:", error);
    throw error;
  }
}

// 災害エリアと重複する重要施設を取得（最適化版）
export async function getFacilitiesInDisasterArea(
  store: oxigraph.Store,
  disasterArea: Feature<Polygon>,
): Promise<{
  schools: FeatureCollection<Point>;
  medical: FeatureCollection<Point>;
}> {
  const escapedGeometry = JSON.stringify(disasterArea.geometry).replace(/"/gu, '\\"');

  const query = `
    ${GEOSPARQL_PREFIXES}
    SELECT ?feature ?geometry ?type ?name ?capacity ?emergencyRole
    WHERE {
      {
        ?feature rdf:type ex:SchoolFeature ;
          geo:hasGeometry ?geom .
        OPTIONAL { ?feature ex:facilityName ?name }
        OPTIONAL { ?feature ex:capacity ?capacity }
        OPTIONAL { ?feature ex:emergencyRole ?emergencyRole }
        BIND("school" as ?type)
      } UNION {
        ?feature rdf:type ex:MedicalFeature ;
          geo:hasGeometry ?geom .
        OPTIONAL { ?feature ex:facilityName ?name }
        OPTIONAL { ?feature ex:capacity ?capacity }
        OPTIONAL { ?feature ex:emergencyCapacity ?emergencyRole }
        BIND("medical" as ?type)
      }
      ?geom geo:asGeoJSON ?geometry .
      FILTER(
        geof:sfIntersects(
          ?geometry,
          "${escapedGeometry}"^^geo:geoJSONLiteral
        )
      )
    }
    ORDER BY ?type ?name
  `;

  try {
    const results = await executeGeoSPARQLQuery(store, query);

    const schools: Feature<Point>[] = [];
    const medical: Feature<Point>[] = [];

    results.forEach((result: any) => {
      const feature: Feature<Point> = {
        type: "Feature",
        geometry: JSON.parse(result.geometry.value),
        properties: {
          name: result.name?.value || "Unknown",
          capacity: result.capacity ? parseInt(result.capacity.value, 10) : null,
          emergencyRole: result.emergencyRole?.value || null,
        },
      };

      if (result.type.value === "school") {
        schools.push(feature);
      } else {
        medical.push(feature);
      }
    });

    return {
      schools: { type: "FeatureCollection", features: schools },
      medical: { type: "FeatureCollection", features: medical },
    };
  } catch (error) {
    console.error("Error executing facilities query:", error);
    return {
      schools: { type: "FeatureCollection", features: [] },
      medical: { type: "FeatureCollection", features: [] },
    };
  }
}

// 土地利用データを取得（最適化版）
export async function getLandUseInArea(
  store: oxigraph.Store,
  [[minLng, minLat], [maxLng, maxLat]]: [[number, number], [number, number]],
): Promise<FeatureCollection> {
  const boundingBoxWKT = `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;

  const query = `
    ${GEOSPARQL_PREFIXES}
    SELECT ?feature ?geometry ?landUseType ?area ?classification
    WHERE {
      ?feature rdf:type ex:LandUseFeature ;
        geo:hasGeometry ?geom ;
        ex:landUseCode ?landUseCode .
      OPTIONAL { ?feature ex:color }
      ?geom geo:asGeoJSON ?geometry .
      FILTER(
        geof:sfIntersects(
          ?geometry,
          "${boundingBoxWKT}"^^geo:wktLiteral
        )
      )
    }
    ORDER BY ?landUseType
  `;

  try {
    const results = await executeGeoSPARQLQuery(store, query);

    return {
      type: "FeatureCollection",
      features: results.map((result: any) => ({
        type: "Feature",
        geometry: JSON.parse(result.geometry.value),
        properties: {
          type: result.landUseType.value,
          area: result.area ? parseFloat(result.area.value) : null,
          classification: result.classification?.value || null,
        },
      })),
    };
  } catch (error) {
    console.error("Error executing land use query:", error);
    return { type: "FeatureCollection", features: [] };
  }
}

// データをGeoSPARQLストアに保存（Triple オブジェクト版）
export function saveDataToGeoSPARQL(
  store: oxigraph.Store,
  data: {
    populationData: FeatureCollection<Point>;
    landUseData: FeatureCollection<Point>;
    schoolData: FeatureCollection<Point>;
    medicalData: FeatureCollection<Point>;
    disasterData: FeatureCollection<Polygon>;
  },
): void {
  console.log("🔄 Starting GeoSPARQL store save operation with Triple objects...");
  console.log("📊 Data counts:", {
    population: data.populationData.features.length,
    landUse: data.landUseData.features.length,
    school: data.schoolData.features.length,
    medical: data.medicalData.features.length,
    disaster: data.disasterData.features.length,
  });

  console.dir(data.populationData.features, { depth: null });

  try {
    let totalConvertedFeatures = 0;
    let totalErrors = 0;

    // Triple オブジェクトを使用して個別フィーチャーを処理
    const processFeatures = (features: Feature[], type: keyof typeof DATA_PROPERTIES) => {
      console.log(`🔨 Processing ${features.length} ${type} features with Triple objects...`);
      let convertedCount = 0;
      let errorCount = 0;

      features.forEach((feature, index) => {
        try {
          const triples = convertGeoJSONToTriples(feature, type);

          if (index === 0) {
            console.log(`✅ Sample ${type} generated ${triples.length} triples for first feature`);
          }

          // 各Triple を個別に追加
          triples.forEach((triple, tripleIndex) => {
            try {
              store.add(triple);
            } catch (addError) {
              console.error(`❌ Failed to add ${type} feature ${index} triple ${tripleIndex}:`, addError);
              errorCount++;
            }
          });

          convertedCount++;

          if (index % 100 === 0 && index > 0) {
            console.log(`📊 Progress: ${index}/${features.length} ${type} features processed`);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Error converting ${type} feature ${index}:`, error);
          if (errorCount === 1) {
            console.log("🔍 Problematic feature:", JSON.stringify(feature, null, 2));
          }
        }
      });

      console.log(`📈 ${type}: ${convertedCount} converted, ${errorCount} errors`);
      totalConvertedFeatures += convertedCount;
      totalErrors += errorCount;
    };

    // 各データタイプを処理
    if (data.disasterData.features.length > 0) {
      processFeatures(data.disasterData.features, "disaster");
    }

    // より小さなデータセットから始める
    if (data.schoolData.features.length > 0) {
      processFeatures(data.schoolData.features.slice(0), "school"); // 最初の10件のみテスト
    }

    if (data.medicalData.features.length > 0) {
      processFeatures(data.medicalData.features.slice(0), "medical"); // 最初の10件のみテスト
    }

    // 大きなデータセットは一部のみテスト
    if (data.populationData.features.length > 0) {
      processFeatures(data.populationData.features.slice(0), "population"); // 最初の5件のみテスト
    }

    if (data.landUseData.features.length > 0) {
      processFeatures(data.landUseData.features.slice(0, 10), "landuse"); // 最初の5件のみテスト
    }

    console.log(`✅ Successfully processed ${totalConvertedFeatures} features with ${totalErrors} errors`);

    // Store validation
    console.log("🔍 Validating store after save...");
    validateStore(store);
  } catch (error) {
    console.error("❌ Error saving data to GeoSPARQL store:", error);
    throw error;
  }
}

// ストアの検証機能
export function validateStore(store: oxigraph.Store): void {
  console.log("🔍 Validating GeoSPARQL store...");

  try {
    // 基本的なカウントクエリ
    const countQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX ex: <http://example.org/disaster#>
      
      SELECT (COUNT(*) as ?count)
      WHERE {
        ?s ?p ?o .
      }
    `;

    const countResult = store.query(countQuery);
    console.log("📊 Total triples in store:", countResult);

    // 各データタイプのカウント
    const typeCountQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX ex: <http://example.org/disaster#>
      
      SELECT ?type (COUNT(*) as ?count)
      WHERE {
        ?s rdf:type ?type .
      }
      GROUP BY ?type
    `;

    const typeResults = store.query(typeCountQuery);
    console.log("📈 Features by type:", typeResults);

    // サンプルデータの存在確認
    const sampleQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX ex: <http://example.org/disaster#>
      
      SELECT ?s ?p ?o
      WHERE {
        ?s ?p ?o .
      }
      LIMIT 5
    `;

    const sampleResults = store.query(sampleQuery);
    console.log("🔍 Sample triples:", sampleResults);
  } catch (error) {
    console.error("❌ Error validating store:", error);
  }
}

// 災害エリアの総合分析（最適化版）
export async function analyzeDisasterArea(
  store: oxigraph.Store,
  disasterArea: Feature<Polygon>,
): Promise<{
  population: number;
  schools: number;
  medical: number;
  landUse: { [key: string]: number };
  emergencyCapacity: {
    schoolCapacity: number;
    medicalCapacity: number;
    emergencyMedicalCapacity: number;
  };
}> {
  const escapedGeometry = wellknown.stringify(disasterArea.geometry);

  // 統合クエリで全情報を一度に取得（サブクエリを使用して正しく集計）
  const comprehensiveQuery = `
    ${GEOSPARQL_PREFIXES}
    SELECT 
      ?totalPopulation ?schoolCount ?medicalCount ?totalSchoolCapacity ?totalMedicalCapacity ?totalEmergencyCapacity
    WHERE {
      {
        SELECT (SUM(?population) as ?totalPopulation)
        WHERE {
          ?popFeature rdf:type ex:PopulationFeature ;
            geo:hasGeometry ?popGeom ;
            ex:population ?population .
          ?popGeom geo:asWKT ?popGeometry .
          FILTER(
            geof:sfIntersects(
              ?popGeometry,
              "${escapedGeometry}"^^geo:wktLiteral
            )
          )
        }
      }
      {
        SELECT (COUNT(DISTINCT ?school) as ?schoolCount) (SUM(?schoolCapacity) as ?totalSchoolCapacity)
        WHERE {
          ?school rdf:type ex:SchoolFeature ;
            geo:hasGeometry ?schoolGeom .
          OPTIONAL { ?school ex:capacity ?schoolCapacity }
          ?schoolGeom geo:asWKT ?schoolGeometry .
          FILTER(
            geof:sfIntersects(
              ?schoolGeometry,
              "${escapedGeometry}"^^geo:wktLiteral
            )
          )
        }
      }
      {
        SELECT (COUNT(DISTINCT ?medical) as ?medicalCount) (SUM(?medicalCapacity) as ?totalMedicalCapacity) (SUM(?emergencyCapacity) as ?totalEmergencyCapacity)
        WHERE {
          ?medical rdf:type ex:MedicalFeature ;
            geo:hasGeometry ?medicalGeom .
          OPTIONAL { ?medical ex:capacity ?medicalCapacity }
          OPTIONAL { ?medical ex:emergencyCapacity ?emergencyCapacity }
          ?medicalGeom geo:asWKT ?medicalGeometry .
          FILTER(
            geof:sfIntersects(
              ?medicalGeometry,
              "${escapedGeometry}"^^geo:wktLiteral
            )
          )
        }
      }
    }
  `;

  // 土地利用データの取得
  const landUseQuery = `
    ${GEOSPARQL_PREFIXES}
    SELECT ?landUseCode (COUNT(DISTINCT ?feature) as ?count) 
    WHERE {
      ?feature rdf:type ex:LandUseFeature ;
        geo:hasGeometry ?geom ;
        ex:landUseCode ?landUseCode .
      ?geom geo:asWKT ?geometry .
      FILTER(
        geof:sfIntersects(
          ?geometry,
          "${escapedGeometry}"^^geo:wktLiteral
        )
      )
    }
    GROUP BY ?landUseCode
    ORDER BY DESC(?count)
  `;

  try {
    const [comprehensiveResult, landUseResult] = await Promise.all([
      executeGeoSPARQLQuery(store, comprehensiveQuery),
      executeGeoSPARQLQuery(store, landUseQuery),
    ]);

    const result = comprehensiveResult[0] as Map<string, any>;
    console.log(comprehensiveResult[0], result, result.get("totalPopulation").value);
    const totalPopulation = result.get("totalPopulation").value || 0;
    const schools = result.get("schoolCount").value || 0;
    const medical = result.get("medicalCount").value || 0;
    const schoolCapacity = result.get("totalSchoolCapacity")?.value || 0;
    const medicalCapacity = result.get("totalMedicalCapacity")?.value || 0;
    const emergencyCapacity = result.get("totalEmergencyCapacity")?.value || 0;

    const landUse = landUseResult.reduce((acc: { [key: string]: number }, curr: any) => {
      acc[curr.landUseType.value] = parseInt(curr.count.value, 10);
      return acc;
    }, {});

    return {
      population: parseFloat(totalPopulation),
      schools: parseInt(schools, 10),
      medical: parseInt(medical, 10),
      landUse,
      emergencyCapacity: {
        schoolCapacity: parseInt(schoolCapacity, 10),
        medicalCapacity: parseInt(medicalCapacity, 10),
        emergencyMedicalCapacity: parseInt(emergencyCapacity, 10),
      },
    };
  } catch (error) {
    console.error("Error analyzing disaster area:", error);
    return {
      population: 0,
      schools: 0,
      medical: 0,
      landUse: {},
      emergencyCapacity: {
        schoolCapacity: 0,
        medicalCapacity: 0,
        emergencyMedicalCapacity: 0,
      },
    };
  }
}

// 災害対応能力の評価
export async function evaluateDisasterResponse(
  store: oxigraph.Store,
  disasterArea: Feature<Polygon>,
): Promise<{
  riskLevel: "low" | "medium" | "high" | "critical";
  analysis: string;
  recommendations: string[];
}> {
  const analysis = await analyzeDisasterArea(store, disasterArea);
  console.log(analysis);
  const populationDensity = analysis.population;
  const medicalRatio = analysis.population > 0 ? (analysis.medical * 10) / analysis.population : 0;
  const schoolCapacityRatio = analysis.population > 0 ? (analysis.schools * 100) / analysis.population : 0;

  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  const recommendations: string[] = [];

  if (populationDensity > 10000) {
    riskLevel = "high";
    recommendations.push("高人口密度エリア - 追加の避難計画が必要");
  }

  if (medicalRatio < 0.01) {
    riskLevel = riskLevel === "low" ? "medium" : "critical";
    recommendations.push("医療施設の緊急対応能力が不足 - 近隣からの支援体制を確保");
  }

  if (schoolCapacityRatio < 0.1) {
    recommendations.push("避難所としての学校収容能力が不足 - 代替避難所の確保を検討");
  }

  if (analysis.medical === 0) {
    riskLevel = "critical";
    recommendations.push("医療施設が存在しない - 緊急医療チームの派遣が必要");
  }

  const analysisText = `人口: ${analysis.population}人, 学校: ${analysis.schools}施設, 医療: ${analysis.medical}施設`;

  return {
    riskLevel,
    analysis: analysisText,
    recommendations,
  };
}

// WKT形式での保存機能をテストするための関数
export function testWKTStorage(store: oxigraph.Store): void {
  console.log("🧪 Testing WKT storage functionality...");

  const testQuery = `
    ${GEOSPARQL_PREFIXES}
    SELECT ?feature ?geometry ?wkt
    WHERE {
      ?feature rdf:type ex:PopulationFeature ;
        geo:hasGeometry ?geom .
      OPTIONAL { ?geom geo:asGeoJSON ?geometry }
      OPTIONAL { ?geom geo:asWKT ?wkt }
    }
    LIMIT 5
  `;

  try {
    const results = executeGeoSPARQLQuery(store, testQuery);
    console.log("📊 WKT Storage Test Results:");
    results.forEach((result: any, index: number) => {
      console.log(`Result ${index + 1}:`);
      console.log(`  Feature: ${result.feature?.value}`);
      console.log(`  GeoJSON: ${result.geometry?.value ? "Available" : "Not available"}`);
      console.log(`  WKT: ${result.wkt?.value ? "Available" : "Not available"}`);
      if (result.wkt?.value) {
        console.log(`  WKT Content: ${result.wkt.value}`);
      }
    });
  } catch (error) {
    console.error("❌ WKT storage test failed:", error);
  }
}

// WKT形式での保存機能をデバッグするための関数
export function debugWKTStorage(store: oxigraph.Store): void {
  console.log("🔍 Debugging WKT storage...");

  // 1. 基本的なデータ存在確認
  const basicQuery = `
    ${GEOSPARQL_PREFIXES}
    SELECT ?feature ?geom
    WHERE {
      ?feature rdf:type ex:PopulationFeature ;
        geo:hasGeometry ?geom .
    }
    LIMIT 3
  `;

  try {
    const basicResults = executeGeoSPARQLQuery(store, basicQuery);
    console.log("📊 Basic geometry results:", basicResults);

    if (basicResults.length === 0) {
      console.log("❌ No population features found");
      return;
    }

    // 2. 各幾何学オブジェクトの詳細確認
    basicResults.forEach((result: any, index: number) => {
      const featureUri = result.feature?.value;
      const geomUri = result.geom?.value;

      console.log(`\n🔍 Geometry ${index + 1}:`);
      console.log(`  Feature: ${featureUri}`);
      console.log(`  Geometry: ${geomUri}`);

      // 3. 特定の幾何学オブジェクトの全プロパティを確認
      const detailQuery = `
        ${GEOSPARQL_PREFIXES}
        SELECT ?property ?value
        WHERE {
          <${geomUri}> ?property ?value .
        }
      `;

      try {
        const detailResults = executeGeoSPARQLQuery(store, detailQuery);
        console.log(`  Properties of geometry ${index + 1}:`);
        detailResults.forEach((prop: any) => {
          console.log(`    ${prop.property?.value}: ${prop.value?.value}`);
        });
      } catch (error) {
        console.error(`  Error getting properties for geometry ${index + 1}:`, error);
      }
    });
  } catch (error) {
    console.error("❌ Basic query failed:", error);
  }
}
