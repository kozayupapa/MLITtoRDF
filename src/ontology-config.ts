/**
 * RDF Ontology Configuration for MLIT GeoJSON Data
 * Defines custom RDF prefixes, predicates, and URIs for modeling Japanese administrative data
 */

export interface RDFPrefixes {
  readonly geo: string;
  readonly mlit: string;
  readonly rdf: string;
  readonly rdfs: string;
  readonly xsd: string;
}

export interface MLITPredicates {
  readonly meshId: string;
  readonly administrativeCode: string;
  readonly prefectureCode: string;
  readonly totalPopulation2020: string;
  readonly totalPopulation: string;
  readonly hasPopulationData: string;
  readonly populationYear: string;
  readonly ageGroup0_4: string;
  readonly ageGroup5_9: string;
  readonly ageGroup10_14: string;
  readonly ageGroup15_19: string;
  readonly ageGroup20_24: string;
  readonly ageGroup25_29: string;
  readonly ageGroup30_34: string;
  readonly ageGroup35_39: string;
  readonly ageGroup40_44: string;
  readonly ageGroup45_49: string;
  readonly ageGroup50_54: string;
  readonly ageGroup55_59: string;
  readonly ageGroup60_64: string;
  readonly ageGroup65_69: string;
  readonly ageGroup70_74: string;
  readonly ageGroup75_79: string;
  readonly ageGroup80_84: string;
  readonly ageGroup85_89: string;
  readonly ageGroup90_94: string;
  readonly ageGroup95plus: string;
  readonly ageCategory0_14: string;
  readonly ageCategory15_64: string;
  readonly ageCategory65Plus: string;
  readonly ageCategory75plus: string;
  readonly ageCategory80plus: string;
  readonly ratioAge0_14: string;
  readonly ratioAge15_64: string;
  readonly ratioAge65Plus: string;
  readonly ratioAge75plus: string;
  readonly ratioAge80plus: string;
  // Land use predicates (legacy - for backward compatibility)
  readonly hasLandUseData: string;
  readonly landUseCategory: string;
  readonly landUseCode: string;
  readonly landUseArea: string;
  readonly landUsePercentage: string;
  // Direct land use area properties (optimized)
  readonly riceFieldArea: string;
  readonly otherAgriculturalArea: string;
  readonly forestArea: string;
  readonly wastelandArea: string;
  readonly buildingLandArea: string;
  readonly roadArea: string;
  readonly railwayArea: string;
  readonly otherLandArea: string;
  readonly waterBodyArea: string;
  readonly beachArea: string;
  readonly seaArea: string;
  readonly golfCourseArea: string;
  readonly outOfRangeArea: string;
  // Disaster predicates
  readonly hasDisasterData: string;
  readonly disasterType: string;
  readonly severityLevel: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly affectedArea: string;
  readonly impactRadius: string;
  readonly priorityScore: string;
  // Flood hazard predicates
  readonly hasFloodHazardData: string;
  readonly floodDepthRank: string;
  readonly floodDurationRank: string;
  readonly hazardZoneType: string;
  readonly riverId: string;
  readonly riverName: string;
  readonly prefectureName: string;
}

export interface MLITClasses {
  readonly PopulationSnapshot: string;
  readonly Mesh: string;
  readonly AdministrativeArea: string;
  readonly LandUseData: string;
  readonly DisasterEvent: string;
  readonly SatelliteImagingArea: string;
  readonly FloodHazardZone: string;
  readonly FloodDepthRank: string;
  readonly FloodDurationRank: string;
  readonly HazardZoneType: string;
}

export const RDF_PREFIXES: RDFPrefixes = {
  geo: 'http://www.opengis.net/ont/geosparql#',
  mlit: 'http://example.org/mlit/ontology#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
} as const;

export const MLIT_PREDICATES: MLITPredicates = {
  meshId: `${RDF_PREFIXES.mlit}meshId`,
  administrativeCode: `${RDF_PREFIXES.mlit}administrativeCode`,
  prefectureCode: `${RDF_PREFIXES.mlit}prefectureCode`,
  totalPopulation2020: `${RDF_PREFIXES.mlit}totalPopulation2020`,
  totalPopulation: `${RDF_PREFIXES.mlit}totalPopulation`,
  hasPopulationData: `${RDF_PREFIXES.mlit}hasPopulationData`,
  populationYear: `${RDF_PREFIXES.mlit}populationYear`,
  ageGroup0_4: `${RDF_PREFIXES.mlit}ageGroup0_4`,
  ageGroup5_9: `${RDF_PREFIXES.mlit}ageGroup5_9`,
  ageGroup10_14: `${RDF_PREFIXES.mlit}ageGroup10_14`,
  ageGroup15_19: `${RDF_PREFIXES.mlit}ageGroup15_19`,
  ageGroup20_24: `${RDF_PREFIXES.mlit}ageGroup20_24`,
  ageGroup25_29: `${RDF_PREFIXES.mlit}ageGroup25_29`,
  ageGroup30_34: `${RDF_PREFIXES.mlit}ageGroup30_34`,
  ageGroup35_39: `${RDF_PREFIXES.mlit}ageGroup35_39`,
  ageGroup40_44: `${RDF_PREFIXES.mlit}ageGroup40_44`,
  ageGroup45_49: `${RDF_PREFIXES.mlit}ageGroup45_49`,
  ageGroup50_54: `${RDF_PREFIXES.mlit}ageGroup50_54`,
  ageGroup55_59: `${RDF_PREFIXES.mlit}ageGroup55_59`,
  ageGroup60_64: `${RDF_PREFIXES.mlit}ageGroup60_64`,
  ageGroup65_69: `${RDF_PREFIXES.mlit}ageGroup65_69`,
  ageGroup70_74: `${RDF_PREFIXES.mlit}ageGroup70_74`,
  ageGroup75_79: `${RDF_PREFIXES.mlit}ageGroup75_79`,
  ageGroup80_84: `${RDF_PREFIXES.mlit}ageGroup80_84`,
  ageGroup85_89: `${RDF_PREFIXES.mlit}ageGroup85_89`,
  ageGroup90_94: `${RDF_PREFIXES.mlit}ageGroup90_94`,
  ageGroup95plus: `${RDF_PREFIXES.mlit}ageGroup95plus`,
  ageCategory0_14: `${RDF_PREFIXES.mlit}ageCategory0_14`,
  ageCategory15_64: `${RDF_PREFIXES.mlit}ageCategory15_64`,
  ageCategory65Plus: `${RDF_PREFIXES.mlit}ageCategory65Plus`,
  ageCategory75plus: `${RDF_PREFIXES.mlit}ageCategory75plus`,
  ageCategory80plus: `${RDF_PREFIXES.mlit}ageCategory80plus`,
  ratioAge0_14: `${RDF_PREFIXES.mlit}ratioAge0_14`,
  ratioAge15_64: `${RDF_PREFIXES.mlit}ratioAge15_64`,
  ratioAge65Plus: `${RDF_PREFIXES.mlit}ratioAge65Plus`,
  ratioAge75plus: `${RDF_PREFIXES.mlit}ratioAge75plus`,
  ratioAge80plus: `${RDF_PREFIXES.mlit}ratioAge80plus`,
  // Land use predicates (legacy - for backward compatibility)
  hasLandUseData: `${RDF_PREFIXES.mlit}hasLandUseData`,
  landUseCategory: `${RDF_PREFIXES.mlit}landUseCategory`,
  landUseCode: `${RDF_PREFIXES.mlit}landUseCode`,
  landUseArea: `${RDF_PREFIXES.mlit}landUseArea`,
  landUsePercentage: `${RDF_PREFIXES.mlit}landUsePercentage`,
  // Direct land use area properties (optimized)
  riceFieldArea: `${RDF_PREFIXES.mlit}riceFieldArea`,
  otherAgriculturalArea: `${RDF_PREFIXES.mlit}otherAgriculturalArea`,
  forestArea: `${RDF_PREFIXES.mlit}forestArea`,
  wastelandArea: `${RDF_PREFIXES.mlit}wastelandArea`,
  buildingLandArea: `${RDF_PREFIXES.mlit}buildingLandArea`,
  roadArea: `${RDF_PREFIXES.mlit}roadArea`,
  railwayArea: `${RDF_PREFIXES.mlit}railwayArea`,
  otherLandArea: `${RDF_PREFIXES.mlit}otherLandArea`,
  waterBodyArea: `${RDF_PREFIXES.mlit}waterBodyArea`,
  beachArea: `${RDF_PREFIXES.mlit}beachArea`,
  seaArea: `${RDF_PREFIXES.mlit}seaArea`,
  golfCourseArea: `${RDF_PREFIXES.mlit}golfCourseArea`,
  outOfRangeArea: `${RDF_PREFIXES.mlit}outOfRangeArea`,
  // Disaster predicates
  hasDisasterData: `${RDF_PREFIXES.mlit}hasDisasterData`,
  disasterType: `${RDF_PREFIXES.mlit}disasterType`,
  severityLevel: `${RDF_PREFIXES.mlit}severityLevel`,
  startDate: `${RDF_PREFIXES.mlit}startDate`,
  endDate: `${RDF_PREFIXES.mlit}endDate`,
  affectedArea: `${RDF_PREFIXES.mlit}affectedArea`,
  impactRadius: `${RDF_PREFIXES.mlit}impactRadius`,
  priorityScore: `${RDF_PREFIXES.mlit}priorityScore`,
  // Flood hazard predicates
  hasFloodHazardData: `${RDF_PREFIXES.mlit}hasFloodHazardData`,
  floodDepthRank: `${RDF_PREFIXES.mlit}floodDepthRank`,
  floodDurationRank: `${RDF_PREFIXES.mlit}floodDurationRank`,
  hazardZoneType: `${RDF_PREFIXES.mlit}hazardZoneType`,
  riverId: `${RDF_PREFIXES.mlit}riverId`,
  riverName: `${RDF_PREFIXES.mlit}riverName`,
  prefectureName: `${RDF_PREFIXES.mlit}prefectureName`,
} as const;

export const MLIT_CLASSES: MLITClasses = {
  PopulationSnapshot: `${RDF_PREFIXES.mlit}PopulationSnapshot`,
  Mesh: `${RDF_PREFIXES.mlit}Mesh`,
  AdministrativeArea: `${RDF_PREFIXES.mlit}AdministrativeArea`,
  LandUseData: `${RDF_PREFIXES.mlit}LandUseData`,
  DisasterEvent: `${RDF_PREFIXES.mlit}DisasterEvent`,
  SatelliteImagingArea: `${RDF_PREFIXES.mlit}SatelliteImagingArea`,
  FloodHazardZone: `${RDF_PREFIXES.mlit}FloodHazardZone`,
  FloodDepthRank: `${RDF_PREFIXES.mlit}FloodDepthRank`,
  FloodDurationRank: `${RDF_PREFIXES.mlit}FloodDurationRank`,
  HazardZoneType: `${RDF_PREFIXES.mlit}HazardZoneType`,
} as const;

export const WGS84_CRS_URI = '<http://www.opengis.net/def/crs/OGC/1.3/CRS84>';

/**
 * Generate SPARQL prefix declarations for use in SPARQL queries
 */
export function generateSparqlPrefixes(): string {
  return Object.entries(RDF_PREFIXES)
    .map(([prefix, uri]) => `PREFIX ${prefix}: <${uri}>`)
    .join('\n');
}

/**
 * Generate a unique IRI for a mesh feature
 */
export function generateMeshIRI(
  baseUri: string,
  meshId: string,
  year?: string
): string {
  const suffix = year ? `${meshId}_${year}` : meshId;
  return `${baseUri}mesh/${suffix}`;
}

/**
 * Generate a unique IRI for a geometry
 */
export function generateGeometryIRI(
  baseUri: string,
  meshId: string,
  year?: string
): string {
  const suffix = year ? `${meshId}_${year}` : meshId;
  return `${baseUri}geometry/${suffix}_geom`;
}

/**
 * Generate a unique IRI for a population snapshot
 */
export function generatePopulationSnapshotIRI(
  baseUri: string,
  meshId: string,
  year: string
): string {
  return `${baseUri}population/${meshId}_${year}`;
}

/**
 * Generate a unique IRI for land use data
 */
export function generateLandUseIRI(
  baseUri: string,
  meshId: string,
  landUseCode?: string
): string {
  const suffix = landUseCode ? `${meshId}_${landUseCode}` : meshId;
  return `${baseUri}landuse/${suffix}`;
}

/**
 * Generate a unique IRI for a flood hazard zone
 */
export function generateFloodHazardZoneIRI(
  baseUri: string,
  riverId: string,
  hazardType: string,
  featureIndex?: number
): string {
  const suffix = featureIndex !== undefined ? 
    `${riverId}_${hazardType}_${featureIndex}` : 
    `${riverId}_${hazardType}`;
  return `${baseUri}floodhazard/${suffix}`;
}

/**
 * Generate a unique IRI for a river
 */
export function generateRiverIRI(
  baseUri: string,
  riverId: string
): string {
  return `${baseUri}river/${riverId}`;
}

// Flood depth rank mappings
export const FLOOD_DEPTH_RANKS = {
  1: { min: 0.0, max: 0.5, description: "0m以上0.5m未満" },
  2: { min: 0.5, max: 3.0, description: "0.5m以上3.0m未満" },
  3: { min: 3.0, max: 5.0, description: "3.0m以上5.0m未満" },
  4: { min: 5.0, max: 10.0, description: "5.0m以上10.0m未満" },
  5: { min: 10.0, max: 20.0, description: "10.0m以上20.0m未満" },
  6: { min: 20.0, max: Infinity, description: "20.0m以上" },
} as const;

// Flood duration rank mappings  
export const FLOOD_DURATION_RANKS = {
  1: { hours: 12, description: "12時間未満" },
  2: { hours: 24, description: "12時間以上24時間未満（1日間）" },
  3: { hours: 72, description: "24時間以上72時間未満（3日間）" },
  4: { hours: 168, description: "72時間以上168時間未満（1週間）" },
  5: { hours: 336, description: "168時間以上336時間未満（2週間）" },
  6: { hours: 672, description: "336時間以上672時間未満（4週間）" },
  7: { hours: Infinity, description: "672時間以上（4週間以上）" },
} as const;

// Hazard zone type mappings
export const HAZARD_ZONE_TYPES = {
  1: { type: "overflow", description: "氾濫流" },
  2: { type: "erosion", description: "河岸浸食" },
  3: { type: "both", description: "どちらも該当" },
} as const;
