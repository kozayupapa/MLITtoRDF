/**
 * Data Parser Module
 * Handles streaming parsing of large GeoJSON files using stream-json
 * Optimized for memory efficiency when processing MLIT's large (207MB+) GeoJSON files
 */

import * as fs from 'fs';
import { Transform, Readable } from 'stream';
import StreamArray from 'stream-json/streamers/StreamArray';
import parser from 'stream-json';
import { createLogger, Logger } from 'winston';

export interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    MESH_ID: string;
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
}

export interface ParserOptions {
  inputFilePath: string;
  logger?: Logger;
  maxFeatures?: number;
  skipFeatures?: number;
}

/**
 * Streaming GeoJSON parser optimized for large MLIT files
 * Uses stream-json to avoid loading entire file into memory
 */
export class GeoJSONStreamParser {
  private readonly options: ParserOptions;
  private readonly logger: Logger;
  private featureCount: number = 0;
  private processedCount: number = 0;

  constructor(options: ParserOptions) {
    this.options = options;
    this.logger = options.logger || createLogger({
      level: 'info',
      format: require('winston').format.simple(),
      transports: [new (require('winston').transports.Console)()]
    });
  }

  /**
   * Create a readable stream of parsed GeoJSON features
   * Uses stream-json to parse features one by one without loading entire file
   */
  public createFeatureStream(): Readable {
    const { inputFilePath, maxFeatures, skipFeatures = 0 } = this.options;

    this.logger.info(`Starting to parse GeoJSON file: ${inputFilePath}`);
    this.logger.info(`Skip features: ${skipFeatures}, Max features: ${maxFeatures || 'unlimited'}`);

    if (!fs.existsSync(inputFilePath)) {
      throw new Error(`Input file does not exist: ${inputFilePath}`);
    }

    const fileStream = fs.createReadStream(inputFilePath);
    const parseStream = parser();
    const streamArray = StreamArray.withParser();

    // Transform stream to extract and validate features
    const featureTransform = new Transform({
      objectMode: true,
      transform: (chunk: any, _encoding: string, callback: Function): void => {
        try {
          const { value: feature, key: index } = chunk;
          
          // Validate that this is a valid GeoJSON feature
          if (!this.isValidGeoJSONFeature(feature)) {
            this.logger.warn(`Skipping invalid GeoJSON feature at index ${index}`);
            callback();
            return;
          }

          this.featureCount++;

          // Skip features if requested
          if (this.featureCount <= skipFeatures) {
            callback();
            return;
          }

          // Check max features limit
          if (maxFeatures && this.processedCount >= maxFeatures) {
            this.logger.info(`Reached max features limit: ${maxFeatures}`);
            callback();
            return;
          }

          this.processedCount++;

          // Log progress periodically
          if (this.processedCount % 1000 === 0) {
            this.logger.info(`Processed ${this.processedCount} features...`);
          }

          const parsedData: ParsedFeatureData = {
            feature: feature as GeoJSONFeature,
            featureIndex: index
          };

          callback(null, parsedData);
        } catch (error) {
          this.logger.error(`Error processing feature at index ${chunk.key}:`, error);
          callback(error);
        }
      }
    });

    // Handle stream errors
    fileStream.on('error', (error: Error) => {
      this.logger.error('File stream error:', error);
    });

    parseStream.on('error', (error: Error) => {
      this.logger.error('JSON parser error:', error);
    });

    streamArray.on('error', (error: Error) => {
      this.logger.error('Stream array error:', error);
    });

    featureTransform.on('error', (error: Error) => {
      this.logger.error('Feature transform error:', error);
    });

    // Log completion
    featureTransform.on('end', () => {
      this.logger.info(`Completed parsing. Total features processed: ${this.processedCount}`);
    });

    return fileStream
      .pipe(parseStream)
      .pipe(streamArray)
      .pipe(featureTransform);
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
      obj.geometry.coordinates &&
      typeof obj.properties.MESH_ID === 'string'
    );
  }

  /**
   * Get current parsing statistics
   */
  public getStats(): { featureCount: number; processedCount: number } {
    return {
      featureCount: this.featureCount,
      processedCount: this.processedCount
    };
  }
}

/**
 * Utility function to create a parser with default configuration
 */
export function createGeoJSONParser(filePath: string, options: Partial<ParserOptions> = {}): GeoJSONStreamParser {
  return new GeoJSONStreamParser({
    inputFilePath: filePath,
    ...options
  });
}

/**
 * Promise-based helper to parse a limited number of features for testing
 */
export async function parseGeoJSONSample(
  filePath: string, 
  sampleSize: number = 10,
  logger?: Logger
): Promise<GeoJSONFeature[]> {
  return new Promise((resolve, reject) => {
    const parser = new GeoJSONStreamParser({
      inputFilePath: filePath,
      maxFeatures: sampleSize,
      logger
    });

    const features: GeoJSONFeature[] = [];
    const stream = parser.createFeatureStream();

    stream.on('data', (data: ParsedFeatureData) => {
      features.push(data.feature);
    });

    stream.on('end', () => {
      resolve(features);
    });

    stream.on('error', (error: Error) => {
      reject(error);
    });
  });
}