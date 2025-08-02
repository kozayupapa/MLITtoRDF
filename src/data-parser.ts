/**
 * Data Parser Module
 * Handles synchronous parsing of GeoJSON files
 * Simple and debuggable approach for processing multiple files sequentially
 */

import * as fs from 'fs';
import { createLogger, Logger } from 'winston';

export interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    MESH_ID?: string;
    メッシュ?: string;
    SHICODE?: string;
    PTN_2020?: number;
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: any;
  };
}

export interface ParsedFeatureData {
  feature: GeoJSONFeature;
  featureIndex: number;
  filePath: string;
  fileIndex: number;
}

export interface ParserOptions {
  inputFilePaths: string[];
  logger?: Logger;
  maxFeatures?: number;
  skipFeatures?: number;
}

/**
 * Synchronous GeoJSON parser for processing multiple files sequentially
 * Simple and debuggable approach
 */
export class GeoJSONSyncParser {
  private readonly options: ParserOptions;
  private readonly logger: Logger;
  private totalFeatureCount: number = 0;
  private processedCount: number = 0;

  constructor(options: ParserOptions) {
    this.options = options;
    this.logger =
      options.logger ||
      createLogger({
        level: 'info',
        format: require('winston').format.simple(),
        transports: [new (require('winston').transports.Console)()],
      });
  }

  /**
   * Parse multiple GeoJSON files synchronously and return all features
   */
  public parseAllFeatures(): ParsedFeatureData[] {
    const { inputFilePaths, maxFeatures, skipFeatures = 0 } = this.options;
    const allFeatures: ParsedFeatureData[] = [];

    this.logger.info(
      `Starting to parse ${inputFilePaths.length} GeoJSON files`
    );
    this.logger.info(
      `Skip features: ${skipFeatures}, Max features: ${
        maxFeatures || 'unlimited'
      }`
    );

    for (let fileIndex = 0; fileIndex < inputFilePaths.length; fileIndex++) {
      const filePath = inputFilePaths[fileIndex];

      this.logger.info(
        `Processing file ${fileIndex + 1}/${inputFilePaths.length}: ${filePath}`
      );

      if (!fs.existsSync(filePath)) {
        this.logger.warn(`Input file does not exist: ${filePath}`);
        continue;
      }

      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const geoJSON = JSON.parse(fileContent);

        if (!geoJSON.features || !Array.isArray(geoJSON.features)) {
          this.logger.warn(
            `File ${filePath} does not contain valid GeoJSON features array`
          );
          continue;
        }

        for (
          let featureIndex = 0;
          featureIndex < geoJSON.features.length;
          featureIndex++
        ) {
          const feature = geoJSON.features[featureIndex];

          // Validate that this is a valid GeoJSON feature
          if (!this.isValidGeoJSONFeature(feature)) {
            this.logger.warn(
              `Skipping invalid GeoJSON feature at index ${featureIndex} in file ${filePath}`
            );
            continue;
          }

          this.totalFeatureCount++;

          // Skip features if requested
          if (this.totalFeatureCount <= skipFeatures) {
            continue;
          }

          // Check max features limit
          if (maxFeatures && this.processedCount >= maxFeatures) {
            this.logger.info(`Reached max features limit: ${maxFeatures}`);
            return allFeatures;
          }

          this.processedCount++;

          // Log progress periodically
          if (this.processedCount % 1000 === 0) {
            this.logger.info(`Processed ${this.processedCount} features...`);
          }

          const parsedData: ParsedFeatureData = {
            feature: feature as GeoJSONFeature,
            featureIndex,
            filePath,
            fileIndex,
          };

          allFeatures.push(parsedData);
        }

        this.logger.info(
          `Completed file ${filePath}: ${geoJSON.features.length} features found`
        );
      } catch (error) {
        this.logger.error(`Error processing file ${filePath}:`, error);
      }
    }

    this.logger.info(
      `Completed parsing all files. Total features processed: ${this.processedCount}`
    );

    return allFeatures;
  }

  /**
   * Validate that an object is a valid GeoJSON feature
   */
  private isValidGeoJSONFeature(obj: any): obj is GeoJSONFeature {
    return (
      obj &&
      typeof obj === 'object' &&
      obj.type === 'Feature' &&
      obj.properties &&
      typeof obj.properties === 'object' &&
      obj.geometry &&
      typeof obj.geometry === 'object' &&
      typeof obj.geometry.type === 'string' &&
      obj.geometry.coordinates
    );
  }

  /**
   * Get current parsing statistics
   */
  public getStats(): { totalFeatureCount: number; processedCount: number } {
    return {
      totalFeatureCount: this.totalFeatureCount,
      processedCount: this.processedCount,
    };
  }
}

/**
 * Utility function to create a parser with default configuration
 */
export function createGeoJSONParser(
  filePaths: string[],
  options: Partial<ParserOptions> = {}
): GeoJSONSyncParser {
  return new GeoJSONSyncParser({
    inputFilePaths: filePaths,
    ...options,
  });
}

/**
 * Helper to parse a limited number of features for testing
 */
export function parseGeoJSONSample(
  filePaths: string[],
  sampleSize: number = 10,
  logger?: Logger
): GeoJSONFeature[] {
  const parser = new GeoJSONSyncParser({
    inputFilePaths: filePaths,
    maxFeatures: sampleSize,
    logger,
  });

  const parsedData = parser.parseAllFeatures();
  return parsedData.map((data) => data.feature);
}
