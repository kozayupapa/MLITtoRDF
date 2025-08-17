#!/usr/bin/env node

/**
 * MLIT GeoJSON to RDF4J CLI Tool
 * Command-line program to convert MLIT GeoJSON data to GeoSPARQL RDF and load into RDF4J server
 */

import { Command } from 'commander';
import { createLogger, format, transports } from 'winston';
import * as fs from 'fs';
import {
  GeoJSONSyncParser,
  GeoJSONFeature,
  ParsedFeatureData,
} from './data-parser';
import {
  GeoSPARQLTransformer,
  RDFTriple,
  TransformationResult,
} from './geo-transformer';
import { RDF4JBulkLoader, LoadResult } from './rdf-loader';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

interface CLIOptions {
  filePaths: string[];
  rdf4jEndpoint: string;
  repositoryId: string;
  baseUri: string;
  batchSize: number;
  maxFeatures?: number;
  skipFeatures?: number;
  logLevel: string;
  testConnection: boolean;
  dryRun: boolean;
  includePopulationSnapshots: boolean;
  dataType: 'population-geojson' | 'landuse-geojson' | 'flood-geojson' | 'auto';
  aggregateByRank: boolean;
  minFloodDepthRank: number;
}

/**
 * Main CLI application class
 */
class MLITGeoJSONToRDF4J {
  private readonly logger;
  private readonly options: CLIOptions;

  constructor(options: CLIOptions) {
    this.options = options;
    this.logger = this.createLogger(options.logLevel);
  }

  /**
   * Create Winston logger with appropriate configuration
   */
  private createLogger(level: string) {
    return createLogger({
      level: level,
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.printf(({ timestamp, level, message, stack }) => {
          if (stack) {
            return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
          }
          return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
      ),
      transports: [
        new transports.Console({
          format: format.combine(format.colorize(), format.simple()),
        }),
        new transports.File({
          filename: 'mlit-to-rdf4j.log',
          format: format.json(),
        }),
      ],
    });
  }

  /**
   * Main execution pipeline
   */
  public async execute(): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.info('Starting MLIT GeoJSON to RDF4J conversion');
      this.logConfiguration();

      // Validate inputs
      await this.validateInputs();

      // Initialize components
      const loader = this.createLoader();

      // Test RDF4J connection if requested
      if (this.options.testConnection) {
        await this.testRDF4JConnection(loader);
      }

      // Process the data
      const result = await this.processData(loader);

      // Log final results
      this.logResults(result, Date.now() - startTime);
    } catch (error) {
      this.logger.error('Pipeline execution failed:', error);
      process.exit(1);
    }
  }

  /**
   * Validate input parameters and files
   */
  private async validateInputs(): Promise<void> {
    const { filePaths, rdf4jEndpoint, repositoryId, baseUri } = this.options;

    // Check if input files exist
    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Input file does not exist: ${filePath}`);
      }
    }

    // Validate file extensions and determine data type
    if (this.options.dataType === 'auto') {
      const firstFile = filePaths[0].toLowerCase();
      if (firstFile.endsWith('.geojson') || firstFile.endsWith('.json')) {
        try {
          // Safely read only the first feature from the stream for auto-detection
          const firstFeature = await this.readFirstFeature(filePaths[0]);

          if (firstFeature && firstFeature.properties) {
            if (
              firstFeature.properties.田 !== undefined ||
              firstFeature.properties.森林 !== undefined ||
              firstFeature.properties.メッシュ !== undefined
            ) {
              this.options.dataType = 'landuse-geojson';
              this.logger.info('Auto-detected Land Use GeoJSON data format');
            } else if (
              firstFeature.properties.A31a_101 ||
              firstFeature.properties.A31a_201 ||
              firstFeature.properties.A31a_301 ||
              firstFeature.properties.A31a_401
            ) {
              this.options.dataType = 'flood-geojson';
              this.logger.info(
                'Auto-detected flood hazard GeoJSON data format'
              );
            } else {
              this.options.dataType = 'population-geojson';
              this.logger.info('Auto-detected Population GeoJSON data format');
            }
          } else {
            this.options.dataType = 'population-geojson';
            this.logger.info(
              'Could not determine type from first feature, defaulting to Population GeoJSON'
            );
          }
        } catch (error) {
          this.logger.warn(
            `Error parsing first feature for auto-detection: ${error}. Defaulting to Population GeoJSON.`
          );
          this.options.dataType = 'population-geojson';
        }
      } else {
        this.logger.warn(
          'Unknown file extension, defaulting to Population GeoJSON processing'
        );
        this.options.dataType = 'population-geojson';
      }
    }

    // Validate URLs
    try {
      new URL(rdf4jEndpoint);
    } catch {
      throw new Error(`Invalid RDF4J endpoint URL: ${rdf4jEndpoint}`);
    }

    try {
      new URL(baseUri);
    } catch {
      throw new Error(`Invalid base URI: ${baseUri}`);
    }

    if (!repositoryId || repositoryId.trim().length === 0) {
      throw new Error('Repository ID cannot be empty');
    }

    this.logger.info('Input validation completed successfully');
  }

  /**
   * Safely read the first feature of a GeoJSON file for auto-detection.
   */
  private async readFirstFeature(
    filePath: string
  ): Promise<GeoJSONFeature | null> {
    return new Promise((resolve, reject) => {
      const pipeline = chain([
        fs.createReadStream(filePath, { encoding: 'utf8' }),
        parser(),
        streamArray(),
      ]);

      pipeline.on('data', (data) => {
        // As soon as we get the first feature, we destroy the pipeline
        // to stop reading the rest of the file.
        pipeline.destroy();
        resolve(data.value as GeoJSONFeature);
      });

      pipeline.on('end', () => {
        // This will be called if the file is valid JSON but has no features.
        resolve(null);
      });

      pipeline.on('error', (err) => {
        // Handle cases where the file is not valid JSON, etc.
        if (err.name !== 'Error [ERR_STREAM_PREMATURE_CLOSE]') {
          reject(err);
        }
      });

      // The 'close' event is always called after 'error' or 'end'.
      pipeline.on('close', () => {
        // If the stream was destroyed manually, it might not have resolved yet.
        // We resolve with null if no feature was found before closing.
      });
    });
  }

  /**
   * Create and configure the GeoSPARQL transformer
   */
  private createTransformer(currentFilePath?: string): GeoSPARQLTransformer {
    return new GeoSPARQLTransformer({
      baseUri: this.options.baseUri,
      includePopulationSnapshots: this.options.includePopulationSnapshots,
      logger: this.logger,
      currentFilePath,
      useMinimalFloodProperties: true,
      aggregateFloodZonesByRank: this.options.aggregateByRank,
      minFloodDepthRank: this.options.minFloodDepthRank,
    });
  }

  /**
   * Create and configure the RDF4J loader
   */
  private createLoader(): RDF4JBulkLoader {
    return new RDF4JBulkLoader({
      rdf4jEndpoint: this.options.rdf4jEndpoint,
      repositoryId: this.options.repositoryId,
      batchSize: this.options.batchSize,
      logger: this.logger,
      timeout: 60000, // 60 seconds
      maxRetries: 3,
    });
  }

  /**
   * Test connection to RDF4J server
   */
  private async testRDF4JConnection(loader: RDF4JBulkLoader): Promise<void> {
    this.logger.info('Testing RDF4J server connection...');

    const isConnected = await loader.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to RDF4J server');
    }

    const stats = await loader.getRepositoryStats();
    if (stats.tripleCount >= 0) {
      this.logger.info(
        `Repository currently contains ${stats.tripleCount} triples`
      );
    }
  }

  /**
   * Main data processing pipeline - Memory-efficient sequential processing
   */
  private async processData(
    loader: RDF4JBulkLoader
  ): Promise<LoadResult | null> {
    this.logger.info(
      'Starting memory-efficient sequential data processing pipeline...'
    );

    let totalProcessedFeatures = 0;
    let totalTransformationErrors = 0;
    let totalTriples = 0;
    let totalBatches = 0;
    let totalTime = 0;
    const allErrors: string[] = [];

    try {
      for (
        let fileIndex = 0;
        fileIndex < this.options.filePaths.length;
        fileIndex++
      ) {
        const filePath = this.options.filePaths[fileIndex];
        this.logger.info(
          `Processing file ${fileIndex + 1}/${this.options.filePaths.length}: ${filePath}`
        );

        const fileResult = await this.processFileSequentially(filePath, loader);

        totalProcessedFeatures += fileResult.processedFeatures;
        totalTransformationErrors += fileResult.transformationErrors;
        totalTriples += fileResult.uploadedTriples;
        totalBatches += fileResult.batches;
        totalTime += fileResult.uploadTime;
        allErrors.push(...fileResult.errors);

        this.logger.info(
          `File ${fileIndex + 1} completed: ${fileResult.processedFeatures} features, ${fileResult.uploadedTriples} triples`
        );

        if (global.gc) {
          global.gc();
        }
      }

      this.logger.info(
        `All files processed. Total: ${totalProcessedFeatures} features, ${totalTriples} triples, ${totalTransformationErrors} errors`
      );

      if (totalTransformationErrors > 0) {
        this.logger.warn(
          `${totalTransformationErrors} features failed transformation across all files`
        );
      }

      return {
        totalTriples,
        totalBatches,
        totalTime,
        averageBatchTime: totalBatches > 0 ? totalTime / totalBatches : 0,
        errors: allErrors,
      };
    } catch (error) {
      this.logger.error('Sequential data processing error:', error);
      throw error;
    }
  }

  /**
   * Process a single file with parse -> transform -> load pipeline
   */
  private async processFileSequentially(
    filePath: string,
    loader: RDF4JBulkLoader
  ): Promise<{
    processedFeatures: number;
    transformationErrors: number;
    uploadedTriples: number;
    batches: number;
    uploadTime: number;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const transformer = this.createTransformer(filePath);

      const singleFileParser = new GeoJSONSyncParser({
        inputFilePaths: [filePath],
        maxFeatures: this.options.maxFeatures,
        skipFeatures: this.options.skipFeatures,
        logger: this.logger,
      });

      // Parse features from this file only, now asynchronously
      const parsedFeatures = await singleFileParser.parseAllFeatures();
      this.logger.info(
        `Finished parsing. Found ${parsedFeatures.length} features from ${filePath}`
      );

      if (parsedFeatures.length === 0) {
        this.logger.warn(`No valid features found in ${filePath}`);
        return {
          processedFeatures: 0,
          transformationErrors: 0,
          uploadedTriples: 0,
          batches: 0,
          uploadTime: 0,
          errors: [],
        };
      }

      const result = await this.processFeatures(
        parsedFeatures,
        transformer,
        filePath,
        loader
      );
      return result;
    } catch (error) {
      const errorMsg = `Error processing file ${filePath}: ${error}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);
      return {
        processedFeatures: 0,
        transformationErrors: 0,
        uploadedTriples: 0,
        batches: 0,
        uploadTime: 0,
        errors,
      };
    }
  }

  /**
   * Abstracted feature batch processing with data type branching
   */
  private async processFeatures(
    parsedFeatures: ParsedFeatureData[],
    transformer: GeoSPARQLTransformer,
    filePath: string,
    loader: RDF4JBulkLoader
  ): Promise<{
    processedFeatures: number;
    transformationErrors: number;
    uploadedTriples: number;
    batches: number;
    uploadTime: number;
    errors: string[];
  }> {
    let transformationErrors = 0;
    let uploadedTriples = 0;
    let batches = 0;
    let uploadTime = 0;
    const errors: string[] = [];

    if (this.shouldUseAggregatedProcessing(parsedFeatures)) {
      const features = parsedFeatures.map((data) => data.feature);
      const result = transformer.transformFeatures(features);
      const triples = result.triples;

      this.logger.info(
        `Aggregated ${parsedFeatures.length} flood hazard features into ${result.floodHazardZoneIRIs.length} zones, generating ${triples.length} triples.`
      );

      if (triples.length > 0 && !this.options.dryRun) {
        try {
          const startTime = Date.now();
          await loader.loadTriples(triples);
          const batchTime = Date.now() - startTime;
          uploadedTriples += triples.length;
          batches++;
          uploadTime += batchTime;
          this.logger.info(
            `Uploaded aggregated batch: ${triples.length} triples in ${batchTime}ms`
          );
        } catch (error) {
          const errorMsg = `Failed to upload aggregated batch from ${filePath}: ${error}`;
          this.logger.error(errorMsg);
          errors.push(errorMsg);
        }
      } else if (triples.length > 0 && this.options.dryRun) {
        uploadedTriples += triples.length;
        this.logger.info(
          `Dry run: would upload aggregated ${triples.length} triples`
        );
      }
    } else {
      const batchSize = this.options.batchSize;
      const featureBatches = this.chunkArray(parsedFeatures, batchSize);

      for (
        let batchIndex = 0;
        batchIndex < featureBatches.length;
        batchIndex++
      ) {
        const featureBatch = featureBatches[batchIndex];
        const batchTriples: RDFTriple[] = [];

        this.logger.info(
          `Transforming batch ${batchIndex + 1}/${featureBatches.length} (${featureBatch.length} features) from ${filePath}`
        );

        for (const data of featureBatch) {
          try {
            const result: TransformationResult = transformer.transformFeature(
              data.feature
            );
            batchTriples.push(...result.triples);
          } catch (error) {
            transformationErrors++;
            const errorMsg = `Failed to transform feature ${data.featureIndex} from file ${data.filePath}: ${error}`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);
          }
        }

        if (batchTriples.length > 0 && !this.options.dryRun) {
          try {
            const startTime = Date.now();
            await loader.loadTriples(batchTriples);
            const batchTime = Date.now() - startTime;
            uploadedTriples += batchTriples.length;
            batches++;
            uploadTime += batchTime;
            this.logger.info(
              `Uploaded batch ${batchIndex + 1}: ${batchTriples.length} triples in ${batchTime}ms`
            );
          } catch (error) {
            const errorMsg = `Failed to upload batch ${batchIndex + 1} from ${filePath}: ${error}`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);
          }
        } else if (batchTriples.length > 0 && this.options.dryRun) {
          uploadedTriples += batchTriples.length;
          this.logger.info(
            `Dry run: would upload ${batchTriples.length} triples in batch ${batchIndex + 1}`
          );
        }
      }
    }

    return {
      processedFeatures: parsedFeatures.length,
      transformationErrors,
      uploadedTriples,
      batches,
      uploadTime,
      errors,
    };
  }

  /**
   * Determine if aggregated processing should be used
   */
  private shouldUseAggregatedProcessing(featureBatch: any[]): boolean {
    if (featureBatch.length === 0) {
      return false;
    }
    return this.options.aggregateByRank;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Log configuration details
   */
  private logConfiguration(): void {
    this.logger.info('Configuration:');
    this.logger.info(`  Input files: ${this.options.filePaths.join(', ')}`);
    this.logger.info(`  Data type: ${this.options.dataType}`);
    this.logger.info(`  RDF4J endpoint: ${this.options.rdf4jEndpoint}`);
    this.logger.info(`  Repository ID: ${this.options.repositoryId}`);
    this.logger.info(`  Base URI: ${this.options.baseUri}`);
    this.logger.info(`  Batch size: ${this.options.batchSize}`);
    this.logger.info(
      `  Max features: ${this.options.maxFeatures || 'unlimited'}`
    );
    this.logger.info(`  Skip features: ${this.options.skipFeatures || 0}`);
    this.logger.info(
      `  Include population snapshots: ${this.options.includePopulationSnapshots}`
    );
    this.logger.info(`  Test connection: ${this.options.testConnection}`);
    this.logger.info(`  Dry run: ${this.options.dryRun}`);
  }

  /**
   * Log final results
   */
  private logResults(result: LoadResult | null, totalTime: number): void {
    this.logger.info('='.repeat(50));
    this.logger.info('EXECUTION SUMMARY');
    this.logger.info('='.repeat(50));
    this.logger.info(
      `Total execution time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`
    );

    if (result) {
      this.logger.info(`Triples processed: ${result.totalTriples}`);
      this.logger.info(`Batches processed: ${result.totalBatches}`);
      this.logger.info(`RDF4J load time: ${result.totalTime}ms`);
      this.logger.info(
        `Average batch time: ${result.averageBatchTime.toFixed(2)}ms`
      );

      if (result.errors.length > 0) {
        this.logger.warn(`Errors encountered: ${result.errors.length}`);
        result.errors.forEach((error, index) => {
          this.logger.error(`Error ${index + 1}: ${error}`);
        });
      } else {
        this.logger.info('✅ All operations completed successfully');
      }
    } else {
      this.logger.info('No data was loaded to RDF4J');
    }
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('mlit-geojson-to-rdf4j')
    .description(
      'Convert MLIT GeoJSON data to GeoSPARQL RDF and load into RDF4J server'
    )
    .version('1.0.0');

  program
    .requiredOption(
      '--filePaths <paths...>',
      'Paths to the input data files (GeoJSON or XML)'
    )
    .requiredOption(
      '--rdf4jEndpoint <url>',
      'RDF4J server endpoint URL (e.g., http://localhost:8080/rdf4j-server)'
    )
    .requiredOption('--repositoryId <id>', 'RDF4J repository identifier')
    .option(
      '--dataType <type>',
      'Input data type: population-geojson, landuse-geojson, flood-geojson, or auto',
      'auto'
    )
    .option(
      '--baseUri <uri>',
      'Base URI for generated RDF resources',
      'http://example.org/mlit/'
    )
    .option(
      '--batchSize <size>',
      'Number of triples per batch for RDF4J upload',
      '1000'
    )
    .option(
      '--maxFeatures <count>',
      'Maximum number of features to process (for testing)'
    )
    .option(
      '--skipFeatures <count>',
      'Number of features to skip at the beginning',
      '0'
    )
    .option(
      '--logLevel <level>',
      'Logging level (error, warn, info, debug)',
      'info'
    )
    .option(
      '--testConnection',
      'Test RDF4J connection before processing',
      false
    )
    .option(
      '--dryRun',
      'Parse and transform data but do not upload to RDF4J',
      false
    )
    .option(
      '--includePopulationSnapshots',
      'Include detailed population snapshot data',
      true
    )
    .option(
      '--aggregateByRank',
      'Aggregate flood hazard zones by rank (reduces record count significantly)',
      false
    )
    .option(
      '--minFloodDepthRank <rank>',
      'Minimum flood depth rank to include (for data reduction)',
      '2'
    );

  program.parse();

  const options = program.opts() as CLIOptions;

  // Parse numeric options
  options.batchSize = parseInt(options.batchSize.toString());
  options.minFloodDepthRank = parseInt(options.minFloodDepthRank.toString());
  if (options.maxFeatures) {
    options.maxFeatures = parseInt(options.maxFeatures.toString());
  }
  if (options.skipFeatures) {
    options.skipFeatures = parseInt(options.skipFeatures.toString());
  }

  // Validate numeric options
  if (options.batchSize <= 0) {
    console.error('Batch size must be a positive integer');
    process.exit(1);
  }

  if (options.maxFeatures && options.maxFeatures <= 0) {
    console.error('Max features must be a positive integer');
    process.exit(1);
  }

  if (options.skipFeatures && options.skipFeatures < 0) {
    console.error('Skip features must be a non-negative integer');
    process.exit(1);
  }

  // Validate data type
  const validDataTypes = [
    'population-geojson',
    'landuse-geojson',
    'flood-geojson',
    'auto',
  ];
  if (!validDataTypes.includes(options.dataType)) {
    console.error(
      `Invalid data type: ${options.dataType}. Must be one of: ${validDataTypes.join(', ')}`
    );
    process.exit(1);
  }

  // Validate flood depth rank
  if (options.minFloodDepthRank < 1 || options.minFloodDepthRank > 10) {
    console.error('Minimum flood depth rank must be between 1 and 10');
    process.exit(1);
  }

  // Execute the main application
  const app = new MLITGeoJSONToRDF4J(options);
  await app.execute();
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Execute main function
if (require.main === module) {
  main().catch((error) => {
    console.error('Application failed:', error);
    process.exit(1);
  });
}