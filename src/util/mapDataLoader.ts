import { LAND_USE_COLORS, type PopulationMeshData, type LandUseMeshData, type SchoolFeature, type MedicalFeature } from "../types/geoData";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

interface SurfaceData {
  surfaceId: string;
  curveId: string;
  coordinates: number[][];
}

export const POPULATION_COLOR_THRESHOLDS = [
  { threshold: 0, color: "#ffffff", label: "0人" },
  { threshold: 100, color: "#ffffcc", label: "100人" },
  { threshold: 500, color: "#ffeda0", label: "500人" },
  { threshold: 1000, color: "#fed976", label: "1,000人" },
  { threshold: 5000, color: "#feb24c", label: "5,000人" },
  { threshold: 10000, color: "#fd8d3c", label: "10,000人" },
] as const;

function parseCurveCoordinates(curve: any): { curveId: string; coordinates: number[][] } | null {
  const curveId = curve.getAttribute("gml:id");
  if (!curveId) {
    return null;
  }

  const posLists = curve.getElementsByTagName("gml:posList");
  if (posLists.length === 0 || !posLists[0].textContent) {
    return null;
  }

  const coordinates = posLists[0].textContent
    .trim()
    .split(/\s+/u)
    .map(Number)
    .reduce((acc: number[][], value: number, index: number) => {
      if (index % 2 === 0) {
        acc.push([0, value]);
      } else {
        acc[acc.length - 1][0] = value;
      }
      return acc;
    }, [] as number[][]);

  return { curveId, coordinates };
}

function parseSurfaceData(surface: any, curveCoordinates: Map<string, number[][]>): SurfaceData | null {
  const surfaceId = surface.getAttribute("gml:id");
  if (!surfaceId) {
    return null;
  }

  const curveMembers = surface.getElementsByTagName("gml:curveMember");
  if (curveMembers.length === 0) {
    return null;
  }

  const curveRef = curveMembers[0].getAttribute("xlink:href");
  const curveId = curveRef?.replace("#_", "");

  if (!curveId || !curveCoordinates.has(curveId)) {
    return null;
  }

  return {
    surfaceId,
    curveId,
    coordinates: curveCoordinates.get(curveId) || [],
  };
}

function parseMeshData(mesh: any, surfaceDataMap: Map<string, SurfaceData>): PopulationMeshData | null {
  const getElementText = (tagName: string): string => {
    const elements = mesh.getElementsByTagName(`ksj:${tagName}`);
    if (elements.length === 0) {
      const elementsWithoutNS = mesh.getElementsByTagName(tagName);
      if (elementsWithoutNS.length === 0) {
        return "0";
      }
      return elementsWithoutNS[0].textContent?.trim() || "0";
    }
    return elements[0].textContent?.trim() || "0";
  };

  const meshId = getElementText("meshCode");
  const boundsElements = mesh.getElementsByTagName("ksj:bounds");
  if (boundsElements.length === 0) {
    return null;
  }

  const boundsRef = boundsElements[0].getAttribute("xlink:href");
  const surfaceId = boundsRef?.replace("#", "");

  if (!surfaceId || !surfaceDataMap.has(surfaceId)) {
    return null;
  }

  const surfaceData = surfaceDataMap.get(surfaceId);
  if (!surfaceData) {
    return null;
  }

  return {
    MESH_ID: meshId,
    SHICODE: getElementText("administrativeAreaCode"),
    PTN_2020: Math.round(Number(getElementText("totalPopulationOf2020"))),
    PTN_2024: Math.round(Number(getElementText("totalPopulationIn2025"))),
    PT00_2024: Math.round(Number(getElementText("totalPopulationIn2025"))),
    coordinates: surfaceData.coordinates,
  };
}

export async function parsePopulationXML(xmlPath: string): Promise<PopulationMeshData[]> {
  try {
    const response = await fetch(xmlPath);
    const xmlText = await response.text();

    const parser = new (globalThis as any).DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // メッシュの境界情報を取得
    const surfaceDataMap = new Map<string, SurfaceData>();

    // Curveの情報を先に取得
    const curveCoordinates = new Map<string, number[][]>();
    const curves = xmlDoc.getElementsByTagName("gml:Curve");
    for (const curve of curves) {
      const result = parseCurveCoordinates(curve);
      if (result) {
        curveCoordinates.set(result.curveId, result.coordinates);
      }
    }

    // Surfaceの情報を取得し、対応するCurveと紐付け
    const surfaces = xmlDoc.getElementsByTagName("gml:Surface");
    for (const surface of surfaces) {
      const surfaceData = parseSurfaceData(surface, curveCoordinates);
      if (surfaceData) {
        surfaceDataMap.set(surfaceData.surfaceId, surfaceData);
      }
    }

    // 人口データを取得
    const meshDataList: PopulationMeshData[] = [];
    const meshElements = xmlDoc.getElementsByTagName("ksj:estimatedPopulationMesh1km");

    for (const mesh of meshElements) {
      const meshData = parseMeshData(mesh, surfaceDataMap);
      if (meshData) {
        meshDataList.push(meshData);
      }
    }

    return meshDataList;
  } catch (error) {
    console.error("Error parsing population XML:", error);
    return [];
  }
}

export async function mergeLandUseData(paths: string[]): Promise<LandUseMeshData[]> {
  try {
    const dataPromises = paths.map((path) => fetch(path).then((res) => res.json()));
    const results = await Promise.all(dataPromises);

    return results.flatMap((result: any) =>
      result.features.map((feature: any) => ({
        L03b_001: feature.properties?.L03b_001 || "",
        L03b_002: feature.properties?.L03b_002 || "",
        L03b_003: feature.properties?.L03b_003 || "",
      })),
    );
  } catch (error) {
    console.error("Error merging land use data:", error);
    return [];
  }
}

export function meshIdToLatLng(meshId: string): [number, number] {
  console.log("Converting mesh ID to lat/lng:", meshId);

  // メッシュコードの各部分を分解
  const lat1 = Math.floor(Number(meshId.substring(0, 2)) / 1.5);
  const lng1 = Number(meshId.substring(2, 4));
  const lat2 = Number(meshId.substring(4, 5)) / 8;
  const lng2 = Number(meshId.substring(5, 6)) / 8;
  const lat3 = Number(meshId.substring(6, 7)) / 80;
  const lng3 = Number(meshId.substring(7, 8)) / 80;

  // 石川県の中心座標（金沢市）を基準に調整
  const baseLng = 136.6; // 金沢市の経度
  const baseLat = 36.5; // 金沢市の緯度

  const result: [number, number] = [
    baseLng + (lng1 + lng2 + lng3 - 36), // 経度（金沢を基準に調整）
    baseLat + (lat1 + lat2 + lat3 - 36), // 緯度（金沢を基準に調整）
  ];

  console.log("Mesh conversion details:", {
    meshId,
    components: {
      lat1,
      lng1,
      lat2,
      lng2,
      lat3,
      lng3,
    },
    baseCoordinates: {
      baseLng,
      baseLat,
    },
    result,
  });

  return result;
}

export function createMeshPolygon(meshId: string): number[][] {
  const [lng, lat] = meshIdToLatLng(meshId);
  const meshSize = 1 / 80;

  return [
    [lng, lat],
    [lng + meshSize, lat],
    [lng + meshSize, lat + meshSize],
    [lng, lat + meshSize],
    [lng, lat],
  ];
}

export function createPopulationLayer(data: PopulationMeshData[]): FeatureCollection {
  const features = data.map((mesh): Feature<Polygon> => {
    if (!mesh.coordinates || mesh.coordinates.length === 0) {
      const fallbackCoords = createMeshPolygon(mesh.MESH_ID);
      return {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [fallbackCoords],
        },
        properties: {
          population: mesh.PT00_2024,
          meshId: mesh.MESH_ID,
          color: getPopulationColor(mesh.PT00_2024),
          shicode: mesh.SHICODE,
          population2020: mesh.PTN_2020,
          population2024: mesh.PTN_2024,
        },
      };
    }

    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [mesh.coordinates],
      },
      properties: {
        population: mesh.PT00_2024,
        meshId: mesh.MESH_ID,
        color: getPopulationColor(mesh.PT00_2024),
        shicode: mesh.SHICODE,
        population2020: mesh.PTN_2020,
        population2024: mesh.PTN_2024,
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

export function createLandUseLayer(data: LandUseMeshData[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: data.map(
      (mesh: any): any => ({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [createMeshPolygon(mesh.L03b_001)],
        },
        properties: {
          landUseCode: mesh.L03b_002,
          meshId: mesh.L03b_001,
          color: LAND_USE_COLORS[mesh.L03b_002] || "#CCCCCC",
        },
      }),
    ),
  };
}

export function createSchoolLayer(data: FeatureCollection<Point, SchoolFeature["properties"]>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: data.features.map(
      (feature: any): any => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          P29_001: feature.properties?.P29_001 || "",
          P29_002: feature.properties?.P29_002 || "",
          P29_003: feature.properties?.P29_003 || "",
          P29_004: feature.properties?.P29_004 || "",
          P29_005: feature.properties?.P29_005 || "",
          P29_006: feature.properties?.P29_006 || "",
          P29_007: feature.properties?.P29_007 || "",
        },
      }),
    ),
  };
}

export function createMedicalLayer(data: FeatureCollection<Point, MedicalFeature["properties"]>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: data.features.map(
      (feature: any): any => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: {
          P04_001: feature.properties?.P04_001 || "",
          P04_002: feature.properties?.P04_002 || "",
          P04_003: feature.properties?.P04_003 || "",
          P04_004: feature.properties?.P04_004 || "",
          P04_007: feature.properties?.P04_007 || "",
          P04_008: feature.properties?.P04_008 || 0,
          P04_009: feature.properties?.P04_009 || "",
          P04_010: feature.properties?.P04_010 || "",
        },
      }),
    ),
  };
}

export function getPopulationColor(population: number): string {
  for (const { threshold, color } of POPULATION_COLOR_THRESHOLDS) {
    if (population <= threshold) return color;
  }
  return POPULATION_COLOR_THRESHOLDS[POPULATION_COLOR_THRESHOLDS.length - 1].color;
}

// 人口データをXMLから読み込み、GeoJSONに変換し、RDF4Jストアに保存する統合関数
export async function loadPopulationDataToRDF4J(
  xmlPath: string,
  rdf4jStore: { baseUrl: string; repositoryId: string },
  batchSize: number = 1000
): Promise<{ 
  populationData: PopulationMeshData[];
  geoJSON: FeatureCollection;
  rdfTripleCount: number;
}> {
  console.log("🔄 Starting population data processing pipeline...");
  
  try {
    // 1. XMLから人口データを解析
    console.log("📖 Parsing population XML...");
    const populationData = await parsePopulationXML(xmlPath);
    console.log(`✅ Parsed ${populationData.length} population mesh records`);
    
    if (populationData.length === 0) {
      throw new Error("No population data found in XML");
    }
    
    // 2. GeoJSONレイヤーを作成
    console.log("🗺️ Creating GeoJSON layer...");
    const geoJSON = createPopulationLayer(populationData);
    console.log(`✅ Created GeoJSON with ${geoJSON.features.length} features`);
    
    // 3. RDF4Jストアに保存
    console.log("💾 Saving to RDF4J store...");
    const { saveDataToRDF4J } = await import("./geoSPARQLUtil");
    
    // 空のダミーデータで他のコレクションを初期化
    const emptyCollection = { type: "FeatureCollection" as const, features: [] };
    
    const tripleCount = await saveDataToRDF4J(rdf4jStore, {
      populationData: geoJSON,
      landUseData: emptyCollection,
      schoolData: emptyCollection,
      medicalData: emptyCollection,
      disasterData: emptyCollection,
    }, batchSize);
    
    console.log(`✅ Population data processing complete. ${tripleCount} triples in store.`);
    
    return {
      populationData,
      geoJSON,
      rdfTripleCount: tripleCount,
    };
    
  } catch (error) {
    console.error("❌ Error in population data processing pipeline:", error);
    throw error;
  }
}
