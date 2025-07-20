#!/usr/bin/env node

/**
 * SPARQL Query Executor
 * Command-line tool to execute SPARQL queries against RDF4J server
 */

import { Command } from 'commander';
import { createLogger, format, transports } from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

interface SPARQLOptions {
  file: string;
  endpoint: string;
  repository: string;
  format: string;
  timeout: number;
  logLevel: string;
}

/**
 * SPARQL query executor class
 */
class SPARQLExecutor {
  private readonly options: SPARQLOptions;
  private readonly logger;

  constructor(options: SPARQLOptions) {
    this.options = options;
    this.logger = this.createLogger(options.logLevel);
  }

  /**
   * Create Winston logger
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
      ],
    });
  }

  /**
   * Execute SPARQL query
   */
  public async execute(): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.info('🔍 Starting SPARQL query execution');
      this.logConfiguration();

      // Validate inputs
      await this.validateInputs();

      // Read query file
      const query = this.readQueryFile();

      // Execute query
      const result = await this.executeQuery(query);

      // Output results
      this.outputResults(result);

      const totalTime = Date.now() - startTime;
      this.logger.info(`✅ Query executed successfully in ${totalTime}ms`);

    } catch (error) {
      this.logger.error('❌ Query execution failed:', error);
      process.exit(1);
    }
  }

  /**
   * Validate input parameters
   */
  private async validateInputs(): Promise<void> {
    const { file, endpoint, repository } = this.options;

    // Check if query file exists
    if (!fs.existsSync(file)) {
      throw new Error(`Query file does not exist: ${file}`);
    }

    // Validate endpoint URL
    try {
      new URL(endpoint);
    } catch {
      throw new Error(`Invalid endpoint URL: ${endpoint}`);
    }

    // Check repository ID
    if (!repository || repository.trim().length === 0) {
      throw new Error('Repository ID cannot be empty');
    }

    this.logger.info('✅ Input validation completed');
  }

  /**
   * Read SPARQL query from file
   */
  private readQueryFile(): string {
    const { file } = this.options;
    
    try {
      const filePath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
      const query = fs.readFileSync(filePath, 'utf8');
      
      this.logger.info(`📖 Read query from: ${filePath}`);
      this.logger.debug(`Query content:\n${query}`);
      
      return query;
    } catch (error) {
      throw new Error(`Failed to read query file: ${error}`);
    }
  }

  /**
   * Execute SPARQL query against RDF4J server
   */
  private async executeQuery(query: string): Promise<any> {
    const { endpoint, repository, format, timeout } = this.options;
    
    const queryUrl = `${endpoint}/repositories/${repository}`;
    
    this.logger.info(`🚀 Executing query against: ${queryUrl}`);
    
    try {
      const response = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': this.getAcceptHeader(format),
        },
        body: query,
        timeout: timeout,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json') || contentType.includes('application/sparql-results+json')) {
        return await response.json();
      } else if (contentType.includes('text/csv')) {
        return await response.text();
      } else if (contentType.includes('application/sparql-results+xml')) {
        return await response.text();
      } else {
        return await response.text();
      }

    } catch (error) {
      throw new Error(`Query execution failed: ${error}`);
    }
  }

  /**
   * Get appropriate Accept header for format
   */
  private getAcceptHeader(format: string): string {
    switch (format.toLowerCase()) {
      case 'json':
        return 'application/sparql-results+json';
      case 'xml':
        return 'application/sparql-results+xml';
      case 'csv':
        return 'text/csv';
      case 'tsv':
        return 'text/tab-separated-values';
      default:
        return 'application/sparql-results+json';
    }
  }

  /**
   * Output query results
   */
  private outputResults(result: any): void {
    const { format } = this.options;

    console.log('\n' + '='.repeat(50));
    console.log('QUERY RESULTS');
    console.log('='.repeat(50));

    if (typeof result === 'string') {
      console.log(result);
    } else if (result.results && result.results.bindings) {
      // SPARQL JSON results format
      const bindings = result.results.bindings;
      
      if (bindings.length === 0) {
        console.log('No results found.');
        return;
      }

      // Extract variable names
      const vars = result.head.vars;
      
      if (format.toLowerCase() === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Table format
        console.log(`Found ${bindings.length} result(s):\n`);
        
        // Print header
        console.log(vars.map((v: string) => v.padEnd(20)).join(' | '));
        console.log(vars.map(() => '-'.repeat(20)).join('-+-'));
        
        // Print rows
        bindings.forEach((binding: any) => {
          const row = vars.map((variable: string) => {
            const value = binding[variable];
            if (value) {
              return (value.value || value).toString().padEnd(20);
            }
            return ''.padEnd(20);
          });
          console.log(`${row.join(' | ')}`);
        });
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    console.log('\n' + '='.repeat(50));
  }

  /**
   * Log configuration details
   */
  private logConfiguration(): void {
    this.logger.info('Configuration:');
    this.logger.info(`  Query file: ${this.options.file}`);
    this.logger.info(`  Endpoint: ${this.options.endpoint}`);
    this.logger.info(`  Repository: ${this.options.repository}`);
    this.logger.info(`  Format: ${this.options.format}`);
    this.logger.info(`  Timeout: ${this.options.timeout}ms`);
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('sparql-executor')
    .description('Execute SPARQL queries against RDF4J server')
    .version('1.0.0');

  program
    .requiredOption(
      '--file <path>',
      'Path to SPARQL query file'
    )
    .requiredOption(
      '--endpoint <url>',
      'RDF4J server endpoint URL (e.g., http://localhost:8080/rdf4j-server)'
    )
    .requiredOption(
      '--repository <id>',
      'RDF4J repository identifier'
    )
    .option(
      '--format <format>',
      'Output format: json, xml, csv, tsv, table',
      'table'
    )
    .option(
      '--timeout <ms>',
      'Query timeout in milliseconds',
      '30000'
    )
    .option(
      '--logLevel <level>',
      'Logging level (error, warn, info, debug)',
      'info'
    );

  program.parse();

  const options = program.opts() as SPARQLOptions;

  // Parse numeric options
  options.timeout = parseInt(options.timeout.toString());

  // Validate numeric options
  if (options.timeout <= 0) {
    console.error('Timeout must be a positive integer');
    process.exit(1);
  }

  // Execute the query
  const executor = new SPARQLExecutor(options);
  await executor.execute();
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