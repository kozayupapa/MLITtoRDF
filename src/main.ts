#!/usr/bin/env node

/**
 * MLIT GeoJSON to RDF4J CLI Tool
 * Command-line program to convert MLIT GeoJSON data to GeoSPARQL RDF and load into RDF4J server
 */

import { Command } from 'commander';
import { createLogger, format, transports } from 'winston';
import * as fs from 'fs';
import { GeoJSONSyncParser } from './data-parser';
import {
  GeoSPARQLTransformer,
  RDFTriple,
  TransformationResult,
} from './geo-transformer';
import { RDF4JBulkLoader, LoadResult } from './rdf-loader';

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
      // Check the first file to determine data type
      const firstFile = filePaths[0].toLowerCase();
      if (firstFile.endsWith('.geojson') || firstFile.endsWith('.json')) {
        // Auto-detect between regular geojson and land use geojson by checking content
        try {
          const sampleContent = JSON.parse(
            fs.readFileSync(filePaths[0], 'utf8')
          );
          if (sampleContent.features && sampleContent.features.length > 0) {
            const firstFeature = sampleContent.features[0];
            if (
              firstFeature.properties &&
              (firstFeature.properties.田 !== undefined ||
                firstFeature.properties.森林 !== undefined ||
                firstFeature.properties.メッシュ !== undefined)
            ) {
              this.options.dataType = 'landuse-geojson';
              this.logger.info('Auto-detected Land Use GeoJSON data format');
            } else if (
              firstFeature.properties &&
              (firstFeature.properties.A31a_101 ||
                firstFeature.properties.A31a_201 ||
                firstFeature.properties.A31a_301 ||
                firstFeature.properties.A31a_401)
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
            this.logger.info('Auto-detected Population GeoJSON data format');
          }
        } catch (error) {
          this.logger.warn(
            'Error parsing JSON file for auto-detection, defaulting to Population GeoJSON'
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

    // Validate file extensions based on data type
    for (const filePath of filePaths) {
      const fileExt = filePath.toLowerCase();
      if (
        (this.options.dataType === 'population-geojson' ||
          this.options.dataType === 'landuse-geojson') &&
        !fileExt.endsWith('.geojson') &&
        !fileExt.endsWith('.json')
      ) {
        this.logger.warn(
          `GeoJSON data type specified but file ${filePath} does not have .geojson or .json extension`
        );
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

    // Check repository ID format
    if (!repositoryId || repositoryId.trim().length === 0) {
      throw new Error('Repository ID cannot be empty');
    }

    this.logger.info('Input validation completed successfully');
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

    // Get repository statistics
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
      // Process files one by one to avoid memory issues
      for (
        let fileIndex = 0;
        fileIndex < this.options.filePaths.length;
        fileIndex++
      ) {
        const filePath = this.options.filePaths[fileIndex];
        this.logger.info(
          `Processing file ${fileIndex + 1}/${
            this.options.filePaths.length
          }: ${filePath}`
        );

        const fileResult = await this.processFileSequentially(
          filePath,
          loader,
          totalProcessedFeatures
        );

        // Accumulate results
        totalProcessedFeatures += fileResult.processedFeatures;
        totalTransformationErrors += fileResult.transformationErrors;
        totalTriples += fileResult.uploadedTriples;
        totalBatches += fileResult.batches;
        totalTime += fileResult.uploadTime;
        allErrors.push(...fileResult.errors);

        this.logger.info(
          `File ${fileIndex + 1} completed: ${
            fileResult.processedFeatures
          } features, ${fileResult.uploadedTriples} triples`
        );

        // Force garbage collection hint
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
    loader: RDF4JBulkLoader,
    globalFeatureOffset: number
  ): Promise<{
    processedFeatures: number;
    transformationErrors: number;
    uploadedTriples: number;
    batches: number;
    uploadTime: number;
    errors: string[];
  }> {
    let processedFeatures = 0;
    let transformationErrors = 0;
    let uploadedTriples = 0;
    let batches = 0;
    let uploadTime = 0;
    const errors: string[] = [];

    try {
      // Create file-specific transformer with path context
      const transformer = this.createTransformer(filePath);

      // Create a single-file parser
      const singleFileParser = new GeoJSONSyncParser({
        inputFilePaths: [filePath],
        maxFeatures: this.options.maxFeatures,
        skipFeatures: this.options.skipFeatures,
        logger: this.logger,
      });

      // Parse features from this file only
      const parsedFeatures = singleFileParser.parseAllFeatures();
      this.logger.info(
        `Parsed ${parsedFeatures.length} features from ${filePath}`
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

      // Process features in smaller batches to control memory usage
      const batchSize = Math.min(this.options.batchSize, 500); // Limit batch size for memory
      const featureBatches = this.chunkArray(parsedFeatures, batchSize);

      for (
        let batchIndex = 0;
        batchIndex < featureBatches.length;
        batchIndex++
      ) {
        const featureBatch = featureBatches[batchIndex];
        const batchTriples: RDFTriple[] = [];

        this.logger.info(
          `Processing batch ${batchIndex + 1}/${featureBatches.length} (${
            featureBatch.length
          } features) from ${filePath}`
        );

        // Transform features in this batch
        for (const data of featureBatch) {
          try {
            const result: TransformationResult = transformer.transformFeature(
              data.feature
            );
            batchTriples.push(...result.triples);
            processedFeatures++;

            // Log progress periodically
            if ((globalFeatureOffset + processedFeatures) % 1000 === 0) {
              this.logger.info(
                `Transformed ${
                  globalFeatureOffset + processedFeatures
                } total features`
              );
            }
          } catch (error) {
            transformationErrors++;
            const errorMsg = `Failed to transform feature ${data.featureIndex} from file ${data.filePath}: ${error}`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);

            // Continue processing unless too many errors
            if (transformationErrors > 100) {
              throw new Error(
                `Too many transformation errors (${transformationErrors}), aborting file ${filePath}`
              );
            }
          }
        }

        // Upload this batch to RDF4J if we have triples
        if (batchTriples.length > 0 && !this.options.dryRun) {
          try {
            const startTime = Date.now();
            await loader.loadTriples(batchTriples);
            const batchTime = Date.now() - startTime;

            uploadedTriples += batchTriples.length;
            batches++;
            uploadTime += batchTime;

            this.logger.info(
              `Uploaded batch ${batchIndex + 1}: ${
                batchTriples.length
              } triples in ${batchTime}ms`
            );
          } catch (error) {
            const errorMsg = `Failed to upload batch ${
              batchIndex + 1
            } from ${filePath}: ${error}`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);
          }
        } else if (batchTriples.length > 0 && this.options.dryRun) {
          uploadedTriples += batchTriples.length;
          this.logger.info(
            `Dry run: would upload ${batchTriples.length} triples`
          );
        }

        // Clear batch data to free memory
        batchTriples.length = 0;
      }
    } catch (error) {
      const errorMsg = `Error processing file ${filePath}: ${error}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);
    }

    return {
      processedFeatures,
      transformationErrors,
      uploadedTriples,
      batches,
      uploadTime,
      errors,
    };
  }

  /**
   * Utility function to split array into chunks
   */
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
    );

  program.parse();

  const options = program.opts() as CLIOptions;

  // Parse numeric options
  options.batchSize = parseInt(options.batchSize.toString());
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
  const validDataTypes = ['population-geojson', 'landuse-geojson', 'auto'];
  if (!validDataTypes.includes(options.dataType)) {
    console.error(
      `Invalid data type: ${
        options.dataType
      }. Must be one of: ${validDataTypes.join(', ')}`
    );
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
