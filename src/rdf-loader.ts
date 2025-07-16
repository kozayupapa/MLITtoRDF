/**
 * RDF Loader Module
 * Handles efficient bulk loading of RDF triples to RDF4J server
 * Uses batched SPARQL UPDATE operations for optimal performance
 */

import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { Logger } from 'winston';
import { RDFTriple } from './geo-transformer';
import { generateSparqlPrefixes } from './ontology-config';

export interface LoaderOptions {
  rdf4jEndpoint: string;
  repositoryId: string;
  batchSize: number;
  logger?: Logger;
  timeout?: number;
  maxRetries?: number;
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
    this.logger = options.logger || console as any;
    
    // Construct full endpoint URL
    this.endpointUrl = this.buildEndpointUrl(options.rdf4jEndpoint, options.repositoryId);
    
    // Initialize SPARQL endpoint fetcher
    this.fetcher = new SparqlEndpointFetcher({
      timeout: options.timeout || 30000
    });

    this.logger.info(`Initialized RDF4J loader for endpoint: ${this.endpointUrl}`);
    this.logger.info(`Batch size: ${options.batchSize}`);
  }

  /**
   * Load RDF triples in batches to RDF4J server
   */
  public async loadTriples(triples: RDFTriple[]): Promise<LoadResult> {
    const startTime = Date.now();
    const { batchSize } = this.options;
    
    this.logger.info(`Starting bulk load of ${triples.length} triples in batches of ${batchSize}`);

    const batches = this.createBatches(triples, batchSize);
    const batchResults: BatchResult[] = [];
    const errors: string[] = [];

    // Process batches sequentially to avoid overwhelming the server
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchStartTime = Date.now();

      this.logger.info(`Processing batch ${i + 1}/${batches.length} (${batch.length} triples)`);

      try {
        await this.insertBatch(batch);
        
        const batchTime = Date.now() - batchStartTime;
        batchResults.push({
          batchIndex: i,
          triplesCount: batch.length,
          executionTime: batchTime,
          success: true
        });

        this.logger.info(`Batch ${i + 1} completed in ${batchTime}ms`);

        // Optional: Add small delay between batches to avoid overloading server
        if (i < batches.length - 1) {
          await this.delay(100);
        }

      } catch (error) {
        const errorMessage = `Batch ${i + 1} failed: ${error}`;
        this.logger.error(errorMessage);
        
        errors.push(errorMessage);
        batchResults.push({
          batchIndex: i,
          triplesCount: batch.length,
          executionTime: Date.now() - batchStartTime,
          success: false,
          error: errorMessage
        });

        // Decide whether to continue or abort based on error severity
        if (this.isCriticalError(error)) {
          this.logger.error('Critical error encountered, aborting bulk load');
          break;
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const successfulBatches = batchResults.filter(r => r.success);
    const totalTriples = successfulBatches.reduce((sum, r) => sum + r.triplesCount, 0);
    const averageBatchTime = successfulBatches.length > 0 
      ? successfulBatches.reduce((sum, r) => sum + r.executionTime, 0) / successfulBatches.length 
      : 0;

    const result: LoadResult = {
      totalTriples,
      totalBatches: batches.length,
      totalTime,
      averageBatchTime,
      errors
    };

    this.logger.info(`Bulk load completed. ${totalTriples} triples loaded in ${totalTime}ms`);
    if (errors.length > 0) {
      this.logger.warn(`${errors.length} batches failed during load`);
    }

    return result;
  }

  /**
   * Insert a batch of triples using SPARQL UPDATE
   */
  private async insertBatch(triples: RDFTriple[]): Promise<void> {
    const sparqlUpdate = this.buildInsertDataQuery(triples);
    
    try {
      await this.fetcher.fetchUpdate(this.endpointUrl, sparqlUpdate);
    } catch (error) {
      this.logger.error(`SPARQL UPDATE failed for batch of ${triples.length} triples`);
      this.logger.debug(`Query: ${sparqlUpdate.substring(0, 500)}...`);
      throw error;
    }
  }

  /**
   * Build SPARQL INSERT DATA query for a batch of triples
   */
  private buildInsertDataQuery(triples: RDFTriple[]): string {
    const prefixes = generateSparqlPrefixes();
    
    const tripleStatements = triples
      .map(triple => `    ${this.formatTripleForSparql(triple)}`)
      .join(' .\n');

    return `${prefixes}

INSERT DATA {
${tripleStatements} .
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
  private createBatches(triples: RDFTriple[], batchSize: number): RDFTriple[][] {
    const batches: RDFTriple[][] = [];
    
    for (let i = 0; i < triples.length; i += batchSize) {
      batches.push(triples.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Build full RDF4J endpoint URL
   */
  private buildEndpointUrl(baseUrl: string, repositoryId: string): string {
    // Remove trailing slash from base URL if present
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    
    // Check if the URL already includes the repository path
    if (cleanBaseUrl.includes(`/repositories/${repositoryId}`)) {
      return `${cleanBaseUrl}/statements`;
    }
    
    // Construct full URL
    return `${cleanBaseUrl}/repositories/${repositoryId}/statements`;
  }

  /**
   * Determine if an error is critical and should abort the process
   */
  private isCriticalError(error: any): boolean {
    const errorMessage = error.toString().toLowerCase();
    
    // Critical errors that should abort the process
    const criticalPatterns = [
      'connection refused',
      'network error',
      'timeout',
      'repository not found',
      'unauthorized',
      'forbidden'
    ];
    
    return criticalPatterns.some(pattern => errorMessage.includes(pattern));
  }

  /**
   * Simple delay utility
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test connection to RDF4J server
   */
  public async testConnection(): Promise<boolean> {
    try {
      this.logger.info(`Testing connection to RDF4J server: ${this.endpointUrl}`);
      
      // Try a simple ASK query to test connectivity
      const testQuery = `${generateSparqlPrefixes()}
      
ASK { ?s ?p ?o }`;

      await this.fetcher.fetchAsk(this.endpointUrl.replace('/statements', ''), testQuery);
      
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

      const count = bindings.length > 0 ? parseInt((bindings[0] as any).count.value) : 0;
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
    ...options
  });
}