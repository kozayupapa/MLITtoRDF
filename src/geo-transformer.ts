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
  generateLandUseIRI,
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
  landUseIRIs: string[];
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

    const meshId = feature.properties.MESH_ID || feature.properties.メッシュ;
    if (!meshId) {
      throw new Error('Feature missing required MESH_ID or メッシュ property');
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
          this.createDoubleLiteral(feature.properties.PTN_2020)
        )
      );
    }

    // Add population snapshots if requested
    const populationSnapshotIRIs: string[] = [];
    if (includePopulationSnapshots) {
      // Extract all available years from properties
      const availableYears = this.extractAllYearsFromProperties(
        feature.properties
      );

      for (const year of availableYears) {
        const snapshotIRI = generatePopulationSnapshotIRI(
          baseUri,
          meshId,
          year
        );
        populationSnapshotIRIs.push(snapshotIRI);

        const populationTriples = this.createPopulationSnapshot(
          feature.properties,
          featureIRI,
          snapshotIRI,
          year
        );
        triples.push(...populationTriples);
      }
    }

    // Add land use data
    const landUseIRIs: string[] = [];
    const landUseTriples = this.createLandUseData(
      feature.properties,
      featureIRI,
      baseUri,
      meshId
    );
    triples.push(...landUseTriples.triples);
    landUseIRIs.push(...landUseTriples.landUseIRIs);

    return {
      triples,
      featureIRI,
      geometryIRI,
      populationSnapshotIRIs,
      landUseIRIs,
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

    // Add total population for this year
    const totalPopulation = properties[`PTN_${year}`];
    if (totalPopulation !== undefined && totalPopulation !== null) {
      triples.push(
        this.createTriple(
          snapshotIRI,
          MLIT_PREDICATES.totalPopulation,
          this.createDoubleLiteral(totalPopulation)
        )
      );
    }

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
      { property: `PT20_${year}`, predicate: MLIT_PREDICATES.ageGroup95plus },
    ];

    // Add age group data
    for (const mapping of ageGroupMappings) {
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

    // Add age category data (PTA, PTB, PTC, PTD, PTE)
    const ageCategoryMappings = [
      { property: `PTA_${year}`, predicate: MLIT_PREDICATES.ageCategory0_14 },
      { property: `PTB_${year}`, predicate: MLIT_PREDICATES.ageCategory15_64 },
      { property: `PTC_${year}`, predicate: MLIT_PREDICATES.ageCategory65Plus },
      {
        property: `PTD_${year}`,
        predicate: MLIT_PREDICATES.ageCategory75plus,
      },
      {
        property: `PTE_${year}`,
        predicate: MLIT_PREDICATES.ageCategory80plus,
      },
    ];

    for (const mapping of ageCategoryMappings) {
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

    // Add ratio data if available
    const ratioMappings = [
      { property: `RTA_${year}`, predicate: MLIT_PREDICATES.ratioAge0_14 },
      { property: `RTB_${year}`, predicate: MLIT_PREDICATES.ratioAge15_64 },
      { property: `RTC_${year}`, predicate: MLIT_PREDICATES.ratioAge65Plus },
      { property: `RTD_${year}`, predicate: MLIT_PREDICATES.ratioAge75plus },
      { property: `RTE_${year}`, predicate: MLIT_PREDICATES.ratioAge80plus },
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
   * Create land use data triples
   */
  private createLandUseData(
    properties: any,
    featureIRI: string,
    baseUri: string,
    meshId: string
  ): { triples: RDFTriple[]; landUseIRIs: string[] } {
    const triples: RDFTriple[] = [];
    const landUseIRIs: string[] = [];

    // 土地利用分類のプロパティをマッピング
    const landUseCategories = [
      { property: '田', code: 'rice_field' },
      { property: 'その他の農用地', code: 'other_agricultural' },
      { property: '森林', code: 'forest' },
      { property: '荒地', code: 'wasteland' },
      { property: '建物用地', code: 'building_land' },
      { property: '道路', code: 'road' },
      { property: '鉄道', code: 'railway' },
      { property: 'その他の用地', code: 'other_land' },
      { property: '河川地及び湖沼', code: 'water_body' },
      { property: '海浜', code: 'beach' },
      { property: '海水域', code: 'sea_area' },
      { property: 'ゴルフ場', code: 'golf_course' },
      { property: '解析範囲外', code: 'out_of_range' },
    ];

    // 各土地利用分類のデータを処理
    for (const category of landUseCategories) {
      const area = properties[category.property];
      if (area !== undefined && area !== null && area > 0) {
        const landUseIRI = generateLandUseIRI(baseUri, meshId, category.code);
        landUseIRIs.push(landUseIRI);

        // タイプ宣言
        triples.push(
          this.createTriple(
            landUseIRI,
            `${RDF_PREFIXES.rdf}type`,
            MLIT_CLASSES.LandUseData
          )
        );

        // メッシュとの関連付け
        triples.push(
          this.createTriple(
            featureIRI,
            MLIT_PREDICATES.hasLandUseData,
            landUseIRI
          )
        );

        // 土地利用カテゴリ
        triples.push(
          this.createTriple(
            landUseIRI,
            MLIT_PREDICATES.landUseCategory,
            this.createStringLiteral(category.property)
          )
        );

        // 土地利用コード
        triples.push(
          this.createTriple(
            landUseIRI,
            MLIT_PREDICATES.landUseCode,
            this.createStringLiteral(category.code)
          )
        );

        // 面積
        triples.push(
          this.createTriple(
            landUseIRI,
            MLIT_PREDICATES.landUseArea,
            this.createDoubleLiteral(area)
          )
        );
      }
    }

    return { triples, landUseIRIs };
  }

  /**
   * Extract all years from feature properties
   */
  private extractAllYearsFromProperties(properties: any): string[] {
    // Look for population data properties with year suffixes
    const yearPattern = /PTN_(\d{4})/;
    const years = new Set<string>();

    for (const key of Object.keys(properties)) {
      const match = key.match(yearPattern);
      if (match) {
        years.add(match[1]);
      }
    }

    return Array.from(years).sort();
  }

  /**
   * Extract year from feature properties (legacy method)
   */
  private extractYearFromProperties(properties: any): string | null {
    const years = this.extractAllYearsFromProperties(properties);
    return years.length > 0 ? years[0] : null;
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
