/**
 * Data Parser Module
 * Handles streaming parsing of large GeoJSON files to avoid memory issues.
 */

import * as fs from 'fs';
import { createLogger, Logger } from 'winston';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { chain } from 'stream-chain';

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
 * Asynchronous GeoJSON stream parser for processing multiple large files sequentially.
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
   * Parse multiple GeoJSON files using streaming and return all features.
   */
  public async parseAllFeatures(): Promise<ParsedFeatureData[]> {
    const { inputFilePaths, maxFeatures, skipFeatures = 0 } = this.options;
    const allFeatures: ParsedFeatureData[] = [];

    this.logger.info(
      `Starting to parse ${inputFilePaths.length} GeoJSON files using streaming`
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
        await new Promise<void>((resolve, reject) => {
          const pipeline = chain([
            fs.createReadStream(filePath, { encoding: 'utf8' }),
            parser(),
            pick({ filter: 'features' }),
            streamArray(),
          ]);

          let featureIndex = 0;

          pipeline.on('data', (data) => {
            try {
              const feature = data.value as GeoJSONFeature;

              if (!this.isValidGeoJSONFeature(feature)) {
                this.logger.warn(
                  `Skipping invalid GeoJSON feature at index ${featureIndex} in file ${filePath}`
                );
                featureIndex++;
                return;
              }

              this.totalFeatureCount++;

              if (this.totalFeatureCount <= skipFeatures) {
                featureIndex++;
                return;
              }

              if (maxFeatures && this.processedCount >= maxFeatures) {
                // Stop the pipeline early if max features limit is reached
                if (!pipeline.isPaused()) {
                  pipeline.pause();
                }
                return;
              }

              this.processedCount++;

              if (this.processedCount % 10000 === 0) {
                this.logger.info(`Processed ${this.processedCount} features...`);
              }

              const parsedData: ParsedFeatureData = {
                feature: feature,
                featureIndex: featureIndex,
                filePath,
                fileIndex,
              };

              allFeatures.push(parsedData);
              featureIndex++;
            } catch (e) {
              this.logger.error('Error processing a feature, skipping.', e);
            }
          });

          pipeline.on('end', () => {
            if (maxFeatures && this.processedCount >= maxFeatures) {
              this.logger.info(`Reached max features limit: ${maxFeatures}`);
            }
            this.logger.info(
              `Completed file ${filePath}: ${featureIndex} features found in stream`
            );
            resolve();
          });

          pipeline.on('error', (error) => {
            // Handle JSON parsing errors, e.g. incomplete file
            this.logger.error(`Error streaming file ${filePath}:`, error);
            reject(error);
          });
        });
      } catch (error) {
        this.logger.error(`Error setting up stream for file ${filePath}:`, error);
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
export async function parseGeoJSONSample(
  filePaths: string[],
  sampleSize: number = 10,
  logger?: Logger
): Promise<GeoJSONFeature[]> {
  const parser = new GeoJSONSyncParser({
    inputFilePaths: filePaths,
    maxFeatures: sampleSize,
    logger,
  });

  const parsedData = await parser.parseAllFeatures();
  return parsedData.map((data) => data.feature);
}