/**
 * Geo Transformer Module
 * Converts GeoJSON features to GeoSPARQL-compliant RDF triples
 * Handles coordinate reference system transformation from JGD2011 to WGS84
 */

import proj4 from 'proj4';
import { Logger } from 'winston';
import { GeoJSONFeature } from './data-parser';
import wellknown from 'wellknown';
import {
  RDF_PREFIXES,
  MLIT_PREDICATES,
  MLIT_CLASSES,
  WGS84_CRS_URI,
  generateMeshIRI,
  generateGeometryIRI,
  generatePopulationSnapshotIRI,
} from './ontology-config';

export interface TransformerOptions {
  baseUri: string;
  logger?: Logger;
  includePopulationSnapshots?: boolean;
}

export interface RDFTriple {
  subject: string;
  predicate: string;
  object: string;
}

export interface TransformationResult {
  triples: RDFTriple[];
  featureIRI: string;
  geometryIRI: string;
  populationSnapshotIRIs: string[];
}

/**
 * GeoJSON to GeoSPARQL transformer
 * Handles coordinate transformation and RDF triple generation
 */
export class GeoSPARQLTransformer {
  private readonly options: TransformerOptions;
  private readonly logger: Logger;

  // Define coordinate reference systems
  private readonly jgd2011: string = '+proj=longlat +datum=JGD2011 +no_defs';
  private readonly wgs84: string = '+proj=longlat +datum=WGS84 +no_defs';

  constructor(options: TransformerOptions) {
    this.options = options;
    this.logger = options.logger || (console as any);

    // Define JGD2011 projection if not already defined
    if (!proj4.defs('JGD2011')) {
      proj4.defs('JGD2011', this.jgd2011);
    }

    // Define WGS84 projection if not already defined
    if (!proj4.defs('WGS84')) {
      proj4.defs('WGS84', this.wgs84);
    }
  }

  /**
   * Transform a GeoJSON feature to RDF triples
   */
  public transformFeature(feature: GeoJSONFeature): TransformationResult {
    const { baseUri, includePopulationSnapshots = true } = this.options;
    const triples: RDFTriple[] = [];

    const meshId = feature.properties.MESH_ID;
    if (!meshId) {
      throw new Error('Feature missing required MESH_ID property');
    }

    // Extract year from properties (look for patterns like PT01_2025, PT01_2030, etc.)
    const year = this.extractYearFromProperties(feature.properties);

    // Generate IRIs
    const featureIRI = generateMeshIRI(baseUri, meshId, year as string);
    const geometryIRI = generateGeometryIRI(baseUri, meshId, year as string);

    // Add type declarations
    triples.push(
      this.createTriple(
        featureIRI,
        `${RDF_PREFIXES.rdf}type`,
        `${RDF_PREFIXES.geo}Feature`
      ),
      this.createTriple(
        featureIRI,
        `${RDF_PREFIXES.rdf}type`,
        MLIT_CLASSES.Mesh
      ),
      this.createTriple(
        geometryIRI,
        `${RDF_PREFIXES.rdf}type`,
        `${RDF_PREFIXES.geo}Geometry`
      )
    );

    // Link feature to geometry
    triples.push(
      this.createTriple(
        featureIRI,
        `${RDF_PREFIXES.geo}hasGeometry`,
        geometryIRI
      )
    );

    // Transform and add geometry
    const wktGeometry = this.transformGeometry(feature.geometry);
    triples.push(
      this.createTriple(
        geometryIRI,
        `${RDF_PREFIXES.geo}wktLiteral`,
        this.createWKTLiteral(wktGeometry)
      )
    );

    // Add basic properties
    triples.push(
      this.createTriple(
        featureIRI,
        MLIT_PREDICATES.meshId,
        this.createStringLiteral(meshId)
      )
    );

    if (feature.properties.SHICODE) {
      triples.push(
        this.createTriple(
          featureIRI,
          MLIT_PREDICATES.administrativeCode,
          this.createStringLiteral(feature.properties.SHICODE.toString())
        )
      );
    }

    if (feature.properties.PTN_2020) {
      triples.push(
        this.createTriple(
          featureIRI,
          MLIT_PREDICATES.totalPopulation2020,
          this.createIntegerLiteral(feature.properties.PTN_2020)
        )
      );
    }

    // Add population snapshots if requested
    const populationSnapshotIRIs: string[] = [];
    if (includePopulationSnapshots && year) {
      const snapshotIRI = generatePopulationSnapshotIRI(baseUri, meshId, year);
      populationSnapshotIRIs.push(snapshotIRI);

      const populationTriples = this.createPopulationSnapshot(
        feature.properties,
        featureIRI,
        snapshotIRI,
        year
      );
      triples.push(...populationTriples);
    }

    return {
      triples,
      featureIRI,
      geometryIRI,
      populationSnapshotIRIs,
    };
  }

  /**
   * Transform geometry from JGD2011 to WGS84 and convert to WKT
   */
  private transformGeometry(geometry: any): string {
    try {
      // Transform coordinates from JGD2011 to WGS84
      const transformedGeometry = this.transformCoordinates(geometry);

      // Convert to WKT
      const wkt = wellknown.stringify(transformedGeometry);
      return wkt;
    } catch (error) {
      this.logger.error('Error transforming geometry:', error);
      throw new Error(`Failed to transform geometry: ${error}`);
    }
  }

  /**
   * Recursively transform coordinates from JGD2011 to WGS84
   */
  private transformCoordinates(geometry: any): any {
    const transformedGeometry = { ...geometry };

    if (geometry.coordinates) {
      transformedGeometry.coordinates = this.transformCoordinateArray(
        geometry.coordinates
      );
    }

    return transformedGeometry;
  }

  /**
   * Transform coordinate arrays recursively
   */
  private transformCoordinateArray(coordinates: any): any {
    if (Array.isArray(coordinates)) {
      // Check if this is a coordinate pair [lng, lat]
      if (
        coordinates.length === 2 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
      ) {
        // Transform single coordinate pair
        const [lng, lat] = coordinates;
        const transformed = proj4('JGD2011', 'WGS84', [lng, lat]);
        return [transformed[0], transformed[1]];
      } else {
        // Recursively transform nested arrays
        return coordinates.map((coord: any) =>
          this.transformCoordinateArray(coord)
        );
      }
    }
    return coordinates;
  }

  /**
   * Create population snapshot triples
   */
  private createPopulationSnapshot(
    properties: any,
    featureIRI: string,
    snapshotIRI: string,
    year: string
  ): RDFTriple[] {
    const triples: RDFTriple[] = [];

    // Add type and basic properties
    triples.push(
      this.createTriple(
        snapshotIRI,
        `${RDF_PREFIXES.rdf}type`,
        MLIT_CLASSES.PopulationSnapshot
      ),
      this.createTriple(
        featureIRI,
        MLIT_PREDICATES.hasPopulationData,
        snapshotIRI
      ),
      this.createTriple(
        snapshotIRI,
        MLIT_PREDICATES.populationYear,
        this.createIntegerLiteral(parseInt(year))
      )
    );

    // Map age group properties
    const ageGroupMappings = [
      { property: `PT01_${year}`, predicate: MLIT_PREDICATES.ageGroup0_4 },
      { property: `PT02_${year}`, predicate: MLIT_PREDICATES.ageGroup5_9 },
      { property: `PT03_${year}`, predicate: MLIT_PREDICATES.ageGroup10_14 },
      { property: `PT04_${year}`, predicate: MLIT_PREDICATES.ageGroup15_19 },
      { property: `PT05_${year}`, predicate: MLIT_PREDICATES.ageGroup20_24 },
      { property: `PT06_${year}`, predicate: MLIT_PREDICATES.ageGroup25_29 },
      { property: `PT07_${year}`, predicate: MLIT_PREDICATES.ageGroup30_34 },
      { property: `PT08_${year}`, predicate: MLIT_PREDICATES.ageGroup35_39 },
      { property: `PT09_${year}`, predicate: MLIT_PREDICATES.ageGroup40_44 },
      { property: `PT10_${year}`, predicate: MLIT_PREDICATES.ageGroup45_49 },
      { property: `PT11_${year}`, predicate: MLIT_PREDICATES.ageGroup50_54 },
      { property: `PT12_${year}`, predicate: MLIT_PREDICATES.ageGroup55_59 },
      { property: `PT13_${year}`, predicate: MLIT_PREDICATES.ageGroup60_64 },
      { property: `PT14_${year}`, predicate: MLIT_PREDICATES.ageGroup65_69 },
      { property: `PT15_${year}`, predicate: MLIT_PREDICATES.ageGroup70_74 },
      { property: `PT16_${year}`, predicate: MLIT_PREDICATES.ageGroup75_79 },
      { property: `PT17_${year}`, predicate: MLIT_PREDICATES.ageGroup80_84 },
      { property: `PT18_${year}`, predicate: MLIT_PREDICATES.ageGroup85_89 },
      { property: `PT19_${year}`, predicate: MLIT_PREDICATES.ageGroup90_94 },
      { property: `PT20_${year}`, predicate: MLIT_PREDICATES.ageGroup95_99 },
      { property: `PT21_${year}`, predicate: MLIT_PREDICATES.ageGroup100Plus },
    ];

    // Add age group data
    for (const mapping of ageGroupMappings) {
      const value = properties[mapping.property];
      if (value !== undefined && value !== null) {
        triples.push(
          this.createTriple(
            snapshotIRI,
            mapping.predicate,
            this.createIntegerLiteral(value)
          )
        );
      }
    }

    // Add ratio data if available
    const ratioMappings = [
      { property: `RTA_${year}`, predicate: MLIT_PREDICATES.ratioTotal },
      { property: `RTB_${year}`, predicate: MLIT_PREDICATES.ratioMale },
      { property: `RTC_${year}`, predicate: MLIT_PREDICATES.ratioFemale },
      { property: `RTD_${year}`, predicate: MLIT_PREDICATES.ratioAge0_14 },
      { property: `RTE_${year}`, predicate: MLIT_PREDICATES.ratioAge15_64 },
      { property: `RTF_${year}`, predicate: MLIT_PREDICATES.ratioAge65Plus },
    ];

    for (const mapping of ratioMappings) {
      const value = properties[mapping.property];
      if (value !== undefined && value !== null) {
        triples.push(
          this.createTriple(
            snapshotIRI,
            mapping.predicate,
            this.createDoubleLiteral(value)
          )
        );
      }
    }

    return triples;
  }

  /**
   * Extract year from feature properties
   */
  private extractYearFromProperties(properties: any): string | null {
    // Look for population data properties with year suffixes
    const yearPattern = /PT\d{2}_(\d{4})/;

    for (const key of Object.keys(properties)) {
      const match = key.match(yearPattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Create an RDF triple
   */
  private createTriple(
    subject: string,
    predicate: string,
    object: string
  ): RDFTriple {
    return { subject, predicate, object };
  }

  /**
   * Create a WKT literal with CRS
   */
  private createWKTLiteral(wkt: string): string {
    return `"${WGS84_CRS_URI} ${wkt}"^^<${RDF_PREFIXES.geo}wktLiteral>`;
  }

  /**
   * Create a string literal
   */
  private createStringLiteral(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"^^<${RDF_PREFIXES.xsd}string>`;
  }

  /**
   * Create an integer literal
   */
  private createIntegerLiteral(value: number): string {
    return `"${value}"^^<${RDF_PREFIXES.xsd}integer>`;
  }

  /**
   * Create a double literal
   */
  private createDoubleLiteral(value: number): string {
    return `"${value}"^^<${RDF_PREFIXES.xsd}double>`;
  }
}

/**
 * Utility function to create a transformer with default configuration
 */
export function createGeoSPARQLTransformer(
  baseUri: string,
  options: Partial<TransformerOptions> = {}
): GeoSPARQLTransformer {
  return new GeoSPARQLTransformer({
    baseUri,
    ...options,
  });
}
