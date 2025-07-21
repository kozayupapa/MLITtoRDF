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
  dataType: 'population-geojson' | 'landuse-geojson' | 'auto';
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
      const parser = this.createParser();
      const transformer = this.createTransformer();
      const loader = this.createLoader();

      // Test RDF4J connection if requested
      if (this.options.testConnection) {
        await this.testRDF4JConnection(loader);
      }

      // Process the data
      const result = await this.processData(parser, transformer, loader);

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
      if (
        firstFile.endsWith('.geojson') ||
        firstFile.endsWith('.json')
      ) {
        // Auto-detect between regular geojson and land use geojson by checking content
        try {
          const sampleContent = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
          if (sampleContent.features && sampleContent.features.length > 0) {
            const firstFeature = sampleContent.features[0];
            if (firstFeature.properties && 
                (firstFeature.properties.田!== undefined || 
                 firstFeature.properties.森林 !== undefined ||
                 firstFeature.properties.メッシュ !== undefined)) {
              this.options.dataType = 'landuse-geojson';
              this.logger.info('Auto-detected Land Use GeoJSON data format');
            } else {
              this.options.dataType = 'population-geojson';
              this.logger.info('Auto-detected Population GeoJSON data format');
            }
          } else {
            this.options.dataType = 'population-geojson';
            this.logger.info('Auto-detected Population GeoJSON data format');
          }
        } catch (error) {
          this.logger.warn('Error parsing JSON file for auto-detection, defaulting to Population GeoJSON');
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
        (this.options.dataType === 'population-geojson' || this.options.dataType === 'landuse-geojson') &&
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
   * Create and configure the GeoJSON parser
   */
  private createParser(): GeoJSONSyncParser {
    return new GeoJSONSyncParser({
      inputFilePaths: this.options.filePaths,
      maxFeatures: this.options.maxFeatures,
      skipFeatures: this.options.skipFeatures,
      logger: this.logger,
    });
  }

  /**
   * Create and configure the GeoSPARQL transformer
   */
  private createTransformer(): GeoSPARQLTransformer {
    return new GeoSPARQLTransformer({
      baseUri: this.options.baseUri,
      includePopulationSnapshots: this.options.includePopulationSnapshots,
      logger: this.logger,
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
   * Main data processing pipeline
   */
  private async processData(
    parser: GeoJSONSyncParser,
    transformer: GeoSPARQLTransformer,
    loader: RDF4JBulkLoader
  ): Promise<LoadResult | null> {
    // GeoJSON処理パイプライン
    this.logger.info('Starting data processing pipeline...');

    const allTriples: RDFTriple[] = [];
    let processedFeatures = 0;
    let transformationErrors = 0;

    try {
      // Parse all features synchronously
      const parsedFeatures = parser.parseAllFeatures();
      this.logger.info(
        `Parsed ${parsedFeatures.length} features from ${this.options.filePaths.length} files`
      );

      // Transform each feature to RDF triples
      for (const data of parsedFeatures) {
        try {
          // Transform GeoJSON feature to RDF triples
          const result: TransformationResult = transformer.transformFeature(
            data.feature
          );
          allTriples.push(...result.triples);
          processedFeatures++;

          // Log progress periodically
          if (processedFeatures % 1000 === 0) {
            this.logger.info(
              `Transformed ${processedFeatures} features, generated ${allTriples.length} triples`
            );
          }
        } catch (error) {
          transformationErrors++;
          this.logger.error(
            `Failed to transform feature ${data.featureIndex} from file ${data.filePath}:`,
            error
          );

          // Continue processing unless too many errors
          if (transformationErrors > 100) {
            throw new Error(
              `Too many transformation errors (${transformationErrors}), aborting`
            );
          }
        }
      }

      this.logger.info(
        `Transformation completed. ${processedFeatures} features processed, ${allTriples.length} triples generated`
      );

      if (transformationErrors > 0) {
        this.logger.warn(
          `${transformationErrors} features failed transformation`
        );
      }

      if (allTriples.length === 0) {
        this.logger.warn('No triples generated, skipping RDF4J upload');
        return null;
      }

      // Load triples to RDF4J (unless dry run)
      let result: LoadResult | null = null;
      if (!this.options.dryRun) {
        this.logger.info('Starting RDF4J bulk load...');
        
        // Calculate average triples per feature for accurate restart instructions
        const triplesPerFeature = parsedFeatures.length > 0 ? 
          Math.round(allTriples.length / parsedFeatures.length) : 1;
        
        result = await loader.loadTriplesWithFeatureInfo(
          allTriples, 
          triplesPerFeature, 
          parsedFeatures.length
        );
      } else {
        this.logger.info('Dry run mode - skipping RDF4J upload');
        result = {
          totalTriples: allTriples.length,
          totalBatches: Math.ceil(allTriples.length / this.options.batchSize),
          totalTime: 0,
          averageBatchTime: 0,
          errors: [],
        };
      }

      return result;
    } catch (error) {
      this.logger.error('Data processing error:', error);
      throw error;
    }
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
      'Input data type: population-geojson, landuse-geojson, or auto',
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
