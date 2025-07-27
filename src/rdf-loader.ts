/**
 * RDF Loader Module
 * Handles efficient bulk loading of RDF triples to RDF4J server
 * Uses batched SPARQL UPDATE operations for optimal performance
 */

import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { Logger } from 'winston';
import { RDFTriple } from './geo-transformer';
import { generateSparqlPrefixes } from './ontology-config';
import fetch from 'node-fetch';

export interface LoaderOptions {
  rdf4jEndpoint: string;
  repositoryId: string;
  batchSize: number;
  logger?: Logger;
  timeout?: number;
  maxRetries?: number;
  serverType?: 'rdf4j' | 'virtuoso';
}

export interface TripleBatchInfo {
  batchIndex: number;
  startFeatureIndex: number;
  endFeatureIndex: number;
  triplesCount: number;
}

export interface LoadResult {
  totalTriples: number;
  totalBatches: number;
  totalTime: number;
  averageBatchTime: number;
  errors: string[];
}

export interface BatchResult {
  batchIndex: number;
  triplesCount: number;
  executionTime: number;
  success: boolean;
  error?: string;
}

/**
 * RDF4J bulk loader optimized for large datasets
 * Uses batched SPARQL UPDATE operations with transaction management
 */
export class RDF4JBulkLoader {
  private readonly options: LoaderOptions;
  private readonly logger: Logger;
  private readonly fetcher: SparqlEndpointFetcher;
  private readonly endpointUrl: string;

  constructor(options: LoaderOptions) {
    this.options = options;
    this.logger = options.logger || (console as any);
    
    // Default to RDF4J server type if not specified
    if (!this.options.serverType) {
      this.options.serverType = 'rdf4j';
    }

    // Construct full endpoint URL
    this.endpointUrl = this.buildEndpointUrl(
      options.rdf4jEndpoint,
      options.repositoryId
    );

    // Initialize SPARQL endpoint fetcher
    this.fetcher = new SparqlEndpointFetcher({
      timeout: options.timeout || 30000,
    });

    this.logger.info(
      `Initialized ${this.options.serverType.toUpperCase()} loader for endpoint: ${this.endpointUrl}`
    );
    this.logger.info(`Batch size: ${options.batchSize}`);
  }

  /**
   * Load RDF triples in batches to RDF4J server with feature mapping
   */
  public async loadTriplesWithFeatureInfo(
    triples: RDFTriple[], 
    triplesPerFeature: number,
    totalFeatures: number
  ): Promise<LoadResult> {
    const startTime = Date.now();
    const { batchSize } = this.options;

    this.logger.info(
      `Starting bulk load of ${triples.length} triples (${totalFeatures} features, ~${triplesPerFeature} triples/feature) in batches of ${batchSize}`
    );

    const batches = this.createBatches(triples, batchSize);
    const batchResults: BatchResult[] = [];
    const errors: string[] = [];

    // Process batches sequentially to avoid overwhelming the server
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchStartTime = Date.now();

      // Calculate approximate feature range for this batch
      const startTripleIndex = i * batchSize;
      const endTripleIndex = Math.min(startTripleIndex + batch.length - 1, triples.length - 1);
      const startFeatureIndex = Math.floor(startTripleIndex / triplesPerFeature);
      const endFeatureIndex = Math.floor(endTripleIndex / triplesPerFeature);

      this.logger.info(
        `Processing batch ${i + 1}/${batches.length} (${batch.length} triples, features ~${startFeatureIndex}-${endFeatureIndex})`
      );

      try {
        await this.insertBatchWithRetry(batch, i + 1);

        const batchTime = Date.now() - batchStartTime;
        batchResults.push({
          batchIndex: i,
          triplesCount: batch.length,
          executionTime: batchTime,
          success: true,
        });

        this.logger.info(`Batch ${i + 1} completed in ${batchTime}ms`);

        // Optional: Add small delay between batches to avoid overloading server
        if (i < batches.length - 1) {
          await this.delay(100);
        }
      } catch (error) {
        const errorMessage = `Batch ${i + 1} failed after all retries: ${error}`;
        this.logger.error(errorMessage);

        // Calculate skipFeatures for manual restart based on feature count
        const skipFeatures = startFeatureIndex;
        this.logger.info('='.repeat(60));
        this.logger.info('💡 RESTART INSTRUCTIONS');
        this.logger.info('='.repeat(60));
        this.logger.info(`To resume from this failed batch, restart with:`);
        this.logger.info(`  --skipFeatures ${skipFeatures}`);
        this.logger.info(`This will skip the first ${skipFeatures} features and restart processing`);
        this.logger.info(`Failed batch ${i + 1} covers features ~${startFeatureIndex}-${endFeatureIndex}`);
        this.logger.info('='.repeat(60));

        errors.push(errorMessage);
        batchResults.push({
          batchIndex: i,
          triplesCount: batch.length,
          executionTime: Date.now() - batchStartTime,
          success: false,
          error: errorMessage,
        });

        // Decide whether to continue or abort based on error severity
        if (this.isCriticalError(error)) {
          this.logger.error('Critical error encountered, aborting bulk load');
          break;
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const successfulBatches = batchResults.filter((r) => r.success);
    const totalTriples = successfulBatches.reduce(
      (sum, r) => sum + r.triplesCount,
      0
    );
    const averageBatchTime =
      successfulBatches.length > 0
        ? successfulBatches.reduce((sum, r) => sum + r.executionTime, 0) /
          successfulBatches.length
        : 0;

    const result: LoadResult = {
      totalTriples,
      totalBatches: batches.length,
      totalTime,
      averageBatchTime,
      errors,
    };

    this.logger.info(
      `Bulk load completed. ${totalTriples} triples loaded in ${totalTime}ms`
    );
    if (errors.length > 0) {
      this.logger.warn(`${errors.length} batches failed during load`);
      
      // Show restart instructions for failed batches
      const failedBatches = batchResults.filter((r) => !r.success);
      if (failedBatches.length > 0) {
        this.logger.info('');
        this.logger.info('🔄 FAILED BATCH RESTART GUIDE');
        this.logger.info('='.repeat(50));
        failedBatches.forEach((batch) => {
          const startTripleIndex = batch.batchIndex * batchSize;
          const skipFeatures = Math.floor(startTripleIndex / triplesPerFeature);
          this.logger.info(`Batch ${batch.batchIndex + 1}: --skipFeatures ${skipFeatures}`);
        });
        this.logger.info('='.repeat(50));
      }
    }

    return result;
  }

  /**
   * Load RDF triples in batches to RDF4J server (legacy method)
   */
  public async loadTriples(triples: RDFTriple[]): Promise<LoadResult> {
    const startTime = Date.now();
    const { batchSize } = this.options;

    this.logger.info(
      `Starting bulk load of ${triples.length} triples in batches of ${batchSize}`
    );

    const batches = this.createBatches(triples, batchSize);
    const batchResults: BatchResult[] = [];
    const errors: string[] = [];

    // Process batches sequentially to avoid overwhelming the server
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchStartTime = Date.now();

      this.logger.info(
        `Processing batch ${i + 1}/${batches.length} (${batch.length} triples)`
      );

      try {
        await this.insertBatchWithRetry(batch, i + 1);

        const batchTime = Date.now() - batchStartTime;
        batchResults.push({
          batchIndex: i,
          triplesCount: batch.length,
          executionTime: batchTime,
          success: true,
        });

        this.logger.info(`Batch ${i + 1} completed in ${batchTime}ms`);

        // Optional: Add small delay between batches to avoid overloading server
        if (i < batches.length - 1) {
          await this.delay(100);
        }
      } catch (error) {
        const errorMessage = `Batch ${i + 1} failed after all retries: ${error}`;
        this.logger.error(errorMessage);

        // Calculate skipFeatures for manual restart
        const skipFeatures = i * batchSize;
        this.logger.info('='.repeat(60));
        this.logger.info('💡 RESTART INSTRUCTIONS');
        this.logger.info('='.repeat(60));
        this.logger.info(`To resume from this failed batch, restart with:`);
        this.logger.info(`  --skipFeatures ${skipFeatures}`);
        this.logger.info(`This will skip the first ${skipFeatures} features and restart from batch ${i + 1}`);
        this.logger.info('='.repeat(60));

        errors.push(errorMessage);
        batchResults.push({
          batchIndex: i,
          triplesCount: batch.length,
          executionTime: Date.now() - batchStartTime,
          success: false,
          error: errorMessage,
        });

        // Decide whether to continue or abort based on error severity
        if (this.isCriticalError(error)) {
          this.logger.error('Critical error encountered, aborting bulk load');
          break;
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const successfulBatches = batchResults.filter((r) => r.success);
    const totalTriples = successfulBatches.reduce(
      (sum, r) => sum + r.triplesCount,
      0
    );
    const averageBatchTime =
      successfulBatches.length > 0
        ? successfulBatches.reduce((sum, r) => sum + r.executionTime, 0) /
          successfulBatches.length
        : 0;

    const result: LoadResult = {
      totalTriples,
      totalBatches: batches.length,
      totalTime,
      averageBatchTime,
      errors,
    };

    this.logger.info(
      `Bulk load completed. ${totalTriples} triples loaded in ${totalTime}ms`
    );
    if (errors.length > 0) {
      this.logger.warn(`${errors.length} batches failed during load`);
      
      // Show restart instructions for failed batches
      const failedBatches = batchResults.filter((r) => !r.success);
      if (failedBatches.length > 0) {
        this.logger.info('');
        this.logger.info('🔄 FAILED BATCH RESTART GUIDE');
        this.logger.info('='.repeat(50));
        failedBatches.forEach((batch) => {
          const skipFeatures = batch.batchIndex * this.options.batchSize;
          this.logger.info(`Batch ${batch.batchIndex + 1}: --skipFeatures ${skipFeatures}`);
        });
        this.logger.info('='.repeat(50));
      }
    }

    return result;
  }

  /**
   * Insert a batch of triples with retry mechanism
   */
  private async insertBatchWithRetry(triples: RDFTriple[], batchNumber: number): Promise<void> {
    const maxRetries = this.options.maxRetries || 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        if (attempt > 1) {
          this.logger.info(`Retrying batch ${batchNumber}, attempt ${attempt}/${maxRetries + 1}`);
        }
        
        await this.insertBatch(triples);
        
        if (attempt > 1) {
          this.logger.info(`Batch ${batchNumber} succeeded on attempt ${attempt}`);
        }
        return; // Success, exit retry loop
        
      } catch (error) {
        lastError = error;
        
        // Check if this is a retryable error
        if (!this.isRetryableError(error)) {
          this.logger.warn(`Batch ${batchNumber} failed with non-retryable error: ${error}`);
          throw error;
        }
        
        // If this was the last attempt, throw the error
        if (attempt > maxRetries) {
          this.logger.error(`Batch ${batchNumber} failed after ${maxRetries} retries`);
          throw error;
        }
        
        // Calculate exponential backoff delay
        const baseDelay = 1000; // 1 second
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000; // Add jitter
        
        this.logger.warn(
          `Batch ${batchNumber} failed on attempt ${attempt}/${maxRetries + 1}: ${error}. Retrying in ${Math.round(delay)}ms...`
        );
        
        await this.delay(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Insert a batch of triples using SPARQL UPDATE
   */
  private async insertBatch(triples: RDFTriple[]): Promise<void> {
    try {
      if (this.options.serverType === 'virtuoso') {
        await this.insertBatchVirtuoso(triples);
      } else {
        await this.insertBatchRDF4J(triples);
      }
    } catch (error) {
      this.logger.debug(
        `SPARQL UPDATE failed for batch of ${triples.length} triples: ${error}`
      );
      throw error;
    }
  }

  /**
   * Insert a batch of triples to RDF4J server
   */
  private async insertBatchRDF4J(triples: RDFTriple[]): Promise<void> {
    const sparqlUpdate = this.buildInsertDataQuery(triples);
    await this.fetcher.fetchUpdate(this.endpointUrl, sparqlUpdate);
  }

  /**
   * Insert a batch of triples to Virtuoso server
   */
  private async insertBatchVirtuoso(triples: RDFTriple[]): Promise<void> {
    const sparqlUpdate = this.buildInsertDataQueryVirtuoso(triples);
    
    const response = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-update',
      },
      body: sparqlUpdate,
      timeout: this.options.timeout || 30000,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
  }

  /**
   * Build SPARQL INSERT DATA query for a batch of triples (RDF4J)
   */
  private buildInsertDataQuery(triples: RDFTriple[]): string {
    const prefixes = generateSparqlPrefixes();

    const tripleStatements = triples
      .map((triple) => `    ${this.formatTripleForSparql(triple)}`)
      .join(' .\n');

    return `${prefixes}

INSERT DATA {
${tripleStatements} .
}`;
  }

  /**
   * Build SPARQL INSERT DATA query for a batch of triples (Virtuoso)
   */
  private buildInsertDataQueryVirtuoso(triples: RDFTriple[]): string {
    const prefixes = generateSparqlPrefixes();

    const tripleStatements = triples
      .map((triple) => `    ${this.formatTripleForSparql(triple)}`)
      .join(' .\n');

    // Use a specific graph for Virtuoso
    const graphUri = 'http://example.com/geosparql-data-direct';

    return `${prefixes}

INSERT DATA {
  GRAPH <${graphUri}> {
${tripleStatements} .
  }
}`;
  }

  /**
   * Format an RDF triple for SPARQL syntax
   */
  private formatTripleForSparql(triple: RDFTriple): string {
    const { subject, predicate, object } = triple;

    // Ensure proper formatting of IRIs and literals
    const formattedSubject = this.formatResource(subject);
    const formattedPredicate = this.formatResource(predicate);
    const formattedObject = this.formatResource(object);

    return `${formattedSubject} ${formattedPredicate} ${formattedObject}`;
  }

  /**
   * Format a resource (IRI or literal) for SPARQL
   */
  private formatResource(resource: string): string {
    // If it's already a literal (starts with quote), return as-is
    if (resource.startsWith('"')) {
      return resource;
    }

    // If it's a full IRI (starts with http), wrap in angle brackets
    if (resource.startsWith('http')) {
      return `<${resource}>`;
    }

    // If it contains a known prefix, return as-is (assume it's properly prefixed)
    if (resource.includes(':')) {
      return resource;
    }

    // Otherwise, assume it's a full IRI that needs wrapping
    return `<${resource}>`;
  }

  /**
   * Create batches from an array of triples
   */
  private createBatches(
    triples: RDFTriple[],
    batchSize: number
  ): RDFTriple[][] {
    const batches: RDFTriple[][] = [];

    for (let i = 0; i < triples.length; i += batchSize) {
      batches.push(triples.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Build full endpoint URL based on server type
   */
  private buildEndpointUrl(baseUrl: string, repositoryId: string): string {
    // Remove trailing slash from base URL if present
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    if (this.options.serverType === 'virtuoso') {
      // For Virtuoso, the endpoint is typically /sparql
      return `${cleanBaseUrl}/sparql`;
    } else {
      // For RDF4J
      // Check if the URL already includes the repository path
      if (cleanBaseUrl.includes(`/repositories/${repositoryId}`)) {
        return `${cleanBaseUrl}/statements`;
      }

      // Construct full URL
      return `${cleanBaseUrl}/repositories/${repositoryId}/statements`;
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    const errorMessage = error.toString().toLowerCase();
    const errorName = error.name?.toLowerCase() || '';

    // Retryable errors (network issues, timeouts, temporary server issues)
    const retryablePatterns = [
      'aborterror',
      'abort',
      'timeout',
      'connection reset',
      'econnreset',
      'enotfound',
      'etimedout',
      'network error',
      'fetch failed',
      'socket hang up',
      'service unavailable',
      'bad gateway',
      'gateway timeout',
      'internal server error',
      'too many requests',
    ];

    // Non-retryable errors (permanent failures)
    const nonRetryablePatterns = [
      'repository not found',
      'unauthorized',
      'forbidden',
      'bad request',
      'syntax error',
      'malformed query',
    ];

    // Check for non-retryable patterns first
    if (nonRetryablePatterns.some((pattern) => 
        errorMessage.includes(pattern) || errorName.includes(pattern))) {
      return false;
    }

    // Check for retryable patterns
    return retryablePatterns.some((pattern) => 
      errorMessage.includes(pattern) || errorName.includes(pattern));
  }

  /**
   * Determine if an error is critical and should abort the process
   */
  private isCriticalError(error: any): boolean {
    const errorMessage = error.toString().toLowerCase();

    // Critical errors that should abort the process (permanent failures)
    const criticalPatterns = [
      'repository not found',
      'unauthorized',
      'forbidden',
      'connection refused',
      'malformed query',
      'syntax error',
    ];

    return criticalPatterns.some((pattern) => errorMessage.includes(pattern));
  }

  /**
   * Simple delay utility
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test connection to RDF4J server
   */
  public async testConnection(): Promise<boolean> {
    try {
      this.logger.info(
        `Testing connection to RDF4J server: ${this.endpointUrl}`
      );

      // Try a simple ASK query to test connectivity
      const testQuery = `${generateSparqlPrefixes()}
      
ASK { ?s ?p ?o }`;

      await this.fetcher.fetchAsk(
        this.endpointUrl.replace('/statements', ''),
        testQuery
      );

      this.logger.info('Connection test successful');
      return true;
    } catch (error) {
      this.logger.error(`Connection test failed: ${error}`);
      return false;
    }
  }

  /**
   * Get repository statistics
   */
  public async getRepositoryStats(): Promise<{ tripleCount: number }> {
    try {
      const query = `${generateSparqlPrefixes()}
      
SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }`;

      const bindingsStream = await this.fetcher.fetchBindings(
        this.endpointUrl.replace('/statements', ''),
        query
      );

      const bindings = [];
      for await (const binding of bindingsStream) {
        bindings.push(binding);
      }

      const count =
        bindings.length > 0 ? parseInt((bindings[0] as any).count.value) : 0;
      return { tripleCount: count };
    } catch (error) {
      this.logger.error(`Failed to get repository stats: ${error}`);
      return { tripleCount: -1 };
    }
  }
}

/**
 * Utility function to create a loader with default configuration
 */
export function createRDF4JLoader(
  rdf4jEndpoint: string,
  repositoryId: string,
  batchSize: number = 1000,
  options: Partial<LoaderOptions> = {}
): RDF4JBulkLoader {
  return new RDF4JBulkLoader({
    rdf4jEndpoint,
    repositoryId,
    batchSize,
    ...options,
  });
}
