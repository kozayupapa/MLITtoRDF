/**
 * Data Parser Module
 * Handles synchronous parsing of GeoJSON files
 * Simple and debuggable approach for processing multiple files sequentially
 */

import { createReadStream, readFileSync } from 'fs';
import { Logger } from 'winston';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';

// GeoJSON type definitions
export interface GeoJSONFeature {
  type: 'Feature';
  geometry: any;
  properties: any;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface ParserOptions {
  logger?: Logger;
}

/**
 * Parses GeoJSON files, with support for streaming large files.
 */
export class GeoJSONParser {
  private readonly logger: Logger;

  constructor(options: ParserOptions = {}) {
    this.logger = options.logger || (console as any);
  }

  /**
   * Determines the structure of the GeoJSON file (FeatureCollection, Feature, or array of Features).
   * This is a lightweight check on the first few KB of the file.
   */
  private detectGeoJSONStructure(filePath: string): 'FeatureCollection' | 'Feature' | 'FeatureArray' {
    // This is a simplified detection logic. A more robust implementation might be needed.
    const buffer = Buffer.alloc(4096);
    const fd = require('fs').openSync(filePath, 'r');
    require('fs').readSync(fd, buffer, 0, 4096, 0);
    require('fs').closeSync(fd);
    const text = buffer.toString('utf-8');

    if (text.includes('"type": "FeatureCollection"')) {
      return 'FeatureCollection';
    } else if (text.includes('"type": "Feature"')) {
      // This could be a single Feature or the start of a FeatureArray
      // A simple check for a top-level `[` can differentiate
      if (text.trim().startsWith('[')) {
        return 'FeatureArray';
      }
      return 'Feature';
    }
    return 'FeatureCollection'; // Default assumption
  }

  /**
   * Parses features from a GeoJSON file using streaming for efficiency.
   * Handles both FeatureCollection and top-level arrays of Features.
   * @param filePath The path to the GeoJSON file.
   * @param skip The number of features to skip.
   * @param limit The maximum number of features to return.
   * @returns A promise that resolves to an array of GeoJSON features.
   */
  public async parseFeatures(
    filePath: string,
    skip: number,
    limit: number
  ): Promise<GeoJSONFeature[]> {
    const structure = this.detectGeoJSONStructure(filePath);

    if (structure === 'Feature') {
      this.logger.info('Detected single GeoJSON Feature structure.');
      const fileContent = readFileSync(filePath, 'utf-8');
      const feature = JSON.parse(fileContent);
      return [feature].slice(skip, skip + limit);
    }

    return new Promise((resolve, reject) => {
      const features: GeoJSONFeature[] = [];
      let count = 0;
      let stream;

      if (structure === 'FeatureCollection') {
        this.logger.info('Detected FeatureCollection structure. Streaming features.');
        stream = createReadStream(filePath)
          .pipe(parser())
          .pipe(pick({ filter: 'features' }))
          .pipe(streamArray());
      } else { // FeatureArray
        this.logger.info('Detected top-level Feature array structure. Streaming features.');
        stream = createReadStream(filePath)
          .pipe(parser())
          .pipe(streamArray());
      }

      stream.on('data', (data: any) => {
        if (count >= skip) {
          if (features.length < limit) {
            features.push(data.value as GeoJSONFeature);
          }
        }
        count++;
        if (limit !== Infinity && features.length >= limit) {
          stream.destroy(); // Stop reading from the file if limit is reached
        }
      });

      stream.on('end', () => {
        this.logger.info(`Stream parsing completed. Found ${features.length} features.`);
        resolve(features);
      });

      stream.on('error', (err: Error) => {
        this.logger.error(`Error streaming JSON from ${filePath}: ${err.message}`);
        reject(err);
      });

      stream.on('close', () => {
        // Ensure resolution in case the stream was destroyed after reaching the limit
        resolve(features);
      });
    });
  }
}
