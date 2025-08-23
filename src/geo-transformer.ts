/**
 * Geo Transformer Module
 * Converts GeoJSON features to GeoSPARQL-compliant RDF triples
 * Handles coordinate reference system transformation from JGD2011 to WGS84
 */

import proj4 from 'proj4';
import { createHash } from 'crypto';
import { Logger } from 'winston';
import { GeoJSONFeature } from './data-parser';
import wellknown from 'wellknown';
import * as turf from '@turf/turf';
import { simplify } from '@turf/simplify';
import {
  RDF_PREFIXES,
  MLIT_PREDICATES,
  MLIT_CLASSES,
  generateMeshIRI,
  generateGeometryIRI,
  generatePopulationSnapshotIRI,
  generateFloodHazardZoneIRI,
  generateRiverIRI,
  FLOOD_DEPTH_RANKS,
  FLOOD_DURATION_RANKS,
  HAZARD_ZONE_TYPES,
} from './ontology-config';

export interface TransformerOptions {
  baseUri: string;
  logger?: Logger;
  includePopulationSnapshots?: boolean;
  currentFilePath?: string;
  minFloodDepthRank?: number;
  useMinimalFloodProperties?: boolean;
  aggregateFloodZonesByRank?: boolean;
  enableSimplification?: boolean;
  simplificationTolerance?: number;
  simplificationHighQuality?: boolean;
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
  floodHazardZoneIRIs: string[];
}

export interface AggregatedFloodZone {
  riverId: string;
  riverName?: string;
  hazardType: string;
  rankCode: number;
  polygons: any[]; // GeoJSON Polygon geometries
  clusterId: number; // Spatial clustering ID for distance-based grouping
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
    // Check if this is flood hazard data based on properties
    if (this.isFloodHazardData(feature)) {
      return this.transformFloodHazardFeature(feature);
    }

    // Default to population/land use data transformation
    return this.transformPopulationLandUseFeature(feature);
  }

  /**
   * Transform features with intelligent processing mode selection
   */
  public transformFeatures(features: GeoJSONFeature[]): TransformationResult {
    // Determine the data type from features
    const dataType = this.determineDataType(features);

    if (dataType === 'flood-hazard' && this.options.aggregateFloodZonesByRank) {
      // Use aggregated processing for flood hazard data
      return this.transformFloodHazardFeatures(features);
    } else {
      // Use individual feature processing for other data types
      return this.transformIndividualFeatures(features);
    }
  }

  /**
   * Transform multiple flood hazard features with aggregation by rank
   */
  public transformFloodHazardFeatures(
    features: GeoJSONFeature[]
  ): TransformationResult {
    if (!this.options.aggregateFloodZonesByRank) {
      // Fallback to individual feature transformation
      return this.transformIndividualFeatures(features);
    }

    // Aggregate features by river, hazard type, and rank
    const aggregatedZones = this.aggregateFloodZonesByRank(features);
    return this.transformAggregatedFloodZones(aggregatedZones);
  }

  /**
   * Transform features individually (legacy mode)
   */
  private transformIndividualFeatures(
    features: GeoJSONFeature[]
  ): TransformationResult {
    const allTriples: RDFTriple[] = [];
    const allFloodHazardZoneIRIs: string[] = [];
    const allPopulationSnapshotIRIs: string[] = [];
    const allLandUseIRIs: string[] = [];

    for (const feature of features) {
      const result = this.transformFeature(feature);
      allTriples.push(...result.triples);
      allFloodHazardZoneIRIs.push(...result.floodHazardZoneIRIs);
      allPopulationSnapshotIRIs.push(...result.populationSnapshotIRIs);
      allLandUseIRIs.push(...result.landUseIRIs);
    }

    return {
      triples: allTriples,
      featureIRI: '',
      geometryIRI: '',
      populationSnapshotIRIs: allPopulationSnapshotIRIs,
      landUseIRIs: allLandUseIRIs,
      floodHazardZoneIRIs: allFloodHazardZoneIRIs,
    };
  }

  /**
   * Determine data type from features
   */
  private determineDataType(features: GeoJSONFeature[]): string {
    if (features.length === 0) {
      return 'unknown';
    }

    const firstFeature = features[0];
    if (!firstFeature.properties) {
      return 'unknown';
    }

    const props = firstFeature.properties;

    // Check for flood hazard properties
    if (props.A31a_101 || props.A31a_201 || props.A31a_301 || props.A31a_401) {
      return 'flood-hazard';
    }

    // Check for land use properties
    if (
      props.田 !== undefined ||
      props.森林 !== undefined ||
      props.メッシュ !== undefined
    ) {
      return 'land-use';
    }

    // Default to population data
    return 'population';
  }

  /**
   * Check if the feature contains flood hazard data
   */
  private isFloodHazardData(feature: GeoJSONFeature): boolean {
    const props = feature.properties;
    // Check for all possible flood hazard property patterns
    return !!(
      // 計画規模(A31a_1xx)
      (
        props.A31a_101 ||
        props.A31a_102 ||
        props.A31a_105 ||
        // 想定最大規模 (A31a_2xx)
        props.A31a_201 ||
        props.A31a_202 ||
        props.A31a_205 ||
        // 浸水継続時間 (A31a_3xx)
        props.A31a_301 ||
        props.A31a_302 ||
        props.A31a_305 ||
        // 家屋倒壊氾濫・河岸侵食 (A31a_4xx)
        props.A31a_401 ||
        props.A31a_402 ||
        props.A31a_405
      )
    );
  }

  /**
   * Transform a flood hazard GeoJSON feature to RDF triples
   */
  public transformFloodHazardFeature(
    feature: GeoJSONFeature
  ): TransformationResult {
    const { baseUri } = this.options;
    const triples: RDFTriple[] = [];
    const floodHazardZoneIRIs: string[] = [];

    const props = feature.properties;

    // Determine hazard type from file path or directory name
    const hazardType = this.determineHazardType(feature);

    // Get appropriate property mappings based on hazard type
    const propertyMappings = this.getPropertyMappings(hazardType);

    const riverId = props[propertyMappings.riverIdProp];
    const riverName = props[propertyMappings.riverNameProp];
    const rankCode = props[propertyMappings.rangeProp];

    if (!riverId) {
      throw new Error(
        `Flood hazard feature missing required river ID (${propertyMappings.riverIdProp})`
      );
    }

    // Filter out low-rank flood depth data for data reduction
    if (this.shouldSkipLowRankFeature(hazardType, rankCode)) {
      return {
        triples: [],
        featureIRI: '',
        geometryIRI: '',
        populationSnapshotIRIs: [],
        landUseIRIs: [],
        floodHazardZoneIRIs: [],
      };
    }

    // Generate unique identifier from geometry hash to distinguish features with same riverId
    const geometryHash = this.generateGeometryHash(feature.geometry);
    const uniqueId = `${riverId}_${geometryHash.substring(0, 8)}`;

    // Generate IRIs with unique identifier
    const hazardZoneIRI = generateFloodHazardZoneIRI(
      baseUri,
      uniqueId,
      hazardType
    );
    const geometryIRI = `${hazardZoneIRI}_geom`;
    const riverIRI = generateRiverIRI(baseUri, riverId);

    floodHazardZoneIRIs.push(hazardZoneIRI);

    // Add type declarations
    triples.push(
      this.createTriple(
        hazardZoneIRI,
        `${RDF_PREFIXES.rdf}type`,
        `${RDF_PREFIXES.geo}Feature`
      ),
      this.createTriple(
        hazardZoneIRI,
        `${RDF_PREFIXES.rdf}type`,
        MLIT_CLASSES.FloodHazardZone
      ),
      this.createTriple(
        geometryIRI,
        `${RDF_PREFIXES.rdf}type`,
        `${RDF_PREFIXES.geo}Geometry`
      )
    );

    // Link hazard zone to geometry
    triples.push(
      this.createTriple(
        hazardZoneIRI,
        `${RDF_PREFIXES.geo}hasGeometry`,
        geometryIRI
      )
    );

    // Transform and add geometry
    const wktGeometry = this.transformGeometry(feature.geometry);
    triples.push(
      this.createTriple(
        geometryIRI,
        `${RDF_PREFIXES.geo}asWKT`,
        this.createWKTLiteral(wktGeometry)
      )
    );

    // Add geometry center point for search performance
    const centerPoint = this.calculateGeometryCenter(feature.geometry);
    const centerIRI = `${geometryIRI}_center`;
    triples.push(
      this.createTriple(
        centerIRI,
        `${RDF_PREFIXES.rdf}type`,
        `${RDF_PREFIXES.geo}Geometry`
      ),
      this.createTriple(
        centerIRI,
        `${RDF_PREFIXES.geo}asWKT`,
        this.createWKTLiteral(centerPoint)
      ),
      this.createTriple(
        hazardZoneIRI,
        `${RDF_PREFIXES.geo}hasCentroid`,
        centerIRI
      )
    );

    // Add simplified geometry for low zoom level display
    if (this.options.enableSimplification) {
      const simplifiedTriples = this.createSimplifiedGeometryForFeature(
        feature,
        hazardZoneIRI
      );
      triples.push(...simplifiedTriples);
    }

    // Use minimal or full properties based on configuration
    if (this.options.useMinimalFloodProperties) {
      this.addMinimalFloodProperties(
        triples,
        hazardZoneIRI,
        hazardType,
        rankCode
      );
    } else {
      this.addFullFloodProperties(
        triples,
        hazardZoneIRI,
        riverIRI,
        riverId,
        riverName,
        hazardType,
        rankCode
      );
    }

    return {
      triples,
      featureIRI: hazardZoneIRI,
      geometryIRI,
      populationSnapshotIRIs: [],
      landUseIRIs: [],
      floodHazardZoneIRIs,
    };
  }

  /**
   * Get property mappings based on hazard type
   */
  private getPropertyMappings(hazardType: string): {
    riverIdProp: string;
    riverNameProp: string;
    rangeProp: string;
  } {
    if (hazardType === 'planned_scale_depth') {
      // 計画規模
      return {
        riverIdProp: 'A31a_101',
        riverNameProp: 'A31a_102',
        rangeProp: 'A31a_105',
      };
    } else if (hazardType === 'maximum_assumed_depth') {
      // 想定最大規模
      return {
        riverIdProp: 'A31a_201',
        riverNameProp: 'A31a_202',
        rangeProp: 'A31a_205',
      };
    } else if (hazardType === 'flood_duration') {
      // 浸水継続時間 uses A31a_305
      return {
        riverIdProp: 'A31a_301',
        riverNameProp: 'A31a_302',
        rangeProp: 'A31a_305',
      };
    } else if (
      hazardType === 'overflow_collapse_zone' ||
      hazardType === 'erosion_collapse_zone'
    ) {
      // 家屋倒壊氾濫、河岸侵食 uses A31a_405
      return {
        riverIdProp: 'A31a_401',
        riverNameProp: 'A31a_402',
        rangeProp: 'A31a_405',
      };
    } else {
      throw new Error(`Invalid hazard type: ${hazardType}`);
    }
  }

  /**
   * Determine hazard type from feature context
   */
  private determineHazardType(_feature: GeoJSONFeature): string {
    const filePath = this.options.currentFilePath || '';

    if (filePath.includes('10_計画規模')) {
      return 'planned_scale_depth';
    } else if (filePath.includes('20_想定最大規模')) {
      return 'maximum_assumed_depth';
    } else if (filePath.includes('30_浸水継続時間')) {
      return 'flood_duration';
    } else if (filePath.includes('41_家屋倒壊等氾濫想定区域_氾濫流')) {
      return 'overflow_collapse_zone';
    } else if (filePath.includes('42_家屋倒壊等氾濫想定区域_河岸侵食')) {
      return 'erosion_collapse_zone';
    }

    // Default fallback
    return 'flood_hazard';
  }

  /**
   * Add hazard-specific RDF data based on type and rank code
   */
  private addHazardSpecificData(
    triples: RDFTriple[],
    subjectIRI: string,
    hazardType: string,
    rankCode: number
  ): void {
    if (
      hazardType === 'planned_scale_depth' ||
      hazardType === 'maximum_assumed_depth'
    ) {
      // Flood depth data
      const depthInfo =
        FLOOD_DEPTH_RANKS[rankCode as keyof typeof FLOOD_DEPTH_RANKS];
      if (depthInfo) {
        triples.push(
          this.createTriple(
            subjectIRI,
            MLIT_PREDICATES.floodDepthRank,
            this.createIntegerLiteral(rankCode)
          ),
          this.createTriple(
            subjectIRI,
            `${MLIT_PREDICATES.floodDepthRank}_description`,
            this.createStringLiteral(depthInfo.description)
          ),
          this.createTriple(
            subjectIRI,
            `${MLIT_PREDICATES.floodDepthRank}_min`,
            this.createDoubleLiteral(depthInfo.min)
          ),
          this.createTriple(
            subjectIRI,
            `${MLIT_PREDICATES.floodDepthRank}_max`,
            this.createDoubleLiteral(
              depthInfo.max === Infinity ? 999.0 : depthInfo.max
            )
          )
        );
      }
    } else if (hazardType === 'flood_duration') {
      // Flood duration data
      const durationInfo =
        FLOOD_DURATION_RANKS[rankCode as keyof typeof FLOOD_DURATION_RANKS];
      if (durationInfo) {
        triples.push(
          this.createTriple(
            subjectIRI,
            MLIT_PREDICATES.floodDurationRank,
            this.createIntegerLiteral(rankCode)
          ),
          this.createTriple(
            subjectIRI,
            `${MLIT_PREDICATES.floodDurationRank}_description`,
            this.createStringLiteral(durationInfo.description)
          ),
          this.createTriple(
            subjectIRI,
            `${MLIT_PREDICATES.floodDurationRank}_hours`,
            this.createIntegerLiteral(
              durationInfo.hours === Infinity ? 999999 : durationInfo.hours
            )
          )
        );
      }
    } else if (
      hazardType === 'overflow_collapse_zone' ||
      hazardType === 'erosion_collapse_zone'
    ) {
      // Hazard zone type data
      const zoneInfo =
        HAZARD_ZONE_TYPES[rankCode as keyof typeof HAZARD_ZONE_TYPES];
      if (zoneInfo) {
        triples.push(
          this.createTriple(
            subjectIRI,
            MLIT_PREDICATES.hazardZoneType,
            this.createStringLiteral(zoneInfo.type)
          ),
          this.createTriple(
            subjectIRI,
            `${MLIT_PREDICATES.hazardZoneType}_description`,
            this.createStringLiteral(zoneInfo.description)
          )
        );
      }
    }
  }

  /**
   * Transform a population/land use GeoJSON feature to RDF triples (original method)
   */
  public transformPopulationLandUseFeature(
    feature: GeoJSONFeature
  ): TransformationResult {
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

    // Transform and add geometry (using standard geo:asWKT property)
    const wktGeometry = this.transformGeometry(feature.geometry);
    triples.push(
      this.createTriple(
        geometryIRI,
        `${RDF_PREFIXES.geo}asWKT`,
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

    // Add population snapshots if requested (filtered to 2025 only for performance)
    const populationSnapshotIRIs: string[] = [];
    if (includePopulationSnapshots) {
      // Extract 2025 year data only to reduce triple count and improve RDF4J performance
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
      floodHazardZoneIRIs: [],
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
   * Create population snapshot triples (optimized for essential data only)
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

    // Add only essential age category data (PTA, PTB, PTC, PTD, PTE) - no individual age groups or ratios
    const essentialAgeCategoryMappings = [
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

    for (const mapping of essentialAgeCategoryMappings) {
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

    // Removed individual age group data (PT01-PT20) to reduce triple count by ~20 properties per snapshot
    // Removed ratio data (RTA-RTE) to further reduce triple count by ~5 properties per snapshot
    // This optimization reduces population triples by approximately 75% while keeping essential data for disaster analysis

    return triples;
  }

  /**
   * Create land use data triples (optimized with area threshold and direct properties)
   */
  private createLandUseData(
    properties: any,
    featureIRI: string,
    _baseUri: string,
    _meshId: string
  ): { triples: RDFTriple[]; landUseIRIs: string[] } {
    const triples: RDFTriple[] = [];
    const landUseIRIs: string[] = []; // Empty for optimization - no individual IRIs created

    // Area threshold filter: Only include land use with area >= 5000 sq meters
    const AREA_THRESHOLD = 5000;

    // Direct property mapping (no individual LandUseData IRIs)
    const landUseDirectMappings = [
      { property: '田', predicate: MLIT_PREDICATES.riceFieldArea },
      {
        property: 'その他の農用地',
        predicate: MLIT_PREDICATES.otherAgriculturalArea,
      },
      { property: '森林', predicate: MLIT_PREDICATES.forestArea },
      { property: '荒地', predicate: MLIT_PREDICATES.wastelandArea },
      { property: '建物用地', predicate: MLIT_PREDICATES.buildingLandArea },
      { property: '道路', predicate: MLIT_PREDICATES.roadArea },
      { property: '鉄道', predicate: MLIT_PREDICATES.railwayArea },
      { property: 'その他の用地', predicate: MLIT_PREDICATES.otherLandArea },
      { property: '河川地及び湖沼', predicate: MLIT_PREDICATES.waterBodyArea },
      { property: '海浜', predicate: MLIT_PREDICATES.beachArea },
      { property: '海水域', predicate: MLIT_PREDICATES.seaArea },
      { property: 'ゴルフ場', predicate: MLIT_PREDICATES.golfCourseArea },
      { property: '解析範囲外', predicate: MLIT_PREDICATES.outOfRangeArea },
    ];

    // Process each land use category with area threshold filtering
    for (const mapping of landUseDirectMappings) {
      const area = properties[mapping.property];

      // Apply area threshold filter: only include areas >= 5000 sq meters
      if (area !== undefined && area !== null && area >= AREA_THRESHOLD) {
        // Add direct property to mesh (1 triple per category instead of 5)
        triples.push(
          this.createTriple(
            featureIRI,
            mapping.predicate,
            this.createDoubleLiteral(area)
          )
        );
      }
    }

    // Optimization results:
    // - Area threshold filter reduces ~60% of small land use areas
    // - Direct properties reduce from 5 triples/category to 1 triple/category (80% reduction)
    // - Combined: ~88% reduction in land use triples

    return { triples, landUseIRIs };
  }

  /**
   * Extract all years from feature properties - Now filters to only include 2025 data
   */
  private extractAllYearsFromProperties(properties: any): string[] {
    // Only return 2025 to reduce triple count and improve RDF4J performance
    const yearPattern = /PTN_(\d{4})/;
    const availableYears = new Set<string>();

    // First, check what years are actually available in the data
    for (const key of Object.keys(properties)) {
      const match = key.match(yearPattern);
      if (match) {
        availableYears.add(match[1]);
      }
    }

    // Only return 2025 if it exists in the data, otherwise return empty array
    if (availableYears.has('2025')) {
      return ['2025'];
    }

    // Log if 2025 data is not found but other years exist
    if (availableYears.size > 0) {
      this.logger?.debug(
        `2025 data not found, available years: ${Array.from(
          availableYears
        ).join(', ')}`
      );
    }

    return [];
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
   * Create a WKT literal (CRS-less for RDF4J GeoSPARQL compatibility)
   */
  private createWKTLiteral(wkt: string): string {
    return `"${wkt}"^^<${RDF_PREFIXES.geo}wktLiteral>`;
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

  /**
   * Generate a hash from geometry to create unique identifiers
   */
  private generateGeometryHash(geometry: any): string {
    const geometryString = JSON.stringify(geometry);
    return createHash('sha256').update(geometryString).digest('hex');
  }

  /**
   * Check if feature should be skipped based on rank filtering for data reduction
   */
  private shouldSkipLowRankFeature(
    hazardType: string,
    rankCode: number
  ): boolean {
    const minRank = this.options.minFloodDepthRank ?? 2;

    // Apply rank filtering only to flood depth data types
    if (
      hazardType === 'planned_scale_depth' ||
      hazardType === 'maximum_assumed_depth'
    ) {
      return rankCode < minRank;
    }

    // No filtering for other hazard types
    return false;
  }

  /**
   * Calculate geometry center point as WKT POINT
   */
  private calculateGeometryCenter(geometry: any): string {
    try {
      if (
        geometry.type === 'Polygon' &&
        geometry.coordinates &&
        geometry.coordinates[0]
      ) {
        const coordinates = geometry.coordinates[0];
        let sumLng = 0;
        let sumLat = 0;
        const pointCount = coordinates.length - 1; // Exclude closing point

        for (let i = 0; i < pointCount; i++) {
          sumLng += coordinates[i][0];
          sumLat += coordinates[i][1];
        }

        const centerLng = sumLng / pointCount;
        const centerLat = sumLat / pointCount;

        // Transform center point from JGD2011 to WGS84
        const transformedCenter = proj4('JGD2011', 'WGS84', [
          centerLng,
          centerLat,
        ]);

        return `POINT(${transformedCenter[0]} ${transformedCenter[1]})`;
      }

      // Fallback for other geometry types
      return 'POINT(0 0)';
    } catch (error) {
      this.logger?.error('Error calculating geometry center:', error);
      return 'POINT(0 0)';
    }
  }

  /**
   * Add minimal flood hazard properties for performance optimization
   */
  private addMinimalFloodProperties(
    triples: RDFTriple[],
    hazardZoneIRI: string,
    hazardType: string,
    rankCode: number
  ): void {
    // Essential properties only: hazard type and rank
    triples.push(
      this.createTriple(
        hazardZoneIRI,
        MLIT_PREDICATES.hazardType,
        this.createStringLiteral(hazardType)
      )
    );
    if (
      hazardType === 'planned_scale_depth' ||
      hazardType === 'maximum_assumed_depth'
    ) {
      // Flood depth data
      triples.push(
        this.createTriple(
          hazardZoneIRI,
          MLIT_PREDICATES.floodDepthRank,
          this.createIntegerLiteral(rankCode)
        )
      );
    } else if (hazardType === 'flood_duration') {
      // Flood duration data
      triples.push(
        this.createTriple(
          hazardZoneIRI,
          MLIT_PREDICATES.floodDurationRank,
          this.createIntegerLiteral(rankCode)
        )
      );
    } else if (
      hazardType === 'overflow_collapse_zone' ||
      hazardType === 'erosion_collapse_zone'
    ) {
      // Hazard zone type data
      const zoneInfo =
        HAZARD_ZONE_TYPES[rankCode as keyof typeof HAZARD_ZONE_TYPES];
      if (zoneInfo) {
        triples.push(
          this.createTriple(
            hazardZoneIRI,
            MLIT_PREDICATES.hazardZoneType,
            this.createStringLiteral(zoneInfo.type)
          )
        );
      }
    }

    // No river information, detailed descriptions, or other metadata to reduce triple count
  }

  /**
   * Add full flood hazard properties (legacy behavior)
   */
  private addFullFloodProperties(
    triples: RDFTriple[],
    hazardZoneIRI: string,
    riverIRI: string,
    riverId: string,
    riverName: string | undefined,
    hazardType: string,
    rankCode: number
  ): void {
    // Create river entity
    triples.push(
      this.createTriple(
        riverIRI,
        `${RDF_PREFIXES.rdf}type`,
        `${MLIT_CLASSES.AdministrativeArea}`
      ),
      this.createTriple(
        hazardZoneIRI,
        MLIT_PREDICATES.riverId,
        this.createStringLiteral(riverId)
      )
    );

    if (riverName) {
      triples.push(
        this.createTriple(
          riverIRI,
          MLIT_PREDICATES.riverName,
          this.createStringLiteral(riverName)
        ),
        this.createTriple(
          hazardZoneIRI,
          MLIT_PREDICATES.riverName,
          this.createStringLiteral(riverName)
        )
      );
    }

    // Add hazard-specific data based on type
    if (rankCode !== null && rankCode !== undefined) {
      this.addHazardSpecificData(triples, hazardZoneIRI, hazardType, rankCode);
    }

    // Add hazard type
    triples.push(
      this.createTriple(
        hazardZoneIRI,
        MLIT_PREDICATES.hazardType,
        this.createStringLiteral(hazardType)
      )
    );
  }

  /**
   * Aggregate flood zones by river, hazard type, and rank with spatial clustering
   */
  private aggregateFloodZonesByRank(
    features: GeoJSONFeature[]
  ): AggregatedFloodZone[] {
    const MAX_DISTANCE_LNG = 0.015; // about 3km distance limit
    const MAX_DISTANCE_LAT = 0.01; // about 3km distance
    const preliminaryGroups = new Map<
      string,
      { features: GeoJSONFeature[]; centroids: [number, number][] }
    >();

    // First pass: group by river/hazard/rank
    for (const feature of features) {
      if (!this.isFloodHazardData(feature)) continue;

      const props = feature.properties;
      const hazardType = this.determineHazardType(feature);
      const propertyMappings = this.getPropertyMappings(hazardType);

      const riverId = props[propertyMappings.riverIdProp];
      //const riverName = props[propertyMappings.riverNameProp];
      const rankCode = props[propertyMappings.rangeProp];

      if (!riverId || this.shouldSkipLowRankFeature(hazardType, rankCode)) {
        continue;
      }

      const groupKey = `${riverId}__${hazardType}__${rankCode}`;

      if (!preliminaryGroups.has(groupKey)) {
        preliminaryGroups.set(groupKey, { features: [], centroids: [] });
      }

      const group = preliminaryGroups.get(groupKey)!;
      group.features.push(feature);

      if (feature.geometry.type === 'Polygon') {
        const centroid = this.getPolygonCentroid(feature.geometry);
        group.centroids.push(centroid);
      }
    }

    // Second pass: apply spatial clustering within each group
    const finalAggregations: AggregatedFloodZone[] = [];

    for (const [groupKey, group] of preliminaryGroups) {
      const [riverId, hazardType, rankCode] = groupKey.split('__');
      const riverName =
        group.features[0]?.properties[
          this.getPropertyMappings(hazardType).riverNameProp
        ];

      // Spatial clustering: group features that are within 30km of each other
      const spatialClusters = this.createSpatialClusters(
        group.features,
        group.centroids,
        MAX_DISTANCE_LNG,
        MAX_DISTANCE_LAT
      );

      for (let clusterId = 0; clusterId < spatialClusters.length; clusterId++) {
        const clusterFeatures = spatialClusters[clusterId];
        const polygons = clusterFeatures
          .filter((f) => f.geometry.type === 'Polygon')
          .map((f) => f.geometry);

        if (polygons.length > 0) {
          finalAggregations.push({
            riverId,
            riverName,
            hazardType,
            rankCode: parseInt(rankCode),
            polygons,
            clusterId,
          });
        }
      }
    }

    return finalAggregations;
  }

  /**
   * Create spatial clusters based on distance threshold
   */
  private createSpatialClusters(
    features: GeoJSONFeature[],
    centroids: [number, number][],
    maxDistanceLng: number,
    maxDistanceLat: number,
    maxFeaturesPerCluster = 500
  ): GeoJSONFeature[][] {
    if (features.length === 0) return [];
    if (features.length === 1) return [features];

    const clusters: GeoJSONFeature[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < features.length; i++) {
      if (assigned.has(i)) continue;

      const cluster = [features[i]];
      assigned.add(i);
      const clusterCentroid = centroids[i];

      // Find all features within maxDistance of this cluster
      for (let j = i + 1; j < features.length; j++) {
        if (assigned.has(j)) continue;

        const diffLng = Math.abs(clusterCentroid[0] - centroids[j][0]);
        const diffLat = Math.abs(clusterCentroid[1] - centroids[j][1]);
        if (diffLng <= maxDistanceLng && diffLat <= maxDistanceLat) {
          cluster.push(features[j]);
          assigned.add(j);
        }
        if (cluster.length >= maxFeaturesPerCluster) break;
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Transform aggregated flood zones to RDF triples
   */
  private transformAggregatedFloodZones(
    aggregatedZones: AggregatedFloodZone[]
  ): TransformationResult {
    const { baseUri } = this.options;
    const triples: RDFTriple[] = [];
    const floodHazardZoneIRIs: string[] = [];

    for (const zone of aggregatedZones) {
      if (zone.polygons.length === 0) continue;

      // Clean and simplify each polygon before creating the MultiPolygon
      const cleanedPolygonCoordinates = zone.polygons
        .map((p) => {
          try {
            if (
              p &&
              p.coordinates &&
              p.coordinates[0] &&
              p.coordinates[0].length >= 4
            ) {
              const feature = turf.polygon(p.coordinates);
              // Clean the coordinates first to remove redundant nodes
              const cleaned = turf.cleanCoords(feature);
              // Then simplify. A small tolerance helps fix minor topology issues.
              const simplified = turf.simplify(cleaned, {
                tolerance: 0.0001,
                highQuality: false,
              });
              return simplified.geometry.coordinates;
            }
          } catch (err: any) {
            this.logger.warn(
              `Could not process a polygon for river ${zone.riverId}: ${err.message}`
            );
          }
          return null; // Return null for invalid or problematic polygons
        })
        .filter((coords) => coords !== null) as any[]; // Filter out any nulls

      if (cleanedPolygonCoordinates.length === 0) {
        this.logger.warn(
          `No valid polygons remained after cleaning for river ${zone.riverId}, rank ${zone.rankCode}.`
        );
        continue;
      }

      // Create MultiPolygon geometry from the cleaned coordinates
      const multiPolygonGeometry = {
        type: 'MultiPolygon',
        coordinates: cleanedPolygonCoordinates,
      };

      // Generate unique IRI for aggregated zone with cluster ID
      const aggregatedZoneIRI = generateFloodHazardZoneIRI(
        baseUri,
        `${zone.riverId}_${zone.hazardType}_rank${zone.rankCode}_cluster${zone.clusterId}`,
        zone.hazardType
      );
      const geometryIRI = `${aggregatedZoneIRI}_geom`;
      const boundingBoxIRI = `${aggregatedZoneIRI}_bbox`;

      floodHazardZoneIRIs.push(aggregatedZoneIRI);

      // Add type declarations
      triples.push(
        this.createTriple(
          aggregatedZoneIRI,
          `${RDF_PREFIXES.rdf}type`,
          `${RDF_PREFIXES.geo}Feature`
        ),
        this.createTriple(
          aggregatedZoneIRI,
          `${RDF_PREFIXES.rdf}type`,
          MLIT_CLASSES.FloodHazardZone
        ),
        this.createTriple(
          geometryIRI,
          `${RDF_PREFIXES.rdf}type`,
          `${RDF_PREFIXES.geo}Geometry`
        ),
        this.createTriple(
          boundingBoxIRI,
          `${RDF_PREFIXES.rdf}type`,
          `${RDF_PREFIXES.geo}Geometry`
        )
      );

      // Link zone to geometries
      triples.push(
        this.createTriple(
          aggregatedZoneIRI,
          `${RDF_PREFIXES.geo}hasGeometry`,
          geometryIRI
        ),
        this.createTriple(
          aggregatedZoneIRI,
          `${RDF_PREFIXES.geo}hasBoundingBox`,
          boundingBoxIRI
        )
      );

      // Transform and add MultiPolygon geometry
      const wktMultiPolygon = this.transformGeometry(multiPolygonGeometry);
      triples.push(
        this.createTriple(
          geometryIRI,
          `${RDF_PREFIXES.geo}asWKT`,
          this.createWKTLiteral(wktMultiPolygon)
        )
      );

      // Calculate and add bounding box
      const boundingBox = this.calculateBoundingBox(multiPolygonGeometry);
      triples.push(
        this.createTriple(
          boundingBoxIRI,
          `${RDF_PREFIXES.geo}asWKT`,
          this.createWKTLiteral(boundingBox)
        )
      );

      // Add simplified geometry for low zoom level display
      if (this.options.enableSimplification) {
        const simplifiedMultiPolygonGeometry =
          this.createSimplifiedMultiPolygonGeometry(multiPolygonGeometry);
        if (simplifiedMultiPolygonGeometry) {
          const simplifiedGeometryIRI = `${aggregatedZoneIRI}_simplified`;
          triples.push(
            this.createTriple(
              simplifiedGeometryIRI,
              `${RDF_PREFIXES.rdf}type`,
              `${RDF_PREFIXES.geo}Geometry`
            ),
            this.createTriple(
              aggregatedZoneIRI,
              `${RDF_PREFIXES.geo}hasSimplifiedGeometry`,
              simplifiedGeometryIRI
            ),
            this.createTriple(
              simplifiedGeometryIRI,
              `${RDF_PREFIXES.geo}asWKT`,
              this.createWKTLiteral(simplifiedMultiPolygonGeometry)
            ),
            this.createTriple(
              simplifiedGeometryIRI,
              `${this.options.baseUri}simplificationTolerance`,
              this.createDoubleLiteral(
                this.options.simplificationTolerance || 0.01
              )
            )
          );
        }
      }

      // Add properties based on configuration
      if (this.options.useMinimalFloodProperties) {
        this.addMinimalFloodProperties(
          triples,
          aggregatedZoneIRI,
          zone.hazardType,
          zone.rankCode
        );
      } else {
        const riverIRI = generateRiverIRI(baseUri, zone.riverId);
        this.addFullFloodProperties(
          triples,
          aggregatedZoneIRI,
          riverIRI,
          zone.riverId,
          zone.riverName,
          zone.hazardType,
          zone.rankCode
        );
      }

      // Add aggregation metadata
      triples.push(
        this.createTriple(
          aggregatedZoneIRI,
          `${MLIT_PREDICATES.hazardType}_polygonCount`,
          this.createIntegerLiteral(zone.polygons.length)
        ),
        this.createTriple(
          aggregatedZoneIRI,
          `${MLIT_PREDICATES.hazardType}_clusterId`,
          this.createIntegerLiteral(zone.clusterId)
        )
      );
    }

    return {
      triples,
      featureIRI: '',
      geometryIRI: '',
      populationSnapshotIRIs: [],
      landUseIRIs: [],
      floodHazardZoneIRIs,
    };
  }

  /**
   * Calculate distance between two geographic coordinates in kilometers
   * Using Haversine formula
  private calculateDistance(
    coord1: [number, number],
    coord2: [number, number]
  ): number {
    const [lng1, lat1] = coord1;
    const [lng2, lat2] = coord2;

    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }
*/

  /**
   * Convert degrees to radians
    private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
 */

  /**
   * Get centroid of a polygon
   */
  private getPolygonCentroid(polygon: any): [number, number] {
    if (!polygon.coordinates || !polygon.coordinates[0]) {
      return [0, 0];
    }

    //to make simple use 1st polygon
    return polygon.coordinates[0][0];
  }

  /**
   * Create simplified geometry triples for a single feature (for low zoom levels)
   */
  private createSimplifiedGeometryForFeature(
    feature: GeoJSONFeature,
    featureIRI: string
  ): RDFTriple[] {
    const triples: RDFTriple[] = [];
    const simplifiedGeometryIRI = `${featureIRI}_simplified`;

    // Add simplified geometry type
    triples.push(
      this.createTriple(
        simplifiedGeometryIRI,
        `${RDF_PREFIXES.rdf}type`,
        `${RDF_PREFIXES.geo}Geometry`
      )
    );

    // Link feature to simplified geometry
    triples.push(
      this.createTriple(
        featureIRI,
        `${RDF_PREFIXES.geo}hasSimplifiedGeometry`,
        simplifiedGeometryIRI
      )
    );

    // Create and add simplified geometry
    const simplifiedGeometry = this.createSimplifiedGeometry(feature);
    if (simplifiedGeometry) {
      triples.push(
        this.createTriple(
          simplifiedGeometryIRI,
          `${RDF_PREFIXES.geo}asWKT`,
          this.createWKTLiteral(simplifiedGeometry)
        )
      );

      // Add simplification metadata
      triples.push(
        this.createTriple(
          simplifiedGeometryIRI,
          `${this.options.baseUri}simplificationTolerance`,
          this.createDoubleLiteral(this.options.simplificationTolerance || 0.01)
        )
      );
    }

    return triples;
  }

  /**
   * Create simplified geometry using Turf.js
   */
  private createSimplifiedGeometry(feature: GeoJSONFeature): string | null {
    try {
      if (!this.options.enableSimplification) {
        return null;
      }

      const tolerance = this.options.simplificationTolerance || 0.01;
      const highQuality = this.options.simplificationHighQuality || false;

      // Create a proper GeoJSON feature for Turf.js
      const turfFeature = turf.feature(
        feature.geometry as any,
        feature.properties
      );

      // Simplify the geometry
      const simplified = simplify(turfFeature, {
        tolerance,
        highQuality,
        mutate: false,
      });

      if (!simplified || !simplified.geometry) {
        this.logger?.warn('Failed to simplify geometry - no result');
        return null;
      }

      // Transform coordinates and convert to WKT
      const transformedGeometry = this.transformCoordinates(
        simplified.geometry
      );
      const wkt = wellknown.stringify(transformedGeometry);

      return wkt;
    } catch (error) {
      this.logger?.error('Error creating simplified geometry:', error);
      return null;
    }
  }

  /**
   * Create simplified MultiPolygon geometry
   */
  private createSimplifiedMultiPolygonGeometry(
    multiPolygonGeometry: any
  ): string | null {
    try {
      if (!this.options.enableSimplification) {
        return null;
      }

      const tolerance = this.options.simplificationTolerance || 0.01;
      const highQuality = this.options.simplificationHighQuality || false;

      // Create a proper GeoJSON feature for Turf.js
      const turfFeature = turf.feature(multiPolygonGeometry as any);

      // Simplify the geometry
      const simplified = simplify(turfFeature, {
        tolerance,
        highQuality,
        mutate: false,
      });

      if (!simplified || !simplified.geometry) {
        this.logger?.warn(
          'Failed to simplify MultiPolygon geometry - no result'
        );
        return null;
      }

      // Transform coordinates and convert to WKT
      const transformedGeometry = this.transformCoordinates(
        simplified.geometry
      );
      const wkt = wellknown.stringify(transformedGeometry);

      return wkt;
    } catch (error) {
      this.logger?.error(
        'Error creating simplified MultiPolygon geometry:',
        error
      );
      return null;
    }
  }

  /**
   * Calculate bounding box for multiple polygons
   */
  private calculateBoundingBox(geometry: any): string {
    const bbox = turf.bbox(geometry);
    const [minLng, minLat, maxLng, maxLat] = bbox;

    // Transform bounding box coordinates from JGD2011 to WGS84
    const transformedMin = proj4('JGD2011', 'WGS84', [minLng, minLat]);
    const transformedMax = proj4('JGD2011', 'WGS84', [maxLng, maxLat]);

    // Create bounding box as POLYGON
    return `POLYGON((${transformedMin[0]} ${transformedMin[1]}, ${transformedMax[0]} ${transformedMin[1]}, ${transformedMax[0]} ${transformedMax[1]}, ${transformedMin[0]} ${transformedMax[1]}, ${transformedMin[0]} ${transformedMin[1]}))`;
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
