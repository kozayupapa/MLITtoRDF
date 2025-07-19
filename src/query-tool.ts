#!/usr/bin/env node

/**
 * GeoSPARQL Query Tool
 * Command-line tool to execute predefined queries against RDF4J repository
 */

import { Command } from 'commander';
import { createLogger, format, transports } from 'winston';
import fetch from 'node-fetch';

interface QueryToolOptions {
  rdf4jEndpoint: string;
  repositoryId: string;
  queryName: string;
  limit?: number;
  format: 'json' | 'csv' | 'table';
  logLevel: string;
  bbox?: string;
  year?: number;
  minPopulation?: number;
}

interface SPARQLResult {
  head: {
    vars: string[];
  };
  results: {
    bindings: Array<{
      [key: string]: {
        type: string;
        value: string;
        datatype?: string;
      };
    }>;
  };
}

/**
 * Predefined query templates
 */
const QUERY_TEMPLATES = {
  // ダッシュボード用統計サマリー
  dashboard: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT 
      (COUNT(?mesh) AS ?totalMeshes)
      (SUM(?pop2020) AS ?totalPop2020)
      (SUM(?pop2025) AS ?totalPop2025)
      (AVG(?elderlyRatio) AS ?avgElderlyRatio)
      (MAX(?pop2020) AS ?maxPopDensity)
      (MIN(?pop2020) AS ?minPopDensity)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:totalPopulation2020 ?pop2020 ;
            mlit:hasPopulationData ?snapshot .
      
      ?snapshot mlit:populationYear 2025 ;
                mlit:totalPopulation ?pop2025 ;
                mlit:ratioAge65Plus ?elderlyRatio .
      
      FILTER(?pop2020 > {{minPopulation}})
    }`,

  // 人口密度ランキング
  ranking: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?meshId ?population2020 ?pop2025 ?changeRate 
           (REPLACE(REPLACE(STR(?wkt), ".*POLYGON \\\\(\\\\(([0-9., ]+)\\\\)\\\\).*", "$1"), " ", ",") AS ?coordinates)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:meshId ?meshId ;
            mlit:totalPopulation2020 ?population2020 ;
            mlit:hasPopulationData ?snapshot ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:wktLiteral ?wkt .
      ?snapshot mlit:populationYear {{year}} ;
                mlit:totalPopulation ?pop2025 .
      
      BIND((?pop2025 - ?population2020) / ?population2020 AS ?changeRate)
      
      FILTER(?population2020 > {{minPopulation}})
    }
    ORDER BY DESC(?population2020)
    LIMIT {{limit}}`,

  // 高齢化分析
  aging: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?meshId ?population2020 ?elderlyRatio2025 ?elderlyRatio2030 ?ratioIncrease 
           (REPLACE(REPLACE(STR(?wkt), ".*POLYGON \\\\(\\\\(([0-9., ]+)\\\\)\\\\).*", "$1"), " ", ",") AS ?coordinates)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:meshId ?meshId ;
            mlit:totalPopulation2020 ?population2020 ;
            mlit:hasPopulationData ?snapshot2025 ;
            mlit:hasPopulationData ?snapshot2030 ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:wktLiteral ?wkt .
      
      ?snapshot2025 mlit:populationYear 2025 ;
                    mlit:ratioAge65Plus ?elderlyRatio2025 .
                    
      ?snapshot2030 mlit:populationYear 2030 ;
                    mlit:ratioAge65Plus ?elderlyRatio2030 .
      
      BIND(?elderlyRatio2030 - ?elderlyRatio2025 AS ?ratioIncrease)
      
      FILTER(?population2020 > {{minPopulation}})
      FILTER(?ratioIncrease > 0.05)
    }
    ORDER BY DESC(?ratioIncrease)
    LIMIT {{limit}}`,

  // 地図表示用データ
  mapdata: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?meshId ?population2020 ?pop2025 ?elderlyRatio2025 
           (REPLACE(STR(?wkt), "<[^>]+>\\\\s*", "") AS ?cleanWkt)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:meshId ?meshId ;
            mlit:totalPopulation2020 ?population2020 ;
            mlit:hasPopulationData ?snapshot2025 ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:wktLiteral ?wkt .
      
      ?snapshot2025 mlit:populationYear 2025 ;
                    mlit:totalPopulation ?pop2025 ;
                    mlit:ratioAge65Plus ?elderlyRatio2025 .
      
      FILTER(?population2020 > {{minPopulation}})
    }
    ORDER BY ?meshId
    LIMIT {{limit}}`,

  // 時系列データ
  timeseries: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?meshId ?year ?population ?elderlyRatio 
           (REPLACE(REPLACE(STR(?wkt), ".*POLYGON \\\\(\\\\(([0-9., ]+)\\\\)\\\\).*", "$1"), " ", ",") AS ?coordinates)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:meshId ?meshId ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:wktLiteral ?wkt .
      
      {
        ?mesh mlit:totalPopulation2020 ?population .
        BIND(2020 AS ?year)
        BIND(0.0 AS ?elderlyRatio)
      } UNION {
        ?mesh mlit:hasPopulationData ?snapshot .
        ?snapshot mlit:populationYear ?year ;
                  mlit:totalPopulation ?population ;
                  mlit:ratioAge65Plus ?elderlyRatio .
        FILTER(?year IN (2025, 2030, 2035, 2040))
      }
      
      FILTER(?population > {{minPopulation}})
    }
    ORDER BY ?meshId ?year
    LIMIT {{limit}}`
};

/**
 * Query execution tool
 */
class QueryTool {
  private readonly options: QueryToolOptions;
  private readonly logger;

  constructor(options: QueryToolOptions) {
    this.options = options;
    this.logger = createLogger({
      level: options.logLevel,
      format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => {
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
   * Execute a predefined query
   */
  public async executeQuery(): Promise<void> {
    try {
      const query = this.buildQuery();
      this.logger.info(`Executing query: ${this.options.queryName}`);
      this.logger.debug(`Query: ${query}`);

      const result = await this.executeSparqlQuery(query);
      
      this.logger.info(`Query completed. Found ${result.results.bindings.length} results`);
      
      this.outputResults(result);
      
    } catch (error) {
      this.logger.error(`Query execution failed: ${error}`);
      process.exit(1);
    }
  }

  /**
   * Build query from template with parameter substitution
   */
  private buildQuery(): string {
    const template = QUERY_TEMPLATES[this.options.queryName as keyof typeof QUERY_TEMPLATES];
    
    if (!template) {
      throw new Error(`Unknown query: ${this.options.queryName}. Available queries: ${Object.keys(QUERY_TEMPLATES).join(', ')}`);
    }

    let query = template;
    
    // Parameter substitution
    query = query.replace(/{{limit}}/g, (this.options.limit || 50).toString());
    query = query.replace(/{{year}}/g, (this.options.year || 2025).toString());
    query = query.replace(/{{minPopulation}}/g, (this.options.minPopulation || 0).toString());
    
    return query;
  }

  /**
   * Execute SPARQL query against RDF4J
   */
  private async executeSparqlQuery(query: string): Promise<SPARQLResult> {
    const endpoint = `${this.options.rdf4jEndpoint}/repositories/${this.options.repositoryId}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/sparql-results+json',
      },
      body: query,
    });

    if (!response.ok) {
      throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as SPARQLResult;
  }

  /**
   * Output results in specified format
   */
  private outputResults(result: SPARQLResult): void {
    switch (this.options.format) {
      case 'json':
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'csv':
        this.outputCSV(result);
        break;
      case 'table':
        this.outputTable(result);
        break;
    }
  }

  /**
   * Output results as CSV
   */
  private outputCSV(result: SPARQLResult): void {
    const headers = result.head.vars;
    console.log(headers.join(','));
    
    for (const binding of result.results.bindings) {
      const row = headers.map(header => {
        const value = binding[header]?.value || '';
        // Escape CSV values that contain commas
        return value.includes(',') ? `"${value}"` : value;
      });
      console.log(row.join(','));
    }
  }

  /**
   * Output results as formatted table
   */
  private outputTable(result: SPARQLResult): void {
    if (result.results.bindings.length === 0) {
      console.log('No results found.');
      return;
    }

    const headers = result.head.vars;
    const rows = result.results.bindings.map(binding => 
      headers.map(header => binding[header]?.value || '')
    );

    // Calculate column widths
    const colWidths = headers.map((header, i) => 
      Math.max(
        header.length,
        ...rows.map(row => (row[i] || '').length)
      )
    );

    // Print header
    const headerRow = headers.map((header, i) => 
      header.padEnd(colWidths[i])
    ).join(' | ');
    console.log(headerRow);
    console.log(colWidths.map(w => '-'.repeat(w)).join('-+-'));

    // Print rows
    for (const row of rows) {
      const formattedRow = row.map((cell, i) => 
        (cell || '').padEnd(colWidths[i])
      ).join(' | ');
      console.log(formattedRow);
    }
  }

  /**
   * List available queries
   */
  public static listQueries(): void {
    console.log('Available queries:');
    console.log('');
    
    const descriptions = {
      dashboard: 'Statistical summary for dashboard display',
      ranking: 'Population density ranking with change rates',
      aging: 'Aging analysis showing elderly ratio increases',
      mapdata: 'Geographic data for map visualization',
      timeseries: 'Time series data for trend analysis'
    };

    for (const [name, description] of Object.entries(descriptions)) {
      console.log(`  ${name.padEnd(12)} - ${description}`);
    }
    console.log('');
  }
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('query-tool')
    .description('Execute GeoSPARQL queries against population data in RDF4J')
    .version('1.0.0');

  program
    .command('list')
    .description('List available queries')
    .action(() => {
      QueryTool.listQueries();
    });

  program
    .command('run')
    .description('Execute a predefined query')
    .requiredOption(
      '--rdf4jEndpoint <url>',
      'RDF4J server endpoint URL',
      'http://localhost:8080/rdf4j-server'
    )
    .requiredOption(
      '--repositoryId <id>',
      'RDF4J repository identifier',
      'test'
    )
    .requiredOption(
      '--queryName <name>',
      'Name of the query to execute'
    )
    .option(
      '--limit <number>',
      'Maximum number of results to return',
      '50'
    )
    .option(
      '--format <format>',
      'Output format: json, csv, table',
      'table'
    )
    .option(
      '--logLevel <level>',
      'Logging level: error, warn, info, debug',
      'info'
    )
    .option(
      '--year <year>',
      'Year for population projections',
      '2025'
    )
    .option(
      '--minPopulation <number>',
      'Minimum population filter',
      '0'
    )
    .action(async (options) => {
      const toolOptions: QueryToolOptions = {
        rdf4jEndpoint: options.rdf4jEndpoint,
        repositoryId: options.repositoryId,
        queryName: options.queryName,
        limit: parseInt(options.limit),
        format: options.format,
        logLevel: options.logLevel,
        year: parseInt(options.year),
        minPopulation: parseInt(options.minPopulation),
      };

      const tool = new QueryTool(toolOptions);
      await tool.executeQuery();
    });

  program.parse();
}

// Export for library use
export { QueryTool, QUERY_TEMPLATES };

// Execute if run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Tool execution failed:', error);
    process.exit(1);
  });
}