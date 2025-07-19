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
  // Land use predicates
  readonly hasLandUseData: string;
  readonly landUseCategory: string;
  readonly landUseCode: string;
  readonly landUseArea: string;
  readonly landUsePercentage: string;
}

export interface MLITClasses {
  readonly PopulationSnapshot: string;
  readonly Mesh: string;
  readonly AdministrativeArea: string;
  readonly LandUseData: string;
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
  // Land use predicates
  hasLandUseData: `${RDF_PREFIXES.mlit}hasLandUseData`,
  landUseCategory: `${RDF_PREFIXES.mlit}landUseCategory`,
  landUseCode: `${RDF_PREFIXES.mlit}landUseCode`,
  landUseArea: `${RDF_PREFIXES.mlit}landUseArea`,
  landUsePercentage: `${RDF_PREFIXES.mlit}landUsePercentage`,
} as const;

export const MLIT_CLASSES: MLITClasses = {
  PopulationSnapshot: `${RDF_PREFIXES.mlit}PopulationSnapshot`,
  Mesh: `${RDF_PREFIXES.mlit}Mesh`,
  AdministrativeArea: `${RDF_PREFIXES.mlit}AdministrativeArea`,
  LandUseData: `${RDF_PREFIXES.mlit}LandUseData`,
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
