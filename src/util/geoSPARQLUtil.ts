import { Feature, FeatureCollection, Point } from "geojson";
import wellknown from "wellknown";

// RDF4J integration interface
export interface RDF4JStore {
  baseUrl: string;
  repositoryId: string;
}

export interface RDFTriple {
  subject: string;
  predicate: string;
  object: string;
  objectType: 'uri' | 'literal';
  datatype?: string;
}

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
      shicode: "ex:shicode",
      population2020: "ex:population2020",
      population2024: "ex:population2024",
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

// GeoJSONをRDF4J Triple オブジェクトに変換
export function convertGeoJSONToTriples(feature: Feature, type: keyof typeof DATA_PROPERTIES): RDFTriple[] {
  const { geometry, properties = {} } = feature;
  const id = properties?.id ?? crypto.randomUUID();
  const typeConfig = DATA_PROPERTIES[type];

  if (!typeConfig) {
    throw new Error(`Unsupported feature type: ${type}`);
  }

  if (geometry.type !== "Point" && geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  const triples: RDFTriple[] = [];

  // URIを作成
  const featureUri = `http://example.org/disaster#${type}_${id}`;
  const geometryUri = `http://example.org/disaster#geometry_${id}`;

  // 基本トリプルを追加
  triples.push({
    subject: featureUri,
    predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    object: `http://example.org/disaster#${typeConfig.type.replace("ex:", "")}`,
    objectType: "uri"
  });

  triples.push({
    subject: featureUri,
    predicate: "http://www.w3.org/2000/01/rdf-schema#label",
    object: `${type} feature ${id}`,
    objectType: "literal"
  });

  // ジオメトリトリプル
  triples.push({
    subject: featureUri,
    predicate: "http://www.opengis.net/ont/geosparql#hasGeometry",
    object: geometryUri,
    objectType: "uri"
  });

  triples.push({
    subject: geometryUri,
    predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    object: "http://www.opengis.net/ont/geosparql#Geometry",
    objectType: "uri"
  });

  // GeoJSON形式で保存
  triples.push({
    subject: geometryUri,
    predicate: "http://www.opengis.net/ont/geosparql#asGeoJSON",
    object: JSON.stringify(geometry),
    objectType: "literal"
  });

  // WKT形式でも保存（wellknownライブラリを使用）
  try {
    const wktString = wellknown.stringify(geometry as any);
    if (wktString) {
      triples.push({
        subject: geometryUri,
        predicate: "http://www.opengis.net/ont/geosparql#asWKT",
        object: wktString,
        objectType: "literal",
        datatype: "http://www.opengis.net/ont/geosparql#wktLiteral"
      });
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
      const fullPropertyUri = propertyUriString.startsWith("ex:") 
        ? `http://example.org/disaster#${propertyUriString.replace("ex:", "")}` 
        : propertyUriString;

      if (typeof value === "string") {
        triples.push({
          subject: featureUri,
          predicate: fullPropertyUri,
          object: value,
          objectType: "literal"
        });
      } else if (typeof value === "number") {
        triples.push({
          subject: featureUri,
          predicate: fullPropertyUri,
          object: value.toString(),
          objectType: "literal",
          datatype: "http://www.w3.org/2001/XMLSchema#decimal"
        });
      } else if (typeof value === "boolean") {
        triples.push({
          subject: featureUri,
          predicate: fullPropertyUri,
          object: value.toString(),
          objectType: "literal",
          datatype: "http://www.w3.org/2001/XMLSchema#boolean"
        });
      } else if (Array.isArray(value)) {
        triples.push({
          subject: featureUri,
          predicate: fullPropertyUri,
          object: JSON.stringify(value),
          objectType: "literal"
        });
      } else if (value !== null && value !== undefined) {
        console.warn(`Unsupported property type for ${key}: ${typeof value}`);
      }
    });
  }

  return triples;
}

// RDF4J SPARQL クエリ実行用のヘルパー関数
export async function executeRDF4JSPARQLQuery(store: RDF4JStore, query: string): Promise<any> {
  const queryUrl = `${store.baseUrl}/repositories/${store.repositoryId}`;
  
  const response = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sparql-query',
      'Accept': 'application/sparql-results+json'
    },
    body: query
  });

  if (!response.ok) {
    throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// RDF4J bulk insert用のヘルパー関数
export async function bulkInsertTriples(store: RDF4JStore, triples: RDFTriple[], batchSize: number = 1000): Promise<void> {
  const insertUrl = `${store.baseUrl}/repositories/${store.repositoryId}/statements`;
  
  // トリプルをTurtle形式に変換
  const convertToTurtle = (triples: RDFTriple[]): string => {
    const prefixes = `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix ex: <http://example.org/disaster#> .

`;
    
    const tripleStrings = triples.map(triple => {
      const subject = `<${triple.subject}>`;
      const predicate = `<${triple.predicate}>`;
      let object: string;
      
      if (triple.objectType === 'uri') {
        object = `<${triple.object}>`;
      } else {
        if (triple.datatype) {
          object = `"${triple.object.replace(/"/g, '\\"')}"^^<${triple.datatype}>`;
        } else {
          object = `"${triple.object.replace(/"/g, '\\"')}"`;
        }
      }
      
      return `${subject} ${predicate} ${object} .`;
    });
    
    return prefixes + tripleStrings.join('\n');
  };

  // バッチ処理でトリプルを挿入
  for (let i = 0; i < triples.length; i += batchSize) {
    const batch = triples.slice(i, i + batchSize);
    const turtleData = convertToTurtle(batch);
    
    const response = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/turtle'
      },
      body: turtleData
    });

    if (!response.ok) {
      throw new Error(`Failed to insert batch ${Math.floor(i / batchSize) + 1}: ${response.status} ${response.statusText}`);
    }

    console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(triples.length / batchSize)} (${batch.length} triples)`);
  }
}

// データをRDF4Jストアに保存（Triple オブジェクト版）
export async function saveDataToRDF4J(
  store: RDF4JStore,
  data: {
    populationData: FeatureCollection;
    landUseData: FeatureCollection;
    schoolData: FeatureCollection;
    medicalData: FeatureCollection;
    disasterData: FeatureCollection;
  },
  batchSize: number = 1000
): Promise<number> {
  console.log("🔄 Starting RDF4J store save operation...");
  console.log("📊 Data counts:", {
    population: data.populationData.features.length,
    landUse: data.landUseData.features.length,
    school: data.schoolData.features.length,
    medical: data.medicalData.features.length,
    disaster: data.disasterData.features.length,
  });

  try {
    let allTriples: RDFTriple[] = [];
    let totalConvertedFeatures = 0;
    let totalErrors = 0;

    // フィーチャーを処理してトリプルに変換
    const processFeatures = (features: Feature[], type: keyof typeof DATA_PROPERTIES): RDFTriple[] => {
      console.log(`🔨 Processing ${features.length} ${type} features...`);
      let convertedCount = 0;
      let errorCount = 0;
      const featureTriples: RDFTriple[] = [];

      features.forEach((feature, index) => {
        try {
          const triples = convertGeoJSONToTriples(feature, type);
          featureTriples.push(...triples);
          convertedCount++;

          if (index % 100 === 0 && index > 0) {
            console.log(`📊 Progress: ${index}/${features.length} ${type} features processed`);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Error converting ${type} feature ${index}:`, error);
        }
      });

      console.log(`📈 ${type}: ${convertedCount} converted, ${errorCount} errors, ${featureTriples.length} triples`);
      totalConvertedFeatures += convertedCount;
      totalErrors += errorCount;
      
      return featureTriples;
    };

    // 各データタイプを処理
    if (data.populationData.features.length > 0) {
      const populationTriples = processFeatures(data.populationData.features, "population");
      allTriples.push(...populationTriples);
    }

    if (data.landUseData.features.length > 0) {
      const landUseTriples = processFeatures(data.landUseData.features, "landuse");
      allTriples.push(...landUseTriples);
    }

    if (data.schoolData.features.length > 0) {
      const schoolTriples = processFeatures(data.schoolData.features, "school");
      allTriples.push(...schoolTriples);
    }

    if (data.medicalData.features.length > 0) {
      const medicalTriples = processFeatures(data.medicalData.features, "medical");
      allTriples.push(...medicalTriples);
    }

    if (data.disasterData.features.length > 0) {
      const disasterTriples = processFeatures(data.disasterData.features, "disaster");
      allTriples.push(...disasterTriples);
    }

    console.log(`✅ Successfully converted ${totalConvertedFeatures} features to ${allTriples.length} triples with ${totalErrors} errors`);

    // RDF4Jにバルクインサート
    if (allTriples.length > 0) {
      console.log("🚀 Starting bulk insert to RDF4J...");
      await bulkInsertTriples(store, allTriples, batchSize);
      console.log("✅ Bulk insert completed successfully");
    }

    return allTriples.length;
  } catch (error) {
    console.error("❌ Error saving data to RDF4J store:", error);
    throw error;
  }
}

// 特定の地域内の人口データを取得（RDF4J版）
export async function getPopulationInArea(
  store: RDF4JStore,
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
    const results = await executeRDF4JSPARQLQuery(store, query);

    return {
      type: "FeatureCollection",
      features: results.results?.bindings?.map((result: any) => ({
        type: "Feature",
        geometry: JSON.parse(result.geometry.value),
        properties: {
          population: parseFloat(result.population.value),
          meshId: result.meshId?.value || null,
          color: result.color?.value || null,
        },
      })) || [],
    };
  } catch (error) {
    console.error("Error executing population query:", error);
    return { type: "FeatureCollection", features: [] };
  }
}

// 後方互換性のための廃止予定関数
export function executeGeoSPARQLQuery(): any {
  throw new Error("executeGeoSPARQLQuery is deprecated. Use executeRDF4JSPARQLQuery instead.");
}

export async function getPopulationInAreaWithWKT(): Promise<FeatureCollection> {
  throw new Error("getPopulationInAreaWithWKT is deprecated. Use getPopulationInArea instead.");
}

export async function getFacilitiesInDisasterArea(): Promise<{
  schools: FeatureCollection<Point>;
  medical: FeatureCollection<Point>;
}> {
  throw new Error("getFacilitiesInDisasterArea is deprecated. Use RDF4J version instead.");
}