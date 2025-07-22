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
  // ダッシュボード用統計サマリー (最適化版: 2025年データのみ)
  dashboard: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT 
      (COUNT(?mesh) AS ?totalMeshes)
      (SUM(?pop2020) AS ?totalPop2020)
      (SUM(?pop2025) AS ?totalPop2025)
      (AVG(?elderly65Plus) AS ?avgElderly65Plus)
      (AVG(?elderly75Plus) AS ?avgElderly75Plus)
      (MAX(?pop2025) AS ?maxPopDensity)
      (MIN(?pop2025) AS ?minPopDensity)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:totalPopulation2020 ?pop2020 ;
            mlit:hasPopulationData ?snapshot .
      
      ?snapshot mlit:populationYear 2025 ;
                mlit:totalPopulation ?pop2025 ;
                mlit:ageCategory65Plus ?elderly65Plus ;
                mlit:ageCategory75plus ?elderly75Plus .
      
      FILTER(?pop2025 > {{minPopulation}})
    }`,

  // 人口密度ランキング (最適化版: 2025年データのみ)
  ranking: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?meshId ?population2020 ?pop2025 ?changeRate ?elderly65Plus ?elderly75Plus
           (REPLACE(REPLACE(STR(?wkt), ".*POLYGON \\\\(\\\\(([0-9., ]+)\\\\)\\\\).*", "$1"), " ", ",") AS ?coordinates)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:meshId ?meshId ;
            mlit:totalPopulation2020 ?population2020 ;
            mlit:hasPopulationData ?snapshot ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:wktLiteral ?wkt .
      ?snapshot mlit:populationYear 2025 ;
                mlit:totalPopulation ?pop2025 ;
                mlit:ageCategory65Plus ?elderly65Plus ;
                mlit:ageCategory75plus ?elderly75Plus .
      
      BIND((?pop2025 - ?population2020) / ?population2020 AS ?changeRate)
      
      FILTER(?pop2025 > {{minPopulation}})
    }
    ORDER BY DESC(?pop2025)
    LIMIT {{limit}}`,

  // 高齢化分析 (最適化版: 2025年データのみ、年齢カテゴリ使用)
  aging: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?meshId ?population2025 ?elderly65Plus ?elderly75Plus ?elderly80Plus ?elderlyRatio
           (REPLACE(REPLACE(STR(?wkt), ".*POLYGON \\\\(\\\\(([0-9., ]+)\\\\)\\\\).*", "$1"), " ", ",") AS ?coordinates)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:meshId ?meshId ;
            mlit:hasPopulationData ?snapshot ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:wktLiteral ?wkt .
      
      ?snapshot mlit:populationYear 2025 ;
                mlit:totalPopulation ?population2025 ;
                mlit:ageCategory65Plus ?elderly65Plus ;
                mlit:ageCategory75plus ?elderly75Plus ;
                mlit:ageCategory80plus ?elderly80Plus .
      
      BIND(?elderly65Plus / ?population2025 AS ?elderlyRatio)
      
      FILTER(?population2025 > {{minPopulation}})
      FILTER(?elderlyRatio > 0.3)  # 30%以上の高齢化率
    }
    ORDER BY DESC(?elderlyRatio)
    LIMIT {{limit}}`,

  // 地図表示用データ (最適化版: 2025年データ + 土地利用情報)
  mapdata: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?meshId ?population2025 ?elderly65Plus ?elderly75Plus
           ?forestArea ?buildingLandArea ?waterBodyArea ?roadArea
           (REPLACE(STR(?wkt), "<[^>]+>\\\\s*", "") AS ?cleanWkt)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:meshId ?meshId ;
            mlit:hasPopulationData ?snapshot ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:wktLiteral ?wkt .
      
      ?snapshot mlit:populationYear 2025 ;
                mlit:totalPopulation ?population2025 ;
                mlit:ageCategory65Plus ?elderly65Plus ;
                mlit:ageCategory75plus ?elderly75Plus .
      
      # 土地利用情報（直接プロパティ、面積閾値によりOPTIONAL）
      OPTIONAL { ?mesh mlit:forestArea ?forestArea . }
      OPTIONAL { ?mesh mlit:buildingLandArea ?buildingLandArea . }
      OPTIONAL { ?mesh mlit:waterBodyArea ?waterBodyArea . }
      OPTIONAL { ?mesh mlit:roadArea ?roadArea . }
      
      FILTER(?population2025 > {{minPopulation}})
    }
    ORDER BY ?meshId
    LIMIT {{limit}}`,

  // 2025年データ詳細（最適化版: 年齢カテゴリ別詳細分析）
  demographic: `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX mlit: <http://example.org/mlit/ontology#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?meshId ?population2025 ?age0_14 ?age15_64 ?age65Plus ?age75Plus ?age80Plus
           ?elderlyRatio ?superElderlyRatio
           (REPLACE(REPLACE(STR(?wkt), ".*POLYGON \\\\(\\\\(([0-9., ]+)\\\\)\\\\).*", "$1"), " ", ",") AS ?coordinates)
    WHERE {
      ?mesh rdf:type mlit:Mesh ;
            mlit:meshId ?meshId ;
            mlit:hasPopulationData ?snapshot ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:wktLiteral ?wkt .
      
      ?snapshot mlit:populationYear 2025 ;
                mlit:totalPopulation ?population2025 ;
                mlit:ageCategory0_14 ?age0_14 ;
                mlit:ageCategory15_64 ?age15_64 ;
                mlit:ageCategory65Plus ?age65Plus ;
                mlit:ageCategory75plus ?age75Plus ;
                mlit:ageCategory80plus ?age80Plus .
      
      BIND(?age65Plus / ?population2025 AS ?elderlyRatio)
      BIND(?age80Plus / ?population2025 AS ?superElderlyRatio)
      
      FILTER(?population2025 > {{minPopulation}})
    }
    ORDER BY DESC(?population2025)
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
      dashboard: 'Statistical summary for dashboard display (2025 data)',
      ranking: 'Population density ranking with elderly data (2025)',
      aging: 'Aging analysis with elderly categories (2025)',
      mapdata: 'Geographic data with land use for maps (2025 + optimized land use)',
      demographic: 'Detailed demographic breakdown by age categories (2025)'
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